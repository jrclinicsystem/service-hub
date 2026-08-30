import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  ExternalLink,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/clinic";

const db = supabase as any;

export const Route = createFileRoute("/admin/equipe")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: "/admin/equipe" } });
  },
  head: () => ({
    meta: [
      { title: "Agenda da equipe — JR Clinic" },
      { name: "description", content: "Agenda individual e acessos da equipe JR Clinic." },
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

async function loadTeamAgenda() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");

  const roles = await db.from("user_roles").select("role").eq("user_id", userData.user.id);
  if (roles.error) throw roles.error;
  const isAdmin = (roles.data ?? []).some((item: any) => item.role === "admin");
  if (!isAdmin) return { isAdmin: false as const, currentEmail: userData.user.email ?? "" };

  const [professionals, access, appointments] = await Promise.all([
    db
      .from("professionals")
      .select("id, name, specialty, is_active, sort_order")
      .order("sort_order")
      .order("name"),
    db
      .from("professional_access")
      .select("id, professional_id, email, enabled, created_at, updated_at")
      .order("created_at"),
    db
      .from("appointments")
      .select(
        "id, professional_id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, service:services(name, duration_min), professional:professionals(id, name, specialty), professional_response:appointment_professional_responses(response, responded_at)",
      )
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true }),
  ]);

  for (const [name, result] of [
    ["profissionais", professionals],
    ["acessos", access],
    ["agenda", appointments],
  ] as const) {
    if (result.error) throw new Error(`Falha ao carregar ${name}: ${result.error.message}`);
  }

  return {
    isAdmin: true as const,
    currentEmail: userData.user.email ?? "",
    professionals: professionals.data ?? [],
    access: access.data ?? [],
    appointments: appointments.data ?? [],
  };
}

function TeamAgendaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [professionalFilter, setProfessionalFilter] = useState("all");
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

  const appointments = data?.isAdmin ? data.appointments : [];
  const filteredAppointments = useMemo(() => {
    return appointments.filter((item: any) => {
      const professionalMatch =
        professionalFilter === "all"
          ? true
          : professionalFilter === "unassigned"
            ? !item.professional_id
            : item.professional_id === professionalFilter;
      const dateMatch = dateFilter ? item.scheduled_date === dateFilter : true;
      return professionalMatch && dateMatch;
    });
  }, [appointments, professionalFilter, dateFilter]);

  if (isLoading) {
    return <CenteredMessage title="Carregando agenda da equipe..." />;
  }

  if (error) {
    return (
      <CenteredMessage
        title="Não foi possível carregar a agenda."
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

  const today = todayIso();
  const todayCount = data.appointments.filter((item: any) => item.scheduled_date === today && item.status !== "cancelado").length;
  const configuredAccess = data.access.filter((item: any) => item.enabled).length;
  const unassigned = data.appointments.filter((item: any) => !item.professional_id).length;
  const confirmedByProfessionals = data.appointments.filter((item: any) => responseFor(item)?.response === "confirmado").length;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between px-4 sm:h-17 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logo} alt="JR Clinic" className="h-7 w-auto sm:h-9" />
            <span className="hidden h-6 w-px bg-border sm:block" />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold">Agenda da equipe</p>
              <p className="text-[11px] text-muted-foreground">Recepção e administração</p>
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

      <main className="mx-auto max-w-[1480px] px-4 pb-14 pt-5 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="eyebrow text-muted-foreground">Agenda interna</span>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Agenda da equipe</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              A recepção acompanha todos os atendimentos e enxerga quando cada profissional confirma o próprio compromisso.
            </p>
          </div>
          <Button variant="outline" className="rounded-full" onClick={() => refetch()}>
            <RefreshCw className="size-4" /> Atualizar
          </Button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
          <Metric icon={CalendarDays} label="Hoje" value={String(todayCount)} />
          <Metric icon={Users} label="Equipe" value={String(data.professionals.filter((p: any) => p.is_active).length)} />
          <Metric icon={ShieldCheck} label="Acessos ativos" value={String(configuredAccess)} />
          <Metric icon={CheckCircle2} label="Confirmados pela equipe" value={String(confirmedByProfessionals)} />
          <Metric icon={UserRound} label="Sem profissional" value={String(unassigned)} />
        </div>

        <section className="mt-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Compromissos</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Filtre a agenda geral por profissional ou por dia.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
                <SelectTrigger className="h-10 min-w-0 rounded-xl sm:w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as profissionais</SelectItem>
                  <SelectItem value="unassigned">Sem profissional</SelectItem>
                  {data.professionals.map((professional: any) => (
                    <SelectItem key={professional.id} value={professional.id}>{professional.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {filteredAppointments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
                <CalendarDays className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">Nenhum agendamento encontrado neste filtro.</p>
              </div>
            ) : filteredAppointments.map((appointment: any) => (
              <AppointmentCard key={appointment.id} appointment={appointment} onSaved={refresh} admin />
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Acesso individual das profissionais</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Vincule o e-mail que cada profissional usará para entrar e visualizar somente a própria agenda.
              </p>
            </div>
            <Button variant="outline" className="rounded-full" asChild>
              <Link to="/profissional" target="_blank">
                Abrir portal da equipe <ExternalLink className="size-3.5" />
              </Link>
            </Button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            {data.professionals.map((professional: any) => {
              const access = data.access.find((item: any) => item.professional_id === professional.id);
              return (
                <div key={professional.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 last:border-b-0 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{professional.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{professional.specialty}</p>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                      <Mail className="size-3" /> {access?.email || "Acesso ainda não configurado"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {access ? (
                      <Badge variant={access.enabled ? "default" : "secondary"} className="hidden rounded-full sm:inline-flex">
                        {access.enabled ? "Ativo" : "Pausado"}
                      </Badge>
                    ) : null}
                    <ProfessionalAccessEditor professional={professional} access={access} onSaved={refresh} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

function AppointmentCard({ appointment, onSaved, admin = false }: any) {
  const updateStatus = async (status: string) => {
    const { error } = await db.from("appointments").update({ status }).eq("id", appointment.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status atualizado.");
    onSaved?.();
  };

  const professionalResponse = responseFor(appointment);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{appointment.patient_name}</p>
            <StatusBadge status={appointment.status} />
            {appointment.professional_id ? (
              <ProfessionalResponseBadge response={professionalResponse?.response} />
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {appointment.service?.name || "Serviço"} · {appointment.professional?.name || "Sem profissional definido"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums">{appointment.scheduled_time}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(appointment.scheduled_date)}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-1 border-t border-border/70 pt-3 text-xs text-muted-foreground sm:grid-cols-2">
        <p>{appointment.patient_phone || "Telefone não informado"}</p>
        <p className="truncate sm:text-right">{appointment.patient_email}</p>
      </div>
      {appointment.notes ? <p className="mt-2 rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">{appointment.notes}</p> : null}
      {professionalResponse?.response === "confirmado" && professionalResponse.responded_at ? (
        <p className="mt-2 text-[11px] text-primary">
          Profissional confirmou o compromisso em {new Date(professionalResponse.responded_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.
        </p>
      ) : null}
      {admin ? (
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
      ) : null}
    </div>
  );
}

function ProfessionalAccessEditor({ professional, access, onSaved }: any) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(access?.email ?? "");
  const [enabled, setEnabled] = useState(access?.enabled ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) { toast.error("Digite um e-mail válido."); return; }

    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      professional_id: professional.id,
      email: normalized,
      enabled,
      created_by: userData.user?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    const result = await db
      .from("professional_access")
      .upsert(payload, { onConflict: "professional_id" });
    setBusy(false);

    if (result.error) { toast.error(result.error.message); return; }
    toast.success(`Acesso de ${professional.name} atualizado.`);
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={access ? "outline" : "default"} size="sm" className="h-9 rounded-full">
          {access ? "Editar" : "Liberar acesso"}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-1rem)] rounded-2xl p-5 sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle>Acesso de {professional.name}</DialogTitle>
          <DialogDescription>
            Esse e-mail poderá entrar em /profissional e verá somente a agenda de {professional.name}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor={`email-${professional.id}`}>E-mail da profissional</Label>
            <Input
              id={`email-${professional.id}`}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome@email.com"
              className="mt-2"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-3">
            <div>
              <p className="text-sm font-medium">Acesso ativo</p>
              <p className="text-[11px] text-muted-foreground">Pode ser pausado sem apagar o vínculo.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button className="w-full sm:w-auto" disabled={busy} onClick={save}>
            {busy ? "Salvando..." : "Salvar acesso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "confirmado" ? "default" : status === "cancelado" ? "secondary" : "outline";
  const label = status === "confirmado" ? "Confirmado" : status === "cancelado" ? "Cancelado" : "Pendente";
  return <Badge variant={variant as any} className="rounded-full text-[10px]">{label}</Badge>;
}

function ProfessionalResponseBadge({ response }: { response?: string }) {
  if (response === "confirmado") {
    return (
      <Badge className="rounded-full bg-primary-soft text-[10px] text-primary hover:bg-primary-soft">
        <CheckCircle2 className="mr-1 size-3" /> Profissional confirmou
      </Badge>
    );
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
