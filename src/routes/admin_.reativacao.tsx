import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, MessageCircle, RefreshCw, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { buildReactivationRows, inactivityDays, normalizeClientWhatsApp } from "@/lib/client-reactivation";
import type { Appointment, Client, Contact } from "@/lib/client-reactivation";

const db = supabase as any;
type Filter = "30" | "60" | "90" | "reactivated";

export const Route = createFileRoute("/admin_/reativacao")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: "/admin/reativacao" } });
  },
  head: () => ({ meta: [{ title: "Captação e reativação — JR Clinic" }] }),
  component: ReactivationPage,
});

async function readAppointments(): Promise<Appointment[]> {
  const result: Appointment[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("appointments")
      .select("id,client_id,status,attended_at,scheduled_date,service:services!appointments_service_id_fkey(name),appointment_sessions(status,completed_at,service_name_snapshot),appointment_services(status,completed_at,service:services!appointment_services_service_id_fkey(name))")
      .not("client_id", "is", null).order("id").range(offset, offset + 499);
    if (error) throw error;
    result.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return result;
}

async function loadData() {
  const { data: allowed, error: accessError } = await db.rpc("is_current_user_admin");
  if (accessError) throw accessError;
  if (!allowed) throw new Error("Acesso administrativo necessário.");

  const clients = await db.from("clients")
    .select("id,name,whatsapp,is_active")
    .is("deleted_at", null).eq("is_active", true).order("name");
  if (clients.error) throw clients.error;
  const appointments = await readAppointments();
  const contacts = await db.from("client_reactivation_contacts")
    .select("id,client_id,contacted_at,last_procedure_at")
    .order("contacted_at", { ascending: false }).limit(10000);
  const migrationPending = !!contacts.error &&
    ["42P01", "PGRST205", "PGRST200"].includes(String(contacts.error.code)) &&
    String(contacts.error.message).includes("client_reactivation_contacts");
  if (contacts.error && !migrationPending) throw contacts.error;
  return {
    clients: (clients.data ?? []) as Client[], appointments,
    contacts: (contacts.data ?? []) as Contact[],
    migrationPending,
  };
}

function formatDate(at: string) {
  return new Date(at).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
}
function formatDateTime(at: string) {
  return new Date(at).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" });
}
function whatsappMessage(name: string) {
  const first = name.trim().split(/\s+/)[0] || "cliente";
  return [
    "Oi, " + first + "!  Tudo bem?",
    "Estamos passando para lembrar que você merece um momento só seu!",
    "",
    "Já faz mais de 30 dias desde sua última visita à J.R Clinic, e queremos te convidar para voltar a cuidar da sua beleza e bem-estar.",
    "Temos condições especiais esperando por você!",
    "",
    "Que tal garantir seu próximo horário? Posso te enviar nossa agenda!",
  ].join("\n");
}

function ReactivationPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin-reactivation"], queryFn: loadData, retry: 1,
  });
  const [filter, setFilter] = useState<Filter>("30");
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const now = new Date();
  const rows = useMemo(
    () => buildReactivationRows(data?.clients ?? [], data?.appointments ?? [], data?.contacts ?? [], now),
    [data?.clients, data?.appointments, data?.contacts],
  );
  const inactive = rows.filter((r) => r.daysInactive > 30);
  const contacted = rows.filter((r) => r.contactsCount > 0).length;
  const reactivated = rows.filter((r) => r.isReactivated);
  const visible = rows.filter((r) => filter === "reactivated"
    ? r.isReactivated : r.daysInactive >= (filter === "30" ? 31 : Number(filter)))
    .filter((r) => {
      const term = search.trim().toLowerCase();
      return !term || r.name.toLowerCase().includes(term) || r.whatsapp.includes(term);
    }).sort((a, b) => b.daysInactive - a.daysInactive || a.name.localeCompare(b.name, "pt-BR"));

  const recordContact = async (row: (typeof rows)[number]) => {
    if (savingId || data?.migrationPending) return;
    if (row.lastContactAt && inactivityDays(row.lastContactAt, now) < 7) {
      toast.info("Cliente contatado nos últimos sete dias.");
      return;
    }
    if (!window.confirm("Registrar contato com " + row.name + "? Marque apenas após enviar a mensagem ou falar com o cliente.")) return;
    setSavingId(row.clientId);
    try {
      const { error: saveError } = await db.from("client_reactivation_contacts")
        .insert({ client_id: row.clientId, last_procedure_at: row.lastProcedureAt });
      if (saveError) throw saveError;
      await queryClient.invalidateQueries({ queryKey: ["admin-reactivation"] });
      toast.success("Contato registrado.");
    } catch (cause: unknown) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao registrar contato.");
    } finally {
      setSavingId(null);
    }
  };

  const contactWhatsApp = (row: (typeof rows)[number]) => {
    const phone = normalizeClientWhatsApp(row.whatsapp);
    if (!phone) {
      toast.error("WhatsApp inválido ou indisponível.");
      return;
    }
    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(whatsappMessage(row.name)), "_blank", "noopener,noreferrer");
  };

  if (isLoading) return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando módulo de reativação...</div>;
  return (
    <div className="min-h-screen bg-background lg:pl-[252px]">
      <AdminSubpageSidebar active="reactivation" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
        <Button asChild variant="ghost" size="sm" className="mb-4 rounded-xl lg:hidden">
          <Link to="/admin"><ArrowLeft className="size-4" /> Painel administrativo</Link>
        </Button>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Relacionamento e retenção</p>
            <h1 className="mt-2 text-3xl font-semibold">Captação e reativação</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Acompanhe clientes sem procedimentos concluídos há mais de 30 dias e registre os contatos comerciais.</p>
          </div>
          <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}><RefreshCw className={"size-4 " + (isFetching ? "animate-spin" : "")} /> Atualizar</Button>
        </header>
        {error ? (
          <section role="alert" className="mt-6 rounded-2xl border border-destructive/50 bg-card p-5 text-sm text-destructive">
            Falha ao carregar: {error instanceof Error ? error.message : "erro desconhecido"}
          </section>
        ) : (
          <>
            {data?.migrationPending ? (
              <section role="alert" className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                Migração de contatos pendente no Supabase. A consulta de clientes está disponível, mas os registros de contato ficam desativados até a migração ser aplicada.
              </section>
            ) : null}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Clientes inativos", value: inactive.length, caption: "Mais de 30 dias", icon: Clock3 },
                { label: "Clientes contatados", value: contacted, caption: "Contatos registrados", icon: Users },
                { label: "Clientes reativados", value: reactivated.length, caption: "Retorno recente após inatividade", icon: CheckCircle2 },
              ].map((metric) => {
                const Icon = metric.icon;
                return <section key={metric.label} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                  <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{metric.label}</p><Icon className="size-4 text-primary" /></div>
                  <p className="mt-3 text-3xl font-semibold">{metric.value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{metric.caption}</p>
                </section>;
              })}
            </div>
            <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-lg font-semibold">Acompanhamento dos clientes</h2><p className="mt-1 text-xs text-muted-foreground">Baseado em atendimentos e sessões concluídos.</p></div>
                <div className="relative sm:w-[290px]"><Search className="absolute left-3 top-1/2 size-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome ou WhatsApp" className="pl-9" /></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {([["30", "30+ dias"], ["60", "60+ dias"], ["90", "90+ dias"], ["reactivated", "Reativados"]] as const).map(([value, label]) =>
                  <Button key={value} size="sm" className="rounded-full" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>{label}</Button>,
                )}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {visible.length === 0 ? <div className="col-span-full rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum cliente encontrado neste filtro.</div> : visible.map((row) => {
                  const recent = !!row.lastContactAt && inactivityDays(row.lastContactAt, now) < 7;
                  const phone = normalizeClientWhatsApp(row.whatsapp);
                  return (
                    <article key={row.clientId} className="rounded-2xl border border-border bg-background p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0"><h3 className="break-words text-sm font-semibold">{row.name}</h3><p className="mt-1 text-xs text-muted-foreground">{row.whatsapp}</p></div>
                        <Badge variant={row.isReactivated ? "default" : "secondary"}>{row.isReactivated ? "Reativado" : row.daysInactive + " dias sem retorno"}</Badge>
                      </div>
                      <div className="mt-4 rounded-xl bg-secondary/50 p-3 text-xs">
                        <p className="flex items-center gap-2 font-medium"><CalendarClock className="size-4 text-primary" /> Último procedimento: {formatDate(row.lastProcedureAt)}</p>
                        <p className="mt-1 text-muted-foreground">{row.lastProcedure}</p>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">{row.contactsCount} contato(s) registrado(s){row.lastContactAt ? " · Último contato: " + formatDateTime(row.lastContactAt) : ""}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" className="rounded-xl" disabled={!phone || recent || row.isReactivated} onClick={() => contactWhatsApp(row)}><MessageCircle className="size-4" /> {recent ? "Contato recente" : "Contatar pelo WhatsApp"}</Button>
                        {!row.isReactivated ? <Button size="sm" variant="outline" className="rounded-xl" disabled={data?.migrationPending || recent || savingId === row.clientId} onClick={() => void recordContact(row)}>
                          <CheckCircle2 className="size-4" /> {recent ? "Já contatado" : savingId === row.clientId ? "Salvando..." : "Marcar como contatado"}
                        </Button> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              <p className="mt-5 text-xs text-muted-foreground">O WhatsApp abre uma mensagem pronta, sem envio automático. Registre contato somente após efetivamente enviá-la. O sistema evita abordagens repetidas nos próximos sete dias.</p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
