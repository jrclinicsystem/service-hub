from pathlib import Path

# --- Public signup: collect client data and send metadata used by DB trigger ---
auth_path = Path('src/routes/auth.tsx')
auth = auth_path.read_text(encoding='utf-8')

state_anchor = '  const [name, setName] = useState("");\n  const [busy, setBusy] = useState(false);'
state_replacement = '  const [name, setName] = useState("");\n  const [whatsapp, setWhatsapp] = useState("");\n  const [birthDate, setBirthDate] = useState("");\n  const [busy, setBusy] = useState(false);'
if state_anchor in auth and 'const [whatsapp, setWhatsapp]' not in auth:
    auth = auth.replace(state_anchor, state_replacement, 1)

start = auth.find('  const signUp = async () => {')
end = auth.find('\n\n  const isAdminAccess =', start)
if start == -1 or end == -1:
    raise SystemExit('signUp block not found in auth.tsx')
new_signup = '''  const signUp = async () => {
    const panelSignup = isPanelDestination(next);
    const normalizedWhatsApp = whatsapp.replace(/\\D/g, "");
    const today = new Date();
    const todayLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    if (!name.trim() || !email.trim() || password.length < 8) {
      toast.error("Preencha nome, e-mail e uma senha de pelo menos 8 caracteres.");
      return;
    }

    if (!panelSignup) {
      if (normalizedWhatsApp.length < 10) {
        toast.error("Informe um WhatsApp válido com DDD.");
        return;
      }
      if (!birthDate || birthDate > todayLocal) {
        toast.error("Informe uma data de nascimento válida.");
        return;
      }
    }

    setBusy(true);
    const redirectTo = `${publicAuthOrigin()}/auth${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: panelSignup
          ? { full_name: name.trim(), account_type: "panel" }
          : {
              full_name: name.trim(),
              whatsapp: normalizedWhatsApp,
              phone: normalizedWhatsApp,
              birth_date: birthDate,
              account_type: "client",
            },
      },
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Conta criada! Verifique seu e-mail se a confirmação for solicitada.");
  };'''
auth = auth[:start] + new_signup + auth[end:]

email_marker = '''              <div>
                <Label htmlFor="email-novo">E-mail</Label>'''
client_fields = '''              {!isAdminAccess && (
                <>
                  <div>
                    <Label htmlFor="whatsapp-novo">WhatsApp</Label>
                    <Input
                      id="whatsapp-novo"
                      inputMode="tel"
                      autoComplete="tel"
                      value={whatsapp}
                      onChange={(event) => setWhatsapp(event.target.value)}
                      className="mt-2 h-11 rounded-xl"
                      placeholder="(85) 99999-9999"
                    />
                  </div>
                  <div>
                    <Label htmlFor="nascimento-novo">Data de nascimento</Label>
                    <Input
                      id="nascimento-novo"
                      type="date"
                      value={birthDate}
                      onChange={(event) => setBirthDate(event.target.value)}
                      className="mt-2 h-11 rounded-xl"
                    />
                  </div>
                </>
              )}
'''
if client_fields not in auth:
    if email_marker not in auth:
        raise SystemExit('signup email field marker not found')
    auth = auth.replace(email_marker, client_fields + email_marker, 1)

auth_path.write_text(auth, encoding='utf-8')

# --- Admin manual appointment: select a saved client and link appointment to it ---
admin_path = Path('src/components/admin-appointments-workspace.tsx')
admin = admin_path.read_text(encoding='utf-8')

state_anchor = '  const [timeSlots, setTimeSlots] = useState<any[]>([]);\n  const [patientName, setPatientName] = useState("");'
state_replacement = '  const [timeSlots, setTimeSlots] = useState<any[]>([]);\n  const [clients, setClients] = useState<any[]>([]);\n  const [selectedClientId, setSelectedClientId] = useState("");\n  const [patientName, setPatientName] = useState("");'
if state_anchor in admin and 'const [clients, setClients]' not in admin:
    admin = admin.replace(state_anchor, state_replacement, 1)

slot_query = '      db.from("time_slots").select("id, slot, is_available, sort_order").eq("is_available", true).order("sort_order"),\n'
client_query = '      db.from("clients").select("id, name, whatsapp, email, is_active").eq("is_active", true).order("name"),\n'
if client_query not in admin:
    if slot_query not in admin:
        raise SystemExit('time slot query marker not found')
    admin = admin.replace(slot_query, slot_query + client_query, 1)

admin = admin.replace(
    '    ]).then(([serviceResult, professionalResult, linkResult, slotResult]) => {',
    '    ]).then(([serviceResult, professionalResult, linkResult, slotResult, clientResult]) => {',
    1,
)
admin = admin.replace(
    '      const firstError = [serviceResult, professionalResult, linkResult, slotResult].find((result) => result.error)?.error;',
    '      const firstError = [serviceResult, professionalResult, linkResult, slotResult, clientResult].find((result) => result.error)?.error;',
    1,
)
old_else = '      else { setServices(serviceResult.data ?? []); setProfessionals(professionalResult.data ?? []); setLinks(linkResult.data ?? []); setTimeSlots(slotResult.data ?? []); }'
new_else = '      else { setServices(serviceResult.data ?? []); setProfessionals(professionalResult.data ?? []); setLinks(linkResult.data ?? []); setTimeSlots(slotResult.data ?? []); setClients(clientResult.data ?? []); }'
if old_else in admin:
    admin = admin.replace(old_else, new_else, 1)

