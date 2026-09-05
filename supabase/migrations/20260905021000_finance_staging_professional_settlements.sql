-- Finance staging: professional closing/settlement workflows.

create unique index if not exists professional_settlement_items_unique_commission
on public.professional_settlement_items(commission_id);

create or replace function public.generate_professional_settlement(
  _professional_id uuid,
  _period_start date,
  _period_end date
)
returns public.professional_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  _settlement public.professional_settlements%rowtype;
  _procedures integer := 0;
  _gross numeric := 0;
  _net numeric := 0;
  _commission numeric := 0;
  _clinic numeric := 0;
  _repassed numeric := 0;
  _pending numeric := 0;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  if _professional_id is null then raise exception 'Profissional é obrigatório.'; end if;
  if _period_start is null or _period_end is null or _period_end < _period_start then
    raise exception 'Período inválido.';
  end if;

  select * into _settlement
  from public.professional_settlements ps
  where ps.professional_id = _professional_id
    and ps.period_start = _period_start
    and ps.period_end = _period_end
  for update;

  if found and _settlement.status <> 'open' then
    raise exception 'Este fechamento já foi encerrado.';
  end if;

  if not found then
    insert into public.professional_settlements(professional_id,period_start,period_end,status)
    values (_professional_id,_period_start,_period_end,'open')
    returning * into _settlement;
  end if;

  delete from public.professional_settlement_items
  where settlement_id = _settlement.id;

  insert into public.professional_settlement_items(settlement_id,commission_id)
  select _settlement.id, pc.id
  from public.professional_commissions pc
  join public.financial_entries fe on fe.id = pc.financial_entry_id
  where pc.professional_id = _professional_id
    and pc.status <> 'cancelled'
    and fe.status <> 'cancelled'
    and (fe.occurred_at at time zone 'America/Fortaleza')::date between _period_start and _period_end
    and not exists (
      select 1
      from public.professional_settlement_items psi
      where psi.commission_id = pc.id
        and psi.settlement_id <> _settlement.id
    );

  select
    count(*)::integer,
    coalesce(sum(fe.charged_amount),0),
    coalesce(sum(fe.net_amount),0),
    coalesce(sum(pc.commission_amount),0),
    coalesce(sum(pc.clinic_amount),0),
    coalesce(sum(case when pc.status='paid' then pc.commission_amount else 0 end),0),
    coalesce(sum(case when pc.status='pending' then pc.commission_amount else 0 end),0)
  into _procedures,_gross,_net,_commission,_clinic,_repassed,_pending
  from public.professional_settlement_items psi
  join public.professional_commissions pc on pc.id=psi.commission_id
  join public.financial_entries fe on fe.id=pc.financial_entry_id
  where psi.settlement_id=_settlement.id;

  update public.professional_settlements
     set procedures_count=_procedures,
         gross_revenue=round(_gross,2),
         net_revenue=round(_net,2),
         commission_total=round(_commission,2),
         clinic_total=round(_clinic,2),
         amount_repassed=round(_repassed,2),
         amount_pending=round(_pending,2),
         updated_at=now()
   where id=_settlement.id
   returning * into _settlement;

  return _settlement;
end;
$$;

revoke all on function public.generate_professional_settlement(uuid,date,date) from public,anon;
grant execute on function public.generate_professional_settlement(uuid,date,date) to authenticated;

create or replace function public.close_professional_settlement(_settlement_id uuid)
returns public.professional_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  _settlement public.professional_settlements%rowtype;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  select * into _settlement
  from public.professional_settlements ps
  where ps.id=_settlement_id
  for update;

  if not found then raise exception 'Fechamento não encontrado.'; end if;
  if _settlement.status <> 'open' then raise exception 'Fechamento não está aberto.'; end if;

  select * into _settlement
  from public.generate_professional_settlement(_settlement.professional_id,_settlement.period_start,_settlement.period_end);

  update public.professional_settlements
     set status='closed',closed_by=auth.uid(),closed_at=now(),updated_at=now()
   where id=_settlement.id
   returning * into _settlement;

  insert into public.financial_audit_log(entity_type,entity_id,action,actor_id,new_data)
  values ('professional_settlements',_settlement.id,'close',auth.uid(),to_jsonb(_settlement));

  return _settlement;
end;
$$;

revoke all on function public.close_professional_settlement(uuid) from public,anon;
grant execute on function public.close_professional_settlement(uuid) to authenticated;

create or replace function public.pay_professional_settlement(_settlement_id uuid)
returns public.professional_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  _settlement public.professional_settlements%rowtype;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  select * into _settlement
  from public.professional_settlements ps
  where ps.id=_settlement_id
  for update;

  if not found then raise exception 'Fechamento não encontrado.'; end if;
  if _settlement.status not in ('open','closed') then raise exception 'Fechamento já foi pago ou cancelado.'; end if;

  update public.professional_commissions pc
     set status='paid',paid_at=now(),paid_by=auth.uid(),updated_at=now()
   where pc.status='pending'
     and exists (
       select 1 from public.professional_settlement_items psi
       where psi.settlement_id=_settlement.id and psi.commission_id=pc.id
     );

  update public.professional_settlements
     set status='paid',
         amount_repassed=commission_total,
         amount_pending=0,
         closed_by=coalesce(closed_by,auth.uid()),
         closed_at=coalesce(closed_at,now()),
         updated_at=now()
   where id=_settlement.id
   returning * into _settlement;

  insert into public.financial_audit_log(entity_type,entity_id,action,actor_id,new_data)
  values ('professional_settlements',_settlement.id,'pay',auth.uid(),to_jsonb(_settlement));

  return _settlement;
end;
$$;

revoke all on function public.pay_professional_settlement(uuid) from public,anon;
grant execute on function public.pay_professional_settlement(uuid) to authenticated;
