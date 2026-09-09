from pathlib import Path

# --- Finance hierarchy: section -> date -> records ---
finance_path = Path('src/components/finance-staging-workspace.tsx')
finance = finance_path.read_text()

old = '''  CalendarClock,\n  CheckCircle2,'''
new = '''  CalendarClock,\n  ChevronDown,\n  CheckCircle2,'''
if old not in finance:
    raise SystemExit('finance import anchor not found')
finance = finance.replace(old, new, 1)

old = '''          <Panel\n            title={\n              statusFilter === "received"\n                ? `Entradas recebidas (${filteredEntries.length})`\n                : statusFilter === "pending"\n                  ? `Entradas pendentes / a receber (${filteredEntries.length})`\n                  : `Entradas (${filteredEntries.length})`\n            }\n            subtitle={\n              statusFilter === "received"\n                ? "Somente valores efetivamente recebidos entram como receita, líquido e resultado."\n                : statusFilter === "pending"\n                  ? "Valores pendentes ficam em contas a receber e só entram na receita quando forem pagos."\n                  : undefined\n            }\n          >'''
new = '''          <Panel\n            title={\n              statusFilter === "received"\n                ? `Entradas recebidas (${filteredEntries.length})`\n                : statusFilter === "pending"\n                  ? `Entradas pendentes / a receber (${filteredEntries.length})`\n                  : `Entradas (${filteredEntries.length})`\n            }\n            subtitle={\n              statusFilter === "received"\n                ? "Somente valores efetivamente recebidos entram como receita, líquido e resultado."\n                : statusFilter === "pending"\n                  ? "Valores pendentes ficam em contas a receber e só entram na receita quando forem pagos."\n                  : undefined\n            }\n            collapsible\n          >'''
if old not in finance:
    raise SystemExit('entries panel anchor not found')
finance = finance.replace(old, new, 1)

old = '''                <details key={date} className="group rounded-2xl border border-border bg-card" open>'''
new = '''                <details key={date} className="group rounded-2xl border border-border bg-card">'''
if old not in finance:
    raise SystemExit('entries date details anchor not found')
finance = finance.replace(old, new, 1)

old = '''                    <strong className="text-primary">{money(total)}</strong>'''
new = '''                    <div className="flex items-center gap-2">\n                      <strong className="text-primary">{money(total)}</strong>\n                      <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />\n                    </div>'''
if old not in finance:
    raise SystemExit('entries date total anchor not found')
finance = finance.replace(old, new, 1)

old = '''          <Panel title="Despesas do período">'''
new = '''          <Panel title="Despesas do período" collapsible>'''
if old not in finance:
    raise SystemExit('expenses panel anchor not found')
finance = finance.replace(old, new, 1)

old = '''              <details key={date} className="group rounded-2xl border border-border bg-card" open>'''
new = '''              <details key={date} className="group rounded-2xl border border-border bg-card">'''
if old not in finance:
    raise SystemExit('expense date details anchor not found')
finance = finance.replace(old, new, 1)

old = '''                  <strong className="text-destructive">{money(dayTotal)}</strong>'''
new = '''                  <div className="flex items-center gap-2">\n                    <strong className="text-destructive">{money(dayTotal)}</strong>\n                    <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />\n                  </div>'''
if old not in finance:
    raise SystemExit('expense date total anchor not found')
finance = finance.replace(old, new, 1)

old = '''function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: any }) {\n  return (\n    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">\n      <div>\n        <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>\n        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}\n      </div>\n      <div className="mt-5">{children}</div>\n    </section>\n  );\n}'''
new = '''function Panel({\n  title,\n  subtitle,\n  children,\n  collapsible = false,\n}: {\n  title: string;\n  subtitle?: string;\n  children: any;\n  collapsible?: boolean;\n}) {\n  if (collapsible) {\n    return (\n      <details className="group rounded-3xl border border-border bg-card shadow-soft">\n        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-3xl p-5 transition-colors hover:bg-secondary/30 sm:p-6">\n          <div className="min-w-0">\n            <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>\n            {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}\n          </div>\n          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground transition-colors group-open:bg-primary-soft group-open:text-primary">\n            <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" />\n          </span>\n        </summary>\n        <div className="border-t border-border p-5 sm:p-6">{children}</div>\n      </details>\n    );\n  }\n\n  return (\n    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">\n      <div>\n        <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>\n        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}\n      </div>\n      <div className="mt-5">{children}</div>\n    </section>\n  );\n}'''
if old not in finance:
    raise SystemExit('Panel component anchor not found')
