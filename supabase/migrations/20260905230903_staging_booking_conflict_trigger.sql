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
begin
  if new.status in ('cancelado','atendido') then return new; end if;
  if new.professional_id is null then raise exception 'Selecione um profissional para o agendamento.' using errcode='23514'; end if;
  if not exists(select 1 from public.professionals p where p.id=new.professional_id and p.is_active and p.deleted_at is null) then raise exception 'Profissional não encontrado ou inativo.' using errcode='23503'; end if;
  if not exists(select 1 from public.service_professionals sp where sp.service_id=new.service_id and sp.professional_id=new.professional_id) then raise exception 'Esse profissional não atende o serviço selecionado.' using errcode='23514'; end if;
  select greatest(1,coalesce(s.duration_min,30)) into v_duration from public.services s where s.id=new.service_id;
  if not found then raise exception 'Serviço não encontrado.' using errcode='23503'; end if;
  v_start:=new.scheduled_date+new.scheduled_time::time;
  v_end:=v_start+pg_catalog.make_interval(mins=>v_duration);
  if exists(
    select 1 from public.appointments a join public.services s on s.id=a.service_id
    where a.id is distinct from new.id and a.scheduled_date=new.scheduled_date and a.status not in ('cancelado','atendido')
      and v_start<(a.scheduled_date+a.scheduled_time::time+pg_catalog.make_interval(mins=>greatest(1,coalesce(s.duration_min,30))))
      and (a.scheduled_date+a.scheduled_time::time)<v_end
  ) then raise exception 'Já existe outro atendimento agendado nesse período. Escolha outro horário.' using errcode='23P01'; end if;
  return new;
end;
$$;

drop trigger if exists appointments_operational_overlap_guard on public.appointments;
create trigger appointments_operational_overlap_guard
before insert or update of professional_id,service_id,scheduled_date,scheduled_time,status on public.appointments
for each row execute function private.guard_operational_appointment_overlap();
