from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Expected block not found: {label}")
    return text.replace(old, new, 1)

root_path = Path("src/routes/__root.tsx")
text = root_path.read_text()

text = replace_once(text, "  CalendarDays,\n  CircleDollarSign,", "  Building2,\n  CalendarDays,\n  CircleDollarSign,", "root Building2 import")

text = replace_once(
    text,
    '''const ClientsInlinePage = lazy(async () => {\n  const module = await import("./admin_.clientes");\n  return { default: module.Route.options.component as ComponentType };\n});\n''',
    '''const ClientsInlinePage = lazy(async () => {\n  const module = await import("./admin_.clientes");\n  return { default: module.Route.options.component as ComponentType };\n});\n\nconst RoomsInlinePage = lazy(async () => {\n  const module = await import("@/components/admin-room-reservations");\n  return { default: module.AdminRoomReservations as ComponentType };\n});\n''',
    "rooms lazy page",
)

text = replace_once(
    text,
    'type InlineAdminSection = "availability" | "catalog" | "clients" | "team" | "access" | "finance" | null;',
    'type InlineAdminSection = "availability" | "catalog" | "clients" | "rooms" | "team" | "access" | "finance" | null;',
    "inline section type",
)

client_button = '''        <button\n          type="button"\n          className={`persistent-admin-sidebar-item${inlineSection === "clients" ? " is-active" : ""}`}\n          onClick={() => onInlineSection("clients")}\n        >\n          <UserRound className="size-4 shrink-0" />\n          <span>Clientes</span>\n        </button>\n\n        <div className="persistent-admin-sidebar-divider" />'''
rooms_button = '''        <button\n          type="button"\n          className={`persistent-admin-sidebar-item${inlineSection === "clients" ? " is-active" : ""}`}\n          onClick={() => onInlineSection("clients")}\n        >\n          <UserRound className="size-4 shrink-0" />\n          <span>Clientes</span>\n        </button>\n\n        <button\n          type="button"\n          className={`persistent-admin-sidebar-item${inlineSection === "rooms" ? " is-active" : ""}`}\n          onClick={() => onInlineSection("rooms")}\n        >\n          <Building2 className="size-4 shrink-0" />\n          <span>Reservas de Salas</span>\n        </button>\n\n        <div className="persistent-admin-sidebar-divider" />'''
text = replace_once(text, client_button, rooms_button, "persistent room button")

text = replace_once(
    text,
    'const moreActive = inlineSection === "availability" || inlineSection === "clients" || inlineSection === "team" || inlineSection === "access" || inlineSection === "finance";',
    'const moreActive = inlineSection === "availability" || inlineSection === "clients" || inlineSection === "rooms" || inlineSection === "team" || inlineSection === "access" || inlineSection === "finance";',
    "mobile more active",
)

mobile_clients = '''            <button type="button" className="admin-mobile-more-option" role="menuitem" onClick={() => selectInline("clients")}>\n              <span className="admin-mobile-more-option-icon"><UserRound /></span>\n              <span><strong>Clientes</strong><small>Cadastro e aniversariantes</small></span>\n            </button>'''
mobile_rooms = mobile_clients + '''\n            <button type="button" className="admin-mobile-more-option" role="menuitem" onClick={() => selectInline("rooms")}>\n              <span className="admin-mobile-more-option-icon"><Building2 /></span>\n              <span><strong>Reservas de Salas</strong><small>Aluguel e bloqueio de consultórios</small></span>\n            </button>'''
text = replace_once(text, mobile_clients, mobile_rooms, "mobile rooms option")

text = replace_once(
    text,
    '    void import("./admin_.clientes");\n    void import("./admin_.equipe");',
    '    void import("./admin_.clientes");\n    void import("@/components/admin-room-reservations");\n    void import("./admin_.equipe");',
    "prefetch rooms",
)

text = replace_once(
    text,
    '''    if (section === "clientes") {\n      setInlineSection("clients");\n      return undefined;\n    }\n    if (section === "equipe") {''',
    '''    if (section === "clientes") {\n      setInlineSection("clients");\n      return undefined;\n    }\n    if (section === "salas") {\n      setInlineSection("rooms");\n      return undefined;\n    }\n    if (section === "equipe") {''',
    "rooms hash parser",
)

