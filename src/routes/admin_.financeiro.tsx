import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CircleDollarSign, ShieldCheck } from "lucide-react";

import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export const Route = createFileRoute("/admin_/financeiro")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: "/admin/financeiro" } });
  },
  head: () => ({
    meta: [
      { title: "Financeiro — JR Clinic" },
      { name: "description", content: "Módulo financeiro da JR Clinic." },
    ],
  }),
  component: FinancePage,
});

async function loadAdminAccess() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");

  const user = userData.user;
  const email = (user.email ?? "").trim().toLowerCase();
  const roles = await db.from("user_roles").select("role").eq("user_id", user.id);
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

  return { isAdmin };
}

function FinancePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["finance-admin-access"],
    queryFn: loadAdminAccess,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="size-8 animate-pulse rounded-full bg-primary-soft" />
      </div>
    );
  }

  if (error || !data?.isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-5">
        <div className="max-w-md text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <h1 className="mt-5 text-xl font-semibold">Acesso administrativo necessário</h1>
          <Button asChild className="mt-5"><Link to="/admin">Voltar ao painel</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="finance-coming-soon-page min-h-screen bg-background lg:pl-[252px]">
      <AdminSubpageSidebar active="finance" />

      <main className="finance-coming-soon-main grid min-h-screen place-items-center px-5 py-16 sm:px-8 lg:pr-[252px]">
        <section className="text-center">
          <div className="relative mx-auto grid size-20 place-items-center">
            <span className="absolute inset-2 animate-ping rounded-full bg-primary/10 [animation-duration:2.4s]" />
            <span className="relative grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary shadow-soft">
              <CircleDollarSign className="size-6 animate-pulse" />
            </span>
          </div>

          <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Financeiro</p>
          <h1 className="mt-2 text-4xl font-semibold text-primary sm:text-5xl">Em breve</h1>

          <div className="mt-5 flex items-center justify-center gap-1.5" aria-label="Em desenvolvimento">
            <span className="size-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-accent" />
          </div>
        </section>
      </main>
    </div>
  );
}
