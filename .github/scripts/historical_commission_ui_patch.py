from pathlib import Path

path = Path("src/components/finance-staging-workspace.tsx")
text = path.read_text(encoding="utf-8")

old_select = '"*,financial_entry:financial_entries(patient_name_snapshot,professional_name_snapshot,service_name_snapshot,occurred_at)",'
new_select = '"*,financial_entry:financial_entries(appointment_id,patient_name_snapshot,professional_name_snapshot,service_name_snapshot,occurred_at,original_amount,charged_amount,net_amount)",'
if old_select not in text:
    raise SystemExit("Commission financial_entry select marker not found")
text = text.replace(old_select, new_select, 1)

metric_marker = 'function MetricCard({' 
helpers = '''function historicalCommissionPreview(row: any, rules: any[]) {
  const entry = commissionEntry(row);
  if (!entry?.appointment_id || !entry?.occurred_at || !row?.professional_id) return null;
  if (row.status !== "pending" || row.is_manual_override || Number(row.paid_amount ?? 0) > 0) return null;
  if (Math.abs(Number(row.commission_amount ?? 0)) > 0.0001) return null;

  const today = fortalezaIso();
  const entryDate = fortalezaIso(new Date(entry.occurred_at));
  const rule = [...(rules ?? [])]
    .filter(
      (item: any) =>
        item.professional_id === row.professional_id &&
        item.is_active &&
        item.effective_from <= today &&
        (!item.effective_to || item.effective_to >= today),
    )
    .sort((a: any, b: any) =>
      `${b.effective_from ?? ""}-${b.created_at ?? ""}`.localeCompare(
        `${a.effective_from ?? ""}-${a.created_at ?? ""}`,
      ),
    )[0];

  if (!rule || rule.commission_type === "manual" || entryDate >= rule.effective_from) return null;

  const original = Number(entry.original_amount ?? 0);
  const charged = Number(entry.charged_amount ?? original);
  const net = Number(entry.net_amount ?? charged);
  const base =
    rule.calculation_base === "original"
      ? original
      : rule.calculation_base === "after_discount"
        ? charged
        : net;
  const amount =
    rule.commission_type === "percentage"
      ? Math.round((base * Number(rule.percentage ?? 0) / 100 + Number.EPSILON) * 100) / 100
      : Math.round((Number(rule.fixed_amount ?? 0) + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > net) return null;

  const baseLabel =
    rule.calculation_base === "original"
      ? "valor original"
      : rule.calculation_base === "after_discount"
        ? "valor após desconto"
        : "valor líquido";
  const ruleLabel =
    rule.commission_type === "percentage"
      ? `${Number(rule.percentage ?? 0).toLocaleString("pt-BR")}% sobre ${baseLabel}`
      : `${money(rule.fixed_amount)} por paciente`;

  return { rule, amount, ruleLabel, net };
}

'''
if metric_marker not in text:
    raise SystemExit("MetricCard marker not found")
text = text.replace(metric_marker, helpers + metric_marker, 1)

filtered_marker = '''  const filteredEntries = useMemo(
    () =>
      (data?.entries ?? []).filter(
        (row: any) =>
          (professionalFilter === "all" || row.professional_id === professionalFilter) &&
          (serviceFilter === "all" || row.service_id === serviceFilter) &&
          (methodFilter === "all" || row.payment_method_id === methodFilter) &&
          (statusFilter === "all" || row.status === statusFilter),
      ),
    [data?.entries, professionalFilter, serviceFilter, methodFilter, statusFilter],
  );
'''
filtered_replacement = filtered_marker + '''  const historicalCommissionCandidates = useMemo(
    () =>
      (data?.commissions ?? [])
        .map((row: any) => ({ row, preview: historicalCommissionPreview(row, data?.rules ?? []) }))
        .filter((item: any) => Boolean(item.preview)),
    [data?.commissions, data?.rules],
  );
'''
if filtered_marker not in text:
    raise SystemExit("filteredEntries marker not found")
text = text.replace(filtered_marker, filtered_replacement, 1)

panel_marker = '          <Panel title="Ajuste manual de comissão">'
historical_panel = '''          <Panel
            title="Comissões de agendamentos antigos"
            subtitle="Atendimentos anteriores à ativação das regras financeiras. A comissão é calculada com a regra atual da profissional, sem alterar o faturamento original."
          >
            {historicalCommissionCandidates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhum agendamento antigo aguardando geração de comissão.
              </div>
            ) : (
              <div className="space-y-2">
                {historicalCommissionCandidates.map(({ row, preview }: any) => {
                  const context = commissionContext(row, professionals);
                  return (
                    <div
                      key={row.id}
                      className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <strong className="text-sm">{context.patient}</strong>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {context.professional} · {context.service} · {context.date}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Líquido {money(preview.net)} · Regra atual: {preview.ruleLabel} · Comissão prevista {money(preview.amount)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0"
                        disabled={busy === `historical-commission-${row.id}`}
                        onClick={() =>
                          run(
                            `historical-commission-${row.id}`,
                            async () => {
                              const result = await db.rpc("generate_historical_commission", {
                                _commission_id: row.id,
                              });
                              if (result.error) throw result.error;
                            },
                            "Comissão do agendamento antigo gerada.",
                          )
                        }
                      >
                        {busy === `historical-commission-${row.id}` ? "Gerando..." : "Gerar comissão"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
'''
if panel_marker not in text:
    raise SystemExit("manual commission panel marker not found")
text = text.replace(panel_marker, historical_panel + panel_marker, 1)

path.write_text(text, encoding="utf-8")
