from pathlib import Path

# 1) Main admin "Novo agendamento": use the same RPC as public booking.
path = Path('src/components/admin-appointments-workspace.tsx')
text = path.read_text(encoding='utf-8')

text = text.replace('  const [timeSlots, setTimeSlots] = useState<any[]>([]);\n', '', 1)
state_anchor = '  const [clients, setClients] = useState<any[]>([]);\n  const [selectedClientId, setSelectedClientId] = useState("");\n'
state_new = '  const [clients, setClients] = useState<any[]>([]);\n  const [bookingSlots, setBookingSlots] = useState<any[]>([]);\n  const [bookingSlotsLoading, setBookingSlotsLoading] = useState(false);\n  const [selectedClientId, setSelectedClientId] = useState("");\n'
if state_anchor in text and 'bookingSlotsLoading' not in text:
    text = text.replace(state_anchor, state_new, 1)

slot_query = '      db.from("time_slots").select("id, slot, is_available, sort_order").eq("is_available", true).order("sort_order"),\n'
text = text.replace(slot_query, '', 1)
text = text.replace('    ]).then(([serviceResult, professionalResult, linkResult, slotResult, clientResult]) => {', '    ]).then(([serviceResult, professionalResult, linkResult, clientResult]) => {', 1)
text = text.replace('      const firstError = [serviceResult, professionalResult, linkResult, slotResult, clientResult].find((result) => result.error)?.error;', '      const firstError = [serviceResult, professionalResult, linkResult, clientResult].find((result) => result.error)?.error;', 1)
text = text.replace('      else { setServices(serviceResult.data ?? []); setProfessionals(professionalResult.data ?? []); setLinks(linkResult.data ?? []); setTimeSlots(slotResult.data ?? []); setClients(clientResult.data ?? []); }', '      else { setServices(serviceResult.data ?? []); setProfessionals(professionalResult.data ?? []); setLinks(linkResult.data ?? []); setClients(clientResult.data ?? []); }', 1)

catalog_effect_end = '''    return () => { active = false; };
  }, [open]);

  const availableProfessionals = useMemo(() => {'''
booking_effect = '''    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    setScheduledTime("");

    if (!open || !professionalId || !scheduledDate) {
      setBookingSlots([]);
      setBookingSlotsLoading(false);
      return;
    }

    setBookingSlotsLoading(true);
    void db
      .rpc("get_professional_booking_slots", { _professional_id: professionalId, _date: scheduledDate })
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) {
          console.error("Falha ao carregar horários da profissional/data", error);
          setBookingSlots([]);
          toast.error("Não foi possível carregar os horários disponíveis desta data.");
        } else {
          setBookingSlots((data ?? []).filter((slot: any) => slot.is_available));
        }
        setBookingSlotsLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, professionalId, scheduledDate]);

  const availableProfessionals = useMemo(() => {'''
if catalog_effect_end in text and 'Falha ao carregar horários da profissional/data' not in text:
    text = text.replace(catalog_effect_end, booking_effect, 1)

old_select = '<div className="space-y-1.5"><Label>Horário *</Label><Select value={scheduledTime} onValueChange={setScheduledTime} disabled={saving || loadingCatalog}><SelectTrigger><SelectValue placeholder="Selecione o horário" /></SelectTrigger><SelectContent>{timeSlots.map((slot) => <SelectItem key={slot.id} value={slot.slot}>{slot.slot}</SelectItem>)}</SelectContent></Select></div>'
new_select = '<div className="space-y-1.5"><Label>Horário *</Label><Select value={scheduledTime} onValueChange={setScheduledTime} disabled={saving || loadingCatalog || bookingSlotsLoading || !professionalId || !scheduledDate}><SelectTrigger><SelectValue placeholder={bookingSlotsLoading ? "Carregando horários..." : bookingSlots.length ? "Selecione o horário" : "Sem horários disponíveis"} /></SelectTrigger><SelectContent>{bookingSlots.map((slot) => <SelectItem key={`${slot.slot}-${slot.source ?? "slot"}`} value={slot.slot}>{slot.slot}</SelectItem>)}</SelectContent></Select></div>'
if old_select in text:
    text = text.replace(old_select, new_select, 1)
else:
    raise SystemExit('Admin appointment time selector anchor not found')

path.write_text(text, encoding='utf-8')

# 2) Team agenda manual appointment: same source of truth by professional + date.
path = Path('src/routes/admin_.equipe.tsx')
text = path.read_text(encoding='utf-8')

text = text.replace('{selected ? <NewAppointmentModal open={appointmentOpen} onClose={() => setAppointmentOpen(false)} professional={selected} services={data.services.filter((service: any) => selectedServiceIds.includes(service.id))} slots={selectedSlots.filter((slot: any) => slot.is_available)} availability={selectedAvailability} onSaved={refresh} /> : null}', '{selected ? <NewAppointmentModal open={appointmentOpen} onClose={() => setAppointmentOpen(false)} professional={selected} services={data.services.filter((service: any) => selectedServiceIds.includes(service.id))} onSaved={refresh} /> : null}', 1)
text = text.replace('function NewAppointmentModal({ open, onClose, professional, services, slots, availability, onSaved }: any) {', 'function NewAppointmentModal({ open, onClose, professional, services, onSaved }: any) {', 1)

