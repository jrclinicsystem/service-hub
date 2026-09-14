-- Administrative seller commissions.
-- Seller identity, appointment attribution and commission records are isolated
-- from the operational appointment row so non-admin appointment readers cannot
-- access seller data.

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  commission_percentage numeric(7,4) not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint sellers_name_not_blank check (length(trim(name)) > 0),
  constraint sellers_commission_percentage_valid check (commission_percentage >= 0 and commission_percentage <= 100)
);

create table if not exists public.appointment_sellers (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  seller_id uuid not null references public.sellers(id) on delete restrict,
  seller_name_snapshot text not null,
  commission_percentage_snapshot numeric(7,4) not null,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_sellers_percentage_valid check (commission_percentage_snapshot >= 0 and commission_percentage_snapshot <= 100)
);

create table if not exists public.seller_commissions (
  id uuid primary key default gen_random_uuid(),
  financial_entry_id uuid not null unique references public.financial_entries(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  seller_id uuid references public.sellers(id) on delete set null,
  seller_name_snapshot text not null,
  percentage numeric(7,4) not null,
  base_amount numeric(12,2) not null default 0,
  commission_amount numeric(12,2) not null default 0,
  status text not null default 'pending',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_commissions_percentage_valid check (percentage >= 0 and percentage <= 100),
  constraint seller_commissions_base_nonnegative check (base_amount >= 0),
  constraint seller_commissions_amount_nonnegative check (commission_amount >= 0),
  constraint seller_commissions_status_valid check (status in ('pending','suspended','cancelled'))
);

create index if not exists sellers_active_idx on public.sellers(is_active) where deleted_at is null;
create index if not exists appointment_sellers_seller_id_idx on public.appointment_sellers(seller_id);
create index if not exists seller_commissions_seller_status_idx on public.seller_commissions(seller_id, status);
create index if not exists seller_commissions_appointment_id_idx on public.seller_commissions(appointment_id);

alter table public.sellers enable row level security;
alter table public.appointment_sellers enable row level security;
alter table public.seller_commissions enable row level security;

drop policy if exists "Admins read sellers" on public.sellers;
create policy "Admins read sellers" on public.sellers for select to authenticated
using ((select private.has_role('admin'::public.app_role)));

drop policy if exists "Admins read appointment sellers" on public.appointment_sellers;
create policy "Admins read appointment sellers" on public.appointment_sellers for select to authenticated
using ((select private.has_role('admin'::public.app_role)));

drop policy if exists "Admins read seller commissions" on public.seller_commissions;
create policy "Admins read seller commissions" on public.seller_commissions for select to authenticated
using ((select private.has_role('admin'::public.app_role)));

revoke all on table public.sellers from anon;
revoke all on table public.appointment_sellers from anon;
revoke all on table public.seller_commissions from anon;
revoke insert, update, delete on table public.sellers from authenticated;
revoke insert, update, delete on table public.appointment_sellers from authenticated;
revoke insert, update, delete on table public.seller_commissions from authenticated;
grant select on table public.sellers to authenticated;
grant select on table public.appointment_sellers to authenticated;
grant select on table public.seller_commissions to authenticated;

create or replace function public.save_seller(
  _name text,
  _commission_percentage numeric,
  _email text default null,
  _phone text default null,
  _is_active boolean default true,
  _seller_id uuid default null
)
returns public.sellers
language plpgsql
security definer
set search_path to ''
as $$
declare
  result public.sellers%rowtype;
  clean_name text := nullif(trim(_name), '');
  clean_email text := nullif(lower(trim(coalesce(_email, ''))), '');
  clean_phone text := nullif(trim(coalesce(_phone, '')), '');
begin
  if not private.has_role('admin'::public.app_role) then
    raise exception 'Acesso administrativo insuficiente.' using errcode = '42501';
  end if;
  if clean_name is null then
    raise exception 'Informe o nome do vendedor.' using errcode = '23514';
  end if;
  if _commission_percentage is null or _commission_percentage < 0 or _commission_percentage > 100 then
    raise exception 'Percentual de comissão inválido.' using errcode = '23514';
  end if;

  if _seller_id is null then
    insert into public.sellers(name,email,phone,commission_percentage,is_active,created_by)
    values(clean_name,clean_email,clean_phone,round(_commission_percentage,4),coalesce(_is_active,true),auth.uid())
    returning * into result;
  else
    update public.sellers
       set name = clean_name,
           email = clean_email,
           phone = clean_phone,
           commission_percentage = round(_commission_percentage,4),
           is_active = coalesce(_is_active,true),
           deleted_at = case when coalesce(_is_active,true) then null else deleted_at end,
           updated_at = now()
     where id = _seller_id
     returning * into result;
    if not found then
      raise exception 'Vendedor não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  return result;
end;
$$;

create or replace function public.archive_seller(_seller_id uuid)
returns public.sellers
language plpgsql
security definer
set search_path to ''
as $$
declare result public.sellers%rowtype;
begin
  if not private.has_role('admin'::public.app_role) then
    raise exception 'Acesso administrativo insuficiente.' using errcode = '42501';
  end if;
  update public.sellers
     set is_active = false, deleted_at = coalesce(deleted_at, now()), updated_at = now()
   where id = _seller_id
   returning * into result;
  if not found then
    raise exception 'Vendedor não encontrado.' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

create or replace function public.set_appointment_seller(_appointment_id uuid, _seller_id uuid default null)
returns public.appointment_sellers
language plpgsql
security definer
set search_path to ''
as $$
declare
  appointment_row public.appointments%rowtype;
  seller_row public.sellers%rowtype;
  current_assignment public.appointment_sellers%rowtype;
  result public.appointment_sellers%rowtype;
begin
  if not private.has_role('admin'::public.app_role) then
    raise exception 'Acesso administrativo insuficiente.' using errcode = '42501';
  end if;

  select * into appointment_row from public.appointments where id = _appointment_id for update;
  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
  end if;
  if appointment_row.status = 'atendido' or exists (
    select 1 from public.financial_entries fe
    where fe.appointment_id = _appointment_id and fe.status not in ('cancelled','refunded')
  ) then
    raise exception 'O vendedor não pode ser alterado depois que o atendimento entra no financeiro.' using errcode = '23514';
  end if;

  select * into current_assignment from public.appointment_sellers where appointment_id = _appointment_id;

  if _seller_id is null then
    delete from public.appointment_sellers where appointment_id = _appointment_id;
    return null;
  end if;

  if current_assignment.appointment_id is not null and current_assignment.seller_id = _seller_id then
    return current_assignment;
  end if;

  select * into seller_row
  from public.sellers
  where id = _seller_id and is_active = true and deleted_at is null;
  if not found then
    raise exception 'Vendedor não encontrado ou inativo.' using errcode = '23503';
  end if;

  insert into public.appointment_sellers(
    appointment_id,seller_id,seller_name_snapshot,commission_percentage_snapshot,assigned_by,assigned_at,updated_at
  ) values (
    _appointment_id,seller_row.id,seller_row.name,seller_row.commission_percentage,auth.uid(),now(),now()
  )
  on conflict (appointment_id) do update
    set seller_id = excluded.seller_id,
        seller_name_snapshot = excluded.seller_name_snapshot,
        commission_percentage_snapshot = excluded.commission_percentage_snapshot,
        assigned_by = excluded.assigned_by,
        assigned_at = now(),
        updated_at = now()
  returning * into result;

  return result;
end;
$$;

create or replace function private.sync_seller_commission_from_financial_entry()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  assignment public.appointment_sellers%rowtype;
  calculated_base numeric(12,2);
  calculated_commission numeric(12,2);
  calculated_status text;
begin
  if new.appointment_id is null then
    return new;
  end if;

  select * into assignment
  from public.appointment_sellers
  where appointment_id = new.appointment_id;

  if not found then
    delete from public.seller_commissions where financial_entry_id = new.id;
    return new;
  end if;

  calculated_base := greatest(round(coalesce(new.charged_amount,0),2),0);
  calculated_commission := round(calculated_base * assignment.commission_percentage_snapshot / 100.0, 2);
  calculated_status := case
    when new.status = 'received' then 'pending'
    when new.status in ('cancelled','refunded') then 'cancelled'
    else 'suspended'
  end;

  insert into public.seller_commissions(
    financial_entry_id,appointment_id,seller_id,seller_name_snapshot,percentage,
    base_amount,commission_amount,status,created_by,created_at,updated_at
  ) values (
    new.id,new.appointment_id,assignment.seller_id,assignment.seller_name_snapshot,
    assignment.commission_percentage_snapshot,calculated_base,calculated_commission,
    calculated_status,coalesce(auth.uid(),assignment.assigned_by),now(),now()
  )
  on conflict (financial_entry_id) do update
    set appointment_id = excluded.appointment_id,
        seller_id = excluded.seller_id,
        seller_name_snapshot = excluded.seller_name_snapshot,
        percentage = excluded.percentage,
        base_amount = excluded.base_amount,
        commission_amount = excluded.commission_amount,
        status = excluded.status,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_seller_commission_from_financial_entry on public.financial_entries;
create trigger trg_sync_seller_commission_from_financial_entry
after insert or update of appointment_id, charged_amount, status on public.financial_entries
for each row execute function private.sync_seller_commission_from_financial_entry();

revoke all on function public.save_seller(text,numeric,text,text,boolean,uuid) from public, anon;
revoke all on function public.archive_seller(uuid) from public, anon;
revoke all on function public.set_appointment_seller(uuid,uuid) from public, anon;
grant execute on function public.save_seller(text,numeric,text,text,boolean,uuid) to authenticated;
grant execute on function public.archive_seller(uuid) to authenticated;
grant execute on function public.set_appointment_seller(uuid,uuid) to authenticated;
revoke all on function private.sync_seller_commission_from_financial_entry() from public, anon, authenticated;
