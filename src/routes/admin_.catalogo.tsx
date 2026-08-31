import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ChevronLeft, Eye, Sparkles, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export const Route = createFileRoute("/admin_/catalogo")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { next: "/admin/catalogo" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Destaque do catálogo — JR Clinic" },
      {
        name: "description",
        content: "Controle de categoria em evidência no catálogo da JR Clinic.",
      },
    ],
  }),
  component: CatalogHighlightPage,
});

async function loadCatalogHighlight() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");

  const email = (userData.user.email ?? "").trim().toLowerCase();
  const roles = await db.from("user_roles").select("role").eq("user_id", userData.user.id);
  if (roles.error) throw roles.error;

  let isAdmin = (roles.data ?? []).some((item: any) => item.role === "admin");
  if (!isAdmin && email) {
    const allow = await db
      .from("admin_emails")
      .select("email")
      .eq("email", email)
      .eq("enabled", true)
      .maybeSingle();
    if (allow.error) throw allow.error;
    isAdmin = Boolean(allow.data);
  }

  if (!isAdmin) return { isAdmin: false as const, categories: [] };

  const [categories, services] = await Promise.all([
    db
      .from("categories")
      .select("id, name, description, sort_order, is_featured")
      .order("sort_order")
      .order("name"),
    db.from("services").select("id, category_id, is_active"),
  ]);

  if (categories.error) throw categories.error;
  if (services.error) throw services.error;

  const serviceRows = services.data ?? [];
  return {
    isAdmin: true as const,
    categories: (categories.data ?? []).map((category: any) => ({
      ...category,
      activeServices: serviceRows.filter(
        (service: any) => service.category_id === category.id && service.is_active,
      ).length,
    })),
  };
}

function CatalogHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-4 sm:px-8">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin"><ChevronLeft className="size-4" /> Painel</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/catalogo"><Eye className="size-4" /> Ver catálogo</Link>
        </Button>
      </div>
    </header>
  );
}

function CatalogLoading() {
  return (
    <div className="min-h-screen bg-background lg:pl-[252px]">
      <AdminSubpageSidebar active="catalog" />
      <CatalogHeader />

      <main className="mx-auto max-w-[1180px] px-4 py-8 sm:px-8 sm:py-12">
        <div className="h-3 w-24 animate-pulse rounded-full bg-accent/15" />
        <div className="mt-3 h-10 w-72 max-w-[80%] animate-pulse rounded-xl bg-primary/10" />
        <div className="mt-4 h-4 w-[560px] max-w-full animate-pulse rounded-full bg-muted" />
        <div className="mt-2 h-4 w-[430px] max-w-[86%] animate-pulse rounded-full bg-muted" />

        <div className="mt-7 h-[74px] animate-pulse rounded-2xl bg-primary/10" />

        <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-[160px] animate-pulse rounded-2xl border border-border bg-card/70" />
          ))}
        </div>
      </main>
    </div>
  );
}

function CatalogHighlightPage() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["catalog-highlight-admin"],
    queryFn: loadCatalogHighlight,
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const setFeatured = async (categoryId: string) => {
    setBusyId(categoryId);
    try {
      const clear = await db.from("categories").update({ is_featured: false }).eq("is_featured", true);
      if (clear.error) throw clear.error;

      const feature = await db.from("categories").update({ is_featured: true }).eq("id", categoryId);
      if (feature.error) throw feature.error;

      toast.success("Categoria colocada em evidência no catálogo.");
      await queryClient.invalidateQueries({ queryKey: ["catalog-highlight-admin"] });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível alterar o destaque.");
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) return <CatalogLoading />;

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-5">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Não foi possível abrir esta configuração.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Erro inesperado."}
          </p>
          <Button asChild className="mt-5"><Link to="/admin">Voltar ao painel</Link></Button>
        </div>
      </div>
    );
  }

  if (!data?.isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-5">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">Somente administradores podem alterar a apresentação do catálogo.</p>
          <Button asChild className="mt-5"><Link to="/admin">Voltar ao painel</Link></Button>
        </div>
      </div>
    );
  }

  const featured = data.categories.find((category: any) => category.is_featured);

  return (
    <div className="min-h-screen bg-background lg:pl-[252px]">
      <AdminSubpageSidebar active="catalog" />
      <CatalogHeader />

      <main className="mx-auto max-w-[1180px] px-4 py-8 sm:px-8 sm:py-12">
        <span className="eyebrow text-accent">Apresentação</span>
        <h1 className="mt-2 text-3xl font-semibold text-primary sm:text-4xl">Destaque do catálogo</h1>
        <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
          Escolha qual categoria deve aparecer primeiro e receber maior evidência visual. As demais categorias continuam no catálogo com layouts alternados.
        </p>

        <div className="mt-7 flex items-center gap-4 rounded-2xl border border-primary/15 bg-primary px-4 py-4 text-primary-foreground shadow-soft sm:px-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/[0.08]">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/60">Em evidência agora</p>
            <p className="mt-0.5 truncate font-display text-xl font-semibold sm:text-2xl">
              {featured?.name ?? "Nenhuma categoria selecionada"}
            </p>
          </div>
          {featured ? <Badge className="shrink-0 border-white/15 bg-white/[0.09] text-primary-foreground">{featured.activeServices} serviços</Badge> : null}
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.categories.map((category: any) => (
            <article
              key={category.id}
              className={`rounded-2xl border p-4 shadow-soft transition-colors ${
                category.is_featured
                  ? "border-primary/30 bg-primary-soft/70"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-semibold text-primary">{category.name}</h2>
                    {category.is_featured ? <Star className="size-3.5 shrink-0 fill-accent text-accent" /> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {category.activeServices} {category.activeServices === 1 ? "serviço ativo" : "serviços ativos"}
                  </p>
                </div>
                {category.is_featured ? (
                  <Badge variant="secondary" className="shrink-0">Em destaque</Badge>
                ) : null}
              </div>

              {category.description ? (
                <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{category.description}</p>
              ) : null}

              <Button
                variant={category.is_featured ? "outline" : "default"}
                size="sm"
                className="mt-4 w-full rounded-xl"
                disabled={category.is_featured || busyId !== null}
                onClick={() => setFeatured(category.id)}
              >
                <Star className="size-3.5" />
                {busyId === category.id ? "Aplicando..." : category.is_featured ? "Categoria em evidência" : "Colocar em evidência"}
              </Button>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
