from pathlib import Path

path = Path('src/components/finance-completion-suite.tsx')
text = path.read_text(encoding='utf-8')

old = '''              {cashFilterActive ? (\n                <div className=\"rounded-xl border border-border bg-card p-3\">\n                  <span className=\"text-[11px] text-muted-foreground\">Resultado financeiro · Dinheiro</span>\n                  <strong className=\"mt-1 block\">{money(reportCashResult)}</strong>\n                  <p className=\"mt-1 text-[10px] text-muted-foreground\">Não inclui o fundo de abertura.</p>\n                </div>\n              ) : null}\n'''

new = '''              {cashFilterActive ? (\n                <div className=\"rounded-xl border border-primary/25 bg-primary/[0.06] p-3\">\n                  <span className=\"text-[11px] font-medium text-foreground\">Saldo atual em dinheiro</span>\n                  <strong className=\"mt-1 block text-lg\">{money(cashTotals.open > 0 ? cashTotals.openExpected : cashTotals.cashResult)}</strong>\n                  <p className=\"mt-1 text-[10px] text-muted-foreground\">Inclui o fundo de abertura + entradas em dinheiro − saídas em dinheiro.</p>\n                </div>\n              ) : null}\n'''

if old not in text:
    raise SystemExit('target card not found')
text = text.replace(old, new, 1)

old = '''              {cashFilterActive && reconciliationGap != null ? (\n                <Badge variant={Math.abs(reconciliationGap) <= 0.01 ? \"default\" : \"outline\"}>\n                  {Math.abs(reconciliationGap) <= 0.01 ? \"Relatório e caixa conciliados\" : `Diferença relatório × caixa: ${money(reconciliationGap)}`}\n                </Badge>\n              ) : (\n                <Badge variant=\"secondary\">{cashTotals.sessions} caixa(s) no período</Badge>\n              )}\n'''
new = '''              <Badge variant=\"secondary\">{cashTotals.sessions} caixa(s) no período</Badge>\n'''
if old in text:
    text = text.replace(old, new, 1)

old = '''            {cashFilterActive && reconciliationGap != null && Math.abs(reconciliationGap) > 0.01 ? (\n              <p className=\"mt-3 rounded-lg border border-border bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground\">\n                A diferença acima compara o <strong>relatório financeiro</strong> com os <strong>movimentos físicos de caixa</strong> do período. Ela não significa, sozinha, que está faltando dinheiro no caixa atual. Para o valor físico de hoje, use <strong>Caixa esperado agora</strong>.\n              </p>\n            ) : !cashFilterActive && method === \"\" ? (\n'''
new = '''            {!cashFilterActive && method === \"\" ? (\n'''
if old in text:
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
