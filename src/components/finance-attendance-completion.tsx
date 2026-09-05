/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, ReceiptText, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function parseMoney(value: string) {
  if (!value.trim()) return null;
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

async function loadCompletionAccess() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sessão expirada.");
  const result = await db
    .from("financial_access")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("is_active", true);
  if (result.error) throw result.error;
  const roles = (result.data ?? []).map((row: any) => String(row.role));
  return {
    allowed: roles.some((role: string) => ["admin", "finance", "reception"].includes(role)),
    roles,
  };
}

async function loadConfirmedAppointments() {
  const [appointments, methods, cash] = await Promise.all([
    db
      .from("appointments")
      .select(
        "id,patient_name,scheduled_date,scheduled_time,status,professional_id,professional_name_snapshot,custom_price,service_price_snapshot,service_id,service:services(name,price),professional:professionals(name)",
      )
      .eq("status", "confirmado")
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true }),
    db.from("payment_methods").select("id,code,name,is_cash").eq("is_active", true).order("sort_order"),
    db
      .from("cash_sessions")
      .select("id,business_date,status,opened_at")
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1),
  ]);
  for (const result of [appointments, methods, cash]) if (result.error) throw result.error;
  return {
    appointments: appointments.data ?? [],
    methods: methods.data ?? [],
    openCash: cash.data?.[0] ?? null,
  };
}

