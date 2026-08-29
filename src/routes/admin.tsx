import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, CircleDollarSign, Stethoscope, Users } from "lucide-react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getAdminOverview } from "@/lib/clinic.functions";
import { formatDate, formatPrice } from "@/lib/clinic";

const title = "Painel administrativo — JR Clinic";
const description =
  "Visão geral de agendamentos, ocupação e catálogo de serviços da JR Clinic com dados de demonstração.";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
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

function Admin() {
  const fetchOverview = useServerFn(getAdminOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
  });

  if (isLoading) return <p className="p-8 text-sm text-muted-foreground">Carregando painel...</p>;
  if (error)
    return <p className="p-8 text-sm text-destructive">Não foi possível carregar o painel.</p>;
  if (!data?.isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="text-2xl font-semibold">Acesso restrito</h1>
        <p className="mt-3 text-muted-foreground">
          Sua conta ainda não possui permissão administrativa.
        </p>
      </div>
    );
  }

  const revenue = data.appointments
    .filter((item) => item.status !== "cancelado")
    .reduce((total, item) => total + Number(item.service?.price ?? 0), 0);
  const uniquePatients = new Set(data.appointments.map((item) => item.patient_email)).size;
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
      value: String(data.services.length),
      hint: "publicados no catálogo",
    },
    { icon: Users, label: "Pacientes", value: String(uniquePatients), hint: "e-mails únicos" },
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-[1440px] px-5 py-12 sm:px-8">
        <span className="eyebrow text-muted-foreground">Painel</span>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Visão administrativa</h1>
        <p className="mt-3 max-w-[52ch] text-muted-foreground">
          Acompanhe os agendamentos reais e o catálogo publicado no Supabase.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-2xl border border-border bg-card p-5 shadow-soft"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary">
                <metric.icon className="size-4.5" />
              </span>
              <p className="mt-4 text-sm text-muted-foreground">{metric.label}</p>
              <p className="font-display text-2xl font-semibold">{metric.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="agendamentos" className="mt-10">
          <TabsList>
            <TabsTrigger value="agendamentos">Agendamentos</TabsTrigger>
            <TabsTrigger value="servicos">Serviços</TabsTrigger>
            <TabsTrigger value="ocupacao">Ocupação</TabsTrigger>
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
                  {data.appointments.map((appointment) => {
                    return (
                      <TableRow key={appointment.id}>
                        <TableCell className="font-medium">{appointment.id.slice(0, 8)}</TableCell>
                        <TableCell>{appointment.patient_name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {appointment.service?.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(appointment.scheduled_date)} · {appointment.scheduled_time}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={statusVariant[appointment.status]}
                            className="rounded-full font-normal capitalize"
                          >
                            {appointment.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="servicos" className="mt-5">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.services.map((service) => (
                    <TableRow key={service.slug}>
                      <TableCell className="font-medium">{service.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {
                          data.categories.find((category) => category.id === service.category_id)
                            ?.name
                        }
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {service.professional}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {service.duration_min} min
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPrice(service.price)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="ocupacao" className="mt-5">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h2 className="text-lg font-semibold">Resumo operacional</h2>
              <p className="mt-6 text-sm text-muted-foreground">
                {data.categories.length} especialidades ativas · {data.services.length} serviços
                publicados · {data.appointments.length} agendamentos registrados
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <SiteFooter />
    </div>
  );
}
