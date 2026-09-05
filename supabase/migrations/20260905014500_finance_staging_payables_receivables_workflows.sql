-- Finance staging: payable/receivable operational workflows.

alter table public.appointments
  add column if not exists receivable_due_date date;

alter table public.financial_expenses
  add column if not exists account_payable_id uuid references public.accounts_payable(id) on delete restrict;

create unique index if not exists financial_expenses_unique_account_payable
on public.financial_expenses(account_payable_id)
where account_payable_id is not null;

alter table public.accounts_receivable
  add column if not exists installments integer not null default 1 check (installments >= 1);

create unique index if not exists accounts_receivable_unique_appointment
on public.accounts_receivable(appointment_id)
where appointment_id is not null and status <> 'cancelled';

create unique index if not exists cash_movements_unique_financial_entry
on public.cash_movements(financial_entry_id)
where financial_entry_id is not null;

create or replace function public.finance_staging_sync_attended_appointment()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  v_service_name text;
  v_service_price numeric;
  v_entry public.financial_entries%rowtype;
begin
  if new.status <> 'atendido' or old.status = 'atendido' then
    return new;
  end if;

  if new.professional_id is null then
    raise exception 'Staging financeiro: professional_id é obrigatório antes de marcar como atendido';
  end if;

  if new.payment_received = false and new.receivable_due_date is null then
    raise exception 'Informe o vencimento da conta a receber antes de concluir um atendimento fiado.';
  end if;

  select s.name, s.price
    into v_service_name, v_service_price
  from public.services s
  where s.id = new.service_id;

  if not found then
    raise exception 'Staging financeiro: serviço do atendimento não foi encontrado';
  end if;

  if coalesce(new.custom_price, v_service_price, 0) < 0 then
    raise exception 'Staging financeiro: valor do atendimento inválido';
  end if;

  new.attended_at := coalesce(new.attended_at, now());
  new.status_updated_at := now();

  select * into v_entry
  from public.register_attended_financial_entry(
    new.id,
    new.user_id,
    new.professional_id,
    new.service_id,
    new.patient_name,
    coalesce(nullif(trim(new.professional_name_snapshot),''), 'Profissional de teste'),
    v_service_name,
    coalesce(new.custom_price, v_service_price, 0),
    new.payment_method_code,
    new.installments,
    new.discount_type,
    new.discount_value,
    new.cost_center_code,
    new.manual_commission_amount,
    new.manual_commission_reason,
    coalesce(new.attended_at, now()),
    new.payment_received
  );

  if new.payment_received = false then
    insert into public.accounts_receivable(
      appointment_id,
      client_id,
      service_id,
      client_name_snapshot,
      service_name_snapshot,
      original_amount,
      amount_received,
      due_date,
      status,
      payment_method_id,
      installments,
      created_by,
      notes
    ) values (
      new.id,
      new.user_id,
      new.service_id,
      new.patient_name,
      v_service_name,
      v_entry.charged_amount,
      0,
      new.receivable_due_date,
      'pending',
      v_entry.payment_method_id,
      new.installments,
      auth.uid(),
      'Gerado automaticamente ao concluir atendimento sem recebimento.'
    )
    on conflict (appointment_id) where appointment_id is not null and status <> 'cancelled'
    do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.pay_account_payable(
  _account_id uuid,
  _payment_method_code text,
  _paid_at timestamptz default now()
)
returns public.accounts_payable
language plpgsql
security definer
set search_path = ''
as $$
declare
  _account public.accounts_payable%rowtype;
  _method_id uuid;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  select * into _account
  from public.accounts_payable ap
  where ap.id = _account_id
  for update;

  if not found then raise exception 'Conta a pagar não encontrada.'; end if;
  if _account.status <> 'pending' then raise exception 'A conta a pagar já foi processada.'; end if;

  select pm.id into _method_id
  from public.payment_methods pm
  where pm.code = _payment_method_code and pm.is_active = true
  limit 1;

  if _method_id is null then raise exception 'Forma de pagamento inválida.'; end if;

  insert into public.financial_expenses(
    expense_date,
    category_id,
    cost_center_id,
    description,
    amount,
    payment_method_id,
    paid,
    paid_at,
    created_by,
    notes,
    account_payable_id
  ) values (
    (_paid_at at time zone 'America/Fortaleza')::date,
    _account.category_id,
    _account.cost_center_id,
    'Conta paga: ' || _account.title,
    _account.amount,
    _method_id,
    true,
    _paid_at,
    auth.uid(),
    coalesce(_account.description, _account.supplier),
    _account.id
  );

  update public.accounts_payable
     set status = 'paid',
         payment_method_id = _method_id,
         paid_at = _paid_at,
         paid_by = auth.uid(),
         updated_at = now()
   where id = _account.id
   returning * into _account;

  insert into public.financial_audit_log(entity_type,entity_id,action,actor_id,new_data,metadata)
  values ('accounts_payable',_account.id,'pay',auth.uid(),to_jsonb(_account),jsonb_build_object('payment_method_code',_payment_method_code));

  return _account;
end;
$$;

revoke all on function public.pay_account_payable(uuid,text,timestamptz) from public, anon;
grant execute on function public.pay_account_payable(uuid,text,timestamptz) to authenticated;

