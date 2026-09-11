alter table public.clients
  add column if not exists observation text;

create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  category text not null default 'document' check (category in ('anamnesis','document','photo','other')),
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  notes text,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists client_documents_client_idx on public.client_documents(client_id, created_at desc);

create table if not exists public.client_budgets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null default 'Orçamento',
  notes text,
  status text not null default 'draft' check (status in ('draft','approved','declined','cancelled')),
  total_amount numeric(12,2) not null default 0,
  valid_until date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_budgets_client_idx on public.client_budgets(client_id, created_at desc);

create table if not exists public.client_budget_items (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.client_budgets(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  service_name_snapshot text not null,
  unit_price numeric(12,2) not null default 0,
  sessions integer not null default 1 check (sessions between 1 and 60),
  line_total numeric(12,2) generated always as (round(unit_price * sessions, 2)) stored,
  position integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists client_budget_items_budget_idx on public.client_budget_items(budget_id, position);

alter table public.client_documents enable row level security;
alter table public.client_budgets enable row level security;
alter table public.client_budget_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='client_documents' and policyname='client_documents_staff') then
    create policy client_documents_staff on public.client_documents for all to authenticated
      using (public.is_current_user_admin() or public.finance_has_role(array['admin','finance','reception']))
      with check (public.is_current_user_admin() or public.finance_has_role(array['admin','finance','reception']));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='client_budgets' and policyname='client_budgets_staff') then
    create policy client_budgets_staff on public.client_budgets for all to authenticated
      using (public.is_current_user_admin() or public.finance_has_role(array['admin','finance','reception']))
      with check (public.is_current_user_admin() or public.finance_has_role(array['admin','finance','reception']));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='client_budget_items' and policyname='client_budget_items_staff') then
    create policy client_budget_items_staff on public.client_budget_items for all to authenticated
      using (public.is_current_user_admin() or public.finance_has_role(array['admin','finance','reception']))
      with check (public.is_current_user_admin() or public.finance_has_role(array['admin','finance','reception']));
  end if;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('client-records','client-records',false,15728640,null)
on conflict(id) do update set public=false,file_size_limit=15728640;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='client_records_staff_select') then
    create policy client_records_staff_select on storage.objects for select to authenticated
      using (bucket_id='client-records' and (public.is_current_user_admin() or public.finance_has_role(array['admin','finance','reception'])));
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='client_records_staff_insert') then
    create policy client_records_staff_insert on storage.objects for insert to authenticated
      with check (bucket_id='client-records' and (public.is_current_user_admin() or public.finance_has_role(array['admin','finance','reception'])));
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='client_records_staff_delete') then
    create policy client_records_staff_delete on storage.objects for delete to authenticated
      using (bucket_id='client-records' and (public.is_current_user_admin() or public.finance_has_role(array['admin','finance','reception'])));
  end if;
end $$;

create or replace function public.link_appointment_client_by_contact()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_id uuid;
  v_count integer;
  v_phone text;
begin
  if new.client_id is not null then return new; end if;
  v_phone := regexp_replace(coalesce(new.patient_phone,''),'\\D','','g');
  if v_phone <> '' then
    select min(c.id), count(*) into v_id, v_count
    from public.clients c
    where c.is_active=true and regexp_replace(coalesce(c.whatsapp,''),'\\D','','g')=v_phone;
    if v_count=1 then new.client_id:=v_id; return new; end if;
  end if;
  if nullif(trim(coalesce(new.patient_name,'')),'') is not null then
    select min(c.id), count(*) into v_id, v_count
    from public.clients c
    where c.is_active=true and lower(trim(c.name))=lower(trim(new.patient_name));
    if v_count=1 then new.client_id:=v_id; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_link_client_by_contact on public.appointments;
create trigger appointments_link_client_by_contact
before insert or update of patient_name,patient_phone,client_id on public.appointments
for each row execute function public.link_appointment_client_by_contact();
