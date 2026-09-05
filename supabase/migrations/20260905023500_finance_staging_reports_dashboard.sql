-- Finance staging: RLS-aware reporting views and dashboard metrics.

-- These views predate some staging-only columns. Recreate them so the
-- expanded column list is deterministic after schema evolution.
drop view if exists public.accounts_payable_with_status;
drop view if exists public.accounts_receivable_with_status;
drop view if exists public.payment_totals_current_month;

create view public.accounts_payable_with_status
with (security_invoker = true)
as
select ap.*,
  case
    when ap.status = 'pending' and ap.due_date < (now() at time zone 'America/Fortaleza')::date then 'overdue'
    else ap.status
  end as display_status
from public.accounts_payable ap;

create view public.accounts_receivable_with_status
with (security_invoker = true)
as
select ar.*,
  case
    when ar.status = 'pending' and ar.due_date < (now() at time zone 'America/Fortaleza')::date then 'overdue'
    else ar.status
  end as display_status
from public.accounts_receivable ar;

create view public.payment_totals_current_month
with (security_invoker = true)
as
select pm.code, pm.name,
       coalesce(sum(fe.charged_amount) filter (where fe.status='received'),0)::numeric(14,2) as received_total,
       coalesce(sum(fe.charged_amount) filter (where fe.status in ('received','pending')),0)::numeric(14,2) as billed_total
from public.payment_methods pm
left join public.financial_entries fe
  on fe.payment_method_id=pm.id
 and fe.status not in ('cancelled','refunded')
 and date_trunc('month',fe.occurred_at at time zone 'America/Fortaleza') = date_trunc('month',now() at time zone 'America/Fortaleza')
where pm.is_active=true
group by pm.id,pm.code,pm.name,pm.sort_order
order by pm.sort_order,pm.name;

create or replace view public.financial_report_entries
with (security_invoker = true)
as
select
  fe.id as entry_id,
  fe.appointment_id,
  (fe.occurred_at at time zone 'America/Fortaleza')::date as business_date,
  fe.occurred_at,
  fe.received_at,
  fe.client_id,
  fe.patient_name_snapshot,
  fe.professional_id,
  fe.professional_name_snapshot,
  fe.service_id,
  fe.service_name_snapshot,
  fe.original_amount,
  fe.discount_type,
  fe.discount_value,
  fe.discount_amount,
  fe.charged_amount,
  fe.card_fee_amount,
  fe.net_amount,
  fe.installments,
  fe.status,
  fe.source,
  pm.id as payment_method_id,
  pm.code as payment_method_code,
  pm.name as payment_method_name,
  cc.id as cost_center_id,
  cc.code as cost_center_code,
  cc.name as cost_center_name,
  pc.id as commission_id,
  pc.commission_type,
  pc.calculation_base,
  pc.commission_amount,
  pc.clinic_amount,
  pc.status as commission_status,
  pc.is_manual_override,
  pc.override_reason
from public.financial_entries fe
left join public.payment_methods pm on pm.id=fe.payment_method_id
left join public.cost_centers cc on cc.id=fe.cost_center_id
left join public.professional_commissions pc on pc.financial_entry_id=fe.id and pc.status <> 'cancelled';

create or replace view public.financial_report_expenses
with (security_invoker = true)
as
select
  fx.id as expense_id,
  fx.expense_date,
  fx.description,
  fx.amount,
  fx.paid,
  fx.paid_at,
  fx.account_payable_id,
  ec.id as category_id,
  ec.name as category_name,
  cc.id as cost_center_id,
  cc.code as cost_center_code,
  cc.name as cost_center_name,
  pm.id as payment_method_id,
  pm.code as payment_method_code,
  pm.name as payment_method_name,
  fx.notes
from public.financial_expenses fx
left join public.expense_categories ec on ec.id=fx.category_id
left join public.cost_centers cc on cc.id=fx.cost_center_id
left join public.payment_methods pm on pm.id=fx.payment_method_id;

create or replace function public.get_financial_dashboard(
  _from date default date_trunc('month',(now() at time zone 'America/Fortaleza'))::date,
  _to date default (now() at time zone 'America/Fortaleza')::date
)
returns table(metric text,value numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with range_entries as (
    select *
    from public.financial_entries fe
    where fe.status in ('received','pending')
      and (fe.occurred_at at time zone 'America/Fortaleza')::date between _from and _to
  ),
  received_entries as (
    select * from range_entries where status='received'
  ),
  range_expenses as (
    select * from public.financial_expenses fx
    where fx.paid=true and fx.expense_date between _from and _to
  ),
  range_commissions as (
    select pc.*
    from public.professional_commissions pc
    join range_entries re on re.id=pc.financial_entry_id
    where pc.status <> 'cancelled'
  ),
  today_entries as (
    select * from public.financial_entries fe
    where fe.status in ('received','pending')
      and (fe.occurred_at at time zone 'America/Fortaleza')::date = (now() at time zone 'America/Fortaleza')::date
  ),
  paid_commissions as (
    select pc.*
    from public.professional_commissions pc
    join received_entries re on re.id=pc.financial_entry_id
    where pc.status='paid'
  )
  select 'revenue'::text,coalesce((select sum(charged_amount) from range_entries),0)::numeric
  union all select 'received',coalesce((select sum(charged_amount) from received_entries),0)::numeric
  union all select 'revenue_today',coalesce((select sum(charged_amount) from today_entries),0)::numeric
  union all select 'net_revenue',coalesce((select sum(net_amount) from range_entries),0)::numeric
  union all select 'expenses',coalesce((select sum(amount) from range_expenses),0)::numeric
  union all select 'commissions',coalesce((select sum(commission_amount) from range_commissions),0)::numeric
  union all select 'clinic_result',(
    coalesce((select sum(net_amount) from range_entries),0)
    - coalesce((select sum(commission_amount) from range_commissions),0)
    - coalesce((select sum(amount) from range_expenses),0)
  )::numeric
  union all select 'available_balance',(
    coalesce((select sum(net_amount) from received_entries),0)
    - coalesce((select sum(amount) from range_expenses),0)
    - coalesce((select sum(commission_amount) from paid_commissions),0)
  )::numeric
  union all select 'payable_pending',coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date >= (now() at time zone 'America/Fortaleza')::date),0)::numeric
  union all select 'payable_overdue',coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date < (now() at time zone 'America/Fortaleza')::date),0)::numeric
  union all select 'receivable_pending',coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending'),0)::numeric
  union all select 'receivable_overdue',coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending' and due_date < (now() at time zone 'America/Fortaleza')::date),0)::numeric;
$$;

revoke all on function public.get_financial_dashboard(date,date) from public,anon;
grant execute on function public.get_financial_dashboard(date,date) to authenticated;
