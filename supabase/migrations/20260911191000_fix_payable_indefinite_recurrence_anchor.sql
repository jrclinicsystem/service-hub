-- Preserva o dia original da série em recorrências sem prazo.
-- Ex.: 31/jan -> 28/fev -> 31/mar, em vez de passar a usar dia 28 para sempre.

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
  _series_anchor_due date;
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

  if _account.series_kind = 'recurring'
     and _account.occurrence_count is null
     and _account.is_fixed
     and coalesce(_account.recurrence_type,'none') <> 'none' then
    _next_number := _account.occurrence_number + 1;

    select ap.due_date into _series_anchor_due
    from public.accounts_payable ap
    where ap.series_id = _account.series_id
    order by ap.occurrence_number asc
    limit 1;
    _series_anchor_due := coalesce(_series_anchor_due, _account.due_date);

    _next_due := case _account.recurrence_type
      when 'weekly' then _series_anchor_due + ((_next_number - 1) * 7)
      when 'monthly' then public.payable_month_due(_series_anchor_due, _next_number - 1)
      when 'yearly' then (_series_anchor_due + make_interval(years => _next_number - 1))::date
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
