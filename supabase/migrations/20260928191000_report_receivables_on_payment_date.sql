-- Cash-basis recognition: account receivables belong to the payment date,
-- while occurred_at remains the original procedure date for clinical history.
-- No rows are updated. Preserve column shapes, RLS and existing reporting logic.
CREATE OR REPLACE VIEW public.financial_report_entries AS
 SELECT fe.id AS entry_id,
    fe.appointment_id,
    ((CASE WHEN fe.status = 'received'::text THEN COALESCE(fe.received_at, fe.occurred_at) ELSE fe.occurred_at END) AT TIME ZONE 'America/Fortaleza'::text)::date AS business_date,
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
    pm.id AS payment_method_id,
    pm.code AS payment_method_code,
    pm.name AS payment_method_name,
    cc.id AS cost_center_id,
    cc.code AS cost_center_code,
    cc.name AS cost_center_name,
    pc.id AS commission_id,
    pc.commission_type,
    pc.calculation_base,
    pc.commission_amount,
    pc.clinic_amount,
    pc.status AS commission_status,
    pc.is_manual_override,
    pc.override_reason
   FROM financial_entries fe
     LEFT JOIN payment_methods pm ON pm.id = fe.payment_method_id
     LEFT JOIN cost_centers cc ON cc.id = fe.cost_center_id
     LEFT JOIN professional_commissions pc ON pc.financial_entry_id = fe.id AND pc.status <> 'cancelled'::text;;

CREATE OR REPLACE VIEW public.financial_report_ledger AS
 SELECT 'entry'::text AS record_type,
    fe.id AS record_id,
    ((CASE WHEN fe.status = 'received'::text THEN COALESCE(fe.received_at, fe.occurred_at) ELSE fe.occurred_at END) AT TIME ZONE 'America/Fortaleza'::text)::date AS business_date,
    fe.professional_id,
    fe.professional_name_snapshot,
    fe.service_id,
    fe.service_name_snapshot,
    fe.payment_method_id,
    pm.name AS payment_method_name,
    NULL::uuid AS category_id,
    NULL::text AS category_name,
    fe.cost_center_id,
    cc.name AS cost_center_name,
    fe.status,
    fe.charged_amount AS gross_amount,
    fe.card_fee_amount AS fee_amount,
    fe.net_amount,
    COALESCE(pc.commission_amount, 0::numeric) AS commission_amount,
    COALESCE(pc.clinic_amount, fe.net_amount)::numeric AS clinic_amount,
    0::numeric AS expense_amount,
    fe.net_amount::numeric AS result_amount
   FROM financial_entries fe
     LEFT JOIN payment_methods pm ON pm.id = fe.payment_method_id
     LEFT JOIN cost_centers cc ON cc.id = fe.cost_center_id
     LEFT JOIN professional_commissions pc ON pc.financial_entry_id = fe.id AND pc.status <> 'cancelled'::text
  WHERE fe.status <> 'cancelled'::text
UNION ALL
 SELECT 'expense'::text AS record_type,
    fx.id AS record_id,
    fx.expense_date AS business_date,
    NULL::uuid AS professional_id,
    NULL::text AS professional_name_snapshot,
    NULL::uuid AS service_id,
    NULL::text AS service_name_snapshot,
    fx.payment_method_id,
    pm.name AS payment_method_name,
    fx.category_id,
    ec.name AS category_name,
    fx.cost_center_id,
    cc.name AS cost_center_name,
        CASE
            WHEN fx.paid THEN 'paid'::text
            ELSE 'pending'::text
        END AS status,
    0::numeric AS gross_amount,
    0::numeric AS fee_amount,
    0::numeric AS net_amount,
    0::numeric AS commission_amount,
    0::numeric AS clinic_amount,
    fx.amount AS expense_amount,
    - fx.amount::numeric AS result_amount
   FROM financial_expenses fx
     LEFT JOIN payment_methods pm ON pm.id = fx.payment_method_id
     LEFT JOIN expense_categories ec ON ec.id = fx.category_id
     LEFT JOIN cost_centers cc ON cc.id = fx.cost_center_id;;

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
    (coalesce((select sum(net_amount) from range_entries),0) - coalesce((select sum(amount) from range_expenses),0))::numeric
  union all select 'payable_pending', coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date>=_today),0)::numeric
  union all select 'payable_overdue', coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date<_today),0)::numeric
  union all select 'payable_due_soon', coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date between _today and _today+3),0)::numeric
  union all select 'receivable_pending', coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending'),0)::numeric
  union all select 'receivable_overdue', coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending' and due_date<_today),0)::numeric
  union all select 'receivable_due_soon', coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending' and due_date between _today and _today+3),0)::numeric;
end;
$function$
;
