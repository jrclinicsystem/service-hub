from pathlib import Path

path = Path("src/components/admin-appointments-workspace.tsx")
text = path.read_text()

replacements = [
    (
        'function AppointmentAdminDialog({ appointment, open, onOpenChange, onConfirm, onCancel, onAttended, onEdit, onPriceSaved, busy }: any) {',
        'function AppointmentAdminDialog({ appointment, open, onOpenChange, onConfirm, onCancel, onAttended, onEdit, onPriceSaved, onRefresh, busy }: any) {',
        'dialog onRefresh prop',
    ),
    (
        '  const scheduledMoment = new Date(`${appointment.scheduled_date}T${appointment.scheduled_time}:00`);\n  const canMarkAttended = appointment.status === "confirmado" && Number.isFinite(scheduledMoment.getTime()) && scheduledMoment.getTime() <= Date.now();\n  const days = daysUntilAppointment(appointment.scheduled_date);',
        '  const scheduledMoment = new Date(`${appointment.scheduled_date}T${appointment.scheduled_time}:00`);\n  const combo = appointmentComboProgress(appointment);\n  const canMarkAttended = !combo.isCombo && appointment.status === "confirmado" && Number.isFinite(scheduledMoment.getTime()) && scheduledMoment.getTime() <= Date.now();\n  const days = daysUntilAppointment(appointment.scheduled_date);',
        'dialog combo gate',
    ),
    (
        '{appointment.status !== "atendido" && !combo.started ? <div className="mt-4"><Button type="button" variant="outline" className="w-full rounded-xl sm:w-auto" onClick={onEdit}>',
        '{appointment.status !== "atendido" && !combo.isCombo ? <div className="mt-4"><Button type="button" variant="outline" className="w-full rounded-xl sm:w-auto" onClick={onEdit}>',
        'dialog combo edit protection',
    ),
    (
        '{appointment.status !== "atendido" ? <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 rounded-lg px-2.5 text-primary hover:bg-primary/10" onClick={onEdit}',
        '{appointment.status !== "atendido" && !combo.started ? <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 rounded-lg px-2.5 text-primary hover:bg-primary/10" onClick={onEdit}',
        'card started combo edit protection',
    ),
]

for old, new, label in replacements:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    text = text.replace(old, new, 1)

path.write_text(text)
