from pathlib import Path

root_path = Path('src/routes/__root.tsx')
text = root_path.read_text(encoding='utf-8')

# 1) Add lazy inline pages for availability and clients.
anchor = '''const FinanceInlinePage = lazy(async () => {
  const module = await import("./admin_.financeiro");
  return { default: module.Route.options.component as ComponentType };
});
'''
insert = anchor + '''
const AvailabilityInlinePage = lazy(async () => {
  const module = await import("./admin_.disponibilidade");
  return { default: module.Route.options.component as ComponentType };
});

const ClientsInlinePage = lazy(async () => {
  const module = await import("./admin_.clientes");
  return { default: module.Route.options.component as ComponentType };
});
'''
if 'const AvailabilityInlinePage = lazy' not in text:
    if anchor not in text:
        raise SystemExit('FinanceInlinePage anchor not found')
    text = text.replace(anchor, insert, 1)

# 2) Expand inline section type.
text = text.replace(
    'type InlineAdminSection = "catalog" | "team" | "access" | "finance" | null;',
    'type InlineAdminSection = "availability" | "catalog" | "clients" | "team" | "access" | "finance" | null;',
    1,
)

# 3) Persistent sidebar: availability under Horários and clients after catalog, all inline buttons.
old_persistent = '''        <button
          type="button"
          className={`persistent-admin-sidebar-item${inlineSection === "catalog" ? " is-active" : ""}`}
          onClick={() => onInlineSection("catalog")}
        >
          <Sparkles className="size-4 shrink-0" />
          <span>Destaque do catálogo</span>
        </button>

        <div className="persistent-admin-sidebar-divider" />

        <button
          type="button"
          className={`persistent-admin-sidebar-item${inlineSection === "team" ? " is-active" : ""}`}
          onClick={() => onInlineSection("team")}
        >
          <CalendarDays className="size-4 shrink-0" />
          <span>Agenda da equipe</span>
        </button>

        <Link to="/admin/disponibilidade" className="persistent-admin-sidebar-item">
          <Clock3 className="size-4 shrink-0" />
          <span>Disponibilidade</span>
        </Link>

        <Link to="/admin/clientes" className="persistent-admin-sidebar-item">
          <UserRound className="size-4 shrink-0" />
          <span>Clientes</span>
        </Link>
'''
new_persistent = '''        <button
          type="button"
          className={`persistent-admin-sidebar-item${inlineSection === "availability" ? " is-active" : ""}`}
          onClick={() => onInlineSection("availability")}
        >
          <Clock3 className="size-4 shrink-0" />
          <span>Disponibilidade</span>
        </button>

        <button
          type="button"
          className={`persistent-admin-sidebar-item${inlineSection === "catalog" ? " is-active" : ""}`}
          onClick={() => onInlineSection("catalog")}
        >
          <Sparkles className="size-4 shrink-0" />
          <span>Destaque do catálogo</span>
        </button>

        <button
          type="button"
          className={`persistent-admin-sidebar-item${inlineSection === "clients" ? " is-active" : ""}`}
          onClick={() => onInlineSection("clients")}
        >
          <UserRound className="size-4 shrink-0" />
          <span>Clientes</span>
        </button>

        <div className="persistent-admin-sidebar-divider" />

        <button
          type="button"
          className={`persistent-admin-sidebar-item${inlineSection === "team" ? " is-active" : ""}`}
          onClick={() => onInlineSection("team")}
        >
          <CalendarDays className="size-4 shrink-0" />
          <span>Agenda da equipe</span>
        </button>
'''
if old_persistent in text:
    text = text.replace(old_persistent, new_persistent, 1)
else:
    raise SystemExit('Persistent sidebar block not found')

# 4) Mobile active state includes availability/clients.
text = text.replace(
    'const moreActive = inlineSection === "team" || inlineSection === "access" || inlineSection === "finance";',
    'const moreActive = inlineSection === "availability" || inlineSection === "clients" || inlineSection === "team" || inlineSection === "access" || inlineSection === "finance";',
    1,
)

# 5) Mobile menu links become inline buttons.
text = text.replace(
'''            <Link to="/admin/disponibilidade" className="admin-mobile-more-option" role="menuitem" onClick={() => setMoreOpen(false)}>
              <span className="admin-mobile-more-option-icon"><Clock3 /></span>
              <span><strong>Disponibilidade</strong><small>Horários específicos por data</small></span>
            </Link>
            <Link to="/admin/clientes" className="admin-mobile-more-option" role="menuitem" onClick={() => setMoreOpen(false)}>
              <span className="admin-mobile-more-option-icon"><UserRound /></span>
              <span><strong>Clientes</strong><small>Cadastro e aniversariantes</small></span>
            </Link>
''',
'''            <button type="button" className="admin-mobile-more-option" role="menuitem" onClick={() => selectInline("availability")}>
              <span className="admin-mobile-more-option-icon"><Clock3 /></span>
              <span><strong>Disponibilidade</strong><small>Horários específicos por data</small></span>
            </button>
            <button type="button" className="admin-mobile-more-option" role="menuitem" onClick={() => selectInline("clients")}>
              <span className="admin-mobile-more-option-icon"><UserRound /></span>
              <span><strong>Clientes</strong><small>Cadastro e aniversariantes</small></span>
            </button>
''', 1)

# 6) Preload all inline pages.
preload_anchor = '''    void import("./admin_.catalogo");
    void import("./admin_.equipe");
    void import("./admin_.acessos");
    void import("./admin_.financeiro");
'''
preload_new = '''    void import("./admin_.disponibilidade");
    void import("./admin_.catalogo");
    void import("./admin_.clientes");
    void import("./admin_.equipe");
    void import("./admin_.acessos");
    void import("./admin_.financeiro");
'''
if preload_anchor in text:
    text = text.replace(preload_anchor, preload_new, 1)

