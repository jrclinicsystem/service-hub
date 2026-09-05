-- JR Clinic Finance Staging only.
-- Completes recurring payables, cost-center mapping, cash enforcement and alerts.

alter table public.accounts_payable
  add column if not exists generated_from_id uuid references public.accounts_payable(id) on delete set null;

create unique index if not exists accounts_payable_generated_from_unique
  on public.accounts_payable(generated_from_id)
  where generated_from_id is not null;

alter table public.cash_sessions
  add column if not exists opened_by_label text,
  add column if not exists closed_by_label text;

create table if not exists public.service_cost_centers (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null unique references public.services(id) on delete cascade,
  cost_center_id uuid not null references public.cost_centers(id) on delete restrict,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_cost_centers enable row level security;

drop policy if exists service_cost_centers_admin_finance on public.service_cost_centers;
create policy service_cost_centers_admin_finance
  on public.service_cost_centers
  for all
  to authenticated
  using (public.finance_has_role(array['admin','finance']))
  with check (public.finance_has_role(array['admin','finance']));

create or replace function public.finance_assign_entry_cost_center()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.cost_center_id is null and new.service_id is not null then
    select scc.cost_center_id
      into new.cost_center_id
    from public.service_cost_centers scc
    where scc.service_id = new.service_id
    limit 1;
  end if;
  return new;
end;
$$;

create or replace function public.finance_sync_service_cost_center()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  update public.financial_entries
     set cost_center_id = new.cost_center_id,
         updated_at = now()
   where service_id = new.service_id
     and cost_center_id is distinct from new.cost_center_id;
  return new;
end;
$$;

drop trigger if exists service_cost_centers_set_updated_at on public.service_cost_centers;
create trigger service_cost_centers_set_updated_at
before update on public.service_cost_centers
for each row execute function public.finance_set_updated_at();

drop trigger if exists service_cost_centers_finance_audit on public.service_cost_centers;
create trigger service_cost_centers_finance_audit
after insert or update or delete on public.service_cost_centers
for each row execute function public.finance_audit_trigger();

drop trigger if exists service_cost_centers_sync_entries on public.service_cost_centers;
create trigger service_cost_centers_sync_entries
after insert or update of cost_center_id on public.service_cost_centers
for each row execute function public.finance_sync_service_cost_center();

drop trigger if exists financial_entries_assign_cost_center on public.financial_entries;
create trigger financial_entries_assign_cost_center
before insert or update of service_id on public.financial_entries
for each row execute function public.finance_assign_entry_cost_center();

create or replace function public.finance_require_open_cash_for_received_entry()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  _business_date date;
begin
  if new.status = 'received'
     and (tg_op = 'INSERT' or old.status is distinct from 'received') then
    _business_date := (coalesce(new.received_at, new.occurred_at, now()) at time zone 'America/Fortaleza')::date;
    if not exists (
      select 1
      from public.cash_sessions cs
      where cs.business_date = _business_date
        and cs.status = 'open'
    ) then
      raise exception 'Abra o caixa do dia antes de registrar um recebimento.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists financial_entries_require_open_cash on public.financial_entries;
create trigger financial_entries_require_open_cash
before insert or update of status on public.financial_entries
for each row execute function public.finance_require_open_cash_for_received_entry();

create or replace function public.finance_guard_closed_cash_session()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if old.status = 'closed' then
    raise exception 'Caixa fechado não pode ser alterado ou excluído diretamente.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists cash_sessions_guard_closed_update on public.cash_sessions;
create trigger cash_sessions_guard_closed_update
before update or delete on public.cash_sessions
for each row execute function public.finance_guard_closed_cash_session();

create or replace function public.open_cash_session(
  _opening_cash numeric,
  _business_date date default ((now() at time zone 'America/Fortaleza'))::date
)
returns public.cash_sessions
language plpgsql
security definer
set search_path to ''
as $$
declare
  _session public.cash_sessions%rowtype;
  _actor_label text;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso financeiro insuficiente';
  end if;
  if _opening_cash < 0 then
    raise exception 'Fundo de caixa inválido';
  end if;
  if exists(select 1 from public.cash_sessions cs where cs.business_date = _business_date) then
    raise exception 'Já existe um caixa registrado para esta data.';
  end if;
  select au.email into _actor_label from auth.users au where au.id = auth.uid();
  insert into public.cash_sessions(business_date, opened_by, opened_by_label, opening_cash)
  values(_business_date, auth.uid(), coalesce(_actor_label, 'Usuário'), round(_opening_cash,2))
  returning * into _session;
  return _session;
end;
$$;

create or replace function public.close_cash_session(
  _session_id uuid,
  _counted_cash numeric,
  _note text default null
)
returns public.cash_sessions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s public.cash_sessions%rowtype;
  cash_id uuid;
  pix_id uuid;
  debit_id uuid;
  credit_id uuid;
  link_id uuid;
  total_cash_in numeric := 0;
  total_pix_in numeric := 0;
  total_debit_in numeric := 0;
  total_credit_in numeric := 0;
  total_link_in numeric := 0;
  cash_out numeric := 0;
  _actor_label text;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso financeiro insuficiente';
  end if;
  select * into s from public.cash_sessions where id = _session_id for update;
  if not found then raise exception 'Caixa não encontrado'; end if;
  if s.status <> 'open' then raise exception 'Este caixa já está fechado'; end if;
  if _counted_cash < 0 then raise exception 'Valor contado inválido'; end if;

  select id into cash_id from public.payment_methods where code = 'cash' limit 1;
  select id into pix_id from public.payment_methods where code = 'pix' limit 1;
  select id into debit_id from public.payment_methods where code = 'debit' limit 1;
  select id into credit_id from public.payment_methods where code = 'credit' limit 1;
  select id into link_id from public.payment_methods where code = 'payment_link' limit 1;
  select au.email into _actor_label from auth.users au where au.id = auth.uid();

  select
    coalesce(sum(case when movement_type='income' and payment_method_id=cash_id then amount else 0 end),0),
    coalesce(sum(case when movement_type='income' and payment_method_id=pix_id then amount else 0 end),0),
    coalesce(sum(case when movement_type='income' and payment_method_id=debit_id then amount else 0 end),0),
    coalesce(sum(case when movement_type='income' and payment_method_id=credit_id then amount else 0 end),0),
    coalesce(sum(case when movement_type='income' and payment_method_id=link_id then amount else 0 end),0),
    coalesce(sum(case when movement_type='expense' and payment_method_id=cash_id then amount else 0 end),0)
  into total_cash_in, total_pix_in, total_debit_in, total_credit_in, total_link_in, cash_out
  from public.cash_movements
  where cash_session_id = _session_id;

  update public.cash_sessions
  set total_cash = total_cash_in,
      total_pix = total_pix_in,
      total_debit = total_debit_in,
      total_credit = total_credit_in,
      total_link = total_link_in,
      total_cash_expenses = cash_out,
      expected_cash = round(opening_cash + total_cash_in - cash_out, 2),
      counted_cash = round(_counted_cash,2),
      difference_amount = round(_counted_cash - (opening_cash + total_cash_in - cash_out), 2),
      closed_by = auth.uid(),
      closed_by_label = coalesce(_actor_label, 'Usuário'),
      closed_at = now(),
      closing_note = nullif(trim(_note),''),
      status = 'closed',
      locked_at = now(),
      updated_at = now()
  where id = _session_id
  returning * into s;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, new_data)
  values ('cash_sessions', s.id, 'close', auth.uid(), to_jsonb(s));
  return s;
