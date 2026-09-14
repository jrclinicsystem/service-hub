from pathlib import Path

path = Path('src/components/finance-staging-workspace.tsx')
text = path.read_text()

if 'Paperclip,' not in text:
    anchor = '  Printer,\n  ReceiptText,'
    replacement = '  Printer,\n  Paperclip,\n  ReceiptText,'
    if anchor not in text:
        raise SystemExit('icon import anchor not found')
    text = text.replace(anchor, replacement, 1)

old = '''            <div className="mt-3 rounded-2xl border border-dashed border-border p-4">
              <Label>Comprovantes / anexos</Label>
              <Input
                key={expenseFileKey}
                className="mt-2"
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setExpenseFiles(Array.from(e.target.files ?? []))}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                PDF ou imagem (JPG, PNG, WEBP), até 10 MB por arquivo. Opcional.
              </p>
              {expenseFiles.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {expenseFiles.map((file) => (
                    <Badge key={`${file.name}-${file.size}`} variant="outline">📎 {file.name}</Badge>
                  ))}
                </div>
              ) : null}
            </div>'''

new = '''            <div className="mt-3 rounded-2xl border border-dashed border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Paperclip className="size-4" />
                </span>
                <div>
                  <Label>Comprovantes / anexos</Label>
                  <p className="text-[11px] text-muted-foreground">Opcional</p>
                </div>
              </div>

              <Input
                key={expenseFileKey}
                id="expense-attachments-input"
                className="sr-only"
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setExpenseFiles(Array.from(e.target.files ?? []))}
              />

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label
                  htmlFor="expense-attachments-input"
                  className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-input bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Paperclip className="size-4" />
                  Escolher arquivos
                </label>
                <span className="text-sm text-muted-foreground">
                  {expenseFiles.length === 0
                    ? "Nenhum arquivo selecionado"
                    : expenseFiles.length === 1
                      ? "1 arquivo selecionado"
                      : `${expenseFiles.length} arquivos selecionados`}
                </span>
              </div>

              {expenseFiles.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {expenseFiles.map((file) => (
                    <Badge
                      key={`${file.name}-${file.size}`}
                      variant="outline"
                      className="max-w-full gap-1.5 bg-background px-3 py-1.5 font-normal"
                      title={file.name}
                    >
                      <Paperclip className="size-3.5 shrink-0" />
                      <span className="max-w-[240px] truncate">{file.name}</span>
                    </Badge>
                  ))}
                </div>
              ) : null}

              <p className="mt-3 text-[11px] text-muted-foreground">
                PDF ou imagem (JPG, PNG, WEBP), até 10 MB por arquivo.
              </p>
            </div>'''

if old not in text:
    if 'id="expense-attachments-input"' in text:
        raise SystemExit('picker already patched')
    raise SystemExit('expense attachment picker anchor not found')

text = text.replace(old, new, 1)
path.write_text(text)
