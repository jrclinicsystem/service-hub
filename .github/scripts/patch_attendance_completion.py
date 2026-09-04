from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Anchor not found: {label}")
    return text.replace(old, new, 1)

# Professional portal: separate accepted appointment from completed attendance.
path = Path('src/routes/profissional.tsx')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    '  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);\n  const response = responseFor(appointment)?.response;\n  const confirmed = response === "confirmado" || appointment.status === "confirmado";\n  const waiting = appointment.status === "pendente" && !confirmed;\n',
    '  const [busy, setBusy] = useState<"confirm" | "decline" | "attended" | null>(null);\n  const response = responseFor(appointment)?.response;\n  const attended = appointment.status === "atendido";\n  const confirmed = attended || response === "confirmado" || appointment.status === "confirmado";\n  const waiting = appointment.status === "pendente" && !confirmed;\n  const scheduledMoment = new Date(`${appointment.scheduled_date}T${appointment.scheduled_time}:00`);\n  const canMarkAttended = appointment.status === "confirmado" && Number.isFinite(scheduledMoment.getTime()) && scheduledMoment.getTime() <= Date.now();\n',
    'professional card status state',
)
text = replace_once(
    text,
    '  const openWhatsApp = (kind: "confirmation" | "reminder") => {\n',
    '''  const markAttended = async () => {
    if (!canMarkAttended || busy !== null) return;
    setBusy("attended");
    const { error } = await db.rpc("mark_appointment_attended", { _appointment_id: appointment.id });
    setBusy(null);
    if (error) {
      toast.error("Não foi possível confirmar o atendimento.", { description: error.message });
      return;
    }
    toast.success("Atendimento concluído.", { description: "O valor deste serviço agora entrou na receita da clínica." });
    onSaved?.();
  };

  const openWhatsApp = (kind: "confirmation" | "reminder") => {
''',
    'professional mark attended function',
)
text = replace_once(
    text,
    '  const label = appointment.status === "cancelado" ? (response === "recusado" ? "recusado por você" : "cancelado") : confirmed ? "confirmado" : waiting ? "aguardando confirmação" : appointment.status;\n',
    '  const label = appointment.status === "cancelado" ? (response === "recusado" ? "recusado por você" : "cancelado") : attended ? "atendido" : confirmed ? "confirmado" : waiting ? "aguardando confirmação" : appointment.status;\n',
    'professional status label',
)
old_buttons = '    {waiting ? <div className="mt-3 grid gap-2 sm:grid-cols-2"><Button className="rounded-xl" disabled={busy !== null} onClick={() => void respond("confirmado")}><CheckCircle2 className="size-4" /> {busy === "confirm" ? "Confirmando..." : "Confirmar compromisso"}</Button><Button variant="outline" className="rounded-xl text-destructive" disabled={busy !== null} onClick={() => void respond("recusado")}><XCircle className="size-4" /> {busy === "decline" ? "Recusando..." : "Recusar"}</Button></div> : null}\n'
new_buttons = old_buttons + '    {canMarkAttended ? <div className="mt-3"><Button type="button" className="w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy !== null} onClick={() => void markAttended()}><CheckCircle2 className="size-4" /> {busy === "attended" ? "Confirmando atendimento..." : "Confirmar atendimento"}</Button><p className="mt-1.5 text-center text-[10px] text-muted-foreground">O valor só entra na receita após esta confirmação.</p></div> : null}\n    {attended ? <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><CheckCircle2 className="size-4" /> Atendimento concluído · valor contabilizado na receita</div> : null}\n'
text = replace_once(text, old_buttons, new_buttons, 'professional attendance button')
path.write_text(text, encoding='utf-8')

