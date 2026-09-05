create index if not exists accounts_payable_category_id_idx
  on public.accounts_payable(category_id);
create index if not exists accounts_payable_cost_center_id_idx
  on public.accounts_payable(cost_center_id);
create index if not exists accounts_payable_payment_method_id_idx
  on public.accounts_payable(payment_method_id);
create index if not exists accounts_receivable_payment_method_id_idx
  on public.accounts_receivable(payment_method_id);
create index if not exists cash_movements_payment_method_id_idx
  on public.cash_movements(payment_method_id);
create index if not exists financial_expenses_category_id_idx
  on public.financial_expenses(category_id);
create index if not exists financial_expenses_cost_center_id_idx
  on public.financial_expenses(cost_center_id);
create index if not exists financial_expenses_payment_method_id_idx
  on public.financial_expenses(payment_method_id);
create index if not exists payment_method_fees_payment_method_id_idx
  on public.payment_method_fees(payment_method_id);
create index if not exists service_cost_centers_cost_center_id_idx
  on public.service_cost_centers(cost_center_id);
