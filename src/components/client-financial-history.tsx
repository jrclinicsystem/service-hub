/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Banknote, CalendarDays, CreditCard, Download, Loader2, ReceiptText, RefreshCcw, WalletCards } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

type PaymentPart = {
  method: string;
  amount: number | string;
  installments: number | string | null;
};

type FinancialRecord = {
  record_id: string;
  record_kind: "paid" | "receivable" | "pending_entry";
  status: string;
  description: string;
  procedure_at: string | null;
  payment_at: string | null;
  payment_method: string | null;
  payment_breakdown: PaymentPart[] | null;
  amount: number | string;
  source: string | null;
};

const money = (value: unknown) =>
  Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function localDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Fortaleza",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(date);
}

function csvCell(value: unknown) {
  let plain = String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
  // Avoid interpreting exported descriptions as formulas in Excel or Sheets.
  if (/^[=+@-]/.test(plain)) plain = "'" + plain;
  return `"${plain.replace(/"/g, '""')}"`;
}

function exportHistory(rows: FinancialRecord[], clientName: string) {
  const header = ["Situação", "Data do pagamento", "Data do procedimento", "Serviço / combo", "Forma de pagamento", "Valor (R$)"];
  const lines = [
    header.map(csvCell).join(";"),
    ...rows.map((row) =>
      [
        row.record_kind === "paid" ? "Recebido" : "Em aberto",
        row.record_kind === "paid" ? localDate(row.payment_at) : "",
        localDate(row.procedure_at),
        row.description,
        row.record_kind === "paid" ? row.payment_method : "A definir",
        Number(row.amount ?? 0).toFixed(2).replace(".", ","),
      ].map(csvCell).join(";"),
    ),
  ];
  const fileName = clientName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55) || "cliente";
  const url = URL.createObjectURL(new Blob(["\ufeff", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `historico-financeiro-${fileName}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ClientFinancialHistory({ clientId, clientName }: { clientId: string; clientName: string }) {
  const query = useQuery({
    queryKey: ["client-financial-history", clientId],
    queryFn: async (): Promise<FinancialRecord[]> => {
      const result = await db.rpc("get_client_financial_history", { _client_id: clientId });
      if (result.error) throw result.error;
      return (result.data ?? []) as FinancialRecord[];
    },
    enabled: Boolean(clientId),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="grid min-h-56 place-items-center rounded-2xl border border-primary/10 bg-card">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando histórico financeiro…
        </span>
      </div>
    );
  }

  if (query.error) {
    const error: any = query.error;
    const restricted = error?.code === "42501" ||
      String(error?.message ?? "").includes("Acesso financeiro insuficiente");
    return (
      <section className="rounded-2xl border border-primary/15 bg-card p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <h3 className="font-semibold">
              {restricted ? "Histórico financeiro restrito" : "Não foi possível carregar o financeiro"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {restricted
                ? "Este histórico está disponível para os perfis autorizados da administração, financeiro e recepção."
                : "Tente novamente. Os registros financeiros não foram alterados."}
            </p>
            {!restricted ? (
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
                <RefreshCcw className="size-4" /> Tentar novamente
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  const rows = query.data ?? [];
  const paid = rows.filter((row) => row.record_kind === "paid");
  const pending = rows.filter((row) => row.record_kind !== "paid");
  const paidTotal = paid.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const pendingTotal = pending.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return (
    <div className="space-y-4 pb-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <ReceiptText className="size-4 text-primary" /> Histórico financeiro
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Pagamentos identificados no cadastro, por data real de recebimento. Fiados pendentes não entram no total pago.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={rows.length === 0} onClick={() => exportHistory(rows, clientName)}>
          <Download className="size-4" /> Exportar relatório
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/65 p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
            <WalletCards className="size-3.5" /> Total pago
          </p>
          <strong className="mt-2 block text-2xl font-bold tracking-tight text-emerald-900">{money(paidTotal)}</strong>
          <span className="mt-1 block text-[11px] text-emerald-800/80">Recebimentos confirmados</span>
        </div>
        <div className="rounded-2xl border border-primary/10 bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ReceiptText className="size-3.5" /> Pagamentos
          </p>
          <strong className="mt-2 block text-2xl font-bold tracking-tight text-foreground">{paid.length}</strong>
          <span className="mt-1 block text-[11px] text-muted-foreground">Lançamentos recebidos</span>
        </div>
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
            <Banknote className="size-3.5" /> Fiados em aberto
          </p>
          <strong className="mt-2 block text-2xl font-bold tracking-tight text-amber-900">{money(pendingTotal)}</strong>
          <span className="mt-1 block text-[11px] text-amber-800/80">Não incluídos no total pago</span>
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-semibold text-foreground">Pagamentos recebidos</h4>
          <span className="text-xs text-muted-foreground">{paid.length} registro(s)</span>
        </div>
        {paid.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-primary/20 bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum pagamento vinculado a esta ficha até o momento.
          </div>
        ) : (
          <div className="space-y-2">
            {paid.map((row) => {
              const parts = Array.isArray(row.payment_breakdown) ? row.payment_breakdown : [];
              const paidOn = localDate(row.payment_at);
              const appointmentOn = localDate(row.procedure_at);
              return (
                <article key={row.record_id} className="rounded-2xl border border-primary/10 bg-card p-3.5 shadow-sm sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{row.description || "Atendimento"}</p>
                        {row.source === "client_budget" ? <Badge variant="outline" className="text-[10px]">Combo</Badge> : null}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="size-3.5" /> Pago em {paidOn}
                        {appointmentOn !== "—" && appointmentOn !== paidOn
                          ? <span>· Procedimento em {appointmentOn}</span>
                          : null}
                      </p>
                    </div>
                    <div className="text-right">
                      <strong className="block whitespace-nowrap text-lg font-semibold text-emerald-700">{money(row.amount)}</strong>
                      <Badge className="mt-1 border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">Pago</Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/70 pt-2.5">
                    {parts.length ? parts.map((part, index) => (
                      <span key={`${row.record_id}-${index}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary/[0.055] px-2.5 py-1 text-xs text-foreground">
                        <CreditCard className="size-3.5 text-primary" />
                        {part.method || "Pagamento"} · {money(part.amount)}
                        {Number(part.installments ?? 1) > 1 ? ` · ${part.installments}x` : ""}
                      </span>
                    )) : (
                      <span className="text-xs text-muted-foreground">{row.payment_method || "Forma de pagamento não informada"}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-semibold text-foreground">Fiados e contas em aberto</h4>
          <span className="text-xs text-muted-foreground">{pending.length} pendência(s)</span>
        </div>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-primary/10 bg-card px-4 py-3 text-xs text-muted-foreground">
            Nenhum fiado pendente vinculado a esta ficha.
          </p>
        ) : pending.map((row) => (
          <article key={`${row.record_kind}-${row.record_id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/45 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{row.description || "Conta a receber"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Procedimento: {localDate(row.procedure_at)}</p>
            </div>
            <div className="text-right">
              <strong className="block text-sm text-amber-900">{money(row.amount)}</strong>
              <Badge variant="outline" className="mt-1 border-amber-300 text-amber-800">Em aberto</Badge>
            </div>
          </article>
        ))}
      </section>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        O total considera somente pagamentos vinculados ao cadastro, ao agendamento ou ao combo.
        Atendimentos sem vínculo identificado precisam ser associados à ficha antes de aparecer aqui.
      </p>
    </div>
  );
}
