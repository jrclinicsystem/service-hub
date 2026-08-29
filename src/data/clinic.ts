export type Category = {
  id: string;
  name: string;
  description: string;
};

export type Service = {
  slug: string;
  name: string;
  categoryId: string;
  professional: string;
  professionalRole: string;
  durationMin: number;
  price: number;
  rating: number;
  reviewsCount: number;
  summary: string;
  description: string;
  includes: string[];
  preparation: string[];
  reviews: { author: string; when: string; text: string; rating: number }[];
};

export const categories: Category[] = [
  {
    id: "clinica-geral",
    name: "Clínica Geral",
    description: "Avaliações de rotina, check-ups e acompanhamento contínuo.",
  },
  {
    id: "nutricao",
    name: "Nutrição",
    description: "Planos alimentares individualizados e reavaliações.",
  },
  {
    id: "psicologia",
    name: "Psicologia",
    description: "Psicoterapia individual, presencial ou online.",
  },
  {
    id: "fisioterapia",
    name: "Fisioterapia",
    description: "Reabilitação, prevenção e performance.",
  },
  {
    id: "exames",
    name: "Exames",
    description: "Coletas e exames de imagem com laudo rápido.",
  },
];

export const services: Service[] = [
  {
    slug: "consulta-de-rotina",
    name: "Consulta de Rotina",
    categoryId: "clinica-geral",
    professional: "Dra. Helena Costa",
    professionalRole: "Clínica Geral · CRM 12.345",
    durationMin: 45,
    price: 280,
    rating: 4.9,
    reviewsCount: 128,
    summary: "Avaliação clínica completa com plano de acompanhamento escrito.",
    description:
      "Um encontro de 45 minutos para revisar seu histórico, avaliar seu estado de saúde atual e construir um plano de acompanhamento claro. Ideal para check-ups anuais e ajustes de tratamento.",
    includes: [
      "Anamnese e exame físico completos",
      "Solicitação de exames quando necessário",
      "Plano de acompanhamento por escrito",
      "Retorno de 15 minutos em até 30 dias",
    ],
    preparation: [
      "Traga exames anteriores dos últimos 12 meses",
      "Liste medicamentos e suplementos em uso",
    ],
    reviews: [
      {
        author: "Ana B.",
        when: "há 2 semanas",
        text: "Atenciosa do início ao fim. Saí com um plano claro do que fazer.",
        rating: 5,
      },
      {
        author: "Marcos V.",
        when: "há 1 mês",
        text: "Pontualidade impecável e explicações muito didáticas.",
        rating: 5,
      },
    ],
  },
  {
    slug: "teleconsulta",
    name: "Teleconsulta",
    categoryId: "clinica-geral",
    professional: "Dra. Paola Reis",
    professionalRole: "Clínica Geral · CRM 22.981",
    durationMin: 30,
    price: 180,
    rating: 4.8,
    reviewsCount: 74,
    summary: "Atendimento remoto para dúvidas, receitas e segunda opinião.",
    description:
      "Consulta por vídeo de 30 minutos para questões pontuais, renovação de receitas e orientação sobre resultados de exames, sem precisar sair de casa.",
    includes: [
      "Videochamada segura de 30 minutos",
      "Receita digital assinada",
      "Resumo do atendimento por e-mail",
    ],
    preparation: [
      "Tenha os exames em formato digital à mão",
      "Escolha um ambiente silencioso e bem iluminado",
    ],
    reviews: [
      {
        author: "Júlia M.",
        when: "há 5 dias",
        text: "Resolvi tudo em meia hora, sem deslocamento. Excelente.",
        rating: 5,
      },
    ],
  },
  {
    slug: "nutricao-estruturada",
    name: "Nutrição Estruturada",
    categoryId: "nutricao",
    professional: "Dra. Marina Lopes",
    professionalRole: "Nutrição Clínica · CRN 8.112",
    durationMin: 60,
    price: 320,
    rating: 4.9,
    reviewsCount: 96,
    summary: "Plano alimentar completo com metas mensais de progresso.",
    description:
      "Primeira consulta de nutrição com avaliação antropométrica, análise de rotina alimentar e construção de um plano realista, ajustado ao seu dia a dia.",
    includes: [
      "Bioimpedância e medidas corporais",
      "Plano alimentar de 4 semanas",
      "Lista de compras e substituições",
      "Canal de dúvidas por 30 dias",
    ],
    preparation: [
      "Registre o que comeu nos últimos 3 dias",
      "Evite treinos intensos nas 2 horas anteriores",
    ],
    reviews: [
      {
        author: "Renata S.",
        when: "há 3 semanas",
        text: "Plano possível de seguir de verdade, sem dietas impossíveis.",
        rating: 5,
      },
    ],
  },
  {
    slug: "reavaliacao-nutricional",
    name: "Reavaliação Nutricional",
    categoryId: "nutricao",
    professional: "Dra. Marina Lopes",
    professionalRole: "Nutrição Clínica · CRN 8.112",
    durationMin: 30,
    price: 150,
    rating: 4.7,
    reviewsCount: 51,
    summary: "Check-in rápido para ajustar metas e conferir evolução.",
    description:
      "Consulta de retorno para revisar aderência, atualizar medidas e recalibrar o plano alimentar conforme sua fase atual.",
    includes: ["Atualização de medidas", "Ajuste do plano vigente", "Novas metas para 30 dias"],
    preparation: ["Traga o plano atual", "Anote dificuldades da última fase"],
    reviews: [
      {
        author: "Diego P.",
        when: "há 1 semana",
        text: "Objetiva e prática. Saí com ajustes claros.",
        rating: 5,
      },
    ],
  },
  {
    slug: "psicoterapia-individual",
    name: "Psicoterapia Individual",
    categoryId: "psicologia",
    professional: "Dr. Rafael Nunes",
    professionalRole: "Psicologia Clínica · CRP 06/78.220",
    durationMin: 50,
    price: 350,
    rating: 5,
    reviewsCount: 62,
    summary: "Sessões terapêuticas presenciais ou online, sem julgamentos.",
    description:
      "Atendimento em abordagem cognitivo-comportamental, com foco em ansiedade, estresse ocupacional e transições de vida. Frequência semanal recomendada.",
    includes: ["Sessão de 50 minutos", "Plano terapêutico compartilhado", "Materiais de apoio"],
    preparation: ["Reserve 10 minutos antes da sessão para se acomodar"],
    reviews: [
      {
        author: "Camila R.",
        when: "há 2 meses",
        text: "Espaço seguro e acolhedor. Mudou a minha rotina.",
        rating: 5,
      },
    ],
  },
  {
    slug: "fisioterapia-ortopedica",
    name: "Fisioterapia Ortopédica",
    categoryId: "fisioterapia",
    professional: "Dr. Caio Ferraz",
    professionalRole: "Fisioterapia · CREFITO 91.204",
    durationMin: 40,
    price: 260,
    rating: 4.8,
    reviewsCount: 88,
    summary: "Reabilitação e prevenção com protocolos personalizados.",
    description:
      "Sessão de fisioterapia com terapia manual, exercícios terapêuticos e orientação domiciliar para dores articulares e recuperação pós-lesão.",
    includes: [
      "Avaliação funcional inicial",
      "Terapia manual e exercícios guiados",
      "Programa domiciliar em vídeo",
    ],
    preparation: ["Use roupas confortáveis", "Traga laudos de imagem, se houver"],
    reviews: [
      {
        author: "Paulo H.",
        when: "há 3 semanas",
        text: "Dor no ombro reduziu bastante em quatro sessões.",
        rating: 5,
      },
    ],
  },
  {
    slug: "check-up-laboratorial",
    name: "Check-up Laboratorial",
    categoryId: "exames",
    professional: "Equipe de Coleta JR",
    professionalRole: "Laboratório interno",
    durationMin: 20,
    price: 420,
    rating: 4.6,
    reviewsCount: 143,
    summary: "Painel completo de sangue com laudo em até 48 horas.",
    description:
      "Coleta única com painel metabólico, hemograma, perfil lipídico, tireoide e vitaminas. Resultado disponível no portal do paciente.",
    includes: ["Coleta em jejum", "Painel de 18 marcadores", "Laudo digital em até 48h"],
    preparation: ["Jejum de 8 horas", "Hidrate-se normalmente com água"],
    reviews: [
      {
        author: "Fernanda L.",
        when: "há 4 dias",
        text: "Coleta rápida e resultado chegou antes do prazo.",
        rating: 5,
      },
    ],
  },
  {
    slug: "ultrassonografia",
    name: "Ultrassonografia",
    categoryId: "exames",
    professional: "Dr. Ivan Moraes",
    professionalRole: "Radiologia · CRM 30.554",
    durationMin: 30,
    price: 380,
    rating: 4.7,
    reviewsCount: 67,
    summary: "Exame de imagem com laudo assinado no mesmo dia.",
    description:
      "Ultrassonografia abdominal, pélvica ou de partes moles, realizada com equipamento de alta resolução e laudo emitido no mesmo dia.",
    includes: ["Exame de 30 minutos", "Laudo no mesmo dia", "Imagens no portal do paciente"],
    preparation: ["Siga a orientação de jejum enviada por e-mail"],
    reviews: [
      {
        author: "Sergio A.",
        when: "há 2 semanas",
        text: "Atendimento rápido e explicação clara durante o exame.",
        rating: 5,
      },
    ],
  },
];

