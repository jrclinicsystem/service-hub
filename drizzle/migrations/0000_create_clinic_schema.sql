-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- CATEGORIES
CREATE TABLE public.categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are public" ON public.categories
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage categories" ON public.categories
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- SERVICES
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  category_id text NOT NULL REFERENCES public.categories(id),
  professional text NOT NULL DEFAULT '',
  professional_role text NOT NULL DEFAULT '',
  duration_min integer NOT NULL DEFAULT 30,
  price numeric(10,2) NOT NULL DEFAULT 0,
  rating numeric(2,1) NOT NULL DEFAULT 5,
  reviews_count integer NOT NULL DEFAULT 0,
  summary text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  includes text[] NOT NULL DEFAULT '{}',
  preparation text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.services TO anon, authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active services are public" ON public.services
  FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "Admins read all services" ON public.services
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage services" ON public.services
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- REVIEWS
CREATE TABLE public.service_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  author text NOT NULL,
  when_label text NOT NULL DEFAULT '',
  body text NOT NULL,
  rating integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.service_reviews TO anon, authenticated;
GRANT ALL ON public.service_reviews TO service_role;
ALTER TABLE public.service_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are public" ON public.service_reviews
  FOR SELECT TO anon, authenticated USING (true);

-- TIME SLOTS
CREATE TABLE public.time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot text NOT NULL UNIQUE,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

GRANT SELECT ON public.time_slots TO anon, authenticated;
GRANT ALL ON public.time_slots TO service_role;
ALTER TABLE public.time_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Time slots are public" ON public.time_slots
  FOR SELECT TO anon, authenticated USING (true);

-- APPOINTMENTS
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  service_id uuid NOT NULL REFERENCES public.services(id),
  patient_name text NOT NULL,
  patient_email text NOT NULL,
  patient_phone text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  scheduled_date date NOT NULL,
  scheduled_time text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own appointments" ON public.appointments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own appointments" ON public.appointments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users cancel own appointments" ON public.appointments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read all appointments" ON public.appointments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage appointments" ON public.appointments
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX appointments_date_idx ON public.appointments (scheduled_date);
CREATE INDEX services_category_idx ON public.services (category_id);

-- SEED
INSERT INTO public.categories (id, name, description, sort_order) VALUES
('clinica-geral', 'Clínica Geral', 'Avaliações de rotina, check-ups e acompanhamento contínuo.', 1),
('nutricao', 'Nutrição', 'Planos alimentares individualizados e reavaliações.', 2),
('psicologia', 'Psicologia', 'Psicoterapia individual, presencial ou online.', 3),
('fisioterapia', 'Fisioterapia', 'Reabilitação, prevenção e performance.', 4),
('exames', 'Exames', 'Coletas e exames de imagem com laudo rápido.', 5);

INSERT INTO public.time_slots (slot, is_available, sort_order) VALUES
('08:00', true, 1), ('09:00', true, 2), ('10:30', false, 3), ('13:00', true, 4),
('14:30', true, 5), ('16:00', false, 6), ('17:30', true, 7), ('18:30', true, 8);

INSERT INTO public.services (slug, name, category_id, professional, professional_role, duration_min, price, rating, reviews_count, summary, description, includes, preparation) VALUES
('consulta-de-rotina', 'Consulta de Rotina', 'clinica-geral', 'Dra. Helena Costa', 'Clínica Geral · CRM 12.345', 45, 280, 4.9, 128,
 'Avaliação clínica completa com plano de acompanhamento escrito.',
 'Um encontro de 45 minutos para revisar seu histórico, avaliar seu estado de saúde atual e construir um plano de acompanhamento claro. Ideal para check-ups anuais e ajustes de tratamento.',
 ARRAY['Anamnese e exame físico completos','Solicitação de exames quando necessário','Plano de acompanhamento por escrito','Retorno de 15 minutos em até 30 dias'],
 ARRAY['Traga exames anteriores dos últimos 12 meses','Liste medicamentos e suplementos em uso']),
('teleconsulta', 'Teleconsulta', 'clinica-geral', 'Dra. Paola Reis', 'Clínica Geral · CRM 22.981', 30, 180, 4.8, 74,
 'Atendimento remoto para dúvidas, receitas e segunda opinião.',
 'Consulta por vídeo de 30 minutos para questões pontuais, renovação de receitas e orientação sobre resultados de exames, sem precisar sair de casa.',
 ARRAY['Videochamada segura de 30 minutos','Receita digital assinada','Resumo do atendimento por e-mail'],
 ARRAY['Tenha os exames em formato digital à mão','Escolha um ambiente silencioso e bem iluminado']),
('nutricao-estruturada', 'Nutrição Estruturada', 'nutricao', 'Dra. Marina Lopes', 'Nutrição Clínica · CRN 8.112', 60, 320, 4.9, 96,
 'Plano alimentar completo com metas mensais de progresso.',
 'Primeira consulta de nutrição com avaliação antropométrica, análise de rotina alimentar e construção de um plano realista, ajustado ao seu dia a dia.',
 ARRAY['Bioimpedância e medidas corporais','Plano alimentar de 4 semanas','Lista de compras e substituições','Canal de dúvidas por 30 dias'],
 ARRAY['Registre o que comeu nos últimos 3 dias','Evite treinos intensos nas 2 horas anteriores']),
