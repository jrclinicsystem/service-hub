/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDollarSign, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dateLabel(value?: string | null) {
  if (!value) return "Data não informada";
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
}

function statusLabel(status?: string | null) {
  if (status === "paid") return "Pago";
  if (status === "pending") return "Pendente";
  if (status === "cancelled") return "Cancelado";
  return status || "Pendente";
}

function statusVariant(status?: string | null): "default" | "secondary" | "outline" {
  if (status === "paid") return "default";
  if (status === "cancelled") return "outline";
  return "secondary";
}

function relatedEntry(row: any) {
  return Array.isArray(row?.financial_entry)
    ? (row.financial_entry[0] ?? null)
    : (row?.financial_entry ?? null);
}

async function loadProfessionalCommissions(professionalId: string) {
  const result = await db
    .from("professional_commissions")
    .select(
      "id,financial_entry_id,professional_id,commission_amount,status,paid_at,created_at,financial_entry:financial_entries(patient_name_snapshot,service_name_snapshot,occurred_at,professional_id)",
    )
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (result.error) throw result.error;
  return result.data ?? [];
}

function SummaryCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-border bg-background/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-lg font-semibold">{value}</p>
        </div>
        <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary">
          <Icon className="size-4" />
        </span>
      </div>
    </article>
  );
}

export function ProfessionalCommissionSummary({ professionalId }: { professionalId: string }) {
  const query = useQuery({
    queryKey: ["professional-own-commissions", professionalId],
    queryFn: () => loadProfessionalCommissions(professionalId),
    enabled: Boolean(professionalId),
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <section className="mt-7 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <h2 className="text-lg font-semibold">Minhas comissões</h2>
        <p className="mt-2 text-sm text-muted-foreground">Carregando suas comissões...</p>
      </section>
    );
  }

  if (query.error) {
    return (
      <section className="mt-7 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <h2 className="text-lg font-semibold">Minhas comissões</h2>
        <p className="mt-2 text-sm text-destructive">Não foi possível carregar suas comissões.</p>
      </section>
    );
  }

  const rows = query.data ?? [];
  const total = rows.reduce((sum: number, row: any) => sum + Number(row.commission_amount || 0), 0);
  const pending = rows
    .filter((row: any) => row.status === "pending")
    .reduce((sum: number, row: any) => sum + Number(row.commission_amount || 0), 0);
  const paid = rows
    .filter((row: any) => row.status === "paid")
    .reduce((sum: number, row: any) => sum + Number(row.commission_amount || 0), 0);

  return (
    <section className="mt-7 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Financeiro individual
        </p>
        <h2 className="mt-2 text-xl font-semibold">Minhas comissões</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Aqui aparecem somente os seus atendimentos e repasses. Dados financeiros gerais da clínica
          não são exibidos.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={CircleDollarSign} label="Comissão total" value={money(total)} />
        <SummaryCard icon={Clock3} label="Comissão pendente" value={money(pending)} />
        <SummaryCard icon={CheckCircle2} label="Comissão paga" value={money(paid)} />
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold">Histórico por atendimento</h3>
        {rows.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhuma comissão registrada até o momento.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {rows.map((row: any) => {
              const entry = relatedEntry(row);
              return (
                <article
                  key={row.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {entry?.patient_name_snapshot || "Paciente não identificado"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry?.service_name_snapshot || "Serviço não identificado"} ·{" "}
                      {dateLabel(entry?.occurred_at)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <strong className="text-sm">{money(row.commission_amount)}</strong>
                    <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