create or replace function public.receive_account_receivable(
  _receivable_id uuid,
  _payment_method_code text,
  _received_at timestamptz default now()
)
returns public.accounts_receivable
language plpgsql
security definer
set search_path = ''
as $$
declare
  _ar public.accounts_receivable%rowtype;
  _entry public.financial_entries%rowtype;
  _method_id uuid;
  _fee numeric := 0;
  _net numeric := 0;
  _session_id uuid;
  _commission public.professional_commissions%rowtype;
  _calc record;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  select * into _ar
  from public.accounts_receivable ar
  where ar.id = _receivable_id
  for update;

  if not found then raise exception 'Conta a receber não encontrada.'; end if;
  if _ar.status <> 'pending' then raise exception 'A conta a receber já foi processada.'; end if;

  select pm.id into _method_id
  from public.payment_methods pm
  where pm.code = _payment_method_code and pm.is_active = true
  limit 1;

  if _method_id is null then raise exception 'Forma de pagamento inválida.'; end if;

  if _ar.appointment_id is not null then
    select * into _entry
    from public.financial_entries fe
    where fe.appointment_id = _ar.appointment_id
      and fe.status <> 'cancelled'
    order by fe.created_at desc
    limit 1
    for update;
  end if;

  if found then
    _fee := coalesce(public.calculate_payment_fee(
      _method_id,
      _entry.charged_amount,
      _entry.installments,
      (_received_at at time zone 'America/Fortaleza')::date
    ),0);

    if _fee > _entry.charged_amount then raise exception 'Taxa maior que o valor recebido.'; end if;
    _net := round(_entry.charged_amount - _fee,2);

    update public.financial_entries
       set payment_method_id = _method_id,
           card_fee_amount = _fee,
           net_amount = _net,
           status = 'received',
           received_at = _received_at,
           updated_at = now()
     where id = _entry.id
     returning * into _entry;

    select * into _commission
    from public.professional_commissions pc
    where pc.financial_entry_id = _entry.id
    limit 1
    for update;

    if found then
      if _commission.is_manual_override then
        if _commission.commission_amount > _net then
          raise exception 'A comissão manual é maior que o valor líquido recebido.';
        end if;

        update public.professional_commissions
           set clinic_amount = round(_net - commission_amount,2),
               updated_at = now()
         where id = _commission.id;
      else
        select * into _calc
        from public.calculate_professional_commission(
          _entry.professional_id,
          _entry.original_amount,
          _entry.charged_amount,
          _net,
          (_entry.occurred_at at time zone 'America/Fortaleza')::date
        )
        limit 1;

        if found then
          if _calc.commission_amount > _net then
            raise exception 'Comissão calculada maior que o valor líquido recebido.';
          end if;

          update public.professional_commissions
             set commission_type = _calc.commission_type,
                 calculation_base = _calc.calculation_base,
                 base_amount = _calc.base_amount,
                 percentage = _calc.percentage,
                 fixed_amount = _calc.fixed_amount,
                 commission_amount = _calc.commission_amount,
                 clinic_amount = round(_net - _calc.commission_amount,2),
                 updated_at = now()
           where id = _commission.id;
        else
          update public.professional_commissions
             set commission_amount = 0,
                 clinic_amount = _net,
                 updated_at = now()
           where id = _commission.id;
        end if;
      end if;
    end if;

    select cs.id into _session_id
    from public.cash_sessions cs
    where cs.business_date = (_received_at at time zone 'America/Fortaleza')::date
      and cs.status = 'open'
    order by cs.opened_at desc
    limit 1;

    if _session_id is not null then
      insert into public.cash_movements(
        cash_session_id,movement_type,payment_method_id,financial_entry_id,amount,description,occurred_at,created_by
      ) values (
        _session_id,'income',_method_id,_entry.id,_entry.charged_amount,'Recebimento de conta a receber',_received_at,auth.uid()
      ) on conflict (financial_entry_id) where financial_entry_id is not null do nothing;
    end if;
  else
    _fee := coalesce(public.calculate_payment_fee(
      _method_id,
      _ar.original_amount,
      _ar.installments,
      (_received_at at time zone 'America/Fortaleza')::date
    ),0);
    _net := round(_ar.original_amount - _fee,2);

    insert into public.financial_entries(
      appointment_id,client_id,service_id,patient_name_snapshot,service_name_snapshot,
      occurred_at,original_amount,discount_amount,charged_amount,card_fee_amount,net_amount,
      payment_method_id,installments,status,received_at,source,created_by,notes
    ) values (
      _ar.appointment_id,_ar.client_id,_ar.service_id,_ar.client_name_snapshot,_ar.service_name_snapshot,
      _received_at,_ar.original_amount,0,_ar.original_amount,_fee,_net,
      _method_id,_ar.installments,'received',_received_at,'accounts_receivable',auth.uid(),'Recebimento de conta a receber.'
    ) returning * into _entry;
  end if;

  update public.accounts_receivable
     set amount_received = original_amount,
         status = 'paid',
         payment_method_id = _method_id,
         paid_at = _received_at,
         updated_at = now()
   where id = _ar.id
   returning * into _ar;

  insert into public.financial_audit_log(entity_type,entity_id,action,actor_id,new_data,metadata)
  values ('accounts_receivable',_ar.id,'pay',auth.uid(),to_jsonb(_ar),jsonb_build_object('payment_method_code',_payment_method_code));

  return _ar;
end;
$$;

revoke all on function public.receive_account_receivable(uuid,text,timestamptz) from public, anon;
grant execute on function public.receive_account_receivable(uuid,text,timestamptz) to authenticated;
