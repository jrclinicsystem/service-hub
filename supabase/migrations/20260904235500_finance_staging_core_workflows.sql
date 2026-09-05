-- Core finance workflows for staging validation.

create or replace function public.open_cash_session(
  _opening_cash numeric,
  _business_date date default (now() at time zone 'America/Fortaleza')::date
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.cash_sessions%rowtype;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso financeiro insuficiente';
  end if;
  if _opening_cash < 0 then raise exception 'Fundo de caixa inválido'; end if;

  if exists(select 1 from public.cash_sessions where business_date = _business_date and status='open') then
    raise exception 'Já existe um caixa aberto para esta data';
  end if;

  insert into public.cash_sessions(business_date, opened_by, opening_cash)
  values (_business_date, auth.uid(), round(_opening_cash,2))
  returning * into s;

  return s;
end;
$$;

revoke all on function public.open_cash_session(numeric,date) from public;
grant execute on function public.open_cash_session(numeric,date) to authenticated;

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
set search_path = public
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

  select * into e
  from public.financial_entries
  where appointment_id = _appointment_id and status <> 'cancelled'
  order by created_at desc
  limit 1;
  if found then return e; end if;

  select id into method_id from public.payment_methods where code = _payment_method_code and is_active=true limit 1;
  if method_id is null then raise exception 'Forma de pagamento não encontrada: %', _payment_method_code; end if;

  if _cost_center_code is not null then
    select id into center_id from public.cost_centers where code = _cost_center_code and is_active=true limit 1;
  end if;

  if _discount_type is null then
    discount_amount := 0;
  elsif _discount_type = 'percent' then
    if _discount_value < 0 or _discount_value > 100 then raise exception 'Percentual de desconto inválido'; end if;
    discount_amount := round(_original_amount * _discount_value / 100.0, 2);
  elsif _discount_type = 'amount' then
    discount_amount := round(_discount_value,2);
  else
    raise exception 'Tipo de desconto inválido';
  end if;

  if discount_amount < 0 or discount_amount > _original_amount then raise exception 'Desconto inválido'; end if;
  charged := round(_original_amount - discount_amount,2);
  fee := coalesce(public.calculate_payment_fee(method_id, charged, _installments, (_occurred_at at time zone 'America/Fortaleza')::date),0);
  if fee > charged then raise exception 'Taxa maior que o valor recebido'; end if;
  net := round(charged - fee,2);

  insert into public.financial_entries(
    appointment_id, client_id, professional_id, service_id,
    patient_name_snapshot, professional_name_snapshot, service_name_snapshot,
    occurred_at, original_amount, discount_type, discount_value, discount_amount,
    charged_amount, card_fee_amount, net_amount, payment_method_id, installments,
    cost_center_id, status, received_at, source, discount_applied_by, created_by
  ) values (
    _appointment_id, _client_id, _professional_id, _service_id,
    nullif(trim(_patient_name),''), nullif(trim(_professional_name),''), nullif(trim(_service_name),''),
    _occurred_at, round(_original_amount,2), _discount_type, coalesce(_discount_value,0), discount_amount,
    charged, fee, net, method_id, _installments,
    center_id, case when _received then 'received' else 'pending' end,
    case when _received then _occurred_at else null end,
    'appointment', auth.uid(), auth.uid()
  ) returning * into e;

  if _manual_commission_amount is not null then
    if _manual_commission_amount < 0 or _manual_commission_amount > net then
      raise exception 'Comissão manual inválida';
    end if;
    commission_value := round(_manual_commission_amount,2);
    commission_kind := 'manual';
    commission_base := 'manual';
    manual_override := true;
  else
    select * into c
    from public.calculate_professional_commission(_professional_id, _original_amount, charged, net, (_occurred_at at time zone 'America/Fortaleza')::date)
    limit 1;

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
    financial_entry_id, professional_id, commission_type, calculation_base,
    base_amount, percentage, fixed_amount, commission_amount, clinic_amount,
    is_manual_override, override_reason, created_by
  ) values (
    e.id, _professional_id, commission_kind, commission_base,
    case commission_base when 'original' then round(_original_amount,2) when 'after_discount' then charged when 'net_after_fees' then net else net end,
    commission_percentage, commission_fixed, commission_value, round(net - commission_value,2),
    manual_override, case when manual_override then nullif(trim(_manual_commission_reason),'') else null end, auth.uid()
  );

  if _received then
    select cs.id into session_id
    from public.cash_sessions cs
    where cs.business_date = (_occurred_at at time zone 'America/Fortaleza')::date
      and cs.status = 'open'
    order by cs.opened_at desc
    limit 1;

    if session_id is not null then
      insert into public.cash_movements(cash_session_id,movement_type,payment_method_id,financial_entry_id,amount,description,occurred_at,created_by)
      values (session_id,'income',method_id,e.id,charged,'Atendimento finalizado',_occurred_at,auth.uid());
    end if;
  end if;

  return e;
