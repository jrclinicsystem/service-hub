import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Copy, Plus, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function periodForTime(time: string) {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

async function loadDateSlots(professionalId: string, date: string) {
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

export function ProfessionalDateAvailability({ professionalId, fallbackSlots, fallbackAvailability }: { professionalId: string; fallbackSlots: any[]; fallbackAvailability: any[] }) {
  const [date, setDate] = useState(todayIso());
  const [newTime, setNewTime] = useState("");
  const [saving, setSaving] = useState(false);
  const query = useQuery({ queryKey: ["professional-date-slots", professionalId, date], queryFn: () => loadDateSlots(professionalId, date), enabled: Boolean(professionalId && date) });
  const rows = query.data ?? [];
  const visibleRows = rows.filter((row: any) => row.slot !== "00:00");
  const isClosed = rows.length > 0 && rows.every((row: any) => !row.is_available);
  const formattedDate = useMemo(() => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }), [date]);

  const refresh = async () => { await query.refetch(); };

  const addTime = async () => {
    if (!newTime) { toast.error("Escolha um horário."); return; }
    if (newTime === "00:00") { toast.error("Escolha um horário diferente de 00:00."); return; }
    setSaving(true);
    try {
      await db.from("professional_date_time_slots").delete().eq("professional_id", professionalId).eq("available_date", date).eq("slot", "00:00");
      const { error } = await db.from("professional_date_time_slots").upsert({ professional_id: professionalId, available_date: date, slot: newTime, is_available: true, sort_order: Number(newTime.replace(":", "")) }, { onConflict: "professional_id,available_date,slot" });
      if (error) throw error;
      setNewTime("");
      toast.success("Horário liberado para esta data.");
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível liberar o horário.");
    } finally { setSaving(false); }
  };

  const closeDay = async () => {
    setSaving(true);
    try {
      const { error: clearError } = await db.from("professional_date_time_slots").delete().eq("professional_id", professionalId).eq("available_date", date);
      if (clearError) throw clearError;
      const { error } = await db.from("professional_date_time_slots").insert({ professional_id: professionalId, available_date: date, slot: "00:00", is_available: false, sort_order: 0 });
      if (error) throw error;
      toast.success("Dia fechado para novos agendamentos.");
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível fechar o dia.");
    } finally { setSaving(false); }
  };

  const useGeneralPattern = async () => {
    const { error } = await db.from("professional_date_time_slots").delete().eq("professional_id", professionalId).eq("available_date", date);
    if (error) { toast.error(error.message); return; }
    toast.success("Esta data voltou a usar o padrão geral.");
    await refresh();
  };

  const copyGeneralPattern = async () => {
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const available = fallbackSlots.filter((slot: any) => slot.is_available && (!fallbackAvailability.length || fallbackAvailability.some((row: any) => row.weekday === weekday && row.period === periodForTime(slot.slot) && row.is_available)));
    if (!available.length) { toast.info("Seu padrão geral não possui horários ativos neste dia."); return; }
    setSaving(true);
    try {
      const { error: clearError } = await db.from("professional_date_time_slots").delete().eq("professional_id", professionalId).eq("available_date", date);
      if (clearError) throw clearError;
      const { error } = await db.from("professional_date_time_slots").insert(available.map((slot: any) => ({ professional_id: professionalId, available_date: date, slot: slot.slot, is_available: true, sort_order: slot.sort_order ?? Number(slot.slot.replace(":", "")) })));
      if (error) throw error;
      toast.success("Padrão geral copiado para esta data.");
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível copiar os horários.");
    } finally { setSaving(false); }
  };

  return (
    <section className="mt-4 rounded-3xl border border-primary/25 bg-primary-soft/30 p-4 shadow-soft sm:mt-7 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex items-center gap-2"><CalendarDays className="size-5 text-primary" /><h2 className="text-lg font-bold">Minha disponibilidade por data</h2></div><p className="mt-1 text-xs text-muted-foreground">Escolha uma data e libere somente os horários em que você realmente poderá atender.</p></div>
        <Input type="date" min={todayIso()} value={date} onChange={(event) => setDate(event.target.value)} className="sm:w-[180px]" />
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold capitalize">{formattedDate}</p><p className="mt-1 text-[11px] text-muted-foreground">{rows.length === 0 ? "Usando o padrão geral" : isClosed ? "Dia fechado" : "Horários personalizados para esta data"}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={copyGeneralPattern} disabled={saving}><Copy className="size-4" /> Copiar padrão</Button><Button size="sm" variant="outline" onClick={closeDay} disabled={saving}><XCircle className="size-4" /> Não atendo</Button>{rows.length ? <Button size="sm" variant="ghost" onClick={useGeneralPattern} disabled={saving}>Usar padrão geral</Button> : null}</div></div>

        <div className="mt-4 flex gap-2"><Input type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} className="min-w-0 flex-1 sm:max-w-[180px]" /><Button onClick={addTime} disabled={saving || !newTime}><Plus className="size-4" /> Adicionar</Button></div>

        <div className="mt-5">
          {query.isLoading ? <p className="text-xs text-muted-foreground">Carregando...</p> : isClosed ? <div className="rounded-xl bg-destructive/5 px-4 py-5 text-center"><p className="text-sm font-semibold text-destructive">Você marcou que não atende nesta data.</p></div> : rows.length === 0 ? <div className="rounded-xl bg-secondary/50 px-4 py-5 text-center"><p className="text-xs text-muted-foreground">Nenhuma personalização nesta data. O cliente verá os horários do seu padrão geral.</p></div> : <div className="grid gap-2 sm:grid-cols-2">{visibleRows.map((row: any) => <div key={row.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-3"><div><p className="font-semibold tabular-nums">{row.slot}</p><p className="text-[10px] text-muted-foreground">{row.is_available ? "Disponível nesta data" : "Pausado"}</p></div><div className="flex items-center gap-2"><Switch checked={row.is_available} onCheckedChange={async (checked) => { const { error } = await db.from("professional_date_time_slots").update({ is_available: checked }).eq("id", row.id); if (error) { toast.error(error.message); return; } await refresh(); }} /><Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={async () => { const { error } = await db.from("professional_date_time_slots").delete().eq("id", row.id); if (error) { toast.error(error.message); return; } await refresh(); }}><Trash2 className="size-4" /></Button></div></div>)}</div>}
        </div>
      </div>
    </section>
  );
}
