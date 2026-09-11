from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Admin data query
# ---------------------------------------------------------------------------
path = Path("src/routes/admin.tsx")
text = path.read_text()
text = replace_once(
    text,
    'appointment_services(service_id, position, service:services!appointment_services_service_id_fkey(id, name, price, duration_min))',
    'appointment_services(service_id, position, price_snapshot, status, completed_at, completed_by, service:services!appointment_services_service_id_fkey(id, name, price, duration_min))',
    "admin appointment_services query",
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Admin combo checklist UI
# ---------------------------------------------------------------------------
path = Path("src/components/admin-appointments-workspace.tsx")
text = path.read_text()

old_helper = '''function appointmentServiceLabel(item: any) {
  const linked = [...(item?.appointment_services ?? [])]
    .sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((entry: any) => entry?.service?.name)
    .filter(Boolean);
  if (linked.length) return linked.join(" + ");
  return item?.service?.name ?? "Atendimento";
}
'''
new_helper = '''function appointmentServiceItems(item: any) {
  return [...(item?.appointment_services ?? [])]
    .sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0));
}

function appointmentServiceLabel(item: any) {
  const linked = appointmentServiceItems(item)
    .map((entry: any) => entry?.service?.name)
    .filter(Boolean);
  if (linked.length) return linked.join(" + ");
  return item?.service?.name ?? "Atendimento";
}

function appointmentComboProgress(item: any) {
  const items = appointmentServiceItems(item);
  const total = items.length;
  const completed = items.filter((entry: any) => entry.status === "completed").length;
  return {
    items,
    total,
    completed,
    isCombo: total > 1,
    started: total > 1 && completed > 0,
    allCompleted: total > 1 && completed === total,
  };
}
'''
text = replace_once(text, old_helper, new_helper, "admin combo helpers")

text = replace_once(
    text,
    'appointment_services(position, service:services!appointment_services_service_id_fkey(name, price, duration_min))',
    'appointment_services(service_id, position, price_snapshot, status, completed_at, completed_by, service:services!appointment_services_service_id_fkey(name, price, duration_min))',
    "fetchAppointment combo fields",
)

# Gate legacy whole-appointment completion for combos.
text = replace_once(
    text,
    '''  const canMarkAttended = appointment.status === "confirmado" && Number.isFinite(scheduledMoment.getTime()) && scheduledMoment.getTime() <= Date.now();
  const cardClass =''',
    '''  const combo = appointmentComboProgress(appointment);
  const canMarkAttended = !combo.isCombo && appointment.status === "confirmado" && Number.isFinite(scheduledMoment.getTime()) && scheduledMoment.getTime() <= Date.now();
  const cardClass =''',
    "admin card combo gate",
)

# Add progress under the service summary card.
service_summary = '''      <div className="mt-3 rounded-xl bg-secondary/45 p-3"><p className="truncate text-sm font-medium">{appointmentServiceLabel(appointment)}</p><p className="mt-1 truncate text-xs text-muted-foreground">{appointment.professional?.name ?? "Profissional não definido"} · {appointment.professional?.specialty ?? "Equipe"}</p></div>'''
service_summary_new = service_summary + '''
      {combo.isCombo ? <div className={`mt-2 rounded-xl border px-3 py-2 text-[11px] font-medium ${combo.allCompleted ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border bg-background text-muted-foreground"}`}><div className="flex items-center justify-between gap-2"><span>Progresso do combo</span><strong>{combo.completed} de {combo.total} concluídos</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${combo.total ? (combo.completed / combo.total) * 100 : 0}%` }} /></div>{combo.allCompleted ? <p className="mt-1.5 font-semibold text-emerald-700">Combo concluído · pronto para o financeiro</p> : null}</div> : null}'''
text = replace_once(text, service_summary, service_summary_new, "admin card progress")

# Prevent editing a started combo through the current rescheduling RPC, which would recreate items.
text = replace_once(
    text,
    '''  const saveAppointment = async () => {
    if (!patientName.trim())''',
    '''  const saveAppointment = async () => {
    if (editing && appointmentComboProgress(editing).started) {
      toast.error("Este combo já possui serviço concluído.", { description: "Para preservar o histórico do pacote, conclua o combo antes de alterar serviços ou reagendar." });
      return;
    }
    if (!patientName.trim())''',
    "started combo edit guard",
)

# Parent dialog receives refresh callback.
text = replace_once(
    text,
    '''onPriceSaved={(value: number) => { setSelected((current: any) => current ? { ...current, service_price_snapshot: value, balance_amount: value } : current); onRefresh(); }} busy={busyAction} />''',
    '''onPriceSaved={(value: number) => { setSelected((current: any) => current ? { ...current, service_price_snapshot: value, balance_amount: value } : current); onRefresh(); }} onRefresh={onRefresh} busy={busyAction} />''',
    "admin dialog refresh prop",
)

combo_component = r'''
function ComboServicesManager({ appointment, onRefresh }: any) {
  const [items, setItems] = useState<any[]>(() => appointmentServiceItems(appointment));
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    setItems(appointmentServiceItems(appointment));
  }, [appointment?.id, appointment?.appointment_services]);

  if (items.length <= 1) return null;

  const completed = items.filter((item: any) => item.status === "completed").length;
  const allCompleted = completed === items.length;
  const canManage = appointment.status === "confirmado";

  const toggle = async (item: any) => {
    const isCompleted = item.status === "completed";
    if (isCompleted && !window.confirm(`Desmarcar ${item.service?.name ?? "este serviço"} como concluído?`)) return;
    setBusyId(item.service_id);
    const result = await db.rpc("set_appointment_service_completion", {
      _appointment_id: appointment.id,
      _service_id: item.service_id,
      _completed: !isCompleted,
    });
    setBusyId("");
    if (result.error) {
      toast.error("Não foi possível atualizar o serviço.", { description: result.error.message });
      return;
    }
    const now = new Date().toISOString();
    setItems((current) => current.map((row) => row.service_id === item.service_id ? {
      ...row,
      status: isCompleted ? "pending" : "completed",
      completed_at: isCompleted ? null : (row.completed_at ?? now),
    } : row));
    toast.success(isCompleted ? "Serviço reaberto no combo." : "Serviço concluído no combo.");
    onRefresh?.();
  };

  return (
    <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Serviços do combo</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Conclua cada procedimento separadamente. O financeiro só libera quando todos estiverem feitos.</p>
        </div>
        <Badge variant={allCompleted ? "default" : "secondary"} className={allCompleted ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}>{completed} de {items.length} concluídos</Badge>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${items.length ? (completed / items.length) * 100 : 0}%` }} />
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item: any) => {
          const done = item.status === "completed";
          return (
            <div key={item.service_id} className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${done ? "border-emerald-200 bg-emerald-50/70" : "border-border bg-card"}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{item.service?.name ?? "Serviço"}</strong>
                  <Badge variant={done ? "default" : "outline"} className={done ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}>{done ? "Concluído" : "Pendente"}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatPrice(Number(item.price_snapshot ?? item.service?.price ?? 0))}{done && item.completed_at ? ` · concluído em ${formatDateTime(item.completed_at)}` : ""}</p>
              </div>
              <Button type="button" size="sm" variant={done ? "outline" : "default"} disabled={!canManage || busyId === item.service_id} onClick={() => void toggle(item)} className="shrink-0 rounded-xl">
                <Check className="size-4" /> {busyId === item.service_id ? "Salvando..." : done ? "Desfazer conclusão" : "Marcar como concluído"}
              </Button>
            </div>
          );
        })}
      </div>
      {allCompleted ? <div className="mt-3 rounded-xl bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800">Combo concluído — pronto para finalizar no financeiro.</div> : <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Ainda existem serviços pendentes. O lançamento financeiro do combo permanece bloqueado.</div>}
    </div>
  );
}

'''
text = replace_once(
    text,
    'function AppointmentPriceEditor({ appointment, onSaved }: any) {',
    combo_component + 'function AppointmentPriceEditor({ appointment, onSaved }: any) {',
    "combo manager component",
)

# Dialog combo state + legacy attended gate.
text = replace_once(
    text,
    '''  const scheduledMoment = new Date(`${appointment.scheduled_date}T${appointment.scheduled_time}:00`);
  const canMarkAttended = appointment.status === "confirmado" && Number.isFinite(scheduledMoment.getTime()) && scheduledMoment.getTime() <= Date.now();''',
    '''  const scheduledMoment = new Date(`${appointment.scheduled_date}T${appointment.scheduled_time}:00`);
  const combo = appointmentComboProgress(appointment);
  const canMarkAttended = !combo.isCombo && appointment.status === "confirmado" && Number.isFinite(scheduledMoment.getTime()) && scheduledMoment.getTime() <= Date.now();''',
    "admin dialog combo gate",
)
text = replace_once(
    text,
    '''    <AppointmentPriceEditor appointment={appointment} onSaved={onPriceSaved} />''',
    '''    <AppointmentPriceEditor appointment={appointment} onSaved={onPriceSaved} />
    <ComboServicesManager appointment={appointment} onRefresh={onRefresh} />''',
    "admin dialog combo manager placement",
)
# Do not offer the current edit/recreate flow after progress starts.
text = text.replace(
    '{appointment.status !== "atendido" ? <div className="mt-4"><Button type="button" variant="outline"',
    '{appointment.status !== "atendido" && !combo.started ? <div className="mt-4"><Button type="button" variant="outline"',
    1,
)

path.write_text(text)


# ---------------------------------------------------------------------------
# Finance standard finalization: show checklist and gate finalization.
# ---------------------------------------------------------------------------
path = Path("src/components/finance-attendance-completion.tsx")
text = path.read_text()
text = replace_once(
    text,
    '''        "id,patient_name,scheduled_date,scheduled_time,status,professional_id,professional_name_snapshot,custom_price,service_price_snapshot,service_id,service:services!appointments_service_id_fkey(name,price),professional:professionals(name)",''',
    '''        "id,patient_name,scheduled_date,scheduled_time,status,professional_id,professional_name_snapshot,custom_price,service_price_snapshot,service_id,service:services!appointments_service_id_fkey(name,price),appointment_services(service_id,position,price_snapshot,status,completed_at,service:services!appointment_services_service_id_fkey(name,price)),professional:professionals(name)",''',
    "finance standard combo query",
)
helper_anchor = '''function dateLabel(value?: string | null) {'''
helper_block = '''function comboItems(appointment: any) {
  return [...(appointment?.appointment_services ?? [])].sort(
    (a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0),
  );
}

function comboReady(appointment: any) {
  const items = comboItems(appointment);
  return items.length <= 1 || items.every((item: any) => item.status === "completed");
}

'''
if helper_block not in text:
    text = replace_once(text, helper_anchor, helper_block + helper_anchor, "finance standard helpers")
text = replace_once(
    text,
    '''  useEffect(() => {
    if (!selected) return;''',
    '''  const selectedItems = useMemo(() => comboItems(selected), [selected]);
  const selectedReady = comboReady(selected);

  useEffect(() => {
    if (!selected) return;''',
    "finance standard selected combo state",
)
text = replace_once(
    text,
    '''    const parsedAmount = parseMoney(amount);''',
    '''    if (!comboReady(selected)) {
      toast.error("Ainda existem serviços pendentes neste combo.", { description: "Conclua todos os procedimentos no painel antes de enviar o pacote ao financeiro." });
      return;
    }
    const parsedAmount = parseMoney(amount);''',
    "finance standard finalize guard",
)
selected_card = '''                <p className="mt-2 font-medium">
                  Valor base:{" "}
                  {money(
                    selected.custom_price ??
                      selected.service_price_snapshot ??
                      selected.service?.price,
                  )}
                </p>'''
selected_card_new = selected_card + '''
                {selectedItems.length > 1 ? <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">Serviços do combo</span><Badge variant={selectedReady ? "default" : "secondary"} className={selectedReady ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}>{selectedItems.filter((item: any) => item.status === "completed").length}/{selectedItems.length} concluídos</Badge></div>{selectedItems.map((item: any) => <div key={item.service_id} className="flex items-center justify-between gap-3 rounded-lg bg-background px-2.5 py-2 text-xs"><span className="min-w-0 truncate">{item.status === "completed" ? "✓ " : "○ "}{item.service?.name ?? "Serviço"}</span><strong className="shrink-0">{money(item.price_snapshot ?? item.service?.price)}</strong></div>)}{selectedReady ? <p className="text-[11px] font-semibold text-emerald-700">Combo concluído — pronto para finalizar.</p> : <p className="text-[11px] font-medium text-amber-700">Finalize os serviços pendentes antes do lançamento financeiro.</p>}</div> : null}'''
text = replace_once(text, selected_card, selected_card_new, "finance standard combo summary")
text = replace_once(
    text,
    '''          <Button disabled={!selected || busy} onClick={() => void finalize()}>''',
    '''          <Button disabled={!selected || busy || !selectedReady} onClick={() => void finalize()}>''',
    "finance standard button gate",
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Mixed payment path: same gate (database also protects it).
# ---------------------------------------------------------------------------
path = Path("src/components/finance-mixed-payment.tsx")
text = path.read_text()
text = replace_once(
    text,
    '''.select("id,patient_name,scheduled_date,scheduled_time,status,professional_id,professional_name_snapshot,custom_price,service_price_snapshot,service_id,service:services(name,price),professional:professionals(name)")''',
    '''.select("id,patient_name,scheduled_date,scheduled_time,status,professional_id,professional_name_snapshot,custom_price,service_price_snapshot,service_id,service:services(name,price),appointment_services(service_id,position,price_snapshot,status,completed_at,service:services!appointment_services_service_id_fkey(name,price)),professional:professionals(name)")''',
    "mixed payment combo query",
)
helper_anchor = '''function dateLabel(value?: string | null) {'''
helper_block = '''function comboItems(appointment: any) {
  return [...(appointment?.appointment_services ?? [])].sort(
    (a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0),
  );
}

function comboReady(appointment: any) {
  const items = comboItems(appointment);
  return items.length <= 1 || items.every((item: any) => item.status === "completed");
}

'''
if helper_block not in text:
    text = replace_once(text, helper_anchor, helper_block + helper_anchor, "mixed payment helpers")
text = replace_once(
    text,
    '''  useEffect(() => {
    if (!selected) return;''',
    '''  const selectedItems = useMemo(() => comboItems(selected), [selected]);
  const selectedReady = comboReady(selected);

  useEffect(() => {
    if (!selected) return;''',
    "mixed selected combo state",
)
text = replace_once(
    text,
    '''    if (!selected) return toast.error("Selecione um atendimento confirmado.");''',
    '''    if (!selected) return toast.error("Selecione um atendimento confirmado.");
    if (!comboReady(selected)) return toast.error("Ainda existem serviços pendentes neste combo. Conclua todos antes do pagamento final.");''',
    "mixed finalize guard",
)
text = replace_once(
    text,
    '''                <p className="mt-1 text-muted-foreground">{selected.service?.name ?? "Serviço"} · {selected.professional?.name ?? selected.professional_name_snapshot ?? "Profissional"}</p>''',
    '''                <p className="mt-1 text-muted-foreground">{selected.service?.name ?? "Serviço"} · {selected.professional?.name ?? selected.professional_name_snapshot ?? "Profissional"}</p>
                {selectedItems.length > 1 ? <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3">{selectedItems.map((item: any) => <div key={item.service_id} className="flex items-center justify-between gap-2 text-xs"><span>{item.status === "completed" ? "✓" : "○"} {item.service?.name ?? "Serviço"}</span><strong>{money(item.price_snapshot ?? item.service?.price)}</strong></div>)}<p className={`text-[11px] font-semibold ${selectedReady ? "text-emerald-700" : "text-amber-700"}`}>{selectedReady ? "Combo concluído — pronto para o financeiro." : "Há serviços pendentes neste combo."}</p></div> : null}''',
    "mixed combo summary",
)
text = replace_once(
    text,
    '''<div className="flex justify-end"><Button disabled={!selected || busy} onClick={() => void finalize()}>''',
    '''<div className="flex justify-end"><Button disabled={!selected || busy || !selectedReady} onClick={() => void finalize()}>''',
    "mixed button gate",
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Latest financial entries: display every service + its individual snapshot value.
# Keep one financial entry so totals/fees/commissions are not duplicated.
# ---------------------------------------------------------------------------
path = Path("src/components/finance-staging-workspace.tsx")
text = path.read_text()

old_helpers = '''function entryServiceNames(row: any) {
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
new_helpers = '''function entryServiceItems(row: any) {
  const items = Array.isArray(row?.service_items) ? row.service_items : [];
  if (items.length) return items;
  const rawNames = Array.isArray(row?.service_names) ? row.service_names : [];
  if (rawNames.length) return rawNames.map((name: unknown) => ({ name: String(name ?? "").trim(), price_snapshot: null, status: "completed" })).filter((item: any) => item.name);
  const fallback = String(row?.service_name_snapshot ?? "").trim();
  return [{ name: fallback || "Serviço", price_snapshot: null, status: "completed" }];
}

function entryServiceLabel(row: any) {
  return entryServiceItems(row).map((item: any) => item.price_snapshot == null ? item.name : `${item.name} (${money(item.price_snapshot)})`).join(" • ");
}
'''
text = replace_once(text, old_helpers, new_helpers, "finance staging item helpers")

pattern = re.compile(r'''  const reportEntries = entries\.data \?\? \[\];.*?\n  return \{\n    dashboard:''', re.S)
replacement = '''  const reportEntries = entries.data ?? [];
  const serviceItemsByEntry = new Map<string, any[]>();
  const entryIds = Array.from(new Set(reportEntries.map((row: any) => String(row.entry_id ?? row.id ?? "")).filter(Boolean)));

  if (entryIds.length) {
    const entryLinks: any[] = [];
    for (let index = 0; index < entryIds.length; index += 100) {
      const chunk = entryIds.slice(index, index + 100);
      const result = await db.from("financial_entries").select("id,appointment_id").in("id", chunk);
      if (!result.error) entryLinks.push(...(result.data ?? []));
    }

    const appointmentIds = Array.from(new Set(entryLinks.map((row: any) => String(row.appointment_id ?? "")).filter(Boolean)));
    const serviceItemsByAppointment = new Map<string, any[]>();

    for (let index = 0; index < appointmentIds.length; index += 100) {
      const chunk = appointmentIds.slice(index, index + 100);
      const result = await db
        .from("appointment_services")
        .select("appointment_id,position,price_snapshot,status,service:services(name)")
        .in("appointment_id", chunk)
        .order("position", { ascending: true });
      if (result.error) continue;

      for (const row of result.data ?? []) {
        const service = Array.isArray(row.service) ? row.service[0] : row.service;
        const name = String(service?.name ?? "").trim();
        const appointmentId = String(row.appointment_id ?? "");
        if (!appointmentId || !name) continue;
        const items = serviceItemsByAppointment.get(appointmentId) ?? [];
        items.push({ name, price_snapshot: Number(row.price_snapshot ?? 0), status: row.status ?? "completed", position: Number(row.position ?? 0) });
        serviceItemsByAppointment.set(appointmentId, items);
      }
    }

    for (const row of entryLinks) {
      const entryId = String(row.id ?? "");
      const appointmentId = String(row.appointment_id ?? "");
      const items = serviceItemsByAppointment.get(appointmentId) ?? [];
      if (entryId && items.length) serviceItemsByEntry.set(entryId, items);
    }
  }

  const enrichedEntries = reportEntries.map((row: any) => {
    const entryId = String(row.entry_id ?? row.id ?? "");
    const serviceItems = serviceItemsByEntry.get(entryId);
    return serviceItems?.length ? { ...row, service_items: serviceItems, service_names: serviceItems.map((item: any) => item.name) } : row;
  });

  return {
    dashboard:'''
if "const serviceItemsByEntry = new Map" not in text:
    text, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise SystemExit("anchor not found: finance staging enrichment block")

old_entry = '''              <p className="mt-1 whitespace-normal break-words text-xs leading-5 text-muted-foreground">
                <span className="font-medium text-foreground/80">Serviços:</span>{" "}
                {entryServiceLabel(row)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.professional_name_snapshot || "Profissional"}
              </p>'''
new_entry = '''              <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">Serviços realizados:</span>
                {entryServiceItems(row).map((item: any, index: number) => (
                  <div key={`${item.name}-${index}`} className="flex max-w-xl items-start justify-between gap-3 rounded-lg bg-muted/40 px-2.5 py-1.5">
                    <span className="min-w-0 break-words">{item.name}</span>
                    {item.price_snapshot == null ? null : <strong className="shrink-0 font-medium text-foreground/80">{money(item.price_snapshot)}</strong>}
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {row.professional_name_snapshot || "Profissional"}
              </p>'''
text = replace_once(text, old_entry, new_entry, "finance staging entry item list")
path.write_text(text)
