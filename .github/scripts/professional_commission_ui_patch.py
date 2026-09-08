from pathlib import Path

# 1) Professional portal: import and render the own-commission summary.
professional_path = Path("src/routes/profissional.tsx")
professional_text = professional_path.read_text()

import_anchor = 'import { ProfessionalClientBookingTools } from "@/components/professional-client-booking-tools";\n'
import_line = 'import { ProfessionalCommissionSummary } from "@/components/professional-commission-summary";\n'
if import_line not in professional_text:
    if import_anchor not in professional_text:
        raise SystemExit("professional import anchor not found")
    professional_text = professional_text.replace(import_anchor, import_anchor + import_line, 1)

calendar_anchor = '        <div className="mt-7"><AppointmentCalendar appointments={data.appointments}'
commission_render = '        <ProfessionalCommissionSummary professionalId={data.professional.id} />\n\n'
if commission_render not in professional_text:
    if calendar_anchor not in professional_text:
        raise SystemExit("professional calendar anchor not found")
    professional_text = professional_text.replace(calendar_anchor, commission_render + calendar_anchor, 1)

professional_path.write_text(professional_text)

# 2) Admin finance: enrich commissions with their financial-entry context and present readable labels.
finance_path = Path("src/components/finance-staging-workspace.tsx")
finance_text = finance_path.read_text()

status_anchor = '''function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (["paid", "received", "closed"].includes(status)) return "default";
  if (status === "overdue") return "destructive";
  if (["cancelled", "refunded"].includes(status)) return "outline";
  return "secondary";
}
'''
helpers = '''
function commissionEntry(row: any) {
  const value = row?.financial_entry;
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function commissionContext(row: any, professionals: any[]) {
  const entry = commissionEntry(row);
  const professional =
    entry?.professional_name_snapshot ||
    professionals.find((item: any) => item.id === row?.professional_id)?.name ||
    `Profissional ${String(row?.professional_id ?? "").slice(0, 8) || "não identificado"}`;
  const patient = entry?.patient_name_snapshot || "Paciente não identificado";
  const service = entry?.service_name_snapshot || "Serviço não identificado";
  const date = entry?.occurred_at ? formatDate(entry.occurred_at) : "Data não informada";
  return {
    professional,
    patient,
    service,
    date,
    label: `${professional} · ${patient} · ${service} · ${date} · ${money(row?.commission_amount)}`,
  };
}
'''
if "function commissionContext(" not in finance_text:
    if status_anchor not in finance_text:
        raise SystemExit("finance statusVariant anchor not found")
    finance_text = finance_text.replace(status_anchor, status_anchor + helpers, 1)

query_old = '''    db
      .from("professional_commissions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300),'''
query_new = '''    db
      .from("professional_commissions")
      .select(
        "*,financial_entry:financial_entries(patient_name_snapshot,professional_name_snapshot,service_name_snapshot,occurred_at)",
      )
      .order("created_at", { ascending: false })
      .limit(300),'''
if query_new not in finance_text:
    if query_old not in finance_text:
        raise SystemExit("professional_commissions full-overview query not found")
    finance_text = finance_text.replace(query_old, query_new, 1)

option_old = '''                    <option key={c.id} value={c.id}>
                      {String(c.professional_id).slice(0, 8)} · {money(c.commission_amount)}
                    </option>'''
option_new = '''                    <option key={c.id} value={c.id}>
                      {commissionContext(c, professionals).label}
                    </option>'''
if option_new not in finance_text:
    if option_old not in finance_text:
        raise SystemExit("commission select option block not found")
    finance_text = finance_text.replace(option_old, option_new, 1)

card_old = '''                      <strong className="text-sm">
                        Profissional {String(row.professional_id).slice(0, 8)}
                      </strong>
                      <p className="text-xs text-muted-foreground">
                        {row.commission_type}
                        {row.is_manual_override ? " · ajuste manual" : ""}
                      </p>'''
card_new = '''                      <strong className="text-sm">
                        {commissionContext(row, professionals).professional}
                      </strong>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {commissionContext(row, professionals).patient} · {commissionContext(row, professionals).service}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {commissionContext(row, professionals).date} · {row.commission_type}
                        {row.is_manual_override ? " · ajuste manual" : ""}
                      </p>'''
if card_new not in finance_text:
    if card_old not in finance_text:
        raise SystemExit("commission list card block not found")
    finance_text = finance_text.replace(card_old, card_new, 1)

finance_path.write_text(finance_text)
