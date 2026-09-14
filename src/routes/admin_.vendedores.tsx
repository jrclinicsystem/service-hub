import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { AdminSellersWorkspace } from "@/components/admin-sellers-workspace";
import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export const Route = createFileRoute("/admin_/vendedores")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { next: "/admin/vendedores" } });
    }

    const email = (data.user.email ?? "").trim().toLowerCase();
    const roleResult = await db.from("user_roles").select("role").eq("user_id", data.user.id);
    if (roleResult.error) throw redirect({ to: "/admin" });

    let isAdmin = (roleResult.data ?? []).some((item: any) => item.role === "admin");
    if (!isAdmin && email) {
      const allowResult = await db
        .from("admin_emails")
        .select("email")
        .eq("email", email)
        .eq("enabled", true)
        .maybeSingle();
      isAdmin = !allowResult.error && Boolean(allowResult.data);
    }

    if (!isAdmin) throw redirect({ to: "/admin" });
  },
  head: () => ({
    meta: [
      { title: "Vendedores e comissões — JR Clinic" },
      { name: "description", content: "Gestão administrativa de vendedores e comissões da JR Clinic." },
    ],
  }),
  component: SellersPage,
});

function SellersPage() {
  return (
    <div className="relative min-h-screen bg-background">
      <AdminSubpageSidebar active="sellers" />
      <main className="min-h-screen min-w-0 overflow-x-hidden p-3 pb-24 sm:p-5 lg:ml-[252px] lg:p-8">
        <div className="mx-auto mb-3 w-full max-w-[1500px] lg:hidden">
          <Button asChild variant="ghost" size="sm" className="rounded-xl">
            <Link to="/admin"><ArrowLeft className="size-4" /> Painel administrativo</Link>
          </Button>
        </div>
        <AdminSellersWorkspace />
      </main>
    </div>
  );
}
