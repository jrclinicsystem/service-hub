create or replace function public.appointment_has_package_sessions(_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists(
      select 1
      from public.appointment_services aps
      where aps.appointment_id = _appointment_id
        and coalesce(aps.session_count, 1) > 1
    )
    or (
      not exists(select 1 from public.appointment_services aps where aps.appointment_id = _appointment_id)
      and (select count(*) from public.appointment_sessions ps where ps.appointment_id = _appointment_id) > 1
    ),
    false
  );
$$;

create or replace function public.guard_package_sessions_completion()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare _pending integer;
begin
  if new.status = 'atendido'
     and old.status is distinct from 'atendido'
     and public.appointment_has_package_sessions(new.id) then
    select count(*) filter (where status <> 'completed') into _pending
    from public.appointment_sessions
    where appointment_id = new.id;
    if coalesce(_pending, 0) > 0 then
      raise exception 'Conclua todas as sessões do pacote antes de encerrar o atendimento.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.mark_appointment_attended(_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.appointments%rowtype;
  service_price numeric := 0;
  amount numeric := 0;
  is_package boolean := false;
  has_pending_sessions boolean := false;
begin
  if not (
    public.finance_has_role(array['admin','finance','reception'])
    or private.has_role('admin'::public.app_role)
    or exists (
      select 1 from public.admin_emails ae
      where ae.enabled = true
        and lower(ae.email) = lower(coalesce(auth.jwt()->>'email',''))
    )
  ) then
    raise exception 'Acesso insuficiente para concluir atendimento.' using errcode = '42501';
  end if;

  select * into a from public.appointments where id = _appointment_id for update;
  if not found then raise exception 'Atendimento não encontrado.' using errcode = '23503'; end if;
  if a.status <> 'confirmado' then raise exception 'Somente atendimentos confirmados podem ser concluídos.' using errcode = '23514'; end if;

  select coalesce(s.price, 0) into service_price from public.services s where s.id = a.service_id;
  amount := coalesce(a.custom_price, a.service_price_snapshot, service_price, 0);
  is_package := public.appointment_has_package_sessions(a.id);

  if is_package then
    select exists(
      select 1 from public.appointment_sessions ps
      where ps.appointment_id = a.id and ps.status = 'pending'
    ) into has_pending_sessions;
  end if;

  if has_pending_sessions then
    raise exception 'Conclua todas as sessões pendentes antes de finalizar este pacote.' using errcode = '23514';
  end if;
  if round(amount, 2) > 0 then
    raise exception 'Finalize este atendimento em Financeiro > Finalizar atendimento para informar pagamento, desconto, fiado e comissão.' using errcode = '23514';
  end if;

  update public.appointments
     set custom_price = 0,
         payment_received = true,
         payment_method_code = null,
         installments = greatest(coalesce(installments, 1), 1),
         discount_type = null,
         discount_value = 0,
         receivable_due_date = null,
         manual_commission_amount = null,
         manual_commission_reason = null,
         status = 'atendido',
         attended_at = coalesce(attended_at, now()),
         status_updated_at = now()
   where id = a.id;
end;
$$;

