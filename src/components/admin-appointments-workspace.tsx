import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  Mail,
  MessageCircle,
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
  const { data, error } = await db.from("appointments").select("id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, created_at, status_updated_at, payment_choice, service_price_snapshot, deposit_percent, deposit_amount, balance_amount, service:services(name, price, duration_min), professional:professionals(name, specialty), payments(status, amount, kind, payment_method_id, provider, paid_at, created_at, status_detail)").eq("id", id).maybeSingle();
  if (error) return null;
  return data;
}

function openAppointmentWhatsApp(appointment: any, kind: "confirmation" | "reminder") {
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
      playNotificationSound(audioRef);
      setIncoming(detail);
      toast.success("Novo agendamento realizado", { description: `${detail.patient_name} · ${detail.service?.name ?? "Atendimento"} · ${formatDate(detail.scheduled_date)} às ${detail.scheduled_time}` });
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
    if (!window.confirm(`Apagar o agendamento de ${appointment.patient_name}? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(appointment.id);
    const { error } = await db.from("appointments").delete().eq("id", appointment.id);
    setDeletingId(null);
    if (error) { toast.error(error.message); return; }
    if (selected?.id === appointment.id) setSelected(null);
    if (incoming?.id === appointment.id) setIncoming(null);
    toast.success("Agendamento apagado.");
    onRefresh();
  };

  return (
    <section>
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(360px,560px)_minmax(0,1fr)]">
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

      <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div><h2 className="text-lg font-semibold">Agendamentos</h2><p className="mt-1 text-xs text-muted-foreground">Pendências, confirmações e recontatos ficam centralizados aqui.</p></div>
          <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
            <Button type="button" className="h-10 shrink-0 rounded-xl" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Novo agendamento</Button>
            <div className="relative w-full sm:min-w-[280px] xl:w-[340px]"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Paciente, serviço, profissional..." className="h-10 rounded-xl pl-9" /></div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><CategoryButton active={scope === "pending"} label="Pendentes" count={counts.pending} onClick={() => setScope("pending")} /><CategoryButton active={scope === "accepted"} label="Confirmados" count={counts.accepted} onClick={() => setScope("accepted")} /><CategoryButton active={scope === "history"} label="Histórico" count={counts.history} onClick={() => setScope("history")} /><CategoryButton active={scope === "all"} label="Todos" count={counts.all} onClick={() => setScope("all")} /></div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center lg:col-span-2 2xl:col-span-3"><CalendarDays className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">Nenhum agendamento nesta seleção.</p></div> : filtered.map((appointment) => <AdminAppointmentCard key={appointment.id} appointment={appointment} onOpen={() => setSelected(appointment)} onDelete={() => removeAppointment(appointment)} onAttended={() => completeAttendance(appointment)} deleting={deletingId === appointment.id} />)}
      </div>

      <CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => { setCreateOpen(false); setScope("pending"); onRefresh(); }} />
      <CalendarDayDialog date={calendarDayOpen} appointments={appointments} open={Boolean(calendarDayOpen)} onOpenChange={(open) => { if (!open) setCalendarDayOpen(null); }} />
      <AppointmentAdminDialog appointment={selected} open={Boolean(selected)} onOpenChange={(open: boolean) => !open && setSelected(null)} onConfirm={() => selected && act(selected, "confirmado")} onCancel={() => selected && act(selected, "cancelado")} onAttended={() => selected && completeAttendance(selected)} busy={busyAction} />
      <NewAppointmentAlert appointment={incoming} open={Boolean(incoming)} onLater={() => setIncoming(null)} onConfirm={() => incoming && act(incoming, "confirmado")} onCancel={() => incoming && act(incoming, "cancelado")} busy={busyAction} />
    </section>
  );
}

function AdminAppointmentCard({ appointment, onOpen, onDelete, onAttended, deleting }: any) {
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const proximity = appointment.status === "cancelado" ? "past" : appointmentProximity(appointment.scheduled_date);
  const days = daysUntilAppointment(appointment.scheduled_date);
  const hasWhatsApp = normalizeWhatsAppPhone(appointment.patient_phone).length > 0;
  const scheduledMoment = new Date(`${appointment.scheduled_date}T${appointment.scheduled_time}:00`);
  const canMarkAttended = appointment.status === "confirmado" && Number.isFinite(scheduledMoment.getTime()) && scheduledMoment.getTime() <= Date.now();
  const cardClass = proximity === "urgent" ? "border-amber-500/60 bg-amber-50/70 shadow-md" : proximity === "soon" ? "border-amber-300/60 bg-amber-50/35" : "border-border bg-card";
  return <article className={`rounded-2xl border p-4 text-left shadow-soft transition hover:shadow-md ${cardClass}`}>
    {proximity === "urgent" && appointment.status !== "cancelado" ? <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900"><AlertTriangle className="size-4" /> {days === 0 ? "Atendimento hoje" : "Atendimento amanhã — recontato recomendado"}</div> : proximity === "soon" ? <div className="mb-3 rounded-xl bg-amber-100/60 px-3 py-2 text-[11px] font-medium text-amber-900">Faltam {days} dias para este atendimento.</div> : null}
    <button type="button" onClick={onOpen} className="block w-full text-left">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-base font-semibold">{appointment.patient_name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{appointment.patient_email || "Sem e-mail"}</p></div><AdminStatusBadge status={appointment.status} /></div>
      <div className="mt-3 rounded-xl bg-secondary/45 p-3"><p className="truncate text-sm font-medium">{appointment.service?.name ?? "Atendimento"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{appointment.professional?.name ?? "Profissional não definido"} · {appointment.professional?.specialty ?? "Equipe"}</p></div>
      <div className="mt-3 grid grid-cols-3 gap-2"><SmallInfo label="Data" value={formatDate(appointment.scheduled_date)} /><SmallInfo label="Horário" value={appointment.scheduled_time} /><SmallInfo label="Pagamento" value={paymentLabel(appointment)} accent /></div>
    </button>
    {hasWhatsApp && appointment.status !== "cancelado" ? <div className="mt-3">{proximity === "urgent" ? <Button type="button" size="sm" className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openAppointmentWhatsApp(appointment, "reminder")}><MessageCircle className="size-4" /> {days === 0 ? "Falar com cliente" : "Recontatar cliente"}</Button> : appointment.status === "pendente" ? <Button type="button" size="sm" variant="outline" className="rounded-xl border-emerald-600/40 text-emerald-700 hover:bg-emerald-50" onClick={() => openAppointmentWhatsApp(appointment, "confirmation")}><MessageCircle className="size-4" /> Confirmar pelo WhatsApp</Button> : null}</div> : null}
    {canMarkAttended ? <div className="mt-3"><Button type="button" size="sm" className="w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" disabled={attendanceBusy} onClick={async () => { setAttendanceBusy(true); await onAttended?.(); setAttendanceBusy(false); }}><Check className="size-4" /> {attendanceBusy ? "Confirmando atendimento..." : "Confirmar atendimento"}</Button></div> : null}
    {appointment.status === "atendido" ? <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-[11px] font-semibold text-emerald-800">Atendido · valor já contabilizado na receita</div> : null}
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3"><p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{appointment.patient_phone || "Sem telefone"}</p><Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={onDelete} disabled={deleting} title="Apagar agendamento"><Trash2 className="size-3.5" /></Button><button type="button" onClick={onOpen} className="shrink-0 text-xs font-semibold text-primary hover:underline">{formatPrice(Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0))} · Detalhes →</button></div>
  </article>;
}

function CreateAppointmentDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState<any[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [bookingSlots, setBookingSlots] = useState<any[]>([]);
  const [bookingSlotsLoading, setBookingSlotsLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
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
    let cancelled = false;
    setScheduledTime("");

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
          setBookingSlots((data ?? []).filter((slot: any) => slot.is_available));
        }
        setBookingSlotsLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, professionalId, scheduledDate]);

  const availableProfessionals = useMemo(() => {
    if (!serviceId) return [];
    const allowed = new Set(links.filter((link) => link.service_id === serviceId).map((link) => link.professional_id));
    return professionals.filter((professional) => allowed.has(professional.id));
  }, [serviceId, links, professionals]);


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

  const reset = () => { setSelectedClientId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setServiceId(""); setProfessionalId(""); setScheduledDate(todayIso()); setScheduledTime(""); setNotes(""); };
  const handleOpenChange = (next: boolean) => { if (!next && !saving) reset(); onOpenChange(next); };

  const createAppointment = async () => {
    if (!patientName.trim()) { toast.error("Informe o nome do cliente."); return; }
    if (!serviceId) { toast.error("Selecione o serviço."); return; }
    if (!professionalId) { toast.error("Selecione o profissional."); return; }
    if (!scheduledDate || scheduledDate < todayIso()) { toast.error("Selecione uma data válida."); return; }
    if (!scheduledTime) { toast.error("Selecione o horário."); return; }
    const validLink = links.some((link) => link.service_id === serviceId && link.professional_id === professionalId);
    if (!validLink) { toast.error("Esse profissional não atende o serviço selecionado."); return; }
    const service = services.find((item) => item.id === serviceId);
    if (!service) { toast.error("Serviço não encontrado."); return; }
    const total = Number(service.price ?? 0);
    setSaving(true);
    const conflict = await db.from("appointments").select("id").eq("professional_id", professionalId).eq("scheduled_date", scheduledDate).eq("scheduled_time", scheduledTime).neq("status", "cancelado").limit(1).maybeSingle();
    if (conflict.error) { setSaving(false); toast.error(conflict.error.message); return; }
    if (conflict.data) { setSaving(false); toast.error("Este profissional já possui um agendamento nesse horário."); return; }
    const { error } = await db.from("appointments").insert({ user_id: null, client_id: selectedClientId || null, service_id: serviceId, professional_id: professionalId, patient_name: patientName.trim(), patient_email: patientEmail.trim(), patient_phone: patientPhone.trim(), notes: notes.trim(), scheduled_date: scheduledDate, scheduled_time: scheduledTime, status: "pendente", payment_choice: "onsite", service_price_snapshot: total, deposit_percent: 0, deposit_amount: 0, balance_amount: total });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Agendamento enviado para confirmação da profissional.", { description: `${patientName.trim()} · ${service.name} · ${formatDate(scheduledDate)} às ${scheduledTime}` });
    reset(); onCreated();
  };

  return <Dialog open={open} onOpenChange={handleOpenChange}><DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-2xl sm:p-6"><DialogHeader><DialogTitle>Novo agendamento</DialogTitle><DialogDescription>O agendamento será criado como aguardando confirmação da profissional e com pagamento presencial.</DialogDescription></DialogHeader><div className="mt-2 grid gap-4 sm:grid-cols-2">
    <div className="space-y-1.5 sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
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
    <div className="space-y-1.5 sm:col-span-2"><Label>Serviço *</Label><Select value={serviceId} onValueChange={(value) => { setServiceId(value); setProfessionalId(""); }} disabled={saving || loadingCatalog}><SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{services.map((service) => <SelectItem key={service.id} value={service.id}>{service.name} · {formatPrice(Number(service.price ?? 0))}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1.5 sm:col-span-2"><Label>Profissional *</Label><Select value={professionalId} onValueChange={setProfessionalId} disabled={saving || !serviceId || availableProfessionals.length === 0}><SelectTrigger><SelectValue placeholder={!serviceId ? "Escolha primeiro o serviço" : "Selecione o profissional"} /></SelectTrigger><SelectContent>{availableProfessionals.map((professional) => <SelectItem key={professional.id} value={professional.id}>{professional.name}{professional.specialty ? ` · ${professional.specialty}` : ""}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1.5"><Label htmlFor="admin-scheduled-date">Data *</Label><Input id="admin-scheduled-date" type="date" min={todayIso()} value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} disabled={saving} /></div>
    <div className="space-y-1.5"><Label>Horário *</Label><Select value={scheduledTime} onValueChange={setScheduledTime} disabled={saving || loadingCatalog || bookingSlotsLoading || !professionalId || !scheduledDate}><SelectTrigger><SelectValue placeholder={bookingSlotsLoading ? "Carregando horários..." : bookingSlots.length ? "Selecione o horário" : "Sem horários disponíveis"} /></SelectTrigger><SelectContent>{bookingSlots.map((slot) => <SelectItem key={`${slot.slot}-${slot.source ?? "slot"}`} value={slot.slot}>{slot.slot}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="admin-notes">Observações</Label><Textarea id="admin-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-24" disabled={saving} /></div>
  </div><div className="mt-4 rounded-2xl bg-primary-soft/60 p-3 text-xs text-muted-foreground">Depois de criado, o card ficará em <strong className="text-foreground">Aguardando profissional</strong> até a colaboradora confirmar ou recusar.</div><DialogFooter className="mt-4 gap-2 sm:gap-0"><Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancelar</Button><Button onClick={createAppointment} disabled={saving || loadingCatalog}>{saving ? "Salvando..." : "Criar agendamento"}</Button></DialogFooter></DialogContent></Dialog>;
}

function CategoryButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) { return <button type="button" onClick={onClick} className={`flex min-h-[54px] items-center justify-between rounded-xl border px-3 text-left transition ${active ? "border-primary bg-primary-soft/70 text-primary" : "border-border bg-background hover:bg-secondary/40"}`}><span className="text-xs font-semibold sm:text-sm">{label}</span><span className={`grid min-w-7 place-items-center rounded-full px-2 py-1 text-[10px] font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{count}</span></button>; }
function AdminStatusBadge({ status }: { status: string }) { const variant = status === "cancelado" ? "destructive" : status === "confirmado" || status === "atendido" ? "default" : "secondary"; return <Badge variant={variant as any} className={`shrink-0 rounded-full px-2.5 text-[10px] font-normal ${status === "atendido" ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}`}>{statusLabel(status)}</Badge>; }
function SmallInfo({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="min-w-0"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-0.5 truncate text-xs font-medium ${accent ? "text-primary" : ""}`}>{value}</p></div>; }
function DetailBox({ icon: Icon, label, value }: any) { return <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-4" /></span><div className="min-w-0"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div></div>; }

function AppointmentAdminDialog({ appointment, open, onOpenChange, onConfirm, onCancel, onAttended, busy }: any) {
  if (!appointment) return null;
  const approved = approvedPayment(appointment);
  const total = Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0);
  const paid = Number(approved?.amount ?? 0);
  const canDecide = appointment.status !== "cancelado" && appointment.status !== "confirmado" && appointment.status !== "atendido" && appointment.status !== "aguardando_pagamento";
  const scheduledMoment = new Date(`${appointment.scheduled_date}T${appointment.scheduled_time}:00`);
  const canMarkAttended = appointment.status === "confirmado" && Number.isFinite(scheduledMoment.getTime()) && scheduledMoment.getTime() <= Date.now();
  const days = daysUntilAppointment(appointment.scheduled_date);
  const proximity = appointmentProximity(appointment.scheduled_date);
  const hasWhatsApp = normalizeWhatsAppPhone(appointment.patient_phone).length > 0;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-2xl sm:p-6"><DialogHeader><div className="flex flex-wrap items-center gap-2"><DialogTitle>{appointment.patient_name}</DialogTitle><AdminStatusBadge status={appointment.status} /></div><DialogDescription>{appointment.service?.name ?? "Atendimento"} · {formatDate(appointment.scheduled_date)} às {appointment.scheduled_time}</DialogDescription></DialogHeader>
    {proximity === "urgent" && appointment.status !== "cancelado" ? <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-100 p-3 text-xs font-semibold text-amber-900"><AlertTriangle className="size-4" /> {days === 0 ? "Atendimento hoje" : "Atendimento amanhã — faça o recontato"}</div> : null}
    <div className="mt-2 rounded-2xl bg-primary-soft/60 p-4"><div className="flex items-center gap-2 text-primary"><CreditCard className="size-4" /><p className="text-sm font-semibold">{paymentLabel(appointment)}</p></div><div className="mt-3 grid grid-cols-3 gap-2"><SmallInfo label="Total" value={formatPrice(total)} /><SmallInfo label="Pago" value={formatPrice(paid)} /><SmallInfo label="Restante" value={formatPrice(Number(appointment.balance_amount ?? Math.max(0, total - paid)))} /></div>{approved?.paid_at ? <p className="mt-3 text-[11px] text-muted-foreground">Pagamento confirmado em {formatDateTime(approved.paid_at)}</p> : null}</div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2"><DetailBox icon={CalendarDays} label="Data" value={formatDate(appointment.scheduled_date)} /><DetailBox icon={Clock3} label="Horário" value={appointment.scheduled_time} /><DetailBox icon={Stethoscope} label="Profissional" value={appointment.professional?.name ?? "Não definido"} /><DetailBox icon={UserRound} label="Paciente" value={appointment.patient_name} /><DetailBox icon={Phone} label="WhatsApp" value={appointment.patient_phone || "Não informado"} /><DetailBox icon={Mail} label="E-mail" value={appointment.patient_email || "Não informado"} /></div>
    {hasWhatsApp && appointment.status !== "cancelado" ? <div className="mt-4">{proximity === "urgent" ? <Button className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openAppointmentWhatsApp(appointment, "reminder")}><MessageCircle className="size-4" /> {days === 0 ? "Falar com cliente" : "Recontatar cliente"}</Button> : appointment.status === "pendente" ? <Button variant="outline" className="rounded-xl border-emerald-600/40 text-emerald-700" onClick={() => openAppointmentWhatsApp(appointment, "confirmation")}><MessageCircle className="size-4" /> Confirmar pelo WhatsApp</Button> : null}</div> : null}
    <div className="mt-4 rounded-2xl border border-border p-4"><div className="grid gap-3 text-xs sm:grid-cols-2"><div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Criado em</p><p className="mt-1 font-medium">{formatDateTime(appointment.created_at)}</p></div><div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Status atualizado</p><p className="mt-1 font-medium">{formatDateTime(appointment.status_updated_at)}</p></div></div>{appointment.notes ? <div className="mt-3 border-t border-border pt-3"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Observações</p><p className="mt-1 text-sm">{appointment.notes}</p></div> : null}</div>
    {canDecide ? <DialogFooter className="mt-4 grid grid-cols-2 gap-2 sm:flex"><Button variant="destructive" disabled={busy} onClick={onCancel}><X className="size-4" /> Cancelar</Button><Button disabled={busy} onClick={onConfirm}><Check className="size-4" /> Confirmar manualmente</Button></DialogFooter> : null}
    {canMarkAttended ? <DialogFooter className="mt-4"><Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto" disabled={busy} onClick={onAttended}><Check className="size-4" /> Confirmar atendimento</Button></DialogFooter> : null}
    {appointment.status === "atendido" ? <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-800">Atendimento concluído · receita contabilizada</div> : null}
  </DialogContent></Dialog>;
}

function NewAppointmentAlert({ appointment, open, onLater, onConfirm, onCancel, busy }: any) {
  if (!appointment) return null;
  const hasWhatsApp = normalizeWhatsAppPhone(appointment.patient_phone).length > 0;
  return <Dialog open={open} onOpenChange={(next) => !next && onLater()}><DialogContent className="w-[calc(100%-1rem)] rounded-3xl p-5 sm:max-w-md sm:p-6"><DialogHeader><span className="mb-2 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary"><BellRing className="size-5" /></span><DialogTitle>Novo agendamento realizado</DialogTitle><DialogDescription>A profissional ainda precisa confirmar este atendimento.</DialogDescription></DialogHeader><div className="mt-2 rounded-2xl border border-border bg-secondary/40 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{appointment.patient_name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{appointment.service?.name ?? "Atendimento"}</p></div><AdminStatusBadge status={appointment.status} /></div><div className="mt-3 grid grid-cols-2 gap-2"><SmallInfo label="Data" value={formatDate(appointment.scheduled_date)} /><SmallInfo label="Horário" value={appointment.scheduled_time} /><SmallInfo label="Profissional" value={appointment.professional?.name ?? "—"} /><SmallInfo label="Pagamento" value={paymentLabel(appointment)} accent /></div></div>{hasWhatsApp ? <Button variant="outline" className="mt-3 w-full rounded-xl border-emerald-600/40 text-emerald-700" onClick={() => openAppointmentWhatsApp(appointment, "confirmation")}><MessageCircle className="size-4" /> Confirmar pelo WhatsApp</Button> : null}<DialogFooter className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:space-x-0"><Button variant="outline" disabled={busy} onClick={onLater}>Depois</Button><Button variant="destructive" disabled={busy} onClick={onCancel}>Cancelar</Button><Button disabled={busy} onClick={onConfirm}>Confirmar</Button></DialogFooter></DialogContent></Dialog>;
}
