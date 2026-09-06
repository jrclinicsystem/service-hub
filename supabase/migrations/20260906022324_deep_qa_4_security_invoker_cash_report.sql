-- Deep QA #4: ensure the financial cash report obeys caller permissions/RLS.
-- This migration is already applied in the finance staging database; this file
-- restores the migration history in Git so environments remain reproducible.

alter view if exists public.financial_cash_report
  set (security_invoker = true);
