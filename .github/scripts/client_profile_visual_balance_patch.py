from pathlib import Path

path = Path('src/components/client-profile-dialog.tsx')
text = path.read_text()

replacements = [
    ('<DialogContent className="max-h-[92vh] max-w-[1120px] overflow-hidden p-0">',
     '<DialogContent className="flex h-[88vh] max-h-[820px] max-w-[1120px] flex-col overflow-hidden border-primary/10 bg-gradient-to-b from-primary/[0.035] via-background to-background p-0 shadow-2xl">'),
    ('<DialogHeader className="border-b px-6 py-5 pr-12">',
     '<DialogHeader className="shrink-0 border-b border-primary/10 bg-gradient-to-r from-primary/[0.10] via-primary/[0.04] to-transparent px-6 py-5 pr-12">'),
    ('<span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary"><UserRound className="size-5" /></span>',
     '<span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/15"><UserRound className="size-5" /></span>'),
    ('<Tabs defaultValue="profile" className="min-h-0 flex-1 overflow-hidden px-5 pb-5">',
     '<Tabs defaultValue="profile" className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-5">'),
    ('<TabsList className="w-max min-w-full justify-start">',
     '<TabsList className="h-auto w-max min-w-full justify-start gap-1 border border-primary/10 bg-primary/[0.065] p-1.5">'),
    ('<TabsTrigger value="profile">Ficha cadastral</TabsTrigger>',
     '<TabsTrigger value="profile" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Ficha cadastral</TabsTrigger>'),
    ('<TabsTrigger value="documents">Anamnese e arquivos</TabsTrigger>',
     '<TabsTrigger value="documents" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Anamnese e arquivos</TabsTrigger>'),
    ('<TabsTrigger value="appointments">Agendamentos</TabsTrigger>',
     '<TabsTrigger value="appointments" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Agendamentos</TabsTrigger>'),
    ('<TabsTrigger value="budgets">Orçamentos e combos</TabsTrigger>',
     '<TabsTrigger value="budgets" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Orçamentos e combos</TabsTrigger>'),
    ('<div className="mt-3 max-h-[68vh] overflow-y-auto pr-1">',
     '<div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">'),
    ('<div className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2">',
     '<div className="grid gap-4 rounded-2xl border border-primary/10 bg-gradient-to-br from-card via-card to-primary/[0.035] p-4 shadow-sm sm:grid-cols-2">'),
    ('<div className="rounded-2xl border border-dashed bg-muted/25 p-5">',
     '<div className="rounded-2xl border border-dashed border-primary/25 bg-primary/[0.045] p-5">'),
    ('<div key={doc.id} className="flex items-center gap-3 rounded-2xl border p-3">',
     '<div key={doc.id} className="flex items-center gap-3 rounded-2xl border border-primary/10 bg-card p-3 shadow-sm transition hover:border-primary/25 hover:bg-primary/[0.025]">'),
    ('<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">',
     '<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">'),
    ('return <article key={appointment.id} className="rounded-2xl border p-4">',
     'return <article key={appointment.id} className="rounded-2xl border border-primary/10 bg-card p-4 shadow-sm">'),
    ('{services.length > 1 ? <div className="mt-3 rounded-xl bg-muted/40 p-3">',
     '{services.length > 1 ? <div className="mt-3 rounded-xl border border-primary/10 bg-primary/[0.045] p-3">'),
    ('{sessions.length > 1 ? <div className="mt-3 rounded-xl bg-muted/40 p-3">',
     '{sessions.length > 1 ? <div className="mt-3 rounded-xl border border-primary/10 bg-primary/[0.045] p-3">'),
    ('<section className="rounded-2xl border bg-card p-4">',
     '<section className="rounded-2xl border border-primary/10 bg-gradient-to-br from-card via-card to-primary/[0.035] p-4 shadow-sm">'),
    ('<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 p-3">',
     '<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/10 bg-primary/[0.05] p-3">'),
    ('<article key={budget.id} className="rounded-2xl border p-4">',
     '<article key={budget.id} className="rounded-2xl border border-primary/10 bg-card p-4 shadow-sm">'),
    ('<div key={item.id} className="rounded-xl bg-muted/40 p-3 text-sm">',
     '<div key={item.id} className="rounded-xl border border-primary/10 bg-primary/[0.04] p-3 text-sm">'),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Pattern not found: {old[:100]}')
    text = text.replace(old, new, 1)

path.write_text(text)
print('client profile visual balance patch applied')
