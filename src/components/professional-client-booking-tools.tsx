import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Check, Search, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/clinic";

const db = supabase as any;

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function loadProfessionalTools(professionalId: string) {
  const [clientsResult, linksResult] = await Promise.all([
    db.from("clients").select("id,name,whatsapp,email,birth_date,is_active").eq("is_active", true).order("name"),
    db.from("service_professionals").select("service_id").eq("professional_id", professionalId),
  ]);
  if (clientsResult.error) throw clientsResult.error;
  if (linksResult.error) throw linksResult.error;

  const serviceIds = (linksResult.data ?? []).map((item: any) => item.service_id);
  let services: any[] = [];
  if (serviceIds.length) {
    const servicesResult = await db.from("services").select("id,name,price,duration_min,is_active").in("id", serviceIds).eq("is_active", true).order("name");
    if (servicesResult.error) throw servicesResult.error;
    services = servicesResult.data ?? [];
  }

  return { clients: clientsResult.data ?? [], services };
}

export function ProfessionalClientBookingTools({ professionalId, onAppointmentCreated }: { professionalId: string; onAppointmentCreated?: () => void | Promise<void> }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["professional-client-booking-tools", professionalId],
    queryFn: () => loadProfessionalTools(professionalId),
    enabled: Boolean(professionalId),
  });

  const clients = query.data?.clients ?? [];
  const services = query.data?.services ?? [];

  const [clientName, setClientName] = useState("");
  const [clientWhatsapp, setClientWhatsapp] = useState("");
  const [clientBirthDate, setClientBirthDate] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [slots, setSlots] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [savingAppointment, setSavingAppointment] = useState(false);

  const selectedClient = clients.find((client: any) => client.id === selectedClientId) ?? null;
  const selectedService = services.find((service: any) => service.id === serviceId) ?? null;

  const filteredClients = useMemo(() => {
    const term = clientSearch.trim().toLowerCase();
    const source = term
      ? clients.filter((client: any) => [client.name, client.whatsapp, client.email].some((value) => String(value ?? "").toLowerCase().includes(term)))
      : clients;
    return source.slice(0, 8);
  }, [clients, clientSearch]);

  useEffect(() => {
    let cancelled = false;
    setTime("");
    if (!professionalId || !date) {
      setSlots([]);
      setSlotsLoading(false);
      return;
    }
    setSlotsLoading(true);
    void db.rpc("get_professional_booking_slots", { _professional_id: professionalId, _date: date }).then(({ data, error }: any) => {
      if (cancelled) return;
      if (error) {
        console.error("Falha ao carregar horários da colaboradora", error);
        setSlots([]);
      } else {
        setSlots((data ?? []).filter((slot: any) => slot.is_available));
      }
      setSlotsLoading(false);
    });
    return () => { cancelled = true; };
  }, [professionalId, date]);

  const createClient = async () => {
    const normalizedName = clientName.trim();
    const whatsappDigits = clientWhatsapp.replace(/\D/g, "");
    const normalizedEmail = clientEmail.trim().toLowerCase();
    if (normalizedName.length < 2) { toast.error("Informe o nome do cliente."); return; }
    if (whatsappDigits.length < 10 || whatsappDigits.length > 15) { toast.error("Informe um WhatsApp válido com DDD."); return; }
    if (!clientBirthDate || clientBirthDate > todayIso()) { toast.error("Informe uma data de nascimento válida."); return; }
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { toast.error("Informe um e-mail válido."); return; }

    setSavingClient(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Sua sessão expirou.");
      const { data: created, error } = await db.from("clients").insert({
        name: normalizedName,
        whatsapp: whatsappDigits,
        birth_date: clientBirthDate,
        email: normalizedEmail || null,
        created_by: userData.user.id,
        is_active: true,
        birthday_benefit_type: "soft_lips",
      }).select("id,name,whatsapp,email,birth_date,is_active").single();
      if (error) throw error;

      setClientName("");
      setClientWhatsapp("");
      setClientBirthDate("");
      setClientEmail("");
      await queryClient.invalidateQueries({ queryKey: ["professional-client-booking-tools", professionalId] });
      setSelectedClientId(created.id);
      setClientSearch(created.name);
      toast.success("Cliente cadastrado com sucesso.");
    } catch (error: any) {
      toast.error("Não foi possível cadastrar o cliente.", { description: error?.message || "Erro inesperado." });
    } finally {
      setSavingClient(false);
    }
  };

  const selectClient = (client: any) => {
    setSelectedClientId(client.id);
    setClientSearch(client.name);
  };

  const createAppointment = async () => {
    if (!selectedClient) { toast.error("Selecione um cliente cadastrado."); return; }
    if (!selectedService) { toast.error("Selecione o serviço."); return; }
    if (!date || date < todayIso()) { toast.error("Selecione uma data válida."); return; }
    if (!time) { toast.error("Selecione um horário disponível."); return; }

    setSavingAppointment(true);
    try {
      const total = Number(selectedService.price ?? 0);
      const { error } = await db.from("appointments").insert({
        user_id: null,
        client_id: selectedClient.id,
        professional_id: professionalId,
        service_id: selectedService.id,
        patient_name: selectedClient.name,
        patient_email: selectedClient.email ?? "",
        patient_phone: selectedClient.whatsapp,
        scheduled_date: date,
        scheduled_time: time,
        notes: notes.trim(),
        status: "pendente",
        payment_choice: "onsite",
        service_price_snapshot: total,
        deposit_percent: 0,
        deposit_amount: 0,
        balance_amount: total,
      });
      if (error) throw error;

      setSelectedClientId("");
      setClientSearch("");
      setServiceId("");
      setDate(todayIso());
      setTime("");
      setNotes("");
      toast.success("Agendamento criado e enviado para confirmação.");
      await onAppointmentCreated?.();
    } catch (error: any) {
      toast.error("Não foi possível criar o agendamento.", { description: error?.message || "Erro inesperado." });
    } finally {
      setSavingAppointment(false);
    }
  };

  return (
    <section className="mt-4 rounded-3xl border border-border bg-card p-4 shadow-soft sm:mt-7 sm:p-6">
      <div>
        <h2 className="text-lg font-bold">Clientes e novo agendamento</h2>
        <p className="mt-1 text-xs text-muted-foreground">Cadastre um cliente ou selecione alguém já salvo para lançar um atendimento diretamente na sua agenda.</p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center gap-2"><UserPlus className="size-4 text-primary" /><h3 className="text-sm font-semibold">Cadastrar cliente</h3></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Nome completo</Label><Input className="mt-1.5" value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Nome do cliente" /></div>
            <div><Label>WhatsApp</Label><Input className="mt-1.5" inputMode="tel" value={clientWhatsapp} onChange={(event) => setClientWhatsapp(event.target.value)} placeholder="(85) 99999-9999" /></div>
            <div><Label>Data de nascimento</Label><Input className="mt-1.5" type="date" max={todayIso()} value={clientBirthDate} onChange={(event) => setClientBirthDate(event.target.value)} /></div>
            <div className="sm:col-span-2"><Label>E-mail (opcional)</Label><Input className="mt-1.5" type="email" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} placeholder="cliente@email.com" /></div>
          </div>
          <Button type="button" className="mt-4 w-full rounded-xl" onClick={() => void createClient()} disabled={savingClient}>{savingClient ? "Cadastrando..." : "Cadastrar cliente"}</Button>
        </div>

        <div className="rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center gap-2"><CalendarPlus className="size-4 text-primary" /><h3 className="text-sm font-semibold">Novo agendamento</h3></div>

          <div className="mt-4">
            <Label>Selecionar cliente</Label>
            <div className="relative mt-1.5"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={clientSearch} onChange={(event) => { setClientSearch(event.target.value); setSelectedClientId(""); }} placeholder={query.isLoading ? "Carregando clientes..." : "Buscar nome, WhatsApp ou e-mail..."} className="pl-9" /></div>
            {!selectedClientId ? <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-xl border border-border p-1.5">{filteredClients.length ? filteredClients.map((client: any) => <button key={client.id} type="button" onClick={() => selectClient(client)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-secondary/60"><span className="min-w-0"><span className="block truncate text-xs font-medium">{client.name}</span><span className="block truncate text-[9px] text-muted-foreground">{client.whatsapp}{client.email ? ` · ${client.email}` : ""}</span></span></button>) : <p className="px-2 py-3 text-center text-[10px] text-muted-foreground">Nenhum cliente encontrado.</p>}</div> : <div className="mt-2 flex items-center justify-between rounded-xl bg-primary-soft px-3 py-2"><div className="min-w-0"><p className="truncate text-xs font-semibold text-primary">{selectedClient?.name}</p><p className="truncate text-[9px] text-muted-foreground">{selectedClient?.whatsapp}</p></div><Check className="size-4 text-primary" /></div>}
          </div>

          <div className="mt-3"><Label>Serviço</Label><Select value={serviceId} onValueChange={setServiceId}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{services.map((service: any) => <SelectItem key={service.id} value={service.id}>{service.name} · {formatPrice(Number(service.price ?? 0))}</SelectItem>)}</SelectContent></Select></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><Label>Data</Label><Input className="mt-1.5" type="date" min={todayIso()} value={date} onChange={(event) => setDate(event.target.value)} /></div><div><Label>Horário</Label><Select value={time} onValueChange={setTime} disabled={slotsLoading}><SelectTrigger className="mt-1.5"><SelectValue placeholder={slotsLoading ? "Carregando..." : slots.length ? "Selecione" : "Sem horário"} /></SelectTrigger><SelectContent>{slots.map((slot: any) => <SelectItem key={`${slot.slot}-${slot.source ?? "slot"}`} value={slot.slot}>{slot.slot}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="mt-3"><Label>Observações</Label><Textarea className="mt-1.5 min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" /></div>
          <Button type="button" className="mt-4 w-full rounded-xl" onClick={() => void createAppointment()} disabled={savingAppointment || slotsLoading || !selectedClientId || !serviceId || !time}>{savingAppointment ? "Salvando..." : "Criar agendamento"}</Button>
        </div>
      </div>
    </section>
  );
}
