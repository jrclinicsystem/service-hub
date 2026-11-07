export type Client = { id: string; name: string; whatsapp: string; is_active?: boolean };
export type Session = { status: string; completed_at?: string | null; service_name_snapshot?: string | null; service?: { name?: string | null } | null };
export type Appointment = {
  id: string; client_id: string | null; status: string; attended_at?: string | null;
  scheduled_date: string; service?: { name?: string | null } | null;
  appointment_sessions?: Session[] | null; appointment_services?: Session[] | null;
};
export type Contact = { id: string; client_id: string; contacted_at: string; last_procedure_at: string };
export type ReactivationClient = {
  clientId: string; name: string; whatsapp: string; lastProcedureAt: string;
  lastProcedure: string; daysInactive: number; contactsCount: number;
  lastContactAt: string | null; isReactivated: boolean;
};
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit",
});
function dayNumber(value: string | Date): number {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return NaN;
  const parts = dateFormatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Math.floor(Date.UTC(get("year"), get("month") - 1, get("day")) / 86400000);
}
export function inactivityDays(from: string, now: Date) {
  return dayNumber(now) - dayNumber(from);
}
export function normalizeClientWhatsApp(value: string): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  const phone = digits.length === 10 || digits.length === 11 ? "55" + digits : digits;
  return phone.length >= 12 && phone.length <= 15 ? phone : null;
}
export function buildReactivationRows(
  clients: Client[], appointments: Appointment[], contacts: Contact[], now: Date = new Date(),
): ReactivationClient[] {
  type Event = { at: string; procedure: string };
  const eventsByClient = new Map<string, Event[]>();
  const add = (id: string, at: string | null | undefined, procedure?: string | null) => {
    if (!at || !Number.isFinite(new Date(at).getTime()) || dayNumber(at) > dayNumber(now)) return;
    const list = eventsByClient.get(id) ?? [];
    list.push({ at, procedure: procedure?.trim() || "Procedimento não informado" });
    eventsByClient.set(id, list);
  };
  for (const a of appointments) {
    if (!a.client_id || a.status === "cancelado") continue;
    if (a.status === "atendido") add(
      a.client_id,
      a.attended_at || (a.scheduled_date ? a.scheduled_date + "T12:00:00-03:00" : null),
      a.service?.name,
    );
    for (const s of a.appointment_sessions ?? []) {
      if (s.status === "completed") add(a.client_id, s.completed_at, s.service_name_snapshot || a.service?.name);
    }
    for (const s of a.appointment_services ?? []) {
      if (s.status === "completed") add(a.client_id, s.completed_at, s.service?.name || a.service?.name);
    }
  }
  const contactsByClient = new Map<string, Contact[]>();
  for (const contact of contacts) {
    const list = contactsByClient.get(contact.client_id) ?? [];
    list.push(contact);
    contactsByClient.set(contact.client_id, list);
  }
  const result: ReactivationClient[] = [];
  for (const client of clients) {
    if (client.is_active === false) continue;
    const events = (eventsByClient.get(client.id) ?? []).sort(
      (a, b) => Date.parse(a.at) - Date.parse(b.at),
    );
    if (!events.length) continue;
    const last = events[events.length - 1];
    const days = inactivityDays(last.at, now);
    if (!Number.isFinite(days) || days < 0) continue;
    let lastReturn: string | null = null;
    for (let i = 1; i < events.length; i++) {
      if (inactivityDays(events[i - 1].at, new Date(events[i].at)) > 30) lastReturn = events[i].at;
    }
    const contactHistory = (contactsByClient.get(client.id) ?? []).sort(
      (a, b) => Date.parse(b.contacted_at) - Date.parse(a.contacted_at),
    );
    const afterContact = contactHistory.some((c) =>
      inactivityDays(c.last_procedure_at, new Date(c.contacted_at)) > 30 &&
      events.some((e) => Date.parse(e.at) > Date.parse(c.contacted_at)),
    );
    result.push({
      clientId: client.id, name: client.name, whatsapp: client.whatsapp,
      lastProcedureAt: last.at, lastProcedure: last.procedure, daysInactive: days,
      contactsCount: contactHistory.length,
      lastContactAt: contactHistory[0]?.contacted_at ?? null,
      isReactivated: days <= 30 && (
        (lastReturn !== null && inactivityDays(lastReturn, now) <= 30) || afterContact
      ),
    });
  }
  return result;
}
