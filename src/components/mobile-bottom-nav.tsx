import { Link, useLocation } from "@tanstack/react-router";
import { CalendarDays, Home, LayoutGrid, UserRound } from "lucide-react";

const items = [
  { to: "/", label: "Início", icon: Home, exact: true },
  { to: "/catalogo", label: "Catálogo", icon: LayoutGrid, exact: false },
  { to: "/agendar", label: "Agendar", icon: CalendarDays, exact: false },
  { to: "/minha-conta", label: "Conta", icon: UserRound, exact: false },
] as const;

export function MobileBottomNav() {
  const location = useLocation();
  const hidden = location.pathname === "/auth" || location.pathname.startsWith("/admin");

  if (hidden) return null;

  return (
    <nav
      aria-label="Navegação rápida"
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-border/80 bg-card/95 px-2 pb-[max(7px,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              preload="intent"
              activeOptions={{ exact: item.exact }}
              activeProps={{ className: "bg-primary-soft text-primary" }}
              className="flex min-h-[50px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium text-muted-foreground transition-colors"
            >
              <Icon className="size-[18px]" strokeWidth={1.8} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
