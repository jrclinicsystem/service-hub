import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Clock3, Plus, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

const weekdays = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
] as const;

async function loadWeeklySlots(professionalId: string) {
  const { data, error } = await db
    .from("professional_weekday_time_slots")
    .select("id,professional_id,weekday,slot,is_available,sort_order")
    .eq("professional_id", professionalId)
    .order("weekday")
    .order("sort_order")
    .order("slot");
  if (error) throw error;
  return data ?? [];
}

export function ProfessionalWeeklySchedule({ professionalId }: { professionalId: string }) {
  const queryClient = useQueryClient();
  const [times, setTimes] = useState<Record<number, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["professional-weekday-slots", professionalId],
    queryFn: () => loadWeeklySlots(professionalId),
    enabled: Boolean(professionalId),
  });

  const rows = query.data ?? [];
  const grouped = useMemo(() => {
    const result = new Map<number, any[]>();
    for (const day of weekdays) result.set(day.value, []);
    for (const row of rows) {
      if (row.slot === "00:00") continue;
      const list = result.get(Number(row.weekday)) ?? [];
      list.push(row);
      result.set(Number(row.weekday), list);
    }
    return result;
  }, [rows]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["professional-weekday-slots", professionalId] });
  };

  const addTime = async (weekday: number) => {
    const time = times[weekday] ?? "";
    if (!time) { toast.error("Escolha um horário."); return; }
    if (time === "00:00") { toast.error("Escolha um horário diferente de 00:00."); return; }
    setBusyKey(`add-${weekday}`);
    try {
      await db.from("professional_weekday_time_slots").delete().eq("professional_id", professionalId).eq("weekday", weekday).eq("slot", "00:00");
      const { error } = await db.from("professional_weekday_time_slots").upsert({
        professional_id: professionalId,
        weekday,
        slot: time,
        is_available: true,
        sort_order: Number(time.replace(":", "")),
        updated_at: new Date().toISOString(),
      }, { onConflict: "professional_id,weekday,slot" });
      if (error) throw error;
      setTimes((current) => ({ ...current, [weekday]: "" }));
      toast.success("Horário adicionado a este dia.");
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível adicionar o horário.");
    } finally {
      setBusyKey(null);
    }
  };

  const closeDay = async (weekday: number) => {
    setBusyKey(`close-${weekday}`);
    try {
      const { error: clearError } = await db.from("professional_weekday_time_slots").delete().eq("professional_id", professionalId).eq("weekday", weekday);
      if (clearError) throw clearError;
      const { error } = await db.from("professional_weekday_time_slots").insert({
        professional_id: professionalId,
        weekday,
        slot: "00:00",
        is_available: false,
        sort_order: 0,
      });
      if (error) throw error;
      toast.success("Dia fechado no seu padrão semanal.");
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível fechar este dia.");
    } finally {
      setBusyKey(null);
    }
  };

  const toggleSlot = async (row: any, checked: boolean) => {
    setBusyKey(`toggle-${row.id}`);
    const { error } = await db.from("professional_weekday_time_slots").update({ is_available: checked, updated_at: new Date().toISOString() }).eq("id", row.id);
    setBusyKey(null);
    if (error) { toast.error(error.message); return; }
    await refresh();
  };

  const removeSlot = async (weekday: number, row: any, dayRows: any[]) => {
    setBusyKey(`delete-${row.id}`);
    try {
      const { error } = await db.from("professional_weekday_time_slots").delete().eq("id", row.id);
      if (error) throw error;
      if (dayRows.length === 1) {
        const { error: sentinelError } = await db.from("professional_weekday_time_slots").upsert({
          professional_id: professionalId,
          weekday,
          slot: "00:00",
          is_available: false,
          sort_order: 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: "professional_id,weekday,slot" });
        if (sentinelError) throw sentinelError;
      }
      toast.success("Horário removido.");
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível remover o horário.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="mt-4 rounded-3xl border border-primary/20 bg-primary-soft/20 p-4 shadow-soft sm:mt-7 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary"><CalendarRange className="size-5" /></span>
        <div>
          <h2 className="text-lg font-bold text-foreground">Meus horários por dia da semana</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">Defina horários diferentes para segunda, terça, quarta e os demais dias. Este é o seu padrão semanal. Se uma data específica for personalizada abaixo, a exceção daquela data terá prioridade.</p>
        </div>
      </div>

      {query.isLoading ? <p className="mt-5 text-sm text-muted-foreground">Carregando seus horários...</p> : query.error ? <p className="mt-5 rounded-xl bg-destructive/5 p-4 text-sm text-destructive">Não foi possível carregar o padrão semanal.</p> : (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {weekdays.map((day) => {
            const dayRows = grouped.get(day.value) ?? [];
            const availableCount = dayRows.filter((row: any) => row.is_available).length;
            const hasConfiguredDay = rows.some((row: any) => Number(row.weekday) === day.value);
            const closed = hasConfiguredDay && availableCount === 0;
            return (
              <article key={day.value} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div><h3 className="text-sm font-semibold">{day.label}</h3><p className="mt-0.5 text-[10px] text-muted-foreground">{closed ? "Sem atendimento neste dia" : availableCount ? `${availableCount} horário(s) ativo(s)` : "Ainda usando o fallback anterior"}</p></div>
                  <Badge variant={closed ? "secondary" : "outline"} className="rounded-full text-[10px]">{closed ? "Fechado" : availableCount ? "Ativo" : "Sem ajuste"}</Badge>
                </div>

                <div className="mt-3 flex gap-2">
                  <Input type="time" value={times[day.value] ?? ""} onChange={(event) => setTimes((current) => ({ ...current, [day.value]: event.target.value }))} className="min-w-0 flex-1" />
                  <Button type="button" size="sm" onClick={() => void addTime(day.value)} disabled={busyKey !== null || !(times[day.value] ?? "")}><Plus className="size-4" /> Adicionar</Button>
                </div>

                <div className="mt-3 flex justify-end"><Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void closeDay(day.value)} disabled={busyKey !== null}><XCircle className="size-4" /> Não atendo neste dia</Button></div>

                <div className="mt-3 space-y-2">
                  {dayRows.length === 0 ? <div className="rounded-xl bg-secondary/45 px-3 py-3 text-center text-[11px] text-muted-foreground">Adicione um horário para personalizar este dia.</div> : dayRows.map((row: any) => (
                    <div key={row.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
                      <div className="flex items-center gap-2"><Clock3 className="size-3.5 text-primary" /><div><p className="text-sm font-semibold tabular-nums">{row.slot}</p><p className="text-[9px] text-muted-foreground">{row.is_available ? "Disponível" : "Pausado"}</p></div></div>
                      <div className="flex items-center gap-1.5"><Switch checked={row.is_available} disabled={busyKey !== null} onCheckedChange={(checked) => void toggleSlot(row, checked)} /><Button type="button" size="icon" variant="ghost" className="size-8 text-destructive" disabled={busyKey !== null} onClick={() => void removeSlot(day.value, row, dayRows)}><Trash2 className="size-4" /></Button></div>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
