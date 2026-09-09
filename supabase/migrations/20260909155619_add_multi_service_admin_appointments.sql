create table if not exists public.appointment_services (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  position integer not null default 0,
  price_snapshot numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  primary key (appointment_id, service_id)
);

create index if not exists appointment_services_appointment_idx on public.appointment_services(appointment_id, position);
create index if not exists appointment_services_service_idx on public.appointment_services(service_id);

alter table public.appointment_services enable row level security;

drop policy if exists "Admins read appointment services" on public.appointment_services;
create policy "Admins read appointment services" on public.appointment_services
for select to authenticated
using ((select private.has_role('admin'::public.app_role)) or exists (
  select 1 from public.admin_emails ae where ae.enabled = true
  and lower(ae.email) = lower(coalesce((select auth.jwt()->>'email'), ''))
));

drop policy if exists "Admins manage appointment services" on public.appointment_services;
create policy "Admins manage appointment services" on public.appointment_services
for all to authenticated
using ((select private.has_role('admin'::public.app_role)) or exists (
  select 1 from public.admin_emails ae where ae.enabled = true
  and lower(ae.email) = lower(coalesce((select auth.jwt()->>'email'), ''))
))
with check ((select private.has_role('admin'::public.app_role)) or exists (
  select 1 from public.admin_emails ae where ae.enabled = true
  and lower(ae.email) = lower(coalesce((select auth.jwt()->>'email'), ''))
));

grant select, insert, update, delete on public.appointment_services to authenticated;

insert into public.appointment_services(appointment_id, service_id, position, price_snapshot)
select a.id, a.service_id, 0, coalesce(a.service_price_snapshot, s.price, 0)
from public.appointments a join public.services s on s.id = a.service_id
on conflict (appointment_id, service_id) do nothing;

create or replace function public.create_admin_multi_service_appointment(
  _client_id uuid, _patient_name text, _patient_email text, _patient_phone text,
  _service_ids uuid[], _professional_id uuid, _scheduled_date date,
  _scheduled_time text, _notes text, _total numeric
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  _appointment_id uuid;
  _primary_service_id uuid;
  _service_count integer;
  _valid_count integer;
  _link_count integer;
begin
  if not (private.has_role('admin'::public.app_role) or exists (
    select 1 from public.admin_emails ae where ae.enabled = true
    and lower(ae.email) = lower(coalesce(auth.jwt()->>'email', ''))
  )) then raise exception 'Acesso administrativo insuficiente.'; end if;

  _service_count := coalesce(cardinality(_service_ids), 0);
  if _service_count < 1 then raise exception 'Selecione ao menos um serviço.'; end if;
  if _service_count > 10 then raise exception 'Limite de 10 serviços por agendamento.'; end if;
  if (select count(distinct x) from unnest(_service_ids) x) <> _service_count then raise exception 'Há serviços duplicados no agendamento.'; end if;
  if _professional_id is null then raise exception 'Selecione o profissional.'; end if;
  if coalesce(trim(_patient_name), '') = '' then raise exception 'Informe o nome do cliente.'; end if;
  if _scheduled_date < current_date then raise exception 'Selecione uma data válida.'; end if;
  if coalesce(trim(_scheduled_time), '') = '' then raise exception 'Selecione o horário.'; end if;
  if _total is null or _total < 0 then raise exception 'Informe um valor válido para o atendimento.'; end if;

  select count(*) into _valid_count from public.services s where s.id = any(_service_ids) and s.is_active = true;
  if _valid_count <> _service_count then raise exception 'Um ou mais serviços são inválidos ou estão inativos.'; end if;
  select count(*) into _link_count from public.service_professionals sp where sp.service_id = any(_service_ids) and sp.professional_id = _professional_id;
  if _link_count <> _service_count then raise exception 'Esse profissional não atende todos os serviços selecionados.'; end if;

  _primary_service_id := _service_ids[1];
  insert into public.appointments(user_id, client_id, service_id, professional_id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, payment_choice, service_price_snapshot, deposit_percent, deposit_amount, balance_amount)
  values(null, _client_id, _primary_service_id, _professional_id, trim(_patient_name), coalesce(trim(_patient_email), ''), coalesce(trim(_patient_phone), ''), coalesce(trim(_notes), ''), _scheduled_date, trim(_scheduled_time), 'pendente', 'onsite', round(_total,2), 0, 0, round(_total,2))
  returning id into _appointment_id;

  insert into public.appointment_services(appointment_id, service_id, position, price_snapshot)
  select _appointment_id, u.service_id, (u.ord - 1)::integer, coalesce(s.price,0)
  from unnest(_service_ids) with ordinality as u(service_id, ord)
  join public.services s on s.id = u.service_id;

  return _appointment_id;
end;
$$;

revoke all on function public.create_admin_multi_service_appointment(uuid,text,text,text,uuid[],uuid,date,text,text,numeric) from public;
grant execute on function public.create_admin_multi_service_appointment(uuid,text,text,text,uuid[],uuid,date,text,text,numeric) to authenticated;
