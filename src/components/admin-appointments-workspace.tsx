import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  Stethoscope,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AdminOperationSummary } from "@/components/admin-operation-summary";
import { AppointmentCalendar } from "@/components/appointment-calendar";
import { CalendarDayDialog } from "@/components/calendar-day-dialog";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  appointmentProximity,
  appointmentWhatsAppUrl,
  daysUntilAppointment,
  normalizeWhatsAppPhone,
} from "@/lib/appointment-contact";
import { formatDate, formatPrice } from "@/lib/clinic";

const db = supabase as any;
type Scope = "pending" | "accepted" | "history" | "all";

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function latestPayment(item: any) {
  return [...(item?.payments ?? [])].sort((a: any, b: any) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())[0] ?? null;
}

function approvedPayment(item: any) {
  return [...(item?.payments ?? [])].filter((payment: any) => payment.status === "approved").sort((a: any, b: any) => new Date(b.paid_at ?? b.created_at ?? 0).getTime() - new Date(a.paid_at ?? a.created_at ?? 0).getTime())[0] ?? null;
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

function appointmentServiceItems(item: any) {
  return [...(item?.appointment_services ?? [])]
    .sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0));
}

function appointmentServiceLabel(item: any) {
  const linked = appointmentServiceItems(item)
    .map((entry: any) => entry?.service?.name)
    .filter(Boolean);
  if (linked.length) return linked.join(" + ");
  return item?.service?.name ?? "Atendimento";
}

function appointmentComboProgress(item: any) {
  const items = appointmentServiceItems(item);
  const total = items.length;
  const completed = items.filter((entry: any) => entry.status === "completed").length;
  return {
    items,
    total,
    completed,
    isCombo: total > 1,
    started: total > 1 && completed > 0,
    allCompleted: total > 1 && completed === total,
  };
}

function statusLabel(status: string) {
  if (status === "atendido") return "Atendido";
  if (status === "confirmado") return "Confirmado";
  if (status === "cancelado") return "Cancelado";
  if (status === "aguardando_pagamento") return "Aguardando pagamento";
  return "Aguardando profissional";
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function playNotificationSound(audioRef: { current: AudioContext | null }) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = audioRef.current ?? new AudioCtx();
    audioRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume();

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.9, ctx.currentTime);
    master.connect(ctx.destination);

    const start = ctx.currentTime + 0.04;
    const interval = 1.25;
    const repeats = 8;
    const notes = [659.25, 880];

    for (let repeat = 0; repeat < repeats; repeat += 1) {
      const base = start + repeat * interval;
      notes.forEach((frequency, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const noteStart = base + index * 0.14;
        const noteEnd = noteStart + 0.62;

        oscillator.type = index === 0 ? "sine" : "triangle";
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.34 : 0.22, noteStart + 0.035);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(noteStart);
        oscillator.stop(noteEnd + 0.02);
      });
    }

    const end = start + 10;
    master.gain.setValueAtTime(0.9, end - 0.8);
    master.gain.linearRampToValueAtTime(0.0001, end);
    window.setTimeout(() => {
      try { master.disconnect(); } catch {}
    }, 10_400);
  } catch {}
}

async function fetchAppointment(id: string) {
  const { data, error } = await db.from("appointments").select("id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, created_at, status_updated_at, payment_choice, service_price_snapshot, deposit_percent, deposit_amount, balance_amount, service:services!appointments_service_id_fkey(name, price, duration_min), appointment_services(service_id, position, price_snapshot, status, completed_at, completed_by, service:services!appointment_services_service_id_fkey(name, price, duration_min)), professional:professionals(name, specialty), payments(status, amount, kind, payment_method_id, provider, paid_at, created_at, status_detail)").eq("id", id).maybeSingle();
  if (error) return null;
  return data;
}

