create or replace function public.record_client_budget_payment(
  _budget_id uuid,
  _payment_method_code text,
  _installments integer,
  _occurred_at timestamptz,
  _professional_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  _budget public.client_budgets%rowtype;
  _entry public.financial_entries%rowtype;
  _client_name text;
  _professional_name text;
  _cash_movement_created boolean := false;
  _commission record;
  _commission_id uuid;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso insuficiente para registrar o pagamento do combo.' using errcode='42501';
  end if;

  if _professional_id is null then
    raise exception 'Selecione a profissional responsável pelo atendimento.' using errcode='23514';
  end if;

  select p.name into _professional_name
  from public.professionals p
  where p.id = _professional_id
    and p.is_active = true
    and p.deleted_at is null;

  if _professional_name is null then
    raise exception 'Profissional não encontrada ou inativa.' using errcode='23503';
  end if;

  select * into _budget
  from public.client_budgets
  where id = _budget_id
  for update;

  if not found then
    raise exception 'Combo não encontrado.' using errcode='23503';
  end if;

  if _budget.is_paid then
    raise exception 'O pagamento deste combo já foi registrado.' using errcode='23514';
  end if;

  if _budget.total_amount < 0 then
    raise exception 'Valor do combo inválido.' using errcode='23514';
  end if;

  if coalesce(_installments,1) < 1 or coalesce(_installments,1) > 12 then
    raise exception 'Parcelas inválidas.' using errcode='23514';
  end if;

  select c.name into _client_name
  from public.clients c
  where c.id = _budget.client_id;

  if round(_budget.total_amount,2) > 0 then
    if nullif(trim(_payment_method_code),'') is null then
      raise exception 'Informe a forma de pagamento.' using errcode='23514';
    end if;

    select * into _entry
    from public.register_manual_financial_entry(
      'Combo — ' || _budget.title,
      round(_budget.total_amount,2),
      trim(_payment_method_code),
      coalesce(_installments,1),
      coalesce(_occurred_at,now()),
      'Pagamento integral do combo registrado pela ficha do cliente.'
    );

    update public.financial_entries
       set client_id = _budget.client_id,
           professional_id = _professional_id,
           patient_name_snapshot = _client_name,
           professional_name_snapshot = _professional_name,
           service_name_snapshot = _budget.title,
           source = 'client_budget',
           notes = concat_ws(' · ', nullif(notes,''), 'Combo: ' || _budget.id::text),
           updated_at = now()
     where id = _entry.id
     returning * into _entry;

    select * into _commission
    from public.calculate_professional_commission(
      _professional_id,
      _entry.original_amount,
      _entry.charged_amount,
      _entry.net_amount,
      (coalesce(_entry.received_at,_entry.occurred_at) at time zone 'America/Fortaleza')::date
    )
    limit 1;

    if not found then
      raise exception 'A profissional selecionada não possui regra de comissão ativa para esta data.' using errcode='23514';
    end if;

    if coalesce(_commission.commission_amount,0) < 0 or coalesce(_commission.commission_amount,0) > _entry.net_amount then
      raise exception 'A comissão calculada é inválida para o valor líquido recebido.' using errcode='23514';
    end if;

    insert into public.professional_commissions(
      financial_entry_id,
      professional_id,
      commission_type,
      calculation_base,
      base_amount,
      percentage,
      fixed_amount,
      commission_amount,
      clinic_amount,
      is_manual_override,
      created_by
    ) values (
      _entry.id,
      _professional_id,
      _commission.commission_type,
      _commission.calculation_base,
      _commission.base_amount,
      _commission.percentage,
      _commission.fixed_amount,
      round(coalesce(_commission.commission_amount,0),2),
      round(_entry.net_amount - coalesce(_commission.commission_amount,0),2),
      false,
      auth.uid()
    )
    returning id into _commission_id;

    select exists(
      select 1 from public.cash_movements cm where cm.financial_entry_id = _entry.id
    ) into _cash_movement_created;
  end if;

  update public.client_budgets
     set is_paid = true,
         paid_amount = round(total_amount,2),
         paid_at = coalesce(_occurred_at,now()),
         payment_method_code = nullif(trim(_payment_method_code),''),
         financial_entry_id = case when _entry.id is not null then _entry.id else financial_entry_id end,
         status = 'approved',
         updated_at = now()
   where id = _budget_id
   returning * into _budget;

  return jsonb_build_object(
    'budget_id', _budget.id,
    'paid', true,
    'amount', _budget.paid_amount,
    'financial_entry_id', _budget.financial_entry_id,
    'professional_id', _professional_id,
    'commission_id', _commission_id,
    'commission_amount', case when _commission_id is null then 0 else round(coalesce(_commission.commission_amount,0),2) end,
    'cash_movement_created', _cash_movement_created
  );
end;
$function$;

revoke all on function public.record_client_budget_payment(uuid,text,integer,timestamptz,uuid) from public;
grant execute on function public.record_client_budget_payment(uuid,text,integer,timestamptz,uuid) to authenticated;
