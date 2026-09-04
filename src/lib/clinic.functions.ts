import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  JR_CLINIC_SUPABASE_PUBLISHABLE_KEY,
  JR_CLINIC_SUPABASE_URL,
} from "@/integrations/supabase/project";
import type { Database } from "@/integrations/supabase/types";

const serviceColumns =
  "id, slug, name, category_id, professional, professional_role, duration_min, price, rating, reviews_count, summary, description, includes, preparation, is_active";

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function publicClient() {
  return createClient<Database>(
    JR_CLINIC_SUPABASE_URL,
    JR_CLINIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    },
  );
}

async function fetchCatalog() {
  const supabase = publicClient();

  const { data, error } = await supabase
    .from("services")
    .select(`${serviceColumns}, category:categories(id, name, description, sort_order)`)
    .eq("is_active", true)
    .order("name");

  if (error) throw error;

  const categoryMap = new Map<
    string,
    { id: string; name: string; description: string; sort_order: number }
  >();

  const services = (data ?? []).map(({ category, ...service }) => {
    if (category) categoryMap.set(category.id, category);
    return {
      ...service,
      price: Number(service.price),
      rating: Number(service.rating),
    };
  });

  return {
    categories: [...categoryMap.values()].sort((a, b) => a.sort_order - b.sort_order),
    services,
  };
}

export const getCatalog = createServerFn({ method: "GET" }).handler(() => fetchCatalog());

export const getHomeOverview = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const db = supabase as any;
  const [catalog, professionals, settings] = await Promise.all([
    fetchCatalog(),
    supabase.from("professionals").select("id", { count: "exact", head: true }).eq("is_active", true),
    db.from("business_settings").select("address, maps_url").eq("id", 1).maybeSingle(),
  ]);

  if (professionals.error) throw professionals.error;
  if (settings.error) throw settings.error;

  return {
    ...catalog,
    activeProfessionals: professionals.count ?? 0,
    businessAddress: settings.data?.address?.trim() || null,
    mapsUrl: settings.data?.maps_url?.trim() || null,
  };
});

export const getBookingCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const db = supabase as any;
  const [catalog, slots, links, settings] = await Promise.all([
    fetchCatalog(),
    supabase.from("time_slots").select("slot, is_available").order("sort_order"),
    db
      .from("service_professionals")
      .select("service_id, professional:professionals(id, name, specialty, sort_order, is_active)"),
    db.from("business_settings").select("online_deposit_percent").eq("id", 1).maybeSingle(),
  ]);

  if (slots.error) throw slots.error;
  if (links.error) throw links.error;
  if (settings.error) throw settings.error;

  return {
    ...catalog,
    timeSlots: slots.data ?? [],
    serviceProfessionals: (links.data ?? []).filter((item: any) => item.professional?.is_active),
    depositPercent: Number(settings.data?.online_deposit_percent ?? 50),
  };
});

export const getServiceDetail = createServerFn({ method: "GET" })
  .validator((data) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const supabase = publicClient();

    const { data: service, error } = await supabase
      .from("services")
      .select(serviceColumns)
      .eq("slug", data.slug)
      .maybeSingle();

    if (error) throw error;
    if (!service) return null;

    const [reviews, category] = await Promise.all([
      supabase
        .from("service_reviews")
        .select("id, author, when_label, body, rating")
        .eq("service_id", service.id)
        .order("created_at", { ascending: false }),
      supabase.from("categories").select("id, name").eq("id", service.category_id).maybeSingle(),
    ]);

    if (reviews.error) throw reviews.error;

    return {
      service: { ...service, price: Number(service.price), rating: Number(service.rating) },
      reviews: reviews.data ?? [],
      categoryName: category.data?.name ?? null,
    };
  });

export const createAppointment = createServerFn({ method: "POST" })
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
        paymentChoice: z.enum(["deposit", "onsite"]),
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
    if (!Number.isFinite(total) || total <= 0) throw new Error("O serviço precisa ter um valor válido.");

    const rawDepositPercent = Number(settingsResult.data?.online_deposit_percent ?? 50);
    const depositPercent = Math.max(1, Math.min(100, Number.isFinite(rawDepositPercent) ? rawDepositPercent : 50));
    const configuredDeposit = money(total * depositPercent / 100);
    const requiresOnlinePayment = data.paymentChoice === "deposit";
    const depositAmount = requiresOnlinePayment ? configuredDeposit : 0;
    const balanceAmount = requiresOnlinePayment ? money(Math.max(0, total - configuredDeposit)) : total;
    const paymentAmount = requiresOnlinePayment ? configuredDeposit : 0;

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
        payment_choice: requiresOnlinePayment ? "online_deposit" : "onsite",
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
      requiresOnlinePayment,
    };
  });

