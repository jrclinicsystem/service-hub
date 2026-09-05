drop policy if exists financial_access_read_own on public.financial_access;
create policy financial_access_read_own
on public.financial_access
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.finance_has_role(array['admin'])
);

drop policy if exists financial_entries_professional_own on public.financial_entries;
create policy financial_entries_professional_own
on public.financial_entries
for select
to authenticated
using (
  public.finance_has_role(array['professional'])
  and professional_id = (
    select fa.professional_id
    from public.financial_access fa
    where fa.user_id = (select auth.uid())
      and fa.role = 'professional'
      and fa.is_active = true
    limit 1
  )
);

drop policy if exists professional_commissions_own on public.professional_commissions;
create policy professional_commissions_own
on public.professional_commissions
for select
to authenticated
using (
  public.finance_has_role(array['professional'])
  and professional_id = (
    select fa.professional_id
    from public.financial_access fa
    where fa.user_id = (select auth.uid())
      and fa.role = 'professional'
      and fa.is_active = true
    limit 1
  )
);
