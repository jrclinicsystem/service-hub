from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Admin appointments: each appointment is one real visit. Combo/package
# sessions live in the client's saved combo and can be linked to a visit.
# ---------------------------------------------------------------------------
path = Path("src/components/admin-appointments-workspace.tsx")
text = path.read_text()

text = replace_once(
    text,
    '''  const [clients, setClients] = useState<any[]>([]);\n  const [bookingSlots, setBookingSlots] = useState<any[]>([]);''',
    '''  const [clients, setClients] = useState<any[]>([]);\n  const [comboSessions, setComboSessions] = useState<any[]>([]);\n  const [comboSessionsLoading, setComboSessionsLoading] = useState(false);\n  const [selectedComboLinks, setSelectedComboLinks] = useState<string[]>([]);\n  const [bookingSlots, setBookingSlots] = useState<any[]>([]);''',
    "combo session state",
)

catalog_effect_anchor = '''  }, [open]);\n\n  useEffect(() => {\n    if (!open || !editing) return;'''
combo_effect = '''  }, [open]);\n\n  useEffect(() => {\n    if (!open || !selectedClientId) {\n      setComboSessions([]);\n      if (!editing) setSelectedComboLinks([]);\n      return;\n    }\n    let active = true;\n    setComboSessionsLoading(true);\n    void db.rpc("get_client_open_combo_sessions", {\n      _client_id: selectedClientId,\n      _appointment_id: editing?.id ?? null,\n    }).then((result: any) => {\n      if (!active) return;\n      if (result.error) {\n        toast.error("Não foi possível carregar os combos deste cliente.", { description: result.error.message });\n        setComboSessions([]);\n      } else {\n        const rows = Array.isArray(result.data) ? result.data : [];\n        setComboSessions(rows);\n        if (editing) {\n          setSelectedComboLinks(rows.filter((row: any) => row.linked_to_appointment).map((row: any) => `${row.budget_item_id}:${row.session_number}`));\n        }\n      }\n      setComboSessionsLoading(false);\n    });\n    return () => { active = false; };\n  }, [open, selectedClientId, editing?.id]);\n\n  useEffect(() => {\n    if (!open || !editing) return;'''
text = replace_once(text, catalog_effect_anchor, combo_effect, "load client combo sessions")

text = replace_once(
    text,
    '''  const toggleService = (id: string) => {\n    setProfessionalId("");''',
    '''  const toggleService = (id: string) => {\n    const requiredByCombo = selectedComboLinks.some((key) => {\n      const row = comboSessions.find((item: any) => `${item.budget_item_id}:${item.session_number}` === key);\n      return row?.service_id === id;\n    });\n    if (serviceIds.includes(id) && requiredByCombo) {\n      toast.error("Esse serviço está vinculado a uma sessão de combo selecionada. Desmarque a sessão do combo primeiro.");\n      return;\n    }\n    setProfessionalId("");''',
    "protect combo linked service",
)

text = replace_once(
    text,
    '''  const selectSavedClient = (clientId: string) => {\n    setSelectedClientId(clientId);''',
    '''  const selectSavedClient = (clientId: string) => {\n    setSelectedComboLinks([]);\n    setComboSessions([]);\n    setSelectedClientId(clientId);''',
    "reset combo links on client change",
)

text = replace_once(
    text,
    '''  const clearSavedClient = () => {\n    setSelectedClientId("");''',
    '''  const clearSavedClient = () => {\n    setSelectedComboLinks([]);\n    setComboSessions([]);\n    setSelectedClientId("");''',
    "clear combo links",
)

text = replace_once(
    text,
    '''  const reset = () => { setSelectedClientId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setServiceIds([]); setServiceSearch(""); setAppointmentValue(""); setProfessionalId(""); setScheduledDate(todayIso()); setScheduledTime(""); setSessionCounts({}); setNotes(""); };''',
    '''  const reset = () => { setSelectedClientId(""); setSelectedComboLinks([]); setComboSessions([]); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setServiceIds([]); setServiceSearch(""); setAppointmentValue(""); setProfessionalId(""); setScheduledDate(todayIso()); setScheduledTime(""); setSessionCounts({}); setNotes(""); };''',
    "reset combo state",
)

