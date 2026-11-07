import { describe, expect, test } from "bun:test";
import { buildReactivationRows, inactivityDays, normalizeClientWhatsApp } from "../src/lib/client-reactivation";
import type { Appointment } from "../src/lib/client-reactivation";

const now = new Date("2026-11-07T15:00:00Z");
const clients = [{ id: "one", name: "Paciente Teste", whatsapp: "85999999999", is_active: true }];
function visit(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "a", client_id: "one", status: "atendido",
    attended_at: "2026-10-01T15:00:00Z", scheduled_date: "2026-10-01",
    service: { name: "Limpeza de pele" }, ...overrides,
  };
}
describe("reativação de clientes", () => {
  test("identifica a última visita concluída e ignora futuros agendamentos", () => {
    const result = buildReactivationRows(clients, [
      visit(), visit({ id: "b", status: "confirmado", attended_at: null, scheduled_date: "2026-11-10" }),
    ], [], now);
    expect(result[0].daysInactive).toBe(37);
    expect(result[0].lastProcedure).toBe("Limpeza de pele");
  });
  test("ignora cancelamentos e clientes sem conclusão", () => {
    expect(buildReactivationRows(clients, [visit({ status: "cancelado" })], [], now)).toEqual([]);
    expect(buildReactivationRows(clients, [], [], now)).toEqual([]);
  });
  test("considera sessões concluídas, não sessões agendadas", () => {
    const rows = buildReactivationRows(clients, [visit({
      status: "confirmado", attended_at: null,
      appointment_sessions: [
        { status: "completed", completed_at: "2026-11-02T12:00:00Z", service_name_snapshot: "Sessão" },
        { status: "pending", completed_at: null },
      ],
    })], [], now);
    expect(rows[0].daysInactive).toBe(5);
    expect(rows[0].lastProcedure).toBe("Sessão");
  });
  test("contato não altera atividade nem marca reativação sem nova visita", () => {
    const rows = buildReactivationRows(clients, [visit()], [{
      id: "c", client_id: "one", contacted_at: "2026-11-06T12:00:00Z",
      last_procedure_at: "2026-10-01T15:00:00Z",
    }], now);
    expect(rows[0].contactsCount).toBe(1);
    expect(rows[0].isReactivated).toBe(false);
  });
  test("reativa quem voltou após mais de 30 dias", () => {
    const rows = buildReactivationRows(clients, [
      visit({ attended_at: "2026-08-20T15:00:00Z" }),
      visit({ id: "b", attended_at: "2026-11-05T15:00:00Z" }),
    ], [], now);
    expect(rows[0].isReactivated).toBe(true);
  });
  test("converte telefone para contato Brasil", () => {
    expect(normalizeClientWhatsApp("(85) 99999-9999")).toBe("5585999999999");
    expect(normalizeClientWhatsApp("abc")).toBeNull();
  });
  test("usa dia civil de Fortaleza", () => {
    expect(inactivityDays("2026-10-07T23:30:00-03:00", now)).toBe(31);
  });
});
