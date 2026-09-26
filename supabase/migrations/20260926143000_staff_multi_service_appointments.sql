-- Allow professionals to combine their OWN linked procedures in one visit.
-- Never grants staff admin privileges, edits or global appointment access.
drop policy if exists "Staff read linked services for own appointments" on public.appointment_services;
create policy "Staff read linked services for own appointments"
on public.appointment_services
for select to authenticated
using (
  exists (
    select 1
    from public.appointments a
    where a.id = appointment_services.appointment_id
      and a.status <> 'aguardando_pagamento'
      and private.staff_can_manage_professional(a.professional_id)
  )
);

create or replace function public.create_staff_multi_service_appointment(
  _client_id uuid,
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
as $function$
declare
  _appointment_id uuid;
  _service_count integer;
  _valid_services integer;
  _linked_services integer;
  _client public.clients%rowtype;
  _price numeric;
begin
  -- Authenticate and authorize the actual logged-in professional. Never trust
  -- professional_id solely because the client supplied it.
  if auth.uid() is null
    or coalesce(auth.jwt()->>'role','') <> 'authenticated'
    or not coalesce(private.staff_can_manage_professional(_professional_id),false)
  then
    raise exception 'Você só pode agendar na sua própria agenda.' using errcode='42501';
  end if;

  _service_count := coalesce(cardinality(_service_ids),0);
  if _service_count < 1 or _service_count > 10 then
    raise exception 'Selecione entre 1 e 10 serviços.' using errcode='23514';
  end if;
  if exists (select 1 from unnest(_service_ids) id where id is null)
    or (select count(distinct id) from unnest(_service_ids) id) <> _service_count
  then
    raise exception 'Selecione serviços diferentes, sem duplicatas.' using errcode='23514';
  end if;

  select * into _client from public.clients
  where id=_client_id and is_active=true and deleted_at is null;
  if not found then
    raise exception 'Selecione um cliente cadastrado e ativo.' using errcode='23514';
  end if;

  select count(*) into _valid_services from public.services s
  where s.id=any(_service_ids) and s.is_active=true;
  select count(*) into _linked_services from public.service_professionals sp
  where sp.professional_id=_professional_id and sp.service_id=any(_service_ids);
  if _valid_services <> _service_count or _linked_services <> _service_count then
    raise exception 'Selecione somente serviços ativos vinculados à sua agenda.' using errcode='23514';
  end if;

  _price := round(_total,2);
  if _total is null or _total::text='NaN' or _price < 0 then
    raise exception 'Informe um valor de atendimento válido.' using errcode='23514';
  end if;

  -- Existing appointment triggers enforce active professional, schedule,
  -- room/professional overlaps and staff-only pending/on-site payment.
  insert into public.appointments(
    user_id,client_id,service_id,professional_id,
    patient_name,patient_email,patient_phone,notes,
    scheduled_date,scheduled_time,status,payment_choice,
    service_price_snapshot,deposit_percent,deposit_amount,balance_amount
  )
  values (
    null,_client.id,_service_ids[1],_professional_id,
    _client.name,coalesce(_client.email,''),_client.whatsapp,trim(coalesce(_notes,'')),
    _scheduled_date,_scheduled_time,'pendente','onsite',
    _price,0,0,_price
  )
  returning id into _appointment_id;

  -- One visit; service rows belong to the SAME appointment and keep the
  -- original selected order. Transaction rolls back if any write fails.
  insert into public.appointment_services(
    appointment_id,service_id,position,price_snapshot,session_count
  )
  select _appointment_id, selected.service_id,(selected.ord-1)::integer,
         coalesce(s.price,0),coalesce(s.session_count,1)
  from unnest(_service_ids) with ordinality as selected(service_id,ord)
  join public.services s on s.id=selected.service_id
  on conflict(appointment_id,service_id) do update set
    position=excluded.position,
    price_snapshot=excluded.price_snapshot,
    session_count=excluded.session_count;

  return _appointment_id;
end;
$function$;

revoke all on function public.create_staff_multi_service_appointment(uuid,uuid[],uuid,date,text,text,numeric) from public,anon;
grant execute on function public.create_staff_multi_service_appointment(uuid,uuid[],uuid,date,text,text,numeric) to authenticated;