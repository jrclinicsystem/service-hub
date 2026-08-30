import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import heroImage from "@/assets/hero-clinic.jpg";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getCatalog } from "@/lib/clinic.functions";

const title = "JR Clinic — Consultas, exames e agendamento online";
const description =
  "Catálogo de serviços clínicos da JR Clinic com valores, detalhes e agendamento online em poucos passos.";

export const Route = createFileRoute("/")({
  loader: () => getCatalog(),
  staleTime: 0,
  preloadStaleTime: 0,
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Home,
});

function Home() {
  const catalog = Route.useLoaderData();

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <SiteHeader />

      <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-[1440px] items-center px-4 pb-24 pt-6 sm:min-h-[calc(100dvh-4rem)] sm:px-8 sm:py-10 md:pb-10 lg:py-12">
        <section className="grid w-full items-center gap-7 sm:gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div className="home-copy min-w-0">
            <span className="eyebrow text-accent-foreground max-sm:text-[10px]">
              Plataforma de serviços clínicos
            </span>

            <h1 className="mt-3 max-w-[20ch] text-[34px] font-semibold leading-[1.03] text-balance sm:mt-5 sm:text-5xl lg:text-[52px]">
              Cuidar da sua saúde, com calma e precisão.
            </h1>

            <p className="mt-3 max-w-[46ch] text-sm leading-relaxed text-muted-foreground sm:mt-5 sm:text-base">
              Consultas, terapias e exames em um só lugar. Escolha o serviço, veja quem atende e reserve seu horário.
            </p>

            <div className="mt-5 sm:mt-8">
              <Button asChild size="lg" className="w-full rounded-full sm:w-auto">
                <Link to="/catalogo">
                  Explorar catálogo
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            <dl className="mt-6 grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-card py-3 shadow-soft sm:mt-10 sm:gap-6 sm:divide-x-0 sm:rounded-none sm:border-x-0 sm:border-b-0 sm:bg-transparent sm:pt-7 sm:shadow-none">
              <div className="px-2 text-center sm:px-0 sm:text-left">
                <dt className="text-[10px] text-muted-foreground sm:text-sm">Serviços</dt>
                <dd className="font-display text-xl font-semibold sm:text-2xl">{catalog.services.length}</dd>
              </div>
              <div className="px-2 text-center sm:px-0 sm:text-left">
                <dt className="text-[10px] text-muted-foreground sm:text-sm">Especialidades</dt>
                <dd className="font-display text-xl font-semibold sm:text-2xl">{catalog.categories.length}</dd>
              </div>
              <div className="px-2 text-center sm:px-0 sm:text-left">
                <dt className="text-[10px] text-muted-foreground sm:text-sm">Avaliação</dt>
                <dd className="font-display text-xl font-semibold sm:text-2xl">4,8</dd>
              </div>
            </dl>
          </div>

          <div className="home-hero relative min-w-0">
            <img
              src={heroImage}
              alt="Recepção iluminada da JR Clinic com madeira clara e plantas"
              width={1280}
              height={1600}
              className="home-hero-image aspect-[16/10] w-full rounded-2xl object-cover shadow-lift sm:aspect-4/5 sm:rounded-3xl lg:max-h-[640px]"
            />

            <div className="home-availability absolute -bottom-3 left-3 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-soft backdrop-blur sm:-bottom-4 sm:left-4 sm:rounded-2xl sm:px-5 sm:py-4">
              <p className="text-[9px] text-muted-foreground sm:text-xs">Próxima disponibilidade</p>
              <p className="font-display text-sm font-semibold sm:text-lg">Hoje, 14:30</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
