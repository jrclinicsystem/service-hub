from pathlib import Path

path = Path("src/components/finance-staging-workspace.tsx")
text = path.read_text(encoding="utf-8")

replacements = [
    (
        '  if (!rule || rule.commission_type === "manual" || entryDate >= rule.effective_from) return null;\n',
        '  if (!rule || rule.commission_type === "manual") return null;\n',
    ),
    (
        '  return { rule, amount, ruleLabel, net };\n',
        '  return { rule, amount, ruleLabel, net, isHistorical: entryDate < rule.effective_from };\n',
    ),
    (
        '            title="Comissões de agendamentos antigos"\n',
        '            title="Comissões zeradas e agendamentos antigos"\n',
    ),
    (
        '            subtitle="Atendimentos anteriores à ativação das regras financeiras. A comissão é calculada com a regra atual da profissional, sem alterar o faturamento original."\n',
        '            subtitle="Regularize atendimentos que ficaram com comissão zerada por falta de regra e também agendamentos antigos. A regra atual da profissional é aplicada sem alterar o faturamento original."\n',
    ),
    (
        '                Nenhum agendamento antigo aguardando geração de comissão.\n',
        '                Nenhuma comissão zerada aguardando regularização.\n',
    ),
    (
        '                          Líquido {money(preview.net)} · Regra atual: {preview.ruleLabel} · Comissão prevista {money(preview.amount)}\n',
        '                          {preview.isHistorical ? "Agendamento antigo" : "Comissão zerada"} · Líquido {money(preview.net)} · Regra atual: {preview.ruleLabel} · Comissão prevista {money(preview.amount)}\n',
    ),
    (
        '                            "Comissão do agendamento antigo gerada.",\n',
        '                            "Comissão recalculada com a regra atual.",\n',
    ),
    (
        '                        {busy === `historical-commission-${row.id}` ? "Gerando..." : "Gerar comissão"}\n',
        '                        {busy === `historical-commission-${row.id}` ? "Aplicando..." : "Aplicar regra atual"}\n',
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"Marker not found: {old[:120]!r}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
