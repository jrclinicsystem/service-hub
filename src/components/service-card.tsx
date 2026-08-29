import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatPrice, getCategory, type Service } from "@/data/clinic";

export function ServiceCard({ service }: { service: Service }) {
  const category = getCategory(service.categoryId);

  return (
    <article className="card-lift flex min-h-[350px] flex-col rounded-2xl border border-border bg-card p-5 shadow-soft">
      <Link
        to="/servico/$slug"
        params={{ slug: service.slug }}
        preload="intent"
        className="flex flex-1 flex-col"
      >
        <div className="flex items-center justify-between gap-3">
          <Badge variant="secondary" className="rounded-full font-normal">
            {category?.name}
          </Badge>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {service.durationMin} min
          </span>
        </div>

        <h3 className="mt-4 text-xl font-semibold">{service.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{service.summary}</p>

        <div className="mt-auto border-t border-border pt-4">
          <p className="text-sm font-medium leading-tight">{service.professional}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="size-3 fill-accent text-accent" />
            {service.rating.toFixed(1)} · {service.reviewsCount} avaliações
          </p>
        </div>
      </Link>

      <Link
        to="/agendar"
        search={{ servico: service.slug }}
        preload="intent"
        className="group/booking mt-4 flex items-center justify-between gap-3"
        aria-label={`Agendar ${service.name} por ${formatPrice(service.price)}`}
      >
        <div>
          <p className="text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
            A partir de
          </p>
          <p className="font-sans text-xl leading-none font-semibold tracking-tight text-primary lining-nums tabular-nums">
            {formatPrice(service.price)}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-accent px-3 py-2 text-xs font-semibold text-white transition-[border-color] duration-200 ease-out group-hover/booking:border-white/80 group-focus-visible/booking:border-white/80 motion-reduce:transition-none">
          Agendar
          <ArrowRight className="size-3.5" />
        </span>
      </Link>
    </article>
  );
}