insert_before_reset = '''  const reset = () => { setSelectedClientId(""); setSelectedComboLinks([]); setComboSessions([]); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setServiceIds([]); setServiceSearch(""); setAppointmentValue(""); setProfessionalId(""); setScheduledDate(todayIso()); setScheduledTime(""); setSessionCounts({}); setNotes(""); };'''
toggle_combo = '''  const toggleComboSession = (row: any) => {\n    const key = `${row.budget_item_id}:${row.session_number}`;\n    setSelectedComboLinks((current) => {\n      const exists = current.includes(key);\n      const next = exists\n        ? current.filter((item) => item !== key)\n        : [...current.filter((item) => !item.startsWith(`${row.budget_item_id}:`)), key];\n      const linkedRows = next.map((item) => comboSessions.find((candidate: any) => `${candidate.budget_item_id}:${candidate.session_number}` === item)).filter(Boolean);\n      const linkedServiceIds = [...new Set(linkedRows.map((item: any) => item.service_id).filter(Boolean))] as string[];\n      if (linkedServiceIds.length) {\n        setServiceIds((currentServices) => [...new Set([...currentServices, ...linkedServiceIds])]);\n        setSessionCounts((currentCounts) => Object.fromEntries([...new Set([...Object.keys(currentCounts), ...linkedServiceIds])].map((serviceId) => [serviceId, "1"])));\n      }\n      if (linkedRows.length > 0 && linkedRows.every((item: any) => item.budget_paid)) {\n        setAppointmentValue("0.00");\n      }\n      return next;\n    });\n  };\n\n'''
text = replace_once(text, insert_before_reset, toggle_combo + insert_before_reset, "combo session toggle")

old_counts = '''    const serviceCountsPayload = Object.fromEntries(serviceIds.map((serviceId) => {\n      const service = services.find((item) => item.id === serviceId);\n      const parsed = Number(sessionCounts[serviceId] ?? serviceSessionCount(service));\n      return [serviceId, parsed];\n    }));\n    if (Object.values(serviceCountsPayload).some((value: any) => !Number.isInteger(value) || value < 1 || value > 50)) { toast.error("Informe entre 1 e 50 sessões para cada serviço."); return; }'''
new_counts = '''    // Cada agendamento representa uma única visita. A quantidade total de\n    // sessões pertence ao combo salvo na ficha do cliente, não ao agendamento.\n    const serviceCountsPayload = Object.fromEntries(serviceIds.map((serviceId) => [serviceId, 1]));'''
text = replace_once(text, old_counts, new_counts, "single visit service counts")

configure_anchor = '''    if (!error && appointmentId) {\n      const configured = await db.rpc("configure_appointment_service_sessions", {\n        _appointment_id: appointmentId,\n        _service_counts: serviceCountsPayload,\n        _first_date: scheduledDate,\n        _first_time: scheduledTime,\n      });\n      error = configured.error;\n    }'''
configure_new = '''    if (!error && appointmentId) {\n      const configured = await db.rpc("configure_appointment_service_sessions", {\n        _appointment_id: appointmentId,\n        _service_counts: serviceCountsPayload,\n        _first_date: scheduledDate,\n        _first_time: scheduledTime,\n      });\n      error = configured.error;\n    }\n    if (!error && appointmentId && selectedClientId) {\n      const linksPayload = selectedComboLinks.map((key) => {\n        const [budgetItemId, sessionNumber] = key.split(":");\n        return { budget_item_id: budgetItemId, session_number: Number(sessionNumber) };\n      });\n      const linked = await db.rpc("set_appointment_budget_sessions", {\n        _appointment_id: appointmentId,\n        _links: linksPayload,\n      });\n      error = linked.error;\n    }'''
text = replace_once(text, configure_anchor, configure_new, "link appointment to combo sessions")

