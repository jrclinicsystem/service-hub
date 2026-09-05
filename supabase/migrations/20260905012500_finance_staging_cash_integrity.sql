-- Finance staging: keep paid cash expenses synchronized with the daily cash session
-- and protect closed cash data from direct mutation.

create unique index if not exists cash_movements_unique_expense
on public.cash_movements(expense_id)
where expense_id is not null;

create or replace function public.finance_guard_cash_movement_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _session_id uuid;
  _status text;
begin
  _session_id := case when tg_op = 'DELETE' then old.cash_session_id else new.cash_session_id end;

  select cs.status
    into _status
  from public.cash_sessions cs
  where cs.id = _session_id;

  if _status is null then
    raise exception 'Caixa não encontrado.';
  end if;

  if _status <> 'open' then
    raise exception 'Movimentos de um caixa fechado não podem ser alterados diretamente.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.finance_guard_cash_movement_mutation() from public, anon, authenticated;

drop trigger if exists cash_movements_guard_closed_session on public.cash_movements;
create trigger cash_movements_guard_closed_session
before insert or update or delete on public.cash_movements
for each row execute function public.finance_guard_cash_movement_mutation();

create or replace function public.finance_sync_paid_cash_expense()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _cash_method_id uuid;
  _movement_id uuid;
  _movement_session_id uuid;
  _movement_session_status text;
  _target_session_id uuid;
  _qualifies boolean;
begin
  select pm.id
    into _cash_method_id
  from public.payment_methods pm
  where pm.code = 'cash'
    and pm.is_active = true
  limit 1;

  if _cash_method_id is null then
    raise exception 'Forma de pagamento Dinheiro não está configurada.';
  end if;

  select cm.id, cm.cash_session_id, cs.status
    into _movement_id, _movement_session_id, _movement_session_status
  from public.cash_movements cm
  join public.cash_sessions cs on cs.id = cm.cash_session_id
  where cm.expense_id = new.id
  limit 1;

  _qualifies := new.paid = true and new.payment_method_id = _cash_method_id;

  if not _qualifies then
    if _movement_id is not null then
      if _movement_session_status <> 'open' then
        raise exception 'A despesa está vinculada a um caixa fechado e não pode ser desvinculada diretamente.';
      end if;

      delete from public.cash_movements
      where id = _movement_id;
    end if;

    return new;
  end if;

  select cs.id
    into _target_session_id
  from public.cash_sessions cs
  where cs.business_date = new.expense_date
    and cs.status = 'open'
  order by cs.opened_at desc
  limit 1;

  if _target_session_id is null then
    raise exception 'Abra o caixa da data antes de registrar uma saída paga em dinheiro.';
  end if;

  if _movement_id is not null and _movement_session_id <> _target_session_id then
    if _movement_session_status <> 'open' then
      raise exception 'A despesa está vinculada a um caixa fechado e não pode ser movida diretamente.';
    end if;

    delete from public.cash_movements where id = _movement_id;
    _movement_id := null;
  end if;

  if _movement_id is null then
    insert into public.cash_movements(
      cash_session_id,
      movement_type,
      payment_method_id,
      expense_id,
      amount,
      description,
      occurred_at,
      created_by
    ) values (
      _target_session_id,
      'expense',
      _cash_method_id,
      new.id,
      round(new.amount, 2),
      'Despesa paga em dinheiro: ' || new.description,
      coalesce(new.paid_at, now()),
      coalesce(new.created_by, auth.uid())
    );
  else
    update public.cash_movements
       set amount = round(new.amount, 2),
           description = 'Despesa paga em dinheiro: ' || new.description,
           occurred_at = coalesce(new.paid_at, occurred_at),
           payment_method_id = _cash_method_id
     where id = _movement_id;
  end if;

  return new;
end;
$$;

revoke all on function public.finance_sync_paid_cash_expense() from public, anon, authenticated;

drop trigger if exists financial_expenses_sync_cash on public.financial_expenses;
create trigger financial_expenses_sync_cash
after insert or update of paid, payment_method_id, amount, expense_date, description, paid_at
on public.financial_expenses
for each row execute function public.finance_sync_paid_cash_expense();

create or replace function public.finance_guard_closed_cash_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'closed' then
    raise exception 'Um caixa fechado não pode ser alterado diretamente. Use um ajuste auditado.';
  end if;

  return new;
end;
$$;

revoke all on function public.finance_guard_closed_cash_session() from public, anon, authenticated;

drop trigger if exists cash_sessions_guard_closed_update on public.cash_sessions;
create trigger cash_sessions_guard_closed_update
before update on public.cash_sessions
for each row execute function public.finance_guard_closed_cash_session();
