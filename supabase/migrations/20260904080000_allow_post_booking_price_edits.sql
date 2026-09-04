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

  -- A colaboradora pode corrigir o valor de qualquer atendimento da própria agenda,
  -- inclusive depois de confirmado/atendido. Apenas agendamentos presenciais podem
  -- ter o valor ajustado para não quebrar pagamentos online já processados.
  if is_linked_professional
     and old.payment_choice = 'onsite'
     and new.payment_choice = 'onsite'
     and new.service_price_snapshot is not null
     and new.service_price_snapshot >= 0
     and coalesce(new.deposit_percent, 0) = 0
     and coalesce(new.deposit_amount, 0) = 0
     and new.balance_amount is not distinct from new.service_price_snapshot then
    if (to_jsonb(new) - array['service_price_snapshot','balance_amount','deposit_percent','deposit_amount','updated_at']::text[])
       is not distinct from
       (to_jsonb(old) - array['service_price_snapshot','balance_amount','deposit_percent','deposit_amount','updated_at']::text[]) then
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

create or replace function public.update_appointment_custom_price(
  _appointment_id uuid,
  _new_price numeric
)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_professional_id uuid;
  v_payment_choice text;
  v_is_admin boolean := false;
  v_is_staff boolean := false;
  v_price numeric;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if _new_price is null or _new_price < 0 then
    raise exception 'Informe um valor válido para o atendimento.' using errcode = '23514';
  end if;

  v_price := round(_new_price::numeric, 2);

  select a.professional_id, a.payment_choice
    into v_professional_id, v_payment_choice
  from public.appointments a
  where a.id = _appointment_id;

  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = '23503';
  end if;

  v_is_admin := public.is_current_user_admin();
  v_is_staff := v_professional_id is not null and private.staff_can_manage_professional(v_professional_id);

  if not v_is_admin and not v_is_staff then
    raise exception 'Você não tem permissão para alterar o valor deste atendimento.' using errcode = '42501';
  end if;

  if v_payment_choice <> 'onsite' then
    raise exception 'O valor de um agendamento com pagamento online não pode ser alterado manualmente.' using errcode = '23514';
  end if;

  update public.appointments
     set service_price_snapshot = v_price,
         deposit_percent = 0,
         deposit_amount = 0,
         balance_amount = v_price
   where id = _appointment_id;

  return v_price;
end;
$function$;

grant execute on function public.update_appointment_custom_price(uuid, numeric) to authenticated;
