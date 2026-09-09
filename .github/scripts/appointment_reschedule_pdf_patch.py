from pathlib import Path

# Admin query: expose IDs needed by the edit/rebook dialog.
p = Path('src/routes/admin.tsx')
s = p.read_text()
old = 'id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, created_at, status_updated_at, payment_choice, service_price_snapshot, deposit_percent, deposit_amount, balance_amount, service:services!appointments_service_id_fkey(name, price, duration_min), appointment_services(position, service:services!appointment_services_service_id_fkey(name, price, duration_min)), professional:professionals(name, specialty), payments(status, amount, kind, payment_method_id, provider, paid_at, created_at, status_detail)'
new = 'id, client_id, service_id, professional_id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, created_at, status_updated_at, payment_choice, service_price_snapshot, deposit_percent, deposit_amount, balance_amount, service:services!appointments_service_id_fkey(id, name, price, duration_min), appointment_services(service_id, position, service:services!appointment_services_service_id_fkey(id, name, price, duration_min)), professional:professionals(id, name, specialty), payments(status, amount, kind, payment_method_id, provider, paid_at, created_at, status_detail)'
if old not in s:
    raise SystemExit('admin query target not found')
p.write_text(s.replace(old, new, 1))

# Appointment UI: edit/rebook existing and cancelled appointments.
p = Path('src/components/admin-appointments-workspace.tsx')
s = p.read_text()
s = s.replace('  Mail,\n  MessageCircle,', '  Mail,\n  MessageCircle,\n  Pencil,', 1)
s = s.replace('  const [createOpen, setCreateOpen] = useState(false);', '  const [createOpen, setCreateOpen] = useState(false);\n  const [editingAppointment, setEditingAppointment] = useState<any | null>(null);', 1)

old_remove = '''  const removeAppointment = async (appointment: any) => {
    if (!window.confirm(`Apagar o agendamento de ${appointment.patient_name}? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(appointment.id);
    const { error } = await db.from("appointments").delete().eq("id", appointment.id);
    setDeletingId(null);
    if (error) { toast.error(error.message); return; }
    if (selected?.id === appointment.id) setSelected(null);
    if (incoming?.id === appointment.id) setIncoming(null);
    toast.success("Agendamento apagado.");
    onRefresh();
  };'''
new_remove = '''  const removeAppointment = async (appointment: any) => {
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
  };'''
if old_remove not in s:
    raise SystemExit('removeAppointment target not found')
s = s.replace(old_remove, new_remove, 1)

old_cards = '{filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center lg:col-span-2 2xl:col-span-3"><CalendarDays className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">Nenhum agendamento nesta seleção.</p></div> : filtered.map((appointment) => <AdminAppointmentCard key={appointment.id} appointment={appointment} onOpen={() => setSelected(appointment)} onDelete={() => removeAppointment(appointment)} onAttended={() => completeAttendance(appointment)} deleting={deletingId === appointment.id} />)}'
new_cards = '{filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center lg:col-span-2 2xl:col-span-3"><CalendarDays className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">Nenhum agendamento nesta seleção.</p></div> : filtered.map((appointment) => <AdminAppointmentCard key={appointment.id} appointment={appointment} onOpen={() => setSelected(appointment)} onEdit={() => { setSelected(null); setEditingAppointment(appointment); }} onDelete={() => removeAppointment(appointment)} onAttended={() => completeAttendance(appointment)} deleting={deletingId === appointment.id} />)}'
if old_cards not in s:
    raise SystemExit('cards target not found')
s = s.replace(old_cards, new_cards, 1)

old_dialog = '<CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => { setCreateOpen(false); setScope("pending"); onRefresh(); }} />'
new_dialog = '<CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => { setCreateOpen(false); setScope("pending"); onRefresh(); }} />\n      <CreateAppointmentDialog open={Boolean(editingAppointment)} onOpenChange={(open) => { if (!open) setEditingAppointment(null); }} editing={editingAppointment} onCreated={() => { setEditingAppointment(null); setScope("pending"); onRefresh(); }} />'
if old_dialog not in s:
    raise SystemExit('create dialog render target not found')
