import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, CircleDollarSign, TrendingUp, Users } from "lucide-react";

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
import {
  appointments,
  categories,
  formatPrice,
  getCategory,
  getService,
  services,
  weekLoad,
} from "@/data/clinic";

const title = "Painel administrativo — JR Clinic";
const description =
  "Visão geral de agendamentos, ocupação e catálogo de serviços da JR Clinic com dados de demonstração.";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Admin;
});

const metrics = [
  { icon: CalendarDays, label: "Agendamentos no mês", value: "128", hint: "+12% vs. mês anterior" },
  { icon: CircleDollarSign, label: "Receita estimada", value: "R$ 42.180", hint: "+8% vs. mês anterior" },
  { icon: TrendingUp, label: "Taxa de ocupação", value: "87%", hint: "média das últimas 4 semanas" },
  { icon: Users, label: "Novos pacientes", value: "36", hint: "28% do total de atendimentos" },
];

const statusVariant = {
  confirmado: "default",
  pendente: "secondary",
  cancelado: "destructive",
} as const;

function Admin() {
  const maxLoad = Math.max(...weekLoad.map((d) => d.agendamentos));

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <span className="eyebrow text-muted-foreground">Painel</span>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Visão administrativa</h1>
        <p className="mt-3 max-w-[52ch] text-muted-foreground">
          Acompanhe agendamentos, ocupação da agenda e o catálogo publicado. Dados fictícios para
          demonstração.
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
                  {appointments.map((appointment) => {
                    const service = getService(appointment.serviceSlug);
                    return (
                      <TableRow key={appointment.id}>
                        <TableCell className="font-medium">{appointment.id}</TableCell>
                        <TableCell>{appointment.patient}</TableCell>
                        <TableCell className="text-muted-foreground">{service?.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {appointment.date} · {appointment.time}
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
                  {services.map((service) => (
                    <TableRow key={service.slug}>
                      <TableCell className="font-medium">{service.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {getCategory(service.categoryId)?.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {service.professional}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {service.durationMin} min
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
              <h2 className="text-lg font-semibold">Agendamentos por dia da semana</h2>
              <div className="mt-6 space-y-3">
                {weekLoad.map((item) => (
                  <div key={item.day} className="flex items-center gap-4">
                    <span className="w-10 text-sm text-muted-foreground">{item.day}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(item.agendamentos / maxLoad) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-sm font-medium">{item.agendamentos}</span>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm text-muted-foreground">
                {categories.length} especialidades ativas · {services.length} serviços publicados
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <SiteFooter />
    </div>
  );
}
