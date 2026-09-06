create or replace function private.guard_room_reservation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='cancelled' then return new; end if;
  if new.end_time<=new.start_time then raise exception 'O horário final da reserva precisa ser maior que o horário inicial.' using errcode='23514'; end if;
  if not exists(select 1 from public.rooms r where r.id=new.room_id and r.is_active) then raise exception 'Sala não encontrada ou inativa.' using errcode='23503'; end if;
  if exists(
    select 1 from public.room_reservations rr
    where rr.room_id=new.room_id and rr.reservation_date=new.reservation_date and rr.status='active'
      and rr.id is distinct from new.id and new.start_time<rr.end_time and rr.start_time<new.end_time
  ) then raise exception 'Esta sala já possui uma reserva nesse período.' using errcode='23P01'; end if;
  if exists(
    select 1 from public.room_professionals rp
    join public.appointments a on a.professional_id=rp.professional_id
    join public.services s on s.id=a.service_id
    where rp.room_id=new.room_id and a.scheduled_date=new.reservation_date and a.status not in ('cancelado','atendido')
      and new.start_time<(a.scheduled_time::time+pg_catalog.make_interval(mins=>greatest(1,coalesce(s.duration_min,30))))::time
      and a.scheduled_time::time<new.end_time
  ) then raise exception 'Já existe atendimento agendado nesta sala durante o período solicitado.' using errcode='23P01'; end if;
  return new;
end;
$$;

drop trigger if exists room_reservations_overlap_guard on public.room_reservations;
create trigger room_reservations_overlap_guard
before insert or update of room_id,reservation_date,start_time,end_time,status on public.room_reservations
for each row execute function private.guard_room_reservation();
