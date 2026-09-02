from pathlib import Path

path = Path('src/routes/admin_.equipe.tsx')
text = path.read_text(encoding='utf-8')

# Add client picker state to the team agenda's NewAppointmentModal.
state_anchor = '''  const [serviceId, setServiceId] = useState("");
  const [patientName, setPatientName] = useState("");'''
state_new = '''  const [serviceId, setServiceId] = useState("");
  const [clients, setClients] = useState<any[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [patientName, setPatientName] = useState("");'''
if state_anchor not in text:
    raise SystemExit('NewAppointmentModal state anchor not found')
if 'const [clientSearch, setClientSearch]' not in text:
    text = text.replace(state_anchor, state_new, 1)

# Load active clients when the modal opens.
availability_effect_anchor = '''  useEffect(() => {
    let cancelled = false;
    setTime("");

    if (!open || !professional?.id || !date) {'''
clients_effect = '''  useEffect(() => {
    let cancelled = false;
    if (!open) return;

    setClientsLoading(true);
    void db
      .from("clients")
      .select("id, name, whatsapp, email, is_active")
      .eq("is_active", true)
      .order("name")
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) {
          console.error("Falha ao carregar clientes", error);
          setClients([]);
          toast.error("Não foi possível carregar os clientes cadastrados.");
        } else {
          setClients(data ?? []);
        }
        setClientsLoading(false);
      });

    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    setTime("");

    if (!open || !professional?.id || !date) {'''
if availability_effect_anchor not in text:
    raise SystemExit('availability effect anchor not found')
if 'Falha ao carregar clientes' not in text:
    text = text.replace(availability_effect_anchor, clients_effect, 1)

# Add search/filter + select/clear helpers before reset.
reset_anchor = '''  const reset = () => { setServiceId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setDate(todayIso()); setTime(""); setNotes(""); };'''
helper_block = '''  const filteredClients = useMemo(() => {
    const term = clientSearch.trim().toLowerCase();
    const source = term
      ? clients.filter((client: any) => [client.name, client.whatsapp, client.email].some((value) => String(value ?? "").toLowerCase().includes(term)))
      : clients;
    return source.slice(0, 8);
  }, [clients, clientSearch]);

  const selectClient = (client: any) => {
    setSelectedClientId(client.id);
    setPatientName(client.name ?? "");
    setPatientPhone(client.whatsapp ?? "");
    setPatientEmail(client.email ?? "");
    setClientSearch(client.name ?? "");
  };

  const clearClientSelection = () => {
    setSelectedClientId("");
    setClientSearch("");
    setPatientName("");
    setPatientPhone("");
    setPatientEmail("");
  };

  const reset = () => { setServiceId(""); setClients([]); setClientSearch(""); setSelectedClientId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setDate(todayIso()); setTime(""); setNotes(""); };'''
if reset_anchor not in text:
    raise SystemExit('reset anchor not found')
if 'const filteredClients = useMemo' not in text:
    text = text.replace(reset_anchor, helper_block, 1)

# Link the appointment to the selected client.
insert_old = '''const { error } = await db.from("appointments").insert({ user_id: null, professional_id: professional.id, service_id: serviceId, patient_name: patientName.trim(), patient_email: patientEmail.trim().toLowerCase(), patient_phone: patientPhone.trim(), scheduled_date: date, scheduled_time: time, notes: notes.trim(), status: "pendente", payment_choice: "onsite", service_price_snapshot: Number(selectedService?.price ?? 0), deposit_percent: 0, deposit_amount: 0, balance_amount: Number(selectedService?.price ?? 0) });'''
insert_new = '''const { error } = await db.from("appointments").insert({ user_id: null, client_id: selectedClientId || null, professional_id: professional.id, service_id: serviceId, patient_name: patientName.trim(), patient_email: patientEmail.trim().toLowerCase(), patient_phone: patientPhone.trim(), scheduled_date: date, scheduled_time: time, notes: notes.trim(), status: "pendente", payment_choice: "onsite", service_price_snapshot: Number(selectedService?.price ?? 0), deposit_percent: 0, deposit_amount: 0, balance_amount: Number(selectedService?.price ?? 0) });'''
if insert_old not in text:
    raise SystemExit('appointment insert anchor not found')
text = text.replace(insert_old, insert_new, 1)

# Replace the plain patient-name-only row with a searchable database client picker plus manual fields.
form_old = '''      <div className="sm:col-span-2"><Field label="Cliente / paciente"><Input value={patientName} onChange={(e) => setPatientName(e.target.value)} /></Field></div>
      <Field label="WhatsApp"><Input inputMode="tel" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} /></Field>
      <Field label="E-mail"><Input type="email" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} /></Field>'''
form_new = '''      <div className="sm:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <Label>Selecionar cliente cadastrado</Label>
          {selectedClientId ? <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearClientSelection} disabled={busy}>Preencher manualmente</Button> : null}
        </div>
        <div className="mt-2 rounded-2xl border border-border bg-card p-2">
          <Input
            value={clientSearch}
            onChange={(e) => { setClientSearch(e.target.value); if (selectedClientId) setSelectedClientId(""); }}
            placeholder={clientsLoading ? "Carregando clientes..." : "Buscar por nome, WhatsApp ou e-mail..."}
            disabled={busy || clientsLoading}
            className="h-10 rounded-xl"
          />
          {!clientsLoading ? (
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
              {filteredClients.length ? filteredClients.map((client: any) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => selectClient(client)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition ${selectedClientId === client.id ? "bg-primary-soft text-primary" : "hover:bg-secondary/60"}`}
                >
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{client.name}</span><span className="block truncate text-[10px] text-muted-foreground">{client.whatsapp}{client.email ? ` · ${client.email}` : ""}</span></span>
                  {selectedClientId === client.id ? <Check className="size-4 shrink-0" /> : null}
                </button>
              )) : <p className="px-3 py-3 text-center text-xs text-muted-foreground">Nenhum cliente encontrado.</p>}
            </div>
          ) : null}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">Selecione um cliente salvo para preencher os dados automaticamente ou preencha manualmente abaixo.</p>
      </div>
      <div className="sm:col-span-2"><Field label="Cliente / paciente"><Input value={patientName} onChange={(e) => { setPatientName(e.target.value); if (selectedClientId) setSelectedClientId(""); }} /></Field></div>
      <Field label="WhatsApp"><Input inputMode="tel" value={patientPhone} onChange={(e) => { setPatientPhone(e.target.value); if (selectedClientId) setSelectedClientId(""); }} /></Field>
      <Field label="E-mail"><Input type="email" value={patientEmail} onChange={(e) => { setPatientEmail(e.target.value); if (selectedClientId) setSelectedClientId(""); }} /></Field>'''
if form_old not in text:
    raise SystemExit('patient form anchor not found')
text = text.replace(form_old, form_new, 1)

path.write_text(text, encoding='utf-8')
