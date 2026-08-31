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
import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Plus,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Tag,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";

import logo from "@/assets/jr-clinic-logo.png";
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
type MainAdminSection = "agendamentos" | "servicos" | "promocoes" | "horarios" | "acessos";

const mainSectionLabels: Record<MainAdminSection, string> = {
  agendamentos: "Agendamentos",
  servicos: "Serviços",
  promocoes: "Promoções",
  horarios: "Horários",
  acessos: "Acessos",
};

const mainSectionIcons: Record<MainAdminSection, ComponentType<{ className?: string }>> = {
  agendamentos: CalendarDays,
  servicos: Stethoscope,
  promocoes: Tag,
  horarios: Clock3,
  acessos: ShieldCheck,
};

function PersistentAdminSidebar({
  inlineSection,
  activeMainSection,
  onMainSection,
  onInlineSection,
}: {
  inlineSection: InlineAdminSection;
  activeMainSection: MainAdminSection;
  onMainSection: (section: MainAdminSection) => void;
  onInlineSection: (section: Exclude<InlineAdminSection, null>) => void;
}) {
  return (
    <aside className="persistent-admin-sidebar" aria-label="Navegação administrativa">
      <div className="persistent-admin-sidebar-logo">
        <img src={logo} alt="JR Clinic" />
      </div>

      <div className="persistent-admin-sidebar-heading">
        <p>Administração</p>
        <span>Painel JR Clinic</span>
      </div>

      <nav className="persistent-admin-sidebar-nav">
        {Object.entries(mainSectionLabels).map(([key, label]) => {
          const section = key as MainAdminSection;
          const Icon = mainSectionIcons[section];
          const active = inlineSection === null && activeMainSection === section;
          return (
            <button
              key={section}
              type="button"
              className={`persistent-admin-sidebar-item${active ? " is-active" : ""}`}
              onClick={() => onMainSection(section)}
            >
              <Icon className="size-4 shrink-0" />
              <span>{label}</span>
            </button>
          );
        })}

        <button
          type="button"
          className={`persistent-admin-sidebar-item${inlineSection === "catalog" ? " is-active" : ""}`}
          onClick={() => onInlineSection("catalog")}
        >
          <Sparkles className="size-4 shrink-0" />
          <span>Destaque do catálogo</span>
        </button>

        <div className="persistent-admin-sidebar-divider" />

        <button
          type="button"
          className={`persistent-admin-sidebar-item${inlineSection === "team" ? " is-active" : ""}`}
          onClick={() => onInlineSection("team")}
        >
          <CalendarDays className="size-4 shrink-0" />
          <span>Agenda da equipe</span>
        </button>

        <button
          type="button"
          className={`persistent-admin-sidebar-item${inlineSection === "finance" ? " is-active" : ""}`}
          onClick={() => onInlineSection("finance")}
        >
          <CircleDollarSign className="size-4 shrink-0" />
          <span>Financeiro</span>
        </button>
      </nav>

      <Link to="/" className="persistent-admin-sidebar-site-link">
        <span>Ver site</span>
        <ExternalLink className="size-3.5" />
      </Link>
    </aside>
  );
}

