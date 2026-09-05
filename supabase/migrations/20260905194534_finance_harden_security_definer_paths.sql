create or replace function public.finance_has_role(_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.financial_access fa
    where fa.user_id = auth.uid()
      and fa.is_active = true
      and fa.role = any(_roles)
  );
$$;

create or replace function public.mark_commission_paid(_commission_id uuid)
returns public.professional_commissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.professional_commissions%rowtype;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente';
  end if;

  update public.professional_commissions
  set status='paid', paid_at=now(), paid_by=auth.uid(), updated_at=now()
  where id=_commission_id and status='pending'
  returning * into c;

  if not found then raise exception 'Comissão não encontrada ou já processada'; end if;

  insert into public.financial_audit_log(entity_type,entity_id,action,actor_id,new_data)
  values ('professional_commissions',c.id,'pay',auth.uid(),to_jsonb(c));

  return c;
end;
$$;

create or replace function public.close_cash_session(_session_id uuid, _counted_cash numeric, _note text default null)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.cash_sessions%rowtype;
  cash_id uuid;
  pix_id uuid;
  debit_id uuid;
  credit_id uuid;
  link_id uuid;
  total_cash_in numeric := 0;
  total_pix_in numeric := 0;
  total_debit_in numeric := 0;
  total_credit_in numeric := 0;
  total_link_in numeric := 0;
  cash_out numeric := 0;
  _actor_label text;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso financeiro insuficiente';
  end if;

  select * into s from public.cash_sessions where id = _session_id for update;
  if not found then raise exception 'Caixa não encontrado'; end if;
  if s.status <> 'open' then raise exception 'Este caixa já está fechado'; end if;
  if _counted_cash < 0 then raise exception 'Valor contado inválido'; end if;

  select id into cash_id from public.payment_methods where code = 'cash' limit 1;
  select id into pix_id from public.payment_methods where code = 'pix' limit 1;
  select id into debit_id from public.payment_methods where code = 'debit' limit 1;
  select id into credit_id from public.payment_methods where code = 'credit' limit 1;
  select id into link_id from public.payment_methods where code = 'payment_link' limit 1;
  select au.email into _actor_label from auth.users au where au.id = auth.uid();

  select
    coalesce(sum(case when movement_type='income' and payment_method_id=cash_id then amount else 0 end),0),
    coalesce(sum(case when movement_type='income' and payment_method_id=pix_id then amount else 0 end),0),
    coalesce(sum(case when movement_type='income' and payment_method_id=debit_id then amount else 0 end),0),
    coalesce(sum(case when movement_type='income' and payment_method_id=credit_id then amount else 0 end),0),
    coalesce(sum(case when movement_type='income' and payment_method_id=link_id then amount else 0 end),0),
    coalesce(sum(case when movement_type='expense' and payment_method_id=cash_id then amount else 0 end),0)
  into total_cash_in, total_pix_in, total_debit_in, total_credit_in, total_link_in, cash_out
  from public.cash_movements
  where cash_session_id = _session_id;

  update public.cash_sessions
  set total_cash = total_cash_in,
      total_pix = total_pix_in,
      total_debit = total_debit_in,
      total_credit = total_credit_in,
      total_link = total_link_in,
      total_cash_expenses = cash_out,
      expected_cash = round(opening_cash + total_cash_in - cash_out, 2),
      counted_cash = round(_counted_cash,2),
      difference_amount = round(_counted_cash - (opening_cash + total_cash_in - cash_out), 2),
      closed_by = auth.uid(),
      closed_by_label = coalesce(_actor_label, 'Usuário'),
      closed_at = now(),
      closing_note = nullif(trim(_note),''),
      status = 'closed',
      locked_at = now(),
      updated_at = now()
  where id = _session_id
  returning * into s;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, new_data)
  values ('cash_sessions', s.id, 'close', auth.uid(), to_jsonb(s));

  return s;
end;
$$;

create or replace function public.finance_staging_sync_attended_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service_name text;
  v_service_price numeric;
  v_entry public.financial_entries%rowtype;
begin
  if new.status <> 'atendido' or old.status = 'atendido' then return new; end if;
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Somente administração, financeiro ou recepção podem concluir um atendimento.';
  end if;
  if new.professional_id is null then raise exception 'Staging financeiro: professional_id é obrigatório antes de marcar como atendido'; end if;
  if new.payment_received = false and new.receivable_due_date is null then raise exception 'Informe o vencimento da conta a receber antes de concluir um atendimento fiado.'; end if;

  select s.name,s.price into v_service_name,v_service_price
  from public.services s
  where s.id=new.service_id;
  if not found then raise exception 'Staging financeiro: serviço do atendimento não foi encontrado'; end if;
  if coalesce(new.custom_price,v_service_price,0) < 0 then raise exception 'Staging financeiro: valor do atendimento inválido'; end if;

  new.attended_at:=coalesce(new.attended_at,now());
  new.status_updated_at:=now();

  select * into v_entry from public.register_attended_financial_entry(
    new.id,new.user_id,new.professional_id,new.service_id,new.patient_name,
    coalesce(nullif(trim(new.professional_name_snapshot),''),'Profissional de teste'),
    v_service_name,coalesce(new.custom_price,v_service_price,0),new.payment_method_code,
    new.installments,new.discount_type,new.discount_value,new.cost_center_code,
    new.manual_commission_amount,new.manual_commission_reason,coalesce(new.attended_at,now()),new.payment_received
  );

  if new.payment_received=false then
    insert into public.accounts_receivable(
      appointment_id,client_id,service_id,client_name_snapshot,service_name_snapshot,
      original_amount,amount_received,due_date,status,payment_method_id,installments,created_by,notes
    ) values (
      new.id,new.user_id,new.service_id,new.patient_name,v_service_name,v_entry.charged_amount,0,
      new.receivable_due_date,'pending',v_entry.payment_method_id,new.installments,auth.uid(),
      'Gerado automaticamente ao concluir atendimento sem recebimento.'
    ) on conflict (appointment_id) where appointment_id is not null and status <> 'cancelled' do nothing;
  end if;

  return new;
end;
$$;

revoke execute on function public.finance_staging_sync_attended_appointment() from public, anon, authenticated;
revoke execute on function public.register_attended_financial_entry(uuid,uuid,uuid,uuid,text,text,text,numeric,text,integer,text,numeric,text,numeric,text,timestamptz,boolean) from public, anon, authenticated;

revoke execute on function public.finance_has_role(text[]) from public, anon;
grant execute on function public.finance_has_role(text[]) to authenticated;
revoke execute on function public.mark_commission_paid(uuid) from public, anon;
grant execute on function public.mark_commission_paid(uuid) to authenticated;
revoke execute on function public.close_cash_session(uuid,numeric,text) from public, anon;
grant execute on function public.close_cash_session(uuid,numeric,text) to authenticated;