# 7) Hash routing for availability/clients.
hash_anchor = '''    if (section === "catalogo") {
      setInlineSection("catalog");
      return undefined;
    }
'''
hash_new = '''    if (section === "disponibilidade") {
      setInlineSection("availability");
      return undefined;
    }
    if (section === "catalogo") {
      setInlineSection("catalog");
      return undefined;
    }
    if (section === "clientes") {
      setInlineSection("clients");
      return undefined;
    }
'''
if hash_anchor in text:
    text = text.replace(hash_anchor, hash_new, 1)
else:
    raise SystemExit('Hash anchor not found')

# 8) Hash mapping for openInlineSection.
old_hash_map = 'const hash = section === "catalog" ? "catalogo" : section === "team" ? "equipe" : section === "access" ? "acessos" : "financeiro";'
new_hash_map = 'const hash = section === "availability" ? "disponibilidade" : section === "catalog" ? "catalogo" : section === "clients" ? "clientes" : section === "team" ? "equipe" : section === "access" ? "acessos" : "financeiro";'
if old_hash_map in text:
    text = text.replace(old_hash_map, new_hash_map, 1)
else:
    raise SystemExit('Inline hash mapping not found')

# 9) Inline page selection includes availability/clients.
old_inline_page = '''  const InlinePage =
    inlineSection === "catalog"
      ? CatalogInlinePage
      : inlineSection === "team"
        ? TeamInlinePage
        : inlineSection === "access"
          ? AccessInlinePage
          : inlineSection === "finance"
            ? FinanceInlinePage
            : null;
'''
new_inline_page = '''  const InlinePage =
    inlineSection === "availability"
      ? AvailabilityInlinePage
      : inlineSection === "catalog"
        ? CatalogInlinePage
        : inlineSection === "clients"
          ? ClientsInlinePage
          : inlineSection === "team"
            ? TeamInlinePage
            : inlineSection === "access"
              ? AccessInlinePage
              : inlineSection === "finance"
                ? FinanceInlinePage
                : null;
'''
if old_inline_page in text:
    text = text.replace(old_inline_page, new_inline_page, 1)
else:
    raise SystemExit('InlinePage block not found')

# 10) Desktop injected Links become buttons, preserving order.
old_shortcuts = '''          <button
            type="button"
            onClick={() => openInlineSection("catalog")}
            className={`admin-sidebar-shortcut admin-catalog-shortcut${inlineSection === "catalog" ? " is-active" : ""}`}
            aria-pressed={inlineSection === "catalog"}
          >
            <Sparkles className="size-4 shrink-0 opacity-80" />
            <span>Destaque do catálogo</span>
          </button>
          <button
            type="button"
            onClick={() => openInlineSection("team")}
            className={`admin-sidebar-shortcut admin-team-shortcut${inlineSection === "team" ? " is-active" : ""}`}
            aria-pressed={inlineSection === "team"}
          >
            <CalendarDays className="size-4 shrink-0 opacity-80" />
            <span>Agenda da equipe</span>
          </button>
          <Link to="/admin/disponibilidade" className="admin-sidebar-shortcut admin-availability-shortcut">
            <Clock3 className="size-4 shrink-0 opacity-80" />
            <span>Disponibilidade</span>
          </Link>
          <Link to="/admin/clientes" className="admin-sidebar-shortcut admin-client-shortcut">
            <UserRound className="size-4 shrink-0 opacity-80" />
            <span>Clientes</span>
          </Link>
'''
new_shortcuts = '''          <button
            type="button"
            onClick={() => openInlineSection("availability")}
            className={`admin-sidebar-shortcut admin-availability-shortcut${inlineSection === "availability" ? " is-active" : ""}`}
            aria-pressed={inlineSection === "availability"}
          >
            <Clock3 className="size-4 shrink-0 opacity-80" />
            <span>Disponibilidade</span>
          </button>
          <button
            type="button"
            onClick={() => openInlineSection("catalog")}
            className={`admin-sidebar-shortcut admin-catalog-shortcut${inlineSection === "catalog" ? " is-active" : ""}`}
            aria-pressed={inlineSection === "catalog"}
          >
            <Sparkles className="size-4 shrink-0 opacity-80" />
            <span>Destaque do catálogo</span>
          </button>
          <button
            type="button"
            onClick={() => openInlineSection("clients")}
            className={`admin-sidebar-shortcut admin-client-shortcut${inlineSection === "clients" ? " is-active" : ""}`}
            aria-pressed={inlineSection === "clients"}
          >
            <UserRound className="size-4 shrink-0 opacity-80" />
            <span>Clientes</span>
          </button>
          <button
            type="button"
            onClick={() => openInlineSection("team")}
            className={`admin-sidebar-shortcut admin-team-shortcut${inlineSection === "team" ? " is-active" : ""}`}
            aria-pressed={inlineSection === "team"}
          >
            <CalendarDays className="size-4 shrink-0 opacity-80" />
            <span>Agenda da equipe</span>
          </button>
'''
if old_shortcuts in text:
    text = text.replace(old_shortcuts, new_shortcuts, 1)
else:
    raise SystemExit('Desktop shortcut block not found')

root_path.write_text(text, encoding='utf-8')

# Remove the old global route guard: hidden subpage sidebars inside inline overlays were triggering it and hiding the real sidebar shortcuts.
css_path = Path('src/admin-navigation.css')
css = css_path.read_text(encoding='utf-8')
marker = '\n\n/* route-transition-sidebar-guard: never expose two desktop admin sidebars during a route swap. */\n'
if marker in css:
    css = css.split(marker, 1)[0].rstrip() + '\n'
css_path.write_text(css, encoding='utf-8')
