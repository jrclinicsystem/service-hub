-- JR Clinic Finance Staging only.
-- Completes reporting dimensions and least-privilege access rules.

create or replace view public.financial_report_ledger
with (security_invoker = true)
as
select
  'entry'::text as record_type,
  fe.id as record_id,
  (fe.occurred_at at time zone 'America/Fortaleza')::date as business_date,
  fe.professional_id,
  fe.professional_name_snapshot,
  fe.service_id,
  fe.service_name_snapshot,
  fe.payment_method_id,
  pm.name as payment_method_name,
  null::uuid as category_id,
  null::text as category_name,
  fe.cost_center_id,
  cc.name as cost_center_name,
  fe.status,
  fe.charged_amount as gross_amount,
  fe.card_fee_amount as fee_amount,
  fe.net_amount,
  coalesce(pc.commission_amount,0)::numeric as commission_amount,
  coalesce(pc.clinic_amount,fe.net_amount)::numeric as clinic_amount,
  0::numeric as expense_amount,
  coalesce(pc.clinic_amount,fe.net_amount)::numeric as result_amount
from public.financial_entries fe
left join public.payment_methods pm on pm.id=fe.payment_method_id
left join public.cost_centers cc on cc.id=fe.cost_center_id
left join public.professional_commissions pc on pc.financial_entry_id=fe.id and pc.status <> 'cancelled'
where fe.status <> 'cancelled'
union all
select
  'expense'::text,
  fx.id,
  fx.expense_date,
  null::uuid,
  null::text,
  null::uuid,
  null::text,
  fx.payment_method_id,
  pm.name,
  fx.category_id,
  ec.name,
  fx.cost_center_id,
  cc.name,
  case when fx.paid then 'paid' else 'pending' end::text,
  0::numeric,
  0::numeric,
  0::numeric,
  0::numeric,
  0::numeric,
  fx.amount,
  -fx.amount
from public.financial_expenses fx
left join public.payment_methods pm on pm.id=fx.payment_method_id
left join public.expense_categories ec on ec.id=fx.category_id
left join public.cost_centers cc on cc.id=fx.cost_center_id;

grant select on public.financial_report_ledger to authenticated;
grant select on public.financial_cash_report to authenticated;
grant select, insert, update, delete on public.service_cost_centers to authenticated;

