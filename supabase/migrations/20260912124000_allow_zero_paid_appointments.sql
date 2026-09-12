-- Permite finalizar atendimentos com valor R$ 0,00 para clientes que já pagaram antecipadamente.
-- Nesses casos não há nova movimentação de caixa nem taxa de pagamento.

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
set search_path = ''
as $function$
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
  a public.appointments%rowtype;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;
  if _appointment_id is null then raise exception 'appointment_id é obrigatório'; end if;
  if _professional_id is null then raise exception 'professional_id é obrigatório'; end if;
  if _original_amount is null or _original_amount < 0 then raise exception 'Valor original inválido'; end if;
  if coalesce(_installments,1) < 1 then raise exception 'Parcelas inválidas'; end if;

  select * into a from public.appointments where id = _appointment_id;
  if not found then raise exception 'Atendimento não encontrado.'; end if;
  if a.status <> 'atendido' and not (
    a.status = 'confirmado'
    and (select count(*) from public.appointment_sessions ps where ps.appointment_id = a.id) > 1
  ) then
    raise exception 'O atendimento precisa estar atendido ou ser um pacote confirmado.';
  end if;
  if a.professional_id is distinct from _professional_id then
    raise exception 'Profissional financeiro divergente do atendimento.';
  end if;

  select * into e
  from public.financial_entries
  where appointment_id = _appointment_id
    and status <> 'cancelled'
  order by created_at desc
  limit 1;
  if found then return e; end if;

  if _cost_center_code is not null then
    select id into center_id
    from public.cost_centers
    where code = _cost_center_code and is_active = true
    limit 1;
  end if;
  if center_id is null and _service_id is not null then
    select scc.cost_center_id into center_id
    from public.service_cost_centers scc
    join public.cost_centers cc on cc.id = scc.cost_center_id
    where scc.service_id = _service_id and cc.is_active = true
    limit 1;
  end if;

  if _discount_type is null then
    discount_amount := 0;
  elsif _discount_type = 'percent' then
    if coalesce(_discount_value,0) < 0 or _discount_value > 100 then
      raise exception 'Percentual de desconto inválido';
    end if;
    discount_amount := round(_original_amount * _discount_value / 100.0, 2);
  elsif _discount_type = 'amount' then
    discount_amount := round(coalesce(_discount_value,0),2);
  else
    raise exception 'Tipo de desconto inválido';
  end if;

  if discount_amount < 0 or discount_amount > _original_amount then
    raise exception 'Desconto inválido';
  end if;

  charged := round(_original_amount - discount_amount, 2);

  -- R$ 0,00 representa atendimento já pago anteriormente: não exige forma de pagamento,
  -- caixa aberto ou nova movimentação de caixa.
  if _received and charged > 0 then
    select id into method_id
    from public.payment_methods
    where code = _payment_method_code and is_active = true
    limit 1;
    if method_id is null then
      raise exception 'Forma de pagamento não encontrada: %', coalesce(_payment_method_code,'(não informada)');
    end if;

    select cs.id into session_id
    from public.cash_sessions cs
    where cs.business_date = (_occurred_at at time zone 'America/Fortaleza')::date
      and cs.status = 'open'
    order by cs.opened_at desc
    limit 1;
    if session_id is null then
      raise exception 'Abra o caixa do dia antes de finalizar um atendimento recebido.';
    end if;

    fee := coalesce(public.calculate_payment_fee(
      method_id,
      charged,
      _installments,
      (_occurred_at at time zone 'America/Fortaleza')::date
    ),0);
  else
    method_id := null;
    session_id := null;
    fee := 0;
  end if;

  if fee > charged then raise exception 'Taxa maior que o valor recebido'; end if;
  net := round(charged - fee, 2);

  insert into public.financial_entries(
    appointment_id,client_id,professional_id,service_id,
    patient_name_snapshot,professional_name_snapshot,service_name_snapshot,
    occurred_at,original_amount,discount_type,discount_value,discount_amount,
    charged_amount,card_fee_amount,net_amount,payment_method_id,installments,
    cost_center_id,status,received_at,source,discount_applied_by,created_by
  ) values (
    _appointment_id,_client_id,_professional_id,_service_id,
    nullif(trim(_patient_name),''),nullif(trim(_professional_name),''),nullif(trim(_service_name),''),
    _occurred_at,round(_original_amount,2),_discount_type,coalesce(_discount_value,0),discount_amount,
    charged,fee,net,method_id,_installments,center_id,
    case when _received then 'received' else 'pending' end,
    case when _received then _occurred_at else null end,
    'appointment',case when discount_amount > 0 then auth.uid() else null end,auth.uid()
  ) returning * into e;

  if charged = 0 then
    commission_value := 0;
    commission_kind := 'manual';
    commission_base := 'manual';
    commission_percentage := null;
    commission_fixed := null;
    manual_override := false;
  elsif _manual_commission_amount is not null then
    if _manual_commission_amount < 0 or _manual_commission_amount > net then
      raise exception 'Comissão manual inválida';
    end if;
    if nullif(trim(_manual_commission_reason),'') is null then
      raise exception 'Informe o motivo do ajuste manual da comissão';
    end if;
    commission_value := round(_manual_commission_amount,2);
    commission_kind := 'manual';
    commission_base := 'manual';
    manual_override := true;
  else
    select * into c
    from public.calculate_professional_commission(
      _professional_id,
      _original_amount,
      charged,
      net,
      (_occurred_at at time zone 'America/Fortaleza')::date
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
    financial_entry_id,professional_id,commission_type,calculation_base,
    base_amount,percentage,fixed_amount,commission_amount,clinic_amount,
    is_manual_override,override_reason,created_by
  ) values (
    e.id,_professional_id,commission_kind,commission_base,
    case commission_base
      when 'original' then round(_original_amount,2)
      when 'after_discount' then charged
      when 'net_after_fees' then net
      else net
    end,
    commission_percentage,commission_fixed,commission_value,
    round(net - commission_value,2),manual_override,
    case when manual_override then nullif(trim(_manual_commission_reason),'') else null end,
    auth.uid()
  );

  if _received and charged > 0 then
    insert into public.cash_movements(
      cash_session_id,movement_type,payment_method_id,financial_entry_id,
      amount,description,occurred_at,created_by
    ) values (
      session_id,'income',method_id,e.id,charged,'Atendimento finalizado',_occurred_at,auth.uid()
    );
  end if;

  return e;