export const getMyAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const { data, error } = await db
      .from("appointments")
      .select(
        "id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, created_at, status_updated_at, payment_choice, user_hidden_at, service_price_snapshot, deposit_percent, deposit_amount, balance_amount, service:services(name, price, duration_min), professional:professionals(name, specialty), payments(status, amount, kind, payment_method_id, provider, paid_at, created_at, status_detail, provider_payment_id)",
      )
      .is("user_hidden_at", null)
      .order("scheduled_date", { ascending: false })
      .order("scheduled_time", { ascending: false });

    if (error) throw error;
    return data ?? [];
  });

export const hideMyAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: updated, error } = await db
      .from("appointments")
      .update({ user_hidden_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!updated) throw new Error("Este agendamento não pode ser removido do histórico agora.");
    return { ok: true };
  });

async function isAdminContext(context: {
  userId: string;
  claims: Record<string, unknown>;
  supabase: unknown;
}) {
  const db = context.supabase as any;
  const { data: roles, error: roleError } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);

  if (roleError) throw roleError;
  if ((roles ?? []).some((role: { role: string }) => role.role === "admin")) return true;

  const email = typeof context.claims['email'] === "string" ? context.claims['email'].trim().toLowerCase() : "";
  if (!email) return false;

  const { data: allowlisted, error: allowlistError } = await db
    .from("admin_emails")
    .select("email")
    .eq("email", email)
    .eq("enabled", true)
    .maybeSingle();

  if (allowlistError) throw allowlistError;
  return Boolean(allowlisted);
}

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await isAdminContext(context as any);
    if (!isAdmin) return { isAdmin: false as const };

    const db = context.supabase as any;
    const [appointments, services, categories, promotions, timeSlots, adminEmails] = await Promise.all([
      db
        .from("appointments")
        .select(
          "id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, created_at, status_updated_at, payment_choice, service_price_snapshot, deposit_percent, deposit_amount, balance_amount, service:services(name, price, duration_min), professional:professionals(name, specialty), payments(status, amount, kind, payment_method_id, provider, paid_at, created_at)",
        )
        .order("scheduled_date", { ascending: true }),
      db.from("services").select(serviceColumns).order("name"),
      db.from("categories").select("id, name, description, sort_order").order("sort_order"),
      db
        .from("promotions")
        .select(
          "id, service_id, title, description, discount_percent, promotional_price, starts_at, ends_at, is_active, created_at, updated_at",
        )
        .order("created_at", { ascending: false }),
      db.from("time_slots").select("id, slot, is_available, sort_order").order("sort_order"),
      db.from("admin_emails").select("email, enabled, created_at").order("created_at"),
    ]);

    for (const result of [appointments, services, categories, promotions, timeSlots, adminEmails]) {
      if (result.error) throw result.error;
    }

    return {
      isAdmin: true as const,
      appointments: appointments.data ?? [],
      services: (services.data ?? []).map((service: any) => ({
        ...service,
        price: Number(service.price),
        rating: Number(service.rating),
      })),
      categories: categories.data ?? [],
      promotions: (promotions.data ?? []).map((promotion: any) => ({
        ...promotion,
        discount_percent:
          promotion.discount_percent === null ? null : Number(promotion.discount_percent),
        promotional_price:
          promotion.promotional_price === null ? null : Number(promotion.promotional_price),
      })),
      timeSlots: timeSlots.data ?? [],
      adminEmails: adminEmails.data ?? [],
    };
  });

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pendente", "confirmado", "cancelado"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdminContext(context as any))) throw new Error("Acesso administrativo necessário.");

    const { error } = await context.supabase
      .from("appointments")
      .update({ status: data.status })
      .eq("id", data.id);

    if (error) throw error;
    return { ok: true };
  });