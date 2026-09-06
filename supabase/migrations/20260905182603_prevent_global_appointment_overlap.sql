-- Global clinic scheduling rule: active appointments cannot overlap across professionals.
-- Room reservations remain respected for the selected professional.

create or replace function private.guard_appointment_room_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_duration integer;
  v_start timestamp without time zone;
  v_end timestamp without time zone;
begin
  if new.professional_id is null or new.status in ('cancelado','atendido') then
    return new;
  end if;

  select greatest(1, coalesce(s.duration_min, 30))
    into v_duration
  from public.services s
  where s.id = new.service_id;

  if not found then
    return new;
  end if;

  v_start := new.scheduled_date + new.scheduled_time::time;
  v_end := v_start + pg_catalog.make_interval(mins => v_duration);

  -- Serialize all active appointment writes for the same clinic date.
  -- This prevents simultaneous requests from creating overlapping bookings
  -- for different professionals before either transaction can see the other.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jr-clinic-global-appointments:' || new.scheduled_date::text, 0)
  );

  -- Keep room reservations respected for the selected professional.
  if exists (
    select 1
    from public.room_professionals rp
    join public.room_reservations rr on rr.room_id = rp.room_id
    where rp.professional_id = new.professional_id
      and rr.reservation_date = new.scheduled_date
      and rr.status = 'active'
      and new.scheduled_time::time < rr.end_time
      and rr.start_time < (new.scheduled_time::time + pg_catalog.make_interval(mins => v_duration))::time
  ) then
    raise exception 'A sala usada por este profissional está reservada nesse período. Escolha outro horário.' using errcode = '23P01';
  end if;

  -- Global clinic rule: no two active appointments may overlap,
  -- regardless of which professional is assigned.
  if exists (
    select 1
    from public.appointments a
    join public.services s on s.id = a.service_id
    where a.id is distinct from new.id
      and a.scheduled_date = new.scheduled_date
      and a.status not in ('cancelado','atendido')
      and v_start < (
        a.scheduled_date + a.scheduled_time::time
        + pg_catalog.make_interval(mins => greatest(1, coalesce(s.duration_min, 30)))
      )
      and (a.scheduled_date + a.scheduled_time::time) < v_end
  ) then
    raise exception 'Já existe outro atendimento agendado nesse período. Escolha outro horário.' using errcode = '23P01';
  end if;

  return new;
end;
$function$;

create or replace function public.get_professional_booking_slots(_professional_id uuid, _date date)
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
    select 1
    from public.appointments a
    join public.services s on s.id = a.service_id
    where a.scheduled_date = _date
      and a.status not in ('cancelado','atendido')
      and (_date + c.slot::time) >= (a.scheduled_date + a.scheduled_time::time)
      and (_date + c.slot::time) < (
        a.scheduled_date + a.scheduled_time::time
        + pg_catalog.make_interval(mins => greatest(1, coalesce(s.duration_min, 30)))
      )
  )
  and not exists (
    select 1
    from public.room_professionals rp
    join public.room_reservations rr on rr.room_id = rp.room_id
    where rp.professional_id = _professional_id
      and rr.reservation_date = _date
      and rr.status = 'active'
      and c.slot::time >= rr.start_time
      and c.slot::time < rr.end_time
  )
  order by sort_order, slot;
$function$;

grant execute on function public.get_professional_booking_slots(uuid,date) to anon, authenticated;
