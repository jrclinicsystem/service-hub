from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)


# --- Finance: delete pending payable / receivable ---
finance_path = Path("src/components/finance-staging-workspace.tsx")
finance = finance_path.read_text()

finance = replace_once(
    finance,
    "  TrendingUp,\n  UsersRound,",
    "  TrendingUp,\n  Trash2,\n  UsersRound,",
    "finance Trash2 import",
)

bad_payable_paid_branch = '''                        {row.status === "paid" ? (
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
'''
finance = replace_once(finance, bad_payable_paid_branch, "", "remove incorrect payable receivable reversal")

payable_anchor = '''                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === `pay-${row.id}`}
                              onClick={() =>
                                run(
                                  `pay-${row.id}`,
                                  async () => {
                                    const result = await db.rpc("pay_account_payable", {
                                      _account_id: row.id,
                                      _payment_method_code: payMethod,
                                      _paid_at: new Date().toISOString(),
                                    });
                                    if (result.error) throw result.error;
                                    if (editingPayableId === String(row.id)) resetPayableEditor();
                                  },
                                  "Conta paga.",
                                )
                              }
                            >
                              Pagar
                            </Button>
'''
payable_replacement = payable_anchor + '''                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={busy === `delete-payable-${row.id}` || busy === `pay-${row.id}`}
                              aria-label={`Excluir ${row.title}`}
                              title="Excluir conta a pagar"
                              onClick={() => {
                                const recurrenceNote =
                                  row.series_kind === "recurring" && !row.occurrence_count
                                    ? " Esta recorrência sem prazo será encerrada a partir desta ocorrência."
                                    : row.series_kind !== "single"
                                      ? " Apenas esta parcela/ocorrência será excluída."
                                      : "";
                                if (!window.confirm(`Excluir a conta a pagar “${row.title}” de ${money(row.amount)}?${recurrenceNote}`)) return;
                                run(
                                  `delete-payable-${row.id}`,
                                  async () => {
                                    const result = await db.rpc("delete_pending_account_payable", {
                                      _account_id: row.id,
                                    });
                                    if (result.error) throw result.error;
                                    if (editingPayableId === String(row.id)) resetPayableEditor();
                                  },
                                  "Conta a pagar excluída.",
                                );
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
'''
finance = replace_once(finance, payable_anchor, payable_replacement, "payable delete button")

receivable_anchor = '''                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === `receive-${row.id}`}
                              onClick={() =>
                                run(
                                  `receive-${row.id}`,
                                  async () => {
                                    const result = await db.rpc("receive_account_receivable", {
                                      _receivable_id: row.id,
                                      _payment_method_code: receiveMethod,
                                      _received_at: new Date().toISOString(),
                                    });
                                    if (result.error) throw result.error;
                                    if (editingReceivableId === String(row.id))
                                      resetReceivableEditor();
                                  },
                                  "Recebimento registrado.",
                                )
                              }
                            >
                              Receber
                            </Button>
'''
receivable_replacement = receivable_anchor + '''                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={busy === `delete-receivable-${row.id}` || busy === `receive-${row.id}`}
                              aria-label={`Excluir conta a receber de ${row.client_name_snapshot}`}
                              title="Excluir conta a receber"
                              onClick={() => {
                                const remaining = Number(row.original_amount) - Number(row.amount_received ?? 0);
                                if (!window.confirm(`Excluir a conta a receber / fiado de “${row.client_name_snapshot}” no valor de ${money(remaining)}?`)) return;
                                run(
                                  `delete-receivable-${row.id}`,
                                  async () => {
                                    const result = await db.rpc("delete_pending_account_receivable", {
                                      _receivable_id: row.id,
                                    });
                                    if (result.error) throw result.error;
                                    if (editingReceivableId === String(row.id)) resetReceivableEditor();
                                  },
                                  "Conta a receber excluída.",
                                );
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
'''
finance = replace_once(finance, receivable_anchor, receivable_replacement, "receivable delete button")
finance_path.write_text(finance)


# --- Client budget: one service row, automatic session count ---
client_path = Path("src/components/client-profile-dialog.tsx")
client = client_path.read_text()

helper_anchor = '''const digits = (value?: string | null) => String(value ?? "").replace(/\\D/g, "");
'''
helper_replacement = helper_anchor + '''const serviceSessionCount = (service: any) => {
  const metadata = [
    service?.name,
    service?.summary,
    service?.description,
    ...(Array.isArray(service?.includes) ? service.includes : []),
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase();
  const match = metadata.match(/\\b(1[0-2]|[1-9])\\s*(?:sessao|sessoes|sess)\\b/i);
  return match ? Math.min(12, Math.max(1, Number(match[1]))) : 1;
};
'''
client = replace_once(client, helper_anchor, helper_replacement, "session count helper")

