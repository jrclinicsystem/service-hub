from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


root = Path(__file__).resolve().parents[2]
admin_path = root / "src/routes/admin.tsx"
workspace_path = root / "src/components/admin-appointments-workspace.tsx"

admin = admin_path.read_text(encoding="utf-8")
admin = replace_once(
    admin,
    "  CalendarDays,\n  CircleDollarSign,",
    "  BadgePercent,\n  CalendarDays,\n  CircleDollarSign,",
    "admin icon import",
)
admin = replace_once(
    admin,
    'professional:professionals(id, name, specialty), payments(status, amount, kind, payment_method_id, provider, paid_at, created_at, status_detail)",',
    'professional:professionals(id, name, specialty), payments(status, amount, kind, payment_method_id, provider, paid_at, created_at, status_detail), seller_assignment:appointment_sellers(seller_id, seller_name_snapshot, commission_percentage_snapshot, seller:sellers(id, name, commission_percentage, is_active, deleted_at))",',
    "admin appointment seller relation",
)
admin = replace_once(
    admin,
    '        </div>\n\n        <Tabs defaultValue="agendamentos" className="mt-5 w-full min-w-0 max-w-full sm:mt-10">',
    '        </div>\n\n        <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">\n          <Button variant="outline" size="sm" className="rounded-xl" asChild>\n            <Link to="/admin/vendedores"><BadgePercent className="size-4" /> Vendedores e comissões</Link>\n          </Button>\n          <Button variant="outline" size="sm" className="rounded-xl" asChild>\n            <Link to="/admin/financeiro"><CircleDollarSign className="size-4" /> Financeiro</Link>\n          </Button>\n        </div>\n\n        <Tabs defaultValue="agendamentos" className="mt-5 w-full min-w-0 max-w-full sm:mt-10">',
    "admin quick seller navigation",
)
admin_path.write_text(admin, encoding="utf-8")

