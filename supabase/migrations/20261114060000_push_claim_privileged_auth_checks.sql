-- Only service_role may claim; the function needs privileged read access to auth.users/auth.sessions.
-- Public roles have no EXECUTE permission, all matching predicates are checked in the function.
alter function public.claim_push_deliveries_v2(integer) security definer;
revoke all on function public.claim_push_deliveries_v2(integer) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries_v2(integer) to service_role;
