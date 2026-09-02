create table if not exists public.calendar_day_items (
  id uuid primary key default gen_random_uuid(),
  item_date date not null,
  item_type text not null check (item_type in ('note','commitment')),
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text null,
  item_time time null,
  completed boolean not null default false,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_day_items_item_date_idx on public.calendar_day_items(item_date);
create index if not exists calendar_day_items_type_date_idx on public.calendar_day_items(item_type, item_date);

alter table public.calendar_day_items enable row level security;

drop policy if exists "calendar_day_items_admin_select" on public.calendar_day_items;
drop policy if exists "calendar_day_items_admin_insert" on public.calendar_day_items;
drop policy if exists "calendar_day_items_admin_update" on public.calendar_day_items;
drop policy if exists "calendar_day_items_admin_delete" on public.calendar_day_items;

create policy "calendar_day_items_admin_select"
on public.calendar_day_items
for select
to authenticated
using (public.is_current_user_admin());

create policy "calendar_day_items_admin_insert"
on public.calendar_day_items
for insert
to authenticated
with check (public.is_current_user_admin());

create policy "calendar_day_items_admin_update"
on public.calendar_day_items
for update
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

create policy "calendar_day_items_admin_delete"
on public.calendar_day_items
for delete
to authenticated
using (public.is_current_user_admin());

grant select, insert, update, delete on public.calendar_day_items to authenticated;
