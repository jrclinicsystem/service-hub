import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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

  const canConfirm = Boolean(day && time && name.trim() && email.trim());

  const confirm = async () => {
    if (!user) {
      toast.info("Entre na sua conta para confirmar o agendamento.");
      await authNavigate({ to: "/auth" });
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
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-[1440px] px-5 py-12 sm:px-8">
        <span className="eyebrow text-muted-foreground">Agendamento</span>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Reserve seu horário</h1>
        <p className="mt-3 max-w-[52ch] text-muted-foreground">
          Três passos: escolha o serviço, selecione data e horário e confirme seus dados. Nenhum
          pagamento é feito nesta etapa.
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-8">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h2 className="text-lg font-semibold">1. Serviço</h2>
              <div className="mt-4">
                <Label htmlFor="servico">Escolha o atendimento</Label>
                <Select
                  value={selectedSlug}
                  onValueChange={(value) => navigate({ search: { servico: value }, replace: true })}
                >
                  <SelectTrigger id="servico" className="mt-2 w-full">
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
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h2 className="text-lg font-semibold">2. Data e horário</h2>

              <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {days.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => setDay(item.key)}
                    className={`rounded-xl border px-2 py-3 text-center transition-colors disabled:opacity-40 ${
                      day === item.key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-secondary"
                    }`}
                  >
                    <span className="block text-[11px] opacity-70">{item.weekday}</span>
                    <span className="mt-0.5 block text-sm font-medium">{item.label}</span>
                  </button>
                ))}
              </div>

              <p className="mt-6 text-sm font-medium">Horários disponíveis</p>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {timeSlots.map((slot) => {
                  const disabled = !slot.is_available;
                  return (
                    <button
                      key={slot.slot}
                      type="button"
                      disabled={disabled}
                      onClick={() => setTime(slot.slot)}
                      className={`rounded-xl border px-3 py-2.5 text-sm transition-colors disabled:opacity-40 ${
                        time === slot
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

            <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h2 className="text-lg font-semibold">3. Seus dados</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="nome">Nome completo</Label>
                  <Input
                    id="nome"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Como no documento"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="voce@email.com"
                    className="mt-2"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="telefone">Telefone/WhatsApp (opcional)</Label>
                  <Input
                    id="telefone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="(85) 99999-9999"
                    className="mt-2"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="obs">Observações (opcional)</Label>
                  <Textarea
                    id="obs"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Sintomas, preferências ou informações úteis para a equipe"
                    className="mt-2"
                    rows={3}
                  />
                </div>
              </div>
            </section>
          </div>

          <aside>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:sticky lg:top-24">
              <h2 className="text-lg font-semibold">Resumo</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Serviço</dt>
                  <dd className="text-right font-medium">{service.name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Profissional</dt>
                  <dd className="text-right font-medium">{service.professional}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Data</dt>
                  <dd className="text-right font-medium">
                    {new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR")} · {time ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Duração</dt>
                  <dd className="text-right font-medium">{service.duration_min} min</dd>
                </div>
              </dl>

              <Separator className="my-5" />

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-sans text-2xl font-semibold tracking-tight text-primary lining-nums tabular-nums">
                  {formatPrice(Number(service.price))}
                </span>
              </div>

              <Button
                size="lg"
                className="mt-6 w-full rounded-full"
                disabled={!canConfirm || busy}
                onClick={confirm}
              >
                {busy ? "Enviando..." : "Confirmar agendamento"}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Nenhuma cobrança é feita nesta etapa.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