s = s.replace(old_dialog, new_dialog, 1)

s = s.replace('function AdminAppointmentCard({ appointment, onOpen, onDelete, onAttended, deleting }: any)', 'function AdminAppointmentCard({ appointment, onOpen, onEdit, onDelete, onAttended, deleting }: any)', 1)
old_actions = '<div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-border/70 pt-3"><p className="min-w-0 flex-1 basis-[120px] truncate text-xs text-muted-foreground">{appointment.patient_phone || "Sem telefone"}</p><Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={onDelete} disabled={deleting} title="Apagar agendamento"><Trash2 className="size-3.5" /></Button><button type="button" onClick={onOpen} className="ml-auto max-w-full shrink-0 text-right text-xs font-semibold text-primary hover:underline">{formatPrice(Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0))} · Detalhes →</button></div>'
new_actions = '<div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-border/70 pt-3"><p className="min-w-0 flex-1 basis-[120px] truncate text-xs text-muted-foreground">{appointment.patient_phone || "Sem telefone"}</p>{appointment.status !== "atendido" ? <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-lg text-primary hover:bg-primary/10" onClick={onEdit} title={appointment.status === "cancelado" ? "Reagendar" : "Editar agendamento"}><Pencil className="size-3.5" /></Button> : null}<Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={onDelete} disabled={deleting || appointment.status === "atendido"} title="Cancelar e arquivar agendamento"><Trash2 className="size-3.5" /></Button><button type="button" onClick={onOpen} className="ml-auto max-w-full shrink-0 text-right text-xs font-semibold text-primary hover:underline">{formatPrice(Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0))} · Detalhes →</button></div>'
if old_actions not in s:
    raise SystemExit('card action target not found')
s = s.replace(old_actions, new_actions, 1)

old_sig = 'function CreateAppointmentDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {'
new_sig = 'function CreateAppointmentDialog({ open, onOpenChange, onCreated, editing = null }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void; editing?: any | null }) {'
if old_sig not in s:
    raise SystemExit('dialog signature target not found')
s = s.replace(old_sig, new_sig, 1)

catalog_effect_end = '  }, [open]);\n\n  useEffect(() => {\n    let cancelled = false;\n    setScheduledTime("");'
catalog_replacement = '''  }, [open]);

  useEffect(() => {
    if (!open || !editing) return;
    const linkedIds = [...(editing.appointment_services ?? [])]
      .sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0))
      .map((item: any) => item.service_id ?? item.service?.id)
      .filter(Boolean);
    setSelectedClientId(editing.client_id ?? "");
    setPatientName(editing.patient_name ?? "");
    setPatientEmail(editing.patient_email ?? "");
    setPatientPhone(editing.patient_phone ?? "");
    setServiceIds(linkedIds.length ? linkedIds : [editing.service_id].filter(Boolean));
    setServiceSearch("");
    setAppointmentValue(String(Number(editing.service_price_snapshot ?? editing.service?.price ?? 0)));
    setProfessionalId(editing.professional_id ?? editing.professional?.id ?? "");
    setScheduledDate(editing.scheduled_date ?? todayIso());
    setScheduledTime(editing.scheduled_time ?? "");
    setNotes(editing.notes ?? "");
  }, [open, editing]);

  useEffect(() => {
    let cancelled = false;
    const currentEditingSlot = editing && (editing.professional_id ?? editing.professional?.id) === professionalId && editing.scheduled_date === scheduledDate ? editing.scheduled_time : "";
    setScheduledTime(currentEditingSlot);'''
if catalog_effect_end not in s:
    raise SystemExit('catalog/slot effect target not found')
s = s.replace(catalog_effect_end, catalog_replacement, 1)

old_slots = 'setBookingSlots((data ?? []).filter((slot: any) => slot.is_available));'
new_slots = '''const available = (data ?? []).filter((slot: any) => slot.is_available);
          if (currentEditingSlot && !available.some((slot: any) => slot.slot === currentEditingSlot)) {
            available.unshift({ slot: currentEditingSlot, source: "current" });
          }
          setBookingSlots(available);'''
if old_slots not in s:
    raise SystemExit('booking slots target not found')
