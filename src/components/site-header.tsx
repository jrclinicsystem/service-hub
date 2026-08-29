import { Link } from "@tanstack/react-router";
import { CalendarDays, Home, LayoutGrid, UserRound } from "lucide-react";

import logo from "@/assets/jr-clinic-logo.png";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Início" },
  { to: "/catalogo", label: "Catálogo" },
  { to: "/agendar", label: "Agendar" },
] as const;

const mobileNav = [
  { to: "/", label: "Início", icon: Home, exact: true },
  { to: "/catalogo", label: "Catálogo", icon: LayoutGrid, exact: false },
  { to: "/agendar", label: "Agendar", icon: CalendarDays, exact: false },
  { to: "/minha-conta", label: "Conta", icon: UserRound, exact: false },
] as const;

export function SiteHeader() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 sm:h-16 sm:px-8">
          <Link to="/" preload="intent" className="flex items-center">
            <img src={logo} alt="JR Clinic" className="h-8 w-auto sm:h-11" />
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                preload="intent"
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{ className: "text-foreground font-medium" }}
                className="transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Button asChild size="sm" className="hidden rounded-full md:inline-flex">
            <Link to="/agendar" preload="intent">
              Agendar consulta
            </Link>
          </Button>

          <div className="md:hidden" aria-hidden="true" />
        </div>
      </header>

      <nav
        aria-label="Navegação rápida"
        className="fixed inset-x-0 bottom-0 z-[60] border-t border-border/80 bg-card/95 px-2 pb-[max(7px,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          {mobileNav.map((item) => {
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
    </>
  );
}
