-- Partial commission payments with automatic expense posting.

alter table public.professional_commissions
  add column if not exists paid_amount numeric(12,2) not null default 0;

update public.professional_commissions
set paid_amount = case
  when status = 'paid' then commission_amount
  else least(greatest(coalesce(paid_amount, 0), 0), commission_amount)
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'professional_commissions_paid_amount_check'
      and conrelid = 'public.professional_commissions'::regclass
  ) then
    alter table public.professional_commissions
      add constraint professional_commissions_paid_amount_check
      check (paid_amount >= 0 and paid_amount <= commission_amount);
  end if;
end
$$;

create table if not exists public.professional_commission_payments (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.professional_commissions(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  expense_id uuid not null unique references public.financial_expenses(id) on delete restrict,
  paid_at timestamptz not null default now(),
  paid_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists professional_commission_payments_commission_idx
  on public.professional_commission_payments (commission_id, paid_at desc);

alter table public.professional_commission_payments enable row level security;

drop policy if exists "Finance read commission payments" on public.professional_commission_payments;
create policy "Finance read commission payments"
on public.professional_commission_payments
for select
to authenticated
using (public.finance_has_role(array['admin','finance']));

grant select on public.professional_commission_payments to authenticated;

insert into public.expense_categories (name, is_active)
select 'Comissões', true
where not exists (
  select 1 from public.expense_categories where lower(name) = lower('Comissões')
);

create or replace function public.register_commission_payment(
  _commission_id uuid,
  _amount numeric
)
returns public.professional_commissions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  c public.professional_commissions%rowtype;
  v_amount numeric(12,2);
  v_remaining numeric(12,2);
  v_new_paid numeric(12,2);
  v_expense_id uuid;
  v_category_id uuid;
  v_professional_name text;
  v_patient_name text;
  v_service_name text;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente';
  end if;

  select *
    into c
  from public.professional_commissions
  where id = _commission_id
  for update;

  if not found then
    raise exception 'Comissão não encontrada';
  end if;

  if c.status = 'cancelled' then
    raise exception 'Comissão cancelada não pode receber pagamento';
  end if;

  v_remaining := round(greatest(0::numeric, c.commission_amount - coalesce(c.paid_amount, 0)), 2);
  if c.status = 'paid' or v_remaining <= 0 then
    raise exception 'Comissão já está totalmente paga';
  end if;

  v_amount := round(coalesce(_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'Informe um valor de pagamento maior que zero';
  end if;
  if v_amount > v_remaining then
    raise exception 'O valor informado é maior que o restante da comissão';
  end if;

  select p.name
    into v_professional_name
  from public.professionals p
  where p.id = c.professional_id;

  select fe.patient_name_snapshot, fe.service_name_snapshot
    into v_patient_name, v_service_name
  from public.financial_entries fe
  where fe.id = c.financial_entry_id;

  select ec.id
    into v_category_id
  from public.expense_categories ec
  where lower(ec.name) = lower('Comissões')
  order by ec.is_active desc, ec.created_at asc
  limit 1;

  insert into public.financial_expenses (
    expense_date,
    category_id,
    description,
    amount,
    paid,
    paid_at,
    created_by,
    notes
  ) values (
    (now() at time zone 'America/Fortaleza')::date,
    v_category_id,
    'Comissão — ' || coalesce(v_professional_name, 'Profissional') ||
      case when nullif(btrim(coalesce(v_patient_name, '')), '') is not null
        then ' — ' || v_patient_name else '' end,
    v_amount,
    true,
    now(),
    auth.uid(),
    'Pagamento de comissão' ||
      case when nullif(btrim(coalesce(v_service_name, '')), '') is not null
        then ' · ' || v_service_name else '' end ||
      ' · comissão ' || c.id::text
  )
  returning id into v_expense_id;

  insert into public.professional_commission_payments (
    commission_id,
    amount,
    expense_id,
    paid_at,
    paid_by
  ) values (
    c.id,
    v_amount,
    v_expense_id,
    now(),
    auth.uid()
  );

  v_new_paid := round(coalesce(c.paid_amount, 0) + v_amount, 2);

  update public.professional_commissions
  set paid_amount = v_new_paid,
      status = case when v_new_paid >= commission_amount then 'paid' else 'pending' end,
      paid_at = case when v_new_paid >= commission_amount then now() else null end,
      paid_by = case when v_new_paid >= commission_amount then auth.uid() else paid_by end,
      updated_at = now()
  where id = c.id
  returning * into c;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, new_data)
  values (
    'professional_commissions',
    c.id,
    case when c.status = 'paid' then 'pay' else 'partial_pay' end,
    auth.uid(),
    jsonb_build_object(
      'commission', to_jsonb(c),
      'payment_amount', v_amount,
      'expense_id', v_expense_id
    )
  );

  return c;
end;
$function$;

grant execute on function public.register_commission_payment(uuid, numeric) to authenticated;

create or replace function public.mark_commission_paid(_commission_id uuid)
returns public.professional_commissions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  c public.professional_commissions%rowtype;
  v_remaining numeric(12,2);
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente';
  end if;

  select * into c
  from public.professional_commissions
  where id = _commission_id;

  if not found then
    raise exception 'Comissão não encontrada';
  end if;

  v_remaining := round(greatest(0::numeric, c.commission_amount - coalesce(c.paid_amount, 0)), 2);
  if c.status = 'paid' or v_remaining <= 0 then
    raise exception 'Comissão não encontrada ou já processada';
  end if;

  return public.register_commission_payment(_commission_id, v_remaining);
end;
$function$;

grant execute on function public.mark_commission_paid(uuid) to authenticated;
