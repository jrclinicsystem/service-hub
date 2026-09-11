from pathlib import Path
import re

path = Path('src/components/finance-staging-workspace.tsx')
text = path.read_text()

# Textarea for purchase description.
anchor = 'import { Label } from "@/components/ui/label";\n'
if 'import { Textarea } from "@/components/ui/textarea";' not in text:
    if anchor not in text:
        raise SystemExit('Label import anchor not found')
    text = text.replace(anchor, anchor + 'import { Textarea } from "@/components/ui/textarea";\n', 1)

# Load private attachment metadata alongside payables.
old = '''    db
      .from("accounts_payable_with_status")
      .select("*")
      .order("due_date", { ascending: true })
      .limit(200),
    db
      .from("accounts_receivable_with_status")'''
new = '''    db
      .from("accounts_payable_with_status")
      .select("*")
      .order("due_date", { ascending: true })
      .limit(200),
    db
      .from("account_payable_attachments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    db
      .from("accounts_receivable_with_status")'''
if old not in text:
    raise SystemExit('payables query anchor not found')
text = text.replace(old, new, 1)

old = '''    payables,
    receivables,'''
new = '''    payables,
    payableAttachments,
    receivables,'''
if old not in text:
    raise SystemExit('payables destructure anchor not found')
text = text.replace(old, new, 1)

old = '''    payables: payables.data ?? [],
    receivables: receivables.data ?? [],'''
new = '''    payables: payables.data ?? [],
    payableAttachments: payableAttachments.data ?? [],
    receivables: receivables.data ?? [],'''
if old not in text:
    raise SystemExit('payables return anchor not found')
text = text.replace(old, new, 1)

# Rich payable creation state: single, installments, fixed recurrence, details and files.
old = '''  const [payable, setPayable] = useState({
    title: "",
    supplier: "",
    amount: "",
    due: fortalezaIso(),
    recurrence: "none",
    category: "",
    center: "",
  });'''
new = '''  const [payable, setPayable] = useState({
    title: "",
    supplier: "",
    amount: "",
    due: fortalezaIso(),
    type: "single",
    duration: "indefinite",
    count: "12",
    category: "",
    center: "",
    description: "",
  });
  const [payableFiles, setPayableFiles] = useState<File[]>([]);
  const [payableFileKey, setPayableFileKey] = useState(0);'''
if old not in text:
    raise SystemExit('payable state anchor not found')
text = text.replace(old, new, 1)

old = '  const [payableEdit, setPayableEdit] = useState({ amount: "", due: "" });'
new = '  const [payableEdit, setPayableEdit] = useState({ amount: "", due: "", description: "" });'
if old not in text:
    raise SystemExit('payable edit state anchor not found')
text = text.replace(old, new, 1)

old = '''    setPayableEdit({
      amount: String(currentPayable.amount ?? ""),
      due: currentPayable.due_date ?? "",
    });'''
new = '''    setPayableEdit({
      amount: String(currentPayable.amount ?? ""),
      due: currentPayable.due_date ?? "",
      description: currentPayable.description ?? "",
    });'''
if old not in text:
    raise SystemExit('editPendingPayable anchor not found')
text = text.replace(old, new, 1)

old = '    setPayableEdit({ amount: "", due: "" });'
new = '    setPayableEdit({ amount: "", due: "", description: "" });'
if old not in text:
    raise SystemExit('resetPayableEditor anchor not found')
text = text.replace(old, new, 1)

# Attachment and series helpers.
helper_anchor = '''  const resetExpenseEditor = () => {
    setEditingExpenseId("");
    setExpenseEditAmount("");
  };

  if (loading)'''
