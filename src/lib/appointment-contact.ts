export type AppointmentContactData = {
  patient_name?: string | null;
  patient_phone?: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  service_price_snapshot?: number | string | null;
  service?: { name?: string | null; price?: number | string | null } | null;
  professional?: { name?: string | null } | null;
};

function localDateFromIso(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function daysUntilAppointment(value?: string | null) {
  const target = localDateFromIso(value);
  if (!target) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function appointmentProximity(value?: string | null) {
  const days = daysUntilAppointment(value);
  if (days === null || days < 0) return "past" as const;
  if (days <= 1) return "urgent" as const;
  if (days <= 3) return "soon" as const;
  return "normal" as const;
}

export function normalizeWhatsAppPhone(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatAppointmentDate(value?: string | null) {
  const date = localDateFromIso(value);
  if (!date) return "data não informada";
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date);
  const dateLabel = new Intl.DateTimeFormat("pt-BR").format(date);
  return `${weekday}, ${dateLabel}`;
}

export function appointmentWhatsAppMessage(appointment: AppointmentContactData, kind: "confirmation" | "reminder") {
  const total = Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0);
  const lines = kind === "reminder"
    ? [
        `Olá, ${appointment.patient_name ?? "cliente"}! Tudo bem? 😊`,
        "Passando para lembrar que seu atendimento na JR Clinic é amanhã.",
      ]
    : [
        `Olá, ${appointment.patient_name ?? "cliente"}! Tudo bem? 😊`,
        "Estamos entrando em contato para confirmar os dados do seu agendamento na JR Clinic:",
      ];

  lines.push(
    "",
    `📅 Data: ${formatAppointmentDate(appointment.scheduled_date)}`,
    `⏰ Horário: ${appointment.scheduled_time ?? "não informado"}`,
    `👩‍⚕️ Profissional: ${appointment.professional?.name ?? "JR Clinic"}`,
    `✨ Serviço: ${appointment.service?.name ?? "Atendimento"}`,
    `💰 Valor: ${formatMoney(Number.isFinite(total) ? total : 0)}`,
    "",
    kind === "reminder"
      ? "Pode confirmar, por favor, se está tudo certo para o seu atendimento? 💚"
      : "Pode confirmar por aqui se está tudo certo com o seu horário? 💚",
  );

  return lines.join("\n");
}

export function appointmentWhatsAppUrl(appointment: AppointmentContactData, kind: "confirmation" | "reminder") {
  const phone = normalizeWhatsAppPhone(appointment.patient_phone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(appointmentWhatsAppMessage(appointment, kind))}`;
}
