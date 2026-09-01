import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogOut,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import logo from "@/assets/jr-clinic-logo.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/clinic";

const db = supabase as any;
const weekdays = [
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
] as const;
const periods = [
  { value: "morning", label: "Manhã", detail: "Até 11:59" },
  { value: "afternoon", label: "Tarde", detail: "12:00 às 17:59" },
  { value: "evening", label: "Noite", detail: "A partir de 18:00" },
] as const;

export const Route = createFileRoute("/profissional")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: "/profissional" } });
  },
  head: () => ({ meta: [{ title: "Minha agenda — JR Clinic" }, { name: "description", content: "Agenda individual dos profissionais da JR Clinic." }] }),
  component: ProfessionalAgenda,
});

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function responseFor(appointment: any) {
  const response = appointment?.professional_response;
  return Array.isArray(response) ? response[0] ?? null : response ?? null;
}

async function loadProfessionalAgenda() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");
  const email = (userData.user.email ?? "").trim().toLowerCase();
  if (!email) return { authorized: false as const, email: "" };

  const access = await db.from("professional_access").select("professional_id, email, enabled, professional:professionals(id, name, specialty, is_active, deleted_at)").eq("email", email).eq("enabled", true).maybeSingle();
  if (access.error) throw access.error;
  if (!access.data?.professional_id || !access.data.professional?.is_active || access.data.professional?.deleted_at) return { authorized: false as const, email };

  const [appointments, slots, availability] = await Promise.all([
    db.from("appointments").select("id, professional_id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, service:services(name, duration_min), professional_response:appointment_professional_responses(response, responded_at)").eq("professional_id", access.data.professional_id).order("scheduled_date").order("scheduled_time"),
    db.from("professional_time_slots").select("id, professional_id, slot, is_available, sort_order").eq("professional_id", access.data.professional_id).order("sort_order").order("slot"),
    db.from("professional_availability_periods").select("id, professional_id, weekday, period, is_available").eq("professional_id", access.data.professional_id).order("weekday").order("period"),
  ]);
  if (appointments.error) throw appointments.error;
  if (slots.error) throw slots.error;
  if (availability.error) throw availability.error;

  return { authorized: true as const, email, professional: access.data.professional, appointments: appointments.data ?? [], slots: slots.data ?? [], availability: availability.data ?? [] };
}