helper_replacement = '''  const resetExpenseEditor = () => {
    setEditingExpenseId("");
    setExpenseEditAmount("");
  };

  const payableSeriesLabel = (row: any) => {
    if (row.series_kind === "installment")
      return `Parcela ${row.occurrence_number}/${row.occurrence_count}`;
    if (row.series_kind === "recurring" && row.occurrence_count)
      return `Ocorrência ${row.occurrence_number}/${row.occurrence_count}`;
    if (row.series_kind === "recurring")
      return `Recorrência sem prazo · ocorrência ${row.occurrence_number}`;
    return "";
  };

  const payableAttachmentsFor = (row: any) =>
    (data?.payableAttachments ?? []).filter((attachment: any) => attachment.series_id === row.series_id);

  const openPayableAttachment = async (attachment: any) => {
    const result = await supabase.storage
      .from("finance-payable-attachments")
      .createSignedUrl(attachment.file_path, 120);
    if (result.error || !result.data?.signedUrl) {
      toast.error("Não foi possível abrir o comprovante.", { description: result.error?.message });
      return;
    }
    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const deletePayableAttachment = async (attachment: any) => {
    if (!window.confirm(`Excluir o comprovante "${attachment.original_name}"?`)) return;
    try {
      const storageResult = await supabase.storage
        .from("finance-payable-attachments")
        .remove([attachment.file_path]);
      if (storageResult.error) throw storageResult.error;
      const metadataResult = await db
        .from("account_payable_attachments")
        .delete()
        .eq("id", attachment.id);
      if (metadataResult.error) throw metadataResult.error;
      toast.success("Comprovante excluído.");
      await refresh();
    } catch (error: any) {
      toast.error("Não foi possível excluir o comprovante.", { description: error?.message });
    }
  };

  const uploadPayableFiles = async (seriesId: string, files: File[]) => {
    const acceptedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    for (const file of files) {
      if (!acceptedTypes.has(file.type)) {
        toast.error(`Arquivo não suportado: ${file.name}`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`Arquivo maior que 10 MB: ${file.name}`);
        continue;
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const filePath = `${access.user.id}/${seriesId}/${crypto.randomUUID()}-${safeName}`;
      const upload = await supabase.storage
        .from("finance-payable-attachments")
        .upload(filePath, file, { contentType: file.type, upsert: false });
      if (upload.error) {
        toast.error(`Falha ao enviar ${file.name}.`, { description: upload.error.message });
        continue;
      }
      const metadata = await db.from("account_payable_attachments").insert({
        series_id: seriesId,
        file_path: filePath,
        original_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        uploaded_by: access.user.id,
      });
      if (metadata.error) {
        await supabase.storage.from("finance-payable-attachments").remove([filePath]);
        toast.error(`Falha ao registrar ${file.name}.`, { description: metadata.error.message });
      }
    }
  };

  if (loading)'''
if helper_anchor not in text:
    raise SystemExit('helper insertion anchor not found')
text = text.replace(helper_anchor, helper_replacement, 1)

# Replace the old payable form with plan-aware creation UI.
pattern = re.compile(r'''          <Panel title="Cadastrar conta a pagar">.*?          </Panel>\n          <div className="grid gap-5 xl:grid-cols-2">''', re.S)
match = pattern.search(text)
if not match:
    raise SystemExit('payable form panel not found')
