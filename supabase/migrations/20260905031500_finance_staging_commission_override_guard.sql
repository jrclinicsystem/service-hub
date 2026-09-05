-- Do not rewrite a commission after it has already been repassed.
create or replace function public.override_professional_commission(
  _commission_id uuid,
  _commission_amount numeric,
  _reason text
)
returns public.professional_commissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  _commission public.professional_commissions%rowtype;
  _net numeric;
begin
  if not public.finance_has_role(array['admin','finance']) then raise exception 'Acesso financeiro insuficiente.'; end if;
  if _commission_amount < 0 then raise exception 'Comissão inválida.'; end if;
  if nullif(trim(_reason),'') is null then raise exception 'Informe o motivo do ajuste manual.'; end if;

  select * into _commission
  from public.professional_commissions pc
  where pc.id=_commission_id
  for update;

  if not found then raise exception 'Comissão não encontrada.'; end if;
  if _commission.status='cancelled' then raise exception 'Comissão cancelada não pode ser ajustada.'; end if;
  if _commission.status='paid' then raise exception 'Comissão já paga não pode ser alterada retroativamente.'; end if;

  select fe.net_amount into _net
  from public.financial_entries fe
  where fe.id=_commission.financial_entry_id;

  if _net is null then raise exception 'Lançamento financeiro da comissão não foi encontrado.'; end if;
  if _commission_amount > _net then raise exception 'Comissão maior que o valor líquido do atendimento.'; end if;

  update public.professional_commissions
     set commission_type='manual',
         calculation_base='manual',
         base_amount=_net,
         percentage=null,
         fixed_amount=null,
         commission_amount=round(_commission_amount,2),
         clinic_amount=round(_net-_commission_amount,2),
         is_manual_override=true,
         override_reason=trim(_reason),
         updated_at=now()
   where id=_commission_id
   returning * into _commission;

  insert into public.financial_audit_log(entity_type,entity_id,action,actor_id,new_data,metadata)
  values('professional_commissions',_commission.id,'override',auth.uid(),to_jsonb(_commission),jsonb_build_object('reason',trim(_reason)));

  return _commission;
end;
$$;

revoke all on function public.override_professional_commission(uuid,numeric,text) from public,anon;
grant execute on function public.override_professional_commission(uuid,numeric,text) to authenticated;
