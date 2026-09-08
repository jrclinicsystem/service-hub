from pathlib import Path

path = Path('src/components/finance-staging-workspace.tsx')
text = path.read_text()
old = '''function EntryList({ rows }: { rows: any[] }) {
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">Nenhum lançamento no período.</p>;
  return (
    <div className="space-y-2">
      {rows.map((row: any) => (
        <div
          key={row.entry_id ?? row.id}
          className="grid gap-3 rounded-2xl border border-border p-4 lg:grid-cols-[1.6fr_1fr_1fr_auto] lg:items-center"
        >
          <div>
            <p className="text-sm font-semibold">{row.patient_name_snapshot || "Atendimento"}</p>
            <p className="text-xs text-muted-foreground">
              {row.service_name_snapshot || "Serviço"} ·{" "}
              {row.professional_name_snapshot || "Profissional"}
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {row.payment_method_name || "Pagamento"}
            <br />
            {formatDate(row.business_date || row.occurred_at)}
          </div>
          <div className="text-xs">
            <span className="text-muted-foreground">Bruto:</span> {money(row.charged_amount)}
            <br />
            <span className="text-muted-foreground">Líquido:</span> {money(row.net_amount)}
          </div>
          <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
        </div>
      ))}
    </div>
  );
}'''
new = '''function EntryList({ rows }: { rows: any[] }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState("");

  const startEdit = (row: any) => {
    setEditingId(String(row.entry_id ?? row.id));
    setAmount(String(row.charged_amount ?? ""));
  };

  const cancelEdit = () => {
    setEditingId("");
    setAmount("");
  };

  const saveAmount = async (row: any) => {
    const entryId = String(row.entry_id ?? row.id ?? "");
    const value = parseMoney(amount);
    if (!entryId) {
      toast.error("Entrada financeira não identificada.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (!window.confirm(`Alterar o valor desta entrada para ${money(value)}? Taxas e comissão vinculada serão recalculadas quando aplicável.`)) return;

    setBusy(entryId);
    try {
      const result = await db.rpc("update_financial_entry_amount", {
        _entry_id: entryId,
        _amount: value,
      });
      if (result.error) throw result.error;
      toast.success("Valor da entrada atualizado.");
      cancelEdit();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance-full-v2"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-completion-report"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-completion-lookups"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-commission-payments-grouped"] }),
        queryClient.invalidateQueries({ queryKey: ["professional-own-commissions"] }),
      ]);
    } catch (error: any) {
      toast.error("Não foi possível editar a entrada.", {
        description: error?.message || "Tente novamente.",
      });
    } finally {
      setBusy("");
    }
  };

  if (!rows.length)
    return <p className="text-sm text-muted-foreground">Nenhum lançamento no período.</p>;
  return (
    <div className="space-y-2">
      {rows.map((row: any) => {
        const entryId = String(row.entry_id ?? row.id ?? "");
        const editing = editingId === entryId;
        return (
          <div
            key={entryId}
            className="grid gap-3 rounded-2xl border border-border p-4 lg:grid-cols-[1.6fr_1fr_1fr_auto] lg:items-center"
          >
            <div>
              <p className="text-sm font-semibold">{row.patient_name_snapshot || "Atendimento"}</p>
              <p className="text-xs text-muted-foreground">
                {row.service_name_snapshot || "Serviço"} ·{" "}
                {row.professional_name_snapshot || "Profissional"}
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              {row.payment_method_name || "Pagamento"}
              <br />
              {formatDate(row.business_date || row.occurred_at)}
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Bruto:</span> {money(row.charged_amount)}
              <br />
              <span className="text-muted-foreground">Líquido:</span> {money(row.net_amount)}
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                  Editar valor
                </Button>
              </div>
            </div>
            <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
            {editing ? (
              <div className="grid gap-3 border-t border-border pt-3 lg:col-span-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <Label className="text-xs">Novo valor bruto da entrada</Label>
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Ao salvar, o sistema recalcula a taxa da forma de pagamento, o valor líquido e a comissão vinculada quando houver.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy === entryId} onClick={() => saveAmount(row)}>
                    Salvar
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === entryId} onClick={cancelEdit}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}'''
if old not in text:
    raise SystemExit('EntryList anchor not found')
text = text.replace(old, new, 1)
path.write_text(text)
