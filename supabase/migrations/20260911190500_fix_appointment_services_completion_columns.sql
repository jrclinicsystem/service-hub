-- Hotfix de produção: o frontend de agenda passou a consultar appointment_services.status,
-- mas o schema publicado ainda não tinha recebido as colunas do controle de combos.
-- Esta migração é idempotente e mantém o repositório alinhado com produção.

alter table public.appointment_services
  add column if not exists status text not null default 'pending',
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid;

alter table public.appointment_services
  drop constraint if exists appointment_services_status_check;
alter table public.appointment_services
  add constraint appointment_services_status_check
  check (status in ('pending','completed'));

create index if not exists appointment_services_status_idx
  on public.appointment_services(appointment_id, status, position);
