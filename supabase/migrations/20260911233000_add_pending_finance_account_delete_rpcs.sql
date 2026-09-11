create or replace function public.delete_pending_account_payable(_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _old public.accounts_payable%rowtype;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.' using errcode = '42501';
  end if;

  select * into _old
  from public.accounts_payable
  where id = _account_id
  for update;

  if not found then
    raise exception 'Conta a pagar não encontrada.';
  end if;
  if _old.status <> 'pending' then
    raise exception 'Somente contas pendentes podem ser excluídas.';
  end if;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, metadata)
  values (
    'accounts_payable', _old.id, 'delete', auth.uid(), to_jsonb(_old),
    jsonb_build_object(
      'series_id', _old.series_id,
      'series_kind', _old.series_kind,
      'occurrence_number', _old.occurrence_number,
      'reason', 'manual_pending_delete'
    )
  );

  delete from public.accounts_payable where id = _old.id;
end;
$function$;

revoke all on function public.delete_pending_account_payable(uuid) from public;
grant execute on function public.delete_pending_account_payable(uuid) to authenticated;

create or replace function public.delete_pending_account_receivable(_receivable_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _old public.accounts_receivable%rowtype;
  _entry public.financial_entries%rowtype;
  _entry_found boolean := false;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.' using errcode = '42501';
  end if;

  select * into _old
  from public.accounts_receivable
  where id = _receivable_id
  for update;

  if not found then
    raise exception 'Conta a receber não encontrada.';
  end if;
  if _old.status <> 'pending' or coalesce(_old.amount_received, 0) <> 0 then
    raise exception 'Somente contas pendentes e ainda não recebidas podem ser excluídas.';
  end if;

  if _old.appointment_id is not null then
    select * into _entry
    from public.financial_entries
    where appointment_id = _old.appointment_id
      and status = 'pending'
    order by created_at desc
    limit 1
    for update;
    _entry_found := found;
  elsif _old.room_reservation_id is not null then
    select * into _entry
    from public.financial_entries
    where room_reservation_id = _old.room_reservation_id
      and status = 'pending'
    order by created_at desc
    limit 1
    for update;
    _entry_found := found;
  end if;

  if _entry_found then
    delete from public.cash_movements where financial_entry_id = _entry.id;
    delete from public.financial_entries where id = _entry.id;
  end if;

  if _old.appointment_id is not null then
    update public.appointments
    set receivable_due_date = null
    where id = _old.appointment_id;
  end if;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, metadata)
  values (
    'accounts_receivable', _old.id, 'delete', auth.uid(), to_jsonb(_old),
    jsonb_build_object(
      'linked_financial_entry_id', case when _entry_found then _entry.id else null end,
      'reason', 'manual_pending_delete'
    )
  );

  delete from public.accounts_receivable where id = _old.id;
end;
$function$;

revoke all on function public.delete_pending_account_receivable(uuid) from public;
grant execute on function public.delete_pending_account_receivable(uuid) to authenticated;
