-- Ajusta o acompanhamento de sessões de combos, reconhecimento financeiro e edição para R$ 0,00.

alter table public.client_budget_items
  add column if not exists completed_session_numbers integer[] not null default '{}'::integer[];

create or replace function public.set_client_budget_item_session_completion(
  _item_id uuid,
  _session_number integer,
  _completed boolean
)
returns public.client_budget_items
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _item public.client_budget_items%rowtype;
begin
  if not (
    public.finance_has_role(array['admin','finance','reception'])
    or private.has_role('admin'::public.app_role)
    or exists (
      select 1
      from public.admin_emails ae
      where ae.enabled = true
        and lower(ae.email) = lower(coalesce(auth.jwt()->>'email',''))
    )
  ) then
    raise exception 'Acesso insuficiente para atualizar as sessões do orçamento.' using errcode = '42501';
  end if;

  select * into _item
  from public.client_budget_items
  where id = _item_id
  for update;

  if not found then
    raise exception 'Item do orçamento não encontrado.' using errcode = '23503';
  end if;

  if _session_number is null or _session_number < 1 or _session_number > greatest(1, coalesce(_item.sessions, 1)) then
    raise exception 'Sessão inválida para este serviço.' using errcode = '23514';
  end if;

  if _completed then
    update public.client_budget_items
       set completed_session_numbers = (
         select coalesce(array_agg(v order by v), '{}'::integer[])
         from (
           select distinct unnest(coalesce(_item.completed_session_numbers, '{}'::integer[]) || _session_number) as v
         ) dedup
       )
     where id = _item_id
     returning * into _item;
  else
    update public.client_budget_items
       set completed_session_numbers = array_remove(coalesce(completed_session_numbers, '{}'::integer[]), _session_number)
     where id = _item_id
     returning * into _item;
  end if;

  return _item;
end;
$function$;

revoke all on function public.set_client_budget_item_session_completion(uuid,integer,boolean) from public;
grant execute on function public.set_client_budget_item_session_completion(uuid,integer,boolean) to authenticated;

