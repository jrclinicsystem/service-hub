create or replace function public.generate_historical_commission(_commission_id uuid)
returns public.professional_commissions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_commission public.professional_commissions%rowtype;
  v_entry public.financial_entries%rowtype;
  v_rule public.professional_commission_rules%rowtype;
  v_today date := (now() at time zone 'America/Fortaleza')::date;
  v_entry_date date;
  v_base numeric(12,2);
  v_amount numeric(12,2);
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  select * into v_commission
  from public.professional_commissions pc
  where pc.id = _commission_id
  for update;

  if not found then
    raise exception 'Comissão não encontrada.';
  end if;

  if v_commission.status = 'cancelled' then
    raise exception 'Comissão cancelada não pode ser gerada novamente.';
  end if;

  if v_commission.status = 'paid' or coalesce(v_commission.paid_amount, 0) > 0 then
    raise exception 'Esta comissão já possui pagamento e não pode ser recalculada.';
  end if;

  if v_commission.is_manual_override then
    raise exception 'Esta comissão possui ajuste manual e não pode ser recalculada automaticamente.';
  end if;

  if coalesce(v_commission.commission_amount, 0) <> 0 then
    raise exception 'Esta comissão já possui valor calculado.';
  end if;

  select * into v_entry
  from public.financial_entries fe
  where fe.id = v_commission.financial_entry_id
  for update;

  if not found or v_entry.appointment_id is null then
    raise exception 'O lançamento não corresponde a um agendamento antigo.';
  end if;

  if v_entry.status = 'cancelled' then
    raise exception 'Lançamento financeiro cancelado não gera comissão.';
  end if;

  if v_entry.professional_id is null then
    raise exception 'O atendimento não possui profissional vinculada.';
  end if;

  v_entry_date := (v_entry.occurred_at at time zone 'America/Fortaleza')::date;

  select * into v_rule
  from public.professional_commission_rules r
  where r.professional_id = v_entry.professional_id
    and r.is_active = true
    and r.effective_from <= v_today
    and (r.effective_to is null or r.effective_to >= v_today)
  order by r.effective_from desc, r.created_at desc
  limit 1;

  if not found then
    raise exception 'Cadastre uma regra de comissão atual para esta profissional antes de gerar a comissão antiga.';
  end if;

  if v_entry_date >= v_rule.effective_from then
    raise exception 'Este atendimento não é anterior à regra de comissão atual.';
  end if;

  if v_rule.commission_type = 'manual' then
    raise exception 'A regra atual é manual. Use o ajuste manual de comissão para este atendimento.';
  end if;

  v_base := round(
    case v_rule.calculation_base
      when 'original' then v_entry.original_amount
      when 'after_discount' then v_entry.charged_amount
      else v_entry.net_amount
    end,
    2
  );

  v_amount := round(
    case v_rule.commission_type
      when 'percentage' then coalesce(v_base, 0) * coalesce(v_rule.percentage, 0) / 100.0
      when 'fixed_per_patient' then coalesce(v_rule.fixed_amount, 0)
      else 0
    end,
    2
  );

  if v_amount < 0 or v_amount > v_entry.net_amount then
    raise exception 'A comissão calculada é inválida para o valor líquido deste atendimento.';
  end if;

  update public.professional_commissions
  set professional_id = v_entry.professional_id,
      commission_type = v_rule.commission_type,
      calculation_base = v_rule.calculation_base,
      base_amount = v_base,
      percentage = case when v_rule.commission_type = 'percentage' then v_rule.percentage else null end,
      fixed_amount = case when v_rule.commission_type = 'fixed_per_patient' then v_rule.fixed_amount else null end,
      commission_amount = v_amount,
      clinic_amount = round(v_entry.net_amount - v_amount, 2),
      status = 'pending',
      paid_amount = 0,
      paid_at = null,
      paid_by = null,
      is_manual_override = false,
      override_reason = null,
      updated_at = now()
  where id = v_commission.id
  returning * into v_commission;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, new_data, metadata)
  values (
    'professional_commissions',
    v_commission.id,
    'generate_historical',
    auth.uid(),
    null,
    to_jsonb(v_commission),
    jsonb_build_object(
      'financial_entry_id', v_entry.id,
      'appointment_id', v_entry.appointment_id,
      'appointment_date', v_entry_date,
      'rule_id', v_rule.id,
      'rule_effective_from', v_rule.effective_from,
      'applied_retroactively', true
    )
  );

  return v_commission;
end;
$function$;

grant execute on function public.generate_historical_commission(uuid) to authenticated;
