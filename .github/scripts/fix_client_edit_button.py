from pathlib import Path

path = Path('src/routes/admin_.clientes.tsx')
text = path.read_text()

replacements = [
    (
        'import { useMemo, useState } from "react";',
        'import { useMemo, useRef, useState } from "react";',
        'react import',
    ),
    (
        '  const [saving, setSaving] = useState(false);\n',
        '  const [saving, setSaving] = useState(false);\n  const formRef = useRef<HTMLElement | null>(null);\n',
        'form ref',
    ),
    (
        '    window.scrollTo({ top: 0, behavior: "smooth" });',
        '    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));',
        'edit scroll',
    ),
    (
        '''      const payload = {\n        name: name.trim(),\n        whatsapp: whatsapp.trim(),\n        birth_date: birthDate,\n        birthday_benefit_type: benefitType,\n        birthday_discount_percent: benefitType === "percent" ? Number(discount) : null,\n        birthday_custom_benefit: benefitType === "custom" ? customBenefit.trim() : null,\n        is_active: active,\n        created_by: authData.user?.id ?? null,\n      };\n\n      const result = editingId\n        ? await db.from("clients").update({ ...payload, created_by: undefined }).eq("id", editingId)\n        : await db.from("clients").insert(payload);\n      if (result.error) throw result.error;''',
        '''      const payload = {\n        name: name.trim(),\n        whatsapp: whatsapp.trim(),\n        birth_date: birthDate,\n        birthday_benefit_type: benefitType,\n        birthday_discount_percent: benefitType === "percent" ? Number(discount) : null,\n        birthday_custom_benefit: benefitType === "custom" ? customBenefit.trim() : null,\n        is_active: active,\n      };\n\n      const result = editingId\n        ? await db.from("clients").update(payload).eq("id", editingId).select("id").single()\n        : await db.from("clients").insert({ ...payload, created_by: authData.user?.id ?? null }).select("id").single();\n      if (result.error) throw result.error;''',
        'safe update payload',
    ),
    (
        '<section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">\n          <div className="flex items-center gap-2"><Plus className="size-5 text-primary" /><h2 className="text-lg font-bold">{editingId ? "Editar cliente" : "Cadastrar cliente"}</h2></div>',
        '<section ref={formRef} className="mt-6 scroll-mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">\n          <div className="flex items-center gap-2">{editingId ? <Pencil className="size-5 text-primary" /> : <Plus className="size-5 text-primary" />}<h2 className="text-lg font-bold">{editingId ? "Editar cliente" : "Cadastrar cliente"}</h2></div>',
        'form section ref',
    ),
    (
        '<Button size="sm" variant="outline" onClick={() => editClient(client)}><Pencil className="size-4" /> Editar</Button>',
        '<Button type="button" size="sm" variant="outline" onClick={() => editClient(client)}><Pencil className="size-4" /> Editar</Button>',
        'edit button type',
    ),
]

for old, new, label in replacements:
    if old not in text:
        raise SystemExit(f'Expected block not found: {label}')
    text = text.replace(old, new, 1)

path.write_text(text)
print('client edit fix applied')
