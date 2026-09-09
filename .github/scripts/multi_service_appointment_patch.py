from pathlib import Path

p = Path('src/components/admin-appointments-workspace.tsx')
s = p.read_text()

# helper for labels
needle = '''function statusLabel(status: string) {
'''
helper = '''function appointmentServiceLabel(item: any) {
  const linked = [...(item?.appointment_services ?? [])]
    .sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((entry: any) => entry?.service?.name)
    .filter(Boolean);
  if (linked.length) return linked.join(" + ");
  return item?.service?.name ?? "Atendimento";
}

function statusLabel(status: string) {
'''
assert needle in s
s = s.replace(needle, helper, 1)

s = s.replace('service:services(name, price, duration_min), professional:professionals(name, specialty), payments(', 'service:services(name, price, duration_min), appointment_services(position, service:services(name, price, duration_min)), professional:professionals(name, specialty), payments(')
s = s.replace('${detail.service?.name ?? "Atendimento"}', '${appointmentServiceLabel(detail)}')
s = s.replace('appointment.service?.name ?? "Atendimento"', 'appointmentServiceLabel(appointment)')

s = s.replace('const [serviceId, setServiceId] = useState("");', 'const [serviceIds, setServiceIds] = useState<string[]>([]);')

old = '''  const availableProfessionals = useMemo(() => {
    if (!serviceId) return [];
    const allowed = new Set(links.filter((link) => link.service_id === serviceId).map((link) => link.professional_id));
    return professionals.filter((professional) => allowed.has(professional.id));
  }, [serviceId, links, professionals]);
'''
new = '''  const availableProfessionals = useMemo(() => {
    if (!serviceIds.length) return [];
    return professionals.filter((professional) =>
      serviceIds.every((serviceId) => links.some((link) => link.service_id === serviceId && link.professional_id === professional.id)),
    );
  }, [serviceIds, links, professionals]);

  const selectedServices = useMemo(
    () => serviceIds.map((id) => services.find((service) => service.id === id)).filter(Boolean),
    [serviceIds, services],
  );

  const toggleService = (id: string) => {
    setProfessionalId("");
    setServiceIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      const total = next.reduce((sum, serviceId) => sum + Number(services.find((service) => service.id === serviceId)?.price ?? 0), 0);
      setAppointmentValue(total.toFixed(2));
      return next;
    });
  };
'''
assert old in s
s = s.replace(old, new, 1)

s = s.replace('setServiceId(""); setAppointmentValue("");', 'setServiceIds([]); setAppointmentValue("");')

start = s.index('  const createAppointment = async () => {')
end = s.index('\n\n  return <Dialog open={open}', start)
new_create = '''  const createAppointment = async () => {
    if (!patientName.trim()) { toast.error("Informe o nome do cliente."); return; }
    if (!serviceIds.length) { toast.error("Selecione ao menos um serviço."); return; }
    if (!professionalId) { toast.error("Selecione o profissional."); return; }
    if (!scheduledDate || scheduledDate < todayIso()) { toast.error("Selecione uma data válida."); return; }
    if (!scheduledTime) { toast.error("Selecione o horário."); return; }
    const invalidLink = serviceIds.some((serviceId) => !links.some((link) => link.service_id === serviceId && link.professional_id === professionalId));
    if (invalidLink) { toast.error("Esse profissional não atende todos os serviços selecionados."); return; }
    const parsedValue = Number(appointmentValue.replace(",", "."));
    if (!Number.isFinite(parsedValue) || parsedValue < 0) { toast.error("Informe um valor válido para o atendimento."); return; }
    const total = Math.round((parsedValue + Number.EPSILON) * 100) / 100;
    setSaving(true);
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
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setBookingSlotsRefreshKey((current) => current + 1);
    toast.success("Agendamento enviado para confirmação da profissional.", { description: `${patientName.trim()} · ${selectedServices.map((service: any) => service.name).join(" + ")} · ${formatDate(scheduledDate)} às ${scheduledTime}` });
    reset(); onCreated();
  };'''
s = s[:start] + new_create + s[end:]

