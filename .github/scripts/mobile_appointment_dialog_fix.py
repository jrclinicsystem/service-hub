from pathlib import Path

p = Path('src/components/admin-appointments-workspace.tsx')
s = p.read_text()

# Keep the realtime notification helper on the correct service-label function.
s = s.replace('appointmentServicesLabel(appointment)', 'appointmentServiceLabel(appointment)')

old = 'return <Dialog open={open} onOpenChange={handleOpenChange}><DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-2xl sm:p-6"><DialogHeader><DialogTitle>Novo agendamento</DialogTitle><DialogDescription>O agendamento será criado como aguardando confirmação da profissional e com pagamento presencial.</DialogDescription></DialogHeader><div className="mt-2 grid gap-4 sm:grid-cols-2">'
new = 'return <Dialog open={open} onOpenChange={handleOpenChange}><DialogContent className="!left-2 !right-2 !top-2 !bottom-[5.4rem] !w-auto !max-w-none !translate-x-0 !translate-y-0 min-w-0 max-h-none overflow-x-hidden overflow-y-auto rounded-2xl p-4 sm:!left-1/2 sm:!right-auto sm:!top-1/2 sm:!bottom-auto sm:!w-[calc(100%-2rem)] sm:!max-w-2xl sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:max-h-[92dvh] sm:rounded-3xl sm:p-6"><DialogHeader className="min-w-0 pr-6 text-left"><DialogTitle className="text-base sm:text-lg">Novo agendamento</DialogTitle><DialogDescription className="text-xs leading-relaxed sm:text-sm">O agendamento será criado como aguardando confirmação da profissional e com pagamento presencial.</DialogDescription></DialogHeader><div className="mt-1 grid min-w-0 gap-3 sm:mt-2 sm:grid-cols-2 sm:gap-4">'
if old not in s:
    raise SystemExit('create appointment dialog opening block not found')
s = s.replace(old, new, 1)

# Keep fields and service selector from ever forcing horizontal overflow on narrow screens.
s = s.replace('<div className="space-y-1.5 sm:col-span-2">\n      <div className="flex items-center justify-between gap-3">\n        <Label>Selecionar cliente cadastrado</Label>', '<div className="min-w-0 space-y-1.5 sm:col-span-2">\n      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">\n        <Label>Selecionar cliente cadastrado</Label>', 1)
s = s.replace('<div className="space-y-2 sm:col-span-2">\n      <div className="flex items-center justify-between gap-3"><Label>Serviços *</Label>', '<div className="min-w-0 space-y-2 sm:col-span-2">\n      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><Label>Serviços *</Label>', 1)
s = s.replace('className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2"', 'className="grid max-h-56 min-w-0 grid-cols-1 gap-2 overflow-y-auto sm:max-h-52 sm:grid-cols-2"', 1)
s = s.replace('<DialogFooter className="mt-4 gap-2 sm:gap-0">', '<DialogFooter className="sticky bottom-0 -mx-4 mt-4 gap-2 border-t border-border bg-background/95 px-4 pb-1 pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none sm:gap-0">', 1)

p.write_text(s)

# Ensure all dialogs sit above the fixed mobile navigation and never get covered by it.
p2 = Path('src/components/ui/dialog.tsx')
d = p2.read_text()
d = d.replace('fixed inset-0 z-50 bg-black/40', 'fixed inset-0 z-[80] bg-black/40')
d = d.replace('fixed left-[50%] top-[50%] z-50 grid', 'fixed left-[50%] top-[50%] z-[81] grid')
p2.write_text(d)
