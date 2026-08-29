import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

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
import { createAppointment, getBookingCatalog } from "@/lib/clinic.functions";
import { formatPrice } from "@/lib/clinic";

const title = "Agendar atendimento — JR Clinic";
const description =
  "Escolha o serviço, a data e o horário do seu atendimento na JR Clinic e confirme em poucos passos.";

const searchSchema = z.object({
  servico: z.string().optional(),
});

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
    label: `${date.getDate()}`.padStart(2, "0"),
    weekday: weekDays[date.getDay()],
    disabled: date.getDay() === 0,
  };
});

function Agendar() {
  const { servico } = Route.useSearch();
  const { services, timeSlots } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const authNavigate = useNavigate();
  const { user } = useAuth();
  const submitAppointment = useServerFn(createAppointment);

  const selectedSlug = servico ?? services[0]!.slug;
  const service = services.find((s) => s.slug === selectedSlug) ?? services[0]!;

  const [day, setDay] = useState(days.find((item) => !item.disabled)?.key ?? days[0]!.key);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;

    setEmail((current) => current || user.email || "");
    const metadataName =
      typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
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

  const canConfirm = Boolean(day && time && name.trim() && email.trim());

  const confirm = async () => {
    if (!user) {
      toast.info("Entre na sua conta para confirmar o agendamento.");
      await authNavigate({ to: "/auth", search: { next: "/agendar" } });
      return;
    }
    if (!time) return;
    setBusy(true);
    try {
      await submitAppointment({
        data: {
          serviceId: service.id,
          patientName: name,
          patientEmail: email,
          patientPhone: phone,
          notes,
          scheduledDate: day,
          scheduledTime: time,
        },
      });
      toast.success("Agendamento enviado", {
        description: "A equipe da JR Clinic poderá confirmar o horário pelo painel.",
      });
      await authNavigate({ to: "/minha-conta" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível agendar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden">
      <SiteHeader />

      <main className="mx-auto w-full min-w-0 max-w-[1440px] px-4 pb-28 pt-6 sm:px-8 sm:pb-12 sm:pt-10">
        <span className="eyebrow text-muted-foreground max-sm:text-[10px]">Agendamento</span>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight sm:mt-2 sm:text-4xl">Reserve seu horário</h1>
        <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground sm:mt-3 sm:text-base">
          Escolha o serviço, selecione data e horário e confirme seus dados.
          <span className="hidden sm:inline"> Nenhum pagamento é feito nesta etapa.</span>
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2 sm:hidden">
          <StepChip number="1" label="Serviço" />
          <StepChip number="2" label="Horário" />
          <StepChip number="3" label="Dados" />
        </div>

        <div className="mt-5 grid min-w-0 gap-4 sm:mt-10 sm:gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="min-w-0 space-y-4 sm:space-y-8">
            <section className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground sm:hidden">1</span>
                <h2 className="text-base font-semibold sm:text-lg">Serviço</h2>
              </div>
              <div className="mt-3 min-w-0 sm:mt-4">
                <Label htmlFor="servico" className="text-xs sm:text-sm">Escolha o atendimento</Label>
                <Select
                  value={selectedSlug}
                  onValueChange={(value) => navigate({ search: { servico: value }, replace: true })}
                >
                  <SelectTrigger id="servico" className="mt-2 h-11 w-full max-w-full rounded-xl">
                    <SelectValue placeholder="Selecione um serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((item) => (
                      <SelectItem key={item.slug} value={item.slug}>
                        {item.name} · {item.professional}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-3 flex min-w-0 items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2.5 sm:hidden">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{service.professional}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{service.duration_min} min</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-primary">{formatPrice(Number(service.price))}</p>
              </div>
            </section>

            <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground sm:hidden">2</span>
                <h2 className="text-base font-semibold sm:text-lg">Data e horário</h2>
              </div>

              <p className="mt-3 text-xs font-medium text-muted-foreground sm:hidden">Escolha o dia</p>
              <div className="mt-2 flex w-full max-w-full gap-2 overflow-x-auto pb-1 sm:mt-4 sm:grid sm:grid-cols-7 sm:overflow-visible sm:pb-0">
                {days.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => setDay(item.key)}
                    className={`w-[54px] shrink-0 rounded-xl border px-2 py-2.5 text-center transition-colors disabled:opacity-35 sm:w-auto sm:py-3 ${
                      day === item.key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-secondary"
                    }`}
                  >
                    <span className="block text-[9px] opacity-70 sm:text-[11px]">{item.weekday}</span>
                    <span className="mt-0.5 block text-sm font-semibold">{item.label}</span>
                  </button>
                ))}
              </div>

              <p className="mt-4 text-xs font-medium text-muted-foreground sm:mt-6 sm:text-sm sm:text-foreground">Horários disponíveis</p>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:mt-3 sm:grid-cols-4">
                {timeSlots.map((slot) => {
                  const disabled = !slot.is_available;
                  return (
                    <button
                      key={slot.slot}
                      type="button"
                      disabled={disabled}
                      onClick={() => setTime(slot.slot)}
                      className={`min-w-0 rounded-xl border px-1 py-2.5 text-xs font-medium transition-colors disabled:opacity-35 sm:px-3 sm:text-sm ${
                        time === slot.slot
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-secondary"
                      }`}
                    >
                      {slot.slot}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground sm:hidden">3</span>
                <h2 className="text-base font-semibold sm:text-lg">Seus dados</h2>
              </div>
              <div className="mt-3 grid min-w-0 gap-3 sm:mt-4 sm:grid-cols-2 sm:gap-4">
                <div className="min-w-0">
                  <Label htmlFor="nome" className="text-xs sm:text-sm">Nome completo</Label>
                  <Input
                    id="nome"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Como no documento"
                    className="mt-1.5 h-11 max-w-full rounded-xl sm:mt-2"
                  />
                </div>
                <div className="min-w-0">
                  <Label htmlFor="email" className="text-xs sm:text-sm">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="voce@email.com"
                    className="mt-1.5 h-11 max-w-full rounded-xl sm:mt-2"
                  />
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <Label htmlFor="telefone" className="text-xs sm:text-sm">Telefone/WhatsApp <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                  <Input
                    id="telefone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="(85) 99999-9999"
                    className="mt-1.5 h-11 max-w-full rounded-xl sm:mt-2"
                  />
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <Label htmlFor="obs" className="text-xs sm:text-sm">Observações <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                  <Textarea
                    id="obs"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Informações úteis para a equipe"
                    className="mt-1.5 min-h-[82px] max-w-full rounded-xl sm:mt-2"
                    rows={3}
                  />
                </div>
              </div>
            </section>
          </div>

          <aside className="hidden lg:block">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:sticky lg:top-24">
              <h2 className="text-lg font-semibold">Resumo</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Serviço</dt><dd className="text-right font-medium">{service.name}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Profissional</dt><dd className="text-right font-medium">{service.professional}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Data</dt><dd className="text-right font-medium">{new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR")} · {time ?? "—"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Duração</dt><dd className="text-right font-medium">{service.duration_min} min</dd></div>
              </dl>

              <Separator className="my-5" />

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-sans text-2xl font-semibold tracking-tight text-primary lining-nums tabular-nums">{formatPrice(Number(service.price))}</span>
              </div>

              <Button size="lg" className="mt-6 w-full rounded-full" disabled={!canConfirm || busy} onClick={confirm}>
                {busy ? "Enviando..." : "Confirmar agendamento"}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">Nenhuma cobrança é feita nesta etapa.</p>
            </div>
          </aside>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-50 overflow-hidden border-t border-border bg-card/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex w-full max-w-lg items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] text-muted-foreground">{service.name}</p>
            <p className="text-base font-semibold leading-tight text-primary">{formatPrice(Number(service.price))}</p>
          </div>
          <Button className="h-11 min-w-[148px] shrink-0 rounded-full px-4" disabled={!canConfirm || busy} onClick={confirm}>
            {busy ? "Enviando..." : "Confirmar"}
          </Button>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}

function StepChip({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl bg-secondary/70 px-1.5 py-2">
      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">{number}</span>
      <span className="truncate text-[10px] font-medium">{label}</span>
    </div>
  );
}