create or replace function public.complete_appointment_financially(
  _appointment_id uuid,
  _original_amount numeric default null,
  _payment_received boolean default true,
  _payment_method_code text default null,
  _installments integer default 1,
  _discount_type text default null,
  _discount_value numeric default 0,
  _receivable_due_date date default null,
  _manual_commission_amount numeric default null,
  _manual_commission_reason text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.appointments%rowtype;
  service_name text;
  service_price numeric;
  professional_name text;
  amount numeric;
  entry public.financial_entries%rowtype;
  happened_at timestamptz := now();
  _is_package boolean := false;
  _has_pending_sessions boolean := false;
  _effective_received boolean;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso insuficiente para finalizar atendimento.';
  end if;

  select * into a from public.appointments where id = _appointment_id for update;
  if not found then raise exception 'Atendimento não encontrado.'; end if;

  _is_package := public.appointment_has_package_sessions(_appointment_id);
  if _is_package then
    select exists(
      select 1 from public.appointment_sessions ps
      where ps.appointment_id = _appointment_id and ps.status = 'pending'
    ) into _has_pending_sessions;
  end if;

  if a.status not in ('confirmado','atendido') then raise exception 'Somente atendimentos confirmados podem ser finalizados.'; end if;
  if a.status = 'atendido' and not _is_package then raise exception 'Este atendimento já está finalizado.'; end if;
  if _is_package and _has_pending_sessions then raise exception 'Conclua todas as sessões do pacote antes de registrar o financeiro.'; end if;
  if a.professional_id is null then raise exception 'Defina o profissional antes de finalizar.'; end if;

  select s.name, s.price into service_name, service_price from public.services s where s.id = a.service_id;
  if not found then raise exception 'Serviço do atendimento não foi encontrado.'; end if;
  select p.name into professional_name from public.professionals p where p.id = a.professional_id and p.deleted_at is null;
  if professional_name is null then raise exception 'Profissional do atendimento não foi encontrado ou está inativo.'; end if;

  amount := coalesce(_original_amount, a.custom_price, a.service_price_snapshot, service_price, 0);
  if amount < 0 then raise exception 'Valor do procedimento inválido.'; end if;
  if coalesce(_installments,1) < 1 then raise exception 'Quantidade de parcelas inválida.'; end if;

  _effective_received := case when round(amount,2) = 0 then true else coalesce(_payment_received,true) end;
  if _effective_received and amount > 0 and nullif(trim(_payment_method_code),'') is null then raise exception 'Informe a forma de pagamento.'; end if;
  if not _effective_received and amount > 0 and _receivable_due_date is null then raise exception 'Informe o vencimento do valor a receber.'; end if;
  if round(amount,2) = 0 and coalesce(_manual_commission_amount,0) <> 0 then raise exception 'Atendimento de R$ 0,00 não pode gerar comissão manual.'; end if;
  if _manual_commission_amount is not null and nullif(trim(_manual_commission_reason),'') is null then raise exception 'Informe o motivo do ajuste manual da comissão.'; end if;

  update public.appointments
     set custom_price = round(amount,2),
         professional_name_snapshot = professional_name,
         payment_received = _effective_received,
         payment_method_code = case when _effective_received and amount > 0 then _payment_method_code else null end,
         installments = coalesce(_installments,1),
         discount_type = case when amount = 0 then null else nullif(trim(_discount_type),'') end,
         discount_value = case when amount = 0 then 0 else coalesce(_discount_value,0) end,
         receivable_due_date = case when _effective_received or amount = 0 then null else _receivable_due_date end,
         manual_commission_amount = case when amount = 0 then null else _manual_commission_amount end,
         manual_commission_reason = case when amount = 0 or _manual_commission_amount is null then null else nullif(trim(_manual_commission_reason),'') end,
         status = 'atendido',
         attended_at = coalesce(attended_at,happened_at),
         status_updated_at = happened_at
   where id = _appointment_id
   returning * into a;

  if round(amount,2) = 0 then return a; end if;

  select * into entry
  from public.register_attended_financial_entry(
    a.id,a.client_id,a.professional_id,a.service_id,a.patient_name,
    professional_name,service_name,amount,
    case when _effective_received and amount > 0 then _payment_method_code else null end,
    coalesce(_installments,1),nullif(trim(_discount_type),''),coalesce(_discount_value,0),
    a.cost_center_code,_manual_commission_amount,_manual_commission_reason,happened_at,_effective_received
  );

  if _effective_received and entry.status = 'pending' and entry.received_at is not null then
    update public.financial_entries set status = 'received', occurred_at = happened_at, updated_at = now()
    where id = entry.id returning * into entry;
  end if;

  if not _effective_received and entry.charged_amount > 0 then
    insert into public.accounts_receivable(
      appointment_id,client_id,service_id,client_name_snapshot,service_name_snapshot,
      original_amount,amount_received,due_date,status,payment_method_id,installments,created_by,notes
    ) values (
      a.id,a.client_id,a.service_id,a.patient_name,service_name,
      entry.charged_amount,0,_receivable_due_date,'pending',null,
      coalesce(_installments,1),auth.uid(),
      'Gerado automaticamente ao concluir atendimento sem recebimento.'
    )
    on conflict(appointment_id) where appointment_id is not null and status <> 'cancelled' do nothing;
  end if;

  return a;
end;
$$;

delete from public.appointment_sessions ps
where ps.status = 'pending'
  and exists(select 1 from public.appointment_services aps where aps.appointment_id = ps.appointment_id)
  and not public.appointment_has_package_sessions(ps.appointment_id);