function openAppointmentWhatsApp(appointment: any, kind: "confirmation" | "reminder" | "chat") {
  const url = appointmentWhatsAppUrl(appointment, kind);
  if (!url) {
    toast.error("Este cliente não possui WhatsApp cadastrado.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function AdminAppointmentsWorkspace({ appointments, onStatusChange, onRefresh }: { appointments: any[]; onStatusChange: (id: string, status: "pendente" | "confirmado" | "cancelado") => Promise<boolean>; onRefresh: () => void; }) {
  const [scope, setScope] = useState<Scope>("pending");
  const [search, setSearch] = useState("");
  const [calendarDate, setCalendarDate] = useState("");
  const [calendarDayOpen, setCalendarDayOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [incoming, setIncoming] = useState<any | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
      // Avoid stacking two dialogs/overlays when a manual appointment triggers realtime.
      setCreateOpen(false);
      playNotificationSound(audioRef);
      setIncoming(detail);
      toast.success("Novo agendamento realizado", { description: `${detail.patient_name} · ${appointmentServiceLabel(detail)} · ${formatDate(detail.scheduled_date)} às ${detail.scheduled_time}` });
    };
    const channel = supabase.channel("jrclinic-admin-appointments").on("postgres_changes", { event: "INSERT", schema: "public", table: "appointments" }, notify).on("postgres_changes", { event: "UPDATE", schema: "public", table: "appointments" }, notify).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [onRefresh]);

  const counts = useMemo(() => {
    const today = todayIso();
    return appointments.reduce((result, item) => {
      const futureOrToday = item.scheduled_date >= today;
      if (futureOrToday && (item.status === "pendente" || item.status === "aguardando_pagamento")) result.pending += 1;
      if (futureOrToday && item.status === "confirmado") result.accepted += 1;
      if (!futureOrToday || item.status === "cancelado" || item.status === "atendido") result.history += 1;
      result.all += 1;
      return result;
    }, { pending: 0, accepted: 0, history: 0, all: 0 });
  }, [appointments]);

  const filtered = useMemo(() => {
    const today = todayIso();
    const term = search.trim().toLowerCase();
    return appointments.filter((item) => {
      const futureOrToday = item.scheduled_date >= today;
      const pending = futureOrToday && (item.status === "pendente" || item.status === "aguardando_pagamento");
      const accepted = futureOrToday && item.status === "confirmado";
      const history = !futureOrToday || item.status === "cancelado" || item.status === "atendido";
      if (scope === "pending" && !pending) return false;
      if (scope === "accepted" && !accepted) return false;
      if (scope === "history" && !history) return false;
      if (calendarDate && item.scheduled_date !== calendarDate) return false;
      if (!term) return true;
      return [item.patient_name, item.patient_email, item.patient_phone, item.service?.name, item.professional?.name].some((value) => String(value ?? "").toLowerCase().includes(term));
    }).sort((a, b) => {
      const left = `${a.scheduled_date} ${a.scheduled_time}`;
      const right = `${b.scheduled_date} ${b.scheduled_time}`;
      return scope === "history" ? right.localeCompare(left) : left.localeCompare(right);
    });
  }, [appointments, scope, search, calendarDate]);

  const act = async (appointment: any, status: "confirmado" | "cancelado") => {
    setBusyAction(true);
    const ok = await onStatusChange(appointment.id, status);
    setBusyAction(false);
    if (!ok) return;
    setIncoming(null);
    setSelected((current: any) => current?.id === appointment.id ? { ...current, status } : current);
    if (status === "confirmado") setScope("accepted");
  };

  const completeAttendance = async (appointment: any) => {
    setBusyAction(true);
    const { error } = await db.rpc("mark_appointment_attended", { _appointment_id: appointment.id });
    setBusyAction(false);
    if (error) {
      toast.error("Não foi possível confirmar o atendimento.", { description: error.message });
      return false;
    }
    toast.success("Atendimento concluído.", { description: "O valor agora foi contabilizado na receita." });
    setSelected((current: any) => current?.id === appointment.id ? { ...current, status: "atendido" } : current);
    setScope("history");
    onRefresh();
    return true;
  };

  const removeAppointment = async (appointment: any) => {
    if (!window.confirm(`Cancelar e arquivar o agendamento de ${appointment.patient_name}? Ele continuará no histórico e poderá ser reagendado depois.`)) return;
    setDeletingId(appointment.id);
    const { error } = await db.from("appointments").update({ status: "cancelado", status_updated_at: new Date().toISOString() }).eq("id", appointment.id);
    setDeletingId(null);
    if (error) { toast.error(error.message); return; }
    if (selected?.id === appointment.id) setSelected((current: any) => current ? { ...current, status: "cancelado" } : current);
    if (incoming?.id === appointment.id) setIncoming(null);
    toast.success("Agendamento cancelado e arquivado.", { description: "Ele pode ser editado e reagendado pelo Histórico." });
    setScope("history");
    onRefresh();
  };

  return (
    <section className="w-full min-w-0 max-w-full overflow-x-hidden">
      <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-stretch gap-4 lg:grid-cols-[minmax(360px,560px)_minmax(0,1fr)]">
        <AppointmentCalendar
          appointments={appointments}
          selectedDate={calendarDate}
          onSelectDate={setCalendarDate}
          onOpenDate={(date) => { setCalendarDate(date); setCalendarDayOpen(date); }}
          title="Calendário geral"
          description="Todos os atendimentos da clínica. Toque em um dia para filtrar a agenda."
        />
        <AdminOperationSummary appointments={appointments} />
      </div>

      <div className="mt-4 w-full min-w-0 max-w-full rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div><h2 className="text-lg font-semibold">Agendamentos</h2><p className="mt-1 text-xs text-muted-foreground">Pendências, confirmações e recontatos ficam centralizados aqui.</p></div>
          <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
            <Button type="button" className="h-10 shrink-0 rounded-xl" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Novo agendamento</Button>
            <div className="relative w-full sm:min-w-[280px] xl:w-[340px]"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Paciente, serviço, profissional..." className="h-10 rounded-xl pl-9" /></div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><CategoryButton active={scope === "pending"} label="Pendentes" count={counts.pending} onClick={() => setScope("pending")} /><CategoryButton active={scope === "accepted"} label="Confirmados" count={counts.accepted} onClick={() => setScope("accepted")} /><CategoryButton active={scope === "history"} label="Histórico" count={counts.history} onClick={() => setScope("history")} /><CategoryButton active={scope === "all"} label="Todos" count={counts.all} onClick={() => setScope("all")} /></div>
      </div>

      <div className="mt-3 grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center lg:col-span-2 2xl:col-span-3"><CalendarDays className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">Nenhum agendamento nesta seleção.</p></div> : filtered.map((appointment) => <AdminAppointmentCard key={appointment.id} appointment={appointment} onOpen={() => setSelected(appointment)} onEdit={() => { setSelected(null); setEditingAppointment(appointment); }} onDelete={() => removeAppointment(appointment)} onAttended={() => completeAttendance(appointment)} deleting={deletingId === appointment.id} />)}
      </div>

      <CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => { setCreateOpen(false); setScope("pending"); onRefresh(); }} />
      <CreateAppointmentDialog open={Boolean(editingAppointment)} onOpenChange={(open) => { if (!open) setEditingAppointment(null); }} editing={editingAppointment} onCreated={() => { setEditingAppointment(null); setScope("pending"); onRefresh(); }} />
      <CalendarDayDialog date={calendarDayOpen} appointments={appointments} open={Boolean(calendarDayOpen)} onOpenChange={(open) => { if (!open) setCalendarDayOpen(null); }} />
      <AppointmentAdminDialog appointment={selected} open={Boolean(selected)} onOpenChange={(open: boolean) => !open && setSelected(null)} onConfirm={() => selected && act(selected, "confirmado")} onCancel={() => selected && act(selected, "cancelado")} onAttended={() => selected && completeAttendance(selected)} onEdit={() => { if (!selected || selected.status === "atendido") return; const current = selected; setSelected(null); setEditingAppointment(current); }} onPriceSaved={(value: number) => { setSelected((current: any) => current ? { ...current, service_price_snapshot: value, balance_amount: value } : current); onRefresh(); }} onRefresh={onRefresh} busy={busyAction} />
      <NewAppointmentAlert appointment={incoming} open={Boolean(incoming)} onLater={() => setIncoming(null)} onConfirm={() => incoming && act(incoming, "confirmado")} onCancel={() => incoming && act(incoming, "cancelado")} busy={busyAction} />
    </section>
  );
}

