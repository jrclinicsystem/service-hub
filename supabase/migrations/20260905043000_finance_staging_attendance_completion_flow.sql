-- JR Clinic Finance Staging only: safe appointment -> finance completion flow.

create or replace function public.register_attended_financial_entry(
  _appointment_id uuid,
  _client_id uuid,
  _professional_id uuid,
  _service_id uuid,
  _patient_name text,
  _professional_name text,
  _service_name text,
  _original_amount numeric,
  _payment_method_code text,
  _installments integer default 1,
  _discount_type text default null,
  _discount_value numeric default 0,
  _cost_center_code text default null,
  _manual_commission_amount numeric default null,
  _manual_commission_reason text default null,
  _occurred_at timestamptz default now(),
  _received boolean default true
)
returns public.financial_entries
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  e public.financial_entries%rowtype;
  method_id uuid;
  center_id uuid;
  discount_amount numeric := 0;
  charged numeric;
  fee numeric := 0;
  net numeric;
  c record;
  commission_value numeric := 0;
  commission_kind text;
  commission_base text;
  commission_percentage numeric;
  commission_fixed numeric;
  manual_override boolean := false;
  session_id uuid;
begin
  if _appointment_id is null then raise exception 'appointment_id é obrigatório'; end if;
  if _professional_id is null then raise exception 'professional_id é obrigatório'; end if;
  if _original_amount < 0 then raise exception 'Valor original inválido'; end if;
  if _installments < 1 then raise exception 'Parcelas inválidas'; end if;

  select * into e from public.financial_entries
  where appointment_id=_appointment_id and status <> 'cancelled'
  order by created_at desc limit 1;
  if found then return e; end if;

  if _received then
    select id into method_id from public.payment_methods
    where code=_payment_method_code and is_active=true limit 1;
    if method_id is null then
      raise exception 'Forma de pagamento não encontrada: %', coalesce(_payment_method_code,'(não informada)');
    end if;
  else
    method_id := null;
  end if;

  if _cost_center_code is not null then
    select id into center_id from public.cost_centers where code=_cost_center_code and is_active=true limit 1;
  end if;

  if _discount_type is null then
    discount_amount := 0;
  elsif _discount_type='percent' then
    if _discount_value < 0 or _discount_value > 100 then raise exception 'Percentual de desconto inválido'; end if;
    discount_amount := round(_original_amount*_discount_value/100.0,2);
  elsif _discount_type='amount' then
    discount_amount := round(_discount_value,2);
  else
    raise exception 'Tipo de desconto inválido';
  end if;
  if discount_amount < 0 or discount_amount > _original_amount then raise exception 'Desconto inválido'; end if;

  charged := round(_original_amount-discount_amount,2);
  if _received then
    fee := coalesce(public.calculate_payment_fee(method_id,charged,_installments,(_occurred_at at time zone 'America/Fortaleza')::date),0);
  else
    fee := 0;
  end if;
  if fee > charged then raise exception 'Taxa maior que o valor recebido'; end if;
  net := round(charged-fee,2);

  insert into public.financial_entries(
    appointment_id,client_id,professional_id,service_id,patient_name_snapshot,
    professional_name_snapshot,service_name_snapshot,occurred_at,original_amount,
    discount_type,discount_value,discount_amount,charged_amount,card_fee_amount,
    net_amount,payment_method_id,installments,cost_center_id,status,received_at,
    source,discount_applied_by,created_by
  ) values (
    _appointment_id,_client_id,_professional_id,_service_id,nullif(trim(_patient_name),''),
    nullif(trim(_professional_name),''),nullif(trim(_service_name),''),_occurred_at,
    round(_original_amount,2),_discount_type,coalesce(_discount_value,0),discount_amount,
    charged,fee,net,method_id,_installments,center_id,
    case when _received then 'received' else 'pending' end,
    case when _received then _occurred_at else null end,'appointment',auth.uid(),auth.uid()
  ) returning * into e;

  if _manual_commission_amount is not null then
    if _manual_commission_amount < 0 or _manual_commission_amount > net then raise exception 'Comissão manual inválida'; end if;
    if nullif(trim(_manual_commission_reason),'') is null then raise exception 'Informe o motivo do ajuste manual da comissão'; end if;
    commission_value := round(_manual_commission_amount,2);
    commission_kind := 'manual';
    commission_base := 'manual';
    manual_override := true;
  else
    select * into c from public.calculate_professional_commission(
      _professional_id,_original_amount,charged,net,(_occurred_at at time zone 'America/Fortaleza')::date
    ) limit 1;
    if found then
      commission_value := round(coalesce(c.commission_amount,0),2);
      commission_kind := c.commission_type;
      commission_base := c.calculation_base;
      commission_percentage := c.percentage;
      commission_fixed := c.fixed_amount;
    else
      commission_value := 0;
      commission_kind := 'manual';
      commission_base := 'manual';
    end if;
  end if;
  if commission_value > net then raise exception 'Comissão calculada maior que o valor líquido'; end if;

  insert into public.professional_commissions(
    financial_entry_id,professional_id,commission_type,calculation_base,base_amount,
    percentage,fixed_amount,commission_amount,clinic_amount,is_manual_override,
    override_reason,created_by
  ) values (
    e.id,_professional_id,commission_kind,commission_base,
    case commission_base when 'original' then round(_original_amount,2) when 'after_discount' then charged when 'net_after_fees' then net else net end,
    commission_percentage,commission_fixed,commission_value,round(net-commission_value,2),
    manual_override,case when manual_override then nullif(trim(_manual_commission_reason),'') else null end,auth.uid()
  );

  if _received then
    select cs.id into session_id from public.cash_sessions cs
    where cs.business_date=(_occurred_at at time zone 'America/Fortaleza')::date and cs.status='open'
    order by cs.opened_at desc limit 1;
    if session_id is null then raise exception 'Abra o caixa do dia antes de finalizar um atendimento recebido.'; end if;
    insert into public.cash_movements(
      cash_session_id,movement_type,payment_method_id,financial_entry_id,amount,
      description,occurred_at,created_by
    ) values (
      session_id,'income',method_id,e.id,charged,'Atendimento finalizado',_occurred_at,auth.uid()
    );
  end if;
  return e;