# Admin workspace: recognize attended status, place it in history and allow admin completion.
path = Path('src/components/admin-appointments-workspace.tsx')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    'function statusLabel(status: string) {\n  if (status === "confirmado") return "Confirmado";\n',
    'function statusLabel(status: string) {\n  if (status === "atendido") return "Atendido";\n  if (status === "confirmado") return "Confirmado";\n',
    'admin status label',
)
text = text.replace('      if (!futureOrToday || item.status === "cancelado") result.history += 1;', '      if (!futureOrToday || item.status === "cancelado" || item.status === "atendido") result.history += 1;', 1)
text = text.replace('      const history = !futureOrToday || item.status === "cancelado";', '      const history = !futureOrToday || item.status === "cancelado" || item.status === "atendido";', 1)
text = replace_once(
    text,
    '  const removeAppointment = async (appointment: any) => {\n',
    '''  const completeAttendance = async (appointment: any) => {
    setBusyAction(true);
    const { error } = await db.rpc("mark_appointment_attended", { _appointment_id: appointment.id });
    setBusyAction(false);
    if (error) {
      toast.error("Não foi possível confirmar o atendimento.", { description: error.message });
      return false;
    }
    toast.success("Atendimento concluído.", { description: "O valor agora foi contabilizado na receita." });
    setSelected((current: any) => current?.id === appointment.id ? { ...current, status: "atendido" } : current);
    setScope("history");
    onRefresh();
    return true;
  };

  const removeAppointment = async (appointment: any) => {
''',
    'admin complete attendance function',
)
text = replace_once(
    text,
    'filtered.map((appointment) => <AdminAppointmentCard key={appointment.id} appointment={appointment} onOpen={() => setSelected(appointment)} onDelete={() => removeAppointment(appointment)} deleting={deletingId === appointment.id} />)',
    'filtered.map((appointment) => <AdminAppointmentCard key={appointment.id} appointment={appointment} onOpen={() => setSelected(appointment)} onDelete={() => removeAppointment(appointment)} onAttended={() => completeAttendance(appointment)} deleting={deletingId === appointment.id} />)',
    'admin card callback',
)
text = replace_once(
    text,
    '<AppointmentAdminDialog appointment={selected} open={Boolean(selected)} onOpenChange={(open: boolean) => !open && setSelected(null)} onConfirm={() => selected && act(selected, "confirmado")} onCancel={() => selected && act(selected, "cancelado")} busy={busyAction} />',
    '<AppointmentAdminDialog appointment={selected} open={Boolean(selected)} onOpenChange={(open: boolean) => !open && setSelected(null)} onConfirm={() => selected && act(selected, "confirmado")} onCancel={() => selected && act(selected, "cancelado")} onAttended={() => selected && completeAttendance(selected)} busy={busyAction} />',
    'admin dialog callback',
)
text = replace_once(
    text,
    'function AdminAppointmentCard({ appointment, onOpen, onDelete, deleting }: any) {\n',
    'function AdminAppointmentCard({ appointment, onOpen, onDelete, onAttended, deleting }: any) {\n  const [attendanceBusy, setAttendanceBusy] = useState(false);\n',
    'admin card signature',
)
text = replace_once(
    text,
    '  const hasWhatsApp = normalizeWhatsAppPhone(appointment.patient_phone).length > 0;\n',
    '  const hasWhatsApp = normalizeWhatsAppPhone(appointment.patient_phone).length > 0;\n  const scheduledMoment = new Date(`${appointment.scheduled_date}T${appointment.scheduled_time}:00`);\n  const canMarkAttended = appointment.status === "confirmado" && Number.isFinite(scheduledMoment.getTime()) && scheduledMoment.getTime() <= Date.now();\n',
    'admin card attended availability',
)
text = replace_once(
    text,
    '    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3">',
    '    {canMarkAttended ? <div className="mt-3"><Button type="button" size="sm" className="w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" disabled={attendanceBusy} onClick={async () => { setAttendanceBusy(true); await onAttended?.(); setAttendanceBusy(false); }}><Check className="size-4" /> {attendanceBusy ? "Confirmando atendimento..." : "Confirmar atendimento"}</Button></div> : null}\n    {appointment.status === "atendido" ? <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-[11px] font-semibold text-emerald-800">Atendido · valor já contabilizado na receita</div> : null}\n    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3">',
    'admin card attendance control',
)
text = replace_once(
    text,
    'function AdminStatusBadge({ status }: { status: string }) { const variant = status === "cancelado" ? "destructive" : status === "confirmado" ? "default" : "secondary"; return <Badge variant={variant as any} className="shrink-0 rounded-full px-2.5 text-[10px] font-normal">{statusLabel(status)}</Badge>; }',
    'function AdminStatusBadge({ status }: { status: string }) { const variant = status === "cancelado" ? "destructive" : status === "confirmado" || status === "atendido" ? "default" : "secondary"; return <Badge variant={variant as any} className={`shrink-0 rounded-full px-2.5 text-[10px] font-normal ${status === "atendido" ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}`}>{statusLabel(status)}</Badge>; }',
    'admin attended badge',
)
text = replace_once(
    text,
    'function AppointmentAdminDialog({ appointment, open, onOpenChange, onConfirm, onCancel, busy }: any) {',
    'function AppointmentAdminDialog({ appointment, open, onOpenChange, onConfirm, onCancel, onAttended, busy }: any) {',
    'admin dialog signature',
)
text = replace_once(
    text,
    '  const canDecide = appointment.status !== "cancelado" && appointment.status !== "confirmado" && appointment.status !== "aguardando_pagamento";\n',
    '  const canDecide = appointment.status !== "cancelado" && appointment.status !== "confirmado" && appointment.status !== "atendido" && appointment.status !== "aguardando_pagamento";\n  const scheduledMoment = new Date(`${appointment.scheduled_date}T${appointment.scheduled_time}:00`);\n  const canMarkAttended = appointment.status === "confirmado" && Number.isFinite(scheduledMoment.getTime()) && scheduledMoment.getTime() <= Date.now();\n',
    'admin dialog attendance availability',
)
text = replace_once(
    text,
    '    {canDecide ? <DialogFooter className="mt-4 grid grid-cols-2 gap-2 sm:flex"><Button variant="destructive" disabled={busy} onClick={onCancel}><X className="size-4" /> Cancelar</Button><Button disabled={busy} onClick={onConfirm}><Check className="size-4" /> Confirmar manualmente</Button></DialogFooter> : null}\n',
    '    {canDecide ? <DialogFooter className="mt-4 grid grid-cols-2 gap-2 sm:flex"><Button variant="destructive" disabled={busy} onClick={onCancel}><X className="size-4" /> Cancelar</Button><Button disabled={busy} onClick={onConfirm}><Check className="size-4" /> Confirmar manualmente</Button></DialogFooter> : null}\n    {canMarkAttended ? <DialogFooter className="mt-4"><Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto" disabled={busy} onClick={onAttended}><Check className="size-4" /> Confirmar atendimento</Button></DialogFooter> : null}\n    {appointment.status === "atendido" ? <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-800">Atendimento concluído · receita contabilizada</div> : null}\n',
    'admin dialog attendance button',
)
path.write_text(text, encoding='utf-8')