function ProfessionalAgenda() {
  const navigate = useNavigate();
  const [dateFilter, setDateFilter] = useState("");
  const [scope, setScope] = useState<"upcoming" | "all">("upcoming");
  const [newTime, setNewTime] = useState("");
  const [savingTime, setSavingTime] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ["professional-agenda"], queryFn: loadProfessionalAgenda, retry: 1 });
  const appointments = data?.authorized ? data.appointments : [];
  const today = todayIso();
  const filteredAppointments = useMemo(() => appointments.filter((item: any) => (dateFilter ? item.scheduled_date === dateFilter : true) && (scope === "all" ? true : item.scheduled_date >= today)), [appointments, dateFilter, scope, today]);

  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth", search: { next: "/profissional" } }); };

  if (isLoading) return <CenteredMessage title="Carregando sua agenda..." />;
  if (error) return <CenteredMessage title="Não foi possível carregar sua agenda." detail={error instanceof Error ? error.message : "Erro inesperado."} action={<Button onClick={() => refetch()}>Tentar novamente</Button>} />;
  if (!data?.authorized) return <div className="min-h-screen bg-background"><SimpleHeader onSignOut={signOut} /><main className="mx-auto max-w-lg px-5 py-16 text-center"><ShieldCheck className="mx-auto size-8 text-primary" /><h1 className="mt-5 text-2xl font-semibold">Agenda ainda não liberada</h1><p className="mt-3 text-sm text-muted-foreground">O e-mail <strong>{data?.email || "atual"}</strong> ainda não foi vinculado a uma agenda.</p><Button className="mt-6" variant="outline" asChild><Link to="/">Voltar ao site</Link></Button></main></div>;

  const todayAppointments = data.appointments.filter((item: any) => item.scheduled_date === today && item.status !== "cancelado");
  const upcomingAppointments = data.appointments.filter((item: any) => item.scheduled_date >= today && item.status !== "cancelado");
  const activePeriods = data.availability.filter((item: any) => item.is_available).length;

  const setAvailability = async (weekday: number, period: string, checked: boolean) => {
    const { error: availabilityError } = await db.from("professional_availability_periods").upsert({
      professional_id: data.professional.id,
      weekday,
      period,
      is_available: checked,
      updated_at: new Date().toISOString(),
    }, { onConflict: "professional_id,weekday,period" });
    if (availabilityError) { toast.error(availabilityError.message); return; }
    await refetch();
  };

  const addTime = async () => {
    if (!newTime) { toast.error("Escolha um horário."); return; }
    setSavingTime(true);
    const { error: slotError } = await db.from("professional_time_slots").upsert({ professional_id: data.professional.id, slot: newTime, is_available: true, sort_order: Number(newTime.replace(":", "")), updated_at: new Date().toISOString() }, { onConflict: "professional_id,slot" });
    setSavingTime(false);
    if (slotError) { toast.error(slotError.message); return; }
    setNewTime(""); toast.success("Horário adicionado à sua agenda."); await refetch();
  };

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader onSignOut={signOut} />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Minha agenda</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{data.professional.name}</h1><p className="mt-1 text-sm text-muted-foreground">{data.professional.specialty}</p></div><Button variant="outline" size="sm" className="rounded-full" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar</Button></div>
        </section>

        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:mt-6 sm:gap-4"><Metric icon={CalendarDays} label="Hoje" value={String(todayAppointments.length)} /><Metric icon={Clock3} label="Turnos ativos" value={String(activePeriods)} /><Metric icon={Stethoscope} label="Próximos" value={String(upcomingAppointments.length)} /></div>

        <section className="mt-7 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <div><h2 className="text-lg font-semibold">Meus dias e turnos</h2><p className="mt-1 text-xs text-muted-foreground">Escolha em quais dias você atende de manhã, à tarde ou à noite. Turnos desligados não aceitarão novos agendamentos.</p></div>
          <div className="mt-5 space-y-3">
            {weekdays.map((day) => <div key={day.value} className="rounded-2xl border border-border p-4"><p className="mb-3 text-sm font-semibold">{day.label}</p><div className="grid gap-2 sm:grid-cols-3">{periods.map((period) => { const row = data.availability.find((item: any) => item.weekday === day.value && item.period === period.value); const checked = row?.is_available ?? false; return <div key={period.value} className="flex items-center justify-between rounded-xl bg-secondary/50 px-3 py-2.5"><div><p className="text-xs font-medium">{period.label}</p><p className="text-[9px] text-muted-foreground">{period.detail}</p></div><Switch checked={checked} onCheckedChange={(value) => setAvailability(day.value, period.value, value)} /></div>; })}</div></div>)}
          </div>
        </section>

        <section className="mt-7 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">Meus horários disponíveis</h2><p className="mt-1 text-xs text-muted-foreground">Além do dia e turno, defina os horários exatos que podem receber agendamentos.</p></div><div className="flex gap-2"><Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-[150px]" /><Button type="button" onClick={addTime} disabled={savingTime}><Plus className="size-4" /> Adicionar horário</Button></div></div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {data.slots.length === 0 ? <p className="col-span-full rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhum horário cadastrado.</p> : data.slots.map((slot: any) => <div key={slot.id} className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"><div><p className="font-semibold tabular-nums">{slot.slot}</p><p className="text-[10px] text-muted-foreground">{slot.is_available ? "Disponível" : "Pausado"}</p></div><div className="flex items-center gap-2"><Switch checked={slot.is_available} onCheckedChange={async (checked) => { const { error: updateError } = await db.from("professional_time_slots").update({ is_available: checked, updated_at: new Date().toISOString() }).eq("id", slot.id); if (updateError) { toast.error(updateError.message); return; } await refetch(); }} /><Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={async () => { if (!window.confirm(`Remover o horário ${slot.slot}?`)) return; const { error: removeError } = await db.from("professional_time_slots").delete().eq("id", slot.id); if (removeError) { toast.error(removeError.message); return; } toast.success("Horário removido."); await refetch(); }}><Trash2 className="size-4" /></Button></div></div>)}
          </div>
        </section>

        <section className="mt-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">Meus atendimentos</h2><p className="mt-1 text-xs text-muted-foreground">Somente os atendimentos vinculados à sua agenda aparecem aqui.</p></div><div className="flex gap-2"><div className="grid grid-cols-2 rounded-xl bg-secondary/70 p-1"><button type="button" onClick={() => setScope("upcoming")} className={`rounded-lg px-3 py-2 text-xs ${scope === "upcoming" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Próximos</button><button type="button" onClick={() => setScope("all")} className={`rounded-lg px-3 py-2 text-xs ${scope === "all" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Todos</button></div><Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-[160px]" /></div></div>
          <div className="mt-4 space-y-3">{filteredAppointments.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">Nenhum atendimento encontrado.</div> : filteredAppointments.map((appointment: any) => <ProfessionalAppointmentCard key={appointment.id} appointment={appointment} onSaved={() => refetch()} />)}</div>
        </section>
      </main>
    </div>
  );
}

function ProfessionalAppointmentCard({ appointment, onSaved }: any) {
  const [busy, setBusy] = useState(false);
  const confirmed = responseFor(appointment)?.response === "confirmado";
  const confirmCommitment = async () => {
    if (!appointment.professional_id || appointment.status === "cancelado") return;
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await db.from("appointment_professional_responses").upsert({ appointment_id: appointment.id, professional_id: appointment.professional_id, response: "confirmado", responded_at: now, updated_at: now }, { onConflict: "appointment_id" });
    setBusy(false);
    if (error) { toast.error("Não foi possível confirmar o compromisso."); return; }
    toast.success("Compromisso confirmado."); onSaved?.();
  };
  return <article className={`rounded-2xl border border-border bg-card p-4 shadow-soft ${appointment.status === "cancelado" ? "opacity-60" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{appointment.patient_name}</p><Badge variant={appointment.status === "confirmado" ? "default" : "outline"} className="rounded-full text-[10px]">{appointment.status}</Badge>{confirmed ? <Badge className="rounded-full bg-primary-soft text-primary"><CheckCircle2 className="mr-1 size-3" /> Você confirmou</Badge> : null}</div><p className="mt-1 text-xs text-muted-foreground">{appointment.service?.name || "Procedimento"}</p></div><div className="text-right"><p className="font-semibold">{appointment.scheduled_time}</p><p className="text-[10px] text-muted-foreground">{formatDate(appointment.scheduled_date)}</p></div></div><div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2"><a href={appointment.patient_phone ? `tel:${appointment.patient_phone}` : undefined} className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="size-3.5" /> {appointment.patient_phone || "Telefone não informado"}</a><a href={appointment.patient_email ? `mailto:${appointment.patient_email}` : undefined} className="flex items-center gap-2 text-xs text-muted-foreground sm:justify-end"><Mail className="size-3.5" /> {appointment.patient_email || "E-mail não informado"}</a></div>{appointment.notes ? <p className="mt-3 rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">{appointment.notes}</p> : null}{appointment.status !== "cancelado" && !confirmed ? <Button className="mt-3 w-full rounded-xl" disabled={busy} onClick={confirmCommitment}><CheckCircle2 className="size-4" /> {busy ? "Confirmando..." : "Confirmar compromisso"}</Button> : null}</article>;
}

function SimpleHeader({ onSignOut }: { onSignOut: () => void }) { return <header className="sticky top-0 z-40 border-b border-border/80 bg-card/95 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-8"><Link to="/"><img src={logo} alt="JR Clinic" className="h-9 w-auto" /></Link><Button variant="outline" size="sm" className="rounded-full" onClick={onSignOut}><LogOut className="size-4" /> Sair</Button></div></header>; }
function Metric({ icon: Icon, label, value }: any) { return <div className="rounded-2xl border border-border bg-card p-4 shadow-soft"><Icon className="size-4 text-primary" /><p className="mt-2 text-2xl font-semibold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>; }
function CenteredMessage({ title, detail, action }: any) { return <div className="grid min-h-screen place-items-center bg-background px-5"><div className="max-w-md text-center"><ShieldCheck className="mx-auto size-7 text-primary" /><h1 className="mt-4 text-xl font-semibold">{title}</h1>{detail ? <p className="mt-2 text-sm text-muted-foreground">{detail}</p> : null}{action ? <div className="mt-5">{action}</div> : null}</div></div>; }
