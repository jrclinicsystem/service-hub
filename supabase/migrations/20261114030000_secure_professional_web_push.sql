-- JR CLINIC | Target project: ldrqcbqaekmohwpneekx
-- Production review required. This migration is additive; it never changes bookings/finance data.
create schema if not exists private;

create or replace function private.current_push_professional_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select pa.professional_id
  from auth.users u
  join public.professional_access pa
    on lower(trim(pa.email)) = lower(trim(u.email))
   and pa.enabled = true
  join public.professionals p on p.id = pa.professional_id
   and p.is_active = true and p.deleted_at is null
  where u.id = auth.uid() and u.email_confirmed_at is not null
  order by pa.created_at desc limit 1
$$;
revoke all on function private.current_push_professional_id() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_push_professional_id() to authenticated;

create table if not exists public.professional_notifications (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete set null,
  recipient_professional_id uuid not null references public.professionals(id),
  event_type text not null check (event_type in
    ('novo_agendamento','confirmacao','cancelamento','remarcacao','transferencia_recebida','transferencia_saida')),
  title text not null,
  body text not null,
  service_name text,
  scheduled_date date,
  scheduled_time text,
  deep_link text not null default '/profissional',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists professional_notifications_recipient_idx
  on public.professional_notifications(recipient_professional_id, created_at desc);
create index if not exists professional_notifications_unread_idx
  on public.professional_notifications(recipient_professional_id, created_at desc)
  where read_at is null;
alter table public.professional_notifications enable row level security;
revoke all on public.professional_notifications from anon, authenticated;
grant select on public.professional_notifications to authenticated;
grant update (read_at) on public.professional_notifications to authenticated;
drop policy if exists "Read own professional notices or admin" on public.professional_notifications;
create policy "Read own professional notices or admin"
on public.professional_notifications for select to authenticated
using (public.is_current_user_admin()
       or recipient_professional_id = private.current_push_professional_id());
drop policy if exists "Mark only own professional notices read" on public.professional_notifications;
create policy "Mark only own professional notices read"
on public.professional_notifications for update to authenticated
using (recipient_professional_id = private.current_push_professional_id())
with check (recipient_professional_id = private.current_push_professional_id());

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  professional_id uuid not null references public.professionals(id),
  endpoint text not null unique check (length(endpoint) between 20 and 2048),
  p256dh text not null,
  auth text not null,
  device_label text,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_professional_idx
on public.push_subscriptions(professional_id, user_id) where is_active;
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant update on public.push_subscriptions to authenticated;
drop policy if exists "Own authorized push subscriptions read" on public.push_subscriptions;
create policy "Own authorized push subscriptions read" on public.push_subscriptions
for select to authenticated using (
  user_id = auth.uid() and professional_id = private.current_push_professional_id()
);
drop policy if exists "Own authorized push subscriptions insert" on public.push_subscriptions;
create policy "Own authorized push subscriptions insert" on public.push_subscriptions
for insert to authenticated with check (
  user_id = auth.uid() and professional_id = private.current_push_professional_id()
);
drop policy if exists "Own authorized push subscriptions update" on public.push_subscriptions;
create policy "Own authorized push subscriptions update" on public.push_subscriptions
for update to authenticated using (
  user_id = auth.uid() and professional_id = private.current_push_professional_id()
) with check (
  user_id = auth.uid() and professional_id = private.current_push_professional_id()
);
drop policy if exists "Own push subscriptions delete" on public.push_subscriptions;
create policy "Own push subscriptions delete" on public.push_subscriptions
for delete to authenticated using (user_id = auth.uid());

create or replace function public.release_device_push_subscription(_endpoint text)
returns void language sql security invoker set search_path = ''
as $$
  delete from public.push_subscriptions
   where endpoint = _endpoint and user_id = auth.uid()
$$;
revoke all on function public.release_device_push_subscription(text) from public, anon;
grant execute on function public.release_device_push_subscription(text) to authenticated;

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.professional_notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','dead')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id,subscription_id)
);
create index if not exists push_deliveries_claim_idx
  on public.push_deliveries(status, next_attempt_at, created_at);
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;

create or replace function private.queue_professional_push_delivery()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.push_deliveries(notification_id, subscription_id)
  select new.id, s.id
  from public.push_subscriptions s
  join auth.users u on u.id = s.user_id and u.email_confirmed_at is not null
  join public.professional_access pa
    on pa.professional_id = s.professional_id and pa.enabled = true
   and lower(trim(pa.email)) = lower(trim(u.email))
  join public.professionals p
    on p.id = s.professional_id and p.is_active = true and p.deleted_at is null
  where s.professional_id = new.recipient_professional_id and s.is_active
  on conflict (notification_id,subscription_id) do nothing;
  return new;
end;
$$;
revoke all on function private.queue_professional_push_delivery() from public, anon, authenticated;
drop trigger if exists jr_queue_push_on_notification on public.professional_notifications;
create trigger jr_queue_push_on_notification
after insert on public.professional_notifications
for each row execute function private.queue_professional_push_delivery();

create or replace function private.create_appointment_notification(
  _a public.appointments, _recipient uuid, _kind text)
