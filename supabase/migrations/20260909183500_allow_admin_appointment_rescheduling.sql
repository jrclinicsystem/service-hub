create or replace function public.update_admin_multi_service_appointment(
  _appointment_id uuid,
  _client_id uuid,
  _patient_name text,
  _patient_email text,
  _patient_phone text,
  _service_ids uuid[],
  _professional_id uuid,
  _scheduled_date date,
  _scheduled_time text,
  _notes text,
  _total numeric
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _current public.appointments%rowtype;
  _primary_service_id uuid;
  _service_count integer;
  _valid_count integer;
  _link_count integer;
  _conflict_id uuid;
begin
  if not (private.has_role('admin'::public.app_role) or exists (
    select 1 from public.admin_emails ae
    where ae.enabled = true
      and lower(ae.email) = lower(coalesce(auth.jwt()->>'email', ''))
  )) then
    raise exception 'Acesso administrativo insuficiente.';
  end if;

  select * into _current from public.appointments where id = _appointment_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;

  if _current.status = 'atendido' or exists (
    select 1 from public.financial_entries fe where fe.appointment_id = _appointment_id
  ) then
    raise exception 'Este atendimento já foi finalizado no financeiro e não pode ser reagendado por esta tela.';
  end if;

  _service_count := coalesce(cardinality(_service_ids), 0);
  if _service_count < 1 then raise exception 'Selecione ao menos um serviço.'; end if;
  if _service_count > 10 then raise exception 'Limite de 10 serviços por agendamento.'; end if;
  if (select count(distinct x) from unnest(_service_ids) x) <> _service_count then raise exception 'Há serviços duplicados no agendamento.'; end if;
  if _professional_id is null then raise exception 'Selecione o profissional.'; end if;
  if coalesce(trim(_patient_name), '') = '' then raise exception 'Informe o nome do cliente.'; end if;
  if _scheduled_date < current_date then raise exception 'Selecione uma data válida.'; end if;
  if coalesce(trim(_scheduled_time), '') = '' then raise exception 'Selecione o horário.'; end if;
  if _total is null or _total < 0 then raise exception 'Informe um valor válido para o atendimento.'; end if;

  select count(*) into _valid_count from public.services s where s.id = any(_service_ids) and s.is_active = true;
  if _valid_count <> _service_count then raise exception 'Um ou mais serviços são inválidos ou estão inativos.'; end if;

  select count(*) into _link_count from public.service_professionals sp where sp.service_id = any(_service_ids) and sp.professional_id = _professional_id;
  if _link_count <> _service_count then raise exception 'Esse profissional não atende todos os serviços selecionados.'; end if;

  select a.id into _conflict_id
  from public.appointments a
  where a.id <> _appointment_id
    and a.professional_id = _professional_id
    and a.scheduled_date = _scheduled_date
    and a.scheduled_time = trim(_scheduled_time)
    and a.status <> 'cancelado'
  limit 1;
  if _conflict_id is not null then raise exception 'Este profissional já possui um agendamento nesse horário.'; end if;

  _primary_service_id := _service_ids[1];

  update public.appointments
  set client_id = _client_id,
      service_id = _primary_service_id,
      professional_id = _professional_id,
      patient_name = trim(_patient_name),
      patient_email = coalesce(trim(_patient_email), ''),
      patient_phone = coalesce(trim(_patient_phone), ''),
      notes = coalesce(trim(_notes), ''),
      scheduled_date = _scheduled_date,
      scheduled_time = trim(_scheduled_time),
      status = 'pendente',
      status_updated_at = now(),
      service_price_snapshot = round(_total, 2),
      custom_price = round(_total, 2),
      balance_amount = greatest(round(_total, 2) - coalesce(deposit_amount, 0), 0)
  where id = _appointment_id;

  delete from public.appointment_services where appointment_id = _appointment_id;
  insert into public.appointment_services(appointment_id, service_id, position, price_snapshot)
  select _appointment_id, u.service_id, (u.ord - 1)::integer, coalesce(s.price, 0)
  from unnest(_service_ids) with ordinality as u(service_id, ord)
  join public.services s on s.id = u.service_id;

  return _appointment_id;
end;
$$;

revoke all on function public.update_admin_multi_service_appointment(uuid,uuid,text,text,text,uuid[],uuid,date,text,text,numeric) from public;
grant execute on function public.update_admin_multi_service_appointment(uuid,uuid,text,text,text,uuid[],uuid,date,text,text,numeric) to authenticated;
