create or replace function public.correct_closed_cash_session(
  _session_id uuid,
  _counted_cash numeric,
  _reason text
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old public.cash_sessions%rowtype;
  v_new public.cash_sessions%rowtype;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso insuficiente para corrigir o fechamento do caixa.' using errcode = '42501';
  end if;

  if _counted_cash is null or _counted_cash < 0 then
    raise exception 'Informe um valor contado válido.' using errcode = '23514';
  end if;

  if nullif(trim(_reason), '') is null then
    raise exception 'Informe o motivo da correção.' using errcode = '23514';
  end if;

  select * into v_old
  from public.cash_sessions
  where id = _session_id
  for update;

  if not found then
    raise exception 'Caixa não encontrado.' using errcode = '23503';
  end if;

  if v_old.status <> 'closed' then
    raise exception 'Somente um caixa já fechado pode ter a contagem corrigida.' using errcode = '23514';
  end if;

  update public.cash_sessions
     set counted_cash = round(_counted_cash, 2),
         difference_amount = round(_counted_cash - coalesce(expected_cash, 0), 2),
         updated_at = now()
   where id = v_old.id
   returning * into v_new;

  insert into public.financial_audit_log(
    entity_type, entity_id, action, actor_id, old_data, new_data, metadata
  ) values (
    'cash_sessions', v_old.id, 'correct_close', auth.uid(), to_jsonb(v_old), to_jsonb(v_new),
    jsonb_build_object('reason', trim(_reason))
  );

  return v_new;
end;
$function$;

grant execute on function public.correct_closed_cash_session(uuid,numeric,text) to authenticated;
