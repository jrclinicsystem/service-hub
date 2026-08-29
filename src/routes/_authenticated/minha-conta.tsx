import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { getMyAppointments } from "@/lib/clinic.functions";
import { formatDate, formatPrice, statusVariant, type AppointmentStatus } from "@/lib/clinic";

const title = "Minha conta — agendamentos na JR Clinic";
const description =
  "Acompanhe seus agendamentos confirmados, pendentes e cancelados na JR Clinic em um só lugar.";

export const Route = createFileRoute("/_authenticated/minha-conta")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MinhaConta,
});

function MinhaConta() {
  const { user } = useAuth();
  const fetchAppointments = useServerFn(getMyAppointments);
  const { data, isLoading } = useQuery({
    queryKey: ["my-appointments"],
    queryFn: () => fetchAppointments(),
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
        <span className="eyebrow text-muted-foreground">Minha conta</span>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Meus agendamentos</h1>
        <p className="mt-3 text-muted-foreground">
          {user?.email ? `Conectado como ${user.email}.` : "Carregando sua sessão..."}
        </p>

        {isLoading ? (
          <p className="mt-10 text-sm text-muted-foreground">Carregando agendamentos...</p>
        ) : !data || data.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
            <p className="text-sm text-muted-foreground">
              Você ainda não tem agendamentos registrados.
            </p>
            <Button asChild className="mt-5 rounded-full">
              <Link to="/catalogo">Ver serviços</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {data.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft"
              >
                <div>
                  <p className="font-medium">{item.service?.name ?? "Serviço"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDate(item.scheduled_date)} · {item.scheduled_time} ·{" "}
                    {item.service ? formatPrice(Number(item.service.price)) : ""}
                  </p>
                </div>
                <Badge
                  variant={statusVariant[item.status as AppointmentStatus] ?? "secondary"}
                  className="rounded-full font-normal capitalize"
                >
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
