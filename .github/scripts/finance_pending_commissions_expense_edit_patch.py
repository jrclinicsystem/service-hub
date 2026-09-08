from pathlib import Path

commission_path = Path('src/components/finance-commission-payment-actions.tsx')
commission = commission_path.read_text()
old = '''    for (const row of query.data?.commissions ?? []) {\n      const entry = relatedEntry(row);'''
new = '''    for (const row of query.data?.commissions ?? []) {\n      if (remainingAmount(row) <= 0) continue;\n      const entry = relatedEntry(row);'''
if old not in commission:
    raise SystemExit('commission grouping anchor not found')
commission = commission.replace(old, new, 1)
commission = commission.replace(
    '<p className="text-sm text-muted-foreground">Nenhuma comissão encontrada.</p>',
    '<p className="text-sm text-muted-foreground">Nenhuma comissão pendente no momento.</p>',
)
commission_path.write_text(commission)

finance_path = Path('src/components/finance-staging-workspace.tsx')
finance = finance_path.read_text()
old = '''  const [editingReceivableId, setEditingReceivableId] = useState("");\n  const [receivableEdit, setReceivableEdit] = useState({ amount: "", due: "" });'''
new = '''  const [editingReceivableId, setEditingReceivableId] = useState("");\n  const [receivableEdit, setReceivableEdit] = useState({ amount: "", due: "" });\n  const [editingExpenseId, setEditingExpenseId] = useState("");\n  const [expenseEditAmount, setExpenseEditAmount] = useState("");'''
if old not in finance:
    raise SystemExit('expense state anchor not found')
finance = finance.replace(old, new, 1)

old = '''  const resetReceivableEditor = () => {\n    setEditingReceivableId("");\n    setReceivableEdit({ amount: "", due: "" });\n  };'''
new = '''  const resetReceivableEditor = () => {\n    setEditingReceivableId("");\n    setReceivableEdit({ amount: "", due: "" });\n  };\n\n  const editExpenseAmount = (currentExpense: any) => {\n    setEditingExpenseId(String(currentExpense.expense_id));\n    setExpenseEditAmount(String(currentExpense.amount ?? ""));\n  };\n\n  const resetExpenseEditor = () => {\n    setEditingExpenseId("");\n    setExpenseEditAmount("");\n  };'''
if old not in finance:
    raise SystemExit('expense helper anchor not found')
finance = finance.replace(old, new, 1)

old = '''                  <strong>{money(row.amount)}</strong>\n                </div>'''
new = '''                  <div className="text-right">\n                    <strong>{money(row.amount)}</strong>\n                    <div className="mt-2">\n                      <Button\n                        size="sm"\n                        variant="outline"\n                        disabled={busy === `edit-expense-${row.expense_id}`}\n                        onClick={() => editExpenseAmount(row)}\n                      >\n                        Editar valor\n                      </Button>\n                    </div>\n                  </div>\n                  {editingExpenseId === String(row.expense_id) ? (\n                    <div className="grid w-full gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_auto] sm:items-end">\n                      <div>\n                        <Label className="text-xs">Novo valor da despesa</Label>\n                        <Input\n                          value={expenseEditAmount}\n                          onChange={(e) => setExpenseEditAmount(e.target.value)}\n                          placeholder="0,00"\n                        />\n                      </div>\n                      <div className="flex gap-2">\n                        <Button\n                          size="sm"\n                          disabled={busy === `edit-expense-${row.expense_id}`}\n                          onClick={() =>\n                            run(\n                              `edit-expense-${row.expense_id}`,\n                              async () => {\n                                const value = parseMoney(expenseEditAmount);\n                                if (!Number.isFinite(value) || value <= 0)\n                                  throw new Error("Informe um valor maior que zero.");\n                                const result = await db.rpc("update_financial_expense_amount", {\n                                  _expense_id: row.expense_id,\n                                  _amount: value,\n                                });\n                                if (result.error) throw result.error;\n                                resetExpenseEditor();\n                              },\n                              "Valor da despesa atualizado.",\n                            )\n                          }\n                        >\n                          Salvar\n                        </Button>\n                        <Button size="sm" variant="outline" onClick={resetExpenseEditor}>\n                          Cancelar\n                        </Button>\n                      </div>\n                    </div>\n                  ) : null}\n                </div>'''
if old not in finance:
    raise SystemExit('expense list anchor not found')
finance = finance.replace(old, new, 1)
finance_path.write_text(finance)
