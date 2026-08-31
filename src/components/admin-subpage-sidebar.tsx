import { Link } from "@tanstack/react-router";
import { CalendarDays, ExternalLink, LayoutDashboard, Sparkles } from "lucide-react";

import logo from "@/assets/jr-clinic-logo.png";

const items = [
  { to: "/admin", label: "Painel de controle", icon: LayoutDashboard },
  { to: "/admin/equipe", label: "Agenda da equipe", icon: CalendarDays },
  { to: "/admin/catalogo", label: "Destaque do catálogo", icon: Sparkles },
] as const;

export function AdminSubpageSidebar({ active }: { active: "team" | "catalog" }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-[252px] flex-col border-r border-primary-foreground/10 bg-primary text-primary-foreground lg:flex">
      <div className="flex h-20 items-center border-b border-white/10 px-6">
        <img src={logo} alt="JR Clinic" className="h-10 w-auto brightness-0 invert" />
      </div>

      <div className="px-5 pb-2 pt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Administração</p>
        <p className="mt-1 text-sm font-medium text-white/85">Painel JR Clinic</p>
      </div>

      <nav className="mt-3 space-y-1.5 px-3">
        {items.map((item) => {
          const selected =
            (active === "team" && item.to === "/admin/equipe") ||
            (active === "catalog" && item.to === "/admin/catalogo");
          const Icon = item.icon;

          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition ${
                selected
                  ? "bg-white text-primary shadow-sm"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto p-4">
        <Link
          to="/"
          className="flex min-h-10 items-center justify-between rounded-xl border border-white/10 px-3.5 text-xs font-medium text-white/65 transition hover:bg-white/10 hover:text-white"
        >
          Ver site
          <ExternalLink className="size-3.5" />
        </Link>
      </div>
    </aside>
  );
}