('reavaliacao-nutricional', 'Reavaliação Nutricional', 'nutricao', 'Dra. Marina Lopes', 'Nutrição Clínica · CRN 8.112', 30, 150, 4.7, 51,
 'Check-in rápido para ajustar metas e conferir evolução.',
 'Consulta de retorno para revisar aderência, atualizar medidas e recalibrar o plano alimentar conforme sua fase atual.',
 ARRAY['Atualização de medidas','Ajuste do plano vigente','Novas metas para 30 dias'],
 ARRAY['Traga o plano atual','Anote dificuldades da última fase']),
('psicoterapia-individual', 'Psicoterapia Individual', 'psicologia', 'Dr. Rafael Nunes', 'Psicologia Clínica · CRP 06/78.220', 50, 350, 5.0, 62,
 'Sessões terapêuticas presenciais ou online, sem julgamentos.',
 'Atendimento em abordagem cognitivo-comportamental, com foco em ansiedade, estresse ocupacional e transições de vida. Frequência semanal recomendada.',
 ARRAY['Sessão de 50 minutos','Plano terapêutico compartilhado','Materiais de apoio'],
 ARRAY['Reserve 10 minutos antes da sessão para se acomodar']),
('fisioterapia-ortopedica', 'Fisioterapia Ortopédica', 'fisioterapia', 'Dr. Caio Ferraz', 'Fisioterapia · CREFITO 91.204', 40, 260, 4.8, 88,
 'Reabilitação e prevenção com protocolos personalizados.',
 'Sessão de fisioterapia com terapia manual, exercícios terapêuticos e orientação domiciliar para dores articulares e recuperação pós-lesão.',
 ARRAY['Avaliação funcional inicial','Terapia manual e exercícios guiados','Programa domiciliar em vídeo'],
 ARRAY['Use roupas confortáveis','Traga laudos de imagem, se houver']),
('check-up-laboratorial', 'Check-up Laboratorial', 'exames', 'Equipe de Coleta JR', 'Laboratório interno', 20, 420, 4.6, 143,
 'Painel completo de sangue com laudo em até 48 horas.',
 'Coleta única com painel metabólico, hemograma, perfil lipídico, tireoide e vitaminas. Resultado disponível no portal do paciente.',
 ARRAY['Coleta em jejum','Painel de 18 marcadores','Laudo digital em até 48h'],
 ARRAY['Jejum de 8 horas','Hidrate-se normalmente com água']),
('ultrassonografia', 'Ultrassonografia', 'exames', 'Dr. Ivan Moraes', 'Radiologia · CRM 30.554', 30, 380, 4.7, 67,
 'Exame de imagem com laudo assinado no mesmo dia.',
 'Ultrassonografia abdominal, pélvica ou de partes moles, realizada com equipamento de alta resolução e laudo emitido no mesmo dia.',
 ARRAY['Exame de 30 minutos','Laudo no mesmo dia','Imagens no portal do paciente'],
 ARRAY['Siga a orientação de jejum enviada por e-mail']);

INSERT INTO public.service_reviews (service_id, author, when_label, body, rating)
SELECT s.id, v.author, v.when_label, v.body, v.rating
FROM (VALUES
  ('consulta-de-rotina', 'Ana B.', 'há 2 semanas', 'Atenciosa do início ao fim. Saí com um plano claro do que fazer.', 5),
  ('consulta-de-rotina', 'Marcos V.', 'há 1 mês', 'Pontualidade impecável e explicações muito didáticas.', 5),
  ('teleconsulta', 'Júlia M.', 'há 5 dias', 'Resolvi tudo em meia hora, sem deslocamento. Excelente.', 5),
  ('nutricao-estruturada', 'Renata S.', 'há 3 semanas', 'Plano possível de seguir de verdade, sem dietas impossíveis.', 5),
  ('reavaliacao-nutricional', 'Diego P.', 'há 1 semana', 'Objetiva e prática. Saí com ajustes claros.', 5),
  ('psicoterapia-individual', 'Camila R.', 'há 2 meses', 'Espaço seguro e acolhedor. Mudou a minha rotina.', 5),
  ('fisioterapia-ortopedica', 'Paulo H.', 'há 3 semanas', 'Dor no ombro reduziu bastante em quatro sessões.', 5),
  ('check-up-laboratorial', 'Fernanda L.', 'há 4 dias', 'Coleta rápida e resultado chegou antes do prazo.', 5),
  ('ultrassonografia', 'Sergio A.', 'há 2 semanas', 'Atendimento rápido e explicação clara durante o exame.', 5)
) AS v(slug, author, when_label, body, rating)
JOIN public.services s ON s.slug = v.slug;

INSERT INTO public.appointments (service_id, patient_name, patient_email, scheduled_date, scheduled_time, status)
SELECT s.id, v.patient_name, v.patient_email, v.d::date, v.t, v.status
FROM (VALUES
  ('consulta-de-rotina', 'Ana Beatriz Ramos', 'ana@exemplo.com', '2026-09-08', '09:00', 'confirmado'),
  ('nutricao-estruturada', 'Marcos Vinícius Alves', 'marcos@exemplo.com', '2026-09-08', '10:30', 'confirmado'),
  ('psicoterapia-individual', 'Camila Ribeiro', 'camila@exemplo.com', '2026-09-08', '14:30', 'pendente'),
  ('fisioterapia-ortopedica', 'Paulo Henrique Dias', 'paulo@exemplo.com', '2026-09-09', '08:00', 'confirmado'),
  ('check-up-laboratorial', 'Fernanda Lopes', 'fernanda@exemplo.com', '2026-09-09', '13:00', 'cancelado'),
  ('ultrassonografia', 'Sergio Andrade', 'sergio@exemplo.com', '2026-09-10', '17:30', 'pendente')
) AS v(slug, patient_name, patient_email, d, t, status)
JOIN public.services s ON s.slug = v.slug;