function AdminAppointmentCard({ appointment, onOpen, onEdit, onDelete, onAttended, deleting }: any) {
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const proximity = appointment.status === "cancelado" ? "past" : appointmentProximity(appointment.scheduled_date);
  const days = daysUntilAppointment(appointment.scheduled_date);
  const hasWhatsApp = normalizeWhatsAppPhone(appointment.patient_phone).length > 0;
  const scheduledMoment = new Date(`${appointment.scheduled_date}T${appointment.scheduled_time}:00`);
  const combo = appointmentComboProgress(appointment);
  const canMarkAttended = !combo.isCombo && appointment.status === "confirmado" && Number.isFinite(scheduledMoment.getTime()) && scheduledMoment.getTime() <= Date.now();
  const cardClass = proximity === "urgent" ? "border-amber-500/60 bg-amber-50/70 shadow-md" : proximity === "soon" ? "border-amber-300/60 bg-amber-50/35" : "border-border bg-card";
  return <article className={`w-full min-w-0 overflow-hidden rounded-2xl border p-4 text-left shadow-soft transition hover:shadow-md ${cardClass}`}>
    {proximity === "urgent" && appointment.status !== "cancelado" ? <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900"><AlertTriangle className="size-4" /> {days === 0 ? "Atendimento hoje" : "Atendimento amanhã — recontato recomendado"}</div> : proximity === "soon" ? <div className="mb-3 rounded-xl bg-amber-100/60 px-3 py-2 text-[11px] font-medium text-amber-900">Faltam {days} dias para este atendimento.</div> : null}
    <button type="button" onClick={onOpen} className="block w-full min-w-0 max-w-full overflow-hidden text-left">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1 basis-[150px]"><p className="truncate text-base font-semibold">{appointment.patient_name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{appointment.patient_email || "Sem e-mail"}</p></div><div className="max-w-full shrink-0"><AdminStatusBadge status={appointment.status} /></div></div>
      <div className="mt-3 rounded-xl bg-secondary/45 p-3"><p className="truncate text-sm font-medium">{appointmentServiceLabel(appointment)}</p><p className="mt-1 truncate text-xs text-muted-foreground">{appointment.professional?.name ?? "Profissional não definido"} · {appointment.professional?.specialty ?? "Equipe"}</p></div>
      {combo.isCombo ? <div className={`mt-2 rounded-xl border px-3 py-2 text-[11px] font-medium ${combo.allCompleted ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border bg-background text-muted-foreground"}`}><div className="flex items-center justify-between gap-2"><span>Progresso do combo</span><strong>{combo.completed} de {combo.total} concluídos</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${combo.total ? (combo.completed / combo.total) * 100 : 0}%` }} /></div>{combo.allCompleted ? <p className="mt-1.5 font-semibold text-emerald-700">Combo concluído · pronto para o financeiro</p> : null}</div> : null}
      <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 min-[390px]:grid-cols-3"><SmallInfo label="Data" value={formatDate(appointment.scheduled_date)} /><SmallInfo label="Horário" value={appointment.scheduled_time} /><SmallInfo label="Pagamento" value={paymentLabel(appointment)} accent /></div>
    </button>
    {hasWhatsApp && appointment.status !== "cancelado" ? <div className="mt-3">{appointment.status === "confirmado" ? <Button type="button" size="sm" className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openAppointmentWhatsApp(appointment, "reminder")}><MessageCircle className="size-4" /> Enviar lembrete no WhatsApp</Button> : proximity === "urgent" ? <Button type="button" size="sm" className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openAppointmentWhatsApp(appointment, "reminder")}><MessageCircle className="size-4" /> {days === 0 ? "Falar com cliente" : "Enviar lembrete no WhatsApp"}</Button> : <Button type="button" size="sm" variant="outline" className="rounded-xl border-emerald-600/40 text-emerald-700 hover:bg-emerald-50" onClick={() => openAppointmentWhatsApp(appointment, "confirmation")}><MessageCircle className="size-4" /> Confirmar pelo WhatsApp</Button>}</div> : null}
    {canMarkAttended ? <div className="mt-3"><Button type="button" size="sm" className="w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" disabled={attendanceBusy} onClick={async () => { setAttendanceBusy(true); await onAttended?.(); setAttendanceBusy(false); }}><Check className="size-4" /> {attendanceBusy ? "Confirmando atendimento..." : "Confirmar atendimento"}</Button></div> : null}
    {appointment.status === "atendido" ? <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-[11px] font-semibold text-emerald-800">Atendido · valor já contabilizado na receita</div> : null}
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-border/70 pt-3"><p className="min-w-0 flex-1 basis-[120px] truncate text-xs text-muted-foreground">{appointment.patient_phone || "Sem telefone"}</p>{appointment.status !== "atendido" && !combo.started ? <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 rounded-lg px-2.5 text-primary hover:bg-primary/10" onClick={onEdit} title={appointment.status === "cancelado" ? "Reagendar" : "Editar agendamento"}><Pencil className="size-3.5" /> {appointment.status === "cancelado" ? "Reagendar" : "Editar"}</Button> : null}<Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={onDelete} disabled={deleting || appointment.status === "atendido"} title="Cancelar e arquivar agendamento"><Trash2 className="size-3.5" /></Button><button type="button" onClick={onOpen} className="ml-auto max-w-full shrink-0 text-right text-xs font-semibold text-primary hover:underline">{formatPrice(Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0))} · Detalhes →</button></div>
  </article>;
}

function CreateAppointmentDialog({ open, onOpenChange, onCreated, editing = null }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void; editing?: any | null }) {
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState<any[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [bookingSlots, setBookingSlots] = useState<any[]>([]);
  const [bookingSlotsLoading, setBookingSlotsLoading] = useState(false);
  const [bookingSlotsRefreshKey, setBookingSlotsRefreshKey] = useState(0);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [appointmentValue, setAppointmentValue] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [scheduledDate, setScheduledDate] = useState(todayIso());
  const [scheduledTime, setScheduledTime] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingCatalog(true);
    Promise.all([
      db.from("services").select("id, name, price, duration_min, is_active").eq("is_active", true).order("name"),
      db.from("professionals").select("id, name, specialty, is_active, sort_order").eq("is_active", true).order("sort_order").order("name"),
      db.from("service_professionals").select("service_id, professional_id"),
      db.from("clients").select("id, name, whatsapp, email, is_active").eq("is_active", true).order("name"),
    ]).then(([serviceResult, professionalResult, linkResult, clientResult]) => {
      if (!active) return;
      const firstError = [serviceResult, professionalResult, linkResult, clientResult].find((result) => result.error)?.error;
      if (firstError) toast.error(firstError.message);
      else { setServices(serviceResult.data ?? []); setProfessionals(professionalResult.data ?? []); setLinks(linkResult.data ?? []); setClients(clientResult.data ?? []); }
      setLoadingCatalog(false);
    });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open || !editing) return;
    const linkedIds = [...(editing.appointment_services ?? [])]
      .sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0))
      .map((item: any) => item.service_id ?? item.service?.id)
      .filter(Boolean);
    setSelectedClientId(editing.client_id ?? "");
    setPatientName(editing.patient_name ?? "");
    setPatientEmail(editing.patient_email ?? "");
    setPatientPhone(editing.patient_phone ?? "");
    setServiceIds(linkedIds.length ? linkedIds : [editing.service_id].filter(Boolean));
    setServiceSearch("");
    setAppointmentValue(String(Number(editing.service_price_snapshot ?? editing.service?.price ?? 0)));
    setProfessionalId(editing.professional_id ?? editing.professional?.id ?? "");
    setScheduledDate(editing.scheduled_date ?? todayIso());
    setScheduledTime(editing.scheduled_time ?? "");
    setNotes(editing.notes ?? "");
  }, [open, editing]);

  useEffect(() => {
    let cancelled = false;
    const currentEditingSlot = editing && (editing.professional_id ?? editing.professional?.id) === professionalId && editing.scheduled_date === scheduledDate ? editing.scheduled_time : "";
    setScheduledTime(currentEditingSlot);

    if (!open || !professionalId || !scheduledDate) {
      setBookingSlots([]);
      setBookingSlotsLoading(false);
      return;
    }

    setBookingSlotsLoading(true);
    void db
      .rpc("get_professional_booking_slots", { _professional_id: professionalId, _date: scheduledDate })
      .then(({ data, error }: any) => {
        if (cancelled) return;
        if (error) {
          console.error("Falha ao carregar horários da profissional/data", error);
          setBookingSlots([]);
          toast.error("Não foi possível carregar os horários disponíveis desta data.");
        } else {
          const available = (data ?? []).filter((slot: any) => slot.is_available);
          if (currentEditingSlot && !available.some((slot: any) => slot.slot === currentEditingSlot)) {
            available.unshift({ slot: currentEditingSlot, source: "current" });
          }
          setBookingSlots(available);
        }
        setBookingSlotsLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, professionalId, scheduledDate, bookingSlotsRefreshKey, editing]);

  useEffect(() => {
    if (!open || !professionalId) return;
    const refreshSlots = () => setBookingSlotsRefreshKey((current) => current + 1);
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refreshSlots(); };
    window.addEventListener("focus", refreshSlots);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const channel = supabase.channel(`jrclinic-admin-booking-slots-${professionalId}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "appointments", filter: `professional_id=eq.${professionalId}` },
      refreshSlots,
    ).subscribe();
    return () => {
      window.removeEventListener("focus", refreshSlots);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [open, professionalId]);

  const availableProfessionals = useMemo(() => {
    if (!serviceIds.length) return [];
    return professionals.filter((professional) =>
      serviceIds.every((serviceId) => links.some((link) => link.service_id === serviceId && link.professional_id === professional.id)),
    );
  }, [serviceIds, links, professionals]);

  const selectedServices = useMemo(
    () => serviceIds.map((id) => services.find((service) => service.id === id)).filter(Boolean),
    [serviceIds, services],
  );

  const filteredServices = useMemo(() => {
    const term = serviceSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) return services;
    return services.filter((service) => String(service.name ?? "").toLocaleLowerCase("pt-BR").includes(term));
  }, [services, serviceSearch]);

  const toggleService = (id: string) => {
    setProfessionalId("");
    setServiceIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      const total = next.reduce((sum, serviceId) => sum + Number(services.find((service) => service.id === serviceId)?.price ?? 0), 0);
      setAppointmentValue(total.toFixed(2));
      return next;
    });
  };


  const selectSavedClient = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clients.find((item) => item.id === clientId);
    if (!client) return;
    setPatientName(client.name ?? "");
    setPatientPhone(client.whatsapp ?? "");
    setPatientEmail(client.email ?? "");
  };

  const clearSavedClient = () => {
    setSelectedClientId("");
    setPatientName("");
    setPatientPhone("");
    setPatientEmail("");
  };

  const reset = () => { setSelectedClientId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setServiceIds([]); setServiceSearch(""); setAppointmentValue(""); setProfessionalId(""); setScheduledDate(todayIso()); setScheduledTime(""); setNotes(""); };
  const handleOpenChange = (next: boolean) => { if (!next && !saving) reset(); onOpenChange(next); };

  const saveAppointment = async () => {
    if (editing && appointmentComboProgress(editing).started) {
      toast.error("Este combo já possui serviço concluído.", { description: "Para preservar o histórico do pacote, conclua o combo antes de alterar serviços ou reagendar." });
      return;
    }
    if (!patientName.trim()) { toast.error("Informe o nome do cliente."); return; }
    if (!serviceIds.length) { toast.error("Selecione ao menos um serviço."); return; }
    if (!professionalId) { toast.error("Selecione o profissional."); return; }
    if (!scheduledDate || scheduledDate < todayIso()) { toast.error("Selecione uma data válida."); return; }
    if (!scheduledTime) { toast.error("Selecione o horário."); return; }
    const invalidLink = serviceIds.some((serviceId) => !links.some((link) => link.service_id === serviceId && link.professional_id === professionalId));
    if (invalidLink) { toast.error("Esse profissional não atende todos os serviços selecionados."); return; }
    const parsedValue = Number(appointmentValue.replace(",", "."));
    if (!Number.isFinite(parsedValue) || parsedValue < 0) { toast.error("Informe um valor válido para o atendimento."); return; }
    const total = Math.round((parsedValue + Number.EPSILON) * 100) / 100;
    setSaving(true);
    let error: any = null;
    if (editing) {
      const result = await db.rpc("update_admin_multi_service_appointment", {
        _appointment_id: editing.id,
        _client_id: selectedClientId || null,
        _patient_name: patientName.trim(),
        _patient_email: patientEmail.trim(),
        _patient_phone: patientPhone.trim(),
        _service_ids: serviceIds,
        _professional_id: professionalId,
        _scheduled_date: scheduledDate,
        _scheduled_time: scheduledTime,
        _notes: notes.trim(),
        _total: total,
      });
      error = result.error;
    } else {
      const conflict = await db.from("appointments").select("id").eq("professional_id", professionalId).eq("scheduled_date", scheduledDate).eq("scheduled_time", scheduledTime).neq("status", "cancelado").limit(1).maybeSingle();
      if (conflict.error) { setSaving(false); toast.error(conflict.error.message); return; }
      if (conflict.data) { setSaving(false); toast.error("Este profissional já possui um agendamento nesse horário."); return; }
      const result = await db.rpc("create_admin_multi_service_appointment", {
        _client_id: selectedClientId || null,
        _patient_name: patientName.trim(),
        _patient_email: patientEmail.trim(),
        _patient_phone: patientPhone.trim(),
        _service_ids: serviceIds,
        _professional_id: professionalId,
        _scheduled_date: scheduledDate,
        _scheduled_time: scheduledTime,
        _notes: notes.trim(),
        _total: total,
      });
      error = result.error;
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setBookingSlotsRefreshKey((current) => current + 1);
    toast.success(editing ? "Agendamento atualizado e reenviado para confirmação." : "Agendamento enviado para confirmação da profissional.", { description: `${patientName.trim()} · ${selectedServices.map((service: any) => service.name).join(" + ")} · ${formatDate(scheduledDate)} às ${scheduledTime}` });
    reset(); onCreated();
  };

  return <Dialog open={open} onOpenChange={handleOpenChange}><DialogContent className="!left-2 !right-2 !top-2 !bottom-[5.4rem] !w-auto !max-w-none !translate-x-0 !translate-y-0 min-w-0 max-h-none overflow-x-hidden overflow-y-auto rounded-2xl p-4 sm:!left-1/2 sm:!right-auto sm:!top-1/2 sm:!bottom-auto sm:!w-[calc(100%-2rem)] sm:!max-w-2xl sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:max-h-[92dvh] sm:rounded-3xl sm:p-6"><DialogHeader className="min-w-0 pr-6 text-left"><DialogTitle className="text-base sm:text-lg">{editing ? (editing.status === "cancelado" ? "Reagendar atendimento" : "Editar agendamento") : "Novo agendamento"}</DialogTitle><DialogDescription className="text-xs leading-relaxed sm:text-sm">{editing ? "Altere data, horário, serviços, profissional ou dados do cliente. Ao salvar, o agendamento volta para confirmação da profissional." : "O agendamento será criado como aguardando confirmação da profissional e com pagamento presencial."}</DialogDescription></DialogHeader><div className="mt-1 grid min-w-0 gap-3 sm:mt-2 sm:grid-cols-2 sm:gap-4">
    <div className="min-w-0 space-y-1.5 sm:col-span-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <Label>Selecionar cliente cadastrado</Label>
        {selectedClientId ? <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearSavedClient} disabled={saving}>Preencher manualmente</Button> : null}
      </div>
      <Select value={selectedClientId} onValueChange={selectSavedClient} disabled={saving || loadingCatalog || clients.length === 0}>
        <SelectTrigger><SelectValue placeholder={clients.length === 0 ? "Nenhum cliente cadastrado" : "Escolha um cliente"} /></SelectTrigger>
        <SelectContent>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name} · {client.whatsapp}</SelectItem>)}</SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">Ao selecionar, nome, WhatsApp e e-mail são preenchidos automaticamente.</p>
    </div>
    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="admin-patient-name">Nome do cliente *</Label><Input id="admin-patient-name" value={patientName} onChange={(e) => setPatientName(e.target.value)} disabled={saving} /></div>
    <div className="space-y-1.5"><Label htmlFor="admin-patient-phone">WhatsApp</Label><Input id="admin-patient-phone" inputMode="tel" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} placeholder="(85) 99999-9999" disabled={saving} /></div>
    <div className="space-y-1.5"><Label htmlFor="admin-patient-email">E-mail</Label><Input id="admin-patient-email" type="email" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} disabled={saving} /></div>
    <div className="min-w-0 space-y-2 sm:col-span-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><Label>Serviços *</Label><span className="text-[11px] text-muted-foreground">{serviceIds.length ? `${serviceIds.length} selecionado(s)` : "Selecione um ou mais"}</span></div>
      <div className="rounded-2xl border border-border bg-background p-2">
        <div className="sticky top-0 z-10 mb-2 bg-background pb-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary/70" />
            <Input value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Pesquisar procedimento..." className="h-10 rounded-xl border-primary/25 bg-card pl-9 pr-3 text-sm shadow-sm focus-visible:ring-primary/25" disabled={saving || loadingCatalog} />
          </div>
        </div>
        <div className="grid max-h-56 min-w-0 grid-cols-1 gap-2 overflow-y-auto sm:max-h-52 sm:grid-cols-2">
          {filteredServices.length ? filteredServices.map((service) => { const checked = serviceIds.includes(service.id); return <button key={service.id} type="button" disabled={saving || loadingCatalog} onClick={() => toggleService(service.id)} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${checked ? "border-primary bg-primary-soft/70 text-primary" : "border-border bg-card hover:bg-secondary/40"}`}><span className="min-w-0"><span className="block truncate text-sm font-medium">{service.name}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{formatPrice(Number(service.price ?? 0))}</span></span><span className={`grid size-6 shrink-0 place-items-center rounded-lg border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>{checked ? <Check className="size-3.5" /> : null}</span></button>; }) : <div className="py-5 text-center text-xs text-muted-foreground sm:col-span-2">Nenhum serviço encontrado.</div>}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Você pode marcar vários procedimentos no mesmo agendamento. O profissional precisa atender todos os serviços escolhidos.</p>
    </div>
    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="admin-appointment-value">Valor total do atendimento *</Label><Input id="admin-appointment-value" type="number" min="0" step="0.01" inputMode="decimal" value={appointmentValue} onChange={(e) => setAppointmentValue(e.target.value)} disabled={saving || !serviceIds.length} /><p className="text-[11px] text-muted-foreground">A soma dos serviços é preenchida automaticamente. Altere aqui para aplicar desconto ou valor combinado sem mudar o catálogo.</p></div>
    <div className="space-y-1.5 sm:col-span-2"><Label>Profissional *</Label><Select value={professionalId} onValueChange={setProfessionalId} disabled={saving || !serviceIds.length || availableProfessionals.length === 0}><SelectTrigger><SelectValue placeholder={!serviceIds.length ? "Escolha primeiro os serviços" : availableProfessionals.length ? "Selecione o profissional" : "Nenhum profissional atende todos os serviços"} /></SelectTrigger><SelectContent>{availableProfessionals.map((professional) => <SelectItem key={professional.id} value={professional.id}>{professional.name}{professional.specialty ? ` · ${professional.specialty}` : ""}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1.5"><Label htmlFor="admin-scheduled-date">Data *</Label><Input id="admin-scheduled-date" type="date" min={todayIso()} value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} disabled={saving} /></div>
    <div className="space-y-1.5"><Label>Horário *</Label><Select value={scheduledTime} onValueChange={setScheduledTime} disabled={saving || loadingCatalog || bookingSlotsLoading || !professionalId || !scheduledDate}><SelectTrigger><SelectValue placeholder={bookingSlotsLoading ? "Carregando horários..." : bookingSlots.length ? "Selecione o horário" : "Sem horários disponíveis"} /></SelectTrigger><SelectContent>{bookingSlots.map((slot) => <SelectItem key={`${slot.slot}-${slot.source ?? "slot"}`} value={slot.slot}>{slot.slot}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="admin-notes">Observações</Label><Textarea id="admin-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-24" disabled={saving} /></div>
  </div><div className="mt-4 rounded-2xl bg-primary-soft/60 p-3 text-xs text-muted-foreground">{editing ? "Ao salvar as alterações, o agendamento volta para " : "Depois de criado, o card ficará em "}<strong className="text-foreground">Aguardando profissional</strong> até a colaboradora confirmar ou recusar.</div><DialogFooter className="sticky bottom-0 -mx-4 mt-4 gap-2 border-t border-border bg-background/95 px-4 pb-1 pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none sm:gap-0"><Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancelar</Button><Button onClick={saveAppointment} disabled={saving || loadingCatalog}>{saving ? "Salvando..." : editing ? "Salvar e reagendar" : "Criar agendamento"}</Button></DialogFooter></DialogContent></Dialog>;
}

function CategoryButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) { return <button type="button" onClick={onClick} className={`flex min-h-[54px] items-center justify-between rounded-xl border px-3 text-left transition ${active ? "border-primary bg-primary-soft/70 text-primary" : "border-border bg-background hover:bg-secondary/40"}`}><span className="text-xs font-semibold sm:text-sm">{label}</span><span className={`grid min-w-7 place-items-center rounded-full px-2 py-1 text-[10px] font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{count}</span></button>; }
function AdminStatusBadge({ status }: { status: string }) { const variant = status === "cancelado" ? "destructive" : status === "confirmado" || status === "atendido" ? "default" : "secondary"; return <Badge variant={variant as any} className={`shrink-0 rounded-full px-2.5 text-[10px] font-normal ${status === "atendido" ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}`}>{statusLabel(status)}</Badge>; }
function SmallInfo({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="min-w-0"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-0.5 break-words text-xs font-medium ${accent ? "text-primary" : ""}`}>{value}</p></div>; }
function DetailBox({ icon: Icon, label, value }: any) { return <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-4" /></span><div className="min-w-0"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div></div>; }


function ComboServicesManager({ appointment, onRefresh }: any) {
  const [items, setItems] = useState<any[]>(() => appointmentServiceItems(appointment));
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    setItems(appointmentServiceItems(appointment));
  }, [appointment?.id, appointment?.appointment_services]);

  if (items.length <= 1) return null;

  const completed = items.filter((item: any) => item.status === "completed").length;
  const allCompleted = completed === items.length;
  const canManage = appointment.status === "confirmado";

  const toggle = async (item: any) => {
    const isCompleted = item.status === "completed";
    if (isCompleted && !window.confirm(`Desmarcar ${item.service?.name ?? "este serviço"} como concluído?`)) return;
    setBusyId(item.service_id);
    const result = await db.rpc("set_appointment_service_completion", {
      _appointment_id: appointment.id,
      _service_id: item.service_id,
      _completed: !isCompleted,
    });
    setBusyId("");
    if (result.error) {
      toast.error("Não foi possível atualizar o serviço.", { description: result.error.message });
      return;
    }
    const now = new Date().toISOString();
    setItems((current) => current.map((row) => row.service_id === item.service_id ? {
      ...row,
      status: isCompleted ? "pending" : "completed",
      completed_at: isCompleted ? null : (row.completed_at ?? now),
    } : row));
    toast.success(isCompleted ? "Serviço reaberto no combo." : "Serviço concluído no combo.");
    onRefresh?.();
  };

  return (
    <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Serviços do combo</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Conclua cada procedimento separadamente. O financeiro só libera quando todos estiverem feitos.</p>
        </div>
        <Badge variant={allCompleted ? "default" : "secondary"} className={allCompleted ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}>{completed} de {items.length} concluídos</Badge>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${items.length ? (completed / items.length) * 100 : 0}%` }} />
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item: any) => {
          const done = item.status === "completed";
          return (
            <div key={item.service_id} className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${done ? "border-emerald-200 bg-emerald-50/70" : "border-border bg-card"}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{item.service?.name ?? "Serviço"}</strong>
                  <Badge variant={done ? "default" : "outline"} className={done ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}>{done ? "Concluído" : "Pendente"}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatPrice(Number(item.price_snapshot ?? item.service?.price ?? 0))}{done && item.completed_at ? ` · concluído em ${formatDateTime(item.completed_at)}` : ""}</p>
              </div>
              <Button type="button" size="sm" variant={done ? "outline" : "default"} disabled={!canManage || busyId === item.service_id} onClick={() => void toggle(item)} className="shrink-0 rounded-xl">
                <Check className="size-4" /> {busyId === item.service_id ? "Salvando..." : done ? "Desfazer conclusão" : "Marcar como concluído"}
              </Button>
            </div>
          );
        })}
      </div>
      {allCompleted ? <div className="mt-3 rounded-xl bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800">Combo concluído — pronto para finalizar no financeiro.</div> : <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Ainda existem serviços pendentes. O lançamento financeiro do combo permanece bloqueado.</div>}
    </div>
  );
}

function AppointmentPriceEditor({ appointment, onSaved }: any) {
  const total = Number(appointment?.service_price_snapshot ?? appointment?.service?.price ?? 0);
  const [value, setValue] = useState(total.toFixed(2));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setValue(total.toFixed(2)); }, [appointment?.id, total]);
  if (!appointment || (appointment.payment_choice && appointment.payment_choice !== "onsite")) return null;
  const save = async () => {
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) { toast.error("Informe um valor válido para o atendimento."); return; }
    const nextPrice = Math.round((parsed + Number.EPSILON) * 100) / 100;
    setSaving(true);
    const { error } = await db.rpc("update_appointment_custom_price", { _appointment_id: appointment.id, _new_price: nextPrice });
    setSaving(false);
    if (error) { toast.error("Não foi possível alterar o valor.", { description: error.message }); return; }
    setValue(nextPrice.toFixed(2));
    toast.success("Valor do atendimento atualizado.", { description: appointment.status === "atendido" ? "A receita foi recalculada automaticamente." : "A alteração vale somente para este agendamento." });
    onSaved?.(nextPrice);
  };
  return <div className="mt-3 rounded-2xl border border-border bg-background/70 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold">Alterar valor do atendimento</p><p className="mt-0.5 text-[10px] text-muted-foreground">Pode ser ajustado mesmo depois do agendamento, sem alterar o catálogo.</p></div><span className="shrink-0 text-xs font-semibold text-primary">{formatPrice(total)}</span></div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input type="number" min="0" step="0.01" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} disabled={saving} /><Button type="button" className="rounded-xl sm:shrink-0" onClick={() => void save()} disabled={saving}>{saving ? "Salvando..." : "Salvar novo valor"}</Button></div></div>;
}

function AppointmentAdminDialog({ appointment, open, onOpenChange, onConfirm, onCancel, onAttended, onEdit, onPriceSaved, onRefresh, busy }: any) {
  if (!appointment) return null;
  const approved = approvedPayment(appointment);
  const total = Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0);
  const paid = Number(approved?.amount ?? 0);
  const canDecide = appointment.status !== "cancelado" && appointment.status !== "confirmado" && appointment.status !== "atendido" && appointment.status !== "aguardando_pagamento";
  const scheduledMoment = new Date(`${appointment.scheduled_date}T${appointment.scheduled_time}:00`);
  const combo = appointmentComboProgress(appointment);
  const canMarkAttended = !combo.isCombo && appointment.status === "confirmado" && Number.isFinite(scheduledMoment.getTime()) && scheduledMoment.getTime() <= Date.now();
  const days = daysUntilAppointment(appointment.scheduled_date);
  const proximity = appointmentProximity(appointment.scheduled_date);
  const hasWhatsApp = normalizeWhatsAppPhone(appointment.patient_phone).length > 0;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-2xl sm:p-6"><DialogHeader><div className="flex flex-wrap items-center gap-2"><DialogTitle>{appointment.patient_name}</DialogTitle><AdminStatusBadge status={appointment.status} /></div><DialogDescription>{appointmentServiceLabel(appointment)} · {formatDate(appointment.scheduled_date)} às {appointment.scheduled_time}</DialogDescription></DialogHeader>
    {proximity === "urgent" && appointment.status !== "cancelado" ? <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-100 p-3 text-xs font-semibold text-amber-900"><AlertTriangle className="size-4" /> {days === 0 ? "Atendimento hoje" : "Atendimento amanhã — faça o recontato"}</div> : null}
    <div className="mt-2 rounded-2xl bg-primary-soft/60 p-4"><div className="flex items-center gap-2 text-primary"><CreditCard className="size-4" /><p className="text-sm font-semibold">{paymentLabel(appointment)}</p></div><div className="mt-3 grid grid-cols-3 gap-2"><SmallInfo label="Total" value={formatPrice(total)} /><SmallInfo label="Pago" value={formatPrice(paid)} /><SmallInfo label="Restante" value={formatPrice(Number(appointment.balance_amount ?? Math.max(0, total - paid)))} /></div>{approved?.paid_at ? <p className="mt-3 text-[11px] text-muted-foreground">Pagamento confirmado em {formatDateTime(approved.paid_at)}</p> : null}</div>
    <AppointmentPriceEditor appointment={appointment} onSaved={onPriceSaved} />
    <ComboServicesManager appointment={appointment} onRefresh={onRefresh} />
    <div className="mt-4 grid gap-2 sm:grid-cols-2"><DetailBox icon={CalendarDays} label="Data" value={formatDate(appointment.scheduled_date)} /><DetailBox icon={Clock3} label="Horário" value={appointment.scheduled_time} /><DetailBox icon={Stethoscope} label="Profissional" value={appointment.professional?.name ?? "Não definido"} /><DetailBox icon={UserRound} label="Paciente" value={appointment.patient_name} /><DetailBox icon={Phone} label="WhatsApp" value={appointment.patient_phone || "Não informado"} /><DetailBox icon={Mail} label="E-mail" value={appointment.patient_email || "Não informado"} /></div>
    {hasWhatsApp && appointment.status !== "cancelado" ? <div className="mt-4">{proximity === "urgent" ? <Button className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openAppointmentWhatsApp(appointment, "reminder")}><MessageCircle className="size-4" /> {days === 0 ? "Falar com cliente" : "Recontatar cliente"}</Button> : appointment.status === "pendente" ? <Button variant="outline" className="rounded-xl border-emerald-600/40 text-emerald-700" onClick={() => openAppointmentWhatsApp(appointment, "confirmation")}><MessageCircle className="size-4" /> Confirmar pelo WhatsApp</Button> : null}</div> : null}
    {hasWhatsApp && appointment.status === "confirmado" && proximity !== "urgent" ? <div className="mt-4"><Button className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openAppointmentWhatsApp(appointment, "reminder")}><MessageCircle className="size-4" /> Enviar lembrete no WhatsApp</Button></div> : null}
    <div className="mt-4 rounded-2xl border border-border p-4"><div className="grid gap-3 text-xs sm:grid-cols-2"><div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Criado em</p><p className="mt-1 font-medium">{formatDateTime(appointment.created_at)}</p></div><div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Status atualizado</p><p className="mt-1 font-medium">{formatDateTime(appointment.status_updated_at)}</p></div></div>{appointment.notes ? <div className="mt-3 border-t border-border pt-3"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Observações</p><p className="mt-1 text-sm">{appointment.notes}</p></div> : null}</div>
    {appointment.status !== "atendido" && !combo.isCombo ? <div className="mt-4"><Button type="button" variant="outline" className="w-full rounded-xl sm:w-auto" onClick={onEdit}><Pencil className="size-4" /> {appointment.status === "cancelado" ? "Reagendar" : "Editar agendamento"}</Button></div> : null}
    {canDecide ? <DialogFooter className="mt-4 grid grid-cols-2 gap-2 sm:flex"><Button variant="destructive" disabled={busy} onClick={onCancel}><X className="size-4" /> Cancelar</Button><Button disabled={busy} onClick={onConfirm}><Check className="size-4" /> Confirmar manualmente</Button></DialogFooter> : null}
    {canMarkAttended ? <DialogFooter className="mt-4"><Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto" disabled={busy} onClick={onAttended}><Check className="size-4" /> Confirmar atendimento</Button></DialogFooter> : null}
    {appointment.status === "atendido" ? <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-800">Atendimento concluído · receita contabilizada</div> : null}
  </DialogContent></Dialog>;
}

function NewAppointmentAlert({ appointment, open, onLater, onConfirm, onCancel, busy }: any) {
  if (!appointment) return null;
  const hasWhatsApp = normalizeWhatsAppPhone(appointment.patient_phone).length > 0;
  const servicesLabel = appointmentServiceLabel(appointment);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onLater()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[460px] min-w-0 overflow-hidden rounded-3xl p-5 sm:p-6">
        <DialogHeader className="min-w-0 pr-7">
          <span className="mb-2 grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary"><BellRing className="size-5" /></span>
          <DialogTitle>Novo agendamento realizado</DialogTitle>
          <DialogDescription>A profissional ainda precisa confirmar este atendimento.</DialogDescription>
        </DialogHeader>
        <div className="mt-1 min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-secondary/40 p-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{appointment.patient_name}</p>
              <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">{servicesLabel}</p>
            </div>
            <AdminStatusBadge status={appointment.status} />
          </div>
          <div className="mt-3 grid min-w-0 grid-cols-2 gap-3">
            <SmallInfo label="Data" value={formatDate(appointment.scheduled_date)} />
            <SmallInfo label="Horário" value={appointment.scheduled_time} />
            <SmallInfo label="Profissional" value={appointment.professional?.name ?? "—"} />
            <SmallInfo label="Pagamento" value={paymentLabel(appointment)} accent />
          </div>
        </div>
        {hasWhatsApp ? <Button variant="outline" className="mt-1 w-full max-w-full rounded-xl border-emerald-600/40 text-emerald-700" onClick={() => openAppointmentWhatsApp(appointment, "confirmation")}><MessageCircle className="size-4" /> Confirmar pelo WhatsApp</Button> : null}
        <DialogFooter className="mt-1 grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 sm:space-x-0">
          <Button className="w-full" variant="outline" disabled={busy} onClick={onLater}>Depois</Button>
          <Button className="w-full" variant="destructive" disabled={busy} onClick={onCancel}>Cancelar</Button>
          <Button className="w-full" disabled={busy} onClick={onConfirm}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
