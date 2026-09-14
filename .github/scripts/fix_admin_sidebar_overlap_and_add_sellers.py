from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


root = Path(__file__).resolve().parents[2]
admin_path = root / "src/routes/admin.tsx"
root_path = root / "src/routes/__root.tsx"
nav_css_path = root / "src/admin-navigation.css"

# 1) Remove the second physical sidebar that was mounted directly in /admin.
admin = admin_path.read_text(encoding="utf-8")
admin = admin.replace('  BadgePercent,\n', '', 1)
admin = admin.replace('import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";\n', '', 1)
admin = replace_once(
    admin,
    '    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden bg-background lg:pl-[252px]">\n      <AdminSubpageSidebar active="home" />\n      <header',
    '    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">\n      <header',
    "remove duplicate admin sidebar",
)
admin_path.write_text(admin, encoding="utf-8")

# 2) Add Sellers/Commissions to the existing native admin sidebar/inline navigation system.
root_text = root_path.read_text(encoding="utf-8")
root_text = replace_once(
    root_text,
    '  Building2,\n  CalendarDays,',
    '  BadgePercent,\n  Building2,\n  CalendarDays,',
    "root seller icon import",
)
root_text = replace_once(
    root_text,
    'const ClientsInlinePage = lazy(async () => {\n  const module = await import("./admin_.clientes");\n  return { default: module.Route.options.component as ComponentType };\n});\n\nconst RoomsInlinePage',
    'const ClientsInlinePage = lazy(async () => {\n  const module = await import("./admin_.clientes");\n  return { default: module.Route.options.component as ComponentType };\n});\n\nconst SellersInlinePage = lazy(async () => {\n  const module = await import("./admin_.vendedores");\n  return { default: module.Route.options.component as ComponentType };\n});\n\nconst RoomsInlinePage',
    "seller lazy page",
)
root_text = replace_once(
    root_text,
    'type InlineAdminSection = "availability" | "catalog" | "clients" | "rooms" | "team" | "access" | "finance" | null;',
    'type InlineAdminSection = "availability" | "catalog" | "clients" | "rooms" | "team" | "access" | "sellers" | "finance" | null;',
    "seller inline section type",
)
root_text = replace_once(
    root_text,
    '        <button\n          type="button"\n          className={`persistent-admin-sidebar-item${inlineSection === "finance" ? " is-active" : ""}`}\n          onClick={() => onInlineSection("finance")}\n        >\n          <CircleDollarSign className="size-4 shrink-0" />\n          <span>Financeiro</span>\n        </button>',
    '        <button\n          type="button"\n          className={`persistent-admin-sidebar-item${inlineSection === "sellers" ? " is-active" : ""}`}\n          onClick={() => onInlineSection("sellers")}\n        >\n          <BadgePercent className="size-4 shrink-0" />\n          <span>Vendedores e comissões</span>\n        </button>\n\n        <button\n          type="button"\n          className={`persistent-admin-sidebar-item${inlineSection === "finance" ? " is-active" : ""}`}\n          onClick={() => onInlineSection("finance")}\n        >\n          <CircleDollarSign className="size-4 shrink-0" />\n          <span>Financeiro</span>\n        </button>',
    "persistent seller item",
)
root_text = replace_once(
    root_text,
    '  const moreActive = inlineSection === "availability" || inlineSection === "clients" || inlineSection === "rooms" || inlineSection === "team" || inlineSection === "access" || inlineSection === "finance";',
    '  const moreActive = inlineSection === "availability" || inlineSection === "clients" || inlineSection === "rooms" || inlineSection === "team" || inlineSection === "access" || inlineSection === "sellers" || inlineSection === "finance";',
    "mobile more active seller",
)
root_text = replace_once(
    root_text,
    '            <button type="button" className="admin-mobile-more-option" role="menuitem" onClick={() => selectInline("finance")}>\n              <span className="admin-mobile-more-option-icon"><CircleDollarSign /></span>\n              <span><strong>Financeiro</strong><small>Gestão financeira da clínica</small></span>\n            </button>',
    '            <button type="button" className="admin-mobile-more-option" role="menuitem" onClick={() => selectInline("sellers")}>\n              <span className="admin-mobile-more-option-icon"><BadgePercent /></span>\n              <span><strong>Vendedores e comissões</strong><small>Cadastros, vendas e comissões</small></span>\n            </button>\n            <button type="button" className="admin-mobile-more-option" role="menuitem" onClick={() => selectInline("finance")}>\n              <span className="admin-mobile-more-option-icon"><CircleDollarSign /></span>\n              <span><strong>Financeiro</strong><small>Gestão financeira da clínica</small></span>\n            </button>',
    "mobile seller option",
)
root_text = replace_once(
    root_text,
    '    void import("./admin_.clientes");\n    void import("@/components/admin-room-reservations");',
    '    void import("./admin_.clientes");\n    void import("./admin_.vendedores");\n    void import("@/components/admin-room-reservations");',
    "preload seller page",
)
root_text = replace_once(
    root_text,
    '    if (section === "acessos") {\n      setInlineSection("access");\n      return undefined;\n    }\n    if (section === "financeiro") {',
    '    if (section === "acessos") {\n      setInlineSection("access");\n      return undefined;\n    }\n    if (section === "vendedores") {\n      setInlineSection("sellers");\n      return undefined;\n    }\n    if (section === "financeiro") {',
    "seller hash hydration",
)
root_text = replace_once(
    root_text,
    '    const hash = section === "availability" ? "disponibilidade" : section === "catalog" ? "catalogo" : section === "clients" ? "clientes" : section === "rooms" ? "salas" : section === "team" ? "equipe" : section === "access" ? "acessos" : "financeiro";',
    '    const hash = section === "availability" ? "disponibilidade" : section === "catalog" ? "catalogo" : section === "clients" ? "clientes" : section === "rooms" ? "salas" : section === "team" ? "equipe" : section === "access" ? "acessos" : section === "sellers" ? "vendedores" : "financeiro";',
    "seller inline hash mapping",
)
root_text = replace_once(
    root_text,
    '            : inlineSection === "team"\n              ? TeamInlinePage\n            : inlineSection === "access"\n              ? AccessInlinePage\n              : inlineSection === "finance"',
    '            : inlineSection === "team"\n              ? TeamInlinePage\n            : inlineSection === "access"\n              ? AccessInlinePage\n              : inlineSection === "sellers"\n                ? SellersInlinePage\n              : inlineSection === "finance"',
    "seller inline page selection",
)
root_text = replace_once(
    root_text,
    '          <button\n            type="button"\n            onClick={() => openInlineSection("finance")}\n            className={`admin-sidebar-shortcut admin-finance-shortcut${inlineSection === "finance" ? " is-active" : ""}`}',
    '          <button\n            type="button"\n            onClick={() => openInlineSection("sellers")}\n            className={`admin-sidebar-shortcut admin-seller-shortcut${inlineSection === "sellers" ? " is-active" : ""}`}\n            aria-pressed={inlineSection === "sellers"}\n          >\n            <BadgePercent className="size-4 shrink-0 opacity-80" />\n            <span>Vendedores e comissões</span>\n          </button>\n          <button\n            type="button"\n            onClick={() => openInlineSection("finance")}\n            className={`admin-sidebar-shortcut admin-finance-shortcut${inlineSection === "finance" ? " is-active" : ""}`}',
    "desktop seller shortcut",
)
root_path.write_text(root_text, encoding="utf-8")

# 3) Give the new item its own slot, shifting Financeiro down one row.
css = nav_css_path.read_text(encoding="utf-8")
css = replace_once(
    css,
    '  .admin-finance-shortcut {\n    top: 639px !important;\n    bottom: auto !important;\n  }',
    '  .admin-seller-shortcut {\n    top: 639px !important;\n    bottom: auto !important;\n  }\n\n  .admin-finance-shortcut {\n    top: 688px !important;\n    bottom: auto !important;\n  }',
    "seller shortcut position",
)
nav_css_path.write_text(css, encoding="utf-8")

print("Admin sidebar overlap fixed and seller commissions integrated into the existing navigation.")
