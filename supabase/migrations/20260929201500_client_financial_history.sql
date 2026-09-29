-- Read-only, access-controlled financial history attached to a client record.
-- Paid entries are grouped by financial entry (including split payments), while
-- outstanding receivables are separate. Zero-cost package visits never count twice.
-- Do not infer client ownership from a name: use explicit client, appointment or budget IDs.
CREATE OR REPLACE FUNCTION public.get_client_financial_history(_client_id uuid)
RETURNS TABLE(
  record_id uuid,
  record_kind text,
  status text,
  description text,
  procedure_at timestamptz,
  payment_at timestamptz,
  payment_method text,
  payment_breakdown jsonb,
  amount numeric,
  source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_current_user_admin() OR
    public.finance_has_role(ARRAY['admin','finance','reception'])
  ) THEN
    RAISE EXCEPTION 'Acesso financeiro insuficiente.' USING errcode = '42501';
  END IF;

  IF _client_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = _client_id
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado.' USING errcode = '22023';
  END IF;

  RETURN QUERY
  WITH linked_entries AS (
    SELECT fe.*
    FROM public.financial_entries fe
    WHERE fe.status = 'received'
      AND fe.charged_amount > 0
      AND (fe.client_id IS NULL OR fe.client_id = _client_id)
      AND (
        fe.client_id = _client_id
        OR EXISTS (
          SELECT 1 FROM public.appointments a
          WHERE a.id = fe.appointment_id AND a.client_id = _client_id
        )
        OR EXISTS (
          SELECT 1 FROM public.client_budgets b
          WHERE b.financial_entry_id = fe.id AND b.client_id = _client_id
        )
      )
  ),
  splits AS (
    SELECT fp.financial_entry_id,
      jsonb_agg(
        jsonb_build_object(
          'method', COALESCE(pm.name,'Não informado'),
          'amount', fp.amount,
          'installments', fp.installments
        ) ORDER BY fp.created_at, fp.id
      ) AS details,
      string_agg(DISTINCT COALESCE(pm.name,'Não informado'), ' + ') AS methods
    FROM public.financial_entry_payments fp
    LEFT JOIN public.payment_methods pm ON pm.id = fp.payment_method_id
    WHERE EXISTS (SELECT 1 FROM linked_entries e WHERE e.id = fp.financial_entry_id)
    GROUP BY fp.financial_entry_id
  ),
  paid_rows AS (
    SELECT fe.id AS id, 'paid'::text AS kind, 'received'::text AS state,
      COALESCE(NULLIF(b.title,''),NULLIF(fe.service_name_snapshot,''),'Atendimento') AS label,
      fe.occurred_at AS procedure_time,
      COALESCE(fe.received_at,fe.occurred_at) AS paid_time,
      COALESCE(s.methods,pm.name,'Não informado') AS method_name,
      COALESCE(s.details,jsonb_build_array(jsonb_build_object(
        'method',COALESCE(pm.name,'Não informado'),
        'amount',fe.charged_amount,'installments',fe.installments
      ))) AS methods_detail,
      fe.charged_amount AS value,
      fe.source AS origin
    FROM linked_entries fe
    LEFT JOIN public.payment_methods pm ON pm.id = fe.payment_method_id
    LEFT JOIN splits s ON s.financial_entry_id = fe.id
    LEFT JOIN LATERAL (
      SELECT b.title FROM public.client_budgets b
      WHERE b.financial_entry_id = fe.id AND b.client_id = _client_id
      ORDER BY b.created_at DESC,b.id DESC LIMIT 1
    ) b ON TRUE
  ),
  pending_receivables AS (
    SELECT ar.id AS id, 'receivable'::text AS kind, 'pending'::text AS state,
      COALESCE(NULLIF(ar.service_name_snapshot,''),'Fiado / conta a receber') AS label,
      COALESCE(fe.occurred_at,ar.created_at) AS procedure_time,
      NULL::timestamptz AS paid_time,
      COALESCE(pm.name,'A definir') AS method_name,
      '[]'::jsonb AS methods_detail,
      GREATEST(ar.original_amount - COALESCE(ar.amount_received,0),0) AS value,
      'accounts_receivable'::text AS origin
    FROM public.accounts_receivable ar
    LEFT JOIN public.payment_methods pm ON pm.id = ar.payment_method_id
    LEFT JOIN LATERAL (
      SELECT fe.occurred_at FROM public.financial_entries fe
      WHERE fe.appointment_id = ar.appointment_id AND fe.status <> 'cancelled'
      ORDER BY fe.created_at DESC LIMIT 1
    ) fe ON TRUE
    WHERE ar.status = 'pending'
      AND (ar.client_id IS NULL OR ar.client_id = _client_id)
      AND (
        ar.client_id = _client_id
        OR EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = ar.appointment_id AND a.client_id = _client_id)
      )
      AND ar.original_amount > COALESCE(ar.amount_received,0)
  ),
  pending_unbilled_entries AS (
    SELECT fe.id AS id, 'pending_entry'::text AS kind, 'pending'::text AS state,
      COALESCE(NULLIF(fe.service_name_snapshot,''),'Atendimento a receber') AS label,
      fe.occurred_at AS procedure_time,
      NULL::timestamptz AS paid_time,
      COALESCE(pm.name,'A definir') AS method_name,
      '[]'::jsonb AS methods_detail,
      fe.charged_amount AS value,
      fe.source AS origin
    FROM public.financial_entries fe
    LEFT JOIN public.payment_methods pm ON pm.id = fe.payment_method_id
    WHERE fe.status = 'pending'
      AND fe.charged_amount > 0
      AND (fe.client_id IS NULL OR fe.client_id = _client_id)
      AND (
        fe.client_id = _client_id
        OR EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = fe.appointment_id AND a.client_id = _client_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.accounts_receivable ar
        WHERE ar.status = 'pending'
          AND ar.appointment_id = fe.appointment_id
          AND (ar.client_id IS NULL OR ar.client_id = _client_id)
      )
  )
  SELECT rows.id,rows.kind,rows.state,rows.label,rows.procedure_time,
    rows.paid_time,rows.method_name,rows.methods_detail,rows.value,rows.origin
  FROM (
    SELECT * FROM paid_rows
    UNION ALL SELECT * FROM pending_receivables
    UNION ALL SELECT * FROM pending_unbilled_entries
  ) rows
  ORDER BY rows.paid_time DESC NULLS LAST,rows.procedure_time DESC,rows.id DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_client_financial_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_financial_history(uuid) TO authenticated;
