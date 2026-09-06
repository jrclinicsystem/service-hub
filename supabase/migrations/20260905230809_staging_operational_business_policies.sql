-- STAGING ONLY: response, client, room and appointment policies.
drop policy if exists "Admins and professionals read appointment responses" on public.appointment_professional_responses;
create policy "Admins and professionals read appointment responses" on public.appointment_professional_responses for select to authenticated
using((select private.has_role('admin'::public.app_role)) or private.staff_can_manage_professional(professional_id));
drop policy if exists "Professionals create own appointment responses" on public.appointment_professional_responses;
create policy "Professionals create own appointment responses" on public.appointment_professional_responses for insert to authenticated
with check(private.staff_can_manage_professional(professional_id));
drop policy if exists "Professionals update own appointment responses" on public.appointment_professional_responses;
create policy "Professionals update own appointment responses" on public.appointment_professional_responses for update to authenticated
using(private.staff_can_manage_professional(professional_id)) with check(private.staff_can_manage_professional(professional_id));

drop policy if exists calendar_day_items_admin_select on public.calendar_day_items;
create policy calendar_day_items_admin_select on public.calendar_day_items for select to authenticated using(public.is_current_user_admin());
drop policy if exists calendar_day_items_admin_insert on public.calendar_day_items;
create policy calendar_day_items_admin_insert on public.calendar_day_items for insert to authenticated with check(public.is_current_user_admin());
drop policy if exists calendar_day_items_admin_update on public.calendar_day_items;
create policy calendar_day_items_admin_update on public.calendar_day_items for update to authenticated using(public.is_current_user_admin()) with check(public.is_current_user_admin());
drop policy if exists calendar_day_items_admin_delete on public.calendar_day_items;
create policy calendar_day_items_admin_delete on public.calendar_day_items for delete to authenticated using(public.is_current_user_admin());

drop policy if exists "Staff read active clients" on public.clients;
create policy "Staff read active clients" on public.clients for select to authenticated using(
 is_active and exists(select 1 from public.professional_access pa where pa.enabled=true and lower(pa.email)=lower(coalesce((select auth.jwt()->>'email'),'')))
);
drop policy if exists "Staff create clients" on public.clients;
create policy "Staff create clients" on public.clients for insert to authenticated with check(
 created_by=(select auth.uid()) and auth_user_id is null and exists(select 1 from public.professional_access pa where pa.enabled=true and lower(pa.email)=lower(coalesce((select auth.jwt()->>'email'),'')))
);

drop policy if exists "Admins manage rooms" on public.rooms;
create policy "Admins manage rooms" on public.rooms for all to authenticated using(public.is_current_user_admin()) with check(public.is_current_user_admin());
drop policy if exists "Staff read linked rooms" on public.rooms;
create policy "Staff read linked rooms" on public.rooms for select to authenticated using(
 public.is_current_user_admin() or exists(select 1 from public.room_professionals rp where rp.room_id=rooms.id and private.staff_can_manage_professional(rp.professional_id))
);

drop policy if exists "Admins manage room professionals" on public.room_professionals;
create policy "Admins manage room professionals" on public.room_professionals for all to authenticated using(public.is_current_user_admin()) with check(public.is_current_user_admin());
drop policy if exists "Staff read own room links" on public.room_professionals;
create policy "Staff read own room links" on public.room_professionals for select to authenticated using(public.is_current_user_admin() or private.staff_can_manage_professional(professional_id));

drop policy if exists "Admins manage room reservations" on public.room_reservations;
create policy "Admins manage room reservations" on public.room_reservations for all to authenticated using(public.is_current_user_admin()) with check(public.is_current_user_admin());
drop policy if exists "Staff read linked room reservations" on public.room_reservations;
create policy "Staff read linked room reservations" on public.room_reservations for select to authenticated using(
 public.is_current_user_admin() or exists(select 1 from public.room_professionals rp where rp.room_id=room_reservations.room_id and private.staff_can_manage_professional(rp.professional_id))
);

drop policy if exists "Professionals read own appointments" on public.appointments;
create policy "Professionals read own appointments" on public.appointments for select to authenticated
using(professional_id is not null and private.staff_can_manage_professional(professional_id));
drop policy if exists "Admins create manual appointments" on public.appointments;
create policy "Admins create manual appointments" on public.appointments for insert to authenticated with check(public.is_current_user_admin());
drop policy if exists "Staff create own professional appointments" on public.appointments;
create policy "Staff create own professional appointments" on public.appointments for insert to authenticated
with check(user_id is null and professional_id is not null and private.staff_can_manage_professional(professional_id));
