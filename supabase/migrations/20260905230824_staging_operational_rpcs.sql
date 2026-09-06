-- STAGING ONLY: operational RPCs used by booking/professional/admin interfaces.
create or replace function public.get_professional_booking_slots(_professional_id uuid,_date date)
returns table(slot text,is_available boolean,sort_order integer,source text)
language sql stable security definer set search_path=''
as $$
with has_date as (
 select exists(select 1 from public.professional_date_time_slots d where d.professional_id=_professional_id and d.available_date=_date) v
), has_weekday as (
 select exists(select 1 from public.professional_weekday_time_slots w where w.professional_id=_professional_id and w.weekday=extract(dow from _date)::smallint) v
), candidate as (
 select d.slot,d.is_available,d.sort_order,'date'::text source
 from public.professional_date_time_slots d,has_date hd
 where hd.v and d.professional_id=_professional_id and d.available_date=_date and d.is_available and d.slot<>'00:00'
 union all
 select w.slot,w.is_available,w.sort_order,'weekday'::text
 from public.professional_weekday_time_slots w,has_date hd,has_weekday hw
 where not hd.v and hw.v and w.professional_id=_professional_id and w.weekday=extract(dow from _date)::smallint and w.is_available and w.slot<>'00:00'
 union all
 select p.slot,p.is_available,p.sort_order,'fallback'::text
 from public.professional_time_slots p,has_date hd,has_weekday hw
 where not hd.v and not hw.v and p.professional_id=_professional_id and p.is_available
)
select c.slot,c.is_available,c.sort_order,c.source
from candidate c
where not exists(
 select 1 from public.appointments a join public.services s on s.id=a.service_id
 where a.scheduled_date=_date and a.status not in ('cancelado','atendido')
 and (_date+c.slot::time)>=(a.scheduled_date+a.scheduled_time::time)
 and (_date+c.slot::time)<(a.scheduled_date+a.scheduled_time::time+pg_catalog.make_interval(mins=>greatest(1,coalesce(s.duration_min,30))))
)
and not exists(
 select 1 from public.room_professionals rp join public.room_reservations rr on rr.room_id=rp.room_id
 where rp.professional_id=_professional_id and rr.reservation_date=_date and rr.status='active'
 and c.slot::time>=rr.start_time and c.slot::time<rr.end_time
)
order by sort_order,slot;
$$;
revoke all on function public.get_professional_booking_slots(uuid,date) from public;
grant execute on function public.get_professional_booking_slots(uuid,date) to anon,authenticated;

create or replace function public.respond_to_professional_appointment(_appointment_id uuid,_response text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_professional_id uuid; v_status text;
begin
 if auth.uid() is null then raise exception 'Sessão inválida.' using errcode='42501'; end if;
 if _response not in ('confirmado','recusado') then raise exception 'Resposta inválida.' using errcode='23514'; end if;
 select professional_id,status into v_professional_id,v_status from public.appointments where id=_appointment_id;
 if not found then raise exception 'Agendamento não encontrado.' using errcode='P0002'; end if;
 if v_professional_id is null or not private.staff_can_manage_professional(v_professional_id) then raise exception 'Você não tem acesso a este agendamento.' using errcode='42501'; end if;
 if v_status<>'pendente' then raise exception 'Este agendamento não está mais aguardando sua confirmação.' using errcode='23514'; end if;
 insert into public.appointment_professional_responses(appointment_id,professional_id,response,responded_at,updated_at)
 values(_appointment_id,v_professional_id,_response,now(),now())
 on conflict(appointment_id) do update set professional_id=excluded.professional_id,response=excluded.response,responded_at=excluded.responded_at,updated_at=excluded.updated_at;
 update public.appointments set status=case when _response='confirmado' then 'confirmado' else 'cancelado' end,status_updated_at=now()
 where id=_appointment_id and status='pendente';
end;
$$;
revoke all on function public.respond_to_professional_appointment(uuid,text) from public,anon;
grant execute on function public.respond_to_professional_appointment(uuid,text) to authenticated;

create or replace function public.get_professional_room_blocks(_professional_id uuid,_date date)
returns table(room_name text,renter_name text,rental_type text,start_time text,end_time text,notes text)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null then raise exception 'Sessão inválida.' using errcode='42501'; end if;
 if not public.is_current_user_admin() and not private.staff_can_manage_professional(_professional_id) then raise exception 'Sem acesso a esta agenda.' using errcode='42501'; end if;
 return query
 select r.name,rr.renter_name,rr.rental_type,to_char(rr.start_time,'HH24:MI'),to_char(rr.end_time,'HH24:MI'),rr.notes
 from public.room_professionals rp join public.rooms r on r.id=rp.room_id join public.room_reservations rr on rr.room_id=rp.room_id
 where rp.professional_id=_professional_id and rr.reservation_date=_date and rr.status='active'
 order by rr.start_time,r.name;
end;
$$;
revoke all on function public.get_professional_room_blocks(uuid,date) from public,anon;
grant execute on function public.get_professional_room_blocks(uuid,date) to authenticated;
