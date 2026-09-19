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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [batchMode, setBatchMode] = useState<"pix" | "cash" | "mixed">("pix");
  const [batchCash, setBatchCash] = useState("");
  const [batchPix, setBatchPix] = useState("");
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
      if (remainingAmount(row) <= 0) continue;
      const entry = relatedEntry(row);
      const professionalId = String(row.professional_id ?? "unknown");
      const name =
        entry?.professional_name_snapshot ||
        professionalMap.get(professionalId) ||
        `Profissional ${professionalId.slice(0, 8)}`;
      const current = grouped.get(professionalId) ?? { professionalId, name, rows: [] as any[] };
      current.rows.push(row);
      grouped.set(professionalId, current);
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [professionalMap, query.data?.commissions]);

  const commissionSummary = useMemo(() => {
    const rows = query.data?.commissions ?? [];
    const total = rows.reduce((sum: number, row: any) => sum + Number(row.commission_amount ?? 0), 0);
    const paid = rows.reduce((sum: number, row: any) => sum + paidAmount(row), 0);
    return {
      total,
      paid,
      remaining: Math.max(0, Math.round((total - paid) * 100) / 100),
    };
  }, [query.data?.commissions]);

  const payableRows = useMemo(
    () => (query.data?.commissions ?? []).filter((row: any) => remainingAmount(row) > 0),
    [query.data?.commissions],
  );

  const selectedRows = useMemo(
    () => payableRows.filter((row: any) => selectedIds.has(String(row.id))),
    [payableRows, selectedIds],
  );

  const selectedTotal = useMemo(
    () => Math.round(selectedRows.reduce((sum: number, row: any) => sum + remainingAmount(row), 0) * 100) / 100,
    [selectedRows],
  );

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

  const toggleCommissionSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroupSelection = (rows: any[]) => {
    const ids = rows.map((row) => String(row.id));
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const selectAllPending = () => {
    const allIds = payableRows.map((row: any) => String(row.id));
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(allIds));
  };

  const paySelected = async () => {
    if (!selectedRows.length) {
      toast.error("Selecione pelo menos uma comissão.");
      return;
    }

    let cash = batchMode === "pix" ? 0 : parseMoney(batchCash || "0");
    let pix = batchMode === "cash" ? 0 : parseMoney(batchPix || "0");

    if (batchMode === "cash") cash = selectedTotal;
    if (batchMode === "pix") pix = selectedTotal;

    if (!Number.isFinite(cash) || !Number.isFinite(pix) || cash < 0 || pix < 0) {
      toast.error("Informe valores válidos para Dinheiro e PIX.");
      return;
    }

    if (batchMode === "mixed" && (cash <= 0 || pix <= 0)) {
      toast.error("No pagamento misto, informe uma parte em Dinheiro e outra em PIX.");
      return;
    }

    const total = Math.round((cash + pix) * 100) / 100;
    if (Math.abs(total - selectedTotal) > 0.009) {
      toast.error(`Dinheiro + PIX deve totalizar exatamente ${money(selectedTotal)}.`);
      return;
    }

    if (!window.confirm(`Confirmar o pagamento de ${selectedRows.length} comissão(ões), totalizando ${money(selectedTotal)}?`)) return;

    setBusyId("batch");
    try {
      const result = await db.rpc("pay_commissions_batch_split", {
        _commission_ids: selectedRows.map((row: any) => row.id),
        _cash_amount: cash,
        _pix_amount: pix,
      });
      if (result.error) throw result.error;

      setSelectedIds(new Set());
      setBatchCash("");
      setBatchPix("");
      setBatchMode("pix");
      toast.success("Comissões pagas em lote.", {
        description: `${money(cash)} em dinheiro · ${money(pix)} em PIX.`,
      });
      await refresh();
    } catch (error: any) {
      toast.error("Não foi possível pagar as comissões em lote.", {
        description: error?.message || "Tente novamente.",
      });
    } finally {
      setBusyId(null);
    }
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
            <h2 className="text-xl font-bold tracking-tight text-foreground">Comissões por profissional</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Clique no nome do profissional para visualizar as comissões. Registre pagamento total,
              metade ou um valor personalizado. Todo valor pago entra automaticamente em Despesas.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-primary-soft/30 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total de comissões</p>
            <p className="mt-1 text-xl font-bold text-foreground">{money(commissionSummary.total)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total pago</p>
            <p className="mt-1 text-xl font-bold text-foreground">{money(commissionSummary.paid)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total restante</p>
            <p className="mt-1 text-xl font-bold text-foreground">{money(commissionSummary.remaining)}</p>
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-primary/15 bg-primary-soft/20 p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagamento em lote</p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">Pagar várias comissões de uma vez</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Selecione profissionais ou comissões, confira o total e escolha como o valor saiu da clínica.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={selectAllPending} disabled={!payableRows.length || busyId === "batch"}>
              {payableRows.length > 0 && payableRows.every((row: any) => selectedIds.has(String(row.id))) ? "Limpar seleção" : "Selecionar todas pendentes"}
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Selecionadas</p>
              <p className="mt-1 text-xl font-bold">{selectedRows.length}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total a pagar</p>
              <p className="mt-1 text-xl font-bold">{money(selectedTotal)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Forma de pagamento</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["pix", "cash", "mixed"] as const).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={batchMode === mode ? "default" : "outline"}
                    onClick={() => {
                      setBatchMode(mode);
                      setBatchCash("");
                      setBatchPix("");
                    }}
                    disabled={busyId === "batch"}
                  >
                    {mode === "pix" ? "PIX" : mode === "cash" ? "Dinheiro" : "Dinheiro + PIX"}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {batchMode === "mixed" ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Dinheiro</p>
                <Input inputMode="decimal" value={batchCash} onChange={(e) => setBatchCash(e.target.value)} placeholder="0,00" disabled={busyId === "batch"} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">PIX</p>
                <Input inputMode="decimal" value={batchPix} onChange={(e) => setBatchPix(e.target.value)} placeholder="0,00" disabled={busyId === "batch"} />
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {batchMode === "pix" ? `Pagamento integral de ${money(selectedTotal)} via PIX.` : batchMode === "cash" ? `Pagamento integral de ${money(selectedTotal)} em dinheiro.` : `A soma de Dinheiro + PIX precisa ser ${money(selectedTotal)}.`}
            </p>
            <Button type="button" disabled={!selectedRows.length || selectedTotal <= 0 || busyId === "batch"} onClick={() => void paySelected()}>
              <CircleDollarSign className="mr-2 size-4" />
              {busyId === "batch" ? "Pagando..." : "Pagar selecionadas"}
            </Button>
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
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-primary"
                        checked={group.rows.every((row: any) => selectedIds.has(String(row.id)))}
                        onChange={(event) => {
                          event.stopPropagation();
                          toggleGroupSelection(group.rows);
                        }}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Selecionar comissões de ${group.name}`}
                      />
                      <ChevronDown
                        className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                      />
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-foreground">{group.name}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {expanded
                            ? `${group.rows.length} comissão(ões)`
                            : "Clique para ver as comissões"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pl-7 text-xs sm:justify-end sm:pl-0">
                      <span className="rounded-full bg-background/80 px-3 py-1.5">
                        Total <strong className="ml-1 text-sm">{money(groupTotal)}</strong>
                      </span>
                      {expanded ? (
                        <>
                          <span>
                            Pago <strong className="ml-1">{money(groupPaid)}</strong>
                          </span>
                          <span>
                            Restante <strong className="ml-1">{money(groupRemaining)}</strong>
                          </span>
                        </>
                      ) : null}
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
                              <div className="flex min-w-0 items-start gap-3">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 size-4 shrink-0 accent-primary"
                                  checked={selectedIds.has(String(row.id))}
                                  onChange={() => toggleCommissionSelection(String(row.id))}
                                  aria-label="Selecionar comissão"
                                />
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
