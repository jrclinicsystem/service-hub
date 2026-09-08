from pathlib import Path

path = Path('src/components/finance-staging-workspace.tsx')
text = path.read_text()

old = '  const [statusFilter, setStatusFilter] = useState("all");'
new = '  const [statusFilter, setStatusFilter] = useState("received");'
if old not in text:
    raise SystemExit('status filter anchor not found')
text = text.replace(old, new, 1)

old = '<option value="all">Todos os status</option>'
new = '<option value="all">Todos os status (inclui pendentes)</option>'
if old not in text:
    raise SystemExit('status option anchor not found')
text = text.replace(old, new, 1)

old = '<Panel title={`Entradas (${filteredEntries.length})`}>\n            <EntryList rows={filteredEntries} />\n          </Panel>'
new = '''<Panel\n            title={\n              statusFilter === "received"\n                ? `Entradas recebidas (${filteredEntries.length})`\n                : statusFilter === "pending"\n                  ? `Entradas pendentes / a receber (${filteredEntries.length})`\n                  : `Entradas (${filteredEntries.length})`\n            }\n            subtitle={\n              statusFilter === "received"\n                ? "Somente valores efetivamente recebidos entram como receita, líquido e resultado."\n                : statusFilter === "pending"\n                  ? "Valores pendentes ficam em contas a receber e só entram na receita quando forem pagos."\n                  : undefined\n            }\n          >\n            <EntryList rows={filteredEntries} />\n          </Panel>'''
if old not in text:
    raise SystemExit('entries panel anchor not found')
text = text.replace(old, new, 1)

path.write_text(text)
