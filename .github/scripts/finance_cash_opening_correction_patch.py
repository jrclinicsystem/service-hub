from pathlib import Path

path = Path("src/components/finance-staging-workspace.tsx")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if new in text:
        print(f"{label}: already applied")
        return
    if old not in text:
        raise SystemExit(f"Could not find patch target: {label}")
    text = text.replace(old, new, 1)
    print(f"{label}: applied")


replace_once(
    '  const [closingNote, setClosingNote] = useState("");\n',
    '  const [closingNote, setClosingNote] = useState("");\n'
    '  const [editingOpeningCash, setEditingOpeningCash] = useState(false);\n'
    '  const [correctedOpeningCash, setCorrectedOpeningCash] = useState("");\n'
    '  const [openingCorrectionReason, setOpeningCorrectionReason] = useState("");\n',
    "full workspace correction state",
)

full_old = '''                <MetricCard
                  icon={Banknote}
                  label="Fundo inicial"
                  value={money(todayCash.opening_cash)}
                />'''
full_new = '''                <div className="space-y-2">
                  <MetricCard
                    icon={Banknote}
                    label="Fundo inicial"
                    value={money(todayCash.opening_cash)}
                  />
                  {!editingOpeningCash ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setCorrectedOpeningCash(String(todayCash.opening_cash ?? "0"));
                        setOpeningCorrectionReason("");
                        setEditingOpeningCash(true);
                      }}
                    >
                      Corrigir abertura
                    </Button>
                  ) : (
                    <div className="space-y-2 rounded-2xl border border-primary/15 bg-primary-soft/30 p-3">
                      <div>
                        <Label className="text-xs">Novo fundo inicial</Label>
                        <Input
                          value={correctedOpeningCash}
                          onChange={(e) => setCorrectedOpeningCash(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Motivo da correção</Label>
                        <Input
                          value={openingCorrectionReason}
                          onChange={(e) => setOpeningCorrectionReason(e.target.value)}
                          placeholder="Ex.: valor informado em duplicidade"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Corrige somente o fundo inicial deste caixa. Entradas e saídas registradas não são alteradas.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1"
                          disabled={busy === "correct-opening-cash"}
                          onClick={() =>
                            run(
                              "correct-opening-cash",
                              async () => {
                                const value = parseMoney(correctedOpeningCash);
                                if (!Number.isFinite(value) || value < 0)
                                  throw new Error("Fundo inicial inválido.");
                                if (!openingCorrectionReason.trim())
                                  throw new Error("Informe o motivo da correção.");
                                const result = await db.rpc("correct_open_cash_session", {
                                  _session_id: todayCash.id,
                                  _opening_cash: value,
                                  _reason: openingCorrectionReason.trim(),
                                });
                                if (result.error) throw result.error;
                                setEditingOpeningCash(false);
                                setCorrectedOpeningCash("");
                                setOpeningCorrectionReason("");
                              },
                              "Abertura do caixa corrigida.",
                            )
                          }
                        >
                          Salvar correção
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy === "correct-opening-cash"}
                          onClick={() => {
                            setEditingOpeningCash(false);
                            setCorrectedOpeningCash("");
                            setOpeningCorrectionReason("");
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>'''
replace_once(full_old, full_new, "full workspace cash editor")

replace_once(
    '  const [note, setNote] = useState("");\n',
    '  const [note, setNote] = useState("");\n'
    '  const [editingOpeningCash, setEditingOpeningCash] = useState(false);\n'
    '  const [correctedOpeningCash, setCorrectedOpeningCash] = useState("");\n'
    '  const [openingCorrectionReason, setOpeningCorrectionReason] = useState("");\n',
    "reception correction state",
)

reception_old = '''          ) : todayCash.status === "open" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                placeholder="Dinheiro contado"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />'''
reception_new = '''          ) : todayCash.status === "open" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Fundo inicial informado</p>
                    <strong className="text-lg">{money(todayCash.opening_cash)}</strong>
                  </div>
                  {!editingOpeningCash ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCorrectedOpeningCash(String(todayCash.opening_cash ?? "0"));
                        setOpeningCorrectionReason("");
                        setEditingOpeningCash(true);
                      }}
                    >
                      Corrigir abertura
                    </Button>
                  ) : null}
                </div>
                {editingOpeningCash ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.6fr_auto]">
                    <Input
                      value={correctedOpeningCash}
                      onChange={(e) => setCorrectedOpeningCash(e.target.value)}
                      placeholder="Novo fundo inicial"
                    />
                    <Input
                      value={openingCorrectionReason}
                      onChange={(e) => setOpeningCorrectionReason(e.target.value)}
                      placeholder="Motivo da correção"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy === "correct-opening"}
                        onClick={() =>
                          run(
                            "correct-opening",
                            async () => {
                              const value = parseMoney(correctedOpeningCash);
                              if (!Number.isFinite(value) || value < 0)
                                throw new Error("Fundo inicial inválido.");
                              if (!openingCorrectionReason.trim())
                                throw new Error("Informe o motivo da correção.");
                              const result = await db.rpc("correct_open_cash_session", {
                                _session_id: todayCash.id,
                                _opening_cash: value,
                                _reason: openingCorrectionReason.trim(),
                              });
                              if (result.error) throw result.error;
                              setEditingOpeningCash(false);
                              setCorrectedOpeningCash("");
                              setOpeningCorrectionReason("");
                            },
                            "Abertura do caixa corrigida.",
                          )
                        }
                      >
                        Salvar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy === "correct-opening"}
                        onClick={() => {
                          setEditingOpeningCash(false);
                          setCorrectedOpeningCash("");
                          setOpeningCorrectionReason("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : null}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  A correção altera apenas o fundo inicial. Recebimentos e despesas do dia continuam intactos.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
              <Input
                placeholder="Dinheiro contado"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />'''
replace_once(reception_old, reception_new, "reception cash editor start")

reception_close_old = '''              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">'''
reception_close_new = '''              </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">'''
# Apply to the first matching close after ReceptionWorkspace by splitting around it.
marker = 'function ReceptionWorkspace'
head, tail = text.split(marker, 1)
if reception_close_new not in tail:
    if reception_close_old not in tail:
        raise SystemExit("Could not find patch target: reception cash editor close")
    tail = tail.replace(reception_close_old, reception_close_new, 1)
    text = head + marker + tail
    print("reception cash editor close: applied")
else:
    print("reception cash editor close: already applied")

path.write_text(text)
print("Cash opening correction UI patch complete")
