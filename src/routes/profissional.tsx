import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LogOut,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import logo from "@/assets/jr-clinic-logo.png";
import { AppointmentCalendar } from "@/components/appointment-calendar";
import { ProfessionalClientBookingTools } from "@/components/professional-client-booking-tools";
import { ProfessionalWeeklySchedule } from "@/components/professional-weekly-schedule";
import { ProfessionalDateAvailability } from "@/components/professional-date-availability";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  appointmentProximity,
  appointmentWhatsAppUrl,
  daysUntilAppointment,
  normalizeWhatsAppPhone,
} from "@/lib/appointment-contact";
import { formatDate, formatPrice } from "@/lib/clinic";

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

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "JR";
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
    oscillator.frequency.setValueAtTime(760, ctx.currentTime);
    oscillator.frequency.setValueAtTime(980, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.34);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
  } catch {}
}

async function loadProfessionalAgenda() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");
  const email = (userData.user.email ?? "").trim().toLowerCase();
  if (!email) return { authorized: false as const, email: "" };

  const access = await db.from("professional_access").select("professional_id, email, enabled, professional:professionals(id, name, specialty, avatar_url, is_active, deleted_at)").eq("email", email).eq("enabled", true).maybeSingle();
  if (access.error) throw access.error;
  if (!access.data?.professional_id || !access.data.professional?.is_active || access.data.professional?.deleted_at) return { authorized: false as const, email };

  const [appointments, slots, availability] = await Promise.all([
    db.from("appointments").select("id, professional_id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, service_price_snapshot, balance_amount, service:services(name, price, duration_min), professional_response:appointment_professional_responses(response, responded_at)").eq("professional_id", access.data.professional_id).order("scheduled_date").order("scheduled_time"),
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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [daysOpen, setDaysOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const notifiedIds = useRef(new Set<string>());

  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ["professional-agenda"], queryFn: loadProfessionalAgenda, retry: 1 });
  const appointments = data?.authorized ? data.appointments : [];
  const today = todayIso();
  const filteredAppointments = useMemo(() => appointments.filter((item: any) => (dateFilter ? item.scheduled_date === dateFilter : true) && (scope === "all" ? true : item.scheduled_date >= today)), [appointments, dateFilter, scope, today]);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") setNotificationsEnabled(true);
  }, []);

  useEffect(() => {
    if (!data?.authorized || !data.professional?.id) return;
    const professionalId = data.professional.id;
    const notify = async (payload: any) => {
      const next = payload.new as any;
      if (!next?.id || next.professional_id !== professionalId || next.status !== "pendente" || notifiedIds.current.has(next.id)) return;
      notifiedIds.current.add(next.id);
      await refetch();
      playNotificationSound(audioRef);
      const detailResult = await db.from("appointments").select("id,patient_name,scheduled_date,scheduled_time,service:services(name)").eq("id", next.id).maybeSingle();
      const detail = detailResult.data;
      const description = detail ? `${detail.patient_name} · ${detail.service?.name ?? "Atendimento"} · ${formatDate(detail.scheduled_date)} às ${detail.scheduled_time}` : "Você recebeu um novo agendamento na sua agenda.";
      toast.success("Novo agendamento para confirmar", { description });
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { new Notification("JR Clinic · Novo agendamento", { body: description }); } catch {}
      }
    };
    const channel = supabase
      .channel(`jrclinic-professional-${professionalId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "appointments", filter: `professional_id=eq.${professionalId}` }, notify)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "appointments", filter: `professional_id=eq.${professionalId}` }, notify)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [data?.authorized, data?.professional?.id, refetch]);

  const enableNotifications = async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && !audioRef.current) audioRef.current = new AudioCtx();
      if (audioRef.current?.state === "suspended") await audioRef.current.resume();
      playNotificationSound(audioRef);
      if (typeof Notification === "undefined") {
        setNotificationsEnabled(true);
        toast.success("Som de notificações ativado.");
        return;
      }
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      setNotificationsEnabled(permission === "granted");
      if (permission === "granted") toast.success("Notificações do navegador ativadas.");
      else toast.info("O som foi ativado, mas as notificações do navegador não foram permitidas.");
    } catch {
      toast.error("O navegador não permitiu ativar o áudio de notificações.");
    }
  };

  const uploadPhoto = async (file?: File) => {
    if (!file || !data?.authorized) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast.error("Use uma imagem JPG, PNG ou WebP."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("A foto deve ter no máximo 5 MB."); return; }
    setUploadingPhoto(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Sua sessão expirou. Entre novamente para trocar a foto.");
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${userData.user.id}/professional-${data.professional.id}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: false, contentType: file.type, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: saveError } = await db.rpc("set_my_professional_avatar", { _avatar_url: publicData.publicUrl });
      if (saveError) throw saveError;
      toast.success("Foto da agenda atualizada.");
      await refetch();
    } catch (err: any) {
      toast.error("Não foi possível atualizar sua foto.", { description: err?.message || "Erro inesperado no envio da imagem." });
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth", search: { next: "/profissional" } }); };

  if (isLoading) return <CenteredMessage title="Carregando sua agenda..." />;
  if (error) return <CenteredMessage title="Não foi possível carregar sua agenda." detail={error instanceof Error ? error.message : "Erro inesperado."} action={<Button onClick={() => refetch()}>Tentar novamente</Button>} />;
  if (!data?.authorized) return <div className="min-h-screen bg-background"><SimpleHeader onSignOut={signOut} /><main className="mx-auto max-w-lg px-5 py-16 text-center"><ShieldCheck className="mx-auto size-8 text-primary" /><h1 className="mt-5 text-2xl font-semibold">Agenda ainda não liberada</h1><p className="mt-3 text-sm text-muted-foreground">O e-mail <strong>{data?.email || "atual"}</strong> ainda não foi vinculado a uma agenda.</p><Button className="mt-6" variant="outline" asChild><Link to="/">Voltar ao site</Link></Button></main></div>;

  const todayAppointments = data.appointments.filter((item: any) => item.scheduled_date === today && item.status !== "cancelado");
  const upcomingAppointments = data.appointments.filter((item: any) => item.scheduled_date >= today && item.status !== "cancelado");
  const activePeriods = data.availability.filter((item: any) => item.is_available).length;

  const setAvailability = async (weekday: number, period: string, checked: boolean) => {
    const { error: availabilityError } = await db.from("professional_availability_periods").upsert({ professional_id: data.professional.id, weekday, period, is_available: checked, updated_at: new Date().toISOString() }, { onConflict: "professional_id,weekday,period" });
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
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                {data.professional.avatar_url ? <img src={data.professional.avatar_url} alt={`Foto de ${data.professional.name}`} className="size-20 rounded-2xl object-cover ring-1 ring-border" /> : <div className="grid size-20 place-items-center rounded-2xl bg-primary text-xl font-semibold text-primary-foreground">{initials(data.professional.name)}</div>}
                <button type="button" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto} className="absolute -bottom-2 -right-2 grid size-9 place-items-center rounded-full border border-border bg-card shadow-md transition hover:bg-secondary disabled:opacity-50" aria-label="Alterar foto"><Camera className="size-4" /></button>
                <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void uploadPhoto(event.target.files?.[0])} />
              </div>
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Minha agenda</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{data.professional.name}</h1><p className="mt-1 text-sm text-muted-foreground">{data.professional.specialty}</p><p className="mt-2 text-[11px] text-muted-foreground">{uploadingPhoto ? "Enviando foto..." : "Toque na câmera para trocar sua foto."}</p></div>
            </div>
            <div className="flex flex-wrap gap-2"><Button variant={notificationsEnabled ? "secondary" : "default"} size="sm" className="rounded-full" onClick={enableNotifications}><BellRing className="size-4" /> {notificationsEnabled ? "Notificações ativas" : "Ativar notificações"}</Button><Button variant="outline" size="sm" className="rounded-full" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar</Button></div>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:mt-6 sm:gap-4"><Metric icon={CalendarDays} label="Hoje" value={String(todayAppointments.length)} /><Metric icon={Clock3} label="Turnos ativos" value={String(activePeriods)} /><Metric icon={Stethoscope} label="Próximos" value={String(upcomingAppointments.length)} /></div>

        <div className="mt-7"><AppointmentCalendar appointments={data.appointments} selectedDate={dateFilter} onSelectDate={setDateFilter} title="Meu calendário" description="Toque em um dia para filtrar os atendimentos daquela data." /></div>

        <ProfessionalWeeklySchedule professionalId={data.professional.id} />

        <ProfessionalWeeklySchedule professionalId={data.professional.id} />

        <ProfessionalDateAvailability professionalId={data.professional.id} fallbackSlots={data.slots} fallbackAvailability={data.availability} />

        <ProfessionalClientBookingTools professionalId={data.professional.id} onAppointmentCreated={() => refetch()} />

        <ProfessionalClientBookingTools professionalId={data.professional.id} onAppointmentCreated={() => refetch()} />

        <section className="mt-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">Meus atendimentos</h2><p className="mt-1 text-xs text-muted-foreground">Os atendimentos próximos ganham destaque automaticamente. Com 1 dia de antecedência, o recontato pelo WhatsApp aparece.</p></div><div className="flex gap-2"><div className="grid grid-cols-2 rounded-xl bg-secondary/70 p-1"><button type="button" onClick={() => setScope("upcoming")} className={`rounded-lg px-3 py-2 text-xs ${scope === "upcoming" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Próximos</button><button type="button" onClick={() => setScope("all")} className={`rounded-lg px-3 py-2 text-xs ${scope === "all" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Todos</button></div><Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-[160px]" /></div></div>
          <div className="mt-4 space-y-3">{filteredAppointments.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">Nenhum atendimento encontrado.</div> : filteredAppointments.map((appointment: any) => <ProfessionalAppointmentCard key={appointment.id} appointment={{ ...appointment, professional: data.professional }} onSaved={() => refetch()} />)}</div>
        </section>
      </main>
    </div>
  );
}

function ProfessionalAppointmentCard({ appointment, onSaved }: any) {
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const response = responseFor(appointment)?.response;
  const confirmed = response === "confirmado" || appointment.status === "confirmado";
  const waiting = appointment.status === "pendente" && !confirmed;
  const proximity = appointment.status === "cancelado" ? "past" : appointmentProximity(appointment.scheduled_date);
  const days = daysUntilAppointment(appointment.scheduled_date);
  const hasWhatsApp = normalizeWhatsAppPhone(appointment.patient_phone).length > 0;
  const total = Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0);

  const respond = async (nextResponse: "confirmado" | "recusado") => {
    if (!appointment.professional_id || appointment.status === "cancelado") return;
    setBusy(nextResponse === "confirmado" ? "confirm" : "decline");
    const { error } = await db.rpc("respond_to_professional_appointment", { _appointment_id: appointment.id, _response: nextResponse });
    setBusy(null);
    if (error) { toast.error(nextResponse === "confirmado" ? "Não foi possível confirmar o compromisso." : "Não foi possível recusar o compromisso.", { description: error.message }); return; }
    toast.success(nextResponse === "confirmado" ? "Compromisso confirmado." : "Agendamento recusado.");
    onSaved?.();
  };

  const openWhatsApp = (kind: "confirmation" | "reminder") => {
    const url = appointmentWhatsAppUrl(appointment, kind);
    if (!url) { toast.error("Este cliente não possui WhatsApp cadastrado."); return; }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const label = appointment.status === "cancelado" ? (response === "recusado" ? "recusado por você" : "cancelado") : confirmed ? "confirmado" : waiting ? "aguardando confirmação" : appointment.status;
  const cardClass = proximity === "urgent" ? "border-amber-500/60 bg-amber-50/70 shadow-md" : proximity === "soon" ? "border-amber-300/60 bg-amber-50/35" : "border-border bg-card";

  return <article className={`rounded-2xl border p-4 shadow-soft transition ${cardClass} ${appointment.status === "cancelado" ? "opacity-60" : ""}`}>
    {proximity === "urgent" && appointment.status !== "cancelado" ? <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900"><AlertTriangle className="size-4" /> {days === 0 ? "Atendimento hoje — confira com a cliente." : "Atendimento amanhã — recontato recomendado."}</div> : proximity === "soon" ? <div className="mb-3 rounded-xl bg-amber-100/60 px-3 py-2 text-[11px] font-medium text-amber-900">Atendimento se aproximando: faltam {days} dias.</div> : null}
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{appointment.patient_name}</p><Badge variant={confirmed ? "default" : "outline"} className="rounded-full text-[10px]">{label}</Badge>{confirmed ? <Badge className="rounded-full bg-primary-soft text-primary"><CheckCircle2 className="mr-1 size-3" /> Você confirmou</Badge> : null}</div><p className="mt-1 text-xs text-muted-foreground">{appointment.service?.name || "Procedimento"} · {formatPrice(total)}</p></div><div className="text-right"><p className="font-semibold">{appointment.scheduled_time}</p><p className="text-[10px] text-muted-foreground">{formatDate(appointment.scheduled_date)}</p></div></div>
    <div className="mt-3 grid gap-2 border-t border-border/70 pt-3 sm:grid-cols-2"><a href={appointment.patient_phone ? `tel:${appointment.patient_phone}` : undefined} className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="size-3.5" /> {appointment.patient_phone || "Telefone não informado"}</a><a href={appointment.patient_email ? `mailto:${appointment.patient_email}` : undefined} className="flex items-center gap-2 text-xs text-muted-foreground sm:justify-end"><Mail className="size-3.5" /> {appointment.patient_email || "E-mail não informado"}</a></div>
    {appointment.notes ? <p className="mt-3 rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">{appointment.notes}</p> : null}
    {appointment.status !== "cancelado" && hasWhatsApp ? <div className="mt-3 flex flex-wrap gap-2">{proximity === "urgent" ? <Button type="button" className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openWhatsApp("reminder")}><MessageCircle className="size-4" /> {days === 0 ? "Falar com cliente" : "Recontatar cliente"}</Button> : waiting ? <Button type="button" variant="outline" className="rounded-xl border-emerald-600/40 text-emerald-700 hover:bg-emerald-50" onClick={() => openWhatsApp("confirmation")}><MessageCircle className="size-4" /> Confirmar pelo WhatsApp</Button> : null}</div> : null}
    {waiting ? <div className="mt-3 grid gap-2 sm:grid-cols-2"><Button className="rounded-xl" disabled={busy !== null} onClick={() => void respond("confirmado")}><CheckCircle2 className="size-4" /> {busy === "confirm" ? "Confirmando..." : "Confirmar compromisso"}</Button><Button variant="outline" className="rounded-xl text-destructive" disabled={busy !== null} onClick={() => void respond("recusado")}><XCircle className="size-4" /> {busy === "decline" ? "Recusando..." : "Recusar"}</Button></div> : null}
  </article>;
}

function SimpleHeader({ onSignOut }: { onSignOut: () => void }) { return <header className="sticky top-0 z-40 border-b border-border/80 bg-card/95 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-8"><Link to="/"><img src={logo} alt="JR Clinic" className="h-9 w-auto" /></Link><Button variant="outline" size="sm" className="rounded-full" onClick={onSignOut}><LogOut className="size-4" /> Sair</Button></div></header>; }
function Metric({ icon: Icon, label, value }: any) { return <div className="rounded-2xl border border-border bg-card p-4 shadow-soft"><Icon className="size-4 text-primary" /><p className="mt-2 text-2xl font-semibold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>; }
function CenteredMessage({ title, detail, action }: any) { return <div className="grid min-h-screen place-items-center bg-background px-5"><div className="max-w-md text-center"><ShieldCheck className="mx-auto size-7 text-primary" /><h1 className="mt-4 text-xl font-semibold">{title}</h1>{detail ? <p className="mt-2 text-sm text-muted-foreground">{detail}</p> : null}{action ? <div className="mt-5">{action}</div> : null}</div></div>; }