create or replace function public.get_financial_report_breakdowns(
  _from date,
  _to date,
  _professional_id uuid default null,
  _service_id uuid default null,
  _payment_method_id uuid default null,
  _expense_category_id uuid default null,
  _cost_center_id uuid default null,
  _status text default null
)
returns table(
  section text,
  report_key text,
  label text,
  quantity bigint,
  gross_amount numeric,
  fee_amount numeric,
  net_amount numeric,
  commission_amount numeric,
  clinic_amount numeric,
  expense_amount numeric,
  result_amount numeric
)
language plpgsql
stable
set search_path to 'public'
as $$
#variable_conflict use_column
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;
  if _from is null or _to is null or _from > _to then
    raise exception 'Período inválido.';
  end if;

  return query
  with filtered as (
    select l.*
    from public.financial_report_ledger l
    where l.business_date between _from and _to
      and (_professional_id is null or (l.record_type='entry' and l.professional_id=_professional_id))
      and (_service_id is null or (l.record_type='entry' and l.service_id=_service_id))
      and (_payment_method_id is null or l.payment_method_id=_payment_method_id)
      and (_expense_category_id is null or (l.record_type='expense' and l.category_id=_expense_category_id))
      and (_cost_center_id is null or l.cost_center_id=_cost_center_id)
      and (_status is null or l.status=_status)
  ), grouped as (
    select 'day'::text as section,to_char(f.business_date,'YYYY-MM-DD') as report_key,to_char(f.business_date,'DD/MM/YYYY') as label,count(*)::bigint as quantity,coalesce(sum(f.gross_amount),0)::numeric as gross_amount,coalesce(sum(f.fee_amount),0)::numeric as fee_amount,coalesce(sum(f.net_amount),0)::numeric as net_amount,coalesce(sum(f.commission_amount),0)::numeric as commission_amount,coalesce(sum(f.clinic_amount),0)::numeric as clinic_amount,coalesce(sum(f.expense_amount),0)::numeric as expense_amount,coalesce(sum(f.result_amount),0)::numeric as result_amount from filtered f group by f.business_date
    union all
    select 'week',to_char(date_trunc('week',f.business_date)::date,'YYYY-MM-DD'),'Semana de '||to_char(date_trunc('week',f.business_date)::date,'DD/MM/YYYY'),count(*)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,coalesce(sum(f.expense_amount),0)::numeric,coalesce(sum(f.result_amount),0)::numeric from filtered f group by date_trunc('week',f.business_date)::date
    union all
    select 'fortnight',to_char(date_trunc('month',f.business_date)::date,'YYYY-MM')||case when extract(day from f.business_date)<=15 then '-1' else '-2' end,case when extract(day from f.business_date)<=15 then '1ª quinzena de ' else '2ª quinzena de ' end||to_char(f.business_date,'MM/YYYY'),count(*)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,coalesce(sum(f.expense_amount),0)::numeric,coalesce(sum(f.result_amount),0)::numeric from filtered f group by date_trunc('month',f.business_date)::date,case when extract(day from f.business_date)<=15 then 1 else 2 end,to_char(f.business_date,'MM/YYYY'),extract(day from f.business_date)<=15
    union all
    select 'month',to_char(date_trunc('month',f.business_date)::date,'YYYY-MM'),to_char(f.business_date,'MM/YYYY'),count(*)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,coalesce(sum(f.expense_amount),0)::numeric,coalesce(sum(f.result_amount),0)::numeric from filtered f group by date_trunc('month',f.business_date)::date,to_char(f.business_date,'MM/YYYY')
    union all
    select 'professional',coalesce(f.professional_id::text,'sem-profissional'),coalesce(f.professional_name_snapshot,'Sem profissional'),count(*)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,0::numeric,coalesce(sum(f.clinic_amount),0)::numeric from filtered f where f.record_type='entry' group by f.professional_id,f.professional_name_snapshot
    union all
    select 'service',coalesce(f.service_id::text,'sem-servico'),coalesce(f.service_name_snapshot,'Sem serviço'),count(*)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,0::numeric,coalesce(sum(f.clinic_amount),0)::numeric from filtered f where f.record_type='entry' group by f.service_id,f.service_name_snapshot
    union all
    select 'payment_method',coalesce(f.payment_method_id::text,'sem-forma'),coalesce(f.payment_method_name,'Sem forma de pagamento'),count(*)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,coalesce(sum(f.expense_amount),0)::numeric,coalesce(sum(f.result_amount),0)::numeric from filtered f group by f.payment_method_id,f.payment_method_name
    union all
    select 'expense_category',coalesce(f.category_id::text,'sem-categoria'),coalesce(f.category_name,'Sem categoria'),count(*)::bigint,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,coalesce(sum(f.expense_amount),0)::numeric,-coalesce(sum(f.expense_amount),0)::numeric from filtered f where f.record_type='expense' group by f.category_id,f.category_name
    union all
    select 'cost_center',coalesce(f.cost_center_id::text,'sem-centro'),coalesce(f.cost_center_name,'Sem centro de custo'),count(*)::bigint,coalesce(sum(f.gross_amount),0)::numeric,coalesce(sum(f.fee_amount),0)::numeric,coalesce(sum(f.net_amount),0)::numeric,coalesce(sum(f.commission_amount),0)::numeric,coalesce(sum(f.clinic_amount),0)::numeric,coalesce(sum(f.expense_amount),0)::numeric,coalesce(sum(f.result_amount),0)::numeric from filtered f group by f.cost_center_id,f.cost_center_name
  )
  select g.section,g.report_key,g.label,g.quantity,g.gross_amount,g.fee_amount,g.net_amount,g.commission_amount,g.clinic_amount,g.expense_amount,g.result_amount
  from grouped g order by g.section,g.report_key;
