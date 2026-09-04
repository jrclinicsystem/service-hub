from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Anchor not found: {label}")
    return text.replace(old, new, 1)

# 1) Professional portal: allow collaborator to edit value after booking.
path = Path("src/routes/profissional.tsx")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    'scheduled_time, status, service_price_snapshot, balance_amount, service:services',
    'scheduled_time, status, payment_choice, service_price_snapshot, balance_amount, service:services',
    "professional appointment payment_choice select",
)
text = replace_once(
    text,
    '  const [busy, setBusy] = useState<"confirm" | "decline" | "attended" | null>(null);\n',
    '  const [busy, setBusy] = useState<"confirm" | "decline" | "attended" | "price" | null>(null);\n  const [editingPrice, setEditingPrice] = useState(false);\n  const [priceValue, setPriceValue] = useState("");\n',
    "professional price states",
)
text = replace_once(
    text,
    '  const openWhatsApp = (kind: "confirmation" | "reminder") => {\n',
    '''  const savePrice = async () => {
    const parsed = Number(priceValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) { toast.error("Informe um valor válido para o atendimento."); return; }
    const nextPrice = Math.round((parsed + Number.EPSILON) * 100) / 100;
    setBusy("price");
    const { error } = await db.rpc("update_appointment_custom_price", { _appointment_id: appointment.id, _new_price: nextPrice });
    setBusy(null);
    if (error) { toast.error("Não foi possível alterar o valor.", { description: error.message }); return; }
    setEditingPrice(false);
    toast.success("Valor do atendimento atualizado.", { description: appointment.status === "atendido" ? "A receita foi recalculada com o novo valor." : "O novo valor ficou salvo neste agendamento." });
    onSaved?.();
  };

  const openWhatsApp = (kind: "confirmation" | "reminder") => {
''',
    "professional save price function",
)
notes_anchor = '    {appointment.notes ? <p className="mt-3 rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">{appointment.notes}</p> : null}\n'
price_ui = notes_anchor + '''    {(appointment.payment_choice ?? "onsite") === "onsite" ? <div className="mt-3 rounded-xl border border-border bg-card/80 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Valor do atendimento</p><p className="mt-0.5 text-sm font-semibold">{formatPrice(total)}</p></div>{!editingPrice ? <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={busy !== null} onClick={() => { setPriceValue(total.toFixed(2)); setEditingPrice(true); }}>Alterar valor</Button> : null}</div>{editingPrice ? <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input type="number" min="0" step="0.01" inputMode="decimal" value={priceValue} onChange={(event) => setPriceValue(event.target.value)} disabled={busy !== null} /><div className="flex gap-2"><Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={busy !== null} onClick={() => setEditingPrice(false)}>Cancelar</Button><Button type="button" size="sm" className="rounded-xl" disabled={busy !== null} onClick={() => void savePrice()}>{busy === "price" ? "Salvando..." : "Salvar valor"}</Button></div></div> : null}</div> : null}
'''
text = replace_once(text, notes_anchor, price_ui, "professional price editor ui")
path.write_text(text, encoding="utf-8")

