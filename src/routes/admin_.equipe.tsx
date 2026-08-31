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
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import logo from "@/assets/jr-clinic-logo.png";
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

function responseFor(appointment: any) {
  const response = appointment?.professional_response;
  return Array.isArray(response) ? response[0] ?? null : response ?? null;
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "JR";
}

async function loadTeamAgenda() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");

  const roles = await db.from("user_roles").select("role").eq("user_id", userData.user.id);
  if (roles.error) throw roles.error;
  const isAdmin = (roles.data ?? []).some((item: any) => item.role === "admin");
  if (!isAdmin) return { isAdmin: false as const, currentEmail: userData.user.email ?? "" };

  const [professionals, access, appointments, services, serviceProfessionals] = await Promise.all([
    db.from("professionals").select("id, name, specialty, is_active, sort_order").order("sort_order").order("name"),
    db.from("professional_access").select("id, professional_id, email, enabled, created_at, updated_at").order("created_at"),
    db
      .from("appointments")
      .select(
        "id, professional_id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, service:services(id, name, duration_min), professional:professionals(id, name, specialty), professional_response:appointment_professional_responses(response, responded_at)",
      )
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true }),
    db.from("services").select("id, name, duration_min, is_active").eq("is_active", true).order("name"),
    db.from("service_professionals").select("service_id, professional_id"),
  ]);

  for (const [name, result] of [
    ["profissionais", professionals],
    ["acessos", access],
    ["agenda", appointments],
    ["serviços", services],
    ["vínculos", serviceProfessionals],
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
  };
}

function TeamAgendaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["team-agenda"],
    queryFn: loadTeamAgenda,
    retry: 1,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["team-agenda"] });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: undefined } });
  };

  if (isLoading) return <CenteredMessage title="Carregando agendas da equipe..." />;

  if (error) {
    return (
      <CenteredMessage
        title="Não foi possível carregar a equipe."
        detail={error instanceof Error ? error.message : "Erro inesperado."}
        action={<Button onClick={() => refetch()}>Tentar novamente</Button>}
      />
    );
  }

  if (!data?.isAdmin) {
    return (
      <CenteredMessage
        icon={<ShieldCheck className="size-5" />}
        title="Acesso administrativo necessário"
        detail="Esta área é exclusiva da recepção e administração da JR Clinic."
        action={<Button asChild><Link to="/">Voltar ao site</Link></Button>}
      />
    );
  }

  const selectedProfessional = selectedProfessionalId
    ? data.professionals.find((item: any) => item.id === selectedProfessionalId) ?? null
    : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between px-4 sm:h-16 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logo} alt="JR Clinic" className="h-7 w-auto sm:h-9" />
            <span className="hidden h-6 w-px bg-border sm:block" />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold">Agenda da equipe</p>
              <p className="text-[11px] text-muted-foreground">Uma agenda para cada profissional</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-9" asChild>
              <Link to="/admin"><ChevronLeft className="size-4" /> Painel</Link>
            </Button>
            <Button variant="outline" size="sm" className="h-9 rounded-full" onClick={signOut}>
              <LogOut className="size-4" /><span className="hidden sm:inline">Sair</span>
            </Button>
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
          dateFilter={dateFilter}
          setDateFilter={setDateFilter}
          onBack={() => { setSelectedProfessionalId(null); setDateFilter(""); }}
          onSaved={refresh}
        />
      ) : (
        <TeamCardsView
          data={data}
          onOpenAgenda={setSelectedProfessionalId}
          onSaved={refresh}
          onRefresh={() => refetch()}
        />
      )}
    </div>
  );
}

