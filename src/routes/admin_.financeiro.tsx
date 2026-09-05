import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";
import { FinanceStagingWorkspace } from "@/components/finance-staging-workspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin_/financeiro")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: "/admin/financeiro" } });
  },
  head: () => ({
    meta: [
      { title: "Financeiro — JR Clinic Staging" },
      { name: "description", content: "Ambiente de testes do módulo financeiro da JR Clinic." },
    ],
  }),
  component: FinancePage,
});

function FinancePage() {
  return (
    <div className="min-h-screen bg-background lg:pl-[252px]">
      <AdminSubpageSidebar active="finance" />
      <main className="min-h-screen">
        <FinanceStagingWorkspace />
      </main>
    </div>
  );
}
