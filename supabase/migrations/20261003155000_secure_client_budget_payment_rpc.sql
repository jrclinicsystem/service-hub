revoke execute on function public.record_client_budget_payment(uuid,text,integer,timestamptz,uuid) from anon;
revoke execute on function public.record_client_budget_payment(uuid,text,integer,timestamptz) from anon;
revoke all on function public.record_client_budget_payment(uuid,text,integer,timestamptz,uuid) from public;
grant execute on function public.record_client_budget_payment(uuid,text,integer,timestamptz,uuid) to authenticated;
