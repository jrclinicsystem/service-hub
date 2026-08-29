import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const serviceColumns =
  "id, slug, name, category_id, professional, professional_role, duration_min, price, rating, reviews_count, summary, description, includes, preparation";

function publicClient() {
  return createClient<Database>(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export const getCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();

  const [categories, services, slots] = await Promise.all([
    supabase.from("categories").select("id, name, description, sort_order").order("sort_order"),
    supabase.from("services").select(serviceColumns).order("name"),
    supabase.from("time_slots").select("slot, is_available").order("sort_order"),
  ]);

  if (categories.error) throw categories.error;
  if (services.error) throw services.error;
  if (slots.error) throw slots.error;

  return {
    categories: categories.data ?? [],
    services: (services.data ?? []).map((s) => ({ ...s, price: Number(s.price), rating: Number(s.rating) })),
    timeSlots: slots.data ?? [],
  };
});

export const getServiceDetail = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().min(1) }).parse(data))
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
  .inputValidator((data) =>
    z
      .object({
        serviceId: z.string().uuid(),
        patientName: z.string().trim().min(2).max(120),
        patientEmail: z.string().trim().email(),
        patientPhone: z.string().trim().max(40).optional().default(""),
        notes: z.string().trim().max(1000).optional().default(""),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase
      .from("appointments")
      .insert({
        user_id: context.userId,
        service_id: data.serviceId,
        patient_name: data.patientName,
        patient_email: data.patientEmail,
        patient_phone: data.patientPhone,
        notes: data.notes,
        scheduled_date: data.scheduledDate,
        scheduled_time: data.scheduledTime,
      })
      .select("id")
      .single();

    if (error) throw error;
    return { id: created.id };
  });

export const getMyAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("appointments")
      .select(
        "id, patient_name, patient_email, scheduled_date, scheduled_time, status, service:services(name, price)",
      )
      .order("scheduled_date", { ascending: true });

    if (error) throw error;
    return data ?? [];
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    if (roleError) throw roleError;

    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) return { isAdmin: false as const };

    const [appointments, services, categories] = await Promise.all([
      context.supabase
        .from("appointments")
        .select(
          "id, patient_name, patient_email, scheduled_date, scheduled_time, status, service:services(name, price)",
        )
        .order("scheduled_date", { ascending: true }),
      context.supabase.from("services").select(serviceColumns).order("name"),
      context.supabase.from("categories").select("id, name").order("sort_order"),
    ]);

    if (appointments.error) throw appointments.error;
    if (services.error) throw services.error;
    if (categories.error) throw categories.error;

    return {
      isAdmin: true as const,
      appointments: appointments.data ?? [],
      services: (services.data ?? []).map((s) => ({ ...s, price: Number(s.price), rating: Number(s.rating) })),
      categories: categories.data ?? [],
    };
  });

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pendente", "confirmado", "cancelado"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("appointments")
      .update({ status: data.status })
      .eq("id", data.id);

    if (error) throw error;
    return { ok: true };
  });
