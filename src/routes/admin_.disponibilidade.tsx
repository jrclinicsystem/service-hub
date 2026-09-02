import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { CalendarDays, Clock3, Copy, Plus, RefreshCw, Trash2, UserRound, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export const Route = createFileRoute("/admin_/disponibilidade")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: "/admin/disponibilidade" } });
  },
  component: AvailabilityPage,
});

function localIsoDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function periodForTime(time: string) {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

async function loadProfessionals() {
  const { data: isAdmin, error: adminError } = await db.rpc("is_current_user_admin");
  if (adminError) throw adminError;
  if (!isAdmin) throw new Error("Acesso administrativo necessário.");

  const { data, error } = await db
    .from("professionals")
    .select("id,name,specialty,is_active,sort_order")
    .is("deleted_at", null)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

async function loadDateSlots(professionalId: string, date: string) {
  if (!professionalId || !date) return [];
  const { data, error } = await db
    .from("professional_date_time_slots")
    .select("id,professional_id,available_date,slot,is_available,sort_order")
    .eq("professional_id", professionalId)
    .eq("available_date", date)
    .order("sort_order")
    .order("slot");
  if (error) throw error;
  return data ?? [];
}

function AvailabilityPage() {
  const [selectedId, setSelectedId] = useState("");
  const [selectedDate, setSelectedDate] = useState(localIsoDate());
  const [newTime, setNewTime] = useState("");
  const [saving, setSaving] = useState(false);

  const professionalsQuery = useQuery({ queryKey: ["admin-date-availability-professionals"], queryFn: loadProfessionals });
  const professionalId = selectedId || professionalsQuery.data?.[0]?.id || "";
  const slotsQuery = useQuery({
    queryKey: ["admin-date-availability-slots", professionalId, selectedDate],
    queryFn: () => loadDateSlots(professionalId, selectedDate),
    enabled: Boolean(professionalId && selectedDate),
  });

  const selected = professionalsQuery.data?.find((item: any) => item.id === professionalId);
  const configuredRows = slotsQuery.data ?? [];
  const visibleRows = configuredRows.filter((row: any) => row.slot !== "00:00");
  const isClosed = configuredRows.length > 0 && configuredRows.every((row: any) => !row.is_available);
  const mode = configuredRows.length === 0 ? "Padrão geral" : isClosed ? "Dia fechado" : "Data personalizada";
  const formattedDate = useMemo(() => new Date(`${selectedDate}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }), [selectedDate]);

  const refresh = async () => { await slotsQuery.refetch(); };

  const addTime = async () => {
    if (!professionalId || !selectedDate || !newTime) return;
    if (newTime === "00:00") { toast.error("Escolha um horário diferente de 00:00."); return; }
    setSaving(true);
    try {
      await db.from("professional_date_time_slots").delete().eq("professional_id", professionalId).eq("available_date", selectedDate).eq("slot", "00:00");
      const { error } = await db.from("professional_date_time_slots").upsert({
        professional_id: professionalId,
        available_date: selectedDate,
        slot: newTime,
        is_available: true,
        sort_order: Number(newTime.replace(":", "")),
      }, { onConflict: "professional_id,available_date,slot" });
      if (error) throw error;
      setNewTime("");
      toast.success("Horário liberado para esta data.");
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível adicionar o horário.");
    } finally {
      setSaving(false);
    }
  };

  const closeDay = async () => {
    if (!professionalId || !selectedDate) return;
    setSaving(true);
    try {
      const { error: clearError } = await db.from("professional_date_time_slots").delete().eq("professional_id", professionalId).eq("available_date", selectedDate);
      if (clearError) throw clearError;
      const { error } = await db.from("professional_date_time_slots").insert({
        professional_id: professionalId,
        available_date: selectedDate,
        slot: "00:00",
        is_available: false,
        sort_order: 0,
      });
      if (error) throw error;
      toast.success("Dia fechado para novos agendamentos.");
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível fechar o dia.");
    } finally {
      setSaving(false);
    }
  };

  const clearDate = async () => {
    if (!professionalId || !selectedDate) return;
    const { error } = await db.from("professional_date_time_slots").delete().eq("professional_id", professionalId).eq("available_date", selectedDate);
    if (error) { toast.error(error.message); return; }
    toast.success("Configuração da data removida. O padrão geral volta a valer.");
    await refresh();
  };

  const copyFallback = async () => {
    if (!professionalId || !selectedDate) return;
    setSaving(true);
    try {
      const weekday = new Date(`${selectedDate}T12:00:00`).getDay();
      const [slotsResult, availabilityResult] = await Promise.all([
        db.from("professional_time_slots").select("slot,is_available,sort_order").eq("professional_id", professionalId).eq("is_available", true).order("sort_order"),
        db.from("professional_availability_periods").select("weekday,period,is_available").eq("professional_id", professionalId),
      ]);
      if (slotsResult.error) throw slotsResult.error;
      if (availabilityResult.error) throw availabilityResult.error;

      const availability = availabilityResult.data ?? [];
      const fallback = (slotsResult.data ?? []).filter((slot: any) => {
        if (!availability.length) return true;
        return availability.some((row: any) => row.weekday === weekday && row.period === periodForTime(slot.slot) && row.is_available);
      });
      if (!fallback.length) {
        toast.info("O padrão geral não possui horários ativos para esta data.");
        return;
      }

      const { error: clearError } = await db.from("professional_date_time_slots").delete().eq("professional_id", professionalId).eq("available_date", selectedDate);
      if (clearError) throw clearError;
      const { error } = await db.from("professional_date_time_slots").insert(fallback.map((slot: any) => ({
        professional_id: professionalId,
        available_date: selectedDate,
        slot: slot.slot,
        is_available: true,
        sort_order: slot.sort_order ?? Number(slot.slot.replace(":", "")),
      })));
      if (error) throw error;
      toast.success("Horários do padrão geral copiados para esta data.");
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível copiar os horários.");
    } finally {
      setSaving(false);
    }
  };

  if (professionalsQuery.isLoading) return <div className="grid min-h-screen place-items-center">Carregando disponibilidade...</div>;
  if (professionalsQuery.error) return <div className="grid min-h-screen place-items-center px-6 text-center">{professionalsQuery.error instanceof Error ? professionalsQuery.error.message : "Erro ao carregar."}</div>;

  return (
    <div className="min-h-screen bg-background lg:pl-[252px]">
      <AdminSubpageSidebar active="availability" />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Agenda da equipe</p>
            <h1 className="mt-2 text-3xl font-semibold">Exceção de disponibilidade por data</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Use esta área somente quando um dia for diferente do padrão semanal. Quando uma data tiver horários próprios, eles substituem o padrão apenas naquele dia.</p>
          </div>
          <Button variant="outline" onClick={() => refresh()} disabled={slotsQuery.isFetching}><RefreshCw className={`size-4 ${slotsQuery.isFetching ? "animate-spin" : ""}`} /> Atualizar</Button>
        </div>

        <section className="mt-7 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium">Profissional</p>
              <Select value={professionalId} onValueChange={(value) => setSelectedId(value)}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{(professionalsQuery.data ?? []).map((professional: any) => <SelectItem key={professional.id} value={professional.id}>{professional.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium">Data</p>
              <Input type="date" min={localIsoDate()} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="h-11" />
            </div>
          </div>
          {selected ? <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><UserRound className="size-4" /> {selected.name} · {selected.specialty || "Profissional JR Clinic"}<span className="rounded-full bg-secondary px-2.5 py-1 font-medium text-foreground">{mode}</span></div> : null}
        </section>

        <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><CalendarDays className="size-5 text-primary" /><h2 className="text-lg font-bold capitalize">{formattedDate}</h2></div>
              <p className="mt-1 text-xs text-muted-foreground">Adicione os horários que valerão somente neste dia. Enquanto esta exceção existir, o padrão semanal não será usado nesta data.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copyFallback} disabled={saving}><Copy className="size-4" /> Copiar padrão geral</Button>
              <Button type="button" variant="outline" size="sm" onClick={closeDay} disabled={saving}><XCircle className="size-4" /> Fechar dia</Button>
              {configuredRows.length ? <Button type="button" variant="ghost" size="sm" onClick={clearDate} disabled={saving}>Usar padrão geral</Button> : null}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="sm:max-w-[220px]" />
            <Button type="button" onClick={addTime} disabled={saving || !newTime}><Plus className="size-4" /> Adicionar horário</Button>
          </div>

          <div className="mt-6">
            {slotsQuery.isLoading ? <p className="text-sm text-muted-foreground">Carregando horários...</p> : isClosed ? (
              <div className="rounded-2xl border border-dashed border-destructive/30 bg-destructive/5 p-6 text-center"><XCircle className="mx-auto size-6 text-destructive" /><p className="mt-2 font-semibold">Esta data está fechada</p><p className="mt-1 text-xs text-muted-foreground">Nenhum horário será mostrado no agendamento.</p></div>
            ) : configuredRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center"><Clock3 className="mx-auto size-6 text-primary" /><p className="mt-2 font-semibold">Usando o padrão geral</p><p className="mt-1 text-xs text-muted-foreground">Adicione um horário ou copie o padrão para transformar esta data em uma agenda personalizada.</p></div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {visibleRows.map((row: any) => <div key={row.id} className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"><div><p className="font-semibold tabular-nums">{row.slot}</p><p className="text-[10px] text-muted-foreground">{row.is_available ? "Disponível nesta data" : "Pausado nesta data"}</p></div><div className="flex items-center gap-2"><Switch checked={row.is_available} onCheckedChange={async (checked) => { const { error } = await db.from("professional_date_time_slots").update({ is_available: checked }).eq("id", row.id); if (error) { toast.error(error.message); return; } await refresh(); }} /><Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={async () => { const { error } = await db.from("professional_date_time_slots").delete().eq("id", row.id); if (error) { toast.error(error.message); return; } await refresh(); }}><Trash2 className="size-4" /></Button></div></div>)}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
