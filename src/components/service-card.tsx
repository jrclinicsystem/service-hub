import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatPrice, getCategory, type Service } from "@/data/clinic";
import { cn } from "@/lib/utils";

export function ServiceCard({
  service,
  compactMobile = false,
  categoryName,
}: {
  service: Service;
  compactMobile?: boolean;
  categoryName?: string;
}) {
  const category = categoryName
    ? { name: categoryName }
    : getCategory(service.categoryId);

  return (
    <article
      className={cn(
        "card-lift flex min-h-[350px] flex-col rounded-2xl border border-border bg-card p-5 shadow-soft",
        compactMobile &&
          "max-sm:min-h-[190px] max-sm:rounded-xl max-sm:p-2.5 max-sm:shadow-none",
      )}
    >
      <Link
        to="/servico/$slug"
        params={{ slug: service.slug }}
        preload="intent"
        className="flex flex-1 flex-col"
      >
        <div
          className={cn(
            "flex items-center justify-between gap-3",
            compactMobile && "max-sm:flex-col max-sm:items-start max-sm:gap-1",
          )}
        >
          <Badge
            variant="secondary"
            className={cn(
              "rounded-full font-normal",
              compactMobile &&
                "max-sm:max-w-full max-sm:truncate max-sm:px-2 max-sm:py-0 max-sm:text-[8px]",
            )}
          >
            {category?.name}
          </Badge>
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs text-muted-foreground",
              compactMobile && "max-sm:gap-1 max-sm:text-[8px]",
            )}
          >
            <Clock className={cn("size-3.5", compactMobile && "max-sm:size-2.5")} />
            {service.durationMin} min
          </span>
        </div>

        <h3
          className={cn(
            "mt-4 text-xl font-semibold",
            compactMobile && "max-sm:mt-2 max-sm:line-clamp-2 max-sm:text-[12px] max-sm:leading-[1.18]",
          )}
        >
          {service.name}
        </h3>
        <p
          className={cn(
            "mt-2 text-sm leading-relaxed text-muted-foreground",
            compactMobile && "max-sm:hidden",
          )}
        >
          {service.summary}
        </p>

        <div
          className={cn(
            "mt-auto border-t border-border pt-4",
            compactMobile && "max-sm:pt-2",
          )}
        >
          <p
            className={cn(
              "text-sm font-medium leading-tight",
              compactMobile && "max-sm:line-clamp-1 max-sm:text-[9px]",
            )}
          >
            {service.professional}
          </p>
          <p
            className={cn(
              "mt-1 flex items-center gap-1 text-xs text-muted-foreground",
              compactMobile && "max-sm:hidden",
            )}
          >
            <Star className="size-3 fill-accent text-accent" />
            <span>{service.rating.toFixed(1)}</span>
            <span>· {service.reviewsCount} avaliações</span>
          </p>
        </div>
      </Link>

      <Link
        to="/agendar"
        search={{ servico: service.slug }}
        preload="intent"
        className={cn(
          "group/booking mt-4 flex items-center justify-between gap-3",
          compactMobile && "max-sm:mt-2 max-sm:block",
        )}
        aria-label={`Agendar ${service.name} por ${formatPrice(service.price)}`}
      >
        <div>
          <p
            className={cn(
              "text-[9px] tracking-[0.14em] text-muted-foreground uppercase",
              compactMobile && "max-sm:text-[6px] max-sm:tracking-[0.06em]",
            )}
          >
            A partir de
          </p>
          <p
            className={cn(
              "font-sans text-xl leading-none font-semibold tracking-tight text-primary lining-nums tabular-nums",
              compactMobile && "max-sm:mt-0.5 max-sm:text-[12px]",
            )}
          >
            {formatPrice(service.price)}
          </p>
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-accent px-3 py-2 text-xs font-semibold text-white transition-[border-color] duration-200 ease-out group-hover/booking:border-white/80 group-focus-visible/booking:border-white/80 motion-reduce:transition-none",
            compactMobile &&
              "max-sm:mt-1.5 max-sm:w-full max-sm:justify-center max-sm:gap-1 max-sm:px-1.5 max-sm:py-1 max-sm:text-[8px]",
          )}
        >
          Agendar
          <ArrowRight className={cn("size-3.5", compactMobile && "max-sm:size-2.5")} />
        </span>
      </Link>
    </article>
  );
}
