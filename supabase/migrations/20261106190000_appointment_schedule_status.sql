begin;

-- Additive history, with no changes to existing statuses or financial records.
alter table public.appointments
  add column if not exists schedule_history jsonb not null default '[]'::jsonb;

comment on column public.appointments.schedule_history is
  'Schedule changes. Pending appointments with this history are displayed as Remarcado until reconfirmed.';

-- The existing room/professional guard serializes overlapping intervals.
-- Also enforce exact-slot uniqueness independently of transaction snapshots.
-- If legacy duplicates exist, abort the migration; never delete or rewrite them.
create unique index if not exists appointments_active_professional_slot_unique
  on public.appointments (professional_id, scheduled_date, (left(btrim(scheduled_time), 5)))
  where professional_id is not null and status not in ('cancelado', 'atendido');

create or replace function private.record_appointment_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then return new; end if;
  if (new.scheduled_date, new.scheduled_time::time, new.professional_id)
     is not distinct from (old.scheduled_date, old.scheduled_time::time, old.professional_id) then
    return new;
  end if;

  -- Keep the previous professional response in history before requesting a new one.
  update public.appointments
  set schedule_history = old.schedule_history || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'changed_at', now(), 'changed_by', auth.uid(),
      'from_date', old.scheduled_date, 'from_time', old.scheduled_time,
      'to_date', new.scheduled_date, 'to_time', new.scheduled_time,
      'from_professional_id', old.professional_id,
      'to_professional_id', new.professional_id,
      'previous_status', old.status,
      'professional_responses', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
        from public.appointment_professional_responses r where r.appointment_id = new.id)
    )
  )
  where id = new.id;

  delete from public.appointment_professional_responses where appointment_id = new.id;

  -- Move only pending sessions belonging to the old visit, not future sessions
  -- or completed sessions in historical packages.
  update public.appointment_sessions
  set scheduled_date = new.scheduled_date, scheduled_time = new.scheduled_time,
      updated_at = now()
  where appointment_id = new.id and status = 'pending'
    and scheduled_date = old.scheduled_date
    and scheduled_time::time = old.scheduled_time::time;
  return new;
end;
$$;

drop trigger if exists appointments_record_schedule_change on public.appointments;
create trigger appointments_record_schedule_change
after update of scheduled_date, scheduled_time, professional_id on public.appointments
for each row execute function private.record_appointment_schedule_change();

-- Extend the existing availability function; old two-argument calls keep working.
-- Only verified admins may ignore the appointment they are currently moving.
drop function public.get_professional_booking_slots(uuid,date);
create or replace function public.get_professional_booking_slots(_professional_id uuid, _date date, _exclude_appointment_id uuid default null)
returns table(slot text, is_available boolean, sort_order integer, source text)
language sql
stable
security definer
set search_path = ''
as $function$
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
  ),
  candidate_slots as (
    select d.slot, d.is_available, d.sort_order, 'date'::text as source
    from public.professional_date_time_slots d, has_specific hs
    where hs.value = true
      and d.professional_id = _professional_id
      and d.available_date = _date
      and d.is_available = true
      and d.slot <> '00:00'

    union all

    select w.slot, w.is_available, w.sort_order, 'weekday'::text as source
    from public.professional_weekday_time_slots w, has_specific hs, has_weekday_specific hw
    where hs.value = false
      and hw.value = true
      and w.professional_id = _professional_id
      and w.weekday = extract(dow from _date)::smallint
      and w.is_available = true
      and w.slot <> '00:00'

    union all

    select f.slot, f.is_available, f.sort_order, 'fallback'::text as source
    from fallback_slots f, has_specific hs, has_weekday_specific hw
    where hs.value = false
      and hw.value = false
  )
  select c.slot, c.is_available, c.sort_order, c.source
  from candidate_slots c
  where not exists (
    -- Ocupação da própria profissional.
    select 1
    from public.appointments a
    join public.services s on s.id = a.service_id
    where a.professional_id = _professional_id
      and a.scheduled_date = _date
      and a.status not in ('cancelado','atendido')
      and a.id is distinct from (case when public.is_current_user_admin() then _exclude_appointment_id else null end)
      and (_date + c.slot::time) >= (a.scheduled_date + a.scheduled_time::time)
      and (_date + c.slot::time) < (
        a.scheduled_date + a.scheduled_time::time
        + pg_catalog.make_interval(mins => greatest(1, coalesce(s.duration_min, 30)))
      )
  )
  and not exists (
    -- Reserva administrativa da sala vinculada à profissional.
    select 1
    from public.room_professionals rp
    join public.room_reservations rr on rr.room_id = rp.room_id
    where rp.professional_id = _professional_id
      and rr.reservation_date = _date
      and rr.status = 'active'
      and c.slot::time >= rr.start_time
      and c.slot::time < rr.end_time
  )
  and not exists (
    -- Atendimento de outra profissional somente quando compartilha a mesma sala.
    select 1
    from public.room_professionals own_room
    join public.room_professionals other_room
      on other_room.room_id = own_room.room_id
    join public.appointments a
      on a.professional_id = other_room.professional_id
    join public.services s
      on s.id = a.service_id
    where own_room.professional_id = _professional_id
      and a.professional_id <> _professional_id
      and a.scheduled_date = _date
      and a.status not in ('cancelado','atendido')
      and a.id is distinct from (case when public.is_current_user_admin() then _exclude_appointment_id else null end)
      and (_date + c.slot::time) >= (a.scheduled_date + a.scheduled_time::time)
      and (_date + c.slot::time) < (
        a.scheduled_date + a.scheduled_time::time
        + pg_catalog.make_interval(mins => greatest(1, coalesce(s.duration_min, 30)))
      )
  )
  order by c.sort_order, c.slot;