s = s.replace(old_slots, new_slots, 1)
s = s.replace('  }, [open, professionalId, scheduledDate, bookingSlotsRefreshKey]);', '  }, [open, professionalId, scheduledDate, bookingSlotsRefreshKey, editing]);', 1)

s = s.replace('  const createAppointment = async () => {', '  const saveAppointment = async () => {', 1)
old_conflict = '''    setSaving(true);
    const conflict = await db.from("appointments").select("id").eq("professional_id", professionalId).eq("scheduled_date", scheduledDate).eq("scheduled_time", scheduledTime).neq("status", "cancelado").limit(1).maybeSingle();
    if (conflict.error) { setSaving(false); toast.error(conflict.error.message); return; }
    if (conflict.data) { setSaving(false); toast.error("Este profissional já possui um agendamento nesse horário."); return; }
    const { error } = await db.rpc("create_admin_multi_service_appointment", {
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
    });'''
new_conflict = '''    setSaving(true);
    let error: any = null;
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
    }'''
if old_conflict not in s:
    raise SystemExit('save conflict target not found')
s = s.replace(old_conflict, new_conflict, 1)

old_success = 'toast.success("Agendamento enviado para confirmação da profissional.", { description: `${patientName.trim()} · ${selectedServices.map((service: any) => service.name).join(" + ")} · ${formatDate(scheduledDate)} às ${scheduledTime}` });'
new_success = 'toast.success(editing ? "Agendamento atualizado e reenviado para confirmação." : "Agendamento enviado para confirmação da profissional.", { description: `${patientName.trim()} · ${selectedServices.map((service: any) => service.name).join(" + ")} · ${formatDate(scheduledDate)} às ${scheduledTime}` });'
if old_success not in s:
    raise SystemExit('success toast target not found')
s = s.replace(old_success, new_success, 1)

s = s.replace('<DialogTitle className="text-base sm:text-lg">Novo agendamento</DialogTitle><DialogDescription className="text-xs leading-relaxed sm:text-sm">O agendamento será criado como aguardando confirmação da profissional e com pagamento presencial.</DialogDescription>', '<DialogTitle className="text-base sm:text-lg">{editing ? (editing.status === "cancelado" ? "Reagendar atendimento" : "Editar agendamento") : "Novo agendamento"}</DialogTitle><DialogDescription className="text-xs leading-relaxed sm:text-sm">{editing ? "Altere data, horário, serviços, profissional ou dados do cliente. Ao salvar, o agendamento volta para confirmação da profissional." : "O agendamento será criado como aguardando confirmação da profissional e com pagamento presencial."}</DialogDescription>', 1)
s = s.replace('Depois de criado, o card ficará em <strong className="text-foreground">Aguardando profissional</strong> até a colaboradora confirmar ou recusar.', '{editing ? "Ao salvar as alterações, o agendamento volta para " : "Depois de criado, o card ficará em "}<strong className="text-foreground">Aguardando profissional</strong> até a colaboradora confirmar ou recusar.', 1)
s = s.replace('<Button onClick={createAppointment} disabled={saving || loadingCatalog}>{saving ? "Salvando..." : "Criar agendamento"}</Button>', '<Button onClick={saveAppointment} disabled={saving || loadingCatalog}>{saving ? "Salvando..." : editing ? "Salvar e reagendar" : "Criar agendamento"}</Button>', 1)
p.write_text(s)

# PDF report: payment method on each row, totals by method, and final clinic result.
p = Path('src/components/finance-staging-workspace.tsx')
s = p.read_text()
start = s.find('function printReport(entries: any[], expenses: any[], from: string, to: string) {')
end = s.find('\n}\n\nexport function FinanceStagingWorkspace()', start)
if start == -1 or end == -1:
    raise SystemExit('printReport function not found')