reset_anchor = '  const reset = () => { setPatientName(""); setPatientEmail(""); setPatientPhone(""); setServiceId(""); setProfessionalId(""); setScheduledDate(todayIso()); setScheduledTime(""); setNotes(""); };'
reset_new = '  const reset = () => { setSelectedClientId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setServiceId(""); setProfessionalId(""); setScheduledDate(todayIso()); setScheduledTime(""); setNotes(""); };'
if reset_anchor in admin:
    admin = admin.replace(reset_anchor, reset_new, 1)
else:
    raise SystemExit('reset marker not found')

select_handler = '''
  const selectSavedClient = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clients.find((item) => item.id === clientId);
    if (!client) return;
    setPatientName(client.name ?? "");
    setPatientPhone(client.whatsapp ?? "");
    setPatientEmail(client.email ?? "");
  };

  const clearSavedClient = () => {
    setSelectedClientId("");
    setPatientName("");
    setPatientPhone("");
    setPatientEmail("");
  };
'''
insert_before_reset = '  const reset = () =>'
if 'const selectSavedClient =' not in admin:
    idx = admin.find(insert_before_reset)
    if idx == -1:
        raise SystemExit('reset insertion point not found')
    admin = admin[:idx] + select_handler + '\n' + admin[idx:]

old_insert = '    const { error } = await db.from("appointments").insert({ user_id: null, service_id: serviceId, professional_id: professionalId, patient_name: patientName.trim(), patient_email: patientEmail.trim(), patient_phone: patientPhone.trim(), notes: notes.trim(), scheduled_date: scheduledDate, scheduled_time: scheduledTime, status: "pendente", payment_choice: "onsite", service_price_snapshot: total, deposit_percent: 0, deposit_amount: 0, balance_amount: total });'
new_insert = '    const { error } = await db.from("appointments").insert({ user_id: null, client_id: selectedClientId || null, service_id: serviceId, professional_id: professionalId, patient_name: patientName.trim(), patient_email: patientEmail.trim(), patient_phone: patientPhone.trim(), notes: notes.trim(), scheduled_date: scheduledDate, scheduled_time: scheduledTime, status: "pendente", payment_choice: "onsite", service_price_snapshot: total, deposit_percent: 0, deposit_amount: 0, balance_amount: total });'
if old_insert in admin:
    admin = admin.replace(old_insert, new_insert, 1)
else:
    raise SystemExit('appointment insert marker not found')

form_marker = '    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="admin-patient-name">Nome do cliente *</Label><Input id="admin-patient-name" value={patientName} onChange={(e) => setPatientName(e.target.value)} disabled={saving} /></div>'
client_selector = '''    <div className="space-y-1.5 sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <Label>Selecionar cliente cadastrado</Label>
        {selectedClientId ? <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearSavedClient} disabled={saving}>Preencher manualmente</Button> : null}
      </div>
      <Select value={selectedClientId} onValueChange={selectSavedClient} disabled={saving || loadingCatalog || clients.length === 0}>
        <SelectTrigger><SelectValue placeholder={clients.length === 0 ? "Nenhum cliente cadastrado" : "Escolha um cliente"} /></SelectTrigger>
        <SelectContent>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name} · {client.whatsapp}</SelectItem>)}</SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">Ao selecionar, nome, WhatsApp e e-mail são preenchidos automaticamente.</p>
    </div>
'''
if client_selector not in admin:
    if form_marker not in admin:
        raise SystemExit('patient name form marker not found')
    admin = admin.replace(form_marker, client_selector + form_marker, 1)

admin_path.write_text(admin, encoding='utf-8')

# --- Supabase generated types: add clients and appointment client_id ---
types_path = Path('src/integrations/supabase/types.ts')
types = types_path.read_text(encoding='utf-8')

# appointment client_id in Row/Insert/Update (three first relevant occurrences inside appointments)
appointments_start = types.find('      appointments: {')
appointments_end = types.find('      categories: {', appointments_start)
if appointments_start == -1 or appointments_end == -1:
    raise SystemExit('appointments types block not found')
block = types[appointments_start:appointments_end]
block = block.replace('          created_at: string\n          id: string', '          client_id: string | null\n          created_at: string\n          id: string', 1)
block = block.replace('          created_at?: string\n          id?: string', '          client_id?: string | null\n          created_at?: string\n          id?: string', 1)
block = block.replace('          created_at?: string\n          id?: string', '          client_id?: string | null\n          created_at?: string\n          id?: string', 1)
# Add client FK relationship if not present.
rel_marker = '        Relationships: [\n          {\n            foreignKeyName: "appointments_professional_id_fkey"'
if 'appointments_client_id_fkey' not in block and rel_marker in block:
    rel_new = '''        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"'''
    block = block.replace(rel_marker, rel_new, 1)
types = types[:appointments_start] + block + types[appointments_end:]

if '      clients: {' not in types:
    clients_type = '''      clients: {
        Row: {
          auth_user_id: string | null
          birth_date: string
          birthday_benefit_type: string
          birthday_custom_benefit: string | null
          birthday_discount_percent: number | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          auth_user_id?: string | null
          birth_date: string
          birthday_benefit_type?: string
          birthday_custom_benefit?: string | null
          birthday_discount_percent?: number | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          auth_user_id?: string | null
          birth_date?: string
          birthday_benefit_type?: string
          birthday_custom_benefit?: string | null
          birthday_discount_percent?: number | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          whatsapp?: string
        }
        Relationships: []
      }
'''
    marker = '      professional_time_slots: {'
    if marker not in types:
        raise SystemExit('professional_time_slots types marker not found')
    types = types.replace(marker, clients_type + marker, 1)

types_path.write_text(types, encoding='utf-8')
