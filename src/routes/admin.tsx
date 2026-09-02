import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  LogOut,
  Pencil,
  Plus,
  ShieldCheck,
  Stethoscope,
  Tag,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import logo from "@/assets/jr-clinic-logo.png";
import { AdminAppointmentsWorkspace } from "@/components/admin-appointments-workspace";
import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/clinic";

const title = "Painel administrativo — JR Clinic";
const description = "Gestão de serviços, promoções, agenda e acessos administrativos da JR Clinic.";
const db = supabase as any;

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: "/admin" } });
  },
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Admin,
});

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

async function loadAdminOverview() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");

  const user = userData.user;
  const email = (user.email ?? "").trim().toLowerCase();

  const roleResult = await db.from("user_roles").select("role").eq("user_id", user.id);
  if (roleResult.error) throw roleResult.error;

  let isAdmin = (roleResult.data ?? []).some((item: any) => item.role === "admin");

  if (!isAdmin && email) {
    const allowResult = await db
      .from("admin_emails")
      .select("email")
      .eq("email", email)
      .eq("enabled", true)
      .maybeSingle();

    if (allowResult.error) throw allowResult.error;
    isAdmin = Boolean(allowResult.data);
  }

  if (!isAdmin) {
    return {
      isAdmin: false as const,
      currentEmail: email,
      appointments: [],
      services: [],
      categories: [],
      professionals: [],
      serviceProfessionalLinks: [],
      promotions: [],
      timeSlots: [],
      adminEmails: [],
    };
  }

  const [
    appointments,
    services,
    categories,
    professionals,
    serviceProfessionalLinks,
    promotions,
    timeSlots,
    adminEmails,
  ] = await Promise.all([
    db
      .from("appointments")
      .select(
        "id, patient_name, patient_email, patient_phone, notes, scheduled_date, scheduled_time, status, created_at, status_updated_at, payment_choice, service_price_snapshot, deposit_percent, deposit_amount, balance_amount, service:services(name, price, duration_min), professional:professionals(name, specialty), payments(status, amount, kind, payment_method_id, provider, paid_at, created_at, status_detail)",
      )
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true }),
    db
      .from("services")
      .select(
        "id, slug, name, category_id, professional, professional_role, duration_min, price, rating, reviews_count, summary, description, includes, preparation, is_active",
      )
      .order("name"),
    db.from("categories").select("id, name, description, sort_order").order("sort_order"),
    db
      .from("professionals")
      .select("id, name, specialty, is_active, sort_order")
      .order("sort_order")
      .order("name"),
    db.from("service_professionals").select("service_id, professional_id"),
    db
      .from("promotions")
      .select(
        "id, service_id, title, description, discount_percent, promotional_price, starts_at, ends_at, is_active, created_at",
      )
      .order("created_at", { ascending: false }),
    db.from("time_slots").select("id, slot, is_available, sort_order").order("sort_order"),
    db.from("admin_emails").select("email, enabled, created_at").order("created_at"),
  ]);

  const results = [
    ["agendamentos", appointments],
    ["serviços", services],
    ["categorias", categories],
    ["profissionais", professionals],
    ["vínculos de profissionais", serviceProfessionalLinks],
    ["promoções", promotions],
    ["horários", timeSlots],
    ["acessos", adminEmails],
  ] as const;

  for (const [name, result] of results) {
    if (result.error) throw new Error(`Falha ao carregar ${name}: ${result.error.message}`);
  }

  return {
    isAdmin: true as const,
    currentEmail: email,
    appointments: appointments.data ?? [],
    services: (services.data ?? []).map((service: any) => ({
      ...service,
      price: Number(service.price),
      rating: Number(service.rating),
    })),
    categories: categories.data ?? [],
    professionals: professionals.data ?? [],
    serviceProfessionalLinks: serviceProfessionalLinks.data ?? [],
    promotions: (promotions.data ?? []).map((promotion: any) => ({
      ...promotion,
      discount_percent:
        promotion.discount_percent === null ? null : Number(promotion.discount_percent),
      promotional_price:
        promotion.promotional_price === null ? null : Number(promotion.promotional_price),
    })),
    timeSlots: timeSlots.data ?? [],
    adminEmails: adminEmails.data ?? [],
  };
}

