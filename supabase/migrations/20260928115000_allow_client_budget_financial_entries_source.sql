-- Allow the existing record_client_budget_payment RPC to tag its financial
-- entry as a client budget. Keep the original source whitelist intact.
-- No existing payments or financial amounts are changed.
alter table public.financial_entries
  drop constraint financial_entries_source_check,
  add constraint financial_entries_source_check
    check (source in (
      'appointment',
      'manual',
      'accounts_receivable',
      'room_reservation',
      'client_budget'
    ));
