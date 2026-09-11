from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Standard payment panel: keep the appointment query reliable and hand the
# selected appointment to the split-payment panel.
# ---------------------------------------------------------------------------
path = Path("src/components/finance-attendance-completion.tsx")
text = path.read_text()

text = replace_once(
    text,
    '''  const [appointments, methods, cash] = await Promise.all([\n    db\n      .from("appointments")\n      .select(\n        "id,patient_name,scheduled_date,scheduled_time,status,professional_id,professional_name_snapshot,custom_price,service_price_snapshot,service_id,service:services!appointments_service_id_fkey(name,price),appointment_services(service_id,position,price_snapshot,status,completed_at,service:services!appointment_services_service_id_fkey(name,price)),appointment_sessions(id,session_number,scheduled_date,scheduled_time,status,completed_at),financial_entries(id,status),professional:professionals(name)",\n      )\n      .eq("status", "confirmado")\n      .order("scheduled_date", { ascending: true })\n      .order("scheduled_time", { ascending: true }),\n    db\n      .from("payment_methods")\n      .select("id,code,name,is_cash")\n      .eq("is_active", true)\n      .order("sort_order"),\n    db\n      .from("cash_sessions")\n      .select("id,business_date,status,opened_at")\n      .eq("status", "open")\n      .order("opened_at", { ascending: false })\n      .limit(1),\n  ]);\n  for (const result of [appointments, methods, cash]) if (result.error) throw result.error;\n  return {\n    appointments: (appointments.data ?? []).filter((row: any) => !(row.financial_entries ?? []).some((entry: any) => !["cancelled", "refunded"].includes(entry.status))),\n    methods: methods.data ?? [],\n    openCash: cash.data?.[0] ?? null,\n  };''',
    '''  const [appointments, methods, cash, financialEntries] = await Promise.all([\n    db\n      .from("appointments")\n      .select(\n        "id,patient_name,scheduled_date,scheduled_time,status,professional_id,professional_name_snapshot,custom_price,service_price_snapshot,service_id,service:services!appointments_service_id_fkey(name,price),appointment_services(service_id,position,price_snapshot,status,completed_at,service:services!appointment_services_service_id_fkey(name,price)),appointment_sessions(id,session_number,scheduled_date,scheduled_time,status,completed_at),professional:professionals(name)",\n      )\n      .eq("status", "confirmado")\n      .order("scheduled_date", { ascending: true })\n      .order("scheduled_time", { ascending: true }),\n    db\n      .from("payment_methods")\n      .select("id,code,name,is_cash")\n      .eq("is_active", true)\n      .order("sort_order"),\n    db\n      .from("cash_sessions")\n      .select("id,business_date,status,opened_at")\n      .eq("status", "open")\n      .order("opened_at", { ascending: false })\n      .limit(1),\n    db\n      .from("financial_entries")\n      .select("appointment_id,status")\n      .not("appointment_id", "is", null),\n  ]);\n  for (const result of [appointments, methods, cash, financialEntries]) if (result.error) throw result.error;\n  const alreadyRegistered = new Set(\n    (financialEntries.data ?? [])\n      .filter((entry: any) => !["cancelled", "refunded"].includes(String(entry.status ?? "")))\n      .map((entry: any) => entry.appointment_id),\n  );\n  return {\n    appointments: (appointments.data ?? []).filter((row: any) => !alreadyRegistered.has(row.id)),\n    methods: methods.data ?? [],\n    openCash: cash.data?.[0] ?? null,\n  };''',
    "attendance loader",
)

text = replace_once(
    text,
    '''              onClick={() => document.getElementById("finance-split-payment")?.scrollIntoView({ behavior: "smooth", block: "start" })}''',
    '''              onClick={() => {\n                if (!selected) return;\n                window.dispatchEvent(new CustomEvent("finance:open-split-payment", { detail: { appointmentId: selected.id } }));\n                requestAnimationFrame(() =>\n                  document.getElementById("finance-split-payment")?.scrollIntoView({ behavior: "smooth", block: "start" }),\n                );\n              }}''',
    "split payment shortcut",
)
path.write_text(text)

# ---------------------------------------------------------------------------
# Split-payment panel: use the same reliable appointment filtering and accept
# the appointment selected in the standard payment panel.
# ---------------------------------------------------------------------------
path = Path("src/components/finance-mixed-payment.tsx")
text = path.read_text()

text = replace_once(
    text,
    '''import { Button } from "@/components/ui/button";\nimport { Input } from "@/components/ui/input";\nimport { Label } from "@/components/ui/label";''',
    '''import { Button } from "@/components/ui/button";\nimport { Input } from "@/components/ui/input";\nimport { Label } from "@/components/ui/label";\nimport {\n  Select,\n  SelectContent,\n  SelectItem,\n  SelectTrigger,\n  SelectValue,\n} from "@/components/ui/select";''',
    "mixed select imports",
)

