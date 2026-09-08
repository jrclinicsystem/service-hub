-- Entradas manuais sem comissão e pagamentos mistos por atendimento.

create table if not exists public.financial_entry_payments (
  id uuid primary key default gen_random_uuid(),
  financial_entry_id uuid not null references public.financial_entries(id) on delete cascade,
  payment_method_id uuid not null references public.payment_methods(id),
  amount numeric(12,2) not null check (amount > 0),
  fee_amount numeric(12,2) not null default 0 check (fee_amount >= 0),
  net_amount numeric(12,2) not null check (net_amount >= 0),
  installments integer not null default 1 check (installments between 1 and 12),
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists financial_entry_payments_entry_idx on public.financial_entry_payments(financial_entry_id);
create index if not exists financial_entry_payments_method_idx on public.financial_entry_payments(payment_method_id);
alter table public.financial_entry_payments enable row level security;
drop policy if exists financial_entry_payments_read on public.financial_entry_payments;
create policy financial_entry_payments_read on public.financial_entry_payments for select to authenticated
using (public.finance_has_role(array['admin','finance','reception','professional']));

insert into public.payment_methods(code,name,is_card,is_cash,is_active,sort_order)
values ('mixed','Pagamento misto',false,false,false,999)
on conflict (code) do update set name=excluded.name;

create or replace function public.finance_require_open_cash_for_received_entry()
returns trigger language plpgsql set search_path='public' as $function$
declare _business_date date;
begin
  if new.status='received' and coalesce(new.charged_amount,0)>0
     and coalesce(new.source,'appointment')<>'manual'
     and (tg_op='INSERT' or old.status is distinct from 'received') then
    _business_date := (coalesce(new.received_at,new.occurred_at,now()) at time zone 'America/Fortaleza')::date;
    if not exists(select 1 from public.cash_sessions cs where cs.business_date=_business_date and cs.status='open') then
      raise exception 'Abra o caixa do dia antes de registrar um recebimento.';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.register_manual_financial_entry(
  _description text,_amount numeric,_payment_method_code text,_installments integer default 1,
  _occurred_at timestamptz default now(),_notes text default null
)
returns public.financial_entries language plpgsql security definer set search_path='' as $function$
declare
  v_entry public.financial_entries%rowtype; v_method_id uuid; v_fee numeric(12,2):=0;
  v_net numeric(12,2); v_session_id uuid;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then raise exception 'Acesso insuficiente para registrar entrada manual.'; end if;
  if nullif(trim(_description),'') is null then raise exception 'Informe a descrição da entrada.'; end if;
  if _amount is null or _amount<=0 then raise exception 'Informe um valor maior que zero.'; end if;
  if coalesce(_installments,1)<1 or coalesce(_installments,1)>12 then raise exception 'Parcelas inválidas.'; end if;
  select id into v_method_id from public.payment_methods where code=_payment_method_code and is_active=true limit 1;
  if v_method_id is null then raise exception 'Forma de pagamento não encontrada.'; end if;
  v_fee:=coalesce(public.calculate_payment_fee(v_method_id,round(_amount,2),coalesce(_installments,1),(_occurred_at at time zone 'America/Fortaleza')::date),0);
  if v_fee>_amount then raise exception 'Taxa maior que o valor da entrada.'; end if;
  v_net:=round(_amount-v_fee,2);
  insert into public.financial_entries(appointment_id,client_id,professional_id,service_id,patient_name_snapshot,professional_name_snapshot,service_name_snapshot,occurred_at,original_amount,discount_type,discount_value,discount_amount,charged_amount,card_fee_amount,net_amount,payment_method_id,installments,cost_center_id,status,received_at,source,created_by,notes)
  values(null,null,null,null,null,null,trim(_description),_occurred_at,round(_amount,2),null,0,0,round(_amount,2),v_fee,v_net,v_method_id,coalesce(_installments,1),null,'received',_occurred_at,'manual',auth.uid(),nullif(trim(_notes),'')) returning * into v_entry;
  insert into public.financial_entry_payments(financial_entry_id,payment_method_id,amount,fee_amount,net_amount,installments,created_by)
  values(v_entry.id,v_method_id,round(_amount,2),v_fee,v_net,coalesce(_installments,1),auth.uid());
  select cs.id into v_session_id from public.cash_sessions cs where cs.business_date=(_occurred_at at time zone 'America/Fortaleza')::date and cs.status='open' order by cs.opened_at desc limit 1;
  if v_session_id is not null then
    insert into public.cash_movements(cash_session_id,movement_type,payment_method_id,financial_entry_id,amount,description,occurred_at,created_by)
    values(v_session_id,'income',v_method_id,v_entry.id,round(_amount,2),'Entrada manual — '||trim(_description),_occurred_at,auth.uid());
  end if;
  return v_entry;
end;
$function$;
grant execute on function public.register_manual_financial_entry(text,numeric,text,integer,timestamptz,text) to authenticated;

create or replace function public.complete_appointment_financially_mixed(
  _appointment_id uuid,_payments jsonb,_original_amount numeric default null,_discount_type text default null,
  _discount_value numeric default 0,_manual_commission_amount numeric default null,_manual_commission_reason text default null
)
returns public.appointments language plpgsql security definer set search_path='' as $function$
declare
  a public.appointments%rowtype; v_service_name text; v_service_price numeric; v_professional_name text;
  v_amount numeric; v_discount numeric:=0; v_charged numeric; v_total_payments numeric; v_total_fee numeric:=0; v_net numeric;
  v_entry public.financial_entries%rowtype; v_payment jsonb; v_method_id uuid; v_payment_amount numeric; v_fee numeric;
  v_installments integer; v_session_id uuid; v_mixed_method_id uuid; v_center_id uuid; v_commission record;
  v_commission_value numeric:=0; v_commission_kind text; v_commission_base text; v_commission_percentage numeric;
  v_commission_fixed numeric; v_manual_override boolean:=false; v_now timestamptz:=now();
begin
  if not public.finance_has_role(array['admin','finance','reception']) then raise exception 'Acesso insuficiente para finalizar atendimento.'; end if;
  if jsonb_typeof(_payments)<>'array' or jsonb_array_length(_payments)<2 then raise exception 'Informe pelo menos duas formas de pagamento.'; end if;
  select * into a from public.appointments where id=_appointment_id for update;
  if not found then raise exception 'Atendimento não encontrado.'; end if;
  if a.status<>'confirmado' then raise exception 'Somente atendimentos confirmados podem ser finalizados.'; end if;
  if a.professional_id is null then raise exception 'Defina o profissional antes de finalizar.'; end if;
  select s.name,s.price into v_service_name,v_service_price from public.services s where s.id=a.service_id;
  if not found then raise exception 'Serviço do atendimento não foi encontrado.'; end if;
  select p.name into v_professional_name from public.professionals p where p.id=a.professional_id and p.deleted_at is null;
  if v_professional_name is null then raise exception 'Profissional não encontrado ou inativo.'; end if;
  v_amount:=coalesce(_original_amount,a.custom_price,a.service_price_snapshot,v_service_price,0);
  if v_amount<0 then raise exception 'Valor original inválido.'; end if;
  if _discount_type is null or nullif(trim(_discount_type),'') is null then v_discount:=0;
  elsif _discount_type='percent' then
    if coalesce(_discount_value,0)<0 or _discount_value>100 then raise exception 'Percentual de desconto inválido.'; end if;
    v_discount:=round(v_amount*coalesce(_discount_value,0)/100.0,2);
  elsif _discount_type='amount' then v_discount:=round(coalesce(_discount_value,0),2);
  else raise exception 'Tipo de desconto inválido.'; end if;
  if v_discount<0 or v_discount>v_amount then raise exception 'Desconto inválido.'; end if;
  v_charged:=round(v_amount-v_discount,2);
  select coalesce(sum((x->>'amount')::numeric),0) into v_total_payments from jsonb_array_elements(_payments) x;
  if abs(round(v_total_payments,2)-v_charged)>0.009 then raise exception 'A soma dos pagamentos precisa ser igual ao valor final.'; end if;
  select cs.id into v_session_id from public.cash_sessions cs where cs.business_date=(v_now at time zone 'America/Fortaleza')::date and cs.status='open' order by cs.opened_at desc limit 1;
  if v_session_id is null then raise exception 'Abra o caixa do dia antes de finalizar um atendimento recebido.'; end if;
  for v_payment in select * from jsonb_array_elements(_payments) loop
    v_payment_amount:=round((v_payment->>'amount')::numeric,2); v_installments:=coalesce(nullif(v_payment->>'installments','')::integer,1);
    if v_payment_amount<=0 then raise exception 'Todos os pagamentos precisam ter valor maior que zero.'; end if;
    if v_installments<1 or v_installments>12 then raise exception 'Parcelas inválidas.'; end if;
    select id into v_method_id from public.payment_methods where code=(v_payment->>'method_code') and is_active=true limit 1;
    if v_method_id is null then raise exception 'Forma de pagamento inválida.'; end if;
    v_fee:=coalesce(public.calculate_payment_fee(v_method_id,v_payment_amount,v_installments,(v_now at time zone 'America/Fortaleza')::date),0);
    if v_fee>v_payment_amount then raise exception 'Taxa maior que uma das partes recebidas.'; end if;
    v_total_fee:=v_total_fee+v_fee;
  end loop;
  v_total_fee:=round(v_total_fee,2); v_net:=round(v_charged-v_total_fee,2);
  select id into v_mixed_method_id from public.payment_methods where code='mixed' limit 1;
  if a.cost_center_code is not null then select id into v_center_id from public.cost_centers where code=a.cost_center_code and is_active=true limit 1; end if;
  if v_center_id is null and a.service_id is not null then select scc.cost_center_id into v_center_id from public.service_cost_centers scc join public.cost_centers cc on cc.id=scc.cost_center_id where scc.service_id=a.service_id and cc.is_active=true limit 1; end if;
  update public.appointments set custom_price=v_amount,professional_name_snapshot=v_professional_name,payment_received=true,payment_method_code='mixed',installments=1,discount_type=nullif(trim(_discount_type),''),discount_value=coalesce(_discount_value,0),receivable_due_date=null,manual_commission_amount=_manual_commission_amount,manual_commission_reason=case when _manual_commission_amount is null then null else nullif(trim(_manual_commission_reason),'') end,status='atendido',attended_at=v_now,status_updated_at=v_now where id=_appointment_id returning * into a;
  insert into public.financial_entries(appointment_id,client_id,professional_id,service_id,patient_name_snapshot,professional_name_snapshot,service_name_snapshot,occurred_at,original_amount,discount_type,discount_value,discount_amount,charged_amount,card_fee_amount,net_amount,payment_method_id,installments,cost_center_id,status,received_at,source,discount_applied_by,created_by,notes)
  values(a.id,a.client_id,a.professional_id,a.service_id,a.patient_name,v_professional_name,v_service_name,v_now,round(v_amount,2),nullif(trim(_discount_type),''),coalesce(_discount_value,0),v_discount,v_charged,v_total_fee,v_net,v_mixed_method_id,1,v_center_id,'received',v_now,'appointment',case when v_discount>0 then auth.uid() else null end,auth.uid(),'Pagamento misto') returning * into v_entry;
  if _manual_commission_amount is not null then
    if _manual_commission_amount<0 or _manual_commission_amount>v_net then raise exception 'Comissão manual inválida.'; end if;
    if nullif(trim(_manual_commission_reason),'') is null then raise exception 'Informe o motivo do ajuste manual da comissão.'; end if;
    v_commission_value:=round(_manual_commission_amount,2); v_commission_kind:='manual'; v_commission_base:='manual'; v_manual_override:=true;
  else
    select * into v_commission from public.calculate_professional_commission(a.professional_id,v_amount,v_charged,v_net,(v_now at time zone 'America/Fortaleza')::date) limit 1;
    if found then v_commission_value:=round(coalesce(v_commission.commission_amount,0),2); v_commission_kind:=v_commission.commission_type; v_commission_base:=v_commission.calculation_base; v_commission_percentage:=v_commission.percentage; v_commission_fixed:=v_commission.fixed_amount;
    else v_commission_value:=0; v_commission_kind:='manual'; v_commission_base:='manual'; end if;
  end if;
  if v_commission_value>v_net then raise exception 'Comissão calculada maior que o valor líquido.'; end if;
  insert into public.professional_commissions(financial_entry_id,professional_id,commission_type,calculation_base,base_amount,percentage,fixed_amount,commission_amount,clinic_amount,is_manual_override,override_reason,created_by)
  values(v_entry.id,a.professional_id,v_commission_kind,v_commission_base,case v_commission_base when 'original' then round(v_amount,2) when 'after_discount' then v_charged when 'net_after_fees' then v_net else v_net end,v_commission_percentage,v_commission_fixed,v_commission_value,round(v_net-v_commission_value,2),v_manual_override,case when v_manual_override then nullif(trim(_manual_commission_reason),'') else null end,auth.uid());
  for v_payment in select * from jsonb_array_elements(_payments) loop
    v_payment_amount:=round((v_payment->>'amount')::numeric,2); v_installments:=coalesce(nullif(v_payment->>'installments','')::integer,1);
    select id into v_method_id from public.payment_methods where code=(v_payment->>'method_code') and is_active=true limit 1;
    v_fee:=coalesce(public.calculate_payment_fee(v_method_id,v_payment_amount,v_installments,(v_now at time zone 'America/Fortaleza')::date),0);
    insert into public.financial_entry_payments(financial_entry_id,payment_method_id,amount,fee_amount,net_amount,installments,created_by) values(v_entry.id,v_method_id,v_payment_amount,v_fee,round(v_payment_amount-v_fee,2),v_installments,auth.uid());
    insert into public.cash_movements(cash_session_id,movement_type,payment_method_id,financial_entry_id,amount,description,occurred_at,created_by) values(v_session_id,'income',v_method_id,v_entry.id,v_payment_amount,'Atendimento finalizado — pagamento misto',v_now,auth.uid());
  end loop;
  return a;
end;
$function$;
grant execute on function public.complete_appointment_financially_mixed(uuid,jsonb,numeric,text,numeric,numeric,text) to authenticated;

create or replace view public.financial_report_ledger as
with entry_commission as (
  select pc.financial_entry_id,pc.commission_amount,pc.clinic_amount from public.professional_commissions pc where pc.status<>'cancelled'
), payment_totals as (
  select financial_entry_id,sum(net_amount) as total_net from public.financial_entry_payments group by financial_entry_id
), split_entries as (
  select 'entry'::text record_type,fe.id record_id,(fe.occurred_at at time zone 'America/Fortaleza')::date business_date,fe.professional_id,fe.professional_name_snapshot,fe.service_id,fe.service_name_snapshot,fp.payment_method_id,pm.name payment_method_name,null::uuid category_id,null::text category_name,fe.cost_center_id,cc.name cost_center_name,fe.status,fp.amount gross_amount,fp.fee_amount fee_amount,fp.net_amount,
    case when coalesce(pt.total_net,0)>0 then coalesce(ec.commission_amount,0)*fp.net_amount/pt.total_net else 0 end::numeric commission_amount,
    case when coalesce(pt.total_net,0)>0 then fp.net_amount-(coalesce(ec.commission_amount,0)*fp.net_amount/pt.total_net) else fp.net_amount end::numeric clinic_amount,
    0::numeric expense_amount,
    case when coalesce(pt.total_net,0)>0 then fp.net_amount-(coalesce(ec.commission_amount,0)*fp.net_amount/pt.total_net) else fp.net_amount end::numeric result_amount
  from public.financial_entries fe join public.financial_entry_payments fp on fp.financial_entry_id=fe.id join payment_totals pt on pt.financial_entry_id=fe.id left join entry_commission ec on ec.financial_entry_id=fe.id left join public.payment_methods pm on pm.id=fp.payment_method_id left join public.cost_centers cc on cc.id=fe.cost_center_id where fe.status<>'cancelled'
), plain_entries as (
  select 'entry'::text record_type,fe.id record_id,(fe.occurred_at at time zone 'America/Fortaleza')::date business_date,fe.professional_id,fe.professional_name_snapshot,fe.service_id,fe.service_name_snapshot,fe.payment_method_id,pm.name payment_method_name,null::uuid category_id,null::text category_name,fe.cost_center_id,cc.name cost_center_name,fe.status,fe.charged_amount gross_amount,fe.card_fee_amount fee_amount,fe.net_amount,coalesce(ec.commission_amount,0)::numeric commission_amount,coalesce(ec.clinic_amount,fe.net_amount)::numeric clinic_amount,0::numeric expense_amount,coalesce(ec.clinic_amount,fe.net_amount)::numeric result_amount
  from public.financial_entries fe left join entry_commission ec on ec.financial_entry_id=fe.id left join public.payment_methods pm on pm.id=fe.payment_method_id left join public.cost_centers cc on cc.id=fe.cost_center_id where fe.status<>'cancelled' and not exists(select 1 from public.financial_entry_payments fp where fp.financial_entry_id=fe.id)
), expense_rows as (
  select 'expense'::text record_type,fx.id record_id,fx.expense_date business_date,null::uuid professional_id,null::text professional_name_snapshot,null::uuid service_id,null::text service_name_snapshot,fx.payment_method_id,pm.name payment_method_name,fx.category_id,ec.name category_name,fx.cost_center_id,cc.name cost_center_name,case when fx.paid then 'paid' else 'pending' end::text status,0::numeric gross_amount,0::numeric fee_amount,0::numeric net_amount,0::numeric commission_amount,0::numeric clinic_amount,fx.amount expense_amount,case when ec.name='Comissões' then 0::numeric else -fx.amount end result_amount
  from public.financial_expenses fx left join public.payment_methods pm on pm.id=fx.payment_method_id left join public.expense_categories ec on ec.id=fx.category_id left join public.cost_centers cc on cc.id=fx.cost_center_id
)
select * from split_entries union all select * from plain_entries union all select * from expense_rows;

create or replace function public.get_financial_report_breakdowns(_from date,_to date,_professional_id uuid default null,_service_id uuid default null,_payment_method_id uuid default null,_expense_category_id uuid default null,_cost_center_id uuid default null,_status text default null)
returns table(section text,report_key text,label text,quantity bigint,gross_amount numeric,fee_amount numeric,net_amount numeric,commission_amount numeric,clinic_amount numeric,expense_amount numeric,result_amount numeric)
language plpgsql stable set search_path='public' as $function$
#variable_conflict use_column
begin
  if not public.finance_has_role(array['admin','finance']) then raise exception 'Acesso financeiro insuficiente.'; end if;
  if _from is null or _to is null or _from>_to then raise exception 'Período inválido.'; end if;
  return query with filtered as(select l.* from public.financial_report_ledger l where l.business_date between _from and _to and (_professional_id is null or (l.record_type='entry' and l.professional_id=_professional_id)) and (_service_id is null or (l.record_type='entry' and l.service_id=_service_id)) and (_payment_method_id is null or l.payment_method_id=_payment_method_id) and (_expense_category_id is null or (l.record_type='expense' and l.category_id=_expense_category_id)) and (_cost_center_id is null or l.cost_center_id=_cost_center_id) and (_status is null or l.status=_status)), grouped as(
    select 'day'::text,to_char(f.business_date,'YYYY-MM-DD'),to_char(f.business_date,'DD/MM/YYYY'),count(distinct f.record_type||':'||f.record_id::text)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,coalesce(sum(f.expense_amount),0)::numeric,coalesce(sum(f.result_amount),0)::numeric from filtered f group by f.business_date
    union all select 'week',to_char(date_trunc('week',f.business_date)::date,'YYYY-MM-DD'),'Semana de '||to_char(date_trunc('week',f.business_date)::date,'DD/MM/YYYY'),count(distinct f.record_type||':'||f.record_id::text)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,coalesce(sum(f.expense_amount),0)::numeric,coalesce(sum(f.result_amount),0)::numeric from filtered f group by date_trunc('week',f.business_date)::date
    union all select 'fortnight',to_char(date_trunc('month',f.business_date)::date,'YYYY-MM')||case when extract(day from f.business_date)<=15 then '-1' else '-2' end,case when extract(day from f.business_date)<=15 then '1ª quinzena de ' else '2ª quinzena de ' end||to_char(f.business_date,'MM/YYYY'),count(distinct f.record_type||':'||f.record_id::text)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,coalesce(sum(f.expense_amount),0)::numeric,coalesce(sum(f.result_amount),0)::numeric from filtered f group by date_trunc('month',f.business_date)::date,case when extract(day from f.business_date)<=15 then 1 else 2 end,to_char(f.business_date,'MM/YYYY'),extract(day from f.business_date)<=15
    union all select 'month',to_char(date_trunc('month',f.business_date)::date,'YYYY-MM'),to_char(f.business_date,'MM/YYYY'),count(distinct f.record_type||':'||f.record_id::text)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,coalesce(sum(f.expense_amount),0)::numeric,coalesce(sum(f.result_amount),0)::numeric from filtered f group by date_trunc('month',f.business_date)::date,to_char(f.business_date,'MM/YYYY')
    union all select 'professional',coalesce(f.professional_id::text,'sem-profissional'),coalesce(f.professional_name_snapshot,'Sem profissional'),count(distinct f.record_id)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,0::numeric,coalesce(sum(f.clinic_amount),0)::numeric from filtered f where f.record_type='entry' group by f.professional_id,f.professional_name_snapshot
    union all select 'service',coalesce(f.service_id::text,'sem-servico'),coalesce(f.service_name_snapshot,'Sem serviço'),count(distinct f.record_id)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,0::numeric,coalesce(sum(f.clinic_amount),0)::numeric from filtered f where f.record_type='entry' group by f.service_id,f.service_name_snapshot
    union all select 'payment_method',coalesce(f.payment_method_id::text,'sem-forma'),coalesce(f.payment_method_name,'Sem forma de pagamento'),count(distinct f.record_id)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,coalesce(sum(f.expense_amount),0)::numeric,coalesce(sum(f.result_amount),0)::numeric from filtered f group by f.payment_method_id,f.payment_method_name
    union all select 'expense_category',coalesce(f.category_id::text,'sem-categoria'),coalesce(f.category_name,'Sem categoria'),count(distinct f.record_id)::bigint,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,coalesce(sum(f.expense_amount),0)::numeric,coalesce(sum(f.result_amount),0)::numeric from filtered f where f.record_type='expense' group by f.category_id,f.category_name
    union all select 'cost_center',coalesce(f.cost_center_id::text,'sem-centro'),coalesce(f.cost_center_name,'Sem centro de custo'),count(distinct f.record_type||':'||f.record_id::text)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,coalesce(sum(f.expense_amount),0)::numeric,coalesce(sum(f.result_amount),0)::numeric from filtered f group by f.cost_center_id,f.cost_center_name
  ) select * from grouped order by section,report_key;
end;
$function$;