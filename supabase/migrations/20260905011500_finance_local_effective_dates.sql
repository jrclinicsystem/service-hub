-- Keep finance effective dates aligned with the clinic timezone.
-- Financial workflows already interpret occurred_at in America/Fortaleza,
-- so default effective dates must use the same business date.

alter table public.professional_commission_rules
  alter column effective_from
  set default ((now() at time zone 'America/Fortaleza')::date);

alter table public.payment_method_fees
  alter column effective_from
  set default ((now() at time zone 'America/Fortaleza')::date);
