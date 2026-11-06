import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/clinic";

const db = supabase as any;

export function AppointmentRescheduleDialog({
  appointment,
  onClose,
  onSaved,
}: {
  appointment: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const professionalId = appointment?.professional_id ?? appointment?.professional?.id;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });

  useEffect(() => {
    setDate(appointment?.scheduled_date >= today ? appointment.scheduled_date : today);
    setTime("");
    setSlots([]);
  }, [appointment, today]);

  useEffect(() => {
    if (!appointment || !professionalId || !date) return;
    let active = true;
    setLoading(true);
    void db
      .rpc("get_professional_booking_slots", {
        _professional_id: professionalId,
        _date: date,
        _exclude_appointment_id: appointment.id,
      })
      .then(({ data, error }: any) => {
        if (!active) return;
        const available: string[] = error
          ? []
          : (data ?? [])
              .filter((slot: any) => slot.is_available)
              .map((slot: any) => String(slot.slot).slice(0, 5))
              .filter(
                (slot: string) =>
                  new Date(`${date}T${slot}:00-03:00`).getTime() > Date.now() &&
                  !(
                    date === appointment.scheduled_date &&
                    slot === appointment.scheduled_time.slice(0, 5)
                  ),
              );
        setSlots(available);
        setTime((current) => (available.includes(current) ? current : ""));
        setLoading(false);
        if (error) toast.error("Não foi possível carregar os horários disponíveis.");
      })
      .catch(() => {
        if (!active) return;
        setSlots([]);
        setTime("");
        setLoading(false);
        toast.error("Não foi possível carregar os horários disponíveis.");
      });
    return () => {
      active = false;
    };
  }, [appointment, professionalId, date, refreshKey]);

  useEffect(() => {
    if (!appointment) return;
    const refresh = () => setRefreshKey((value) => value + 1);
    window.addEventListener("focus", refresh);
    // Include shared-room appointments, not just this professional's rows.
    const channel = supabase
      .channel(`reschedule-${appointment.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_reservations" }, refresh)
      .subscribe();
    return () => {
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
  }, [appointment]);

  const save = async () => {
    if (!appointment || saving || loading || !date || !slots.includes(time)) return;
    setSaving(true);
    try {
      const { error } = await db.rpc("reschedule_admin_appointment", {
        _appointment_id: appointment.id,
        _scheduled_date: date,
        _scheduled_time: time,
        _expected_date: appointment.scheduled_date,
        _expected_time: appointment.scheduled_time,
        _expected_status: appointment.status,
      });
      if (error) throw error;
      toast.success("Agendamento remarcado.", {
        description:
          "O horário anterior foi liberado. O novo está reservado e aguarda confirmação.",
      });
      onSaved();
    } catch (error: unknown) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "Tente novamente.";
      toast.error("Não foi possível remarcar.", { description: message });
      setRefreshKey((value) => value + 1);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(appointment)}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="w-[calc(100%-1rem)] rounded-3xl p-5 sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle>Remarcar agendamento</DialogTitle>
          <DialogDescription>
            {appointment?.patient_name} ·{" "}
            {appointment ? formatDate(appointment.scheduled_date) : ""} às{" "}
            {appointment?.scheduled_time}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label htmlFor="reschedule-date">Nova data</Label>
            <Input
              id="reschedule-date"
              type="date"
              min={today}
              value={date}
              disabled={saving}
              className="mt-1.5 rounded-xl"
              onChange={(event) => {
                setDate(event.target.value);
                setTime("");
              }}
            />
          </div>
          <div>
            <Label htmlFor="reschedule-time">Novo horário</Label>
            <Select
              value={time}
              onValueChange={setTime}
              disabled={saving || loading || !slots.length}
            >
              <SelectTrigger id="reschedule-time" className="mt-1.5 rounded-xl">
                <SelectValue
                  placeholder={
                    loading
                      ? "Carregando..."
                      : slots.length
                        ? "Selecione um horário"
                        : "Sem horários disponíveis"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {slots.map((slot) => (
                  <SelectItem key={slot} value={slot}>
                    {slot}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            O horário anterior só será liberado após a reserva do novo. Serviços, valores e
            pagamentos serão preservados.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" disabled={saving} onClick={onClose}>
            Voltar
          </Button>
          <Button
            className="rounded-xl"
            disabled={saving || loading || !time || !date}
            onClick={() => void save()}
          >
            {saving ? "Remarcando..." : "Confirmar remarcação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