function TeamCardsView({ data, onOpenAgenda, onSaved, onRefresh }: any) {
  const today = todayIso();
  const activeProfessionals = data.professionals.filter((item: any) => item.is_active).length;
  const todayCount = data.appointments.filter((item: any) => item.scheduled_date === today && item.status !== "cancelado").length;
  const activeAccess = data.access.filter((item: any) => item.enabled).length;

  return (
    <main className="mx-auto max-w-[1480px] px-4 pb-16 pt-6 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="eyebrow text-muted-foreground">Equipe</span>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Agendas da equipe</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Cada card representa uma profissional. Abra o perfil para cadastrar atendimentos, acompanhar a agenda e configurar o acesso individual por e-mail.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CreateAgendaDialog
            professionals={data.professionals}
            services={data.services}
            onSaved={onSaved}
          />
          <Button variant="outline" className="rounded-full" onClick={onRefresh}>
            <RefreshCw className="size-4" /> Atualizar
          </Button>
          <Button variant="outline" className="rounded-full" asChild>
            <Link to="/profissional" target="_blank">Portal da equipe <ExternalLink className="size-3.5" /></Link>
          </Button>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-3 gap-2.5 sm:max-w-2xl sm:gap-4">
        <Metric icon={Users} label="Agendas ativas" value={String(activeProfessionals)} />
        <Metric icon={CalendarDays} label="Hoje" value={String(todayCount)} />
        <Metric icon={ShieldCheck} label="Acessos ativos" value={String(activeAccess)} />
      </div>

      <section className="mt-9">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Profissionais</h2>
            <p className="mt-1 text-xs text-muted-foreground">Clique em uma agenda para abrir os compromissos daquele funcionário.</p>
          </div>
          <Badge variant="outline" className="rounded-full">{data.professionals.length} agendas</Badge>
        </div>

        {data.professionals.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed border-border bg-card p-10 text-center">
            <UserRound className="mx-auto size-7 text-muted-foreground" />
            <h3 className="mt-4 text-base font-semibold">Nenhuma agenda criada</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Crie a primeira agenda da equipe e vincule o e-mail que o funcionário usará para entrar.</p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.professionals.map((professional: any) => {
              const access = data.access.find((item: any) => item.professional_id === professional.id);
              const appointments = data.appointments.filter((item: any) => item.professional_id === professional.id);
              const todayAppointments = appointments.filter((item: any) => item.scheduled_date === today && item.status !== "cancelado");
              const upcoming = appointments.filter((item: any) => item.scheduled_date >= today && item.status !== "cancelado");
              const nextAppointment = upcoming[0];
              const linkedServices = data.serviceProfessionals.filter((item: any) => item.professional_id === professional.id).length;

              return (
                <article
                  key={professional.id}
                  className={`group relative overflow-hidden rounded-3xl border bg-card p-5 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-elegant ${professional.is_active ? "border-border" : "border-border opacity-65"}`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
                      {initials(professional.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold">{professional.name}</h3>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{professional.specialty || "Profissional JR Clinic"}</p>
                        </div>
                        <Badge variant={professional.is_active ? "default" : "secondary"} className="shrink-0 rounded-full text-[9px]">
                          {professional.is_active ? "Ativa" : "Pausada"}
                        </Badge>
                      </div>
                      <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Mail className="size-3 shrink-0" />
                        <span className="truncate">{access?.email || "E-mail de acesso não configurado"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-2">
                    <CardStat label="Hoje" value={String(todayAppointments.length)} />
                    <CardStat label="Próximos" value={String(upcoming.length)} />
                    <CardStat label="Serviços" value={String(linkedServices)} />
                  </div>

                  <div className="mt-4 min-h-[74px] rounded-2xl bg-secondary/55 px-3.5 py-3">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Próximo atendimento</p>
                    {nextAppointment ? (
                      <div className="mt-2 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">{nextAppointment.patient_name}</p>
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{nextAppointment.service?.name || "Atendimento"}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs font-semibold text-primary">{nextAppointment.scheduled_time}</p>
                          <p className="text-[9px] text-muted-foreground">{formatDate(nextAppointment.scheduled_date)}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Nenhum atendimento futuro.</p>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${access?.enabled ? "bg-primary" : "bg-muted-foreground/30"}`} />
                      <span className="text-[10px] text-muted-foreground">{access?.enabled ? "Acesso liberado" : "Acesso não liberado"}</span>
                    </div>
                    <Button size="sm" className="rounded-full px-4" onClick={() => onOpenAgenda(professional.id)}>
                      Abrir agenda
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function ProfessionalAgendaView({ professional, access, appointments, services, serviceProfessionals, dateFilter, setDateFilter, onBack, onSaved }: any) {
  const today = todayIso();
  const filteredAppointments = useMemo(
    () => appointments.filter((item: any) => (dateFilter ? item.scheduled_date === dateFilter : true)),
    [appointments, dateFilter],
  );
  const todayAppointments = appointments.filter((item: any) => item.scheduled_date === today && item.status !== "cancelado");
  const upcoming = appointments.filter((item: any) => item.scheduled_date >= today && item.status !== "cancelado");
  const confirmed = appointments.filter((item: any) => responseFor(item)?.response === "confirmado");
  const linkedServiceIds = serviceProfessionals
    .filter((item: any) => item.professional_id === professional.id)
    .map((item: any) => item.service_id);

  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-16 pt-6 sm:px-8 sm:py-10">
      <Button variant="ghost" className="-ml-2 rounded-full" onClick={onBack}>
        <ArrowLeft className="size-4" /> Voltar para equipe
      </Button>

      <section className="mt-4 overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
        <div className="bg-primary px-5 py-5 text-primary-foreground sm:px-7 sm:py-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/14 text-base font-semibold ring-1 ring-white/15">
                {initials(professional.name)}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">Agenda individual</p>
                <h1 className="mt-1 truncate text-2xl font-semibold sm:text-3xl">{professional.name}</h1>
                <p className="mt-1 text-sm text-white/70">{professional.specialty || "Profissional JR Clinic"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <EditAgendaDialog
                professional={professional}
                access={access}
                services={services}
                linkedServiceIds={linkedServiceIds}
                onSaved={onSaved}
              />
              <NewAppointmentEditor
                professional={professional}
                services={services}
                serviceProfessionals={serviceProfessionals}
                onSaved={onSaved}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-t border-border/60 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-7">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium"><Mail className="size-3.5 text-primary" /> {access?.email || "E-mail ainda não configurado"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Quando este e-mail entrar em /profissional, verá somente esta agenda.</p>
          </div>
          <Badge variant={access?.enabled ? "default" : "secondary"} className="w-fit rounded-full">
            {access?.enabled ? "Acesso ativo" : "Acesso pausado"}
          </Badge>
        </div>
      </section>

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-4">
        <Metric icon={CalendarDays} label="Hoje" value={String(todayAppointments.length)} />
        <Metric icon={Clock3} label="Próximos" value={String(upcoming.length)} />
        <Metric icon={CheckCircle2} label="Confirmados" value={String(confirmed.length)} />
        <Metric icon={CalendarPlus} label="Total" value={String(appointments.length)} />
      </div>

      <section className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Atendimentos de {professional.name.split(" ")[0]}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Cadastre e gerencie os compromissos diretamente nesta agenda.</p>
          </div>
          <div className="flex gap-2">
            <Input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="h-10 rounded-xl sm:w-[180px]" />
            {dateFilter ? <Button variant="outline" className="rounded-xl" onClick={() => setDateFilter("")}>Limpar</Button> : null}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {filteredAppointments.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
              <CalendarDays className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Nenhum atendimento nesta agenda.</p>
              <p className="mt-1 text-xs text-muted-foreground">Use “Novo agendamento” para cadastrar um compromisso para esta profissional.</p>
            </div>
          ) : filteredAppointments.map((appointment: any) => (
            <AppointmentCard key={appointment.id} appointment={appointment} onSaved={onSaved} />
          ))}
        </div>
      </section>
    </main>
  );
}

function CreateAgendaDialog({ professionals, services, onSaved }: any) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [email, setEmail] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setSpecialty("");
    setEmail("");
    setServiceIds([]);
  };

  const toggleService = (id: string) => {
    setServiceIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const save = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (name.trim().length < 2 || !normalizedEmail.includes("@")) {
      toast.error("Informe o nome e um e-mail válido para criar a agenda.");
      return;
    }

    setBusy(true);
    let createdProfessionalId: string | null = null;
    try {
      const maxSort = professionals.reduce((max: number, item: any) => Math.max(max, Number(item.sort_order ?? 0)), 0);
      const professionalResult = await db
        .from("professionals")
        .insert({ name: name.trim(), specialty: specialty.trim(), is_active: true, sort_order: maxSort + 1 })
        .select("id")
        .single();
      if (professionalResult.error) throw professionalResult.error;
      createdProfessionalId = professionalResult.data.id;

      const { data: userData } = await supabase.auth.getUser();
      const accessResult = await db.from("professional_access").insert({
        professional_id: createdProfessionalId,
        email: normalizedEmail,
        enabled: true,
        created_by: userData.user?.id ?? null,
        updated_at: new Date().toISOString(),
      });
      if (accessResult.error) throw accessResult.error;

      if (serviceIds.length > 0) {
        const linkResult = await db.from("service_professionals").insert(
          serviceIds.map((serviceId) => ({ service_id: serviceId, professional_id: createdProfessionalId })),
        );
        if (linkResult.error) throw linkResult.error;
      }

      toast.success(`Agenda de ${name.trim()} criada.`);
      setOpen(false);
      reset();
      onSaved();
    } catch (error: any) {
      if (createdProfessionalId) {
        await db.from("professional_access").delete().eq("professional_id", createdProfessionalId);
        await db.from("service_professionals").delete().eq("professional_id", createdProfessionalId);
        await db.from("professionals").delete().eq("id", createdProfessionalId);
      }
      toast.error(error?.message || "Não foi possível criar a agenda.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value && !busy) reset(); }}>
      <DialogTrigger asChild>
        <Button className="rounded-full"><Plus className="size-4" /> Criar agenda</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>Criar agenda de funcionário</DialogTitle>
          <DialogDescription>Crie o perfil, vincule o e-mail de acesso e escolha quais serviços esta pessoa atende.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2 rounded-2xl bg-secondary/55 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Prévia do perfil</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">{initials(name || "JR")}</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{name.trim() || "Nome do funcionário"}</p>
                <p className="truncate text-xs text-muted-foreground">{specialty.trim() || "Cargo / especialidade"}</p>
              </div>
            </div>
          </div>

          <div>
            <Label>Nome</Label>
            <Input className="mt-2" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome completo" />
          </div>
          <div>
            <Label>Cargo / especialidade</Label>
            <Input className="mt-2" value={specialty} onChange={(event) => setSpecialty(event.target.value)} placeholder="Ex.: Dentista" />
          </div>
          <div className="sm:col-span-2">
            <Label>E-mail de acesso</Label>
            <Input className="mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="funcionario@email.com" />
            <p className="mt-1.5 text-[11px] text-muted-foreground">Este é o e-mail que dará acesso somente à agenda deste perfil.</p>
          </div>

          <div className="sm:col-span-2">
            <Label>Serviços que este funcionário atende</Label>
            <div className="mt-2 grid max-h-56 grid-cols-1 gap-2 overflow-y-auto rounded-2xl border border-border p-2 sm:grid-cols-2">
              {services.map((service: any) => {
                const selected = serviceIds.includes(service.id);
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => toggleService(service.id)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition ${selected ? "border-primary bg-primary-soft text-primary" : "border-border bg-background hover:border-primary/30"}`}
                  >
                    <span className={`grid size-4 shrink-0 place-items-center rounded-md border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                      {selected ? <Check className="size-3" /> : null}
                    </span>
                    <span className="truncate font-medium">{service.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full rounded-full sm:w-auto" disabled={busy} onClick={save}>{busy ? "Criando..." : "Criar agenda"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditAgendaDialog({ professional, access, services, linkedServiceIds, onSaved }: any) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(professional.name ?? "");
  const [specialty, setSpecialty] = useState(professional.specialty ?? "");
  const [email, setEmail] = useState(access?.email ?? "");
  const [enabled, setEnabled] = useState(access?.enabled ?? true);
  const [active, setActive] = useState(professional.is_active ?? true);
  const [serviceIds, setServiceIds] = useState<string[]>(linkedServiceIds ?? []);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(professional.name ?? "");
    setSpecialty(professional.specialty ?? "");
    setEmail(access?.email ?? "");
    setEnabled(access?.enabled ?? true);
    setActive(professional.is_active ?? true);
    setServiceIds(linkedServiceIds ?? []);
  }, [open, professional, access, linkedServiceIds]);

  const toggleService = (id: string) => {
    setServiceIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const save = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (name.trim().length < 2 || !normalizedEmail.includes("@")) {
      toast.error("Informe um nome e um e-mail válido.");
      return;
    }

    setBusy(true);
    try {
      const professionalResult = await db.from("professionals").update({
        name: name.trim(), specialty: specialty.trim(), is_active: active,
      }).eq("id", professional.id);
      if (professionalResult.error) throw professionalResult.error;

      const { data: userData } = await supabase.auth.getUser();
      const accessResult = await db.from("professional_access").upsert({
        professional_id: professional.id,
        email: normalizedEmail,
        enabled,
        created_by: access?.created_by ?? userData.user?.id ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "professional_id" });
      if (accessResult.error) throw accessResult.error;

      const removeResult = await db.from("service_professionals").delete().eq("professional_id", professional.id);
      if (removeResult.error) throw removeResult.error;
      if (serviceIds.length > 0) {
        const insertResult = await db.from("service_professionals").insert(
          serviceIds.map((serviceId) => ({ service_id: serviceId, professional_id: professional.id })),
        );
        if (insertResult.error) throw insertResult.error;
      }

      toast.success("Perfil e agenda atualizados.");
      setOpen(false);
      onSaved();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível atualizar a agenda.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="rounded-full bg-white/12 text-white hover:bg-white/20"><Pencil className="size-4" /> Editar perfil</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>Editar agenda de {professional.name}</DialogTitle>
          <DialogDescription>Altere o perfil, o e-mail de acesso e os serviços vinculados.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div><Label>Nome</Label><Input className="mt-2" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Cargo / especialidade</Label><Input className="mt-2" value={specialty} onChange={(e) => setSpecialty(e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>E-mail de acesso</Label><Input className="mt-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>

          <div className="flex items-center justify-between rounded-2xl border border-border px-3.5 py-3">
            <div><p className="text-sm font-medium">Agenda ativa</p><p className="text-[10px] text-muted-foreground">Aparece para novos agendamentos.</p></div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-border px-3.5 py-3">
            <div><p className="text-sm font-medium">Acesso do funcionário</p><p className="text-[10px] text-muted-foreground">Permite entrar no portal individual.</p></div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="sm:col-span-2">
            <Label>Serviços vinculados</Label>
            <div className="mt-2 grid max-h-56 grid-cols-1 gap-2 overflow-y-auto rounded-2xl border border-border p-2 sm:grid-cols-2">
              {services.map((service: any) => {
                const selected = serviceIds.includes(service.id);
                return (
                  <button key={service.id} type="button" onClick={() => toggleService(service.id)} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition ${selected ? "border-primary bg-primary-soft text-primary" : "border-border bg-background hover:border-primary/30"}`}>
                    <span className={`grid size-4 shrink-0 place-items-center rounded-md border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selected ? <Check className="size-3" /> : null}</span>
                    <span className="truncate font-medium">{service.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter><Button className="w-full rounded-full sm:w-auto" disabled={busy} onClick={save}>{busy ? "Salvando..." : "Salvar alterações"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewAppointmentEditor({ professional, services, serviceProfessionals, onSaved }: any) {
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

  const reset = () => {
    setServiceId(""); setPatientName(""); setPatientEmail(""); setPatientPhone(""); setScheduledDate(todayIso()); setScheduledTime(""); setNotes("");
  };

  const save = async () => {
    if (!serviceId || !patientName.trim() || !scheduledDate || !scheduledTime) {
      toast.error("Preencha serviço, cliente, data e horário.");
      return;
    }

    setBusy(true);
    try {
      const conflict = await db
        .from("appointments")
        .select("id")
        .eq("professional_id", professional.id)
        .eq("scheduled_date", scheduledDate)
        .eq("scheduled_time", scheduledTime)
        .neq("status", "cancelado")
        .limit(1);
      if (conflict.error) throw conflict.error;
      if ((conflict.data ?? []).length > 0) throw new Error(`${professional.name} já possui um compromisso nesse horário.`);

      const result = await db.from("appointments").insert({
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
      });
      if (result.error) throw result.error;

      toast.success(`Agendamento adicionado à agenda de ${professional.name}.`);
      setOpen(false);
      reset();
      onSaved();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível criar o agendamento.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value && !busy) reset(); }}>
      <DialogTrigger asChild>
        <Button className="rounded-full bg-white text-primary hover:bg-white/90"><CalendarPlus className="size-4" /> Novo agendamento</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle>Novo agendamento</DialogTitle>
          <DialogDescription>Este atendimento será cadastrado diretamente na agenda de {professional.name}.</DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl bg-primary-soft/70 px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Agenda selecionada</p>
          <p className="mt-1 text-sm font-semibold">{professional.name}</p>
          <p className="text-xs text-muted-foreground">{professional.specialty}</p>
        </div>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Serviço</Label>
            <Select value={serviceId} onValueChange={setServiceId} disabled={availableServices.length === 0}>
              <SelectTrigger className="mt-2"><SelectValue placeholder={availableServices.length ? "Selecione o serviço" : "Nenhum serviço vinculado"} /></SelectTrigger>
              <SelectContent>{availableServices.map((service: any) => <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2"><Label>Cliente / paciente</Label><Input className="mt-2" value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Nome completo" /></div>
          <div><Label>Telefone / WhatsApp</Label><Input className="mt-2" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} placeholder="(85) 99999-9999" /></div>
          <div><Label>E-mail <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input className="mt-2" type="email" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} placeholder="cliente@email.com" /></div>
          <div><Label>Data</Label><Input className="mt-2" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} /></div>
          <div><Label>Horário</Label><Input className="mt-2" type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Observações <span className="font-normal text-muted-foreground">(opcional)</span></Label><Textarea className="mt-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Informações importantes para a profissional..." /></div>
        </div>

        <DialogFooter><Button className="w-full rounded-full sm:w-auto" disabled={busy || availableServices.length === 0} onClick={save}>{busy ? "Adicionando..." : "Adicionar à agenda"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AppointmentCard({ appointment, onSaved }: any) {
  const updateStatus = async (status: string) => {
    const { error } = await db.from("appointments").update({ status }).eq("id", appointment.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status atualizado.");
    onSaved?.();
  };

  const professionalResponse = responseFor(appointment);

  return (
    <article className={`rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5 ${appointment.status === "cancelado" ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{appointment.patient_name}</p>
            <StatusBadge status={appointment.status} />
            <ProfessionalResponseBadge response={professionalResponse?.response} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{appointment.service?.name || "Serviço"}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-semibold tabular-nums">{appointment.scheduled_time}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(appointment.scheduled_date)}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-1 border-t border-border/70 pt-3 text-xs text-muted-foreground sm:grid-cols-2">
        <p>{appointment.patient_phone || "Telefone não informado"}</p>
        <p className="truncate sm:text-right">{appointment.patient_email || "E-mail não informado"}</p>
      </div>
      {appointment.notes ? <p className="mt-2 rounded-xl bg-secondary/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{appointment.notes}</p> : null}
      {professionalResponse?.response === "confirmado" && professionalResponse.responded_at ? (
        <p className="mt-2 text-[11px] text-primary">Profissional confirmou em {new Date(professionalResponse.responded_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.</p>
      ) : null}

      <div className="mt-3 flex justify-end">
        <Select value={appointment.status} onValueChange={updateStatus}>
          <SelectTrigger className="h-9 w-[145px] rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="confirmado">Confirmado</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </article>
  );
}

function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/60 px-2 py-2.5 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[9px] text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "confirmado" ? "default" : status === "cancelado" ? "secondary" : "outline";
  const label = status === "confirmado" ? "Confirmado" : status === "cancelado" ? "Cancelado" : status === "aguardando_pagamento" ? "Aguardando pagamento" : "Pendente";
  return <Badge variant={variant as any} className="rounded-full text-[10px]">{label}</Badge>;
}

function ProfessionalResponseBadge({ response }: { response?: string }) {
  if (response === "confirmado") {
    return <Badge className="rounded-full bg-primary-soft text-[10px] text-primary hover:bg-primary-soft"><CheckCircle2 className="mr-1 size-3" /> Profissional confirmou</Badge>;
  }
  return <Badge variant="outline" className="rounded-full text-[10px] text-muted-foreground">Aguardando profissional</Badge>;
}

function Metric({ icon: Icon, label, value }: any) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5 shadow-soft sm:p-5">
      <span className="grid size-8 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-4" /></span>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">{label}</p>
    </div>
  );
}

function CenteredMessage({ title, detail, icon, action }: any) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-5">
      <div className="max-w-md text-center">
        {icon ? <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">{icon}</span> : <div className="mx-auto size-8 animate-pulse rounded-full bg-primary/10" />}
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        {detail ? <p className="mt-2 text-sm text-muted-foreground">{detail}</p> : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}
