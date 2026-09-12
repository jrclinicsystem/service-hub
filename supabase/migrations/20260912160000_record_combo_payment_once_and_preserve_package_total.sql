alter table public.client_budget_items
  add column if not exists package_total numeric(12,2);

update public.client_budget_items
set package_total = line_total
where package_total is null;

alter table public.client_budgets
  add column if not exists financial_entry_id uuid references public.financial_entries(id) on delete set null;

create or replace function public.record_client_budget_payment(
  _budget_id uuid,
  _payment_method_code text,
  _installments integer default 1,
  _occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _budget public.client_budgets%rowtype;
  _entry public.financial_entries%rowtype;
  _client_name text;
  _cash_movement_created boolean := false;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso insuficiente para registrar o pagamento do combo.' using errcode='42501';
  end if;

  select * into _budget
  from public.client_budgets
  where id = _budget_id
  for update;
  if not found then raise exception 'Combo não encontrado.' using errcode='23503'; end if;
  if _budget.is_paid then raise exception 'O pagamento deste combo já foi registrado.' using errcode='23514'; end if;
  if _budget.total_amount < 0 then raise exception 'Valor do combo inválido.' using errcode='23514'; end if;
  if coalesce(_installments,1) < 1 or coalesce(_installments,1) > 12 then raise exception 'Parcelas inválidas.' using errcode='23514'; end if;

  select c.name into _client_name from public.clients c where c.id = _budget.client_id;

  if round(_budget.total_amount,2) > 0 then
    if nullif(trim(_payment_method_code),'') is null then raise exception 'Informe a forma de pagamento.' using errcode='23514'; end if;

    select * into _entry
    from public.register_manual_financial_entry(
      'Combo — ' || _budget.title,
      round(_budget.total_amount,2),
      trim(_payment_method_code),
      coalesce(_installments,1),
      coalesce(_occurred_at,now()),
      'Pagamento integral do combo registrado pela ficha do cliente.'
    );

    update public.financial_entries
       set client_id = _budget.client_id,
           patient_name_snapshot = _client_name,
           service_name_snapshot = _budget.title,
           source = 'client_budget',
           notes = concat_ws(' · ', nullif(notes,''), 'Combo: ' || _budget.id::text),
           updated_at = now()
     where id = _entry.id
     returning * into _entry;

    select exists(select 1 from public.cash_movements cm where cm.financial_entry_id = _entry.id)
      into _cash_movement_created;
  end if;

  update public.client_budgets
     set is_paid = true,
         paid_amount = round(total_amount,2),
         paid_at = coalesce(_occurred_at,now()),
         payment_method_code = nullif(trim(_payment_method_code),''),
         financial_entry_id = case when _entry.id is not null then _entry.id else financial_entry_id end,
         status = 'approved',
         updated_at = now()
   where id = _budget_id
   returning * into _budget;

  return jsonb_build_object(
    'budget_id', _budget.id,
    'paid', true,
    'amount', _budget.paid_amount,
    'financial_entry_id', _budget.financial_entry_id,
    'cash_movement_created', _cash_movement_created
  );
end;
$function$;

revoke all on function public.record_client_budget_payment(uuid,text,integer,timestamptz) from public;
grant execute on function public.record_client_budget_payment(uuid,text,integer,timestamptz) to authenticated;
