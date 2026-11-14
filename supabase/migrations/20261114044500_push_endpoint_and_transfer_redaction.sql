-- Fix metadata disclosure when transferring an appointment away from a professional.
CREATE OR REPLACE FUNCTION private.create_appointment_notification(_a appointments, _recipient uuid, _kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare _service text; _title text; _message text;
begin
  if _recipient is null then return; end if;
  select s.name into _service from public.services s where s.id = _a.service_id;
  _title := case _kind
    when 'novo_agendamento' then 'Novo agendamento'
    when 'confirmacao' then 'Agendamento confirmado'
    when 'cancelamento' then 'Agendamento cancelado'
    when 'remarcacao' then 'Agendamento remarcado'
    when 'transferencia_recebida' then 'Agendamento transferido para você'
    when 'transferencia_saida' then 'Agendamento retirado da sua agenda'
    else 'Atualização de agenda' end;
  _message := case _kind
    when 'transferencia_saida' then 'Um atendimento deixou sua agenda.'
    else 'Há uma atualização de atendimento na sua agenda.' end;
  insert into public.professional_notifications
    (appointment_id, recipient_professional_id, event_type, title, body,
     service_name, scheduled_date, scheduled_time, deep_link)
  values (case when _kind='transferencia_saida' then null else _a.id end,
          _recipient, _kind, _title, _message,
          case when _kind='transferencia_saida' then null else _service end,
          case when _kind='transferencia_saida' then null else _a.scheduled_date end,
          case when _kind='transferencia_saida' then null else _a.scheduled_time end,
          '/profissional');
end;
$function$;

CREATE OR REPLACE FUNCTION private.jr_appointment_notification_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
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

-- Limit Web Push endpoints to known push providers (no private hosts, userinfo, ports, or redirects).
create or replace function public.push_endpoint_allowed(_endpoint text)
returns boolean language sql immutable security invoker set search_path = ''
as $fn$
  select _endpoint is not null and length(_endpoint) between 20 and 2048
    and lower(_endpoint) ~ '^https://(fcm\\.googleapis\\.com|updates\\.push\\.services\\.mozilla\\.com|web\\.push\\.apple\\.com|[a-z0-9.-]+\\.push\\.apple\\.com|[a-z0-9.-]+\\.notify\\.windows\\.com)/[^[:space:]#]*$';
$fn$;
alter table public.push_subscriptions
  add constraint push_subscriptions_trusted_endpoint
  check (public.push_endpoint_allowed(endpoint));
