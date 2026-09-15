from pathlib import Path

path = Path("src/components/finance-staging-workspace.tsx")
text = path.read_text()

def replace_once(old: str, new: str):
    global text
    if old not in text:
        raise SystemExit(f"pattern not found:\n{old[:500]}")
    text = text.replace(old, new, 1)

# Full finance workspace: state for closing any open cash session from history.
replace_once(
'''  const [editingClosedCashId, setEditingClosedCashId] = useState("");
  const [correctedCountedCash, setCorrectedCountedCash] = useState("");
  const [closedCorrectionReason, setClosedCorrectionReason] = useState("");
  const [professionalFilter, setProfessionalFilter] = useState("all");''',
'''  const [editingClosedCashId, setEditingClosedCashId] = useState("");
  const [correctedCountedCash, setCorrectedCountedCash] = useState("");
  const [closedCorrectionReason, setClosedCorrectionReason] = useState("");
  const [closingHistoryCashId, setClosingHistoryCashId] = useState("");
  const [historyCountedCash, setHistoryCountedCash] = useState("");
  const [historyClosingNote, setHistoryClosingNote] = useState("");
  const [professionalFilter, setProfessionalFilter] = useState("all");''')

replace_once(
'''          <Panel title="Histórico de caixas">''',
'''          <Panel
            title="Histórico de caixas"
            subtitle="Se um caixa ficar aberto por esquecimento, ele pode ser fechado depois diretamente por aqui, sem alterar o caixa do dia atual."
          >''')

replace_once(
'''              {(data.cash ?? []).map((row: any) => (
                <div key={row.id} className="rounded-2xl border border-border p-4">
                  <div className="grid gap-2 sm:grid-cols-6 sm:items-center">''',
'''              {(data.cash ?? []).map((row: any) => (
                <div
                  key={row.id}
                  className={`rounded-2xl border p-4 ${
                    row.status === "open" && row.business_date < fortalezaIso()
                      ? "border-amber-300 bg-amber-50/35"
                      : "border-border"
                  }`}
                >
                  <div className="grid gap-2 sm:grid-cols-6 sm:items-center">''')

replace_once(
'''                    <div className="flex items-center justify-between gap-2 sm:justify-end">
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
                  {editingClosedCashId === String(row.id) ? (''',
'''                    <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                      {row.status === "open" && row.business_date < fortalezaIso() ? (
                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-100 font-semibold text-amber-900"
                        >
                          Fechamento pendente
                        </Badge>
                      ) : null}
                      <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                      {row.status === "open" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={row.business_date < fortalezaIso() ? "default" : "outline"}
                          disabled={busy === `close-history-${row.id}`}
                          onClick={() => {
                            setClosingHistoryCashId(String(row.id));
                            setHistoryCountedCash(String(row.expected_cash ?? 0));
                            setHistoryClosingNote(
                              row.business_date < fortalezaIso()
                                ? `Fechamento realizado posteriormente para o caixa de ${formatDate(row.business_date)}.`
                                : "",
                            );
                          }}
                        >
                          Fechar caixa
                        </Button>
                      ) : null}
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
                  {closingHistoryCashId === String(row.id) ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                      {row.business_date < fortalezaIso() ? (
                        <div className="mb-3 flex items-start gap-2 text-xs text-amber-900">
                          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                          <p>
                            Fechamento retroativo do caixa de <strong>{formatDate(row.business_date)}</strong>. O caixa atual permanece independente e não será alterado.
                          </p>
                        </div>
                      ) : null}
                      <div className="grid gap-2 sm:grid-cols-[1fr_1.7fr_auto] sm:items-end">
                        <div>
                          <Label className="text-xs">Dinheiro contado</Label>
                          <Input
                            value={historyCountedCash}
                            onChange={(e) => setHistoryCountedCash(e.target.value)}
                            placeholder="0,00"
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            O sistema sugere o valor esperado. Altere se a contagem real tiver sido diferente.
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs">Observação do fechamento</Label>
                          <Input
                            value={historyClosingNote}
                            onChange={(e) => setHistoryClosingNote(e.target.value)}
                            placeholder="Opcional"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy === `close-history-${row.id}`}
                            onClick={() =>
                              run(
                                `close-history-${row.id}`,
                                async () => {
                                  const value = parseMoney(historyCountedCash);
                                  if (!Number.isFinite(value) || value < 0)
                                    throw new Error("Valor contado inválido.");
                                  const result = await db.rpc("close_cash_session", {
                                    _session_id: row.id,
                                    _counted_cash: value,
                                    _note: historyClosingNote.trim() || null,
                                  });
                                  if (result.error) throw result.error;
                                  setClosingHistoryCashId("");
                                  setHistoryCountedCash("");
                                  setHistoryClosingNote("");
                                },
                                `Caixa de ${formatDate(row.business_date)} fechado com sucesso.`,
                              )
                            }
                          >
                            Confirmar fechamento
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy === `close-history-${row.id}`}
                            onClick={() => {
                              setClosingHistoryCashId("");
                              setHistoryCountedCash("");
                              setHistoryClosingNote("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {editingClosedCashId === String(row.id) ? (''')

