-- Contas a pagar: compras parceladas, recorrências com duração e comprovantes privados.

alter table public.accounts_payable
  add column if not exists series_id uuid,
  add column if not exists series_kind text,
  add column if not exists occurrence_number integer,
  add column if not exists occurrence_count integer,
  add column if not exists purchase_total_amount numeric(12,2);

-- Reconstrói séries antigas a partir da cadeia generated_from_id sem alterar valores/status.
with recursive payable_chain as (
  select ap.id, ap.generated_from_id, ap.id as root_id, 1 as depth
  from public.accounts_payable ap
  where ap.generated_from_id is null
  union all
  select child.id, child.generated_from_id, parent.root_id, parent.depth + 1
  from public.accounts_payable child
  join payable_chain parent on parent.id = child.generated_from_id
), ranked as (
  select id, root_id, depth from payable_chain
)
update public.accounts_payable ap
set series_id = ranked.root_id,
    occurrence_number = ranked.depth
from ranked
where ap.id = ranked.id
  and (ap.series_id is null or ap.occurrence_number is null);

update public.accounts_payable
set series_id = coalesce(series_id, id),
    occurrence_number = coalesce(occurrence_number, 1),
    series_kind = coalesce(
      series_kind,
      case when is_fixed or recurrence_type <> 'none' then 'recurring' else 'single' end
    ),
    occurrence_count = case
      when coalesce(series_kind, case when is_fixed or recurrence_type <> 'none' then 'recurring' else 'single' end) = 'single'
        then coalesce(occurrence_count, 1)
      else occurrence_count
    end,
    purchase_total_amount = case
      when coalesce(series_kind, case when is_fixed or recurrence_type <> 'none' then 'recurring' else 'single' end) = 'single'
        then coalesce(purchase_total_amount, amount)
      else purchase_total_amount
    end;

alter table public.accounts_payable
  alter column series_id set default gen_random_uuid(),
  alter column series_id set not null,
  alter column series_kind set default 'single',
  alter column series_kind set not null,
  alter column occurrence_number set default 1,
  alter column occurrence_number set not null;

alter table public.accounts_payable
  drop constraint if exists accounts_payable_series_kind_check,
  add constraint accounts_payable_series_kind_check
    check (series_kind in ('single','installment','recurring')),
  drop constraint if exists accounts_payable_occurrence_number_check,
  add constraint accounts_payable_occurrence_number_check
    check (occurrence_number >= 1),
  drop constraint if exists accounts_payable_occurrence_count_check,
  add constraint accounts_payable_occurrence_count_check
    check (occurrence_count is null or occurrence_count >= occurrence_number),
  drop constraint if exists accounts_payable_purchase_total_amount_check,
  add constraint accounts_payable_purchase_total_amount_check
    check (purchase_total_amount is null or purchase_total_amount > 0);

create unique index if not exists accounts_payable_series_occurrence_uidx
  on public.accounts_payable(series_id, occurrence_number);
create index if not exists accounts_payable_series_idx
  on public.accounts_payable(series_id, due_date);

create table if not exists public.account_payable_attachments (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null,
  file_path text not null unique,
  original_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists account_payable_attachments_series_idx
  on public.account_payable_attachments(series_id, created_at desc);

alter table public.account_payable_attachments enable row level security;
drop policy if exists account_payable_attachments_finance on public.account_payable_attachments;
create policy account_payable_attachments_finance
on public.account_payable_attachments
for all
to authenticated
using (public.finance_has_role(array['admin','finance']))
with check (public.finance_has_role(array['admin','finance']));

grant select, insert, delete on public.account_payable_attachments to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'finance-payable-attachments',
  'finance-payable-attachments',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Finance read payable attachments" on storage.objects;
create policy "Finance read payable attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'finance-payable-attachments'
  and public.finance_has_role(array['admin','finance'])
);

drop policy if exists "Finance upload payable attachments" on storage.objects;
create policy "Finance upload payable attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'finance-payable-attachments'
  and public.finance_has_role(array['admin','finance'])
);

drop policy if exists "Finance delete payable attachments" on storage.objects;
create policy "Finance delete payable attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'finance-payable-attachments'
  and public.finance_has_role(array['admin','finance'])
);

-- Mantém a ordem das colunas antigas da view e anexa os novos campos ao final.
create or replace view public.accounts_payable_with_status
with (security_invoker = true)
as
select
  ap.id,
  ap.title,
  ap.supplier,
  ap.category_id,
  ap.cost_center_id,
  ap.amount,
  ap.due_date,
  ap.status,
  ap.is_fixed,
  ap.recurrence_type,
  ap.payment_method_id,
  ap.paid_at,
  ap.paid_by,
  ap.description,
  ap.created_by,
  ap.created_at,
  ap.updated_at,
  ap.generated_from_id,
  case
    when ap.status = 'pending' and ap.due_date < (now() at time zone 'America/Fortaleza')::date then 'overdue'
    else ap.status
  end as display_status,
  ap.due_date - (now() at time zone 'America/Fortaleza')::date as days_until_due,
  case
    when ap.status <> 'pending' then 'none'
    when ap.due_date < (now() at time zone 'America/Fortaleza')::date then 'overdue'
    when ap.due_date = (now() at time zone 'America/Fortaleza')::date then 'due_today'
    when ap.due_date <= (now() at time zone 'America/Fortaleza')::date + 3 then 'due_soon'
    else 'none'
  end as alert_status,
  ap.series_id,
  ap.series_kind,
  ap.occurrence_number,
  ap.occurrence_count,
  ap.purchase_total_amount
