import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
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
import { getAdminOverview } from "@/lib/clinic.functions";
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

const statusVariant = {
  confirmado: "default",
  pendente: "secondary",
  cancelado: "destructive",
} as const;

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

function Admin() {
  const fetchOverview = useServerFn(getAdminOverview);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-overview"] });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: {} });
  };

  if (isLoading)
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <p className="text-sm text-muted-foreground">Carregando painel...</p>
      </div>
    );
  if (error)
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <p className="text-sm text-destructive">Não foi possível carregar o painel.</p>
      </div>
    );
  if (!data?.isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-5">
        <div className="max-w-md text-center">
          <ShieldCheck className="mx-auto size-10 text-primary" />
          <h1 className="mt-5 text-2xl font-semibold">Acesso restrito</h1>
          <p className="mt-3 text-muted-foreground">
            Este e-mail não está autorizado para administrar a JR Clinic.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" asChild>
              <Link to="/">Voltar ao site</Link>
            </Button>
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
  const metrics = [
    {
      icon: CalendarDays,
      label: "Agendamentos",
      value: String(data.appointments.length),
      hint: "registros no sistema",
    },
    {
      icon: CircleDollarSign,
      label: "Receita estimada",
      value: formatPrice(revenue),
      hint: "exclui cancelados",
    },
    {
      icon: Stethoscope,
      label: "Serviços ativos",
      value: String(activeServices),
      hint: "publicados no catálogo",
    },
    { icon: Users, label: "Pacientes", value: String(uniquePatients), hint: "e-mails únicos" },
  ];

  const updateStatus = async (id: string, status: string) => {
    const { error } = await db.from("appointments").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado.");
    refresh();
  };

  const toggleService = async (id: string, isActive: boolean) => {
    const { error } = await db.from("services").update({ is_active: isActive }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(isActive ? "Serviço publicado." : "Serviço ocultado do catálogo.");
    refresh();
  };

  const togglePromotion = async (id: string, isActive: boolean) => {
    const { error } = await db.from("promotions").update({ is_active: isActive }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Promoção atualizada.");
    refresh();
  };

  const toggleSlot = async (id: string, isAvailable: boolean) => {
    const { error } = await db.from("time_slots").update({ is_available: isAvailable }).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const toggleAdminEmail = async (email: string, enabled: boolean) => {
    const { error } = await db.from("admin_emails").update({ enabled }).eq("email", email);
    if (error) return toast.error(error.message);
    toast.success("Permissão atualizada.");
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
              <p className="text-[11px] text-muted-foreground">Painel interno JR Clinic</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">Ver site</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <span className="eyebrow text-muted-foreground">Controle da clínica</span>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Painel de controle</h1>
            <p className="mt-3 max-w-[58ch] text-muted-foreground">
              Gerencie agenda, catálogo, promoções, horários disponíveis e acessos sem expor estas
              ferramentas aos pacientes.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary">
                <metric.icon className="size-4.5" />
              </span>
              <p className="mt-4 text-sm text-muted-foreground">{metric.label}</p>
              <p className="font-sans text-2xl font-semibold tracking-tight lining-nums tabular-nums">
                {metric.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
            </div>
          ))}
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
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.appointments.map((appointment: any) => (
                    <TableRow key={appointment.id}>
                      <TableCell className="font-medium">{appointment.id.slice(0, 8)}</TableCell>
                      <TableCell>{appointment.patient_name}</TableCell>
                      <TableCell className="text-muted-foreground">{appointment.service?.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(appointment.scheduled_date)} · {appointment.scheduled_time}
                      </TableCell>
                      <TableCell className="text-right">
                        <Select
                          value={appointment.status}
                          onValueChange={(value) => updateStatus(appointment.id, value)}
                        >
                          <SelectTrigger className="ml-auto w-[145px]">
                            <SelectValue />
                          </SelectTrigger>
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
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="servicos" className="mt-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Catálogo de serviços</h2>
                <p className="text-sm text-muted-foreground">Crie, edite ou retire serviços do catálogo.</p>
              </div>
              <ServiceEditor categories={data.categories} onSaved={refresh} />
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Publicado</TableHead>
                    <TableHead className="text-right">Editar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.services.map((service: any) => (
                    <TableRow key={service.id}>
                      <TableCell>
                        <p className="font-medium">{service.name}</p>
                        <p className="text-xs text-muted-foreground">/{service.slug}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {data.categories.find((category: any) => category.id === service.category_id)?.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{service.professional}</TableCell>
                      <TableCell className="font-medium">{formatPrice(service.price)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={service.is_active}
                          onCheckedChange={(checked) => toggleService(service.id, checked)}
                          aria-label={`Publicar ${service.name}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <ServiceEditor service={service} categories={data.categories} onSaved={refresh} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="promocoes" className="mt-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Promoções</h2>
                <p className="text-sm text-muted-foreground">Lance campanhas por período e vincule a um serviço.</p>
              </div>
              <PromotionEditor services={data.services} onSaved={refresh} />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.promotions.length === 0 ? (
                <EmptyCard icon={Tag} text="Nenhuma promoção cadastrada ainda." />
              ) : (
                data.promotions.map((promotion: any) => (
                  <div key={promotion.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Badge variant={promotion.is_active ? "default" : "secondary"} className="rounded-full">
                          {promotion.is_active ? "Ativa" : "Pausada"}
                        </Badge>
                        <h3 className="mt-3 text-lg font-semibold">{promotion.title}</h3>
                      </div>
                      <PromotionEditor promotion={promotion} services={data.services} onSaved={refresh} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{promotion.description || "Sem descrição."}</p>
                    <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                      <div className="text-sm">
                        {promotion.promotional_price !== null ? (
                          <strong>{formatPrice(promotion.promotional_price)}</strong>
                        ) : promotion.discount_percent !== null ? (
                          <strong>{promotion.discount_percent}% de desconto</strong>
                        ) : (
                          <span className="text-muted-foreground">Condição personalizada</span>
                        )}
                      </div>
                      <Switch
                        checked={promotion.is_active}
                        onCheckedChange={(checked) => togglePromotion(promotion.id, checked)}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="horarios" className="mt-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Horários disponíveis</h2>
              <p className="text-sm text-muted-foreground">Ative, pause ou adicione horários exibidos no agendamento.</p>
            </div>
            <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {data.timeSlots.map((slot: any) => (
                  <div key={slot.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                    <div>
                      <p className="font-semibold tabular-nums">{slot.slot}</p>
                      <p className="text-xs text-muted-foreground">{slot.is_available ? "Disponível" : "Pausado"}</p>
                    </div>
                    <Switch checked={slot.is_available} onCheckedChange={(checked) => toggleSlot(slot.id, checked)} />
                  </div>
                ))}
              </div>
              <AddTimeSlot onSaved={refresh} />
            </div>
          </TabsContent>

          <TabsContent value="acessos" className="mt-5">
            <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>E-mail autorizado</TableHead>
                      <TableHead className="text-right">Acesso ativo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.adminEmails.map((entry: any) => (
                      <TableRow key={entry.email}>
                        <TableCell className="font-medium">{entry.email}</TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={entry.enabled}
                            onCheckedChange={(checked) => toggleAdminEmail(entry.email, checked)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <AddAdminEmail onSaved={refresh} />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function EmptyCard({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <Icon className="mx-auto size-6 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function ServiceEditor({ service, categories, onSaved }: { service?: any; categories: any[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    name: service?.name ?? "",
    slug: service?.slug ?? "",
    category_id: service?.category_id ?? categories[0]?.id ?? "",
    professional: service?.professional ?? "",
    professional_role: service?.professional_role ?? "",
    duration_min: String(service?.duration_min ?? 30),
    price: String(service?.price ?? ""),
    summary: service?.summary ?? "",
    description: service?.description ?? "",
    is_active: service?.is_active ?? true,
  }));

  const set = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.name.trim() || !form.category_id || !form.price) {
      toast.error("Preencha nome, categoria e valor.");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      slug: (form.slug || slugify(form.name)).trim(),
      category_id: form.category_id,
      professional: form.professional.trim(),
      professional_role: form.professional_role.trim(),
      duration_min: Number(form.duration_min) || 30,
      price: Number(String(form.price).replace(",", ".")) || 0,
      summary: form.summary.trim(),
      description: form.description.trim(),
      is_active: form.is_active,
    };
    const result = service?.id
      ? await db.from("services").update(payload).eq("id", service.id)
      : await db.from("services").insert(payload);
    setSaving(false);
    if (result.error) return toast.error(result.error.message);
    toast.success(service ? "Serviço atualizado." : "Serviço criado.");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {service ? (
          <Button variant="ghost" size="icon" aria-label={`Editar ${service.name}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" /> Novo serviço
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{service ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          <DialogDescription>As alterações refletem no catálogo público da clínica.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nome do serviço</Label>
            <Input
              className="mt-2"
              value={form.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (!service && !form.slug) set("slug", slugify(e.target.value));
              }}
            />
          </div>
          <div>
            <Label>Identificador / URL</Label>
            <Input className="mt-2" value={form.slug} onChange={(e) => set("slug", slugify(e.target.value))} />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={form.category_id} onValueChange={(value) => set("category_id", value)}>
              <SelectTrigger className="mt-2 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Profissional</Label>
            <Input className="mt-2" value={form.professional} onChange={(e) => set("professional", e.target.value)} />
          </div>
          <div>
            <Label>Função / especialidade</Label>
            <Input className="mt-2" value={form.professional_role} onChange={(e) => set("professional_role", e.target.value)} />
          </div>
          <div>
            <Label>Duração (minutos)</Label>
            <Input className="mt-2" type="number" min="5" value={form.duration_min} onChange={(e) => set("duration_min", e.target.value)} />
          </div>
          <div>
            <Label>Valor (R$)</Label>
            <Input className="mt-2" inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Resumo</Label>
            <Input className="mt-2" value={form.summary} onChange={(e) => set("summary", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Descrição</Label>
            <Textarea className="mt-2 min-h-28" value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-border px-4 py-3">
            <div><p className="text-sm font-medium">Publicado no catálogo</p><p className="text-xs text-muted-foreground">Desative para ocultar sem apagar o serviço.</p></div>
            <Switch checked={form.is_active} onCheckedChange={(checked) => set("is_active", checked)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar serviço"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PromotionEditor({ promotion, services, onSaved }: { promotion?: any; services: any[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    title: promotion?.title ?? "",
    description: promotion?.description ?? "",
    service_id: promotion?.service_id ?? "all",
    discount_percent: promotion?.discount_percent?.toString() ?? "",
    promotional_price: promotion?.promotional_price?.toString() ?? "",
    starts_at: promotion?.starts_at?.slice(0, 16) ?? "",
    ends_at: promotion?.ends_at?.slice(0, 16) ?? "",
    is_active: promotion?.is_active ?? true,
  }));
  const set = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.title.trim()) return toast.error("Informe o título da promoção.");
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      service_id: form.service_id === "all" ? null : form.service_id,
      discount_percent: form.discount_percent ? Number(String(form.discount_percent).replace(",", ".")) : null,
      promotional_price: form.promotional_price ? Number(String(form.promotional_price).replace(",", ".")) : null,
      starts_at: toIso(form.starts_at),
      ends_at: toIso(form.ends_at),
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };
    const result = promotion?.id
      ? await db.from("promotions").update(payload).eq("id", promotion.id)
      : await db.from("promotions").insert(payload);
    setSaving(false);
    if (result.error) return toast.error(result.error.message);
    toast.success(promotion ? "Promoção atualizada." : "Promoção criada.");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {promotion ? (
          <Button variant="ghost" size="icon"><Pencil className="size-4" /></Button>
        ) : (
          <Button><Plus className="size-4" /> Nova promoção</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{promotion ? "Editar promoção" : "Nova promoção"}</DialogTitle>
          <DialogDescription>Configure desconto, valor promocional e período da campanha.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Título</Label><Input className="mt-2" value={form.title} onChange={(e) => set("title", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Descrição</Label><Textarea className="mt-2" value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
          <div className="sm:col-span-2">
            <Label>Serviço relacionado</Label>
            <Select value={form.service_id} onValueChange={(value) => set("service_id", value)}>
              <SelectTrigger className="mt-2 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Promoção geral</SelectItem>{services.map((service) => <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Desconto (%)</Label><Input className="mt-2" inputMode="decimal" value={form.discount_percent} onChange={(e) => set("discount_percent", e.target.value)} /></div>
          <div><Label>Preço promocional (R$)</Label><Input className="mt-2" inputMode="decimal" value={form.promotional_price} onChange={(e) => set("promotional_price", e.target.value)} /></div>
          <div><Label>Início</Label><Input className="mt-2" type="datetime-local" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} /></div>
          <div><Label>Fim</Label><Input className="mt-2" type="datetime-local" value={form.ends_at} onChange={(e) => set("ends_at", e.target.value)} /></div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-border px-4 py-3"><div><p className="text-sm font-medium">Promoção ativa</p><p className="text-xs text-muted-foreground">Pode ser pausada sem apagar.</p></div><Switch checked={form.is_active} onCheckedChange={(checked) => set("is_active", checked)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar promoção"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddTimeSlot({ onSaved }: { onSaved: () => void }) {
  const [slot, setSlot] = useState("");
  const [saving, setSaving] = useState(false);
  const sortOrder = useMemo(() => Number(slot.replace(":", "")) || 0, [slot]);
  const save = async () => {
    if (!/^\d{2}:\d{2}$/.test(slot)) return toast.error("Informe um horário válido.");
    setSaving(true);
    const { error } = await db.from("time_slots").insert({ slot, is_available: true, sort_order: sortOrder });
    setSaving(false);
    if (error) return toast.error(error.message);
    setSlot("");
    toast.success("Horário adicionado.");
    onSaved();
  };
  return (
    <div className="h-fit rounded-2xl border border-border bg-card p-5 shadow-soft">
      <Clock3 className="size-5 text-primary" />
      <h3 className="mt-3 font-semibold">Adicionar horário</h3>
      <p className="mt-1 text-xs text-muted-foreground">O novo horário ficará disponível imediatamente.</p>
      <Label className="mt-5 block">Horário</Label>
      <Input className="mt-2" type="time" value={slot} onChange={(e) => setSlot(e.target.value)} />
      <Button className="mt-4 w-full" onClick={save} disabled={saving || !slot}><Plus className="size-4" /> Adicionar</Button>
    </div>
  );
}

function AddAdminEmail({ onSaved }: { onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return toast.error("Informe um e-mail válido.");
    setSaving(true);
    const { error } = await db.from("admin_emails").upsert({ email: normalized, enabled: true }, { onConflict: "email" });
    setSaving(false);
    if (error) return toast.error(error.message);
    setEmail("");
    toast.success("E-mail autorizado.");
    onSaved();
  };
  return (
    <div className="h-fit rounded-2xl border border-border bg-card p-5 shadow-soft">
      <ShieldCheck className="size-5 text-primary" />
      <h3 className="mt-3 font-semibold">Autorizar novo e-mail</h3>
      <p className="mt-1 text-xs text-muted-foreground">Esse e-mail poderá acessar o painel após entrar na conta.</p>
      <Label className="mt-5 block">E-mail</Label>
      <Input className="mt-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@exemplo.com" />
      <Button className="mt-4 w-full" onClick={save} disabled={saving || !email}><Plus className="size-4" /> Autorizar acesso</Button>
    </div>
  );
}
