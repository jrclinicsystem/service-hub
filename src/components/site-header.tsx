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
    <>
      <header className="fixed inset-x-0 top-0 z-[100] w-full border-b border-primary-foreground/10 bg-primary shadow-[0_10px_30px_rgba(0,0,0,0.10)]">
        <div className="mx-auto flex h-20 max-w-[1520px] items-center justify-between px-4 sm:h-[92px] sm:px-8 md:h-[104px] lg:px-10">
          <Link to="/" preload="intent" className="flex items-center">
            <img src={logo} alt="JR Clinic" className="h-11 w-auto brightness-0 invert sm:h-[58px] md:h-[66px]" />
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-primary-foreground/75 md:flex lg:gap-9">
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
            <Button asChild variant="ghost" size="sm" className="h-12 rounded-full px-5 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
              <Link to="/minha-conta" preload="intent">Minha conta</Link>
            </Button>
            <Button asChild size="sm" className="h-12 rounded-full bg-accent px-5 text-primary-foreground hover:bg-accent/90 hover:text-primary-foreground">
              <Link to="/agendar" preload="intent">Agendar consulta</Link>
            </Button>
          </div>

          <div className="w-8 md:hidden" aria-hidden="true" />
        </div>
      </header>

      <div className="h-20 sm:h-[92px] md:h-[104px]" aria-hidden="true" />
    </>
  );
}
