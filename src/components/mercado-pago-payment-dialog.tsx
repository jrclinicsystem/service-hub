import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, CreditCard, LoaderCircle, QrCode, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/clinic";

type PaymentKind = "deposit" | "full";
type PaymentMode = "pix" | "card";

type PaymentSession = {
  appointmentId: string;
  amount: number;
  total: number;
  balance: number;
  kind: PaymentKind;
  serviceName: string;
  email: string;
};

type PaymentResult = {
  id?: string | number | null;
  status?: string | null;
  status_detail?: string | null;
  payment_method_id?: string | null;
  transaction_amount?: number | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  } | null;
};

type MercadoPagoConfig = {
  publicKey: string;
  isTest: boolean;
};

function ensureMercadoPagoSdk() {
  return new Promise<void>((resolve, reject) => {
    if ((window as any).MercadoPago) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-mercado-pago-sdk="v2"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Não foi possível carregar o Mercado Pago.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.dataset.mercadoPagoSdk = "v2";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Não foi possível carregar o Mercado Pago."));
    document.head.appendChild(script);
  });
}

function paymentErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível processar o pagamento. Tente novamente.";
}

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
  if (code === "payer_identification_required") return "Informe o CPF do pagador para gerar o Pix.";
  if (code === "payer_email_required") return "Informe um e-mail válido para o pagamento.";
  if (code === "nothing_to_pay") return "Este agendamento não possui saldo pendente.";

  const cause = Array.isArray(payload?.details?.cause)
    ? payload.details.cause.find((item: any) => item?.description)?.description
    : null;

  return String(
    payload?.message ||
      payload?.details?.message ||
      cause ||
      error?.message ||
      "O Mercado Pago não conseguiu processar esta tentativa.",
  );
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