end;
$$;

create or replace function public.get_financial_dashboard(
  _from date default (date_trunc('month',(now() at time zone 'America/Fortaleza')))::date,
  _to date default ((now() at time zone 'America/Fortaleza'))::date
)
returns table(metric text,value numeric)
language plpgsql
stable
set search_path to 'public'
as $$
declare _today date := (now() at time zone 'America/Fortaleza')::date;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;
  return query
  with range_entries as (
    select * from public.financial_entries fe where fe.status in ('received','pending') and (fe.occurred_at at time zone 'America/Fortaleza')::date between _from and _to
  ), received_entries as (
    select * from range_entries where status='received'
  ), range_expenses as (
    select * from public.financial_expenses fx where fx.paid=true and fx.expense_date between _from and _to
  ), range_commissions as (
    select pc.* from public.professional_commissions pc join range_entries re on re.id=pc.financial_entry_id where pc.status <> 'cancelled'
  ), today_entries as (
    select * from public.financial_entries fe where fe.status in ('received','pending') and (fe.occurred_at at time zone 'America/Fortaleza')::date=_today
  ), paid_commissions as (
    select pc.* from public.professional_commissions pc join received_entries re on re.id=pc.financial_entry_id where pc.status='paid'
  )
  select 'revenue'::text,coalesce((select sum(charged_amount) from range_entries),0)::numeric
  union all select 'received',coalesce((select sum(charged_amount) from received_entries),0)::numeric
  union all select 'revenue_today',coalesce((select sum(charged_amount) from today_entries),0)::numeric
  union all select 'net_revenue',coalesce((select sum(net_amount) from range_entries),0)::numeric
  union all select 'expenses',coalesce((select sum(amount) from range_expenses),0)::numeric
  union all select 'commissions',coalesce((select sum(commission_amount) from range_commissions),0)::numeric
  union all select 'clinic_result',(coalesce((select sum(net_amount) from range_entries),0)-coalesce((select sum(commission_amount) from range_commissions),0)-coalesce((select sum(amount) from range_expenses),0))::numeric
  union all select 'available_balance',(coalesce((select sum(net_amount) from received_entries),0)-coalesce((select sum(amount) from range_expenses),0)-coalesce((select sum(commission_amount) from paid_commissions),0))::numeric
  union all select 'payable_pending',coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date>=_today),0)::numeric
  union all select 'payable_overdue',coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date<_today),0)::numeric
  union all select 'payable_due_soon',coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date between _today and _today+3),0)::numeric
  union all select 'receivable_pending',coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending'),0)::numeric
  union all select 'receivable_overdue',coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending' and due_date<_today),0)::numeric
  union all select 'receivable_due_soon',coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending' and due_date between _today and _today+3),0)::numeric;
end;
$$;

drop policy if exists financial_entries_reception on public.financial_entries;
drop policy if exists accounts_receivable_reception on public.accounts_receivable;
drop policy if exists cash_movements_reception on public.cash_movements;
drop policy if exists cash_sessions_reception_insert on public.cash_sessions;
drop policy if exists financial_audit_log_admin_finance on public.financial_audit_log;

create policy accounts_receivable_reception_select
  on public.accounts_receivable for select to authenticated
  using (public.finance_has_role(array['reception']));

create policy cash_movements_reception_select
  on public.cash_movements for select to authenticated
  using (public.finance_has_role(array['reception']));

create policy financial_audit_log_admin_finance_select
  on public.financial_audit_log for select to authenticated
  using (public.finance_has_role(array['admin','finance']));

create or replace function public.finance_staging_sync_attended_appointment()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_service_name text;
  v_service_price numeric;
  v_entry public.financial_entries%rowtype;
