import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  Clock3,
  ExternalLink,
  LogOut,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import logo from "@/assets/jr-clinic-logo.png";
import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/clinic";

const db = supabase as any;

export const Route = createFileRoute("/admin_/equipe")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: "/admin/equipe" } });
  },
  head: () => ({
    meta: [
      { title: "Agenda da equipe — JR Clinic" },
      { name: "description", content: "Gestão das agendas individuais da equipe JR Clinic." },
    ],
  }),
  component: TeamAgendaPage,
});

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "JR";
}

function ProfessionalAvatar({ professional, className = "size-14" }: { professional: any; className?: string }) {
  if (professional.avatar_url) {
    return <img src={professional.avatar_url} alt={`Foto de ${professional.name}`} className={`${className} shrink-0 rounded-2xl object-cover shadow-sm ring-1 ring-black/5`} />;
  }
  return <div className={`grid ${className} shrink-0 place-items-center rounded-2xl bg-primary font-semibold text-primary-foreground shadow-sm`}>{initials(professional.name)}</div>;
}

async function loadTeamAgenda() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");

  const { data: isAdmin, error: adminError } = await db.rpc("is_current_user_admin");
  if (adminError) throw adminError;
  if (!isAdmin) return { isAdmin: false as const };

  const [professionals, access, appointments, services, links, slots] = await Promise.all([
    db.from("professionals").select("id, name, specialty, avatar_url, is_active, sort_order, deleted_at").is("deleted_at", null).order("sort_order").order("name"),
    db.from("professional_access").select("id, professional_id, email, enabled, created_by, created_at, updated_at").order("created_at"),
    db.from("appointments").select("id, professional_id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, service:services(id, name, duration_min)").order("scheduled_date").order("scheduled_time"),
    db.from("services").select("id, name, duration_min, price, is_active").eq("is_active", true).order("name"),
    db.from("service_professionals").select("service_id, professional_id"),
    db.from("professional_time_slots").select("id, professional_id, slot, is_available, sort_order").order("sort_order").order("slot"),
  ]);

  for (const result of [professionals, access, appointments, services, links, slots]) {
    if (result.error) throw result.error;
  }

  return {
    isAdmin: true as const,
    professionals: professionals.data ?? [],
    access: access.data ?? [],
    appointments: appointments.data ?? [],
    services: services.data ?? [],
    links: links.data ?? [],
    slots: slots.data ?? [],
  };
}

function TeamAgendaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["team-agenda-v2"],
    queryFn: loadTeamAgenda,
    retry: 1,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["team-agenda-v2"] });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: undefined } });
  };

  if (isLoading) return <CenteredMessage title="Carregando agendas da equipe..." />;
  if (error) return <CenteredMessage title="Não foi possível carregar as agendas." detail={error instanceof Error ? error.message : "Erro inesperado."} action={<Button onClick={() => refetch()}>Tentar novamente</Button>} />;
  if (!data?.isAdmin) return <CenteredMessage title="Acesso administrativo necessário" detail="Colaboradores devem usar o portal da própria agenda." action={<Button asChild><Link to="/profissional">Ir para minha agenda</Link></Button>} />;

  const selected = selectedId ? data.professionals.find((item: any) => item.id === selectedId) ?? null : null;
  const selectedAccess = selected ? data.access.find((item: any) => item.professional_id === selected.id) ?? null : null;
  const selectedAppointments = selected ? data.appointments.filter((item: any) => item.professional_id === selected.id) : [];
  const selectedServiceIds = selected ? data.links.filter((item: any) => item.professional_id === selected.id).map((item: any) => item.service_id) : [];
  const selectedSlots = selected ? data.slots.filter((item: any) => item.professional_id === selected.id) : [];

  return (
    <div className="min-h-screen bg-background lg:pl-[252px]">
      <AdminSubpageSidebar active="team" />
      <header className="sticky top-0 z-40 border-b border-border/80 bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between px-4 sm:h-16 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logo} alt="JR Clinic" className="h-7 w-auto lg:hidden" />
            <div>
              <p className="text-sm font-semibold">Agenda da equipe</p>
              <p className="hidden text-[11px] text-muted-foreground sm:block">Gestão completa pelos administradores gerais</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild><Link to="/admin"><ChevronLeft className="size-4" /> Painel</Link></Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={signOut}><LogOut className="size-4" /> <span className="hidden sm:inline">Sair</span></Button>
          </div>
        </div>
      </header>

      {!selected ? (
        <main className="mx-auto max-w-[1480px] px-4 pb-16 pt-6 sm:px-8 sm:py-10">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <span className="eyebrow text-muted-foreground">Equipe</span>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Agendas da equipe</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Crie agendas, cadastre atendimentos, defina horários e controle os acessos dos colaboradores.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="rounded-full" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Criar agenda</Button>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar</Button>
              <Button variant="outline" className="rounded-full" asChild><Link to="/admin/acessos"><ShieldCheck className="size-4" /> Acessos</Link></Button>
              <Button variant="outline" className="rounded-full" asChild><Link to="/profissional" target="_blank">Portal da equipe <ExternalLink className="size-4" /></Link></Button>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-3 gap-2.5 sm:max-w-2xl sm:gap-4">
            <Metric icon={Users} label="Agendas" value={String(data.professionals.length)} />
            <Metric icon={CalendarDays} label="Agendamentos" value={String(data.appointments.filter((a: any) => a.status !== "cancelado").length)} />
            <Metric icon={ShieldCheck} label="Acessos ativos" value={String(data.access.filter((a: any) => a.enabled).length)} />
          </div>

          <section className="mt-8 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {data.professionals.map((professional: any) => {
              const access = data.access.find((item: any) => item.professional_id === professional.id);
              const appointments = data.appointments.filter((item: any) => item.professional_id === professional.id && item.status !== "cancelado");
              const activeSlots = data.slots.filter((item: any) => item.professional_id === professional.id && item.is_available).length;
              return (
                <article key={professional.id} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
                  <div className="flex items-start gap-4">
                    <ProfessionalAvatar professional={professional} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><h2 className="truncate text-xl font-semibold">{professional.name}</h2><p className="mt-1 truncate text-xs text-muted-foreground">{professional.specialty || "Profissional JR Clinic"}</p></div>
                        <Badge variant={professional.is_active ? "default" : "secondary"} className="rounded-full text-[10px]">{professional.is_active ? "Ativa" : "Pausada"}</Badge>
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground"><Mail className="size-3" /> {access?.email || "Sem colaborador vinculado"}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2"><MiniStat label="Atendimentos" value={appointments.length} /><MiniStat label="Horários" value={activeSlots} /><MiniStat label="Serviços" value={data.links.filter((item: any) => item.professional_id === professional.id).length} /></div>
                  <Button type="button" className="mt-4 w-full rounded-full" onClick={() => setSelectedId(professional.id)}>Abrir agenda</Button>
                </article>
              );
            })}
          </section>
        </main>
      ) : (
        <main className="mx-auto max-w-[1240px] px-4 pb-16 pt-6 sm:px-8 sm:py-10">
          <Button type="button" variant="ghost" className="-ml-2 rounded-full" onClick={() => setSelectedId(null)}><ArrowLeft className="size-4" /> Voltar para equipe</Button>

          <section className="mt-4 overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
            <div className="bg-primary p-5 text-primary-foreground sm:p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4"><ProfessionalAvatar professional={selected} className="size-16 sm:size-20" /><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">Agenda individual</p><h1 className="mt-1 truncate text-3xl font-semibold sm:text-4xl">{selected.name}</h1><p className="mt-1 text-sm text-white/70">{selected.specialty}</p></div></div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" className="rounded-full bg-white/15 text-white hover:bg-white/25" onClick={() => setEditOpen(true)}><Pencil className="size-4" /> Editar agenda</Button>
                  <Button type="button" variant="secondary" className="rounded-full bg-white/15 text-white hover:bg-white/25" onClick={() => setHoursOpen(true)}><Clock3 className="size-4" /> Horários</Button>
                  <Button type="button" className="rounded-full bg-white text-primary hover:bg-white/90" onClick={() => setAppointmentOpen(true)}><CalendarPlus className="size-4" /> Novo agendamento</Button>
                  <Button type="button" variant="secondary" className="rounded-full bg-white/15 text-white hover:bg-destructive hover:text-destructive-foreground" onClick={async () => {
                    if (!window.confirm(`Excluir a agenda de ${selected.name}? O histórico de atendimentos será preservado.`)) return;
                    const { error: deleteError } = await db.rpc("delete_professional_agenda", { _professional_id: selected.id });
                    if (deleteError) { toast.error(deleteError.message); return; }
                    toast.success("Agenda excluída.");
                    setSelectedId(null);
                    await refresh();
                  }}><Trash2 className="size-4" /> Excluir agenda</Button>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <div><p className="text-xs font-medium">{selectedAccess?.email || "Nenhum colaborador vinculado"}</p><p className="mt-1 text-[11px] text-muted-foreground">O colaborador vinculado enxerga somente esta agenda.</p></div>
              <Badge variant={selectedAccess?.enabled ? "default" : "secondary"} className="w-fit rounded-full">{selectedAccess?.enabled ? "Acesso ativo" : "Sem acesso ativo"}</Badge>
            </div>
          </section>

          <div className="mt-5 grid grid-cols-3 gap-2.5 sm:gap-4"><Metric icon={CalendarDays} label="Atendimentos" value={String(selectedAppointments.length)} /><Metric icon={Clock3} label="Horários ativos" value={String(selectedSlots.filter((slot: any) => slot.is_available).length)} /><Metric icon={Users} label="Serviços" value={String(selectedServiceIds.length)} /></div>

          <section className="mt-8">
            <div className="flex items-end justify-between"><div><h2 className="text-xl font-semibold">Atendimentos de {selected.name.split(" ")[0]}</h2><p className="mt-1 text-xs text-muted-foreground">Agendamentos desta agenda.</p></div></div>
            <div className="mt-4 space-y-3">
              {selectedAppointments.length === 0 ? <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">Nenhum atendimento cadastrado.</div> : selectedAppointments.map((appointment: any) => (
                <article key={appointment.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{appointment.patient_name}</p><p className="mt-1 text-xs text-muted-foreground">{appointment.service?.name || "Atendimento"}</p></div><div className="text-right"><p className="font-semibold">{appointment.scheduled_time}</p><p className="text-[10px] text-muted-foreground">{formatDate(appointment.scheduled_date)}</p></div></div>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3"><Badge variant={appointment.status === "confirmado" ? "default" : "outline"} className="rounded-full">{appointment.status}</Badge><Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={async () => { if (!window.confirm(`Apagar o agendamento de ${appointment.patient_name}?`)) return; const { error: removeError } = await db.from("appointments").delete().eq("id", appointment.id); if (removeError) { toast.error(removeError.message); return; } toast.success("Agendamento apagado."); await refresh(); }}><Trash2 className="size-4" /></Button></div>
                </article>
              ))}
            </div>
          </section>
        </main>
      )}

      <CreateAgendaModal open={createOpen} onClose={() => setCreateOpen(false)} services={data.services} onSaved={refresh} />
      {selected ? <EditAgendaModal open={editOpen} onClose={() => setEditOpen(false)} professional={selected} access={selectedAccess} services={data.services} linkedServiceIds={selectedServiceIds} onSaved={refresh} /> : null}
      {selected ? <NewAppointmentModal open={appointmentOpen} onClose={() => setAppointmentOpen(false)} professional={selected} services={data.services.filter((service: any) => selectedServiceIds.includes(service.id))} slots={selectedSlots.filter((slot: any) => slot.is_available)} onSaved={refresh} /> : null}
      {selected ? <HoursModal open={hoursOpen} onClose={() => setHoursOpen(false)} professional={selected} slots={selectedSlots} onSaved={refresh} /> : null}
    </div>
  );
}