end;
$$;

create or replace function public.complete_appointment_financially(
  _appointment_id uuid,
  _original_amount numeric default null,
  _payment_received boolean default true,
  _payment_method_code text default null,
  _installments integer default 1,
  _discount_type text default null,
  _discount_value numeric default 0,
  _receivable_due_date date default null,
  _manual_commission_amount numeric default null,
  _manual_commission_reason text default null
)
returns public.appointments
language plpgsql
security definer
set search_path to ''
as $$
declare
  _appointment public.appointments%rowtype;
  _service_price numeric;
  _amount numeric;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso insuficiente para finalizar atendimento.';
  end if;

  select * into _appointment from public.appointments a where a.id=_appointment_id for update;
  if not found then raise exception 'Atendimento não encontrado.'; end if;
  if _appointment.status <> 'confirmado' then raise exception 'Somente atendimentos confirmados podem ser finalizados.'; end if;
  if _appointment.professional_id is null then raise exception 'Defina o profissional antes de finalizar.'; end if;

  select s.price into _service_price from public.services s where s.id=_appointment.service_id;
  _amount := coalesce(_original_amount,_appointment.custom_price,_service_price,0);
  if _amount < 0 then raise exception 'Valor do procedimento inválido.'; end if;
  if coalesce(_installments,1) < 1 then raise exception 'Quantidade de parcelas inválida.'; end if;
  if _payment_received and nullif(trim(_payment_method_code),'') is null then raise exception 'Informe a forma de pagamento.'; end if;
  if not _payment_received and _receivable_due_date is null then raise exception 'Informe o vencimento do valor a receber.'; end if;
  if _manual_commission_amount is not null and nullif(trim(_manual_commission_reason),'') is null then
    raise exception 'Informe o motivo do ajuste manual da comissão.';
  end if;

  update public.appointments
  set custom_price=_amount,
      payment_received=_payment_received,
      payment_method_code=case when _payment_received then _payment_method_code else payment_method_code end,
      installments=coalesce(_installments,1),
      discount_type=nullif(trim(_discount_type),''),
      discount_value=coalesce(_discount_value,0),
      receivable_due_date=case when _payment_received then null else _receivable_due_date end,
      manual_commission_amount=_manual_commission_amount,
      manual_commission_reason=case when _manual_commission_amount is null then null else nullif(trim(_manual_commission_reason),'') end,
      status='atendido',attended_at=now(),status_updated_at=now()
  where id=_appointment_id
  returning * into _appointment;

  return _appointment;
end;
$$;

create or replace function public.mark_appointment_attended(_appointment_id uuid)
returns public.appointments
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  raise exception 'Finalize este atendimento em Financeiro > Finalizar atendimento para informar pagamento, desconto, fiado e comissão.';
end;
$$;

revoke execute on function public.register_attended_financial_entry(uuid,uuid,uuid,uuid,text,text,text,numeric,text,integer,text,numeric,text,numeric,text,timestamptz,boolean) from public,anon,authenticated;
revoke all on function public.complete_appointment_financially(uuid,numeric,boolean,text,integer,text,numeric,date,numeric,text) from public,anon;
grant execute on function public.complete_appointment_financially(uuid,numeric,boolean,text,integer,text,numeric,date,numeric,text) to authenticated;
revoke all on function public.mark_appointment_attended(uuid) from public,anon;
grant execute on function public.mark_appointment_attended(uuid) to authenticated;
