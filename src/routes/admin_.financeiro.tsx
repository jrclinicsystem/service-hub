import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";
import { FinanceAttendanceCompletion } from "@/components/finance-attendance-completion";
import { FinanceCommissionPaymentActions } from "@/components/finance-commission-payment-actions";
import { FinanceCompletionSuite } from "@/components/finance-completion-suite";
import { FinanceManualEntry } from "@/components/finance-manual-entry";
import { FinanceMixedPayment } from "@/components/finance-mixed-payment";
import { FinanceStagingWorkspace } from "@/components/finance-staging-workspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin_/financeiro")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { next: "/admin/financeiro" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Financeiro — JR Clinic" },
      { name: "description", content: "Módulo financeiro da JR Clinic." },
    ],
  }),
  component: FinancePage,
});

function FinancePage() {
  return (
    <div className="relative min-h-screen bg-background">
      <AdminSubpageSidebar active="finance" />
      <main className="finance-page relative isolate min-h-screen min-w-0 overflow-x-hidden lg:ml-[252px] lg:pt-[120px] [&_.bg-amber-500]:hidden [&_.bg-amber-500+*]:hidden [&_label]:!text-foreground [&_label]:!opacity-100 [&_input[type=date]]:!border-border [&_input[type=date]]:!bg-card [&_input[type=date]]:!text-foreground [&_input[type=date]]:!opacity-100 [&_[role=tablist]]:min-h-16 [&_[role=tablist]]:gap-1 [&_[role=tablist]]:rounded-[20px] [&_[role=tablist]]:border [&_[role=tablist]]:border-border/80 [&_[role=tablist]]:bg-card/98 [&_[role=tablist]]:p-1.5 [&_[role=tablist]]:shadow-[0_8px_26px_rgb(15_77_62_/_0.09)] [&_[role=tablist]]:backdrop-blur-xl lg:[&_[role=tablist]]:fixed lg:[&_[role=tablist]]:left-[252px] lg:[&_[role=tablist]]:right-0 lg:[&_[role=tablist]]:mx-auto lg:[&_[role=tablist]]:top-12 lg:[&_[role=tablist]]:z-[70] lg:[&_[role=tablist]]:w-[calc(100vw-332px)] lg:[&_[role=tablist]]:max-w-[1460px] lg:[&_[role=tablist]]:-translate-x-[9px] [&_[role=tab]]:min-h-12 [&_[role=tab]]:rounded-[15px] [&_[role=tab]]:px-5 [&_[role=tab]]:text-[15px] [&_[role=tab]]:font-semibold [&_[role=tab]]:text-muted-foreground [&_[role=tab]]:transition-all [&_[role=tab]]:duration-200 [&_[role=tab]]:hover:bg-primary-soft/70 [&_[role=tab]]:hover:text-primary [&_[role=tab][data-state=active]]:bg-primary [&_[role=tab][data-state=active]]:text-primary-foreground [&_[role=tab][data-state=active]]:shadow-[0_4px_12px_rgb(15_77_62_/_0.18)]">
        <style>{`
          .finance-page .bg-amber-500,
          .finance-page .bg-amber-500 + * {
            display: none !important;
          }

          .finance-page:has([role="tablist"] > [role="tab"]:first-child[data-state="active"]) .finance-mixed-payment {
            display: block;
          }

          .finance-page:has([role="tablist"] > [role="tab"]:nth-child(3)[data-state="active"]) .finance-manual-entry {
            display: block;
          }

          .finance-page:has([role="tablist"] > [role="tab"]:nth-child(6)[data-state="active"]) .finance-commission-payment-actions {
            display: block;
          }

          .finance-page:has([role="tablist"] > [role="tab"]:nth-child(6)[data-state="active"]) [role="tabpanel"][data-state="active"] > div[class~="grid"][class~="gap-5"] > :first-child {
            display: none;
          }

          .finance-page:has([role="tablist"] > [role="tab"]:nth-child(6)[data-state="active"]) [role="tabpanel"][data-state="active"] > div[class~="grid"][class~="gap-5"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          @media (min-width: 1024px) {
            .finance-page:has([role="tablist"] > [role="tab"][data-state="active"]:not(:first-child)) > section:first-of-type {
              display: none;
            }

            .finance-page:has([role="tablist"] > [role="tab"][data-state="active"]:not(:first-child)) > section:first-of-type + section {
              display: none;
            }

            .finance-page:has([role="tablist"] > [role="tab"][data-state="active"]:not(:first-child)) > section:first-of-type + section + div > header,
            .finance-page:has([role="tablist"] > [role="tab"][data-state="active"]:not(:first-child)) > section:first-of-type + section + div > section:first-of-type {
              display: none;
            }

            .finance-page [role="tabpanel"] {
              scroll-margin-top: 152px;
            }
          }
        `}</style>
        <FinanceAttendanceCompletion />
        <FinanceMixedPayment />
        <FinanceStagingWorkspace />
        <FinanceManualEntry />
        <FinanceCommissionPaymentActions />
        <FinanceCompletionSuite />
      </main>
    </div>
  );
}
