from pathlib import Path

path = Path("src/components/finance-staging-workspace.tsx")
text = path.read_text()

helper_anchor = '''function statusLabel(status: string) {'''
helper_block = '''function entryServiceNames(row: any) {
  const rawNames = Array.isArray(row?.service_names) ? row.service_names : [];
  const names = rawNames
    .map((name: unknown) => String(name ?? "").trim())
    .filter(Boolean)
    .filter((name: string, index: number, values: string[]) => values.indexOf(name) === index);
  if (names.length) return names;

  const fallback = String(row?.service_name_snapshot ?? "").trim();
  return fallback ? [fallback] : ["Serviço"];
}

function entryServiceLabel(row: any) {
  return entryServiceNames(row).join(" • ");
}

'''
if helper_block not in text:
    if helper_anchor not in text:
        raise SystemExit("statusLabel anchor not found")
    text = text.replace(helper_anchor, helper_block + helper_anchor, 1)

load_anchor = '''  ] = results;
  return {
    dashboard: dashboard.data ?? [],
    cash: cash.data ?? [],
    entries: entries.data ?? [],'''
load_replacement = '''  ] = results;

  const reportEntries = entries.data ?? [];
  const serviceNamesByEntry = new Map<string, string[]>();
  const entryIds = Array.from(
    new Set(
      reportEntries
        .map((row: any) => String(row.entry_id ?? row.id ?? ""))
        .filter(Boolean),
    ),
  );

  if (entryIds.length) {
    const entryLinks: any[] = [];
    for (let index = 0; index < entryIds.length; index += 100) {
      const chunk = entryIds.slice(index, index + 100);
      const result = await db.from("financial_entries").select("id,appointment_id").in("id", chunk);
      if (!result.error) entryLinks.push(...(result.data ?? []));
    }

    const appointmentIds = Array.from(
      new Set(
        entryLinks
          .map((row: any) => String(row.appointment_id ?? ""))
          .filter(Boolean),
      ),
    );
    const serviceNamesByAppointment = new Map<string, string[]>();

    for (let index = 0; index < appointmentIds.length; index += 100) {
      const chunk = appointmentIds.slice(index, index + 100);
      const result = await db
        .from("appointment_services")
        .select("appointment_id,position,service:services(name)")
        .in("appointment_id", chunk)
        .order("position", { ascending: true });

      if (result.error) continue;
      for (const row of result.data ?? []) {
        const service = Array.isArray(row.service) ? row.service[0] : row.service;
        const name = String(service?.name ?? "").trim();
        const appointmentId = String(row.appointment_id ?? "");
        if (!appointmentId || !name) continue;
        const names = serviceNamesByAppointment.get(appointmentId) ?? [];
        if (!names.includes(name)) names.push(name);
        serviceNamesByAppointment.set(appointmentId, names);
      }
    }

    for (const row of entryLinks) {
      const entryId = String(row.id ?? "");
      const appointmentId = String(row.appointment_id ?? "");
      const names = serviceNamesByAppointment.get(appointmentId) ?? [];
      if (entryId && names.length) serviceNamesByEntry.set(entryId, names);
    }
  }

  const enrichedEntries = reportEntries.map((row: any) => {
    const entryId = String(row.entry_id ?? row.id ?? "");
    const serviceNames = serviceNamesByEntry.get(entryId);
    return serviceNames?.length ? { ...row, service_names: serviceNames } : row;
  });

  return {
    dashboard: dashboard.data ?? [],
    cash: cash.data ?? [],
    entries: enrichedEntries,'''
if load_replacement not in text:
    if load_anchor not in text:
        raise SystemExit("loadFullOverview return anchor not found")
    text = text.replace(load_anchor, load_replacement, 1)

text = text.replace(
    '<td>${escape(row.service_name_snapshot)}</td>',
    '<td>${escape(entryServiceLabel(row))}</td>',
)
text = text.replace(
    '<td>${row.service_name_snapshot ?? ""}</td>',
    '<td>${entryServiceLabel(row)}</td>',
)

entry_old = '''            <div>
              <p className="text-sm font-semibold">{row.patient_name_snapshot || "Atendimento"}</p>
              <p className="text-xs text-muted-foreground">
                {row.service_name_snapshot || "Serviço"} ·{" "}
                {row.professional_name_snapshot || "Profissional"}
              </p>
            </div>'''
entry_new = '''            <div className="min-w-0">
              <p className="text-sm font-semibold">{row.patient_name_snapshot || "Atendimento"}</p>
              <p className="mt-1 whitespace-normal break-words text-xs leading-5 text-muted-foreground">
                <span className="font-medium text-foreground/80">Serviços:</span>{" "}
                {entryServiceLabel(row)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.professional_name_snapshot || "Profissional"}
              </p>
            </div>'''
if entry_new not in text:
    if entry_old not in text:
        raise SystemExit("EntryList service display anchor not found")
    text = text.replace(entry_old, entry_new, 1)

path.write_text(text)
