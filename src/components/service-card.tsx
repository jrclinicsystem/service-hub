import { Link } from "@tanstack/react-router";
import { Clock, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatPrice, getCategory, type Service } from "@/data/clinic";

export function ServiceCard({ service }: { service: Service }) {
  const category = getCategory(service.categoryId);

  return (
    <Link
      to="/servico/$slug"
      params={{ slug: service.slug }}
      className="card-lift flex flex-col rounded-2xl border border-border bg-card p-5 shadow-soft"
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

      <div className="mt-5 flex items-end justify-between border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium">{service.professional}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="size-3 fill-accent text-accent" />
            {service.rating.toFixed(1)} · {service.reviewsCount} avaliações
          </p>
        </div>
        <span className="font-display text-lg font-semibold text-primary">
          {formatPrice(service.price)}
        </span>
      </div>
    </Link>
  );
}