function ModalShell({ open, onClose, title, description, children, footer, width = "max-w-2xl" }: any) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default bg-black/70" aria-label="Fechar" onClick={onClose} />
      <div className={`relative z-[10000] max-h-[92vh] w-full ${width} overflow-y-auto rounded-3xl border border-border bg-background p-5 text-foreground shadow-2xl sm:p-6`}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary"><X className="size-4" /></button>
        <div className="pr-10"><h2 className="text-xl font-semibold">{title}</h2>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div>
        <div className="mt-5">{children}</div>
        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

function CreateAgendaModal({ open, onClose, services, onSaved }: any) {
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [email, setEmail] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => { setName(""); setSpecialty(""); setEmail(""); setServiceIds([]); };
  const close = () => { if (!busy) { reset(); onClose(); } };
  const save = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (name.trim().length < 2) { toast.error("Informe o nome da profissional."); return; }
    if (normalizedEmail && !normalizedEmail.includes("@")) { toast.error("Informe um e-mail válido."); return; }
    setBusy(true);
    try {
      const { data: professional, error: professionalError } = await db.from("professionals").insert({ name: name.trim(), specialty: specialty.trim(), is_active: true, sort_order: 999 }).select("id").single();
      if (professionalError) throw professionalError;
      if (normalizedEmail) {
        const { data: authData } = await supabase.auth.getUser();
        const { error: accessError } = await db.from("professional_access").insert({ professional_id: professional.id, email: normalizedEmail, enabled: true, created_by: authData.user?.id ?? null });
        if (accessError) throw accessError;
      }
      if (serviceIds.length) {
        const { error: linkError } = await db.from("service_professionals").insert(serviceIds.map((serviceId) => ({ service_id: serviceId, professional_id: professional.id })));
        if (linkError) throw linkError;
      }
      toast.success("Agenda criada com sucesso.");
      reset(); onClose(); await onSaved();
    } catch (err: any) { toast.error(err?.message || "Não foi possível criar a agenda."); }
    finally { setBusy(false); }
  };

  return <ModalShell open={open} onClose={close} title="Criar agenda" description="Cadastre a profissional, o acesso e os serviços atendidos." footer={<><Button variant="outline" onClick={close} disabled={busy}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy ? "Criando..." : "Criar agenda"}</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" /></Field>
      <Field label="Especialidade"><Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Ex.: Cabeleireira" /></Field>
      <div className="sm:col-span-2"><Field label="E-mail do colaborador (opcional)"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colaborador@email.com" /></Field></div>
      <div className="sm:col-span-2"><Label>Serviços atendidos</Label><div className="mt-2 grid max-h-56 gap-2 overflow-y-auto rounded-2xl border border-border p-2 sm:grid-cols-2">{services.map((service: any) => { const selected = serviceIds.includes(service.id); return <button key={service.id} type="button" onClick={() => setServiceIds((current) => selected ? current.filter((id) => id !== service.id) : [...current, service.id])} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs ${selected ? "border-primary bg-primary-soft text-primary" : "border-border"}`}><span className={`grid size-4 place-items-center rounded border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selected ? <Check className="size-3" /> : null}</span>{service.name}</button>; })}</div></div>
    </div>
  </ModalShell>;
}

