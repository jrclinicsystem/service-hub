from pathlib import Path

path = Path('src/components/client-profile-dialog.tsx')
text = path.read_text(encoding='utf-8')

needle = '  const [budgetSaving, setBudgetSaving] = useState(false);\n'
replacement = needle + '  const [activeTab, setActiveTab] = useState("profile");\n'
if needle not in text:
    raise SystemExit('budgetSaving anchor not found')
text = text.replace(needle, replacement, 1)

needle = '  useEffect(() => {\n    if (!client) return;\n'
replacement = '  useEffect(() => {\n    if (open) setActiveTab("profile");\n  }, [clientId, open]);\n\n' + needle
if needle not in text:
    raise SystemExit('client effect anchor not found')
text = text.replace(needle, replacement, 1)

old = '<DialogContent className="grid h-[min(700px,90vh)] max-w-[1120px] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-primary/10 bg-background p-0 shadow-2xl">'
new = '<DialogContent className="!z-[9001] grid h-[min(700px,90vh)] w-[calc(100vw-32px)] max-w-[1120px] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-primary/15 !bg-[#fffdfa] p-0 shadow-2xl">'
if old not in text:
    raise SystemExit('DialogContent anchor not found')
text = text.replace(old, new, 1)

old = '<DialogHeader className="relative z-10 border-b border-primary/15 bg-primary/[0.065] px-6 py-5 pr-12">'
new = '<DialogHeader className="relative z-10 border-b border-primary/15 bg-[#f3faf7] px-6 py-5 pr-12">'
if old not in text:
    raise SystemExit('DialogHeader anchor not found')
text = text.replace(old, new, 1)

old = '<Tabs defaultValue="profile" className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden px-5 pb-5">'
new = '<Tabs value={activeTab} onValueChange={setActiveTab} className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[#fffdfa] px-5 pb-5">'
if old not in text:
    raise SystemExit('Tabs anchor not found')
text = text.replace(old, new, 1)

old = '<TabsList className="h-auto w-max min-w-full justify-start gap-1 border border-primary/10 bg-primary/[0.065] p-1.5">'
new = '<TabsList onClick={(event) => event.stopPropagation()} className="h-auto w-max min-w-full justify-start gap-1 border border-primary/15 bg-[#edf7f3] p-1.5">'
if old not in text:
    raise SystemExit('TabsList anchor not found')
text = text.replace(old, new, 1)

old = '<div className="mt-3 min-h-0 overflow-y-auto overscroll-contain pr-1 pb-1">'
new = '<div className="relative z-0 mt-3 min-h-0 overflow-y-auto overscroll-contain bg-[#fffdfa] pr-1 pb-1">'
if old not in text:
    raise SystemExit('content scroller anchor not found')
text = text.replace(old, new, 1)

# Make every tab an explicit non-submit button and stop clicks from escaping the modal.
text = text.replace('<TabsTrigger value="profile" ', '<TabsTrigger type="button" value="profile" onClick={(event) => event.stopPropagation()} ', 1)
text = text.replace('<TabsTrigger value="documents" ', '<TabsTrigger type="button" value="documents" onClick={(event) => event.stopPropagation()} ', 1)
text = text.replace('<TabsTrigger value="appointments" ', '<TabsTrigger type="button" value="appointments" onClick={(event) => event.stopPropagation()} ', 1)
text = text.replace('<TabsTrigger value="budgets" ', '<TabsTrigger type="button" value="budgets" onClick={(event) => event.stopPropagation()} ', 1)

path.write_text(text, encoding='utf-8')
print('client profile modal interaction/layout fixed')
