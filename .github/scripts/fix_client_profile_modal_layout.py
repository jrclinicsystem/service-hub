from pathlib import Path

path = Path('src/components/client-profile-dialog.tsx')
text = path.read_text(encoding='utf-8')

replacements = {
'''<DialogContent className="flex h-[88vh] max-h-[820px] max-w-[1120px] flex-col overflow-hidden border-primary/10 bg-gradient-to-b from-primary/[0.035] via-background to-background p-0 shadow-2xl">''': '''<DialogContent className="grid h-[min(700px,90vh)] max-w-[1120px] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-primary/10 bg-background p-0 shadow-2xl">''',
'''<DialogHeader className="shrink-0 border-b border-primary/10 bg-gradient-to-r from-primary/[0.10] via-primary/[0.04] to-transparent px-6 py-5 pr-12">''': '''<DialogHeader className="relative z-10 border-b border-primary/15 bg-primary/[0.065] px-6 py-5 pr-12">''',
'''<Tabs defaultValue="profile" className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-5">''': '''<Tabs defaultValue="profile" className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden px-5 pb-5">''',
'''<div className="overflow-x-auto pt-4">''': '''<div className="shrink-0 overflow-x-auto pt-4">''',
'''<div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">''': '''<div className="mt-3 min-h-0 overflow-y-auto overscroll-contain pr-1 pb-1">''',
}

for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f'Expected fragment not found: {old}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
