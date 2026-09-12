from pathlib import Path

path = Path('src/components/finance-completion-suite.tsx')
text = path.read_text(encoding='utf-8')

old = '''  const cashTotals = useMemo(() => {
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
'''
new = '''  const cashTotals = useMemo(() => {
    const rows = cashRange.data ?? [];
    const closed = rows.filter((row: any) => row.status === "closed");
    const open = rows.filter((row: any) => row.status === "open");
    return {
      sessions: rows.length,
      cashIn: rows.reduce((sum: number, row: any) => sum + Number(row.total_cash ?? 0), 0),
      cashOut: rows.reduce((sum: number, row: any) => sum + Number(row.total_cash_expenses ?? 0), 0),
      cashResult: rows.reduce((sum: number, row: any) => sum + Number(row.cash_result ?? (Number(row.total_cash ?? 0) - Number(row.total_cash_expenses ?? 0))), 0),
      difference: closed.reduce((sum: number, row: any) => sum + Number(row.difference_amount ?? 0), 0),
      openExpected: open.reduce((sum: number, row: any) => sum + Number(row.expected_cash ?? 0), 0),
      closed: closed.length,
      open: open.length,
    };
  }, [cashRange.data]);
'''
if old not in text:
    raise SystemExit('cashTotals anchor not found')
text = text.replace(old, new, 1)

text = text.replace('<th className="p-3">Resultado</th>', '<th className="p-3">Resultado financeiro</th>', 1)

old = '''                <p className="mt-1 text-xs text-muted-foreground">
                  O fundo inicial não entra no faturamento. O caixa esperado é calculado por dia como fundo inicial + entradas em dinheiro − saídas em dinheiro.
                </p>
'''
new = '''                <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                  Resultado financeiro e dinheiro físico em caixa são informações diferentes. O fundo inicial não entra no faturamento; para saber quanto deve existir fisicamente, consulte <strong>Caixa esperado agora</strong>.
                </p>
'''
if old not in text:
    raise SystemExit('reconciliation description anchor not found')
text = text.replace(old, new, 1)

old = '''              {cashFilterActive && reconciliationGap != null ? (
                <Badge variant={Math.abs(reconciliationGap) <= 0.01 ? "default" : "destructive"}>
                  {Math.abs(reconciliationGap) <= 0.01 ? "Relatório e caixa conciliados" : `Divergência ${money(reconciliationGap)}`}
                </Badge>
              ) : (
                <Badge variant="secondary">{cashTotals.sessions} caixa(s) no período</Badge>
              )}
'''
new = '''              {cashFilterActive && reconciliationGap != null ? (
                <Badge variant={Math.abs(reconciliationGap) <= 0.01 ? "default" : "outline"}>
                  {Math.abs(reconciliationGap) <= 0.01 ? "Relatório e caixa conciliados" : `Diferença relatório × caixa: ${money(reconciliationGap)}`}
                </Badge>
              ) : (
                <Badge variant="secondary">{cashTotals.sessions} caixa(s) no período</Badge>
              )}
'''
if old not in text:
    raise SystemExit('reconciliation badge anchor not found')
text = text.replace(old, new, 1)

text = text.replace('className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"', 'className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6"', 1)

old = '''              {cashFilterActive ? (
                <div className="rounded-xl border border-border bg-card p-3">
                  <span className="text-[11px] text-muted-foreground">Resultado do relatório · Dinheiro</span>
                  <strong className="mt-1 block">{money(reportCashResult)}</strong>
                </div>
              ) : null}
'''
new = '''              {cashFilterActive ? (
                <div className="rounded-xl border border-border bg-card p-3">
                  <span className="text-[11px] text-muted-foreground">Resultado financeiro · Dinheiro</span>
                  <strong className="mt-1 block">{money(reportCashResult)}</strong>
                  <p className="mt-1 text-[10px] text-muted-foreground">Não inclui o fundo de abertura.</p>
                </div>
              ) : null}
              {cashTotals.open > 0 ? (
                <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-3">
                  <span className="text-[11px] font-medium text-foreground">Caixa esperado agora</span>
                  <strong className="mt-1 block text-lg">{money(cashTotals.openExpected)}</strong>
                  <p className="mt-1 text-[10px] text-muted-foreground">Inclui fundo inicial + entradas em dinheiro − saídas em dinheiro.</p>
                </div>
              ) : null}
'''
if old not in text:
    raise SystemExit('report money card anchor not found')
text = text.replace(old, new, 1)

text = text.replace('''                <span className="text-[11px] text-muted-foreground">Movimento líquido no caixa</span>''', '''                <span className="text-[11px] text-muted-foreground">Movimento do caixa (sem abertura)</span>''', 1)
text = text.replace('''                <span className="text-[11px] text-muted-foreground">Sobra / falta nos fechamentos</span>''', '''                <span className="text-[11px] text-muted-foreground">Sobra / falta em caixas já fechados</span>''', 1)

old = '''            {!cashFilterActive && method === "" ? (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Para comparar diretamente com a coluna Resultado acima, selecione <strong>Dinheiro</strong> em Forma de pagamento.
              </p>
            ) : null}
'''
new = '''            {cashFilterActive && reconciliationGap != null && Math.abs(reconciliationGap) > 0.01 ? (
              <p className="mt-3 rounded-lg border border-border bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
                A diferença acima compara o <strong>relatório financeiro</strong> com os <strong>movimentos físicos de caixa</strong> do período. Ela não significa, sozinha, que está faltando dinheiro no caixa atual. Para o valor físico de hoje, use <strong>Caixa esperado agora</strong>.
              </p>
            ) : !cashFilterActive && method === "" ? (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Para analisar apenas dinheiro, selecione <strong>Dinheiro</strong> em Forma de pagamento. O saldo físico do caixa continua sendo mostrado separadamente em <strong>Caixa esperado agora</strong>.
              </p>
            ) : null}
'''
if old not in text:
    raise SystemExit('reconciliation helper anchor not found')
text = text.replace(old, new, 1)

text = text.replace('<th className="p-2.5">Resultado dinheiro</th>', '<th className="p-2.5">Movimento em dinheiro</th>', 1)
text = text.replace('<th className="p-2.5">Esperado no caixa</th>', '<th className="p-2.5">Esperado no caixa (com abertura)</th>', 1)
text = text.replace('''                    <tr key={row.cash_session_id ?? row.id} className="border-t border-border">''', '''                    <tr key={row.cash_session_id ?? row.id} className={`border-t border-border ${row.status === "open" ? "bg-primary/[0.035]" : ""}`}>''', 1)
text = text.replace('''                      <td className="p-2.5">{money(row.expected_cash)}</td>''', '''                      <td className={`p-2.5 ${row.status === "open" ? "font-semibold" : ""}`}>{money(row.expected_cash)}</td>''', 1)

text = text.replace('''                  <span className="text-xs text-muted-foreground">Esperado espécie</span>''', '''                  <span className="text-xs text-muted-foreground">Esperado no caixa (com abertura)</span>''', 1)
text = text.replace('''                  <span className="text-xs text-muted-foreground">Diferença</span>''', '''                  <span className="text-xs text-muted-foreground">Sobra / falta após contagem</span>''', 1)

text = text.replace('<th>Resultado</th>', '<th>Resultado financeiro</th>')

path.write_text(text, encoding='utf-8')
print('finance cash clarity patch applied')
