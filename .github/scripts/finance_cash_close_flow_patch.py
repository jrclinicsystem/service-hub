from pathlib import Path

path = Path('src/components/finance-staging-workspace.tsx')
text = path.read_text()

def replace_once(old: str, new: str):
    global text
    if old not in text:
        raise SystemExit(f'pattern not found:\n{old[:300]}')
    text = text.replace(old, new, 1)

replace_once(
'''  const [openingCorrectionReason, setOpeningCorrectionReason] = useState("");
  const [professionalFilter, setProfessionalFilter] = useState("all");''',
'''  const [openingCorrectionReason, setOpeningCorrectionReason] = useState("");
  const [editingClosedCashId, setEditingClosedCashId] = useState("");
  const [correctedCountedCash, setCorrectedCountedCash] = useState("");
  const [closedCorrectionReason, setClosedCorrectionReason] = useState("");
  const [professionalFilter, setProfessionalFilter] = useState("all");''')

replace_once(
'''                  <Input
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                    placeholder="0,00"
                  />''',
'''                  <Input
                    value={countedCash === "" ? String(todayCash.expected_cash ?? 0) : countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                    placeholder="0,00"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Preenchido automaticamente com o valor esperado em espécie. Altere apenas se a contagem física for diferente.
                  </p>''')

replace_once(
'''                          const value = parseMoney(countedCash);
                          if (!Number.isFinite(value) || value < 0)''',
'''                          const value = parseMoney(
                            countedCash === "" ? String(todayCash.expected_cash ?? 0) : countedCash,
                          );
                          if (!Number.isFinite(value) || value < 0)''')

old_history = '''              {(data.cash ?? []).map((row: any) => (
                <div
                  key={row.id}
                  className="grid gap-2 rounded-2xl border border-border p-4 sm:grid-cols-5 sm:items-center"
                >
                  <strong>{formatDate(row.business_date)}</strong>
                  <span>Inicial {money(row.opening_cash)}</span>
                  <span>Esperado {money(row.expected_cash)}</span>
                  <span>Diferença {money(row.difference_amount)}</span>
                  <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                </div>
              ))}'''
new_history = '''              {(data.cash ?? []).map((row: any) => (
                <div key={row.id} className="rounded-2xl border border-border p-4">
                  <div className="grid gap-2 sm:grid-cols-6 sm:items-center">
                    <strong>{formatDate(row.business_date)}</strong>
                    <span>Inicial {money(row.opening_cash)}</span>
                    <span>Esperado {money(row.expected_cash)}</span>
                    <span>Contado {money(row.counted_cash)}</span>
                    <span>Diferença {money(row.difference_amount)}</span>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                      {row.status === "closed" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingClosedCashId(String(row.id));
                            setCorrectedCountedCash(String(row.counted_cash ?? row.expected_cash ?? 0));
                            setClosedCorrectionReason("");
                          }}
                        >
                          Corrigir fechamento
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {editingClosedCashId === String(row.id) ? (
                    <div className="mt-3 grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-[1fr_1.6fr_auto]">
                      <div>
                        <Label className="text-xs">Dinheiro contado correto</Label>
                        <Input
                          value={correctedCountedCash}
                          onChange={(e) => setCorrectedCountedCash(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Motivo da correção</Label>
                        <Input
                          value={closedCorrectionReason}
                          onChange={(e) => setClosedCorrectionReason(e.target.value)}
                          placeholder="Ex.: caixa fechado sem informar a contagem"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy === `correct-closed-${row.id}`}
                          onClick={() =>
                            run(
                              `correct-closed-${row.id}`,
                              async () => {
                                const value = parseMoney(correctedCountedCash);
                                if (!Number.isFinite(value) || value < 0)
                                  throw new Error("Valor contado inválido.");
                                if (!closedCorrectionReason.trim())
                                  throw new Error("Informe o motivo da correção.");
                                const result = await db.rpc("correct_closed_cash_session", {
                                  _session_id: row.id,
                                  _counted_cash: value,
                                  _reason: closedCorrectionReason.trim(),
                                });
                                if (result.error) throw result.error;
                                setEditingClosedCashId("");
                                setCorrectedCountedCash("");
                                setClosedCorrectionReason("");
                              },
                              "Fechamento do caixa corrigido.",
                            )
                          }
                        >
                          Salvar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingClosedCashId("");
                            setCorrectedCountedCash("");
                            setClosedCorrectionReason("");
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}'''
replace_once(old_history, new_history)