end;
$$;

update public.cash_sessions cs
set opened_by_label = coalesce(cs.opened_by_label, au.email)
from auth.users au
where cs.opened_by = au.id and cs.opened_by_label is null;

update public.cash_sessions cs
set closed_by_label = coalesce(cs.closed_by_label, au.email)
from auth.users au
where cs.closed_by = au.id and cs.closed_by_label is null;

create or replace function public.pay_account_payable(
  _account_id uuid,
  _payment_method_code text,
  _paid_at timestamptz default now()
)
returns public.accounts_payable
language plpgsql
security definer
set search_path to ''
as $$
declare
  _account public.accounts_payable%rowtype;
  _method_id uuid;
  _next_due date;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;
  select * into _account from public.accounts_payable ap where ap.id=_account_id for update;
  if not found then raise exception 'Conta a pagar não encontrada.'; end if;
  if _account.status <> 'pending' then raise exception 'A conta a pagar já foi processada.'; end if;
  select pm.id into _method_id from public.payment_methods pm where pm.code=_payment_method_code and pm.is_active=true limit 1;
  if _method_id is null then raise exception 'Forma de pagamento inválida.'; end if;

  insert into public.financial_expenses(
    expense_date,category_id,cost_center_id,description,amount,payment_method_id,
    paid,paid_at,created_by,notes,account_payable_id
  ) values(
    (_paid_at at time zone 'America/Fortaleza')::date,_account.category_id,_account.cost_center_id,
    'Conta paga: '||_account.title,_account.amount,_method_id,true,_paid_at,auth.uid(),
    coalesce(_account.description,_account.supplier),_account.id
  );

  update public.accounts_payable
  set status='paid',payment_method_id=_method_id,paid_at=_paid_at,paid_by=auth.uid(),updated_at=now()
  where id=_account.id returning * into _account;

  if _account.is_fixed and coalesce(_account.recurrence_type,'none') <> 'none' then
    _next_due := case _account.recurrence_type
      when 'weekly' then _account.due_date + 7
      when 'monthly' then (_account.due_date + interval '1 month')::date
      when 'yearly' then (_account.due_date + interval '1 year')::date
      else null
    end;
    if _next_due is not null then
      insert into public.accounts_payable(
        title,supplier,category_id,cost_center_id,amount,due_date,status,is_fixed,
        recurrence_type,description,created_by,generated_from_id
      ) values(
        _account.title,_account.supplier,_account.category_id,_account.cost_center_id,_account.amount,
        _next_due,'pending',true,_account.recurrence_type,_account.description,auth.uid(),_account.id
      ) on conflict (generated_from_id) where generated_from_id is not null do nothing;
    end if;
  end if;

  insert into public.financial_audit_log(entity_type,entity_id,action,actor_id,new_data,metadata)
  values('accounts_payable',_account.id,'pay',auth.uid(),to_jsonb(_account),
    jsonb_build_object('payment_method_code',_payment_method_code,'next_due_date',_next_due));
  return _account;
