import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useLocation,
  useNavigate,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { jrClinicIconDataUrl } from "@/assets/jr-clinic-icon";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { SupportWhatsapp } from "@/components/support-whatsapp";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

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

function SystemAccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const requiresLogin = location.pathname === "/agendar";
  const isInternalArea = location.pathname.startsWith("/admin") || location.pathname === "/profissional";
  const showTeamAgendaShortcut = location.pathname === "/admin";

  useEffect(() => {
    if (!requiresLogin || loading || user) return;
    const next = `${window.location.pathname}${window.location.search}`;
    void navigate({ to: "/auth", search: { next }, replace: true });
  }, [requiresLogin, loading, user, navigate]);

  if (requiresLogin && (loading || !user)) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-5">
        <div className="text-center">
          <div className="mx-auto size-9 animate-pulse rounded-2xl bg-primary-soft" />
          <p className="mt-3 text-sm text-muted-foreground">Entrando na área de agendamento...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Outlet />
      {showTeamAgendaShortcut ? (
        <Link
          to="/admin/equipe"
          className="fixed bottom-4 left-4 z-[80] inline-flex h-11 items-center justify-center rounded-full border border-primary/15 bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5 sm:bottom-6 sm:left-6 sm:px-5 sm:text-sm"
        >
          Agenda da equipe
        </Link>
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
