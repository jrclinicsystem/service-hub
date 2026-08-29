import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { ServiceCard } from "@/components/service-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCatalog } from "@/lib/clinic.functions";

const title = "Catálogo de serviços — JR Clinic";
const description =
  "Explore consultas, nutrição, psicologia, fisioterapia e exames da JR Clinic por categoria, duração e valor.";

const searchSchema = z.object({
  categoria: z.string().optional(),
});

export const Route = createFileRoute("/catalogo")({
  validateSearch: searchSchema,
  loader: () => getCatalog(),
  staleTime: 5 * 60 * 1000,
  preloadStaleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Catalogo,
});

function Catalogo() {
  const catalog = Route.useLoaderData();
  const { categoria } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState("");

  const services = catalog.services.map((service) => ({
    slug: service.slug,
    name: service.name,
    categoryId: service.category_id,
    professional: service.professional,
    professionalRole: service.professional_role,
    durationMin: service.duration_min,
    price: Number(service.price),
    rating: Number(service.rating),
    reviewsCount: service.reviews_count,
    summary: service.summary,
    description: service.description,
    includes: service.includes,
    preparation: service.preparation,
    reviews: [],
  }));
  const categories = catalog.categories;

  const filtered = services.filter((service) => {
    const matchesCategory = !categoria || service.categoryId === categoria;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      service.name.toLowerCase().includes(q) ||
      service.professional.toLowerCase().includes(q) ||
      service.summary.toLowerCase().includes(q);
    return matchesCategory && matchesQuery;
  });

  const setCategory = (id?: string) =>
    navigate({ search: id ? { categoria: id } : {}, replace: true });

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-[1440px] px-4 pb-10 pt-6 sm:px-8 sm:py-14 lg:py-20">
        <span className="eyebrow text-accent max-sm:text-[10px]">Catálogo</span>
        <h1 className="mt-1 text-[29px] font-semibold leading-tight text-primary sm:mt-2 sm:text-5xl">
          Serviços da JR Clinic
        </h1>
        <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground sm:mt-3 sm:text-base">
          {services.length} serviços em {categories.length} especialidades.
          <span className="hidden sm:inline"> Filtre por categoria ou busque pelo nome do serviço ou do profissional.</span>
        </p>

        <div className="relative mt-5 max-w-md sm:mt-8">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar serviço ou profissional"
            className="h-11 rounded-full border-border bg-card pl-10 pr-4 text-sm shadow-soft sm:h-12 sm:px-5 sm:pl-11"
            aria-label="Buscar serviço"
          />
        </div>

        <div className="sticky top-14 z-30 -mx-4 mt-4 flex gap-2 overflow-x-auto bg-background/95 px-4 pb-4 pt-2.5 backdrop-blur-xl [scrollbar-width:thin] [scrollbar-color:rgb(15_77_62_/_0.14)_transparent] [&::-webkit-scrollbar]:h-[2px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/15 [&::-webkit-scrollbar-track]:bg-transparent sm:top-16 sm:-mx-8 sm:mt-8 sm:px-8 sm:pb-3 sm:pt-3">
          <Button
            variant={categoria ? "outline" : "default"}
            size="sm"
            className="h-8 shrink-0 rounded-full px-3 text-xs sm:h-9 sm:text-sm"
            onClick={() => setCategory(undefined)}
          >
            Todos
          </Button>
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={categoria === category.id ? "default" : "outline"}
              size="sm"
              className="h-8 shrink-0 rounded-full px-3 text-xs sm:h-9 sm:text-sm"
              onClick={() => setCategory(category.id)}
            >
              {category.name}
            </Button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between sm:mt-6">
          <p className="text-[11px] text-muted-foreground sm:text-xs">
            {filtered.length === 1 ? "1 resultado" : `${filtered.length} resultados`}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center sm:mt-12">
            <p className="text-sm font-medium">Nenhum serviço encontrado</p>
            <p className="mt-1 text-xs text-muted-foreground">Tente outro termo ou categoria.</p>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-3 items-stretch gap-2 sm:mt-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((service) => (
              <ServiceCard key={service.slug} service={service} compactMobile />
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
