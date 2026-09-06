-- STAGING ONLY: operational responses, calendar and room tables for Deep QA.
create table if not exists public.appointment_professional_responses (
 appointment_id uuid primary key references public.appointments(id) on delete cascade,
 professional_id uuid not null references public.professionals(id) on delete cascade,
 response text not null default 'aguardando' check(response in ('aguardando','confirmado','recusado')),
 responded_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.appointment_professional_responses enable row level security;
create index if not exists appointment_professional_responses_professional_idx on public.appointment_professional_responses(professional_id,response);
revoke all on public.appointment_professional_responses from anon, authenticated;
grant select,insert,update on public.appointment_professional_responses to authenticated;

create table if not exists public.calendar_day_items (
 id uuid primary key default gen_random_uuid(), item_date date not null,
 item_type text not null check(item_type in ('note','commitment')),
 title text not null check(char_length(btrim(title)) between 1 and 160), description text, item_time time,
 completed boolean not null default false, created_by uuid default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.calendar_day_items enable row level security;
create index if not exists calendar_day_items_date_idx on public.calendar_day_items(item_date,item_time);
revoke all on public.calendar_day_items from anon, authenticated;
grant select,insert,update,delete on public.calendar_day_items to authenticated;

create table if not exists public.rooms (
 id uuid primary key default gen_random_uuid(), name text not null check(char_length(btrim(name)) between 2 and 120),
 is_active boolean not null default true, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.rooms enable row level security;
revoke all on public.rooms from anon, authenticated;
grant select,insert,update,delete on public.rooms to authenticated;

create table if not exists public.room_professionals (
 room_id uuid not null references public.rooms(id) on delete cascade,
 professional_id uuid not null references public.professionals(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(room_id,professional_id)
);
alter table public.room_professionals enable row level security;
create index if not exists room_professionals_professional_idx on public.room_professionals(professional_id,room_id);
revoke all on public.room_professionals from anon, authenticated;
grant select,insert,update,delete on public.room_professionals to authenticated;

create table if not exists public.room_reservations (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms(id) on delete cascade,
 renter_professional_id uuid references public.professionals(id) on delete set null,
 renter_name text not null check(char_length(btrim(renter_name)) between 2 and 120), reservation_date date not null,
 rental_type text not null check(rental_type in ('hour','shift','day')), start_time time not null, end_time time not null,
 amount numeric(12,2) check(amount is null or amount>=0), notes text check(notes is null or char_length(notes)<=1000),
 status text not null default 'active' check(status in ('active','cancelled')), created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.room_reservations enable row level security;
create index if not exists room_reservations_lookup_idx on public.room_reservations(room_id,reservation_date,start_time,end_time) where status='active';
revoke all on public.room_reservations from anon, authenticated;
grant select,insert,update,delete on public.room_reservations to authenticated;
