alter table public.clients
  add column if not exists email text,
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists clients_auth_user_id_uidx
  on public.clients (auth_user_id)
  where auth_user_id is not null;

create index if not exists clients_email_lower_idx
  on public.clients (lower(email))
  where email is not null;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  client_birth_date date := null;
  client_whatsapp text := null;
  account_type text := coalesce(new.raw_user_meta_data ->> 'account_type', '');
begin
  client_whatsapp := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'whatsapp',
    new.raw_user_meta_data ->> 'phone',
    new.phone,
    ''
  )), '');

  begin
    if nullif(new.raw_user_meta_data ->> 'birth_date', '') is not null then
      client_birth_date := (new.raw_user_meta_data ->> 'birth_date')::date;
    end if;
  exception when others then
    client_birth_date := null;
  end;

  insert into public.profiles (id, full_name, phone, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.phone, client_whatsapp),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = coalesce(excluded.phone, public.profiles.phone),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = now();

  insert into public.user_roles (user_id, role)
  values (new.id, 'user'::public.app_role)
  on conflict (user_id, role) do nothing;

  if exists (
    select 1
    from public.admin_emails ae
    where ae.enabled = true
      and lower(ae.email) = lower(coalesce(new.email, ''))
  ) then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin'::public.app_role)
    on conflict (user_id, role) do nothing;
  end if;

  if exists (
    select 1
    from public.professional_access pa
    where pa.enabled = true
      and lower(pa.email) = lower(coalesce(new.email, ''))
  ) then
    insert into public.user_roles (user_id, role)
    values (new.id, 'staff'::public.app_role)
    on conflict (user_id, role) do nothing;
  end if;

  if account_type = 'client'
     and char_length(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''))) >= 2
     and client_whatsapp is not null
     and char_length(client_whatsapp) >= 10
     and client_birth_date is not null then
    insert into public.clients (
      name,
      whatsapp,
      birth_date,
      email,
      auth_user_id,
      birthday_benefit_type,
      is_active
    )
    values (
      btrim(new.raw_user_meta_data ->> 'full_name'),
      client_whatsapp,
      client_birth_date,
      nullif(lower(btrim(coalesce(new.email, ''))), ''),
      new.id,
      'soft_lips',
      true
    )
    on conflict (auth_user_id) do update
      set name = excluded.name,
          whatsapp = excluded.whatsapp,
          birth_date = excluded.birth_date,
          email = excluded.email,
          is_active = true,
          updated_at = now();
  end if;

  return new;
end;
$function$;