client_select_anchor = '''      <p className="text-[11px] text-muted-foreground">Ao selecionar, nome, WhatsApp e e-mail são preenchidos automaticamente.</p>\n    </div>'''
client_select_new = '''      <p className="text-[11px] text-muted-foreground">Ao selecionar, nome, WhatsApp e e-mail são preenchidos automaticamente.</p>\n      {selectedClientId ? <div className="mt-3 rounded-2xl border border-primary/15 bg-primary/[0.04] p-3">\n        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold">Usar sessão de combo (opcional)</p><p className="mt-0.5 text-[11px] text-muted-foreground">Selecione a sessão que esta visita vai consumir. Se o combo já estiver pago, o atendimento fica automaticamente em R$ 0,00.</p></div>{comboSessionsLoading ? <span className="text-[11px] text-muted-foreground">Carregando...</span> : null}</div>\n        {!comboSessionsLoading && comboSessions.length === 0 ? <p className="mt-3 rounded-xl border border-dashed p-3 text-center text-[11px] text-muted-foreground">Nenhuma sessão de combo disponível para este cliente.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{comboSessions.map((row: any) => { const key = `${row.budget_item_id}:${row.session_number}`; const checked = selectedComboLinks.includes(key); return <button key={key} type="button" onClick={() => toggleComboSession(row)} className={`rounded-xl border p-3 text-left transition ${checked ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-secondary/40"}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-semibold">{row.service_name}</p><p className="mt-1 text-[11px] text-muted-foreground">{row.budget_title} · Sessão {row.session_number} de {row.total_sessions}</p></div><Badge variant={row.budget_paid ? "default" : "secondary"} className="shrink-0">{row.budget_paid ? "Pago" : "Não pago"}</Badge></div></button>; })}</div>}\n      </div> : null}\n    </div>'''
text = replace_once(text, client_select_anchor, client_select_new, "combo session picker ui")

old_session_ui = '''    <div className="space-y-2 sm:col-span-2"><Label>Sessões por serviço *</Label><div className="grid gap-2 sm:grid-cols-2">{selectedServices.map((service: any) => <div key={service.id} className="rounded-xl border border-border bg-card p-3"><p className="truncate text-xs font-semibold">{service.name}</p><div className="mt-2 flex items-center gap-2"><Input type="number" min="1" max="50" step="1" inputMode="numeric" value={sessionCounts[service.id] ?? String(serviceSessionCount(service))} onChange={(e) => setSessionCounts((current) => ({ ...current, [service.id]: e.target.value }))} disabled={saving} /><span className="shrink-0 text-[11px] text-muted-foreground">sessão(ões)</span></div></div>)}</div><p className="text-[11px] text-muted-foreground">Cada serviço controla suas próprias sessões. Ex.: dois combos de 3 sessões geram 6 sessões independentes, 3 para cada combo.</p></div>'''
new_session_ui = '''    <div className="sm:col-span-2 rounded-xl border border-primary/10 bg-primary/[0.035] p-3 text-[11px] text-muted-foreground"><strong className="text-foreground">Cada agendamento representa uma visita.</strong> A quantidade total e o progresso das sessões ficam em <strong>Clientes → Orçamentos e combos</strong>. Para cliente com pacote já pago, selecione acima a sessão correspondente e o valor desta visita ficará em R$ 0,00.</div>'''
text = replace_once(text, old_session_ui, new_session_ui, "replace appointment package session ui")

path.write_text(text)


# ---------------------------------------------------------------------------
# Client profile: combo owns session progress/payment; appointments are visits.
# ---------------------------------------------------------------------------
path = Path("src/components/client-profile-dialog.tsx")
text = path.read_text()

text = replace_once(
    text,
    '''    db.from("client_budgets").select("id,client_id,title,notes,status,total_amount,valid_until,created_at,updated_at,client_budget_items(id,service_id,service_name_snapshot,unit_price,sessions,line_total,position,completed_session_numbers)").eq("client_id", clientId).order("created_at", { ascending: false }),''',
    '''    db.from("client_budgets").select("id,client_id,title,notes,status,total_amount,valid_until,is_paid,paid_amount,paid_at,payment_method_code,created_at,updated_at,client_budget_items(id,service_id,service_name_snapshot,unit_price,sessions,line_total,position,completed_session_numbers)").eq("client_id", clientId).order("created_at", { ascending: false }),''',
    "budget payment fields select",
)

text = replace_once(
    text,
    '''  const budgetTotal = useMemo(() => budgetRows.reduce((sum, row) => sum + (Number(String(row.unitPrice).replace(",", ".")) || 0) * Math.max(1, Number(row.sessions) || 1), 0), [budgetRows]);''',
    '''  const budgetTotal = useMemo(() => budgetRows.reduce((sum, row) => sum + (Number(String(row.unitPrice).replace(",", ".")) || 0), 0), [budgetRows]);''',
    "budget total as package value",
)

