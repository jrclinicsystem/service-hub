import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { CalendarDays, Clock3, RefreshCw, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const weekdays = [
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
] as const;
const periods = [
  { value: "morning", label: "Manhã", detail: "Até 11:59" },
  { value: "afternoon", label: "Tarde", detail: "12:00 às 17:59" },
  { value: "evening", label: "Noite", detail: "A partir de 18:00" },
] as const;

export const Route = createFileRoute("/admin_/disponibilidade")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: "/admin/disponibilidade" } });
  },
  component: AvailabilityPage,
});

async function loadData() {
  const { data: isAdmin, error: adminError } = await db.rpc("is_current_user_admin");
  if (adminError) throw adminError;
  if (!isAdmin) throw new Error("Acesso administrativo necessário.");
  const [professionals, availability] = await Promise.all([
    db.from("professionals").select("id,name,specialty,is_active").is("deleted_at", null).order("sort_order").order("name"),
    db.from("professional_availability_periods").select("id,professional_id,weekday,period,is_available").order("weekday").order("period"),
  ]);
  if (professionals.error) throw professionals.error;
  if (availability.error) throw availability.error;
  return { professionals: professionals.data ?? [], availability: availability.data ?? [] };
}

function AvailabilityPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ["admin-professional-availability"], queryFn: loadData });
  const [selectedId, setSelectedId] = useState("");
  const professionalId = selectedId || data?.professionals?.[0]?.id || "";

  const setAvailability = async (weekday: number, period: string, checked: boolean) => {
    if (!professionalId) return;
    const { error: saveError } = await db.from("professional_availability_periods").upsert({
      professional_id: professionalId,
      weekday,
      period,
      is_available: checked,
      updated_at: new Date().toISOString(),
    }, { onConflict: "professional_id,weekday,period" });
    if (saveError) { toast.error(saveError.message); return; }
    await refetch();
  };

  if (isLoading) return <div className="grid min-h-screen place-items-center">Carregando disponibilidade...</div>;
  if (error || !data) return <div className="grid min-h-screen place-items-center px-6 text-center">{error instanceof Error ? error.message : "Erro ao carregar."}</div>;

  const selected = data.professionals.find((item: any) => item.id === professionalId);
  const rows = data.availability.filter((item: any) => item.professional_id === professionalId);
  const activeCount = rows.filter((item: any) => item.is_available).length;

  return (
    <div className="min-h-screen bg-background lg:pl-[252px]">
      <AdminSubpageSidebar active={"team"} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Agenda da equipe</p><h1 className="mt-2 text-3xl font-semibold">Dias e turnos</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Defina em quais dias e períodos cada profissional aceita novos agendamentos.</p></div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar</Button>
        </div>

        <section className="mt-7 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div><p className="mb-2 text-xs font-medium">Profissional</p><Select value={professionalId} onValueChange={setSelectedId}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent>{data.professionals.map((professional: any) => <SelectItem key={professional.id} value={professional.id}>{professional.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex gap-2"><div className="rounded-2xl bg-secondary/60 px-4 py-2.5"><p className="text-lg font-semibold">{activeCount}</p><p className="text-[10px] text-muted-foreground">turnos ativos</p></div></div>
          </div>
          {selected ? <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Users className="size-4" /> {selected.name} · {selected.specialty || "Profissional JR Clinic"}</div> : null}
        </section>

        <div className="mt-6 space-y-3">
          {weekdays.map((day) => (
            <section key={day.value} className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-5">
              <div className="mb-4 flex items-center gap-2"><CalendarDays className="size-4 text-primary" /><h2 className="font-semibold">{day.label}</h2></div>
              <div className="grid gap-2 md:grid-cols-3">
                {periods.map((period) => {
                  const row = rows.find((item: any) => item.weekday === day.value && item.period === period.value);
                  const checked = row?.is_available ?? false;
                  return <div key={period.value} className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"><div><div className="flex items-center gap-2"><Clock3 className="size-3.5 text-primary" /><p className="text-sm font-medium">{period.label}</p></div><p className="mt-1 text-[10px] text-muted-foreground">{period.detail}</p></div><Switch checked={checked} onCheckedChange={(value) => setAvailability(day.value, period.value, value)} /></div>;
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
