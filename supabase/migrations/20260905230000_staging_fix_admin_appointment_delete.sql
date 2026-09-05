-- STAGING ONLY: fix admin appointment deletion semantics during Deep QA.
-- Do not promote this file to production without a separate rollout review.

revoke insert, update, delete on table public.appointments from anon;
grant select, insert, update, delete on table public.appointments to authenticated;

drop policy if exists "Admins delete appointments" on public.appointments;
create policy "Admins delete appointments"
on public.appointments
for delete
to authenticated
using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
