-- Integra o resultado financeiro em dinheiro com abertura/fechamento de caixa.
-- O relatório de caixa passa a refletir os movimentos reais em tempo real,
-- inclusive enquanto o caixa ainda está aberto.

create or replace view public.financial_cash_report as
with movement_totals as (
  select
    cm.cash_session_id,
    round(coalesce(sum(case when cm.movement_type = 'income' and pm.code = 'cash' then cm.amount else 0 end), 0), 2)::numeric(12,2) as total_cash,
    round(coalesce(sum(case when cm.movement_type = 'income' and pm.code = 'pix' then cm.amount else 0 end), 0), 2)::numeric(12,2) as total_pix,
    round(coalesce(sum(case when cm.movement_type = 'income' and pm.code = 'pix_machine' then cm.amount else 0 end), 0), 2)::numeric(12,2) as total_pix_machine,
    round(coalesce(sum(case when cm.movement_type = 'income' and pm.code = 'debit' then cm.amount else 0 end), 0), 2)::numeric(12,2) as total_debit,
    round(coalesce(sum(case when cm.movement_type = 'income' and pm.code = 'credit' then cm.amount else 0 end), 0), 2)::numeric(12,2) as total_credit,
    round(coalesce(sum(case when cm.movement_type = 'income' and pm.code = 'payment_link' then cm.amount else 0 end), 0), 2)::numeric(12,2) as total_link,
    round(coalesce(sum(case when cm.movement_type = 'income' then cm.amount else 0 end), 0), 2)::numeric as total_received,
    round(coalesce(sum(case when cm.movement_type = 'expense' and pm.code = 'cash' then cm.amount else 0 end), 0), 2)::numeric(12,2) as total_cash_expenses
  from public.cash_movements cm
  left join public.payment_methods pm on pm.id = cm.payment_method_id
  group by cm.cash_session_id
), latest_correction as (
  select distinct on (x.cash_session_id)
    x.id,
    x.cash_session_id,
    x.corrected_counted_cash,
    x.corrected_note,
    x.reason,
    x.created_by,
    x.created_at
  from public.cash_session_corrections x
  order by x.cash_session_id, x.created_at desc, x.id desc
)
select
  cs.id as cash_session_id,
  cs.business_date,
  cs.status,
  cs.opened_by,
  cs.opened_by_label,
  cs.opened_at,
  cs.closed_by,
  cs.closed_by_label,
  cs.closed_at,
  cs.opening_cash,
  coalesce(mt.total_cash, cs.total_cash, 0)::numeric(12,2) as total_cash,
  coalesce(mt.total_pix, cs.total_pix, 0)::numeric(12,2) as total_pix,
  coalesce(mt.total_debit, cs.total_debit, 0)::numeric(12,2) as total_debit,
  coalesce(mt.total_credit, cs.total_credit, 0)::numeric(12,2) as total_credit,
  coalesce(mt.total_link, cs.total_link, 0)::numeric(12,2) as total_link,
  (coalesce(mt.total_debit, cs.total_debit, 0) + coalesce(mt.total_credit, cs.total_credit, 0))::numeric as total_card,
  coalesce(
    mt.total_received,
    coalesce(cs.total_cash,0) + coalesce(cs.total_pix,0) + coalesce(cs.total_debit,0) + coalesce(cs.total_credit,0) + coalesce(cs.total_link,0),
    0
  )::numeric as total_received,
  coalesce(mt.total_cash_expenses, cs.total_cash_expenses, 0)::numeric(12,2) as total_cash_expenses,
  round(
    coalesce(cs.opening_cash,0) + coalesce(mt.total_cash, cs.total_cash, 0) - coalesce(mt.total_cash_expenses, cs.total_cash_expenses, 0),
    2
  )::numeric(12,2) as expected_cash,
  coalesce(c.corrected_counted_cash, cs.counted_cash)::numeric(12,2) as counted_cash,
  case
    when coalesce(c.corrected_counted_cash, cs.counted_cash) is null then null
    else round(
      coalesce(c.corrected_counted_cash, cs.counted_cash)
      - (coalesce(cs.opening_cash,0) + coalesce(mt.total_cash, cs.total_cash, 0) - coalesce(mt.total_cash_expenses, cs.total_cash_expenses, 0)),
      2
    )
  end::numeric(12,2) as difference_amount,
  coalesce(c.corrected_note, cs.closing_note) as closing_note,
  cs.locked_at,
  c.id as correction_id,
  c.reason as correction_reason,
  c.created_by as corrected_by,
  c.created_at as corrected_at,
  cs.id as id,
  coalesce(mt.total_pix_machine, 0)::numeric(12,2) as total_pix_machine,
  (coalesce(mt.total_cash, cs.total_cash, 0) - coalesce(mt.total_cash_expenses, cs.total_cash_expenses, 0))::numeric(12,2) as cash_result
from public.cash_sessions cs
left join movement_totals mt on mt.cash_session_id = cs.id
left join latest_correction c on c.cash_session_id = cs.id;
