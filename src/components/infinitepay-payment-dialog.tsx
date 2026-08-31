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
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-24px)] max-w-[620px] overflow-x-hidden overflow-y-auto rounded-3xl p-5 sm:w-[calc(100vw-48px)] sm:p-7">
        <DialogHeader className="min-w-0 pr-6">
          <DialogTitle className="text-xl sm:text-2xl">Finalizar pagamento</DialogTitle>
          <DialogDescription className="mt-1 text-sm leading-6">
            Revise o valor escolhido e continue para o ambiente seguro da InfinitePay.
          </DialogDescription>
        </DialogHeader>

        {session ? (
          <div className="mt-3 min-w-0 rounded-2xl border border-border bg-secondary/35 p-4 sm:p-5">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
              <div className="min-w-0 flex-1">
                <p className="break-words text-base font-semibold leading-snug">{session.serviceName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {session.kind === "deposit" ? "Pagamento de 50% da reserva" : "Pagamento integral do serviço"}
                </p>
              </div>
              <div className="min-w-0 sm:text-right">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Pagar agora</p>
                <p className="mt-1 break-words text-2xl font-semibold leading-none text-primary sm:text-3xl">{formatPrice(session.amount)}</p>
              </div>
            </div>

            <div className="mt-4 grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="min-w-0 rounded-xl bg-card px-3.5 py-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Valor total</p>
                <p className="mt-1 break-words text-sm font-semibold">{formatPrice(session.total)}</p>
              </div>
              <div className="min-w-0 rounded-xl bg-card px-3.5 py-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Restante na clínica</p>
                <p className="mt-1 break-words text-sm font-semibold">{formatPrice(session.balance)}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex min-w-0 items-start gap-3 rounded-2xl border border-primary/10 bg-primary-soft/70 px-4 py-3.5 text-sm leading-5 text-primary">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">
            Na próxima tela você escolhe Pix, cartão ou outro método disponível na InfinitePay. A confirmação do pagamento volta automaticamente para o JR Clinic.
          </span>
        </div>

        {errorMessage ? (
          <div className="mt-3 min-w-0 break-words rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm leading-5 text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <Button
          className="mt-5 h-11 w-full rounded-full text-sm sm:h-12"
          onClick={() => void startCheckout()}
          disabled={!session || loading}
        >
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
          {loading ? "Abrindo InfinitePay..." : "Continuar para pagamento"}
        </Button>

        <p className="mt-3 px-1 text-center text-xs leading-5 text-muted-foreground">
          O agendamento permanece protegido até a InfinitePay confirmar o pagamento.
        </p>
      </DialogContent>
    </Dialog>
  );
}
