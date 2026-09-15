from pathlib import Path

path = Path("src/components/finance-staging-workspace.tsx")
text = path.read_text()

helper = '''function payableDueUrgency(dueDate?: string | null) {
  const due = String(dueDate ?? "").slice(0, 10);
  if (!due) return null;
  const today = fortalezaIso();
  if (due === today) return "today";
  if (due === addDaysIso(today, 1)) return "tomorrow";
  return null;
}

'''

if "function payableDueUrgency" not in text:
    anchor = "function commissionEntry(row: any) {"
    if anchor not in text:
        raise SystemExit("commissionEntry anchor not found")
    text = text.replace(anchor, helper + anchor, 1)

old = '''                    <div className="text-right">
                      <strong>{money(row.amount)}</strong>
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <Badge variant={statusVariant(row.display_status)}>
                          {statusLabel(row.display_status)}
                        </Badge>
                        {row.status === "pending" ? ('''

new = '''                    <div className="text-right">
                      <strong>{money(row.amount)}</strong>
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        {row.status === "pending" && payableDueUrgency(row.due_date) === "tomorrow" ? (
                          <Badge
                            variant="outline"
                            className="border-amber-300 bg-amber-50 font-semibold text-amber-800"
                          >
                            Vence em 1 dia
                          </Badge>
                        ) : null}
                        {row.status === "pending" && payableDueUrgency(row.due_date) === "today" ? (
                          <Badge variant="destructive" className="font-semibold uppercase tracking-wide shadow-sm">
                            Vence hoje
                          </Badge>
                        ) : null}
                        <Badge variant={statusVariant(row.display_status)}>
                          {statusLabel(row.display_status)}
                        </Badge>
                        {row.status === "pending" ? ('''

if old in text:
    text = text.replace(old, new, 1)
elif "Vence em 1 dia" not in text or "payableDueUrgency(row.due_date)" not in text:
    raise SystemExit("accounts payable badge anchor not found")

path.write_text(text)
print("Payable urgency badges patch applied.")