new_panel = '''          <Panel
            title="Cadastrar conta a pagar"
            subtitle="Cadastre uma conta avulsa, uma compra parcelada ou uma recorrência fixa com ou sem prazo."
          >
            <div className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <Label>Conta / título</Label>
                <Input
                  placeholder="Ex.: Cadeira para recepção"
                  value={payable.title}
                  onChange={(e) => setPayable({ ...payable, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Fornecedor</Label>
                <Input
                  placeholder="Opcional"
                  value={payable.supplier}
                  onChange={(e) => setPayable({ ...payable, supplier: e.target.value })}
                />
              </div>
              <div>
                <Label>{payable.type === "installment" ? "Valor total da compra" : "Valor"}</Label>
                <Input
                  placeholder="0,00"
                  value={payable.amount}
                  onChange={(e) => setPayable({ ...payable, amount: e.target.value })}
                />
              </div>
              <div>
                <Label>{payable.type === "installment" ? "Vencimento da 1ª parcela" : "Primeiro vencimento"}</Label>
                <Input
                  type="date"
                  value={payable.due}
                  onChange={(e) => setPayable({ ...payable, due: e.target.value })}
                />
              </div>
              <div>
                <Label>Tipo da conta</Label>
                <select
                  className={selectClass}
                  value={payable.type}
                  onChange={(e) => setPayable({ ...payable, type: e.target.value })}
                >
                  <option value="single">Única / avulsa</option>
                  <option value="installment">Compra parcelada</option>
                  <option value="monthly">Fixa mensal</option>
                  <option value="weekly">Fixa semanal</option>
                  <option value="yearly">Fixa anual</option>
                </select>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Descrição / o que foi comprado</Label>
                <Textarea
                  className="min-h-24"
                  placeholder="Ex.: 2 cadeiras, 1 mesa auxiliar e frete."
                  value={payable.description}
                  onChange={(e) => setPayable({ ...payable, description: e.target.value })}
                />
              </div>

              {payable.type === "installment" ? (
                <div>
                  <Label>Número de parcelas</Label>
                  <Input
                    type="number"
                    min="2"
                    max="60"
                    value={payable.count}
                    onChange={(e) => setPayable({ ...payable, count: e.target.value })}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Todas as parcelas serão criadas agora e já aparecerão nos meses seguintes.
                  </p>
                </div>
              ) : null}

              {["monthly", "weekly", "yearly"].includes(payable.type) ? (
                <>
                  <div>
                    <Label>Duração da recorrência</Label>
                    <select
                      className={selectClass}
                      value={payable.duration}
                      onChange={(e) => setPayable({ ...payable, duration: e.target.value })}
                    >
                      <option value="indefinite">Sem prazo</option>
                      <option value="defined">Quantidade definida</option>
                    </select>
                  </div>
                  {payable.duration === "defined" ? (
                    <div>
                      <Label>Número de ocorrências</Label>
                      <Input
                        type="number"
                        min="1"
                        max="120"
                        value={payable.count}
                        onChange={(e) => setPayable({ ...payable, count: e.target.value })}
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Ex.: mensal com 12 ocorrências = 12 meses já programados.
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            {["monthly", "weekly", "yearly"].includes(payable.type) && payable.duration === "indefinite" ? (
              <div className="mt-3 rounded-2xl border border-primary/15 bg-primary-soft/40 px-4 py-3 text-xs text-muted-foreground">
                <strong className="text-foreground">Recorrência sem prazo:</strong>{" "}
                {payable.type === "monthly" ? "Fixa mensal" : payable.type === "weekly" ? "Fixa semanal" : "Fixa anual"} continua gerando a próxima conta até você encerrar. <strong>Fixa mensal não significa 12 meses.</strong>
              </div>
            ) : null}

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <select
                className={selectClass}
                value={payable.category}
                onChange={(e) => setPayable({ ...payable, category: e.target.value })}
              >
                <option value="">Sem categoria</option>
                {(data.categories ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                className={selectClass}
                value={payable.center}
                onChange={(e) => setPayable({ ...payable, center: e.target.value })}
              >
                <option value="">Sem centro</option>
                {(data.centers ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="mt-3 rounded-2xl border border-dashed border-border p-4">
              <Label>Comprovantes / anexos</Label>
              <Input
                key={payableFileKey}
                className="mt-2"
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setPayableFiles(Array.from(e.target.files ?? []))}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                PDF ou imagem (JPG, PNG, WEBP), até 10 MB por arquivo. O comprovante fica privado e, em séries, aparece em todas as parcelas/ocorrências.
              </p>
              {payableFiles.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {payableFiles.map((file) => (
                    <Badge key={`${file.name}-${file.size}`} variant="outline">{file.name}</Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                disabled={busy === "payable"}
                onClick={() =>
                  run(
                    "payable",
                    async () => {
                      const amount = parseMoney(payable.amount);
                      if (!payable.title.trim() || !Number.isFinite(amount) || amount <= 0)
                        throw new Error("Título e valor são obrigatórios.");
                      if (!payable.due) throw new Error("Informe o primeiro vencimento.");

                      let occurrenceCount: number | null = null;
                      if (payable.type === "installment") {
                        occurrenceCount = Number(payable.count);
                        if (!Number.isInteger(occurrenceCount) || occurrenceCount < 2 || occurrenceCount > 60)
                          throw new Error("Informe entre 2 e 60 parcelas.");
                      } else if (["monthly", "weekly", "yearly"].includes(payable.type) && payable.duration === "defined") {
                        occurrenceCount = Number(payable.count);
                        if (!Number.isInteger(occurrenceCount) || occurrenceCount < 1 || occurrenceCount > 120)
                          throw new Error("Informe entre 1 e 120 ocorrências.");
                      }

                      const result = await db.rpc("create_account_payable_plan", {
                        _title: payable.title.trim(),
                        _supplier: payable.supplier.trim() || null,
                        _amount: amount,
                        _first_due_date: payable.due,
                        _plan_type: payable.type,
                        _occurrence_count: occurrenceCount,
                        _description: payable.description.trim() || null,
                        _category_id: payable.category || null,
                        _cost_center_id: payable.center || null,
                      });
                      if (result.error) throw result.error;

                      const createdRows = Array.isArray(result.data) ? result.data : [];
                      const seriesId = createdRows[0]?.series_id;
                      if (seriesId && payableFiles.length) {
                        await uploadPayableFiles(seriesId, payableFiles);
                      }

                      setPayable({
                        title: "",
                        supplier: "",
                        amount: "",
                        due: fortalezaIso(),
                        type: "single",
                        duration: "indefinite",
                        count: "12",
                        category: "",
                        center: "",
                        description: "",
                      });
                      setPayableFiles([]);
                      setPayableFileKey((current) => current + 1);
                    },
                    payable.type === "installment" ? "Compra parcelada cadastrada." : "Conta cadastrada.",
                  )
                }
              >
                {busy === "payable" ? "Cadastrando..." : "Cadastrar conta"}
              </Button>
            </div>
          </Panel>
          <div className="grid gap-5 xl:grid-cols-2">'''
