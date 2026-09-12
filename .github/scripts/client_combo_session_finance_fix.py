from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Client profile: show one checkbox per session and allow reversals.
# ---------------------------------------------------------------------------
path = Path("src/components/client-profile-dialog.tsx")
text = path.read_text()

text = replace_once(
    text,
    'client_budget_items(id,service_id,service_name_snapshot,unit_price,sessions,line_total,position)',
    'client_budget_items(id,service_id,service_name_snapshot,unit_price,sessions,line_total,position,completed_session_numbers)',
    "budget completed sessions select",
)

text = replace_once(
    text,
    '''  const [budgetSaving, setBudgetSaving] = useState(false);\n  const [activeTab, setActiveTab] = useState("profile");''',
    '''  const [budgetSaving, setBudgetSaving] = useState(false);\n  const [budgetSessionSaving, setBudgetSessionSaving] = useState("");\n  const [appointmentSessionSaving, setAppointmentSessionSaving] = useState("");\n  const [activeTab, setActiveTab] = useState("profile");''',
    "session saving states",
)

remove_budget_anchor = '''  const removeBudget = async (id: string) => {
    if (!window.confirm("Excluir este orçamento da ficha?")) return;
    const result = await db.from("client_budgets").delete().eq("id", id);
    if (result.error) { toast.error(result.error.message); return undefined; }
    toast.success("Orçamento excluído.");
    await refresh();
    return undefined;
  };
'''
remove_budget_replacement = remove_budget_anchor + '''
  const setBudgetSessionCompletion = async (item: any, sessionNumber: number, completed: boolean) => {
    const key = `${item.id}-${sessionNumber}`;
    setBudgetSessionSaving(key);
    const result = await db.rpc("set_client_budget_item_session_completion", {
      _item_id: item.id,
      _session_number: sessionNumber,
      _completed: completed,
    });
    setBudgetSessionSaving("");
    if (result.error) {
      toast.error("Não foi possível atualizar a sessão do orçamento.", { description: result.error.message });
      return undefined;
    }
    toast.success(completed ? `Sessão ${sessionNumber} marcada como concluída.` : `Sessão ${sessionNumber} reaberta.`);
    await refresh();
    return undefined;
  };

  const setAppointmentSessionCompletion = async (appointment: any, session: any, completed: boolean) => {
    if (!completed && !window.confirm(`Reabrir a sessão ${session.session_number}? O valor deste pacote sairá dos resultados financeiros até todas as sessões serem concluídas novamente.`)) return undefined;
    if (completed && !session.scheduled_date) {
      toast.error("Defina a data desta sessão na Agenda antes de concluí-la.");
      return undefined;
    }
    setAppointmentSessionSaving(session.id);
    const result = await db.rpc("set_appointment_session_completion", {
      _session_id: session.id,
      _completed: completed,
    });
    setAppointmentSessionSaving("");
    if (result.error) {
      toast.error("Não foi possível atualizar a sessão.", { description: result.error.message });
      return undefined;
    }
    toast.success(completed ? `Sessão ${session.session_number} concluída.` : `Sessão ${session.session_number} reaberta.`, {
      description: completed ? "O financeiro só reconhece o pacote quando todas as sessões estiverem concluídas." : "O valor do pacote foi retirado dos resultados até a conclusão de todas as sessões.",
    });
    await refresh();
    await onUpdated?.();
    return undefined;
  };
'''
text = replace_once(text, remove_budget_anchor, remove_budget_replacement, "client session actions")

old_appointment_sessions = '''                    {sessions.length > 1 ? <div className="mt-3 rounded-xl border border-primary/10 bg-primary/[0.045] p-3"><p className="text-xs font-semibold">Sessões do pacote</p><div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{sessions.map((session: any) => <div key={session.id} className="rounded-lg bg-background px-2.5 py-2 text-xs"><strong>Sessão {session.session_number}</strong> · {session.status === "completed" ? "Concluída" : "Pendente"}<br/><span className="text-muted-foreground">{session.scheduled_date ? dateLabel(session.scheduled_date) : "Data a definir"}</span></div>)}</div></div> : null}
'''
new_appointment_sessions = '''                    {sessions.length > 1 ? <div className="mt-3 rounded-xl border border-primary/10 bg-primary/[0.045] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">Sessões do pacote</p><span className="text-[11px] text-muted-foreground">Desmarcar uma sessão retira o valor dos resultados até concluir todas novamente.</span></div><div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{sessions.map((session: any) => { const done = session.status === "completed"; const canManage = ["confirmado", "atendido"].includes(appointment.status); return <label key={session.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${done ? "border-emerald-200 bg-emerald-50/70" : "border-primary/10 bg-background"}`}><input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={done} disabled={!canManage || appointmentSessionSaving === session.id} onChange={(event) => void setAppointmentSessionCompletion(appointment, session, event.target.checked)} /><span><strong>Sessão {session.session_number}</strong> · {done ? "Concluída" : "Pendente"}<br/><span className="text-muted-foreground">{session.scheduled_date ? dateLabel(session.scheduled_date) : "Data a definir"}</span></span></label>; })}</div></div> : null}
'''
text = replace_once(text, old_appointment_sessions, new_appointment_sessions, "client appointment session checklist")

