/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function commissionTypeLabel(type: string) {
  if (type === "percentage") return "Percentual";
  if (type === "fixed_per_patient") return "Valor por paciente";
  return "Manual";
}

async function loadPendingCommissions() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Sessão expirada.");

  const access = await db
    .from("financial_access")
    .select("role")
    .eq("user_id", authData.user.id)
    .eq("is_active", true);
  if (access.error) throw access.error;

  const roles = (access.data ?? []).map((row: any) => String(row.role));
  const allowed = roles.includes("admin") || roles.includes("finance");
  if (!allowed) return { allowed: false, commissions: [], professionals: [] };

  const [commissions, professionals] = await Promise.all([
    db
      .from("professional_commissions")
      .select(
        "id,professional_id,commission_type,percentage,fixed_amount,commission_amount,clinic_amount,status,created_at",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("professionals").select("id,name").eq("is_active", true).order("name"),
  ]);

  if (commissions.error) throw commissions.error;
  if (professionals.error) throw professionals.error;

  return {
    allowed: true,
    commissions: commissions.data ?? [],
    professionals: professionals.data ?? [],
  };
}

export function FinanceCommissionPaymentActions() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["finance-qa2-pending-commissions"],
    queryFn: loadPendingCommissions,
  });

  if (!query.data?.allowed) return null;

  const professionalMap = new Map<string, string>(
    (query.data.professionals ?? []).map((row: any) => [row.id, row.name]),
  );

  const markPaid = async (commission: any) => {
    const professional = professionalMap.get(commission.professional_id) ?? "Profissional";
    const confirmed = window.confirm(
      `Confirmar o repasse de ${money(commission.commission_amount)} para ${professional}?`,
    );
    if (!confirmed) return;

    const result = await db.rpc("mark_commission_paid", {
      _commission_id: commission.id,
    });
    if (result.error) {
      toast.error("Não foi possível marcar a comissão como paga.", {
        description: result.error.message,
      });
      return;
    }

    toast.success("Comissão marcada como paga.");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance-qa2-pending-commissions"] }),
      queryClient.invalidateQueries({ queryKey: ["finance-full-v2"] }),
      queryClient.invalidateQueries({ queryKey: ["finance-completion-lookups"] }),
      queryClient.invalidateQueries({ queryKey: ["finance-completion-report"] }),
    ]);
  };

  return (
    <section className="finance-commission-payment-actions hidden mx-auto w-full max-w-[1540px] px-5 pb-8 sm:px-8 lg:px-10">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
            <UserRoundCheck className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Repasses individuais pendentes</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Marque uma comissão como paga sem precisar encerrar um fechamento completo.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando comissões...</p>
          ) : (query.data.commissions ?? []).length ? (
            query.data.commissions.map((row: any) => {
              const name = professionalMap.get(row.professional_id) ?? "Profissional";
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"
                >
                  <div>
                    <strong className="text-sm">{name}</strong>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{commissionTypeLabel(row.commission_type)}</span>
                      {row.commission_type === "percentage" && row.percentage != null ? (
                        <span>· {Number(row.percentage)}%</span>
                      ) : null}
                      {row.commission_type === "fixed_per_patient" && row.fixed_amount != null ? (
                        <span>· {money(row.fixed_amount)} por paciente</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <strong className="block">{money(row.commission_amount)}</strong>
                      <Badge variant="secondary">Pendente</Badge>
                    </div>
                    <Button size="sm" onClick={() => void markPaid(row)}>
                      <CheckCircle2 className="mr-2 size-4" /> Marcar paga
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma comissão individual pendente.</p>
          )}
        </div>
      </div>
    </section>
  );
}
