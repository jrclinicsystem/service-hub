from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Anchor not found: {label}")
    return text.replace(old, new, 1)


def patch_between(path_str: str, start_marker: str, end_marker: str, transform):
    path = Path(path_str)
    text = path.read_text(encoding="utf-8")
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f"Start marker not found in {path_str}: {start_marker}")
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"End marker not found in {path_str}: {end_marker}")
    section = text[start:end]
    patched = transform(section)
    path.write_text(text[:start] + patched + text[end:], encoding="utf-8")


# 1) Portal da colaboradora: preço editável no agendamento interno.
def patch_professional(section: str) -> str:
    section = replace_once(
        section,
        '  const [serviceId, setServiceId] = useState("");\n',
        '  const [serviceId, setServiceId] = useState("");\n  const [appointmentValue, setAppointmentValue] = useState("");\n',
        'professional custom price state',
    )
    section = replace_once(
        section,
        '      const total = Number(selectedService.price ?? 0);\n',
        '      const parsedValue = Number(appointmentValue.replace(",", "."));\n      if (!Number.isFinite(parsedValue) || parsedValue < 0) { toast.error("Informe um valor válido para o atendimento."); return; }\n      const total = Math.round((parsedValue + Number.EPSILON) * 100) / 100;\n',
        'professional custom price total',
    )
    section = replace_once(
        section,
        '      setServiceId("");\n',
        '      setServiceId("");\n      setAppointmentValue("");\n',
        'professional reset custom price',
    )
    old_service = '          <div className="mt-3"><Label>Serviço</Label><Select value={serviceId} onValueChange={setServiceId}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{services.map((service: any) => <SelectItem key={service.id} value={service.id}>{service.name} · {formatPrice(Number(service.price ?? 0))}</SelectItem>)}</SelectContent></Select></div>\n'
    new_service = '          <div className="mt-3"><Label>Serviço</Label><Select value={serviceId} onValueChange={(value) => { setServiceId(value); const service = services.find((item: any) => item.id === value); setAppointmentValue(service ? String(Number(service.price ?? 0).toFixed(2)) : ""); }}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{services.map((service: any) => <SelectItem key={service.id} value={service.id}>{service.name} · {formatPrice(Number(service.price ?? 0))}</SelectItem>)}</SelectContent></Select></div>\n          <div className="mt-3"><Label>Valor do atendimento</Label><Input className="mt-1.5" type="number" min="0" step="0.01" inputMode="decimal" value={appointmentValue} onChange={(event) => setAppointmentValue(event.target.value)} placeholder="0,00" disabled={!serviceId} /><p className="mt-1 text-[10px] text-muted-foreground">O preço padrão é preenchido automaticamente, mas você pode alterar livremente para aplicar desconto ou valor combinado.</p></div>\n'
    section = replace_once(section, old_service, new_service, 'professional service/value fields')
    return section

patch_between(
    'src/components/professional-client-booking-tools.tsx',
    'export function ProfessionalClientBookingTools',
    '\n}',
    patch_professional,
)


# 2) Novo agendamento do painel administrativo geral.
def patch_admin_dialog(section: str) -> str:
    section = replace_once(
        section,
        '  const [serviceId, setServiceId] = useState("");\n',
        '  const [serviceId, setServiceId] = useState("");\n  const [appointmentValue, setAppointmentValue] = useState("");\n',
        'admin custom price state',
    )
    section = replace_once(
        section,
        '  const reset = () => { setSelectedClientId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setServiceId(""); setProfessionalId(""); setScheduledDate(todayIso()); setScheduledTime(""); setNotes(""); };\n',
        '  const reset = () => { setSelectedClientId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setServiceId(""); setAppointmentValue(""); setProfessionalId(""); setScheduledDate(todayIso()); setScheduledTime(""); setNotes(""); };\n',
        'admin reset custom price',
    )
    section = replace_once(
        section,
        '    const total = Number(service.price ?? 0);\n',
        '    const parsedValue = Number(appointmentValue.replace(",", "."));\n    if (!Number.isFinite(parsedValue) || parsedValue < 0) { toast.error("Informe um valor válido para o atendimento."); return; }\n    const total = Math.round((parsedValue + Number.EPSILON) * 100) / 100;\n',
        'admin custom price total',
    )
    old_service = '    <div className="space-y-1.5 sm:col-span-2"><Label>Serviço *</Label><Select value={serviceId} onValueChange={(value) => { setServiceId(value); setProfessionalId(""); }} disabled={saving || loadingCatalog}><SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{services.map((service) => <SelectItem key={service.id} value={service.id}>{service.name} · {formatPrice(Number(service.price ?? 0))}</SelectItem>)}</SelectContent></Select></div>\n'
    new_service = '    <div className="space-y-1.5 sm:col-span-2"><Label>Serviço *</Label><Select value={serviceId} onValueChange={(value) => { setServiceId(value); setProfessionalId(""); const service = services.find((item) => item.id === value); setAppointmentValue(service ? String(Number(service.price ?? 0).toFixed(2)) : ""); }} disabled={saving || loadingCatalog}><SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{services.map((service) => <SelectItem key={service.id} value={service.id}>{service.name} · {formatPrice(Number(service.price ?? 0))}</SelectItem>)}</SelectContent></Select></div>\n    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="admin-appointment-value">Valor do atendimento *</Label><Input id="admin-appointment-value" type="number" min="0" step="0.01" inputMode="decimal" value={appointmentValue} onChange={(e) => setAppointmentValue(e.target.value)} disabled={saving || !serviceId} /><p className="text-[11px] text-muted-foreground">O valor padrão do serviço é preenchido automaticamente. Altere aqui para aplicar qualquer desconto ou valor combinado sem mudar o catálogo.</p></div>\n'
    section = replace_once(section, old_service, new_service, 'admin service/value fields')
    return section

