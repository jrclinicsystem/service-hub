-- STAGING ONLY: database-level guarantee against two active appointments starting at the exact same clinic date/time.
create unique index if not exists appointments_active_start_unique
on public.appointments(scheduled_date,scheduled_time)
where status not in ('cancelado','atendido');
