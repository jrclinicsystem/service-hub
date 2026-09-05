create or replace function public.mark_commission_paid(_commission_id uuid)
returns public.professional_commissions
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c public.professional_commissions%rowtype;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente';
  end if;

  update public.professional_commissions
  set status='paid',
      paid_at=now(),
      paid_by=auth.uid(),
      updated_at=now()
  where id=_commission_id
    and status='pending'
  returning * into c;

  if not found then
    raise exception 'Comissão não encontrada ou já processada';
  end if;

  update public.professional_settlements ps
  set amount_repassed = totals.amount_repassed,
      amount_pending = totals.amount_pending,
      updated_at = now()
  from (
    select
      psi.settlement_id,
      round(coalesce(sum(case when pc.status='paid' then pc.commission_amount else 0 end),0),2) as amount_repassed,
      round(coalesce(sum(case when pc.status='pending' then pc.commission_amount else 0 end),0),2) as amount_pending
    from public.professional_settlement_items psi
    join public.professional_commissions pc on pc.id=psi.commission_id
    where psi.settlement_id in (
      select psi2.settlement_id
      from public.professional_settlement_items psi2
      where psi2.commission_id=c.id
    )
    group by psi.settlement_id
  ) totals
  where ps.id=totals.settlement_id
    and ps.status in ('open','closed');

  insert into public.financial_audit_log(entity_type,entity_id,action,actor_id,new_data)
  values ('professional_commissions',c.id,'pay',auth.uid(),to_jsonb(c));

  return c;
end;
$function$;

revoke all on function public.mark_commission_paid(uuid) from public;
revoke all on function public.mark_commission_paid(uuid) from anon;
grant execute on function public.mark_commission_paid(uuid) to authenticated;
