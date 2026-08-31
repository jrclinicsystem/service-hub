import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, HandCoins, Landmark, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { InfinitePayPaymentDialog } from "@/components/infinitepay-payment-dialog";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { createBookingAppointment } from "@/lib/booking.functions";
import { getBookingCatalog } from "@/lib/clinic.functions";
import { formatPrice } from "@/lib/clinic";

const title = "Agendar atendimento — JR Clinic";
const description = "Escolha o serviço, profissional, horário e a forma de pagamento do agendamento.";

const searchSchema = z.object({ servico: z.string().optional() });

export const Route = createFileRoute("/agendar")({
  validateSearch: searchSchema,
  loader: () => getBookingCatalog(),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Agendar,
});

const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const days = Array.from({ length: 14 }).map((_, index) => {
  const date = new Date();
  date.setDate(date.getDate() + index);
  return {
    key: date.toISOString().slice(0, 10),
    label: String(date.getDate()).padStart(2, "0"),
    weekday: weekDays[date.getDay()],
    disabled: date.getDay() === 0,
  };
});

type PaymentChoice = "deposit" | "full" | "onsite";
type PaymentKind = "deposit" | "full";

type BookingPaymentSession = {
  appointmentId: string;
  amount: number;
  total: number;
  balance: number;
  kind: PaymentKind;
  serviceName: string;
  email: string;
};

