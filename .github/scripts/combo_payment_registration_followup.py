from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)


path = Path("src/components/client-profile-dialog.tsx")
text = path.read_text()

text = replace_once(
    text,
    '''  const [directAppointments, legacyAppointments, documents, budgets, services] = await Promise.all([\n    db.from("appointments").select(appointmentSelect).eq("client_id", clientId).order("scheduled_date", { ascending: false }).limit(100),\n    db.from("appointments").select(appointmentSelect).ilike("patient_name", client.name).order("scheduled_date", { ascending: false }).limit(100),\n    db.from("client_documents").select("id,client_id,category,file_name,storage_path,mime_type,size_bytes,notes,created_at").eq("client_id", clientId).order("created_at", { ascending: false }),\n    db.from("client_budgets").select("id,client_id,title,notes,status,total_amount,valid_until,is_paid,paid_amount,paid_at,payment_method_code,created_at,updated_at,client_budget_items(id,service_id,service_name_snapshot,unit_price,sessions,line_total,position,completed_session_numbers)").eq("client_id", clientId).order("created_at", { ascending: false }),\n    db.from("services").select("id,name,price,duration_min,summary,description,includes,session_count").eq("is_active", true).order("name"),\n  ]);\n  for (const result of [directAppointments, legacyAppointments, documents, budgets, services]) if (result.error) throw result.error;''',
    '''  const [directAppointments, legacyAppointments, documents, budgets, services, paymentMethods] = await Promise.all([\n    db.from("appointments").select(appointmentSelect).eq("client_id", clientId).order("scheduled_date", { ascending: false }).limit(100),\n    db.from("appointments").select(appointmentSelect).ilike("patient_name", client.name).order("scheduled_date", { ascending: false }).limit(100),\n    db.from("client_documents").select("id,client_id,category,file_name,storage_path,mime_type,size_bytes,notes,created_at").eq("client_id", clientId).order("created_at", { ascending: false }),\n    db.from("client_budgets").select("id,client_id,title,notes,status,total_amount,valid_until,is_paid,paid_amount,paid_at,payment_method_code,financial_entry_id,created_at,updated_at,client_budget_items(id,service_id,service_name_snapshot,unit_price,sessions,line_total,package_total,position,completed_session_numbers)").eq("client_id", clientId).order("created_at", { ascending: false }),\n    db.from("services").select("id,name,price,duration_min,summary,description,includes,session_count").eq("is_active", true).order("name"),\n    db.from("payment_methods").select("id,code,name,is_cash").eq("is_active", true).order("sort_order"),\n  ]);\n  for (const result of [directAppointments, legacyAppointments, documents, budgets, services, paymentMethods]) if (result.error) throw result.error;''',
    "workspace payment methods",
)

text = replace_once(
    text,
    '''    budgets: budgets.data ?? [],\n    services: services.data ?? [],\n  };''',
    '''    budgets: budgets.data ?? [],\n    services: services.data ?? [],\n    paymentMethods: paymentMethods.data ?? [],\n  };''',
    "return payment methods",
)

text = replace_once(
    text,
    '''  const [budgetSaving, setBudgetSaving] = useState(false);\n  const [budgetSessionSaving, setBudgetSessionSaving] = useState("");''',
    '''  const [budgetSaving, setBudgetSaving] = useState(false);\n  const [budgetPaymentSaving, setBudgetPaymentSaving] = useState("");\n  const [budgetPaymentMethods, setBudgetPaymentMethods] = useState<Record<string, string>>({});\n  const [budgetSessionSaving, setBudgetSessionSaving] = useState("");''',
    "payment state",
)

text = replace_once(
    text,
    '''          unit_price: (Number(String(row.unitPrice).replace(",", ".")) || 0) / Math.max(1, Number(row.sessions) || 1), sessions: Math.max(1, Number(row.sessions) || 1), position: index + 1,''',
    '''          unit_price: (Number(String(row.unitPrice).replace(",", ".")) || 0) / Math.max(1, Number(row.sessions) || 1), package_total: Number(String(row.unitPrice).replace(",", ".")) || 0, sessions: Math.max(1, Number(row.sessions) || 1), position: index + 1,''',
    "save exact package total",
)

