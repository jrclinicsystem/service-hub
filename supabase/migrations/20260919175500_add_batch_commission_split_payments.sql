-- Pay multiple pending professional commissions in one atomic operation.
-- The selected total can be split between physical cash and PIX.
create or replace function public.pay_commissions_batch_split(
  _commission_ids uuid[],
  _cash_amount numeric default 0,
  _pix_amount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cash numeric(12,2) := round(coalesce(_cash_amount, 0), 2);
  v_pix numeric(12,2) := round(coalesce(_pix_amount, 0), 2);
  v_total numeric(12,2);
  v_expected numeric(12,2);
  v_cash_left numeric(12,2);
  v_pix_left numeric(12,2);
  v_remaining numeric(12,2);
  v_piece numeric(12,2);
  v_count integer;
  v_requested_count integer;
  v_commission record;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  if _commission_ids is null or coalesce(array_length(_commission_ids, 1), 0) = 0 then
    raise exception 'Selecione pelo menos uma comissão.';
  end if;

  if v_cash < 0 or v_pix < 0 then
    raise exception 'Os valores por forma de pagamento não podem ser negativos.';
  end if;

  v_total := round(v_cash + v_pix, 2);
  if v_total <= 0 then
    raise exception 'Informe um valor de pagamento maior que zero.';
  end if;

  select count(distinct id)
    into v_requested_count
  from unnest(_commission_ids) as selected(id);

  select
    count(*),
    round(coalesce(sum(greatest(pc.commission_amount - coalesce(pc.paid_amount, 0), 0)), 0), 2)
    into v_count, v_expected
  from public.professional_commissions pc
  where pc.id = any(_commission_ids)
    and pc.status <> 'cancelled'
    and greatest(pc.commission_amount - coalesce(pc.paid_amount, 0), 0) > 0;

  if v_count <> v_requested_count then
    raise exception 'Uma ou mais comissões selecionadas não estão disponíveis para pagamento.';
  end if;

  if abs(v_total - v_expected) > 0.009 then
    raise exception 'Dinheiro + PIX deve totalizar exatamente %.',
      to_char(v_expected, 'FM999999990D00');
  end if;

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

  v_cash_left := v_cash;
  v_pix_left := v_pix;

  for v_commission in
    select pc.id, pc.commission_amount, coalesce(pc.paid_amount, 0) as paid_amount
    from public.professional_commissions pc
    where pc.id = any(_commission_ids)
      and pc.status <> 'cancelled'
      and greatest(pc.commission_amount - coalesce(pc.paid_amount, 0), 0) > 0
    order by pc.created_at, pc.id
    for update
  loop
    v_remaining := round(
      greatest(v_commission.commission_amount - v_commission.paid_amount, 0),
      2
    );

    if v_cash_left > 0 and v_remaining > 0 then
      v_piece := least(v_cash_left, v_remaining);
      perform public.register_commission_payment(v_commission.id, v_piece, 'cash');
      v_cash_left := round(v_cash_left - v_piece, 2);
      v_remaining := round(v_remaining - v_piece, 2);
    end if;

    if v_pix_left > 0 and v_remaining > 0 then
      v_piece := least(v_pix_left, v_remaining);
      perform public.register_commission_payment(v_commission.id, v_piece, 'pix');
      v_pix_left := round(v_pix_left - v_piece, 2);
      v_remaining := round(v_remaining - v_piece, 2);
    end if;
  end loop;

  if abs(v_cash_left) > 0.009 or abs(v_pix_left) > 0.009 then
    raise exception 'Não foi possível distribuir integralmente o pagamento em lote.';
  end if;

  return jsonb_build_object(
    'commission_count', v_count,
    'total_paid', v_total,
    'cash_amount', v_cash,
    'pix_amount', v_pix
  );
end;
$function$;

grant execute on function public.pay_commissions_batch_split(uuid[], numeric, numeric) to authenticated;
