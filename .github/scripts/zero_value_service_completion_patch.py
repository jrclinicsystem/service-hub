from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)


# Agenda/admin: zero-value services can be closed directly; keep the success copy accurate.
path = Path("src/components/admin-appointments-workspace.tsx")
text = path.read_text()
text = replace_once(
    text,
    'toast.success("Atendimento concluído.", { description: "O valor agora foi contabilizado na receita." });',
    'toast.success("Atendimento concluído.", { description: "Serviço de R$ 0,00 finalizado sem gerar nova receita ou movimentação de caixa." });',
    "zero-value admin completion toast",
)
path.write_text(text)


# Finance completion: normalize R$ 0,00 as already paid / no new financial movement.
path = Path("src/components/finance-attendance-completion.tsx")
text = path.read_text()

text = replace_once(
    text,
    '''    const parsedCommission = parseMoney(manualCommission);\n    const parsedInstallments = Number(installments);''',
    '''    const parsedCommission = parseMoney(manualCommission);\n    const parsedInstallments = Number(installments);\n    const isZeroAmount = parsedAmount === 0;''',
    "zero amount flag",
)

text = replace_once(
    text,
    '''    if (received === "no" && !dueDate) {\n      toast.error("Informe o vencimento do valor a receber.");\n      return;\n    }''',
    '''    if (!isZeroAmount && received === "no" && !dueDate) {\n      toast.error("Informe o vencimento do valor a receber.");\n      return;\n    }\n    if (isZeroAmount && parsedCommission !== null && parsedCommission !== 0) {\n      toast.error("Atendimento de R$ 0,00 não pode gerar comissão manual.");\n      return;\n    }''',
    "zero amount validation",
)

text = replace_once(
    text,
    '''      _payment_received: received === "yes",\n      _payment_method_code: received === "yes" && parsedAmount > 0 ? method : null,''',
    '''      _payment_received: isZeroAmount ? true : received === "yes",\n      _payment_method_code: !isZeroAmount && received === "yes" && parsedAmount > 0 ? method : null,''',
    "zero payment normalization",
)

text = replace_once(
    text,
    '''      _receivable_due_date: received === "no" ? dueDate : null,\n      _manual_commission_amount: parsedCommission,\n      _manual_commission_reason: parsedCommission === null ? null : manualReason.trim(),''',
    '''      _receivable_due_date: !isZeroAmount && received === "no" ? dueDate : null,\n      _manual_commission_amount: isZeroAmount ? null : parsedCommission,\n      _manual_commission_reason: isZeroAmount || parsedCommission === null ? null : manualReason.trim(),''',
    "zero receivable and commission normalization",
)

text = replace_once(
    text,
    '''    const hasPendingPackageSessions = selectedSessions.length > 1 && selectedSessions.some((item: any) => item.status !== "completed");\n    toast.success(hasPendingPackageSessions ? "Pagamento do pacote registrado." : "Atendimento finalizado e enviado ao financeiro.", {\n      description: hasPendingPackageSessions ? "As sessões pendentes continuam em andamento na Agenda." : undefined,\n    });''',
    '''    const hasPendingPackageSessions = selectedSessions.length > 1 && selectedSessions.some((item: any) => item.status !== "completed");\n    if (isZeroAmount) {\n      toast.success("Atendimento de R$ 0,00 finalizado.", {\n        description: "Nenhuma nova receita, comissão ou movimentação de caixa foi criada.",\n      });\n    } else {\n      toast.success(hasPendingPackageSessions ? "Pagamento do pacote registrado." : "Atendimento finalizado e enviado ao financeiro.", {\n        description: hasPendingPackageSessions ? "As sessões pendentes continuam em andamento na Agenda." : undefined,\n      });\n    }''',
    "zero success toast",
)

text = replace_once(
    text,
    '''              {received === "yes"\n                ? data.data?.openCash\n                  ? "O recebimento será lançado no caixa aberto e no financeiro."\n                  : "Abra o caixa antes de concluir um atendimento já recebido."\n                : "Será criada uma conta a receber; a taxa da forma de pagamento será calculada apenas quando o cliente pagar."}''',
    '''              {parseMoney(amount) === 0\n                ? "R$ 0,00 será finalizado sem gerar nova receita, comissão ou movimentação de caixa — mesmo com o caixa fechado."\n                : received === "yes"\n                  ? data.data?.openCash\n                    ? "O recebimento será lançado no caixa aberto e no financeiro."\n                    : "Abra o caixa antes de concluir um atendimento já recebido."\n                  : "Será criada uma conta a receber; a taxa da forma de pagamento será calculada apenas quando o cliente pagar."}''',
    "zero footer explanation",
)

text = replace_once(
    text,
    '''              {busy ? "Registrando..." : "Registrar pagamento no financeiro"}''',
    '''              {busy ? "Registrando..." : parseMoney(amount) === 0 ? "Finalizar atendimento R$ 0,00" : "Registrar pagamento no financeiro"}''',
    "zero button label",
)

path.write_text(text)
