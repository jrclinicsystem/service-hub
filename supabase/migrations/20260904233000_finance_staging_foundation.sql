-- JR Clinic finance staging foundation
-- This migration is intentionally developed on finance-staging first.

create extension if not exists pgcrypto;

create or replace function public.finance_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.financial_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null check (role in ('admin','finance','reception','professional')),
  professional_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.finance_has_role(_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.financial_access fa
    where fa.user_id = auth.uid()
      and fa.is_active = true
      and fa.role = any(_roles)
  );
$$;

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_card boolean not null default false,
  is_cash boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_method_fees (
  id uuid primary key default gen_random_uuid(),
  payment_method_id uuid not null references public.payment_methods(id) on delete cascade,
  fee_percent numeric(7,4) not null default 0 check (fee_percent >= 0),
  fixed_fee numeric(12,2) not null default 0 check (fixed_fee >= 0),
  installments_min integer not null default 1 check (installments_min >= 1),
  installments_max integer not null default 1 check (installments_max >= installments_min),
  effective_from date not null default current_date,
  effective_to date,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.professional_commission_rules (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null,
  commission_type text not null check (commission_type in ('percentage','fixed_per_patient','manual')),
  percentage numeric(7,4) check (percentage is null or (percentage >= 0 and percentage <= 100)),
  fixed_amount numeric(12,2) check (fixed_amount is null or fixed_amount >= 0),
  calculation_base text not null default 'net_after_fees' check (calculation_base in ('original','after_discount','net_after_fees')),
  effective_from date not null default current_date,
  effective_to date,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (
    (commission_type = 'percentage' and percentage is not null and fixed_amount is null)
    or (commission_type = 'fixed_per_patient' and fixed_amount is not null and percentage is null)
    or (commission_type = 'manual' and percentage is null and fixed_amount is null)
  )
);

create unique index if not exists professional_commission_rules_one_active
on public.professional_commission_rules(professional_id)
where is_active = true and effective_to is null;

create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid,
  client_id uuid,
  professional_id uuid,
  service_id uuid,
  patient_name_snapshot text,
  professional_name_snapshot text,
  service_name_snapshot text,
  occurred_at timestamptz not null default now(),
  original_amount numeric(12,2) not null check (original_amount >= 0),
  discount_type text check (discount_type is null or discount_type in ('percent','amount')),
  discount_value numeric(12,4) not null default 0 check (discount_value >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  charged_amount numeric(12,2) not null check (charged_amount >= 0),
  card_fee_amount numeric(12,2) not null default 0 check (card_fee_amount >= 0),
  net_amount numeric(12,2) not null check (net_amount >= 0),
  payment_method_id uuid references public.payment_methods(id),
  installments integer not null default 1 check (installments >= 1),
  cost_center_id uuid references public.cost_centers(id),
  status text not null default 'received' check (status in ('pending','received','cancelled','refunded')),
  received_at timestamptz,
  source text not null default 'appointment' check (source in ('appointment','manual','accounts_receivable')),
  discount_applied_by uuid,
  created_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_amount <= original_amount),
  check (charged_amount = round(original_amount - discount_amount, 2)),
  check (net_amount = round(charged_amount - card_fee_amount, 2))
);

create unique index if not exists financial_entries_unique_appointment
on public.financial_entries(appointment_id)
where appointment_id is not null and status <> 'cancelled';

create index if not exists financial_entries_occurred_at_idx on public.financial_entries(occurred_at);
create index if not exists financial_entries_professional_idx on public.financial_entries(professional_id);
create index if not exists financial_entries_service_idx on public.financial_entries(service_id);
create index if not exists financial_entries_payment_idx on public.financial_entries(payment_method_id);
create index if not exists financial_entries_cost_center_idx on public.financial_entries(cost_center_id);

create table if not exists public.professional_commissions (
  id uuid primary key default gen_random_uuid(),
  financial_entry_id uuid not null references public.financial_entries(id) on delete cascade,
  professional_id uuid not null,
  commission_type text not null check (commission_type in ('percentage','fixed_per_patient','manual')),
  calculation_base text not null check (calculation_base in ('original','after_discount','net_after_fees','manual')),
  base_amount numeric(12,2) not null default 0 check (base_amount >= 0),
  percentage numeric(7,4) check (percentage is null or (percentage >= 0 and percentage <= 100)),
  fixed_amount numeric(12,2) check (fixed_amount is null or fixed_amount >= 0),
  commission_amount numeric(12,2) not null check (commission_amount >= 0),
  clinic_amount numeric(12,2) not null check (clinic_amount >= 0),
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  paid_at timestamptz,
  paid_by uuid,
  is_manual_override boolean not null default false,
  override_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(financial_entry_id, professional_id)
);

