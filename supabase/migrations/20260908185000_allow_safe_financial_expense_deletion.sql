create or replace function public.delete_financial_expense(_expense_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_expense public.financial_expenses%rowtype;
  v_has_commission_payment boolean;
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
    select 1 from public.professional_commission_payments p
    where p.expense_id = _expense_id
  ) into v_has_commission_payment;

  if v_has_commission_payment then
    raise exception 'Esta despesa está vinculada a um pagamento de comissão e não pode ser excluída diretamente.';
  end if;

  delete from public.cash_movements where expense_id = _expense_id;

  if v_expense.account_payable_id is not null then
    update public.accounts_payable
    set status = 'pending', paid_at = null, paid_by = null, updated_at = now()
    where id = v_expense.account_payable_id;
  end if;

  delete from public.financial_expenses where id = _expense_id;
end;
$function$;

grant execute on function public.delete_financial_expense(uuid) to authenticated;
