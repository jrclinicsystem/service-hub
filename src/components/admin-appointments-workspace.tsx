import {
  BellRing,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  Mail,
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
import { formatDate, formatPrice } from "@/lib/clinic";

const db = supabase as any;

type Scope = "pending" | "accepted" | "history" | "all";

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
  if (status === "confirmado") return "Aceito";
  if (status === "cancelado") return "Cancelado";
  if (status === "aguardando_pagamento") return "Aguardando pagamento";
  return "Pendente";
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
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, ctx.currentTime);
    oscillator.frequency.setValueAtTime(900, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.26);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.27);
  } catch {
    // O popup continua funcionando se o navegador bloquear áudio automático.
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

export function AdminAppointmentsWorkspace({
  appointments,
  onStatusChange,
  onRefresh,
}: {
  appointments: any[];
  onStatusChange: (id: string, status: "pendente" | "confirmado" | "cancelado") => Promise<boolean>;
  onRefresh: () => void;
}) {
  const [scope, setScope] = useState<Scope>("pending");
  const [search, setSearch] = useState("");
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
      toast.success("Novo agendamento realizado", {
        description: `${detail.patient_name} · ${detail.service?.name ?? "Atendimento"} · ${formatDate(detail.scheduled_date)} às ${detail.scheduled_time}`,
      });
    };

    const channel = supabase
      .channel("jrclinic-admin-appointments")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "appointments" }, notify)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "appointments" }, notify)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [onRefresh]);

  const counts = useMemo(() => {
    const today = todayIso();
    return appointments.reduce(
      (result, item) => {
        const futureOrToday = item.scheduled_date >= today;
        if (futureOrToday && (item.status === "pendente" || item.status === "aguardando_pagamento")) result.pending += 1;
        if (futureOrToday && item.status === "confirmado") result.accepted += 1;
        if (!futureOrToday || item.status === "cancelado") result.history += 1;
        result.all += 1;
        return result;
      },
      { pending: 0, accepted: 0, history: 0, all: 0 },
    );
  }, [appointments]);

  const filtered = useMemo(() => {
    const today = todayIso();
    const term = search.trim().toLowerCase();

    return appointments
      .filter((item) => {
        const futureOrToday = item.scheduled_date >= today;
        const pending = futureOrToday && (item.status === "pendente" || item.status === "aguardando_pagamento");
        const accepted = futureOrToday && item.status === "confirmado";
        const history = !futureOrToday || item.status === "cancelado";

        if (scope === "pending" && !pending) return false;
        if (scope === "accepted" && !accepted) return false;
        if (scope === "history" && !history) return false;

        if (!term) return true;
        return [item.patient_name, item.patient_email, item.patient_phone, item.service?.name, item.professional?.name]
          .some((value) => String(value ?? "").toLowerCase().includes(term));
      })
      .sort((a, b) => {
        const left = `${a.scheduled_date} ${a.scheduled_time}`;
        const right = `${b.scheduled_date} ${b.scheduled_time}`;
        return scope === "history" ? right.localeCompare(left) : left.localeCompare(right);
      });
  }, [appointments, scope, search]);

  const act = async (appointment: any, status: "confirmado" | "cancelado") => {
    setBusyAction(true);
    const ok = await onStatusChange(appointment.id, status);
    setBusyAction(false);
    if (!ok) return;
    setIncoming(null);
    setSelected((current: any) => current?.id === appointment.id ? { ...current, status } : current);
    if (status === "confirmado") setScope("accepted");
  };

  const removeAppointment = async (appointment: any) => {
    const confirmed = window.confirm(`Apagar o agendamento de ${appointment.patient_name}? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    setDeletingId(appointment.id);
    const { error } = await db.from("appointments").delete().eq("id", appointment.id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }

    if (selected?.id === appointment.id) setSelected(null);
    if (incoming?.id === appointment.id) setIncoming(null);
    toast.success("Agendamento apagado.");
    onRefresh();
  };

  return (
    <section>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Agendamentos</h2>
            <p className="mt-1 text-xs text-muted-foreground">Separe rapidamente o que ainda precisa de decisão do que já foi aceito.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
            <Button type="button" className="h-10 shrink-0 rounded-xl" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Novo agendamento
            </Button>
            <div className="relative w-full sm:min-w-[280px] xl:w-[340px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Paciente, serviço, profissional..." className="h-10 rounded-xl pl-9" />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <CategoryButton active={scope === "pending"} label="Pendentes" count={counts.pending} onClick={() => setScope("pending")} />
          <CategoryButton active={scope === "accepted"} label="Aceitos" count={counts.accepted} onClick={() => setScope("accepted")} />
          <CategoryButton active={scope === "history"} label="Histórico" count={counts.history} onClick={() => setScope("history")} />
          <CategoryButton active={scope === "all"} label="Todos" count={counts.all} onClick={() => setScope("all")} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center lg:col-span-2 2xl:col-span-3">
            <CalendarDays className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Nenhum agendamento nesta categoria.</p>
          </div>
        ) : filtered.map((appointment) => (
          <article
            key={appointment.id}
            className="rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition hover:border-primary/30 hover:shadow-md"
          >
            <button type="button" onClick={() => setSelected(appointment)} className="block w-full text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{appointment.patient_name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{appointment.patient_email || "Sem e-mail"}</p>
                </div>
                <AdminStatusBadge status={appointment.status} />
              </div>

              <div className="mt-3 rounded-xl bg-secondary/45 p-3">
                <p className="truncate text-sm font-medium">{appointment.service?.name ?? "Atendimento"}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{appointment.professional?.name ?? "Profissional não definido"} · {appointment.professional?.specialty ?? "Equipe"}</p>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <SmallInfo label="Data" value={formatDate(appointment.scheduled_date)} />
                <SmallInfo label="Horário" value={appointment.scheduled_time} />
                <SmallInfo label="Pagamento" value={paymentLabel(appointment)} accent />
              </div>
            </button>

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
              <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{appointment.patient_phone || "Sem telefone"}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => removeAppointment(appointment)}
                disabled={deletingId === appointment.id}
                title="Apagar agendamento"
                aria-label="Apagar agendamento"
              >
                <Trash2 className="size-3.5" />
              </Button>
              <button type="button" onClick={() => setSelected(appointment)} className="shrink-0 text-xs font-semibold text-primary hover:underline">
                {formatPrice(Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0))} · Detalhes →
              </button>
            </div>
          </article>
        ))}
      </div>

      <CreateAppointmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          setScope("accepted");
          onRefresh();
        }}
      />

      <AppointmentAdminDialog
        appointment={selected}
        open={Boolean(selected)}
        onOpenChange={(open: boolean) => !open && setSelected(null)}
        onConfirm={() => selected && act(selected, "confirmado")}
        onCancel={() => selected && act(selected, "cancelado")}
        busy={busyAction}
      />

      <NewAppointmentAlert
        appointment={incoming}
        open={Boolean(incoming)}
        onLater={() => setIncoming(null)}
        onConfirm={() => incoming && act(incoming, "confirmado")}
        onCancel={() => incoming && act(incoming, "cancelado")}
        busy={busyAction}
      />
    </section>
  );
}

function CreateAppointmentDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState<any[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
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
      db.from("time_slots").select("id, slot, is_available, sort_order").eq("is_available", true).order("sort_order"),
    ]).then(([serviceResult, professionalResult, linkResult, slotResult]) => {
      if (!active) return;
      const firstError = [serviceResult, professionalResult, linkResult, slotResult].find((result) => result.error)?.error;
      if (firstError) {
        toast.error(firstError.message);
      } else {
        setServices(serviceResult.data ?? []);
        setProfessionals(professionalResult.data ?? []);
        setLinks(linkResult.data ?? []);
        setTimeSlots(slotResult.data ?? []);
      }
      setLoadingCatalog(false);
    });
    return () => { active = false; };
  }, [open]);

  const availableProfessionals = useMemo(() => {
    if (!serviceId) return [];
    const allowed = new Set(links.filter((link) => link.service_id === serviceId).map((link) => link.professional_id));
    return professionals.filter((professional) => allowed.has(professional.id));
  }, [serviceId, links, professionals]);

  const reset = () => {
    setPatientName("");
    setPatientEmail("");
    setPatientPhone("");
    setServiceId("");
    setProfessionalId("");
    setScheduledDate(todayIso());
    setScheduledTime("");
    setNotes("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !saving) reset();
    onOpenChange(next);
  };

  const createAppointment = async () => {
    if (!patientName.trim()) return toast.error("Informe o nome do cliente.");
    if (!serviceId) return toast.error("Selecione o serviço.");
    if (!professionalId) return toast.error("Selecione o profissional.");
    if (!scheduledDate) return toast.error("Selecione a data.");
    if (scheduledDate < todayIso()) return toast.error("A data do agendamento não pode estar no passado.");
    if (!scheduledTime) return toast.error("Selecione o horário.");

    const validLink = links.some((link) => link.service_id === serviceId && link.professional_id === professionalId);
    if (!validLink) return toast.error("Esse profissional não atende o serviço selecionado.");

    const service = services.find((item) => item.id === serviceId);
    if (!service) return toast.error("Serviço não encontrado.");
    const total = Number(service.price ?? 0);

    setSaving(true);
    const conflict = await db
      .from("appointments")
      .select("id")
      .eq("professional_id", professionalId)
      .eq("scheduled_date", scheduledDate)
      .eq("scheduled_time", scheduledTime)
      .neq("status", "cancelado")
      .limit(1)
      .maybeSingle();

    if (conflict.error) {
      setSaving(false);
      toast.error(conflict.error.message);
      return;
    }
    if (conflict.data) {
      setSaving(false);
      toast.error("Este profissional já possui um agendamento nesse horário.");
      return;
    }

    const { error } = await db.from("appointments").insert({
      user_id: null,
      service_id: serviceId,
      professional_id: professionalId,
      patient_name: patientName.trim(),
      patient_email: patientEmail.trim(),
      patient_phone: patientPhone.trim(),
      notes: notes.trim(),
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      status: "confirmado",
      payment_choice: "onsite",
      service_price_snapshot: total,
      deposit_percent: 0,
      deposit_amount: 0,
      balance_amount: total,
    });

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Agendamento criado e confirmado.", {
      description: `${patientName.trim()} · ${service.name} · ${formatDate(scheduledDate)} às ${scheduledTime}`,
    });
    reset();
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>Novo agendamento</DialogTitle>
          <DialogDescription>Crie um agendamento diretamente pela clínica. Ele será registrado como confirmado e com pagamento presencial.</DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="admin-patient-name">Nome do cliente *</Label>
            <Input id="admin-patient-name" value={patientName} onChange={(event) => setPatientName(event.target.value)} placeholder="Nome completo" disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-patient-phone">Telefone</Label>
            <Input id="admin-patient-phone" value={patientPhone} onChange={(event) => setPatientPhone(event.target.value)} placeholder="(85) 99999-9999" disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-patient-email">E-mail</Label>
            <Input id="admin-patient-email" type="email" value={patientEmail} onChange={(event) => setPatientEmail(event.target.value)} placeholder="cliente@email.com" disabled={saving} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Serviço *</Label>
            <Select value={serviceId} onValueChange={(value) => { setServiceId(value); setProfessionalId(""); }} disabled={saving || loadingCatalog}>
              <SelectTrigger><SelectValue placeholder={loadingCatalog ? "Carregando serviços..." : "Selecione o serviço"} /></SelectTrigger>
              <SelectContent>
                {services.map((service) => <SelectItem key={service.id} value={service.id}>{service.name} · {formatPrice(Number(service.price ?? 0))}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Profissional *</Label>
            <Select value={professionalId} onValueChange={setProfessionalId} disabled={saving || !serviceId || availableProfessionals.length === 0}>
              <SelectTrigger><SelectValue placeholder={!serviceId ? "Escolha primeiro o serviço" : availableProfessionals.length === 0 ? "Nenhum profissional vinculado" : "Selecione o profissional"} /></SelectTrigger>
              <SelectContent>
                {availableProfessionals.map((professional) => <SelectItem key={professional.id} value={professional.id}>{professional.name}{professional.specialty ? ` · ${professional.specialty}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-scheduled-date">Data *</Label>
            <Input id="admin-scheduled-date" type="date" min={todayIso()} value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label>Horário *</Label>
            <Select value={scheduledTime} onValueChange={setScheduledTime} disabled={saving || loadingCatalog}>
              <SelectTrigger><SelectValue placeholder="Selecione o horário" /></SelectTrigger>
              <SelectContent>
                {timeSlots.map((slot) => <SelectItem key={slot.id} value={slot.slot}>{slot.slot}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="admin-notes">Observações</Label>
            <Textarea id="admin-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Informações importantes para o atendimento..." className="min-h-24" disabled={saving} />
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-primary-soft/60 p-3 text-xs text-muted-foreground">
          O agendamento criado pelo painel entra diretamente em <strong className="text-foreground">Aceitos</strong>. O valor fica registrado integralmente como saldo para pagamento presencial.
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={createAppointment} disabled={saving || loadingCatalog}>{saving ? "Salvando..." : "Criar agendamento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[54px] items-center justify-between rounded-xl border px-3 text-left transition ${active ? "border-primary bg-primary-soft/70 text-primary" : "border-border bg-background hover:bg-secondary/40"}`}
    >
      <span className="text-xs font-semibold sm:text-sm">{label}</span>
      <span className={`grid min-w-7 place-items-center rounded-full px-2 py-1 text-[10px] font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{count}</span>
    </button>
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
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-4" /></span>
      <div className="min-w-0"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div>
    </div>
  );
}

function AppointmentAdminDialog({ appointment, open, onOpenChange, onConfirm, onCancel, busy }: any) {
  if (!appointment) return null;
  const approved = approvedPayment(appointment);
  const total = Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0);
  const paid = Number(approved?.amount ?? 0);
  const canDecide = appointment.status !== "cancelado" && appointment.status !== "confirmado" && appointment.status !== "aguardando_pagamento";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2"><DialogTitle>{appointment.patient_name}</DialogTitle><AdminStatusBadge status={appointment.status} /></div>
          <DialogDescription>{appointment.service?.name ?? "Atendimento"} · {formatDate(appointment.scheduled_date)} às {appointment.scheduled_time}</DialogDescription>
        </DialogHeader>

        <div className="mt-2 rounded-2xl bg-primary-soft/60 p-4">
          <div className="flex items-center gap-2 text-primary"><CreditCard className="size-4" /><p className="text-sm font-semibold">{paymentLabel(appointment)}</p></div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <SmallInfo label="Total" value={formatPrice(total)} />
            <SmallInfo label="Pago" value={formatPrice(paid)} />
            <SmallInfo label="Restante" value={formatPrice(Number(appointment.balance_amount ?? Math.max(0, total - paid)))} />
          </div>
          {approved?.paid_at ? <p className="mt-3 text-[11px] text-muted-foreground">Pagamento confirmado em {formatDateTime(approved.paid_at)} · {approved.payment_method_id || approved.provider || "InfinitePay"}</p> : appointment.payment_choice === "onsite" ? <p className="mt-3 text-[11px] text-muted-foreground">Pagamento integral previsto para ser negociado e realizado presencialmente.</p> : null}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <DetailBox icon={CalendarDays} label="Data do atendimento" value={formatDate(appointment.scheduled_date)} />
          <DetailBox icon={Clock3} label="Horário" value={appointment.scheduled_time} />
          <DetailBox icon={Stethoscope} label="Profissional" value={`${appointment.professional?.name ?? "Não definido"}${appointment.professional?.specialty ? ` · ${appointment.professional.specialty}` : ""}`} />
          <DetailBox icon={UserRound} label="Paciente" value={appointment.patient_name} />
          <DetailBox icon={Phone} label="Telefone" value={appointment.patient_phone || "Não informado"} />
          <DetailBox icon={Mail} label="E-mail" value={appointment.patient_email || "Não informado"} />
        </div>

        <div className="mt-4 rounded-2xl border border-border p-4">
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Agendamento criado em</p><p className="mt-1 font-medium">{formatDateTime(appointment.created_at)}</p></div>
            <div><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Última alteração de status</p><p className="mt-1 font-medium">{formatDateTime(appointment.status_updated_at)}</p></div>
          </div>
          {appointment.notes ? <div className="mt-3 border-t border-border pt-3"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Observações</p><p className="mt-1 text-sm leading-relaxed">{appointment.notes}</p></div> : null}
        </div>

        {canDecide ? (
          <DialogFooter className="mt-4 grid grid-cols-2 gap-2 sm:flex">
            <Button variant="destructive" disabled={busy} onClick={onCancel}><X className="size-4" /> Recusar</Button>
            <Button disabled={busy} onClick={onConfirm}><Check className="size-4" /> Confirmar</Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NewAppointmentAlert({ appointment, open, onLater, onConfirm, onCancel, busy }: any) {
  if (!appointment) return null;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onLater()}>
      <DialogContent className="w-[calc(100%-1rem)] rounded-3xl p-5 sm:max-w-md sm:p-6">
        <DialogHeader>
          <span className="mb-2 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary"><BellRing className="size-5" /></span>
          <DialogTitle>Novo agendamento realizado</DialogTitle>
          <DialogDescription>Confira os dados e decida agora ou deixe para confirmar depois.</DialogDescription>
        </DialogHeader>

        <div className="mt-2 rounded-2xl border border-border bg-secondary/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="truncate font-semibold">{appointment.patient_name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{appointment.service?.name ?? "Atendimento"}</p></div>
            <AdminStatusBadge status={appointment.status} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2"><SmallInfo label="Data" value={formatDate(appointment.scheduled_date)} /><SmallInfo label="Horário" value={appointment.scheduled_time} /><SmallInfo label="Profissional" value={appointment.professional?.name ?? "—"} /><SmallInfo label="Pagamento" value={paymentLabel(appointment)} accent /></div>
        </div>

        <DialogFooter className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:space-x-0">
          <Button variant="outline" disabled={busy} onClick={onLater}>Depois</Button>
          <Button variant="destructive" disabled={busy} onClick={onCancel}>Recusar</Button>
          <Button disabled={busy} onClick={onConfirm}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
