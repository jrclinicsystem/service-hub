-- STAGING ONLY: operational bridge for finance validation.
-- Do NOT promote this file to production. It exists because the isolated staging
-- project intentionally does not contain the full operational schema/data.
-- Canonical production behavior remains defined by the real scheduling migrations.

alter table public.appointments
  add column if not exists professional_id uuid,
  add column if not exists professional_name_snapshot text,
  add column if not exists attended_at timestamptz,
  add column if not exists status_updated_at timestamptz,
  add column if not exists custom_price numeric(12,2),
  add column if not exists payment_method_code text not null default 'pix',
  add column if not exists installments integer not null default 1,
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(12,4) not null default 0,
  add column if not exists cost_center_code text,
  add column if not exists payment_received boolean not null default true,
  add column if not exists manual_commission_amount numeric(12,2),
  add column if not exists manual_commission_reason text;

alter table public.appointments
  drop constraint if exists appointments_finance_staging_status_check;
alter table public.appointments
  add constraint appointments_finance_staging_status_check
  check (status in ('aguardando_pagamento','pendente','confirmado','atendido','cancelado'));

alter table public.appointments
  drop constraint if exists appointments_finance_staging_installments_check;
alter table public.appointments
  add constraint appointments_finance_staging_installments_check
  check (installments >= 1);

alter table public.appointments
  drop constraint if exists appointments_finance_staging_discount_type_check;
alter table public.appointments
  add constraint appointments_finance_staging_discount_type_check
  check (discount_type is null or discount_type in ('percent','amount'));

create or replace function public.finance_staging_sync_attended_appointment()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_service_name text;
  v_service_price numeric;
  v_entry public.financial_entries%rowtype;
begin
  if new.status <> 'atendido' or old.status = 'atendido' then
    return new;
  end if;

  if new.professional_id is null then
    raise exception 'Staging financeiro: professional_id é obrigatório antes de marcar como atendido';
  end if;

  select s.name, s.price
    into v_service_name, v_service_price
  from public.services s
  where s.id = new.service_id;

  if not found then
    raise exception 'Staging financeiro: serviço do atendimento não foi encontrado';
  end if;

  if coalesce(new.custom_price, v_service_price, 0) < 0 then
    raise exception 'Staging financeiro: valor do atendimento inválido';
  end if;

  new.attended_at := coalesce(new.attended_at, now());
  new.status_updated_at := now();

  select * into v_entry
  from public.register_attended_financial_entry(
    new.id,
    new.user_id,
    new.professional_id,
    new.service_id,
    new.patient_name,
    coalesce(nullif(trim(new.professional_name_snapshot),''), 'Profissional de teste'),
    v_service_name,
    coalesce(new.custom_price, v_service_price, 0),
    new.payment_method_code,
    new.installments,
    new.discount_type,
    new.discount_value,
    new.cost_center_code,
    new.manual_commission_amount,
    new.manual_commission_reason,
    coalesce(new.attended_at, now()),
    new.payment_received
  );

  return new;
end;
$$;

-- BEFORE is intentional so attended_at/status_updated_at are persisted in the same update.
drop trigger if exists appointments_finance_staging_attended_sync on public.appointments;
create trigger appointments_finance_staging_attended_sync
before update of status on public.appointments
for each row
when (new.status = 'atendido' and old.status is distinct from new.status)
execute function public.finance_staging_sync_attended_appointment();

comment on function public.finance_staging_sync_attended_appointment() is
  'STAGING ONLY. Bridges appointment status=atendido to the finance module in the isolated finance staging project.';