end;
$function$;

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
set search_path = ''
as $function$
declare
  a public.appointments%rowtype;
  service_name text;
  service_price numeric;
  professional_name text;
  amount numeric;
  entry public.financial_entries%rowtype;
  happened_at timestamptz := now();
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso insuficiente para finalizar atendimento.';
  end if;

  select * into a from public.appointments where id = _appointment_id for update;
  if not found then raise exception 'Atendimento não encontrado.'; end if;
  if a.status <> 'confirmado' then raise exception 'Somente atendimentos confirmados podem ser finalizados.'; end if;
  if a.professional_id is null then raise exception 'Defina o profissional antes de finalizar.'; end if;

  select s.name,s.price into service_name,service_price
  from public.services s where s.id = a.service_id;
  if not found then raise exception 'Serviço do atendimento não foi encontrado.'; end if;

  select p.name into professional_name
  from public.professionals p
  where p.id = a.professional_id and p.deleted_at is null;
  if professional_name is null then
    raise exception 'Profissional do atendimento não foi encontrado ou está inativo.';
  end if;

  amount := coalesce(_original_amount,a.custom_price,a.service_price_snapshot,service_price,0);
  if amount < 0 then raise exception 'Valor do procedimento inválido.'; end if;
  if coalesce(_installments,1) < 1 then raise exception 'Quantidade de parcelas inválida.'; end if;

  if _payment_received and amount > 0 and nullif(trim(_payment_method_code),'') is null then
    raise exception 'Informe a forma de pagamento.';
  end if;
  if not _payment_received and _receivable_due_date is null then
    raise exception 'Informe o vencimento do valor a receber.';
  end if;
  if _manual_commission_amount is not null and nullif(trim(_manual_commission_reason),'') is null then
    raise exception 'Informe o motivo do ajuste manual da comissão.';
  end if;

  update public.appointments
     set custom_price = amount,
         professional_name_snapshot = professional_name,
         payment_received = _payment_received,
         payment_method_code = case when _payment_received and amount > 0 then _payment_method_code else null end,
         installments = coalesce(_installments,1),
         discount_type = nullif(trim(_discount_type),''),
         discount_value = coalesce(_discount_value,0),
         receivable_due_date = case when _payment_received then null else _receivable_due_date end,
         manual_commission_amount = _manual_commission_amount,
         manual_commission_reason = case when _manual_commission_amount is null then null else nullif(trim(_manual_commission_reason),'') end,
         status = case
           when (select count(*) from public.appointment_sessions ps where ps.appointment_id = _appointment_id) > 1
            and exists(select 1 from public.appointment_sessions ps where ps.appointment_id = _appointment_id and ps.status = 'pending')
           then 'confirmado'
           else 'atendido'
         end,
         attended_at = case
           when (select count(*) from public.appointment_sessions ps where ps.appointment_id = _appointment_id) > 1
            and exists(select 1 from public.appointment_sessions ps where ps.appointment_id = _appointment_id and ps.status = 'pending')
           then attended_at
           else happened_at
         end,
         status_updated_at = happened_at
   where id = _appointment_id
   returning * into a;

  select * into entry
  from public.register_attended_financial_entry(
    a.id,a.client_id,a.professional_id,a.service_id,a.patient_name,
    professional_name,service_name,amount,
    case when _payment_received and amount > 0 then _payment_method_code else null end,
    coalesce(_installments,1),nullif(trim(_discount_type),''),coalesce(_discount_value,0),
    a.cost_center_code,_manual_commission_amount,_manual_commission_reason,happened_at,_payment_received
  );

  if not _payment_received and entry.charged_amount > 0 then
    insert into public.accounts_receivable(
      appointment_id,client_id,service_id,client_name_snapshot,service_name_snapshot,
      original_amount,amount_received,due_date,status,payment_method_id,installments,created_by,notes
    ) values (
      a.id,a.client_id,a.service_id,a.patient_name,service_name,
      entry.charged_amount,0,_receivable_due_date,'pending',null,
      coalesce(_installments,1),auth.uid(),
      'Gerado automaticamente ao concluir atendimento sem recebimento.'
    )
    on conflict(appointment_id) where appointment_id is not null and status <> 'cancelled' do nothing;
  end if;

  return a;
end;
$function$;

revoke all on function public.register_attended_financial_entry(uuid,uuid,uuid,uuid,text,text,text,numeric,text,integer,text,numeric,text,numeric,text,timestamptz,boolean) from public;
grant execute on function public.register_attended_financial_entry(uuid,uuid,uuid,uuid,text,text,text,numeric,text,integer,text,numeric,text,numeric,text,timestamptz,boolean) to authenticated;

revoke all on function public.complete_appointment_financially(uuid,numeric,boolean,text,integer,text,numeric,date,numeric,text) from public;
grant execute on function public.complete_appointment_financially(uuid,numeric,boolean,text,integer,text,numeric,date,numeric,text) to authenticated;
