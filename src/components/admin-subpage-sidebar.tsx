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

type ActiveSection = "team" | "catalog" | "finance" | "access" | "availability" | "clients";

const mainItems = [
  { href: "/admin#agendamentos", label: "Agendamentos", icon: CalendarDays },
  { href: "/admin#servicos", label: "Serviços", icon: Stethoscope },
  { href: "/admin#promocoes", label: "Promoções", icon: Tag },
  { href: "/admin#horarios", label: "Horários", icon: Clock3 },
] as const;

const secondaryItems = [
  { to: "/admin/equipe", label: "Agenda da equipe", icon: Users, active: "team" as const },
  { to: "/admin/disponibilidade", label: "Disponibilidade", icon: Clock3, active: "availability" as const },
  { to: "/admin/clientes", label: "Clientes", icon: UserRound, active: "clients" as const },
  { to: "/admin/acessos", label: "Acessos", icon: ShieldCheck, active: "access" as const },
  { to: "/admin/financeiro", label: "Financeiro", icon: CircleDollarSign, active: "finance" as const },
] as const;

const itemClass = (selected: boolean) =>
  `flex min-h-11 items-center gap-3 rounded-xl border px-3.5 text-[13px] font-medium transition ${
    selected
      ? "border-white/12 bg-white/12 text-white shadow-sm"
      : "border-transparent text-white/70 hover:bg-white/[0.07] hover:text-white"
  }`;

export function AdminSubpageSidebar({ active }: { active: ActiveSection }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-[252px] flex-col border-r border-primary-foreground/10 bg-primary text-primary-foreground lg:flex">
      <Link to="/admin" className="flex h-20 items-center border-b border-white/10 px-6">
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
              <a key={item.href} href={item.href} className={itemClass(false)}>
                <Icon className="size-4 shrink-0 opacity-80" />
                <span>{item.label}</span>
              </a>
            );
          })}

          <Link to="/admin/catalogo" className={itemClass(active === "catalog")}>
            <Sparkles className="size-4 shrink-0 opacity-80" />
            <span>Destaque do catálogo</span>
          </Link>
        </div>

        <div className="my-3 border-t border-white/12" />

        <div className="space-y-1.5">
          {secondaryItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} className={itemClass(active === item.active)}>
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
          className="flex min-h-10 items-center justify-between rounded-xl border border-white/10 px-3.5 text-xs font-medium text-white/65 transition hover:bg-white/10 hover:text-white"
        >
          Ver site
          <ExternalLink className="size-3.5" />
        </Link>
      </div>
    </aside>
  );
}
