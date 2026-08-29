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
    title: "Agenda em tempo real",
    text: "Escolha data e horário disponíveis e confirme em menos de um minuto.",
  },
  {
    icon: ShieldCheck,
    title: "Equipe verificada",
    text: "Profissionais com registro ativo e histórico de avaliações abertas.",
  },
  {
    icon: Sparkles,
    title: "Cuidado continuado",
    text: "Cada serviço inclui plano de acompanhamento e retorno orientado.",
  },
];

function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <span className="eyebrow text-accent-foreground">Plataforma de serviços clínicos</span>
            <h1 className="mt-5 max-w-[20ch] text-4xl leading-[1.05] font-semibold text-balance sm:text-5xl">
              Cuidar da sua saúde, com calma e precisão.
            </h1>
            <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-muted-foreground">
              Consultas, terapias e exames organizados em um catálogo simples. Escolha o serviço
              certo, veja quem atende e reserve seu horário.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full">
                <Link to="/catalogo">
                  Explorar catálogo
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            <dl className="mt-12 grid grid-cols-3 gap-6 border-t border-border pt-8">
              <div>
                <dt className="text-sm text-muted-foreground">Serviços</dt>
                <dd className="font-display text-2xl font-semibold">{services.length}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Especialidades</dt>
                <dd className="font-display text-2xl font-semibold">{categories.length}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Avaliação média</dt>
                <dd className="font-display text-2xl font-semibold">4,8</dd>
              </div>
            </dl>
          </div>

          <div className="relative">
            <img
              src={heroImage}
              alt="Recepção iluminada da JR Clinic com madeira clara e plantas"
              width={1280}
              height={1600}
              className="aspect-4/5 w-full rounded-3xl object-cover shadow-lift"
            />
            <div className="absolute -bottom-5 left-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-soft">
              <p className="text-xs text-muted-foreground">Próxima disponibilidade</p>
              <p className="font-display text-lg font-semibold">Hoje, 14:30</p>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-8 md:grid-cols-3">
            {highlights.map((item) => (
              <div key={item.title}>
                <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
                  <item.icon className="size-5" />
                </span>
                <h2 className="mt-4 text-lg font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="eyebrow text-muted-foreground">Especialidades</span>
              <h2 className="mt-2 text-3xl font-semibold">Escolha por categoria</h2>
            </div>
            <Link
              to="/catalogo"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Ver catálogo completo
            </Link>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <Link
                key={category.id}
                to="/catalogo"
                search={{ categoria: category.id }}
                className="card-lift rounded-2xl border border-border bg-card p-5 shadow-soft"
              >
                <h3 className="text-lg font-semibold">{category.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {category.description}
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  {services.filter((s) => s.categoryId === category.id).length === 1
                    ? "1 serviço"
                    : `${services.filter((s) => s.categoryId === category.id).length} serviços`}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-8 sm:px-8">
          <span className="eyebrow text-muted-foreground">Em destaque</span>
          <h2 className="mt-2 text-3xl font-semibold">Serviços mais agendados</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.slice(0, 3).map((service) => (
              <ServiceCard key={service.slug} service={service} />
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
