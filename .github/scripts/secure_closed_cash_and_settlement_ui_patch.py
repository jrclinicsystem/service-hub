from pathlib import Path

path = Path("src/components/finance-staging-workspace.tsx")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f"Could not find patch anchor: {label}")
    text = text.replace(old, new, 1)


# Load the immutable closed-cash correction ledger so the UI can expose history.
replace_once(
'''    db
      .from("professional_commission_rules")
      .select("*")
      .order("effective_from", { ascending: false })
      .limit(100),
    db
      .from("professionals")''',
'''    db
      .from("professional_commission_rules")
      .select("*")
      .order("effective_from", { ascending: false })
      .limit(100),
    db
      .from("cash_session_corrections")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    db
      .from("professionals")''',
"cash correction query",
)

replace_once(
'''    rules,
    professionalsDirectory,
  ] = results;''',
'''    rules,
    cashCorrections,
    professionalsDirectory,
  ] = results;''',
"cash correction destructuring",
)

replace_once(
'''    rules: rules.data ?? [],
    professionalsDirectory: professionalsDirectory.data ?? [],''',
'''    rules: rules.data ?? [],
    cashCorrections: cashCorrections.data ?? [],
    professionalsDirectory: professionalsDirectory.data ?? [],''',
"cash correction return",
)

# State for secure editing, explicit confirmation and history display.
replace_once(
'''  const [editingClosedCashId, setEditingClosedCashId] = useState("");
  const [correctedCountedCash, setCorrectedCountedCash] = useState("");
  const [closedCorrectionReason, setClosedCorrectionReason] = useState("");''',
'''  const [editingClosedCashId, setEditingClosedCashId] = useState("");
  const [correctedClosedOpeningCash, setCorrectedClosedOpeningCash] = useState("");
  const [correctedCountedCash, setCorrectedCountedCash] = useState("");
  const [correctedClosedNote, setCorrectedClosedNote] = useState("");
  const [closedCorrectionReason, setClosedCorrectionReason] = useState("");
  const [closedEditConfirmation, setClosedEditConfirmation] = useState("");
  const [cashHistoryId, setCashHistoryId] = useState("");''',
"secure cash states",
)

replace_once(
'''  const todayCash = (data?.cash ?? []).find((row: any) => row.business_date === fortalezaIso());
  const professionals = useMemo(() => {''',
'''  const todayCash = (data?.cash ?? []).find((row: any) => row.business_date === fortalezaIso());
  const isAdmin = Boolean(access?.roles?.includes("admin"));
  const cashCorrectionsBySession = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const correction of data?.cashCorrections ?? []) {
      const key = String(correction.cash_session_id ?? "");
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), correction]);
    }
    return map;
  }, [data?.cashCorrections]);
  const professionals = useMemo(() => {''',
"admin and cash correction map",
)

# Paid settlements must never keep the payment action visible, even if a stale status slips through.
replace_once(
'''                    {["open", "closed"].includes(row.status) ? (''',
'''                    {["open", "closed"].includes(row.status) && Number(row.amount_pending ?? row.commission_total ?? 0) > 0.009 ? (''',
"settlement payment visibility",
)

# Replace the closed-cash action with admin-only editing plus visible audit/history affordances.
old_action = '''                      {row.status === "closed" ? (
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
                      ) : null}'''
new_action = '''                      {row.status === "closed" && row.correction_id ? (
                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-50 font-semibold text-amber-900"
                        >
                          Alterado após fechamento
                        </Badge>
                      ) : null}
                      {row.status === "closed" && (cashCorrectionsBySession.get(String(row.id))?.length ?? 0) > 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setCashHistoryId((current) => current === String(row.id) ? "" : String(row.id))
                          }
                        >
                          Histórico
                        </Button>
                      ) : null}
                      {row.status === "closed" && isAdmin ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingClosedCashId(String(row.id));
                            setCorrectedClosedOpeningCash(String(row.opening_cash ?? 0));
                            setCorrectedCountedCash(String(row.counted_cash ?? row.expected_cash ?? 0));
                            setCorrectedClosedNote(String(row.closing_note ?? ""));
                            setClosedCorrectionReason("");
                            setClosedEditConfirmation("");
                          }}
                        >
                          Editar caixa
                        </Button>
                      ) : null}'''
replace_once(old_action, new_action, "closed cash action")

# Replace the legacy counted-only correction editor with the secure admin editor and immutable history view.
start_anchor = '                  {editingClosedCashId === String(row.id) ? (\n'
end_anchor = '                  ) : null}\n                </div>\n              ))}'
start = text.find(start_anchor)
if start < 0:
    raise SystemExit("Could not find patch anchor: legacy closed cash editor start")
end_marker = text.find(end_anchor, start)
if end_marker < 0:
    raise SystemExit("Could not find patch anchor: legacy closed cash editor end")
end = end_marker + len('                  ) : null}')

