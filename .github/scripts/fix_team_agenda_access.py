from pathlib import Path
import re

professional_path = Path("src/routes/profissional.tsx")
team_path = Path("src/routes/admin_.equipe.tsx")

professional = professional_path.read_text(encoding="utf-8")
team = team_path.read_text(encoding="utf-8")

new_professional_loader = r'''async function loadProfessionalAgenda() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");
  const email = (userData.user.email ?? "").trim().toLowerCase();
  if (!email) return { authorized: false as const, email: "" };

  // Keep access lookup intentionally flat. Embedded PostgREST relationships can become
  // temporarily unavailable after schema migrations and used to take the entire agenda down.
  const access = await db
    .from("professional_access")
    .select("professional_id, email, enabled")
    .eq("email", email)
    .eq("enabled", true)
    .maybeSingle();
  if (access.error) throw new Error(`Falha ao validar o acesso da agenda: ${access.error.message}`);
  if (!access.data?.professional_id) return { authorized: false as const, email };

  const professionalId = access.data.professional_id;
  const [professional, appointments, slots, availability] = await Promise.all([
    db
      .from("professionals")
      .select("id, name, specialty, avatar_url, is_active, deleted_at")
      .eq("id", professionalId)
      .maybeSingle(),
    db
      .from("appointments")
      .select(
        "id, service_id, professional_id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, payment_choice, service_price_snapshot, balance_amount",
      )
      .eq("professional_id", professionalId)
      .order("scheduled_date")
      .order("scheduled_time"),
    db
      .from("professional_time_slots")
      .select("id, professional_id, slot, is_available, sort_order")
      .eq("professional_id", professionalId)
      .order("sort_order")
      .order("slot"),
    db
      .from("professional_availability_periods")
      .select("id, professional_id, weekday, period, is_available")
      .eq("professional_id", professionalId)
      .order("weekday")
      .order("period"),
  ]);

  if (professional.error)
    throw new Error(`Falha ao carregar o perfil profissional: ${professional.error.message}`);
  if (!professional.data?.is_active || professional.data?.deleted_at)
    return { authorized: false as const, email };
  if (appointments.error)
    throw new Error(`Falha ao carregar os agendamentos: ${appointments.error.message}`);
  if (slots.error) throw new Error(`Falha ao carregar os horários: ${slots.error.message}`);
  if (availability.error)
    throw new Error(`Falha ao carregar a disponibilidade: ${availability.error.message}`);

  const appointmentRows = appointments.data ?? [];
  const serviceIds = [
    ...new Set(appointmentRows.map((row: any) => row.service_id).filter(Boolean)),
  ] as string[];
  const appointmentIds = appointmentRows.map((row: any) => row.id).filter(Boolean) as string[];

  const [servicesResult, responsesResult] = await Promise.all([
    serviceIds.length
      ? db.from("services").select("id, name, price, duration_min").in("id", serviceIds)
      : Promise.resolve({ data: [], error: null }),
    appointmentIds.length
      ? db
          .from("appointment_professional_responses")
          .select("appointment_id, response, responded_at")
          .in("appointment_id", appointmentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (servicesResult.error)
    throw new Error(`Falha ao carregar os serviços da agenda: ${servicesResult.error.message}`);
  if (responsesResult.error)
    throw new Error(`Falha ao carregar as confirmações da agenda: ${responsesResult.error.message}`);

  const servicesById = new Map<string, any>(
    (servicesResult.data ?? []).map((row: any) => [row.id, row]),
  );
  const responsesByAppointment = new Map<string, any[]>();
  for (const row of responsesResult.data ?? []) {
    const current = responsesByAppointment.get(row.appointment_id) ?? [];
    current.push({ response: row.response, responded_at: row.responded_at });
    responsesByAppointment.set(row.appointment_id, current);
  }

  return {
    authorized: true as const,
    email,
    professional: professional.data,
    appointments: appointmentRows.map((row: any) => ({
      ...row,
      service: servicesById.get(row.service_id) ?? null,
      professional_response: responsesByAppointment.get(row.id) ?? [],
    })),
    slots: slots.data ?? [],
    availability: availability.data ?? [],
  };
}'''

new_team_loader = r'''async function loadTeamAgenda() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");

  const { data: isAdmin, error: adminError } = await db.rpc("is_current_user_admin");
  if (adminError) throw new Error(`Falha ao validar o acesso administrativo: ${adminError.message}`);
  if (!isAdmin) return { isAdmin: false as const };

  // Load the tables independently instead of depending on embedded PostgREST relations.
  // This keeps the whole team agenda available even immediately after schema migrations.
  const [professionals, access, appointments, services, links, slots, availability] = await Promise.all([
    db.from("professionals").select("id, name, specialty, avatar_url, is_active, sort_order, deleted_at").is("deleted_at", null).order("sort_order").order("name"),
    db.from("professional_access").select("id, professional_id, email, enabled, created_by, created_at, updated_at").order("created_at"),
    db.from("appointments").select("id, service_id, professional_id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, payment_choice, service_price_snapshot").order("scheduled_date").order("scheduled_time"),
    db.from("services").select("id, name, duration_min, price, is_active").order("name"),
    db.from("service_professionals").select("service_id, professional_id"),
    db.from("professional_time_slots").select("id, professional_id, slot, is_available, sort_order").order("sort_order").order("slot"),
    db.from("professional_availability_periods").select("id, professional_id, weekday, period, is_available").order("weekday").order("period"),
  ]);

  const namedResults = [
    ["profissionais", professionals],
    ["acessos", access],
    ["agendamentos", appointments],
    ["serviços", services],
    ["vínculos de serviços", links],
    ["horários", slots],
    ["disponibilidade", availability],
  ] as const;
  for (const [name, result] of namedResults) {
    if (result.error) throw new Error(`Falha ao carregar ${name}: ${result.error.message}`);
  }

  const serviceRows = services.data ?? [];
  const servicesById = new Map<string, any>(serviceRows.map((row: any) => [row.id, row]));

  return {
    isAdmin: true as const,
    professionals: professionals.data ?? [],
    access: access.data ?? [],
    appointments: (appointments.data ?? []).map((row: any) => ({
      ...row,
      service: servicesById.get(row.service_id) ?? null,
    })),
    services: serviceRows.filter((row: any) => row.is_active),
    links: links.data ?? [],
    slots: slots.data ?? [],
    availability: availability.data ?? [],
  };
}'''

professional_pattern = re.compile(
    r'async function loadProfessionalAgenda\(\) \{.*?\n\}\n\nfunction ProfessionalAgenda\(\)',
    re.S,
)
team_pattern = re.compile(
    r'async function loadTeamAgenda\(\) \{.*?\n\}\n\nfunction TeamAgendaPage\(\)',
    re.S,
)

professional_new, professional_count = professional_pattern.subn(
    new_professional_loader + "\n\nfunction ProfessionalAgenda()", professional, count=1
)
team_new, team_count = team_pattern.subn(
    new_team_loader + "\n\nfunction TeamAgendaPage()", team, count=1
)

if professional_count != 1:
    raise SystemExit(f"professional loader replacement count={professional_count}")
if team_count != 1:
    raise SystemExit(f"team loader replacement count={team_count}")

professional_path.write_text(professional_new, encoding="utf-8")
team_path.write_text(team_new, encoding="utf-8")
print("Agenda access loaders patched successfully")
