create or replace function public.update_financial_expense_amount(_expense_id uuid, _amount numeric)
returns public.financial_expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  _old public.financial_expenses%rowtype;
  _expense public.financial_expenses%rowtype;
  _payment public.professional_commission_payments%rowtype;
  _commission public.professional_commissions%rowtype;
  _other_paid numeric := 0;
  _new_paid numeric := 0;
  _latest_paid_at timestamptz;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;
  if _amount is null or _amount <= 0 then
    raise exception 'Informe um valor maior que zero.';
  end if;

  select * into _old
  from public.financial_expenses
  where id = _expense_id
  for update;
  if not found then
    raise exception 'Despesa não encontrada.';
  end if;

  select * into _payment
  from public.professional_commission_payments
  where expense_id = _expense_id
  limit 1
  for update;

  if found then
    select * into _commission
    from public.professional_commissions
    where id = _payment.commission_id
    for update;
    if not found then
      raise exception 'Comissão vinculada não encontrada.';
    end if;

    select coalesce(sum(amount), 0)
      into _other_paid
    from public.professional_commission_payments
    where commission_id = _payment.commission_id
      and id <> _payment.id;

    _new_paid := round(_other_paid + _amount, 2);
    if _new_paid > round(_commission.commission_amount, 2) then
      raise exception 'O valor faria os pagamentos ultrapassarem a comissão total de %.', _commission.commission_amount;
    end if;

    update public.professional_commission_payments
       set amount = round(_amount, 2)
     where id = _payment.id;

    select max(paid_at)
      into _latest_paid_at
    from public.professional_commission_payments
    where commission_id = _payment.commission_id;

    update public.professional_commissions
       set paid_amount = _new_paid,
           status = case when _new_paid >= round(commission_amount, 2) then 'paid' else 'pending' end,
           paid_at = case when _new_paid >= round(commission_amount, 2) then coalesce(_latest_paid_at, now()) else null end,
           updated_at = now()
     where id = _payment.commission_id;
  end if;

  update public.financial_expenses
     set amount = round(_amount, 2), updated_at = now()
   where id = _expense_id
   returning * into _expense;

  if _old.account_payable_id is not null then
    update public.accounts_payable
       set amount = round(_amount, 2), updated_at = now()
     where id = _old.account_payable_id;
  end if;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, new_data, metadata)
  values (
    'financial_expenses', _expense.id, 'update', auth.uid(), to_jsonb(_old), to_jsonb(_expense),
    jsonb_build_object('field', 'amount', 'commission_payment_id', case when _payment.id is null then null else _payment.id end)
  );

  return _expense;
end;
$$;

revoke all on function public.update_financial_expense_amount(uuid, numeric) from public;
grant execute on function public.update_financial_expense_amount(uuid, numeric) to authenticated;
