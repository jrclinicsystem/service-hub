-- Auditable, read-only explanation of cash totals, including split payments.
-- Only existing finance operators can inspect a session. No historical data changes.
CREATE OR REPLACE FUNCTION public.get_cash_session_reconciliation(_session_id uuid)
RETURNS TABLE (
  movement_id uuid,
  movement_type text,
  amount numeric,
  occurred_at timestamptz,
  payment_method_code text,
  payment_method_name text,
  description text,
  patient_name text,
  service_name text,
  financial_source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.finance_has_role(ARRAY['admin','finance','reception']) THEN
    RAISE EXCEPTION 'Acesso financeiro insuficiente.' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cash_sessions cs WHERE cs.id = _session_id) THEN
    RAISE EXCEPTION 'Caixa não encontrado.' USING errcode = '22023';
  END IF;

  RETURN QUERY
  SELECT cm.id, cm.movement_type, cm.amount, cm.occurred_at,
         pm.code, pm.name, cm.description,
         fe.patient_name_snapshot, fe.service_name_snapshot, fe.source
    FROM public.cash_movements cm
    LEFT JOIN public.payment_methods pm ON pm.id = cm.payment_method_id
    LEFT JOIN public.financial_entries fe ON fe.id = cm.financial_entry_id
   WHERE cm.cash_session_id = _session_id
   ORDER BY cm.occurred_at DESC, cm.created_at DESC, cm.id DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_cash_session_reconciliation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_session_reconciliation(uuid) TO authenticated;
