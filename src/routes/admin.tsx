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
import { formatDate, formatPrice } from "@/lib/clinic";

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
      promotions: [],
      timeSlots: [],
      adminEmails: [],
    };
  }

  const [appointments, services, categories, promotions, timeSlots, adminEmails] = await Promise.all([
    db
      .from("appointments")
      .select(
        "id, patient_name, patient_email, scheduled_date, scheduled_time, status, service:services(name, price)",
      )
      .order("scheduled_date", { ascending: true }),
    db
      .from("services")
      .select(
        "id, slug, name, category_id, professional, professional_role, duration_min, price, rating, reviews_count, summary, description, includes, preparation, is_active",
      )
      .order("name"),
    db.from("categories").select("id, name, description, sort_order").order("sort_order"),
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

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-overview"] });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: {} });
  };

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <p className="text-sm text-muted-foreground">Carregando painel...</p>
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
          <div className="mt-5 flex justify-center gap-2">
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
          <ShieldCheck className="mx-auto size-10 text-primary" />
          <h1 className="mt-5 text-2xl font-semibold">Acesso restrito</h1>
          <p className="mt-3 text-muted-foreground">
            O e-mail {data?.currentEmail || "desta conta"} não está autorizado para administrar a JR Clinic.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" asChild><Link to="/">Voltar ao site</Link></Button>
            <Button onClick={signOut}>Sair</Button>
          </div>
        </div>
      </div>
    );
  }

  const revenue = data.appointments
    .filter((item: any) => item.status !== "cancelado")
    .reduce((total: number, item: any) => total + Number(item.service?.price ?? 0), 0);
  const uniquePatients = new Set(data.appointments.map((item: any) => item.patient_email)).size;
  const activeServices = data.services.filter((item: any) => item.is_active).length;

  const updateRow = async (table: string, idColumn: string, id: string, values: any, message?: string) => {
    const { error } = await db.from(table).update(values).eq(idColumn, id);
    if (error) return toast.error(error.message);
    if (message) toast.success(message);
    refresh();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-17 max-w-[1480px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-4">
            <img src={logo} alt="JR Clinic" className="h-9 w-auto" />
            <span className="hidden h-6 w-px bg-border sm:block" />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold">Administração</p>
              <p className="text-[11px] text-muted-foreground">{data.currentEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild><Link to="/">Ver site</Link></Button>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="size-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] px-5 py-10 sm:px-8">
        <span className="eyebrow text-muted-foreground">Controle da clínica</span>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Painel de controle</h1>
        <p className="mt-3 max-w-[58ch] text-muted-foreground">
          Gerencie agendamentos, catálogo, promoções, horários disponíveis e acessos administrativos.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={CalendarDays} label="Agendamentos" value={String(data.appointments.length)} hint="registros no sistema" />
          <Metric icon={CircleDollarSign} label="Receita estimada" value={formatPrice(revenue)} hint="exclui cancelados" />
          <Metric icon={Stethoscope} label="Serviços ativos" value={String(activeServices)} hint="publicados no catálogo" />
          <Metric icon={Users} label="Pacientes" value={String(uniquePatients)} hint="e-mails únicos" />
        </div>

        <Tabs defaultValue="agendamentos" className="mt-10">
          <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-secondary/70 p-1 sm:w-auto">
            <TabsTrigger value="agendamentos">Agendamentos</TabsTrigger>
            <TabsTrigger value="servicos">Serviços</TabsTrigger>
            <TabsTrigger value="promocoes">Promoções</TabsTrigger>
            <TabsTrigger value="horarios">Horários</TabsTrigger>
            <TabsTrigger value="acessos">Acessos</TabsTrigger>
          </TabsList>

          <TabsContent value="agendamentos" className="mt-5">
            <PanelTable>
              <TableHeader><TableRow>
                <TableHead>Paciente</TableHead><TableHead>Serviço</TableHead>
                <TableHead>Quando</TableHead><TableHead className="text-right">Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.appointments.map((appointment: any) => (
                  <TableRow key={appointment.id}>
                    <TableCell>
                      <p className="font-medium">{appointment.patient_name}</p>
                      <p className="text-xs text-muted-foreground">{appointment.patient_email}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{appointment.service?.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(appointment.scheduled_date)} · {appointment.scheduled_time}
                    </TableCell>
                    <TableCell className="text-right">
                      <Select
                        value={appointment.status}
                        onValueChange={(status) =>
                          updateRow("appointments", "id", appointment.id, { status }, "Status atualizado.")
                        }
                      >
                        <SelectTrigger className="ml-auto w-[145px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="confirmado">Confirmado</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </PanelTable>
          </TabsContent>

          <TabsContent value="servicos" className="mt-5">
            <SectionHeader
              title="Catálogo de serviços"
              subtitle="Crie, edite ou retire serviços do catálogo."
              action={<ServiceEditor categories={data.categories} onSaved={refresh} />}
            />
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
                    <TableCell className="text-muted-foreground">
                      {data.categories.find((c: any) => c.id === service.category_id)?.name}
                    </TableCell>
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
                      <ServiceEditor service={service} categories={data.categories} onSaved={refresh} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </PanelTable>
          </TabsContent>

          <TabsContent value="promocoes" className="mt-5">
            <SectionHeader
              title="Promoções"
              subtitle="Crie campanhas e vincule a um serviço."
              action={<PromotionEditor services={data.services} onSaved={refresh} />}
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.promotions.length === 0 ? (
                <EmptyCard icon={Tag} text="Nenhuma promoção cadastrada ainda." />
              ) : data.promotions.map((promotion: any) => (
                <div key={promotion.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge variant={promotion.is_active ? "default" : "secondary"} className="rounded-full">
                        {promotion.is_active ? "Ativa" : "Pausada"}
                      </Badge>
                      <h3 className="mt-3 text-lg font-semibold">{promotion.title}</h3>
                    </div>
                    <Switch
                      checked={promotion.is_active}
                      onCheckedChange={(is_active) =>
                        updateRow("promotions", "id", promotion.id, { is_active }, "Promoção atualizada.")
                      }
                    />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{promotion.description}</p>
                  <p className="mt-4 font-medium text-primary">
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

          <TabsContent value="horarios" className="mt-5">
            <SectionHeader title="Horários disponíveis" subtitle="Ative ou pause horários que aparecem no agendamento." />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.timeSlots.map((slot: any) => (
                <div key={slot.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-soft">
                  <div className="flex items-center gap-3">
                    <Clock3 className="size-4 text-primary" />
                    <span className="font-medium lining-nums tabular-nums">{slot.slot}</span>
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

          <TabsContent value="acessos" className="mt-5">
            <SectionHeader
              title="E-mails administrativos"
              subtitle="Somente estes e-mails podem usar o painel interno."
              action={<AdminEmailEditor onSaved={refresh} />}
            />
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              {data.adminEmails.map((item: any) => {
                const isCurrent = item.email === data.currentEmail;
                return (
                  <div key={item.email} className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-b-0">
                    <div>
                      <p className="text-sm font-medium">{item.email}</p>
                      <p className="text-xs text-muted-foreground">{isCurrent ? "Seu acesso atual" : "Acesso administrativo"}</p>
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

function Metric({ icon: Icon, label, value, hint }: any) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-4.5" /></span>
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="font-sans text-2xl font-semibold tracking-tight lining-nums tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function SectionHeader({ title, subtitle, action }: any) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{subtitle}</p></div>
      {action}
    </div>
  );
}

function PanelTable({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft"><Table>{children}</Table></div>;
}

function EmptyCard({ icon: Icon, text }: any) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <Icon className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function ServiceEditor({ service, categories, onSaved }: any) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(service?.name ?? "");
  const [categoryId, setCategoryId] = useState(service?.category_id ?? categories[0]?.id ?? "");
  const [professional, setProfessional] = useState(service?.professional ?? "");
  const [professionalRole, setProfessionalRole] = useState(service?.professional_role ?? "");
  const [duration, setDuration] = useState(String(service?.duration_min ?? 30));
  const [price, setPrice] = useState(String(service?.price ?? ""));
  const [summary, setSummary] = useState(service?.summary ?? "");
  const [descriptionText, setDescriptionText] = useState(service?.description ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || !categoryId || !price) return toast.error("Preencha nome, categoria e valor.");
    setBusy(true);
    const payload = {
      name: name.trim(),
      slug: service?.slug ?? slugify(name),
      category_id: categoryId,
      professional: professional.trim(),
      professional_role: professionalRole.trim(),
      duration_min: Number(duration) || 30,
      price: Number(price.replace(",", ".")) || 0,
      summary: summary.trim(),
      description: descriptionText.trim(),
      includes: service?.includes ?? [],
      preparation: service?.preparation ?? [],
      is_active: service?.is_active ?? true,
    };
    const result = service?.id
      ? await db.from("services").update(payload).eq("id", service.id)
      : await db.from("services").insert(payload);
    setBusy(false);
    if (result.error) return toast.error(result.error.message);
    toast.success(service?.id ? "Serviço atualizado." : "Serviço criado.");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {service ? (
          <Button variant="ghost" size="icon" aria-label={`Editar ${service.name}`}><Pencil className="size-4" /></Button>
        ) : (
          <Button><Plus className="size-4" /> Novo serviço</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{service ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          <DialogDescription>As alterações refletem no catálogo da JR Clinic.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Categoria">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Profissional"><Input value={professional} onChange={(e) => setProfessional(e.target.value)} /></Field>
          <Field label="Função / registro"><Input value={professionalRole} onChange={(e) => setProfessionalRole(e.target.value)} /></Field>
          <Field label="Duração (min)"><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
          <Field label="Valor (R$)"><Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Resumo"><Textarea value={summary} onChange={(e) => setSummary(e.target.value)} /></Field></div>
          <div className="sm:col-span-2"><Field label="Descrição"><Textarea value={descriptionText} onChange={(e) => setDescriptionText(e.target.value)} /></Field></div>
        </div>
        <DialogFooter><Button disabled={busy} onClick={save}>{busy ? "Salvando..." : "Salvar"}</Button></DialogFooter>
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
    if (!titleValue.trim() || (!discount && !promoPrice)) return toast.error("Informe o título e o desconto ou preço promocional.");
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
    if (error) return toast.error(error.message);
    toast.success("Promoção criada.");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="size-4" /> Nova promoção</Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
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
        <DialogFooter><Button disabled={busy} onClick={save}>{busy ? "Criando..." : "Criar promoção"}</Button></DialogFooter>
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
    if (!normalized.includes("@")) return toast.error("Digite um e-mail válido.");
    setBusy(true);
    const { error } = await db.from("admin_emails").upsert({ email: normalized, enabled: true }, { onConflict: "email" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("E-mail autorizado.");
    setEmail("");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="size-4" /> Adicionar acesso</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Autorizar e-mail</DialogTitle><DialogDescription>O usuário ainda precisará entrar na própria conta.</DialogDescription></DialogHeader>
        <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" /></Field>
        <DialogFooter><Button disabled={busy} onClick={save}>{busy ? "Salvando..." : "Autorizar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="mb-2 block">{label}</Label>{children}</div>;
}
