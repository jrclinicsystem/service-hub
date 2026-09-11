-- Controle operacional por serviço dentro de combos/pacotes.
-- O financeiro continua sendo uma única entrada por atendimento; os itens abaixo
-- apenas controlam execução e impedem finalização financeira prematura.

alter table public.appointment_services
  add column if not exists status text not null default 'pending',
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid;

alter table public.appointment_services
  drop constraint if exists appointment_services_status_check;
alter table public.appointment_services
  add constraint appointment_services_status_check
  check (status in ('pending','completed'));

create index if not exists appointment_services_status_idx
  on public.appointment_services(appointment_id, status, position);

-- Atendimentos que já foram finalizados antes deste controle entram como concluídos,
-- para não bloquear histórico nem futuras correções financeiras.
update public.appointment_services aps
set status = 'completed',
    completed_at = coalesce(
      (select a.attended_at from public.appointments a where a.id = aps.appointment_id),
      (select max(coalesce(fe.received_at, fe.occurred_at, fe.created_at))
         from public.financial_entries fe
        where fe.appointment_id = aps.appointment_id
          and fe.status not in ('cancelled','refunded')),
      now()
    )
where exists (
  select 1
  from public.appointments a
  where a.id = aps.appointment_id
    and a.status = 'atendido'
)
or exists (
  select 1
  from public.financial_entries fe
  where fe.appointment_id = aps.appointment_id
    and fe.status not in ('cancelled','refunded')
);

create or replace function public.set_appointment_service_completion(
  _appointment_id uuid,
  _service_id uuid,
  _completed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _appointment public.appointments%rowtype;
  _row public.appointment_services%rowtype;
  _total integer := 0;
  _completed_count integer := 0;
  _allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  _allowed := private.has_role('admin'::public.app_role)
    or exists (
      select 1
      from public.admin_emails ae
      where ae.enabled = true
        and lower(ae.email) = lower(coalesce(auth.jwt()->>'email', ''))
    )
    or public.finance_has_role(array['admin','finance','reception']);

  if not _allowed then
    raise exception 'Você não tem permissão para atualizar este combo.' using errcode = '42501';
  end if;

  select * into _appointment
  from public.appointments a
  where a.id = _appointment_id
  for update;

  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = '23503';
  end if;

  if _appointment.status <> 'confirmado' then
    raise exception 'Os serviços só podem ser concluídos enquanto o atendimento estiver confirmado.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.financial_entries fe
    where fe.appointment_id = _appointment_id
      and fe.status not in ('cancelled','refunded')
  ) then
    raise exception 'Este atendimento já foi enviado ao financeiro e não pode ter o checklist alterado.' using errcode = '23514';
  end if;

  select * into _row
  from public.appointment_services aps
  where aps.appointment_id = _appointment_id
    and aps.service_id = _service_id
  for update;

  if not found then
    raise exception 'Serviço não encontrado neste combo.' using errcode = '23503';
  end if;

  update public.appointment_services aps
  set status = case when _completed then 'completed' else 'pending' end,
      completed_at = case when _completed then coalesce(aps.completed_at, now()) else null end,
      completed_by = case when _completed then coalesce(aps.completed_by, auth.uid()) else null end
  where aps.appointment_id = _appointment_id
    and aps.service_id = _service_id
  returning * into _row;

  select count(*), count(*) filter (where aps.status = 'completed')
    into _total, _completed_count
  from public.appointment_services aps
  where aps.appointment_id = _appointment_id;

  return jsonb_build_object(
    'appointment_id', _appointment_id,
    'service_id', _service_id,
    'status', _row.status,
    'completed_at', _row.completed_at,
    'completed_by', _row.completed_by,
    'completed_count', _completed_count,
    'total_count', _total,
    'all_completed', (_total > 0 and _completed_count = _total)
  );
end;
$function$;

revoke all on function public.set_appointment_service_completion(uuid,uuid,boolean) from public;
grant execute on function public.set_appointment_service_completion(uuid,uuid,boolean) to authenticated;

-- Segurança de banco: combos com 2+ serviços não podem virar "atendido"
-- nem gerar lançamento financeiro enquanto existir item pendente.
create or replace function public.guard_multi_service_combo_completion()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $function$
declare
  _service_count integer := 0;
  _pending_count integer := 0;
begin
  if new.status = 'atendido' and old.status is distinct from 'atendido' then
    select count(*), count(*) filter (where aps.status <> 'completed')
      into _service_count, _pending_count
    from public.appointment_services aps
    where aps.appointment_id = new.id;

    if _service_count > 1 and _pending_count > 0 then
      raise exception 'Conclua todos os serviços do combo antes de finalizar o atendimento.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists appointments_guard_multi_service_combo_completion on public.appointments;
create trigger appointments_guard_multi_service_combo_completion
before update of status on public.appointments
for each row execute function public.guard_multi_service_combo_completion();

create or replace function public.guard_financial_entry_combo_completion()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $function$
declare
  _service_count integer := 0;
  _pending_count integer := 0;
begin
  if new.appointment_id is not null
     and coalesce(new.status, 'pending') not in ('cancelled','refunded') then
    select count(*), count(*) filter (where aps.status <> 'completed')
      into _service_count, _pending_count
    from public.appointment_services aps
    where aps.appointment_id = new.appointment_id;

    if _service_count > 1 and _pending_count > 0 then
      raise exception 'Este combo ainda possui serviços pendentes e não pode ser enviado ao financeiro.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists financial_entries_guard_combo_completion on public.financial_entries;
create trigger financial_entries_guard_combo_completion
before insert or update of appointment_id, status on public.financial_entries
for each row execute function public.guard_financial_entry_combo_completion();
