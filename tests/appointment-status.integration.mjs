import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import postgres from "postgres";

// Run only against a NEW disposable database: this fixture creates its schema.
if (!process.env.JR_TEST_DATABASE_URL)
  throw new Error("Set JR_TEST_DATABASE_URL to a disposable PostgreSQL database.");
const sql = postgres(process.env.JR_TEST_DATABASE_URL, { max: 5, onnotice: () => {} });
const migration = "../supabase/migrations/20261106190000_appointment_schedule_status.sql";
const p1 = "10000000-0000-0000-0000-000000000001";
const p2 = "10000000-0000-0000-0000-000000000002";
const service = "20000000-0000-0000-0000-000000000001";
const room = "30000000-0000-0000-0000-000000000001";
const day = "2099-11-06";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const create = async (time = "09:00", professional = p1, status = "confirmado") => {
  const [a] =
    await sql`insert into appointments(professional_id,service_id,scheduled_date,scheduled_time,status)
    values(${professional},${service},${day},${time},${status}) returning *`;
  return a;
};
const move = (a, time, client = sql) =>
  client`select reschedule_admin_appointment(${a.id},${day}::date,${time},${day}::date,${a.scheduled_time},${a.status})`;
const available = async (professional = p1, exclude = null) =>
  (
    await sql`select * from get_professional_booking_slots(${professional},${day}::date,${exclude})`
  ).map((x) => x.slot);

before(async () => {
  await sql.unsafe(await read("./appointment-status.fixture.sql"));
  await sql.unsafe(
    await read("../supabase/migrations/20260908224500_fix_room_scoped_booking_conflicts.sql"),
  );
  const guard = await read(
    "../supabase/migrations/20260904080000_allow_post_booking_price_edits.sql",
  );
  await sql.unsafe(
    guard.slice(
      0,
      guard.indexOf("create or replace function public.update_appointment_custom_price"),
    ),
  );
  await sql`create trigger guard_appointment_user_update before update on appointments for each row execute function guard_appointment_user_update()`;
  const connection = await sql.reserve();
  try {
    await connection.unsafe(await read(migration));
  } finally {
    connection.release();
  }
  await sql`insert into services(id,duration_min) values(${service},30)`;
  for (const professional of [p1, p2]) {
    for (const [index, time] of [
      "09:00",
      "09:15",
      "09:30",
      "10:00",
      "10:15",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
    ].entries()) {
      await sql`insert into professional_time_slots values(${professional},${time},true,${index})`;
    }
  }
});
beforeEach(async () => {
  await sql`truncate appointments, appointment_professional_responses, financial_entries, payments, appointment_sessions, room_professionals, room_reservations cascade`;
});
after(async () => {
  await sql.end();
});