function Admin() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: loadAdminOverview,
    retry: 1,
  });

  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["admin-overview"] }); };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: undefined } });
  };

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="text-center">
          <div className="mx-auto size-8 animate-pulse rounded-full bg-primary/10" />
          <p className="mt-3 text-sm text-muted-foreground">Carregando painel...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-5">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-destructive">Não foi possível carregar o painel.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Erro inesperado ao consultar o Supabase."}
          </p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
            <Button onClick={signOut}>Entrar novamente</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!data?.isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-5">
        <div className="max-w-md text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold">Acesso restrito</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            O e-mail {data?.currentEmail || "desta conta"} não está autorizado para administrar a JR Clinic.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="outline" asChild><Link to="/">Voltar ao site</Link></Button>
            <Button onClick={signOut}>Sair</Button>
          </div>
        </div>
      </div>
    );
  }

  const revenue = data.appointments
    .filter((item: any) => item.status !== "cancelado")
    .reduce((total: number, item: any) => total + Number(item.service_price_snapshot ?? item.service?.price ?? 0), 0);
  const uniquePatients = new Set(data.appointments.map((item: any) => item.patient_email)).size;
  const activeServices = data.services.filter((item: any) => item.is_active).length;

  const updateRow = async (table: string, idColumn: string, id: string, values: any, message?: string) => {
    const { error } = await db.from(table).update(values).eq(idColumn, id);
    if (error) { toast.error(error.message); return false; }
    if (message) toast.success(message);
    refresh();
    return true;
  };

  const updateAppointmentStatus = async (id: string, status: "pendente" | "confirmado" | "cancelado") => {
    return updateRow(
      "appointments",
      "id",
      id,
      { status },
      status === "confirmado" ? "Agendamento confirmado." : status === "cancelado" ? "Agendamento recusado/cancelado." : "Status atualizado.",
    );
  };

  const categoryName = (service: any) =>
    data.categories.find((category: any) => category.id === service.category_id)?.name ?? "Sem categoria";

  return (
    <div className="min-h-screen bg-background lg:pl-[252px]">
      <AdminSubpageSidebar active="home" />
      <header className="sticky top-0 z-40 border-b border-border/80 bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between px-4 sm:h-17 sm:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <img src={logo} alt="JR Clinic" className="h-7 w-auto sm:h-9" />
            <span className="hidden h-6 w-px bg-border sm:block" />
            <div className="hidden min-w-0 sm:block">
              <p className="text-sm font-semibold">Administração</p>
              <p className="max-w-[220px] truncate text-[11px] text-muted-foreground">{data.currentEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" className="h-9 px-2.5 text-xs sm:px-3 sm:text-sm" asChild>
              <Link to="/">Ver site</Link>
            </Button>
            <Button variant="outline" size="sm" className="h-9 rounded-full px-2.5 sm:px-3" onClick={signOut}>
              <LogOut className="size-3.5 sm:size-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] px-4 pb-10 pt-5 sm:px-8 sm:py-10">
        <div className="sm:hidden">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Administração</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[26px] font-semibold leading-tight">Painel de controle</h1>
              <p className="mt-1 truncate text-xs text-muted-foreground">{data.currentEmail}</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-medium text-primary">Online</span>
          </div>
        </div>

        <div className="hidden sm:block">
          <span className="eyebrow text-muted-foreground">Controle da clínica</span>
          <h1 className="mt-2 text-4xl font-semibold">Painel de controle</h1>
          <p className="mt-3 max-w-[58ch] text-muted-foreground">
            Gerencie agendamentos, catálogo, promoções, horários disponíveis e acessos administrativos.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-8 sm:gap-4 lg:grid-cols-4">
          <Metric icon={CalendarDays} label="Agendamentos" value={String(data.appointments.length)} hint="no sistema" />
          <Metric icon={CircleDollarSign} label="Receita" value={formatPrice(revenue)} hint="estimada" />
          <Metric icon={Stethoscope} label="Serviços" value={String(activeServices)} hint="ativos" />
          <Metric icon={Users} label="Pacientes" value={String(uniquePatients)} hint="e-mails únicos" />
        </div>

        <Tabs defaultValue="agendamentos" className="mt-5 sm:mt-10">
          <div className="sticky top-14 z-30 -mx-4 border-y border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <TabsList className="grid h-auto w-full grid-cols-5 gap-1 rounded-2xl bg-secondary/70 p-1 sm:inline-flex sm:w-auto sm:justify-start sm:rounded-xl">
              <MobileTab value="agendamentos" icon={CalendarDays} label="Agenda" desktopLabel="Agendamentos" />
              <MobileTab value="servicos" icon={Stethoscope} label="Serviços" desktopLabel="Serviços" />
              <MobileTab value="promocoes" icon={Tag} label="Ofertas" desktopLabel="Promoções" />
              <MobileTab value="horarios" icon={Clock3} label="Horários" desktopLabel="Horários" />
              <MobileTab value="acessos" icon={ShieldCheck} label="Acessos" desktopLabel="Acessos" />
            </TabsList>
          </div>

          <TabsContent value="agendamentos" className="mt-4 sm:mt-5">
            <AdminAppointmentsWorkspace
              appointments={data.appointments}
              onStatusChange={updateAppointmentStatus}
              onRefresh={refresh}
            />
          </TabsContent>

          <TabsContent value="servicos" className="mt-4 sm:mt-5">
            <SectionHeader
              title="Catálogo de serviços"
              subtitle="Crie, edite ou retire serviços do catálogo."
              action={
                <ServiceEditor
                  categories={data.categories}
                  professionals={data.professionals}
                  serviceProfessionalLinks={data.serviceProfessionalLinks}
                  onSaved={refresh}
                />
              }
            />

            <div className="space-y-2.5 md:hidden">
              {data.services.map((service: any) => (
                <div key={service.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{service.name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{categoryName(service)} · {service.professional || "Sem profissional"}</p>
                    </div>
                    <ServiceEditor
                      service={service}
                      categories={data.categories}
                      professionals={data.professionals}
                      serviceProfessionalLinks={data.serviceProfessionalLinks}
                      onSaved={refresh}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Valor</p>
                      <p className="text-sm font-semibold text-primary">{formatPrice(service.price)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">{service.is_active ? "Publicado" : "Oculto"}</span>
                      <Switch
                        checked={service.is_active}
                        onCheckedChange={(is_active) =>
                          updateRow("services", "id", service.id, { is_active }, is_active ? "Serviço publicado." : "Serviço ocultado.")
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <PanelTable>
                <TableHeader><TableRow>
                  <TableHead>Serviço</TableHead><TableHead>Categoria</TableHead>
                  <TableHead>Valor</TableHead><TableHead>Publicado</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {data.services.map((service: any) => (
                    <TableRow key={service.id}>
                      <TableCell>
                        <p className="font-medium">{service.name}</p>
                        <p className="text-xs text-muted-foreground">{service.professional}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{categoryName(service)}</TableCell>
                      <TableCell className="font-medium">{formatPrice(service.price)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={service.is_active}
                          onCheckedChange={(is_active) =>
                            updateRow("services", "id", service.id, { is_active }, is_active ? "Serviço publicado." : "Serviço ocultado.")
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <ServiceEditor
                          service={service}
                          categories={data.categories}
                          professionals={data.professionals}
                          serviceProfessionalLinks={data.serviceProfessionalLinks}
                          onSaved={refresh}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </PanelTable>
            </div>
          </TabsContent>

          <TabsContent value="promocoes" className="mt-4 sm:mt-5">
            <SectionHeader
              title="Promoções"
              subtitle="Crie campanhas e vincule a um serviço."
              action={<PromotionEditor services={data.services} onSaved={refresh} />}
            />
            <div className="grid gap-2.5 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.promotions.length === 0 ? (
                <EmptyCard icon={Tag} text="Nenhuma promoção cadastrada ainda." />
              ) : data.promotions.map((promotion: any) => (
                <div key={promotion.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Badge variant={promotion.is_active ? "default" : "secondary"} className="rounded-full px-2 py-0 text-[10px] sm:text-xs">
                        {promotion.is_active ? "Ativa" : "Pausada"}
                      </Badge>
                      <h3 className="mt-2 truncate text-sm font-semibold sm:mt-3 sm:text-lg">{promotion.title}</h3>
                    </div>
                    <Switch
                      checked={promotion.is_active}
                      onCheckedChange={(is_active) =>
                        updateRow("promotions", "id", promotion.id, { is_active }, "Promoção atualizada.")
                      }
                    />
                  </div>
                  {promotion.description ? <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground sm:mt-2 sm:text-sm">{promotion.description}</p> : null}
                  <p className="mt-3 text-sm font-semibold text-primary sm:mt-4">
                    {promotion.promotional_price != null
                      ? formatPrice(promotion.promotional_price)
                      : promotion.discount_percent != null
                        ? `${promotion.discount_percent}% de desconto`
                        : "Oferta"}
                  </p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="horarios" className="mt-4 sm:mt-5">
            <SectionHeader title="Horários disponíveis" subtitle="Ative ou pause horários exibidos no agendamento." />
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
              {data.timeSlots.map((slot: any) => (
                <div key={slot.id} className="flex min-h-[74px] items-center justify-between rounded-2xl border border-border bg-card px-3.5 py-3 shadow-soft sm:p-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="grid size-7 place-items-center rounded-lg bg-primary-soft text-primary sm:size-8">
                      <Clock3 className="size-3.5 sm:size-4" />
                    </span>
                    <span className="text-sm font-semibold lining-nums tabular-nums">{slot.slot}</span>
                  </div>
                  <Switch
                    checked={slot.is_available}
                    onCheckedChange={(is_available) =>
                      updateRow("time_slots", "id", slot.id, { is_available })
                    }
                  />
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="acessos" className="mt-4 sm:mt-5">
            <SectionHeader
              title="E-mails administrativos"
              subtitle="Somente estes e-mails podem usar o painel interno."
              action={<AdminEmailEditor onSaved={refresh} />}
            />
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              {data.adminEmails.map((item: any) => {
                const isCurrent = item.email === data.currentEmail;
                return (
                  <div key={item.email} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 last:border-b-0 sm:gap-4 sm:px-5 sm:py-4">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold sm:text-sm">{item.email}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground sm:text-xs">{isCurrent ? "Seu acesso atual" : "Acesso administrativo"}</p>
                    </div>
                    <Switch
                      checked={item.enabled}
                      disabled={isCurrent}
                      onCheckedChange={(enabled) =>
                        updateRow("admin_emails", "email", item.email, { enabled }, "Permissão atualizada.")
                      }
                    />
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function MobileTab({ value, icon: Icon, label, desktopLabel }: any) {
  return (
    <TabsTrigger
      value={value}
      className="h-[50px] min-w-0 flex-col gap-0.5 rounded-xl px-1 text-[10px] font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm sm:h-9 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm"
    >
      <Icon className="size-3.5 shrink-0 sm:hidden" />
      <span className="truncate sm:hidden">{label}</span>
      <span className="hidden sm:inline">{desktopLabel}</span>
    </TabsTrigger>
  );
}

function Metric({ icon: Icon, label, value, hint }: any) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5 shadow-soft sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:block">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary sm:size-9 sm:rounded-xl">
          <Icon className="size-3.5 sm:size-4.5" />
        </span>
        <p className="text-[10px] text-muted-foreground sm:mt-4 sm:text-sm">{label}</p>
      </div>
      <p className="mt-2 truncate font-sans text-xl font-semibold tracking-tight lining-nums tabular-nums sm:mt-0 sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">{hint}</p>
    </div>
  );
}

function SectionHeader({ title, subtitle, action }: any) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4 sm:flex-wrap sm:items-end sm:gap-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground sm:text-sm">{subtitle}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function PanelTable({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft"><Table>{children}</Table></div>;
}

function EmptyCard({ icon: Icon, text }: any) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center sm:p-8">
      <Icon className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-3 text-xs text-muted-foreground sm:text-sm">{text}</p>
    </div>
  );
}

function ServiceEditor({
  service,
  categories,
  professionals,
  serviceProfessionalLinks,
  onSaved,
}: any) {
  const linkedProfessionalIds = service?.id
    ? (serviceProfessionalLinks ?? [])
        .filter((link: any) => link.service_id === service.id)
        .map((link: any) => link.professional_id)
    : [];
  const fallbackProfessionalIds =
    linkedProfessionalIds.length > 0 || !service?.professional
      ? linkedProfessionalIds
      : (professionals ?? [])
          .filter((item: any) => service.professional.includes(item.name))
          .map((item: any) => item.id);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(service?.name ?? "");
  const [categoryId, setCategoryId] = useState(service?.category_id ?? categories[0]?.id ?? "");
  const [selectedProfessionalIds, setSelectedProfessionalIds] = useState<string[]>(fallbackProfessionalIds);
  const [duration, setDuration] = useState(String(service?.duration_min ?? 30));
  const [price, setPrice] = useState(String(service?.price ?? ""));
  const [summary, setSummary] = useState(service?.summary ?? "");
  const [descriptionText, setDescriptionText] = useState(service?.description ?? "");
  const [busy, setBusy] = useState(false);

  const toggleProfessional = (professionalId: string, checked: boolean) => {
    setSelectedProfessionalIds((current) =>
      checked
        ? current.includes(professionalId)
          ? current
          : [...current, professionalId]
        : current.filter((id) => id !== professionalId),
    );
  };

  const save = async () => {
    if (!name.trim() || !categoryId || !price) {
      toast.error("Preencha nome, categoria e valor.");
      return;
    }
    if (selectedProfessionalIds.length === 0) {
      toast.error("Selecione pelo menos um profissional para este serviço.");
      return;
    }

    setBusy(true);
    const selectedProfessionals = (professionals ?? []).filter((item: any) =>
      selectedProfessionalIds.includes(item.id),
    );
    const professionalNames = selectedProfessionals.map((item: any) => item.name).join(", ");
    const professionalRoles = [...new Set(
      selectedProfessionals.map((item: any) => item.specialty).filter(Boolean),
    )].join(" · ");

    const payload = {
      name: name.trim(),
      slug: service?.slug ?? slugify(name),
      category_id: categoryId,
      professional: professionalNames,
      professional_role: professionalRoles,
      duration_min: Number(duration) || 30,
      price: Number(price.replace(",", ".")) || 0,
      summary: summary.trim(),
      description: descriptionText.trim(),
      includes: service?.includes ?? [],
      preparation: service?.preparation ?? [],
      is_active: service?.is_active ?? true,
    };

    let serviceId = service?.id as string | undefined;
    if (serviceId) {
      const { error: serviceError } = await db.from("services").update(payload).eq("id", serviceId);
      if (serviceError) {
        setBusy(false);
        toast.error(serviceError.message);
        return;
      }
    } else {
      const { data: created, error: serviceError } = await db
        .from("services")
        .insert(payload)
        .select("id")
        .single();
      if (serviceError || !created?.id) {
        setBusy(false);
        toast.error(serviceError?.message ?? "Não foi possível criar o serviço.");
        return;
      }
      serviceId = created.id;
    }

    const linkRows = selectedProfessionalIds.map((professionalId) => ({
      service_id: serviceId,
      professional_id: professionalId,
    }));
    const { error: linkError } = await db
      .from("service_professionals")
      .upsert(linkRows, { onConflict: "service_id,professional_id" });

    if (linkError) {
      if (!service?.id && serviceId) await db.from("services").delete().eq("id", serviceId);
      setBusy(false);
      toast.error(`Serviço salvo, mas não foi possível vincular o profissional: ${linkError.message}`);
      return;
    }

    const removedProfessionalIds = linkedProfessionalIds.filter(
      (professionalId: string) => !selectedProfessionalIds.includes(professionalId),
    );
    if (removedProfessionalIds.length > 0 && serviceId) {
      const { error: unlinkError } = await db
        .from("service_professionals")
        .delete()
        .eq("service_id", serviceId)
        .in("professional_id", removedProfessionalIds);
      if (unlinkError) {
        setBusy(false);
        toast.error(`Serviço salvo, mas um vínculo antigo não pôde ser removido: ${unlinkError.message}`);
        return;
      }
    }

    setBusy(false);
    toast.success(service?.id ? "Serviço atualizado." : "Serviço criado e vinculado à equipe.");
    setOpen(false);

    if (!service?.id) {
      setName("");
      setCategoryId(categories[0]?.id ?? "");
      setSelectedProfessionalIds([]);
      setDuration("30");
      setPrice("");
      setSummary("");
      setDescriptionText("");
    }

    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {service ? (
          <Button variant="ghost" size="icon" className="size-8 rounded-lg sm:size-9" aria-label={`Editar ${service.name}`}>
            <Pencil className="size-3.5 sm:size-4" />
          </Button>
        ) : (
          <Button size="sm" className="h-9 rounded-full px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
            <Plus className="size-3.5 sm:size-4" /> <span className="sm:hidden">Novo</span><span className="hidden sm:inline">Novo serviço</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl p-5 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{service ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          <DialogDescription>
            Preencha os dados abaixo. O profissional selecionado também será disponibilizado na etapa de agendamento.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field label="Nome do serviço" hint="Nome que o cliente verá no catálogo.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Limpeza dental" />
          </Field>
          <Field label="Categoria" hint="Define em qual seção do catálogo o serviço aparece.">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
              <SelectContent>{categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>

          <div className="sm:col-span-2">
            <Field
              label="Profissionais que realizam este serviço"
              hint="Selecione uma ou mais profissionais cadastradas. Elas serão as opções disponíveis para o cliente no agendamento."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {(professionals ?? []).length === 0 ? (
                  <div className="sm:col-span-2 rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-3 text-xs text-muted-foreground">
                    Nenhum profissional cadastrado. Cadastre a equipe antes de criar o serviço.
                  </div>
                ) : (
                  (professionals ?? []).map((item: any) => {
                    const checked = selectedProfessionalIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                          checked ? "border-primary bg-primary-soft/60" : "border-border bg-background hover:bg-secondary/40"
                        } ${item.is_active ? "" : "opacity-60"}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggleProfessional(item.id, value === true)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{item.name}</span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {item.specialty || "Profissional da clínica"}{item.is_active ? "" : " · inativo"}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              {selectedProfessionalIds.length > 0 ? (
                <p className="mt-2 text-[11px] font-medium text-primary">
                  {selectedProfessionalIds.length} profissional{selectedProfessionalIds.length > 1 ? "is" : ""} selecionado{selectedProfessionalIds.length > 1 ? "s" : ""}.
                </p>
              ) : null}
            </Field>
          </div>

          <Field label="Duração" hint="Tempo médio do atendimento, em minutos.">
            <Input type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Ex.: 60" />
          </Field>
          <Field label="Valor do serviço" hint="Preço integral antes de promoções ou sinal de pagamento.">
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ex.: 150,00" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Resumo" hint="Texto curto exibido no cartão do serviço no catálogo.">
              <Textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Ex.: Limpeza profissional para remoção de placa e tártaro."
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Descrição completa" hint="Explique com mais detalhes o procedimento, benefícios e informações importantes.">
              <Textarea
                value={descriptionText}
                onChange={(e) => setDescriptionText(e.target.value)}
                placeholder="Descreva como funciona o atendimento e o que o cliente pode esperar."
                className="min-h-[110px]"
              />
            </Field>
          </div>
        </div>
        <DialogFooter><Button className="w-full sm:w-auto" disabled={busy} onClick={save}>{busy ? "Salvando..." : "Salvar serviço"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PromotionEditor({ services, onSaved }: any) {
  const [open, setOpen] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");
  const [serviceId, setServiceId] = useState("all");
  const [discount, setDiscount] = useState("");
  const [promoPrice, setPromoPrice] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!titleValue.trim() || (!discount && !promoPrice)) { toast.error("Informe o título e o desconto ou preço promocional."); return; }
    setBusy(true);
    const { error } = await db.from("promotions").insert({
      title: titleValue.trim(),
      description: descriptionValue.trim(),
      service_id: serviceId === "all" ? null : serviceId,
      discount_percent: discount ? Number(discount.replace(",", ".")) : null,
      promotional_price: promoPrice ? Number(promoPrice.replace(",", ".")) : null,
      starts_at: toIso(startsAt),
      ends_at: toIso(endsAt),
      is_active: true,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Promoção criada.");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 rounded-full px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
          <Plus className="size-3.5 sm:size-4" /> <span className="sm:hidden">Nova</span><span className="hidden sm:inline">Nova promoção</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-2xl p-5 sm:max-w-lg sm:p-6">
        <DialogHeader><DialogTitle>Nova promoção</DialogTitle><DialogDescription>Defina a oferta e, se desejar, um período.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Título"><Input value={titleValue} onChange={(e) => setTitleValue(e.target.value)} /></Field></div>
          <div className="sm:col-span-2"><Field label="Descrição"><Textarea value={descriptionValue} onChange={(e) => setDescriptionValue(e.target.value)} /></Field></div>
          <div className="sm:col-span-2"><Field label="Serviço">
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos / institucional</SelectItem>{services.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field></div>
          <Field label="Desconto (%)"><Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
          <Field label="Preço promocional"><Input inputMode="decimal" value={promoPrice} onChange={(e) => setPromoPrice(e.target.value)} /></Field>
          <Field label="Início"><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
          <Field label="Fim"><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></Field>
        </div>
        <DialogFooter><Button className="w-full sm:w-auto" disabled={busy} onClick={save}>{busy ? "Criando..." : "Criar promoção"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminEmailEditor({ onSaved }: any) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) { toast.error("Digite um e-mail válido."); return; }
    setBusy(true);
    const { error } = await db.from("admin_emails").upsert({ email: normalized, enabled: true }, { onConflict: "email" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("E-mail autorizado.");
    setEmail("");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 rounded-full px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
          <Plus className="size-3.5 sm:size-4" /> <span className="sm:hidden">Adicionar</span><span className="hidden sm:inline">Adicionar acesso</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-1rem)] rounded-2xl p-5 sm:max-w-md sm:p-6">
        <DialogHeader><DialogTitle>Autorizar e-mail</DialogTitle><DialogDescription>O usuário ainda precisará entrar na própria conta.</DialogDescription></DialogHeader>
        <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" /></Field>
        <DialogFooter><Button className="w-full sm:w-auto" disabled={busy} onClick={save}>{busy ? "Salvando..." : "Autorizar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {children}
      {hint ? <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
