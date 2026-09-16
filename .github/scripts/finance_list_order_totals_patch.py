from pathlib import Path

path = Path("src/components/finance-staging-workspace.tsx")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    text = text.replace(old, new, 1)


old = '''  }, [data?.expenses]);

  const historicalCommissionCandidates = useMemo('''
new = '''  }, [data?.expenses]);
  const filteredEntriesTotal = useMemo(
    () =>
      filteredEntries.reduce(
        (sum: number, row: any) =>
          sum + Number(row.net_amount ?? row.charged_amount ?? 0),
        0,
      ),
    [filteredEntries],
  );
  const expensesTotal = useMemo(
    () =>
      (data?.expenses ?? []).reduce(
        (sum: number, row: any) => sum + Number(row.amount ?? 0),
        0,
      ),
    [data?.expenses],
  );
  const orderedPayables = useMemo(
    () =>
      [...(data?.payables ?? [])].sort((a: any, b: any) => {
        const aPaid = a.status === "paid" ? 1 : 0;
        const bPaid = b.status === "paid" ? 1 : 0;
        if (aPaid !== bPaid) return aPaid - bPaid;
        return String(a.due_date ?? "").localeCompare(String(b.due_date ?? ""));
      }),
    [data?.payables],
  );

  const historicalCommissionCandidates = useMemo('''
replace_once(old, new, "finance derived values")

old = '''            collapsible
          >
            <div className="space-y-3">
              {groupedEntries.map'''
new = '''            total={money(filteredEntriesTotal)}
            collapsible
          >
            <div className="space-y-3">
              {groupedEntries.map'''
replace_once(old, new, "entries total")

old = '''          <Panel title="Despesas do período" collapsible>'''
new = '''          <Panel title="Despesas do período" total={money(expensesTotal)} collapsible>'''
replace_once(old, new, "expenses total")

old = '''                {(data.payables ?? []).map((row: any) => ('''
new = '''                {orderedPayables.map((row: any) => ('''
replace_once(old, new, "payables order")

old = '''function Panel({
  title,
  subtitle,
  children,
  collapsible = false,
}: {
  title: string;
  subtitle?: string | undefined;
  children: any;
  collapsible?: boolean;
}) {'''
new = '''function Panel({
  title,
  subtitle,
  children,
  total,
  collapsible = false,
}: {
  title: string;
  subtitle?: string | undefined;
  children: any;
  total?: string;
  collapsible?: boolean;
}) {'''
replace_once(old, new, "panel total prop")

old = '''          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground transition-colors group-open:bg-primary-soft group-open:text-primary">
            <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" />
          </span>'''
new = '''          <div className="flex shrink-0 items-center gap-3">
            {total ? (
              <strong className="whitespace-nowrap text-base font-semibold text-primary sm:text-lg">{total}</strong>
            ) : null}
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground transition-colors group-open:bg-primary-soft group-open:text-primary">
              <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" />
            </span>
          </div>'''
replace_once(old, new, "panel collapsible total display")

path.write_text(text)
