-- STAGING ONLY: operational tables required by Deep QA. Production remains read-only.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter table public.categories add column if not exists is_featured boolean not null default false;
alter table public.business_settings add column if not exists business_name text not null default 'JR Clinic';
alter table public.business_settings add column if not exists description text;
alter table public.business_settings add column if not exists phone text;
alter table public.business_settings add column if not exists whatsapp text;
alter table public.business_settings add column if not exists email text;
alter table public.business_settings add column if not exists instagram_url text;
alter table public.business_settings add column if not exists logo_url text;
alter table public.business_settings add column if not exists online_payment_provider text not null default 'infinitepay';
alter table public.business_settings add column if not exists infinitepay_handle text;
alter table public.admin_emails add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.clients add column if not exists birthday_benefit_type text not null default 'soft_lips';
alter table public.clients add column if not exists birthday_discount_percent numeric(5,2);
alter table public.clients add column if not exists birthday_custom_benefit text;
alter table public.appointments add column if not exists user_hidden_at timestamptz;
update public.appointments set status_updated_at=coalesce(status_updated_at,created_at,now()) where status_updated_at is null;
alter table public.appointments alter column status_updated_at set default now();

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text, phone text, avatar_url text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select,insert,update on public.profiles to authenticated;

create table if not exists public.professional_access (
 id uuid primary key default gen_random_uuid(),
 professional_id uuid not null unique references public.professionals(id) on delete cascade,
 email text not null check (email=lower(btrim(email))), enabled boolean not null default true,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.professional_access enable row level security;
create index if not exists professional_access_email_idx on public.professional_access(lower(email)) where enabled=true;
revoke all on public.professional_access from anon, authenticated;
grant select,insert,update,delete on public.professional_access to authenticated;

create table if not exists public.professional_time_slots (
 id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.professionals(id) on delete cascade,
 slot text not null check(slot ~ '^[0-2][0-9]:[0-5][0-9]$' and slot::time<time '24:00'), is_available boolean not null default true,
 sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(professional_id,slot)
);
alter table public.professional_time_slots enable row level security;
create index if not exists professional_time_slots_professional_idx on public.professional_time_slots(professional_id,sort_order,slot);
revoke all on public.professional_time_slots from anon, authenticated;
grant select on public.professional_time_slots to anon,authenticated;
grant insert,update,delete on public.professional_time_slots to authenticated;

create table if not exists public.professional_availability_periods (
 id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.professionals(id) on delete cascade,
 weekday smallint not null check(weekday between 0 and 6), period text not null check(period in ('morning','afternoon','evening')), is_available boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(professional_id,weekday,period)
);
alter table public.professional_availability_periods enable row level security;
revoke all on public.professional_availability_periods from anon, authenticated;
grant select on public.professional_availability_periods to anon,authenticated;
grant insert,update,delete on public.professional_availability_periods to authenticated;

create table if not exists public.professional_date_time_slots (
 id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.professionals(id) on delete cascade,
 available_date date not null, slot text not null check(slot ~ '^[0-2][0-9]:[0-5][0-9]$' and slot::time<time '24:00'), is_available boolean not null default true,
 sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(professional_id,available_date,slot)
);
alter table public.professional_date_time_slots enable row level security;
create index if not exists professional_date_time_slots_lookup_idx on public.professional_date_time_slots(professional_id,available_date,sort_order,slot);
revoke all on public.professional_date_time_slots from anon, authenticated;
grant select on public.professional_date_time_slots to anon,authenticated;
grant insert,update,delete on public.professional_date_time_slots to authenticated;

create table if not exists public.professional_weekday_time_slots (
 id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.professionals(id) on delete cascade,
 weekday smallint not null check(weekday between 1 and 6), slot text not null check(slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), is_available boolean not null default true,
 sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(professional_id,weekday,slot)
);
alter table public.professional_weekday_time_slots enable row level security;
revoke all on public.professional_weekday_time_slots from anon, authenticated;
grant select on public.professional_weekday_time_slots to anon,authenticated;
grant insert,update,delete on public.professional_weekday_time_slots to authenticated;
