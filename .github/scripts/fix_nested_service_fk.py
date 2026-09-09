from pathlib import Path

files = [
    Path('src/routes/admin.tsx'),
    Path('src/components/admin-appointments-workspace.tsx'),
]
old = 'appointment_services(position, service:services!appointments_service_id_fkey(name, price, duration_min))'
new = 'appointment_services(position, service:services!appointment_services_service_id_fkey(name, price, duration_min))'
for path in files:
    text = path.read_text()
    if old not in text:
        raise SystemExit(f'pattern not found in {path}')
    path.write_text(text.replace(old, new))
