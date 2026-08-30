import {
  BellRing,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  Mail,
  Phone,
  Search,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatPrice } from "@/lib/clinic";

const db = supabase as any;

type Scope = "active" | "history" | "all";

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function latestPayment(item: any) {
  return [...(item?.payments ?? [])].sort(
    (a: any, b: any) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
  )[0] ?? null;
}

function approvedPayment(item: any) {
  return [...(item?.payments ?? [])]
    .filter((payment: any) => payment.status === "approved")
    .sort((a: any, b: any) => new Date(b.paid_at ?? b.created_at ?? 0).getTime() - new Date(a.paid_at ?? a.created_at ?? 0).getTime())[0] ?? null;
}

function paymentLabel(item: any) {
  if (item?.payment_choice === "onsite") return "Presencial";
  const approved = approvedPayment(item);
  const latest = latestPayment(item);
  if (approved) {
    if (item.payment_choice === "online_full" || approved.kind === "full") return "Pago 100%";
    const percent = Number(item.deposit_percent ?? 50);
    return `Pago ${Number.isInteger(percent) ? percent : percent.toFixed(1).replace(".", ",")}%`;
  }
  if (latest?.status === "failed") return "Pagamento falhou";
  if (latest?.status === "pending" || latest?.status === "creating") return "Pagamento pendente";
  return "Aguardando pagamento";
}

function statusLabel(status: string) {
  if (status === "confirmado") return "Confirmado";
  if (status === "cancelado") return "Cancelado";
  if (status === "aguardando_pagamento") return "Aguardando pagamento";
  return "Aguardando confirmação";
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function playNotificationSound(audioRef: React.MutableRefObject<AudioContext | null>) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = audioRef.current ?? new AudioCtx();
    audioRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(740, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.24);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.25);
  } catch {
    // O popup continua funcionando mesmo se o navegador bloquear áudio automático.
  }
}

async function fetchAppointment(id: string) {
  const { data, error } = await db
    .from("appointments")
    .select("id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, created_at, status_updated_at, payment_choice, service_price_snapshot, deposit_percent, deposit_amount, balance_amount, service:services(name, price, duration_min), professional:professionals(name, specialty), payments(status, amount, kind, payment_method_id, provider, paid_at, created_at, status_detail)")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return data;
}

