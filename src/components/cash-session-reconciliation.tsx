import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Banknote, ReceiptText } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

type CashMovement = {
  movement_id: string;
  movement_type: string;
  amount: number | string;
  occurred_at: string;
  payment_method_code: string | null;
  payment_method_name: string | null;
  description: string | null;
  patient_name: string | null;
  service_name: string | null;
  financial_source: string | null;
};

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function timeOf(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Fortaleza",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

export function CashSessionReconciliation({
  sessionId,
  openingCash,
  expectedCash,
}: {
  sessionId: string;
  openingCash: number;
  expectedCash: number;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["cash-session-reconciliation", sessionId],
    queryFn: async (): Promise<CashMovement[]> => {
      const result = await (supabase as any).rpc("get_cash_session_reconciliation", {
        _session_id: sessionId,
      });
      if (result.error) throw result.error;
      return (result.data ?? []) as CashMovement[];
    },
    enabled: Boolean(sessionId),
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const cashMovements = (data ?? []).filter(
    (movement) =>
      movement.payment_method_code === "cash" &&
      (movement.movement_type === "income" || movement.movement_type === "expense"),
  );
  const received = cashMovements
    .filter((movement) => movement.movement_type === "income")
    .reduce((sum, movement) => sum + Number(movement.amount ?? 0), 0);
  const spent = cashMovements
    .filter((movement) => movement.movement_type === "expense")
    .reduce((sum, movement) => sum + Number(movement.amount ?? 0), 0);

  return (
    <section className="rounded-2xl border border-primary/15 bg-primary/[0.025] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <ReceiptText className="size-4 text-primary" />
            Conferência do dinheiro esperado
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Fundo inicial + recebimentos em espécie − despesas em espécie. Pix e cartões não aumentam o dinheiro físico.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-background px-3 py-1 text-xs font-semibold text-primary ring-1 ring-primary/15">
          <Banknote className="size-3.5" /> {money(expectedCash)}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">Fundo inicial</p>
          <p className="mt-1 font-semibold">{money(openingCash)}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">+ Entradas em dinheiro</p>
          <p className="mt-1 font-semibold text-emerald-700">{isLoading ? "…" : money(received)}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">− Saídas em dinheiro</p>
          <p className="mt-1 font-semibold text-rose-700">{isLoading ? "…" : money(spent)}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-border/70 pt-3">
        <p className="mb-2 text-xs font-semibold text-foreground">Lançamentos que alteraram o dinheiro físico</p>
        {isLoading ? <p className="text-xs text-muted-foreground">Carregando movimentações…</p> : null}
        {error ? (
          <p role="alert" className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="size-4" /> Não foi possível carregar os lançamentos. Atualize o caixa.
          </p>
        ) : null}
        {!isLoading && !error && cashMovements.length === 0 ? (
          <p className="rounded-xl bg-background p-3 text-xs text-muted-foreground">
            Nenhum lançamento em dinheiro neste caixa. O valor esperado corresponde ao fundo inicial.
          </p>
        ) : null}
        {!error && cashMovements.length > 0 ? (
          <div className="max-h-72 divide-y divide-border/70 overflow-y-auto rounded-xl border border-border bg-background">
            {cashMovements.map((movement) => {
              const income = movement.movement_type === "income";
              const title = movement.patient_name?.trim() ||
                (income ? "Recebimento em dinheiro" : "Despesa em dinheiro");
              const context = [movement.service_name, movement.description]
                .map((value) => value?.trim() ?? "")
                .filter(Boolean)
                .filter((value, index, values) => values.indexOf(value) === index)
                .join(" · ");
              return (
                <div key={movement.movement_id} className="flex items-start justify-between gap-3 p-3 text-sm">
                  <div className="flex min-w-0 items-start gap-2">
                    {income
                      ? <ArrowDownLeft className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                      : <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-rose-700" />}
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{title}</p>
                      {context ? <p className="mt-0.5 break-words text-xs text-muted-foreground">{context}</p> : null}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {timeOf(movement.occurred_at)} · {movement.payment_method_name || "Dinheiro"}
                      </p>
                    </div>
                  </div>
                  <strong className={`shrink-0 text-sm ${income ? "text-emerald-700" : "text-rose-700"}`}>
                    {income ? "+" : "−"}{money(Number(movement.amount ?? 0))}
                  </strong>
                </div>
              );
            })}
          </div>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          Se um lançamento aparece como dinheiro, mas foi pago por Pix ou cartão, confira a forma de
          pagamento desse atendimento antes de corrigir a abertura ou fechar o caixa.
        </p>
      </div>
    </section>
  );
}