test("confirmation occupies the slot; cancellation frees it and keeps payments/history", async () => {
  const a = await create();
  await sql`insert into payments values(${a.id},'approved',25)`;
  assert(!(await available()).includes("09:00"));
  await sql`update appointments set status='cancelado' where id=${a.id}`;
  assert((await available()).includes("09:00"));
  await create();
  assert.equal((await sql`select * from appointments where id=${a.id}`)[0].status, "cancelado");
  assert.equal((await sql`select * from payments where appointment_id=${a.id}`).length, 1);
});
test("rescheduling moves the reservation and pending sessions, preserving payment and old response", async () => {
  const a = await create();
  await sql`insert into payments values(${a.id},'approved',25)`;
  await sql`insert into appointment_professional_responses values(${a.id},${p1},'confirmado',now())`;
  await sql`insert into appointment_sessions(appointment_id,status,scheduled_date,scheduled_time) values(${a.id},'pending',${day},'09:00')`;
  await move(a, "10:00");
  const [b] = await sql`select * from appointments where id=${a.id}`;
  assert.equal(b.status, "pendente");
  assert.equal(b.scheduled_time, "10:00");
  assert.equal(b.schedule_history[0].from_time, "09:00");
  assert.equal(b.schedule_history[0].professional_responses[0].response, "confirmado");
  for (const field of ["deposit_amount", "balance_amount", "service_price_snapshot", "notes"])
    assert.equal(b[field], a[field]);
  assert.equal((await sql`select * from payments where appointment_id=${a.id}`).length, 1);
  assert.equal(
    (await sql`select * from appointment_professional_responses where appointment_id=${a.id}`)
      .length,
    0,
  );
  assert.equal(
    (await sql`select * from appointment_sessions where appointment_id=${a.id}`)[0].scheduled_time,
    "10:00",
  );
  assert((await available()).includes("09:00"));
  assert(!(await available()).includes("10:00"));
});
test("an appointment can move into part of its own former interval", async () => {
  const a = await create();
  assert((await available(p1, a.id)).includes("09:15"));
  await move(a, "09:15");
  assert((await available()).includes("09:00"));
});
test("conflicting move rolls back and retains the original reservation", async () => {
  const a = await create();
  await create("10:00");
  await assert.rejects(move(a, "10:00"));
  const [b] = await sql`select * from appointments where id=${a.id}`;
  assert.equal(b.scheduled_time, "09:00");
  assert.deepEqual(b.schedule_history, []);
});
test("two concurrent reschedules to one slot allow only one winner", async () => {
  const a = await create();
  const b = await create("11:00");
  const result = await Promise.allSettled([move(a, "10:00"), move(b, "10:00")]);
  assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
  const rows = await sql`select * from appointments order by scheduled_time`;
  assert.equal(rows.filter((x) => x.scheduled_time === "10:00").length, 1);
  assert.equal(
    rows.filter((x) => x.status === "confirmado" && x.schedule_history.length === 0).length,
    1,
  );
});
test("concurrent booking versus rescheduling cannot double book", async () => {
  const a = await create();
  const results = await Promise.allSettled([move(a, "10:00"), create("10:00")]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
});
test("overlapping simultaneous bookings serialize even when start times differ", async () => {
  const results = await Promise.allSettled([create("10:00"), create("10:15")]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
});
test("same time is allowed for independent professionals, blocked for shared rooms", async () => {
  await create("10:00");
  await create("10:00", p2);
  await sql`truncate appointments cascade`;
  await sql`insert into room_professionals values(${room},${p1}),(${room},${p2})`;
  await create("10:00");
  await assert.rejects(create("10:00", p2));
});
test("shared-room reservation rejects a move without freeing the old time", async () => {
  const a = await create();
  await sql`insert into room_professionals values(${room},${p1})`;
  await sql`insert into room_reservations values(${room},${day},'10:00','11:00','active')`;
  await assert.rejects(move(a, "10:00"));
  assert.equal((await sql`select * from appointments where id=${a.id}`)[0].scheduled_time, "09:00");
});
test("stale reschedule cannot overwrite a previous move", async () => {
  const a = await create();
  await move(a, "10:00");
  await assert.rejects(move(a, "11:00"), { code: "40001" });
});
test("multiple moves preserve all history; confirmation does not erase it", async () => {
  const a = await create();
  await move(a, "10:00");
  const [b] = await sql`select * from appointments where id=${a.id}`;
  await move(b, "11:00");
  await sql`update appointments set status='confirmado' where id=${a.id}`;
  assert.equal(
    (await sql`select * from appointments where id=${a.id}`)[0].schedule_history.length,
    2,
  );
});
test("completed or financially finalized appointments cannot be moved", async () => {
  const a = await create("09:00", p1, "atendido");
  await assert.rejects(move(a, "10:00"));
  const b = await create("11:00");
  await sql`insert into financial_entries(appointment_id) values(${b.id})`;
  await assert.rejects(move(b, "10:00"));
});
test("waiting-for-payment appointments keep their payment workflow after a move", async () => {
  const a = await create("09:00", p1, "aguardando_pagamento");
  await move(a, "10:00");
  assert.equal(
    (await sql`select * from appointments where id=${a.id}`)[0].status,
    "aguardando_pagamento",
  );
});
test("unprivileged users cannot reschedule or exclude reservations from availability", async () => {
  const a = await create();
  await sql.begin(async (tx) => {
    await tx`set local jr.test_admin='false'`;
    const slots =
      await tx`select * from get_professional_booking_slots(${p1},${day}::date,${a.id})`;
    assert(!slots.some((x) => x.slot === "09:00"));
  });
  await assert.rejects(
    sql.begin(async (tx) => {
      await tx`set local jr.test_admin='false'`;
      await move(a, "10:00", tx);
    }),
    { code: "42501" },
  );
});
test("invalid, unavailable, past and unchanged target times are rejected", async () => {
  const a = await create();
  for (const time of ["25:00", "10:99", "08:00", "09:00"]) await assert.rejects(move(a, time));
  await assert.rejects(
    sql`select reschedule_admin_appointment(${a.id},'2000-01-01','10:00',${day},'09:00','confirmado')`,
  );
});
test("legacy two-argument availability callers remain compatible", async () => {
  assert((await sql`select * from get_professional_booking_slots(${p1},${day}::date)`).length > 0);
});
