-- available_balance is cumulative up to _to (does not reset at month/year turnover).
CREATE OR REPLACE FUNCTION public.get_financial_dashboard(_from date DEFAULT (date_trunc('month'::text, (now() AT TIME ZONE 'America/Fortaleza'::text)))::date, _to date DEFAULT ((now() AT TIME ZONE 'America/Fortaleza'::text))::date)
 RETURNS TABLE(metric text, value numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  _today date := (now() at time zone 'America/Fortaleza')::date;
  _month_start date := date_trunc('month', (now() at time zone 'America/Fortaleza'))::date;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  return query
  with range_entries as (
    select *
    from public.financial_entries fe
    where fe.status = 'received'
      and (COALESCE(fe.received_at, fe.occurred_at) AT TIME ZONE 'America/Fortaleza')::date between _from and _to
  ),
  range_expenses as (
    select fx.*, ec.name as category_name
    from public.financial_expenses fx
    left join public.expense_categories ec on ec.id = fx.category_id
    where fx.paid = true
      and fx.expense_date between _from and _to
  ),
  range_commissions as (
    select pc.*
    from public.professional_commissions pc
    join range_entries re on re.id = pc.financial_entry_id
    where pc.status <> 'cancelled'
  ),
  today_entries as (
    select *
    from public.financial_entries fe
    where fe.status = 'received'
      and (COALESCE(fe.received_at, fe.occurred_at) AT TIME ZONE 'America/Fortaleza')::date = _today
  ),
  month_entries as (
    select *
    from public.financial_entries fe
    where fe.status = 'received'
      and (COALESCE(fe.received_at, fe.occurred_at) AT TIME ZONE 'America/Fortaleza')::date between _month_start and _today
  )
  select 'revenue'::text, coalesce((select sum(charged_amount) from range_entries),0)::numeric
  union all select 'received', coalesce((select sum(charged_amount) from range_entries),0)::numeric
  union all select 'revenue_today', coalesce((select sum(charged_amount) from today_entries),0)::numeric
  union all select 'revenue_month', coalesce((select sum(charged_amount) from month_entries),0)::numeric
  union all select 'net_revenue', coalesce((select sum(net_amount) from range_entries),0)::numeric
  union all select 'expenses', coalesce((select sum(amount) from range_expenses),0)::numeric
  union all select 'commissions', coalesce((select sum(commission_amount) from range_commissions),0)::numeric
  union all select 'clinic_result',
    (coalesce((select sum(net_amount) from range_entries),0) - coalesce((select sum(amount) from range_expenses),0))::numeric
  union all select 'available_balance',
    (coalesce((select sum(fe.net_amount) from public.financial_entries fe
                where fe.status = 'received'
                  and (COALESCE(fe.received_at, fe.occurred_at) AT TIME ZONE 'America/Fortaleza')::date <= _to),0)
     - coalesce((select sum(fx.amount) from public.financial_expenses fx
                where fx.paid = true and fx.expense_date <= _to),0))::numeric
  union all select 'payable_pending', coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date>=_today),0)::numeric
  union all select 'payable_overdue', coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date<_today),0)::numeric
  union all select 'payable_due_soon', coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date between _today and _today+3),0)::numeric
  union all select 'receivable_pending', coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending'),0)::numeric
  union all select 'receivable_overdue', coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending' and due_date<_today),0)::numeric
  union all select 'receivable_due_soon', coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending' and due_date between _today and _today+3),0)::numeric;
end;
$function$
;
