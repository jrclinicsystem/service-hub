import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  CalendarDays,
  Camera,
  Clock3,
  CreditCard,
  LogOut,
  Mail,
  Phone,
  Save,
  Stethoscope,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getMyAppointments, hideMyAppointment } from "@/lib/clinic.functions";
import { formatDate, formatPrice } from "@/lib/clinic";

const title = "Minha conta — JR Clinic";
const description = "Gerencie seu perfil e acompanhe todos os detalhes dos seus agendamentos na JR Clinic.";

export const Route = createFileRoute("/_authenticated/minha-conta")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: MinhaConta,
});

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function latestPayment(item: any) {
  return [...(item.payments ?? [])].sort(
    (a: any, b: any) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
  )[0] ?? null;
}

function approvedPayment(item: any) {
  return [...(item.payments ?? [])]
    .filter((payment: any) => payment.status === "approved")
    .sort((a: any, b: any) => new Date(b.paid_at ?? b.created_at ?? 0).getTime() - new Date(a.paid_at ?? a.created_at ?? 0).getTime())[0] ?? null;
}

function paymentLabel(item: any) {
  if (item.payment_choice === "onsite") return "Pagamento presencial";
  const approved = approvedPayment(item);
  const latest = latestPayment(item);
  if (approved) {
    if (item.payment_choice === "online_full" || approved.kind === "full") return "Pago integralmente";
    const percent = Number(item.deposit_percent ?? 50);
    return `${Number.isInteger(percent) ? percent : percent.toFixed(1).replace(".", ",")}% pago`;
  }
  if (latest?.status === "pending" || latest?.status === "creating") return "Pagamento pendente";
  if (latest?.status === "failed") return "Pagamento não concluído";
  return "Aguardando pagamento";
}

