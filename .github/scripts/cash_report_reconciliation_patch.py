from pathlib import Path

completion = Path('src/components/finance-completion-suite.tsx')
staging = Path('src/components/finance-staging-workspace.tsx')

text = completion.read_text(encoding='utf-8')

anchor = '''async function loadCashByDate(date: string) {
  const result = await db
    .from("financial_cash_report")
    .select("*")
    .eq("business_date", date)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ?? null;
}
'''
insert = anchor + '''
async function loadCashRange(from: string, to: string) {
  const result = await db
    .from("financial_cash_report")
    .select("*")
    .gte("business_date", from)
    .lte("business_date", to)
    .order("business_date", { ascending: false });
  if (result.error) throw result.error;
  return result.data ?? [];
}
'''
if 'async function loadCashRange(' not in text:
    if anchor not in text:
        raise SystemExit('loadCashByDate anchor not found')
    text = text.replace(anchor, insert, 1)

anchor = '''  const cash = useQuery({
    queryKey: ["finance-cash-by-date", cashDate],
    queryFn: () => loadCashByDate(cashDate),
    enabled: Boolean(access.data?.full && cashDate),
  });
'''
insert = anchor + '''  const cashRange = useQuery({
    queryKey: ["finance-cash-range", from, to],
    queryFn: () => loadCashRange(from, to),
    enabled: Boolean(access.data?.full && from && to),
  });
'''
if 'queryKey: ["finance-cash-range"' not in text:
    if anchor not in text:
        raise SystemExit('cash query anchor not found')
    text = text.replace(anchor, insert, 1)

anchor = '''  const sectionTitle = reportSections.find(([value]) => value === section)?.[1] ?? "Relatório";
'''
insert = anchor + '''  const cashMethodId = (lookups.data?.methods ?? []).find((item: any) => item.code === "cash")?.id ?? "";
  const cashFilterActive = Boolean(method && cashMethodId && method === cashMethodId);
  const cashRows = cashRange.data ?? [];
  const cashTotals = useMemo(() => {
    const rows = cashRange.data ?? [];
    const closed = rows.filter((row: any) => row.status === "closed");
    return {
      sessions: rows.length,
      cashIn: rows.reduce((sum: number, row: any) => sum + Number(row.total_cash ?? 0), 0),
      cashOut: rows.reduce((sum: number, row: any) => sum + Number(row.total_cash_expenses ?? 0), 0),
      cashResult: rows.reduce((sum: number, row: any) => sum + Number(row.cash_result ?? (Number(row.total_cash ?? 0) - Number(row.total_cash_expenses ?? 0))), 0),
      difference: closed.reduce((sum: number, row: any) => sum + Number(row.difference_amount ?? 0), 0),
      closed: closed.length,
    };
  }, [cashRange.data]);
  const reportCashResult = cashFilterActive
    ? selectedRows.reduce((sum: number, row: any) => sum + Number(row.result_amount ?? 0), 0)
    : null;
  const reconciliationGap = reportCashResult == null ? null : reportCashResult - cashTotals.cashResult;
'''
if 'const cashMethodId =' not in text:
    if anchor not in text:
        raise SystemExit('sectionTitle anchor not found')
    text = text.replace(anchor, insert, 1)

text = text.replace('''            void cash.refetch();
''', '''            void cash.refetch();
            void cashRange.refetch();
''', 1)

