-- Register commission/repasse payments by payment method and support Cash + PIX split.
-- Cash portions automatically affect the physical cash session through the existing
-- financial_expenses_sync_cash trigger; PIX portions remain outside physical cash.

alter table public.professional_commission_payments
  add column if not exists payment_method_id uuid references public.payment_methods(id) on delete restrict;

create index if not exists professional_commission_payments_payment_method_idx
  on public.professional_commission_payments(payment_method_id);

-- Reconcile legacy rows that were marked paid by the old settlement RPC, which did
-- not keep paid_amount in sync. This does not invent a historical payment method.
update public.professional_commissions
set paid_amount = commission_amount,
    updated_at = now()
where status = 'paid'
  and coalesce(paid_amount, 0) < commission_amount;

create or replace function public.register_commission_payment(
  _commission_id uuid,
  _amount numeric,
  _payment_method_code text
)
returns public.professional_commissions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  c public.professional_commissions%rowtype;
  v_amount numeric(12,2);
  v_remaining numeric(12,2);
  v_new_paid numeric(12,2);
  v_expense_id uuid;
  v_category_id uuid;
  v_payment_method_id uuid;
  v_payment_method_name text;
  v_professional_name text;
  v_patient_name text;
  v_service_name text;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente';
  end if;

  select pm.id, pm.name
    into v_payment_method_id, v_payment_method_name
  from public.payment_methods pm
  where pm.code = nullif(btrim(_payment_method_code), '')
    and pm.is_active = true
  limit 1;

  if v_payment_method_id is null then
    raise exception 'Forma de pagamento inválida ou inativa';
  end if;

  select *
    into c
  from public.professional_commissions
  where id = _commission_id
  for update;

  if not found then
    raise exception 'Comissão não encontrada';
  end if;

  if c.status = 'cancelled' then
    raise exception 'Comissão cancelada não pode receber pagamento';
  end if;

  v_remaining := round(greatest(0::numeric, c.commission_amount - coalesce(c.paid_amount, 0)), 2);
  if c.status = 'paid' or v_remaining <= 0 then
    raise exception 'Comissão já está totalmente paga';
  end if;

  v_amount := round(coalesce(_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'Informe um valor de pagamento maior que zero';
  end if;
  if v_amount > v_remaining then
    raise exception 'O valor informado é maior que o restante da comissão';
  end if;

  select p.name
    into v_professional_name
  from public.professionals p
  where p.id = c.professional_id;

  select fe.patient_name_snapshot, fe.service_name_snapshot
    into v_patient_name, v_service_name
  from public.financial_entries fe
  where fe.id = c.financial_entry_id;

  select ec.id
    into v_category_id
  from public.expense_categories ec
  where lower(ec.name) = lower('Comissões')
  order by ec.is_active desc, ec.created_at asc
  limit 1;

  if v_category_id is null then
    raise exception 'Categoria de despesa Comissões não configurada';
  end if;

  insert into public.financial_expenses (
    expense_date,
    category_id,
    description,
    amount,
    payment_method_id,
    paid,
    paid_at,
    created_by,
    notes
  ) values (
    (now() at time zone 'America/Fortaleza')::date,
    v_category_id,
    'Comissão — ' || coalesce(v_professional_name, 'Profissional') ||
      case when nullif(btrim(coalesce(v_patient_name, '')), '') is not null
        then ' — ' || v_patient_name else '' end,
    v_amount,
    v_payment_method_id,
    true,
    now(),
    auth.uid(),
    'Pagamento de comissão' ||
      case when nullif(btrim(coalesce(v_service_name, '')), '') is not null
        then ' · ' || v_service_name else '' end ||
      ' · ' || coalesce(v_payment_method_name, _payment_method_code) ||
      ' · comissão ' || c.id::text
  )
  returning id into v_expense_id;

  insert into public.professional_commission_payments (
    commission_id,
    amount,
    expense_id,
    payment_method_id,
    paid_at,
    paid_by
  ) values (
    c.id,
    v_amount,
    v_expense_id,
    v_payment_method_id,
    now(),
    auth.uid()
  );

  v_new_paid := round(coalesce(c.paid_amount, 0) + v_amount, 2);

  update public.professional_commissions
  set paid_amount = v_new_paid,
      status = case when v_new_paid >= commission_amount then 'paid' else 'pending' end,
      paid_at = case when v_new_paid >= commission_amount then now() else null end,
      paid_by = case when v_new_paid >= commission_amount then auth.uid() else paid_by end,
      updated_at = now()
  where id = c.id
  returning * into c;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, new_data, metadata)
  values (
    'professional_commissions',
    c.id,
    case when c.status = 'paid' then 'pay' else 'partial_pay' end,
    auth.uid(),
    jsonb_build_object(
      'commission', to_jsonb(c),
      'payment_amount', v_amount,
      'expense_id', v_expense_id
    ),
    jsonb_build_object(
      'payment_method_code', _payment_method_code,
      'payment_method_id', v_payment_method_id
    )
  );

  return c;
end;
$function$;

grant execute on function public.register_commission_payment(uuid, numeric, text) to authenticated;

create or replace function public.pay_professional_settlement_split(
  _settlement_id uuid,
  _cash_amount numeric default 0,
  _pix_amount numeric default 0
)
returns public.professional_settlements
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_settlement public.professional_settlements%rowtype;
  v_cash numeric(12,2) := round(coalesce(_cash_amount, 0), 2);
  v_pix numeric(12,2) := round(coalesce(_pix_amount, 0), 2);
  v_total numeric(12,2);
  v_remaining_total numeric(12,2);
  v_cash_left numeric(12,2);
  v_pix_left numeric(12,2);
  v_commission_remaining numeric(12,2);
  v_piece numeric(12,2);
  v_amount_repassed numeric(12,2);
  v_amount_pending numeric(12,2);
  v_commission record;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  if v_cash < 0 or v_pix < 0 then
    raise exception 'Os valores por forma de pagamento não podem ser negativos.';
  end if;

  v_total := round(v_cash + v_pix, 2);
  if v_total <= 0 then
    raise exception 'Informe um valor de pagamento maior que zero.';
  end if;

  select *
    into v_settlement
  from public.professional_settlements ps
  where ps.id = _settlement_id
  for update;

  if not found then
    raise exception 'Fechamento não encontrado.';
  end if;

  if v_settlement.status not in ('open','closed') then
    raise exception 'Fechamento já foi pago ou cancelado.';
  end if;

  -- Validate configured methods before touching any commission row.
  if v_cash > 0 and not exists (
    select 1 from public.payment_methods pm where pm.code = 'cash' and pm.is_active = true
  ) then
    raise exception 'Forma de pagamento Dinheiro não está configurada.';
  end if;
  if v_pix > 0 and not exists (
    select 1 from public.payment_methods pm where pm.code = 'pix' and pm.is_active = true
  ) then
    raise exception 'Forma de pagamento PIX não está configurada.';
  end if;

  select round(coalesce(sum(greatest(pc.commission_amount - coalesce(pc.paid_amount, 0), 0)), 0), 2)
    into v_remaining_total
  from public.professional_settlement_items psi
  join public.professional_commissions pc on pc.id = psi.commission_id
  where psi.settlement_id = v_settlement.id
    and pc.status <> 'cancelled';

  if v_remaining_total <= 0 then
    raise exception 'Este fechamento não possui comissão pendente.';
  end if;

  if abs(v_total - v_remaining_total) > 0.009 then
    raise exception 'A soma das formas de pagamento deve ser exatamente %.',
      to_char(v_remaining_total, 'FM999999990D00');
  end if;

  v_cash_left := v_cash;
  v_pix_left := v_pix;

  for v_commission in
    select pc.id, pc.commission_amount, coalesce(pc.paid_amount, 0) as paid_amount
    from public.professional_settlement_items psi
    join public.professional_commissions pc on pc.id = psi.commission_id
    where psi.settlement_id = v_settlement.id
      and pc.status <> 'cancelled'
      and greatest(pc.commission_amount - coalesce(pc.paid_amount, 0), 0) > 0
    order by pc.created_at, pc.id
    for update of pc
  loop
    v_commission_remaining := round(
      greatest(v_commission.commission_amount - v_commission.paid_amount, 0),
      2
    );

    if v_cash_left > 0 and v_commission_remaining > 0 then
      v_piece := least(v_cash_left, v_commission_remaining);
      perform public.register_commission_payment(v_commission.id, v_piece, 'cash');
      v_cash_left := round(v_cash_left - v_piece, 2);
      v_commission_remaining := round(v_commission_remaining - v_piece, 2);
    end if;

    if v_pix_left > 0 and v_commission_remaining > 0 then
      v_piece := least(v_pix_left, v_commission_remaining);
      perform public.register_commission_payment(v_commission.id, v_piece, 'pix');
      v_pix_left := round(v_pix_left - v_piece, 2);
      v_commission_remaining := round(v_commission_remaining - v_piece, 2);
    end if;
  end loop;

  if abs(v_cash_left) > 0.009 or abs(v_pix_left) > 0.009 then
    raise exception 'Não foi possível distribuir integralmente o pagamento do repasse.';
  end if;

  select
    round(coalesce(sum(least(coalesce(pc.paid_amount, 0), pc.commission_amount)), 0), 2),
    round(coalesce(sum(greatest(pc.commission_amount - coalesce(pc.paid_amount, 0), 0)), 0), 2)
    into v_amount_repassed, v_amount_pending
  from public.professional_settlement_items psi
  join public.professional_commissions pc on pc.id = psi.commission_id
  where psi.settlement_id = v_settlement.id
    and pc.status <> 'cancelled';

  update public.professional_settlements
  set status = case when v_amount_pending <= 0.009 then 'paid' else status end,
      amount_repassed = v_amount_repassed,
      amount_pending = v_amount_pending,
      closed_by = case when v_amount_pending <= 0.009 then coalesce(closed_by, auth.uid()) else closed_by end,
      closed_at = case when v_amount_pending <= 0.009 then coalesce(closed_at, now()) else closed_at end,
      updated_at = now()
  where id = v_settlement.id
  returning * into v_settlement;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, new_data, metadata)
  values (
    'professional_settlements',
    v_settlement.id,
    'pay',
    auth.uid(),
    to_jsonb(v_settlement),
    jsonb_build_object(
      'cash_amount', v_cash,
      'pix_amount', v_pix,
      'payment_split', case
        when v_cash > 0 and v_pix > 0 then 'cash_pix'
        when v_cash > 0 then 'cash'
        else 'pix'
      end
    )
  );

  return v_settlement;
end;
$function$;

grant execute on function public.pay_professional_settlement_split(uuid, numeric, numeric) to authenticated;