function formatCpf(value: string) {
  const digits = onlyDigits(value);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function MercadoPagoPaymentDialog({
  open,
  onOpenChange,
  session,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: PaymentSession | null;
  onPaid: () => void;
}) {
  const controllerRef = useRef<any>(null);
  const payerDocumentRef = useRef("");
  const [mode, setMode] = useState<PaymentMode>("pix");
  const [config, setConfig] = useState<MercadoPagoConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingCard, setLoadingCard] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [generatingPix, setGeneratingPix] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [payerDocument, setPayerDocument] = useState("");
  const [payerEmail, setPayerEmail] = useState("");

  const updatePayerDocument = (value: string) => {
    const digits = onlyDigits(value);
    payerDocumentRef.current = digits;
    setPayerDocument(digits);
  };

  const finishApproved = () => {
    toast.success("Pagamento aprovado", {
      description: "Seu agendamento foi enviado para a clínica.",
    });
    onPaid();
  };

  const applyPaymentResult = async (paymentResult: PaymentResult) => {
    const status = String(paymentResult.status ?? "pending");

    if (status === "approved") {
      await controllerRef.current?.unmount?.();
      controllerRef.current = null;
      setResult(paymentResult);
      finishApproved();
      return;
    }

    if (["pending", "in_process"].includes(status)) {
      await controllerRef.current?.unmount?.();
      controllerRef.current = null;
      setResult(paymentResult);
      return;
    }

    const rejection = paymentResult.status_detail
      ? `Pagamento não aprovado: ${paymentResult.status_detail}`
      : "Pagamento não aprovado. Revise os dados e tente novamente.";
    throw new Error(rejection);
  };

  const checkPayment = async (silent = false) => {
    if (!session) return;
    if (!silent) setChecking(true);

    const { data, error } = await (supabase as any)
      .from("payments")
      .select("status, status_detail, payment_method_id, amount")
      .eq("appointment_id", session.appointmentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!silent) setChecking(false);
    if (error) {
      if (!silent) toast.error("Não foi possível verificar o pagamento.");
      return;
    }

    if (data?.status === "approved") {
      finishApproved();
      return;
    }

    if (!silent) {
      const detail = data?.status_detail
        ? String(data.status_detail)
        : "Assim que o Mercado Pago aprovar, o agendamento será liberado automaticamente.";
      toast.info("Pagamento ainda não confirmado", { description: detail });
    }
  };

  const generatePix = async () => {
    if (!session || generatingPix) return;
    setErrorMessage("");

    const email = payerEmail.trim();
    if (!email || !email.includes("@")) {
      setErrorMessage("Informe um e-mail válido para o pagador.");
      return;
    }

    if (payerDocumentRef.current.length !== 11) {
      setErrorMessage("Informe um CPF com 11 dígitos para gerar o Pix.");
      return;
    }

    setGeneratingPix(true);
    try {
      const attemptId = crypto.randomUUID();
      const { data, error } = await supabase.functions.invoke("mercado-pago-create-payment", {
        body: {
          appointmentId: session.appointmentId,
          attemptId,
          kind: session.kind,
          payerDocument: payerDocumentRef.current,
          formData: {
            payment_method_id: "pix",
            payer: {
              email,
              identification: {
                type: "CPF",
                number: payerDocumentRef.current,
              },
            },
          },
        },
      });

      if (error) throw new Error(await invokeErrorMessage(error));
      if (data?.error) {
        const detail = data?.message || data?.details?.message || data?.details?.cause?.[0]?.description || data.error;
        throw new Error(String(detail));
      }

      await applyPaymentResult(data as PaymentResult);
    } catch (error) {
      const message = paymentErrorMessage(error);
      setErrorMessage(message);
      toast.error("Pix não gerado", { description: message });
    } finally {
      setGeneratingPix(false);
    }
  };

  useEffect(() => {
    if (!open || !session) return;
    if (!result || !["pending", "in_process"].includes(String(result.status))) return;

    const timer = window.setInterval(() => void checkPayment(true), 4000);
    return () => window.clearInterval(timer);
  }, [open, result?.status, session?.appointmentId]);

  useEffect(() => {
    if (!open || !session) return;

    let cancelled = false;
    setLoadingConfig(true);
    setErrorMessage("");
    setPayerEmail(session.email ?? "");

    const loadConfig = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("mercado-pago-config");
        if (error) throw error;
        if (!data?.publicKey) throw new Error("A chave pública do Mercado Pago não foi encontrada.");
        if (cancelled) return;

        const nextConfig = {
          publicKey: String(data.publicKey),
          isTest: Boolean(data.isTest),
        };
        setConfig(nextConfig);

        if (nextConfig.isTest && !payerDocumentRef.current) {
          updatePayerDocument("19119119100");
        }
      } catch (error) {
        if (!cancelled) setErrorMessage(paymentErrorMessage(error));
      } finally {
        if (!cancelled) setLoadingConfig(false);
      }
    };

    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, [open, session?.appointmentId]);

  useEffect(() => {
    if (!open || !session || !config || mode !== "card" || result) return;

    let cancelled = false;
    setLoadingCard(true);
    setCardReady(false);
    setErrorMessage("");

    const renderCardBrick = async () => {
      try {
        await ensureMercadoPagoSdk();
        if (cancelled) return;

        const MercadoPago = (window as any).MercadoPago;
        const mp = new MercadoPago(config.publicKey);
        const bricksBuilder = mp.bricks();

        controllerRef.current = await bricksBuilder.create("payment", "jrclinic-card-brick", {
          initialization: {
            amount: session.amount,
            payer: { email: payerEmail || session.email },
          },
          customization: {
            paymentMethods: {
              creditCard: "all",
              debitCard: "all",
              prepaidCard: "all",
            },
            visual: {
              style: { theme: "default" },
            },
          },
          callbacks: {
            onReady: () => {
              if (cancelled) return;
              setLoadingCard(false);
              setCardReady(true);
            },
            onSubmit: async ({ formData }: any) => {
              setErrorMessage("");
              try {
                const attemptId = crypto.randomUUID();
                const { data, error } = await supabase.functions.invoke("mercado-pago-create-payment", {
                  body: {
                    appointmentId: session.appointmentId,
                    attemptId,
                    kind: session.kind,
                    formData,
                  },
                });

                if (error) throw new Error(await invokeErrorMessage(error));
                if (data?.error) {
                  const detail = data?.message || data?.details?.message || data?.details?.cause?.[0]?.description || data.error;
                  throw new Error(String(detail));
                }

                await applyPaymentResult(data as PaymentResult);
                return data;
              } catch (error) {
                const message = paymentErrorMessage(error);
                setErrorMessage(message);
                toast.error("Pagamento não processado", { description: message });
                throw error instanceof Error ? error : new Error(message);
              }
            },
            onError: (error: unknown) => {
              console.error("Mercado Pago Card Brick", error);
              setLoadingCard(false);
              const message = paymentErrorMessage(error);
              setErrorMessage((current) => current || message);
            },
          },
        });
      } catch (error) {
        if (!cancelled) {
          setLoadingCard(false);
          setErrorMessage(paymentErrorMessage(error));
        }
      }
    };

    void renderCardBrick();

    return () => {
      cancelled = true;
      const controller = controllerRef.current;
      controllerRef.current = null;
      if (controller?.unmount) void controller.unmount();
    };
  }, [open, mode, config?.publicKey, session?.appointmentId, session?.amount, session?.kind, result]);

  useEffect(() => {
    if (mode !== "card") {
      const controller = controllerRef.current;
      controllerRef.current = null;
      if (controller?.unmount) void controller.unmount();
      setCardReady(false);
      setLoadingCard(false);
    }
  }, [mode]);

  useEffect(() => {
    if (!open) {
      setMode("pix");
      setConfig(null);
      setResult(null);
      setErrorMessage("");
      setCardReady(false);
      setLoadingCard(false);
      setLoadingConfig(false);
      setGeneratingPix(false);
      payerDocumentRef.current = "";
      setPayerDocument("");
      setPayerEmail("");
    }
  }, [open]);

  const transactionData = result?.point_of_interaction?.transaction_data;
  const qrCode = transactionData?.qr_code ?? "";
  const qrCodeBase64 = transactionData?.qr_code_base64 ?? "";
  const pending = result && ["pending", "in_process"].includes(String(result.status));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>Finalizar pagamento</DialogTitle>
          <DialogDescription>
            O horário só será liberado para a profissional depois que o Mercado Pago confirmar o pagamento.
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

        {pending ? (
          <div className="mt-4 text-center">
            {qrCodeBase64 ? (
              <img
                src={`data:image/png;base64,${qrCodeBase64}`}
                alt="QR Code Pix"
                className="mx-auto size-56 rounded-2xl border border-border bg-white p-3"
              />
            ) : (
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
                <LoaderCircle className="size-6 animate-spin" />
              </span>
            )}
            <h3 className="mt-4 text-lg font-semibold">Aguardando pagamento</h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
              {qrCode
                ? "Escaneie o QR Code ou copie o código Pix abaixo. A confirmação é automática."
                : "O Mercado Pago está processando a cobrança. A confirmação é automática."}
            </p>
            {qrCode ? (
              <div className="mt-4 rounded-2xl border border-border bg-secondary/40 p-3 text-left">
                <p className="break-all text-[11px] leading-relaxed text-muted-foreground">{qrCode}</p>
                <Button
                  variant="outline"
                  className="mt-3 w-full rounded-full"
                  onClick={async () => {
                    await navigator.clipboard.writeText(qrCode);
                    toast.success("Código Pix copiado.");
                  }}
                >
                  <Copy className="size-4" /> Copiar código Pix
                </Button>
              </div>
            ) : null}
            <Button className="mt-4 w-full rounded-full" onClick={() => void checkPayment()} disabled={checking}>
              {checking ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {checking ? "Verificando..." : "Já paguei, verificar"}
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-primary-soft/70 px-3 py-2.5 text-xs text-primary">
              <ShieldCheck className="size-4 shrink-0" />
              <span>O pagamento acontece aqui mesmo. Você não será redirecionado para outro site.</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("pix")}
                className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-medium transition ${
                  mode === "pix" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary/50"
                }`}
              >
                <QrCode className="size-4" /> Pix
              </button>
              <button
                type="button"
                onClick={() => setMode("card")}
                className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-medium transition ${
                  mode === "card" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary/50"
                }`}
              >
                <CreditCard className="size-4" /> Cartão
              </button>
            </div>

            {mode === "pix" ? (
              <div className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
                <div>
                  <h3 className="font-semibold">Pagar com Pix</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Ao gerar o Pix, o QR Code e o código copia e cola aparecerão nesta mesma tela.
                  </p>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="jrclinic-pix-email">E-mail do pagador</Label>
                    <Input
                      id="jrclinic-pix-email"
                      type="email"
                      value={payerEmail}
                      onChange={(event) => setPayerEmail(event.target.value)}
                      placeholder="cliente@email.com"
                      autoComplete="email"
                    />
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      O Mercado Pago exige esse dado para processar o Pix. Nenhum link de pagamento será enviado por e-mail.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="jrclinic-payer-cpf">CPF do pagador</Label>
                    <Input
                      id="jrclinic-payer-cpf"
                      inputMode="numeric"
                      value={formatCpf(payerDocument)}
                      onChange={(event) => updatePayerDocument(event.target.value)}
                      placeholder="000.000.000-00"
                      autoComplete="off"
                    />
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      Necessário para gerar o Pix. Este dado é enviado ao Mercado Pago e não é salvo no cadastro da clínica.
                    </p>
                  </div>
                </div>

                {config?.isTest ? (
                  <p className="mt-4 rounded-xl bg-secondary/45 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
                    Ambiente de teste do Mercado Pago.
                  </p>
                ) : null}

                <Button
                  className="mt-4 w-full rounded-full"
                  onClick={() => void generatePix()}
                  disabled={generatingPix || loadingConfig}
                >
                  {generatingPix || loadingConfig ? <LoaderCircle className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                  {generatingPix ? "Gerando Pix..." : "Gerar QR Code Pix"}
                </Button>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-border bg-card p-3 sm:p-4">
                <div className="px-1 pb-3">
                  <h3 className="font-semibold">Pagar com cartão</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Crédito, débito e parcelamento aparecem conforme a disponibilidade da conta Mercado Pago.
                  </p>
                </div>

                {loadingCard ? (
                  <div className="grid min-h-40 place-items-center">
                    <div className="text-center">
                      <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
                      <p className="mt-3 text-sm text-muted-foreground">Carregando pagamento seguro...</p>
                    </div>
                  </div>
                ) : null}

                <div id="jrclinic-card-brick" className={cardReady ? "" : "min-h-0"} />
              </div>
            )}

            {errorMessage ? (
              <div className="mt-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                {errorMessage}
              </div>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
