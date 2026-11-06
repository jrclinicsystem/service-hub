import { describe, expect, test } from "bun:test";
import {
  appointmentDisplayStatus,
  appointmentStatusLabel,
  withAppointmentHistory,
} from "../src/lib/appointment-status";

const schedule_history = [
  {
    changed_at: "2026-11-06T19:00:00Z",
    from_date: "2026-11-07",
    from_time: "09:00",
    to_date: "2026-11-08",
    to_time: "10:00",
  },
];

describe("appointment status presentation", () => {
  test("legacy pending appointments retain their original state", () => {
    expect(appointmentDisplayStatus({ status: "pendente" })).toBe("pendente");
  });
  test("a moved appointment is displayed as Remarcado while awaiting confirmation", () => {
    expect(appointmentStatusLabel({ status: "pendente", schedule_history })).toBe("Remarcado");
  });
  test("confirmation, cancellation, payment and completion take precedence over past moves", () => {
    for (const status of ["confirmado", "cancelado", "aguardando_pagamento", "atendido"]) {
      expect(appointmentDisplayStatus({ status, schedule_history })).toBe(status);
    }
  });
  test("malformed or empty history does not mislabel legacy appointments", () => {
    for (const history of [null, {}, [], [null], [{ from_date: "2026-11-07" }]]) {
      expect(appointmentDisplayStatus({ status: "pendente", schedule_history: history })).toBe(
        "pendente",
      );
    }
  });
});

describe("safe rollout before database migration", () => {
  test("retries a missing history column using the original selection", async () => {
    const columns: string[] = [];
    const result = await withAppointmentHistory(async (column) => {
      columns.push(column);
      return column
        ? {
            data: null,
            error: {
              code: "42703",
              message: "column appointments.schedule_history does not exist",
            },
          }
        : { data: [{ status: "confirmado" }], error: null };
    });
    expect(columns).toEqual([", schedule_history", ""]);
    expect(result.data).toEqual([{ status: "confirmado" }]);
  });
  test("never hides authorization failures", async () => {
    let calls = 0;
    const error = { code: "42501", message: "permission denied" };
    const result = await withAppointmentHistory(async () => {
      calls++;
      return { data: null, error };
    });
    expect(calls).toBe(1);
    expect(result.error).toBe(error);
  });
});
