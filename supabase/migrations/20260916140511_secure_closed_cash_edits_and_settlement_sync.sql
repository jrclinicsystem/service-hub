-- Keep professional settlement cards synchronized with the real payment state of their commissions.
create or replace function public.refresh_professional_settlement_payment_state(_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item_count integer := 0;
  v_amount_repassed numeric(12,2) := 0;
  v_amount_pending numeric(12,2) := 0;
begin
  select
    count(*),
    round(coalesce(sum(least(coalesce(pc.paid_amount, 0), pc.commission_amount)), 0), 2),
    round(coalesce(sum(greatest(pc.commission_amount - coalesce(pc.paid_amount, 0), 0)), 0), 2)
  into v_item_count, v_amount_repassed, v_amount_pending
  from public.professional_settlement_items psi
  join public.professional_commissions pc on pc.id = psi.commission_id
  where psi.settlement_id = _settlement_id
    and pc.status <> 'cancelled';

  if v_item_count = 0 then
    return;
  end if;

  update public.professional_settlements ps
  set amount_repassed = v_amount_repassed,
      amount_pending = v_amount_pending,
      status = case
        when ps.status = 'cancelled' then ps.status
        when v_amount_pending <= 0.009 then 'paid'
        else ps.status
      end,
      closed_at = case
        when v_amount_pending <= 0.009 then coalesce(ps.closed_at, now())
        else ps.closed_at
      end,
      updated_at = now()
  where ps.id = _settlement_id;
end;
$function$;

create or replace function public.sync_professional_settlement_from_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_settlement_id uuid;
begin
  for v_settlement_id in
    select psi.settlement_id
    from public.professional_settlement_items psi
    where psi.commission_id = new.id
  loop
    perform public.refresh_professional_settlement_payment_state(v_settlement_id);
  end loop;
  return new;
end;
$function$;

drop trigger if exists sync_professional_settlement_from_commission on public.professional_commissions;
create trigger sync_professional_settlement_from_commission
after update of commission_amount, paid_amount, status on public.professional_commissions
for each row execute function public.sync_professional_settlement_from_commission();

do $block$
declare
  v_settlement_id uuid;
begin
  for v_settlement_id in
    select id from public.professional_settlements where status <> 'cancelled'
  loop
    perform public.refresh_professional_settlement_payment_state(v_settlement_id);
  end loop;
end
$block$;

-- Extend the immutable correction ledger so a closed cash session can be safely edited
-- without rewriting the original historical cash_sessions row.
alter table public.cash_session_corrections
  add column if not exists previous_opening_cash numeric(12,2),
  add column if not exists corrected_opening_cash numeric(12,2),
  add column if not exists previous_counted_cash numeric(12,2),
  add column if not exists previous_expected_cash numeric(12,2),
  add column if not exists corrected_expected_cash numeric(12,2),
  add column if not exists previous_difference_amount numeric(12,2),
  add column if not exists corrected_difference_amount numeric(12,2),
  add column if not exists previous_note text,
  add column if not exists actor_label text;

update public.cash_session_corrections c
set previous_opening_cash = coalesce(c.previous_opening_cash, cs.opening_cash),
    corrected_opening_cash = coalesce(c.corrected_opening_cash, cs.opening_cash),
    previous_counted_cash = coalesce(c.previous_counted_cash, cs.counted_cash),
    previous_expected_cash = coalesce(c.previous_expected_cash, cs.expected_cash),
    corrected_expected_cash = coalesce(c.corrected_expected_cash, cs.expected_cash),
    previous_difference_amount = coalesce(c.previous_difference_amount, cs.difference_amount),
    corrected_difference_amount = coalesce(
      c.corrected_difference_amount,
      round(c.corrected_counted_cash - coalesce(cs.expected_cash, 0), 2)
    ),
    previous_note = coalesce(c.previous_note, cs.closing_note),
    actor_label = coalesce(c.actor_label, c.created_by::text)
from public.cash_sessions cs
where cs.id = c.cash_session_id;

revoke insert, update, delete on table public.cash_session_corrections from authenticated, anon;
grant select on table public.cash_session_corrections to authenticated;

create or replace function public.admin_edit_closed_cash_session(
  _session_id uuid,
  _opening_cash numeric,
  _counted_cash numeric,
  _closing_note text,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.cash_sessions%rowtype;
  v_effective record;
  v_new_opening numeric(12,2);
  v_new_counted numeric(12,2);
  v_new_expected numeric(12,2);
  v_new_difference numeric(12,2);
  v_reason text;
  v_actor_label text;
  v_correction_id uuid;
begin
  if not public.finance_has_role(array['admin']) then
    raise exception 'Somente administradores podem alterar um caixa já fechado.' using errcode = '42501';
  end if;

  v_new_opening := round(coalesce(_opening_cash, -1), 2);
  v_new_counted := round(coalesce(_counted_cash, -1), 2);
  v_reason := btrim(coalesce(_reason, ''));

  if v_new_opening < 0 then
    raise exception 'Informe um fundo inicial válido.' using errcode = '23514';
  end if;
  if v_new_counted < 0 then
    raise exception 'Informe um valor contado válido.' using errcode = '23514';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'Informe um motivo da alteração com pelo menos 5 caracteres.' using errcode = '23514';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = _session_id
  for share;

  if not found then
    raise exception 'Caixa não encontrado.' using errcode = '23503';
  end if;
  if v_session.status <> 'closed' then
    raise exception 'Somente um caixa já fechado pode ser alterado por este fluxo.' using errcode = '23514';
  end if;

  select * into v_effective
  from public.financial_cash_report
  where cash_session_id = _session_id;

  if not found then
    raise exception 'Resumo do caixa não encontrado.' using errcode = '23503';
  end if;

  v_new_expected := round(
    v_new_opening + coalesce(v_effective.total_cash, 0) - coalesce(v_effective.total_cash_expenses, 0),
    2
  );
  v_new_difference := round(v_new_counted - v_new_expected, 2);
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
    _session_id,
    v_new_counted,
    coalesce(_closing_note, ''),
    v_reason,
    auth.uid(),
    v_effective.opening_cash,
    v_new_opening,
    v_effective.counted_cash,
    v_effective.expected_cash,
    v_new_expected,
    v_effective.difference_amount,
    v_new_difference,
    v_effective.closing_note,
    v_actor_label
  ) returning id into v_correction_id;

  insert into public.financial_audit_log(
    entity_type, entity_id, action, actor_id, old_data, new_data, metadata
  ) values (
    'cash_sessions',
    _session_id,
    'override',
    auth.uid(),
    jsonb_build_object(
      'opening_cash', v_effective.opening_cash,
      'expected_cash', v_effective.expected_cash,
      'counted_cash', v_effective.counted_cash,
      'difference_amount', v_effective.difference_amount,
      'closing_note', v_effective.closing_note
    ),
    jsonb_build_object(
      'opening_cash', v_new_opening,
      'expected_cash', v_new_expected,
      'counted_cash', v_new_counted,
      'difference_amount', v_new_difference,
      'closing_note', coalesce(_closing_note, '')
    ),
    jsonb_build_object(
      'reason', v_reason,
      'correction_id', v_correction_id,
      'kind', 'secure_closed_cash_edit',
      'actor_label', v_actor_label
    )
  );

  return jsonb_build_object(
    'cash_session_id', _session_id,
    'correction_id', v_correction_id,
    'opening_cash', v_new_opening,
    'expected_cash', v_new_expected,
    'counted_cash', v_new_counted,
    'difference_amount', v_new_difference,
    'closing_note', coalesce(_closing_note, ''),
    'reason', v_reason,
    'changed_by', v_actor_label,
    'changed_at', now()
  );
end;
$function$;

revoke all on function public.admin_edit_closed_cash_session(uuid,numeric,numeric,text,text) from public;
grant execute on function public.admin_edit_closed_cash_session(uuid,numeric,numeric,text,text) to authenticated;

-- Keep the legacy RPC compatible, but enforce the same admin-only audited path.
create or replace function public.correct_closed_cash_session(
  _session_id uuid,
  _counted_cash numeric,
  _reason text
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_effective record;
  v_result public.cash_sessions%rowtype;
  v_expected numeric(12,2);
begin
  if not public.finance_has_role(array['admin']) then
    raise exception 'Somente administradores podem alterar um caixa já fechado.' using errcode = '42501';
  end if;

  select * into v_effective
  from public.financial_cash_report
  where cash_session_id = _session_id;

  if not found then
    raise exception 'Caixa não encontrado.' using errcode = '23503';
  end if;

  perform public.admin_edit_closed_cash_session(
    _session_id,
    v_effective.opening_cash,
    _counted_cash,
    v_effective.closing_note,
    _reason
  );

  select * into v_result from public.cash_sessions where id = _session_id;
  v_expected := round(v_effective.opening_cash + coalesce(v_effective.total_cash, 0) - coalesce(v_effective.total_cash_expenses, 0), 2);
  v_result.opening_cash := v_effective.opening_cash;
  v_result.expected_cash := v_expected;
  v_result.counted_cash := round(_counted_cash, 2);
  v_result.difference_amount := round(_counted_cash - v_expected, 2);
  v_result.closing_note := v_effective.closing_note;
  v_result.updated_at := now();
  return v_result;
end;
$function$;

revoke all on function public.correct_closed_cash_session(uuid,numeric,text) from public;
grant execute on function public.correct_closed_cash_session(uuid,numeric,text) to authenticated;

-- Closed rows stay immutable at the raw table level. All changes must go through the ledger above.
create or replace function public.finance_guard_closed_cash_session()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin
  if old.status = 'closed' then
    raise exception 'Caixa fechado é imutável no histórico bruto. Use o fluxo auditado de alteração.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

-- Make the read model honor the latest secure correction while keeping movements untouched.
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
    x.corrected_opening_cash,
    x.reason,
    x.created_by,
    x.created_at,
    x.actor_label
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
  coalesce(c.corrected_opening_cash, cs.opening_cash)::numeric(12,2) as opening_cash,
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
    coalesce(c.corrected_opening_cash, cs.opening_cash,0) + coalesce(mt.total_cash, cs.total_cash, 0) - coalesce(mt.total_cash_expenses, cs.total_cash_expenses, 0),
    2
  )::numeric(12,2) as expected_cash,
  coalesce(c.corrected_counted_cash, cs.counted_cash)::numeric(12,2) as counted_cash,
  case
    when coalesce(c.corrected_counted_cash, cs.counted_cash) is null then null
    else round(
      coalesce(c.corrected_counted_cash, cs.counted_cash)
      - (coalesce(c.corrected_opening_cash, cs.opening_cash,0) + coalesce(mt.total_cash, cs.total_cash, 0) - coalesce(mt.total_cash_expenses, cs.total_cash_expenses, 0)),
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
  (coalesce(mt.total_cash, cs.total_cash, 0) - coalesce(mt.total_cash_expenses, cs.total_cash_expenses, 0))::numeric(12,2) as cash_result,
  c.actor_label as correction_actor_label
from public.cash_sessions cs
left join movement_totals mt on mt.cash_session_id = cs.id
left join latest_correction c on c.cash_session_id = cs.id;
