import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Check, Clock, Star } from "lucide-react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getServiceDetail } from "@/lib/clinic.functions";
import { formatPrice } from "@/lib/clinic";

export const Route = createFileRoute("/servico/$slug")({
  loader: async ({ params }) => {
    const detail = await getServiceDetail({ data: { slug: params.slug } });
    if (!detail) throw notFound();
    return detail;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Serviço não encontrado — JR Clinic" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { service } = loaderData;
    const title = `${service.name} — JR Clinic`;
    return {
      meta: [
        { title },
        { name: "description", content: service.summary },
        { property: "og:title", content: title },
        { property: "og:description", content: service.summary },
      ],
    };
  },
  component: ServiceDetail,
});

function ServiceDetail() {
  const { service, reviews, categoryName } = Route.useLoaderData();

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-5 sm:px-8 sm:py-10">
        <Link
          to="/catalogo"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground sm:gap-2 sm:text-sm"
        >
          <ArrowLeft className="size-3.5 sm:size-4" />
          Voltar ao catálogo
        </Link>

        <div className="mt-5 grid gap-7 sm:mt-8 sm:gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[10px] font-normal sm:text-xs">
              {categoryName}
            </Badge>
            <h1 className="mt-3 text-[28px] font-semibold leading-tight sm:mt-4 sm:text-4xl">{service.name}</h1>
            <p className="mt-3 max-w-[56ch] text-sm leading-relaxed text-muted-foreground sm:mt-4 sm:text-base">
              {service.description}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:mt-6 sm:gap-x-6 sm:text-sm">
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5 sm:size-4" />
                {service.duration_min} minutos
              </span>
              <span className="flex items-center gap-1.5">
                <Star className="size-3.5 fill-accent text-accent sm:size-4" />
                {Number(service.rating).toFixed(1)} · {service.reviews_count} avaliações
              </span>
            </div>

            <section className="mt-7 sm:mt-10">
              <h2 className="text-lg font-semibold sm:text-xl">O que está incluído</h2>
              <ul className="mt-3 grid gap-2.5 sm:mt-4 sm:gap-3">
                {service.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm sm:gap-3">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                      <Check className="size-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-7 sm:mt-10">
              <h2 className="text-lg font-semibold sm:text-xl">Como se preparar</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground sm:mt-4">
                {service.preparation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <Separator className="my-7 sm:my-10" />

            <section>
              <div className="flex items-end justify-between gap-3">
                <h2 className="text-lg font-semibold sm:text-xl">Avaliações</h2>
                <span className="text-xs text-muted-foreground">{reviews.length} comentários</span>
              </div>
              <div className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-4">
                {reviews.map((review) => (
                  <figure
                    key={review.id}
                    className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5"
                  >
                    <div className="flex items-center gap-1">
                      {Array.from({ length: review.rating }).map((_, index) => (
                        <Star key={index} className="size-3 fill-accent text-accent sm:size-3.5" />
                      ))}
                    </div>
                    <blockquote className="mt-2 text-sm leading-relaxed sm:mt-3">{review.body}</blockquote>
                    <figcaption className="mt-2 text-[11px] text-muted-foreground sm:mt-3 sm:text-xs">
                      {review.author} · {review.when_label}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          </div>

          <aside className="hidden lg:block">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:sticky lg:top-24">
              <div className="flex items-baseline justify-between">
                <span className="font-sans text-3xl font-semibold tracking-tight text-primary lining-nums tabular-nums">
                  {formatPrice(Number(service.price))}
                </span>
                <span className="text-sm text-muted-foreground">{service.duration_min} min</span>
              </div>

              <div className="mt-6 rounded-xl bg-surface p-4">
                <p className="text-sm font-medium">{service.professional}</p>
                <p className="mt-1 text-xs text-muted-foreground">{service.professional_role}</p>
              </div>

              <Button asChild size="lg" className="mt-6 w-full rounded-full">
                <Link to="/agendar" search={{ servico: service.slug }}>
                  Agendar este serviço
                </Link>
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Sem cobrança nesta etapa. Confirmação por e-mail.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] text-muted-foreground">{service.professional}</p>
            <p className="text-base font-semibold leading-tight text-primary">{formatPrice(Number(service.price))}</p>
          </div>
          <Button asChild className="h-11 min-w-[170px] rounded-full px-5">
            <Link to="/agendar" search={{ servico: service.slug }}>
              Agendar agora
            </Link>
          </Button>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