old_budget_rows = '''                    {budgetRows.map((row, index) => <div key={index} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1.6fr)_125px_140px_auto]">
                      <Select value={row.serviceId} onValueChange={(value) => setBudgetService(index, value)}><SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{(query.data?.services ?? []).map((service: any) => <SelectItem key={service.id} value={service.id}>{service.name} · {money(service.price)}</SelectItem>)}</SelectContent></Select>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1.5 z-10 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Sessões</span>
                        <Input className="pt-4 font-semibold" type="number" min="1" max="12" title="Sessões incluídas neste serviço" value={row.sessions} onChange={(e) => setBudgetRows((rows) => rows.map((item, i) => i === index ? { ...item, sessions: String(Math.min(12, Math.max(1, Number(e.target.value) || 1))) } : item))} />
                      </div>
                      <Input value={row.unitPrice} onChange={(e) => setBudgetRows((rows) => rows.map((item, i) => i === index ? { ...item, unitPrice: e.target.value } : item))} placeholder="Valor/sessão" />
                      <Button type="button" size="icon" variant="ghost" disabled={budgetRows.length === 1} onClick={() => setBudgetRows((rows) => rows.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button>
                    </div>)}
'''
new_budget_rows = '''                    {budgetRows.map((row, index) => {
                      const sessionCount = Math.min(12, Math.max(1, Number(row.sessions) || 1));
                      return <div key={index} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1.6fr)_125px_140px_auto]">
                        <Select value={row.serviceId} onValueChange={(value) => setBudgetService(index, value)}><SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{(query.data?.services ?? []).map((service: any) => <SelectItem key={service.id} value={service.id}>{service.name} · {money(service.price)}</SelectItem>)}</SelectContent></Select>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1.5 z-10 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Sessões</span>
                          <Input className="pt-4 font-semibold" type="number" min="1" max="12" title="Sessões incluídas neste serviço" value={row.sessions} onChange={(e) => setBudgetRows((rows) => rows.map((item, i) => i === index ? { ...item, sessions: String(Math.min(12, Math.max(1, Number(e.target.value) || 1))) } : item))} />
                        </div>
                        <Input value={row.unitPrice} onChange={(e) => setBudgetRows((rows) => rows.map((item, i) => i === index ? { ...item, unitPrice: e.target.value } : item))} placeholder="Valor/sessão" />
                        <Button type="button" size="icon" variant="ghost" disabled={budgetRows.length === 1} onClick={() => setBudgetRows((rows) => rows.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button>
                        {row.serviceId ? <div className="sm:col-span-4 rounded-xl bg-primary/[0.04] p-3"><p className="text-[11px] font-semibold">Controle das sessões</p><div className="mt-2 flex flex-wrap gap-2">{Array.from({ length: sessionCount }, (_, sessionIndex) => <label key={sessionIndex} className="flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs text-muted-foreground"><input type="checkbox" className="size-4" disabled /> Sessão {sessionIndex + 1}</label>)}</div><p className="mt-2 text-[10px] text-muted-foreground">As caixinhas ficam disponíveis para marcar depois que o orçamento for salvo.</p></div> : null}
                      </div>;
                    })}
'''
text = replace_once(text, old_budget_rows, new_budget_rows, "budget session preview checkboxes")

