-- Address staging database advisor findings without weakening role checks.

alter view public.accounts_payable_with_status set (security_invoker = true);
alter view public.accounts_receivable_with_status set (security_invoker = true);
alter view public.payment_totals_current_month set (security_invoker = true);

alter function public.finance_set_updated_at() set search_path = public;

revoke execute on function public.finance_audit_trigger() from public, anon, authenticated;
revoke execute on function public.register_attended_financial_entry(uuid,uuid,uuid,uuid,text,text,text,numeric,text,integer,text,numeric,text,numeric,text,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.register_attended_financial_entry(uuid,uuid,uuid,uuid,text,text,text,numeric,text,integer,text,numeric,text,numeric,text,timestamptz,boolean) to service_role;

revoke execute on function public.open_cash_session(numeric,date) from public, anon;
grant execute on function public.open_cash_session(numeric,date) to authenticated;

revoke execute on function public.close_cash_session(uuid,numeric,text) from public, anon;
grant execute on function public.close_cash_session(uuid,numeric,text) to authenticated;

revoke execute on function public.mark_commission_paid(uuid) from public, anon;
grant execute on function public.mark_commission_paid(uuid) to authenticated;

revoke execute on function public.get_financial_dashboard(date,date) from public, anon;
grant execute on function public.get_financial_dashboard(date,date) to authenticated;

revoke execute on function public.finance_has_role(text[]) from public, anon;
grant execute on function public.finance_has_role(text[]) to authenticated;
