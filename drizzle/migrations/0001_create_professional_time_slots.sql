CREATE TABLE IF NOT EXISTS public.professional_time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  slot text NOT NULL,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, slot)
);

GRANT SELECT ON public.professional_time_slots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_time_slots TO authenticated;
GRANT ALL ON public.professional_time_slots TO service_role;

ALTER TABLE public.professional_time_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time slots public read" ON public.professional_time_slots
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "time slots admin manage" ON public.professional_time_slots
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS professional_time_slots_professional_idx ON public.professional_time_slots (professional_id, sort_order);