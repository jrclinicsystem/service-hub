import { Link } from "@tanstack/react-router";

import logo from "@/assets/jr-clinic-logo.png";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Início" },
  { to: "/catalogo", label: "Catálogo" },
  { to: "/agendar", label: "Agendar" },
] as const;

export function SiteHeader() {
  return (
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

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link to="/minha-conta" preload="intent">Minha conta</Link>
          </Button>
          <Button asChild size="sm" className="rounded-full">
            <Link to="/agendar" preload="intent">Agendar consulta</Link>
          </Button>
        </div>

        <div className="w-8 md:hidden" aria-hidden="true" />
      </div>
    </header>
  );
}
