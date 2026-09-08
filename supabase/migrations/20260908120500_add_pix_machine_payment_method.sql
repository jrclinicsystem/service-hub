insert into public.payment_methods (code, name, is_card, is_cash, is_active, sort_order)
values ('pix_machine', 'Pix da maquininha', false, false, true, 25)
on conflict (code) do update
set name = excluded.name,
    is_card = excluded.is_card,
    is_cash = excluded.is_cash,
    is_active = true,
    sort_order = excluded.sort_order,
    updated_at = now();
