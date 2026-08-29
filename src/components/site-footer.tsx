import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-display text-lg font-semibold">JR Clinic</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuidado clínico com calma e precisão. Dados de demonstração.
          </p>
        </div>
        <nav className="flex flex-wrap gap-6 text-sm text-muted-foreground">
          <Link to="/catalogo" className="transition-colors hover:text-foreground">
            Catálogo
          </Link>
          <Link to="/agendar" className="transition-colors hover:text-foreground">
            Agendar
          </Link>
          <Link to="/admin" className="transition-colors hover:text-foreground">
            Painel
          </Link>
        </nav>
      </div>
    </footer>
  );
}