state_anchor = '  const [notes, setNotes] = useState("");\n  const [busy, setBusy] = useState(false);\n\n  const weekday = new Date(`${date}T12:00:00`).getDay();\n  const allowedSlots = useMemo(() => slots.filter((slot: any) => availability.some((item: any) => item.weekday === weekday && item.period === periodForTime(slot.slot) && item.is_available)), [slots, availability, weekday]);\n\n  useEffect(() => { if (time && !allowedSlots.some((slot: any) => slot.slot === time)) setTime(""); }, [allowedSlots, time]);\n'
state_new = '''  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowedSlots, setAllowedSlots] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTime("");

    if (!open || !professional?.id || !date) {
      setAllowedSlots([]);
      setSlotsLoading(false);
      return;
    }

    setSlotsLoading(true);
    void db
      .rpc("get_professional_booking_slots", { _professional_id: professional.id, _date: date })
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) {
          console.error("Falha ao carregar horários da agenda", error);
          setAllowedSlots([]);
          toast.error("Não foi possível carregar os horários disponíveis desta data.");
        } else {
          setAllowedSlots((data ?? []).filter((slot: any) => slot.is_available));
        }
        setSlotsLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, professional?.id, date]);

  useEffect(() => { if (time && !allowedSlots.some((slot: any) => slot.slot === time)) setTime(""); }, [allowedSlots, time]);
'''
if state_anchor in text:
    text = text.replace(state_anchor, state_new, 1)
else:
    raise SystemExit('Team appointment availability calculation anchor not found')

text = text.replace('footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button onClick={save} disabled={busy || !services.length || !allowedSlots.length}>{busy ? "Salvando..." : "Enviar para confirmação"}</Button></>}', 'footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button onClick={save} disabled={busy || slotsLoading || !services.length || !allowedSlots.length}>{busy ? "Salvando..." : "Enviar para confirmação"}</Button></>}', 1)
text = text.replace('<Field label="Horário"><Select value={time} onValueChange={setTime}><SelectTrigger><SelectValue placeholder={allowedSlots.length ? "Selecione" : "Sem horário neste turno"} /></SelectTrigger><SelectContent>{allowedSlots.map((slot: any) => <SelectItem key={slot.id} value={slot.slot}>{slot.slot}</SelectItem>)}</SelectContent></Select></Field>', '<Field label="Horário"><Select value={time} onValueChange={setTime} disabled={slotsLoading}><SelectTrigger><SelectValue placeholder={slotsLoading ? "Carregando..." : allowedSlots.length ? "Selecione" : "Sem horário disponível"} /></SelectTrigger><SelectContent>{allowedSlots.map((slot: any) => <SelectItem key={`${slot.slot}-${slot.source ?? "slot"}`} value={slot.slot}>{slot.slot}</SelectItem>)}</SelectContent></Select></Field>', 1)
text = text.replace('A profissional não possui um turno ativo com horários disponíveis nessa data.', 'A profissional não possui horários liberados para esta data.', 1)

text = text.replace('title={`Disponibilidade de ${professional.name}`} description="Defina os dias, turnos e horários específicos desta profissional."', 'title={`Padrão semanal de ${professional.name}`} description="Defina os dias, turnos e horários recorrentes desta profissional. Esse padrão vale normalmente e pode ser substituído por uma exceção em uma data específica."', 1)
text = text.replace('<h3 className="text-sm font-semibold">Dias e turnos</h3>\n      <p className="mt-1 text-xs text-muted-foreground">Ative somente os períodos em que a profissional realmente atende.</p>', '<h3 className="text-sm font-semibold">Dias e turnos do padrão semanal</h3>\n      <p className="mt-1 text-xs text-muted-foreground">Ative os períodos que normalmente se repetem toda semana. Datas personalizadas têm prioridade sobre este padrão.</p>', 1)
text = text.replace('<h3 className="text-sm font-semibold">Horários exatos</h3>\n      <p className="mt-1 text-xs text-muted-foreground">Os horários só aparecem para agendamento quando o dia e o turno correspondentes também estão ativos.</p>', '<h3 className="text-sm font-semibold">Horários recorrentes</h3>\n      <p className="mt-1 text-xs text-muted-foreground">Esses horários fazem parte do padrão semanal e só aparecem quando o dia e o turno correspondentes estão ativos.</p>', 1)

path.write_text(text, encoding='utf-8')

# 3) Date-specific availability: clarify that it is an override/exception.
path = Path('src/routes/admin_.disponibilidade.tsx')
text = path.read_text(encoding='utf-8')
text = text.replace('<h1 className="mt-2 text-3xl font-semibold">Disponibilidade por data</h1>', '<h1 className="mt-2 text-3xl font-semibold">Exceção de disponibilidade por data</h1>', 1)
text = text.replace('<p className="mt-2 max-w-2xl text-sm text-muted-foreground">Configure cada dia individualmente. Quando uma data tiver horários próprios, somente eles aparecem para o cliente.</p>', '<p className="mt-2 max-w-2xl text-sm text-muted-foreground">Use esta área somente quando um dia for diferente do padrão semanal. Quando uma data tiver horários próprios, eles substituem o padrão apenas naquele dia.</p>', 1)
text = text.replace('<p className="mt-1 text-xs text-muted-foreground">Adicione manualmente os horários que estarão disponíveis somente neste dia.</p>', '<p className="mt-1 text-xs text-muted-foreground">Adicione os horários que valerão somente neste dia. Enquanto esta exceção existir, o padrão semanal não será usado nesta data.</p>', 1)
path.write_text(text, encoding='utf-8')
