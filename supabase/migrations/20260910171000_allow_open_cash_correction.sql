-- Permite corrigir com segurança o fundo inicial de um caixa ainda aberto.
-- A alteração fica auditada e ajusta o valor esperado pela mesma diferença.

create table if not exists public.cash_session_opening_adjustments (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions(id) on delete cascade,
  previous_opening_cash numeric(12,2) not null,
  new_opening_cash numeric(12,2) not null,
  difference_amount numeric(12,2) not null,
  reason text not null,
  adjusted_by uuid,
  adjusted_at timestamptz not null default now()
);

create index if not exists cash_session_opening_adjustments_session_idx
  on public.cash_session_opening_adjustments(cash_session_id, adjusted_at desc);

alter table public.cash_session_opening_adjustments enable row level security;

drop policy if exists cash_session_opening_adjustments_read on public.cash_session_opening_adjustments;
create policy cash_session_opening_adjustments_read
  on public.cash_session_opening_adjustments
  for select
  to authenticated
  using (public.finance_has_role(array['admin','finance','reception']));

create or replace function public.correct_open_cash_session(
  _session_id uuid,
  _opening_cash numeric,
  _reason text
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.cash_sessions%rowtype;
  v_new_opening numeric(12,2);
  v_delta numeric(12,2);
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso insuficiente para corrigir a abertura do caixa.' using errcode = '42501';
  end if;

  if _opening_cash is null or _opening_cash < 0 then
    raise exception 'Informe um fundo inicial válido.' using errcode = '23514';
  end if;

  if nullif(trim(_reason), '') is null then
    raise exception 'Informe o motivo da correção.' using errcode = '23514';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = _session_id
  for update;

  if not found then
    raise exception 'Caixa não encontrado.' using errcode = '23503';
  end if;

  if v_session.status <> 'open' then
    raise exception 'Somente um caixa ainda aberto pode ter a abertura corrigida.' using errcode = '23514';
  end if;

  v_new_opening := round(_opening_cash, 2);
  v_delta := round(v_new_opening - coalesce(v_session.opening_cash, 0), 2);

  if abs(v_delta) < 0.005 then
    return v_session;
  end if;

  insert into public.cash_session_opening_adjustments(
    cash_session_id,
    previous_opening_cash,
    new_opening_cash,
    difference_amount,
    reason,
    adjusted_by
  ) values (
    v_session.id,
    coalesce(v_session.opening_cash, 0),
    v_new_opening,
    v_delta,
    trim(_reason),
    auth.uid()
  );

  update public.cash_sessions
  set opening_cash = v_new_opening,
      expected_cash = coalesce(expected_cash, 0) + v_delta
  where id = v_session.id
  returning * into v_session;

  return v_session;
end;
$function$;

grant execute on function public.correct_open_cash_session(uuid,numeric,text) to authenticated;
