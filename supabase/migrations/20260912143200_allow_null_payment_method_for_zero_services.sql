-- Zero-value or unpaid appointments legitimately have no new payment method.
-- The column kept a legacy NOT NULL constraint even though the closing flows
-- intentionally store NULL when no payment is being processed.
alter table public.appointments
  alter column payment_method_code drop not null;