function statusLabel(status: string) {
  if (status === "aguardando_pagamento") return "Aguardando pagamento";
  if (status === "confirmado") return "Confirmado";
  if (status === "cancelado") return "Cancelado";
  return "Pendente de confirmação";
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function MinhaConta() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const avatarInput = useRef<HTMLInputElement>(null);
  const fetchAppointments = useServerFn(getMyAppointments);
  const hideAppointment = useServerFn(hideMyAppointment);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);
  const [removing, setRemoving] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, avatar_url, created_at, updated_at")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const appointmentsQuery = useQuery({ queryKey: ["my-appointments"], queryFn: () => fetchAppointments() });

  useEffect(() => {
    if (!profileQuery.data) return;
    setFullName(profileQuery.data.full_name ?? "");
    setPhone(profileQuery.data.phone ?? "");
  }, [profileQuery.data]);

  const avatarUrl = profileQuery.data?.avatar_url || (typeof user?.user_metadata?.['avatar_url'] === "string" ? user.user_metadata['avatar_url'] : "");
  const displayName = fullName.trim() || profileQuery.data?.full_name || (typeof user?.user_metadata?.['full_name'] === "string" ? user.user_metadata['full_name'] : "") || user?.email?.split("@")[0] || "Paciente JR Clinic";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  const appointments = appointmentsQuery.data ?? [];
  const { active, history } = useMemo(() => {
    const today = todayIso();
    const groups = { active: [] as typeof appointments, history: [] as typeof appointments };
    for (const item of appointments) {
      const last = latestPayment(item);
      const failedUnpaid = item.status === "aguardando_pagamento" && last?.status === "failed";
      const isActive = item.status !== "cancelado" && item.scheduled_date >= today && !failedUnpaid;
      groups[isActive ? "active" : "history"].push(item);
    }
    groups.active.sort((a: any, b: any) => `${a.scheduled_date} ${a.scheduled_time}`.localeCompare(`${b.scheduled_date} ${b.scheduled_time}`));
    return groups;
  }, [appointments]);

  const saveProfile = async () => {
    if (!user) return;
    if (fullName.trim().length < 2) { toast.error("Digite seu nome completo."); return; }
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({ id: user.id, full_name: fullName.trim(), phone: phone.trim() || null, avatar_url: avatarUrl || null });
    if (!error) await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["my-profile", user.id] });
    toast.success("Perfil atualizado.");
  };

  const uploadAvatar = async (file?: File) => {
    if (!user || !file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast.error("Use uma imagem JPG, PNG ou WEBP."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("A foto deve ter no máximo 5 MB."); return; }
    setUploading(true);
    const path = `${user.id}/avatar`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
    if (uploadError) { setUploading(false); toast.error(uploadError.message); return; }
    const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path);
    const versionedUrl = `${publicData.publicUrl}?v=${Date.now()}`;
    const { error: profileError } = await supabase.from("profiles").upsert({ id: user.id, avatar_url: versionedUrl });
    if (!profileError) await supabase.auth.updateUser({ data: { avatar_url: versionedUrl } });
    setUploading(false);
    if (profileError) { toast.error(profileError.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["my-profile", user.id] });
    toast.success("Foto de perfil atualizada.");
  };

  const removeFromHistory = async () => {
    if (!selectedAppointment) return;
    setRemoving(true);
    try {
      await hideAppointment({ data: { id: selectedAppointment.id } });
      setSelectedAppointment(null);
      await queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
      toast.success("Agendamento removido do seu histórico.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover este agendamento.");
    } finally {
      setRemoving(false);
    }
  };

  const signOut = async () => { await supabase.auth.signOut(); window.location.replace("/auth"); };

  return (
    <div className="min-h-screen overflow-x-hidden">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-8 sm:pb-14 sm:pt-10">
        <section className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => avatarInput.current?.click()} className="group relative size-20 shrink-0 overflow-hidden rounded-full border border-border bg-primary-soft sm:size-24" aria-label="Alterar foto de perfil">
              {avatarUrl ? <img src={avatarUrl} alt="Foto de perfil" className="size-full object-cover" referrerPolicy="no-referrer" /> : <span className="grid size-full place-items-center text-xl font-semibold text-primary sm:text-2xl">{initials || <UserRound className="size-7" />}</span>}
              <span className="absolute inset-x-0 bottom-0 flex h-7 items-center justify-center bg-black/55 text-white opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"><Camera className="size-3.5" /></span>
            </button>
            <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; void uploadAvatar(file); event.currentTarget.value = ""; }} />
            <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Minha conta</p><h1 className="mt-1 truncate text-2xl font-semibold sm:text-3xl">{displayName}</h1><p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">{user?.email}</p><button type="button" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary" onClick={() => avatarInput.current?.click()} disabled={uploading}><Camera className="size-3.5" /> {uploading ? "Enviando foto..." : "Alterar foto"}</button></div>
            <Button variant="ghost" size="icon" className="shrink-0 rounded-full" onClick={signOut}><LogOut className="size-4" /></Button>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:mt-6 sm:gap-4"><AccountMetric label="Ativos" value={String(active.length)} /><AccountMetric label="Histórico" value={String(history.length)} /><AccountMetric label="Total" value={String(appointments.length)} /></div>

        <Tabs defaultValue="agendamentos" className="mt-5 sm:mt-8">
          <TabsList className="grid h-11 w-full grid-cols-3 rounded-xl bg-secondary/70 p-1 sm:w-[500px]"><TabsTrigger value="perfil" className="rounded-lg">Perfil</TabsTrigger><TabsTrigger value="agendamentos" className="rounded-lg">Agendamentos</TabsTrigger><TabsTrigger value="historico" className="rounded-lg">Histórico</TabsTrigger></TabsList>

          <TabsContent value="perfil" className="mt-4">
            <section className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
              <h2 className="text-lg font-semibold">Dados pessoais</h2><p className="mt-1 text-xs text-muted-foreground sm:text-sm">Essas informações serão usadas nos seus agendamentos.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div><Label htmlFor="profile-name">Nome completo</Label><div className="relative mt-2"><UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="profile-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11 rounded-xl pl-10" /></div></div>
                <div><Label htmlFor="profile-phone">Telefone / WhatsApp</Label><div className="relative mt-2"><Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="profile-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl pl-10" /></div></div>
                <div className="sm:col-span-2"><Label htmlFor="profile-email">E-mail da conta</Label><div className="relative mt-2"><Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="profile-email" value={user?.email ?? ""} readOnly className="h-11 rounded-xl bg-secondary/40 pl-10" /></div></div>
              </div>
              <div className="mt-5 flex justify-end"><Button className="w-full rounded-full sm:w-auto" onClick={saveProfile} disabled={saving || profileQuery.isLoading}><Save className="size-4" /> {saving ? "Salvando..." : "Salvar alterações"}</Button></div>
            </section>
          </TabsContent>

          <TabsContent value="agendamentos" className="mt-4">
            <AppointmentSection title="Agendamentos ativos" items={active} empty="Nenhum agendamento ativo no momento." onSelect={setSelectedAppointment} />
            {active.length === 0 && !appointmentsQuery.isLoading ? <Button asChild className="mt-4 rounded-full"><Link to="/catalogo">Agendar atendimento</Link></Button> : null}
          </TabsContent>

          <TabsContent value="historico" className="mt-4">
            <AppointmentSection title="Histórico" items={history} empty="Agendamentos concluídos ou cancelados aparecerão aqui." onSelect={setSelectedAppointment} />
          </TabsContent>
        </Tabs>
      </main>

      <AppointmentDetailsDialog appointment={selectedAppointment} onOpenChange={(open: boolean) => !open && setSelectedAppointment(null)} onRemove={removeFromHistory} removing={removing} />
      <SiteFooter />
    </div>
  );
}

function AccountMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-card px-3 py-3 text-center shadow-soft sm:px-4 sm:py-4"><p className="text-xl font-semibold text-primary sm:text-2xl">{value}</p><p className="mt-0.5 text-[10px] text-muted-foreground sm:text-xs">{label}</p></div>;
}

function AppointmentSection({ title, items, empty, onSelect }: { title: string; items: any[]; empty: string; onSelect: (item: any) => void }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-0.5 text-xs text-muted-foreground">Toque em um agendamento para ver todos os detalhes.</p></div><span className="text-xs text-muted-foreground">{items.length}</span></div>
      {items.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center"><CalendarDays className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-xs text-muted-foreground">{empty}</p></div> : (
        <div className="space-y-2.5">{items.map((item) => <AppointmentCard key={item.id} item={item} onClick={() => onSelect(item)} />)}</div>
      )}
    </section>
  );
}