# Reception workspace: expose the same recovery path because the backend allows reception to close a session.
replace_once(
'''  const [method, setMethod] = useState("pix");
  const [busy, setBusy] = useState("");
  const todayCash = (data?.cash ?? []).find((row: any) => row.business_date === fortalezaIso());''',
'''  const [method, setMethod] = useState("pix");
  const [busy, setBusy] = useState("");
  const [closingHistoryCashId, setClosingHistoryCashId] = useState("");
  const [historyCountedCash, setHistoryCountedCash] = useState("");
  const [historyClosingNote, setHistoryClosingNote] = useState("");
  const todayCash = (data?.cash ?? []).find((row: any) => row.business_date === fortalezaIso());''')

replace_once(
'''        </Panel>
        <Panel title="Receber valores pendentes">''',
'''        </Panel>
        <Panel
          title="Histórico de caixas"
          subtitle="Caixas esquecidos em aberto podem ser regularizados aqui, inclusive em outro dia."
        >
          <div className="space-y-2">
            {(data.cash ?? []).map((row: any) => (
              <div
                key={row.id}
                className={`rounded-2xl border p-4 ${
                  row.status === "open" && row.business_date < fortalezaIso()
                    ? "border-amber-300 bg-amber-50/35"
                    : "border-border"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <strong>{formatDate(row.business_date)}</strong>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Inicial {money(row.opening_cash)} · Esperado {money(row.expected_cash)} · Contado {money(row.counted_cash)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {row.status === "open" && row.business_date < fortalezaIso() ? (
                      <Badge
                        variant="outline"
                        className="border-amber-300 bg-amber-100 font-semibold text-amber-900"
                      >
                        Fechamento pendente
                      </Badge>
                    ) : null}
                    <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                    {row.status === "open" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={row.business_date < fortalezaIso() ? "default" : "outline"}
                        disabled={busy === `reception-close-history-${row.id}`}
                        onClick={() => {
                          setClosingHistoryCashId(String(row.id));
                          setHistoryCountedCash(String(row.expected_cash ?? 0));
                          setHistoryClosingNote(
                            row.business_date < fortalezaIso()
                              ? `Fechamento realizado posteriormente para o caixa de ${formatDate(row.business_date)}.`
                              : "",
                          );
                        }}
                      >
                        Fechar caixa
                      </Button>
                    ) : null}
                  </div>
                </div>
                {closingHistoryCashId === String(row.id) ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    {row.business_date < fortalezaIso() ? (
                      <p className="mb-3 text-xs text-amber-900">
                        Fechamento retroativo de <strong>{formatDate(row.business_date)}</strong>. O caixa de hoje não será alterado.
                      </p>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-[1fr_1.6fr_auto] sm:items-end">
                      <div>
                        <Label className="text-xs">Dinheiro contado</Label>
                        <Input
                          value={historyCountedCash}
                          onChange={(e) => setHistoryCountedCash(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Observação</Label>
                        <Input
                          value={historyClosingNote}
                          onChange={(e) => setHistoryClosingNote(e.target.value)}
                          placeholder="Opcional"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy === `reception-close-history-${row.id}`}
                          onClick={() =>
                            run(
                              `reception-close-history-${row.id}`,
                              async () => {
                                const value = parseMoney(historyCountedCash);
                                if (!Number.isFinite(value) || value < 0)
                                  throw new Error("Valor contado inválido.");
                                const result = await db.rpc("close_cash_session", {
                                  _session_id: row.id,
                                  _counted_cash: value,
                                  _note: historyClosingNote.trim() || null,
                                });
                                if (result.error) throw result.error;
                                setClosingHistoryCashId("");
                                setHistoryCountedCash("");
                                setHistoryClosingNote("");
                              },
                              `Caixa de ${formatDate(row.business_date)} fechado.`,
                            )
                          }
                        >
                          Confirmar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setClosingHistoryCashId("");
                            setHistoryCountedCash("");
                            setHistoryClosingNote("");
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Receber valores pendentes">''')

path.write_text(text)
print("late cash closing flow patched")