function MobileAdminNav({
  inlineSection,
  activeMainSection,
  onMainSection,
  onInlineSection,
}: {
  inlineSection: InlineAdminSection;
  activeMainSection: MainAdminSection;
  onMainSection: (section: MainAdminSection) => void;
  onInlineSection: (section: Exclude<InlineAdminSection, null>) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive =
    inlineSection === "team" ||
    inlineSection === "finance" ||
    (inlineSection === null && activeMainSection === "acessos");

  const selectMain = (section: MainAdminSection) => {
    setMoreOpen(false);
    onMainSection(section);
  };

  const selectInline = (section: Exclude<InlineAdminSection, null>) => {
    setMoreOpen(false);
    onInlineSection(section);
  };

  const mainButton = (
    section: Exclude<MainAdminSection, "acessos">,
    label: string,
    Icon: ComponentType<{ className?: string }>,
  ) => {
    const active = inlineSection === null && activeMainSection === section;
    return (
      <button
        type="button"
        className={`admin-mobile-nav-item${active ? " is-active" : ""}`}
        onClick={() => selectMain(section)}
        aria-pressed={active}
      >
        <Icon className="admin-mobile-nav-icon" />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <>
      {moreOpen ? (
        <button
          type="button"
          className="admin-mobile-more-backdrop"
          aria-label="Fechar mais opções"
          onClick={() => setMoreOpen(false)}
        />
      ) : null}

      <div className="admin-mobile-nav" aria-label="Navegação administrativa móvel">
        {moreOpen ? (
          <div id="admin-mobile-more-menu" className="admin-mobile-more-menu" role="menu" aria-label="Mais opções">
            <button type="button" className="admin-mobile-more-option" role="menuitem" onClick={() => selectInline("finance")}>
              <span className="admin-mobile-more-option-icon"><CircleDollarSign /></span>
              <span><strong>Financeiro</strong><small>Gestão financeira da clínica</small></span>
            </button>
            <button type="button" className="admin-mobile-more-option" role="menuitem" onClick={() => selectInline("team")}>
              <span className="admin-mobile-more-option-icon"><CalendarDays /></span>
              <span><strong>Agenda da equipe</strong><small>Agendas e profissionais</small></span>
            </button>
            <button type="button" className="admin-mobile-more-option" role="menuitem" onClick={() => selectMain("acessos")}>
              <span className="admin-mobile-more-option-icon"><ShieldCheck /></span>
              <span><strong>Acessos</strong><small>Permissões administrativas</small></span>
            </button>
          </div>
        ) : null}

        <nav className="admin-mobile-nav-bar">
          {mainButton("agendamentos", "Agenda", CalendarDays)}
          {mainButton("servicos", "Serviços", Stethoscope)}

          <button
            type="button"
            className={`admin-mobile-more-trigger${moreOpen ? " is-open" : ""}${moreActive ? " is-active" : ""}`}
            onClick={() => setMoreOpen((current) => !current)}
            aria-expanded={moreOpen}
            aria-controls="admin-mobile-more-menu"
          >
            <span className="admin-mobile-more-circle"><Plus /></span>
            <span>Mais</span>
          </button>

          {mainButton("promocoes", "Ofertas", Tag)}
          {mainButton("horarios", "Horários", Clock3)}
        </nav>
      </div>
    </>
  );
}

function SystemAccess() {
  const location = useLocation();
  const [inlineSection, setInlineSection] = useState<InlineAdminSection>(null);
  const [activeMainSection, setActiveMainSection] = useState<MainAdminSection>("agendamentos");
  const isInternalArea = location.pathname.startsWith("/admin") || location.pathname === "/profissional";
  const showAdminShortcuts = location.pathname === "/admin";

  const activateMainTab = (section: MainAdminSection) => {
    const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
    const target = tabs.find((tab) => (tab.textContent || "").includes(mainSectionLabels[section]));
    if (!target) return;

    // Radix Tabs changes value on mouse down. A synthetic .click() alone does not
    // activate a trigger that is visually hidden behind the custom mobile nav.
    target.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }),
    );
    target.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }),
    );
    target.click();
  };

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

    if (section in mainSectionLabels) {
      const mainSection = section as MainAdminSection;
      setInlineSection(null);
      setActiveMainSection(mainSection);
      const timer = window.setTimeout(() => activateMainTab(mainSection), 0);
      return () => window.clearTimeout(timer);
    }
  }, [location.hash, showAdminShortcuts]);

  useEffect(() => {
    if (!showAdminShortcuts) return;

    const handleTabClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[role="tab"]');
      if (!target) return;
      const text = target.textContent || "";
      const matched = (Object.keys(mainSectionLabels) as MainAdminSection[]).find((section) =>
        text.includes(mainSectionLabels[section]),
      );
      if (matched) setActiveMainSection(matched);
      setInlineSection(null);
      window.history.replaceState(window.history.state, "", "/admin");
    };

    document.addEventListener("click", handleTabClick);
    return () => document.removeEventListener("click", handleTabClick);
  }, [showAdminShortcuts]);

  const openMainSection = (section: MainAdminSection) => {
    setInlineSection(null);
    setActiveMainSection(section);
    window.history.replaceState(window.history.state, "", `/admin#${section}`);
    window.setTimeout(() => activateMainTab(section), 0);
  };

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
          <a href="/admin/equipe" className="admin-sidebar-presence-anchor" aria-hidden="true" tabIndex={-1} />

          <PersistentAdminSidebar
            inlineSection={inlineSection}
            activeMainSection={activeMainSection}
            onMainSection={openMainSection}
            onInlineSection={openInlineSection}
          />

          <MobileAdminNav
            inlineSection={inlineSection}
            activeMainSection={activeMainSection}
            onMainSection={openMainSection}
            onInlineSection={openInlineSection}
          />

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