from public.accounts_payable ap;

grant select on public.accounts_payable_with_status to authenticated;

create or replace function public.payable_month_due(_base date, _month_offset integer)
returns date
language sql
immutable
set search_path = ''
as $function$
  select (
    date_trunc('month', _base::timestamp + make_interval(months => _month_offset))
    + make_interval(days => least(
        extract(day from _base)::integer,
        extract(day from (date_trunc('month', _base::timestamp + make_interval(months => _month_offset)) + interval '1 month - 1 day'))::integer
      ) - 1)
  )::date;
$function$;

create or replace function public.create_account_payable_plan(
  _title text,
  _supplier text,
  _amount numeric,
  _first_due_date date,
  _plan_type text,
  _occurrence_count integer default null,
  _description text default null,
  _category_id uuid default null,
  _cost_center_id uuid default null
)
returns setof public.accounts_payable
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _series_id uuid := gen_random_uuid();
  _kind text;
  _recurrence text := 'none';
  _count integer := 1;
  _i integer;
  _row public.accounts_payable%rowtype;
  _previous_id uuid := null;
  _due date;
  _row_amount numeric(12,2);
  _base_cents bigint;
  _total_cents bigint;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.' using errcode = '42501';
  end if;
  if nullif(btrim(_title), '') is null then raise exception 'Título obrigatório.'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Valor inválido.'; end if;
  if _first_due_date is null then raise exception 'Data de vencimento obrigatória.'; end if;
  if _plan_type not in ('single','installment','monthly','weekly','yearly') then
    raise exception 'Tipo de conta inválido.';
  end if;

  if _plan_type = 'installment' then
    if _occurrence_count is null or _occurrence_count < 2 or _occurrence_count > 60 then
      raise exception 'A compra parcelada deve ter entre 2 e 60 parcelas.';
    end if;
    _kind := 'installment';
    _count := _occurrence_count;
  elsif _plan_type in ('monthly','weekly','yearly') then
    _kind := 'recurring';
    _recurrence := _plan_type;
    if _occurrence_count is not null and (_occurrence_count < 1 or _occurrence_count > 120) then
      raise exception 'A quantidade de ocorrências deve ficar entre 1 e 120.';
    end if;
    _count := coalesce(_occurrence_count, 1);
  else
    _kind := 'single';
    _count := 1;
  end if;

  _total_cents := round(_amount * 100)::bigint;
  if _kind = 'installment' then
    _base_cents := trunc(_total_cents::numeric / _count)::bigint;
  end if;

  for _i in 1.._count loop
    if _kind = 'installment' then
      _row_amount := case
        when _i < _count then _base_cents::numeric / 100
        else (_total_cents - (_base_cents * (_count - 1)))::numeric / 100
      end;
      _due := public.payable_month_due(_first_due_date, _i - 1);
    elsif _kind = 'recurring' then
      _row_amount := round(_amount, 2);
      _due := case _recurrence
        when 'weekly' then _first_due_date + ((_i - 1) * 7)
        when 'monthly' then public.payable_month_due(_first_due_date, _i - 1)
        when 'yearly' then (_first_due_date + make_interval(years => _i - 1))::date
      end;
    else
      _row_amount := round(_amount, 2);
      _due := _first_due_date;
    end if;

    insert into public.accounts_payable(
      title, supplier, category_id, cost_center_id, amount, due_date, status,
      is_fixed, recurrence_type, description, created_by, generated_from_id,
      series_id, series_kind, occurrence_number, occurrence_count, purchase_total_amount
    ) values (
      btrim(_title), nullif(btrim(coalesce(_supplier,'')), ''), _category_id, _cost_center_id,
      _row_amount, _due, 'pending', _kind = 'recurring', _recurrence,
      nullif(btrim(coalesce(_description,'')), ''), auth.uid(), _previous_id,
      _series_id, _kind, _i,
      case when _kind = 'single' then 1 else _occurrence_count end,
      case when _kind = 'installment' then round(_amount,2) when _kind = 'single' then round(_amount,2) else null end
    ) returning * into _row;

    _previous_id := _row.id;
    return next _row;
  end loop;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, new_data, metadata)
  values (
    'accounts_payable_series', _series_id, 'create_plan', auth.uid(), null,
    jsonb_build_object('plan_type', _plan_type, 'occurrence_count', _occurrence_count, 'amount', round(_amount,2), 'first_due_date', _first_due_date)
  );
