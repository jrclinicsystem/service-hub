import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useLocation,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { CalendarDays, CircleDollarSign, Sparkles } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";

import { jrClinicIconDataUrl } from "@/assets/jr-clinic-icon";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { SupportWhatsapp } from "@/components/support-whatsapp";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import paymentOptionsCss from "../payment-options.css?url";
import adminNavigationCss from "../admin-navigation.css?url";
import adminInlinePanelsCss from "../admin-inline-panels.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

const CatalogInlinePage = lazy(async () => {
  const module = await import("./admin_.catalogo");
  return { default: module.Route.options.component as ComponentType };
});

const TeamInlinePage = lazy(async () => {
  const module = await import("./admin_.equipe");
  return { default: module.Route.options.component as ComponentType };
});

const FinanceInlinePage = lazy(async () => {
  const module = await import("./admin_.financeiro");
  return { default: module.Route.options.component as ComponentType };
});

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">Esta página não existe ou foi movida.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Esta página não carregou</h1>
        <p className="mt-2 text-sm text-muted-foreground">Algo deu errado. Tente novamente ou volte ao início.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0f4d3e" },
      { title: "JR Clinic — Plataforma de serviços clínicos" },
      { name: "description", content: "Consultas, exames e terapias com agendamento online na JR Clinic." },
      { name: "author", content: "JR Clinic" },
      { property: "og:title", content: "JR Clinic — Plataforma de serviços clínicos" },
      { property: "og:description", content: "Consultas, exames e terapias com agendamento online na JR Clinic." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: paymentOptionsCss },
      { rel: "stylesheet", href: adminNavigationCss },
      { rel: "stylesheet", href: adminInlinePanelsCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: jrClinicIconDataUrl, type: "image/png" },
      { rel: "apple-touch-icon", href: jrClinicIconDataUrl },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

type InlineAdminSection = "catalog" | "team" | "finance" | null;

function SystemAccess() {
  const location = useLocation();
  const [inlineSection, setInlineSection] = useState<InlineAdminSection>(null);
  const isInternalArea = location.pathname.startsWith("/admin") || location.pathname === "/profissional";
  const showAdminShortcuts = location.pathname === "/admin";

  useEffect(() => {
    if (!showAdminShortcuts) {
      setInlineSection(null);
      return;
    }

    void import("./admin_.catalogo");
    void import("./admin_.equipe");
    void import("./admin_.financeiro");
  }, [showAdminShortcuts]);

  useEffect(() => {
    if (!showAdminShortcuts) return;

    const section = (location.hash || "").replace(/^#/, "");
    if (section === "catalogo") {
      setInlineSection("catalog");
      return;
    }
    if (section === "equipe") {
      setInlineSection("team");
      return;
    }
    if (section === "financeiro") {
      setInlineSection("finance");
      return;
    }

    const labels: Record<string, string> = {
      agendamentos: "Agendamentos",
      servicos: "Serviços",
      promocoes: "Promoções",
      horarios: "Horários",
      acessos: "Acessos",
    };
    const targetLabel = labels[section];
    if (!targetLabel) return;

    setInlineSection(null);
    const timer = window.setTimeout(() => {
      const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
      const target = tabs.find((tab) => (tab.textContent || "").includes(targetLabel));
      target?.click();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [location.hash, showAdminShortcuts]);

  useEffect(() => {
    if (!showAdminShortcuts) return;

    const handleTabClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[role="tab"]')) return;
      setInlineSection(null);
      window.history.replaceState(window.history.state, "", "/admin");
    };

    document.addEventListener("click", handleTabClick);
    return () => document.removeEventListener("click", handleTabClick);
  }, [showAdminShortcuts]);

  const openInlineSection = (section: Exclude<InlineAdminSection, null>) => {
    setInlineSection(section);
    const hash = section === "catalog" ? "catalogo" : section === "team" ? "equipe" : "financeiro";
    window.history.replaceState(window.history.state, "", `/admin#${hash}`);
  };

  const InlinePage =
    inlineSection === "catalog"
      ? CatalogInlinePage
      : inlineSection === "team"
        ? TeamInlinePage
        : inlineSection === "finance"
          ? FinanceInlinePage
          : null;

  return (
    <>
      <Outlet />
      {showAdminShortcuts ? (
        <>
          <button
            type="button"
            onClick={() => openInlineSection("catalog")}
            className={`admin-sidebar-shortcut admin-catalog-shortcut${inlineSection === "catalog" ? " is-active" : ""}`}
            aria-pressed={inlineSection === "catalog"}
          >
            <Sparkles className="size-4 shrink-0 opacity-80" />
            <span>Destaque do catálogo</span>
          </button>
          <button
            type="button"
            onClick={() => openInlineSection("team")}
            className={`admin-sidebar-shortcut admin-team-shortcut${inlineSection === "team" ? " is-active" : ""}`}
            aria-pressed={inlineSection === "team"}
          >
            <CalendarDays className="size-4 shrink-0 opacity-80" />
            <span>Agenda da equipe</span>
          </button>
          <button
            type="button"
            onClick={() => openInlineSection("finance")}
            className={`admin-sidebar-shortcut admin-finance-shortcut${inlineSection === "finance" ? " is-active" : ""}`}
            aria-pressed={inlineSection === "finance"}
          >
            <CircleDollarSign className="size-4 shrink-0 opacity-80" />
            <span>Financeiro</span>
          </button>
        </>
      ) : null}

      {showAdminShortcuts && InlinePage ? (
        <div className="admin-inline-overlay">
          <Suspense
            fallback={
              <div className="admin-inline-loading">
                <div><span /><span /><span /> Carregando</div>
              </div>
            }
          >
            <InlinePage />
          </Suspense>
        </div>
      ) : null}

      {!isInternalArea ? <SupportWhatsapp /> : null}
      {!isInternalArea ? <MobileBottomNav /> : null}
    </>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <SystemAccess />
      <Toaster />
    </QueryClientProvider>
  );
}
