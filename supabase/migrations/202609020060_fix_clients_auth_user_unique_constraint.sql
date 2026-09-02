drop index if exists public.clients_auth_user_id_uidx;
create unique index clients_auth_user_id_uidx
  on public.clients (auth_user_id);