export const timeSlots = ["08:00", "09:00", "10:30", "13:00", "14:30", "16:00", "17:30", "18:30"];

export const unavailableSlots = ["10:30", "16:00"];

export type Appointment = {
  id: string;
  patient: string;
  serviceSlug: string;
  date: string;
  time: string;
  status: "confirmado" | "pendente" | "cancelado";
};

export const appointments: Appointment[] = [
  {
    id: "AG-2041",
    patient: "Ana Beatriz Ramos",
    serviceSlug: "consulta-de-rotina",
    date: "08 set",
    time: "09:00",
    status: "confirmado",
  },
  {
    id: "AG-2042",
    patient: "Marcos Vinícius Alves",
    serviceSlug: "nutricao-estruturada",
    date: "08 set",
    time: "10:30",
    status: "confirmado",
  },
  {
    id: "AG-2043",
    patient: "Camila Ribeiro",
    serviceSlug: "psicoterapia-individual",
    date: "08 set",
    time: "14:30",
    status: "pendente",
  },
  {
    id: "AG-2044",
    patient: "Paulo Henrique Dias",
    serviceSlug: "fisioterapia-ortopedica",
    date: "09 set",
    time: "08:00",
    status: "confirmado",
  },
  {
    id: "AG-2045",
    patient: "Fernanda Lopes",
    serviceSlug: "check-up-laboratorial",
    date: "09 set",
    time: "13:00",
    status: "cancelado",
  },
  {
    id: "AG-2046",
    patient: "Sergio Andrade",
    serviceSlug: "ultrassonografia",
    date: "10 set",
    time: "17:30",
    status: "pendente",
  },
];

export const weekLoad = [
  { day: "Seg", agendamentos: 22 },
  { day: "Ter", agendamentos: 28 },
  { day: "Qua", agendamentos: 24 },
  { day: "Qui", agendamentos: 31 },
  { day: "Sex", agendamentos: 27 },
  { day: "Sáb", agendamentos: 14 },
];

export const formatPrice = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const getService = (slug: string) => services.find((s) => s.slug === slug);

export const getCategory = (id: string) => categories.find((c) => c.id === id);