create index if not exists professional_commissions_professional_idx on public.professional_commissions(professional_id);
create index if not exists professional_commissions_status_idx on public.professional_commissions(status);

create table if not exists public.financial_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category_id uuid references public.expense_categories(id),
  cost_center_id uuid references public.cost_centers(id),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method_id uuid references public.payment_methods(id),
  paid boolean not null default true,
  paid_at timestamptz,
  created_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  supplier text,
  category_id uuid references public.expense_categories(id),
  cost_center_id uuid references public.cost_centers(id),
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  is_fixed boolean not null default false,
  recurrence_type text not null default 'none' check (recurrence_type in ('none','weekly','monthly','yearly','custom')),
  payment_method_id uuid references public.payment_methods(id),
  paid_at timestamptz,
  paid_by uuid,
  description text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid,
  client_id uuid,
  service_id uuid,
  client_name_snapshot text not null,
  service_name_snapshot text,
  original_amount numeric(12,2) not null check (original_amount > 0),
  amount_received numeric(12,2) not null default 0 check (amount_received >= 0),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  payment_method_id uuid references public.payment_methods(id),
  paid_at timestamptz,
  created_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_received <= original_amount)
);

create or replace view public.accounts_payable_with_status as
select ap.*,
  case
    when ap.status = 'pending' and ap.due_date < current_date then 'overdue'
    else ap.status
  end as display_status
from public.accounts_payable ap;

create or replace view public.accounts_receivable_with_status as
select ar.*,
  case
    when ar.status = 'pending' and ar.due_date < current_date then 'overdue'
    else ar.status
  end as display_status
from public.accounts_receivable ar;

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  opened_by uuid not null,
  opened_at timestamptz not null default now(),
  opening_cash numeric(12,2) not null default 0 check (opening_cash >= 0),
  status text not null default 'open' check (status in ('open','closed')),
  total_cash numeric(12,2) not null default 0,
  total_pix numeric(12,2) not null default 0,
  total_debit numeric(12,2) not null default 0,
  total_credit numeric(12,2) not null default 0,
  total_link numeric(12,2) not null default 0,
  total_cash_expenses numeric(12,2) not null default 0,
  expected_cash numeric(12,2),
  counted_cash numeric(12,2),
  difference_amount numeric(12,2),
  closed_by uuid,
  closed_at timestamptz,
  closing_note text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cash_sessions_one_open_per_date
on public.cash_sessions(business_date)
where status = 'open';

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions(id) on delete restrict,
  movement_type text not null check (movement_type in ('income','expense','adjustment')),
  payment_method_id uuid references public.payment_methods(id),
  financial_entry_id uuid references public.financial_entries(id),
  expense_id uuid references public.financial_expenses(id),
  amount numeric(12,2) not null check (amount > 0),
  description text,
  occurred_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists cash_movements_session_idx on public.cash_movements(cash_session_id, occurred_at);

create table if not exists public.professional_settlements (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null,
  period_start date not null,
  period_end date not null,
  procedures_count integer not null default 0 check (procedures_count >= 0),
  gross_revenue numeric(12,2) not null default 0,
  net_revenue numeric(12,2) not null default 0,
  commission_total numeric(12,2) not null default 0,
  clinic_total numeric(12,2) not null default 0,
  amount_repassed numeric(12,2) not null default 0,
  amount_pending numeric(12,2) not null default 0,
  status text not null default 'open' check (status in ('open','closed','paid','cancelled')),
  closed_by uuid,
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique(professional_id, period_start, period_end)
);

