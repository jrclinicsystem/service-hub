-- Session-level changes produce one authorized notification; avoid double main/session events.
alter table public.professional_notifications
  drop constraint professional_notifications_event_type_check;
alter table public.professional_notifications
  add constraint professional_notifications_event_type_check
  check (event_type in ('novo_agendamento','confirmacao','cancelamento',
    'remarcacao','transferencia_recebida','transferencia_saida','remarcacao_sessao'));

create or replace function private.notify_appointment_session_reschedule()
returns trigger language plpgsql security definer set search_path=''
as $$
declare parent public.appointments%rowtype;
begin
  if (new.scheduled_date,new.scheduled_time) is not distinct from
     (old.scheduled_date,old.scheduled_time) then return new; end if;
  if current_setting('jr_clinic.suppress_session_push',true)='on' then return new; end if;
  if new.status <> 'pending' or new.scheduled_date is null then return new; end if;
  select * into parent from public.appointments where id=new.appointment_id;
  if not found or parent.professional_id is null
     or parent.status in ('cancelado','aguardando_pagamento') then return new; end if;

  insert into public.professional_notifications
    (appointment_id,recipient_professional_id,event_type,title,body,
     service_name,scheduled_date,scheduled_time,deep_link)
  values (parent.id,parent.professional_id,'remarcacao_sessao','Sessão remarcada',
          'Uma sessão do seu atendimento foi reagendada.',
          new.service_name_snapshot,new.scheduled_date,new.scheduled_time,
          '/profissional');
  return new;
end;
$$;
revoke all on function private.notify_appointment_session_reschedule()
from public,anon,authenticated;
drop trigger if exists jr_notify_session_reschedule on public.appointment_sessions;
create trigger jr_notify_session_reschedule
after update of scheduled_date,scheduled_time on public.appointment_sessions
for each row execute function private.notify_appointment_session_reschedule();

CREATE OR REPLACE FUNCTION private.jr_appointment_notification_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_setting('jr_clinic.suppress_main_push',true) = 'on' then return new; end if;
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
      perform private.create_appointment_notification(old,old.professional_id,'transferencia_saida');
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
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_admin_appointment(_appointment_id uuid, _scheduled_date date, _scheduled_time text, _expected_date date, _expected_time text, _expected_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform set_config('jr_clinic.suppress_session_push','on',true);
  -- Update only sessions belonging to the specifically rescheduled visit.
  update public.appointment_sessions
     set scheduled_date = _scheduled_date, scheduled_time = _scheduled_time, updated_at = now()
   where appointment_id = a.id and status = 'pending'
     and scheduled_date = a.scheduled_date
     and scheduled_time::time = a.scheduled_time::time;
  perform set_config('jr_clinic.suppress_session_push','off',true);
  return a.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_appointment_session_schedule(_session_id uuid, _scheduled_date date, _scheduled_time text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare _session public.appointment_sessions%rowtype; _appointment public.appointments%rowtype; _next public.appointment_sessions%rowtype;
begin
  if not (public.finance_has_role(array['admin','finance','reception']) or private.has_role('admin'::public.app_role) or exists(select 1 from public.admin_emails ae where ae.enabled=true and lower(ae.email)=lower(coalesce(auth.jwt()->>'email','')))) then raise exception 'Acesso insuficiente para reagendar sessão.' using errcode='42501'; end if;
  select * into _session from public.appointment_sessions where id=_session_id for update;
  if not found then raise exception 'Sessão não encontrada.' using errcode='23503'; end if;
  if _session.status='completed' then raise exception 'Sessão concluída mantém a data histórica. Reabra a sessão antes de alterar a data.' using errcode='23514'; end if;
  select * into _appointment from public.appointments where id=_session.appointment_id for update;
  if not found then raise exception 'Agendamento não encontrado.' using errcode='23503'; end if;
  if _appointment.status='cancelado' then raise exception 'Agendamento cancelado.' using errcode='23514'; end if;
  if (_scheduled_date is null)<>(nullif(trim(coalesce(_scheduled_time,'')),'') is null) then raise exception 'Informe data e horário juntos.' using errcode='23514'; end if;
  if _scheduled_date is not null then
    if exists(select 1 from public.appointments a where a.id<>_appointment.id and a.professional_id=_appointment.professional_id and a.scheduled_date=_scheduled_date and a.scheduled_time=trim(_scheduled_time) and a.status<>'cancelado')
      or exists(select 1 from public.appointment_sessions ps join public.appointments a on a.id=ps.appointment_id where ps.id<>_session_id and a.id<>_appointment.id and a.professional_id=_appointment.professional_id and ps.scheduled_date=_scheduled_date and ps.scheduled_time=trim(_scheduled_time) and ps.status='pending' and a.status<>'cancelado') then raise exception 'Este profissional já possui atendimento/sessão neste horário.' using errcode='23505'; end if;
  end if;
  update public.appointment_sessions set scheduled_date=_scheduled_date,scheduled_time=nullif(trim(coalesce(_scheduled_time,'')),''),updated_at=now() where id=_session_id returning * into _session;
  select * into _next from public.appointment_sessions where appointment_id=_session.appointment_id and status='pending' and scheduled_date is not null order by scheduled_date,nullif(scheduled_time,''),service_position,session_number limit 1;
  if found then perform set_config('jr_clinic.suppress_main_push','on',true); update public.appointments set scheduled_date=_next.scheduled_date,scheduled_time=coalesce(nullif(_next.scheduled_time,''),scheduled_time),status_updated_at=now() where id=_session.appointment_id; perform set_config('jr_clinic.suppress_main_push','off',true); end if;
  return to_jsonb(_session);
end;
$function$;