old_saved_items = '''                    <div className="mt-3 grid gap-2 sm:grid-cols-2">{[...(budget.client_budget_items ?? [])].sort((a: any,b: any) => Number(a.position)-Number(b.position)).map((item: any) => <div key={item.id} className="rounded-xl border border-primary/10 bg-primary/[0.04] p-3 text-sm"><strong>{item.service_name_snapshot}</strong><p className="mt-1 text-xs text-muted-foreground">{item.sessions} sessão(ões) × {money(item.unit_price)} = {money(item.line_total)}</p></div>)}</div>
'''
new_saved_items = '''                    <div className="mt-3 grid gap-2 sm:grid-cols-2">{[...(budget.client_budget_items ?? [])].sort((a: any,b: any) => Number(a.position)-Number(b.position)).map((item: any) => { const completedSessions = (Array.isArray(item.completed_session_numbers) ? item.completed_session_numbers : []).map(Number); const totalSessions = Math.max(1, Number(item.sessions) || 1); return <div key={item.id} className="rounded-xl border border-primary/10 bg-primary/[0.04] p-3 text-sm"><strong>{item.service_name_snapshot}</strong><p className="mt-1 text-xs text-muted-foreground">{item.sessions} sessão(ões) × {money(item.unit_price)} = {money(item.line_total)}</p><div className="mt-3 flex flex-wrap gap-2">{Array.from({ length: totalSessions }, (_, sessionIndex) => { const sessionNumber = sessionIndex + 1; const checked = completedSessions.includes(sessionNumber); const saving = budgetSessionSaving === `${item.id}-${sessionNumber}`; return <label key={sessionNumber} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${checked ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-background"}`}><input type="checkbox" className="size-4 accent-primary" checked={checked} disabled={saving} onChange={(event) => void setBudgetSessionCompletion(item, sessionNumber, event.target.checked)} /> Sessão {sessionNumber}</label>; })}</div></div>; })}</div>
'''
text = replace_once(text, old_saved_items, new_saved_items, "saved budget session checkboxes")

path.write_text(text)


# ---------------------------------------------------------------------------
# Agenda: keep the operational copy aligned with finance recognition rule.
# ---------------------------------------------------------------------------
path = Path("src/components/admin-appointments-workspace.tsx")
text = path.read_text()
text = text.replace(
    "O pagamento é independente das sessões. Agende e conclua cada sessão na data em que ela acontecer.",
    "O valor do pacote só entra nos resultados financeiros quando todas as sessões estiverem concluídas. Reabrir uma sessão retira esse valor dos resultados até a conclusão total.",
)
text = text.replace(
    "As sessões pendentes continuam no pacote mesmo que o valor total já tenha sido pago. A data principal da agenda acompanha a próxima sessão pendente agendada.",
    "Enquanto houver sessão pendente, o pacote continua em andamento e o valor não é reconhecido nos resultados. A data principal da agenda acompanha a próxima sessão pendente agendada.",
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Finance list: allow editing an entry to exactly R$ 0,00.
# ---------------------------------------------------------------------------
path = Path("src/components/finance-staging-workspace.tsx")
text = path.read_text()
old_zero_guard = '''    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (!window.confirm(`Alterar o valor desta entrada para ${money(value)}? Taxas e comissão vinculada serão recalculadas quando aplicável.`)) return;
'''
new_zero_guard = '''    if (!Number.isFinite(value) || value < 0) {
      toast.error("Informe um valor igual ou maior que zero.");
      return;
    }
    if (!window.confirm(`Alterar o valor desta entrada para ${money(value)}? Taxas e comissão vinculada serão recalculadas quando aplicável.`)) return;
'''
text = replace_once(text, old_zero_guard, new_zero_guard, "zero financial entry guard")
path.write_text(text)


# ---------------------------------------------------------------------------
# Finance completion: packages are released only after every session is done.
# ---------------------------------------------------------------------------
path = Path("src/components/finance-attendance-completion.tsx")
text = path.read_text()
text = replace_once(
    text,
    '''      .eq("status", "confirmado")
      .order("scheduled_date", { ascending: true })''',
    '''      .in("status", ["confirmado", "atendido"])
      .order("scheduled_date", { ascending: true })''',
    "finance completion statuses",
)
text = replace_once(
    text,
    '''    appointments: (appointments.data ?? []).filter((row: any) => !alreadyRegistered.has(row.id)),''',
    '''    appointments: (appointments.data ?? []).filter((row: any) => {
      if (alreadyRegistered.has(row.id)) return false;
      const sessions = packageSessions(row);
      if (sessions.length > 1) return sessions.every((session: any) => session.status === "completed");
      return true;
    }),''',
    "finance completion package filter",
)
text = text.replace(
    '''              Registre o pagamento, desconto, fiado e eventual ajuste manual de comissão. Em pacotes,
              o valor pode ser recebido integralmente agora e as sessões continuam sendo acompanhadas
              separadamente até a última conclusão.''',
    '''              Registre o pagamento, desconto, fiado e eventual ajuste manual de comissão. Em pacotes,
              o lançamento financeiro só é liberado depois que todas as sessões forem concluídas.
              Se uma sessão for reaberta, o valor sai dos resultados até a conclusão total novamente.''',
)
text = text.replace(
    "O pagamento pode ser registrado mesmo com sessões pendentes.",
    "O lançamento financeiro é liberado somente após todas as sessões serem concluídas.",
)
path.write_text(text)
