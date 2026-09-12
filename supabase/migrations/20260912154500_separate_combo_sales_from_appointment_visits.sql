alter table public.client_budgets
  add column if not exists is_paid boolean not null default false,
  add column if not exists paid_amount numeric(12,2) not null default 0,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_method_code text;

create table if not exists public.appointment_budget_sessions (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  budget_item_id uuid not null references public.client_budget_items(id) on delete cascade,
  session_number integer not null check (session_number >= 1),
  created_at timestamptz not null default now(),
  primary key (appointment_id, budget_item_id, session_number)
);

create index if not exists appointment_budget_sessions_item_idx
  on public.appointment_budget_sessions(budget_item_id, session_number);

alter table public.appointment_budget_sessions enable row level security;

create or replace function public.get_client_open_combo_sessions(_client_id uuid,_appointment_id uuid default null)
returns jsonb
language sql
security definer
set search_path=''
as $function$
  select coalesce(jsonb_agg(row_data order by row_data->>'budget_title',row_data->>'service_name',(row_data->>'session_number')::int),'[]'::jsonb)
  from (
    select jsonb_build_object(
      'budget_id',cb.id,'budget_title',cb.title,'budget_status',cb.status,'budget_paid',cb.is_paid,
      'budget_total',cb.total_amount,'paid_amount',cb.paid_amount,'budget_item_id',cbi.id,'service_id',cbi.service_id,
      'service_name',cbi.service_name_snapshot,'total_sessions',cbi.sessions,'session_number',gs.session_number,
      'linked_to_appointment',exists(select 1 from public.appointment_budget_sessions abs0 where abs0.appointment_id=_appointment_id and abs0.budget_item_id=cbi.id and abs0.session_number=gs.session_number)
    ) row_data
    from public.client_budgets cb
    join public.client_budget_items cbi on cbi.budget_id=cb.id
    cross join lateral generate_series(1,greatest(1,cbi.sessions)) gs(session_number)
    where cb.client_id=_client_id
      and cb.status not in ('declined','cancelled')
      and not (gs.session_number=any(coalesce(cbi.completed_session_numbers,'{}'::integer[])))
      and not exists (
        select 1 from public.appointment_budget_sessions abs1
        join public.appointments a1 on a1.id=abs1.appointment_id
        where abs1.budget_item_id=cbi.id and abs1.session_number=gs.session_number and a1.status<>'cancelado'
          and (_appointment_id is null or a1.id<>_appointment_id)
      )
  ) q;
$function$;
revoke all on function public.get_client_open_combo_sessions(uuid,uuid) from public;
grant execute on function public.get_client_open_combo_sessions(uuid,uuid) to authenticated;

create or replace function public.set_client_budget_paid(_budget_id uuid,_paid boolean)
returns public.client_budgets
language plpgsql
security definer
set search_path=''
as $function$
declare _budget public.client_budgets%rowtype;
begin
  if not (public.finance_has_role(array['admin','finance','reception']) or private.has_role('admin'::public.app_role) or exists(select 1 from public.admin_emails ae where ae.enabled=true and lower(ae.email)=lower(coalesce(auth.jwt()->>'email','')))) then
    raise exception 'Acesso insuficiente para atualizar o pagamento do combo.' using errcode='42501';
  end if;
  update public.client_budgets
  set is_paid=coalesce(_paid,false),paid_amount=case when coalesce(_paid,false) then total_amount else 0 end,
      paid_at=case when coalesce(_paid,false) then coalesce(paid_at,now()) else null end,
      status=case when coalesce(_paid,false) then 'approved' else status end,updated_at=now()
  where id=_budget_id returning * into _budget;
  if not found then raise exception 'Combo não encontrado.' using errcode='23503'; end if;
  return _budget;
end;
$function$;
revoke all on function public.set_client_budget_paid(uuid,boolean) from public;
grant execute on function public.set_client_budget_paid(uuid,boolean) to authenticated;

