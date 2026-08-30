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
    <header className="sticky top-0 z-40 border-b border-primary-foreground/10 bg-primary/95 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1520px] items-center justify-between px-4 sm:h-16 sm:px-8 md:h-[72px] lg:px-10">
        <Link to="/" preload="intent" className="flex items-center">
          <img src={logo} alt="JR Clinic" className="h-8 w-auto brightness-0 invert sm:h-11 md:h-12" />
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-primary-foreground/70 md:flex lg:gap-9">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              preload="intent"
              activeOptions={{ exact: item.to === "/" }}
              activeProps={{ className: "text-primary-foreground font-medium" }}
              className="transition-colors hover:text-primary-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 md:flex">
          <Button asChild variant="ghost" size="sm" className="h-10 rounded-full px-4 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
            <Link to="/minha-conta" preload="intent">Minha conta</Link>
          </Button>
          <Button asChild size="sm" className="h-10 rounded-full bg-accent px-4 text-primary-foreground hover:bg-accent/90 hover:text-primary-foreground">
            <Link to="/agendar" preload="intent">Agendar consulta</Link>
          </Button>
        </div>

        <div className="w-8 md:hidden" aria-hidden="true" />
      </div>
    </header>
  );
}
