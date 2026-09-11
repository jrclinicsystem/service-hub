-- Fix pagamento misto: permite registrar mais de uma forma sem colidir com o índice
-- de cash_movements que aceita apenas um vínculo direto por financial_entry_id.
-- A primeira movimentação mantém o vínculo com a entrada financeira; as demais
-- preservam a forma/valor no caixa e o detalhamento completo continua em
-- financial_entry_payments.

create or replace function public.complete_appointment_financially_mixed(_appointment_id uuid, _payments jsonb, _original_amount numeric default null::numeric, _discount_type text default null::text, _discount_value numeric default 0, _manual_commission_amount numeric default null::numeric, _manual_commission_reason text default null::text)
returns public.appointments
language plpgsql
security definer
set search_path to ''
as $function$
declare
  a public.appointments%rowtype;
  v_service_name text; v_service_price numeric; v_professional_name text;
  v_amount numeric; v_discount numeric := 0; v_charged numeric; v_total_payments numeric;
  v_total_fee numeric := 0; v_net numeric; v_entry public.financial_entries%rowtype;
  v_payment jsonb; v_method_id uuid; v_payment_amount numeric; v_fee numeric; v_installments integer;
  v_session_id uuid; v_mixed_method_id uuid; v_center_id uuid; v_commission record;
  v_commission_value numeric := 0; v_commission_kind text; v_commission_base text;
  v_commission_percentage numeric; v_commission_fixed numeric; v_manual_override boolean := false;
  v_now timestamptz := now(); v_payment_index integer := 0;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then raise exception 'Acesso insuficiente para finalizar atendimento.'; end if;
  if jsonb_typeof(_payments) <> 'array' or jsonb_array_length(_payments) < 2 then raise exception 'Informe pelo menos duas formas de pagamento.'; end if;
  select * into a from public.appointments ap where ap.id=_appointment_id for update;
  if not found then raise exception 'Atendimento não encontrado.'; end if;
  if a.status <> 'confirmado' then raise exception 'Somente atendimentos confirmados podem ser finalizados.'; end if;
  if a.professional_id is null then raise exception 'Defina o profissional antes de finalizar.'; end if;
  select s.name,s.price into v_service_name,v_service_price from public.services s where s.id=a.service_id;
  if not found then raise exception 'Serviço do atendimento não foi encontrado.'; end if;
  select p.name into v_professional_name from public.professionals p where p.id=a.professional_id and p.deleted_at is null;
  if v_professional_name is null then raise exception 'Profissional não encontrado ou inativo.'; end if;
  v_amount:=coalesce(_original_amount,a.custom_price,a.service_price_snapshot,v_service_price,0);
  if v_amount<0 then raise exception 'Valor original inválido.'; end if;
  if _discount_type is null or nullif(trim(_discount_type),'') is null then v_discount:=0;
  elsif _discount_type='percent' then if coalesce(_discount_value,0)<0 or _discount_value>100 then raise exception 'Percentual de desconto inválido.'; end if; v_discount:=round(v_amount*coalesce(_discount_value,0)/100.0,2);
  elsif _discount_type='amount' then v_discount:=round(coalesce(_discount_value,0),2);
  else raise exception 'Tipo de desconto inválido.'; end if;
  if v_discount<0 or v_discount>v_amount then raise exception 'Desconto inválido.'; end if;
  v_charged:=round(v_amount-v_discount,2);
  select coalesce(sum((x->>'amount')::numeric),0) into v_total_payments from jsonb_array_elements(_payments) x;
  if abs(round(v_total_payments,2)-v_charged)>0.009 then raise exception 'A soma dos pagamentos (%) precisa ser igual ao valor final (%).',round(v_total_payments,2),v_charged; end if;
  select cs.id into v_session_id from public.cash_sessions cs where cs.business_date=(v_now at time zone 'America/Fortaleza')::date and cs.status='open' order by cs.opened_at desc limit 1;
  if v_session_id is null then raise exception 'Abra o caixa do dia antes de finalizar um atendimento recebido.'; end if;
  for v_payment in select * from jsonb_array_elements(_payments) loop
    v_payment_amount:=round((v_payment->>'amount')::numeric,2); v_installments:=coalesce(nullif(v_payment->>'installments','')::integer,1);
    if v_payment_amount<=0 then raise exception 'Todos os pagamentos precisam ter valor maior que zero.'; end if;
    if v_installments<1 or v_installments>12 then raise exception 'Parcelas inválidas.'; end if;
    select pm.id into v_method_id from public.payment_methods pm where pm.code=(v_payment->>'method_code') and pm.is_active=true limit 1;
    if v_method_id is null then raise exception 'Forma de pagamento inválida: %',coalesce(v_payment->>'method_code',''); end if;
    v_fee:=coalesce(public.calculate_payment_fee(v_method_id,v_payment_amount,v_installments,(v_now at time zone 'America/Fortaleza')::date),0);
    if v_fee>v_payment_amount then raise exception 'Taxa maior que uma das parcelas recebidas.'; end if;
    v_total_fee:=v_total_fee+v_fee;
  end loop;
  v_total_fee:=round(v_total_fee,2); v_net:=round(v_charged-v_total_fee,2);
  select pm.id into v_mixed_method_id from public.payment_methods pm where pm.code='mixed' limit 1;
  if a.cost_center_code is not null then select cc.id into v_center_id from public.cost_centers cc where cc.code=a.cost_center_code and cc.is_active=true limit 1; end if;
  if v_center_id is null and a.service_id is not null then select scc.cost_center_id into v_center_id from public.service_cost_centers scc join public.cost_centers cc on cc.id=scc.cost_center_id where scc.service_id=a.service_id and cc.is_active=true limit 1; end if;
  update public.appointments ap set custom_price=v_amount,professional_name_snapshot=v_professional_name,payment_received=true,payment_method_code='mixed',installments=1,discount_type=nullif(trim(_discount_type),''),discount_value=coalesce(_discount_value,0),receivable_due_date=null,manual_commission_amount=_manual_commission_amount,manual_commission_reason=case when _manual_commission_amount is null then null else nullif(trim(_manual_commission_reason),'') end,status=case when (select count(*) from public.appointment_sessions ps where ps.appointment_id=_appointment_id)>1 and exists(select 1 from public.appointment_sessions ps where ps.appointment_id=_appointment_id and ps.status='pending') then 'confirmado' else 'atendido' end,attended_at=case when (select count(*) from public.appointment_sessions ps where ps.appointment_id=_appointment_id)>1 and exists(select 1 from public.appointment_sessions ps where ps.appointment_id=_appointment_id and ps.status='pending') then ap.attended_at else v_now end,status_updated_at=v_now where ap.id=_appointment_id returning * into a;
  insert into public.financial_entries(appointment_id,client_id,professional_id,service_id,patient_name_snapshot,professional_name_snapshot,service_name_snapshot,occurred_at,original_amount,discount_type,discount_value,discount_amount,charged_amount,card_fee_amount,net_amount,payment_method_id,installments,cost_center_id,status,received_at,source,discount_applied_by,created_by,notes)
  values(a.id,a.client_id,a.professional_id,a.service_id,a.patient_name,v_professional_name,v_service_name,v_now,round(v_amount,2),nullif(trim(_discount_type),''),coalesce(_discount_value,0),v_discount,v_charged,v_total_fee,v_net,v_mixed_method_id,1,v_center_id,'received',v_now,'appointment',case when v_discount>0 then auth.uid() else null end,auth.uid(),'Pagamento misto') returning * into v_entry;
  if _manual_commission_amount is not null then if _manual_commission_amount<0 or _manual_commission_amount>v_net then raise exception 'Comissão manual inválida.'; end if; if nullif(trim(_manual_commission_reason),'') is null then raise exception 'Informe o motivo do ajuste manual da comissão.'; end if; v_commission_value:=round(_manual_commission_amount,2);v_commission_kind:='manual';v_commission_base:='manual';v_manual_override:=true;
  else select * into v_commission from public.calculate_professional_commission(a.professional_id,v_amount,v_charged,v_net,(v_now at time zone 'America/Fortaleza')::date) limit 1; if found then v_commission_value:=round(coalesce(v_commission.commission_amount,0),2);v_commission_kind:=v_commission.commission_type;v_commission_base:=v_commission.calculation_base;v_commission_percentage:=v_commission.percentage;v_commission_fixed:=v_commission.fixed_amount; else v_commission_value:=0;v_commission_kind:='manual';v_commission_base:='manual'; end if; end if;
  if v_commission_value>v_net then raise exception 'Comissão calculada maior que o valor líquido.'; end if;
  insert into public.professional_commissions(financial_entry_id,professional_id,commission_type,calculation_base,base_amount,percentage,fixed_amount,commission_amount,clinic_amount,is_manual_override,override_reason,created_by) values(v_entry.id,a.professional_id,v_commission_kind,v_commission_base,case v_commission_base when 'original' then round(v_amount,2) when 'after_discount' then v_charged when 'net_after_fees' then v_net else v_net end,v_commission_percentage,v_commission_fixed,v_commission_value,round(v_net-v_commission_value,2),v_manual_override,case when v_manual_override then nullif(trim(_manual_commission_reason),'') else null end,auth.uid());
  for v_payment in select * from jsonb_array_elements(_payments) loop
    v_payment_index:=v_payment_index+1; v_payment_amount:=round((v_payment->>'amount')::numeric,2); v_installments:=coalesce(nullif(v_payment->>'installments','')::integer,1);
    select pm.id into v_method_id from public.payment_methods pm where pm.code=(v_payment->>'method_code') and pm.is_active=true limit 1;
    v_fee:=coalesce(public.calculate_payment_fee(v_method_id,v_payment_amount,v_installments,(v_now at time zone 'America/Fortaleza')::date),0);
    insert into public.financial_entry_payments(financial_entry_id,payment_method_id,amount,fee_amount,net_amount,installments,created_by) values(v_entry.id,v_method_id,v_payment_amount,v_fee,round(v_payment_amount-v_fee,2),v_installments,auth.uid());
    insert into public.cash_movements(cash_session_id,movement_type,payment_method_id,financial_entry_id,amount,description,occurred_at,created_by) values(v_session_id,'income',v_method_id,case when v_payment_index=1 then v_entry.id else null end,v_payment_amount,'Atendimento finalizado — pagamento misto · entrada '||v_entry.id::text,v_now,auth.uid());
  end loop;
  return a;
end;
$function$;