finance = finance.replace(old, new, 1)

finance_path.write_text(finance)

# --- Admin appointments: expose edit/reschedule for confirmed and cancelled ---
appointments_path = Path('src/components/admin-appointments-workspace.tsx')
appointments = appointments_path.read_text()

old = '''{appointment.status !== "atendido" ? <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-lg text-primary hover:bg-primary/10" onClick={onEdit} title={appointment.status === "cancelado" ? "Reagendar" : "Editar agendamento"}><Pencil className="size-3.5" /></Button> : null}'''
new = '''{appointment.status !== "atendido" ? <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 rounded-lg px-2.5 text-primary hover:bg-primary/10" onClick={onEdit} title={appointment.status === "cancelado" ? "Reagendar" : "Editar agendamento"}><Pencil className="size-3.5" /> {appointment.status === "cancelado" ? "Reagendar" : "Editar"}</Button> : null}'''
if old not in appointments:
    raise SystemExit('appointment card edit button anchor not found')
appointments = appointments.replace(old, new, 1)

old = '''      <AppointmentAdminDialog appointment={selected} open={Boolean(selected)} onOpenChange={(open: boolean) => !open && setSelected(null)} onConfirm={() => selected && act(selected, "confirmado")} onCancel={() => selected && act(selected, "cancelado")} onAttended={() => selected && completeAttendance(selected)} onPriceSaved={(value: number) => { setSelected((current: any) => current ? { ...current, service_price_snapshot: value, balance_amount: value } : current); onRefresh(); }} busy={busyAction} />'''
new = '''      <AppointmentAdminDialog appointment={selected} open={Boolean(selected)} onOpenChange={(open: boolean) => !open && setSelected(null)} onConfirm={() => selected && act(selected, "confirmado")} onCancel={() => selected && act(selected, "cancelado")} onAttended={() => selected && completeAttendance(selected)} onEdit={() => { if (!selected || selected.status === "atendido") return; const current = selected; setSelected(null); setEditingAppointment(current); }} onPriceSaved={(value: number) => { setSelected((current: any) => current ? { ...current, service_price_snapshot: value, balance_amount: value } : current); onRefresh(); }} busy={busyAction} />'''
if old not in appointments:
    raise SystemExit('AppointmentAdminDialog invocation anchor not found')
appointments = appointments.replace(old, new, 1)

old = '''function AppointmentAdminDialog({ appointment, open, onOpenChange, onConfirm, onCancel, onAttended, onPriceSaved, busy }: any) {'''
new = '''function AppointmentAdminDialog({ appointment, open, onOpenChange, onConfirm, onCancel, onAttended, onEdit, onPriceSaved, busy }: any) {'''
if old not in appointments:
    raise SystemExit('AppointmentAdminDialog signature anchor not found')
appointments = appointments.replace(old, new, 1)

old = '''    <div className="mt-4 rounded-2xl border border-border p-4"><div className="grid gap-3 text-xs sm:grid-cols-2"><div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Criado em</p><p className="mt-1 font-medium">{formatDateTime(appointment.created_at)}</p></div><div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Status atualizado</p><p className="mt-1 font-medium">{formatDateTime(appointment.status_updated_at)}</p></div></div>{appointment.notes ? <div className="mt-3 border-t border-border pt-3"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Observações</p><p className="mt-1 text-sm">{appointment.notes}</p></div> : null}</div>\n    {canDecide ?'''
new = '''    <div className="mt-4 rounded-2xl border border-border p-4"><div className="grid gap-3 text-xs sm:grid-cols-2"><div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Criado em</p><p className="mt-1 font-medium">{formatDateTime(appointment.created_at)}</p></div><div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Status atualizado</p><p className="mt-1 font-medium">{formatDateTime(appointment.status_updated_at)}</p></div></div>{appointment.notes ? <div className="mt-3 border-t border-border pt-3"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Observações</p><p className="mt-1 text-sm">{appointment.notes}</p></div> : null}</div>\n    {appointment.status !== "atendido" ? <div className="mt-4"><Button type="button" variant="outline" className="w-full rounded-xl sm:w-auto" onClick={onEdit}><Pencil className="size-4" /> {appointment.status === "cancelado" ? "Reagendar" : "Editar agendamento"}</Button></div> : null}\n    {canDecide ?'''
if old not in appointments:
    raise SystemExit('appointment details edit insertion anchor not found')
appointments = appointments.replace(old, new, 1)

appointments_path.write_text(appointments)
