import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
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
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import logo from "@/assets/jr-clinic-logo.png";
import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
      { name: "description", content: "Agendas individuais e acessos da equipe JR Clinic." },
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

function responseFor(appointment: any) {
  const response = appointment?.professional_response;
  return Array.isArray(response) ? response[0] ?? null : response ?? null;
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
  if (!isAdmin) return { isAdmin: false as const, currentEmail: userData.user.email ?? "" };

  const [professionals, access, appointments, services, serviceProfessionals, timeSlots] = await Promise.all([
    db
      .from("professionals")
      .select("id, name, specialty, avatar_url, is_active, sort_order, deleted_at")
      .is("deleted_at", null)
      .order("sort_order")
      .order("name"),
    db.from("professional_access").select("id, professional_id, email, enabled, created_by, created_at, updated_at").order("created_at"),
    db
      .from("appointments")
      .select("id, professional_id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, service:services(id, name, duration_min), professional_response:appointment_professional_responses(response, responded_at)")
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true }),
    db.from("services").select("id, name, duration_min, price, is_active").eq("is_active", true).order("name"),
    db.from("service_professionals").select("service_id, professional_id"),
    db.from("time_slots").select("slot, is_available, sort_order").eq("is_available", true).order("sort_order"),
  ]);

  for (const [name, result] of [
    ["profissionais", professionals],
    ["acessos", access],
    ["agenda", appointments],
    ["serviços", services],
    ["vínculos", serviceProfessionals],
    ["horários", timeSlots],
  ] as const) {
    if (result.error) throw new Error(`Falha ao carregar ${name}: ${result.error.message}`);
  }

  return {
    isAdmin: true as const,
    currentEmail: userData.user.email ?? "",
    professionals: professionals.data ?? [],
    access: access.data ?? [],
    appointments: appointments.data ?? [],
    services: services.data ?? [],
    serviceProfessionals: serviceProfessionals.data ?? [],
    timeSlots: timeSlots.data ?? [],
  };
}

function TeamAgendaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState("");

  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["team-agenda"], queryFn: loadTeamAgenda, retry: 1 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["team-agenda"] });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: undefined } });
  };

  if (isLoading) return <CenteredMessage title="Carregando agendas da equipe..." />;
  if (error) return <CenteredMessage title="Não foi possível carregar a equipe." detail={error instanceof Error ? error.message : "Erro inesperado."} action={<Button onClick={() => refetch()}>Tentar novamente</Button>} />;
  if (!data?.isAdmin) return <CenteredMessage title="Acesso administrativo necessário" detail="Colaboradores usam o portal individual e não podem abrir a gestão das agendas." action={<Button asChild><Link to="/profissional">Ir para minha agenda</Link></Button>} />;

  const selectedProfessional = selectedProfessionalId ? data.professionals.find((item: any) => item.id === selectedProfessionalId) ?? null : null;

  return (
    <div className="min-h-screen bg-background lg:pl-[252px]">
      <AdminSubpageSidebar active="team" />
      <header className="sticky top-0 z-40 border-b border-border/80 bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between px-4 sm:h-16 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logo} alt="JR Clinic" className="h-7 w-auto sm:h-9 lg:hidden" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Agenda da equipe</p>
              <p className="hidden text-[11px] text-muted-foreground sm:block">Gestão completa pelos administradores gerais</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-9" asChild><Link to="/admin"><ChevronLeft className="size-4" /> Painel</Link></Button>
            <Button variant="outline" size="sm" className="h-9 rounded-full" onClick={signOut}><LogOut className="size-4" /><span className="hidden sm:inline">Sair</span></Button>
          </div>
        </div>
      </header>

      {selectedProfessional ? (
        <ProfessionalAgendaView
          professional={selectedProfessional}
          access={data.access.find((item: any) => item.professional_id === selectedProfessional.id)}
          appointments={data.appointments.filter((item: any) => item.professional_id === selectedProfessional.id)}
          services={data.services}
          serviceProfessionals={data.serviceProfessionals}
          timeSlots={data.timeSlots}
          dateFilter={dateFilter}
          setDateFilter={setDateFilter}
          onBack={() => { setSelectedProfessionalId(null); setDateFilter(""); }}
          onDeleted={() => { setSelectedProfessionalId(null); setDateFilter(""); void refresh(); }}
          onSaved={refresh}
        />
      ) : (
        <TeamCardsView data={data} onOpenAgenda={setSelectedProfessionalId} onSaved={refresh} onRefresh={() => refetch()} />
      )}
    </div>
  );
}