client = replace_once(
    client,
    'db.from("services").select("id,name,price,duration_min").eq("is_active", true).order("name"),',
    'db.from("services").select("id,name,price,duration_min,summary,description,includes").eq("is_active", true).order("name"),',
    "service metadata query",
)

set_service_old = '''  const setBudgetService = (index: number, serviceId: string) => {
    const service = query.data?.services?.find((item: any) => item.id === serviceId);
    setBudgetRows((rows) => rows.map((row, i) => i === index ? { ...row, serviceId, unitPrice: service ? Number(service.price ?? 0).toFixed(2).replace(".", ",") : row.unitPrice } : row));
  };
'''
set_service_new = '''  const setBudgetService = (index: number, serviceId: string) => {
    const duplicate = budgetRows.some((row, i) => i !== index && row.serviceId === serviceId);
    if (duplicate) {
      toast.error("Esse serviço já foi adicionado ao combo. Ajuste as sessões na mesma linha.");
      return;
    }
    const service = query.data?.services?.find((item: any) => item.id === serviceId);
    const sessions = serviceSessionCount(service);
    setBudgetRows((rows) => rows.map((row, i) => i === index ? {
      ...row,
      serviceId,
      sessions: String(sessions),
      unitPrice: service ? Number(service.price ?? 0).toFixed(2).replace(".", ",") : row.unitPrice,
    } : row));
  };
'''
client = replace_once(client, set_service_old, set_service_new, "set budget service")

budget_rows_old = '''                  <div className="mt-4 space-y-2">
                    {budgetRows.map((row, index) => <div key={index} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1.6fr)_110px_140px_auto]">
                      <Select value={row.serviceId} onValueChange={(value) => setBudgetService(index, value)}><SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{(query.data?.services ?? []).map((service: any) => <SelectItem key={service.id} value={service.id}>{service.name} · {money(service.price)}</SelectItem>)}</SelectContent></Select>
                      <Input type="number" min="1" max="60" title="Sessões" value={row.sessions} onChange={(e) => setBudgetRows((rows) => rows.map((item, i) => i === index ? { ...item, sessions: e.target.value } : item))} placeholder="Sessões" />
                      <Input value={row.unitPrice} onChange={(e) => setBudgetRows((rows) => rows.map((item, i) => i === index ? { ...item, unitPrice: e.target.value } : item))} placeholder="Valor/sessão" />
                      <Button type="button" size="icon" variant="ghost" disabled={budgetRows.length === 1} onClick={() => setBudgetRows((rows) => rows.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button>
                    </div>)}
                  </div>
'''
budget_rows_new = '''                  <div className="mt-4 rounded-xl border border-primary/10 bg-primary/[0.035] px-3 py-2.5 text-xs text-muted-foreground">
                    Selecione cada serviço apenas uma vez. A quantidade de sessões do pacote é preenchida automaticamente pelo cadastro do serviço; adicione outra linha somente quando for outro serviço.
                  </div>
                  <div className="mt-3 space-y-2">
                    {budgetRows.map((row, index) => <div key={index} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1.6fr)_125px_140px_auto]">
                      <Select value={row.serviceId} onValueChange={(value) => setBudgetService(index, value)}><SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{(query.data?.services ?? []).map((service: any) => <SelectItem key={service.id} value={service.id}>{service.name} · {money(service.price)}</SelectItem>)}</SelectContent></Select>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1.5 z-10 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Sessões</span>
                        <Input className="pt-4 font-semibold" type="number" min="1" max="12" title="Sessões incluídas neste serviço" value={row.sessions} onChange={(e) => setBudgetRows((rows) => rows.map((item, i) => i === index ? { ...item, sessions: String(Math.min(12, Math.max(1, Number(e.target.value) || 1))) } : item))} />
                      </div>
                      <Input value={row.unitPrice} onChange={(e) => setBudgetRows((rows) => rows.map((item, i) => i === index ? { ...item, unitPrice: e.target.value } : item))} placeholder="Valor/sessão" />
                      <Button type="button" size="icon" variant="ghost" disabled={budgetRows.length === 1} onClick={() => setBudgetRows((rows) => rows.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button>
                    </div>)}
                  </div>
'''
client = replace_once(client, budget_rows_old, budget_rows_new, "budget session rows")

client_path.write_text(client)
