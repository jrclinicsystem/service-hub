create or replace function public.delete_financial_entry(_entry_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  _entry public.financial_entries%rowtype;
  _commission_id uuid;
  _has_paid boolean := false;
  _in_settlement boolean := false;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  select * into _entry
  from public.financial_entries
  where id = _entry_id
  for update;

  if not found then
    raise exception 'Entrada financeira não encontrada.';
  end if;

  select pc.id into _commission_id
  from public.professional_commissions pc
  where pc.financial_entry_id = _entry_id
    and pc.status <> 'cancelled'
  limit 1;

  if _commission_id is not null then
    select exists(
      select 1 from public.professional_commission_payments p
      where p.commission_id = _commission_id
    ) into _has_paid;

    select exists(
      select 1 from public.professional_settlement_items si
      where si.commission_id = _commission_id
    ) into _in_settlement;

    if _has_paid then
      raise exception 'Esta entrada possui comissão já paga. Reverta o pagamento da comissão antes de excluir a entrada.';
    end if;
    if _in_settlement then
      raise exception 'Esta entrada faz parte de um fechamento de comissão. Remova-a do fechamento antes de excluir.';
    end if;
  end if;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, new_data, metadata)
  values (
    'financial_entries',
    _entry_id,
    'delete',
    auth.uid(),
    to_jsonb(_entry),
    null,
    jsonb_build_object('source', _entry.source, 'appointment_id', _entry.appointment_id)
  );

  delete from public.cash_movements where financial_entry_id = _entry_id;
  delete from public.financial_entries where id = _entry_id;

  return true;
end;
$$;

revoke all on function public.delete_financial_entry(uuid) from public;
grant execute on function public.delete_financial_entry(uuid) to authenticated;
