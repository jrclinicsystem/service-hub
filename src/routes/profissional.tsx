import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  Clock3,
  LogOut,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import logo from "@/assets/jr-clinic-logo.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/clinic";

const db = supabase as any;

export const Route = createFileRoute("/profissional")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: "/profissional" } });
  },
  head: () => ({
    meta: [
      { title: "Minha agenda — JR Clinic" },
      { name: "description", content: "Agenda individual dos profissionais da JR Clinic." },
    ],
  }),
  component: ProfessionalAgenda,
});

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function loadProfessionalAgenda() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");

  const email = (userData.user.email ?? "").trim().toLowerCase();
  if (!email) return { authorized: false as const, email: "" };

  const access = await db
    .from("professional_access")
    .select("professional_id, email, enabled, professional:professionals(id, name, specialty, is_active)")
    .eq("email", email)
    .eq("enabled", true)
    .maybeSingle();

  if (access.error) throw access.error;
  if (!access.data?.professional_id || !access.data.professional?.is_active) {
    return { authorized: false as const, email };
  }

  const appointments = await db
    .from("appointments")
    .select(
      "id, professional_id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, service:services(name, duration_min)",
    )
    .eq("professional_id", access.data.professional_id)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });

  if (appointments.error) throw appointments.error;

  return {
    authorized: true as const,
    email,
    professional: access.data.professional,
    appointments: appointments.data ?? [],
  };
}

