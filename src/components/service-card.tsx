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
  const quoteOnly = ["Retirada de sinal", "Sessão de clareamento"].includes(
    service.name,
  );

  const procedureDescription = [service.summary, service.description]
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
    .join(" ");

  return (
    <article
      className={cn(
        "card-lift flex min-h-[390px] flex-col rounded-2xl border border-border bg-card p-5 shadow-soft",
        compactMobile &&
          "max-sm:min-h-[330px] max-sm:rounded-2xl max-sm:p-4 max-sm:shadow-soft",
        compactDesktop &&
          "md:min-h-[330px] md:rounded-xl md:p-4 md:shadow-[0_14px_30px_-26px_rgba(15,77,62,0.35)]",
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
              "max-w-[72%] truncate rounded-full px-2.5 py-0.5 text-[11px] font-normal",
            )}
          >
            {category?.name}
          </Badge>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {service.durationMin} min
          </span>
        </div>

        <h3 className="mt-4 line-clamp-2 text-xl font-semibold leading-[1.24]">
          {service.name}
        </h3>
        <p className="mt-2 line-clamp-4 text-[15px] leading-6 text-muted-foreground">
          {procedureDescription || "Confira os detalhes, indicações e etapas deste procedimento."}
        </p>

        <div
          className={cn(
            "mt-auto border-t border-border pt-4",
            compactMobile && "max-sm:pt-3",
            compactDesktop && "md:pt-3",
          )}
        >
          <p className="line-clamp-1 text-sm font-medium leading-tight">
            {service.professional}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="size-3.5 fill-accent text-accent" />
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
        aria-label={`${quoteOnly ? "Consultar orçamento de" : "Agendar"} ${service.name} por ${formatPrice(service.price)}`}
      >
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            A partir de
          </p>
          <p className="mt-1 font-sans text-xl font-semibold leading-none tracking-tight text-primary lining-nums tabular-nums">
            {formatPrice(service.price)}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-accent px-3.5 py-2.5 text-xs font-semibold text-white transition-[border-color] duration-200 ease-out group-hover/booking:border-white/80 group-focus-visible/booking:border-white/80 motion-reduce:transition-none">
          {quoteOnly ? "Consultar orçamento" : "Agendar"}
          <ArrowRight className="size-3.5" />
        </span>
      </Link>
    </article>
  );
}