text = text[:match.start()] + new_panel + text[match.end():]

# Rich payable card identity/details/attachments.
old = '''                    <div>
                      <strong className="text-sm">{row.title}</strong>
                      <p className="text-xs text-muted-foreground">
                        Vence {formatDate(row.due_date)}
                      </p>
                    </div>'''
new = '''                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm">{row.title}</strong>
                        {payableSeriesLabel(row) ? <Badge variant="outline">{payableSeriesLabel(row)}</Badge> : null}
                      </div>
                      {row.supplier ? <p className="mt-1 text-xs text-muted-foreground">Fornecedor: {row.supplier}</p> : null}
                      {row.description ? <p className="mt-1 max-w-xl whitespace-pre-wrap text-xs text-foreground/75">{row.description}</p> : null}
                      <p className="mt-1 text-xs text-muted-foreground">Vence {formatDate(row.due_date)}</p>
                      {row.series_kind === "installment" && row.purchase_total_amount ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">Compra total: {money(row.purchase_total_amount)}</p>
                      ) : null}
                      {payableAttachmentsFor(row).length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {payableAttachmentsFor(row).map((attachment: any) => (
                            <div key={attachment.id} className="flex items-center rounded-lg border border-border bg-muted/30">
                              <button
                                type="button"
                                className="max-w-[220px] truncate px-2.5 py-1.5 text-[11px] font-medium text-primary hover:underline"
                                onClick={() => void openPayableAttachment(attachment)}
                                title={attachment.original_name}
                              >
                                📎 {attachment.original_name}
                              </button>
                              <button
                                type="button"
                                className="border-l border-border px-2 py-1.5 text-[11px] text-destructive"
                                onClick={() => void deletePayableAttachment(attachment)}
                                title="Excluir comprovante"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>'''
if old not in text:
    raise SystemExit('payable card info anchor not found')
text = text.replace(old, new, 1)

# Replace payable edit form so description is editable too.
pattern = re.compile(r'''                    \{editingPayableId === String\(row\.id\) \? \(\n                      <div className="grid w-full gap-3 border-t border-border pt-3 sm:grid-cols-\[1fr_1fr_auto\] sm:items-end">.*?                    \) : null\}''', re.S)
match = pattern.search(text)
if not match:
    raise SystemExit('payable edit block not found')
edit_block = '''                    {editingPayableId === String(row.id) ? (
                      <div className="grid w-full gap-3 border-t border-border pt-3 sm:grid-cols-2 sm:items-end">
                        <div>
                          <Label className="text-xs">Valor desta parcela / ocorrência</Label>
                          <Input
                            value={payableEdit.amount}
                            onChange={(e) => setPayableEdit({ ...payableEdit, amount: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Vencimento</Label>
                          <Input
                            type="date"
                            value={payableEdit.due}
                            onChange={(e) => setPayableEdit({ ...payableEdit, due: e.target.value })}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-xs">Descrição / o que foi comprado</Label>
                          <Textarea
                            className="min-h-20"
                            value={payableEdit.description}
                            onChange={(e) => setPayableEdit({ ...payableEdit, description: e.target.value })}
                          />
                        </div>
                        <div className="flex gap-2 sm:col-span-2 sm:justify-end">
                          <Button
                            size="sm"
                            disabled={busy === `edit-payable-${row.id}`}
                            onClick={() =>
                              run(
                                `edit-payable-${row.id}`,
                                async () => {
                                  const value = parseMoney(payableEdit.amount);
                                  if (!Number.isFinite(value) || value <= 0)
                                    throw new Error("Informe um valor maior que zero.");
                                  if (!payableEdit.due)
                                    throw new Error("Informe a data de vencimento.");
                                  const result = await db.rpc("update_pending_account_payable", {
                                    _account_id: row.id,
                                    _amount: value,
                                    _due_date: payableEdit.due,
                                    _description: payableEdit.description.trim() || null,
                                  });
                                  if (result.error) throw result.error;
                                  resetPayableEditor();
                                },
                                "Conta atualizada.",
                              )
                            }
                          >
                            Salvar
                          </Button>
                          <Button size="sm" variant="outline" onClick={resetPayableEditor}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : null}'''
text = text[:match.start()] + edit_block + text[match.end():]

path.write_text(text)
