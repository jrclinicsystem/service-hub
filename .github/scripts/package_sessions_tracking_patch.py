from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Admin route: load numbered package sessions + payment state.
# ---------------------------------------------------------------------------
path = Path("src/routes/admin.tsx")
text = path.read_text()
text = replace_once(
    text,
    'payment_choice, service_price_snapshot, deposit_percent, deposit_amount, balance_amount, service:services!appointments_service_id_fkey(id, name, price, duration_min), appointment_services(service_id, position, price_snapshot, status, completed_at, completed_by, service:services!appointment_services_service_id_fkey(id, name, price, duration_min)), professional:professionals(id, name, specialty)',
    'payment_choice, payment_received, payment_method_code, service_price_snapshot, deposit_percent, deposit_amount, balance_amount, service:services!appointments_service_id_fkey(id, name, price, duration_min), appointment_services(service_id, position, price_snapshot, status, completed_at, completed_by, service:services!appointment_services_service_id_fkey(id, name, price, duration_min)), appointment_sessions(id, session_number, scheduled_date, scheduled_time, status, completed_at, completed_by), professional:professionals(id, name, specialty)',
    "admin appointment sessions select",
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Admin agenda: package sessions are operational progress; payment is separate.
# ---------------------------------------------------------------------------
path = Path("src/components/admin-appointments-workspace.tsx")
text = path.read_text()

text = replace_once(
    text,
    '''function appointmentServiceLabel(item: any) {''',
    '''function appointmentSessionItems(item: any) {
  return [...(item?.appointment_sessions ?? [])]
    .sort((a: any, b: any) => Number(a.session_number ?? 0) - Number(b.session_number ?? 0));
}

function appointmentServiceLabel(item: any) {''',
    "session helper",
)

old_progress = '''function appointmentComboProgress(item: any) {
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
}'''
new_progress = '''function appointmentComboProgress(item: any) {
  const sessions = appointmentSessionItems(item);
  if (sessions.length > 1) {
    const completed = sessions.filter((entry: any) => entry.status === "completed").length;
    return {
      items: sessions,
      total: sessions.length,
      completed,
      isCombo: true,
      started: completed > 0,
      allCompleted: completed === sessions.length,
    };
  }
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
}'''
text = replace_once(text, old_progress, new_progress, "package progress helper")

text = replace_once(
    text,
    'payment_choice, service_price_snapshot, deposit_percent, deposit_amount, balance_amount, service:services!appointments_service_id_fkey(name, price, duration_min), appointment_services(service_id, position, price_snapshot, status, completed_at, completed_by, service:services!appointment_services_service_id_fkey(name, price, duration_min)), professional:professionals(name, specialty)',
    'payment_choice, payment_received, payment_method_code, service_price_snapshot, deposit_percent, deposit_amount, balance_amount, service:services!appointments_service_id_fkey(name, price, duration_min), appointment_services(service_id, position, price_snapshot, status, completed_at, completed_by, service:services!appointment_services_service_id_fkey(name, price, duration_min)), appointment_sessions(id, session_number, scheduled_date, scheduled_time, status, completed_at, completed_by), professional:professionals(name, specialty)',
    "detail session query",
)

text = replace_once(
    text,
    '''function paymentLabel(item: any) {
  if (item?.payment_choice === "onsite") return "Presencial";''',
    '''function paymentLabel(item: any) {
  if (item?.payment_received === true) return item?.payment_method_code ? `Pago · ${String(item.payment_method_code).toUpperCase()}` : "Pago";
  if (item?.payment_choice === "onsite") return "Presencial";''',
    "paid package label",
)

text = text.replace("Progresso do combo", "Progresso do pacote")
text = text.replace("{combo.completed} de {combo.total} concluídos", "{combo.completed} de {combo.total} sessões concluídas")
text = text.replace("Combo concluído · pronto para o financeiro", "Todas as sessões concluídas")

# Session count on create/edit form.
text = replace_once(
    text,
    '''  const [scheduledTime, setScheduledTime] = useState("");
  const [notes, setNotes] = useState("");''',
    '''  const [scheduledTime, setScheduledTime] = useState("");
  const [sessionCount, setSessionCount] = useState("1");
  const [notes, setNotes] = useState("");''',
    "session count state",
)
text = replace_once(
    text,
    '''    setScheduledTime(editing.scheduled_time ?? "");
    setNotes(editing.notes ?? "");''',
    '''    setScheduledTime(editing.scheduled_time ?? "");
    setSessionCount(String(Math.max(1, appointmentSessionItems(editing).length || 1)));
    setNotes(editing.notes ?? "");''',
    "edit session count",
)
text = replace_once(
    text,
    '''  const reset = () => { setSelectedClientId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setServiceIds([]); setServiceSearch(""); setAppointmentValue(""); setProfessionalId(""); setScheduledDate(todayIso()); setScheduledTime(""); setNotes(""); };''',
    '''  const reset = () => { setSelectedClientId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setServiceIds([]); setServiceSearch(""); setAppointmentValue(""); setProfessionalId(""); setScheduledDate(todayIso()); setScheduledTime(""); setSessionCount("1"); setNotes(""); };''',
    "reset session count",
)

# Remove the old global block. Session dates are edited in the session manager.
old_guard = '''    if (editing && appointmentComboProgress(editing).started) {
      toast.error("Este combo já possui serviço concluído.", { description: "Para preservar o histórico do pacote, conclua o combo antes de alterar serviços ou reagendar." });
      return;
    }
'''
text = text.replace(old_guard, "", 1)

text = replace_once(
    text,
    '''    const parsedValue = Number(appointmentValue.replace(",", "."));
    if (!Number.isFinite(parsedValue) || parsedValue < 0) { toast.error("Informe um valor válido para o atendimento."); return; }
    const total = Math.round((parsedValue + Number.EPSILON) * 100) / 100;''',
    '''    const parsedValue = Number(appointmentValue.replace(",", "."));
    if (!Number.isFinite(parsedValue) || parsedValue < 0) { toast.error("Informe um valor válido para o atendimento."); return; }
    const parsedSessionCount = Number(sessionCount);
    if (!Number.isInteger(parsedSessionCount) || parsedSessionCount < 1 || parsedSessionCount > 50) { toast.error("Informe entre 1 e 50 sessões."); return; }
    const total = Math.round((parsedValue + Number.EPSILON) * 100) / 100;''',
    "validate session count",
)

old_save_block = '''    let error: any = null;
    if (editing) {
      const result = await db.rpc("update_admin_multi_service_appointment", {
        _appointment_id: editing.id,
        _client_id: selectedClientId || null,
        _patient_name: patientName.trim(),
        _patient_email: patientEmail.trim(),
        _patient_phone: patientPhone.trim(),
        _service_ids: serviceIds,
        _professional_id: professionalId,
        _scheduled_date: scheduledDate,
        _scheduled_time: scheduledTime,
        _notes: notes.trim(),
        _total: total,
      });
      error = result.error;
    } else {
      const conflict = await db.from("appointments").select("id").eq("professional_id", professionalId).eq("scheduled_date", scheduledDate).eq("scheduled_time", scheduledTime).neq("status", "cancelado").limit(1).maybeSingle();
      if (conflict.error) { setSaving(false); toast.error(conflict.error.message); return; }
      if (conflict.data) { setSaving(false); toast.error("Este profissional já possui um agendamento nesse horário."); return; }
      const result = await db.rpc("create_admin_multi_service_appointment", {
        _client_id: selectedClientId || null,
        _patient_name: patientName.trim(),
        _patient_email: patientEmail.trim(),
        _patient_phone: patientPhone.trim(),
        _service_ids: serviceIds,
        _professional_id: professionalId,
        _scheduled_date: scheduledDate,
        _scheduled_time: scheduledTime,
        _notes: notes.trim(),
        _total: total,
      });
      error = result.error;
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }'''
new_save_block = '''    let error: any = null;
    let appointmentId = editing?.id ?? "";
    if (editing) {
      const result = await db.rpc("update_admin_multi_service_appointment", {
        _appointment_id: editing.id,
        _client_id: selectedClientId || null,
        _patient_name: patientName.trim(),
        _patient_email: patientEmail.trim(),
        _patient_phone: patientPhone.trim(),
        _service_ids: serviceIds,
        _professional_id: professionalId,
        _scheduled_date: scheduledDate,
        _scheduled_time: scheduledTime,
        _notes: notes.trim(),
        _total: total,
      });
      error = result.error;
    } else {
      const conflict = await db.from("appointments").select("id").eq("professional_id", professionalId).eq("scheduled_date", scheduledDate).eq("scheduled_time", scheduledTime).neq("status", "cancelado").limit(1).maybeSingle();
      if (conflict.error) { setSaving(false); toast.error(conflict.error.message); return; }
      if (conflict.data) { setSaving(false); toast.error("Este profissional já possui um agendamento nesse horário."); return; }
      const result = await db.rpc("create_admin_multi_service_appointment", {
        _client_id: selectedClientId || null,
        _patient_name: patientName.trim(),
        _patient_email: patientEmail.trim(),
        _patient_phone: patientPhone.trim(),
        _service_ids: serviceIds,
        _professional_id: professionalId,
        _scheduled_date: scheduledDate,
        _scheduled_time: scheduledTime,
        _notes: notes.trim(),
        _total: total,
      });
      error = result.error;
      appointmentId = String(result.data ?? "");
    }
    if (!error && appointmentId) {
      const configured = await db.rpc("configure_appointment_sessions", {
        _appointment_id: appointmentId,
        _session_count: parsedSessionCount,
        _first_date: scheduledDate,
        _first_time: scheduledTime,
      });
      error = configured.error;
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }'''
text = replace_once(text, old_save_block, new_save_block, "configure sessions after appointment save")

# Add session-count control before professional.
form_anchor = '''    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="admin-appointment-value">Valor total do atendimento *</Label><Input id="admin-appointment-value" type="number" min="0" step="0.01" inputMode="decimal" value={appointmentValue} onChange={(e) => setAppointmentValue(e.target.value)} disabled={saving || !serviceIds.length} /><p className="text-[11px] text-muted-foreground">A soma dos serviços é preenchida automaticamente. Altere aqui para aplicar desconto ou valor combinado sem mudar o catálogo.</p></div>
    <div className="space-y-1.5 sm:col-span-2"><Label>Profissional *</Label>'''
form_replacement = '''    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="admin-appointment-value">Valor total do atendimento *</Label><Input id="admin-appointment-value" type="number" min="0" step="0.01" inputMode="decimal" value={appointmentValue} onChange={(e) => setAppointmentValue(e.target.value)} disabled={saving || !serviceIds.length} /><p className="text-[11px] text-muted-foreground">A soma dos serviços é preenchida automaticamente. Altere aqui para aplicar desconto ou valor combinado sem mudar o catálogo.</p></div>
    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="admin-session-count">Quantidade de sessões *</Label><Input id="admin-session-count" type="number" min="1" max="50" step="1" inputMode="numeric" value={sessionCount} onChange={(e) => setSessionCount(e.target.value)} disabled={saving} /><p className="text-[11px] text-muted-foreground">Ex.: combo de 3 sessões. A primeira usa a data deste agendamento; depois você define ou altera a data de cada próxima sessão.</p></div>
    <div className="space-y-1.5 sm:col-span-2"><Label>Profissional *</Label>'''
text = replace_once(text, form_anchor, form_replacement, "session count input")

# Replace old service-completion manager with session manager.
manager_pattern = re.compile(r'function ComboServicesManager\(\{ appointment, onRefresh \}: any\) \{.*?\n\}\n\nfunction AppointmentPriceEditor', re.S)
manager_new = r'''function PackageSessionsManager({ appointment, onRefresh }: any) {
  const [items, setItems] = useState<any[]>(() => appointmentSessionItems(appointment));
  const [busyId, setBusyId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { date: string; time: string }>>({});

  useEffect(() => {
    const next = appointmentSessionItems(appointment);
    setItems(next);
    setDrafts(Object.fromEntries(next.map((item: any) => [item.id, { date: item.scheduled_date ?? "", time: String(item.scheduled_time ?? "").slice(0, 5) }])));
  }, [appointment?.id, appointment?.appointment_sessions]);

  if (items.length <= 1) return null;

  const completed = items.filter((item: any) => item.status === "completed").length;
  const allCompleted = completed === items.length;
  const canManage = ["confirmado", "atendido"].includes(appointment.status);

  const saveSchedule = async (item: any) => {
    const draft = drafts[item.id] ?? { date: "", time: "" };
    if (!draft.date || !draft.time) {
      toast.error("Informe a data e o horário da sessão.");
      return;
    }
    setBusyId(`date-${item.id}`);
    const result = await db.rpc("update_appointment_session_schedule", {
      _session_id: item.id,
      _scheduled_date: draft.date,
      _scheduled_time: draft.time,
    });
    setBusyId("");
    if (result.error) {
      toast.error("Não foi possível alterar a data da sessão.", { description: result.error.message });
      return;
    }
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, scheduled_date: draft.date, scheduled_time: draft.time } : row));
    toast.success(`Sessão ${item.session_number} agendada para ${formatDate(draft.date)} às ${draft.time}.`);
    onRefresh?.();
  };

  const toggle = async (item: any) => {
    const isCompleted = item.status === "completed";
    if (isCompleted && !window.confirm(`Desmarcar a sessão ${item.session_number} como concluída?`)) return;
    if (!isCompleted && !item.scheduled_date) {
      toast.error("Defina a data desta sessão antes de concluí-la.");
      return;
    }
    setBusyId(`done-${item.id}`);
    const result = await db.rpc("set_appointment_session_completion", {
      _session_id: item.id,
      _completed: !isCompleted,
    });
    setBusyId("");
    if (result.error) {
      toast.error("Não foi possível atualizar a sessão.", { description: result.error.message });
      return;
    }
    const now = new Date().toISOString();
    setItems((current) => current.map((row) => row.id === item.id ? {
      ...row,
      status: isCompleted ? "pending" : "completed",
      completed_at: isCompleted ? null : (row.completed_at ?? now),
    } : row));
    toast.success(isCompleted ? `Sessão ${item.session_number} reaberta.` : `Sessão ${item.session_number} concluída.`);
    onRefresh?.();
  };

  return (
    <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Sessões do pacote</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">O pagamento é independente das sessões. Agende e conclua cada sessão na data em que ela acontecer.</p>
        </div>
        <Badge variant={allCompleted ? "default" : "secondary"} className={allCompleted ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}>{completed} de {items.length} concluídas</Badge>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${items.length ? (completed / items.length) * 100 : 0}%` }} />
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item: any) => {
          const done = item.status === "completed";
          const draft = drafts[item.id] ?? { date: item.scheduled_date ?? "", time: String(item.scheduled_time ?? "").slice(0, 5) };
          return (
            <div key={item.id} className={`rounded-xl border p-3 ${done ? "border-emerald-200 bg-emerald-50/70" : "border-border bg-card"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">Sessão {item.session_number}</strong>
                  <Badge variant={done ? "default" : "outline"} className={done ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}>{done ? "Concluída" : "Pendente"}</Badge>
                </div>
                {done && item.completed_at ? <span className="text-[11px] text-muted-foreground">Concluída em {formatDateTime(item.completed_at)}</span> : null}
              </div>
              {done ? (
                <p className="mt-2 text-xs text-muted-foreground">Data da sessão: <strong className="text-foreground">{item.scheduled_date ? formatDate(item.scheduled_date) : "—"}{item.scheduled_time ? ` às ${String(item.scheduled_time).slice(0, 5)}` : ""}</strong></p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px_auto] sm:items-end">
                  <div><Label className="text-[11px]">Data da sessão</Label><Input type="date" value={draft.date} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, date: event.target.value } }))} disabled={!canManage || busyId === `date-${item.id}`} /></div>
                  <div><Label className="text-[11px]">Horário</Label><Input type="time" value={draft.time} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, time: event.target.value } }))} disabled={!canManage || busyId === `date-${item.id}`} /></div>
                  <Button type="button" size="sm" variant="outline" onClick={() => void saveSchedule(item)} disabled={!canManage || busyId === `date-${item.id}`}>{busyId === `date-${item.id}` ? "Salvando..." : item.scheduled_date ? "Alterar data" : "Agendar"}</Button>
                </div>
              )}
              <div className="mt-3 flex justify-end">
                <Button type="button" size="sm" variant={done ? "outline" : "default"} disabled={!canManage || busyId === `done-${item.id}`} onClick={() => void toggle(item)} className="rounded-xl">
                  <Check className="size-4" /> {busyId === `done-${item.id}` ? "Salvando..." : done ? "Desfazer conclusão" : "Marcar sessão concluída"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {allCompleted ? <div className="mt-3 rounded-xl bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800">Todas as sessões do pacote foram concluídas.</div> : <div className="mt-3 rounded-xl bg-primary-soft/60 px-3 py-2 text-xs text-muted-foreground">As sessões pendentes continuam no pacote mesmo que o valor total já tenha sido pago. A data principal da agenda acompanha a próxima sessão pendente agendada.</div>}
    </div>
  );
}

function AppointmentPriceEditor'''
text, count = manager_pattern.subn(manager_new, text, count=1)
if count != 1:
    raise SystemExit("package session manager anchor not found")
text = text.replace('<ComboServicesManager appointment={appointment} onRefresh={onRefresh} />', '<PackageSessionsManager appointment={appointment} onRefresh={onRefresh} />', 1)

path.write_text(text)


# ---------------------------------------------------------------------------
# Finance standard payment: allow upfront payment while package sessions remain.
# ---------------------------------------------------------------------------
path = Path("src/components/finance-attendance-completion.tsx")
text = path.read_text()
text = replace_once(
    text,
    '''function comboReady(appointment: any) {
  const items = comboItems(appointment);
  return items.length <= 1 || items.every((item: any) => item.status === "completed");
}
''',
    '''function packageSessions(appointment: any) {
  return [...(appointment?.appointment_sessions ?? [])].sort(
    (a: any, b: any) => Number(a.session_number ?? 0) - Number(b.session_number ?? 0),
  );
}
''',
    "finance package helper",
)
text = replace_once(
    text,
    'appointment_services(service_id,position,price_snapshot,status,completed_at,service:services!appointment_services_service_id_fkey(name,price)),professional:professionals(name)',
    'appointment_services(service_id,position,price_snapshot,status,completed_at,service:services!appointment_services_service_id_fkey(name,price)),appointment_sessions(id,session_number,scheduled_date,scheduled_time,status,completed_at),financial_entries(id,status),professional:professionals(name)',
    "finance session select",
)
text = replace_once(
    text,
    '''    appointments: appointments.data ?? [],''',
    '''    appointments: (appointments.data ?? []).filter((row: any) => !(row.financial_entries ?? []).some((entry: any) => !["cancelled", "refunded"].includes(entry.status))),''',
    "hide already-paid packages",
)
text = replace_once(
    text,
    '''  const selectedItems = useMemo(() => comboItems(selected), [selected]);
  const selectedReady = comboReady(selected);''',
    '''  const selectedItems = useMemo(() => comboItems(selected), [selected]);
  const selectedSessions = useMemo(() => packageSessions(selected), [selected]);''',
    "finance selected sessions",
)
old_finance_guard = '''    if (!comboReady(selected)) {
      toast.error("Ainda existem serviços pendentes neste combo.", { description: "Conclua todos os procedimentos no painel antes de enviar o pacote ao financeiro." });
      return;
    }
'''
text = text.replace(old_finance_guard, "", 1)
text = text.replace("Finalizar atendimento", "Registrar pagamento", 1)
text = text.replace(
    '''              Última etapa do fluxo Confirmado → Atendido → Financeiro. Aqui a recepção informa
              pagamento, desconto, fiado e eventual ajuste manual de comissão antes do faturamento
              nascer.''',
    '''              Registre o pagamento, desconto, fiado e eventual ajuste manual de comissão. Em pacotes,
              o valor pode ser recebido integralmente agora e as sessões continuam sendo acompanhadas
              separadamente até a última conclusão.''',
    1,
)
old_service_progress = '''                {selectedItems.length > 1 ? <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">Serviços do combo</span><Badge variant={selectedReady ? "default" : "secondary"} className={selectedReady ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}>{selectedItems.filter((item: any) => item.status === "completed").length}/{selectedItems.length} concluídos</Badge></div>{selectedItems.map((item: any) => <div key={item.service_id} className="flex items-center justify-between gap-3 rounded-lg bg-background px-2.5 py-2 text-xs"><span className="min-w-0 truncate">{item.status === "completed" ? "✓ " : "○ "}{item.service?.name ?? "Serviço"}</span><strong className="shrink-0">{money(item.price_snapshot ?? item.service?.price)}</strong></div>)}{selectedReady ? <p className="text-[11px] font-semibold text-emerald-700">Combo concluído — pronto para finalizar.</p> : <p className="text-[11px] font-medium text-amber-700">Finalize os serviços pendentes antes do lançamento financeiro.</p>}</div> : null}'''
new_service_progress = '''                {selectedItems.length > 1 ? <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3"><span className="text-xs font-semibold">Serviços incluídos</span>{selectedItems.map((item: any) => <div key={item.service_id} className="flex items-center justify-between gap-3 rounded-lg bg-background px-2.5 py-2 text-xs"><span className="min-w-0 truncate">{item.service?.name ?? "Serviço"}</span><strong className="shrink-0">{money(item.price_snapshot ?? item.service?.price)}</strong></div>)}</div> : null}
                {selectedSessions.length > 1 ? <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">Sessões do pacote</span><Badge variant="outline">{selectedSessions.filter((item: any) => item.status === "completed").length}/{selectedSessions.length} concluídas</Badge></div>{selectedSessions.map((item: any) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-background px-2.5 py-2 text-xs"><span>Sessão {item.session_number} · {item.status === "completed" ? "Concluída" : "Pendente"}</span><span className="text-muted-foreground">{item.scheduled_date ? dateLabel(item.scheduled_date) : "Data a definir"}</span></div>)}<p className="text-[11px] font-medium text-primary">O pagamento pode ser registrado mesmo com sessões pendentes.</p></div> : null}'''
text = replace_once(text, old_service_progress, new_service_progress, "finance package session card")
text = replace_once(
    text,
    '''    toast.success("Atendimento finalizado e enviado ao financeiro.");''',
    '''    const hasPendingPackageSessions = selectedSessions.length > 1 && selectedSessions.some((item: any) => item.status !== "completed");
    toast.success(hasPendingPackageSessions ? "Pagamento do pacote registrado." : "Atendimento finalizado e enviado ao financeiro.", {
      description: hasPendingPackageSessions ? "As sessões pendentes continuam em andamento na Agenda." : undefined,
    });''',
    "finance success message",
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Mixed payment: same decoupling from package execution.
# ---------------------------------------------------------------------------
path = Path("src/components/finance-mixed-payment.tsx")
text = path.read_text()
text = replace_once(
    text,
    '''function comboReady(appointment: any) {
  const items = comboItems(appointment);
  return items.length <= 1 || items.every((item: any) => item.status === "completed");
}
''',
    '''function packageSessions(appointment: any) {
  return [...(appointment?.appointment_sessions ?? [])].sort(
    (a: any, b: any) => Number(a.session_number ?? 0) - Number(b.session_number ?? 0),
  );
}
''',
    "mixed package helper",
)
text = replace_once(
    text,
    'appointment_services(service_id,position,price_snapshot,status,completed_at,service:services!appointment_services_service_id_fkey(name,price)),professional:professionals(name)',
    'appointment_services(service_id,position,price_snapshot,status,completed_at,service:services!appointment_services_service_id_fkey(name,price)),appointment_sessions(id,session_number,scheduled_date,scheduled_time,status,completed_at),financial_entries(id,status),professional:professionals(name)',
    "mixed session select",
)
text = replace_once(
    text,
    '''    appointments: appointments.data ?? [],''',
    '''    appointments: (appointments.data ?? []).filter((row: any) => !(row.financial_entries ?? []).some((entry: any) => !["cancelled", "refunded"].includes(entry.status))),''',
    "mixed hide paid packages",
)
text = replace_once(
    text,
    '''  const selectedItems = useMemo(() => comboItems(selected), [selected]);
  const selectedReady = comboReady(selected);''',
    '''  const selectedItems = useMemo(() => comboItems(selected), [selected]);
  const selectedSessions = useMemo(() => packageSessions(selected), [selected]);''',
    "mixed selected sessions",
)
text = text.replace('    if (!comboReady(selected)) return toast.error("Ainda existem serviços pendentes neste combo. Conclua todos antes do pagamento final.");\n', '', 1)
old_mixed_card = '''                {selectedItems.length > 1 ? <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3">{selectedItems.map((item: any) => <div key={item.service_id} className="flex items-center justify-between gap-2 text-xs"><span>{item.status === "completed" ? "✓" : "○"} {item.service?.name ?? "Serviço"}</span><strong>{money(item.price_snapshot ?? item.service?.price)}</strong></div>)}<p className={`text-[11px] font-semibold ${selectedReady ? "text-emerald-700" : "text-amber-700"}`}>{selectedReady ? "Combo concluído — pronto para o financeiro." : "Há serviços pendentes neste combo."}</p></div> : null}'''
new_mixed_card = '''                {selectedItems.length > 1 ? <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3">{selectedItems.map((item: any) => <div key={item.service_id} className="flex items-center justify-between gap-2 text-xs"><span>{item.service?.name ?? "Serviço"}</span><strong>{money(item.price_snapshot ?? item.service?.price)}</strong></div>)}</div> : null}
                {selectedSessions.length > 1 ? <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3"><strong className="text-xs">Sessões: {selectedSessions.filter((item: any) => item.status === "completed").length}/{selectedSessions.length} concluídas</strong>{selectedSessions.map((item: any) => <div key={item.id} className="flex items-center justify-between gap-2 text-xs"><span>Sessão {item.session_number} · {item.status === "completed" ? "Concluída" : "Pendente"}</span><span className="text-muted-foreground">{item.scheduled_date ? dateLabel(item.scheduled_date) : "Data a definir"}</span></div>)}<p className="text-[11px] font-semibold text-primary">O pagamento pode ser registrado agora; as sessões continuam em andamento.</p></div> : null}'''
text = replace_once(text, old_mixed_card, new_mixed_card, "mixed package card")
text = text.replace('disabled={!selected || busy || !selectedReady}', 'disabled={!selected || busy}', 1)
text = replace_once(
    text,
    '''      toast.success("Atendimento finalizado com pagamento misto.", {
        description: "Cada forma foi registrada separadamente e as taxas foram aplicadas somente na parte correspondente.",
      });''',
    '''      const hasPendingPackageSessions = selectedSessions.length > 1 && selectedSessions.some((item: any) => item.status !== "completed");
      toast.success(hasPendingPackageSessions ? "Pagamento do pacote registrado." : "Atendimento finalizado com pagamento misto.", {
        description: hasPendingPackageSessions ? "As sessões pendentes continuam em andamento na Agenda." : "Cada forma foi registrada separadamente e as taxas foram aplicadas somente na parte correspondente.",
      });''',
    "mixed success message",
)
path.write_text(text)
