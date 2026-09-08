-- Evita descontar pagamentos de comissão duas vezes no resultado financeiro.
-- A comissão já reduz a parte da clínica no lançamento de receita.
-- O pagamento da comissão continua registrado em Despesas para controle de caixa,
-- mas não reduz novamente o resultado contábil da clínica.

create or replace view public.financial_report_ledger as
select
  'entry'::text as record_type,
  fe.id as record_id,
  (fe.occurred_at at time zone 'America/Fortaleza')::date as business_date,
  fe.professional_id,
  fe.professional_name_snapshot,
  fe.service_id,
  fe.service_name_snapshot,
  fe.payment_method_id,
  pm.name as payment_method_name,
  null::uuid as category_id,
  null::text as category_name,
  fe.cost_center_id,
  cc.name as cost_center_name,
  fe.status,
  fe.charged_amount as gross_amount,
  fe.card_fee_amount as fee_amount,
  fe.net_amount,
  coalesce(pc.commission_amount, 0::numeric) as commission_amount,
  coalesce(pc.clinic_amount, fe.net_amount)::numeric as clinic_amount,
  0::numeric as expense_amount,
  coalesce(pc.clinic_amount, fe.net_amount)::numeric as result_amount
from public.financial_entries fe
left join public.payment_methods pm on pm.id = fe.payment_method_id
left join public.cost_centers cc on cc.id = fe.cost_center_id
left join public.professional_commissions pc
  on pc.financial_entry_id = fe.id
 and pc.status <> 'cancelled'
where fe.status <> 'cancelled'

union all

select
  'expense'::text as record_type,
  fx.id as record_id,
  fx.expense_date as business_date,
  null::uuid as professional_id,
  null::text as professional_name_snapshot,
  null::uuid as service_id,
  null::text as service_name_snapshot,
  fx.payment_method_id,
  pm.name as payment_method_name,
  fx.category_id,
  ec.name as category_name,
  fx.cost_center_id,
  cc.name as cost_center_name,
  case when fx.paid then 'paid'::text else 'pending'::text end as status,
  0::numeric as gross_amount,
  0::numeric as fee_amount,
  0::numeric as net_amount,
  0::numeric as commission_amount,
  0::numeric as clinic_amount,
  fx.amount as expense_amount,
  case when ec.name = 'Comissões' then 0::numeric else -fx.amount end as result_amount
from public.financial_expenses fx
left join public.payment_methods pm on pm.id = fx.payment_method_id
left join public.expense_categories ec on ec.id = fx.category_id
left join public.cost_centers cc on cc.id = fx.cost_center_id;

create or replace function public.get_financial_dashboard(
  _from date default date_trunc('month', now() at time zone 'America/Fortaleza')::date,
  _to date default (now() at time zone 'America/Fortaleza')::date
)
returns table(metric text, value numeric)
language plpgsql
stable
set search_path to 'public'
as $function$
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
    where fe.status in ('received','pending')
      and (fe.occurred_at at time zone 'America/Fortaleza')::date between _from and _to
  ),
  received_entries as (
    select * from range_entries where status = 'received'
  ),
  range_expenses as (
    select fx.*, ec.name as category_name
    from public.financial_expenses fx
    left join public.expense_categories ec on ec.id = fx.category_id
    where fx.paid = true
      and fx.expense_date between _from and _to
  ),
  operational_expenses as (
    select *
    from range_expenses
    where coalesce(category_name, '') <> 'Comissões'
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
    where fe.status in ('received','pending')
      and (fe.occurred_at at time zone 'America/Fortaleza')::date = _today
  ),
  month_entries as (
    select *
    from public.financial_entries fe
    where fe.status in ('received','pending')
      and (fe.occurred_at at time zone 'America/Fortaleza')::date between _month_start and _today
  )
  select 'revenue'::text, coalesce((select sum(charged_amount) from range_entries),0)::numeric
  union all select 'received', coalesce((select sum(charged_amount) from received_entries),0)::numeric
  union all select 'revenue_today', coalesce((select sum(charged_amount) from today_entries),0)::numeric
  union all select 'revenue_month', coalesce((select sum(charged_amount) from month_entries),0)::numeric
  union all select 'net_revenue', coalesce((select sum(net_amount) from range_entries),0)::numeric
  union all select 'expenses', coalesce((select sum(amount) from range_expenses),0)::numeric
  union all select 'commissions', coalesce((select sum(commission_amount) from range_commissions),0)::numeric
  union all select 'clinic_result',
    (
      coalesce((select sum(net_amount) from range_entries),0)
      - coalesce((select sum(commission_amount) from range_commissions),0)
      - coalesce((select sum(amount) from operational_expenses),0)
    )::numeric
  union all select 'available_balance',
    (
      coalesce((select sum(net_amount) from received_entries),0)
      - coalesce((select sum(amount) from range_expenses),0)
    )::numeric
  union all select 'payable_pending', coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date>=_today),0)::numeric
  union all select 'payable_overdue', coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date<_today),0)::numeric
  union all select 'payable_due_soon', coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date between _today and _today+3),0)::numeric
  union all select 'receivable_pending', coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending'),0)::numeric
  union all select 'receivable_overdue', coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending' and due_date<_today),0)::numeric
  union all select 'receivable_due_soon', coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending' and due_date between _today and _today+3),0)::numeric;
