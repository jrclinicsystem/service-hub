from pathlib import Path
import re

p=Path('src/components/finance-staging-workspace.tsx')
s=p.read_text()

# helper functions after monthStartIso
needle='''function monthStartIso() {\n  return `${fortalezaIso().slice(0, 7)}-01`;\n}\n'''
insert='''function monthStartIso() {\n  return `${fortalezaIso().slice(0, 7)}-01`;\n}\n\nfunction addDaysIso(baseIso: string, days: number) {\n  const date = new Date(`${baseIso}T12:00:00`);\n  date.setDate(date.getDate() + days);\n  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;\n}\n\nfunction periodPreset(preset: string) {\n  const today = fortalezaIso();\n  const current = new Date(`${today}T12:00:00`);\n  if (preset === 'today') return [today, today];\n  if (preset === 'yesterday') { const d=addDaysIso(today,-1); return [d,d]; }\n  if (preset === '7d') return [addDaysIso(today,-6), today];\n  if (preset === 'week') { const dow=current.getDay(); const back=dow===0?6:dow-1; return [addDaysIso(today,-back), today]; }\n  if (preset === 'month') return [monthStartIso(), today];\n  if (preset === 'prevmonth') { const first=new Date(current.getFullYear(), current.getMonth()-1,1,12); const last=new Date(current.getFullYear(), current.getMonth(),0,12); const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; return [iso(first),iso(last)]; }\n  if (preset === '3m' || preset === '6m') { const months=preset==='3m'?2:5; const d=new Date(current.getFullYear(), current.getMonth()-months,1,12); const start=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; return [start,today]; }\n  if (preset === 'year') return [`${today.slice(0,4)}-01-01`, today];\n  return [monthStartIso(), today];\n}\n'''
if needle not in s: raise SystemExit('month helper anchor missing')
s=s.replace(needle,insert,1)

# state active tab + period
needle='''  const [busy, setBusy] = useState("");\n'''
rep='''  const [busy, setBusy] = useState("");\n  const [activeTab, setActiveTab] = useState("overview");\n  const [periodChoice, setPeriodChoice] = useState("month");\n'''
if needle not in s: raise SystemExit('state anchor missing')
s=s.replace(needle,rep,1)

# grouped memo after filteredEntries
needle='''  const historicalCommissionCandidates = useMemo(\n'''
rep='''  const groupedEntries = useMemo(() => {\n    const map = new Map<string, any[]>();\n    for (const row of filteredEntries) {\n      const key = row.business_date || fortalezaIso(new Date(row.occurred_at));\n      map.set(key, [...(map.get(key) ?? []), row]);\n    }\n    return [...map.entries()].sort((a,b)=>b[0].localeCompare(a[0]));\n  }, [filteredEntries]);\n  const groupedExpenses = useMemo(() => {\n    const map = new Map<string, any[]>();\n    for (const row of data?.expenses ?? []) {\n      const key = row.expense_date || fortalezaIso(new Date(row.created_at));\n      map.set(key, [...(map.get(key) ?? []), row]);\n    }\n    return [...map.entries()].sort((a,b)=>b[0].localeCompare(a[0]));\n  }, [data?.expenses]);\n\n  const historicalCommissionCandidates = useMemo(\n'''
if needle not in s: raise SystemExit('group memo anchor missing')
s=s.replace(needle,rep,1)

# header dates block add presets above date inputs
old='''        <div className="grid gap-2 sm:grid-cols-2">\n          <div>\n            <Label>De</Label>\n            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />\n          </div>\n          <div>\n            <Label>Até</Label>\n            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />\n          </div>\n        </div>'''
new='''        <div className="space-y-2">\n          <select className={selectClass} value={periodChoice} onChange={(e) => { const value=e.target.value; setPeriodChoice(value); if(value!=="custom"){ const [start,end]=periodPreset(value); setFrom(start); setTo(end); } }}>\n            <option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="week">Esta semana</option><option value="7d">Últimos 7 dias</option><option value="month">Este mês</option><option value="prevmonth">Mês anterior</option><option value="3m">Últimos 3 meses</option><option value="6m">Últimos 6 meses</option><option value="year">Este ano</option><option value="custom">Personalizado</option>\n          </select>\n          <div className="grid gap-2 sm:grid-cols-2">\n            <div><Label>De</Label><Input type="date" value={from} onChange={(e) => { setPeriodChoice("custom"); setFrom(e.target.value); }} /></div>\n            <div><Label>Até</Label><Input type="date" value={to} onChange={(e) => { setPeriodChoice("custom"); setTo(e.target.value); }} /></div>\n          </div>\n        </div>'''
if old not in s: raise SystemExit('header date block missing')
s=s.replace(old,new,1)

# metrics only overview
s=s.replace('''      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">''','''      {activeTab === "overview" ? <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">''',1)
s=s.replace('''      </section>\n\n      <Tabs defaultValue="overview" className="mt-8">''','''      </section> : null}\n\n      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">''',1)

# grouped entries replace one EntryList in entries panel based nearby unique title close
old='''          >\n            <EntryList rows={filteredEntries} />\n          </Panel>\n        </TabsContent>'''
new='''          >\n            <div className="space-y-3">\n              {groupedEntries.map(([date, rows]) => { const total=(rows as any[]).reduce((sum,row)=>sum+Number(row.net_amount ?? row.charged_amount ?? 0),0); return (\n                <details key={date} className="group rounded-2xl border border-border bg-card" open>\n                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">\n                    <div><strong className="text-sm">{formatDate(date)}</strong><p className="text-[11px] text-muted-foreground">{(rows as any[]).length} lançamento(s)</p></div>\n                    <strong className="text-primary">{money(total)}</strong>\n                  </summary>\n                  <div className="border-t border-border p-3"><EntryList rows={rows as any[]} /></div>\n                </details>\n              ); })}\n              {!groupedEntries.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma entrada no período selecionado.</p> : null}\n            </div>\n          </Panel>\n        </TabsContent>'''
if old not in s: raise SystemExit('entries target missing')
s=s.replace(old,new,1)

# group expenses by replacing map opening/closing within expenses panel
old='''            <div className="space-y-2">\n              {(data.expenses ?? []).map((row: any) => (\n                <div\n                  key={row.expense_id}'''
new='''            <div className="space-y-3">\n              {groupedExpenses.map(([date, dayRows]) => { const dayTotal=(dayRows as any[]).reduce((sum,row)=>sum+Number(row.amount ?? 0),0); return (\n              <details key={date} className="group rounded-2xl border border-border bg-card" open>\n                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">\n                  <div><strong className="text-sm">{formatDate(date)}</strong><p className="text-[11px] text-muted-foreground">{(dayRows as any[]).length} saída(s)</p></div>\n                  <strong className="text-destructive">{money(dayTotal)}</strong>\n                </summary>\n                <div className="space-y-2 border-t border-border p-3">\n              {(dayRows as any[]).map((row: any) => (\n                <div\n                  key={row.expense_id}'''
if old not in s: raise SystemExit('expense map open missing')
s=s.replace(old,new,1)
oldclose='''              ))}\n            </div>\n          </Panel>\n        </TabsContent>\n\n        <TabsContent value="accounts"'''
newclose='''              ))}\n                </div>\n              </details>\n              ); })}\n              {!groupedExpenses.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma saída no período selecionado.</p> : null}\n            </div>\n          </Panel>\n        </TabsContent>\n\n        <TabsContent value="accounts"'''
if oldclose not in s: raise SystemExit('expense map close missing')
s=s.replace(oldclose,newclose,1)

p.write_text(s)
