-- JR CLINIC | Target project: ldrqcbqaekmohwpneekx | additive, preserves all data.

-- 1) Specialties (categories): admins recognised by the same check used across the clinic.
grant select on public.categories to anon, authenticated;
grant insert, update on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
drop policy if exists "Clinic admins insert categories" on public.categories;
create policy "Clinic admins insert categories" on public.categories
  for insert to authenticated with check (public.is_current_user_admin());
drop policy if exists "Clinic admins update categories" on public.categories;
create policy "Clinic admins update categories" on public.categories
  for update to authenticated
  using (public.is_current_user_admin()) with check (public.is_current_user_admin());
create unique index if not exists categories_name_unique_ci
  on public.categories (lower(btrim(name)));

-- 2) Per-user read receipts for notifications (admin reads never touch professional state).
create table if not exists public.notification_reads (
  notification_id uuid not null references public.professional_notifications(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
grant select on public.notification_reads to authenticated;
grant all on public.notification_reads to service_role;
alter table public.notification_reads enable row level security;
drop policy if exists "Read own notification receipts" on public.notification_reads;
create policy "Read own notification receipts" on public.notification_reads
  for select to authenticated using (user_id = auth.uid());

-- Backfill: professional notices already marked read stay read for that professional's users.
insert into public.notification_reads (notification_id, user_id, read_at)
select n.id, u.id, n.read_at
from public.professional_notifications n
join public.professional_access pa on pa.professional_id = n.recipient_professional_id and pa.enabled
join auth.users u on lower(trim(u.email)) = lower(trim(pa.email))
where n.read_at is not null
on conflict do nothing;

-- RLS-respecting view: is_read is computed for the calling user only.
create or replace view public.my_professional_notifications
with (security_invoker = true) as
select n.*,
  exists (select 1 from public.notification_reads r
          where r.notification_id = n.id and r.user_id = auth.uid()) as is_read
from public.professional_notifications n;
grant select on public.my_professional_notifications to authenticated;

-- Marks only notifications the caller can currently see (admin: all; professional: own).
create or replace function public.mark_notifications_read(_ids uuid[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_current_user_admin();
  v_prof uuid := private.current_push_professional_id();
  v_count integer;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not v_admin and v_prof is null then return 0; end if;
  insert into public.notification_reads (notification_id, user_id)
  select n.id, v_uid from public.professional_notifications n
  where (_ids is null or n.id = any(_ids))
    and (v_admin or n.recipient_professional_id = v_prof)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  -- Keep legacy read_at in sync only for the recipient professional's own notices.
  if v_prof is not null then
    update public.professional_notifications n set read_at = now()
    where n.read_at is null and n.recipient_professional_id = v_prof
      and (_ids is null or n.id = any(_ids));
  end if;
  return v_count;
end $$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
