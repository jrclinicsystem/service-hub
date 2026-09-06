-- STAGING ONLY: restore auth/profile and professional/admin role synchronization for Deep QA.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  client_birth_date date:=null;
  client_whatsapp text:=null;
  account_type text:=coalesce(new.raw_user_meta_data->>'account_type','');
begin
  client_whatsapp:=nullif(btrim(coalesce(new.raw_user_meta_data->>'whatsapp',new.raw_user_meta_data->>'phone',new.phone,'')),'');
  begin
    if nullif(new.raw_user_meta_data->>'birth_date','') is not null then client_birth_date:=(new.raw_user_meta_data->>'birth_date')::date; end if;
  exception when others then client_birth_date:=null;
  end;

  insert into public.profiles(id,full_name,phone,avatar_url)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),coalesce(new.phone,client_whatsapp),new.raw_user_meta_data->>'avatar_url')
  on conflict(id) do update set full_name=excluded.full_name,phone=coalesce(excluded.phone,public.profiles.phone),avatar_url=coalesce(excluded.avatar_url,public.profiles.avatar_url),updated_at=now();

  insert into public.user_roles(user_id,role) values(new.id,'user'::public.app_role) on conflict(user_id,role) do nothing;

  if exists(select 1 from public.admin_emails ae where ae.enabled=true and lower(ae.email)=lower(coalesce(new.email,''))) then
    insert into public.user_roles(user_id,role) values(new.id,'admin'::public.app_role) on conflict(user_id,role) do nothing;
  end if;

  if exists(select 1 from public.professional_access pa where pa.enabled=true and lower(pa.email)=lower(coalesce(new.email,''))) then
    insert into public.user_roles(user_id,role) values(new.id,'staff'::public.app_role) on conflict(user_id,role) do nothing;
  end if;

  if account_type='client'
     and char_length(btrim(coalesce(new.raw_user_meta_data->>'full_name','')))>=2
     and client_whatsapp is not null and char_length(client_whatsapp)>=10
     and client_birth_date is not null then
    insert into public.clients(name,whatsapp,birth_date,email,auth_user_id,birthday_benefit_type,is_active)
    values(btrim(new.raw_user_meta_data->>'full_name'),client_whatsapp,client_birth_date,nullif(lower(btrim(coalesce(new.email,''))),''),new.id,'soft_lips',true)
    on conflict(auth_user_id) do update set name=excluded.name,whatsapp=excluded.whatsapp,birth_date=excluded.birth_date,email=excluded.email,is_active=true,updated_at=now();
  end if;
  return new;
end;
$$;

create or replace function private.sync_admin_email_role()
returns trigger language plpgsql security definer set search_path=''
as $$
declare target_user_id uuid;
begin
  if tg_op in ('UPDATE','DELETE') then
    if old.enabled=true and (tg_op='DELETE' or new.enabled=false or lower(new.email)<>lower(old.email)) then
      select u.id into target_user_id from auth.users u where lower(u.email)=lower(old.email) limit 1;
      if target_user_id is not null then delete from public.user_roles where user_id=target_user_id and role='admin'::public.app_role; end if;
    end if;
  end if;
  if tg_op in ('INSERT','UPDATE') and new.enabled=true then
    target_user_id:=null;
    select u.id into target_user_id from auth.users u where lower(u.email)=lower(new.email) limit 1;
    if target_user_id is not null then insert into public.user_roles(user_id,role) values(target_user_id,'admin'::public.app_role) on conflict(user_id,role) do nothing; end if;
  end if;
  return coalesce(new,old);
end;
$$;

create or replace function private.sync_professional_access_role()
returns trigger language plpgsql security definer set search_path=''
as $$
declare target_user_id uuid; old_email text; new_email text;
begin
  old_email:=case when tg_op in ('UPDATE','DELETE') then lower(old.email) else null end;
  new_email:=case when tg_op in ('INSERT','UPDATE') then lower(new.email) else null end;
  if tg_op in ('UPDATE','DELETE') then
    if old.enabled=true and (tg_op='DELETE' or new.enabled=false or new_email is distinct from old_email) then
      select u.id into target_user_id from auth.users u where lower(u.email)=old_email limit 1;
      if target_user_id is not null and not exists(
        select 1 from public.professional_access pa where pa.enabled=true and lower(pa.email)=old_email and (tg_op<>'UPDATE' or pa.id<>old.id)
      ) then delete from public.user_roles where user_id=target_user_id and role='staff'::public.app_role; end if;
    end if;
  end if;
  if tg_op in ('INSERT','UPDATE') and new.enabled=true then
    target_user_id:=null;
    select u.id into target_user_id from auth.users u where lower(u.email)=new_email limit 1;
    if target_user_id is not null then insert into public.user_roles(user_id,role) values(target_user_id,'staff'::public.app_role) on conflict(user_id,role) do nothing; end if;
  end if;
  return coalesce(new,old);
end;
$$;

create or replace function public.current_portal_destination()
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_email text:=lower(coalesce(auth.jwt()->>'email',''));
begin
  if v_uid is null then return 'anonymous'; end if;
  if private.has_role('admin'::public.app_role)
     or exists(select 1 from public.financial_access fa where fa.user_id=v_uid and fa.is_active=true and fa.role in ('admin','finance','reception')) then return 'admin'; end if;
  if exists(select 1 from public.professional_access pa join public.professionals p on p.id=pa.professional_id where pa.enabled=true and lower(pa.email)=v_email and p.is_active=true and p.deleted_at is null)
     or exists(select 1 from public.financial_access fa where fa.user_id=v_uid and fa.is_active=true and fa.role='professional')
     or private.has_role('staff'::public.app_role) then return 'professional'; end if;
  return 'public';
end;
$$;

revoke all on function public.current_portal_destination() from public,anon;
grant execute on function public.current_portal_destination() to authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();
drop trigger if exists sync_admin_email_role on public.admin_emails;
create trigger sync_admin_email_role after insert or update or delete on public.admin_emails for each row execute function private.sync_admin_email_role();
drop trigger if exists sync_professional_access_role on public.professional_access;
create trigger sync_professional_access_role after insert or update or delete on public.professional_access for each row execute function private.sync_professional_access_role();
