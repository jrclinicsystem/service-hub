alter table public.appointments
  add column if not exists attended_at timestamptz;

alter table public.appointments
  drop constraint if exists appointments_status_check;

alter table public.appointments
  add constraint appointments_status_check
  check (status = any (array['aguardando_pagamento'::text, 'pendente'::text, 'confirmado'::text, 'atendido'::text, 'cancelado'::text]));

create or replace function public.guard_appointment_user_update()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  jwt_role text := coalesce((select auth.jwt()) ->> 'role', '');
  is_admin boolean := false;
  is_linked_professional boolean := false;
  response_matches boolean := false;
  failed_unpaid boolean := false;
  local_now timestamp := now() at time zone 'America/Fortaleza';
begin
  if jwt_role = 'service_role' then
    return new;
  end if;

  is_admin := public.is_current_user_admin();
  if is_admin then
    return new;
  end if;

  is_linked_professional := old.professional_id is not null
    and private.staff_can_manage_professional(old.professional_id);

  if is_linked_professional
     and old.status = 'pendente'
     and new.status in ('confirmado', 'cancelado') then
    select exists (
      select 1
      from public.appointment_professional_responses apr
      where apr.appointment_id = old.id
        and apr.professional_id = old.professional_id
        and apr.response = case when new.status = 'confirmado' then 'confirmado' else 'recusado' end
    ) into response_matches;

    if response_matches
       and (to_jsonb(new) - array['status','updated_at','status_updated_at']::text[])
           is not distinct from
           (to_jsonb(old) - array['status','updated_at','status_updated_at']::text[]) then
      return new;
    end if;
  end if;

  if is_linked_professional
     and old.status = 'confirmado'
     and new.status = 'atendido'
     and (old.scheduled_date + old.scheduled_time::time) <= local_now then
    if (to_jsonb(new) - array['status','updated_at','status_updated_at','attended_at']::text[])
       is not distinct from
       (to_jsonb(old) - array['status','updated_at','status_updated_at','attended_at']::text[]) then
      return new;
    end if;
  end if;

  if (select auth.uid()) is null or old.user_id is distinct from (select auth.uid()) then
    raise exception 'Você não pode alterar este agendamento.';
  end if;

  failed_unpaid := old.status = 'aguardando_pagamento'
    and exists (
      select 1 from public.payments p
      where p.appointment_id = old.id and p.status = 'failed'
    )
    and not exists (
      select 1 from public.payments p
      where p.appointment_id = old.id and p.status = 'approved'
    );

  if old.status <> 'cancelado'
     and old.scheduled_date >= current_date
     and not failed_unpaid then
    raise exception 'Somente agendamentos cancelados, não pagos ou já realizados podem ser removidos do histórico.';
  end if;

  if (to_jsonb(new) - 'user_hidden_at') is distinct from (to_jsonb(old) - 'user_hidden_at') then
    raise exception 'Somente a visibilidade do histórico pode ser alterada pelo paciente.';
  end if;

  return new;
end;
$function$;

create or replace function public.mark_appointment_attended(_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_professional_id uuid;
  v_status text;
  v_scheduled_date date;
  v_scheduled_time text;
  v_is_admin boolean := false;
  v_is_staff boolean := false;
  v_local_now timestamp := now() at time zone 'America/Fortaleza';
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  select a.professional_id, a.status, a.scheduled_date, a.scheduled_time
    into v_professional_id, v_status, v_scheduled_date, v_scheduled_time
  from public.appointments a
  where a.id = _appointment_id;

  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = '23503';
  end if;

  v_is_admin := public.is_current_user_admin();
  v_is_staff := v_professional_id is not null and private.staff_can_manage_professional(v_professional_id);

  if not v_is_admin and not v_is_staff then
    raise exception 'Você não tem permissão para concluir este atendimento.' using errcode = '42501';
  end if;

  if v_status = 'atendido' then
    return;
  end if;

  if v_status <> 'confirmado' then
    raise exception 'O agendamento precisa estar confirmado antes de marcar como atendido.' using errcode = '23514';
  end if;

  if (v_scheduled_date + v_scheduled_time::time) > v_local_now then
    raise exception 'O atendimento ainda não chegou ao horário agendado.' using errcode = '23514';
  end if;

  update public.appointments
     set status = 'atendido',
         attended_at = now(),
         status_updated_at = now()
   where id = _appointment_id
     and status = 'confirmado';
end;
$function$;

grant execute on function public.mark_appointment_attended(uuid) to authenticated;
