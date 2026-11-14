-- Prevent confirmation/decline against a stale appointment card.
alter table public.appointments add column if not exists schedule_revision bigint not null default 0;
create or replace function private.bump_appointment_schedule_revision()
returns trigger language plpgsql set search_path=''
as $$
begin
  if (new.scheduled_date,new.scheduled_time,new.professional_id)
     is distinct from (old.scheduled_date,old.scheduled_time,old.professional_id) then
    new.schedule_revision=old.schedule_revision+1;
  end if;
  return new;
end;
$$;
revoke all on function private.bump_appointment_schedule_revision()
from public, anon, authenticated;
drop trigger if exists aa_bump_appointment_schedule_revision on public.appointments;
create trigger aa_bump_appointment_schedule_revision
before update of scheduled_date,scheduled_time,professional_id on public.appointments
for each row execute function private.bump_appointment_schedule_revision();

create or replace function public.respond_to_professional_appointment_v2(
  _appointment_id uuid, _response text, _expected_professional_id uuid,
  _expected_date date, _expected_time text, _expected_revision bigint)
returns void language plpgsql security definer set search_path=''
as $$
declare a public.appointments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.' using errcode='42501';
  end if;
  if _response not in ('confirmado','recusado') then
    raise exception 'Resposta inválida.' using errcode='23514';
  end if;
  select * into a from public.appointments where id=_appointment_id for update;
  if not found then raise exception 'Agendamento não encontrado.' using errcode='23503'; end if;
  if a.professional_id is null or not private.staff_can_manage_professional(a.professional_id) then
    raise exception 'Você não tem acesso a este agendamento.' using errcode='42501';
  end if;
  if a.status <> 'pendente' then
    raise exception 'Este agendamento não está mais aguardando sua confirmação.' using errcode='23514';
  end if;
  if (a.professional_id,a.scheduled_date,a.scheduled_time,a.schedule_revision)
     is distinct from (_expected_professional_id,_expected_date,_expected_time,_expected_revision) then
    raise exception 'O horário foi alterado. Atualize a agenda antes de responder.' using errcode='40001';
  end if;
  insert into public.appointment_professional_responses
    (appointment_id,professional_id,response,responded_at,updated_at)
  values (_appointment_id,a.professional_id,_response,now(),now())
  on conflict (appointment_id) do update
    set response=excluded.response, professional_id=excluded.professional_id,
        responded_at=excluded.responded_at, updated_at=excluded.updated_at;
  if _response='recusado' then
    update public.appointments set status='cancelado'
      where id=_appointment_id and professional_id=a.professional_id
        and status='pendente' and schedule_revision=_expected_revision;
  end if;
end;
$$;
revoke all on function public.respond_to_professional_appointment_v2(uuid,text,uuid,date,text,bigint)
 from public,anon;
grant execute on function public.respond_to_professional_appointment_v2(uuid,text,uuid,date,text,bigint)
 to authenticated;

-- Legacy fallback remains only for never-rescheduled slots until UI rollout.
CREATE OR REPLACE FUNCTION public.respond_to_professional_appointment(_appointment_id uuid, _response text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_professional_id uuid;
  v_current_status text;
  v_schedule_revision bigint;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if _response not in ('confirmado','recusado') then
    raise exception 'Resposta inválida.' using errcode = '23514';
  end if;

  select a.professional_id, a.status, a.schedule_revision
    into v_professional_id, v_current_status, v_schedule_revision
  from public.appointments a
  where a.id = _appointment_id for update;

  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = '23503';
  end if;

  if v_professional_id is null or not private.staff_can_manage_professional(v_professional_id) then
    raise exception 'Você não tem acesso a este agendamento.' using errcode = '42501';
  end if;

  if v_current_status <> 'pendente' then
    raise exception 'Este agendamento não está mais aguardando sua confirmação.' using errcode = '23514';
  end if;

  -- Legacy clients cannot confirm a rescheduled slot without version proof.
  if v_schedule_revision > 0 then
    raise exception 'Horário atualizado. Atualize o aplicativo antes de responder.' using errcode = '40001';
  end if;

  insert into public.appointment_professional_responses (appointment_id, professional_id, response, responded_at, updated_at)
  values (_appointment_id, v_professional_id, _response, now(), now())
  on conflict (appointment_id) do update
    set response = excluded.response,
        professional_id = excluded.professional_id,
        responded_at = excluded.responded_at,
        updated_at = excluded.updated_at;

  if _response = 'recusado' then
    update public.appointments
       set status = 'cancelado'
     where id = _appointment_id
       and professional_id = v_professional_id
       and status = 'pendente';
  end if;
end;
$function$;