begin
  if new.status <> 'atendido' or old.status = 'atendido' then return new; end if;
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Somente administração, financeiro ou recepção podem concluir um atendimento.';
  end if;
  if new.professional_id is null then raise exception 'Staging financeiro: professional_id é obrigatório antes de marcar como atendido'; end if;
  if new.payment_received = false and new.receivable_due_date is null then raise exception 'Informe o vencimento da conta a receber antes de concluir um atendimento fiado.'; end if;
  select s.name,s.price into v_service_name,v_service_price from public.services s where s.id=new.service_id;
  if not found then raise exception 'Staging financeiro: serviço do atendimento não foi encontrado'; end if;
  if coalesce(new.custom_price,v_service_price,0) < 0 then raise exception 'Staging financeiro: valor do atendimento inválido'; end if;
  new.attended_at:=coalesce(new.attended_at,now());
  new.status_updated_at:=now();
  select * into v_entry from public.register_attended_financial_entry(
    new.id,new.user_id,new.professional_id,new.service_id,new.patient_name,
    coalesce(nullif(trim(new.professional_name_snapshot),''),'Profissional de teste'),v_service_name,
    coalesce(new.custom_price,v_service_price,0),new.payment_method_code,new.installments,
    new.discount_type,new.discount_value,new.cost_center_code,new.manual_commission_amount,
    new.manual_commission_reason,coalesce(new.attended_at,now()),new.payment_received
  );
  if new.payment_received=false then
    insert into public.accounts_receivable(
      appointment_id,client_id,service_id,client_name_snapshot,service_name_snapshot,
      original_amount,amount_received,due_date,status,payment_method_id,installments,created_by,notes
    ) values(
      new.id,new.user_id,new.service_id,new.patient_name,v_service_name,v_entry.charged_amount,0,
      new.receivable_due_date,'pending',v_entry.payment_method_id,new.installments,auth.uid(),
      'Gerado automaticamente ao concluir atendimento sem recebimento.'
    ) on conflict (appointment_id) where appointment_id is not null and status <> 'cancelled' do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.register_attended_financial_entry(uuid,uuid,uuid,uuid,text,text,text,numeric,text,integer,text,numeric,text,numeric,text,timestamptz,boolean) from public, anon, authenticated;
revoke execute on function public.finance_staging_sync_attended_appointment() from public, anon, authenticated;
revoke execute on function public.finance_audit_trigger() from public, anon, authenticated;
revoke execute on function public.finance_assign_entry_cost_center() from public, anon, authenticated;
revoke execute on function public.finance_sync_service_cost_center() from public, anon, authenticated;
revoke execute on function public.finance_require_open_cash_for_received_entry() from public, anon, authenticated;
revoke execute on function public.finance_guard_closed_cash_session() from public, anon, authenticated;
revoke execute on function public.finance_set_updated_at() from public, anon, authenticated;
revoke execute on function public.finance_sync_paid_cash_expense() from public, anon, authenticated;
revoke execute on function public.finance_guard_cash_movement_mutation() from public, anon, authenticated;
revoke execute on function public.calculate_professional_commission(uuid,numeric,numeric,numeric,date) from public, anon, authenticated;

revoke all on function public.get_financial_report_breakdowns(date,date,uuid,uuid,uuid,uuid,uuid,text) from public, anon;
grant execute on function public.get_financial_report_breakdowns(date,date,uuid,uuid,uuid,uuid,uuid,text) to authenticated;
revoke execute on function public.open_cash_session(numeric,date) from public, anon;
grant execute on function public.open_cash_session(numeric,date) to authenticated;
revoke execute on function public.close_cash_session(uuid,numeric,text) from public, anon;
grant execute on function public.close_cash_session(uuid,numeric,text) to authenticated;
revoke execute on function public.pay_account_payable(uuid,text,timestamptz) from public, anon;
grant execute on function public.pay_account_payable(uuid,text,timestamptz) to authenticated;
revoke execute on function public.receive_account_receivable(uuid,text,timestamptz) from public, anon;
grant execute on function public.receive_account_receivable(uuid,text,timestamptz) to authenticated;
revoke execute on function public.get_financial_dashboard(date,date) from public, anon;
grant execute on function public.get_financial_dashboard(date,date) to authenticated;
