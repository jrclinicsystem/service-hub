-- STAGING ONLY: low-risk performance fixes surfaced by the post-DDL advisor.
create index if not exists admin_emails_created_by_idx on public.admin_emails(created_by);
create index if not exists appointments_client_id_idx on public.appointments(client_id);
create index if not exists appointments_service_id_idx on public.appointments(service_id);
create index if not exists clients_auth_user_id_idx on public.clients(auth_user_id);
create index if not exists clients_created_by_idx on public.clients(created_by);
create index if not exists professional_access_created_by_idx on public.professional_access(created_by);
create index if not exists promotions_service_id_idx on public.promotions(service_id);
create index if not exists room_reservations_created_by_idx on public.room_reservations(created_by);
create index if not exists room_reservations_renter_professional_id_idx on public.room_reservations(renter_professional_id);
create index if not exists rooms_created_by_idx on public.rooms(created_by);
create index if not exists service_professionals_professional_id_idx on public.service_professionals(professional_id);
create index if not exists service_reviews_service_id_idx on public.service_reviews(service_id);

drop policy if exists "Admins or professionals read professional access" on public.professional_access;
create policy "Admins or professionals read professional access" on public.professional_access
for select to authenticated
using(
  (select private.has_role('admin'::public.app_role))
  or (enabled and lower(email)=lower(coalesce(((select auth.jwt())->>'email'),'')))
);

drop policy if exists "Staff read active clients" on public.clients;
create policy "Staff read active clients" on public.clients
for select to authenticated
using(
  is_active and exists(
    select 1 from public.professional_access pa
    where pa.enabled=true and lower(pa.email)=lower(coalesce(((select auth.jwt())->>'email'),''))
  )
);

drop policy if exists "Staff create clients" on public.clients;
create policy "Staff create clients" on public.clients
for insert to authenticated
with check(
  created_by=(select auth.uid()) and auth_user_id is null and exists(
    select 1 from public.professional_access pa
    where pa.enabled=true and lower(pa.email)=lower(coalesce(((select auth.jwt())->>'email'),''))
  )
);
