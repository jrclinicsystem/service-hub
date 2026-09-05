-- Security hardening for finance staging RPCs.

revoke execute on function public.register_attended_financial_entry(uuid,uuid,uuid,uuid,text,text,text,numeric,text,integer,text,numeric,text,numeric,text,timestamptz,boolean) from authenticated;
grant execute on function public.register_attended_financial_entry(uuid,uuid,uuid,uuid,text,text,text,numeric,text,integer,text,numeric,text,numeric,text,timestamptz,boolean) to service_role;

create or replace function public.get_financial_dashboard(
  _from date default date_trunc('month',(now() at time zone 'America/Fortaleza'))::date,
  _to date default (now() at time zone 'America/Fortaleza')::date
)
returns table(metric text, value numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente';
  end if;

  return query
  with range_entries as (
    select * from public.financial_entries
    where status='received'
      and (occurred_at at time zone 'America/Fortaleza')::date between _from and _to
  ), range_expenses as (
    select * from public.financial_expenses
    where paid=true and expense_date between _from and _to
  ), range_commissions as (
    select pc.*
    from public.professional_commissions pc
    join range_entries re on re.id=pc.financial_entry_id
    where pc.status <> 'cancelled'
  )
  select 'revenue'::text, coalesce((select sum(charged_amount) from range_entries),0)::numeric
  union all select 'net_revenue', coalesce((select sum(net_amount) from range_entries),0)::numeric
  union all select 'expenses', coalesce((select sum(amount) from range_expenses),0)::numeric
  union all select 'commissions', coalesce((select sum(commission_amount) from range_commissions),0)::numeric
  union all select 'clinic_result', (
    coalesce((select sum(net_amount) from range_entries),0)
    - coalesce((select sum(commission_amount) from range_commissions),0)
    - coalesce((select sum(amount) from range_expenses),0)
  )::numeric
  union all select 'payable_pending', coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date >= current_date),0)::numeric
  union all select 'payable_overdue', coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date < current_date),0)::numeric
  union all select 'receivable_pending', coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending'),0)::numeric;
end;
$$;

revoke all on function public.get_financial_dashboard(date,date) from public;
grant execute on function public.get_financial_dashboard(date,date) to authenticated;

-- Views are not exposed directly to anon.
revoke all on public.payment_totals_current_month from anon;
