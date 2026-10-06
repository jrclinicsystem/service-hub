alter table public.services
add column if not exists archived_at timestamptz;

update public.services
set archived_at = coalesce(archived_at, now())
where is_active = false
  and coalesce(price, 0) = 0
  and archived_at is null;

create or replace function public.delete_admin_service(_service_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  _has_history boolean;
begin
  if not (private.has_role('admin'::public.app_role) or exists (
    select 1 from public.admin_emails ae
    where ae.enabled = true
      and lower(ae.email) = lower(coalesce(auth.jwt()->>'email', ''))
  )) then
    raise exception 'Acesso administrativo insuficiente.';
  end if;

  if not exists (select 1 from public.services s where s.id = _service_id) then
    raise exception 'Serviço não encontrado.';
  end if;

  select
    exists(select 1 from public.appointments a where a.service_id = _service_id)
    or exists(select 1 from public.appointment_services aps where aps.service_id = _service_id)
    or exists(select 1 from public.appointment_sessions ass where ass.service_id = _service_id)
  into _has_history;

  if _has_history then
    update public.services
    set is_active = false,
        archived_at = now()
    where id = _service_id;
    return 'archived';
  end if;

  delete from public.services where id = _service_id;
  return 'deleted';
end;
$$;

revoke all on function public.delete_admin_service(uuid) from public, anon;
grant execute on function public.delete_admin_service(uuid) to authenticated;
