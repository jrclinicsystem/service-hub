-- STAGING ONLY: fix admin appointment deletion semantics.
-- Production remains read-only reference during Deep QA.

revoke insert, update, delete on table public.appointments from anon;
grant select, insert, update, delete on table public.appointments to authenticated;

drop policy if exists "Admins delete appointments" on public.appointments;
create policy "Admins delete appointments"
on public.appointments
for delete
to authenticated
using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
