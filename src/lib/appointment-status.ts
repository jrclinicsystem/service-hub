export type ScheduleChange = {
  changed_at: string;
  from_date: string;
  from_time: string;
  to_date: string;
  to_time: string;
};

type AppointmentStatus = { status: string; schedule_history?: unknown };

// Keep current screens usable while the additive migration is awaiting rollout.
// Only a missing history column is recoverable; authorization/network errors
// must still be surfaced by the caller.
export async function withAppointmentHistory(
  read: (historyColumn: string) => PromiseLike<{ data: any; error: any }>,
): Promise<{ data: any; error: any }> {
  const result = await read(", schedule_history");
  if (
    ["42703", "PGRST204"].includes(result.error?.code) &&
    String(result.error?.message).includes("schedule_history")
  ) {
    return read("");
  }
  return result;
}

export function appointmentScheduleHistory(appointment: AppointmentStatus): ScheduleChange[] {
  if (!Array.isArray(appointment.schedule_history)) return [];
  return appointment.schedule_history.filter(
    (item): item is ScheduleChange =>
      item != null &&
      ["changed_at", "from_date", "from_time", "to_date", "to_time"].every(
        (key) => typeof item[key] === "string",
      ),
  );
}

// Remarcação é uma reserva ativa que aguarda nova confirmação. Mantemos o
// estado operacional existente para preservar pagamentos e respostas da equipe.
export function appointmentDisplayStatus(appointment: AppointmentStatus): string {
  return appointment.status === "pendente" && appointmentScheduleHistory(appointment).length > 0
    ? "remarcado"
    : appointment.status;
}

export function appointmentStatusLabel(appointment: AppointmentStatus): string {
  const labels: Record<string, string> = {
    pendente: "Pendente de confirmação",
    confirmado: "Confirmado",
    cancelado: "Cancelado",
    remarcado: "Remarcado",
    atendido: "Atendido",
    aguardando_pagamento: "Aguardando pagamento",
  };
  return labels[appointmentDisplayStatus(appointment)] ?? appointment.status;
}
