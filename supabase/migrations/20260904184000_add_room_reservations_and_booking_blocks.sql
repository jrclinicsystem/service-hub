create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_name_length check (char_length(btrim(name)) between 2 and 120)
);

create unique index if not exists rooms_name_lower_uidx on public.rooms (lower(btrim(name)));

create table if not exists public.room_professionals (
  room_id uuid not null references public.rooms(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, professional_id)
);

create table if not exists public.room_reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete restrict,
  renter_professional_id uuid null references public.professionals(id) on delete set null,
  renter_name text not null,
  reservation_date date not null,
  rental_type text not null,
  start_time time not null,
  end_time time not null,
  amount numeric(12,2) null,
  notes text null,
  status text not null default 'active',
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_reservations_renter_name_check check (char_length(btrim(renter_name)) between 2 and 120),
  constraint room_reservations_type_check check (rental_type in ('hour','shift','day')),
  constraint room_reservations_status_check check (status in ('active','cancelled')),
  constraint room_reservations_time_check check (end_time > start_time),
  constraint room_reservations_amount_check check (amount is null or amount >= 0),
  constraint room_reservations_notes_check check (notes is null or char_length(notes) <= 1000)
);

create index if not exists room_professionals_professional_idx on public.room_professionals(professional_id, room_id);
create index if not exists room_reservations_room_date_idx on public.room_reservations(room_id, reservation_date, status, start_time, end_time);
create index if not exists room_reservations_renter_professional_idx on public.room_reservations(renter_professional_id, reservation_date);

alter table public.rooms enable row level security;
alter table public.room_professionals enable row level security;
alter table public.room_reservations enable row level security;

drop policy if exists "Admins manage rooms" on public.rooms;
create policy "Admins manage rooms" on public.rooms for all to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "Staff read linked rooms" on public.rooms;
create policy "Staff read linked rooms" on public.rooms for select to authenticated
using (
  public.is_current_user_admin()
  or exists (
    select 1 from public.room_professionals rp
    where rp.room_id = rooms.id
      and private.staff_can_manage_professional(rp.professional_id)
  )
);

drop policy if exists "Admins manage room professionals" on public.room_professionals;
create policy "Admins manage room professionals" on public.room_professionals for all to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "Staff read own room links" on public.room_professionals;
create policy "Staff read own room links" on public.room_professionals for select to authenticated
using (public.is_current_user_admin() or private.staff_can_manage_professional(professional_id));

drop policy if exists "Admins manage room reservations" on public.room_reservations;
create policy "Admins manage room reservations" on public.room_reservations for all to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "Staff read linked room reservations" on public.room_reservations;
create policy "Staff read linked room reservations" on public.room_reservations for select to authenticated
using (
  public.is_current_user_admin()
  or exists (
    select 1 from public.room_professionals rp
    where rp.room_id = room_reservations.room_id
      and private.staff_can_manage_professional(rp.professional_id)
  )
);

create or replace function private.touch_room_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists rooms_touch_updated_at on public.rooms;
create trigger rooms_touch_updated_at before update on public.rooms
for each row execute function private.touch_room_updated_at();

drop trigger if exists room_reservations_touch_updated_at on public.room_reservations;
create trigger room_reservations_touch_updated_at before update on public.room_reservations
for each row execute function private.touch_room_updated_at();

create or replace function private.guard_room_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_room_name text;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  if new.end_time <= new.start_time then
    raise exception 'O horário final da reserva precisa ser maior que o horário inicial.' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.room_id::text || ':' || new.reservation_date::text, 0)
  );

  select r.name into v_room_name from public.rooms r where r.id = new.room_id and r.is_active = true;
  if not found then
    raise exception 'Sala não encontrada ou inativa.' using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.room_reservations rr
    where rr.room_id = new.room_id
      and rr.reservation_date = new.reservation_date
      and rr.status = 'active'
      and rr.id is distinct from new.id
      and new.start_time < rr.end_time
      and rr.start_time < new.end_time
  ) then
    raise exception 'Esta sala já possui uma reserva nesse período.' using errcode = '23P01';
  end if;

  if exists (
    select 1
    from public.room_professionals rp
    join public.appointments a on a.professional_id = rp.professional_id
    join public.services s on s.id = a.service_id
    where rp.room_id = new.room_id
      and a.scheduled_date = new.reservation_date
      and a.status not in ('cancelado','atendido')
      and new.start_time < (a.scheduled_time::time + pg_catalog.make_interval(mins => greatest(1, coalesce(s.duration_min, 30))))::time
      and a.scheduled_time::time < new.end_time
  ) then
    raise exception 'Já existe atendimento agendado nesta sala durante o período solicitado.' using errcode = '23P01';
  end if;

  return new;
end;
$function$;

drop trigger if exists room_reservations_guard on public.room_reservations;
create trigger room_reservations_guard before insert or update of room_id,reservation_date,start_time,end_time,status
on public.room_reservations for each row execute function private.guard_room_reservation();

create or replace function private.guard_appointment_room_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_duration integer;
  v_room record;
begin
  if new.professional_id is null or new.status in ('cancelado','atendido') then
    return new;
  end if;

  select greatest(1, coalesce(s.duration_min, 30)) into v_duration
  from public.services s where s.id = new.service_id;
  if not found then
    return new;
  end if;

  for v_room in
    select rp.room_id
    from public.room_professionals rp
    where rp.professional_id = new.professional_id
    order by rp.room_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_room.room_id::text || ':' || new.scheduled_date::text, 0)
    );
  end loop;

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
    raise exception 'A sala usada por este profissional está reservada nesse período.' using errcode = '23P01';
  end if;

  return new;
end;
$function$;

drop trigger if exists appointment_room_reservation_guard on public.appointments;
create trigger appointment_room_reservation_guard before insert on public.appointments
for each row execute function private.guard_appointment_room_reservation();

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
    where a.professional_id = _professional_id
      and a.scheduled_date = _date
      and a.status not in ('cancelado', 'atendido')
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

create or replace function public.get_professional_room_blocks(_professional_id uuid, _date date)
returns table(room_name text, renter_name text, rental_type text, start_time text, end_time text, notes text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;
  if not public.is_current_user_admin() and not private.staff_can_manage_professional(_professional_id) then
    raise exception 'Sem acesso a esta agenda.' using errcode = '42501';
  end if;

  return query
  select r.name, rr.renter_name, rr.rental_type,
         to_char(rr.start_time, 'HH24:MI'), to_char(rr.end_time, 'HH24:MI'), rr.notes
  from public.room_professionals rp
  join public.rooms r on r.id = rp.room_id
  join public.room_reservations rr on rr.room_id = rp.room_id
  where rp.professional_id = _professional_id
    and rr.reservation_date = _date
    and rr.status = 'active'
  order by rr.start_time, r.name;
end;
$function$;

grant execute on function public.get_professional_room_blocks(uuid,date) to authenticated;

insert into public.rooms(name, is_active)
select v.name, true
from (values ('Consultorio 1'),('Consultorio 2'),('Consultorio 3'),('Sala odontológica')) as v(name)
where not exists (select 1 from public.rooms r where lower(btrim(r.name)) = lower(btrim(v.name)));

insert into public.room_professionals(room_id, professional_id)
select r.id, p.id
from public.rooms r
join public.professionals p on lower(p.name) in (lower('Dra. Alaane Gadelha'), lower('Dra. Mabel Cunha'))
where lower(btrim(r.name)) = lower('Sala odontológica')
on conflict do nothing;
