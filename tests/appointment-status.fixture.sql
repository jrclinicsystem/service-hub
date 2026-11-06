-- Disposable PostgreSQL fixture. This is not a production migration.
create schema auth;
create schema private;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create function auth.uid() returns uuid language sql stable as $$
  select case when current_setting('jr.test_anonymous', true) = 'true' then null
    else '00000000-0000-0000-0000-000000000001'::uuid end
$$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{"role":"authenticated"}'::jsonb $$;
create function public.is_current_user_admin() returns boolean language sql stable as $$
  select coalesce(current_setting('jr.test_admin', true), '') <> 'false'
$$;
create function private.staff_can_manage_professional(uuid) returns boolean language sql stable as $$ select false $$;
create table services(id uuid primary key, duration_min integer default 30);
create table appointments(
  id uuid primary key default gen_random_uuid(), professional_id uuid,
  service_id uuid references services(id), scheduled_date date not null,
  scheduled_time text not null, status text not null default 'pendente',
  status_updated_at timestamptz, updated_at timestamptz, attended_at timestamptz,
  user_id uuid, user_hidden_at timestamptz, payment_choice text default 'onsite',
  service_price_snapshot numeric default 100, balance_amount numeric default 75,
  deposit_percent numeric default 25, deposit_amount numeric default 25,
  notes text default 'Preserve these notes',
  constraint appointments_status_check check(status in ('pendente','confirmado','cancelado','atendido','aguardando_pagamento'))
);
create table appointment_professional_responses(
  appointment_id uuid references appointments(id), professional_id uuid, response text, responded_at timestamptz default now(),
  primary key(appointment_id,professional_id)
);
create table financial_entries(id uuid default gen_random_uuid(), appointment_id uuid references appointments(id), amount numeric default 100);
create table payments(appointment_id uuid references appointments(id), status text, amount numeric);
create table appointment_sessions(id uuid primary key default gen_random_uuid(), appointment_id uuid references appointments(id), status text, scheduled_date date, scheduled_time text, updated_at timestamptz);
create table room_professionals(room_id uuid, professional_id uuid);
create table room_reservations(room_id uuid, reservation_date date, start_time time, end_time time, status text);
create table professional_date_time_slots(professional_id uuid, available_date date, slot text, is_available boolean, sort_order integer);
create table professional_weekday_time_slots(professional_id uuid, weekday smallint, slot text, is_available boolean, sort_order integer);
create table professional_time_slots(professional_id uuid, slot text, is_available boolean, sort_order integer);
create table professional_availability_periods(professional_id uuid, weekday smallint, period text, is_available boolean);
