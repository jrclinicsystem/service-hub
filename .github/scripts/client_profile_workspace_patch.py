from pathlib import Path

path = Path('src/routes/admin_.clientes.tsx')
text = path.read_text()

anchor = 'import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";\n'
if 'client-profile-dialog' not in text:
    text = text.replace(anchor, anchor + 'import { ClientProfileDialog } from "@/components/client-profile-dialog";\n', 1)

state_anchor = '  const [search, setSearch] = useState("");\n'
if 'selectedClientId' not in text:
    text = text.replace(state_anchor, state_anchor + '  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);\n', 1)

start = text.find('          <div className="mt-5 space-y-2">')
if start == -1:
    raise SystemExit('client list start not found')
end_marker = '          </div>\n        </section>\n      </main>'
end = text.find(end_marker, start)
if end == -1:
    raise SystemExit('client list end not found')

replacement = '''          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
            ) : filtered.map((client: any) => {
              const parts = birthParts(client.birth_date);
              const isBirthday = client.is_active && parts.month === today.month && parts.day === today.day;
              return (
                <button
                  type="button"
                  key={client.id}
                  onClick={() => setSelectedClientId(client.id)}
                  className={`group rounded-2xl border p-3.5 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md ${isBirthday ? "border-emerald-300 bg-emerald-50/40" : "border-border bg-background"}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><UserRound className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{client.name}</p>
                        {!client.is_active ? <Badge variant="secondary" className="shrink-0 text-[10px]">Inativo</Badge> : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{client.whatsapp}</p>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><CalendarDays className="size-3" /> {formatBirthDate(client.birth_date)}</span>
                        {isBirthday ? <Badge className="bg-emerald-600 px-1.5 py-0 text-[9px] text-white">Aniversário hoje</Badge> : <span className="font-medium text-primary opacity-0 transition group-hover:opacity-100">Abrir ficha →</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <ClientProfileDialog
          clientId={selectedClientId}
          open={Boolean(selectedClientId)}
          onOpenChange={(nextOpen) => { if (!nextOpen) setSelectedClientId(null); }}
          onUpdated={async () => { await refetch(); }}
        />
      </main>'''

text = text[:start] + replacement + text[end + len(end_marker):]
path.write_text(text)