end;
$function$;

revoke all on function public.create_account_payable_plan(text,text,numeric,date,text,integer,text,uuid,uuid) from public;
grant execute on function public.create_account_payable_plan(text,text,numeric,date,text,integer,text,uuid,uuid) to authenticated;

create or replace function public.update_pending_account_payable(
  _account_id uuid,
  _amount numeric,
  _due_date date,
  _description text default '__KEEP__'
)
returns public.accounts_payable
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _old public.accounts_payable%rowtype;
  _account public.accounts_payable%rowtype;
begin
  if not public.finance_has_role(array['admin','finance']) then raise exception 'Acesso financeiro insuficiente.'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Valor inválido.'; end if;
  if _due_date is null then raise exception 'Data de vencimento obrigatória.'; end if;

  select * into _old from public.accounts_payable where id = _account_id for update;
  if not found then raise exception 'Conta a pagar não encontrada.'; end if;
  if _old.status <> 'pending' then raise exception 'Somente contas pendentes podem ser editadas.'; end if;

  update public.accounts_payable
     set amount = round(_amount, 2),
         due_date = _due_date,
         description = case
           when _description = '__KEEP__' then description
           else nullif(btrim(coalesce(_description,'')), '')
         end,
         updated_at = now()
   where id = _account_id
   returning * into _account;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, new_data, metadata)
  values ('accounts_payable', _account.id, 'edit_pending', auth.uid(), to_jsonb(_old), to_jsonb(_account), jsonb_build_object('fields', jsonb_build_array('amount','due_date','description')));
  return _account;
end;
$function$;

revoke all on function public.update_pending_account_payable(uuid,numeric,date,text) from public;
grant execute on function public.update_pending_account_payable(uuid,numeric,date,text) to authenticated;

create or replace function public.pay_account_payable(
  _account_id uuid,
  _payment_method_code text,
  _paid_at timestamptz default now()
)
returns public.accounts_payable
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _account public.accounts_payable%rowtype;
  _method_id uuid;
  _next_due date;
  _next_number integer;
begin
  if not public.finance_has_role(array['admin','finance']) then raise exception 'Acesso financeiro insuficiente.'; end if;
  select * into _account from public.accounts_payable ap where ap.id=_account_id for update;
  if not found then raise exception 'Conta a pagar não encontrada.'; end if;
  if _account.status<>'pending' then raise exception 'A conta a pagar já foi processada.'; end if;
  select pm.id into _method_id from public.payment_methods pm where pm.code=_payment_method_code and pm.is_active=true limit 1;
  if _method_id is null then raise exception 'Forma de pagamento inválida.'; end if;

  insert into public.financial_expenses(expense_date,category_id,cost_center_id,description,amount,payment_method_id,paid,paid_at,created_by,notes,account_payable_id)
  values((_paid_at at time zone 'America/Fortaleza')::date,_account.category_id,_account.cost_center_id,'Conta paga: '||_account.title,_account.amount,_method_id,true,_paid_at,auth.uid(),coalesce(_account.description,_account.supplier),_account.id);

  update public.accounts_payable
  set status='paid', payment_method_id=_method_id, paid_at=_paid_at, paid_by=auth.uid(), updated_at=now()
  where id=_account.id returning * into _account;

  -- Só recorrência fixa SEM prazo gera a próxima ao pagar. Parcelamento e séries finitas já estão pré-gerados.
  if _account.series_kind = 'recurring'
     and _account.occurrence_count is null
     and _account.is_fixed
     and coalesce(_account.recurrence_type,'none') <> 'none' then
    _next_number := _account.occurrence_number + 1;
    _next_due := case _account.recurrence_type
      when 'weekly' then _account.due_date + 7
      when 'monthly' then public.payable_month_due(_account.due_date, 1)
      when 'yearly' then (_account.due_date + interval '1 year')::date
      else null
    end;
    if _next_due is not null then
      insert into public.accounts_payable(
        title,supplier,category_id,cost_center_id,amount,due_date,status,is_fixed,recurrence_type,
        description,created_by,generated_from_id,series_id,series_kind,occurrence_number,occurrence_count,purchase_total_amount
      ) values (
        _account.title,_account.supplier,_account.category_id,_account.cost_center_id,_account.amount,_next_due,'pending',true,
        _account.recurrence_type,_account.description,auth.uid(),_account.id,_account.series_id,'recurring',_next_number,null,null
      )
      on conflict(series_id, occurrence_number) do nothing;
    end if;
  end if;

  insert into public.financial_audit_log(entity_type,entity_id,action,actor_id,new_data,metadata)
  values('accounts_payable',_account.id,'pay',auth.uid(),to_jsonb(_account),jsonb_build_object('payment_method_code',_payment_method_code,'next_due_date',_next_due));
  return _account;
end;
$function$;