end;
$function$;

create or replace function public.get_financial_report_breakdowns(
  _from date,
  _to date,
  _professional_id uuid default null,
  _service_id uuid default null,
  _payment_method_id uuid default null,
  _expense_category_id uuid default null,
  _cost_center_id uuid default null,
  _status text default null
)
returns table(
  section text,
  report_key text,
  label text,
  quantity bigint,
  gross_amount numeric,
  fee_amount numeric,
  net_amount numeric,
  commission_amount numeric,
  clinic_amount numeric,
  expense_amount numeric,
  result_amount numeric
)
language plpgsql
stable
set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;
  if _from is null or _to is null or _from > _to then
    raise exception 'Período inválido.';
  end if;

  return query
  with filtered as (
    select l.*
    from public.financial_report_ledger l
    where l.business_date between _from and _to
      and (_professional_id is null or (l.record_type='entry' and l.professional_id=_professional_id))
      and (_service_id is null or (l.record_type='entry' and l.service_id=_service_id))
      and (_payment_method_id is null or l.payment_method_id=_payment_method_id)
      and (_expense_category_id is null or (l.record_type='expense' and l.category_id=_expense_category_id))
      and (_cost_center_id is null or l.cost_center_id=_cost_center_id)
      and (_status is null or l.status=_status)
  ),
  grouped as (
    select 'day'::text section, to_char(f.business_date,'YYYY-MM-DD') report_key, to_char(f.business_date,'DD/MM/YYYY') label,
      count(*)::bigint quantity, coalesce(sum(f.gross_amount),0)::numeric gross_amount, coalesce(sum(f.fee_amount),0)::numeric fee_amount,
      coalesce(sum(f.net_amount),0)::numeric net_amount, coalesce(sum(f.commission_amount),0)::numeric commission_amount,
      coalesce(sum(f.clinic_amount),0)::numeric clinic_amount, coalesce(sum(f.expense_amount),0)::numeric expense_amount,
      coalesce(sum(f.result_amount),0)::numeric result_amount
    from filtered f group by f.business_date
    union all
    select 'week', to_char(date_trunc('week',f.business_date)::date,'YYYY-MM-DD'), 'Semana de '||to_char(date_trunc('week',f.business_date)::date,'DD/MM/YYYY'),
      count(*)::bigint, coalesce(sum(f.gross_amount),0)::numeric, coalesce(sum(f.fee_amount),0)::numeric, coalesce(sum(f.net_amount),0)::numeric,
      coalesce(sum(f.commission_amount),0)::numeric, coalesce(sum(f.clinic_amount),0)::numeric, coalesce(sum(f.expense_amount),0)::numeric,
      coalesce(sum(f.result_amount),0)::numeric
    from filtered f group by date_trunc('week',f.business_date)::date
    union all
    select 'fortnight', to_char(date_trunc('month',f.business_date)::date,'YYYY-MM')||case when extract(day from f.business_date)<=15 then '-1' else '-2' end,
      case when extract(day from f.business_date)<=15 then '1ª quinzena de ' else '2ª quinzena de ' end||to_char(f.business_date,'MM/YYYY'),
      count(*)::bigint, coalesce(sum(f.gross_amount),0)::numeric, coalesce(sum(f.fee_amount),0)::numeric, coalesce(sum(f.net_amount),0)::numeric,
      coalesce(sum(f.commission_amount),0)::numeric, coalesce(sum(f.clinic_amount),0)::numeric, coalesce(sum(f.expense_amount),0)::numeric,
      coalesce(sum(f.result_amount),0)::numeric
    from filtered f
    group by date_trunc('month',f.business_date)::date, case when extract(day from f.business_date)<=15 then 1 else 2 end,
      to_char(f.business_date,'MM/YYYY'), extract(day from f.business_date)<=15
    union all
    select 'month', to_char(date_trunc('month',f.business_date)::date,'YYYY-MM'), to_char(f.business_date,'MM/YYYY'),
      count(*)::bigint, coalesce(sum(f.gross_amount),0)::numeric, coalesce(sum(f.fee_amount),0)::numeric, coalesce(sum(f.net_amount),0)::numeric,
      coalesce(sum(f.commission_amount),0)::numeric, coalesce(sum(f.clinic_amount),0)::numeric, coalesce(sum(f.expense_amount),0)::numeric,
      coalesce(sum(f.result_amount),0)::numeric
    from filtered f group by date_trunc('month',f.business_date)::date,to_char(f.business_date,'MM/YYYY')
    union all
    select 'professional', coalesce(f.professional_id::text,'sem-profissional'), coalesce(f.professional_name_snapshot,'Sem profissional'),
      count(*)::bigint, coalesce(sum(f.gross_amount),0)::numeric, coalesce(sum(f.fee_amount),0)::numeric, coalesce(sum(f.net_amount),0)::numeric,
      coalesce(sum(f.commission_amount),0)::numeric, coalesce(sum(f.clinic_amount),0)::numeric, 0::numeric, coalesce(sum(f.clinic_amount),0)::numeric
    from filtered f where f.record_type='entry' group by f.professional_id,f.professional_name_snapshot
    union all
    select 'service', coalesce(f.service_id::text,'sem-servico'), coalesce(f.service_name_snapshot,'Sem serviço'),
      count(*)::bigint, coalesce(sum(f.gross_amount),0)::numeric, coalesce(sum(f.fee_amount),0)::numeric, coalesce(sum(f.net_amount),0)::numeric,
      coalesce(sum(f.commission_amount),0)::numeric, coalesce(sum(f.clinic_amount),0)::numeric, 0::numeric, coalesce(sum(f.clinic_amount),0)::numeric
    from filtered f where f.record_type='entry' group by f.service_id,f.service_name_snapshot
    union all
    select 'payment_method', coalesce(f.payment_method_id::text,'sem-forma'), coalesce(f.payment_method_name,'Sem forma de pagamento'),
      count(*)::bigint, coalesce(sum(f.gross_amount),0)::numeric, coalesce(sum(f.fee_amount),0)::numeric, coalesce(sum(f.net_amount),0)::numeric,
      coalesce(sum(f.commission_amount),0)::numeric, coalesce(sum(f.clinic_amount),0)::numeric, coalesce(sum(f.expense_amount),0)::numeric,
      coalesce(sum(f.result_amount),0)::numeric
    from filtered f group by f.payment_method_id,f.payment_method_name
    union all
    select 'expense_category', coalesce(f.category_id::text,'sem-categoria'), coalesce(f.category_name,'Sem categoria'),
      count(*)::bigint, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, coalesce(sum(f.expense_amount),0)::numeric,
      coalesce(sum(f.result_amount),0)::numeric
    from filtered f where f.record_type='expense' group by f.category_id,f.category_name
    union all
    select 'cost_center', coalesce(f.cost_center_id::text,'sem-centro'), coalesce(f.cost_center_name,'Sem centro de custo'),
      count(*)::bigint, coalesce(sum(f.gross_amount),0)::numeric, coalesce(sum(f.fee_amount),0)::numeric, coalesce(sum(f.net_amount),0)::numeric,
      coalesce(sum(f.commission_amount),0)::numeric, coalesce(sum(f.clinic_amount),0)::numeric, coalesce(sum(f.expense_amount),0)::numeric,
      coalesce(sum(f.result_amount),0)::numeric
    from filtered f group by f.cost_center_id,f.cost_center_name
  )
  select g.section,g.report_key,g.label,g.quantity,g.gross_amount,g.fee_amount,g.net_amount,g.commission_amount,g.clinic_amount,g.expense_amount,g.result_amount
  from grouped g
  order by g.section,g.report_key;
end;
$function$;
