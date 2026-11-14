-- Fix session schedule cascade; preserve original authorization and business checks.
CREATE OR REPLACE FUNCTION private.record_appointment_schedule_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Do not cascade main appointment updates onto package sessions.
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
  -- Update only sessions belonging to the specifically rescheduled visit.
  update public.appointment_sessions
     set scheduled_date = _scheduled_date, scheduled_time = _scheduled_time, updated_at = now()
   where appointment_id = a.id and status = 'pending'
     and scheduled_date = a.scheduled_date
     and scheduled_time::time = a.scheduled_time::time;
  return a.id;
end;
$function$;
