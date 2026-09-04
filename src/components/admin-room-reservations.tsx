import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarDays, Clock3, Pencil, Plus, Save, UsersRound, X, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

type RentalType = "hour" | "shift" | "day";
type ShiftType = "morning" | "afternoon" | "evening";

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function formatMoney(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function rentalLabel(type: string) {
  if (type === "shift") return "Turno";
  if (type === "day") return "Diária";
  return "Hora";
}

const shiftTimes: Record<ShiftType, [string, string]> = {
  morning: ["08:00", "12:00"],
  afternoon: ["12:00", "18:00"],
  evening: ["18:00", "22:00"],
};

async function loadRoomManagement() {
  const [rooms, professionals, links, reservations] = await Promise.all([
    db.from("rooms").select("id,name,is_active,created_at,updated_at").order("name"),
    db.from("professionals").select("id,name,specialty,is_active,deleted_at").eq("is_active", true).is("deleted_at", null).order("name"),
    db.from("room_professionals").select("room_id,professional_id"),
    db.from("room_reservations").select("id,room_id,renter_professional_id,renter_name,reservation_date,rental_type,start_time,end_time,amount,notes,status,created_at,updated_at").order("reservation_date", { ascending: true }).order("start_time", { ascending: true }).limit(300),
  ]);
  for (const result of [rooms, professionals, links, reservations]) {
    if (result.error) throw result.error;
  }
  return {
    rooms: rooms.data ?? [],
    professionals: professionals.data ?? [],
    links: links.data ?? [],
    reservations: reservations.data ?? [],
  };
}

export function AdminRoomReservations() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-room-management"],
    queryFn: loadRoomManagement,
    retry: 1,
  });

  const rooms = data?.rooms ?? [];
  const professionals = data?.professionals ?? [];
  const links = data?.links ?? [];
  const reservations = data?.reservations ?? [];
  const today = todayIso();

  const [roomFormOpen, setRoomFormOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [roomActive, setRoomActive] = useState(true);
  const [roomProfessionals, setRoomProfessionals] = useState<string[]>([]);
  const [savingRoom, setSavingRoom] = useState(false);

  const [reservationOpen, setReservationOpen] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [renterMode, setRenterMode] = useState<"professional" | "external">("professional");
  const [renterProfessionalId, setRenterProfessionalId] = useState("");
  const [externalRenterName, setExternalRenterName] = useState("");
  const [reservationDate, setReservationDate] = useState(today);
  const [rentalType, setRentalType] = useState<RentalType>("hour");
  const [shift, setShift] = useState<ShiftType>("morning");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [savingReservation, setSavingReservation] = useState(false);

  const roomNameMap = useMemo(() => new Map(rooms.map((room: any) => [room.id, room.name])), [rooms]);
  const professionalMap = useMemo(() => {
    const map = new Map<string, { name: string }>();
    for (const professional of professionals) {
      map.set(professional.id, professional as { name: string });
    }
    return map;
  }, [professionals]);
  const linkedByRoom = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of links) {
      const current = map.get(link.room_id) ?? [];
      current.push(link.professional_id);
      map.set(link.room_id, current);
    }
    return map;
  }, [links]);

  const upcomingReservations = reservations.filter((reservation: any) => reservation.status === "active" && reservation.reservation_date >= today);
  const historyReservations = reservations.filter((reservation: any) => reservation.status !== "active" || reservation.reservation_date < today).slice().reverse();

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-room-management"] });
    await refetch();
  };

  const resetRoomForm = () => {
    setEditingRoomId(null);
    setRoomName("");
    setRoomActive(true);
    setRoomProfessionals([]);
    setRoomFormOpen(false);
  };

  const openNewRoom = () => {
    setEditingRoomId(null);
    setRoomName("");
    setRoomActive(true);
    setRoomProfessionals([]);
    setRoomFormOpen(true);
  };

  const editRoom = (room: any) => {
    setEditingRoomId(room.id);
    setRoomName(room.name ?? "");
    setRoomActive(room.is_active !== false);
    setRoomProfessionals(linkedByRoom.get(room.id) ?? []);
    setRoomFormOpen(true);
  };

  const toggleRoomProfessional = (professionalId: string) => {
    setRoomProfessionals((current) => current.includes(professionalId)
      ? current.filter((id) => id !== professionalId)
      : [...current, professionalId]);
  };

  const saveRoom = async () => {
    if (roomName.trim().length < 2) { toast.error("Informe o nome da sala."); return; }
    setSavingRoom(true);
    try {
      const payload = { name: roomName.trim(), is_active: roomActive };
      const result = editingRoomId
        ? await db.from("rooms").update(payload).eq("id", editingRoomId).select("id").single()
        : await db.from("rooms").insert(payload).select("id").single();
      if (result.error) throw result.error;
      const savedRoomId = result.data.id;

      const deleteLinks = await db.from("room_professionals").delete().eq("room_id", savedRoomId);
      if (deleteLinks.error) throw deleteLinks.error;
      if (roomProfessionals.length) {
        const insertLinks = await db.from("room_professionals").insert(roomProfessionals.map((professionalId) => ({ room_id: savedRoomId, professional_id: professionalId })));
        if (insertLinks.error) throw insertLinks.error;
      }

      toast.success(editingRoomId ? "Sala atualizada." : "Sala cadastrada.");
      resetRoomForm();
      await invalidate();
    } catch (err: any) {
      toast.error("Não foi possível salvar a sala.", { description: err?.message || "Erro inesperado." });
    } finally {
      setSavingRoom(false);
    }
  };

  const applyRentalType = (type: RentalType) => {
    setRentalType(type);
    if (type === "hour") {
      setStartTime("08:00");
      setEndTime("09:00");
    } else if (type === "shift") {
      setShift("morning");
      setStartTime("08:00");
      setEndTime("12:00");
    } else {
      setStartTime("08:00");
      setEndTime("22:00");
    }
  };

  const applyShift = (nextShift: ShiftType) => {
    setShift(nextShift);
    const [start, end] = shiftTimes[nextShift];
    setStartTime(start);
    setEndTime(end);
  };

  const resetReservation = () => {
    setRoomId("");
    setRenterMode("professional");
    setRenterProfessionalId("");
    setExternalRenterName("");
    setReservationDate(today);
    setRentalType("hour");
    setShift("morning");
    setStartTime("08:00");
    setEndTime("09:00");
    setAmount("");
    setNotes("");
    setReservationOpen(false);
  };

  const saveReservation = async () => {
    if (!roomId) { toast.error("Selecione a sala."); return; }
    if (!reservationDate) { toast.error("Selecione a data da reserva."); return; }
    if (!startTime || !endTime || endTime <= startTime) { toast.error("Informe um período válido."); return; }

    const selectedProfessional = renterMode === "professional" ? professionalMap.get(renterProfessionalId) : null;
    const renterName = renterMode === "professional" ? selectedProfessional?.name?.trim() : externalRenterName.trim();
    if (!renterName || renterName.length < 2) { toast.error("Informe a profissional ou locatária."); return; }

    const parsedAmount = amount.trim() ? Number(amount.replace(",", ".")) : null;
    if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) { toast.error("Informe um valor válido."); return; }

    setSavingReservation(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const result = await db.from("room_reservations").insert({
        room_id: roomId,
        renter_professional_id: renterMode === "professional" ? renterProfessionalId || null : null,
        renter_name: renterName,
        reservation_date: reservationDate,
        rental_type: rentalType,
        start_time: startTime,
        end_time: endTime,
        amount: parsedAmount === null ? null : Math.round((parsedAmount + Number.EPSILON) * 100) / 100,
        notes: notes.trim() || null,
        status: "active",
        created_by: userData.user?.id ?? null,
      });
      if (result.error) throw result.error;
      toast.success("Sala reservada com sucesso.", { description: "O período já foi bloqueado nas agendas das profissionais vinculadas à sala." });
      resetReservation();
      await invalidate();
    } catch (err: any) {
      toast.error("Não foi possível reservar a sala.", { description: err?.message || "Verifique se já existe uma reserva ou atendimento nesse período." });
    } finally {
      setSavingReservation(false);
    }
  };

  const cancelReservation = async (reservation: any) => {
    if (!window.confirm(`Cancelar a reserva de ${reservation.renter_name} em ${formatDate(reservation.reservation_date)}?`)) return;
    const result = await db.from("room_reservations").update({ status: "cancelled" }).eq("id", reservation.id);
    if (result.error) { toast.error("Não foi possível cancelar a reserva.", { description: result.error.message }); return; }
    toast.success("Reserva cancelada. Os horários voltaram a seguir a disponibilidade normal das profissionais.");
    await invalidate();
  };

  if (isLoading) return <div className="grid min-h-[55vh] place-items-center text-sm text-muted-foreground">Carregando salas...</div>;
  if (error) return <div className="grid min-h-[55vh] place-items-center px-5 text-center text-sm text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar as salas."}</div>;

  return (
    <main className="mx-auto max-w-[1180px] px-4 py-7 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ocupação física</p>
          <h1 className="mt-2 text-3xl font-semibold">Reservas de Salas</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Controle alugueis por hora, turno ou diária. Uma reserva bloqueia automaticamente o período para todas as profissionais vinculadas àquela sala.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>{isFetching ? "Atualizando..." : "Atualizar"}</Button>
          <Button type="button" variant="outline" onClick={openNewRoom}><Building2 className="size-4" /> Cadastrar sala</Button>
          <Button type="button" onClick={() => setReservationOpen(true)}><Plus className="size-4" /> Nova reserva</Button>
        </div>
      </div>

      {roomFormOpen ? (
        <section className="mt-6 rounded-3xl border border-primary/15 bg-card p-5 shadow-soft sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{editingRoomId ? "Editar sala" : "Cadastrar sala"}</h2><p className="mt-1 text-xs text-muted-foreground">Vincule as profissionais que normalmente utilizam esta sala.</p></div><Button type="button" size="icon" variant="ghost" onClick={resetRoomForm}><X className="size-4" /></Button></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div><Label>Nome da sala</Label><Input className="mt-2" value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Ex.: Consultorio 4" /></div>
            <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"><div><p className="text-sm font-medium">Sala ativa</p><p className="text-[10px] text-muted-foreground">Salas inativas deixam de ser usadas em novas reservas.</p></div><Switch checked={roomActive} onCheckedChange={setRoomActive} /></div>
          </div>
          <div className="mt-5"><Label>Profissionais que utilizam a sala</Label><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{professionals.map((professional: any) => { const selected = roomProfessionals.includes(professional.id); return <button key={professional.id} type="button" onClick={() => toggleRoomProfessional(professional.id)} className={`rounded-2xl border px-3 py-3 text-left transition ${selected ? "border-primary bg-primary-soft" : "border-border hover:border-primary/25"}`}><div className="flex items-center gap-2"><span className={`grid size-6 place-items-center rounded-full text-[10px] font-bold ${selected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{selected ? "✓" : "+"}</span><div className="min-w-0"><p className="truncate text-xs font-semibold">{professional.name}</p><p className="truncate text-[10px] text-muted-foreground">{professional.specialty || "Profissional"}</p></div></div></button>; })}</div></div>
          <div className="mt-5 flex gap-2"><Button type="button" variant="outline" onClick={resetRoomForm} disabled={savingRoom}>Cancelar</Button><Button type="button" onClick={() => void saveRoom()} disabled={savingRoom}><Save className="size-4" /> {savingRoom ? "Salvando..." : "Salvar sala"}</Button></div>
        </section>
      ) : null}

      {reservationOpen ? (
        <section className="mt-6 rounded-3xl border border-primary/15 bg-card p-5 shadow-soft sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Nova reserva</h2><p className="mt-1 text-xs text-muted-foreground">O sistema impede reservas sobrepostas e também bloqueia reservas quando já existe atendimento na sala.</p></div><Button type="button" size="icon" variant="ghost" onClick={resetReservation}><X className="size-4" /></Button></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><Label>Sala</Label><Select value={roomId} onValueChange={setRoomId}><SelectTrigger className="mt-2"><SelectValue placeholder="Selecione a sala" /></SelectTrigger><SelectContent>{rooms.filter((room: any) => room.is_active).map((room: any) => <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Locatária</Label><Select value={renterMode} onValueChange={(value) => { setRenterMode(value as "professional" | "external"); setRenterProfessionalId(""); setExternalRenterName(""); }}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="professional">Profissional cadastrada</SelectItem><SelectItem value="external">Nome externo</SelectItem></SelectContent></Select></div>
            {renterMode === "professional" ? <div><Label>Profissional</Label><Select value={renterProfessionalId} onValueChange={setRenterProfessionalId}><SelectTrigger className="mt-2"><SelectValue placeholder="Escolha" /></SelectTrigger><SelectContent>{professionals.map((professional: any) => <SelectItem key={professional.id} value={professional.id}>{professional.name}</SelectItem>)}</SelectContent></Select></div> : <div><Label>Nome da locatária</Label><Input className="mt-2" value={externalRenterName} onChange={(event) => setExternalRenterName(event.target.value)} placeholder="Nome completo" /></div>}
            <div><Label>Data</Label><Input className="mt-2" type="date" min={today} value={reservationDate} onChange={(event) => setReservationDate(event.target.value)} /></div>
            <div><Label>Tipo de aluguel</Label><Select value={rentalType} onValueChange={(value) => applyRentalType(value as RentalType)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hour">Hora</SelectItem><SelectItem value="shift">Turno</SelectItem><SelectItem value="day">Diária</SelectItem></SelectContent></Select></div>
            {rentalType === "shift" ? <div><Label>Turno</Label><Select value={shift} onValueChange={(value) => applyShift(value as ShiftType)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="morning">Manhã</SelectItem><SelectItem value="afternoon">Tarde</SelectItem><SelectItem value="evening">Noite</SelectItem></SelectContent></Select></div> : <div><Label>Valor do aluguel (opcional)</Label><Input className="mt-2" type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" /></div>}
            <div><Label>Horário inicial</Label><Input className="mt-2" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></div>
            <div><Label>Horário final</Label><Input className="mt-2" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></div>
            {rentalType === "shift" ? <div><Label>Valor do aluguel (opcional)</Label><Input className="mt-2" type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" /></div> : null}
            <div className="sm:col-span-2 lg:col-span-3"><Label>Observação (opcional)</Label><Textarea className="mt-2" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Informações sobre a reserva" /></div>
          </div>
          <div className="mt-5 flex gap-2"><Button type="button" variant="outline" onClick={resetReservation} disabled={savingReservation}>Cancelar</Button><Button type="button" onClick={() => void saveReservation()} disabled={savingReservation}><CalendarDays className="size-4" /> {savingReservation ? "Reservando..." : "Confirmar reserva"}</Button></div>
        </section>
      ) : null}

      <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <div><h2 className="text-lg font-semibold">Salas cadastradas</h2><p className="mt-1 text-xs text-muted-foreground">As profissionais vinculadas ficam automaticamente bloqueadas quando a sala recebe uma reserva administrativa.</p></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {rooms.map((room: any) => {
            const linked = linkedByRoom.get(room.id) ?? [];
            return (
              <article key={room.id} className="rounded-2xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-primary" />
                      <p className="font-semibold">{String(room.name)}</p>
                      {!room.is_active ? <Badge variant="secondary">Inativa</Badge> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {linked.length ? linked.map((id) => {
                        const professionalName = professionalMap.get(id)?.name || "Profissional";
                        return (
                          <Badge key={id} variant="outline" className="text-[10px]">
                            <UsersRound className="mr-1 size-3" />
                            {professionalName}
                          </Badge>
                        );
                      }) : <span className="text-[10px] text-muted-foreground">Nenhuma profissional vinculada.</span>}
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => editRoom(room)}>
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <div><h2 className="text-lg font-semibold">Próximas reservas</h2><p className="mt-1 text-xs text-muted-foreground">Períodos ativos ficam indisponíveis automaticamente nas agendas vinculadas.</p></div>
        <div className="mt-4 space-y-3">{upcomingReservations.length ? upcomingReservations.map((reservation: any) => <article key={reservation.id} className="rounded-2xl border border-primary/15 bg-primary/[0.025] p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{roomNameMap.get(reservation.room_id) || "Sala"}</p><Badge>{rentalLabel(reservation.rental_type)}</Badge></div><p className="mt-1 text-sm">{reservation.renter_name}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1"><CalendarDays className="size-3.5" /> {formatDate(reservation.reservation_date)}</span><span className="flex items-center gap-1"><Clock3 className="size-3.5" /> {reservation.start_time.slice(0,5)} às {reservation.end_time.slice(0,5)}</span><span>{formatMoney(reservation.amount)}</span></div>{reservation.notes ? <p className="mt-2 text-xs text-muted-foreground">{reservation.notes}</p> : null}</div><Button type="button" variant="outline" className="text-destructive" onClick={() => void cancelReservation(reservation)}><XCircle className="size-4" /> Cancelar reserva</Button></div></article>) : <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhuma reserva futura.</div>}</div>
      </section>

      {historyReservations.length ? <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6"><h2 className="text-lg font-semibold">Histórico de reservas</h2><div className="mt-4 space-y-2">{historyReservations.slice(0, 40).map((reservation: any) => <div key={reservation.id} className="flex flex-col gap-2 rounded-2xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{roomNameMap.get(reservation.room_id) || "Sala"}</p><Badge variant="secondary">{reservation.status === "cancelled" ? "Cancelada" : "Concluída pelo período"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{reservation.renter_name} · {formatDate(reservation.reservation_date)} · {reservation.start_time.slice(0,5)} às {reservation.end_time.slice(0,5)}</p></div><span className="text-xs font-medium">{formatMoney(reservation.amount)}</span></div>)}</div></section> : null}
    </main>
  );
}