workspace = workspace_path.read_text(encoding="utf-8")
workspace = replace_once(
    workspace,
    'professional:professionals(name, specialty), payments(status, amount, kind, payment_method_id, provider, paid_at, created_at, status_detail)").eq("id", id).maybeSingle();',
    'professional:professionals(name, specialty), payments(status, amount, kind, payment_method_id, provider, paid_at, created_at, status_detail), seller_assignment:appointment_sellers(seller_id, seller_name_snapshot, commission_percentage_snapshot, seller:sellers(id, name, commission_percentage, is_active, deleted_at))").eq("id", id).maybeSingle();',
    "realtime appointment seller relation",
)
workspace = replace_once(
    workspace,
    '[item.patient_name, item.patient_email, item.patient_phone, item.service?.name, item.professional?.name].some((value) => String(value ?? "").toLowerCase().includes(term));',
    '[item.patient_name, item.patient_email, item.patient_phone, item.service?.name, item.professional?.name, item.seller_assignment?.seller_name_snapshot].some((value) => String(value ?? "").toLowerCase().includes(term));',
    "appointment seller search",
)
workspace = replace_once(
    workspace,
    '<p className="mt-1 truncate text-xs text-muted-foreground">{appointment.professional?.name ?? "Profissional não definido"} · {appointment.professional?.specialty ?? "Equipe"}</p></div>',
    '<p className="mt-1 truncate text-xs text-muted-foreground">{appointment.professional?.name ?? "Profissional não definido"} · {appointment.professional?.specialty ?? "Equipe"}</p>{appointment.seller_assignment ? <p className="mt-1 truncate text-[11px] font-medium text-primary">Vendedor: {appointment.seller_assignment.seller_name_snapshot} · {Number(appointment.seller_assignment.commission_percentage_snapshot ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%</p> : null}</div>',
    "appointment seller card",
)
workspace = replace_once(
    workspace,
    '  const [clients, setClients] = useState<any[]>([]);\n  const [comboSessions, setComboSessions] = useState<any[]>([]);',
    '  const [clients, setClients] = useState<any[]>([]);\n  const [sellers, setSellers] = useState<any[]>([]);\n  const [comboSessions, setComboSessions] = useState<any[]>([]);',
    "seller state list",
)
workspace = replace_once(
    workspace,
    '  const [professionalId, setProfessionalId] = useState("");\n  const [scheduledDate, setScheduledDate] = useState(todayIso());',
    '  const [professionalId, setProfessionalId] = useState("");\n  const [sellerId, setSellerId] = useState("");\n  const [scheduledDate, setScheduledDate] = useState(todayIso());',
    "seller selected state",
)
workspace = replace_once(
    workspace,
    '      db.from("clients").select("id, name, whatsapp, email, is_active").eq("is_active", true).order("name"),\n    ]).then(([serviceResult, professionalResult, linkResult, clientResult]) => {',
    '      db.from("clients").select("id, name, whatsapp, email, is_active").eq("is_active", true).order("name"),\n      db.from("sellers").select("id, name, commission_percentage, is_active, deleted_at").order("name"),\n    ]).then(([serviceResult, professionalResult, linkResult, clientResult, sellerResult]) => {',
    "load sellers in appointment dialog",
)
workspace = replace_once(
    workspace,
    '      const firstError = [serviceResult, professionalResult, linkResult, clientResult].find((result) => result.error)?.error;\n      if (firstError) toast.error(firstError.message);\n      else { setServices(serviceResult.data ?? []); setProfessionals(professionalResult.data ?? []); setLinks(linkResult.data ?? []); setClients(clientResult.data ?? []); }',
    '      const firstError = [serviceResult, professionalResult, linkResult, clientResult, sellerResult].find((result) => result.error)?.error;\n      if (firstError) toast.error(firstError.message);\n      else { setServices(serviceResult.data ?? []); setProfessionals(professionalResult.data ?? []); setLinks(linkResult.data ?? []); setClients(clientResult.data ?? []); setSellers(sellerResult.data ?? []); }',
    "store seller catalog",
)
workspace = replace_once(
    workspace,
    '    setProfessionalId(editing.professional_id ?? editing.professional?.id ?? "");\n    setScheduledDate(editing.scheduled_date ?? todayIso());',
    '    setProfessionalId(editing.professional_id ?? editing.professional?.id ?? "");\n    setSellerId(editing.seller_assignment?.seller_id ?? "");\n    setScheduledDate(editing.scheduled_date ?? todayIso());',
    "populate seller on edit",
)
workspace = replace_once(
    workspace,
    'setAppointmentValue(""); setProfessionalId(""); setScheduledDate(todayIso());',
    'setAppointmentValue(""); setProfessionalId(""); setSellerId(""); setScheduledDate(todayIso());',
    "reset selected seller",
)
workspace = replace_once(
    workspace,
    '    }\n    if (!error && appointmentId) {\n      const configured = await db.rpc("configure_appointment_service_sessions", {',
    '    }\n    if (!error && appointmentId) {\n      const sellerResult = await db.rpc("set_appointment_seller", {\n        _appointment_id: appointmentId,\n        _seller_id: sellerId || null,\n      });\n      error = sellerResult.error;\n    }\n    if (!error && appointmentId) {\n      const configured = await db.rpc("configure_appointment_service_sessions", {',
    "persist appointment seller",
)
professional_line = '    <div className="space-y-1.5 sm:col-span-2"><Label>Profissional *</Label><Select value={professionalId} onValueChange={setProfessionalId} disabled={saving || !serviceIds.length || availableProfessionals.length === 0}><SelectTrigger><SelectValue placeholder={!serviceIds.length ? "Escolha primeiro os serviços" : availableProfessionals.length ? "Selecione o profissional" : "Nenhum profissional atende todos os serviços"} /></SelectTrigger><SelectContent>{availableProfessionals.map((professional) => <SelectItem key={professional.id} value={professional.id}>{professional.name}{professional.specialty ? ` · ${professional.specialty}` : ""}</SelectItem>)}</SelectContent></Select></div>'
seller_block = professional_line + '\n    <div className="space-y-1.5 sm:col-span-2"><Label>Vendedor / indicação</Label><Select value={sellerId || "__none__"} onValueChange={(value) => setSellerId(value === "__none__" ? "" : value)} disabled={saving || loadingCatalog}><SelectTrigger><SelectValue placeholder="Sem vendedor" /></SelectTrigger><SelectContent><SelectItem value="__none__">Sem vendedor / indicação direta</SelectItem>{sellers.filter((seller) => (seller.is_active && !seller.deleted_at) || seller.id === sellerId).map((seller) => <SelectItem key={seller.id} value={seller.id}>{seller.name} · {Number(seller.commission_percentage ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%{seller.deleted_at || !seller.is_active ? " · inativo" : ""}</SelectItem>)}</SelectContent></Select><p className="text-[11px] text-muted-foreground">Opcional. A porcentagem escolhida fica registrada neste agendamento e a comissão é calculada separadamente da comissão do profissional quando a venda entra no financeiro.</p></div>'
workspace = replace_once(workspace, professional_line, seller_block, "seller selector in appointment form")
workspace_path.write_text(workspace, encoding="utf-8")

print("Seller commission UI patch applied successfully.")
