import { createFileRoute } from "@tanstack/react-router";
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

      <main className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8 lg:py-20">
        <span className="eyebrow text-accent">Catálogo</span>
        <h1 className="mt-2 text-4xl font-semibold text-primary sm:text-5xl">
          Serviços da JR Clinic
        </h1>
        <p className="mt-3 max-w-[52ch] text-muted-foreground">
          {services.length} serviços em {categories.length} especialidades. Filtre por categoria ou
          busque pelo nome do serviço ou do profissional.
        </p>

        <div className="mt-8 max-w-md">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar serviço ou profissional"
            className="h-12 rounded-full border-border bg-card px-5 shadow-soft"
            aria-label="Buscar serviço"
          />
        </div>

        <div className="sticky top-16 z-30 -mx-5 mt-8 flex gap-2 overflow-x-auto border-b border-border bg-background/90 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8">
          <Button
            variant={categoria ? "outline" : "default"}
            size="sm"
            className="shrink-0 rounded-full"
            onClick={() => setCategory(undefined)}
          >
            Todos
          </Button>
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={categoria === category.id ? "default" : "outline"}
              size="sm"
              className="shrink-0 rounded-full"
              onClick={() => setCategory(category.id)}
            >
              {category.name}
            </Button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="mt-12 text-sm text-muted-foreground">
            Nenhum serviço encontrado para esta combinação de filtros.
          </p>
        ) : (
          <div className="mt-7 grid grid-cols-3 items-stretch gap-2 sm:mt-10 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
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
