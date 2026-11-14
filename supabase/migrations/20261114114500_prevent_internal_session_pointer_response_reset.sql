-- Protect completed/confirmed package responses when the next session becomes primary.
CREATE OR REPLACE FUNCTION private.record_appointment_schedule_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Internal session selection is NOT an administrative rescheduling event.
  -- Keep earlier responses and history untouched when only the primary pointer moves.
  if current_setting('jr_clinic.suppress_main_push', true) = 'on' then return new; end if;
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
