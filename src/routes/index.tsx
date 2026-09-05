import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck2, MapPin, Navigation, UsersRound } from "lucide-react";

import heroAsset from "@/assets/hero-clinic-recepcao-2.jpg.asset.json";

const heroImage = heroAsset.url;
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getHomeOverview } from "@/lib/clinic.functions";

const title = "JR Clinic - Procedimentos | Profissionais | Agendamento Online";
const description =
  "Conheça os procedimentos, profissionais e faça seu agendamento online na JR Clinic.";

const tickerItems = [
  "Odontologia",
  "Estética",
  "Cabelos",
  "Clareamento",
  "Make & Hair",
  "Mega Hair",
  "Agendamento online",
];

export const Route = createFileRoute("/")({
  loader: () => getHomeOverview(),
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
  const locationUrl = catalog.mapsUrl || (catalog.businessAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(catalog.businessAddress)}`
    : null);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <style>{`
        @keyframes jr-home-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes jr-home-status {
          0%, 100% { box-shadow: 0 0 0 0 rgba(15, 77, 62, 0.18); }
          50% { box-shadow: 0 0 0 7px rgba(15, 77, 62, 0); }
        }
        .jr-home-marquee-track {
          width: max-content;
          animation: jr-home-marquee 28s linear infinite;
        }
        .jr-home-status-dot {
          animation: jr-home-status 2.8s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .jr-home-marquee-track,
          .jr-home-status-dot {
            animation: none !important;
          }
        }
      `}</style>

      <SiteHeader />

      <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-[1480px] items-center px-4 pb-24 pt-7 sm:min-h-[calc(100dvh-4rem)] sm:px-8 sm:py-10 md:pb-10 lg:px-10 lg:py-12">
        <section className="grid w-full items-center gap-9 sm:gap-12 lg:grid-cols-[1.18fr_0.82fr] lg:gap-16 xl:gap-20">
          <div className="home-copy min-w-0 text-center sm:text-left lg:-translate-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-card/65 px-3 py-1.5 shadow-[0_12px_30px_-26px_rgba(15,77,62,0.55)] backdrop-blur">
              <span className="jr-home-status-dot size-1.5 rounded-full bg-primary" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-primary/75 sm:text-[10px]">
                Plataforma integrada JR Clinic
              </span>
            </div>

            <h1 className="mx-auto mt-4 max-w-[18ch] text-[42px] font-semibold leading-[0.98] tracking-[-0.025em] text-balance sm:mx-0 sm:mt-6 sm:text-[58px] lg:text-[68px] xl:text-[74px]">
              Cuidar da sua saúde, com calma e precisão.
            </h1>

            <p className="mx-auto mt-5 max-w-[48ch] text-[15px] leading-7 text-muted-foreground sm:mx-0 sm:mt-6 sm:text-[17px] sm:leading-8 lg:max-w-[46ch]">
              Odontologia, estética e cuidados de beleza em um só lugar. Escolha o serviço, conheça quem atende e reserve seu horário com poucos passos.
            </p>

            <div className="mt-7 flex flex-col items-center gap-3 sm:mt-9 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="h-12 w-full rounded-full px-7 shadow-[0_14px_28px_-20px_rgba(15,77,62,0.8)] sm:w-auto">
                <Link to="/catalogo">
                  Explorar catálogo
                  <ArrowRight className="size-4" />
                </Link>
              </Button>

              <Link
                to="/agendar"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/5 sm:justify-start"
              >
                <CalendarCheck2 className="size-4 text-accent" />
                Agendar atendimento
              </Link>
            </div>

            <div className="mx-auto mt-8 max-w-[650px] overflow-hidden rounded-full border border-primary/10 bg-card/55 py-2.5 shadow-[0_18px_36px_-32px_rgba(15,77,62,0.65)] backdrop-blur sm:mx-0 sm:mt-11">
              <div className="jr-home-marquee-track flex items-center">
                {[...tickerItems, ...tickerItems].map((item, index) => (
                  <div key={`${item}-${index}`} className="flex shrink-0 items-center">
                    <span className="whitespace-nowrap px-4 text-[10px] font-medium uppercase tracking-[0.14em] text-primary/65 sm:px-5 sm:text-[11px]">
                      {item}
                    </span>
                    <span className="size-1 rounded-full bg-accent/65" />
                  </div>
                ))}
              </div>
            </div>

            {catalog.businessAddress ? (
              <div className="mx-auto mt-4 flex max-w-[650px] flex-col gap-3 rounded-2xl border border-primary/10 bg-card/75 p-3.5 text-left shadow-[0_18px_36px_-32px_rgba(15,77,62,0.5)] backdrop-blur sm:mx-0 sm:mt-5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <MapPin className="size-4.5" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-primary/70 sm:text-[10px]">Onde estamos</p>
                    <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-5 text-foreground sm:text-sm">{catalog.businessAddress}</p>
                  </div>
                </div>
                {locationUrl ? (
                  <a
                    href={locationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-primary/15 bg-background px-4 text-xs font-semibold text-primary transition hover:bg-primary/5"
                  >
                    <Navigation className="size-3.5" />
                    Ver rota
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="home-hero relative min-w-0 lg:pl-2">
            <div className="relative overflow-visible">
              <img
                src={heroImage}
                alt="Recepção iluminada da JR Clinic com madeira clara e plantas"
                width={1280}
                height={1600}
                className="home-hero-image aspect-[16/10] w-full rounded-[26px] object-cover shadow-lift sm:aspect-4/5 sm:rounded-[34px] lg:max-h-[650px]"
              />

              <div className="home-availability absolute left-3 top-3 flex items-center gap-3 rounded-2xl border border-white/65 bg-card/92 px-3.5 py-3 shadow-[0_20px_44px_-28px_rgba(15,77,62,0.5)] backdrop-blur-xl sm:-left-7 sm:top-16 sm:px-4 sm:py-3.5">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:size-10">
                  <UsersRound className="size-4 sm:size-[18px]" strokeWidth={1.8} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="jr-home-status-dot size-1.5 rounded-full bg-primary" />
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary/65 sm:text-[10px]">
                      Equipe ativa
                    </p>
                  </div>
                  <p className="mt-0.5 font-display text-[15px] font-semibold leading-tight text-primary sm:text-lg">
                    {catalog.activeProfessionals} profissionais
                  </p>
                </div>
              </div>

              <Link
                to="/agendar"
                className="home-availability group absolute -bottom-3 right-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-soft backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-elegant sm:-bottom-5 sm:right-5 sm:px-5 sm:py-4"
                aria-label="Agende seu horário"
              >
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-lg bg-accent/15 text-accent-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
                    <CalendarCheck2 className="size-3.5" />
                  </span>
                  <div>
                    <p className="text-[9px] text-muted-foreground sm:text-xs">Agende seu horário</p>
                    <p className="font-display text-sm font-semibold text-primary sm:text-lg">Escolha o melhor momento</p>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
