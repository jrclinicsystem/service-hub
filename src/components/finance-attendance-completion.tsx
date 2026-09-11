/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, ReceiptText, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [appointments, methods, cash, financialEntries] = await Promise.all([
    db
      .from("appointments")
      .select(
        "id,patient_name,scheduled_date,scheduled_time,status,professional_id,professional_name_snapshot,custom_price,service_price_snapshot,service_id,service:services!appointments_service_id_fkey(name,price),appointment_services(service_id,position,price_snapshot,status,completed_at,service:services!appointment_services_service_id_fkey(name,price)),appointment_sessions(id,session_number,scheduled_date,scheduled_time,status,completed_at),professional:professionals(name)",
      )
      .eq("status", "confirmado")
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true }),
    db
      .from("payment_methods")
      .select("id,code,name,is_cash")
      .eq("is_active", true)
      .order("sort_order"),
    db
      .from("cash_sessions")
      .select("id,business_date,status,opened_at")
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1),
    db
      .from("financial_entries")
      .select("appointment_id,status")
      .not("appointment_id", "is", null),
  ]);
  for (const result of [appointments, methods, cash, financialEntries]) if (result.error) throw result.error;
  const alreadyRegistered = new Set(
    (financialEntries.data ?? [])
      .filter((entry: any) => !["cancelled", "refunded"].includes(String(entry.status ?? "")))
      .map((entry: any) => entry.appointment_id),
  );
  return {
    appointments: (appointments.data ?? []).filter((row: any) => !alreadyRegistered.has(row.id)),
    methods: methods.data ?? [],
    openCash: cash.data?.[0] ?? null,
  };
}