function Agendar() {
  const { servico } = Route.useSearch();
  const { services, timeSlots, serviceProfessionals, depositPercent } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const authNavigate = useNavigate();
  const { user } = useAuth();
  const submitAppointment = useServerFn(createBookingAppointment);

  const selectedSlug = servico ?? "";
  const service = services.find((item) => item.slug === selectedSlug);

  const professionals = useMemo(() => {
    if (!service) return [];
    return serviceProfessionals
      .filter((item: any) => item.service_id === service.id && item.professional)
      .map((item: any) => item.professional)
      .sort((a: any, b: any) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  }, [service, serviceProfessionals]);

  const [professionalId, setProfessionalId] = useState("");
  const [day, setDay] = useState(days.find((item) => !item.disabled)?.key ?? days[0]!.key);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("deposit");
  const [paymentSession, setPaymentSession] = useState<BookingPaymentSession | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedProfessional = professionals.find((item: any) => item.id === professionalId) ?? professionals[0];
  const hasService = Boolean(service);
  const total = Number(service?.price ?? 0);
  const safeDepositPercent = Number.isFinite(Number(depositPercent)) ? Number(depositPercent) : 50;
  const depositValue = hasService
    ? Math.min(total, Math.max(0.01, Math.round(total * safeDepositPercent) / 100))
    : 0;
  const depositLabel = Number.isInteger(safeDepositPercent)
    ? `${safeDepositPercent}%`
    : `${safeDepositPercent.toFixed(1).replace(".", ",")}%`;
  const paymentNow = !hasService
    ? 0
    : paymentChoice === "deposit"
      ? depositValue
      : paymentChoice === "full"
        ? total
        : 0;
  const remaining = !hasService
    ? 0
    : paymentChoice === "deposit"
      ? Math.max(0, total - depositValue)
      : paymentChoice === "full"
        ? 0
        : total;

  useEffect(() => {
    setProfessionalId(professionals[0]?.id ?? "");
    setTime(null);
    setPaymentChoice("deposit");
    setPaymentSession(null);
    setPaymentOpen(false);
  }, [service?.id, professionals]);

  useEffect(() => {
    if (!user) return;
    setEmail((current) => current || user.email || "");
    const metadataName = typeof user.user_metadata?.["full_name"] === "string" ? user.user_metadata["full_name"] : "";
    setName((current) => current || metadataName);

    void supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        if (data.full_name) setName((current) => current || data.full_name || "");
        if (data.phone) setPhone((current) => current || data.phone || "");
      });
  }, [user]);

  const resetPreparedPayment = () => {
    setPaymentSession(null);
    setPaymentOpen(false);
  };

  const canConfirm = Boolean(service && professionalId && day && time && name.trim() && email.trim());
  const buttonLabel = busy
    ? "Preparando..."
    : paymentSession
      ? "Retomar pagamento"
      : paymentChoice === "onsite"
        ? "Confirmar agendamento"
        : "Ir para pagamento";

  const confirm = async () => {
    if (paymentSession) {
      setPaymentOpen(true);
      return;
    }

    if (!user) {
      toast.info("Entre na sua conta para concluir o agendamento.");
      await authNavigate({ to: "/auth", search: { next: "/agendar" } });
      return;
    }
    if (!service || !time || !professionalId) return;

    setBusy(true);
    try {
      const created = await submitAppointment({
        data: {
          serviceId: service.id,
          professionalId,
          patientName: name,
          patientEmail: email,
          patientPhone: phone,
          notes,
          scheduledDate: day,
          scheduledTime: time,
          paymentChoice,
        },
      });

      if (!created.requiresOnlinePayment) {
        toast.success("Agendamento enviado para a clínica.", {
          description: "Pagamento escolhido: presencial, no dia do atendimento.",
        });
        await authNavigate({ to: "/minha-conta" });
        return;
      }

      setPaymentSession({
        appointmentId: created.id,
        amount: Number(created.paymentAmount),
        total: Number(created.total),
        balance: Number(created.balanceAmount),
        kind: created.paymentKind,
        serviceName: service.name,
        email,
      });
      setPaymentOpen(true);

      toast.info(created.paymentKind === "full" ? "Última etapa: pagamento integral" : "Última etapa: pagar o sinal", {
        description: created.paymentKind === "full"
          ? "Pague o valor total pela InfinitePay para concluir a reserva."
          : `Pague ${depositLabel} pela InfinitePay para liberar a reserva.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível preparar o agendamento.");
    } finally {
      setBusy(false);
    }
  };

  if (services.length === 0) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold">Nenhum serviço disponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">A clínica ainda não publicou serviços para agendamento.</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-[100dvw] overflow-x-clip">
      <SiteHeader />

      <main className="mx-auto box-border w-full max-w-[1440px] px-4 pb-44 pt-6 sm:px-8 sm:pb-32 sm:pt-10 lg:pb-12">
        <span className="eyebrow text-muted-foreground">Agendamento</span>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight sm:mt-2 sm:text-4xl">Reserve seu horário</h1>
        <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-muted-foreground sm:mt-3 sm:text-base">
          Escolha o atendimento e depois decida entre pagar {depositLabel} online, quitar tudo online ou pagar presencialmente.
        </p>

        <div className="mt-5 grid grid-cols-5 gap-1 sm:hidden">
          <StepChip number="1" label="Serviço" />
          <StepChip number="2" label="Prof." />
          <StepChip number="3" label="Horário" />
          <StepChip number="4" label="Dados" />
          <StepChip number="5" label="Pagamento" />
        </div>

        <div className="mt-5 grid gap-4 sm:mt-10 sm:gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4 sm:space-y-8">
            <section className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
              <h2 className="text-base font-semibold sm:text-lg">Serviço e profissional</h2>

              <div className="mt-4">
                <Label htmlFor="servico">Escolha o atendimento</Label>
                <Select
                  value={selectedSlug ?? ""}
                  onValueChange={(value) => {
                    resetPreparedPayment();
                    navigate({ search: { servico: value }, replace: true });
                  }}
                >
                  <SelectTrigger id="servico" className="mt-2 h-11 rounded-xl">
                    <SelectValue placeholder="Selecione um serviço" />
                  </SelectTrigger>
                  <SelectContent>{services.map((item) => <SelectItem key={item.slug} value={item.slug}>{item.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="mt-4">
                <Label htmlFor="profissional">Quem você prefere?</Label>
                <Select
                  value={professionalId ?? ""}
                  disabled={!service}
                  onValueChange={(value) => { setProfessionalId(value); setTime(null); resetPreparedPayment(); }}
                >
                  <SelectTrigger id="profissional" className="mt-2 h-11 rounded-xl">
                    <SelectValue placeholder={service ? "Escolha o profissional" : "Selecione um serviço primeiro"} />
                  </SelectTrigger>
                  <SelectContent>{professionals.map((item: any) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.specialty}</SelectItem>)}</SelectContent>
                </Select>
                {service && professionals.length === 0 ? <p className="mt-2 text-xs text-destructive">Nenhum profissional está vinculado a este serviço.</p> : null}
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2.5 sm:hidden">
                <div>
                  <p className="text-xs font-medium">{service ? (selectedProfessional?.name ?? "Escolha o profissional") : "Nenhum serviço selecionado"}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{service ? `${service.duration_min} min` : "Selecione um atendimento para continuar"}</p>
                </div>
                <p className="text-sm font-semibold text-primary">{service ? formatPrice(total) : "—"}</p>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
              <h2 className="text-base font-semibold sm:text-lg">Data e horário</h2>
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-7 sm:overflow-visible">
                {days.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    disabled={item.disabled || !service}
                    onClick={() => { setDay(item.key); resetPreparedPayment(); }}
                    className={`w-[54px] shrink-0 rounded-xl border px-2 py-2.5 text-center transition disabled:opacity-35 sm:w-auto ${day === item.key && service ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-secondary"}`}
                  >
                    <span className="block text-[9px] opacity-70">{item.weekday}</span>
                    <span className="mt-0.5 block text-sm font-semibold">{item.label}</span>
                  </button>
                ))}
              </div>

              <p className="mt-5 text-xs font-medium text-muted-foreground">Horários disponíveis</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {timeSlots.map((slot) => (
                  <button
                    key={slot.slot}
                    type="button"
                    disabled={!slot.is_available || !professionalId || !service}
                    onClick={() => { setTime(slot.slot); resetPreparedPayment(); }}
                    className={`rounded-xl border px-2 py-2.5 text-xs font-medium transition disabled:opacity-35 sm:text-sm ${time === slot.slot ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-secondary"}`}
                  >
                    {slot.slot}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
              <h2 className="text-base font-semibold sm:text-lg">Seus dados</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4">
                <div><Label htmlFor="nome">Nome completo</Label><Input id="nome" value={name} onChange={(e) => { setName(e.target.value); resetPreparedPayment(); }} className="mt-2 h-11 rounded-xl" /></div>
                <div><Label htmlFor="email">E-mail</Label><Input id="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); resetPreparedPayment(); }} className="mt-2 h-11 rounded-xl" /></div>
                <div className="sm:col-span-2"><Label htmlFor="telefone">Telefone/WhatsApp <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input id="telefone" value={phone} onChange={(e) => { setPhone(e.target.value); resetPreparedPayment(); }} className="mt-2 h-11 rounded-xl" /></div>
                <div className="sm:col-span-2"><Label htmlFor="obs">Observações <span className="font-normal text-muted-foreground">(opcional)</span></Label><Textarea id="obs" value={notes} onChange={(e) => { setNotes(e.target.value); resetPreparedPayment(); }} className="mt-2 min-h-[82px] resize-none rounded-xl" /></div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
              <div>
                <h2 className="text-base font-semibold sm:text-lg">Métodos de pagamento</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {service
                    ? "Escolha como deseja pagar este agendamento. Os detalhes completos aparecem na próxima etapa."
                    : "Selecione um serviço acima para ver os valores reais de cada opção de pagamento."}
                </p>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <PaymentOption
                  icon={Landmark}
                  selected={paymentChoice === "deposit"}
                  disabled={!service || Boolean(paymentSession)}
                  title={`Pagar ${depositLabel} online`}
                  value={service ? formatPrice(depositValue) : "—"}
                  badge="Online"
                  onClick={() => { setPaymentChoice("deposit"); resetPreparedPayment(); }}
                />
                <PaymentOption
                  icon={CreditCard}
                  selected={paymentChoice === "full"}
                  disabled={!service || Boolean(paymentSession)}
                  title="Pagar valor total"
                  value={service ? formatPrice(total) : "—"}
                  badge="Online"
                  onClick={() => { setPaymentChoice("full"); resetPreparedPayment(); }}
                />
                <PaymentOption
                  icon={HandCoins}
                  selected={paymentChoice === "onsite"}
                  disabled={!service || Boolean(paymentSession)}
                  title="Pagar presencialmente"
                  value={service ? "Na clínica" : "—"}
                  badge="Presencial"
                  onClick={() => { setPaymentChoice("onsite"); resetPreparedPayment(); }}
                />
              </div>
            </section>
          </div>

          <aside className="hidden min-w-0 lg:block">
            <div className="sticky top-[120px] rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h2 className="text-lg font-semibold">Resumo</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Serviço</dt><dd className="text-right font-medium">{service?.name ?? "Não selecionado"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Profissional</dt><dd className="text-right font-medium">{selectedProfessional?.name ?? "—"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Data</dt><dd className="text-right font-medium">{service ? `${new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR")} · ${time ?? "—"}` : "—"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Duração</dt><dd className="text-right font-medium">{service ? `${service.duration_min} min` : "—"}</dd></div>
              </dl>

              <Separator className="my-5" />
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Valor do serviço</span><span className="text-xl font-semibold">{service ? formatPrice(total) : "—"}</span></div>
              <div className="mt-3 rounded-xl bg-primary-soft/60 px-3 py-3">
                <div className="flex items-center justify-between"><span className="text-sm font-medium text-primary">Pagar agora</span><span className="text-2xl font-semibold text-primary">{service ? formatPrice(paymentNow) : "—"}</span></div>
                <div className="mt-1 flex items-center justify-between text-xs"><span className="text-muted-foreground">Restante</span><span className="font-medium">{service ? formatPrice(remaining) : "—"}</span></div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {!service ? "Selecione o serviço para calcular os valores." : paymentChoice === "deposit" ? `${depositLabel} online pela InfinitePay.` : paymentChoice === "full" ? "Pagamento integral online pela InfinitePay." : "Pagamento integral presencial na clínica."}
              </p>
              <Button size="lg" className="mt-6 w-full rounded-full" disabled={!canConfirm || busy} onClick={confirm}>{buttonLabel}</Button>
            </div>
          </aside>
        </div>
      </main>

      <div className="fixed bottom-[calc(63px+env(safe-area-inset-bottom))] left-0 right-0 z-[60] border-t border-border bg-card/95 px-3 py-2.5 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl md:bottom-0 lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] text-muted-foreground">{!service ? "Selecione um serviço" : paymentChoice === "deposit" ? `${depositLabel} online` : paymentChoice === "full" ? "Pagamento total online" : "Pagamento presencial"}</p>
            <p className="text-base font-semibold leading-tight text-primary">{service ? (paymentChoice === "onsite" ? "Na clínica" : formatPrice(paymentNow)) : "—"}</p>
          </div>
          <Button className="h-10 min-w-[146px] shrink-0 rounded-full px-4 text-sm" disabled={!canConfirm || busy} onClick={confirm}>{buttonLabel}</Button>
        </div>
      </div>

      <InfinitePayPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} session={paymentSession} />
      <SiteFooter />
    </div>
  );
}

function PaymentOption({ icon: Icon, selected, disabled, title, value, badge, onClick }: {
  icon: typeof WalletCards;
  selected: boolean;
  disabled: boolean;
  title: string;
  value: string;
  badge: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group rounded-xl border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-primary bg-primary-soft/65 shadow-sm" : "border-border bg-background hover:border-primary/25 hover:bg-secondary/35"}`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${selected ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold leading-tight sm:text-sm">{title}</p>
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{badge}</span>
          </div>
          <p className="mt-2 text-[17px] font-semibold leading-none text-primary sm:text-lg">{value}</p>
        </div>
      </div>
    </button>
  );
}

function StepChip({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-1 rounded-xl bg-secondary/70 px-1 py-2">
      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">{number}</span>
      <span className="truncate text-[9px] font-medium">{label}</span>
    </div>
  );
}
