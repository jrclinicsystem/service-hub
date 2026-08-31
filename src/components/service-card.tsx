import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatPrice, getCategory, type Service } from "@/data/clinic";
import { cn } from "@/lib/utils";

export function ServiceCard({
  service,
  compactMobile = false,
  compactDesktop = false,
  categoryName,
}: {
  service: Service;
  compactMobile?: boolean;
  compactDesktop?: boolean;
  categoryName?: string | undefined;
}) {
  const category = categoryName
    ? { name: categoryName }
    : getCategory(service.categoryId);

  const procedureDescription = [service.summary, service.description]
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
    .join(" ");

  return (
    <article
      className={cn(
        "card-lift flex min-h-[380px] flex-col rounded-2xl border border-border bg-card p-5 shadow-soft",
        compactMobile &&
          "max-sm:min-h-[310px] max-sm:rounded-2xl max-sm:p-4 max-sm:shadow-soft",
        compactDesktop &&
          "md:min-h-[290px] md:rounded-xl md:p-4 md:shadow-[0_14px_30px_-26px_rgba(15,77,62,0.35)]",
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
            compactMobile && "max-sm:gap-2",
            compactDesktop && "md:gap-2",
          )}
        >
          <Badge
            variant="secondary"
            className={cn(
              "rounded-full font-normal",
              compactMobile &&
                "max-sm:max-w-[68%] max-sm:truncate max-sm:px-2.5 max-sm:py-0.5 max-sm:text-[10px]",
              compactDesktop && "md:max-w-[68%] md:truncate md:px-2.5 md:py-0 md:text-[10px]",
            )}
          >
            {category?.name}
          </Badge>
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs text-muted-foreground",
              compactMobile && "max-sm:shrink-0 max-sm:gap-1 max-sm:text-[10px]",
              compactDesktop && "md:gap-1 md:text-[10px]",
            )}
          >
            <Clock
              className={cn(
                "size-3.5",
                compactMobile && "max-sm:size-3",
                compactDesktop && "md:size-3",
              )}
            />
            {service.durationMin} min
          </span>
        </div>

        <h3
          className={cn(
            "mt-4 text-xl font-semibold",
            compactMobile && "max-sm:mt-3 max-sm:line-clamp-2 max-sm:text-[17px] max-sm:leading-[1.25]",
            compactDesktop && "md:mt-3 md:line-clamp-2 md:text-[17px] md:leading-[1.22]",
          )}
        >
          {service.name}
        </h3>
        <p
          className={cn(
            "mt-2 text-[15px] leading-6 text-muted-foreground",
            compactMobile && "max-sm:line-clamp-4 max-sm:text-[13px] max-sm:leading-[1.55]",
            compactDesktop && "md:line-clamp-4 md:text-[13px] md:leading-[1.5]",
          )}
        >
          {procedureDescription || "Confira os detalhes, indicações e etapas deste procedimento."}
        </p>

        <div
          className={cn(
            "mt-auto border-t border-border pt-4",
            compactMobile && "max-sm:pt-3",
            compactDesktop && "md:pt-3",
          )}
        >
          <p
            className={cn(
              "text-sm font-medium leading-tight",
              compactMobile && "max-sm:line-clamp-1 max-sm:text-[12px]",
              compactDesktop && "md:line-clamp-1 md:text-[11px]",
            )}
          >
            {service.professional}
          </p>
          <p
            className={cn(
              "mt-1 flex items-center gap-1 text-xs text-muted-foreground",
              compactMobile && "max-sm:text-[10px]",
              compactDesktop && "md:text-[10px]",
            )}
          >
            <Star className={cn("size-3 fill-accent text-accent", compactMobile && "max-sm:size-3.5")} />
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
          compactMobile && "max-sm:mt-3 max-sm:gap-2",
          compactDesktop && "md:mt-3 md:gap-2",
        )}
        aria-label={`Agendar ${service.name} por ${formatPrice(service.price)}`}
      >
        <div>
          <p
            className={cn(
              "text-[9px] tracking-[0.14em] text-muted-foreground uppercase",
              compactMobile && "max-sm:text-[8px] max-sm:tracking-[0.1em]",
              compactDesktop && "md:text-[7px] md:tracking-[0.1em]",
            )}
          >
            A partir de
          </p>
          <p
            className={cn(
              "font-sans text-xl leading-none font-semibold tracking-tight text-primary lining-nums tabular-nums",
              compactMobile && "max-sm:mt-1 max-sm:text-[17px]",
              compactDesktop && "md:text-base",
            )}
          >
            {formatPrice(service.price)}
          </p>
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-accent px-3 py-2 text-xs font-semibold text-white transition-[border-color] duration-200 ease-out group-hover/booking:border-white/80 group-focus-visible/booking:border-white/80 motion-reduce:transition-none",
            compactMobile &&
              "max-sm:px-3.5 max-sm:py-2.5 max-sm:text-[11px]",
            compactDesktop && "md:px-2.5 md:py-1.5 md:text-[10px]",
          )}
        >
          Agendar
          <ArrowRight
            className={cn(
              "size-3.5",
              compactMobile && "max-sm:size-3.5",
              compactDesktop && "md:size-3",
            )}
          />
        </span>
      </Link>
    </article>
  );
}
