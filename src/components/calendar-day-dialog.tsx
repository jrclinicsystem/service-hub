import { CalendarClock, CheckCircle2, Circle, Clock3, Plus, StickyNote, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatPrice } from "@/lib/clinic";

const db = supabase as any;

type DayItem = {
  id: string;
  item_date: string;
  item_type: "note" | "commitment";
  title: string;
  description?: string | null;
  item_time?: string | null;
  completed: boolean;
  created_at: string;
};

export function CalendarDayDialog({
  date,
  appointments,
  open,
  onOpenChange,
}: {
  date: string | null;
  appointments: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [items, setItems] = useState<DayItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<"note" | "commitment">("note");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [time, setTime] = useState("");

  const dayAppointments = useMemo(
    () => appointments
      .filter((item) => item.scheduled_date === date)
      .sort((a, b) => String(a.scheduled_time ?? "").localeCompare(String(b.scheduled_time ?? ""))),
    [appointments, date],
  );

  const loadItems = async () => {
    if (!date) return;
    setLoading(true);
    const { data, error } = await db
      .from("calendar_day_items")
      .select("id,item_date,item_type,title,description,item_time,completed,created_at")
      .eq("item_date", date)
      .order("item_time", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível carregar as notas do dia.", { description: error.message });
      return;
    }
    setItems(data ?? []);
  };

  useEffect(() => {
    if (!open || !date) return;
    void loadItems();
  }, [open, date]);

  useEffect(() => {
    if (!open) {
      setType("note");
      setTitle("");
      setDescription("");
      setTime("");
    }
  }, [open]);

  const saveItem = async () => {
    if (!date || !title.trim()) {
      toast.error(type === "note" ? "Escreva um título para a nota." : "Informe o compromisso.");
      return;
    }
    setSaving(true);
    const { error } = await db.from("calendar_day_items").insert({
      item_date: date,
      item_type: type,
      title: title.trim(),
      description: description.trim() || null,
      item_time: type === "commitment" && time ? time : null,
    });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar.", { description: error.message });
      return;
    }
    toast.success(type === "note" ? "Nota adicionada ao dia." : "Compromisso adicionado ao calendário.");
    setTitle("");
    setDescription("");
    setTime("");
    await loadItems();
  };

  const toggleCompleted = async (item: DayItem) => {
    const { error } = await db.from("calendar_day_items").update({ completed: !item.completed, updated_at: new Date().toISOString() }).eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    await loadItems();
  };

  const removeItem = async (item: DayItem) => {
    const { error } = await db.from("calendar_day_items").delete().eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Item removido do dia.");
    await loadItems();
  };

  if (!date) return null;

  const readableDate = new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl p-5 sm:max-w-3xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="capitalize">{readableDate}</DialogTitle>
          <DialogDescription>Veja tudo o que existe neste dia e registre notas ou compromissos internos.</DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Agendamentos do dia</h3>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{dayAppointments.length} atendimento(s)</p>
              </div>
              <Badge variant="secondary" className="rounded-full">{dayAppointments.length}</Badge>
            </div>

            <div className="mt-3 space-y-2.5">
              {dayAppointments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Nenhum atendimento marcado neste dia.</div>
              ) : dayAppointments.map((appointment) => (
                <div key={appointment.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{appointment.patient_name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{appointment.service?.name ?? "Atendimento"}</p>
                      <p className="mt-1 truncate text-[10px] text-muted-foreground">{appointment.professional?.name ?? "Profissional não definido"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{appointment.scheduled_time}</p>
                      <p className="mt-0.5 text-[10px] font-medium text-primary">{formatPrice(Number(appointment.service_price_snapshot ?? appointment.service?.price ?? 0))}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-2">
                    <Badge variant={appointment.status === "confirmado" ? "default" : appointment.status === "cancelado" ? "destructive" : "outline"} className="rounded-full text-[9px]">{appointment.status === "confirmado" ? "Confirmado" : appointment.status === "cancelado" ? "Cancelado" : "Pendente"}</Badge>
                    <span className="text-[9px] text-muted-foreground">{formatDate(appointment.scheduled_date)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Adicionar ao dia</h3>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Use para observações internas ou compromissos que não são atendimentos.</p>

            <div className="mt-3 grid gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(value: "note" | "commitment") => setType(value)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Nota</SelectItem>
                    <SelectItem value="commitment">Compromisso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="calendar-item-title">{type === "note" ? "Título da nota" : "Compromisso"}</Label>
                <Input id="calendar-item-title" value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1.5" placeholder={type === "note" ? "Ex.: Confirmar material" : "Ex.: Reunião com fornecedor"} />
              </div>
              {type === "commitment" ? (
                <div>
                  <Label htmlFor="calendar-item-time">Horário</Label>
                  <Input id="calendar-item-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} className="mt-1.5" />
                </div>
              ) : null}
              <div>
                <Label htmlFor="calendar-item-description">Detalhes</Label>
                <Textarea id="calendar-item-description" value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 min-h-20" placeholder="Informação adicional, se necessário..." />
              </div>
              <Button type="button" onClick={saveItem} disabled={saving} className="rounded-xl"><Plus className="size-4" /> {saving ? "Salvando..." : type === "note" ? "Adicionar nota" : "Marcar compromisso"}</Button>
            </div>
          </section>
        </div>

        <section className="mt-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Notas e compromissos</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Organização interna deste dia.</p>
            </div>
            {loading ? <span className="text-[10px] text-muted-foreground">Carregando...</span> : null}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {!loading && items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground sm:col-span-2">Nenhuma nota ou compromisso registrado.</div>
            ) : items.map((item) => (
              <div key={item.id} className={`rounded-xl border border-border p-3 ${item.completed ? "bg-secondary/30 opacity-70" : "bg-background"}`}>
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => toggleCompleted(item)} className="mt-0.5 shrink-0 text-primary" title={item.completed ? "Marcar como pendente" : "Concluir"}>
                    {item.completed ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {item.item_type === "note" ? <StickyNote className="size-3.5 text-primary" /> : <CalendarClock className="size-3.5 text-primary" />}
                      <p className={`truncate text-xs font-semibold ${item.completed ? "line-through" : ""}`}>{item.title}</p>
                    </div>
                    {item.item_time ? <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="size-3" /> {String(item.item_time).slice(0, 5)}</p> : null}
                    {item.description ? <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{item.description}</p> : null}
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item)}><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
