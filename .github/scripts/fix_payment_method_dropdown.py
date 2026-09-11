from pathlib import Path

path = Path('src/components/finance-attendance-completion.tsx')
text = path.read_text()

old_import = 'import { Label } from "@/components/ui/label";\n'
new_import = '''import { Label } from "@/components/ui/label";\nimport {\n  Select,\n  SelectContent,\n  SelectItem,\n  SelectTrigger,\n  SelectValue,\n} from "@/components/ui/select";\n'''
if 'from "@/components/ui/select"' not in text:
    if old_import not in text:
        raise SystemExit('label import anchor not found')
    text = text.replace(old_import, new_import, 1)

old = '''            {received === "yes" ? (\n              <div>\n                <Label>Forma de pagamento</Label>\n                <select\n                  className={selectClass}\n                  value={method}\n                  onChange={(event) => setMethod(event.target.value)}\n                >\n                  {(data.data?.methods ?? []).map((row: any) => (\n                    <option key={row.id} value={row.code}>\n                      {row.name}\n                    </option>\n                  ))}\n                </select>\n              </div>\n            ) : ('''
new = '''            {received === "yes" ? (\n              <div>\n                <Label>Forma de pagamento</Label>\n                <Select value={method} onValueChange={setMethod}>\n                  <SelectTrigger className="h-10 w-full bg-background">\n                    <SelectValue placeholder="Selecione a forma de pagamento" />\n                  </SelectTrigger>\n                  <SelectContent position="popper" className="z-[120]">\n                    {(data.data?.methods ?? []).map((row: any) => (\n                      <SelectItem key={row.id} value={row.code}>\n                        {row.name}\n                      </SelectItem>\n                    ))}\n                  </SelectContent>\n                </Select>\n              </div>\n            ) : ('''
if old not in text:
    raise SystemExit('payment method select anchor not found')
text = text.replace(old, new, 1)
path.write_text(text)
