create index if not exists sellers_created_by_idx on public.sellers(created_by);
create index if not exists appointment_sellers_assigned_by_idx on public.appointment_sellers(assigned_by);
create index if not exists seller_commissions_created_by_idx on public.seller_commissions(created_by);
