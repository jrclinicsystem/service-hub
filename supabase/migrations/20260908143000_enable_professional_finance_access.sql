create or replace function public.sync_professional_finance_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _user_id uuid;
  _old_user_id uuid;
  _professional_active boolean;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select u.id into _old_user_id
    from auth.users u
    where lower(u.email) = lower(old.email)
    limit 1;

    if _old_user_id is not null then
      update public.financial_access
         set is_active = false,
             updated_at = now()
       where user_id = _old_user_id
         and role = 'professional'
         and professional_id = old.professional_id;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  select (p.is_active and p.deleted_at is null)
    into _professional_active
  from public.professionals p
  where p.id = new.professional_id;

  if new.enabled and coalesce(_professional_active, false) then
    select u.id into _user_id
    from auth.users u
    where lower(u.email) = lower(new.email)
    limit 1;

    if _user_id is not null then
      insert into public.financial_access(user_id, role, professional_id, is_active)
      values (_user_id, 'professional', new.professional_id, true)
      on conflict (user_id, role) do update
        set professional_id = excluded.professional_id,
            is_active = true,
            updated_at = now();
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_professional_finance_access() from public, anon, authenticated;

drop trigger if exists trg_sync_professional_finance_access on public.professional_access;
create trigger trg_sync_professional_finance_access
after insert or update or delete on public.professional_access
for each row execute function public.sync_professional_finance_access();

-- Backfill current collaborators that already have an Auth account and an enabled professional agenda.
insert into public.financial_access(user_id, role, professional_id, is_active)
select u.id, 'professional', pa.professional_id, true
from public.professional_access pa
join public.professionals p on p.id = pa.professional_id
join auth.users u on lower(u.email) = lower(pa.email)
where pa.enabled = true
  and p.is_active = true
  and p.deleted_at is null
on conflict (user_id, role) do update
  set professional_id = excluded.professional_id,
      is_active = true,
      updated_at = now();

-- Disable stale professional finance roles that no longer correspond to an enabled agenda link.
update public.financial_access fa
   set is_active = false,
       updated_at = now()
 where fa.role = 'professional'
   and not exists (
     select 1
     from auth.users u
     join public.professional_access pa on lower(pa.email) = lower(u.email)
     join public.professionals p on p.id = pa.professional_id
     where u.id = fa.user_id
       and pa.professional_id = fa.professional_id
       and pa.enabled = true
       and p.is_active = true
       and p.deleted_at is null
   );
