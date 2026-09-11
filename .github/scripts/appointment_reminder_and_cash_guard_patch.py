from pathlib import Path


def replace_once(path: Path, old: str, new: str):
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"pattern not found in {path}:\n{old[:500]}")
    path.write_text(text.replace(old, new, 1))

contact = Path("src/lib/appointment-contact.ts")
replace_once(
    contact,
    '''  const lines = kind === "reminder"\n    ? [\n        `Olá, ${appointment.patient_name ?? "cliente"}! Tudo bem?`,\n        "Passando para lembrar que seu atendimento na JR Clinic é amanhã.",\n      ]\n    : [''',
    '''  const days = daysUntilAppointment(appointment.scheduled_date);\n  const reminderIntro =\n    days === 0\n      ? "Passando para lembrar que seu atendimento na JR Clinic é hoje."\n      : days === 1\n        ? "Passando para lembrar que seu atendimento na JR Clinic é amanhã."\n        : days !== null && days > 1\n          ? `Passando para lembrar do seu atendimento na JR Clinic, agendado para daqui a ${days} dias.`\n          : "Passando para lembrar do seu atendimento agendado na JR Clinic.";\n\n  const lines = kind === "reminder"\n    ? [\n        `Olá, ${appointment.patient_name ?? "cliente"}! Tudo bem?`,\n        reminderIntro,\n      ]\n    : [''',
)

workspace = Path("src/components/admin-appointments-workspace.tsx")
replace_once(
    workspace,
    'onClick={() => openAppointmentWhatsApp(appointment, "chat")}><MessageCircle className="size-4" /> Falar com cliente</Button>',
    'onClick={() => openAppointmentWhatsApp(appointment, "reminder")}><MessageCircle className="size-4" /> Enviar lembrete no WhatsApp</Button>',
)

replace_once(
    workspace,
    '''    <div className="mt-4 rounded-2xl border border-border p-4"><div className="grid gap-3 text-xs sm:grid-cols-2">''',
    '''    {hasWhatsApp && appointment.status === "confirmado" && proximity !== "urgent" ? <div className="mt-4"><Button className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openAppointmentWhatsApp(appointment, "reminder")}><MessageCircle className="size-4" /> Enviar lembrete no WhatsApp</Button></div> : null}\n    <div className="mt-4 rounded-2xl border border-border p-4"><div className="grid gap-3 text-xs sm:grid-cols-2">''',
)

print("appointment reminders patched")
