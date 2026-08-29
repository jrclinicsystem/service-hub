export type Category = {
  id: string;
  name: string;
  description: string;
  sort_order: number;
};

export type Service = {
  id: string;
  slug: string;
  name: string;
  category_id: string;
  professional: string;
  professional_role: string;
  duration_min: number;
  price: number;
  rating: number;
  reviews_count: number;
  summary: string;
  description: string;
  includes: string[];
  preparation: string[];
};

export type ServiceReview = {
  id: string;
  author: string;
  when_label: string;
  body: string;
  rating: number;
};

export type TimeSlot = {
  slot: string;
  is_available: boolean;
};

export type AppointmentRow = {
  id: string;
  patient_name: string;
  patient_email: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  service: { name: string; price: number } | null;
};

export const formatPrice = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

export const statusVariant = {
  confirmado: "default",
  pendente: "secondary",
  cancelado: "destructive",
} as const;

export type AppointmentStatus = keyof typeof statusVariant;