replacement = r'''function printReport(entries: any[], expenses: any[], from: string, to: string) {
  const popup = window.open("", "_blank", "width=1100,height=800");
  if (!popup) {
    toast.error("O navegador bloqueou a janela de impressão.");
    return;
  }
  const safe = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const entryRows = entries
    .map((row) => `<tr><td>${formatDate(row.business_date)}</td><td>${safe(row.patient_name_snapshot)}</td><td>${safe(row.professional_name_snapshot)}</td><td>${safe(row.service_name_snapshot)}</td><td>${safe(row.payment_method_name || "Não informado")}</td><td>${money(row.charged_amount)}</td><td>${money(row.net_amount)}</td></tr>`)
    .join("");
  const expenseRows = expenses
    .map((row) => `<tr><td>${formatDate(row.expense_date)}</td><td>${safe(row.description)}</td><td>${safe(row.payment_method_name || "Não informado")}</td><td>${money(row.amount)}</td></tr>`)
    .join("");
  const sumByMethod = (rows: any[], amountField: string) => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      const label = String(row.payment_method_name || "Não informado");
      totals.set(label, (totals.get(label) ?? 0) + Number(row[amountField] ?? 0));
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  };
  const entryByMethod = sumByMethod(entries, "net_amount");
  const expenseByMethod = sumByMethod(expenses, "amount");
  const methodRows = Array.from(new Set([...entryByMethod.map(([name]) => name), ...expenseByMethod.map(([name]) => name]))
    .map((name) => {
      const received = entryByMethod.find(([key]) => key === name)?.[1] ?? 0;
      const spent = expenseByMethod.find(([key]) => key === name)?.[1] ?? 0;
      return `<tr><td>${safe(name)}</td><td>${money(received)}</td><td>${money(spent)}</td><td>${money(received - spent)}</td></tr>`;
    }).join("");
  const grossTotal = entries.reduce((sum, row) => sum + Number(row.charged_amount ?? 0), 0);
  const feeTotal = entries.reduce((sum, row) => sum + Number(row.card_fee_amount ?? 0), 0);
  const netTotal = entries.reduce((sum, row) => sum + Number(row.net_amount ?? 0), 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const finalResult = netTotal - expenseTotal;
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório Financeiro JR Clinic</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#222}h1{margin-bottom:4px}h2{margin-top:28px}p{color:#666}table{width:100%;border-collapse:collapse;margin:18px 0 28px}th,td{border:1px solid #ddd;padding:8px;font-size:12px;text-align:left}th{background:#f5f5f5}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:18px 0 30px}.box{border:1px solid #ddd;border-radius:8px;padding:12px}.label{font-size:11px;color:#666}.value{font-size:17px;font-weight:700;margin-top:5px}.result{border:2px solid #0f4d3e;background:#f2f8f6}@media print{button{display:none}.summary{grid-template-columns:repeat(5,1fr)}}</style></head><body><h1>JR Clinic — Relatório Financeiro</h1><p>Período: ${formatDate(from)} a ${formatDate(to)}</p><div class="summary"><div class="box"><div class="label">Entradas brutas</div><div class="value">${money(grossTotal)}</div></div><div class="box"><div class="label">Taxas</div><div class="value">${money(feeTotal)}</div></div><div class="box"><div class="label">Entradas líquidas</div><div class="value">${money(netTotal)}</div></div><div class="box"><div class="label">Despesas / saídas</div><div class="value">${money(expenseTotal)}</div></div><div class="box result"><div class="label">Resultado final da clínica</div><div class="value">${money(finalResult)}</div></div></div><h2>Entradas</h2><table><tr><th>Data</th><th>Cliente</th><th>Profissional</th><th>Serviço</th><th>Pagamento</th><th>Bruto</th><th>Líquido</th></tr>${entryRows}</table><h2>Despesas / Saídas</h2><table><tr><th>Data</th><th>Descrição</th><th>Pagamento</th><th>Valor</th></tr>${expenseRows}</table><h2>Totais por forma de pagamento</h2><table><tr><th>Forma de pagamento</th><th>Entradas líquidas</th><th>Saídas</th><th>Saldo</th></tr>${methodRows}</table><div class="box result"><div class="label">Abatimento final — entradas líquidas menos despesas</div><div class="value">${money(netTotal)} − ${money(expenseTotal)} = ${money(finalResult)}</div></div><button onclick="window.print()">Imprimir / Salvar PDF</button></body></html>`);
  popup.document.close();
  popup.focus();
}'''
s = s[:start] + replacement + s[end+2:]
p.write_text(s)