patch_between(
    'src/components/admin-appointments-workspace.tsx',
    'function CreateAppointmentDialog',
    '\nfunction CategoryButton',
    patch_admin_dialog,
)


# 3) Agenda da equipe > profissional > Novo agendamento.
def patch_team_modal(section: str) -> str:
    section = replace_once(
        section,
        '  const [serviceId, setServiceId] = useState("");\n',
        '  const [serviceId, setServiceId] = useState("");\n  const [appointmentValue, setAppointmentValue] = useState("");\n',
        'team custom price state',
    )
    section = replace_once(
        section,
        '  const reset = () => { setServiceId(""); setClients([]); setClientSearch(""); setSelectedClientId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setDate(todayIso()); setTime(""); setNotes(""); };\n',
        '  const reset = () => { setServiceId(""); setAppointmentValue(""); setClients([]); setClientSearch(""); setSelectedClientId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setDate(todayIso()); setTime(""); setNotes(""); };\n',
        'team reset custom price',
    )
    old_save = '    const selectedService = services.find((service: any) => service.id === serviceId);\n    setBusy(true);\n    const { error } = await db.from("appointments").insert({ user_id: null, client_id: selectedClientId || null, professional_id: professional.id, service_id: serviceId, patient_name: patientName.trim(), patient_email: patientEmail.trim().toLowerCase(), patient_phone: patientPhone.trim(), scheduled_date: date, scheduled_time: time, notes: notes.trim(), status: "pendente", payment_choice: "onsite", service_price_snapshot: Number(selectedService?.price ?? 0), deposit_percent: 0, deposit_amount: 0, balance_amount: Number(selectedService?.price ?? 0) });\n'
    new_save = '    const selectedService = services.find((service: any) => service.id === serviceId);\n    if (!selectedService) { toast.error("Serviço não encontrado."); return; }\n    const parsedValue = Number(appointmentValue.replace(",", "."));\n    if (!Number.isFinite(parsedValue) || parsedValue < 0) { toast.error("Informe um valor válido para o atendimento."); return; }\n    const total = Math.round((parsedValue + Number.EPSILON) * 100) / 100;\n    setBusy(true);\n    const { error } = await db.from("appointments").insert({ user_id: null, client_id: selectedClientId || null, professional_id: professional.id, service_id: serviceId, patient_name: patientName.trim(), patient_email: patientEmail.trim().toLowerCase(), patient_phone: patientPhone.trim(), scheduled_date: date, scheduled_time: time, notes: notes.trim(), status: "pendente", payment_choice: "onsite", service_price_snapshot: total, deposit_percent: 0, deposit_amount: 0, balance_amount: total });\n'
    section = replace_once(section, old_save, new_save, 'team custom price save')
    old_service = '      <div className="sm:col-span-2"><Field label="Serviço"><Select value={serviceId} onValueChange={setServiceId}><SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{services.map((service: any) => <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>)}</SelectContent></Select></Field></div>\n'
    new_service = '      <div className="sm:col-span-2"><Field label="Serviço"><Select value={serviceId} onValueChange={(value) => { setServiceId(value); const service = services.find((item: any) => item.id === value); setAppointmentValue(service ? String(Number(service.price ?? 0).toFixed(2)) : ""); }}><SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{services.map((service: any) => <SelectItem key={service.id} value={service.id}>{service.name} · {formatPrice(Number(service.price ?? 0))}</SelectItem>)}</SelectContent></Select></Field></div>\n      <div className="sm:col-span-2"><Field label="Valor do atendimento"><Input type="number" min="0" step="0.01" inputMode="decimal" value={appointmentValue} onChange={(e) => setAppointmentValue(e.target.value)} disabled={!serviceId || busy} /></Field><p className="mt-1 text-[10px] text-muted-foreground">Preço preenchido pelo catálogo, com liberdade para alterar o valor deste agendamento.</p></div>\n'
    section = replace_once(section, old_service, new_service, 'team service/value fields')
    return section

patch_between(
    'src/routes/admin_.equipe.tsx',
    'function NewAppointmentModal',
    '\nfunction HoursModal',
    patch_team_modal,
)