returns void language plpgsql security definer set search_path = ''
as $$
declare _service text; _title text; _message text;
begin
  if _recipient is null then return; end if;
  select s.name into _service from public.services s where s.id = _a.service_id;
  _title := case _kind
    when 'novo_agendamento' then 'Novo agendamento'
    when 'confirmacao' then 'Agendamento confirmado'
    when 'cancelamento' then 'Agendamento cancelado'
    when 'remarcacao' then 'Agendamento remarcado'
    when 'transferencia_recebida' then 'Agendamento transferido para você'
    when 'transferencia_saida' then 'Agendamento retirado da sua agenda'
    else 'Atualização de agenda' end;
  _message := case _kind
    when 'transferencia_saida' then 'Um atendimento deixou sua agenda.'
    else 'Há uma atualização de atendimento na sua agenda.' end;
  insert into public.professional_notifications
    (appointment_id, recipient_professional_id, event_type, title, body,
     service_name, scheduled_date, scheduled_time, deep_link)
  values (_a.id, _recipient, _kind, _title, _message,
          _service, _a.scheduled_date, _a.scheduled_time, '/profissional');
end;
$$;
revoke all on function private.create_appointment_notification(public.appointments,uuid,text)
from public, anon, authenticated;

create or replace function private.jr_appointment_notification_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('aguardando_pagamento','cancelado') then
      perform private.create_appointment_notification(new,new.professional_id,'novo_agendamento');
    end if;
    return new;
  end if;
  -- A reassignment takes priority, and never sends the new professional's
  -- booking details to a different professional's device.
  if old.professional_id is distinct from new.professional_id then
    if old.professional_id is not null then
      perform private.create_appointment_notification(new,old.professional_id,'transferencia_saida');
    end if;
    if new.professional_id is not null and new.status not in ('aguardando_pagamento','cancelado') then
      perform private.create_appointment_notification(new,new.professional_id,'transferencia_recebida');
    end if;
  elsif old.status is distinct from new.status and new.status = 'cancelado' then
    perform private.create_appointment_notification(new,new.professional_id,'cancelamento');
  elsif old.status in ('aguardando_pagamento','cancelado')
    and new.status not in ('aguardando_pagamento','cancelado') then
    perform private.create_appointment_notification(new,new.professional_id,'novo_agendamento');
  elsif (old.scheduled_date,old.scheduled_time) is distinct from
        (new.scheduled_date,new.scheduled_time)
    and new.status not in ('aguardando_pagamento','cancelado') then
    perform private.create_appointment_notification(new,new.professional_id,'remarcacao');
  elsif old.status is distinct from new.status and new.status = 'confirmado' then
    perform private.create_appointment_notification(new,new.professional_id,'confirmacao');
  end if;
  return new;
end;
$$;
revoke all on function private.jr_appointment_notification_event() from public, anon, authenticated;
drop trigger if exists zzz_jr_appointment_notification_event on public.appointments;
create trigger zzz_jr_appointment_notification_event
after insert or update of professional_id, status, scheduled_date, scheduled_time
on public.appointments
for each row execute function private.jr_appointment_notification_event();

-- Only service_role may claim or complete deliveries. Both functions run as invoker.
create or replace function public.claim_push_deliveries(_batch_size integer default 20)
returns table (
  delivery_id uuid, notification_id uuid, endpoint text, p256dh text,
  auth text, title text, body text, deep_link text
)
language plpgsql security invoker set search_path = ''
as $$
begin
  return query
  with eligible as (
    select d.id
    from public.push_deliveries d
    join public.push_subscriptions s on s.id = d.subscription_id and s.is_active
    join public.professional_notifications n on n.id = d.notification_id
      and n.recipient_professional_id = s.professional_id
    join public.professionals p on p.id = s.professional_id
      and p.is_active and p.deleted_at is null
    join auth.users u on u.id = s.user_id and u.email_confirmed_at is not null
    join public.professional_access pa on pa.professional_id = s.professional_id
      and pa.enabled and lower(trim(pa.email)) = lower(trim(u.email))
    where d.attempts < 5
      and d.next_attempt_at <= now()
      and (d.status in ('pending','failed')
        or (d.status = 'processing' and d.locked_at < now() - interval '10 minutes'))
    order by d.created_at
    limit least(greatest(_batch_size,1),50)
    for update of d skip locked
  ), claimed as (
    update public.push_deliveries d set status = 'processing',
      attempts = d.attempts + 1, locked_at = now()
    from eligible e where d.id = e.id returning d.*
  )
  select c.id, c.notification_id, s.endpoint, s.p256dh, s.auth,
         n.title, n.body, n.deep_link
  from claimed c
  join public.push_subscriptions s on s.id = c.subscription_id
  join public.professional_notifications n on n.id = c.notification_id;
end;
$$;
revoke all on function public.claim_push_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;

create or replace function public.complete_push_delivery(
  _delivery_id uuid, _outcome text, _error text default null, _gone boolean default false)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if _outcome not in ('sent','failed') then raise exception 'Invalid delivery outcome'; end if;
  update public.push_deliveries d
     set status = case when _outcome='sent' then 'sent'
                       when _gone or d.attempts >= 5 then 'dead'
                       else 'failed' end,
         last_error = left(_error,1000),
         next_attempt_at = now() + make_interval(secs =>
           least(3600, 30 * power(2,greatest(d.attempts-1,0)))::integer),
         completed_at = case when _outcome='sent' or _gone then now() else null end,
         locked_at = null
   where d.id = _delivery_id and d.status='processing';
  if _gone then
    update public.push_subscriptions s set is_active=false, updated_at=now()
    where exists (select 1 from public.push_deliveries d
      where d.id=_delivery_id and d.subscription_id=s.id);
  end if;
end;
$$;
revoke all on function public.complete_push_delivery(uuid,text,text,boolean)
from public, anon, authenticated;
grant execute on function public.complete_push_delivery(uuid,text,text,boolean) to service_role;