old_item_save = '''          unit_price: Number(String(row.unitPrice).replace(",", ".")) || 0, sessions: Math.max(1, Number(row.sessions) || 1), position: index + 1,'''
new_item_save = '''          unit_price: (Number(String(row.unitPrice).replace(",", ".")) || 0) / Math.max(1, Number(row.sessions) || 1), sessions: Math.max(1, Number(row.sessions) || 1), position: index + 1,'''
text = replace_once(text, old_item_save, new_item_save, "store per-session derived price")

paid_fn_anchor = '''  const updateBudgetStatus = async (id: string, status: string) => {'''
paid_fn = '''  const setBudgetPaid = async (budget: any, paid: boolean) => {\n    if (paid && !window.confirm(`Marcar ${budget.title} como pago no valor de ${money(budget.total_amount)}? Isso apenas identifica o combo como já pago e não cria uma nova receita no caixa.`)) return undefined;\n    const result = await db.rpc("set_client_budget_paid", { _budget_id: budget.id, _paid: paid });\n    if (result.error) { toast.error("Não foi possível atualizar o pagamento do combo.", { description: result.error.message }); return undefined; }\n    toast.success(paid ? "Combo marcado como pago." : "Pagamento do combo reaberto.", { description: paid ? "Os próximos agendamentos vinculados a esse combo podem ser finalizados em R$ 0,00." : undefined });\n    await refresh();\n    return undefined;\n  };\n\n'''
text = replace_once(text, paid_fn_anchor, paid_fn + paid_fn_anchor, "budget paid action")

text = text.replace("Serviços do combo", "Serviços do atendimento")

text = replace_once(
    text,
    '''                        <Input value={row.unitPrice} onChange={(e) => setBudgetRows((rows) => rows.map((item, i) => i === index ? { ...item, unitPrice: e.target.value } : item))} placeholder="Valor/sessão" />''',
    '''                        <Input value={row.unitPrice} onChange={(e) => setBudgetRows((rows) => rows.map((item, i) => i === index ? { ...item, unitPrice: e.target.value } : item))} placeholder="Valor total do serviço/combo" />''',
    "budget package price placeholder",
)

text = replace_once(
    text,
    '''                    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{budget.title}</p><p className="mt-1 text-xs text-muted-foreground">Criado em {new Date(budget.created_at).toLocaleDateString("pt-BR")}{budget.valid_until ? ` · válido até ${dateLabel(budget.valid_until)}` : ""}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{statusLabel[budget.status] ?? budget.status}</Badge><strong>{money(budget.total_amount)}</strong></div></div>''',
    '''                    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{budget.title}</p><p className="mt-1 text-xs text-muted-foreground">Criado em {new Date(budget.created_at).toLocaleDateString("pt-BR")}{budget.valid_until ? ` · válido até ${dateLabel(budget.valid_until)}` : ""}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{statusLabel[budget.status] ?? budget.status}</Badge><Badge variant={budget.is_paid ? "default" : "secondary"} className={budget.is_paid ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}>{budget.is_paid ? "Pago" : "Não pago"}</Badge><strong>{money(budget.total_amount)}</strong></div></div>''',
    "budget paid badge",
)

text = replace_once(
    text,
    '''<strong>{item.service_name_snapshot}</strong><p className="mt-1 text-xs text-muted-foreground">{item.sessions} sessão(ões) × {money(item.unit_price)} = {money(item.line_total)}</p>''',
    '''<strong>{item.service_name_snapshot}</strong><p className="mt-1 text-xs text-muted-foreground">{item.sessions} sessão(ões) · valor do pacote {money(item.line_total)}</p>''',
    "saved budget package price display",
)

