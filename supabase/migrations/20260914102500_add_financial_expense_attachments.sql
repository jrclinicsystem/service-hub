create table if not exists public.financial_expense_attachments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.financial_expenses(id) on delete cascade,
  file_path text not null unique,
  original_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists financial_expense_attachments_expense_idx
  on public.financial_expense_attachments(expense_id, created_at desc);

alter table public.financial_expense_attachments enable row level security;

drop policy if exists financial_expense_attachments_finance on public.financial_expense_attachments;
create policy financial_expense_attachments_finance
on public.financial_expense_attachments
for all
to authenticated
using (public.finance_has_role(array['admin','finance']))
with check (public.finance_has_role(array['admin','finance']));

grant select, insert, delete on public.financial_expense_attachments to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'finance-expense-attachments',
  'finance-expense-attachments',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Finance read expense attachments" on storage.objects;
create policy "Finance read expense attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'finance-expense-attachments'
  and public.finance_has_role(array['admin','finance'])
);

drop policy if exists "Finance upload expense attachments" on storage.objects;
create policy "Finance upload expense attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'finance-expense-attachments'
  and public.finance_has_role(array['admin','finance'])
);

drop policy if exists "Finance delete expense attachments" on storage.objects;
create policy "Finance delete expense attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'finance-expense-attachments'
  and public.finance_has_role(array['admin','finance'])
);
