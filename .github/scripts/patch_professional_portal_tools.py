from pathlib import Path

path = Path('src/routes/profissional.tsx')
text = path.read_text(encoding='utf-8')

# New professional portal tools.
import_anchor = 'import { AppointmentCalendar } from "@/components/appointment-calendar";\n'
imports = (
    'import { AppointmentCalendar } from "@/components/appointment-calendar";\n'
    'import { ProfessionalClientBookingTools } from "@/components/professional-client-booking-tools";\n'
    'import { ProfessionalWeeklySchedule } from "@/components/professional-weekly-schedule";\n'
)
if 'ProfessionalClientBookingTools' not in text:
    if import_anchor not in text:
        raise SystemExit('AppointmentCalendar import anchor not found')
    text = text.replace(import_anchor, imports, 1)

# Replace the old general schedule UI with the true weekday schedule + date exception + client/booking tools.
old_date = '        <ProfessionalDateAvailability professionalId={data.professional.id} fallbackSlots={data.slots} fallbackAvailability={data.availability} />\n'
new_tools = '''        <ProfessionalWeeklySchedule professionalId={data.professional.id} />

        <ProfessionalDateAvailability professionalId={data.professional.id} fallbackSlots={data.slots} fallbackAvailability={data.availability} />

        <ProfessionalClientBookingTools professionalId={data.professional.id} onAppointmentCreated={() => refetch()} />
'''
if old_date in text:
    text = text.replace(old_date, new_tools, 1)
elif '<ProfessionalWeeklySchedule professionalId={data.professional.id}' not in text:
    raise SystemExit('ProfessionalDateAvailability render anchor not found')

# Remove the two legacy sections shown to staff: "Padrão geral de dias e turnos" and "Horários do padrão geral".
marker = '<ProfessionalClientBookingTools professionalId={data.professional.id} onAppointmentCreated={() => refetch()} />'
marker_pos = text.find(marker)
if marker_pos == -1:
    raise SystemExit('New tools marker not found')
legacy_start = text.find('        <section className="mt-4 rounded-3xl border border-primary/15 bg-primary-soft/20 p-4 shadow-soft sm:mt-7 sm:p-6">', marker_pos)
appointments_start = text.find('        <section className="mt-7">', marker_pos)
if legacy_start != -1 and appointments_start != -1 and legacy_start < appointments_start:
    legacy_block = text[legacy_start:appointments_start]
    if 'Padrão geral de dias e turnos' not in legacy_block or 'Horários do padrão geral' not in legacy_block:
        raise SystemExit('Legacy schedule block did not match expected headings')
    text = text[:legacy_start] + text[appointments_start:]

path.write_text(text, encoding='utf-8')
