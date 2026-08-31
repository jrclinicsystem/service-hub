import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CircleDollarSign, Clock3, ShieldCheck } from "lucide-react";

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

  return { isAdmin, email };
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
        <p className="text-sm text-muted-foreground">Carregando módulo financeiro...</p>
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
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Esta área é exclusiva da administração da JR Clinic."}
          </p>
          <Button asChild className="mt-5"><Link to="/admin">Voltar ao painel</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background lg:pl-[252px]">
      <AdminSubpageSidebar active="finance" />

      <main className="mx-auto grid min-h-screen max-w-[1100px] place-items-center px-5 py-16 sm:px-8">
        <section className="w-full max-w-xl rounded-3xl border border-border bg-card p-8 text-center shadow-soft sm:p-12">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
            <CircleDollarSign className="size-6" />
          </span>
          <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Financeiro</p>
          <h1 className="mt-2 text-3xl font-semibold text-primary sm:text-4xl">Em breve</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            O módulo financeiro da JR Clinic está reservado para uma próxima etapa do sistema.
          </p>
          <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/45 px-4 py-2 text-xs font-medium text-muted-foreground">
            <Clock3 className="size-3.5" /> Em desenvolvimento
          </div>
        </section>
      </main>
    </div>
  );
}
