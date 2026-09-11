-- Pacotes/sessões: o pagamento do pacote pode acontecer no dia da venda,
-- enquanto cada sessão continua sendo agendada e concluída separadamente.

create table if not exists public.appointment_sessions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  session_number integer not null check (session_number >= 1),
  scheduled_date date,
  scheduled_time text,
  status text not null default 'pending' check (status in ('pending','completed')),
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, session_number)
);

create index if not exists appointment_sessions_appointment_idx
  on public.appointment_sessions(appointment_id, session_number);
create index if not exists appointment_sessions_schedule_idx
  on public.appointment_sessions(scheduled_date, scheduled_time, status);

alter table public.appointment_sessions enable row level security;

drop policy if exists "Finance roles read appointment sessions" on public.appointment_sessions;
create policy "Finance roles read appointment sessions"
on public.appointment_sessions for select to authenticated
using (
  public.finance_has_role(array['admin','finance','reception'])
  or private.has_role('admin'::public.app_role)
  or exists (
    select 1 from public.admin_emails ae
    where ae.enabled = true
      and lower(ae.email) = lower(coalesce(auth.jwt()->>'email',''))
  )
);

drop policy if exists "Finance roles manage appointment sessions" on public.appointment_sessions;
create policy "Finance roles manage appointment sessions"
on public.appointment_sessions for all to authenticated
using (
  public.finance_has_role(array['admin','finance','reception'])
  or private.has_role('admin'::public.app_role)
  or exists (
    select 1 from public.admin_emails ae
    where ae.enabled = true
      and lower(ae.email) = lower(coalesce(auth.jwt()->>'email',''))
  )
)
with check (
  public.finance_has_role(array['admin','finance','reception'])
  or private.has_role('admin'::public.app_role)
  or exists (
    select 1 from public.admin_emails ae
    where ae.enabled = true
      and lower(ae.email) = lower(coalesce(auth.jwt()->>'email',''))
  )
);

grant select, insert, update, delete on public.appointment_sessions to authenticated;

-- Transição dos combos antigos de vários serviços para sessões numeradas.
with ranked as (
  select
    aps.appointment_id,
    row_number() over (partition by aps.appointment_id order by aps.position, aps.service_id)::integer as session_number,
    aps.status,
    aps.completed_at,
    aps.completed_by,
    count(*) over (partition by aps.appointment_id) as total
  from public.appointment_services aps
)
insert into public.appointment_sessions(
  appointment_id, session_number, scheduled_date, scheduled_time,
  status, completed_at, completed_by
)
select
  r.appointment_id,
  r.session_number,
  case when r.session_number = 1 then a.scheduled_date else null end,
  case when r.session_number = 1 then a.scheduled_time else null end,
  r.status,
  r.completed_at,
  r.completed_by
from ranked r
join public.appointments a on a.id = r.appointment_id
where r.total > 1
on conflict (appointment_id, session_number) do nothing;

