from pathlib import Path

files = [
    Path('src/routes/admin.tsx'),
    Path('src/components/admin-appointments-workspace.tsx'),
]
for path in files:
    text = path.read_text()
    text = text.replace('service:services(name, price, duration_min)', 'service:services!appointments_service_id_fkey(name, price, duration_min)')
    text = text.replace('service:services(name, price)', 'service:services!appointments_service_id_fkey(name, price)')
    path.write_text(text)
