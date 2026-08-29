import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck, ShieldCheck, Sparkles } from "lucide-react";

import heroImage from "@/assets/hero-clinic.jpg";
import { ServiceCard } from "@/components/service-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { categories, services } from "@/data/clinic";

const title = "JR Clinic — Consultas, exames e agendamento online";
const description =
  "Catálogo de serviços clínicos da JR Clinic: consultas, nutrição, psicologia, fisioterapia e exames com agendamento online em poucos passos.";

export const Route = createFileRoute("/")({
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

const highlights = [
  {
    icon: CalendarCheck,
    title: "Agenda rápida",
    desktopTitle: "Agenda em tempo real",
    text: "Escolha data e horário disponíveis e confirme em menos de um minuto.",
  },
  {
    icon: ShieldCheck,
    title: "Equipe segura",
    desktopTitle: "Equipe verificada",
    text: "Profissionais com registro ativo e histórico de avaliações abertas.",
  },
  {
    icon: Sparkles,
    title: "Acompanhamento",
    desktopTitle: "Cuidado continuado",
    text: "Cada serviço inclui plano de acompanhamento e retorno orientado.",
  },
];

function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <section className="mx-auto grid max-w-[1440px] items-center gap-6 px-4 py-7 sm:gap-12 sm:px-8 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <span className="eyebrow text-accent-foreground max-sm:text-[10px]">Plataforma de serviços clínicos</span>
            <h1 className="mt-3 max-w-[20ch] text-[34px] font-semibold leading-[1.03] text-balance sm:mt-5 sm:text-5xl">
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

            <dl className="mt-6 grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-card py-3 shadow-soft sm:mt-12 sm:gap-6 sm:divide-x-0 sm:rounded-none sm:border-x-0 sm:border-b-0 sm:bg-transparent sm:pt-8 sm:shadow-none">
              <div className="px-2 text-center sm:px-0 sm:text-left">
                <dt className="text-[10px] text-muted-foreground sm:text-sm">Serviços</dt>
                <dd className="font-display text-xl font-semibold sm:text-2xl">{services.length}</dd>
              </div>
              <div className="px-2 text-center sm:px-0 sm:text-left">
                <dt className="text-[10px] text-muted-foreground sm:text-sm">Especialidades</dt>
                <dd className="font-display text-xl font-semibold sm:text-2xl">{categories.length}</dd>
              </div>
              <div className="px-2 text-center sm:px-0 sm:text-left">
                <dt className="text-[10px] text-muted-foreground sm:text-sm">Avaliação</dt>
                <dd className="font-display text-xl font-semibold sm:text-2xl">4,8</dd>
              </div>
            </dl>
          </div>

          <div className="relative">
            <img
              src={heroImage}
              alt="Recepção iluminada da JR Clinic com madeira clara e plantas"
              width={1280}
              height={1600}
              className="aspect-[16/10] w-full rounded-2xl object-cover shadow-lift sm:aspect-4/5 sm:rounded-3xl"
            />
            <div className="absolute -bottom-3 left-3 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-soft backdrop-blur sm:-bottom-5 sm:left-4 sm:rounded-2xl sm:px-5 sm:py-4">
              <p className="text-[9px] text-muted-foreground sm:text-xs">Próxima disponibilidade</p>
              <p className="font-display text-sm font-semibold sm:text-lg">Hoje, 14:30</p>
            </div>
          </div>
        </section>

        <section className="border-y border-primary bg-primary text-primary-foreground">
          <div className="mx-auto grid max-w-[1440px] grid-cols-3 gap-1 px-3 py-4 sm:gap-8 sm:px-8 sm:py-14 md:grid-cols-3">
            {highlights.map((item) => (
              <div key={item.title} className="rounded-xl px-1.5 py-2 text-center sm:rounded-none sm:px-0 sm:py-0 sm:text-left">
                <span className="mx-auto grid size-8 place-items-center rounded-lg bg-white/10 text-primary-foreground ring-1 ring-white/15 sm:mx-0 sm:size-10 sm:rounded-xl">
                  <item.icon className="size-4 sm:size-5" />
                </span>
                <h2 className="mt-2 text-[11px] font-semibold leading-tight sm:mt-4 sm:text-lg">
                  <span className="sm:hidden">{item.title}</span>
                  <span className="hidden sm:inline">{item.desktopTitle}</span>
                </h2>
                <p className="mt-2 hidden text-sm leading-relaxed text-primary-foreground/75 sm:block">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 sm:py-16">
          <div className="flex items-end justify-between gap-3">
            <div>
              <span className="eyebrow text-muted-foreground max-sm:text-[10px]">Especialidades</span>
              <h2 className="mt-1 text-xl font-semibold sm:mt-2 sm:text-3xl">Escolha por categoria</h2>
            </div>
            <Link
              to="/catalogo"
              className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline sm:text-sm"
            >
              Ver todas
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-8 sm:gap-4 lg:grid-cols-3">
            {categories.map((category) => (
              <Link
                key={category.id}
                to="/catalogo"
                search={{ categoria: category.id }}
                className="card-lift rounded-2xl border border-border bg-card p-3.5 shadow-soft sm:p-5"
              >
                <h3 className="text-sm font-semibold sm:text-lg">{category.name}</h3>
                <p className="mt-2 hidden text-sm leading-relaxed text-muted-foreground sm:block">
                  {category.description}
                </p>
                <p className="mt-1.5 text-[10px] text-muted-foreground sm:mt-4 sm:text-xs">
                  {services.filter((s) => s.categoryId === category.id).length === 1
                    ? "1 serviço"
                    : `${services.filter((s) => s.categoryId === category.id).length} serviços`}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-4 pb-8 sm:px-8">
          <span className="eyebrow text-muted-foreground max-sm:text-[10px]">Em destaque</span>
          <h2 className="mt-1 text-xl font-semibold sm:mt-2 sm:text-3xl">Serviços mais agendados</h2>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-8 sm:gap-5 lg:grid-cols-3">
            {services.slice(0, 4).map((service) => (
              <ServiceCard key={service.slug} service={service} compactMobile />
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