function EditAgendaModal({ open, onClose, professional, access, services, linkedServiceIds, onSaved }: any) {
  const [name, setName] = useState(professional.name);
  const [specialty, setSpecialty] = useState(professional.specialty ?? "");
  const [email, setEmail] = useState(access?.email ?? "");
  const [enabled, setEnabled] = useState(access?.enabled ?? true);
  const [active, setActive] = useState(professional.is_active);
  const [serviceIds, setServiceIds] = useState<string[]>(linkedServiceIds);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setName(professional.name); setSpecialty(professional.specialty ?? ""); setEmail(access?.email ?? ""); setEnabled(access?.enabled ?? true); setActive(professional.is_active); setServiceIds(linkedServiceIds); } }, [open, professional, access, linkedServiceIds]);

  const save = async () => {
    if (name.trim().length < 2) { toast.error("Informe um nome válido."); return; }
    const normalizedEmail = email.trim().toLowerCase();
    setBusy(true);
    try {
      const { error: pError } = await db.from("professionals").update({ name: name.trim(), specialty: specialty.trim(), is_active: active }).eq("id", professional.id);
      if (pError) throw pError;
      if (normalizedEmail) {
        const { data: authData } = await supabase.auth.getUser();
        const { error: aError } = await db.from("professional_access").upsert({ professional_id: professional.id, email: normalizedEmail, enabled, created_by: access?.created_by ?? authData.user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "professional_id" });
        if (aError) throw aError;
      } else if (access?.id) {
        const { error: removeError } = await db.from("professional_access").delete().eq("id", access.id);
        if (removeError) throw removeError;
      }
      const { error: clearError } = await db.from("service_professionals").delete().eq("professional_id", professional.id);
      if (clearError) throw clearError;
      if (serviceIds.length) {
        const { error: linkError } = await db.from("service_professionals").insert(serviceIds.map((serviceId) => ({ service_id: serviceId, professional_id: professional.id })));
        if (linkError) throw linkError;
      }
      toast.success("Agenda atualizada."); onClose(); await onSaved();
    } catch (err: any) { toast.error(err?.message || "Não foi possível atualizar a agenda."); }
    finally { setBusy(false); }
  };

  return <ModalShell open={open} onClose={onClose} title={`Editar agenda de ${professional.name}`} description="Altere dados, acesso e serviços desta agenda." footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy ? "Salvando..." : "Salvar alterações"}</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Especialidade"><Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} /></Field>
      <div className="sm:col-span-2"><Field label="E-mail do colaborador"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Deixe vazio para remover o acesso" /></Field></div>
      <ToggleBox title="Agenda ativa" detail="Permite novos agendamentos." checked={active} onChange={setActive} />
      <ToggleBox title="Acesso do colaborador" detail="Permite entrar no portal individual." checked={enabled} onChange={setEnabled} disabled={!email.trim()} />
      <div className="sm:col-span-2"><Label>Serviços vinculados</Label><div className="mt-2 grid max-h-56 gap-2 overflow-y-auto rounded-2xl border border-border p-2 sm:grid-cols-2">{services.map((service: any) => { const selected = serviceIds.includes(service.id); return <button key={service.id} type="button" onClick={() => setServiceIds((current) => selected ? current.filter((id) => id !== service.id) : [...current, service.id])} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs ${selected ? "border-primary bg-primary-soft text-primary" : "border-border"}`}><span className={`grid size-4 place-items-center rounded border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selected ? <Check className="size-3" /> : null}</span>{service.name}</button>; })}</div></div>
    </div>
  </ModalShell>;
}

