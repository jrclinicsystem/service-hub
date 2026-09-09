from pathlib import Path

p = Path('src/components/finance-staging-workspace.tsx')
s = p.read_text()
start = s.find('function printReport(entries: any[], expenses: any[], from: string, to: string) {')
end_marker = '\n}\n\nexport function FinanceStagingWorkspace()'
end = s.find(end_marker, start)
if start == -1 or end == -1:
    raise SystemExit('printReport target not found')

replacement = '''function printReport(entries: any[], expenses: any[], from: string, to: string) {
  const popup = window.open("", "_blank", "width=1100,height=800");
  if (!popup) {
    toast.error("O navegador bloqueou a janela de impressão.");
    return;
  }

  const entryRows = entries
    .map(
      (row) =>
        `<tr><td>${formatDate(row.business_date)}</td><td>${row.patient_name_snapshot ?? ""}</td><td>${row.professional_name_snapshot ?? ""}</td><td>${row.service_name_snapshot ?? ""}</td><td>${row.payment_method_name ?? "Não informado"}</td><td>${money(row.charged_amount)}</td><td>${money(row.net_amount)}</td></tr>`,
    )
    .join("");

  const expenseRows = expenses
    .map(
      (row) =>
        `<tr><td>${formatDate(row.expense_date)}</td><td>${row.description ?? ""}</td><td>${row.payment_method_name ?? "Não informado"}</td><td>${money(row.amount)}</td></tr>`,
    )
    .join("");

  const entryTotals: Record<string, number> = {};
  const expenseTotals: Record<string, number> = {};
  for (const row of entries) {
    const methodName = String(row.payment_method_name ?? "Não informado");
    entryTotals[methodName] = (entryTotals[methodName] ?? 0) + Number(row.net_amount ?? 0);
  }
  for (const row of expenses) {
    const methodName = String(row.payment_method_name ?? "Não informado");
    expenseTotals[methodName] = (expenseTotals[methodName] ?? 0) + Number(row.amount ?? 0);
  }

  const paymentMethods = Array.from(new Set([...Object.keys(entryTotals), ...Object.keys(expenseTotals)])).sort();
  const paymentRows = paymentMethods
    .map((methodName) => {
      const received = entryTotals[methodName] ?? 0;
      const spent = expenseTotals[methodName] ?? 0;
      return `<tr><td>${methodName}</td><td>${money(received)}</td><td>${money(spent)}</td><td>${money(received - spent)}</td></tr>`;
    })
    .join("");

  const grossTotal = entries.reduce((sum, row) => sum + Number(row.charged_amount ?? 0), 0);
  const feeTotal = entries.reduce((sum, row) => sum + Number(row.card_fee_amount ?? 0), 0);
  const netTotal = entries.reduce((sum, row) => sum + Number(row.net_amount ?? 0), 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const finalResult = netTotal - expenseTotal;

  popup.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Relatório Financeiro JR Clinic</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#222}h1{margin-bottom:4px}h2{margin-top:28px}p{color:#666}table{width:100%;border-collapse:collapse;margin:18px 0 28px}th,td{border:1px solid #ddd;padding:8px;font-size:12px;text-align:left}th{background:#f5f5f5}.summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:20px 0 30px}.box{border:1px solid #ddd;border-radius:8px;padding:12px}.label{font-size:11px;color:#666}.value{font-size:16px;font-weight:700;margin-top:5px}.result{border:2px solid #0f4d3e;background:#f2f8f6}@media print{button{display:none}.summary{grid-template-columns:repeat(5,minmax(0,1fr))}}</style></head><body><h1>JR Clinic — Relatório Financeiro</h1><p>Período: ${formatDate(from)} a ${formatDate(to)}</p><div class="summary"><div class="box"><div class="label">Entradas brutas</div><div class="value">${money(grossTotal)}</div></div><div class="box"><div class="label">Taxas</div><div class="value">${money(feeTotal)}</div></div><div class="box"><div class="label">Entradas líquidas</div><div class="value">${money(netTotal)}</div></div><div class="box"><div class="label">Despesas / saídas</div><div class="value">${money(expenseTotal)}</div></div><div class="box result"><div class="label">Resultado final da clínica</div><div class="value">${money(finalResult)}</div></div></div><h2>Entradas</h2><table><tr><th>Data</th><th>Cliente</th><th>Profissional</th><th>Serviço</th><th>Pagamento</th><th>Bruto</th><th>Líquido</th></tr>${entryRows}</table><h2>Despesas / Saídas</h2><table><tr><th>Data</th><th>Descrição</th><th>Pagamento</th><th>Valor</th></tr>${expenseRows}</table><h2>Totais por forma de pagamento</h2><table><tr><th>Forma de pagamento</th><th>Entradas líquidas</th><th>Saídas</th><th>Saldo</th></tr>${paymentRows}</table><div class="box result"><div class="label">Abatimento final — entradas líquidas menos despesas</div><div class="value">${money(netTotal)} − ${money(expenseTotal)} = ${money(finalResult)}</div></div><button onclick="window.print()">Imprimir / Salvar PDF</button></body></html>`,
  );
  popup.document.close();
  popup.focus();
}'''

s = s[:start] + replacement + s[end + 2:]
p.write_text(s)