text = replace_once(
    text,
    '''                    <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void updateBudgetStatus(budget.id, "approved")}>Marcar aprovado</Button><Button size="sm" variant="outline" onClick={() => void updateBudgetStatus(budget.id, "declined")}>Marcar recusado</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => void removeBudget(budget.id)}><Trash2 className="size-4" /> Excluir</Button></div>''',
    '''                    <div className="mt-3 rounded-xl border border-primary/10 bg-primary/[0.035] p-3 text-[11px] text-muted-foreground">O pagamento do combo é registrado uma única vez. Depois, cada visita é um agendamento normal vinculado à sessão correspondente; se o combo estiver pago, a visita pode ser finalizada em R$ 0,00 sem nova entrada no caixa.</div>\n                    <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant={budget.is_paid ? "outline" : "default"} onClick={() => void setBudgetPaid(budget, !budget.is_paid)}>{budget.is_paid ? "Desmarcar pago" : "Marcar como pago"}</Button><Button size="sm" variant="outline" onClick={() => void updateBudgetStatus(budget.id, "approved")}>Marcar aprovado</Button><Button size="sm" variant="outline" onClick={() => void updateBudgetStatus(budget.id, "declined")}>Marcar recusado</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => void removeBudget(budget.id)}><Trash2 className="size-4" /> Excluir</Button></div>''',
    "budget paid button and explanation",
)

# Replace profile service list with appointments + saved combos.
old_profile_list = '''                  <div className="mt-3 grid gap-2 sm:grid-cols-2">\n                    {(query.data?.appointments ?? []).length === 0 ? <div className="sm:col-span-2 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhum serviço vinculado ainda.</div> : (query.data?.appointments ?? []).slice(0, 12).map((appointment: any) => { const linked = [...(appointment.appointment_services ?? [])].sort((a: any,b: any) => Number(a.position)-Number(b.position)); const names = linked.length ? linked.map((item: any) => item.service?.name ?? "Serviço") : [appointment.service?.name ?? "Serviço"]; const sessions = appointment.appointment_sessions ?? []; return <div key={`profile-service-${appointment.id}`} className="rounded-xl border border-primary/10 bg-primary/[0.035] p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-semibold">{names.join(" + ")}</p><p className="mt-1 text-[11px] text-muted-foreground">{dateLabel(appointment.scheduled_date)} · {statusLabel[appointment.status] ?? appointment.status}</p></div>{sessions.length > 1 ? <Badge variant="secondary" className="shrink-0">{sessions.filter((item: any) => item.status === "completed").length}/{sessions.length} sessões</Badge> : null}</div></div>; })}\n                  </div>'''
new_profile_list = '''                  <div className="mt-3 grid gap-2 sm:grid-cols-2">\n                    {(query.data?.appointments ?? []).length === 0 && (query.data?.budgets ?? []).length === 0 ? <div className="sm:col-span-2 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhum serviço ou combo vinculado ainda.</div> : null}\n                    {(query.data?.budgets ?? []).slice(0, 8).map((budget: any) => { const items = [...(budget.client_budget_items ?? [])].sort((a: any,b: any) => Number(a.position)-Number(b.position)); const totalSessions = items.reduce((sum: number,item: any) => sum + Math.max(1,Number(item.sessions)||1),0); const completed = items.reduce((sum: number,item: any) => sum + (Array.isArray(item.completed_session_numbers) ? item.completed_session_numbers.length : 0),0); return <div key={`profile-budget-${budget.id}`} className="rounded-xl border border-primary/15 bg-primary/[0.055] p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-semibold">{budget.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{items.map((item: any) => item.service_name_snapshot).join(" + ")}</p></div><Badge variant={budget.is_paid ? "default" : "secondary"} className={budget.is_paid ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}>{budget.is_paid ? "Pago" : "Combo"}</Badge></div><p className="mt-2 text-[11px] font-medium text-primary">{completed}/{totalSessions} sessões concluídas · {money(budget.total_amount)}</p></div>; })}\n                    {(query.data?.appointments ?? []).slice(0, 12).map((appointment: any) => { const linked = [...(appointment.appointment_services ?? [])].sort((a: any,b: any) => Number(a.position)-Number(b.position)); const names = linked.length ? linked.map((item: any) => item.service?.name ?? "Serviço") : [appointment.service?.name ?? "Serviço"]; return <div key={`profile-service-${appointment.id}`} className="rounded-xl border border-primary/10 bg-card p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-semibold">{names.join(" + ")}</p><p className="mt-1 text-[11px] text-muted-foreground">{dateLabel(appointment.scheduled_date)} · {statusLabel[appointment.status] ?? appointment.status}</p></div><Badge variant="outline" className="shrink-0">Agendamento</Badge></div></div>; })}\n                  </div>'''
text = replace_once(text, old_profile_list, new_profile_list, "profile combos and appointments list")

path.write_text(text)
