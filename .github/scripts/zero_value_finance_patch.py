from pathlib import Path

path = Path("src/components/finance-attendance-completion.tsx")
text = path.read_text()

replacements = [
    (
        '    if (received === "yes" && !method) {\n      toast.error("Selecione a forma de pagamento.");\n      return;\n    }',
        '    if (received === "yes" && parsedAmount > 0 && !method) {\n      toast.error("Selecione a forma de pagamento.");\n      return;\n    }',
        "payment method validation",
    ),
    (
        '      _payment_method_code: received === "yes" ? method : null,',
        '      _payment_method_code: received === "yes" && parsedAmount > 0 ? method : null,',
        "rpc payment method",
    ),
    (
        '''              <Input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="600,00"
              />''',
        '''              <Input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="600,00"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Pode usar 0,00 quando a cliente já tiver pago anteriormente. Nesse caso não é criada uma nova entrada no caixa.
              </p>''',
        "zero value helper",
    ),
]

for old, new, label in replacements:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    text = text.replace(old, new, 1)

path.write_text(text)
print("zero-value finance UI patch applied")
