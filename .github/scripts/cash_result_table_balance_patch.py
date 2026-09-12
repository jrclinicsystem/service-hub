from pathlib import Path

path = Path('src/components/finance-completion-suite.tsx')
text = path.read_text(encoding='utf-8')

old_header = '<th className="p-3">Resultado financeiro</th>'
new_header = '<th className="p-3">{cashFilterActive ? "Saldo atual em dinheiro" : "Resultado financeiro"}</th>'
if old_header not in text:
    raise SystemExit('Header target not found')
text = text.replace(old_header, new_header, 1)

old_cell = '<td className="p-3 font-semibold">{money(row.result_amount)}</td>'
new_cell = '<td className="p-3 font-semibold">{cashFilterActive ? money(cashTotals.open > 0 ? cashTotals.openExpected : cashTotals.cashResult) : money(row.result_amount)}</td>'
if old_cell not in text:
    raise SystemExit('Cell target not found')
text = text.replace(old_cell, new_cell, 1)

path.write_text(text, encoding='utf-8')
print('Patched finance result table to show current physical cash balance when filtering by cash.')
