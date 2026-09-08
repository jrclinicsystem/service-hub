from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected marker not found in {path}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")

professional = "src/components/professional-client-booking-tools.tsx"
replace_once(
    professional,
    '  const [slots, setSlots] = useState<any[]>([]);\n  const [slotsLoading, setSlotsLoading] = useState(false);\n  const [savingAppointment, setSavingAppointment] = useState(false);',
    '  const [slots, setSlots] = useState<any[]>([]);\n  const [slotsLoading, setSlotsLoading] = useState(false);\n  const [slotsRefreshKey, setSlotsRefreshKey] = useState(0);\n  const [savingAppointment, setSavingAppointment] = useState(false);',
)
replace_once(
    professional,
    '  }, [professionalId, date]);\n\n  const createClient = async () => {',
    '''  }, [professionalId, date, slotsRefreshKey]);\n\n  useEffect(() => {\n    if (!professionalId) return;\n    const refreshSlots = () => setSlotsRefreshKey((current) => current + 1);\n    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refreshSlots(); };\n    window.addEventListener("focus", refreshSlots);\n    document.addEventListener("visibilitychange", refreshWhenVisible);\n    const channel = supabase.channel(`jrclinic-professional-booking-slots-${professionalId}`).on(\n      "postgres_changes",\n      { event: "*", schema: "public", table: "appointments", filter: `professional_id=eq.${professionalId}` },\n      refreshSlots,\n    ).subscribe();\n    return () => {\n      window.removeEventListener("focus", refreshSlots);\n      document.removeEventListener("visibilitychange", refreshWhenVisible);\n      void supabase.removeChannel(channel);\n    };\n  }, [professionalId]);\n\n  const createClient = async () => {''',
)
replace_once(
    professional,
    '      toast.success("Agendamento criado e enviado para confirmação.");\n      await onAppointmentCreated?.();',
    '      setSlotsRefreshKey((current) => current + 1);\n      toast.success("Agendamento criado e enviado para confirmação.");\n      await onAppointmentCreated?.();',
)

public_booking = "src/routes/agendar.tsx"
replace_once(
    public_booking,
    '  const [availableSlots, setAvailableSlots] = useState<any[]>([]);\n  const [slotsLoading, setSlotsLoading] = useState(false);',
    '  const [availableSlots, setAvailableSlots] = useState<any[]>([]);\n  const [slotsLoading, setSlotsLoading] = useState(false);\n  const [slotsRefreshKey, setSlotsRefreshKey] = useState(0);',
)
replace_once(
    public_booking,
    '  }, [professionalId, day]);\n\n  useEffect(() => {\n    if (time && !displayedTimeSlots.some((slot: any) => slot.slot === time)) setTime(null);',
    '''  }, [professionalId, day, slotsRefreshKey]);\n\n  useEffect(() => {\n    if (!professionalId) return;\n    const refreshSlots = () => setSlotsRefreshKey((current) => current + 1);\n    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refreshSlots(); };\n    window.addEventListener("focus", refreshSlots);\n    document.addEventListener("visibilitychange", refreshWhenVisible);\n    const channel = supabase.channel(`jrclinic-public-booking-slots-${professionalId}`).on(\n      "postgres_changes",\n      { event: "*", schema: "public", table: "appointments", filter: `professional_id=eq.${professionalId}` },\n      refreshSlots,\n    ).subscribe();\n    return () => {\n      window.removeEventListener("focus", refreshSlots);\n      document.removeEventListener("visibilitychange", refreshWhenVisible);\n      void supabase.removeChannel(channel);\n    };\n  }, [professionalId]);\n\n  useEffect(() => {\n    if (time && !displayedTimeSlots.some((slot: any) => slot.slot === time)) setTime(null);''',
)

admin_booking = "src/components/admin-appointments-workspace.tsx"
replace_once(
    admin_booking,
    '  const [bookingSlots, setBookingSlots] = useState<any[]>([]);\n  const [bookingSlotsLoading, setBookingSlotsLoading] = useState(false);',
    '  const [bookingSlots, setBookingSlots] = useState<any[]>([]);\n  const [bookingSlotsLoading, setBookingSlotsLoading] = useState(false);\n  const [bookingSlotsRefreshKey, setBookingSlotsRefreshKey] = useState(0);',
)
replace_once(
    admin_booking,
    '  }, [open, professionalId, scheduledDate]);\n\n  const availableProfessionals = useMemo(() => {',
    '''  }, [open, professionalId, scheduledDate, bookingSlotsRefreshKey]);\n\n  useEffect(() => {\n    if (!open || !professionalId) return;\n    const refreshSlots = () => setBookingSlotsRefreshKey((current) => current + 1);\n    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refreshSlots(); };\n    window.addEventListener("focus", refreshSlots);\n    document.addEventListener("visibilitychange", refreshWhenVisible);\n    const channel = supabase.channel(`jrclinic-admin-booking-slots-${professionalId}`).on(\n      "postgres_changes",\n      { event: "*", schema: "public", table: "appointments", filter: `professional_id=eq.${professionalId}` },\n      refreshSlots,\n    ).subscribe();\n    return () => {\n      window.removeEventListener("focus", refreshSlots);\n      document.removeEventListener("visibilitychange", refreshWhenVisible);\n      void supabase.removeChannel(channel);\n    };\n  }, [open, professionalId]);\n\n  const availableProfessionals = useMemo(() => {''',
)
replace_once(
    admin_booking,
    '    toast.success("Agendamento enviado para confirmação da profissional.", { description: `${patientName.trim()} · ${service.name} · ${formatDate(scheduledDate)} às ${scheduledTime}` });\n    reset(); onCreated();',
    '    setBookingSlotsRefreshKey((current) => current + 1);\n    toast.success("Agendamento enviado para confirmação da profissional.", { description: `${patientName.trim()} · ${service.name} · ${formatDate(scheduledDate)} às ${scheduledTime}` });\n    reset(); onCreated();',
)
