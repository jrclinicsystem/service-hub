-- Restrict the new contact history to the exact privileges required.
-- Some Supabase projects grant broad authenticated privileges by default.
-- TRUNCATE bypasses row-level security, so explicit revocation is essential.
revoke all on table public.client_reactivation_contacts from authenticated;
grant select, insert on table public.client_reactivation_contacts to authenticated;
