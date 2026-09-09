from pathlib import Path

p = Path('src/components/admin-appointments-workspace.tsx')
s = p.read_text()

old = '''      const detail = await fetchAppointment(next.id);\n      if (!detail) return;\n      playNotificationSound(audioRef);\n      setIncoming(detail);'''
new = '''      const detail = await fetchAppointment(next.id);\n      if (!detail) return;\n      // Avoid stacking two dialogs/overlays when a manual appointment triggers realtime.\n      setCreateOpen(false);\n      playNotificationSound(audioRef);\n      setIncoming(detail);'''
if old in s:
    s = s.replace(old, new, 1)

old_search = '''        <div className="relative mb-2">\n          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />\n          <Input value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Buscar serviço..." className="h-9 rounded-xl pl-9 text-sm" disabled={saving || loadingCatalog} />\n        </div>'''
new_search = '''        <div className="sticky top-0 z-10 mb-2 bg-background pb-1">\n          <div className="relative">\n            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary/70" />\n            <Input value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Pesquisar procedimento..." className="h-10 rounded-xl border-primary/25 bg-card pl-9 pr-3 text-sm shadow-sm focus-visible:ring-primary/25" disabled={saving || loadingCatalog} />\n          </div>\n        </div>'''
if old_search in s:
    s = s.replace(old_search, new_search, 1)

marker = 'function NewAppointmentAlert('
idx = s.find(marker)
if idx == -1:
    raise SystemExit('NewAppointmentAlert not found')

new_alert = '''function NewAppointmentAlert({ appointment, open, onLater, onConfirm, onCancel, busy }: any) {
  if (!appointment) return null;
  const hasWhatsApp = normalizeWhatsAppPhone(appointment.patient_phone).length > 0;
  const servicesLabel = appointmentServicesLabel(appointment);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onLater()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[460px] min-w-0 overflow-hidden rounded-3xl p-5 sm:p-6">
        <DialogHeader className="min-w-0 pr-7">
          <span className="mb-2 grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary"><BellRing className="size-5" /></span>
          <DialogTitle>Novo agendamento realizado</DialogTitle>
          <DialogDescription>A profissional ainda precisa confirmar este atendimento.</DialogDescription>
        </DialogHeader>
        <div className="mt-1 min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-secondary/40 p-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{appointment.patient_name}</p>
              <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">{servicesLabel}</p>
            </div>
            <AdminStatusBadge status={appointment.status} />
          </div>
          <div className="mt-3 grid min-w-0 grid-cols-2 gap-3">
            <SmallInfo label="Data" value={formatDate(appointment.scheduled_date)} />
            <SmallInfo label="Horário" value={appointment.scheduled_time} />
            <SmallInfo label="Profissional" value={appointment.professional?.name ?? "—"} />
            <SmallInfo label="Pagamento" value={paymentLabel(appointment)} accent />
          </div>
        </div>
        {hasWhatsApp ? <Button variant="outline" className="mt-1 w-full max-w-full rounded-xl border-emerald-600/40 text-emerald-700" onClick={() => openAppointmentWhatsApp(appointment, "confirmation")}><MessageCircle className="size-4" /> Confirmar pelo WhatsApp</Button> : null}
        <DialogFooter className="mt-1 grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 sm:space-x-0">
          <Button className="w-full" variant="outline" disabled={busy} onClick={onLater}>Depois</Button>
          <Button className="w-full" variant="destructive" disabled={busy} onClick={onCancel}>Cancelar</Button>
          <Button className="w-full" disabled={busy} onClick={onConfirm}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
'''
# NewAppointmentAlert is intentionally the final helper in this component file.
s = s[:idx] + new_alert
p.write_text(s)

p2 = Path('src/components/ui/dialog.tsx')
d = p2.read_text()
d = d.replace('"fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in', '"fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=open]:animate-in')
p2.write_text(d)