create table if not exists public.professional_settlement_items (
  settlement_id uuid not null references public.professional_settlements(id) on delete cascade,
  commission_id uuid not null references public.professional_commissions(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (settlement_id, commission_id)
);

create table if not exists public.financial_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null check (action in ('insert','update','delete','close','reopen','pay','cancel','override')),
  actor_id uuid,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists financial_audit_entity_idx on public.financial_audit_log(entity_type, entity_id, created_at desc);

create or replace function public.finance_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _entity_id uuid;
begin
  _entity_id := case when tg_op = 'DELETE' then old.id else new.id end;
  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, new_data)
  values (
    tg_table_name,
    _entity_id,
    lower(tg_op),
    auth.uid(),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.calculate_payment_fee(
  _payment_method_id uuid,
  _amount numeric,
  _installments integer default 1,
  _on_date date default current_date
)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(round((_amount * f.fee_percent / 100.0) + f.fixed_fee, 2), 0)
  from public.payment_method_fees f
  where f.payment_method_id = _payment_method_id
    and f.is_active = true
    and _installments between f.installments_min and f.installments_max
    and f.effective_from <= _on_date
    and (f.effective_to is null or f.effective_to >= _on_date)
  order by f.effective_from desc, f.created_at desc
  limit 1;
$$;

create or replace function public.calculate_professional_commission(
  _professional_id uuid,
  _original_amount numeric,
  _discounted_amount numeric,
  _net_after_fees numeric,
  _on_date date default current_date
)
returns table(
  commission_type text,
  calculation_base text,
  base_amount numeric,
  percentage numeric,
  fixed_amount numeric,
  commission_amount numeric
)
language plpgsql
stable
set search_path = public
as $$
declare
  r public.professional_commission_rules%rowtype;
  b numeric;
begin
  select * into r
  from public.professional_commission_rules
  where professional_id = _professional_id
    and is_active = true
    and effective_from <= _on_date
    and (effective_to is null or effective_to >= _on_date)
  order by effective_from desc, created_at desc
  limit 1;

  if not found then return; end if;

  b := case r.calculation_base
    when 'original' then _original_amount
    when 'after_discount' then _discounted_amount
    else _net_after_fees
  end;

  return query
  select r.commission_type,
         r.calculation_base,
         round(coalesce(b,0),2),
         r.percentage,
         r.fixed_amount,
         case
           when r.commission_type = 'percentage' then round(coalesce(b,0) * r.percentage / 100.0, 2)
           when r.commission_type = 'fixed_per_patient' then round(r.fixed_amount,2)
           else 0::numeric
         end;
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
set search_path = public
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

-- Default configuration requested by the clinic.
insert into public.payment_methods(code,name,is_card,is_cash,sort_order)
values
  ('cash','Dinheiro',false,true,10),
  ('pix','Pix',false,false,20),
  ('debit','Débito',true,false,30),
  ('credit','Crédito',true,false,40),
  ('payment_link','Link de pagamento',true,false,50)
on conflict (code) do update set name = excluded.name, is_card = excluded.is_card, is_cash = excluded.is_cash, sort_order = excluded.sort_order;

insert into public.cost_centers(code,name)
values
  ('odontologia','Odontologia'),
  ('estetica','Estética'),
  ('salao','Salão'),
  ('lash','Lash'),
  ('manicure_pedicure','Manicure/Pedicure'),
  ('outros','Outros')
on conflict (code) do update set name = excluded.name;

insert into public.expense_categories(name)
values ('Aluguel'),('Energia'),('Internet'),('Fornecedores'),('Materiais'),('Impostos'),('Manutenção'),('Outros')
on conflict (name) do nothing;

-- updated_at triggers
DO $$
declare t text;
begin
  foreach t in array array[
    'financial_access','payment_methods','payment_method_fees','cost_centers','expense_categories',
    'professional_commission_rules','financial_entries','professional_commissions','financial_expenses',
    'accounts_payable','accounts_receivable','cash_sessions','professional_settlements'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', t, t);
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.finance_set_updated_at()', t, t);
  end loop;
end $$;

-- Audit the mutable financial entities.
DO $$
declare t text;
begin
  foreach t in array array[
    'professional_commission_rules','financial_entries','professional_commissions','financial_expenses',
    'accounts_payable','accounts_receivable','cash_sessions','cash_movements','professional_settlements'
  ]
  loop
    execute format('drop trigger if exists %I_finance_audit on public.%I', t, t);
    execute format('create trigger %I_finance_audit after insert or update or delete on public.%I for each row execute function public.finance_audit_trigger()', t, t);
  end loop;
end $$;

-- RLS: finance data is closed by default; access is explicitly granted per role.
DO $$
declare t text;
begin
  foreach t in array array[
    'financial_access','payment_methods','payment_method_fees','cost_centers','expense_categories',
    'professional_commission_rules','financial_entries','professional_commissions','financial_expenses',
    'accounts_payable','accounts_receivable','cash_sessions','cash_movements','professional_settlements',
    'professional_settlement_items','financial_audit_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Own access row is readable by the logged-in user.
drop policy if exists financial_access_read_own on public.financial_access;
create policy financial_access_read_own on public.financial_access
for select to authenticated
using (user_id = auth.uid() or public.finance_has_role(array['admin']));

drop policy if exists financial_access_admin_manage on public.financial_access;
create policy financial_access_admin_manage on public.financial_access
for all to authenticated
using (public.finance_has_role(array['admin']))
with check (public.finance_has_role(array['admin']));

-- Shared reference tables: authenticated finance users can read; admin/finance can manage.
DO $$
declare t text;
begin
  foreach t in array array['payment_methods','payment_method_fees','cost_centers','expense_categories']
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select to authenticated using (public.finance_has_role(array[''admin'',''finance'',''reception'',''professional'']))', t, t);
    execute format('drop policy if exists %I_manage on public.%I', t, t);
    execute format('create policy %I_manage on public.%I for all to authenticated using (public.finance_has_role(array[''admin'',''finance''])) with check (public.finance_has_role(array[''admin'',''finance'']))', t, t);
  end loop;
end $$;

-- Admin/finance full access to operational finance tables.
DO $$
declare t text;
begin
  foreach t in array array[
    'professional_commission_rules','financial_entries','professional_commissions','financial_expenses',
    'accounts_payable','accounts_receivable','cash_sessions','cash_movements','professional_settlements',
    'professional_settlement_items','financial_audit_log'
  ]
  loop
    execute format('drop policy if exists %I_admin_finance on public.%I', t, t);
    execute format('create policy %I_admin_finance on public.%I for all to authenticated using (public.finance_has_role(array[''admin'',''finance''])) with check (public.finance_has_role(array[''admin'',''finance'']))', t, t);
  end loop;
end $$;

-- Reception can operate payments, receivables and daily cash, but cannot browse commissions/audit/settings.
drop policy if exists financial_entries_reception on public.financial_entries;
create policy financial_entries_reception on public.financial_entries
for all to authenticated
using (public.finance_has_role(array['reception']))
with check (public.finance_has_role(array['reception']));

drop policy if exists accounts_receivable_reception on public.accounts_receivable;
create policy accounts_receivable_reception on public.accounts_receivable
for all to authenticated
using (public.finance_has_role(array['reception']))
with check (public.finance_has_role(array['reception']));

drop policy if exists cash_sessions_reception on public.cash_sessions;
create policy cash_sessions_reception on public.cash_sessions
for select to authenticated
using (public.finance_has_role(array['reception']));

drop policy if exists cash_sessions_reception_insert on public.cash_sessions;
create policy cash_sessions_reception_insert on public.cash_sessions
for insert to authenticated
with check (public.finance_has_role(array['reception']) and opened_by = auth.uid());

drop policy if exists cash_movements_reception on public.cash_movements;
create policy cash_movements_reception on public.cash_movements
for all to authenticated
using (public.finance_has_role(array['reception']))
with check (public.finance_has_role(array['reception']));

-- Professionals can only see their own production/commission rows.
drop policy if exists professional_commissions_own on public.professional_commissions;
create policy professional_commissions_own on public.professional_commissions
for select to authenticated
using (
  public.finance_has_role(array['professional'])
  and professional_id = (
    select fa.professional_id
    from public.financial_access fa
    where fa.user_id = auth.uid() and fa.role = 'professional' and fa.is_active = true
    limit 1
  )
);

drop policy if exists financial_entries_professional_own on public.financial_entries;
create policy financial_entries_professional_own on public.financial_entries
for select to authenticated
using (
  public.finance_has_role(array['professional'])
  and professional_id = (
    select fa.professional_id
    from public.financial_access fa
    where fa.user_id = auth.uid() and fa.role = 'professional' and fa.is_active = true
    limit 1
  )
);

comment on table public.financial_entries is 'Receitas financeiras. Appointment integration will create one idempotent row when an appointment becomes attended.';
comment on table public.professional_commission_rules is 'Per-professional commission model: percentage, fixed per patient, or manual.';
comment on table public.cash_sessions is 'Daily cash opening/closing. Closed sessions are locked operationally and later edits must be audited.';
