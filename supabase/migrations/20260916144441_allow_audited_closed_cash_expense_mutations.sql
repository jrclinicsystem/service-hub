-- Allow expense edits/deletions that affect a closed cash session only through audited admin RPCs.
-- Raw closed-cash movements remain protected unless the RPC sets a transaction-local override for the exact expense.

create or replace function public.finance_guard_cash_movement_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session_id uuid;
  v_status text;
  v_override_expense_id text;
  v_expense_id uuid;
begin
  v_session_id := case when tg_op = 'DELETE' then old.cash_session_id else new.cash_session_id end;
  v_expense_id := case when tg_op = 'DELETE' then old.expense_id else new.expense_id end;

  select cs.status into v_status
  from public.cash_sessions cs
  where cs.id = v_session_id;

  if v_status is null then
    raise exception 'Caixa não encontrado.';
  end if;

  if v_status <> 'open' then
    v_override_expense_id := current_setting('app.closed_cash_expense_mutation_id', true);

    if tg_op in ('UPDATE', 'DELETE')
       and v_expense_id is not null
       and v_override_expense_id = v_expense_id::text
       and public.finance_has_role(array['admin']) then
      return case when tg_op = 'DELETE' then old else new end;
    end if;

    raise exception 'Movimentos de um caixa fechado não podem ser alterados diretamente.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create or replace function public.delete_financial_expense(_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expense public.financial_expenses%rowtype;
  v_has_commission_payment boolean;
  v_cash_movement public.cash_movements%rowtype;
  v_cash_status text;
  v_before record;
  v_after record;
  v_actor_label text;
  v_correction_id uuid;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  select * into v_expense
  from public.financial_expenses
  where id = _expense_id
  for update;

  if not found then
    raise exception 'Despesa não encontrada.';
  end if;

  select exists(
    select 1
    from public.professional_commission_payments p
    where p.expense_id = _expense_id
  ) into v_has_commission_payment;

  if v_has_commission_payment then
    raise exception 'Esta despesa está vinculada a um pagamento de comissão e não pode ser excluída diretamente.';
  end if;

  select cm.* into v_cash_movement
  from public.cash_movements cm
  where cm.expense_id = _expense_id
  order by cm.created_at desc
  limit 1;

  if v_cash_movement.id is not null then
    select cs.status into v_cash_status
    from public.cash_sessions cs
    where cs.id = v_cash_movement.cash_session_id;
  end if;

  if v_cash_movement.id is not null and v_cash_status = 'closed' then
    if not public.finance_has_role(array['admin']) then
      raise exception 'Somente administradores podem excluir uma despesa vinculada a um caixa já fechado.' using errcode = '42501';
    end if;

    select * into v_before
    from public.financial_cash_report
    where cash_session_id = v_cash_movement.cash_session_id;

    perform set_config('app.closed_cash_expense_mutation_id', _expense_id::text, true);
  end if;

  delete from public.cash_movements
  where expense_id = _expense_id;

  perform set_config('app.closed_cash_expense_mutation_id', '', true);

  if v_expense.account_payable_id is not null then
    update public.accounts_payable
    set status = 'pending',
        paid_at = null,
        paid_by = null,
        updated_at = now()
    where id = v_expense.account_payable_id;
  end if;

  delete from public.financial_expenses
  where id = _expense_id;

  if v_cash_movement.id is not null and v_cash_status = 'closed' then
    select * into v_after
    from public.financial_cash_report
    where cash_session_id = v_cash_movement.cash_session_id;

    v_actor_label := coalesce(nullif(auth.jwt() ->> 'email', ''), auth.uid()::text);

    insert into public.cash_session_corrections(
      cash_session_id,
      corrected_counted_cash,
      corrected_note,
      reason,
      created_by,
      previous_opening_cash,
      corrected_opening_cash,
      previous_counted_cash,
      previous_expected_cash,
      corrected_expected_cash,
      previous_difference_amount,
      corrected_difference_amount,
      previous_note,
      actor_label
    ) values (
      v_cash_movement.cash_session_id,
      coalesce(v_after.counted_cash, v_before.counted_cash, v_after.expected_cash, 0),
      v_after.closing_note,
      'Exclusão de despesa em caixa fechado: ' || v_expense.description || ' (' || to_char(v_expense.amount, 'FM999999990D00') || ')',
      auth.uid(),
      v_before.opening_cash,
      v_after.opening_cash,
      v_before.counted_cash,
      v_before.expected_cash,
      v_after.expected_cash,
      v_before.difference_amount,
      v_after.difference_amount,
      v_before.closing_note,
      v_actor_label
    ) returning id into v_correction_id;

    insert into public.financial_audit_log(
      entity_type, entity_id, action, actor_id, old_data, new_data, metadata
    ) values (
      'cash_sessions',
      v_cash_movement.cash_session_id,
      'override',
      auth.uid(),
      jsonb_build_object(
        'opening_cash', v_before.opening_cash,
        'expected_cash', v_before.expected_cash,
        'counted_cash', v_before.counted_cash,
        'difference_amount', v_before.difference_amount
      ),
      jsonb_build_object(
        'opening_cash', v_after.opening_cash,
        'expected_cash', v_after.expected_cash,
        'counted_cash', v_after.counted_cash,
        'difference_amount', v_after.difference_amount
      ),
      jsonb_build_object(
        'kind', 'closed_cash_expense_delete',
        'expense_id', _expense_id,
        'expense_description', v_expense.description,
        'expense_amount', v_expense.amount,
        'correction_id', v_correction_id,
        'actor_label', v_actor_label
      )
    );
  end if;
