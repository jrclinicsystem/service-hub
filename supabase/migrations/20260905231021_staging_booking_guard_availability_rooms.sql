create or replace function private.guard_operational_appointment_overlap()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_duration integer;
  v_start timestamp without time zone;
  v_end timestamp without time zone;
  v_weekday smallint;
  v_has_date boolean;
  v_has_weekday boolean;
begin
  if new.status in ('cancelado','atendido') then return new; end if;
  if new.professional_id is null then raise exception 'Selecione um profissional para o agendamento.' using errcode='23514'; end if;
  if new.scheduled_time !~ '^[0-2][0-9]:[0-5][0-9]$' or new.scheduled_time::time>=time '24:00' then raise exception 'Horário de agendamento inválido.' using errcode='23514'; end if;
  if not exists(select 1 from public.professionals p where p.id=new.professional_id and p.is_active and p.deleted_at is null) then raise exception 'Profissional não encontrado ou inativo.' using errcode='23503'; end if;
  if not exists(select 1 from public.service_professionals sp where sp.service_id=new.service_id and sp.professional_id=new.professional_id) then raise exception 'Esse profissional não atende o serviço selecionado.' using errcode='23514'; end if;
  select greatest(1,coalesce(s.duration_min,30)) into v_duration from public.services s where s.id=new.service_id;
  if not found then raise exception 'Serviço não encontrado.' using errcode='23503'; end if;

  v_weekday:=extract(dow from new.scheduled_date)::smallint;
  select exists(select 1 from public.professional_date_time_slots d where d.professional_id=new.professional_id and d.available_date=new.scheduled_date) into v_has_date;
  if v_has_date then
    if not exists(select 1 from public.professional_date_time_slots d where d.professional_id=new.professional_id and d.available_date=new.scheduled_date and d.slot=new.scheduled_time and d.is_available and d.slot<>'00:00') then
      raise exception 'Esse horário não foi liberado para esta data.' using errcode='23514';
    end if;
  else
    select exists(select 1 from public.professional_weekday_time_slots w where w.professional_id=new.professional_id and w.weekday=v_weekday) into v_has_weekday;
    if v_has_weekday then
      if not exists(select 1 from public.professional_weekday_time_slots w where w.professional_id=new.professional_id and w.weekday=v_weekday and w.slot=new.scheduled_time and w.is_available and w.slot<>'00:00') then
        raise exception 'Esse horário não está liberado para este dia da semana.' using errcode='23514';
      end if;
    elsif exists(select 1 from public.professional_time_slots p where p.professional_id=new.professional_id)
      and not exists(select 1 from public.professional_time_slots p where p.professional_id=new.professional_id and p.slot=new.scheduled_time and p.is_available) then
        raise exception 'Esse horário não está disponível para este profissional.' using errcode='23514';
    end if;
  end if;

  v_start:=new.scheduled_date+new.scheduled_time::time;
  v_end:=v_start+pg_catalog.make_interval(mins=>v_duration);
  if exists(
    select 1 from public.appointments a join public.services s on s.id=a.service_id
    where a.id is distinct from new.id and a.scheduled_date=new.scheduled_date and a.status not in ('cancelado','atendido')
      and v_start<(a.scheduled_date+a.scheduled_time::time+pg_catalog.make_interval(mins=>greatest(1,coalesce(s.duration_min,30))))
      and (a.scheduled_date+a.scheduled_time::time)<v_end
  ) then raise exception 'Já existe outro atendimento agendado nesse período. Escolha outro horário.' using errcode='23P01'; end if;

  if exists(
    select 1 from public.room_professionals rp join public.room_reservations rr on rr.room_id=rp.room_id
    where rp.professional_id=new.professional_id and rr.reservation_date=new.scheduled_date and rr.status='active'
      and new.scheduled_time::time<rr.end_time
      and rr.start_time<(new.scheduled_time::time+pg_catalog.make_interval(mins=>v_duration))::time
  ) then raise exception 'A sala usada por este profissional está reservada nesse período. Escolha outro horário.' using errcode='23P01'; end if;

  return new;
end;
$$;