$function$;

grant execute on function public.get_professional_booking_slots(uuid,date,uuid) to anon, authenticated;

-- Dedicated date/time operation: unlike the full editor, it never rebuilds
-- service links, prices, sellers, combo links, or payment information.
create or replace function public.reschedule_admin_appointment(
  _appointment_id uuid, _scheduled_date date, _scheduled_time text,
  _expected_date date, _expected_time text, _expected_status text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.appointments%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'Acesso administrativo insuficiente.' using errcode = '42501';
  end if;
  select * into a from public.appointments where id = _appointment_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  if (a.scheduled_date, a.scheduled_time, a.status)
     is distinct from (_expected_date, _expected_time, _expected_status) then
    raise exception 'Este agendamento foi alterado. Atualize a agenda antes de tentar novamente.' using errcode = '40001';
  end if;
  if a.status = 'atendido' or exists (
    select 1 from public.financial_entries where appointment_id = a.id
  ) or exists (
    select 1 from public.appointment_sessions where appointment_id = a.id and status = 'completed'
  ) then
    raise exception 'Atendimentos finalizados ou com sessões concluídas não podem ser remarcados por esta tela.';
  end if;
  if a.professional_id is null then raise exception 'Defina a profissional antes de remarcar.'; end if;
  if _scheduled_date is null or _scheduled_time is null
     or _scheduled_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Selecione uma data e um horário válidos.';
  end if;
  if (_scheduled_date + _scheduled_time::time) <= (now() at time zone 'America/Fortaleza') then
    raise exception 'Selecione um horário futuro.';
  end if;
  if (a.scheduled_date, a.scheduled_time::time) = (_scheduled_date, _scheduled_time::time) then
    raise exception 'Selecione uma nova data ou um novo horário.';
  end if;

  -- The same advisory lock used by the existing INSERT/UPDATE guard. The
  -- availability query runs after the lock, so competing reservations are seen.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'jr-clinic-professional:' || a.professional_id::text || ':' || _scheduled_date::text, 0));
  if not exists (
    select 1 from public.get_professional_booking_slots(a.professional_id, _scheduled_date, a.id) s
    where s.is_available and s.slot::time = _scheduled_time::time
  ) then
    raise exception 'Este horário não está mais disponível. Escolha outro.' using errcode = '23P01';
  end if;

  update public.appointments
  set scheduled_date = _scheduled_date, scheduled_time = _scheduled_time,
      status = case when a.status = 'aguardando_pagamento' then a.status else 'pendente' end,
      status_updated_at = now()
  where id = a.id;
  return a.id;
end;
$$;

revoke all on function public.reschedule_admin_appointment(uuid,date,text,date,text,text) from public, anon;
grant execute on function public.reschedule_admin_appointment(uuid,date,text,date,text,text) to authenticated;

commit;
