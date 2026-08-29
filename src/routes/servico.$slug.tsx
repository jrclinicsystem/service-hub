import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Check, Clock, Star } from "lucide-react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatPrice, getCategory, getService } from "@/data/clinic";

export const Route = createFileRoute("/servico/$slug")({
  loader: ({ params }) => {
    const service = getService(params.slug);
    if (!service) throw notFound();
    return { service };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Serviço não encontrado — JR Clinic" }, { name: "robots", content: "noindex" }],
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
  const { service } = Route.useLoaderData();
  const category = getCategory(service.categoryId);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <Link
          to="/catalogo"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar ao catálogo
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <Badge variant="secondary" className="rounded-full font-normal">
              {category?.name}
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">{service.name}</h1>
            <p className="mt-4 max-w-[56ch] leading-relaxed text-muted-foreground">
              {service.description}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="size-4" />
                {service.durationMin} minutos
              </span>
              <span className="flex items-center gap-1.5">
                <Star className="size-4 fill-accent text-accent" />
                {service.rating.toFixed(1)} · {service.reviewsCount} avaliações
              </span>
            </div>

            <section className="mt-10">
              <h2 className="text-xl font-semibold">O que está incluído</h2>
              <ul className="mt-4 space-y-3">
                {service.includes.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                      <Check className="size-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-10">
              <h2 className="text-xl font-semibold">Como se preparar</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {service.preparation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <Separator className="my-10" />

            <section>
              <h2 className="text-xl font-semibold">Avaliações de pacientes</h2>
              <div className="mt-4 space-y-4">
                {service.reviews.map((review) => (
                  <figure
                    key={review.author}
                    className="rounded-2xl border border-border bg-card p-5 shadow-soft"
                  >
                    <div className="flex items-center gap-1">
                      {Array.from({ length: review.rating }).map((_, index) => (
                        <Star key={index} className="size-3.5 fill-accent text-accent" />
                      ))}
                    </div>
                    <blockquote className="mt-3 text-sm leading-relaxed">{review.text}</blockquote>
                    <figcaption className="mt-3 text-xs text-muted-foreground">
                      {review.author} · {review.when}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          </div>

          <aside>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:sticky lg:top-24">
              <div className="flex items-baseline justify-between">
                <span className="font-display text-3xl font-semibold text-primary">
                  {formatPrice(service.price)}
                </span>
                <span className="text-sm text-muted-foreground">{service.durationMin} min</span>
              </div>

              <div className="mt-6 rounded-xl bg-surface p-4">
                <p className="text-sm font-medium">{service.professional}</p>
                <p className="mt-1 text-xs text-muted-foreground">{service.professionalRole}</p>
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

      <SiteFooter />
    </div>
  );
}
