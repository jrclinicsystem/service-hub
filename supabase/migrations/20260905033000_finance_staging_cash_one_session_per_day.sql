-- A business date has exactly one cash session lifecycle: open -> closed.
drop index if exists public.cash_sessions_one_open_per_date;
create unique index if not exists cash_sessions_one_per_business_date
on public.cash_sessions(business_date);

create or replace function public.open_cash_session(
  _opening_cash numeric,
  _business_date date default (now() at time zone 'America/Fortaleza')::date
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  _session public.cash_sessions%rowtype;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso financeiro insuficiente';
  end if;
  if _opening_cash < 0 then raise exception 'Fundo de caixa inválido'; end if;

  if exists(select 1 from public.cash_sessions cs where cs.business_date=_business_date) then
    raise exception 'Já existe um caixa registrado para esta data.';
  end if;

  insert into public.cash_sessions(business_date,opened_by,opening_cash)
  values(_business_date,auth.uid(),round(_opening_cash,2))
  returning * into _session;

  return _session;
end;
$$;

revoke all on function public.open_cash_session(numeric,date) from public,anon;
grant execute on function public.open_cash_session(numeric,date) to authenticated;
