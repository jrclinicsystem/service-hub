-- Corrige o fluxo de correção de caixa fechado.
-- A correção deve ser auditada em cash_session_corrections, sem alterar/excluir
-- diretamente o registro histórico de cash_sessions (que permanece imutável).

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
  v_correction public.cash_session_corrections%rowtype;
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
  for share;

  if not found then
    raise exception 'Caixa não encontrado.' using errcode = '23503';
  end if;

  if v_old.status <> 'closed' then
    raise exception 'Somente um caixa já fechado pode ter a contagem corrigida.' using errcode = '23514';
  end if;

  insert into public.cash_session_corrections(
    cash_session_id,
    corrected_counted_cash,
    corrected_note,
    reason,
    created_by
  ) values (
    v_old.id,
    round(_counted_cash, 2),
    null,
    trim(_reason),
    auth.uid()
  )
  returning * into v_correction;

  v_new := v_old;
  v_new.counted_cash := round(_counted_cash, 2);
  v_new.difference_amount := round(_counted_cash - coalesce(v_old.expected_cash, 0), 2);
  v_new.updated_at := now();

  insert into public.financial_audit_log(
    entity_type, entity_id, action, actor_id, old_data, new_data, metadata
  ) values (
    'cash_sessions',
    v_old.id,
    'override',
    auth.uid(),
    jsonb_build_object(
      'counted_cash', v_old.counted_cash,
      'difference_amount', v_old.difference_amount,
      'closing_note', v_old.closing_note
    ),
    jsonb_build_object(
      'counted_cash', v_new.counted_cash,
      'difference_amount', v_new.difference_amount,
      'closing_note', v_old.closing_note
    ),
    jsonb_build_object(
      'reason', trim(_reason),
      'correction_id', v_correction.id,
      'kind', 'closed_cash_correction'
    )
  );

  return v_new;
end;
$function$;

revoke all on function public.correct_closed_cash_session(uuid,numeric,text) from public;
grant execute on function public.correct_closed_cash_session(uuid,numeric,text) to authenticated;
