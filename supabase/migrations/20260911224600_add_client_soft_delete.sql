alter table public.clients
  add column if not exists deleted_at timestamptz;

comment on column public.clients.deleted_at is
  'Soft-delete marker used to hide clients from active lists while preserving appointment history.';