function TeamCardsView({ data, onOpenAgenda, onSaved, onRefresh }: any) {
  const [createOpen, setCreateOpen] = useState(false);
  const today = todayIso();
  const activeProfessionals = data.professionals.filter((item: any) => item.is_active).length;
  const todayCount = data.appointments.filter((item: any) => item.scheduled_date === today && item.status !== "cancelado").length;
  const activeAccess = data.access.filter((item: any) => item.enabled).length;

  return (
    <main className="mx-auto max-w-[1480px] px-4 pb-16 pt-6 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <span className="eyebrow text-muted-foreground">Equipe</span>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Agendas da equipe</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Administradores gerais criam, editam, excluem e preenchem todas as agendas. Colaboradores enxergam somente a própria agenda no portal individual.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="rounded-full" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Criar agenda</Button>
          <Button variant="outline" className="rounded-full" onClick={onRefresh}><RefreshCw className="size-4" /> Atualizar</Button>
          <Button variant="outline" className="rounded-full" asChild><Link to="/admin/acessos"><ShieldCheck className="size-4" /> Acessos</Link></Button>
          <Button variant="outline" className="rounded-full" asChild><Link to="/profissional" target="_blank">Portal da equipe <ExternalLink className="size-3.5" /></Link></Button>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-3 gap-2.5 sm:max-w-2xl sm:gap-4">
        <Metric icon={Users} label="Agendas ativas" value={String(activeProfessionals)} />
        <Metric icon={CalendarDays} label="Hoje" value={String(todayCount)} />
        <Metric icon={ShieldCheck} label="Acessos ativos" value={String(activeAccess)} />
      </div>

      <section className="mt-9">
        <div className="flex items-end justify-between gap-4">
          <div><h2 className="text-lg font-semibold">Profissionais</h2><p className="mt-1 text-xs text-muted-foreground">Abra uma agenda para cadastrar e administrar os compromissos.</p></div>
          <Badge variant="outline" className="rounded-full">{data.professionals.length} agendas</Badge>
        </div>

        {data.professionals.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed border-border bg-card p-10 text-center"><UserRound className="mx-auto size-7 text-muted-foreground" /><h3 className="mt-4 text-base font-semibold">Nenhuma agenda criada</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Use o botão “Criar agenda” para cadastrar a primeira profissional.</p></div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {data.professionals.map((professional: any) => {
              const access = data.access.find((item: any) => item.professional_id === professional.id);
              const appointments = data.appointments.filter((item: any) => item.professional_id === professional.id);
              const todayAppointments = appointments.filter((item: any) => item.scheduled_date === today && item.status !== "cancelado");
              const upcoming = appointments.filter((item: any) => item.scheduled_date >= today && item.status !== "cancelado");
              const nextAppointment = upcoming[0];
              const linkedServices = data.serviceProfessionals.filter((item: any) => item.professional_id === professional.id).length;

              return (
                <article key={professional.id} className={`overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-elegant ${professional.is_active ? "" : "opacity-65"}`}>
                  <div className="flex items-start gap-4">
                    <ProfessionalAvatar professional={professional} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><h3 className="truncate text-xl font-semibold leading-tight">{professional.name}</h3><p className="mt-1 truncate text-xs text-muted-foreground">{professional.specialty || "Profissional JR Clinic"}</p></div>
                        <Badge variant={professional.is_active ? "default" : "secondary"} className="shrink-0 rounded-full text-[9px]">{professional.is_active ? "Ativa" : "Pausada"}</Badge>
                      </div>
                      <p className="mt-2.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"><Mail className="size-3 shrink-0" /><span className="truncate">{access?.email || "Sem acesso de colaborador"}</span></p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-2"><CardStat label="Hoje" value={String(todayAppointments.length)} /><CardStat label="Próximos" value={String(upcoming.length)} /><CardStat label="Serviços" value={String(linkedServices)} /></div>
                  <div className="mt-4 min-h-[74px] rounded-2xl bg-secondary/55 px-3.5 py-3">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Próximo atendimento</p>
                    {nextAppointment ? <div className="mt-2 flex items-end justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-semibold">{nextAppointment.patient_name}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{nextAppointment.service?.name || "Atendimento"}</p></div><div className="shrink-0 text-right"><p className="text-xs font-semibold text-primary">{nextAppointment.scheduled_time}</p><p className="text-[9px] text-muted-foreground">{formatDate(nextAppointment.scheduled_date)}</p></div></div> : <p className="mt-2 text-xs text-muted-foreground">Nenhum atendimento futuro.</p>}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2"><div className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${access?.enabled ? "bg-primary" : "bg-muted-foreground/30"}`} /><span className="text-[10px] text-muted-foreground">{access?.enabled ? "Colaborador liberado" : "Sem acesso ativo"}</span></div><Button size="sm" className="rounded-full px-4" onClick={() => onOpenAgenda(professional.id)}>Abrir agenda</Button></div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <CreateAgendaDialog open={createOpen} onOpenChange={setCreateOpen} professionals={data.professionals} services={data.services} onSaved={onSaved} />
    </main>
  );
}

function ProfessionalAgendaView({ professional, access, appointments, services, serviceProfessionals, timeSlots, dateFilter, setDateFilter, onBack, onDeleted, onSaved }: any) {
  const today = todayIso();
  const filteredAppointments = useMemo(() => appointments.filter((item: any) => dateFilter ? item.scheduled_date === dateFilter : true), [appointments, dateFilter]);
  const upcoming = appointments.filter((item: any) => item.scheduled_date >= today && item.status !== "cancelado");
  const confirmed = appointments.filter((item: any) => responseFor(item)?.response === "confirmado");
  const linkedServiceIds = serviceProfessionals.filter((item: any) => item.professional_id === professional.id).map((item: any) => item.service_id);

  const deleteAgenda = async () => {
    if (!window.confirm(`Excluir a agenda de ${professional.name}? O acesso do colaborador será removido e a agenda deixará de aparecer, mas o histórico de atendimentos será preservado.`)) return;
    const { error } = await db.rpc("delete_professional_agenda", { _professional_id: professional.id });
    if (error) return toast.error(error.message);
    toast.success("Agenda excluída com segurança.");
    onDeleted();
  };

  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-16 pt-6 sm:px-8 sm:py-10">
      <Button type="button" variant="ghost" className="-ml-2 rounded-full" onClick={onBack}><ArrowLeft className="size-4" /> Voltar para equipe</Button>
      <section className="mt-4 overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
        <div className="bg-primary px-5 py-5 text-primary-foreground sm:px-7 sm:py-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4"><ProfessionalAvatar professional={professional} className="size-16 sm:size-20" /><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">Agenda individual</p><h1 className="mt-1 truncate text-3xl font-semibold leading-tight sm:text-4xl">{professional.name}</h1><p className="mt-1 text-sm text-white/70">{professional.specialty || "Profissional JR Clinic"}</p></div></div>
            <div className="flex flex-wrap gap-2">
              <EditAgendaDialog
                professional={professional}
                access={access}
                services={services}
                linkedServiceIds={linkedServiceIds}
                onSaved={onSaved}
                trigger={<Button type="button" variant="secondary" className="rounded-full bg-white/12 text-white hover:bg-white/20"><Pencil className="size-4" /> Editar agenda</Button>}
              />
              <NewAppointmentDialog
                professional={professional}
                services={services}
                serviceProfessionals={serviceProfessionals}
                timeSlots={timeSlots}
                onSaved={onSaved}
                trigger={<Button type="button" className="rounded-full bg-white text-primary hover:bg-white/90"><CalendarPlus className="size-4" /> Novo agendamento</Button>}
              />
              <Button type="button" variant="secondary" className="rounded-full bg-white/12 text-white hover:bg-destructive hover:text-destructive-foreground" onClick={deleteAgenda}><Trash2 className="size-4" /> Excluir agenda</Button>
            </div>
          </div>
        </div>
        <div className="grid gap-3 border-t border-border/60 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-7"><div className="min-w-0"><p className="flex items-center gap-2 text-xs font-medium"><Mail className="size-3.5 text-primary" /> {access?.email || "Nenhum colaborador vinculado"}</p><p className="mt-1 text-[11px] text-muted-foreground">O colaborador vinculado vê somente esta agenda no portal individual.</p></div><Badge variant={access?.enabled ? "default" : "secondary"} className="w-fit rounded-full">{access?.enabled ? "Acesso ativo" : "Sem acesso ativo"}</Badge></div>
      </section>

      <div className="mt-5 grid grid-cols-3 gap-2.5 sm:gap-4"><Metric icon={Clock3} label="Próximos" value={String(upcoming.length)} /><Metric icon={CheckCircle2} label="Confirmados" value={String(confirmed.length)} /><Metric icon={CalendarPlus} label="Total" value={String(appointments.length)} /></div>

      <section className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-semibold sm:text-2xl">Atendimentos de {professional.name.split(" ")[0]}</h2><p className="mt-1 text-xs text-muted-foreground">Somente administradores gerais podem editar os compromissos desta agenda.</p></div><div className="flex gap-2"><Input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="h-10 rounded-xl sm:w-[180px]" />{dateFilter ? <Button variant="outline" className="rounded-xl" onClick={() => setDateFilter("")}>Limpar</Button> : null}</div></div>
        <div className="mt-4 space-y-3">{filteredAppointments.length === 0 ? <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center"><CalendarDays className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Nenhum atendimento nesta agenda.</p></div> : filteredAppointments.map((appointment: any) => <AppointmentCard key={appointment.id} appointment={appointment} onSaved={onSaved} />)}</div>
      </section>
    </main>
  );
}

function CreateAgendaDialog({ open, onOpenChange, professionals, services, onSaved }: any) {
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [email, setEmail] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => { setName(""); setSpecialty(""); setEmail(""); setServiceIds([]); };
  const toggleService = (id: string) => setServiceIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const save = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (name.trim().length < 2) return toast.error("Informe o nome da profissional.");
    if (normalizedEmail && !normalizedEmail.includes("@")) return toast.error("Informe um e-mail válido ou deixe o campo vazio.");

    setBusy(true);
    let createdProfessionalId: string | null = null;
    try {
      const maxSort = professionals.reduce((max: number, item: any) => Math.max(max, Number(item.sort_order ?? 0)), 0);
      const professionalResult = await db.from("professionals").insert({ name: name.trim(), specialty: specialty.trim(), is_active: true, sort_order: maxSort + 1, deleted_at: null }).select("id").single();
      if (professionalResult.error) throw professionalResult.error;
      createdProfessionalId = professionalResult.data.id;

      if (normalizedEmail) {
        const { data: userData } = await supabase.auth.getUser();
        const accessResult = await db.from("professional_access").insert({ professional_id: createdProfessionalId, email: normalizedEmail, enabled: true, created_by: userData.user?.id ?? null, updated_at: new Date().toISOString() });
        if (accessResult.error) throw accessResult.error;
      }

      if (serviceIds.length) {
        const linkResult = await db.from("service_professionals").insert(serviceIds.map((serviceId) => ({ service_id: serviceId, professional_id: createdProfessionalId })));
        if (linkResult.error) throw linkResult.error;
      }

      toast.success(`Agenda de ${name.trim()} criada.`);
      reset(); onOpenChange(false); onSaved();
    } catch (error: any) {
      if (createdProfessionalId) {
        await db.from("professional_access").delete().eq("professional_id", createdProfessionalId);
        await db.from("service_professionals").delete().eq("professional_id", createdProfessionalId);
        await db.from("professionals").delete().eq("id", createdProfessionalId);
      }
      const message = String(error?.message || "Não foi possível criar a agenda.");
      toast.error(message.includes("professional_access_email_unique") ? "Este e-mail já está vinculado a outra agenda." : message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value && !busy) reset(); }}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-2xl sm:p-6">
        <DialogHeader><DialogTitle>Criar agenda</DialogTitle><DialogDescription>Cadastre a profissional e, se quiser, já libere o acesso de colaborador por e-mail.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div><Label>Nome</Label><Input className="mt-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" /></div>
          <div><Label>Cargo / especialidade</Label><Input className="mt-2" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Ex.: Dentista" /></div>
          <div className="sm:col-span-2"><Label>E-mail do colaborador <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input className="mt-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colaborador@email.com" /><p className="mt-1.5 text-[11px] text-muted-foreground">Se ficar vazio, a agenda será criada normalmente e o acesso poderá ser liberado depois em Acessos.</p></div>
          <div className="sm:col-span-2"><Label>Serviços atendidos</Label><div className="mt-2 grid max-h-56 gap-2 overflow-y-auto rounded-2xl border border-border p-2 sm:grid-cols-2">{services.map((service: any) => { const selected = serviceIds.includes(service.id); return <button key={service.id} type="button" onClick={() => toggleService(service.id)} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition ${selected ? "border-primary bg-primary-soft text-primary" : "border-border bg-background hover:border-primary/30"}`}><span className={`grid size-4 shrink-0 place-items-center rounded-md border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selected ? <Check className="size-3" /> : null}</span><span className="truncate font-medium">{service.name}</span></button>; })}</div></div>
        </div>
        <DialogFooter><Button className="w-full rounded-full sm:w-auto" disabled={busy} onClick={save}>{busy ? "Criando..." : "Criar agenda"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditAgendaDialog({ trigger, professional, access, services, linkedServiceIds, onSaved }: any) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(professional.name ?? "");
  const [specialty, setSpecialty] = useState(professional.specialty ?? "");
  const [email, setEmail] = useState(access?.email ?? "");
  const [enabled, setEnabled] = useState(access?.enabled ?? true);
  const [active, setActive] = useState(professional.is_active ?? true);
  const [serviceIds, setServiceIds] = useState<string[]>(linkedServiceIds ?? []);
  const [busy, setBusy] = useState(false);

  const resetFromProps = () => { setName(professional.name ?? ""); setSpecialty(professional.specialty ?? ""); setEmail(access?.email ?? ""); setEnabled(access?.enabled ?? true); setActive(professional.is_active ?? true); setServiceIds(linkedServiceIds ?? []); };
  const toggleService = (id: string) => setServiceIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const save = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (name.trim().length < 2) return toast.error("Informe um nome válido.");
    if (normalizedEmail && !normalizedEmail.includes("@")) return toast.error("Informe um e-mail válido ou deixe o campo vazio.");
    setBusy(true);
    try {
      const professionalResult = await db.from("professionals").update({ name: name.trim(), specialty: specialty.trim(), is_active: active }).eq("id", professional.id);
      if (professionalResult.error) throw professionalResult.error;

      if (normalizedEmail) {
        const { data: userData } = await supabase.auth.getUser();
        const accessResult = await db.from("professional_access").upsert({ professional_id: professional.id, email: normalizedEmail, enabled, created_by: access?.created_by ?? userData.user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "professional_id" });
        if (accessResult.error) throw accessResult.error;
      } else if (access?.id) {
        const removeAccess = await db.from("professional_access").delete().eq("id", access.id);
        if (removeAccess.error) throw removeAccess.error;
      }

      const removeLinks = await db.from("service_professionals").delete().eq("professional_id", professional.id);
      if (removeLinks.error) throw removeLinks.error;
      if (serviceIds.length) {
        const insertLinks = await db.from("service_professionals").insert(serviceIds.map((serviceId) => ({ service_id: serviceId, professional_id: professional.id })));
        if (insertLinks.error) throw insertLinks.error;
      }

      toast.success("Agenda atualizada."); setOpen(false); onSaved();
    } catch (error: any) {
      const message = String(error?.message || "Não foi possível atualizar a agenda.");
      toast.error(message.includes("professional_access_email_unique") ? "Este e-mail já está vinculado a outra agenda." : message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (value) resetFromProps(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-2xl sm:p-6">
        <DialogHeader><DialogTitle>Editar agenda de {professional.name}</DialogTitle><DialogDescription>Altere perfil, serviços, estado da agenda e acesso do colaborador.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div><Label>Nome</Label><Input className="mt-2" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Cargo / especialidade</Label><Input className="mt-2" value={specialty} onChange={(e) => setSpecialty(e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>E-mail do colaborador</Label><Input className="mt-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Deixe vazio para remover o acesso" /></div>
          <div className="flex items-center justify-between rounded-2xl border border-border px-3.5 py-3"><div><p className="text-sm font-medium">Agenda ativa</p><p className="text-[10px] text-muted-foreground">Disponível para novos agendamentos.</p></div><Switch checked={active} onCheckedChange={setActive} /></div>
          <div className="flex items-center justify-between rounded-2xl border border-border px-3.5 py-3"><div><p className="text-sm font-medium">Acesso do colaborador</p><p className="text-[10px] text-muted-foreground">Permite abrir o portal individual.</p></div><Switch checked={enabled} disabled={!email.trim()} onCheckedChange={setEnabled} /></div>
          <div className="sm:col-span-2"><Label>Serviços vinculados</Label><div className="mt-2 grid max-h-56 gap-2 overflow-y-auto rounded-2xl border border-border p-2 sm:grid-cols-2">{services.map((service: any) => { const selected = serviceIds.includes(service.id); return <button key={service.id} type="button" onClick={() => toggleService(service.id)} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition ${selected ? "border-primary bg-primary-soft text-primary" : "border-border bg-background hover:border-primary/30"}`}><span className={`grid size-4 shrink-0 place-items-center rounded-md border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selected ? <Check className="size-3" /> : null}</span><span className="truncate font-medium">{service.name}</span></button>; })}</div></div>
        </div>
        <DialogFooter><Button type="button" className="w-full rounded-full sm:w-auto" disabled={busy} onClick={save}>{busy ? "Salvando..." : "Salvar alterações"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewAppointmentDialog({ trigger, professional, services, serviceProfessionals, timeSlots, onSaved }: any) {
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [scheduledDate, setScheduledDate] = useState(todayIso());
  const [scheduledTime, setScheduledTime] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const availableServices = useMemo(() => {
    const linked = new Set(serviceProfessionals.filter((item: any) => item.professional_id === professional.id).map((item: any) => item.service_id));
    return services.filter((service: any) => linked.has(service.id));
  }, [professional.id, services, serviceProfessionals]);
  const reset = () => { setServiceId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setScheduledDate(todayIso()); setScheduledTime(""); setNotes(""); };

  const save = async () => {
    if (!serviceId || !patientName.trim() || !scheduledDate || !scheduledTime) return toast.error("Preencha serviço, cliente, data e horário.");
    const selectedService = availableServices.find((service: any) => service.id === serviceId);
    setBusy(true);
    const { error } = await db.from("appointments").insert({
      user_id: null,
      professional_id: professional.id,
      service_id: serviceId,
      patient_name: patientName.trim(),
      patient_email: patientEmail.trim().toLowerCase(),
      patient_phone: patientPhone.trim(),
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      notes: notes.trim(),
      status: "pendente",
      payment_choice: "onsite",
      service_price_snapshot: Number(selectedService?.price ?? 0),
      deposit_percent: 0,
      deposit_amount: 0,
      balance_amount: Number(selectedService?.price ?? 0),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Agendamento adicionado à agenda de ${professional.name}.`);
    reset(); setOpen(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value && !busy) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-xl sm:p-6">
        <DialogHeader><DialogTitle>Novo agendamento</DialogTitle><DialogDescription>Cadastre um atendimento diretamente na agenda de {professional.name}.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Serviço</Label><Select value={serviceId} onValueChange={setServiceId} disabled={!availableServices.length}><SelectTrigger className="mt-2"><SelectValue placeholder={availableServices.length ? "Selecione o serviço" : "Nenhum serviço vinculado"} /></SelectTrigger><SelectContent>{availableServices.map((service: any) => <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="sm:col-span-2"><Label>Cliente / paciente</Label><Input className="mt-2" value={patientName} onChange={(e) => setPatientName(e.target.value)} /></div>
          <div><Label>Telefone</Label><Input className="mt-2" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} /></div>
          <div><Label>E-mail <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input className="mt-2" type="email" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} /></div>
          <div><Label>Data</Label><Input className="mt-2" type="date" min={todayIso()} value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} /></div>
          <div><Label>Horário</Label><Select value={scheduledTime} onValueChange={setScheduledTime}><SelectTrigger className="mt-2"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{timeSlots.map((slot: any) => <SelectItem key={slot.slot} value={slot.slot}>{slot.slot}</SelectItem>)}</SelectContent></Select></div>
          <div className="sm:col-span-2"><Label>Observações</Label><Textarea className="mt-2" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter><Button type="button" className="w-full rounded-full sm:w-auto" disabled={busy || !availableServices.length} onClick={save}>{busy ? "Adicionando..." : "Adicionar à agenda"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AppointmentCard({ appointment, onSaved }: any) {
  const [deleting, setDeleting] = useState(false);
  const updateStatus = async (status: string) => {
    if (status === "aguardando_pagamento") return;
    const { error } = await db.from("appointments").update({ status }).eq("id", appointment.id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado."); onSaved?.();
  };
  const deleteAppointment = async () => {
    if (!window.confirm(`Apagar o agendamento de ${appointment.patient_name}?`)) return;
    setDeleting(true); const { error } = await db.from("appointments").delete().eq("id", appointment.id); setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("Agendamento apagado."); onSaved?.();
  };
  const professionalResponse = responseFor(appointment);
  const statusValue = ["pendente", "confirmado", "cancelado", "aguardando_pagamento"].includes(appointment.status) ? appointment.status : "pendente";

  return (
    <article className={`rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5 ${appointment.status === "cancelado" ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-base font-semibold">{appointment.patient_name}</p><StatusBadge status={appointment.status} />{professionalResponse?.response === "confirmado" ? <Badge className="rounded-full bg-primary-soft text-[10px] text-primary hover:bg-primary-soft"><CheckCircle2 className="mr-1 size-3" /> Profissional confirmou</Badge> : null}</div><p className="mt-1 text-xs text-muted-foreground">{appointment.service?.name || "Serviço"}</p></div><div className="shrink-0 text-right"><p className="text-base font-semibold tabular-nums">{appointment.scheduled_time}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(appointment.scheduled_date)}</p></div></div>
      <div className="mt-3 grid gap-1 border-t border-border/70 pt-3 text-xs text-muted-foreground sm:grid-cols-2"><p>{appointment.patient_phone || "Telefone não informado"}</p><p className="truncate sm:text-right">{appointment.patient_email || "E-mail não informado"}</p></div>
      {appointment.notes ? <p className="mt-2 rounded-xl bg-secondary/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{appointment.notes}</p> : null}
      <div className="mt-3 flex items-center justify-end gap-2"><Button type="button" variant="ghost" size="icon" className="size-9 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={deleteAppointment} disabled={deleting}><Trash2 className="size-3.5" /></Button><Select value={statusValue} onValueChange={updateStatus}><SelectTrigger className="h-9 w-[178px] rounded-xl text-xs font-medium"><SelectValue /></SelectTrigger><SelectContent>{statusValue === "aguardando_pagamento" ? <SelectItem value="aguardando_pagamento" disabled>Aguardando pagamento</SelectItem> : null}<SelectItem value="pendente">Pendente</SelectItem><SelectItem value="confirmado">Confirmado</SelectItem><SelectItem value="cancelado">Cancelado</SelectItem></SelectContent></Select></div>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "confirmado" ? "default" : status === "cancelado" ? "secondary" : "outline";
  const label = status === "confirmado" ? "Confirmado" : status === "cancelado" ? "Cancelado" : status === "aguardando_pagamento" ? "Aguardando pagamento" : "Pendente";
  return <Badge variant={variant as any} className="rounded-full text-[10px]">{label}</Badge>;
}

function CardStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border/70 bg-background/60 px-2 py-2.5 text-center"><p className="text-lg font-semibold tabular-nums">{value}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{label}</p></div>;
}

function Metric({ icon: Icon, label, value }: any) {
  return <div className="rounded-2xl border border-border bg-card p-3.5 shadow-soft sm:p-5"><span className="grid size-8 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-4" /></span><p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">{label}</p></div>;
}

function CenteredMessage({ title, detail, action }: any) {
  return <div className="grid min-h-screen place-items-center bg-background px-5"><div className="max-w-md text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary"><ShieldCheck className="size-5" /></span><h1 className="mt-4 text-xl font-semibold">{title}</h1>{detail ? <p className="mt-2 text-sm text-muted-foreground">{detail}</p> : null}{action ? <div className="mt-5">{action}</div> : null}</div></div>;
}