end;
$function$;

revoke all on function public.delete_financial_expense(uuid) from public;
grant execute on function public.delete_financial_expense(uuid) to authenticated;

create or replace function public.update_financial_expense_amount(_expense_id uuid, _amount numeric)
returns public.financial_expenses
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old public.financial_expenses%rowtype;
  v_expense public.financial_expenses%rowtype;
  v_payment public.professional_commission_payments%rowtype;
  v_commission public.professional_commissions%rowtype;
  v_other_paid numeric := 0;
  v_new_paid numeric := 0;
  v_latest_paid_at timestamptz;
  v_cash_movement public.cash_movements%rowtype;
  v_cash_status text;
  v_before record;
  v_after record;
  v_actor_label text;
  v_correction_id uuid;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;
  if _amount is null or _amount <= 0 then
    raise exception 'Informe um valor maior que zero.';
  end if;

  select * into v_old
  from public.financial_expenses
  where id = _expense_id
  for update;
  if not found then
    raise exception 'Despesa não encontrada.';
  end if;

  select cm.* into v_cash_movement
  from public.cash_movements cm
  where cm.expense_id = _expense_id
  order by cm.created_at desc
  limit 1;

  if v_cash_movement.id is not null then
    select cs.status into v_cash_status
    from public.cash_sessions cs
    where cs.id = v_cash_movement.cash_session_id;
  end if;

  if v_cash_movement.id is not null and v_cash_status = 'closed' then
    if not public.finance_has_role(array['admin']) then
      raise exception 'Somente administradores podem editar uma despesa vinculada a um caixa já fechado.' using errcode = '42501';
    end if;

    select * into v_before
    from public.financial_cash_report
    where cash_session_id = v_cash_movement.cash_session_id;

    perform set_config('app.closed_cash_expense_mutation_id', _expense_id::text, true);
  end if;

  select * into v_payment
  from public.professional_commission_payments
  where expense_id = _expense_id
  limit 1
  for update;

  if found then
    select * into v_commission
    from public.professional_commissions
    where id = v_payment.commission_id
    for update;
    if not found then
      raise exception 'Comissão vinculada não encontrada.';
    end if;

    select coalesce(sum(amount), 0)
      into v_other_paid
    from public.professional_commission_payments
    where commission_id = v_payment.commission_id
      and id <> v_payment.id;

    v_new_paid := round(v_other_paid + _amount, 2);
    if v_new_paid > round(v_commission.commission_amount, 2) then
      raise exception 'O valor faria os pagamentos ultrapassarem a comissão total de %.', v_commission.commission_amount;
    end if;

    update public.professional_commission_payments
       set amount = round(_amount, 2)
     where id = v_payment.id;

    select max(paid_at)
      into v_latest_paid_at
    from public.professional_commission_payments
    where commission_id = v_payment.commission_id;

    update public.professional_commissions
       set paid_amount = v_new_paid,
           status = case when v_new_paid >= round(commission_amount, 2) then 'paid' else 'pending' end,
           paid_at = case when v_new_paid >= round(commission_amount, 2) then coalesce(v_latest_paid_at, now()) else null end,
           updated_at = now()
     where id = v_payment.commission_id;
  end if;

  update public.financial_expenses
     set amount = round(_amount, 2), updated_at = now()
   where id = _expense_id
   returning * into v_expense;

  perform set_config('app.closed_cash_expense_mutation_id', '', true);

  if v_old.account_payable_id is not null then
    update public.accounts_payable
       set amount = round(_amount, 2), updated_at = now()
     where id = v_old.account_payable_id;
  end if;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, new_data, metadata)
  values (
    'financial_expenses', v_expense.id, 'update', auth.uid(), to_jsonb(v_old), to_jsonb(v_expense),
    jsonb_build_object('field', 'amount', 'commission_payment_id', case when v_payment.id is null then null else v_payment.id end)
  );

  if v_cash_movement.id is not null and v_cash_status = 'closed' then
    select * into v_after
    from public.financial_cash_report
    where cash_session_id = v_cash_movement.cash_session_id;

    v_actor_label := coalesce(nullif(auth.jwt() ->> 'email', ''), auth.uid()::text);

    insert into public.cash_session_corrections(
      cash_session_id,
      corrected_counted_cash,
      corrected_note,
      reason,
      created_by,
      previous_opening_cash,
      corrected_opening_cash,
      previous_counted_cash,
      previous_expected_cash,
      corrected_expected_cash,
      previous_difference_amount,
      corrected_difference_amount,
      previous_note,
      actor_label
    ) values (
      v_cash_movement.cash_session_id,
      coalesce(v_after.counted_cash, v_before.counted_cash, v_after.expected_cash, 0),
      v_after.closing_note,
      'Edição de despesa em caixa fechado: ' || v_old.description || ' (' || to_char(v_old.amount, 'FM999999990D00') || ' → ' || to_char(v_expense.amount, 'FM999999990D00') || ')',
      auth.uid(),
      v_before.opening_cash,
      v_after.opening_cash,
      v_before.counted_cash,
      v_before.expected_cash,
      v_after.expected_cash,
      v_before.difference_amount,
      v_after.difference_amount,
      v_before.closing_note,
      v_actor_label
    ) returning id into v_correction_id;

    insert into public.financial_audit_log(
      entity_type, entity_id, action, actor_id, old_data, new_data, metadata
    ) values (
      'cash_sessions',
      v_cash_movement.cash_session_id,
      'override',
      auth.uid(),
      jsonb_build_object(
        'opening_cash', v_before.opening_cash,
        'expected_cash', v_before.expected_cash,
        'counted_cash', v_before.counted_cash,
        'difference_amount', v_before.difference_amount
      ),
      jsonb_build_object(
        'opening_cash', v_after.opening_cash,
        'expected_cash', v_after.expected_cash,
        'counted_cash', v_after.counted_cash,
        'difference_amount', v_after.difference_amount
      ),
      jsonb_build_object(
        'kind', 'closed_cash_expense_edit',
        'expense_id', _expense_id,
        'old_amount', v_old.amount,
        'new_amount', v_expense.amount,
        'correction_id', v_correction_id,
        'actor_label', v_actor_label
      )
    );
  end if;

  return v_expense;
end;
$function$;

revoke all on function public.update_financial_expense_amount(uuid, numeric) from public;
grant execute on function public.update_financial_expense_amount(uuid, numeric) to authenticated;
