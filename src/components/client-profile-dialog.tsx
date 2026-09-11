/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, FileText, FolderOpen, Image, Loader2, Paperclip, Plus, ReceiptText, Save, Trash2, Upload, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

type BudgetRow = { serviceId: string; sessions: string; unitPrice: string };

const money = (value: unknown) => Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateLabel = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const fileSize = (value?: number | null) => !value ? "" : value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
const digits = (value?: string | null) => String(value ?? "").replace(/\D/g, "");
const safeName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-90);

const statusLabel: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  atendido: "Atendido",
  cancelado: "Cancelado",
  aguardando_pagamento: "Aguardando pagamento",
  draft: "Rascunho",
  approved: "Aprovado",
  declined: "Recusado",
  cancelled: "Cancelado",
};

const categoryLabel: Record<string, string> = {
  anamnesis: "Anamnese",
  document: "Documento",
  photo: "Foto",
  other: "Outro",
};

async function loadClientWorkspace(clientId: string) {
  const clientResult = await db
    .from("clients")
    .select("id,name,whatsapp,email,birth_date,observation,birthday_benefit_type,birthday_discount_percent,birthday_custom_benefit,is_active,created_at,updated_at")
    .eq("id", clientId)
    .single();
  if (clientResult.error) throw clientResult.error;
  const client = clientResult.data;

  const appointmentSelect = "id,client_id,patient_name,patient_phone,patient_email,notes,scheduled_date,scheduled_time,status,custom_price,service_price_snapshot,created_at,service:services!appointments_service_id_fkey(name,price),professional:professionals(name),appointment_sessions(id,session_number,scheduled_date,scheduled_time,status,completed_at),appointment_services(service_id,position,price_snapshot,status,service:services!appointment_services_service_id_fkey(name,price))";

  const [directAppointments, legacyAppointments, documents, budgets, services] = await Promise.all([
    db.from("appointments").select(appointmentSelect).eq("client_id", clientId).order("scheduled_date", { ascending: false }).limit(100),
    db.from("appointments").select(appointmentSelect).ilike("patient_name", client.name).order("scheduled_date", { ascending: false }).limit(100),
    db.from("client_documents").select("id,client_id,category,file_name,storage_path,mime_type,size_bytes,notes,created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
    db.from("client_budgets").select("id,client_id,title,notes,status,total_amount,valid_until,created_at,updated_at,client_budget_items(id,service_id,service_name_snapshot,unit_price,sessions,line_total,position)").eq("client_id", clientId).order("created_at", { ascending: false }),
    db.from("services").select("id,name,price,duration_min").eq("is_active", true).order("name"),
  ]);
  for (const result of [directAppointments, legacyAppointments, documents, budgets, services]) if (result.error) throw result.error;

  const wantedPhone = digits(client.whatsapp);
  const appointmentMap = new Map<string, any>();
  for (const row of [...(directAppointments.data ?? []), ...(legacyAppointments.data ?? [])]) {
    if (row.client_id === clientId || !wantedPhone || digits(row.patient_phone) === wantedPhone || String(row.patient_name ?? "").trim().toLowerCase() === String(client.name ?? "").trim().toLowerCase()) {
      appointmentMap.set(row.id, row);
    }
  }

  return {
    client,
    appointments: [...appointmentMap.values()].sort((a, b) => `${b.scheduled_date}${b.scheduled_time}`.localeCompare(`${a.scheduled_date}${a.scheduled_time}`)),
    documents: documents.data ?? [],
    budgets: budgets.data ?? [],
    services: services.data ?? [],
  };
}

export function ClientProfileDialog({ clientId, open, onOpenChange, onUpdated }: { clientId: string | null; open: boolean; onOpenChange: (open: boolean) => void; onUpdated?: () => void | Promise<void> }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["client-workspace", clientId],
    queryFn: () => loadClientWorkspace(clientId as string),
    enabled: open && Boolean(clientId),
  });

  const client = query.data?.client;
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [observation, setObservation] = useState("");
  const [active, setActive] = useState("true");
  const [benefitType, setBenefitType] = useState("soft_lips");
  const [benefitPercent, setBenefitPercent] = useState("");
  const [benefitCustom, setBenefitCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentCategory, setDocumentCategory] = useState("anamnesis");

  const [budgetTitle, setBudgetTitle] = useState("Orçamento / combo");
  const [budgetNotes, setBudgetNotes] = useState("");
  const [budgetValidUntil, setBudgetValidUntil] = useState("");
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([{ serviceId: "", sessions: "1", unitPrice: "" }]);
  const [budgetSaving, setBudgetSaving] = useState(false);

  useEffect(() => {
    if (!client) return;
    setName(client.name ?? "");
    setWhatsapp(client.whatsapp ?? "");
    setEmail(client.email ?? "");
    setBirthDate(client.birth_date ?? "");
    setObservation(client.observation ?? "");
    setActive(client.is_active === false ? "false" : "true");
    setBenefitType(client.birthday_benefit_type ?? "soft_lips");
    setBenefitPercent(client.birthday_discount_percent == null ? "" : String(client.birthday_discount_percent));
    setBenefitCustom(client.birthday_custom_benefit ?? "");
  }, [client]);

  const budgetTotal = useMemo(() => budgetRows.reduce((sum, row) => sum + (Number(String(row.unitPrice).replace(",", ".")) || 0) * Math.max(1, Number(row.sessions) || 1), 0), [budgetRows]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["client-workspace", clientId] });
    await query.refetch();
  };

  const saveProfile = async () => {
    if (!clientId || name.trim().length < 2) { toast.error("Informe o nome do cliente."); return undefined; }
    if (digits(whatsapp).length < 10) { toast.error("Informe um WhatsApp válido."); return undefined; }
    setSaving(true);
    const result = await db.from("clients").update({
      name: name.trim(), whatsapp: whatsapp.trim(), email: email.trim() || null, birth_date: birthDate || null,
      observation: observation.trim() || null, is_active: active === "true",
      birthday_benefit_type: benefitType,
      birthday_discount_percent: benefitType === "percent" && benefitPercent ? Number(benefitPercent) : null,
      birthday_custom_benefit: benefitType === "custom" ? benefitCustom.trim() || null : null,
      updated_at: new Date().toISOString(),
    }).eq("id", clientId);
    setSaving(false);
    if (result.error) { toast.error("Não foi possível salvar a ficha.", { description: result.error.message }); return undefined; }
    toast.success("Ficha do cliente atualizada.");
    await refresh();
    await onUpdated?.();
    return undefined;
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!clientId || !files?.length) return;
    setUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      for (const file of Array.from(files)) {
        if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name}: limite de 15 MB por arquivo.`);
        const path = `${clientId}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
        const uploadOptions = file.type ? { upsert: false, contentType: file.type } : { upsert: false };
        const uploaded = await supabase.storage.from("client-records").upload(path, file, uploadOptions);
        if (uploaded.error) throw uploaded.error;
        const inserted = await db.from("client_documents").insert({
          client_id: clientId, category: documentCategory, file_name: file.name, storage_path: path,
          mime_type: file.type || null, size_bytes: file.size, uploaded_by: auth.user?.id ?? null,
        });
        if (inserted.error) {
          await supabase.storage.from("client-records").remove([path]);
          throw inserted.error;
        }
      }
      toast.success(files.length === 1 ? "Arquivo anexado à ficha." : `${files.length} arquivos anexados à ficha.`);
      await refresh();
    } catch (error: any) {
      toast.error("Não foi possível anexar o arquivo.", { description: error?.message });
    } finally {
      setUploading(false);
    }
    return undefined;
  };

  const openDocument = async (doc: any) => {
    const { data, error } = await supabase.storage.from("client-records").createSignedUrl(doc.storage_path, 300);
    if (error || !data?.signedUrl) { toast.error("Não foi possível abrir o arquivo."); return undefined; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    return undefined;
  };

  const removeDocument = async (doc: any) => {
    if (!window.confirm(`Excluir ${doc.file_name} da ficha?`)) return;
    const removed = await supabase.storage.from("client-records").remove([doc.storage_path]);
    if (removed.error) { toast.error("Não foi possível excluir o arquivo.", { description: removed.error.message }); return undefined; }
    const deleted = await db.from("client_documents").delete().eq("id", doc.id);
    if (deleted.error) { toast.error("O arquivo foi removido, mas o registro não pôde ser apagado.", { description: deleted.error.message }); return undefined; }
    toast.success("Arquivo removido da ficha.");
    await refresh();
    return undefined;
  };

  const setBudgetService = (index: number, serviceId: string) => {
    const service = query.data?.services?.find((item: any) => item.id === serviceId);
    setBudgetRows((rows) => rows.map((row, i) => i === index ? { ...row, serviceId, unitPrice: service ? Number(service.price ?? 0).toFixed(2).replace(".", ",") : row.unitPrice } : row));
  };

  const saveBudget = async () => {
    if (!clientId) return undefined;
    const validRows = budgetRows.filter((row) => row.serviceId);
    if (!validRows.length) { toast.error("Adicione pelo menos um serviço ao orçamento."); return undefined; }
    setBudgetSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const budget = await db.from("client_budgets").insert({
        client_id: clientId, title: budgetTitle.trim() || "Orçamento / combo", notes: budgetNotes.trim() || null,
        total_amount: Math.round(budgetTotal * 100) / 100, valid_until: budgetValidUntil || null, created_by: auth.user?.id ?? null,
      }).select("id").single();
      if (budget.error) throw budget.error;
      const items = validRows.map((row, index) => {
        const service = query.data?.services?.find((item: any) => item.id === row.serviceId);
        return {
          budget_id: budget.data.id, service_id: row.serviceId, service_name_snapshot: service?.name ?? "Serviço",
          unit_price: Number(String(row.unitPrice).replace(",", ".")) || 0, sessions: Math.max(1, Number(row.sessions) || 1), position: index + 1,
        };
      });
      const inserted = await db.from("client_budget_items").insert(items);
      if (inserted.error) {
        await db.from("client_budgets").delete().eq("id", budget.data.id);
        throw inserted.error;
      }
      toast.success("Orçamento / combo salvo na ficha.");
      setBudgetTitle("Orçamento / combo"); setBudgetNotes(""); setBudgetValidUntil("");
      setBudgetRows([{ serviceId: "", sessions: "1", unitPrice: "" }]);
      await refresh();
    } catch (error: any) {
      toast.error("Não foi possível salvar o orçamento.", { description: error?.message });
    } finally {
      setBudgetSaving(false);
    }
    return undefined;
  };

  const updateBudgetStatus = async (id: string, status: string) => {
    const result = await db.from("client_budgets").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (result.error) { toast.error(result.error.message); return undefined; }
    await refresh();
    return undefined;
  };

  const removeBudget = async (id: string) => {
    if (!window.confirm("Excluir este orçamento da ficha?")) return;
    const result = await db.from("client_budgets").delete().eq("id", id);
    if (result.error) { toast.error(result.error.message); return undefined; }
    toast.success("Orçamento excluído.");
    await refresh();
    return undefined;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[1120px] overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary"><UserRound className="size-5" /></span>
            <div className="min-w-0">
              <DialogTitle className="truncate text-xl">{client?.name ?? "Ficha do cliente"}</DialogTitle>
              <DialogDescription className="mt-1">Cadastro, anamnese e arquivos, agendamentos e orçamentos/combos em um só lugar.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {query.isLoading ? <div className="grid min-h-[420px] place-items-center"><Loader2 className="size-7 animate-spin text-primary" /></div> : query.error ? <div className="p-8 text-sm text-destructive">{query.error instanceof Error ? query.error.message : "Erro ao carregar a ficha."}</div> : client ? (
          <Tabs defaultValue="profile" className="min-h-0 flex-1 overflow-hidden px-5 pb-5">
            <div className="overflow-x-auto pt-4">
              <TabsList className="w-max min-w-full justify-start">
                <TabsTrigger value="profile">Ficha cadastral</TabsTrigger>
                <TabsTrigger value="documents">Anamnese e arquivos</TabsTrigger>
                <TabsTrigger value="appointments">Agendamentos</TabsTrigger>
                <TabsTrigger value="budgets">Orçamentos e combos</TabsTrigger>
              </TabsList>
            </div>

            <div className="mt-3 max-h-[68vh] overflow-y-auto pr-1">
              <TabsContent value="profile" className="mt-0 space-y-5">
                <div className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2">
                  <div><Label>Nome completo</Label><Input className="mt-2" value={name} onChange={(e) => setName(e.target.value)} /></div>
                  <div><Label>WhatsApp</Label><Input className="mt-2" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></div>
                  <div><Label>E-mail</Label><Input className="mt-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@email.com" /></div>
                  <div><Label>Data de nascimento</Label><Input className="mt-2" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></div>
                  <div><Label>Status</Label><Select value={active} onValueChange={setActive}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Cliente ativo</SelectItem><SelectItem value="false">Cliente inativo</SelectItem></SelectContent></Select></div>
                  <div><Label>Presente de aniversário</Label><Select value={benefitType} onValueChange={setBenefitType}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="soft_lips">Soft Lips da JR Clinic</SelectItem><SelectItem value="percent">Desconto em %</SelectItem><SelectItem value="custom">Benefício personalizado</SelectItem></SelectContent></Select></div>
                  {benefitType === "percent" ? <div><Label>Desconto (%)</Label><Input className="mt-2" type="number" min="1" max="100" value={benefitPercent} onChange={(e) => setBenefitPercent(e.target.value)} /></div> : null}
                  {benefitType === "custom" ? <div className="sm:col-span-2"><Label>Benefício personalizado</Label><Input className="mt-2" value={benefitCustom} onChange={(e) => setBenefitCustom(e.target.value)} /></div> : null}
                  <div className="sm:col-span-2"><Label>Observações da ficha</Label><Textarea className="mt-2 min-h-28" value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Preferências, observações internas, informações importantes sobre o cliente..." /></div>
                </div>
                <div className="flex justify-end"><Button onClick={saveProfile} disabled={saving}><Save className="size-4" /> {saving ? "Salvando..." : "Salvar ficha"}</Button></div>
              </TabsContent>

              <TabsContent value="documents" className="mt-0 space-y-4">
                <div className="rounded-2xl border border-dashed bg-muted/25 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div><h3 className="font-semibold">Anexar à ficha</h3><p className="mt-1 text-xs text-muted-foreground">A anamnese não tem formulário padrão: basta anexar o arquivo preenchido, fotos, PDF ou outros documentos. Limite de 15 MB por arquivo.</p></div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-40"><Label>Tipo</Label><Select value={documentCategory} onValueChange={setDocumentCategory}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="anamnesis">Anamnese</SelectItem><SelectItem value="document">Documento</SelectItem><SelectItem value="photo">Foto</SelectItem><SelectItem value="other">Outro</SelectItem></SelectContent></Select></div>
                      <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                        {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {uploading ? "Enviando..." : "Selecionar arquivos"}
                        <input type="file" multiple className="hidden" disabled={uploading} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(e) => { void uploadFiles(e.target.files); e.currentTarget.value = ""; }} />
                      </label>
                    </div>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {(query.data?.documents ?? []).length === 0 ? <div className="col-span-full rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum arquivo anexado ainda.</div> : (query.data?.documents ?? []).map((doc: any) => (
                    <div key={doc.id} className="flex items-center gap-3 rounded-2xl border p-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">{doc.mime_type?.startsWith("image/") ? <Image className="size-4" /> : <FileText className="size-4" />}</span>
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void openDocument(doc)}><p className="truncate text-sm font-medium">{doc.file_name}</p><p className="mt-1 text-xs text-muted-foreground">{categoryLabel[doc.category] ?? "Arquivo"}{doc.size_bytes ? ` · ${fileSize(doc.size_bytes)}` : ""} · {new Date(doc.created_at).toLocaleDateString("pt-BR")}</p></button>
                      <Button size="icon" variant="ghost" className="shrink-0 text-destructive" onClick={() => void removeDocument(doc)}><Trash2 className="size-4" /></Button>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="appointments" className="mt-0 space-y-3">
                {(query.data?.appointments ?? []).length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum agendamento encontrado para este cliente.</div> : (query.data?.appointments ?? []).map((appointment: any) => {
                  const sessions = [...(appointment.appointment_sessions ?? [])].sort((a: any, b: any) => Number(a.session_number) - Number(b.session_number));
                  const services = [...(appointment.appointment_services ?? [])].sort((a: any, b: any) => Number(a.position) - Number(b.position));
                  return <article key={appointment.id} className="rounded-2xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" /><strong>{dateLabel(appointment.scheduled_date)} às {String(appointment.scheduled_time ?? "").slice(0,5)}</strong></div><p className="mt-1 text-sm text-muted-foreground">{appointment.service?.name ?? "Serviço"} · {appointment.professional?.name ?? "Profissional"}</p></div><Badge variant="outline">{statusLabel[appointment.status] ?? appointment.status}</Badge></div>
                    {services.length > 1 ? <div className="mt-3 rounded-xl bg-muted/40 p-3"><p className="text-xs font-semibold">Serviços do combo</p><div className="mt-2 flex flex-wrap gap-2">{services.map((item: any) => <Badge key={`${appointment.id}-${item.service_id}`} variant="secondary">{item.service?.name ?? "Serviço"} · {money(item.price_snapshot ?? item.service?.price)}</Badge>)}</div></div> : null}
                    {sessions.length > 1 ? <div className="mt-3 rounded-xl bg-muted/40 p-3"><p className="text-xs font-semibold">Sessões do pacote</p><div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{sessions.map((session: any) => <div key={session.id} className="rounded-lg bg-background px-2.5 py-2 text-xs"><strong>Sessão {session.session_number}</strong> · {session.status === "completed" ? "Concluída" : "Pendente"}<br/><span className="text-muted-foreground">{session.scheduled_date ? dateLabel(session.scheduled_date) : "Data a definir"}</span></div>)}</div></div> : null}
                    {appointment.notes ? <p className="mt-3 text-xs text-muted-foreground"><strong>Observação:</strong> {appointment.notes}</p> : null}
                  </article>;
                })}
              </TabsContent>

              <TabsContent value="budgets" className="mt-0 space-y-5">
                <section className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center gap-2"><ReceiptText className="size-4 text-primary" /><h3 className="font-semibold">Novo orçamento / combo</h3></div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><Label>Título</Label><Input className="mt-2" value={budgetTitle} onChange={(e) => setBudgetTitle(e.target.value)} /></div><div><Label>Validade (opcional)</Label><Input className="mt-2" type="date" value={budgetValidUntil} onChange={(e) => setBudgetValidUntil(e.target.value)} /></div></div>
                  <div className="mt-4 space-y-2">
                    {budgetRows.map((row, index) => <div key={index} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1.6fr)_110px_140px_auto]">
                      <Select value={row.serviceId} onValueChange={(value) => setBudgetService(index, value)}><SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger><SelectContent>{(query.data?.services ?? []).map((service: any) => <SelectItem key={service.id} value={service.id}>{service.name} · {money(service.price)}</SelectItem>)}</SelectContent></Select>
                      <Input type="number" min="1" max="60" title="Sessões" value={row.sessions} onChange={(e) => setBudgetRows((rows) => rows.map((item, i) => i === index ? { ...item, sessions: e.target.value } : item))} placeholder="Sessões" />
                      <Input value={row.unitPrice} onChange={(e) => setBudgetRows((rows) => rows.map((item, i) => i === index ? { ...item, unitPrice: e.target.value } : item))} placeholder="Valor/sessão" />
                      <Button type="button" size="icon" variant="ghost" disabled={budgetRows.length === 1} onClick={() => setBudgetRows((rows) => rows.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button>
                    </div>)}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setBudgetRows((rows) => [...rows, { serviceId: "", sessions: "1", unitPrice: "" }])}><Plus className="size-4" /> Adicionar serviço ao combo</Button>
                  <div className="mt-4"><Label>Observações do orçamento</Label><Textarea className="mt-2" value={budgetNotes} onChange={(e) => setBudgetNotes(e.target.value)} placeholder="Condições, intervalos entre sessões, orientações..." /></div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 p-3"><div><p className="text-xs text-muted-foreground">Total estimado</p><p className="text-xl font-bold">{money(budgetTotal)}</p></div><Button onClick={() => void saveBudget()} disabled={budgetSaving}><Save className="size-4" /> {budgetSaving ? "Salvando..." : "Salvar orçamento"}</Button></div>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2"><FolderOpen className="size-4 text-primary" /><h3 className="font-semibold">Orçamentos salvos</h3></div>
                  {(query.data?.budgets ?? []).length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum orçamento salvo ainda.</div> : (query.data?.budgets ?? []).map((budget: any) => <article key={budget.id} className="rounded-2xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{budget.title}</p><p className="mt-1 text-xs text-muted-foreground">Criado em {new Date(budget.created_at).toLocaleDateString("pt-BR")}{budget.valid_until ? ` · válido até ${dateLabel(budget.valid_until)}` : ""}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{statusLabel[budget.status] ?? budget.status}</Badge><strong>{money(budget.total_amount)}</strong></div></div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">{[...(budget.client_budget_items ?? [])].sort((a: any,b: any) => Number(a.position)-Number(b.position)).map((item: any) => <div key={item.id} className="rounded-xl bg-muted/40 p-3 text-sm"><strong>{item.service_name_snapshot}</strong><p className="mt-1 text-xs text-muted-foreground">{item.sessions} sessão(ões) × {money(item.unit_price)} = {money(item.line_total)}</p></div>)}</div>
                    {budget.notes ? <p className="mt-3 text-sm text-muted-foreground">{budget.notes}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void updateBudgetStatus(budget.id, "approved")}>Marcar aprovado</Button><Button size="sm" variant="outline" onClick={() => void updateBudgetStatus(budget.id, "declined")}>Marcar recusado</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => void removeBudget(budget.id)}><Trash2 className="size-4" /> Excluir</Button></div>
                  </article>)}
                </section>
              </TabsContent>
            </div>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