end;
$$;

revoke all on function public.register_attended_financial_entry(uuid,uuid,uuid,uuid,text,text,text,numeric,text,integer,text,numeric,text,numeric,text,timestamptz,boolean) from public;
grant execute on function public.register_attended_financial_entry(uuid,uuid,uuid,uuid,text,text,text,numeric,text,integer,text,numeric,text,numeric,text,timestamptz,boolean) to authenticated, service_role;

create or replace function public.mark_commission_paid(_commission_id uuid)
returns public.professional_commissions
language plpgsql
security definer
set search_path = public
as $$
declare c public.professional_commissions%rowtype;
begin
  if not public.finance_has_role(array['admin','finance']) then raise exception 'Acesso financeiro insuficiente'; end if;
  update public.professional_commissions
  set status='paid', paid_at=now(), paid_by=auth.uid(), updated_at=now()
  where id=_commission_id and status='pending'
  returning * into c;
  if not found then raise exception 'Comissão não encontrada ou já processada'; end if;
  insert into public.financial_audit_log(entity_type,entity_id,action,actor_id,new_data)
  values ('professional_commissions',c.id,'pay',auth.uid(),to_jsonb(c));
  return c;
end;
$$;

revoke all on function public.mark_commission_paid(uuid) from public;
grant execute on function public.mark_commission_paid(uuid) to authenticated;

create or replace function public.get_financial_dashboard(
  _from date default date_trunc('month',(now() at time zone 'America/Fortaleza'))::date,
  _to date default (now() at time zone 'America/Fortaleza')::date
)
returns table(metric text, value numeric)
language sql
stable
security definer
set search_path = public
as $$
  with range_entries as (
    select * from public.financial_entries
    where status='received'
      and (occurred_at at time zone 'America/Fortaleza')::date between _from and _to
  ), range_expenses as (
    select * from public.financial_expenses
    where paid=true and expense_date between _from and _to
  ), range_commissions as (
    select pc.*
    from public.professional_commissions pc
    join range_entries re on re.id=pc.financial_entry_id
    where pc.status <> 'cancelled'
  )
  select 'revenue'::text, coalesce((select sum(charged_amount) from range_entries),0)::numeric
  union all select 'net_revenue', coalesce((select sum(net_amount) from range_entries),0)::numeric
  union all select 'expenses', coalesce((select sum(amount) from range_expenses),0)::numeric
  union all select 'commissions', coalesce((select sum(commission_amount) from range_commissions),0)::numeric
  union all select 'clinic_result', (
    coalesce((select sum(net_amount) from range_entries),0)
    - coalesce((select sum(commission_amount) from range_commissions),0)
    - coalesce((select sum(amount) from range_expenses),0)
  )::numeric
  union all select 'payable_pending', coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date >= current_date),0)::numeric
  union all select 'payable_overdue', coalesce((select sum(amount) from public.accounts_payable where status='pending' and due_date < current_date),0)::numeric
  union all select 'receivable_pending', coalesce((select sum(original_amount-amount_received) from public.accounts_receivable where status='pending'),0)::numeric;
$$;

revoke all on function public.get_financial_dashboard(date,date) from public;
grant execute on function public.get_financial_dashboard(date,date) to authenticated;

create or replace view public.payment_totals_current_month as
select pm.code, pm.name,
       coalesce(sum(fe.charged_amount),0)::numeric(14,2) as total
from public.payment_methods pm
left join public.financial_entries fe
  on fe.payment_method_id=pm.id
 and fe.status='received'
 and date_trunc('month',fe.occurred_at at time zone 'America/Fortaleza') = date_trunc('month',now() at time zone 'America/Fortaleza')
where pm.is_active=true
group by pm.id,pm.code,pm.name,pm.sort_order
order by pm.sort_order,pm.name;
