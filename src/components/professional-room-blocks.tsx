import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, Clock3, LockKeyhole } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

function formatDate(value: string) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function rentalLabel(type: string) {
  if (type === "shift") return "Turno";
  if (type === "day") return "Diária";
  return "Hora";
}

export function ProfessionalRoomBlocks({ professionalId, selectedDate }: { professionalId: string; selectedDate: string }) {
  const query = useQuery({
    queryKey: ["professional-room-blocks", professionalId, selectedDate],
    enabled: Boolean(professionalId && selectedDate),
    queryFn: async () => {
      const { data, error } = await db.rpc("get_professional_room_blocks", { _professional_id: professionalId, _date: selectedDate });
      if (error) throw error;
      return data ?? [];
    },
    retry: 1,
  });

  if (query.isLoading) {
    return <section className="mt-7 rounded-3xl border border-border bg-card p-5 shadow-soft"><p className="text-xs text-muted-foreground">Carregando bloqueios de sala...</p></section>;
  }

  if (query.error) {
    return <section className="mt-7 rounded-3xl border border-destructive/20 bg-card p-5 shadow-soft"><p className="text-xs text-destructive">Não foi possível consultar os bloqueios de sala.</p></section>;
  }

  const blocks = query.data ?? [];

  return (
    <section className="mt-7 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary"><Building2 className="size-4.5" /></span>
        <div>
          <h2 className="text-lg font-semibold">Bloqueios de sala</h2>
          <p className="mt-1 text-xs text-muted-foreground">{formatDate(selectedDate)} · reservas feitas pela administração não podem ser liberadas pela colaboradora.</p>
        </div>
      </div>

      {blocks.length ? (
        <div className="mt-4 space-y-3">
          {blocks.map((block: any, index: number) => (
            <article key={`${block.room_name}-${block.start_time}-${index}`} className="rounded-2xl border border-amber-300/60 bg-amber-50/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><LockKeyhole className="size-4 text-amber-700" /><p className="font-semibold text-amber-950">Sala reservada pela administração</p><Badge variant="outline" className="border-amber-400/70 text-amber-800">{rentalLabel(block.rental_type)}</Badge></div>
                  <p className="mt-1 text-sm text-amber-950/85">{block.room_name} · {block.renter_name}</p>
                  {block.notes ? <p className="mt-1 text-xs text-amber-900/70">{block.notes}</p> : null}
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-xs font-semibold text-amber-900"><Clock3 className="size-3.5" /> {block.start_time} às {block.end_time}</div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-4 text-xs text-muted-foreground"><CalendarDays className="size-4" /> Nenhuma reserva administrativa bloqueando sua sala nesta data.</div>
      )}
    </section>
  );
}