new_editor = '''                  {editingClosedCashId === String(row.id) ? (
                    <div className="mt-3 rounded-xl border border-primary/20 bg-primary-soft/20 p-4">
                      <div className="mb-3 flex items-start gap-2 text-xs text-foreground">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                        <p>
                          Alteração protegida: o fechamento original não é apagado. O sistema registra usuário, data, motivo e valores antes/depois.
                        </p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div>
                          <Label className="text-xs">Fundo inicial correto</Label>
                          <Input
                            value={correctedClosedOpeningCash}
                            onChange={(e) => setCorrectedClosedOpeningCash(e.target.value)}
                            placeholder="0,00"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Dinheiro contado correto</Label>
                          <Input
                            value={correctedCountedCash}
                            onChange={(e) => setCorrectedCountedCash(e.target.value)}
                            placeholder="0,00"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Observação do fechamento</Label>
                          <Input
                            value={correctedClosedNote}
                            onChange={(e) => setCorrectedClosedNote(e.target.value)}
                            placeholder="Opcional"
                          />
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[1.6fr_1fr_auto] md:items-end">
                        <div>
                          <Label className="text-xs">Motivo obrigatório</Label>
                          <Input
                            value={closedCorrectionReason}
                            onChange={(e) => setClosedCorrectionReason(e.target.value)}
                            placeholder="Explique por que este caixa precisa ser alterado"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Confirmação de segurança</Label>
                          <Input
                            value={closedEditConfirmation}
                            onChange={(e) => setClosedEditConfirmation(e.target.value)}
                            placeholder="Digite ALTERAR"
                            autoComplete="off"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              busy === `secure-edit-closed-${row.id}` ||
                              closedEditConfirmation.trim().toUpperCase() !== "ALTERAR"
                            }
                            onClick={() => {
                              const openingValue = parseMoney(correctedClosedOpeningCash);
                              const countedValue = parseMoney(correctedCountedCash);
                              if (!isAdmin) {
                                toast.error("Somente administradores podem alterar um caixa fechado.");
                                return;
                              }
                              if (!Number.isFinite(openingValue) || openingValue < 0) {
                                toast.error("Fundo inicial inválido.");
                                return;
                              }
                              if (!Number.isFinite(countedValue) || countedValue < 0) {
                                toast.error("Valor contado inválido.");
                                return;
                              }
                              if (closedCorrectionReason.trim().length < 5) {
                                toast.error("Informe um motivo da alteração com pelo menos 5 caracteres.");
                                return;
                              }
                              if (closedEditConfirmation.trim().toUpperCase() !== "ALTERAR") {
                                toast.error("Digite ALTERAR para confirmar a operação.");
                                return;
                              }
                              if (!window.confirm(
                                `Confirmar alteração do caixa de ${formatDate(row.business_date)}? Esta ação ficará registrada permanentemente no histórico.`,
                              )) return;
                              void run(
                                `secure-edit-closed-${row.id}`,
                                async () => {
                                  const result = await db.rpc("admin_edit_closed_cash_session", {
                                    _session_id: row.id,
                                    _opening_cash: openingValue,
                                    _counted_cash: countedValue,
                                    _closing_note: correctedClosedNote,
                                    _reason: closedCorrectionReason.trim(),
                                  });
                                  if (result.error) throw result.error;
                                  setEditingClosedCashId("");
                                  setCorrectedClosedOpeningCash("");
                                  setCorrectedCountedCash("");
                                  setCorrectedClosedNote("");
                                  setClosedCorrectionReason("");
                                  setClosedEditConfirmation("");
                                  setCashHistoryId(String(row.id));
                                },
                                "Caixa alterado com segurança e registrado no histórico.",
                              );
                            }}
                          >
                            Salvar alteração
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy === `secure-edit-closed-${row.id}`}
                            onClick={() => {
                              setEditingClosedCashId("");
                              setCorrectedClosedOpeningCash("");
                              setCorrectedCountedCash("");
                              setCorrectedClosedNote("");
                              setClosedCorrectionReason("");
                              setClosedEditConfirmation("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {cashHistoryId === String(row.id) ? (
                    <div className="mt-3 rounded-xl border border-border bg-muted/25 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <strong className="text-sm">Histórico de alterações</strong>
                          <p className="text-[11px] text-muted-foreground">Registros de auditoria deste caixa não podem ser apagados pela interface.</p>
                        </div>
                        <Badge variant="outline">{cashCorrectionsBySession.get(String(row.id))?.length ?? 0} alteração(ões)</Badge>
                      </div>
                      <div className="space-y-2">
                        {(cashCorrectionsBySession.get(String(row.id)) ?? []).map((item: any) => (
                          <div key={item.id} className="rounded-xl border border-border bg-card p-3 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <strong>{new Date(item.created_at).toLocaleString("pt-BR")}</strong>
                              <span className="text-muted-foreground">
                                Por {item.actor_label || (item.created_by ? `usuário ${String(item.created_by).slice(0, 8)}` : "administrador")}
                              </span>
                            </div>
                            <p className="mt-1"><span className="text-muted-foreground">Motivo:</span> {item.reason}</p>
                            <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-3">
                              <span>Inicial: <strong className="text-foreground">{money(item.previous_opening_cash)}</strong> → <strong className="text-foreground">{money(item.corrected_opening_cash)}</strong></span>
                              <span>Contado: <strong className="text-foreground">{money(item.previous_counted_cash)}</strong> → <strong className="text-foreground">{money(item.corrected_counted_cash)}</strong></span>
                              <span>Diferença: <strong className="text-foreground">{money(item.previous_difference_amount)}</strong> → <strong className="text-foreground">{money(item.corrected_difference_amount)}</strong></span>
                            </div>
                            {(item.previous_note || item.corrected_note) ? (
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                Observação: <span className="text-foreground">{item.previous_note || "Sem observação"}</span> → <span className="text-foreground">{item.corrected_note || "Sem observação"}</span>
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}'''

text = text[:start] + new_editor + text[end:]

path.write_text(text, encoding="utf-8")
print("Secure closed cash editor and settlement visibility patch applied.")