replace_once(
'''  const [openingCorrectionReason, setOpeningCorrectionReason] = useState("");
  const [method, setMethod] = useState("pix");''',
'''  const [openingCorrectionReason, setOpeningCorrectionReason] = useState("");
  const [editingClosedCash, setEditingClosedCash] = useState(false);
  const [correctedClosedCount, setCorrectedClosedCount] = useState("");
  const [closedCorrectionReason, setClosedCorrectionReason] = useState("");
  const [method, setMethod] = useState("pix");''')

replace_once(
'''              <Input
                placeholder="Dinheiro contado"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />''',
'''              <div>
                <Input
                  placeholder="Dinheiro contado"
                  value={counted === "" ? String(todayCash.expected_cash ?? 0) : counted}
                  onChange={(e) => setCounted(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Valor preenchido automaticamente. Altere somente se a contagem física for diferente.
                </p>
              </div>''')

replace_once(
'''                        _counted_cash: parseMoney(counted),''',
'''                        _counted_cash: parseMoney(
                          counted === "" ? String(todayCash.expected_cash ?? 0) : counted,
                        ),''')

old_reception_closed = '''          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                icon={ReceiptText}
                label="Esperado"
                value={money(todayCash.expected_cash)}
              />
              <MetricCard icon={Banknote} label="Contado" value={money(todayCash.counted_cash)} />
              <MetricCard
                icon={AlertTriangle}
                label="Diferença"
                value={money(todayCash.difference_amount)}
              />
            </div>
          )}'''
new_reception_closed = '''          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard
                  icon={ReceiptText}
                  label="Esperado"
                  value={money(todayCash.expected_cash)}
                />
                <MetricCard icon={Banknote} label="Contado" value={money(todayCash.counted_cash)} />
                <MetricCard
                  icon={AlertTriangle}
                  label="Diferença"
                  value={money(todayCash.difference_amount)}
                />
              </div>
              {!editingClosedCash ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCorrectedClosedCount(String(todayCash.counted_cash ?? todayCash.expected_cash ?? 0));
                    setClosedCorrectionReason("");
                    setEditingClosedCash(true);
                  }}
                >
                  Corrigir fechamento
                </Button>
              ) : (
                <div className="grid gap-2 rounded-2xl border border-border p-3 sm:grid-cols-[1fr_1.6fr_auto]">
                  <Input
                    value={correctedClosedCount}
                    onChange={(e) => setCorrectedClosedCount(e.target.value)}
                    placeholder="Dinheiro contado correto"
                  />
                  <Input
                    value={closedCorrectionReason}
                    onChange={(e) => setClosedCorrectionReason(e.target.value)}
                    placeholder="Motivo da correção"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy === "correct-closed"}
                      onClick={() =>
                        run(
                          "correct-closed",
                          async () => {
                            const value = parseMoney(correctedClosedCount);
                            if (!Number.isFinite(value) || value < 0)
                              throw new Error("Valor contado inválido.");
                            if (!closedCorrectionReason.trim())
                              throw new Error("Informe o motivo da correção.");
                            const result = await db.rpc("correct_closed_cash_session", {
                              _session_id: todayCash.id,
                              _counted_cash: value,
                              _reason: closedCorrectionReason.trim(),
                            });
                            if (result.error) throw result.error;
                            setEditingClosedCash(false);
                            setCorrectedClosedCount("");
                            setClosedCorrectionReason("");
                          },
                          "Fechamento do caixa corrigido.",
                        )
                      }
                    >
                      Salvar
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditingClosedCash(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}'''
replace_once(old_reception_closed, new_reception_closed)

path.write_text(text)
print('finance cash closing flow patched')