end;
$$;

drop view if exists public.accounts_payable_with_status;
create view public.accounts_payable_with_status
with (security_invoker = true)
as
select ap.*,
  case when ap.status='pending' and ap.due_date < (now() at time zone 'America/Fortaleza')::date then 'overdue' else ap.status end as display_status,
  ap.due_date - (now() at time zone 'America/Fortaleza')::date as days_until_due,
  case
    when ap.status <> 'pending' then 'none'
    when ap.due_date < (now() at time zone 'America/Fortaleza')::date then 'overdue'
    when ap.due_date = (now() at time zone 'America/Fortaleza')::date then 'due_today'
    when ap.due_date <= (now() at time zone 'America/Fortaleza')::date + 3 then 'due_soon'
    else 'none'
  end as alert_status
from public.accounts_payable ap;

drop view if exists public.accounts_receivable_with_status;
create view public.accounts_receivable_with_status
with (security_invoker = true)
as
select ar.*,
  case when ar.status='pending' and ar.due_date < (now() at time zone 'America/Fortaleza')::date then 'overdue' else ar.status end as display_status,
  ar.due_date - (now() at time zone 'America/Fortaleza')::date as days_until_due,
  case
    when ar.status <> 'pending' then 'none'
    when ar.due_date < (now() at time zone 'America/Fortaleza')::date then 'overdue'
    when ar.due_date = (now() at time zone 'America/Fortaleza')::date then 'due_today'
    when ar.due_date <= (now() at time zone 'America/Fortaleza')::date + 3 then 'due_soon'
    else 'none'
  end as alert_status
from public.accounts_receivable ar;

create or replace view public.financial_cash_report
with (security_invoker = true)
as
select
  cs.id as cash_session_id,cs.business_date,cs.status,cs.opened_by,cs.opened_by_label,cs.opened_at,
  cs.closed_by,cs.closed_by_label,cs.closed_at,cs.opening_cash,cs.total_cash,cs.total_pix,
  cs.total_debit,cs.total_credit,cs.total_link,(cs.total_debit+cs.total_credit) as total_card,
  (cs.total_cash+cs.total_pix+cs.total_debit+cs.total_credit+cs.total_link) as total_received,
  cs.total_cash_expenses,cs.expected_cash,cs.counted_cash,cs.difference_amount,cs.closing_note,cs.locked_at
from public.cash_sessions cs;
