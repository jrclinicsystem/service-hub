from pathlib import Path

workspace_path = Path("src/components/finance-staging-workspace.tsx")
workspace = workspace_path.read_text(encoding="utf-8")
old_panel = '<h2 className="text-lg font-semibold">{title}</h2>'
new_panel = '<h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>'
if old_panel not in workspace:
    raise SystemExit("Panel title marker not found")
workspace = workspace.replace(old_panel, new_panel, 1)
workspace_path.write_text(workspace, encoding="utf-8")

commission_path = Path("src/components/finance-commission-payment-actions.tsx")
text = commission_path.read_text(encoding="utf-8")

old_heading = '<h2 className="text-lg font-semibold">Comissões por profissional</h2>'
new_heading = '<h2 className="text-xl font-bold tracking-tight text-foreground">Comissões por profissional</h2>'
if old_heading not in text:
    raise SystemExit("Commission heading marker not found")
text = text.replace(old_heading, new_heading, 1)

groups_marker = '''  const groups = useMemo(() => {
    const grouped = new Map<string, { professionalId: string; name: string; rows: any[] }>();
    for (const row of query.data?.commissions ?? []) {
      const entry = relatedEntry(row);
      const professionalId = String(row.professional_id ?? "unknown");
      const name =
        entry?.professional_name_snapshot ||
        professionalMap.get(professionalId) ||
        `Profissional ${professionalId.slice(0, 8)}`;
      const current = grouped.get(professionalId) ?? { professionalId, name, rows: [] };
      current.rows.push(row);
      grouped.set(professionalId, current);
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [professionalMap, query.data?.commissions]);
'''
summary_insert = groups_marker + '''
  const commissionSummary = useMemo(() => {
    const rows = query.data?.commissions ?? [];
    const total = rows.reduce((sum: number, row: any) => sum + Number(row.commission_amount ?? 0), 0);
    const paid = rows.reduce((sum: number, row: any) => sum + paidAmount(row), 0);
    return {
      total,
      paid,
      remaining: Math.max(0, Math.round((total - paid) * 100) / 100),
    };
  }, [query.data?.commissions]);
'''
if groups_marker not in text:
    raise SystemExit("Groups marker not found")
text = text.replace(groups_marker, summary_insert, 1)

list_marker = '''        <div className="mt-6 space-y-3">
'''
summary_ui = '''        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-primary-soft/30 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total de comissões</p>
            <p className="mt-1 text-xl font-bold text-foreground">{money(commissionSummary.total)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total pago</p>
            <p className="mt-1 text-xl font-bold text-foreground">{money(commissionSummary.paid)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total restante</p>
            <p className="mt-1 text-xl font-bold text-foreground">{money(commissionSummary.remaining)}</p>
          </div>
        </div>

''' + list_marker
if list_marker not in text:
    raise SystemExit("Commission list marker not found")
text = text.replace(list_marker, summary_ui, 1)

old_group_totals = '''                    {expanded ? (
                      <div className="flex gap-4 pl-7 text-xs sm:pl-0">
                        <span>
                          <strong>{money(groupTotal)}</strong> total
                        </span>
                        <span>
                          <strong>{money(groupPaid)}</strong> pago
                        </span>
                        <span>
                          <strong>{money(groupRemaining)}</strong> restante
                        </span>
                      </div>
                    ) : null}
'''
new_group_totals = '''                    <div className="flex flex-wrap items-center gap-3 pl-7 text-xs sm:justify-end sm:pl-0">
                      <span className="rounded-full bg-background/80 px-3 py-1.5">
                        Total <strong className="ml-1 text-sm">{money(groupTotal)}</strong>
                      </span>
                      {expanded ? (
                        <>
                          <span>
                            Pago <strong className="ml-1">{money(groupPaid)}</strong>
                          </span>
                          <span>
                            Restante <strong className="ml-1">{money(groupRemaining)}</strong>
                          </span>
                        </>
                      ) : null}
                    </div>
'''
if old_group_totals not in text:
    raise SystemExit("Group totals marker not found")
text = text.replace(old_group_totals, new_group_totals, 1)

commission_path.write_text(text, encoding="utf-8")