create or replace function public.set_appointment_budget_sessions(_appointment_id uuid,_links jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  _appointment public.appointments%rowtype; _link jsonb; _item public.client_budget_items%rowtype;
  _budget public.client_budgets%rowtype; _session integer; _all_paid boolean:=true; _count integer:=0;
begin
  if not (public.finance_has_role(array['admin','finance','reception']) or private.has_role('admin'::public.app_role) or exists(select 1 from public.admin_emails ae where ae.enabled=true and lower(ae.email)=lower(coalesce(auth.jwt()->>'email','')))) then
    raise exception 'Acesso insuficiente para vincular sessão do combo.' using errcode='42501';
  end if;
  select * into _appointment from public.appointments where id=_appointment_id for update;
  if not found then raise exception 'Agendamento não encontrado.' using errcode='23503'; end if;
  if _appointment.status='atendido' then raise exception 'Não é possível alterar o combo de um atendimento já concluído.' using errcode='23514'; end if;
  if _appointment.client_id is null then raise exception 'Selecione um cliente cadastrado antes de vincular o combo.' using errcode='23514'; end if;
  delete from public.appointment_budget_sessions where appointment_id=_appointment_id;
  if _links is null or jsonb_typeof(_links)<>'array' or jsonb_array_length(_links)=0 then
    return jsonb_build_object('appointment_id',_appointment_id,'linked_count',0,'all_paid',false);
  end if;
  for _link in select * from jsonb_array_elements(_links) loop
    _session:=nullif(_link->>'session_number','')::integer;
    select cbi.* into _item from public.client_budget_items cbi where cbi.id=(_link->>'budget_item_id')::uuid;
    if not found then raise exception 'Item do combo não encontrado.' using errcode='23503'; end if;
    select cb.* into _budget from public.client_budgets cb where cb.id=_item.budget_id;
    if _budget.client_id<>_appointment.client_id then raise exception 'Este combo pertence a outro cliente.' using errcode='23514'; end if;
    if _budget.status in ('declined','cancelled') then raise exception 'Este combo não está disponível para agendamento.' using errcode='23514'; end if;
    if _session is null or _session<1 or _session>greatest(1,_item.sessions) then raise exception 'Sessão inválida para o combo.' using errcode='23514'; end if;
    if _session=any(coalesce(_item.completed_session_numbers,'{}'::integer[])) then raise exception 'Esta sessão do combo já foi concluída.' using errcode='23514'; end if;
    if exists(select 1 from public.appointment_budget_sessions abs2 join public.appointments a2 on a2.id=abs2.appointment_id where abs2.budget_item_id=_item.id and abs2.session_number=_session and abs2.appointment_id<>_appointment_id and a2.status<>'cancelado') then
      raise exception 'Esta sessão do combo já está vinculada a outro agendamento ativo.' using errcode='23514';
    end if;
    if _item.service_id is not null and not exists(select 1 from public.appointment_services aps where aps.appointment_id=_appointment_id and aps.service_id=_item.service_id) then
      raise exception 'O serviço da sessão selecionada precisa estar neste agendamento.' using errcode='23514';
    end if;
    insert into public.appointment_budget_sessions(appointment_id,budget_item_id,session_number) values(_appointment_id,_item.id,_session) on conflict do nothing;
    _count:=_count+1; _all_paid:=_all_paid and coalesce(_budget.is_paid,false);
  end loop;
  if _count>0 and _all_paid then
    update public.appointments set custom_price=0,service_price_snapshot=0,balance_amount=0,payment_received=true,payment_method_code=null where id=_appointment_id;
  end if;
  return jsonb_build_object('appointment_id',_appointment_id,'linked_count',_count,'all_paid',_all_paid);
end;
$function$;
revoke all on function public.set_appointment_budget_sessions(uuid,jsonb) from public;
grant execute on function public.set_appointment_budget_sessions(uuid,jsonb) to authenticated;

create or replace function public.sync_appointment_budget_sessions(_appointment_id uuid,_completed boolean)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare _row record;
begin
  for _row in select abs.budget_item_id,abs.session_number from public.appointment_budget_sessions abs where abs.appointment_id=_appointment_id loop
    if coalesce(_completed,false) then
      update public.client_budget_items cbi set completed_session_numbers=(select coalesce(array_agg(v order by v),'{}'::integer[]) from (select distinct unnest(coalesce(cbi.completed_session_numbers,'{}'::integer[])||_row.session_number) v) x) where cbi.id=_row.budget_item_id;
    else
      update public.client_budget_items set completed_session_numbers=array_remove(coalesce(completed_session_numbers,'{}'::integer[]),_row.session_number) where id=_row.budget_item_id;
    end if;
  end loop;
end;
$function$;
revoke all on function public.sync_appointment_budget_sessions(uuid,boolean) from public;
grant execute on function public.sync_appointment_budget_sessions(uuid,boolean) to authenticated;

create or replace function public.sync_budget_sessions_from_appointment_status()
returns trigger language plpgsql set search_path='' as $function$
begin
  if new.status='atendido' and old.status is distinct from 'atendido' then perform public.sync_appointment_budget_sessions(new.id,true);
  elsif old.status='atendido' and new.status is distinct from 'atendido' then perform public.sync_appointment_budget_sessions(new.id,false); end if;
  return new;
end;
$function$;
drop trigger if exists trg_sync_budget_sessions_from_appointment_status on public.appointments;
create trigger trg_sync_budget_sessions_from_appointment_status after update of status on public.appointments for each row execute function public.sync_budget_sessions_from_appointment_status();

create or replace function public.reopen_appointment(_appointment_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare _appointment public.appointments%rowtype; _session_total integer; _financial public.financial_entries%rowtype; _before_financial jsonb; _belongs_to_paid_combo boolean:=false;
begin
  if not (public.finance_has_role(array['admin','finance','reception']) or private.has_role('admin'::public.app_role) or exists(select 1 from public.admin_emails ae where ae.enabled=true and lower(ae.email)=lower(coalesce(auth.jwt()->>'email','')))) then raise exception 'Acesso insuficiente para reabrir atendimento.' using errcode='42501'; end if;
  select * into _appointment from public.appointments where id=_appointment_id for update;
  if not found then raise exception 'Agendamento não encontrado.' using errcode='23503'; end if;
  if _appointment.status<>'atendido' then raise exception 'Somente atendimentos concluídos podem ser reabertos.' using errcode='23514'; end if;
  select count(*) into _session_total from public.appointment_sessions where appointment_id=_appointment_id;
  if _session_total>1 then raise exception 'Este atendimento possui várias sessões. Reabra a sessão específica que precisa ser corrigida.' using errcode='23514'; end if;
  select exists(select 1 from public.appointment_budget_sessions abs join public.client_budget_items cbi on cbi.id=abs.budget_item_id join public.client_budgets cb on cb.id=cbi.budget_id where abs.appointment_id=_appointment_id and cb.is_paid=true) into _belongs_to_paid_combo;
  update public.appointments set status='confirmado',attended_at=null,status_updated_at=now() where id=_appointment_id;
  update public.appointment_services set status='pending',completed_at=null,completed_by=null where appointment_id=_appointment_id;
  update public.appointment_sessions set status='pending',completed_at=null,completed_by=null,updated_at=now() where appointment_id=_appointment_id;
  select * into _financial from public.financial_entries where appointment_id=_appointment_id and status not in ('cancelled','refunded') order by created_at desc limit 1 for update;
  if found and _financial.status='received' and not _belongs_to_paid_combo then
    _before_financial:=to_jsonb(_financial);
    update public.financial_entries set status='pending',updated_at=now() where id=_financial.id returning * into _financial;
    insert into public.financial_audit_log(entity_type,entity_id,action,actor_id,old_data,new_data,metadata) values('financial_entries',_financial.id,'reopen_appointment',auth.uid(),_before_financial,to_jsonb(_financial),jsonb_build_object('appointment_id',_appointment_id));
  end if;
  return jsonb_build_object('appointment_id',_appointment_id,'status','confirmado','financial_status',case when _financial.id is not null then _financial.status else null end);
end;
$function$;
revoke all on function public.reopen_appointment(uuid) from public;
grant execute on function public.reopen_appointment(uuid) to authenticated;