function NewAppointmentModal({ open, onClose, professional, services, slots, onSaved }: any) {
  const [serviceId, setServiceId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setServiceId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setDate(todayIso()); setTime(""); setNotes(""); };
  const save = async () => {
    if (!serviceId || !patientName.trim() || !date || !time) { toast.error("Preencha serviço, cliente, data e horário."); return; }
    const selectedService = services.find((service: any) => service.id === serviceId);
    setBusy(true);
    const { error } = await db.from("appointments").insert({ user_id: null, professional_id: professional.id, service_id: serviceId, patient_name: patientName.trim(), patient_email: patientEmail.trim().toLowerCase(), patient_phone: patientPhone.trim(), scheduled_date: date, scheduled_time: time, notes: notes.trim(), status: "confirmado", payment_choice: "onsite", service_price_snapshot: Number(selectedService?.price ?? 0), deposit_percent: 0, deposit_amount: 0, balance_amount: Number(selectedService?.price ?? 0) });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Agendamento criado."); reset(); onClose(); await onSaved();
  };

  return <ModalShell open={open} onClose={() => { if (!busy) { reset(); onClose(); } }} title="Novo agendamento" description={`Adicionar atendimento diretamente à agenda de ${professional.name}.`} width="max-w-xl" footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button onClick={save} disabled={busy || !services.length || !slots.length}>{busy ? "Salvando..." : "Criar agendamento"}</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Serviço"><Select value={serviceId} onValueChange={setServiceId}><SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{services.map((service: any) => <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>)}</SelectContent></Select></Field></div>
      <div className="sm:col-span-2"><Field label="Cliente / paciente"><Input value={patientName} onChange={(e) => setPatientName(e.target.value)} /></Field></div>
      <Field label="Telefone"><Input value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} /></Field>
      <Field label="E-mail"><Input type="email" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} /></Field>
      <Field label="Data"><Input type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Horário"><Select value={time} onValueChange={setTime}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{slots.map((slot: any) => <SelectItem key={slot.id} value={slot.slot}>{slot.slot}</SelectItem>)}</SelectContent></Select></Field>
      <div className="sm:col-span-2"><Field label="Observações"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
    </div>
  </ModalShell>;
}

