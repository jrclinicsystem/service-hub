create or replace function public.update_financial_entry_amount(_entry_id uuid, _amount numeric)
returns public.financial_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  _old public.financial_entries%rowtype;
  _entry public.financial_entries%rowtype;
  _fee numeric := 0;
  _net numeric := 0;
  _commission public.professional_commissions%rowtype;
  _calc record;
  _new_commission numeric := 0;
  _paid numeric := 0;
  _receivable public.accounts_receivable%rowtype;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;
  if _amount is null or _amount <= 0 then
    raise exception 'Informe um valor maior que zero.';
  end if;

  select * into _old
  from public.financial_entries
  where id = _entry_id
  for update;
  if not found then
    raise exception 'Entrada financeira não encontrada.';
  end if;
  if _old.status = 'cancelled' then
    raise exception 'Entradas canceladas não podem ser editadas.';
  end if;

  _fee := public.calculate_payment_fee(
    _old.payment_method_id,
    round(_amount, 2),
    coalesce(_old.installments, 1),
    (_old.occurred_at at time zone 'America/Fortaleza')::date
  );
  _net := round(_amount - coalesce(_fee, 0), 2);
  if _net < 0 then
    raise exception 'A taxa não pode ser maior que o valor da entrada.';
  end if;

  select * into _commission
  from public.professional_commissions
  where financial_entry_id = _old.id and status <> 'cancelled'
  limit 1
  for update;

  if found then
    _paid := coalesce(_commission.paid_amount, 0);

    if _commission.is_manual_override then
      _new_commission := round(_commission.commission_amount, 2);
      if _new_commission > _net then
        raise exception 'A comissão manual atual é maior que o novo valor líquido.';
      end if;
      update public.professional_commissions
         set base_amount = _net,
             clinic_amount = round(_net - _new_commission, 2),
             updated_at = now()
       where id = _commission.id;
    elsif _old.professional_id is not null then
      select * into _calc
      from public.calculate_professional_commission(
        _old.professional_id,
        round(_amount, 2),
        round(_amount, 2),
        _net,
        (_old.occurred_at at time zone 'America/Fortaleza')::date
      ) limit 1;

      if found then
        _new_commission := round(coalesce(_calc.commission_amount, 0), 2);
      else
        _new_commission := 0;
      end if;

      if _new_commission < _paid then
        raise exception 'O novo valor reduziria a comissão para menos do que já foi pago (%).', _paid;
      end if;
      if _new_commission > _net then
        raise exception 'A comissão calculada é maior que o novo valor líquido.';
      end if;

      if _calc is not null then
        update public.professional_commissions
           set commission_type = _calc.commission_type,
               calculation_base = _calc.calculation_base,
               base_amount = _calc.base_amount,
               percentage = _calc.percentage,
               fixed_amount = _calc.fixed_amount,
               commission_amount = _new_commission,
               clinic_amount = round(_net - _new_commission, 2),
               status = case when _paid >= _new_commission and _new_commission > 0 then 'paid' else 'pending' end,
               paid_at = case when _paid >= _new_commission and _new_commission > 0 then coalesce(_commission.paid_at, now()) else null end,
               updated_at = now()
         where id = _commission.id;
      else
        update public.professional_commissions
           set base_amount = _net,
               commission_amount = 0,
               clinic_amount = _net,
               status = 'pending',
               paid_at = null,
               updated_at = now()
         where id = _commission.id;
      end if;
    end if;
  end if;

  update public.financial_entries
     set original_amount = round(_amount, 2),
         discount_type = null,
         discount_value = 0,
         discount_amount = 0,
         charged_amount = round(_amount, 2),
         card_fee_amount = coalesce(_fee, 0),
         net_amount = _net,
         updated_at = now()
   where id = _old.id
   returning * into _entry;

  if _old.appointment_id is not null then
    update public.appointments
       set custom_price = round(_amount, 2),
           discount_type = null,
           discount_value = 0
     where id = _old.appointment_id;
  end if;

  if _old.room_reservation_id is not null then
    update public.room_reservations
       set amount = round(_amount, 2),
           discount_type = null,
           discount_value = 0,
           updated_at = now()
     where id = _old.room_reservation_id;
  end if;

  if _old.appointment_id is not null then
    select * into _receivable
    from public.accounts_receivable
    where appointment_id = _old.appointment_id
    order by created_at desc limit 1
    for update;
  elsif _old.room_reservation_id is not null then
    select * into _receivable
    from public.accounts_receivable
    where room_reservation_id = _old.room_reservation_id
    order by created_at desc limit 1
    for update;
  end if;

  if _receivable.id is not null then
    if _receivable.status = 'pending' and coalesce(_receivable.amount_received,0) = 0 then
      update public.accounts_receivable
         set original_amount = round(_amount,2), updated_at = now()
       where id = _receivable.id;
    elsif _receivable.status = 'paid' and round(coalesce(_receivable.amount_received,0),2) = round(_old.charged_amount,2) then
      update public.accounts_receivable
         set original_amount = round(_amount,2), amount_received = round(_amount,2), updated_at = now()
       where id = _receivable.id;
    end if;
  end if;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, new_data, metadata)
  values (
    'financial_entries', _entry.id, 'update', auth.uid(), to_jsonb(_old), to_jsonb(_entry),
    jsonb_build_object('field','amount','old_amount',_old.charged_amount,'new_amount',_entry.charged_amount)
  );

  return _entry;
end;
$$;

revoke all on function public.update_financial_entry_amount(uuid, numeric) from public;
grant execute on function public.update_financial_entry_amount(uuid, numeric) to authenticated;
