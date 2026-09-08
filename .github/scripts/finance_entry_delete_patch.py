from pathlib import Path

path = Path('src/components/finance-staging-workspace.tsx')
text = path.read_text()

anchor = '''  if (!rows.length)\n    return <p className="text-sm text-muted-foreground">Nenhum lançamento no período.</p>;'''
insert = '''  const deleteEntry = async (row: any) => {
    const entryId = String(row.entry_id ?? row.id ?? "");
    if (!entryId) {
      toast.error("Entrada financeira não identificada.");
      return;
    }
    const label = row.patient_name_snapshot || row.service_name_snapshot || "esta entrada";
    if (!window.confirm(`Excluir ${label}? Esta ação remove a entrada do financeiro e não pode ser desfeita.`)) return;

    setBusy(`delete-${entryId}`);
    try {
      const result = await db.rpc("delete_financial_entry", { _entry_id: entryId });
      if (result.error) throw result.error;
      toast.success("Entrada excluída.");
      if (editingId === entryId) cancelEdit();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance-full-v2"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-completion-report"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-completion-lookups"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-commission-payments-grouped"] }),
        queryClient.invalidateQueries({ queryKey: ["professional-own-commissions"] }),
      ]);
    } catch (error: any) {
      toast.error("Não foi possível excluir a entrada.", {
        description: error?.message || "Tente novamente.",
      });
    } finally {
      setBusy("");
    }
  };

  if (!rows.length)
    return <p className="text-sm text-muted-foreground">Nenhum lançamento no período.</p>;'''
if anchor not in text:
    raise SystemExit('EntryList empty-state anchor not found')
text = text.replace(anchor, insert, 1)

old = '''              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                  Editar valor
                </Button>
              </div>'''
new = '''              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy === `delete-${entryId}`} onClick={() => startEdit(row)}>
                  Editar valor
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={busy === `delete-${entryId}`}
                  onClick={() => deleteEntry(row)}
                >
                  Excluir
                </Button>
              </div>'''
if old not in text:
    raise SystemExit('Entry action anchor not found')
text = text.replace(old, new, 1)

path.write_text(text)