text = replace_once(
    text,
    '''  const [access, appointments, methods] = await Promise.all([\n    db.from("financial_access").select("role").eq("user_id", data.user.id).eq("is_active", true),\n    db\n      .from("appointments")\n      .select("id,patient_name,scheduled_date,scheduled_time,status,professional_id,professional_name_snapshot,custom_price,service_price_snapshot,service_id,service:services(name,price),appointment_services(service_id,position,price_snapshot,status,completed_at,service:services!appointment_services_service_id_fkey(name,price)),appointment_sessions(id,session_number,scheduled_date,scheduled_time,status,completed_at),financial_entries(id,status),professional:professionals(name)")\n      .eq("status", "confirmado")\n      .order("scheduled_date", { ascending: true })\n      .order("scheduled_time", { ascending: true }),\n    db.from("payment_methods").select("id,code,name").eq("is_active", true).order("sort_order"),\n  ]);\n  if (access.error) throw access.error;\n  if (appointments.error) throw appointments.error;\n  if (methods.error) throw methods.error;\n\n  const roles = (access.data ?? []).map((row: any) => String(row.role));\n  return {\n    allowed: roles.some((role: string) => ["admin", "finance", "reception"].includes(role)),\n    appointments: (appointments.data ?? []).filter((row: any) => !(row.financial_entries ?? []).some((entry: any) => !["cancelled", "refunded"].includes(entry.status))),\n    methods: methods.data ?? [],\n  };''',
    '''  const [access, appointments, methods, financialEntries] = await Promise.all([\n    db.from("financial_access").select("role").eq("user_id", data.user.id).eq("is_active", true),\n    db\n      .from("appointments")\n      .select("id,patient_name,scheduled_date,scheduled_time,status,professional_id,professional_name_snapshot,custom_price,service_price_snapshot,service_id,service:services!appointments_service_id_fkey(name,price),appointment_services(service_id,position,price_snapshot,status,completed_at,service:services!appointment_services_service_id_fkey(name,price)),appointment_sessions(id,session_number,scheduled_date,scheduled_time,status,completed_at),professional:professionals(name)")\n      .eq("status", "confirmado")\n      .order("scheduled_date", { ascending: true })\n      .order("scheduled_time", { ascending: true }),\n    db.from("payment_methods").select("id,code,name").eq("is_active", true).order("sort_order"),\n    db.from("financial_entries").select("appointment_id,status").not("appointment_id", "is", null),\n  ]);\n  if (access.error) throw access.error;\n  if (appointments.error) throw appointments.error;\n  if (methods.error) throw methods.error;\n  if (financialEntries.error) throw financialEntries.error;\n\n  const alreadyRegistered = new Set(\n    (financialEntries.data ?? [])\n      .filter((entry: any) => !["cancelled", "refunded"].includes(String(entry.status ?? "")))\n      .map((entry: any) => entry.appointment_id),\n  );\n  const roles = (access.data ?? []).map((row: any) => String(row.role));\n  return {\n    allowed: roles.some((role: string) => ["admin", "finance", "reception"].includes(role)),\n    appointments: (appointments.data ?? []).filter((row: any) => !alreadyRegistered.has(row.id)),\n    methods: methods.data ?? [],\n  };''',
    "mixed loader",
)

text = replace_once(
    text,
    '''  const selected = useMemo(\n    () => (query.data?.appointments ?? []).find((row: any) => row.id === selectedId) ?? null,\n    [query.data?.appointments, selectedId],\n  );''',
    '''  const selected = useMemo(\n    () => (query.data?.appointments ?? []).find((row: any) => row.id === selectedId) ?? null,\n    [query.data?.appointments, selectedId],\n  );\n\n  useEffect(() => {\n    const openSplitPayment = (event: Event) => {\n      const appointmentId = (event as CustomEvent<{ appointmentId?: string }>).detail?.appointmentId;\n      if (appointmentId) setSelectedId(appointmentId);\n    };\n    window.addEventListener("finance:open-split-payment", openSplitPayment);\n    return () => window.removeEventListener("finance:open-split-payment", openSplitPayment);\n  }, []);''',
    "mixed handoff listener",
)

text = replace_once(
    text,
    '''                    <select className={selectClass} value={row.method} onChange={(e) => updateSplit(index, { method: e.target.value })}>\n                      {(query.data?.methods ?? []).map((methodRow: any) => <option key={methodRow.id} value={methodRow.code}>{methodRow.name}</option>)}\n                    </select>''',
    '''                    <Select value={row.method} onValueChange={(value) => updateSplit(index, { method: value })}>\n                      <SelectTrigger className="h-10 w-full bg-background">\n                        <SelectValue placeholder="Forma de pagamento" />\n                      </SelectTrigger>\n                      <SelectContent position="popper" className="z-[120]">\n                        {(query.data?.methods ?? []).map((methodRow: any) => (\n                          <SelectItem key={methodRow.id} value={methodRow.code}>{methodRow.name}</SelectItem>\n                        ))}\n                      </SelectContent>\n                    </Select>''',
    "mixed payment method selector",
)

path.write_text(text)
