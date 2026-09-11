from pathlib import Path

path = Path("src/components/finance-attendance-completion.tsx")
text = path.read_text()
text = text.replace(
    'disabled={!selected || busy || !selectedReady}',
    'disabled={!selected || busy}',
    1,
)
text = text.replace(
    '{busy ? "Finalizando..." : "Finalizar e enviar ao financeiro"}',
    '{busy ? "Registrando..." : "Registrar pagamento no financeiro"}',
    1,
)
path.write_text(text)
