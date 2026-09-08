from pathlib import Path

path = Path('src/components/finance-staging-workspace.tsx')
text = path.read_text()
old = '''                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === `edit-expense-${row.expense_id}`}
                        onClick={() => editExpenseAmount(row)}
                      >
                        Editar valor
                      </Button>
                    </div>'''
new = '''                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === `edit-expense-${row.expense_id}` || busy === `delete-expense-${row.expense_id}`}
                        onClick={() => editExpenseAmount(row)}
                      >
                        Editar valor
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        disabled={busy === `delete-expense-${row.expense_id}`}
                        onClick={() => {
                          if (!window.confirm(`Excluir a despesa "${row.description}" de ${money(row.amount)}? Esta ação remove a saída dos relatórios e do caixa vinculado.`)) return;
                          run(
                            `delete-expense-${row.expense_id}`,
                            async () => {
                              const result = await db.rpc("delete_financial_expense", {
                                _expense_id: row.expense_id,
                              });
                              if (result.error) throw result.error;
                              if (editingExpenseId === String(row.expense_id)) resetExpenseEditor();
                            },
                            "Despesa excluída.",
                          );
                        }}
                      >
                        Excluir
                      </Button>
                    </div>'''
if old not in text:
    raise SystemExit('expense action anchor not found')
text = text.replace(old, new, 1)
path.write_text(text)