old_paid_fn = '''  const setBudgetPaid = async (budget: any, paid: boolean) => {\n    if (paid && !window.confirm(`Marcar ${budget.title} como pago no valor de ${money(budget.total_amount)}? Isso apenas identifica o combo como já pago e não cria uma nova receita no caixa.`)) return undefined;\n    const result = await db.rpc("set_client_budget_paid", { _budget_id: budget.id, _paid: paid });\n    if (result.error) { toast.error("Não foi possível atualizar o pagamento do combo.", { description: result.error.message }); return undefined; }\n    toast.success(paid ? "Combo marcado como pago." : "Pagamento do combo reaberto.", { description: paid ? "Os próximos agendamentos vinculados a esse combo podem ser finalizados em R$ 0,00." : undefined });\n    await refresh();\n    return undefined;\n  };'''
new_paid_fn = '''  const recordBudgetPayment = async (budget: any) => {\n    const methods = query.data?.paymentMethods ?? [];\n    const methodCode = budgetPaymentMethods[budget.id] || methods[0]?.code || "";\n    const method = methods.find((item: any) => item.code === methodCode);\n    if (!methodCode) { toast.error("Cadastre ou selecione uma forma de pagamento."); return undefined; }\n    if (!window.confirm(`Registrar o pagamento integral de ${money(budget.total_amount)} do combo “${budget.title}” via ${method?.name ?? methodCode}? Esse valor será lançado uma única vez no financeiro${method?.is_cash ? " e no caixa aberto" : ""}.`)) return undefined;\n    setBudgetPaymentSaving(budget.id);\n    const result = await db.rpc("record_client_budget_payment", {\n      _budget_id: budget.id,\n      _payment_method_code: methodCode,\n      _installments: 1,\n      _occurred_at: new Date().toISOString(),\n    });\n    setBudgetPaymentSaving("");\n    if (result.error) { toast.error("Não foi possível registrar o pagamento do combo.", { description: result.error.message }); return undefined; }\n    const cashCreated = Boolean(result.data?.cash_movement_created);\n    toast.success("Pagamento do combo registrado.", { description: cashCreated ? "Receita registrada no financeiro e no caixa. As próximas visitas vinculadas a este combo ficam em R$ 0,00." : "Receita registrada no financeiro. As próximas visitas vinculadas a este combo ficam em R$ 0,00." });\n    await refresh();\n    await onUpdated?.();\n    return undefined;\n  };'''
text = replace_once(text, old_paid_fn, new_paid_fn, "record combo payment action")

text = replace_once(
    text,
    '''{item.sessions} sessão(ões) · valor do pacote {money(item.line_total)}''',
    '''{item.sessions} sessão(ões) · valor do pacote {money(item.package_total ?? item.line_total)}''',
    "exact package total display",
)

old_controls = '''                    <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant={budget.is_paid ? "outline" : "default"} onClick={() => void setBudgetPaid(budget, !budget.is_paid)}>{budget.is_paid ? "Desmarcar pago" : "Marcar como pago"}</Button><Button size="sm" variant="outline" onClick={() => void updateBudgetStatus(budget.id, "approved")}>Marcar aprovado</Button><Button size="sm" variant="outline" onClick={() => void updateBudgetStatus(budget.id, "declined")}>Marcar recusado</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => void removeBudget(budget.id)}><Trash2 className="size-4" /> Excluir</Button></div>'''
new_controls = '''                    <div className="mt-3 flex flex-wrap items-end gap-2">{!budget.is_paid ? <><div className="min-w-48"><Label className="text-[11px]">Forma de pagamento do combo</Label><Select value={budgetPaymentMethods[budget.id] || query.data?.paymentMethods?.[0]?.code || ""} onValueChange={(value) => setBudgetPaymentMethods((current) => ({ ...current, [budget.id]: value }))}><SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Forma de pagamento" /></SelectTrigger><SelectContent>{(query.data?.paymentMethods ?? []).map((method: any) => <SelectItem key={method.id} value={method.code}>{method.name}</SelectItem>)}</SelectContent></Select></div><Button size="sm" disabled={budgetPaymentSaving === budget.id} onClick={() => void recordBudgetPayment(budget)}>{budgetPaymentSaving === budget.id ? <Loader2 className="size-4 animate-spin" /> : <ReceiptText className="size-4" />} {budgetPaymentSaving === budget.id ? "Registrando..." : "Registrar pagamento"}</Button></> : <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><strong>Pagamento registrado</strong>{budget.paid_at ? ` · ${new Date(budget.paid_at).toLocaleDateString("pt-BR")}` : ""}{budget.payment_method_code ? ` · ${String(budget.payment_method_code).toUpperCase()}` : ""}</div>}<Button size="sm" variant="outline" onClick={() => void updateBudgetStatus(budget.id, "approved")}>Marcar aprovado</Button><Button size="sm" variant="outline" onClick={() => void updateBudgetStatus(budget.id, "declined")}>Marcar recusado</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => void removeBudget(budget.id)}><Trash2 className="size-4" /> Excluir</Button></div>'''
text = replace_once(text, old_controls, new_controls, "budget payment controls")

text = replace_once(
    text,
    '''O pagamento do combo é registrado uma única vez. Depois, cada visita é um agendamento normal vinculado à sessão correspondente; se o combo estiver pago, a visita pode ser finalizada em R$ 0,00 sem nova entrada no caixa.''',
    '''Registre o pagamento integral do combo aqui uma única vez. Depois, cada visita é um agendamento normal vinculado à sessão correspondente; como o combo já foi pago, essas visitas entram em R$ 0,00 sem duplicar a receita.''',
    "payment flow explanation",
)

path.write_text(text)
