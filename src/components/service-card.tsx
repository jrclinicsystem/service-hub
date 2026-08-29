import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Clock, Star, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatPrice, getCategory, type Service } from "@/data/clinic";

export function ServiceCard({ service }: { service: Service }) {
  const category = getCategory(service.categoryId);

  return (
    <Link
      to="/servico/$slug"
      params={{ slug: service.slug }}
      preload="intent"
      className="card-lift group relative flex min-h-[430px] flex-col overflow-hidden rounded-[1.75rem] border border-border/80 bg-card p-6 shadow-soft"
    >
      <span className="absolute inset-x-0 top-0 h-1 bg-accent" />
      <span className="pointer-events-none absolute -right-3 top-12 font-display text-[8rem] leading-none text-primary/[0.035]">
        JR
      </span>
      <div className="flex items-center justify-between gap-3">
        <Badge
          variant="secondary"
          className="rounded-full border border-accent/20 px-3 font-normal text-primary"
        >
          {category?.name}
        </Badge>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          {service.durationMin} min
        </span>
      </div>

      <h3 className="mt-7 max-w-[14ch] text-3xl leading-[1.02] font-semibold text-primary">
        {service.name}
      </h3>
      <p className="mt-4 min-h-16 text-sm leading-6 text-muted-foreground">{service.summary}</p>

      <div className="relative mt-7 grid grid-cols-[0.82fr_1.18fr] gap-3">
        <div className="flex min-h-28 flex-col justify-between rounded-2xl bg-primary p-4 text-primary-foreground">
          <UserRound className="size-4 text-accent" />
          <div>
            <p className="text-[10px] tracking-[0.16em] uppercase opacity-70">Profissional</p>
            <p className="mt-1 text-sm font-medium leading-tight">{service.professional}</p>
          </div>
        </div>
        <div className="flex min-h-28 flex-col justify-between rounded-2xl border border-accent/25 bg-secondary/70 p-4">
          <Star className="size-4 fill-accent text-accent" />
          <div>
            <p className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              Avaliações
            </p>
            <p className="mt-1 text-sm font-medium text-primary">
              {service.rating.toFixed(1)} · {service.reviewsCount}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between border-t border-border pt-5">
        <div>
          <p className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            A partir de
          </p>
          <span className="font-display text-2xl font-semibold text-primary">
            {formatPrice(service.price)}
          </span>
        </div>
        <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground transition-transform group-hover:rotate-6 group-hover:scale-105">
          <ArrowUpRight className="size-5" />
        </span>
      </div>
    </Link>
  );
}