export function AdminAppointmentsWorkspace({ appointments, onStatusChange, onRefresh }: {
  appointments: any[];
  onStatusChange: (id: string, status: "pendente" | "confirmado" | "cancelado") => Promise<boolean>;
  onRefresh: () => void;
}) {
  const [scope, setScope] = useState<Scope>("active");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [incoming, setIncoming] = useState<any | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const notified = useRef(new Set<string>());

  useEffect(() => {
    const unlock = () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx && !audioRef.current) audioRef.current = new AudioCtx();
        if (audioRef.current?.state === "suspended") void audioRef.current.resume();
      } catch {}
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    const notify = async (payload: any) => {
      const next = payload.new as any;
      if (!next?.id || next.status !== "pendente" || notified.current.has(next.id)) return;
      notified.current.add(next.id);
      onRefresh();
      const detail = await fetchAppointment(next.id);
      if (!detail) return;
      playNotificationSound(audioRef);
      setIncoming(detail);
      toast.success("Novo agendamento realizado", {
        description: `${detail.patient_name} · ${detail.service?.name ?? "Atendimento"} · ${formatDate(detail.scheduled_date)} às ${detail.scheduled_time}`,
      });
    };

    const channel = supabase
      .channel("jrclinic-admin-appointments")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "appointments" }, notify)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "appointments" }, notify)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [onRefresh]);

  const filtered = useMemo(() => {
    const today = todayIso();
    const term = search.trim().toLowerCase();
    return appointments
      .filter((item) => {
        const last = latestPayment(item);
        const failedUnpaid = item.status === "aguardando_pagamento" && last?.status === "failed";
        const active = item.status !== "cancelado" && item.scheduled_date >= today && !failedUnpaid;
        if (scope === "active" && !active) return false;
        if (scope === "history" && active) return false;
        if (!term) return true;
        return [item.patient_name, item.patient_email, item.patient_phone, item.service?.name, item.professional?.name]
          .some((value) => String(value ?? "").toLowerCase().includes(term));
      })
      .sort((a, b) => scope === "history"
        ? `${b.scheduled_date} ${b.scheduled_time}`.localeCompare(`${a.scheduled_date} ${a.scheduled_time}`)
        : `${a.scheduled_date} ${a.scheduled_time}`.localeCompare(`${b.scheduled_date} ${b.scheduled_time}`));
  }, [appointments, scope, search]);

  const activeCount = appointments.filter((item) => item.status !== "cancelado" && item.scheduled_date >= todayIso()).length;

  const act = async (appointment: any, status: "confirmado" | "cancelado") => {
    setBusyAction(true);
    const ok = await onStatusChange(appointment.id, status);
    setBusyAction(false);
    if (!ok) return;
    setIncoming(null);
    setSelected((current: any) => current?.id === appointment.id ? { ...current, status } : current);
  };

  return (
    <section>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="text-lg font-semibold">Agenda da clínica</h2><p className="mt-1 text-xs text-muted-foreground">{activeCount} ativos · clique em qualquer card para abrir todos os dados.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-[260px]"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Paciente, e-mail, serviço..." className="h-10 rounded-xl pl-9" /></div>
            <div className="grid grid-cols-3 rounded-xl bg-secondary/70 p-1">
              {([['active','Ativos'],['history','Histórico'],['all','Todos']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setScope(value)} className={`h-8 rounded-lg px-3 text-xs font-medium ${scope === value ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{label}</button>)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {filtered.length === 0 ? <div className="lg:col-span-2 2xl:col-span-3 rounded-2xl border border-dashed border-border bg-card p-8 text-center"><CalendarDays className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">Nenhum agendamento neste filtro.</p></div> : filtered.map((appointment) => (
          <button key={appointment.id} type="button" onClick={() => setSelected(appointment)} className="rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition hover:border-primary/30 hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="truncate text-base font-semibold">{appointment.patient_name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{appointment.patient_email}</p></div><AdminStatusBadge status={appointment.status} />
            </div>
            <div className="mt-3 rounded-xl bg-secondary/45 p-3"><p className="truncate text-sm font-medium">{appointment.service?.name ?? "Atendimento"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{appointment.professional?.name ?? "Profissional não definido"} · {appointment.professional?.specialty ?? "Equipe"}</p></div>
            <div className="mt-3 grid grid-cols-3 gap-2"><SmallInfo label="Data" value={formatDate(appointment.scheduled_date)} /><SmallInfo label="Horário" value={appointment.scheduled_time} /><SmallInfo label="Pagamento" value={paymentLabel(appointment)} accent /></div>
            <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3"><p className="text-xs text-muted-foreground">{appointment.patient_phone || "Sem telefone"}</p><p className="text-xs font-semibold text-primary">{formatPrice(Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0))} · Detalhes →</p></div>
          </button>
        ))}
      </div>

      <AppointmentAdminDialog appointment={selected} open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} onConfirm={() => selected && act(selected, "confirmado")} onCancel={() => selected && act(selected, "cancelado")} busy={busyAction} />
      <NewAppointmentAlert appointment={incoming} open={Boolean(incoming)} onLater={() => setIncoming(null)} onConfirm={() => incoming && act(incoming, "confirmado")} onCancel={() => incoming && act(incoming, "cancelado")} busy={busyAction} />
    </section>
  );
}

function AdminStatusBadge({ status }: { status: string }) {
  const variant = status === "cancelado" ? "destructive" : status === "confirmado" ? "default" : "secondary";
  return <Badge variant={variant as any} className="shrink-0 rounded-full px-2.5 text-[10px] font-normal">{statusLabel(status)}</Badge>;
}

function SmallInfo({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="min-w-0"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-0.5 truncate text-xs font-medium ${accent ? "text-primary" : ""}`}>{value}</p></div>;
}

function DetailBox({ icon: Icon, label, value }: any) {
  return <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-4" /></span><div className="min-w-0"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div></div>;
}

function AppointmentAdminDialog({ appointment, open, onOpenChange, onConfirm, onCancel, busy }: any) {
  if (!appointment) return null;
  const approved = approvedPayment(appointment);
  const total = Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0);
  const paid = Number(approved?.amount ?? 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-2xl sm:p-6">
      <DialogHeader><div className="flex flex-wrap items-center gap-2"><DialogTitle>{appointment.patient_name}</DialogTitle><AdminStatusBadge status={appointment.status} /></div><DialogDescription>{appointment.service?.name ?? "Atendimento"} · {formatDate(appointment.scheduled_date)} às {appointment.scheduled_time}</DialogDescription></DialogHeader>
      <div className="mt-2 rounded-2xl bg-primary-soft/60 p-4"><div className="flex items-center gap-2 text-primary"><CreditCard className="size-4" /><p className="text-sm font-semibold">{paymentLabel(appointment)}</p></div><div className="mt-3 grid grid-cols-3 gap-2"><SmallInfo label="Total" value={formatPrice(total)} /><SmallInfo label="Pago" value={formatPrice(paid)} /><SmallInfo label="Restante" value={formatPrice(Number(appointment.balance_amount ?? Math.max(0,total-paid)))} /></div>{approved?.paid_at ? <p className="mt-3 text-[11px] text-muted-foreground">Pagamento em {formatDateTime(approved.paid_at)} · {approved.payment_method_id || approved.provider || "InfinitePay"}</p> : appointment.payment_choice === "onsite" ? <p className="mt-3 text-[11px] text-muted-foreground">Pagamento integral previsto para a clínica.</p> : null}</div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2"><DetailBox icon={CalendarDays} label="Data" value={formatDate(appointment.scheduled_date)} /><DetailBox icon={Clock3} label="Horário" value={appointment.scheduled_time} /><DetailBox icon={Stethoscope} label="Profissional" value={`${appointment.professional?.name ?? "—"} · ${appointment.professional?.specialty ?? "—"}`} /><DetailBox icon={Clock3} label="Duração" value={`${appointment.service?.duration_min ?? "—"} min`} /><DetailBox icon={Mail} label="E-mail" value={appointment.patient_email} /><DetailBox icon={Phone} label="Telefone" value={appointment.patient_phone || "Não informado"} /><DetailBox icon={UserRound} label="Criado em" value={formatDateTime(appointment.created_at)} /><DetailBox icon={CreditCard} label="Forma escolhida" value={appointment.payment_choice === "onsite" ? "Pagamento presencial" : appointment.payment_choice === "online_full" ? "Pagamento online integral" : "Sinal online"} /></div>
      {appointment.notes ? <div className="mt-4 rounded-2xl bg-secondary/50 p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Observações do cliente</p><p className="mt-2 text-sm leading-relaxed">{appointment.notes}</p></div> : null}
      <DialogFooter className="mt-5 gap-2"><Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>Fechar</Button>{appointment.status !== "cancelado" ? <Button variant="outline" className="rounded-full text-destructive" onClick={onCancel} disabled={busy}><X className="size-4" /> Recusar / cancelar</Button> : null}{appointment.status !== "confirmado" && appointment.status !== "cancelado" ? <Button className="rounded-full" onClick={onConfirm} disabled={busy}><Check className="size-4" /> Confirmar</Button> : null}</DialogFooter>
    </DialogContent></Dialog>
  );
}

function NewAppointmentAlert({ appointment, open, onLater, onConfirm, onCancel, busy }: any) {
  if (!appointment) return null;
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onLater()}><DialogContent className="w-[calc(100%-1rem)] rounded-3xl p-5 sm:max-w-md sm:p-6">
      <DialogHeader><span className="mb-2 grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary"><BellRing className="size-5" /></span><DialogTitle>Novo agendamento realizado</DialogTitle><DialogDescription>Revise os dados e confirme agora ou deixe para decidir depois.</DialogDescription></DialogHeader>
      <div className="mt-2 rounded-2xl border border-border bg-secondary/40 p-4"><p className="text-base font-semibold">{appointment.patient_name}</p><p className="mt-1 text-sm text-muted-foreground">{appointment.service?.name ?? "Atendimento"}</p><div className="mt-3 grid grid-cols-2 gap-2"><SmallInfo label="Quando" value={`${formatDate(appointment.scheduled_date)} · ${appointment.scheduled_time}`} /><SmallInfo label="Profissional" value={appointment.professional?.name ?? "—"} /><SmallInfo label="Pagamento" value={paymentLabel(appointment)} accent /><SmallInfo label="Valor" value={formatPrice(Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0))} /></div></div>
      <DialogFooter className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3"><Button variant="outline" className="rounded-full" onClick={onLater} disabled={busy}>Depois</Button><Button variant="outline" className="rounded-full text-destructive" onClick={onCancel} disabled={busy}><X className="size-4" /> Recusar</Button><Button className="rounded-full" onClick={onConfirm} disabled={busy}><Check className="size-4" /> Confirmar</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}
