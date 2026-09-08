DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_methods'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.payment_methods (code, name, is_card, is_cash, is_active, sort_order)
      VALUES ('pix_machine', 'Pix da maquininha', false, false, true, 25)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          is_card = EXCLUDED.is_card,
          is_cash = EXCLUDED.is_cash,
          is_active = true,
          sort_order = EXCLUDED.sort_order
    $sql$;
  END IF;
END
$$;