from pathlib import Path

# Add a clear shortcut in the standard attendance-payment card.
path = Path('src/components/finance-attendance-completion.tsx')
text = path.read_text()
old = '''          <Button disabled={!selected || busy || !selectedReady} onClick={() => void finalize()}>
            <ReceiptText className="mr-2 size-4" />{" "}
            {busy ? "Finalizando..." : "Finalizar e enviar ao financeiro"}
          </Button>'''
new = '''          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!selected}
              onClick={() => document.getElementById("finance-split-payment")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              Dividir em 2 ou mais formas
            </Button>
            <Button disabled={!selected || busy || !selectedReady} onClick={() => void finalize()}>
              <ReceiptText className="mr-2 size-4" />{" "}
              {busy ? "Finalizando..." : "Finalizar e enviar ao financeiro"}
            </Button>
          </div>'''
if old not in text:
    raise SystemExit('attendance completion action anchor not found')
text = text.replace(old, new, 1)
path.write_text(text)

# Make the split-payment block easy to jump to and clearer for reception.
path = Path('src/components/finance-mixed-payment.tsx')
text = path.read_text()
old = '<section className="finance-mixed-payment hidden mx-auto w-full max-w-[1540px] px-5 pt-3 sm:px-8 lg:px-10">'
new = '<section id="finance-split-payment" className="finance-mixed-payment hidden mx-auto w-full max-w-[1540px] scroll-mt-36 px-5 pt-3 sm:px-8 lg:px-10">'
if old not in text:
    raise SystemExit('mixed payment section anchor not found')
text = text.replace(old, new, 1)
text = text.replace('Finalizar com pagamento misto', 'Pagamento dividido', 1)
text = text.replace('Divida o mesmo atendimento entre Pix, dinheiro, cartão ou outras formas. A taxa é calculada apenas sobre cada parte.', 'Use duas ou mais formas no mesmo atendimento — por exemplo, R$ 100 em dinheiro + R$ 50 no Pix. A taxa é calculada apenas sobre cada parte.', 1)
path.write_text(text)
