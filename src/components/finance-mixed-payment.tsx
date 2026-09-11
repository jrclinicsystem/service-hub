/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Split, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function comboItems(appointment: any) {
  return [...(appointment?.appointment_services ?? [])].sort(
    (a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0),
  );
}

function packageSessions(appointment: any) {
  return [...(appointment?.appointment_sessions ?? [])].sort(
    (a: any, b: any) => Number(a.session_number ?? 0) - Number(b.session_number ?? 0),
  );
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

async function loadMixedPaymentData() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sessão expirada.");

  const [access, appointments, methods] = await Promise.all([
    db.from("financial_access").select("role").eq("user_id", data.user.id).eq("is_active", true),
    db
      .from("appointments")
      .select("id,patient_name,scheduled_date,scheduled_time,status,professional_id,professional_name_snapshot,custom_price,service_price_snapshot,service_id,service:services(name,price),appointment_services(service_id,position,price_snapshot,status,completed_at,service:services!appointment_services_service_id_fkey(name,price)),appointment_sessions(id,session_number,scheduled_date,scheduled_time,status,completed_at),financial_entries(id,status),professional:professionals(name)")
      .eq("status", "confirmado")
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true }),
    db.from("payment_methods").select("id,code,name").eq("is_active", true).order("sort_order"),
  ]);
  if (access.error) throw access.error;
  if (appointments.error) throw appointments.error;
  if (methods.error) throw methods.error;

  const roles = (access.data ?? []).map((row: any) => String(row.role));
  return {
    allowed: roles.some((role: string) => ["admin", "finance", "reception"].includes(role)),
    appointments: (appointments.data ?? []).filter((row: any) => !(row.financial_entries ?? []).some((entry: any) => !["cancelled", "refunded"].includes(entry.status))),
    methods: methods.data ?? [],
  };
}

type SplitRow = { method: string; amount: string; installments: string };