export function FinanceAttendanceCompletion() {
  const queryClient = useQueryClient();
  const access = useQuery({
    queryKey: ["finance-attendance-access"],
    queryFn: loadCompletionAccess,
  });
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

  const selectedItems = useMemo(() => comboItems(selected), [selected]);
  const selectedSessions = useMemo(() => packageSessions(selected), [selected]);

  useEffect(() => {
    if (!selected) return;
    const base = Number(
      selected.custom_price ?? selected.service_price_snapshot ?? selected.service?.price ?? 0,
    );
    setAmount(base.toFixed(2).replace(".", ","));
  }, [selected]);

  useEffect(() => {
    if (!method && data.data?.methods?.length) setMethod(data.data.methods[0].code);
  }, [data.data?.methods, method]);

  if (!access.data?.allowed) return null;

  const finalize = async () => {
    if (!selected) {
      toast.error("Selecione um atendimento confirmado.");
      return;
    }
    const parsedAmount = parseMoney(amount);
    const parsedDiscount = discountType === "none" ? 0 : parseMoney(discountValue);
    const parsedCommission = parseMoney(manualCommission);
    const parsedInstallments = Number(installments);
    if (parsedAmount === null || parsedAmount < 0) {
      toast.error("Informe um valor válido para o procedimento.");
      return;
    }
    if (discountType !== "none" && (parsedDiscount === null || parsedDiscount < 0)) {
      toast.error("Informe um desconto válido.");
      return;
    }
    if (
      !Number.isInteger(parsedInstallments) ||
      parsedInstallments < 1 ||
      parsedInstallments > 12
    ) {
      toast.error("Informe uma quantidade de parcelas entre 1 e 12.");
      return;
    }

    if (received === "yes" && !method) {
      toast.error("Selecione a forma de pagamento.");
      return;
    }
    if (received === "no" && !dueDate) {
      toast.error("Informe o vencimento do valor a receber.");
      return;
    }
    if (parsedCommission !== null && !manualReason.trim()) {
      toast.error("Informe o motivo do ajuste manual da comissão.");
      return;
    }

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
      toast.error("Não foi possível finalizar o atendimento.", {
        description: result.error.message,
      });
      return;
    }

    const hasPendingPackageSessions = selectedSessions.length > 1 && selectedSessions.some((item: any) => item.status !== "completed");
    toast.success(hasPendingPackageSessions ? "Pagamento do pacote registrado." : "Atendimento finalizado e enviado ao financeiro.", {
      description: hasPendingPackageSessions ? "As sessões pendentes continuam em andamento na Agenda." : undefined,
    });
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
    <section className="mx-auto w-full max-w-[1540px] px-5 pt-3 sm:px-8 lg:px-10">
      <div className="rounded-[22px] border border-border/80 bg-card p-5 shadow-[0_8px_24px_rgb(15_77_62_/_0.07)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-primary" />
              <h2 className="text-xl font-semibold">Registrar pagamento</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Registre o pagamento, desconto, fiado e eventual ajuste manual de comissão. Em pacotes,
              o valor pode ser recebido integralmente agora e as sessões continuam sendo acompanhadas
              separadamente até a última conclusão.
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
            <select
              className={selectClass}
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              <option value="">Selecione...</option>
              {(data.data?.appointments ?? []).map((row: any) => (
                <option key={row.id} value={row.id}>
                  {dateLabel(row.scheduled_date)} {String(row.scheduled_time ?? "").slice(0, 5)} ·{" "}
                  {row.patient_name} · {row.service?.name ?? "Serviço"}
                </option>
              ))}
            </select>
            {selected ? (
              <div className="mt-3 rounded-2xl bg-muted/50 p-4 text-sm">
                <strong>{selected.patient_name}</strong>
                <p className="mt-1 text-muted-foreground">
                  {selected.service?.name ?? "Serviço"} ·{" "}
                  {selected.professional?.name ??
                    selected.professional_name_snapshot ??
                    "Profissional"}
                </p>
                <p className="mt-2 font-medium">
                  Valor base:{" "}
                  {money(
                    selected.custom_price ??
                      selected.service_price_snapshot ??
                      selected.service?.price,
                  )}
                </p>
                {selectedItems.length > 1 ? <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3"><span className="text-xs font-semibold">Serviços incluídos</span>{selectedItems.map((item: any) => <div key={item.service_id} className="flex items-center justify-between gap-3 rounded-lg bg-background px-2.5 py-2 text-xs"><span className="min-w-0 truncate">{item.service?.name ?? "Serviço"}</span><strong className="shrink-0">{money(item.price_snapshot ?? item.service?.price)}</strong></div>)}</div> : null}
                {selectedSessions.length > 1 ? <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">Sessões do pacote</span><Badge variant="outline">{selectedSessions.filter((item: any) => item.status === "completed").length}/{selectedSessions.length} concluídas</Badge></div>{selectedSessions.map((item: any) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-background px-2.5 py-2 text-xs"><span>Sessão {item.session_number} · {item.status === "completed" ? "Concluída" : "Pendente"}</span><span className="text-muted-foreground">{item.scheduled_date ? dateLabel(item.scheduled_date) : "Data a definir"}</span></div>)}<p className="text-[11px] font-medium text-primary">O pagamento pode ser registrado mesmo com sessões pendentes.</p></div> : null}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label>Valor original</Label>
              <Input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="600,00"
              />
            </div>
            <div>
              <Label>Recebeu agora?</Label>
              <select
                className={selectClass}
                value={received}
                onChange={(event) => setReceived(event.target.value)}
              >
                <option value="yes">Sim, recebido</option>
                <option value="no">Não, ficou a receber / fiado</option>
              </select>
            </div>
            {received === "yes" ? (
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="h-10 w-full bg-background">
                    <SelectValue placeholder="Selecione a forma de pagamento" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[120]">
                    {(data.data?.methods ?? []).map((row: any) => (
                      <SelectItem key={row.id} value={row.code}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            )}
            <div>
              <Label>Parcelas (1 a 12)</Label>
              <Input
                type="number"
                min="1"
                max="12"
                value={installments}
                onChange={(event) => setInstallments(event.target.value)}
              />
            </div>
            <div>
              <Label>Desconto</Label>
              <select
                className={selectClass}
                value={discountType}
                onChange={(event) => setDiscountType(event.target.value)}
              >
                <option value="none">Sem desconto</option>
                <option value="percent">Percentual (%)</option>
                <option value="amount">Valor (R$)</option>
              </select>
            </div>
            <div>
              <Label>Valor do desconto</Label>
              <Input
                disabled={discountType === "none"}
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
                placeholder={discountType === "percent" ? "10" : "50,00"}
              />
            </div>
            <div>
              <Label>Comissão manual (opcional)</Label>
              <Input
                value={manualCommission}
                onChange={(event) => setManualCommission(event.target.value)}
                placeholder="Deixe vazio para regra automática"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Motivo da comissão manual</Label>
              <Input
                disabled={!manualCommission.trim()}
                value={manualReason}
                onChange={(event) => setManualReason(event.target.value)}
                placeholder="Obrigatório somente se houver ajuste manual"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-background/45 p-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {received === "yes" ? (
              <WalletCards className="size-4" />
            ) : (
              <Clock3 className="size-4" />
            )}
            <span>
              {received === "yes"
                ? data.data?.openCash
                  ? "O recebimento será lançado no caixa aberto e no financeiro."
                  : "Abra o caixa antes de concluir um atendimento já recebido."
                : "Será criada uma conta a receber; a taxa da forma de pagamento será calculada apenas quando o cliente pagar."}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                window.dispatchEvent(new CustomEvent("finance:open-split-payment", { detail: { appointmentId: selected.id } }));
                requestAnimationFrame(() =>
                  document.getElementById("finance-split-payment")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                );
              }}
            >
              Dividir em 2 ou mais formas
            </Button>
            <Button disabled={!selected || busy} onClick={() => void finalize()}>
              <ReceiptText className="mr-2 size-4" />{" "}
              {busy ? "Registrando..." : "Registrar pagamento no financeiro"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
