from pathlib import Path

path = Path('src/components/finance-staging-workspace.tsx')
text = path.read_text()

state_old = '''  const [settlement, setSettlement] = useState({
    professional: "",
    start: monthStartIso(),
    end: fortalezaIso(),
  });
  const [override, setOverride] = useState({ commission: "", amount: "", reason: "" });'''
state_new = '''  const [settlement, setSettlement] = useState({
    professional: "",
    start: monthStartIso(),
    end: fortalezaIso(),
  });
  const [payingSettlementId, setPayingSettlementId] = useState("");
  const [settlementPaymentMode, setSettlementPaymentMode] = useState<"pix" | "cash" | "mixed">("pix");
  const [settlementCashAmount, setSettlementCashAmount] = useState("");
  const [settlementPixAmount, setSettlementPixAmount] = useState("");
  const [override, setOverride] = useState({ commission: "", amount: "", reason: "" });'''
if state_old not in text:
    raise SystemExit('settlement state anchor not found')
text = text.replace(state_old, state_new, 1)

payment_old = '''                    {["open", "closed"].includes(row.status) ? (
                      <Button
                        className="mt-3 ml-2"
                        size="sm"
                        onClick={() =>
                          run(
                            `pay-settlement-${row.id}`,
                            async () => {
                              const result = await db.rpc("pay_professional_settlement", {
                                _settlement_id: row.id,
                              });
                              if (result.error) throw result.error;
                            },
                            "Repasse marcado como pago.",
                          )
                        }
                      >
                        Marcar repasse pago
                      </Button>
                    ) : null}'''

payment_new = '''                    {["open", "closed"].includes(row.status) ? (
                      <>
                        <Button
                          className="mt-3 ml-2"
                          size="sm"
                          disabled={busy === `pay-settlement-${row.id}`}
                          onClick={() => {
                            const pending = Math.max(
                              0,
                              Number(row.amount_pending ?? row.commission_total ?? 0),
                            );
                            setPayingSettlementId(String(row.id));
                            setSettlementPaymentMode("pix");
                            setSettlementCashAmount("");
                            setSettlementPixAmount(pending.toFixed(2).replace(".", ","));
                          }}
                        >
                          Pagar repasse
                        </Button>

                        {payingSettlementId === String(row.id) ? (
                          <div className="mt-3 rounded-2xl border border-primary/15 bg-primary-soft/30 p-4">
                            <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                              <div>
                                <Label className="text-xs">Forma de pagamento</Label>
                                <select
                                  className={selectClass}
                                  value={settlementPaymentMode}
                                  onChange={(event) => {
                                    const mode = event.target.value as "pix" | "cash" | "mixed";
                                    const pending = Math.max(
                                      0,
                                      Number(row.amount_pending ?? row.commission_total ?? 0),
                                    );
                                    setSettlementPaymentMode(mode);
                                    if (mode === "cash") {
                                      setSettlementCashAmount(pending.toFixed(2).replace(".", ","));
                                      setSettlementPixAmount("");
                                    } else if (mode === "pix") {
                                      setSettlementCashAmount("");
                                      setSettlementPixAmount(pending.toFixed(2).replace(".", ","));
                                    } else {
                                      setSettlementCashAmount("");
                                      setSettlementPixAmount("");
                                    }
                                  }}
                                >
                                  <option value="pix">PIX</option>
                                  <option value="cash">Dinheiro</option>
                                  <option value="mixed">Dinheiro + PIX</option>
                                </select>
                              </div>

                              <div>
                                <Label className="text-xs">Dinheiro</Label>
                                <Input
                                  value={settlementCashAmount}
                                  onChange={(event) => setSettlementCashAmount(event.target.value)}
                                  placeholder="0,00"
                                  disabled={settlementPaymentMode === "pix"}
                                />
                              </div>

                              <div>
                                <Label className="text-xs">PIX</Label>
                                <Input
                                  value={settlementPixAmount}
                                  onChange={(event) => setSettlementPixAmount(event.target.value)}
                                  placeholder="0,00"
                                  disabled={settlementPaymentMode === "cash"}
                                />
                              </div>

                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  disabled={busy === `pay-settlement-${row.id}`}
                                  onClick={() =>
                                    run(
                                      `pay-settlement-${row.id}`,
                                      async () => {
                                        const expected = Math.round(
                                          Math.max(0, Number(row.amount_pending ?? row.commission_total ?? 0)) * 100,
                                        ) / 100;
                                        const cash = settlementPaymentMode === "pix"
                                          ? 0
                                          : parseMoney(settlementCashAmount || "0");
                                        const pix = settlementPaymentMode === "cash"
                                          ? 0
                                          : parseMoney(settlementPixAmount || "0");

                                        if (!Number.isFinite(cash) || !Number.isFinite(pix) || cash < 0 || pix < 0)
                                          throw new Error("Informe valores válidos para Dinheiro e PIX.");
                                        if (settlementPaymentMode === "mixed" && (cash <= 0 || pix <= 0))
                                          throw new Error("No pagamento misto, informe uma parte em Dinheiro e outra em PIX.");

                                        const total = Math.round((cash + pix) * 100) / 100;
                                        if (Math.abs(total - expected) > 0.009)
                                          throw new Error(
                                            `Dinheiro + PIX deve totalizar exatamente ${money(expected)}.`,
                                          );

                                        const result = await db.rpc("pay_professional_settlement_split", {
                                          _settlement_id: row.id,
                                          _cash_amount: cash,
                                          _pix_amount: pix,
                                        });
                                        if (result.error) throw result.error;

                                        setPayingSettlementId("");
                                        setSettlementPaymentMode("pix");
                                        setSettlementCashAmount("");
                                        setSettlementPixAmount("");
                                      },
                                      "Repasse pago e forma de pagamento registrada.",
                                    )
                                  }
                                >
                                  Confirmar pagamento
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy === `pay-settlement-${row.id}`}
                                  onClick={() => {
                                    setPayingSettlementId("");
                                    setSettlementPaymentMode("pix");
                                    setSettlementCashAmount("");
                                    setSettlementPixAmount("");
                                  }}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                              <span>
                                Repasse pendente: <strong className="text-foreground">{money(row.amount_pending ?? row.commission_total)}</strong>
                              </span>
                              <span>
                                Somente a parte paga em Dinheiro reduz o dinheiro esperado do caixa físico.
                              </span>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}'''

if payment_old not in text:
    raise SystemExit('settlement payment UI anchor not found')
text = text.replace(payment_old, payment_new, 1)

path.write_text(text)
