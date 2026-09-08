revoke execute on function public.deactivate_payment_method_fee(uuid) from anon;
revoke execute on function public.update_pending_account_payable(uuid, numeric, date) from anon;
revoke execute on function public.update_pending_account_receivable(uuid, numeric, date) from anon;

revoke execute on function public.deactivate_payment_method_fee(uuid) from public;
revoke execute on function public.update_pending_account_payable(uuid, numeric, date) from public;
revoke execute on function public.update_pending_account_receivable(uuid, numeric, date) from public;

grant execute on function public.deactivate_payment_method_fee(uuid) to authenticated;
grant execute on function public.update_pending_account_payable(uuid, numeric, date) to authenticated;
grant execute on function public.update_pending_account_receivable(uuid, numeric, date) to authenticated;