function ProfessionalAgenda() {
  const navigate = useNavigate();
  const [dateFilter, setDateFilter] = useState("");
  const [scope, setScope] = useState<"upcoming" | "all">("upcoming");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["professional-agenda"],
    queryFn: loadProfessionalAgenda,
    retry: 1,
  });

  const appointments = data?.authorized ? data.appointments : [];
  const today = todayIso();
  const filteredAppointments = useMemo(() => {
    return appointments.filter((item: any) => {
      const dateMatch = dateFilter ? item.scheduled_date === dateFilter : true;
      const scopeMatch = scope === "all" ? true : item.scheduled_date >= today;
      return dateMatch && scopeMatch;
    });
  }, [appointments, dateFilter, scope, today]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: "/profissional" } });
  };

  if (isLoading) return <CenteredMessage title="Carregando sua agenda..." />;

  if (error) {
    return (
      <CenteredMessage
        title="Não foi possível carregar sua agenda."
        detail={error instanceof Error ? error.message : "Erro inesperado."}
        action={<Button onClick={() => refetch()}>Tentar novamente</Button>}
      />
    );
  }

  if (!data?.authorized) {
    return (
      <div className="min-h-screen bg-background">
        <SimpleHeader onSignOut={signOut} />
        <main className="mx-auto max-w-lg px-5 py-14 text-center sm:py-20">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold">Agenda ainda não liberada</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            A conta <strong className="font-medium text-foreground">{data?.email || "atual"}</strong> está autenticada, mas ainda não foi vinculada a uma profissional pela recepção.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Peça à recepção para cadastrar exatamente este e-mail em Agenda da equipe → Acesso individual.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="outline" asChild><Link to="/">Voltar ao site</Link></Button>
            <Button onClick={signOut}>Entrar com outra conta</Button>
          </div>
        </main>
      </div>
    );
  }

  const todayAppointments = data.appointments.filter((item: any) => item.scheduled_date === today && item.status !== "cancelado");
  const upcomingAppointments = data.appointments.filter((item: any) => item.scheduled_date >= today && item.status !== "cancelado");
  const nextAppointment = upcomingAppointments[0];

  return (
    <div className="min-h-screen bg-background">
      <SimpleHeader onSignOut={signOut} />

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Agenda profissional</p>
              <h1 className="mt-2 truncate text-2xl font-semibold sm:text-3xl">{data.professional.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{data.professional.specialty}</p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 rounded-full" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
          </div>

          {nextAppointment ? (
            <div className="mt-5 rounded-2xl bg-primary-soft p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Próximo atendimento</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{nextAppointment.patient_name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{nextAppointment.service?.name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-primary tabular-nums">{nextAppointment.scheduled_time}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDate(nextAppointment.scheduled_date)}</p>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:mt-6 sm:gap-4">
          <Metric icon={CalendarDays} label="Hoje" value={String(todayAppointments.length)} />
          <Metric icon={Clock3} label="Próximos" value={String(upcomingAppointments.length)} />
          <Metric icon={Stethoscope} label="Total" value={String(data.appointments.length)} />
        </div>

        <section className="mt-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Meus atendimentos</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Somente compromissos vinculados ao seu perfil aparecem aqui.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <div className="grid grid-cols-2 rounded-xl bg-secondary/70 p-1">
                <button
                  type="button"
                  onClick={() => setScope("upcoming")}
                  className={`h-9 rounded-lg px-3 text-xs font-medium transition ${scope === "upcoming" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
                >
                  Próximos
                </button>
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  className={`h-9 rounded-lg px-3 text-xs font-medium transition ${scope === "all" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
                >
                  Todos
                </button>
              </div>
              <Input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="h-11 rounded-xl" />
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {filteredAppointments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
                <CalendarDays className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">Nenhum atendimento encontrado.</p>
              </div>
            ) : filteredAppointments.map((appointment: any) => (
              <ProfessionalAppointmentCard key={appointment.id} appointment={appointment} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function ProfessionalAppointmentCard({ appointment }: any) {
  return (
    <article className={`rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5 ${appointment.status === "cancelado" ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{appointment.patient_name}</p>
            <StatusBadge status={appointment.status} />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{appointment.service?.name || "Procedimento"}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-semibold tabular-nums">{appointment.scheduled_time}</p>
          <p className="text-[10px] text-muted-foreground">{formatDate(appointment.scheduled_date)}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 border-t border-border/70 pt-3 sm:grid-cols-2">
        <a href={appointment.patient_phone ? `tel:${appointment.patient_phone}` : undefined} className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <Phone className="size-3.5 shrink-0" />
          <span className="truncate">{appointment.patient_phone || "Telefone não informado"}</span>
        </a>
        <a href={`mailto:${appointment.patient_email}`} className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground sm:justify-end">
          <Mail className="size-3.5 shrink-0" />
          <span className="truncate">{appointment.patient_email}</span>
        </a>
      </div>

      {appointment.notes ? (
        <div className="mt-3 rounded-xl bg-secondary/60 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Observação</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{appointment.notes}</p>
        </div>
      ) : null}
    </article>
  );
}

function SimpleHeader({ onSignOut }: { onSignOut: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-card/95 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:h-16 sm:px-8">
        <div className="flex items-center gap-3">
          <img src={logo} alt="JR Clinic" className="h-7 w-auto sm:h-8" />
          <span className="hidden h-5 w-px bg-border sm:block" />
          <p className="hidden text-sm font-medium sm:block">Minha agenda</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" asChild><Link to="/">Site</Link></Button>
          <Button variant="outline" size="sm" className="rounded-full" onClick={onSignOut}>
            <LogOut className="size-4" /><span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "confirmado" ? "default" : status === "cancelado" ? "secondary" : "outline";
  const label = status === "confirmado" ? "Confirmado" : status === "cancelado" ? "Cancelado" : "Pendente";
  return <Badge variant={variant as any} className="rounded-full text-[10px]">{label}</Badge>;
}

function Metric({ icon: Icon, label, value }: any) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-3 text-center shadow-soft sm:p-4">
      <Icon className="mx-auto size-4 text-primary" />
      <p className="mt-1.5 text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground sm:text-xs">{label}</p>
    </div>
  );
}

function CenteredMessage({ title, detail, action }: any) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-5">
      <div className="max-w-md text-center">
        <div className="mx-auto size-8 animate-pulse rounded-full bg-primary/10" />
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        {detail ? <p className="mt-2 text-sm text-muted-foreground">{detail}</p> : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}