export function FinanceAttendanceCompletion() {
  const queryClient = useQueryClient();
  const access = useQuery({ queryKey: ["finance-attendance-access"], queryFn: loadCompletionAccess });
  const data = useQuery({
    queryKey: ["finance-confirmed-appointments"],
    queryFn: loadConfirmedAppointments,
    enabled: Boolean(access.data?.allowed),
  });
  const [selectedId, setSelectedId] = useState("");
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState("yes");
  const [method, setMethod] = useState("");
  const [installments, setInstallments] = useState("1");
  const [discountType, setDiscountType] = useState("none");
  const [discountValue, setDiscountValue] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [manualCommission, setManualCommission] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => (data.data?.appointments ?? []).find((row: any) => row.id === selectedId) ?? null,
    [data.data?.appointments, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    const base = Number(selected.custom_price ?? selected.service_price_snapshot ?? selected.service?.price ?? 0);
    setAmount(base.toFixed(2).replace(".", ","));
  }, [selected]);

  useEffect(() => {
    if (!method && data.data?.methods?.length) setMethod(data.data.methods[0].code);
  }, [data.data?.methods, method]);

  if (!access.data?.allowed) return null;

  const finalize = async () => {
    if (!selected) return toast.error("Selecione um atendimento confirmado.");
    const parsedAmount = parseMoney(amount);
    const parsedDiscount = discountType === "none" ? 0 : parseMoney(discountValue);
    const parsedCommission = parseMoney(manualCommission);
    const parsedInstallments = Number(installments);
    if (parsedAmount === null || parsedAmount < 0) return toast.error("Informe um valor válido para o procedimento.");
    if (discountType !== "none" && (parsedDiscount === null || parsedDiscount < 0)) return toast.error("Informe um desconto válido.");
    if (!Number.isInteger(parsedInstallments) || parsedInstallments < 1) return toast.error("Informe uma quantidade de parcelas válida.");
    if (received === "yes" && !method) return toast.error("Selecione a forma de pagamento.");
    if (received === "no" && !dueDate) return toast.error("Informe o vencimento do valor a receber.");
    if (parsedCommission !== null && !manualReason.trim()) return toast.error("Informe o motivo do ajuste manual da comissão.");

    setBusy(true);
    const result = await db.rpc("complete_appointment_financially", {
      _appointment_id: selected.id,
      _original_amount: parsedAmount,
      _payment_received: received === "yes",
      _payment_method_code: received === "yes" ? method : null,
      _installments: parsedInstallments,
      _discount_type: discountType === "none" ? null : discountType,
      _discount_value: parsedDiscount ?? 0,
      _receivable_due_date: received === "no" ? dueDate : null,
      _manual_commission_amount: parsedCommission,
      _manual_commission_reason: parsedCommission === null ? null : manualReason.trim(),
    });
    setBusy(false);

    if (result.error) {
      toast.error("Não foi possível finalizar o atendimento.", { description: result.error.message });
      return;
    }

    toast.success("Atendimento finalizado e enviado ao financeiro.");
    setSelectedId("");
    setDiscountType("none");
    setDiscountValue("");
    setDueDate("");
    setManualCommission("");
    setManualReason("");
    setInstallments("1");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance-confirmed-appointments"] }),
      queryClient.invalidateQueries({ queryKey: ["finance-full-v2"] }),
      queryClient.invalidateQueries({ queryKey: ["finance-reception-v2"] }),
      queryClient.invalidateQueries({ queryKey: ["finance-completion"] }),
    ]);
  };

  return (
    <section className="mx-auto max-w-[1500px] px-5 pt-6 lg:px-8">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-primary" />
              <h2 className="text-xl font-semibold">Finalizar atendimento</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Última etapa do fluxo Confirmado → Atendido → Financeiro. Aqui a recepção informa pagamento, desconto, fiado e eventual ajuste manual de comissão antes do faturamento nascer.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">{data.data?.appointments?.length ?? 0} confirmado(s)</Badge>
            <Badge variant={data.data?.openCash ? "default" : "destructive"}>
              {data.data?.openCash ? "Caixa aberto" : "Caixa fechado"}
            </Badge>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)]">
          <div>
            <Label>Atendimento confirmado</Label>
            <select className={selectClass} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              <option value="">Selecione...</option>
              {(data.data?.appointments ?? []).map((row: any) => (
                <option key={row.id} value={row.id}>
                  {dateLabel(row.scheduled_date)} {String(row.scheduled_time ?? "").slice(0, 5)} · {row.patient_name} · {row.service?.name ?? "Serviço"}
                </option>
              ))}
            </select>
            {selected ? (
              <div className="mt-3 rounded-2xl bg-muted/50 p-4 text-sm">
                <strong>{selected.patient_name}</strong>
                <p className="mt-1 text-muted-foreground">{selected.service?.name ?? "Serviço"} · {selected.professional?.name ?? selected.professional_name_snapshot ?? "Profissional"}</p>
                <p className="mt-2 font-medium">Valor base: {money(selected.custom_price ?? selected.service_price_snapshot ?? selected.service?.price)}</p>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label>Valor original</Label>
              <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="600,00" />
            </div>
            <div>
              <Label>Recebeu agora?</Label>
              <select className={selectClass} value={received} onChange={(event) => setReceived(event.target.value)}>
                <option value="yes">Sim, recebido</option>
                <option value="no">Não, ficou a receber / fiado</option>
              </select>
            </div>
            {received === "yes" ? (
              <div>
                <Label>Forma de pagamento</Label>
                <select className={selectClass} value={method} onChange={(event) => setMethod(event.target.value)}>
                  {(data.data?.methods ?? []).map((row: any) => (
                    <option key={row.id} value={row.code}>{row.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </div>
            )}
            <div>
              <Label>Parcelas</Label>
              <Input type="number" min="1" max="24" value={installments} onChange={(event) => setInstallments(event.target.value)} />
            </div>
            <div>
              <Label>Desconto</Label>
              <select className={selectClass} value={discountType} onChange={(event) => setDiscountType(event.target.value)}>
                <option value="none">Sem desconto</option>
                <option value="percent">Percentual (%)</option>
                <option value="amount">Valor (R$)</option>
              </select>
            </div>
            <div>
              <Label>Valor do desconto</Label>
              <Input disabled={discountType === "none"} value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} placeholder={discountType === "percent" ? "10" : "50,00"} />
            </div>
            <div>
              <Label>Comissão manual (opcional)</Label>
              <Input value={manualCommission} onChange={(event) => setManualCommission(event.target.value)} placeholder="Deixe vazio para regra automática" />
            </div>
            <div className="md:col-span-2">
              <Label>Motivo da comissão manual</Label>
              <Input disabled={!manualCommission.trim()} value={manualReason} onChange={(event) => setManualReason(event.target.value)} placeholder="Obrigatório somente se houver ajuste manual" />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {received === "yes" ? <WalletCards className="size-4" /> : <Clock3 className="size-4" />}
            <span>
              {received === "yes"
                ? data.data?.openCash
                  ? "O recebimento será lançado no caixa aberto e no financeiro."
                  : "Abra o caixa antes de concluir um atendimento já recebido."
                : "Será criada uma conta a receber; a taxa da forma de pagamento será calculada apenas quando o cliente pagar."}
            </span>
          </div>
          <Button disabled={!selected || busy} onClick={() => void finalize()}>
            <ReceiptText className="mr-2 size-4" /> {busy ? "Finalizando..." : "Finalizar e enviar ao financeiro"}
          </Button>
        </div>
      </div>
    </section>
  );
}
