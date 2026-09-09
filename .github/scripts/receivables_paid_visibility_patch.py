from pathlib import Path

p = Path('src/components/finance-staging-workspace.tsx')
s = p.read_text()

old = '  const [receiveMethod, setReceiveMethod] = useState("pix");'
new = '  const [receiveMethod, setReceiveMethod] = useState("pix");\n  const [showPaidReceivables, setShowPaidReceivables] = useState(false);'
if old not in s:
    raise SystemExit('receive method state target not found')
s = s.replace(old, new, 1)

old = '''              <select
                className={`${selectClass} mb-3`}
                value={receiveMethod}
                onChange={(e) => setReceiveMethod(e.target.value)}
              >
                {methods.map((m: any) => (
                  <option key={m.id} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div className="space-y-2">
                {(data.receivables ?? []).map((row: any) => ('''
new = '''              <select
                className={`${selectClass} mb-3`}
                value={receiveMethod}
                onChange={(e) => setReceiveMethod(e.target.value)}
              >
                {methods.map((m: any) => (
                  <option key={m.id} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div className="mb-3 flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowPaidReceivables((current) => !current)}
                >
                  {showPaidReceivables ? "Ocultar baixadas" : "Mostrar baixadas"}
                </Button>
              </div>
              <div className="space-y-2">
                {(data.receivables ?? []).filter((row: any) => showPaidReceivables || row.status === "pending").map((row: any) => ('''
if old not in s:
    raise SystemExit('receivables list target not found')
s = s.replace(old, new, 1)

old = '''                        <Badge variant={statusVariant(row.display_status)}>
                          {statusLabel(row.display_status)}
                        </Badge>
                        {row.status === "pending" ? ('''
new = '''                        <Badge variant={statusVariant(row.display_status)}>
                          {statusLabel(row.display_status)}
                        </Badge>
                        {row.status === "paid" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === `reverse-receivable-${row.id}`}
                            onClick={() => {
                              if (!window.confirm(`Reverter a baixa de ${row.client_name_snapshot}? O valor sairá das entradas e esta conta voltará para Pendente.`)) return;
                              run(
                                `reverse-receivable-${row.id}`,
                                async () => {
                                  const result = await db.rpc("reverse_account_receivable_payment", {
                                    _receivable_id: row.id,
                                  });
                                  if (result.error) throw result.error;
                                },
                                "Baixa revertida. A conta voltou para Pendente.",
                              );
                            }}
                          >
                            Reverter baixa
                          </Button>
                        ) : null}
                        {row.status === "pending" ? ('''
if old not in s:
    raise SystemExit('receivable status/action target not found')
s = s.replace(old, new, 1)

p.write_text(s)