function HoursModal({ open, onClose, professional, slots, onSaved }: any) {
  const [newTime, setNewTime] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!newTime) { toast.error("Escolha um horário."); return; }
    setBusy(true);
    const { error } = await db.from("professional_time_slots").upsert({ professional_id: professional.id, slot: newTime, is_available: true, sort_order: Number(newTime.replace(":", "")) }, { onConflict: "professional_id,slot" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setNewTime(""); toast.success("Horário adicionado."); await onSaved();
  };

  return <ModalShell open={open} onClose={onClose} title={`Horários de ${professional.name}`} description="Ative, pause, adicione ou remova horários específicos desta profissional." width="max-w-xl">
    <div className="flex gap-2"><Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} /><Button type="button" onClick={add} disabled={busy}><Plus className="size-4" /> Adicionar horário</Button></div>
    <div className="mt-5 space-y-2">
      {slots.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhum horário cadastrado.</p> : slots.map((slot: any) => (
        <div key={slot.id} className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"><div><p className="font-semibold tabular-nums">{slot.slot}</p><p className="text-[10px] text-muted-foreground">{slot.is_available ? "Disponível para agendamento" : "Pausado"}</p></div><div className="flex items-center gap-2"><Switch checked={slot.is_available} onCheckedChange={async (checked) => { const { error } = await db.from("professional_time_slots").update({ is_available: checked, updated_at: new Date().toISOString() }).eq("id", slot.id); if (error) { toast.error(error.message); return; } await onSaved(); }} /><Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={async () => { if (!window.confirm(`Remover o horário ${slot.slot}?`)) return; const { error } = await db.from("professional_time_slots").delete().eq("id", slot.id); if (error) { toast.error(error.message); return; } toast.success("Horário removido."); await onSaved(); }}><Trash2 className="size-4" /></Button></div></div>
      ))}
    </div>
  </ModalShell>;
}

function Field({ label, children }: any) { return <div><Label>{label}</Label><div className="mt-2">{children}</div></div>; }
function ToggleBox({ title, detail, checked, onChange, disabled }: any) { return <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"><div><p className="text-sm font-medium">{title}</p><p className="text-[10px] text-muted-foreground">{detail}</p></div><Switch checked={checked} disabled={disabled} onCheckedChange={onChange} /></div>; }
function MiniStat({ label, value }: any) { return <div className="rounded-xl bg-secondary/60 px-2 py-2.5 text-center"><p className="text-lg font-semibold">{value}</p><p className="text-[9px] text-muted-foreground">{label}</p></div>; }
function Metric({ icon: Icon, label, value }: any) { return <div className="rounded-2xl border border-border bg-card p-3.5 shadow-soft sm:p-5"><span className="grid size-8 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-4" /></span><p className="mt-3 text-2xl font-semibold">{value}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p></div>; }
function CenteredMessage({ title, detail, action }: any) { return <div className="grid min-h-screen place-items-center bg-background px-5"><div className="max-w-md text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary"><ShieldCheck className="size-5" /></span><h1 className="mt-4 text-xl font-semibold">{title}</h1>{detail ? <p className="mt-2 text-sm text-muted-foreground">{detail}</p> : null}{action ? <div className="mt-5">{action}</div> : null}</div></div>; }
