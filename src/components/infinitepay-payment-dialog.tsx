import { useEffect, useState } from "react";
import { ExternalLink, LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/clinic";

type PaymentKind = "deposit" | "full";

type PaymentSession = {
  appointmentId: string;
  amount: number;
  total: number;
  balance: number;
  kind: PaymentKind;
  serviceName: string;
  email: string;
};

async function invokeErrorMessage(error: any) {
  let payload: any = null;
  const response = error?.context;

  if (response?.clone) {
    try {
      payload = await response.clone().json();
    } catch {
      payload = null;
    }
  }

  const code = String(payload?.error ?? "");
  if (code === "infinitepay_not_configured") {
    return "A conta InfinitePay ainda não foi vinculada ao JR Clinic.";
  }
  if (code === "provider_disabled") {
    return "A InfinitePay ainda não está ativa para pagamentos online.";
  }
  if (code === "nothing_to_pay") {
    return "Este agendamento não possui saldo pendente.";
  }

  return String(
    payload?.message ||
      error?.message ||
      "Não foi possível abrir o pagamento da InfinitePay.",
  );
}

export function InfinitePayPaymentDialog({
  open,
  onOpenChange,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: PaymentSession | null;
}) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setErrorMessage("");
    }
  }, [open]);

  const startCheckout = async () => {
    if (!session || loading) return;

    setLoading(true);
    setErrorMessage("");

    try {
      const attemptId = crypto.randomUUID();
      const { data, error } = await supabase.functions.invoke("infinitepay-create-checkout", {
        body: {
          appointmentId: session.appointmentId,
          attemptId,
          kind: session.kind,
        },
      });

      if (error) throw new Error(await invokeErrorMessage(error));
      if (!data?.url) throw new Error(data?.message || "A InfinitePay não retornou o checkout.");

      toast.info("Abrindo pagamento seguro", {
        description: "Você poderá escolher Pix ou cartão na InfinitePay.",
      });

      window.location.assign(String(data.url));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível iniciar o pagamento.";
      setErrorMessage(message);
      toast.error("Pagamento indisponível", { description: message });
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] rounded-3xl p-4 sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle>Finalizar pagamento</DialogTitle>
          <DialogDescription>
            Seu horário só será liberado para a profissional depois que a InfinitePay confirmar o pagamento.
          </DialogDescription>
        </DialogHeader>

        {session ? (
          <div className="mt-2 rounded-2xl border border-border bg-secondary/35 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{session.serviceName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {session.kind === "deposit" ? "Sinal da reserva" : "Pagamento integral"}
                </p>
              </div>
              <p className="shrink-0 text-xl font-semibold text-primary">{formatPrice(session.amount)}</p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-card px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Valor total</p>
                <p className="mt-0.5 font-medium">{formatPrice(session.total)}</p>
              </div>
              <div className="rounded-xl bg-card px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Restante na clínica</p>
                <p className="mt-0.5 font-medium">{formatPrice(session.balance)}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-primary-soft/70 px-3 py-3 text-xs text-primary">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            Pagamento processado pela InfinitePay. No checkout, o cliente escolhe Pix ou cartão e retorna ao JR Clinic depois de pagar.
          </span>
        </div>

        {errorMessage ? (
          <div className="mt-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <Button
          className="mt-5 h-12 w-full rounded-full"
          onClick={() => void startCheckout()}
          disabled={!session || loading}
        >
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
          {loading ? "Abrindo InfinitePay..." : "Pagar com InfinitePay"}
        </Button>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
          A confirmação é automática. O agendamento permanece bloqueado até o pagamento ser validado.
        </p>
      </DialogContent>
    </Dialog>
  );
}
