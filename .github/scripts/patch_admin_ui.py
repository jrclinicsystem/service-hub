from pathlib import Path

# Subpage sidebar: stable marker and Disponibilidade directly under Horários.
sidebar = Path("src/components/admin-subpage-sidebar.tsx")
text = sidebar.read_text(encoding="utf-8")
text = text.replace(
    '<aside className="fixed inset-y-0 left-0 z-50 hidden w-[252px] flex-col border-r border-primary-foreground/10 bg-primary text-primary-foreground lg:flex">',
    '<aside className="admin-subpage-sidebar fixed inset-y-0 left-0 z-50 hidden w-[252px] flex-col border-r border-primary-foreground/10 bg-primary text-primary-foreground lg:flex">',
    1,
)
text = text.replace(
    '  { to: "/admin/disponibilidade", label: "Disponibilidade", icon: Clock3, active: "availability" as const },\n',
    "",
    1,
)
availability_top = '''          <Link to="/admin/disponibilidade" preload="intent" className={itemClass(active === "availability")}>
            <Clock3 className="size-4 shrink-0 opacity-80" />
            <span>Disponibilidade</span>
          </Link>

'''
catalog_anchor = '          <Link to="/admin/catalogo" preload="intent" className={itemClass(active === "catalog")}>'
if availability_top not in text:
    if catalog_anchor not in text:
        raise SystemExit("Catalog anchor not found in admin-subpage-sidebar.tsx")
    text = text.replace(catalog_anchor, availability_top + catalog_anchor, 1)
sidebar.write_text(text, encoding="utf-8")

# Desktop injected sidebar positions and transition guard.
css_path = Path("src/admin-navigation.css")
css = css_path.read_text(encoding="utf-8")
old_positions = '''  /* Top group: catalog and clients. Bottom group starts after the divider. */
  .admin-catalog-shortcut {
    top: 325px !important;
    bottom: auto !important;
  }

  .admin-client-shortcut {
    top: 374px !important;
    bottom: auto !important;
  }

  .admin-team-shortcut {
    top: 443px !important;
    bottom: auto !important;
    left: 18px !important;
    width: 214px !important;
    margin: 0 !important;
    padding: 0 12px !important;
  }
'''
new_positions = '''  /* Top group follows the same order as the admin menu. */
  .admin-availability-shortcut {
    top: 325px !important;
    bottom: auto !important;
  }

  .admin-catalog-shortcut {
    top: 374px !important;
    bottom: auto !important;
  }

  .admin-client-shortcut {
    top: 423px !important;
    bottom: auto !important;
  }

  .admin-team-shortcut {
    top: 492px !important;
    bottom: auto !important;
    left: 18px !important;
    width: 214px !important;
    margin: 0 !important;
    padding: 0 12px !important;
  }
'''
if old_positions in css:
    css = css.replace(old_positions, new_positions, 1)
css = css.replace(
    '''  .admin-availability-shortcut {
    top: 492px !important;
    bottom: auto !important;
  }

  .admin-access-shortcut {
    top: 541px !important;
''',
    '''  .admin-access-shortcut {
    top: 541px !important;
''',
    1,
)
if "route-transition-sidebar-guard" not in css:
    css += '''

/* route-transition-sidebar-guard: never expose two desktop admin sidebars during a route swap. */
@media (min-width: 1024px) {
  body:has(.admin-subpage-sidebar) .admin-sidebar-shortcut {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  body:has(.admin-subpage-sidebar) a.admin-sidebar-presence-anchor {
    display: none !important;
  }

  body:has(.admin-subpage-sidebar) main.max-w-\\[1480px\\] div:has(> [role="tablist"]) {
    display: none !important;
  }

  body:has(.admin-subpage-sidebar) header.sticky {
    visibility: hidden !important;
    pointer-events: none !important;
  }
}
'''
css_path.write_text(css, encoding="utf-8")

# Horários tab: allow adding a custom global time slot without removing existing toggles.
admin = Path("src/routes/admin.tsx")
a = admin.read_text(encoding="utf-8")
if '<CustomTimeSlotAdder onAdded={refresh} />' not in a:
    needle = '''          <TabsContent value="horarios" className="mt-4 sm:mt-5">
            <SectionHeader title="Horários disponíveis" subtitle="Ative ou pause horários exibidos no agendamento." />
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">'''
    replacement = '''          <TabsContent value="horarios" className="mt-4 sm:mt-5">
            <SectionHeader title="Horários disponíveis" subtitle="Ative ou pause horários exibidos no agendamento." />
            <CustomTimeSlotAdder onAdded={refresh} />
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">'''
    if needle not in a:
        raise SystemExit("Horários tab anchor not found in admin.tsx")
    a = a.replace(needle, replacement, 1)

if "function CustomTimeSlotAdder(" not in a:
    component = '''function CustomTimeSlotAdder({ onAdded }: { onAdded: () => void }) {
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);

  const addCustomTime = async () => {
    if (!time) {
      toast.error("Escolha um horário para adicionar.");
      return;
    }

    setSaving(true);
    try {
      const sortOrder = Number(time.replace(":", ""));
      const { error } = await db
        .from("time_slots")
        .upsert(
          { slot: time, is_available: true, sort_order: sortOrder },
          { onConflict: "slot" },
        );
      if (error) throw error;

      setTime("");
      toast.success("Horário adicionado e ativado.");
      onAdded();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível adicionar o horário.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-end">
      <div className="w-full sm:max-w-[220px]">
        <Label>Adicionar horário personalizado</Label>
        <Input
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          className="mt-2"
        />
      </div>
      <Button type="button" onClick={addCustomTime} disabled={saving || !time}>
        <Plus className="size-4" />
        {saving ? "Adicionando..." : "Adicionar horário"}
      </Button>
    </div>
  );
}

'''
    anchor = "function MobileTab({ value, icon: Icon, label, desktopLabel }: any) {"
    if anchor not in a:
        raise SystemExit("MobileTab anchor not found in admin.tsx")
    a = a.replace(anchor, component + anchor, 1)
admin.write_text(a, encoding="utf-8")