create or replace function public.configure_appointment_sessions(
  _appointment_id uuid,
  _session_count integer,
  _first_date date default null,
  _first_time text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _appointment public.appointments%rowtype;
  _completed_after_limit integer;
  _i integer;
begin
  if not (
    public.finance_has_role(array['admin','finance','reception'])
    or private.has_role('admin'::public.app_role)
    or exists (
      select 1 from public.admin_emails ae
      where ae.enabled = true
        and lower(ae.email) = lower(coalesce(auth.jwt()->>'email',''))
    )
  ) then raise exception 'Acesso insuficiente para configurar sessões.' using errcode = '42501'; end if;

  if _session_count is null or _session_count < 1 or _session_count > 50 then
    raise exception 'Informe entre 1 e 50 sessões.' using errcode = '23514';
  end if;

  select * into _appointment from public.appointments where id = _appointment_id for update;
  if not found then raise exception 'Agendamento não encontrado.' using errcode = '23503'; end if;

  select count(*) into _completed_after_limit
  from public.appointment_sessions
  where appointment_id = _appointment_id
    and session_number > _session_count
    and status = 'completed';
  if _completed_after_limit > 0 then
    raise exception 'Não é possível reduzir o pacote abaixo de uma sessão já concluída.' using errcode = '23514';
  end if;

  delete from public.appointment_sessions
  where appointment_id = _appointment_id
    and session_number > _session_count
    and status = 'pending';

  for _i in 1.._session_count loop
    insert into public.appointment_sessions(
      appointment_id, session_number, scheduled_date, scheduled_time
    ) values (
      _appointment_id,
      _i,
      case when _i = 1 then coalesce(_first_date, _appointment.scheduled_date) else null end,
      case when _i = 1 then coalesce(_first_time, _appointment.scheduled_time) else null end
    )
    on conflict (appointment_id, session_number) do update
      set scheduled_date = case
            when excluded.session_number = 1 and public.appointment_sessions.status = 'pending'
              then coalesce(excluded.scheduled_date, public.appointment_sessions.scheduled_date)
            else public.appointment_sessions.scheduled_date
          end,
          scheduled_time = case
            when excluded.session_number = 1 and public.appointment_sessions.status = 'pending'
              then coalesce(excluded.scheduled_time, public.appointment_sessions.scheduled_time)
            else public.appointment_sessions.scheduled_time
          end,
          updated_at = now();
  end loop;

  return jsonb_build_object('appointment_id', _appointment_id, 'session_count', _session_count);
end;
$function$;

revoke all on function public.configure_appointment_sessions(uuid,integer,date,text) from public;
grant execute on function public.configure_appointment_sessions(uuid,integer,date,text) to authenticated;

create or replace function public.update_appointment_session_schedule(
  _session_id uuid,
  _scheduled_date date,
  _scheduled_time text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _session public.appointment_sessions%rowtype;
  _appointment public.appointments%rowtype;
  _next_session_number integer;
begin
  if not (
    public.finance_has_role(array['admin','finance','reception'])
    or private.has_role('admin'::public.app_role)
    or exists (
      select 1 from public.admin_emails ae
      where ae.enabled = true
        and lower(ae.email) = lower(coalesce(auth.jwt()->>'email',''))
    )
  ) then raise exception 'Acesso insuficiente para reagendar sessão.' using errcode = '42501'; end if;

  select * into _session from public.appointment_sessions where id = _session_id for update;
  if not found then raise exception 'Sessão não encontrada.' using errcode = '23503'; end if;
  if _session.status = 'completed' then
    raise exception 'Sessão concluída mantém a data histórica. Edite apenas sessões pendentes.' using errcode = '23514';
  end if;

  select * into _appointment from public.appointments where id = _session.appointment_id for update;
  if not found then raise exception 'Agendamento não encontrado.' using errcode = '23503'; end if;
  if _appointment.status = 'cancelado' then raise exception 'Agendamento cancelado.' using errcode = '23514'; end if;

  if (_scheduled_date is null) <> (nullif(trim(coalesce(_scheduled_time,'')),'') is null) then
    raise exception 'Informe data e horário juntos.' using errcode = '23514';
  end if;

  if _scheduled_date is not null then
    if exists (
      select 1 from public.appointments a
      where a.id <> _appointment.id
        and a.professional_id = _appointment.professional_id
        and a.scheduled_date = _scheduled_date
        and a.scheduled_time = trim(_scheduled_time)
        and a.status <> 'cancelado'
    ) or exists (
      select 1
      from public.appointment_sessions ps
      join public.appointments a on a.id = ps.appointment_id
      where ps.id <> _session_id
        and a.id <> _appointment.id
        and a.professional_id = _appointment.professional_id
        and ps.scheduled_date = _scheduled_date
        and ps.scheduled_time = trim(_scheduled_time)
        and ps.status = 'pending'
        and a.status <> 'cancelado'
    ) then
      raise exception 'Este profissional já possui atendimento/sessão neste horário.' using errcode = '23505';
    end if;
  end if;

  update public.appointment_sessions
  set scheduled_date = _scheduled_date,
      scheduled_time = nullif(trim(coalesce(_scheduled_time,'')),''),
      updated_at = now()
  where id = _session_id
  returning * into _session;

  select min(session_number) into _next_session_number
  from public.appointment_sessions
  where appointment_id = _session.appointment_id and status = 'pending';

  if _next_session_number = _session.session_number and _scheduled_date is not null then
    update public.appointments
    set scheduled_date = _scheduled_date,
        scheduled_time = trim(_scheduled_time),
        status_updated_at = now()
    where id = _session.appointment_id;
  end if;

  return to_jsonb(_session);
end;
$function$;

revoke all on function public.update_appointment_session_schedule(uuid,date,text) from public;
grant execute on function public.update_appointment_session_schedule(uuid,date,text) to authenticated;

create or replace function public.set_appointment_session_completion(
  _session_id uuid,
  _completed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _session public.appointment_sessions%rowtype;
  _appointment public.appointments%rowtype;
  _total integer;
  _completed_count integer;
  _next public.appointment_sessions%rowtype;
  _has_financial boolean;
begin
  if not (
    public.finance_has_role(array['admin','finance','reception'])
    or private.has_role('admin'::public.app_role)
    or exists (
      select 1 from public.admin_emails ae
      where ae.enabled = true
        and lower(ae.email) = lower(coalesce(auth.jwt()->>'email',''))
    )
  ) then raise exception 'Acesso insuficiente para concluir sessão.' using errcode = '42501'; end if;

  select * into _session from public.appointment_sessions where id = _session_id for update;
  if not found then raise exception 'Sessão não encontrada.' using errcode = '23503'; end if;
  select * into _appointment from public.appointments where id = _session.appointment_id for update;
  if not found then raise exception 'Agendamento não encontrado.' using errcode = '23503'; end if;
  if _appointment.status not in ('confirmado','atendido') then
    raise exception 'As sessões só podem ser gerenciadas em um pacote confirmado.' using errcode = '23514';
  end if;
  if _completed and _session.scheduled_date is null then
    raise exception 'Defina a data desta sessão antes de concluí-la.' using errcode = '23514';
  end if;

  update public.appointment_sessions
  set status = case when _completed then 'completed' else 'pending' end,
      completed_at = case when _completed then coalesce(completed_at, now()) else null end,
      completed_by = case when _completed then coalesce(completed_by, auth.uid()) else null end,
      updated_at = now()
  where id = _session_id
  returning * into _session;

  select count(*), count(*) filter (where status = 'completed')
  into _total, _completed_count
  from public.appointment_sessions
  where appointment_id = _session.appointment_id;

  select exists(
    select 1 from public.financial_entries fe
    where fe.appointment_id = _session.appointment_id
      and fe.status not in ('cancelled','refunded')
  ) into _has_financial;

  if _total > 1 and _completed_count = _total and _has_financial then
    update public.appointments
    set status = 'atendido', attended_at = coalesce(attended_at, now()), status_updated_at = now()
    where id = _session.appointment_id;
  elsif _total > 1 and _completed_count < _total and _appointment.status = 'atendido' then
    update public.appointments
    set status = 'confirmado', attended_at = null, status_updated_at = now()
    where id = _session.appointment_id;
  end if;

  select * into _next
  from public.appointment_sessions
  where appointment_id = _session.appointment_id and status = 'pending'
  order by session_number
  limit 1;

  if found and _next.scheduled_date is not null then
    update public.appointments
    set scheduled_date = _next.scheduled_date,
        scheduled_time = coalesce(_next.scheduled_time, scheduled_time),
        status_updated_at = now()
    where id = _session.appointment_id;
  end if;

  return jsonb_build_object(
    'session', to_jsonb(_session),
    'completed_count', _completed_count,
    'total_count', _total,
    'all_completed', (_total > 0 and _completed_count = _total),
    'financial_registered', _has_financial
  );
end;
$function$;

revoke all on function public.set_appointment_session_completion(uuid,boolean) from public;
grant execute on function public.set_appointment_session_completion(uuid,boolean) to authenticated;

-- A antiga trava por serviço não representa mais o fluxo real do pacote.
drop trigger if exists financial_entries_guard_combo_completion on public.financial_entries;
drop trigger if exists appointments_guard_multi_service_combo_completion on public.appointments;

-- Nova proteção: um pacote de 2+ sessões não pode virar atendido enquanto houver sessão pendente.
create or replace function public.guard_package_sessions_completion()
returns trigger
language plpgsql
set search_path = 'public','pg_temp'
as $function$
declare
  _total integer;
  _pending integer;
begin
  if new.status = 'atendido' and old.status is distinct from 'atendido' then
    select count(*), count(*) filter (where status <> 'completed')
      into _total, _pending
    from public.appointment_sessions
    where appointment_id = new.id;
    if _total > 1 and _pending > 0 then
      raise exception 'Conclua todas as sessões do pacote antes de encerrar o atendimento.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists appointments_guard_package_sessions_completion on public.appointments;
create trigger appointments_guard_package_sessions_completion
before update of status on public.appointments
for each row execute function public.guard_package_sessions_completion();

-- Permite registrar o financeiro de um pacote confirmado antes da última sessão.
do $migration$
declare
  _def text;
begin
  select pg_get_functiondef(p.oid) into _def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='register_attended_financial_entry'
  limit 1;

  if _def is not null and position('if a.status<>''atendido'' then raise exception ''O atendimento precisa estar marcado como atendido antes do lançamento financeiro.''; end if;' in _def) > 0 then
    _def := replace(
      _def,
      'if a.status<>''atendido'' then raise exception ''O atendimento precisa estar marcado como atendido antes do lançamento financeiro.''; end if;',
      'if a.status<>''atendido'' and not (a.status=''confirmado'' and (select count(*) from public.appointment_sessions ps where ps.appointment_id=a.id)>1) then raise exception ''O atendimento precisa estar atendido ou ser um pacote confirmado.''; end if;'
    );
    execute _def;
  end if;
end;
$migration$;

-- No pagamento comum, pacote com sessão pendente permanece confirmado;
-- o financeiro nasce no dia do pagamento e o atendimento só encerra na última sessão.
do $migration$
declare
  _def text;
  _old text := 'status=''atendido'',attended_at=happened_at,status_updated_at=happened_at';
  _new text := 'status=case when (select count(*) from public.appointment_sessions ps where ps.appointment_id=_appointment_id)>1 and exists(select 1 from public.appointment_sessions ps where ps.appointment_id=_appointment_id and ps.status=''pending'') then ''confirmado'' else ''atendido'' end,attended_at=case when (select count(*) from public.appointment_sessions ps where ps.appointment_id=_appointment_id)>1 and exists(select 1 from public.appointment_sessions ps where ps.appointment_id=_appointment_id and ps.status=''pending'') then attended_at else happened_at end,status_updated_at=happened_at';
begin
  select pg_get_functiondef(p.oid) into _def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='complete_appointment_financially'
  limit 1;
  if _def is not null and position(_old in _def)>0 then
    execute replace(_def,_old,_new);
  end if;
end;
$migration$;

-- Mesma regra para pagamento misto.
do $migration$
declare
  _def text;
  _old text := 'status=''atendido'',attended_at=v_now,status_updated_at=v_now';
  _new text := 'status=case when (select count(*) from public.appointment_sessions ps where ps.appointment_id=_appointment_id)>1 and exists(select 1 from public.appointment_sessions ps where ps.appointment_id=_appointment_id and ps.status=''pending'') then ''confirmado'' else ''atendido'' end,attended_at=case when (select count(*) from public.appointment_sessions ps where ps.appointment_id=_appointment_id)>1 and exists(select 1 from public.appointment_sessions ps where ps.appointment_id=_appointment_id and ps.status=''pending'') then attended_at else v_now end,status_updated_at=v_now';
begin
  select pg_get_functiondef(p.oid) into _def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='complete_appointment_financially_mixed'
  limit 1;
  if _def is not null and position(_old in _def)>0 then
    execute replace(_def,_old,_new);
  end if;
end;
$migration$;
