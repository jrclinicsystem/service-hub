import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";

import logo from "@/assets/jr-clinic-logo.png";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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

        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="hidden rounded-full md:inline-flex">
            <Link to="/agendar" preload="intent">
              Agendar consulta
            </Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 rounded-full md:hidden" aria-label="Abrir menu">
                <Menu className="size-4.5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[82vw] max-w-72 px-5">
              <SheetTitle className="font-display text-lg">JR Clinic</SheetTitle>
              <p className="mt-1 text-xs text-muted-foreground">Acesse rapidamente o que precisa.</p>
              <nav className="mt-6 flex flex-col gap-1">
                {nav.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    preload="intent"
                    activeOptions={{ exact: item.to === "/" }}
                    activeProps={{ className: "bg-secondary text-foreground font-medium" }}
                    className="rounded-xl px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  to="/auth"
                  className="rounded-xl px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Entrar na conta
                </Link>
              </nav>
              <Button asChild className="mt-5 w-full rounded-full">
                <Link to="/agendar">Agendar consulta</Link>
              </Button>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