export function FinanceMixedPayment() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["finance-mixed-payment-data"], queryFn: loadMixedPaymentData });
  const [selectedId, setSelectedId] = useState("");
  const [amount, setAmount] = useState("");
  const [discountType, setDiscountType] = useState("none");
  const [discountValue, setDiscountValue] = useState("");
  const [manualCommission, setManualCommission] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [splits, setSplits] = useState<SplitRow[]>([
    { method: "", amount: "", installments: "1" },
    { method: "", amount: "", installments: "1" },
  ]);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => (query.data?.appointments ?? []).find((row: any) => row.id === selectedId) ?? null,
    [query.data?.appointments, selectedId],
  );

  const selectedItems = useMemo(() => comboItems(selected), [selected]);
  const selectedSessions = useMemo(() => packageSessions(selected), [selected]);

  useEffect(() => {
    if (!selected) return;
    const base = Number(selected.custom_price ?? selected.service_price_snapshot ?? selected.service?.price ?? 0);
    setAmount(base.toFixed(2).replace(".", ","));
  }, [selected]);

  useEffect(() => {
    const firstMethod = query.data?.methods?.[0]?.code;
    if (!firstMethod) return;
    setSplits((current) => current.map((row) => (row.method ? row : { ...row, method: firstMethod })));
  }, [query.data?.methods]);

  if (!query.data?.allowed) return null;

  const parsedAmount = parseMoney(amount) ?? 0;
  const parsedDiscount = discountType === "none" ? 0 : parseMoney(discountValue) ?? 0;
  const discountAmount =
    discountType === "percent" ? Math.round((parsedAmount * parsedDiscount) / 100 * 100) / 100 : parsedDiscount;
  const finalAmount = Math.max(0, Math.round((parsedAmount - discountAmount) * 100) / 100);
  const splitTotal = Math.round(splits.reduce((sum, row) => sum + (parseMoney(row.amount) ?? 0), 0) * 100) / 100;
  const difference = Math.round((finalAmount - splitTotal) * 100) / 100;

  const updateSplit = (index: number, patch: Partial<SplitRow>) => {
    setSplits((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const finalize = async () => {
    if (!selected) return toast.error("Selecione um atendimento confirmado.");
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return toast.error("Informe um valor original válido.");
    if (discountType === "percent" && (parsedDiscount < 0 || parsedDiscount > 100)) return toast.error("Percentual de desconto inválido.");
    if (discountType === "amount" && (parsedDiscount < 0 || parsedDiscount > parsedAmount)) return toast.error("Valor de desconto inválido.");
    if (splits.length < 2) return toast.error("Pagamento misto precisa de pelo menos duas formas.");
    if (Math.abs(difference) > 0.009) return toast.error(`A soma dos pagamentos precisa fechar ${money(finalAmount)}. Diferença: ${money(difference)}.`);

    const payments = [];
    for (const row of splits) {
      const value = parseMoney(row.amount);
      const parcelCount = Number(row.installments);
      if (!row.method || value === null || value <= 0) return toast.error("Preencha forma e valor de todos os pagamentos.");
      if (!Number.isInteger(parcelCount) || parcelCount < 1 || parcelCount > 12) return toast.error("Parcelas devem ficar entre 1 e 12.");
      payments.push({ method_code: row.method, amount: value, installments: parcelCount });
    }

    const commission = manualCommission.trim() ? parseMoney(manualCommission) : null;
    if (manualCommission.trim() && (commission === null || commission < 0)) return toast.error("Comissão manual inválida.");
    if (commission !== null && !manualReason.trim()) return toast.error("Informe o motivo da comissão manual.");

    setBusy(true);
    try {
      const result = await db.rpc("complete_appointment_financially_mixed", {
        _appointment_id: selected.id,
        _payments: payments,
        _original_amount: parsedAmount,
        _discount_type: discountType === "none" ? null : discountType,
        _discount_value: parsedDiscount,
        _manual_commission_amount: commission,
        _manual_commission_reason: commission === null ? null : manualReason.trim(),
      });
      if (result.error) throw result.error;
      const hasPendingPackageSessions = selectedSessions.length > 1 && selectedSessions.some((item: any) => item.status !== "completed");
      toast.success(hasPendingPackageSessions ? "Pagamento do pacote registrado." : "Atendimento finalizado com pagamento misto.", {
        description: hasPendingPackageSessions ? "As sessões pendentes continuam em andamento na Agenda." : "Cada forma foi registrada separadamente e as taxas foram aplicadas somente na parte correspondente.",
      });
      setSelectedId("");
      setDiscountType("none");
      setDiscountValue("");
      setManualCommission("");
      setManualReason("");
      const firstMethod = query.data?.methods?.[0]?.code ?? "";
      setSplits([
        { method: firstMethod, amount: "", installments: "1" },
        { method: firstMethod, amount: "", installments: "1" },
      ]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance-mixed-payment-data"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-confirmed-appointments"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-full-v2"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-completion-report"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-completion-lookups"] }),
      ]);
    } catch (error: any) {
      toast.error("Não foi possível finalizar com pagamento misto.", { description: error?.message });
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <section className="finance-mixed-payment hidden mx-auto w-full max-w-[1540px] px-5 pt-3 sm:px-8 lg:px-10">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Split className="size-5" />
          </span>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Finalizar com pagamento misto</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Divida o mesmo atendimento entre Pix, dinheiro, cartão ou outras formas. A taxa é calculada apenas sobre cada parte.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_2fr]">
          <div>
            <Label>Atendimento confirmado</Label>
            <select className={selectClass} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Selecione...</option>
              {(query.data?.appointments ?? []).map((row: any) => (
                <option key={row.id} value={row.id}>
                  {dateLabel(row.scheduled_date)} {String(row.scheduled_time ?? "").slice(0, 5)} · {row.patient_name} · {row.service?.name ?? "Serviço"}
                </option>
              ))}
            </select>
            {selected ? (
              <div className="mt-3 rounded-2xl bg-muted/50 p-4 text-sm">
                <strong>{selected.patient_name}</strong>
                <p className="mt-1 text-muted-foreground">{selected.service?.name ?? "Serviço"} · {selected.professional?.name ?? selected.professional_name_snapshot ?? "Profissional"}</p>
                {selectedItems.length > 1 ? <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3">{selectedItems.map((item: any) => <div key={item.service_id} className="flex items-center justify-between gap-2 text-xs"><span>{item.service?.name ?? "Serviço"}</span><strong>{money(item.price_snapshot ?? item.service?.price)}</strong></div>)}</div> : null}
                {selectedSessions.length > 1 ? <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3"><strong className="text-xs">Sessões: {selectedSessions.filter((item: any) => item.status === "completed").length}/{selectedSessions.length} concluídas</strong>{selectedSessions.map((item: any) => <div key={item.id} className="flex items-center justify-between gap-2 text-xs"><span>Sessão {item.session_number} · {item.status === "completed" ? "Concluída" : "Pendente"}</span><span className="text-muted-foreground">{item.scheduled_date ? dateLabel(item.scheduled_date) : "Data a definir"}</span></div>)}<p className="text-[11px] font-semibold text-primary">O pagamento pode ser registrado agora; as sessões continuam em andamento.</p></div> : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label>Valor original</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div>
                <Label>Desconto</Label>
                <select className={selectClass} value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
                  <option value="none">Sem desconto</option><option value="percent">Percentual (%)</option><option value="amount">Valor (R$)</option>
                </select>
              </div>
              <div><Label>Valor do desconto</Label><Input disabled={discountType === "none"} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} /></div>
            </div>

            <div className="rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><strong className="text-sm">Formas de pagamento</strong><p className="text-xs text-muted-foreground">Valor final: {money(finalAmount)}</p></div>
                <Button type="button" size="sm" variant="outline" onClick={() => setSplits((rows) => [...rows, { method: query.data?.methods?.[0]?.code ?? "", amount: "", installments: "1" }])}>
                  <Plus className="mr-1.5 size-4" /> Adicionar forma
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {splits.map((row, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1.2fr_1fr_100px_auto]">
                    <select className={selectClass} value={row.method} onChange={(e) => updateSplit(index, { method: e.target.value })}>
                      {(query.data?.methods ?? []).map((methodRow: any) => <option key={methodRow.id} value={methodRow.code}>{methodRow.name}</option>)}
                    </select>
                    <Input placeholder="Valor" value={row.amount} onChange={(e) => updateSplit(index, { amount: e.target.value })} />
                    <Input type="number" min="1" max="12" value={row.installments} onChange={(e) => updateSplit(index, { installments: e.target.value })} />
                    <Button type="button" size="icon" variant="outline" disabled={splits.length <= 2} onClick={() => setSplits((rows) => rows.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <span>Total informado: <strong>{money(splitTotal)}</strong></span>
                <span className={Math.abs(difference) <= 0.009 ? "text-primary" : "text-destructive"}>Diferença: <strong>{money(difference)}</strong></span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Comissão manual (opcional)</Label><Input value={manualCommission} onChange={(e) => setManualCommission(e.target.value)} placeholder="Vazio = regra automática" /></div>
              <div><Label>Motivo da comissão manual</Label><Input disabled={!manualCommission.trim()} value={manualReason} onChange={(e) => setManualReason(e.target.value)} /></div>
            </div>

            <div className="flex justify-end"><Button disabled={!selected || busy} onClick={() => void finalize()}>{busy ? "Finalizando..." : "Finalizar pagamento misto"}</Button></div>
          </div>
        </div>
      </div>
    </section>
  );
}