anchor = '''        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <h3 className="text-xl font-bold tracking-tight text-foreground">Resultado por área da clínica</h3>
'''
reconciliation = '''        </div>

        {(method === "" || cashFilterActive) ? (
          <div className="mt-5 rounded-2xl border border-primary/15 bg-primary/[0.035] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold text-foreground">Conciliação com abertura e fechamento de caixa</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  O fundo inicial não entra no faturamento. O caixa esperado é calculado por dia como fundo inicial + entradas em dinheiro − saídas em dinheiro.
                </p>
              </div>
              {cashFilterActive && reconciliationGap != null ? (
                <Badge variant={Math.abs(reconciliationGap) <= 0.01 ? "default" : "destructive"}>
                  {Math.abs(reconciliationGap) <= 0.01 ? "Relatório e caixa conciliados" : `Divergência ${money(reconciliationGap)}`}
                </Badge>
              ) : (
                <Badge variant="secondary">{cashTotals.sessions} caixa(s) no período</Badge>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {cashFilterActive ? (
                <div className="rounded-xl border border-border bg-card p-3">
                  <span className="text-[11px] text-muted-foreground">Resultado do relatório · Dinheiro</span>
                  <strong className="mt-1 block">{money(reportCashResult)}</strong>
                </div>
              ) : null}
              <div className="rounded-xl border border-border bg-card p-3">
                <span className="text-[11px] text-muted-foreground">Entradas em dinheiro</span>
                <strong className="mt-1 block">{money(cashTotals.cashIn)}</strong>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <span className="text-[11px] text-muted-foreground">Saídas em dinheiro</span>
                <strong className="mt-1 block">{money(cashTotals.cashOut)}</strong>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <span className="text-[11px] text-muted-foreground">Movimento líquido no caixa</span>
                <strong className="mt-1 block">{money(cashTotals.cashResult)}</strong>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <span className="text-[11px] text-muted-foreground">Sobra / falta nos fechamentos</span>
                <strong className={`mt-1 block ${Math.abs(cashTotals.difference) > 0.01 ? "text-destructive" : ""}`}>{money(cashTotals.difference)}</strong>
              </div>
            </div>

            {!cashFilterActive && method === "" ? (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Para comparar diretamente com a coluna Resultado acima, selecione <strong>Dinheiro</strong> em Forma de pagamento.
              </p>
            ) : null}

            <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[980px] text-xs">
                <thead className="bg-muted/60 text-left text-muted-foreground">
                  <tr>
                    <th className="p-2.5">Data</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Abertura</th>
                    <th className="p-2.5">Entradas dinheiro</th>
                    <th className="p-2.5">Saídas dinheiro</th>
                    <th className="p-2.5">Resultado dinheiro</th>
                    <th className="p-2.5">Esperado no caixa</th>
                    <th className="p-2.5">Contado</th>
                    <th className="p-2.5">Sobra / falta</th>
                  </tr>
                </thead>
                <tbody>
                  {cashRows.map((row: any) => (
                    <tr key={row.cash_session_id ?? row.id} className="border-t border-border">
                      <td className="p-2.5 font-medium">{formatDate(row.business_date)}</td>
                      <td className="p-2.5"><Badge variant={row.status === "closed" ? "default" : "secondary"}>{row.status === "closed" ? "Fechado" : "Aberto"}</Badge></td>
                      <td className="p-2.5">{money(row.opening_cash)}</td>
                      <td className="p-2.5">{money(row.total_cash)}</td>
                      <td className="p-2.5">{money(row.total_cash_expenses)}</td>
                      <td className="p-2.5 font-medium">{money(row.cash_result)}</td>
                      <td className="p-2.5">{money(row.expected_cash)}</td>
                      <td className="p-2.5">{row.counted_cash == null ? "—" : money(row.counted_cash)}</td>
                      <td className={`p-2.5 font-medium ${row.difference_amount != null && Math.abs(Number(row.difference_amount)) > 0.01 ? "text-destructive" : ""}`}>
                        {row.difference_amount == null ? "—" : money(row.difference_amount)}
                      </td>
                    </tr>
                  ))}
                  {!cashRows.length ? (
                    <tr><td colSpan={9} className="p-5 text-center text-muted-foreground">Nenhum caixa aberto ou fechado dentro deste período.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <h3 className="text-xl font-bold tracking-tight text-foreground">Resultado por área da clínica</h3>
'''
if 'Conciliação com abertura e fechamento de caixa' not in text:
    if anchor not in text:
        raise SystemExit('report section closing anchor not found')
    text = text.replace(anchor, reconciliation, 1)

completion.write_text(text, encoding='utf-8')

s = staging.read_text(encoding='utf-8')
s = s.replace(
    'db.from("cash_sessions").select("*").order("business_date", { ascending: false }).limit(30),',
    'db.from("financial_cash_report").select("*").order("business_date", { ascending: false }).limit(30),',
    1,
)
s = s.replace(
    'db.from("cash_sessions").select("*").order("business_date", { ascending: false }).limit(15),',
    'db.from("financial_cash_report").select("*").order("business_date", { ascending: false }).limit(15),',
    1,
)
staging.write_text(s, encoding='utf-8')
