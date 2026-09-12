from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Admin overview query + service catalog default session count.
# ---------------------------------------------------------------------------
path = Path("src/routes/admin.tsx")
text = path.read_text()

text = replace_once(
    text,
    'appointment_services(service_id, position, price_snapshot, status, completed_at, completed_by, service:services!appointment_services_service_id_fkey(id, name, price, duration_min)), appointment_sessions(id, session_number, scheduled_date, scheduled_time, status, completed_at, completed_by)',
    'appointment_services(service_id, position, price_snapshot, session_count, status, completed_at, completed_by, service:services!appointment_services_service_id_fkey(id, name, price, duration_min, session_count)), appointment_sessions(id, service_id, service_name_snapshot, service_position, session_number, scheduled_date, scheduled_time, status, completed_at, completed_by)',
    "admin overview package fields",
)
text = replace_once(
    text,
    'id, slug, name, category_id, professional, professional_role, duration_min, price, rating, reviews_count, summary, description, includes, preparation, is_active',
    'id, slug, name, category_id, professional, professional_role, duration_min, price, rating, reviews_count, summary, description, includes, preparation, session_count, is_active',
    "service session count select",
)
text = replace_once(
    text,
    '  const [duration, setDuration] = useState(String(service?.duration_min ?? 30));\n  const [price, setPrice] = useState(String(service?.price ?? ""));',
    '  const [duration, setDuration] = useState(String(service?.duration_min ?? 30));\n  const [sessionCount, setSessionCount] = useState(String(service?.session_count ?? 1));\n  const [price, setPrice] = useState(String(service?.price ?? ""));',
    "service editor session state",
)
text = replace_once(
    text,
    '      duration_min: Number(duration) || 30,\n      price: Number(price.replace(",", ".")) || 0,',
    '      duration_min: Number(duration) || 30,\n      session_count: Math.min(50, Math.max(1, Number(sessionCount) || 1)),\n      price: Number(price.replace(",", ".")) || 0,',
    "service editor session payload",
)
text = replace_once(
    text,
    '      setDuration("30");\n      setPrice("");',
    '      setDuration("30");\n      setSessionCount("1");\n      setPrice("");',
    "service editor session reset",
)
text = replace_once(
    text,
    '''          <Field label="Duração" hint="Tempo médio do atendimento, em minutos.">
            <Input type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Ex.: 60" />
          </Field>
          <Field label="Valor do serviço" hint="Preço integral antes de promoções ou sinal de pagamento.">''',
    '''          <Field label="Duração" hint="Tempo médio do atendimento, em minutos.">
            <Input type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Ex.: 60" />
          </Field>
          <Field label="Sessões padrão" hint="Use 1 para serviço avulso. Ex.: combo com 3 sessões = 3.">
            <Input type="number" min="1" max="50" value={sessionCount} onChange={(e) => setSessionCount(e.target.value)} placeholder="1" />
          </Field>
          <Field label="Valor do serviço" hint="Preço integral antes de promoções ou sinal de pagamento.">''',
    "service editor session input",
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Admin appointments: independent sessions per service, scheduling and reopen.
# ---------------------------------------------------------------------------
path = Path("src/components/admin-appointments-workspace.tsx")
text = path.read_text()

text = replace_once(
    text,
    '''function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
''',
    '''function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function serviceSessionCount(service: any) {
  const explicit = Number(service?.session_count ?? 0);
  if (Number.isInteger(explicit) && explicit >= 1) return Math.min(50, explicit);
  const normalized = String(service?.name ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();
  const match = normalized.match(/\\b([1-9]|[1-4][0-9]|50)\\s*(?:sessao|sessoes|sess)\\b/i);
  return match ? Math.min(50, Math.max(1, Number(match[1]))) : 1;
}
''',
    "session count helper",
)
text = replace_once(
    text,
    '''function appointmentSessionItems(item: any) {
  return [...(item?.appointment_sessions ?? [])]
    .sort((a: any, b: any) => Number(a.session_number ?? 0) - Number(b.session_number ?? 0));
}''',
    '''function appointmentSessionItems(item: any) {
  return [...(item?.appointment_sessions ?? [])]
    .sort((a: any, b: any) => Number(a.service_position ?? 0) - Number(b.service_position ?? 0) || Number(a.session_number ?? 0) - Number(b.session_number ?? 0));
}''',
    "session ordering",
)
text = replace_once(
    text,
    'appointment_services(service_id, position, price_snapshot, status, completed_at, completed_by, service:services!appointment_services_service_id_fkey(name, price, duration_min)), appointment_sessions(id, session_number, scheduled_date, scheduled_time, status, completed_at, completed_by)',
    'appointment_services(service_id, position, price_snapshot, session_count, status, completed_at, completed_by, service:services!appointment_services_service_id_fkey(name, price, duration_min, session_count)), appointment_sessions(id, service_id, service_name_snapshot, service_position, session_number, scheduled_date, scheduled_time, status, completed_at, completed_by)',
    "fetch appointment package fields",
)

remove_anchor = '''  const removeAppointment = async (appointment: any) => {
    if (!window.confirm(`Cancelar e arquivar o agendamento de ${appointment.patient_name}? Ele continuará no histórico e poderá ser reagendado depois.`)) return;
    setDeletingId(appointment.id);
    const { error } = await db.from("appointments").update({ status: "cancelado", status_updated_at: new Date().toISOString() }).eq("id", appointment.id);
    setDeletingId(null);
    if (error) { toast.error(error.message); return; }
    if (selected?.id === appointment.id) setSelected((current: any) => current ? { ...current, status: "cancelado" } : current);
    if (incoming?.id === appointment.id) setIncoming(null);
    toast.success("Agendamento cancelado e arquivado.", { description: "Ele pode ser editado e reagendado pelo Histórico." });
    setScope("history");
    onRefresh();
  };
'''
remove_replacement = remove_anchor + '''
  const reopenAppointment = async (appointment: any) => {
    if (!window.confirm(`Reabrir o atendimento de ${appointment.patient_name}? Se houver valor reconhecido no financeiro, ele volta a ficar pendente até o atendimento ser finalizado novamente.`)) return;
    setBusyAction(true);
    const result = await db.rpc("reopen_appointment", { _appointment_id: appointment.id });
    setBusyAction(false);
    if (result.error) {
      toast.error("Não foi possível reabrir o atendimento.", { description: result.error.message });
      return;
    }
    setSelected((current: any) => current?.id === appointment.id ? { ...current, status: "confirmado" } : current);
    toast.success("Atendimento reaberto.", { description: "Ele voltou para Confirmados e poderá ser finalizado novamente quando necessário." });
    setScope("accepted");
    onRefresh();
  };
'''
text = replace_once(text, remove_anchor, remove_replacement, "reopen appointment action")

text = replace_once(
    text,
    'onDelete={() => removeAppointment(appointment)} onAttended={() => completeAttendance(appointment)} deleting={deletingId === appointment.id}',
    'onDelete={() => removeAppointment(appointment)} onAttended={() => completeAttendance(appointment)} onReopen={() => reopenAppointment(appointment)} deleting={deletingId === appointment.id}',
    "card reopen handler",
)
text = replace_once(
    text,
    'onPriceSaved={(value: number) => { setSelected((current: any) => current ? { ...current, service_price_snapshot: value, balance_amount: value } : current); onRefresh(); }} onRefresh={onRefresh} busy={busyAction}',
    'onPriceSaved={(value: number) => { setSelected((current: any) => current ? { ...current, service_price_snapshot: value, balance_amount: value } : current); onRefresh(); }} onReopen={() => selected && reopenAppointment(selected)} onRefresh={onRefresh} busy={busyAction}',
    "dialog reopen handler",
)
text = replace_once(
    text,
    'function AdminAppointmentCard({ appointment, onOpen, onEdit, onDelete, onAttended, deleting }: any) {',
    'function AdminAppointmentCard({ appointment, onOpen, onEdit, onDelete, onAttended, onReopen, deleting }: any) {',
    "card reopen prop",
)
text = replace_once(
    text,
    '''    {appointment.status === "atendido" ? <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-[11px] font-semibold text-emerald-800">Atendido · valor já contabilizado na receita</div> : null}
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-border/70 pt-3">''',
    '''    {appointment.status === "atendido" ? <div className="mt-3 space-y-2"><div className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-[11px] font-semibold text-emerald-800">Atendido · valor já contabilizado na receita</div>{!combo.isCombo ? <Button type="button" size="sm" variant="outline" className="w-full rounded-xl" disabled={attendanceBusy} onClick={onReopen}><Pencil className="size-4" /> Reabrir atendimento</Button> : null}</div> : null}
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-border/70 pt-3">''',
    "card reopen button",
)

text = replace_once(
    text,
    '  const [sessionCount, setSessionCount] = useState("1");',
    '  const [sessionCounts, setSessionCounts] = useState<Record<string, string>>({});',
    "per-service session state",
)
text = replace_once(
    text,
    'db.from("services").select("id, name, price, duration_min, is_active").eq("is_active", true).order("name")',
    'db.from("services").select("id, name, price, duration_min, session_count, is_active").eq("is_active", true).order("name")',
    "catalog session count",
)
text = replace_once(
    text,
    '    setSessionCount(String(Math.max(1, appointmentSessionItems(editing).length || 1)));',
    '''    setSessionCounts(Object.fromEntries((editing.appointment_services ?? []).map((item: any) => {
      const serviceId = item.service_id ?? item.service?.id;
      const linkedSessions = appointmentSessionItems(editing).filter((session: any) => session.service_id === serviceId).length;
      return [serviceId, String(Math.max(1, Number(item.session_count) || linkedSessions || serviceSessionCount(item.service)))];
    }).filter(([serviceId]: any) => Boolean(serviceId))));''',
    "editing per-service counts",
)
text = replace_once(
    text,
    '''      const total = next.reduce((sum, serviceId) => sum + Number(services.find((service) => service.id === serviceId)?.price ?? 0), 0);
      setAppointmentValue(total.toFixed(2));
      return next;''',
    '''      const total = next.reduce((sum, serviceId) => sum + Number(services.find((service) => service.id === serviceId)?.price ?? 0), 0);
      setAppointmentValue(total.toFixed(2));
      setSessionCounts((currentCounts) => {
        const updated = { ...currentCounts };
        if (next.includes(id)) {
          const service = services.find((item) => item.id === id);
          if (!updated[id]) updated[id] = String(serviceSessionCount(service));
        } else {
          delete updated[id];
        }
        return updated;
      });
      return next;''',
    "toggle per-service sessions",
)
text = replace_once(
    text,
    'setScheduledTime(""); setSessionCount("1"); setNotes("");',
    'setScheduledTime(""); setSessionCounts({}); setNotes("");',
    "reset per-service sessions",
)
text = replace_once(
    text,
    '''    const parsedSessionCount = Number(sessionCount);
    if (!Number.isInteger(parsedSessionCount) || parsedSessionCount < 1 || parsedSessionCount > 50) { toast.error("Informe entre 1 e 50 sessões."); return; }
    const total = Math.round((parsedValue + Number.EPSILON) * 100) / 100;''',
    '''    const serviceCountsPayload = Object.fromEntries(serviceIds.map((serviceId) => {
      const service = services.find((item) => item.id === serviceId);
      const parsed = Number(sessionCounts[serviceId] ?? serviceSessionCount(service));
      return [serviceId, parsed];
    }));
    if (Object.values(serviceCountsPayload).some((value: any) => !Number.isInteger(value) || value < 1 || value > 50)) { toast.error("Informe entre 1 e 50 sessões para cada serviço."); return; }
    const total = Math.round((parsedValue + Number.EPSILON) * 100) / 100;''',
    "validate per-service counts",
)
text = replace_once(
    text,
    '''      const configured = await db.rpc("configure_appointment_sessions", {
        _appointment_id: appointmentId,
        _session_count: parsedSessionCount,
        _first_date: scheduledDate,
        _first_time: scheduledTime,
      });''',
    '''      const configured = await db.rpc("configure_appointment_service_sessions", {
        _appointment_id: appointmentId,
        _service_counts: serviceCountsPayload,
        _first_date: scheduledDate,
        _first_time: scheduledTime,
      });''',
    "configure per-service sessions",
)
text = replace_once(
    text,
    '''    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="admin-session-count">Quantidade de sessões *</Label><Input id="admin-session-count" type="number" min="1" max="50" step="1" inputMode="numeric" value={sessionCount} onChange={(e) => setSessionCount(e.target.value)} disabled={saving} /><p className="text-[11px] text-muted-foreground">Ex.: combo de 3 sessões. A primeira usa a data deste agendamento; depois você define ou altera a data de cada próxima sessão.</p></div>''',
    '''    <div className="space-y-2 sm:col-span-2"><Label>Sessões por serviço *</Label><div className="grid gap-2 sm:grid-cols-2">{selectedServices.map((service: any) => <div key={service.id} className="rounded-xl border border-border bg-card p-3"><p className="truncate text-xs font-semibold">{service.name}</p><div className="mt-2 flex items-center gap-2"><Input type="number" min="1" max="50" step="1" inputMode="numeric" value={sessionCounts[service.id] ?? String(serviceSessionCount(service))} onChange={(e) => setSessionCounts((current) => ({ ...current, [service.id]: e.target.value }))} disabled={saving} /><span className="shrink-0 text-[11px] text-muted-foreground">sessão(ões)</span></div></div>)}</div><p className="text-[11px] text-muted-foreground">Cada serviço controla suas próprias sessões. Ex.: dois combos de 3 sessões geram 6 sessões independentes, 3 para cada combo.</p></div>''',
    "per-service session inputs",
)
text = replace_once(
    text,
    '<strong className="text-sm">Sessão {item.session_number}</strong>',
    '<div className="min-w-0"><p className="max-w-[360px] truncate text-[11px] font-semibold text-primary">{item.service_name_snapshot ?? "Serviço"}</p><strong className="text-sm">Sessão {item.session_number}</strong></div>',
    "session service label",
)
text = replace_once(
    text,
    'function AppointmentAdminDialog({ appointment, open, onOpenChange, onConfirm, onCancel, onAttended, onEdit, onPriceSaved, onRefresh, busy }: any) {',
    'function AppointmentAdminDialog({ appointment, open, onOpenChange, onConfirm, onCancel, onAttended, onEdit, onPriceSaved, onReopen, onRefresh, busy }: any) {',
    "dialog reopen prop",
)
text = replace_once(
    text,
    '''    {appointment.status === "atendido" ? <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-800">Atendimento concluído · receita contabilizada</div> : null}
  </DialogContent></Dialog>;''',
    '''    {appointment.status === "atendido" ? <div className="mt-4 space-y-2"><div className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-800">Atendimento concluído · receita contabilizada</div>{!combo.isCombo ? <Button type="button" variant="outline" className="w-full rounded-xl" disabled={busy} onClick={onReopen}><Pencil className="size-4" /> Reabrir atendimento</Button> : null}</div> : null}
  </DialogContent></Dialog>;''',
    "dialog reopen button",
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Client profile: dates for each session, service labels and automatic history.
# ---------------------------------------------------------------------------
path = Path("src/components/client-profile-dialog.tsx")
text = path.read_text()

text = replace_once(
    text,
    '''const serviceSessionCount = (service: any) => {
  const metadata = [''',
    '''const serviceSessionCount = (service: any) => {
  const explicit = Number(service?.session_count ?? 0);
  if (Number.isInteger(explicit) && explicit >= 1) return Math.min(50, explicit);
  const metadata = [''',
    "client service explicit session count",
)
text = replace_once(
    text,
    'service:services!appointments_service_id_fkey(name,price),professional:professionals(name),appointment_sessions(id,session_number,scheduled_date,scheduled_time,status,completed_at),appointment_services(service_id,position,price_snapshot,status,service:services!appointment_services_service_id_fkey(name,price))',
    'service:services!appointments_service_id_fkey(name,price,session_count),professional:professionals(name),appointment_sessions(id,service_id,service_name_snapshot,service_position,session_number,scheduled_date,scheduled_time,status,completed_at),appointment_services(service_id,position,price_snapshot,session_count,status,service:services!appointment_services_service_id_fkey(name,price,session_count))',
    "client appointment per-service fields",
)
text = replace_once(
    text,
    'db.from("services").select("id,name,price,duration_min,summary,description,includes").eq("is_active", true).order("name")',
    'db.from("services").select("id,name,price,duration_min,summary,description,includes,session_count").eq("is_active", true).order("name")',
    "client services session count select",
)
text = replace_once(
    text,
    '  const [appointmentSessionSaving, setAppointmentSessionSaving] = useState("");\n  const [activeTab, setActiveTab] = useState("profile");',
    '  const [appointmentSessionSaving, setAppointmentSessionSaving] = useState("");\n  const [appointmentSessionDrafts, setAppointmentSessionDrafts] = useState<Record<string, { date: string; time: string }>>({});\n  const [activeTab, setActiveTab] = useState("profile");',
    "client session drafts state",
)

sync_anchor = '''  useEffect(() => {
    if (!client) return;
    setName(client.name ?? "");'''
sync_insert = '''  useEffect(() => {
    const drafts: Record<string, { date: string; time: string }> = {};
    for (const appointment of query.data?.appointments ?? []) {
      for (const session of appointment.appointment_sessions ?? []) {
        drafts[session.id] = { date: session.scheduled_date ?? "", time: String(session.scheduled_time ?? "").slice(0, 5) };
      }
    }
    setAppointmentSessionDrafts(drafts);
  }, [query.data?.appointments]);

'''
if sync_insert not in text:
    if sync_anchor not in text:
        raise SystemExit("anchor not found: client session drafts sync")
    text = text.replace(sync_anchor, sync_insert + sync_anchor, 1)

completion_anchor = '''  const setAppointmentSessionCompletion = async (appointment: any, session: any, completed: boolean) => {'''
schedule_action = '''  const saveAppointmentSessionSchedule = async (session: any) => {
    const draft = appointmentSessionDrafts[session.id] ?? { date: session.scheduled_date ?? "", time: String(session.scheduled_time ?? "").slice(0, 5) };
    if (!draft.date || !draft.time) {
      toast.error("Informe a data e o horário da sessão.");
      return undefined;
    }
    setAppointmentSessionSaving(`date-${session.id}`);
    const result = await db.rpc("update_appointment_session_schedule", {
      _session_id: session.id,
      _scheduled_date: draft.date,
      _scheduled_time: draft.time,
    });
    setAppointmentSessionSaving("");
    if (result.error) {
      toast.error("Não foi possível salvar a próxima data.", { description: result.error.message });
      return undefined;
    }
    toast.success(`Sessão ${session.session_number} agendada para ${dateLabel(draft.date)} às ${draft.time}.`);
    await refresh();
    await onUpdated?.();
    return undefined;
  };

  const reopenAppointment = async (appointment: any) => {
    if (!window.confirm("Reabrir este atendimento? O valor reconhecido no financeiro ficará pendente até a conclusão novamente.")) return undefined;
    setAppointmentSessionSaving(`reopen-${appointment.id}`);
    const result = await db.rpc("reopen_appointment", { _appointment_id: appointment.id });
    setAppointmentSessionSaving("");
    if (result.error) {
      toast.error("Não foi possível reabrir o atendimento.", { description: result.error.message });
      return undefined;
    }
    toast.success("Atendimento reaberto.");
    await refresh();
    await onUpdated?.();
    return undefined;
  };

'''
if schedule_action not in text:
    if completion_anchor not in text:
        raise SystemExit("anchor not found: client schedule action")
    text = text.replace(completion_anchor, schedule_action + completion_anchor, 1)

profile_save_anchor = '''                <div className="flex justify-end"><Button onClick={saveProfile} disabled={saving}><Save className="size-4" /> {saving ? "Salvando..." : "Salvar ficha"}</Button></div>'''
profile_history = '''                <section className="rounded-2xl border border-primary/10 bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-2"><Stethoscope className="size-4 text-primary" /><h3 className="font-semibold">Serviços e combos na ficha</h3></div>
                  <p className="mt-1 text-xs text-muted-foreground">Esta lista é alimentada automaticamente pelos agendamentos e combos deste cliente.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(query.data?.appointments ?? []).length === 0 ? <div className="sm:col-span-2 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhum serviço vinculado ainda.</div> : (query.data?.appointments ?? []).slice(0, 12).map((appointment: any) => { const linked = [...(appointment.appointment_services ?? [])].sort((a: any,b: any) => Number(a.position)-Number(b.position)); const names = linked.length ? linked.map((item: any) => item.service?.name ?? "Serviço") : [appointment.service?.name ?? "Serviço"]; const sessions = appointment.appointment_sessions ?? []; return <div key={`profile-service-${appointment.id}`} className="rounded-xl border border-primary/10 bg-primary/[0.035] p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-semibold">{names.join(" + ")}</p><p className="mt-1 text-[11px] text-muted-foreground">{dateLabel(appointment.scheduled_date)} · {statusLabel[appointment.status] ?? appointment.status}</p></div>{sessions.length > 1 ? <Badge variant="secondary" className="shrink-0">{sessions.filter((item: any) => item.status === "completed").length}/{sessions.length} sessões</Badge> : null}</div></div>; })}
                  </div>
                </section>
                <div className="flex justify-end"><Button onClick={saveProfile} disabled={saving}><Save className="size-4" /> {saving ? "Salvando..." : "Salvar ficha"}</Button></div>'''
text = replace_once(text, profile_save_anchor, profile_history, "automatic services in profile")

old_sessions = '''                    {sessions.length > 1 ? <div className="mt-3 rounded-xl border border-primary/10 bg-primary/[0.045] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">Sessões do pacote</p><span className="text-[11px] text-muted-foreground">Desmarcar uma sessão retira o valor dos resultados até concluir todas novamente.</span></div><div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{sessions.map((session: any) => { const done = session.status === "completed"; const canManage = ["confirmado", "atendido"].includes(appointment.status); return <label key={session.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${done ? "border-emerald-200 bg-emerald-50/70" : "border-primary/10 bg-background"}`}><input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={done} disabled={!canManage || appointmentSessionSaving === session.id} onChange={(event) => void setAppointmentSessionCompletion(appointment, session, event.target.checked)} /><span><strong>Sessão {session.session_number}</strong> · {done ? "Concluída" : "Pendente"}<br/><span className="text-muted-foreground">{session.scheduled_date ? dateLabel(session.scheduled_date) : "Data a definir"}</span></span></label>; })}</div></div> : null}
                    {appointment.notes ?'''
new_sessions = '''                    {sessions.length > 1 ? <div className="mt-3 rounded-xl border border-primary/10 bg-primary/[0.045] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">Sessões dos serviços</p><span className="text-[11px] text-muted-foreground">Cada combo possui suas próprias sessões e próximas datas.</span></div><div className="mt-2 grid gap-2 sm:grid-cols-2">{sessions.map((session: any) => { const done = session.status === "completed"; const canManage = ["confirmado", "atendido"].includes(appointment.status); const draft = appointmentSessionDrafts[session.id] ?? { date: session.scheduled_date ?? "", time: String(session.scheduled_time ?? "").slice(0,5) }; const serviceName = session.service_name_snapshot ?? services.find((item: any) => item.service_id === session.service_id)?.service?.name ?? appointment.service?.name ?? "Serviço"; return <div key={session.id} className={`rounded-lg border p-2.5 text-xs ${done ? "border-emerald-200 bg-emerald-50/70" : "border-primary/10 bg-background"}`}><label className="flex cursor-pointer items-start gap-2"><input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={done} disabled={!canManage || appointmentSessionSaving === session.id} onChange={(event) => void setAppointmentSessionCompletion(appointment, session, event.target.checked)} /><span className="min-w-0"><span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-primary">{serviceName}</span><strong>Sessão {session.session_number}</strong> · {done ? "Concluída" : "Pendente"}</span></label>{!done ? <div className="mt-2 grid gap-1.5 grid-cols-[1fr_96px_auto]"><Input type="date" className="h-8 text-xs" value={draft.date} onChange={(event) => setAppointmentSessionDrafts((current) => ({ ...current, [session.id]: { ...draft, date: event.target.value } }))} disabled={!canManage || appointmentSessionSaving === `date-${session.id}`} /><Input type="time" className="h-8 text-xs" value={draft.time} onChange={(event) => setAppointmentSessionDrafts((current) => ({ ...current, [session.id]: { ...draft, time: event.target.value } }))} disabled={!canManage || appointmentSessionSaving === `date-${session.id}`} /><Button type="button" size="sm" variant="outline" className="h-8 px-2 text-[10px]" onClick={() => void saveAppointmentSessionSchedule(session)} disabled={!canManage || appointmentSessionSaving === `date-${session.id}`}>{appointmentSessionSaving === `date-${session.id}` ? "..." : "Salvar"}</Button></div> : <p className="mt-1.5 text-[11px] text-muted-foreground">{session.scheduled_date ? `${dateLabel(session.scheduled_date)}${session.scheduled_time ? ` às ${String(session.scheduled_time).slice(0,5)}` : ""}` : "Data não informada"}</p>}</div>; })}</div></div> : null}
                    {appointment.status === "atendido" && sessions.length <= 1 ? <div className="mt-3"><Button type="button" size="sm" variant="outline" disabled={appointmentSessionSaving === `reopen-${appointment.id}`} onClick={() => void reopenAppointment(appointment)}><Pencil className="size-4" /> Reabrir atendimento</Button></div> : null}
                    {appointment.notes ?'''
text = replace_once(text, old_sessions, new_sessions, "client per-service session scheduling")
path.write_text(text)
