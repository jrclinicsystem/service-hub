/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  HandCoins,
  UserRoundCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

function formatDate(value?: string | null) {
  if (!value) return "Data não informada";
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
}

function commissionTypeLabel(type: string) {
  if (type === "percentage") return "Percentual";
  if (type === "fixed_per_patient") return "Valor por paciente";
  return "Manual";
}

function relatedEntry(row: any) {
  return Array.isArray(row?.financial_entry)
    ? (row.financial_entry[0] ?? null)
    : (row?.financial_entry ?? null);
}

function paidAmount(row: any) {
  return Math.max(
    0,
    Number(row?.paid_amount ?? (row?.status === "paid" ? row?.commission_amount : 0) ?? 0),
  );
}

function remainingAmount(row: any) {
  return Math.max(
    0,
    Math.round((Number(row?.commission_amount ?? 0) - paidAmount(row)) * 100) / 100,
  );
}

async function loadCommissions() {
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
        "id,professional_id,commission_type,percentage,fixed_amount,commission_amount,paid_amount,status,paid_at,created_at,financial_entry:financial_entries(patient_name_snapshot,professional_name_snapshot,service_name_snapshot,occurred_at)",
      )
      .order("created_at", { ascending: false })
      .limit(300),
    db.from("professionals").select("id,name").order("name"),
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
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedProfessionals, setExpandedProfessionals] = useState<Set<string>>(
    () => new Set(),
  );
  const query = useQuery({
    queryKey: ["finance-commission-payments-grouped"],
    queryFn: loadCommissions,
  });

  const professionalMap = useMemo(
    () =>
      new Map<string, string>(
        (query.data?.professionals ?? []).map((row: any) => [String(row.id), String(row.name)]),
      ),
    [query.data?.professionals],
  );

  const groups = useMemo(() => {
    const grouped = new Map<string, { professionalId: string; name: string; rows: any[] }>();
    for (const row of query.data?.commissions ?? []) {
      const entry = relatedEntry(row);
      const professionalId = String(row.professional_id ?? "unknown");
      const name =
        entry?.professional_name_snapshot ||
        professionalMap.get(professionalId) ||
        `Profissional ${professionalId.slice(0, 8)}`;
      const current = grouped.get(professionalId) ?? { professionalId, name, rows: [] };
      current.rows.push(row);
      grouped.set(professionalId, current);
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [professionalMap, query.data?.commissions]);

  if (!query.data?.allowed) return null;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance-commission-payments-grouped"] }),
      queryClient.invalidateQueries({ queryKey: ["finance-full-v2"] }),
      queryClient.invalidateQueries({ queryKey: ["finance-completion-lookups"] }),
      queryClient.invalidateQueries({ queryKey: ["finance-completion-report"] }),
      queryClient.invalidateQueries({ queryKey: ["professional-own-commissions"] }),
    ]);
  };

  const toggleProfessional = (professionalId: string) => {
    setExpandedProfessionals((current) => {
      const next = new Set(current);
      if (next.has(professionalId)) next.delete(professionalId);
      else next.add(professionalId);
      return next;
    });
  };

  const registerPayment = async (row: any, amount: number) => {
    const remaining = remainingAmount(row);
    const value = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (value > remaining) {
      toast.error(`O valor não pode ser maior que o restante de ${money(remaining)}.`);
      return;
    }

    const entry = relatedEntry(row);
    const professional =
      entry?.professional_name_snapshot ||
      professionalMap.get(String(row.professional_id)) ||
      "Profissional";
    const confirmed = window.confirm(
      `Confirmar pagamento de ${money(value)} para ${professional}? O valor será lançado automaticamente em Despesas.`,
    );
    if (!confirmed) return;

    setBusyId(String(row.id));
    try {
      const result = await db.rpc("register_commission_payment", {
        _commission_id: row.id,
        _amount: value,
      });
      if (result.error) throw result.error;
      setAmounts((current) => ({ ...current, [row.id]: "" }));
      toast.success(value >= remaining ? "Comissão quitada." : "Pagamento parcial registrado.", {
        description: "O pagamento também foi lançado automaticamente em Despesas.",
      });
      await refresh();
    } catch (error: any) {
      toast.error("Não foi possível registrar o pagamento.", {
        description: error?.message || "Tente novamente.",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="finance-commission-payment-actions hidden mx-auto w-full max-w-[1540px] px-5 pb-8 sm:px-8 lg:px-10">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
            <UserRoundCheck className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Comissões por profissional</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Clique no nome do profissional para visualizar as comissões. Registre pagamento total,
              metade ou um valor personalizado. Todo valor pago entra automaticamente em Despesas.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando comissões...</p>
          ) : groups.length ? (
            groups.map((group) => {
              const groupTotal = group.rows.reduce(
                (sum, row) => sum + Number(row.commission_amount ?? 0),
                0,
              );
              const groupPaid = group.rows.reduce((sum, row) => sum + paidAmount(row), 0);
              const groupRemaining = Math.max(0, groupTotal - groupPaid);
              const expanded = expandedProfessionals.has(group.professionalId);
              const contentId = `commission-group-${group.professionalId}`;

              return (
                <article
                  key={group.professionalId}
                  className="overflow-hidden rounded-3xl border border-border bg-background/45"
                >
                  <button
                    type="button"
                    className="flex w-full flex-col gap-2 bg-primary-soft/35 px-4 py-4 text-left transition-colors hover:bg-primary-soft/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset sm:flex-row sm:items-center sm:justify-between sm:px-5"
                    aria-expanded={expanded}
                    aria-controls={contentId}
                    onClick={() => toggleProfessional(group.professionalId)}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ChevronDown
                        className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                      />
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-foreground">{group.name}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {group.rows.length} comissão(ões) · restante {money(groupRemaining)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 pl-7 text-xs sm:pl-0">
                      <span>
                        <strong>{money(groupTotal)}</strong> total
                      </span>
                      <span>
                        <strong>{money(groupPaid)}</strong> pago
                      </span>
                    </div>
                  </button>

                  {expanded ? (
                    <div id={contentId} className="divide-y divide-border border-t border-border">
                      {group.rows.map((row: any) => {
                        const entry = relatedEntry(row);
                        const total = Number(row.commission_amount ?? 0);
                        const paid = paidAmount(row);
                        const remaining = remainingAmount(row);
                        const partial = row.status !== "paid" && paid > 0;
                        const busy = busyId === String(row.id);
                        const custom = amounts[row.id] ?? "";
                        return (
                          <div key={row.id} className="p-4 sm:p-5">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold">
                                  {entry?.patient_name_snapshot || "Paciente não identificado"}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {entry?.service_name_snapshot || "Serviço não identificado"} ·{" "}
                                  {formatDate(entry?.occurred_at)}
                                </p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {commissionTypeLabel(row.commission_type)}
                                  {row.commission_type === "percentage" && row.percentage != null
                                    ? ` · ${Number(row.percentage)}%`
                                    : ""}
                                  {row.commission_type === "fixed_per_patient" &&
                                  row.fixed_amount != null
                                    ? ` · ${money(row.fixed_amount)} por paciente`
                                    : ""}
                                </p>
                              </div>

                              <div className="min-w-[250px]">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span>
                                    Total <strong className="ml-1">{money(total)}</strong>
                                  </span>
                                  <span>
                                    Pago <strong className="ml-1">{money(paid)}</strong>
                                  </span>
                                  <span>
                                    Restante <strong className="ml-1">{money(remaining)}</strong>
                                  </span>
                                  <Badge variant={row.status === "paid" ? "default" : "secondary"}>
                                    {row.status === "paid"
                                      ? "Pago"
                                      : partial
                                        ? "Parcial"
                                        : "Pendente"}
                                  </Badge>
                                </div>

                                {row.status === "paid" || remaining <= 0 ? (
                                  <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                                    <CheckCircle2 className="size-4 text-primary" />
                                    Quitado{row.paid_at ? ` em ${formatDate(row.paid_at)}` : ""}
                                  </div>
                                ) : (
                                  <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_auto_auto]">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={busy}
                                      onClick={() => {
                                        const half = Math.max(
                                          0.01,
                                          Math.round((remaining / 2) * 100) / 100,
                                        );
                                        void registerPayment(row, half);
                                      }}
                                    >
                                      <HandCoins className="mr-1.5 size-4" /> Pagar metade
                                    </Button>
                                    <Input
                                      inputMode="decimal"
                                      placeholder="Valor já pago"
                                      value={custom}
                                      disabled={busy}
                                      onChange={(event) =>
                                        setAmounts((current) => ({
                                          ...current,
                                          [row.id]: event.target.value,
                                        }))
                                      }
                                    />
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={busy || !custom.trim()}
                                      onClick={() => void registerPayment(row, parseMoney(custom))}
                                    >
                                      Registrar valor
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={busy}
                                      onClick={() => void registerPayment(row, remaining)}
                                    >
                                      <CircleDollarSign className="mr-1.5 size-4" /> Quitar restante
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma comissão registrada.</p>
          )}
        </div>
      </div>
    </section>
  );
}
