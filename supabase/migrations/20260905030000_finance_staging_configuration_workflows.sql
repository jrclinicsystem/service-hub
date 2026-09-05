-- Finance staging: controlled configuration workflows for fees and commissions.

create or replace function public.set_payment_method_fee(
  _payment_method_code text,
  _fee_percent numeric,
  _fixed_fee numeric default 0,
  _installments_min integer default 1,
  _installments_max integer default 1,
  _effective_from date default (now() at time zone 'America/Fortaleza')::date
)
returns public.payment_method_fees
language plpgsql
security definer
set search_path = ''
as $$
declare
  _method_id uuid;
  _fee public.payment_method_fees%rowtype;
begin
  if not public.finance_has_role(array['admin','finance']) then raise exception 'Acesso financeiro insuficiente.'; end if;
  if _fee_percent < 0 or _fixed_fee < 0 then raise exception 'Taxa inválida.'; end if;
  if _installments_min < 1 or _installments_max < _installments_min then raise exception 'Faixa de parcelas inválida.'; end if;

  select pm.id into _method_id from public.payment_methods pm where pm.code=_payment_method_code and pm.is_active=true limit 1;
  if _method_id is null then raise exception 'Forma de pagamento não encontrada.'; end if;

  if exists (
    select 1 from public.payment_method_fees f
    where f.payment_method_id=_method_id and f.is_active=true
      and f.effective_from >= _effective_from
      and f.effective_from <> _effective_from
      and int4range(f.installments_min,f.installments_max,'[]') && int4range(_installments_min,_installments_max,'[]')
  ) then
    raise exception 'Já existe uma taxa futura conflitante para esta faixa de parcelas.';
  end if;

  update public.payment_method_fees f
     set effective_to=_effective_from-1,updated_at=now()
   where f.payment_method_id=_method_id and f.is_active=true
     and f.effective_from < _effective_from
     and (f.effective_to is null or f.effective_to >= _effective_from)
     and int4range(f.installments_min,f.installments_max,'[]') && int4range(_installments_min,_installments_max,'[]');

  update public.payment_method_fees f
     set is_active=false,updated_at=now()
   where f.payment_method_id=_method_id and f.is_active=true
     and f.effective_from=_effective_from
     and int4range(f.installments_min,f.installments_max,'[]') && int4range(_installments_min,_installments_max,'[]');

  insert into public.payment_method_fees(payment_method_id,fee_percent,fixed_fee,installments_min,installments_max,effective_from,is_active,created_by)
  values(_method_id,round(_fee_percent,4),round(_fixed_fee,2),_installments_min,_installments_max,_effective_from,true,auth.uid())
  returning * into _fee;

  return _fee;
end;
$$;
revoke all on function public.set_payment_method_fee(text,numeric,numeric,integer,integer,date) from public,anon;
grant execute on function public.set_payment_method_fee(text,numeric,numeric,integer,integer,date) to authenticated;

create or replace function public.set_professional_commission_rule(
  _professional_id uuid,
  _commission_type text,
  _percentage numeric default null,
  _fixed_amount numeric default null,
  _calculation_base text default 'net_after_fees',
  _effective_from date default (now() at time zone 'America/Fortaleza')::date
)
returns public.professional_commission_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  _rule public.professional_commission_rules%rowtype;
begin
  if not public.finance_has_role(array['admin','finance']) then raise exception 'Acesso financeiro insuficiente.'; end if;
  if _professional_id is null then raise exception 'Profissional é obrigatório.'; end if;
  if _commission_type not in ('percentage','fixed_per_patient','manual') then raise exception 'Tipo de comissão inválido.'; end if;
  if _calculation_base not in ('original','after_discount','net_after_fees') then raise exception 'Base de cálculo inválida.'; end if;
  if _commission_type='percentage' and (_percentage is null or _percentage < 0 or _percentage > 100) then raise exception 'Percentual inválido.'; end if;
  if _commission_type='fixed_per_patient' and (_fixed_amount is null or _fixed_amount < 0) then raise exception 'Valor fixo inválido.'; end if;

  update public.professional_commission_rules r
     set effective_to=_effective_from-1,updated_at=now()
   where r.professional_id=_professional_id and r.is_active=true and r.effective_to is null and r.effective_from < _effective_from;

  update public.professional_commission_rules r
     set is_active=false,updated_at=now()
   where r.professional_id=_professional_id and r.is_active=true and r.effective_to is null and r.effective_from=_effective_from;

  insert into public.professional_commission_rules(professional_id,commission_type,percentage,fixed_amount,calculation_base,effective_from,is_active,created_by)
  values(
    _professional_id,
    _commission_type,
    case when _commission_type='percentage' then _percentage else null end,
    case when _commission_type='fixed_per_patient' then _fixed_amount else null end,
    _calculation_base,
    _effective_from,
    true,
    auth.uid()
  ) returning * into _rule;

  return _rule;
end;
$$;
revoke all on function public.set_professional_commission_rule(uuid,text,numeric,numeric,text,date) from public,anon;
grant execute on function public.set_professional_commission_rule(uuid,text,numeric,numeric,text,date) to authenticated;

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

  select pc,fe.net_amount into _commission,_net
  from public.professional_commissions pc
  join public.financial_entries fe on fe.id=pc.financial_entry_id
  where pc.id=_commission_id
  for update of pc;

  if not found then raise exception 'Comissão não encontrada.'; end if;
  if _commission.status='cancelled' then raise exception 'Comissão cancelada não pode ser ajustada.'; end if;
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

-- Audit configuration changes too.
drop trigger if exists payment_method_fees_finance_audit on public.payment_method_fees;
create trigger payment_method_fees_finance_audit
after insert or update or delete on public.payment_method_fees
for each row execute function public.finance_audit_trigger();

drop trigger if exists professional_commission_rules_finance_audit on public.professional_commission_rules;
create trigger professional_commission_rules_finance_audit
after insert or update or delete on public.professional_commission_rules
for each row execute function public.finance_audit_trigger();
