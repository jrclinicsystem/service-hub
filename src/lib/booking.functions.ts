import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const createBookingAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        serviceId: z.string().uuid(),
        professionalId: z.string().uuid(),
        patientName: z.string().trim().min(2).max(120),
        patientEmail: z.string().trim().email(),
        patientPhone: z.string().trim().max(40).optional().default(""),
        notes: z.string().trim().max(1000).optional().default(""),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
        paymentChoice: z.enum(["deposit", "full", "onsite"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;

    const [{ data: validLink, error: linkError }, serviceResult, settingsResult] = await Promise.all([
      db
        .from("service_professionals")
        .select("service_id")
        .eq("service_id", data.serviceId)
        .eq("professional_id", data.professionalId)
        .maybeSingle(),
      db.from("services").select("id, price, is_active").eq("id", data.serviceId).maybeSingle(),
      db.from("business_settings").select("online_deposit_percent").eq("id", 1).maybeSingle(),
    ]);

    if (linkError) throw linkError;
    if (!validLink) throw new Error("Esse profissional não atende o serviço selecionado.");
    if (serviceResult.error) throw serviceResult.error;
    if (!serviceResult.data?.is_active) throw new Error("Esse serviço não está disponível no momento.");
    if (settingsResult.error) throw settingsResult.error;

    const total = money(Number(serviceResult.data.price ?? 0));
    if (!Number.isFinite(total) || total < 0.01) {
      throw new Error("O serviço precisa ter valor mínimo de R$ 0,01.");
    }

    const rawDepositPercent = Number(settingsResult.data?.online_deposit_percent ?? 50);
    const depositPercent = Math.max(1, Math.min(100, Number.isFinite(rawDepositPercent) ? rawDepositPercent : 50));
    const configuredDeposit = Math.min(total, Math.max(0.01, money(total * depositPercent / 100)));

    const isDeposit = data.paymentChoice === "deposit";
    const isFull = data.paymentChoice === "full";
    const requiresOnlinePayment = isDeposit || isFull;

    const paymentAmount = isDeposit ? configuredDeposit : isFull ? total : 0;
    const depositAmount = isDeposit ? configuredDeposit : isFull ? configuredDeposit : 0;
    const balanceAmount = isDeposit ? money(Math.max(0, total - configuredDeposit)) : isFull ? 0 : total;
    const paymentChoice = isDeposit ? "online_deposit" : isFull ? "online_full" : "onsite";

    const { data: created, error } = await db
      .from("appointments")
      .insert({
        user_id: context.userId,
        service_id: data.serviceId,
        professional_id: data.professionalId,
        patient_name: data.patientName,
        patient_email: data.patientEmail,
        patient_phone: data.patientPhone,
        notes: data.notes,
        scheduled_date: data.scheduledDate,
        scheduled_time: data.scheduledTime,
        status: requiresOnlinePayment ? "aguardando_pagamento" : "pendente",
        payment_choice: paymentChoice,
        service_price_snapshot: total,
        deposit_percent: depositPercent,
        deposit_amount: depositAmount,
        balance_amount: balanceAmount,
      })
      .select("id")
      .single();

    if (error) throw error;

    return {
      id: created.id,
      total,
      depositPercent,
      depositAmount,
      balanceAmount,
      paymentAmount,
      paymentChoice: data.paymentChoice,
      paymentKind: isFull ? ("full" as const) : ("deposit" as const),
      requiresOnlinePayment,
    };
  });
