create or replace function public.deactivate_payment_method_fee(_fee_id uuid)
returns public.payment_method_fees
language plpgsql
security definer
set search_path = ''
as $$
declare
  _old public.payment_method_fees%rowtype;
  _fee public.payment_method_fees%rowtype;
  _today date := (now() at time zone 'America/Fortaleza')::date;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  select * into _old from public.payment_method_fees where id = _fee_id for update;
  if not found then raise exception 'Taxa não encontrada.'; end if;

  if _old.effective_from < _today then
    update public.payment_method_fees
       set effective_to = _today - 1, updated_at = now()
     where id = _fee_id
     returning * into _fee;
  else
    update public.payment_method_fees
       set is_active = false, updated_at = now()
     where id = _fee_id
     returning * into _fee;
  end if;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, new_data, metadata)
  values ('payment_method_fees', _fee.id, 'deactivate', auth.uid(), to_jsonb(_old), to_jsonb(_fee), jsonb_build_object('effective_stop', _today));
  return _fee;
end;
$$;

revoke all on function public.deactivate_payment_method_fee(uuid) from public;
grant execute on function public.deactivate_payment_method_fee(uuid) to authenticated;

create or replace function public.update_pending_account_payable(_account_id uuid, _amount numeric, _due_date date)
returns public.accounts_payable
language plpgsql
security definer
set search_path = ''
as $$
declare
  _old public.accounts_payable%rowtype;
  _account public.accounts_payable%rowtype;
begin
  if not public.finance_has_role(array['admin','finance']) then raise exception 'Acesso financeiro insuficiente.'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Valor inválido.'; end if;
  if _due_date is null then raise exception 'Data de vencimento obrigatória.'; end if;

  select * into _old from public.accounts_payable where id = _account_id for update;
  if not found then raise exception 'Conta a pagar não encontrada.'; end if;
  if _old.status <> 'pending' then raise exception 'Somente contas pendentes podem ser editadas.'; end if;

  update public.accounts_payable
     set amount = round(_amount, 2), due_date = _due_date, updated_at = now()
   where id = _account_id
   returning * into _account;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, new_data, metadata)
  values ('accounts_payable', _account.id, 'edit_pending', auth.uid(), to_jsonb(_old), to_jsonb(_account), jsonb_build_object('fields', jsonb_build_array('amount','due_date')));
  return _account;
end;
$$;

revoke all on function public.update_pending_account_payable(uuid, numeric, date) from public;
grant execute on function public.update_pending_account_payable(uuid, numeric, date) to authenticated;

create or replace function public.update_pending_account_receivable(_receivable_id uuid, _original_amount numeric, _due_date date)
returns public.accounts_receivable
language plpgsql
security definer
set search_path = ''
as $$
declare
  _old public.accounts_receivable%rowtype;
  _receivable public.accounts_receivable%rowtype;
  _entry public.financial_entries%rowtype;
  _commission public.professional_commissions%rowtype;
  _calc record;
  _entry_found boolean := false;
  _amount numeric := round(_original_amount, 2);
begin
  if not public.finance_has_role(array['admin','finance']) then raise exception 'Acesso financeiro insuficiente.'; end if;
  if _original_amount is null or _original_amount <= 0 then raise exception 'Valor inválido.'; end if;
  if _due_date is null then raise exception 'Data de vencimento obrigatória.'; end if;

  select * into _old from public.accounts_receivable where id = _receivable_id for update;
  if not found then raise exception 'Conta a receber não encontrada.'; end if;
  if _old.status <> 'pending' or coalesce(_old.amount_received, 0) <> 0 then
    raise exception 'Somente contas pendentes e ainda não recebidas podem ser editadas.';
  end if;

  if _old.appointment_id is not null then
    select * into _entry from public.financial_entries
     where appointment_id = _old.appointment_id and status = 'pending'
     order by created_at desc limit 1 for update;
    _entry_found := found;
  elsif _old.room_reservation_id is not null then
    select * into _entry from public.financial_entries
     where room_reservation_id = _old.room_reservation_id and status = 'pending'
     order by created_at desc limit 1 for update;
    _entry_found := found;
  end if;

  if _entry_found then
    update public.financial_entries
       set original_amount = _amount, discount_type = null, discount_value = 0,
           discount_amount = 0, charged_amount = _amount, card_fee_amount = 0,
           net_amount = _amount, updated_at = now()
     where id = _entry.id
     returning * into _entry;

    select * into _commission from public.professional_commissions
     where financial_entry_id = _entry.id limit 1 for update;

    if found then
      if _commission.is_manual_override then
        if _commission.commission_amount > _amount then
          raise exception 'A comissão manual é maior que o novo valor da conta.';
        end if;
        update public.professional_commissions
           set base_amount = _amount,
               clinic_amount = round(_amount - commission_amount, 2),
               updated_at = now()
         where id = _commission.id;
      elsif _entry.professional_id is not null then
        select * into _calc from public.calculate_professional_commission(
          _entry.professional_id, _amount, _amount, _amount,
          (_entry.occurred_at at time zone 'America/Fortaleza')::date
        ) limit 1;
        if found then
          if _calc.commission_amount > _amount then
            raise exception 'Comissão calculada maior que o novo valor da conta.';
          end if;
          update public.professional_commissions
             set commission_type = _calc.commission_type,
                 calculation_base = _calc.calculation_base,
                 base_amount = _calc.base_amount,
                 percentage = _calc.percentage,
                 fixed_amount = _calc.fixed_amount,
                 commission_amount = _calc.commission_amount,
                 clinic_amount = round(_amount - _calc.commission_amount, 2),
                 updated_at = now()
           where id = _commission.id;
        else
          update public.professional_commissions
             set base_amount = _amount, commission_amount = 0,
                 clinic_amount = _amount, updated_at = now()
           where id = _commission.id;
        end if;
      end if;
    end if;
  end if;

  if _old.appointment_id is not null then
    update public.appointments
       set custom_price = _amount, discount_type = null, discount_value = 0,
           receivable_due_date = _due_date
     where id = _old.appointment_id;
  end if;

  if _old.room_reservation_id is not null then
    update public.room_reservations
       set amount = _amount, discount_type = null, discount_value = 0, updated_at = now()
     where id = _old.room_reservation_id;
  end if;

  update public.accounts_receivable
     set original_amount = _amount, due_date = _due_date, updated_at = now()
   where id = _receivable_id
   returning * into _receivable;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, new_data, metadata)
  values ('accounts_receivable', _receivable.id, 'edit_pending', auth.uid(), to_jsonb(_old), to_jsonb(_receivable),
    jsonb_build_object('fields', jsonb_build_array('original_amount','due_date'), 'linked_financial_entry_id', case when _entry_found then _entry.id else null end));
  return _receivable;
end;
$$;

revoke all on function public.update_pending_account_receivable(uuid, numeric, date) from public;
grant execute on function public.update_pending_account_receivable(uuid, numeric, date) to authenticated;