old_ui = '''    <div className="space-y-1.5 sm:col-span-2"><Label>Serviço *</Label><Select value={serviceId} onValueChange={(value) => { setServiceId(value); setProfessionalId(""); const service = services.find((item) => item.id === value); setAppointmentValue(service ? String(Number(service.price ?? 0).toFixed(2)) : ""); }} disabled={saving || loadingCatalog}><SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{services.map((service) => <SelectItem key={service.id} value={service.id}>{service.name} · {formatPrice(Number(service.price ?? 0))}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="admin-appointment-value">Valor do atendimento *</Label><Input id="admin-appointment-value" type="number" min="0" step="0.01" inputMode="decimal" value={appointmentValue} onChange={(e) => setAppointmentValue(e.target.value)} disabled={saving || !serviceId} /><p className="text-[11px] text-muted-foreground">O valor padrão do serviço é preenchido automaticamente. Altere aqui para aplicar qualquer desconto ou valor combinado sem mudar o catálogo.</p></div>
    <div className="space-y-1.5 sm:col-span-2"><Label>Profissional *</Label><Select value={professionalId} onValueChange={setProfessionalId} disabled={saving || !serviceId || availableProfessionals.length === 0}><SelectTrigger><SelectValue placeholder={!serviceId ? "Escolha primeiro o serviço" : "Selecione o profissional"} /></SelectTrigger><SelectContent>{availableProfessionals.map((professional) => <SelectItem key={professional.id} value={professional.id}>{professional.name}{professional.specialty ? ` · ${professional.specialty}` : ""}</SelectItem>)}</SelectContent></Select></div>
'''
new_ui = '''    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-center justify-between gap-3"><Label>Serviços *</Label><span className="text-[11px] text-muted-foreground">{serviceIds.length ? `${serviceIds.length} selecionado(s)` : "Selecione um ou mais"}</span></div>
      <div className="grid max-h-52 gap-2 overflow-y-auto rounded-2xl border border-border bg-background p-2 sm:grid-cols-2">
        {services.map((service) => { const checked = serviceIds.includes(service.id); return <button key={service.id} type="button" disabled={saving || loadingCatalog} onClick={() => toggleService(service.id)} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${checked ? "border-primary bg-primary-soft/70 text-primary" : "border-border bg-card hover:bg-secondary/40"}`}><span className="min-w-0"><span className="block truncate text-sm font-medium">{service.name}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{formatPrice(Number(service.price ?? 0))}</span></span><span className={`grid size-6 shrink-0 place-items-center rounded-lg border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>{checked ? <Check className="size-3.5" /> : null}</span></button>; })}
      </div>
      <p className="text-[11px] text-muted-foreground">Você pode marcar vários procedimentos no mesmo agendamento. O profissional precisa atender todos os serviços escolhidos.</p>
    </div>
    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="admin-appointment-value">Valor total do atendimento *</Label><Input id="admin-appointment-value" type="number" min="0" step="0.01" inputMode="decimal" value={appointmentValue} onChange={(e) => setAppointmentValue(e.target.value)} disabled={saving || !serviceIds.length} /><p className="text-[11px] text-muted-foreground">A soma dos serviços é preenchida automaticamente. Altere aqui para aplicar desconto ou valor combinado sem mudar o catálogo.</p></div>
    <div className="space-y-1.5 sm:col-span-2"><Label>Profissional *</Label><Select value={professionalId} onValueChange={setProfessionalId} disabled={saving || !serviceIds.length || availableProfessionals.length === 0}><SelectTrigger><SelectValue placeholder={!serviceIds.length ? "Escolha primeiro os serviços" : availableProfessionals.length ? "Selecione o profissional" : "Nenhum profissional atende todos os serviços"} /></SelectTrigger><SelectContent>{availableProfessionals.map((professional) => <SelectItem key={professional.id} value={professional.id}>{professional.name}{professional.specialty ? ` · ${professional.specialty}` : ""}</SelectItem>)}</SelectContent></Select></div>
'''
assert old_ui in s
s = s.replace(old_ui, new_ui, 1)

p.write_text(s)

p2 = Path('src/routes/admin.tsx')
s2 = p2.read_text()
s2 = s2.replace('service:services(name, price, duration_min), professional:professionals(name, specialty), payments(', 'service:services(name, price, duration_min), appointment_services(position, service:services(name, price, duration_min)), professional:professionals(name, specialty), payments(')
p2.write_text(s2)
