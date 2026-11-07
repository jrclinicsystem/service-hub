create table if not exists public.client_reactivation_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  contacted_at timestamptz not null default now(),
  contacted_on date not null default ((now() at time zone 'America/Fortaleza')::date),
  contacted_by uuid not null default auth.uid(),
  last_procedure_at timestamptz not null,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  constraint unique_reactivation_contact_day unique (client_id, contacted_on)
);
create index if not exists reactivation_contacts_client_recent_idx
  on public.client_reactivation_contacts (client_id, contacted_at desc);
alter table public.client_reactivation_contacts enable row level security;
revoke all on public.client_reactivation_contacts from public, anon;
grant select, insert on public.client_reactivation_contacts to authenticated;
create policy "Admin reads reactivation contacts" on public.client_reactivation_contacts
  for select to authenticated using ((select public.is_current_user_admin()));
create policy "Admin records reactivation contacts" on public.client_reactivation_contacts
  for insert to authenticated with check (
    (select public.is_current_user_admin()) and contacted_by = (select auth.uid())
    and exists (
      select 1 from public.clients c
      where c.id = client_id and c.deleted_at is null and c.is_active
    )
  );
comment on table public.client_reactivation_contacts is
  'Manual outreach history; does not alter appointments or financial data.';
