create or replace function public.reverse_account_receivable_payment(_receivable_id uuid)
returns public.accounts_receivable
language plpgsql
security definer
set search_path = ''
as $$
declare
  _ar public.accounts_receivable%rowtype;
  _old_ar public.accounts_receivable%rowtype;
  _entry public.financial_entries%rowtype;
  _commission public.professional_commissions%rowtype;
  _calc record;
  _has_paid_commission boolean := false;
  _in_settlement boolean := false;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  select * into _ar
  from public.accounts_receivable ar
  where ar.id = _receivable_id
  for update;
  if not found then raise exception 'Conta a receber não encontrada.'; end if;
  if _ar.status <> 'paid' then raise exception 'Somente contas já recebidas podem ter a baixa revertida.'; end if;
  _old_ar := _ar;

  if _ar.appointment_id is not null then
    select * into _entry
    from public.financial_entries fe
    where fe.appointment_id = _ar.appointment_id and fe.status <> 'cancelled'
    order by fe.created_at desc limit 1 for update;
  elsif _ar.room_reservation_id is not null then
    select * into _entry
    from public.financial_entries fe
    where fe.room_reservation_id = _ar.room_reservation_id and fe.status <> 'cancelled'
    order by fe.created_at desc limit 1 for update;
  else
    select * into _entry
    from public.financial_entries fe
    where fe.source = 'accounts_receivable'
      and fe.client_id is not distinct from _ar.client_id
      and fe.service_id is not distinct from _ar.service_id
      and fe.patient_name_snapshot is not distinct from _ar.client_name_snapshot
      and fe.charged_amount = _ar.original_amount
      and fe.status = 'received'
      and fe.received_at = _ar.paid_at
    order by fe.created_at desc limit 1 for update;
  end if;

  if _entry.id is not null then
    select * into _commission
    from public.professional_commissions pc
    where pc.financial_entry_id = _entry.id and pc.status <> 'cancelled'
    limit 1 for update;

    if found then
      select exists(
        select 1 from public.professional_commission_payments p
        where p.commission_id = _commission.id
      ) into _has_paid_commission;
      select exists(
        select 1 from public.professional_settlement_items si
        where si.commission_id = _commission.id
      ) into _in_settlement;
      if _has_paid_commission or coalesce(_commission.paid_amount,0) > 0 then
        raise exception 'A comissão desta entrada já possui pagamento. Reverta a comissão antes da conta a receber.';
      end if;
      if _in_settlement then
        raise exception 'A comissão desta entrada faz parte de um fechamento. Remova-a do fechamento antes de reverter a conta.';
      end if;
    end if;

    delete from public.cash_movements where financial_entry_id = _entry.id;

    if _ar.appointment_id is null and _ar.room_reservation_id is null and _entry.source = 'accounts_receivable' then
      delete from public.financial_entries where id = _entry.id;
    else
      update public.financial_entries
      set payment_method_id = null,
          card_fee_amount = 0,
          net_amount = charged_amount,
          status = 'pending',
          received_at = null,
          updated_at = now()
      where id = _entry.id
      returning * into _entry;

      if _commission.id is not null then
        if _commission.is_manual_override then
          if _commission.commission_amount > _entry.net_amount then
            raise exception 'A comissão manual é maior que o valor pendente.';
          end if;
          update public.professional_commissions
          set clinic_amount = round(_entry.net_amount - commission_amount,2), updated_at = now()
          where id = _commission.id;
        elsif _entry.professional_id is not null then
          select * into _calc
          from public.calculate_professional_commission(
            _entry.professional_id,_entry.original_amount,_entry.charged_amount,_entry.net_amount,
            (_entry.occurred_at at time zone 'America/Fortaleza')::date
          ) limit 1;
          if found then
            update public.professional_commissions
            set commission_type=_calc.commission_type,
                calculation_base=_calc.calculation_base,
                base_amount=_calc.base_amount,
                percentage=_calc.percentage,
                fixed_amount=_calc.fixed_amount,
                commission_amount=_calc.commission_amount,
                clinic_amount=round(_entry.net_amount-_calc.commission_amount,2),
                updated_at=now()
            where id=_commission.id;
          else
            update public.professional_commissions
            set commission_amount=0, clinic_amount=_entry.net_amount, updated_at=now()
            where id=_commission.id;
          end if;
        end if;
      end if;
    end if;
  end if;

  update public.accounts_receivable
  set amount_received = 0,
      status = 'pending',
      payment_method_id = null,
      paid_at = null,
      updated_at = now()
  where id = _ar.id
  returning * into _ar;

  if _ar.room_reservation_id is not null then
    update public.room_reservations
    set payment_received=false, payment_method_code=null, updated_at=now()
    where id=_ar.room_reservation_id;
  end if;

  insert into public.financial_audit_log(entity_type,entity_id,action,actor_id,old_data,new_data,metadata)
  values('accounts_receivable',_ar.id,'update',auth.uid(),to_jsonb(_old_ar),to_jsonb(_ar),jsonb_build_object('reason','reverse_payment'));

  return _ar;
end;
$$;

revoke all on function public.reverse_account_receivable_payment(uuid) from public;
grant execute on function public.reverse_account_receivable_payment(uuid) to authenticated;