text = replace_once(
    text,
    'const hash = section === "availability" ? "disponibilidade" : section === "catalog" ? "catalogo" : section === "clients" ? "clientes" : section === "team" ? "equipe" : section === "access" ? "acessos" : "financeiro";',
    'const hash = section === "availability" ? "disponibilidade" : section === "catalog" ? "catalogo" : section === "clients" ? "clientes" : section === "rooms" ? "salas" : section === "team" ? "equipe" : section === "access" ? "acessos" : "financeiro";',
    "rooms hash mapping",
)

text = replace_once(
    text,
    '''        : inlineSection === "clients"\n          ? ClientsInlinePage\n          : inlineSection === "team"\n            ? TeamInlinePage''',
    '''        : inlineSection === "clients"\n          ? ClientsInlinePage\n          : inlineSection === "rooms"\n            ? RoomsInlinePage\n            : inlineSection === "team"\n              ? TeamInlinePage''',
    "rooms inline page",
)

fixed_client = '''          <button\n            type="button"\n            onClick={() => openInlineSection("clients")}\n            className={`admin-sidebar-shortcut admin-client-shortcut${inlineSection === "clients" ? " is-active" : ""}`}\n            aria-pressed={inlineSection === "clients"}\n          >\n            <UserRound className="size-4 shrink-0 opacity-80" />\n            <span>Clientes</span>\n          </button>'''
fixed_rooms = fixed_client + '''\n          <button\n            type="button"\n            onClick={() => openInlineSection("rooms")}\n            className={`admin-sidebar-shortcut admin-room-shortcut${inlineSection === "rooms" ? " is-active" : ""}`}\n            aria-pressed={inlineSection === "rooms"}\n          >\n            <Building2 className="size-4 shrink-0 opacity-80" />\n            <span>Reservas de Salas</span>\n          </button>'''
text = replace_once(text, fixed_client, fixed_rooms, "fixed room shortcut")
root_path.write_text(text)

css_path = Path("src/admin-navigation.css")
css = css_path.read_text()
css = replace_once(
    css,
    '''  .admin-client-shortcut {\n    top: 423px !important;\n    bottom: auto !important;\n  }\n\n  .admin-team-shortcut {\n    top: 492px !important;''',
    '''  .admin-client-shortcut {\n    top: 423px !important;\n    bottom: auto !important;\n  }\n\n  .admin-room-shortcut {\n    top: 472px !important;\n    bottom: auto !important;\n  }\n\n  .admin-team-shortcut {\n    top: 541px !important;''',
    "room shortcut css",
)
css = replace_once(css, '  .admin-access-shortcut {\n    top: 541px !important;', '  .admin-access-shortcut {\n    top: 590px !important;', "access position")
css = replace_once(css, '  .admin-finance-shortcut {\n    top: 590px !important;', '  .admin-finance-shortcut {\n    top: 639px !important;', "finance position")
css_path.write_text(css)

professional_path = Path("src/routes/profissional.tsx")
prof = professional_path.read_text()
prof = replace_once(
    prof,
    'import { ProfessionalDateAvailability } from "@/components/professional-date-availability";',
    'import { ProfessionalDateAvailability } from "@/components/professional-date-availability";\nimport { ProfessionalRoomBlocks } from "@/components/professional-room-blocks";',
    "professional room blocks import",
)
prof = replace_once(
    prof,
    '''        <ProfessionalDateAvailability professionalId={data.professional.id} fallbackSlots={data.slots} fallbackAvailability={data.availability} />\n\n        <ProfessionalClientBookingTools''',
    '''        <ProfessionalDateAvailability professionalId={data.professional.id} fallbackSlots={data.slots} fallbackAvailability={data.availability} />\n\n        <ProfessionalRoomBlocks professionalId={data.professional.id} selectedDate={dateFilter || today} />\n\n        <ProfessionalClientBookingTools''',
    "professional room blocks render",
)
professional_path.write_text(prof)

print("room reservation UI patch applied")
