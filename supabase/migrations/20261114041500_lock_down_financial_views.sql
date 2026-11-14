-- JR Clinic production security hotfix, verified against project ldrqcbqaekmohwpneekx
-- Existing view definitions and columns are preserved; only access context changes.
begin;
revoke all on table public.financial_report_entries from anon;
revoke all on table public.financial_report_ledger from anon;
revoke all on table public.financial_cash_report from anon;
alter view public.financial_report_entries set (security_invoker = true);
alter view public.financial_report_ledger set (security_invoker = true);
alter view public.financial_cash_report set (security_invoker = true);
commit;
