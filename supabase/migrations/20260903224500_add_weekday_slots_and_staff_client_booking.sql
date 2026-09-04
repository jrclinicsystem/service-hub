create table if not exists public.professional_weekday_time_slots (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 6),
  slot text not null check (slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, weekday, slot)
);

alter table public.professional_weekday_time_slots enable row level security;

drop policy if exists "Public read professional weekday slots" on public.professional_weekday_time_slots;
create policy "Public read professional weekday slots"
on public.professional_weekday_time_slots
for select
using (true);

drop policy if exists "Admins manage professional weekday slots" on public.professional_weekday_time_slots;
create policy "Admins manage professional weekday slots"
on public.professional_weekday_time_slots
for all
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "Staff manage own professional weekday slots" on public.professional_weekday_time_slots;
create policy "Staff manage own professional weekday slots"
on public.professional_weekday_time_slots
for all
using (private.staff_can_manage_professional(professional_id))
with check (private.staff_can_manage_professional(professional_id));

grant select on public.professional_weekday_time_slots to anon, authenticated;
grant insert, update, delete on public.professional_weekday_time_slots to authenticated;

-- Convert the existing general schedule into a per-weekday baseline without
-- changing the availability that was already in effect.
with configured_professionals as (
  select distinct professional_id from public.professional_time_slots
  union
  select distinct professional_id from public.professional_availability_periods
),
days as (
  select generate_series(1, 6)::smallint as weekday
)
insert into public.professional_weekday_time_slots (professional_id, weekday, slot, is_available, sort_order)
select cp.professional_id,
       d.weekday,
       pts.slot,
       true,
       coalesce(pts.sort_order, replace(pts.slot, ':', '')::integer)
from configured_professionals cp
cross join days d
join public.professional_time_slots pts
  on pts.professional_id = cp.professional_id
 and pts.is_available = true
where not exists (
        select 1
        from public.professional_availability_periods pap0
        where pap0.professional_id = cp.professional_id
      )
   or exists (
        select 1
        from public.professional_availability_periods pap
        where pap.professional_id = cp.professional_id
          and pap.weekday = d.weekday
          and pap.period = case
            when pts.slot::time < time '12:00' then 'morning'
            when pts.slot::time < time '18:00' then 'afternoon'
            else 'evening'
          end
          and pap.is_available = true
      )
on conflict (professional_id, weekday, slot) do nothing;

with configured_professionals as (
  select distinct professional_id from public.professional_time_slots
  union
  select distinct professional_id from public.professional_availability_periods
),
days as (
  select generate_series(1, 6)::smallint as weekday
)
insert into public.professional_weekday_time_slots (professional_id, weekday, slot, is_available, sort_order)
select cp.professional_id, d.weekday, '00:00', false, 0
from configured_professionals cp
cross join days d
where not exists (
  select 1
  from public.professional_weekday_time_slots pws
  where pws.professional_id = cp.professional_id
    and pws.weekday = d.weekday
)
on conflict (professional_id, weekday, slot) do nothing;

create or replace function public.get_professional_booking_slots(_professional_id uuid, _date date)
returns table(slot text, is_available boolean, sort_order integer, source text)
language sql
stable
security definer
set search_path = ''
as $$
  with has_specific as (
    select exists (
      select 1
      from public.professional_date_time_slots d
      where d.professional_id = _professional_id
        and d.available_date = _date
    ) as value
  ),
  has_weekday_specific as (
    select exists (
      select 1
      from public.professional_weekday_time_slots w
      where w.professional_id = _professional_id
        and w.weekday = extract(dow from _date)::smallint
    ) as value
  ),
  fallback_slots as (
    select pts.slot, pts.is_available, pts.sort_order
    from public.professional_time_slots pts
    where pts.professional_id = _professional_id
      and pts.is_available = true
      and (
        not exists (
          select 1
          from public.professional_availability_periods pap0
          where pap0.professional_id = _professional_id
        )
        or exists (
          select 1
          from public.professional_availability_periods pap
          where pap.professional_id = _professional_id
            and pap.weekday = extract(dow from _date)::smallint
            and pap.period = case
              when pts.slot::time < time '12:00' then 'morning'
              when pts.slot::time < time '18:00' then 'afternoon'
              else 'evening'
            end
            and pap.is_available = true
        )
      )
  )
  select d.slot, d.is_available, d.sort_order, 'date'::text
  from public.professional_date_time_slots d, has_specific hs
  where hs.value = true
    and d.professional_id = _professional_id
    and d.available_date = _date
    and d.is_available = true
    and d.slot <> '00:00'
  union all
  select w.slot, w.is_available, w.sort_order, 'weekday'::text
  from public.professional_weekday_time_slots w, has_specific hs, has_weekday_specific hw
  where hs.value = false
    and hw.value = true
    and w.professional_id = _professional_id
    and w.weekday = extract(dow from _date)::smallint
    and w.is_available = true
    and w.slot <> '00:00'
  union all
  select f.slot, f.is_available, f.sort_order, 'fallback'::text
  from fallback_slots f, has_specific hs, has_weekday_specific hw
  where hs.value = false
    and hw.value = false
  order by sort_order, slot;