-- Sessões de pacote passam a controlar o reconhecimento da receita:
-- se uma sessão for reaberta, a entrada recebida volta a pending e sai dos resultados;
-- quando todas forem concluídas novamente, a entrada previamente recebida volta a received.
create or replace function public.set_appointment_session_completion(
  _session_id uuid,
  _completed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _session public.appointment_sessions%rowtype;
  _appointment public.appointments%rowtype;
  _total integer;
  _completed_count integer;
  _next public.appointment_sessions%rowtype;
  _financial public.financial_entries%rowtype;
  _before_financial jsonb;
  _has_financial boolean := false;
begin
  if not (
    public.finance_has_role(array['admin','finance','reception'])
    or private.has_role('admin'::public.app_role)
    or exists (
      select 1 from public.admin_emails ae
      where ae.enabled = true
        and lower(ae.email) = lower(coalesce(auth.jwt()->>'email',''))
    )
  ) then
    raise exception 'Acesso insuficiente para concluir sessão.' using errcode = '42501';
  end if;

  select * into _session
  from public.appointment_sessions
  where id = _session_id
  for update;
  if not found then
    raise exception 'Sessão não encontrada.' using errcode = '23503';
  end if;

  select * into _appointment
  from public.appointments
  where id = _session.appointment_id
  for update;
  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = '23503';
  end if;

  if _appointment.status not in ('confirmado','atendido') then
    raise exception 'As sessões só podem ser gerenciadas em um pacote confirmado.' using errcode = '23514';
  end if;
  if _completed and _session.scheduled_date is null then
    raise exception 'Defina a data desta sessão antes de concluí-la.' using errcode = '23514';
  end if;

  update public.appointment_sessions
     set status = case when _completed then 'completed' else 'pending' end,
         completed_at = case when _completed then coalesce(completed_at, now()) else null end,
         completed_by = case when _completed then coalesce(completed_by, auth.uid()) else null end,
         updated_at = now()
   where id = _session_id
   returning * into _session;

  select count(*), count(*) filter (where status = 'completed')
    into _total, _completed_count
  from public.appointment_sessions
  where appointment_id = _session.appointment_id;

  select * into _financial
  from public.financial_entries
  where appointment_id = _session.appointment_id
    and status not in ('cancelled','refunded')
  order by created_at desc
  limit 1
  for update;
  _has_financial := found;

  if _total > 1 and _completed_count = _total then
    update public.appointments
       set status = 'atendido',
           attended_at = coalesce(attended_at, now()),
           status_updated_at = now()
     where id = _session.appointment_id;

    if _has_financial and _financial.status = 'pending' and _financial.received_at is not null then
      _before_financial := to_jsonb(_financial);
      update public.financial_entries
         set status = 'received',
             occurred_at = now(),
             updated_at = now()
       where id = _financial.id
       returning * into _financial;

      insert into public.financial_audit_log(
        entity_type, entity_id, action, actor_id, old_data, new_data, metadata
      ) values (
        'financial_entries', _financial.id, 'recognize_after_package_completion', auth.uid(),
        _before_financial, to_jsonb(_financial),
        jsonb_build_object('appointment_id', _session.appointment_id, 'reason', 'all_sessions_completed')
      );
    end if;
  elsif _total > 1 and _completed_count < _total then
    if _appointment.status = 'atendido' then
      update public.appointments
         set status = 'confirmado',
             attended_at = null,
             status_updated_at = now()
       where id = _session.appointment_id;
    end if;

    if _has_financial and _financial.status = 'received' then
      _before_financial := to_jsonb(_financial);
      update public.financial_entries
         set status = 'pending',
             updated_at = now()
       where id = _financial.id
       returning * into _financial;

      insert into public.financial_audit_log(
        entity_type, entity_id, action, actor_id, old_data, new_data, metadata
      ) values (
        'financial_entries', _financial.id, 'defer_for_package_sessions', auth.uid(),
        _before_financial, to_jsonb(_financial),
        jsonb_build_object('appointment_id', _session.appointment_id, 'reason', 'pending_session')
      );
    end if;
  end if;

  select * into _next
  from public.appointment_sessions
  where appointment_id = _session.appointment_id
    and status = 'pending'
  order by session_number
  limit 1;

  if found and _next.scheduled_date is not null then
    update public.appointments
       set scheduled_date = _next.scheduled_date,
           scheduled_time = coalesce(_next.scheduled_time, scheduled_time),
           status_updated_at = now()
     where id = _session.appointment_id;
  end if;

  return jsonb_build_object(
    'session', to_jsonb(_session),
    'completed_count', _completed_count,
    'total_count', _total,
    'all_completed', (_total > 0 and _completed_count = _total),
    'financial_registered', _has_financial,
    'financial_status', case when _has_financial then _financial.status else null end
  );
end;
$function$;

revoke all on function public.set_appointment_session_completion(uuid,boolean) from public;
grant execute on function public.set_appointment_session_completion(uuid,boolean) to authenticated;

-- Edição de entrada financeira: R$ 0,00 é um valor válido.
create or replace function public.update_financial_entry_amount(_entry_id uuid, _amount numeric)
returns public.financial_entries
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _old public.financial_entries%rowtype;
  _entry public.financial_entries%rowtype;
  _fee numeric := 0;
  _net numeric := 0;
  _commission public.professional_commissions%rowtype;
  _calc record;
  _new_commission numeric := 0;
  _paid numeric := 0;
  _receivable public.accounts_receivable%rowtype;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;
  if _amount is null or _amount < 0 then
    raise exception 'Informe um valor igual ou maior que zero.';
  end if;

  select * into _old
  from public.financial_entries
  where id = _entry_id
  for update;
  if not found then
    raise exception 'Entrada financeira não encontrada.';
  end if;
  if _old.status = 'cancelled' then
    raise exception 'Entradas canceladas não podem ser editadas.';
  end if;

  if round(_amount, 2) = 0 then
    _fee := 0;
    _net := 0;
  else
    _fee := public.calculate_payment_fee(
      _old.payment_method_id,
      round(_amount, 2),
      coalesce(_old.installments, 1),
      (_old.occurred_at at time zone 'America/Fortaleza')::date
    );
    _net := round(_amount - coalesce(_fee, 0), 2);
    if _net < 0 then
      raise exception 'A taxa não pode ser maior que o valor da entrada.';
    end if;
  end if;

  select * into _commission
  from public.professional_commissions
  where financial_entry_id = _old.id and status <> 'cancelled'
  limit 1
  for update;

  if found then
    _paid := coalesce(_commission.paid_amount, 0);

    if round(_amount, 2) = 0 then
      if _paid > 0 then
        raise exception 'Não é possível zerar uma entrada cuja comissão já teve pagamento (%).', _paid;
      end if;
      update public.professional_commissions
         set base_amount = 0,
             commission_amount = 0,
             clinic_amount = 0,
             status = 'pending',
             paid_at = null,
             updated_at = now()
       where id = _commission.id;
    elsif _commission.is_manual_override then
      _new_commission := round(_commission.commission_amount, 2);
      if _new_commission > _net then
        raise exception 'A comissão manual atual é maior que o novo valor líquido.';
      end if;
      update public.professional_commissions
         set base_amount = _net,
             clinic_amount = round(_net - _new_commission, 2),
             updated_at = now()
       where id = _commission.id;
    elsif _old.professional_id is not null then
      select * into _calc
      from public.calculate_professional_commission(
        _old.professional_id,
        round(_amount, 2),
        round(_amount, 2),
        _net,
        (_old.occurred_at at time zone 'America/Fortaleza')::date
      ) limit 1;

      if found then
        _new_commission := round(coalesce(_calc.commission_amount, 0), 2);
      else
        _new_commission := 0;
      end if;

      if _new_commission < _paid then
        raise exception 'O novo valor reduziria a comissão para menos do que já foi pago (%).', _paid;
      end if;
      if _new_commission > _net then
        raise exception 'A comissão calculada é maior que o novo valor líquido.';
      end if;

      if _calc is not null then
        update public.professional_commissions
           set commission_type = _calc.commission_type,
               calculation_base = _calc.calculation_base,
               base_amount = _calc.base_amount,
               percentage = _calc.percentage,
               fixed_amount = _calc.fixed_amount,
               commission_amount = _new_commission,
               clinic_amount = round(_net - _new_commission, 2),
               status = case when _paid >= _new_commission and _new_commission > 0 then 'paid' else 'pending' end,
               paid_at = case when _paid >= _new_commission and _new_commission > 0 then coalesce(_commission.paid_at, now()) else null end,
               updated_at = now()
         where id = _commission.id;
      else
        update public.professional_commissions
           set base_amount = _net,
               commission_amount = 0,
               clinic_amount = _net,
               status = 'pending',
               paid_at = null,
               updated_at = now()
         where id = _commission.id;
      end if;
    end if;
  end if;

  update public.financial_entries
     set original_amount = round(_amount, 2),
         discount_type = null,
         discount_value = 0,
         discount_amount = 0,
         charged_amount = round(_amount, 2),
         card_fee_amount = coalesce(_fee, 0),
         net_amount = _net,
         updated_at = now()
   where id = _old.id
   returning * into _entry;

  if _old.appointment_id is not null then
    update public.appointments
       set custom_price = round(_amount, 2),
           discount_type = null,
           discount_value = 0
     where id = _old.appointment_id;
  end if;

  if _old.room_reservation_id is not null then
    update public.room_reservations
       set amount = round(_amount, 2),
           discount_type = null,
           discount_value = 0,
           updated_at = now()
     where id = _old.room_reservation_id;
  end if;

  if _old.appointment_id is not null then
    select * into _receivable
    from public.accounts_receivable
    where appointment_id = _old.appointment_id
    order by created_at desc limit 1
    for update;
  elsif _old.room_reservation_id is not null then
    select * into _receivable
    from public.accounts_receivable
    where room_reservation_id = _old.room_reservation_id
    order by created_at desc limit 1
    for update;
  end if;

  if _receivable.id is not null then
    if _receivable.status = 'pending' and coalesce(_receivable.amount_received,0) = 0 then
      update public.accounts_receivable
         set original_amount = round(_amount,2), updated_at = now()
       where id = _receivable.id;
    elsif _receivable.status = 'paid' and round(coalesce(_receivable.amount_received,0),2) = round(_old.charged_amount,2) then
      update public.accounts_receivable
         set original_amount = round(_amount,2), amount_received = round(_amount,2), updated_at = now()
       where id = _receivable.id;
    end if;
  end if;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, new_data, metadata)
  values (
    'financial_entries', _entry.id, 'update', auth.uid(), to_jsonb(_old), to_jsonb(_entry),
    jsonb_build_object('field','amount','old_amount',_old.charged_amount,'new_amount',_entry.charged_amount)
  );

  return _entry;
end;
$function$;

revoke all on function public.update_financial_entry_amount(uuid,numeric) from public;
grant execute on function public.update_financial_entry_amount(uuid,numeric) to authenticated;