# Main admin metric: only completed appointments count as revenue.
path = Path('src/routes/admin.tsx')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    '  const revenue = data.appointments\n    .filter((item: any) => item.status !== "cancelado")\n',
    '  const revenue = data.appointments\n    .filter((item: any) => item.status === "atendido")\n',
    'main admin revenue filter',
)
text = replace_once(
    text,
    '<Metric icon={CircleDollarSign} label="Receita" value={formatPrice(revenue)} hint="estimada" />',
    '<Metric icon={CircleDollarSign} label="Receita" value={formatPrice(revenue)} hint="realizada" />',
    'main admin revenue hint',
)
path.write_text(text, encoding='utf-8')

# Calendar: completed appointments are not pending.
path = Path('src/components/appointment-calendar.tsx')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    '      if (appointment.status === "confirmado") current.confirmed += 1;\n      else current.pending += 1;\n',
    '      if (appointment.status === "confirmado" || appointment.status === "atendido") current.confirmed += 1;\n      else current.pending += 1;\n',
    'calendar attended classification',
)
path.write_text(text, encoding='utf-8')

# Day dialog: render the new final status clearly.
path = Path('src/components/calendar-day-dialog.tsx')
text = path.read_text(encoding='utf-8')
old_badge = '<Badge variant={appointment.status === "confirmado" ? "default" : appointment.status === "cancelado" ? "destructive" : "outline"} className="rounded-full text-[9px]">{appointment.status === "confirmado" ? "Confirmado" : appointment.status === "cancelado" ? "Cancelado" : "Pendente"}</Badge>'
new_badge = '<Badge variant={appointment.status === "confirmado" || appointment.status === "atendido" ? "default" : appointment.status === "cancelado" ? "destructive" : "outline"} className={`rounded-full text-[9px] ${appointment.status === "atendido" ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}`}>{appointment.status === "atendido" ? "Atendido" : appointment.status === "confirmado" ? "Confirmado" : appointment.status === "cancelado" ? "Cancelado" : "Pendente"}</Badge>'
text = replace_once(text, old_badge, new_badge, 'calendar day attended badge')
path.write_text(text, encoding='utf-8')
