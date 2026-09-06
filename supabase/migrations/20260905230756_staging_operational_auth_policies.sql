-- STAGING ONLY: operational authorization helpers and RLS policies.
create or replace function private.has_role(_role public.app_role)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role=_role)
  or (_role='admin'::public.app_role and exists(
    select 1 from public.admin_emails ae
    where ae.enabled=true and lower(ae.email)=lower(coalesce((select auth.jwt()->>'email'),''))
  ));
$$;

create or replace function private.staff_can_manage_professional(_professional_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select (select auth.uid()) is not null and exists(
    select 1 from public.professional_access pa
    where pa.professional_id=_professional_id and pa.enabled=true
      and lower(pa.email)=lower(coalesce((select auth.jwt()->>'email'),''))
  );
$$;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path=''
as $$ begin new.updated_at=now(); return new; end; $$;

revoke all on function private.has_role(public.app_role) from public,anon;
revoke all on function private.staff_can_manage_professional(uuid) from public,anon;
grant execute on function private.has_role(public.app_role),private.staff_can_manage_professional(uuid) to authenticated;

-- profiles
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated with check((select auth.uid())=id);
drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles for select to authenticated using((select auth.uid())=id or (select private.has_role('admin'::public.app_role)));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using((select auth.uid())=id) with check((select auth.uid())=id);

-- professional access
drop policy if exists "Admins or professionals read professional access" on public.professional_access;
create policy "Admins or professionals read professional access" on public.professional_access for select to authenticated
using((select private.has_role('admin'::public.app_role)) or (enabled and lower(email)=lower(coalesce((select auth.jwt()->>'email'),''))));
drop policy if exists "Admins insert professional access" on public.professional_access;
create policy "Admins insert professional access" on public.professional_access for insert to authenticated with check((select private.has_role('admin'::public.app_role)));
drop policy if exists "Admins update professional access" on public.professional_access;
create policy "Admins update professional access" on public.professional_access for update to authenticated using((select private.has_role('admin'::public.app_role))) with check((select private.has_role('admin'::public.app_role)));
drop policy if exists "Admins delete professional access" on public.professional_access;
create policy "Admins delete professional access" on public.professional_access for delete to authenticated using((select private.has_role('admin'::public.app_role)));

-- professional schedules
drop policy if exists "Professional slots public read" on public.professional_time_slots;
create policy "Professional slots public read" on public.professional_time_slots for select to anon,authenticated using(true);
drop policy if exists "Admins manage professional slots" on public.professional_time_slots;
create policy "Admins manage professional slots" on public.professional_time_slots for all to authenticated using((select private.has_role('admin'::public.app_role))) with check((select private.has_role('admin'::public.app_role)));
drop policy if exists "Staff manage own professional slots" on public.professional_time_slots;
create policy "Staff manage own professional slots" on public.professional_time_slots for all to authenticated using(private.staff_can_manage_professional(professional_id)) with check(private.staff_can_manage_professional(professional_id));

drop policy if exists "Public can read professional availability" on public.professional_availability_periods;
create policy "Public can read professional availability" on public.professional_availability_periods for select to anon,authenticated using(true);
drop policy if exists "Admins manage professional availability" on public.professional_availability_periods;
create policy "Admins manage professional availability" on public.professional_availability_periods for all to authenticated using((select private.has_role('admin'::public.app_role))) with check((select private.has_role('admin'::public.app_role)));
drop policy if exists "Staff manage own professional availability" on public.professional_availability_periods;
create policy "Staff manage own professional availability" on public.professional_availability_periods for all to authenticated using(private.staff_can_manage_professional(professional_id)) with check(private.staff_can_manage_professional(professional_id));

drop policy if exists "Public read professional date slots" on public.professional_date_time_slots;
create policy "Public read professional date slots" on public.professional_date_time_slots for select to anon,authenticated using(true);
drop policy if exists "Admins manage professional date slots" on public.professional_date_time_slots;
create policy "Admins manage professional date slots" on public.professional_date_time_slots for all to authenticated using(public.is_current_user_admin()) with check(public.is_current_user_admin());
drop policy if exists "Staff manage own professional date slots" on public.professional_date_time_slots;
create policy "Staff manage own professional date slots" on public.professional_date_time_slots for all to authenticated using(private.staff_can_manage_professional(professional_id)) with check(private.staff_can_manage_professional(professional_id));

drop policy if exists "Public read professional weekday slots" on public.professional_weekday_time_slots;
create policy "Public read professional weekday slots" on public.professional_weekday_time_slots for select to anon,authenticated using(true);
drop policy if exists "Admins manage professional weekday slots" on public.professional_weekday_time_slots;
create policy "Admins manage professional weekday slots" on public.professional_weekday_time_slots for all to authenticated using(public.is_current_user_admin()) with check(public.is_current_user_admin());
drop policy if exists "Staff manage own professional weekday slots" on public.professional_weekday_time_slots;
create policy "Staff manage own professional weekday slots" on public.professional_weekday_time_slots for all to authenticated using(private.staff_can_manage_professional(professional_id)) with check(private.staff_can_manage_professional(professional_id));