function AppointmentCard({ item, onClick }: any) {
  return (
    <button type="button" onClick={onClick} className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition hover:border-primary/30 hover:bg-secondary/20 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-sm font-semibold sm:text-base">{item.service?.name ?? "Serviço"}</p><p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">{item.professional?.name ?? "Equipe JR Clinic"} · {item.professional?.specialty ?? "Profissional"}</p></div>
        <StatusBadge status={item.status} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-secondary/45 p-3 text-xs">
        <MiniDetail label="Data" value={formatDate(item.scheduled_date)} /><MiniDetail label="Horário" value={item.scheduled_time} /><MiniDetail label="Pagamento" value={paymentLabel(item)} accent />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3"><p className="text-[11px] text-muted-foreground">Valor: {formatPrice(Number(item.service_price_snapshot ?? item.service?.price ?? 0))}</p><span className="text-xs font-medium text-primary">Ver detalhes →</span></div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "cancelado" ? "destructive" : status === "confirmado" ? "default" : "secondary";
  return <Badge variant={variant as any} className="shrink-0 rounded-full px-2.5 text-[10px] font-normal">{statusLabel(status)}</Badge>;
}

function MiniDetail({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="min-w-0"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-0.5 truncate font-medium ${accent ? "text-primary" : ""}`}>{value}</p></div>;
}

function AppointmentDetailsDialog({ appointment, onOpenChange, onRemove, removing }: any) {
  if (!appointment) return null;
  const approved = approvedPayment(appointment);
  const latest = latestPayment(appointment);
  const total = Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0);
  const historyItem = appointment.status === "cancelado" || appointment.scheduled_date < todayIso() || (appointment.status === "aguardando_pagamento" && latest?.status === "failed");
  const paidAmount = approved ? Number(approved.amount ?? 0) : 0;

  return (
    <Dialog open={Boolean(appointment)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-2xl sm:p-6">
        <DialogHeader><div className="flex flex-wrap items-center gap-2"><DialogTitle>{appointment.service?.name ?? "Detalhes do agendamento"}</DialogTitle><StatusBadge status={appointment.status} /></div><DialogDescription>Informações completas da sua reserva.</DialogDescription></DialogHeader>

        <div className="mt-2 rounded-2xl border border-border bg-secondary/35 p-4">
          <div className="flex items-center gap-2 text-primary"><BadgeCheck className="size-4" /><p className="text-sm font-semibold">{paymentLabel(appointment)}</p></div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><MiniDetail label="Valor total" value={formatPrice(total)} /><MiniDetail label="Pago" value={formatPrice(paidAmount)} /><MiniDetail label="Restante" value={formatPrice(Number(appointment.balance_amount ?? Math.max(0, total - paidAmount)))} /><MiniDetail label="Forma" value={appointment.payment_choice === "onsite" ? "Na clínica" : approved?.payment_method_id || "InfinitePay"} /></div>
          {approved?.paid_at ? <p className="mt-3 text-[11px] text-muted-foreground">Pagamento confirmado em {formatDateTime(approved.paid_at)}.</p> : appointment.payment_choice === "onsite" ? <p className="mt-3 text-[11px] text-muted-foreground">Nenhuma cobrança online foi realizada. O pagamento fica para o atendimento presencial.</p> : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <InfoBox icon={CalendarDays} label="Data do atendimento" value={formatDate(appointment.scheduled_date)} />
          <InfoBox icon={Clock3} label="Horário" value={appointment.scheduled_time} />
          <InfoBox icon={Stethoscope} label="Profissional" value={`${appointment.professional?.name ?? "Equipe JR Clinic"}${appointment.professional?.specialty ? ` · ${appointment.professional.specialty}` : ""}`} />
          <InfoBox icon={Clock3} label="Duração" value={`${appointment.service?.duration_min ?? "—"} min`} />
          <InfoBox icon={UserRound} label="Paciente" value={appointment.patient_name} />
          <InfoBox icon={Phone} label="Contato" value={appointment.patient_phone || "Não informado"} />
          <InfoBox icon={CalendarDays} label="Agendado em" value={formatDateTime(appointment.created_at)} />
          <InfoBox icon={CreditCard} label="Situação do pagamento" value={paymentLabel(appointment)} />
        </div>

        {appointment.notes ? <div className="mt-4 rounded-2xl bg-secondary/50 p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Observações</p><p className="mt-2 text-sm leading-relaxed">{appointment.notes}</p></div> : null}

        <DialogFooter className="mt-5 gap-2 sm:justify-between">
          {historyItem ? <Button variant="outline" className="rounded-full text-destructive" onClick={onRemove} disabled={removing}><Trash2 className="size-4" /> {removing ? "Removendo..." : "Remover do histórico"}</Button> : <span />}
          <Button className="rounded-full" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoBox({ icon: Icon, label, value }: any) {
  return <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-4" /></span><div className="min-w-0"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium leading-relaxed">{value}</p></div></div>;
}
