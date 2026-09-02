import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Tag,
  UserRound,
  Users,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

import logo from "@/assets/jr-clinic-logo.png";

type ActiveSection = "home" | "team" | "catalog" | "finance" | "access" | "availability" | "clients";

const mainItems = [
  { hash: "agendamentos", label: "Agendamentos", icon: CalendarDays },
  { hash: "servicos", label: "Serviços", icon: Stethoscope },
  { hash: "promocoes", label: "Promoções", icon: Tag },
  { hash: "horarios", label: "Horários", icon: Clock3 },
] as const;

const secondaryItems = [
  { to: "/admin/equipe", label: "Agenda da equipe", icon: Users, active: "team" as const },
  { to: "/admin/acessos", label: "Acessos", icon: ShieldCheck, active: "access" as const },
  { to: "/admin/financeiro", label: "Financeiro", icon: CircleDollarSign, active: "finance" as const },
] as const;

const itemClass = (selected: boolean, plainActive = false) =>
  `flex min-h-11 items-center gap-3 rounded-xl border px-3.5 text-[13px] font-medium transition ${
    selected
      ? plainActive
        ? "border-transparent bg-transparent text-white shadow-none"
        : "border-white/12 bg-white/12 text-white shadow-sm"
      : "border-transparent text-white/70 hover:bg-white/[0.07] hover:text-white"
  }`;

export function AdminSubpageSidebar({ active }: { active: ActiveSection }) {
  return (
    <aside className="admin-subpage-sidebar fixed inset-y-0 left-0 z-50 hidden w-[252px] flex-col border-r border-primary-foreground/10 bg-primary text-primary-foreground lg:flex">
      <Link to="/admin" preload="intent" className="flex h-20 items-center border-b border-white/10 px-6">
        <img src={logo} alt="JR Clinic" className="h-10 w-auto brightness-0 invert" />
      </Link>

      <div className="px-5 pb-2 pt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Administração</p>
        <p className="mt-1 text-sm font-medium text-white/85">Painel JR Clinic</p>
      </div>

      <nav className="mt-3 px-3">
        <div className="space-y-1.5">
          {mainItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.hash}
                to="/admin"
                hash={item.hash}
                preload="intent"
                className={itemClass(false)}
              >
                <Icon className="size-4 shrink-0 opacity-80" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <Link to="/admin/disponibilidade" preload="intent" className={itemClass(active === "availability")}>
            <Clock3 className="size-4 shrink-0 opacity-80" />
            <span>Disponibilidade</span>
          </Link>

          <Link to="/admin/catalogo" preload="intent" className={itemClass(active === "catalog")}>
            <Sparkles className="size-4 shrink-0 opacity-80" />
            <span>Destaque do catálogo</span>
          </Link>

          <Link to="/admin/clientes" preload="intent" className={itemClass(active === "clients")}>
            <UserRound className="size-4 shrink-0 opacity-80" />
            <span>Clientes</span>
          </Link>
        </div>

        <div className="my-3 border-t border-white/12" />

        <div className="space-y-1.5">
          {secondaryItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                preload="intent"
                className={itemClass(active === item.active, item.active === "team")}
              >
                <Icon className="size-4 shrink-0 opacity-80" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mt-auto p-4">
        <Link
          to="/"
          preload="intent"
          className="flex min-h-10 items-center justify-between rounded-xl border border-white/10 px-3.5 text-xs font-medium text-white/65 transition hover:bg-white/10 hover:text-white"
        >
          Ver site
          <ExternalLink className="size-3.5" />
        </Link>
      </div>
    </aside>
  );
}
