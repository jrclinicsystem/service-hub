from pathlib import Path

root = Path(__file__).resolve().parents[2]
admin_path = root / "src/routes/admin.tsx"
sidebar_path = root / "src/components/admin-subpage-sidebar.tsx"

admin = admin_path.read_text(encoding="utf-8")

if 'import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";' not in admin:
    needle = 'import { AdminAppointmentsWorkspace } from "@/components/admin-appointments-workspace";\n'
    replacement = needle + 'import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";\n'
    if needle not in admin:
        raise RuntimeError("Could not find AdminAppointmentsWorkspace import")
    admin = admin.replace(needle, replacement, 1)

old_root = '    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">\n      <header'
new_root = '    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden bg-background lg:pl-[252px]">\n      <AdminSubpageSidebar active="home" />\n      <header'
if old_root in admin:
    admin = admin.replace(old_root, new_root, 1)
elif '<AdminSubpageSidebar active="home" />' not in admin:
    raise RuntimeError("Could not find admin root layout")

quick_nav = '''        <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">\n          <Button variant="outline" size="sm" className="rounded-xl" asChild>\n            <Link to="/admin/vendedores">\n              <BadgePercent className="size-4" /> Vendedores e comissões\n            </Link>\n          </Button>\n          <Button variant="outline" size="sm" className="rounded-xl" asChild>\n            <Link to="/admin/financeiro">\n              <CircleDollarSign className="size-4" /> Financeiro\n            </Link>\n          </Button>\n        </div>\n\n'''
if quick_nav in admin:
    admin = admin.replace(quick_nav, "", 1)

admin_path.write_text(admin, encoding="utf-8")

sidebar = sidebar_path.read_text(encoding="utf-8")
sidebar = sidebar.replace(
    '{ to: "/admin/vendedores", label: "Vendedores", icon: BadgePercent, active: "sellers" as const },',
    '{ to: "/admin/vendedores", label: "Vendedores e comissões", icon: BadgePercent, active: "sellers" as const },',
    1,
)
sidebar_path.write_text(sidebar, encoding="utf-8")

print("Persistent admin sidebar patch applied.")