# 2) Main admin appointment details: editable value after booking.
path = Path("src/components/admin-appointments-workspace.tsx")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    '<AppointmentAdminDialog appointment={selected} open={Boolean(selected)} onOpenChange={(open: boolean) => !open && setSelected(null)} onConfirm={() => selected && act(selected, "confirmado")} onCancel={() => selected && act(selected, "cancelado")} onAttended={() => selected && completeAttendance(selected)} busy={busyAction} />',
    '<AppointmentAdminDialog appointment={selected} open={Boolean(selected)} onOpenChange={(open: boolean) => !open && setSelected(null)} onConfirm={() => selected && act(selected, "confirmado")} onCancel={() => selected && act(selected, "cancelado")} onAttended={() => selected && completeAttendance(selected)} onPriceSaved={(value: number) => { setSelected((current: any) => current ? { ...current, service_price_snapshot: value, balance_amount: value } : current); onRefresh(); }} busy={busyAction} />',
    "admin dialog price callback",
)
helper_anchor = 'function DetailBox({ icon: Icon, label, value }: any) { return <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-4" /></span><div className="min-w-0"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div></div>; }\n\n'
helper_code = helper_anchor + '''function AppointmentPriceEditor({ appointment, onSaved }: any) {
  const total = Number(appointment?.service_price_snapshot ?? appointment?.service?.price ?? 0);
  const [value, setValue] = useState(total.toFixed(2));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setValue(total.toFixed(2)); }, [appointment?.id, total]);
  if (!appointment || (appointment.payment_choice && appointment.payment_choice !== "onsite")) return null;
  const save = async () => {
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) { toast.error("Informe um valor válido para o atendimento."); return; }
    const nextPrice = Math.round((parsed + Number.EPSILON) * 100) / 100;
    setSaving(true);
    const { error } = await db.rpc("update_appointment_custom_price", { _appointment_id: appointment.id, _new_price: nextPrice });
    setSaving(false);
    if (error) { toast.error("Não foi possível alterar o valor.", { description: error.message }); return; }
    setValue(nextPrice.toFixed(2));
    toast.success("Valor do atendimento atualizado.", { description: appointment.status === "atendido" ? "A receita foi recalculada automaticamente." : "A alteração vale somente para este agendamento." });
    onSaved?.(nextPrice);
  };
  return <div className="mt-3 rounded-2xl border border-border bg-background/70 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold">Alterar valor do atendimento</p><p className="mt-0.5 text-[10px] text-muted-foreground">Pode ser ajustado mesmo depois do agendamento, sem alterar o catálogo.</p></div><span className="shrink-0 text-xs font-semibold text-primary">{formatPrice(total)}</span></div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input type="number" min="0" step="0.01" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} disabled={saving} /><Button type="button" className="rounded-xl sm:shrink-0" onClick={() => void save()} disabled={saving}>{saving ? "Salvando..." : "Salvar novo valor"}</Button></div></div>;
}

'''
text = replace_once(text, helper_anchor, helper_code, "admin price editor helper")
text = replace_once(
    text,
    'function AppointmentAdminDialog({ appointment, open, onOpenChange, onConfirm, onCancel, onAttended, busy }: any) {',
    'function AppointmentAdminDialog({ appointment, open, onOpenChange, onConfirm, onCancel, onAttended, onPriceSaved, busy }: any) {',
    "admin dialog signature",
)
payment_anchor = '    <div className="mt-2 rounded-2xl bg-primary-soft/60 p-4"><div className="flex items-center gap-2 text-primary"><CreditCard className="size-4" /><p className="text-sm font-semibold">{paymentLabel(appointment)}</p></div><div className="mt-3 grid grid-cols-3 gap-2"><SmallInfo label="Total" value={formatPrice(total)} /><SmallInfo label="Pago" value={formatPrice(paid)} /><SmallInfo label="Restante" value={formatPrice(Number(appointment.balance_amount ?? Math.max(0, total - paid)))} /></div>{approved?.paid_at ? <p className="mt-3 text-[11px] text-muted-foreground">Pagamento confirmado em {formatDateTime(approved.paid_at)}</p> : null}</div>\n'
text = replace_once(text, payment_anchor, payment_anchor + '    <AppointmentPriceEditor appointment={appointment} onSaved={onPriceSaved} />\n', "admin dialog price editor ui")
path.write_text(text, encoding="utf-8")

# 3) Admin > Agenda da equipe > professional agenda: editable existing appointment value.
path = Path("src/routes/admin_.equipe.tsx")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    'scheduled_time, status, service_price_snapshot, service:services',
    'scheduled_time, status, payment_choice, service_price_snapshot, service:services',
    "team appointment payment_choice select",
)
team_header_anchor = '                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{appointment.patient_name}</p><p className="mt-1 text-xs text-muted-foreground">{appointment.service?.name || "Atendimento"} · {formatPrice(Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0))}</p></div><div className="text-right"><p className="font-semibold">{appointment.scheduled_time}</p><p className="text-[10px] text-muted-foreground">{formatDate(appointment.scheduled_date)}</p></div></div>\n'
text = replace_once(text, team_header_anchor, team_header_anchor + '                    <ExistingAppointmentPriceEditor appointment={appointment} onSaved={refresh} />\n', "team price editor ui")
modal_anchor = 'function NewAppointmentModal({ open, onClose, professional, services, onSaved }: any) {\n'
team_helper = '''function ExistingAppointmentPriceEditor({ appointment, onSaved }: any) {
  const total = Number(appointment?.service_price_snapshot ?? appointment?.service?.price ?? 0);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(total.toFixed(2));
  const [saving, setSaving] = useState(false);
  if (!appointment || (appointment.payment_choice && appointment.payment_choice !== "onsite")) return null;
  const save = async () => {
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) { toast.error("Informe um valor válido para o atendimento."); return; }
    const nextPrice = Math.round((parsed + Number.EPSILON) * 100) / 100;
    setSaving(true);
    const { error } = await db.rpc("update_appointment_custom_price", { _appointment_id: appointment.id, _new_price: nextPrice });
    setSaving(false);
    if (error) { toast.error("Não foi possível alterar o valor.", { description: error.message }); return; }
    setEditing(false);
    setValue(nextPrice.toFixed(2));
    toast.success("Valor atualizado.", { description: appointment.status === "atendido" ? "A receita foi recalculada com o novo valor." : "A alteração vale somente para este agendamento." });
    await onSaved?.();
  };
  return <div className="mt-3 rounded-xl border border-border/70 bg-background/65 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Valor do atendimento</p><p className="mt-0.5 text-sm font-semibold">{formatPrice(total)}</p></div>{!editing ? <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => { setValue(total.toFixed(2)); setEditing(true); }}>Alterar valor</Button> : null}</div>{editing ? <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input type="number" min="0" step="0.01" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} disabled={saving} /><div className="flex gap-2"><Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={saving} onClick={() => setEditing(false)}>Cancelar</Button><Button type="button" size="sm" className="rounded-xl" disabled={saving} onClick={() => void save()}>{saving ? "Salvando..." : "Salvar valor"}</Button></div></div> : null}</div>;
}

'''
text = replace_once(text, modal_anchor, team_helper + modal_anchor, "team price editor helper")
path.write_text(text, encoding="utf-8")