$$;

drop policy if exists "Staff read active clients" on public.clients;
create policy "Staff read active clients"
on public.clients
for select
to authenticated
using (
  is_active = true
  and exists (
    select 1
    from public.professional_access pa
    where pa.enabled = true
      and lower(pa.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "Staff create clients" on public.clients;
create policy "Staff create clients"
on public.clients
for insert
to authenticated
with check (
  created_by = auth.uid()
  and auth_user_id is null
  and exists (
    select 1
    from public.professional_access pa
    where pa.enabled = true
      and lower(pa.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "Staff create own professional appointments" on public.appointments;
create policy "Staff create own professional appointments"
on public.appointments
for insert
to authenticated
with check (
  user_id is null
  and professional_id is not null
  and private.staff_can_manage_professional(professional_id)
);

create or replace function private.guard_appointment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
  is_admin boolean := false;
  is_staff boolean := false;
  is_trusted boolean := false;
  service_price numeric;
  service_duration integer;
  service_active boolean;
  professional_active boolean;
  configured_percent numeric;
  total numeric;
  configured_deposit numeric;
  expected_balance numeric;
  local_today date := (now() at time zone 'America/Fortaleza')::date;
  requested_period text;
  requested_weekday smallint;
  has_date_specific boolean := false;
  has_weekday_specific boolean := false;
begin
  if jwt_role = 'authenticated' then
    is_admin := private.has_role('admin'::public.app_role);
  end if;
  is_trusted := jwt_role = 'service_role' or is_admin;

  if new.professional_id is null then
    raise exception 'Selecione um profissional para o agendamento.' using errcode = '23514';
  end if;

  if jwt_role = 'authenticated' and not is_admin then
    is_staff := private.staff_can_manage_professional(new.professional_id);
  end if;

  if new.scheduled_time !~ '^[0-2][0-9]:[0-5][0-9]$' or new.scheduled_time::time >= time '24:00' then
    raise exception 'Horário de agendamento inválido.' using errcode = '23514';
  end if;

  requested_weekday := extract(dow from new.scheduled_date)::smallint;
  requested_period := case
    when new.scheduled_time::time < time '12:00' then 'morning'
    when new.scheduled_time::time < time '18:00' then 'afternoon'
    else 'evening'
  end;

  select s.price, greatest(1, coalesce(s.duration_min, 30)), s.is_active
    into service_price, service_duration, service_active
  from public.services s where s.id = new.service_id;
  if not found then raise exception 'Serviço não encontrado.' using errcode = '23503'; end if;

  select (p.is_active and p.deleted_at is null)
    into professional_active
  from public.professionals p where p.id = new.professional_id;
  if not found then raise exception 'Profissional não encontrado.' using errcode = '23503'; end if;

  if not exists (
    select 1 from public.service_professionals sp
    where sp.service_id = new.service_id and sp.professional_id = new.professional_id
  ) then
    raise exception 'Esse profissional não atende o serviço selecionado.' using errcode = '23514';
  end if;

  select exists (
    select 1
    from public.professional_date_time_slots d
    where d.professional_id = new.professional_id
      and d.available_date = new.scheduled_date
  ) into has_date_specific;

  if has_date_specific then
    if not exists (
      select 1
      from public.professional_date_time_slots d
      where d.professional_id = new.professional_id
        and d.available_date = new.scheduled_date
        and d.slot = new.scheduled_time
        and d.is_available = true
        and d.slot <> '00:00'
    ) then
      raise exception 'Esse horário não foi liberado para esta data.' using errcode = '23514';
    end if;
  else
    select exists (
      select 1
      from public.professional_weekday_time_slots w
      where w.professional_id = new.professional_id
        and w.weekday = requested_weekday
    ) into has_weekday_specific;

    if has_weekday_specific then
      if not exists (
        select 1
        from public.professional_weekday_time_slots w
        where w.professional_id = new.professional_id
          and w.weekday = requested_weekday
          and w.slot = new.scheduled_time
          and w.is_available = true
          and w.slot <> '00:00'
      ) then
        raise exception 'Esse horário não está liberado para este dia da semana.' using errcode = '23514';
      end if;
    else
      if exists (select 1 from public.professional_availability_periods pap where pap.professional_id = new.professional_id) then
        if not exists (
          select 1 from public.professional_availability_periods pap
          where pap.professional_id = new.professional_id
            and pap.weekday = requested_weekday
            and pap.period = requested_period
            and pap.is_available = true
        ) then
          raise exception 'Este profissional não atende neste dia ou turno.' using errcode = '23514';
        end if;
      end if;

      if exists (select 1 from public.professional_time_slots pts where pts.professional_id = new.professional_id) then
        if not exists (
          select 1 from public.professional_time_slots pts
          where pts.professional_id = new.professional_id
            and pts.slot = new.scheduled_time
            and pts.is_available = true
        ) then
          raise exception 'Esse horário não está disponível para este profissional.' using errcode = '23514';
        end if;
      elsif not exists (
        select 1 from public.time_slots ts where ts.slot = new.scheduled_time and ts.is_available = true
      ) then
        raise exception 'Esse horário não está disponível para agendamento.' using errcode = '23514';
      end if;
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.professional_id::text || ':' || new.scheduled_date::text, 0));

  if exists (
    select 1
    from public.appointments a
    join public.services existing_service on existing_service.id = a.service_id
    where a.professional_id = new.professional_id
      and a.scheduled_date = new.scheduled_date
      and a.status <> 'cancelado'
      and (new.scheduled_date + new.scheduled_time::time)
          < (a.scheduled_date + a.scheduled_time::time + pg_catalog.make_interval(mins => greatest(1, coalesce(existing_service.duration_min, 30))))
      and (a.scheduled_date + a.scheduled_time::time)
          < (new.scheduled_date + new.scheduled_time::time + pg_catalog.make_interval(mins => service_duration))
  ) then
    raise exception 'Este profissional já possui um atendimento que ocupa esse horário.' using errcode = '23P01';
  end if;

  total := round(service_price::numeric, 2);

  if is_staff and not is_trusted then
    if new.user_id is not null then
      raise exception 'Agendamentos criados pela colaboradora devem ser lançados como atendimento manual.' using errcode = '42501';
    end if;
    if not service_active then raise exception 'Esse serviço não está disponível no momento.' using errcode = '23514'; end if;
    if not professional_active then raise exception 'Sua agenda não está disponível no momento.' using errcode = '23514'; end if;
    if new.scheduled_date < local_today then raise exception 'A data do agendamento não pode estar no passado.' using errcode = '23514'; end if;
    if length(btrim(new.patient_name)) < 2 or length(new.patient_name) > 120 then raise exception 'Informe um nome válido para o paciente.' using errcode = '23514'; end if;
    if length(coalesce(new.patient_email, '')) > 254 then raise exception 'O e-mail informado é muito longo.' using errcode = '23514'; end if;
    if btrim(coalesce(new.patient_email, '')) <> '' and new.patient_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Informe um e-mail válido.' using errcode = '23514'; end if;
    if length(coalesce(new.patient_phone, '')) > 40 or length(coalesce(new.notes, '')) > 1000 then raise exception 'Os dados do agendamento excedem o tamanho permitido.' using errcode = '23514'; end if;
    if new.payment_choice <> 'onsite' or new.status <> 'pendente' then raise exception 'A colaboradora deve criar o agendamento como pendente e com pagamento presencial.' using errcode = '23514'; end if;
    if new.service_price_snapshot is distinct from total then raise exception 'O valor do serviço não corresponde ao catálogo atual.' using errcode = '23514'; end if;
    if coalesce(new.deposit_percent, 0) <> 0 or coalesce(new.deposit_amount, 0) <> 0 or new.balance_amount is distinct from total then raise exception 'Os valores do agendamento manual estão inconsistentes.' using errcode = '23514'; end if;
  elsif not is_trusted then
    if auth.uid() is null or new.user_id is distinct from auth.uid() then
      raise exception 'O agendamento deve pertencer ao usuário autenticado.' using errcode = '42501';
    end if;
    if not service_active then raise exception 'Esse serviço não está disponível no momento.' using errcode = '23514'; end if;
    if not professional_active then raise exception 'Esse profissional não está disponível no momento.' using errcode = '23514'; end if;
    if new.scheduled_date < local_today then raise exception 'A data do agendamento não pode estar no passado.' using errcode = '23514'; end if;
    if new.scheduled_date > local_today + 13 then raise exception 'Os agendamentos online podem ser feitos com até 14 dias de antecedência.' using errcode = '23514'; end if;
    if extract(dow from new.scheduled_date) = 0 then raise exception 'A clínica não recebe agendamentos online aos domingos.' using errcode = '23514'; end if;
    if length(btrim(new.patient_name)) < 2 or length(new.patient_name) > 120 then raise exception 'Informe um nome válido para o paciente.' using errcode = '23514'; end if;
    if length(new.patient_email) > 254 or new.patient_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Informe um e-mail válido.' using errcode = '23514'; end if;
    if length(coalesce(new.patient_phone, '')) > 40 or length(coalesce(new.notes, '')) > 1000 then raise exception 'Os dados do agendamento excedem o tamanho permitido.' using errcode = '23514'; end if;

    if new.payment_choice = 'onsite' then
      if new.status <> 'pendente' then raise exception 'Status inválido para pagamento presencial.' using errcode = '23514'; end if;
    elsif new.payment_choice in ('online_deposit', 'online_full') then
      if new.status <> 'aguardando_pagamento' then raise exception 'Status inválido para pagamento online.' using errcode = '23514'; end if;
    else
      raise exception 'Forma de pagamento inválida.' using errcode = '23514';
    end if;

    select greatest(1::numeric, least(100::numeric, coalesce(bs.online_deposit_percent, 50::numeric))) into configured_percent
    from public.business_settings bs where bs.id = 1;
    configured_percent := coalesce(configured_percent, 50::numeric);
    configured_deposit := round(total * configured_percent / 100, 2);

    if new.service_price_snapshot is distinct from total then raise exception 'O valor do serviço não corresponde ao catálogo atual.' using errcode = '23514'; end if;
    if new.deposit_percent is distinct from configured_percent then raise exception 'O percentual de sinal não corresponde à configuração da clínica.' using errcode = '23514'; end if;

    if new.payment_choice = 'online_deposit' then
      expected_balance := round(greatest(0::numeric, total - configured_deposit), 2);
      if new.deposit_amount is distinct from configured_deposit or new.balance_amount is distinct from expected_balance then raise exception 'Os valores do sinal estão inconsistentes.' using errcode = '23514'; end if;
    elsif new.payment_choice = 'online_full' then
      if new.deposit_amount is distinct from configured_deposit or new.balance_amount is distinct from 0::numeric then raise exception 'Os valores do pagamento integral estão inconsistentes.' using errcode = '23514'; end if;
    else
      if new.deposit_amount is distinct from 0::numeric or new.balance_amount is distinct from total then raise exception 'Os valores do pagamento presencial estão inconsistentes.' using errcode = '23514'; end if;
    end if;
  end if;

  return new;
end;
$$;
