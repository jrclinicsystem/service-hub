-- JR Clinic Finance Staging: restore portal destination resolver used after login.

create or replace function public.current_portal_destination()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    return null;
  end if;

  if exists (
    select 1
    from public.user_roles ur
    where ur.user_id = _uid
      and ur.role = 'admin'::public.app_role
  ) or exists (
    select 1
    from public.financial_access fa
    where fa.user_id = _uid
      and fa.is_active = true
      and fa.role in ('admin','finance','reception')
  ) then
    return 'admin';
  end if;

  if exists (
    select 1
    from public.financial_access fa
    where fa.user_id = _uid
      and fa.is_active = true
      and fa.role = 'professional'
  ) or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = _uid
      and ur.role = 'staff'::public.app_role
  ) then
    return 'professional';
  end if;

  return null;
end;
$$;

revoke all on function public.current_portal_destination() from public, anon;
grant execute on function public.current_portal_destination() to authenticated;

notify pgrst, 'reload schema';
