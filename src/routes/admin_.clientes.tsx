import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Cake, CalendarDays, Gift, MessageCircle, Pencil, Plus, RefreshCw, Search, Trash2, UserRound } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";
import { ClientProfileDialog } from "@/components/client-profile-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
type BenefitType = "soft_lips" | "percent" | "custom";

const DEFAULT_BIRTHDAY_MESSAGE = `Feliz aniversário!
Hoje a J.R Clinic deseja a você um dia muito especial, repleto de alegria, amor e momentos felizes!
Que esse novo ciclo seja cheio de saúde, realizações, prosperidade e muitos motivos para sorrir.

Para deixar seu dia ainda mais especial, preparamos um presentinho para você:
Você ganhou um Soft Lips da J.R Clinic!

Esperamos que aproveite esse carinho preparado especialmente para você.

Com carinho,
J.R Clinic`;

export const Route = createFileRoute("/admin_/clientes")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: "/admin/clientes" } });
  },
  head: () => ({ meta: [{ title: "Clientes e aniversariantes — JR Clinic" }] }),
  component: ClientsPage,
});

function todayParts() {
  const now = new Date();
  return { month: now.getMonth() + 1, day: now.getDate() };
}

function birthParts(value: string) {
  const [, month, day] = value.split("-").map(Number);
  return { month, day };
}

function formatBirthDate(value: string) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function normalizeWhatsApp(value: string) {
  let digits = value.replace(/\D/g, "");
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) digits = `55${digits}`;
  return digits;
}

function birthdayMessage(client: any) {
  if (client.birthday_benefit_type === "soft_lips") return DEFAULT_BIRTHDAY_MESSAGE;

  let benefit = client.birthday_custom_benefit?.trim() || "um benefício especial da J.R Clinic!";
  if (client.birthday_benefit_type === "percent" && Number(client.birthday_discount_percent) > 0) {
    const percent = Number(client.birthday_discount_percent);
    benefit = `${Number.isInteger(percent) ? percent : percent.toFixed(1).replace(".", ",")}% de desconto em seu atendimento na J.R Clinic!`;
  }

  return `Feliz aniversário!
Hoje a J.R Clinic deseja a você um dia muito especial, repleto de alegria, amor e momentos felizes!
Que esse novo ciclo seja cheio de saúde, realizações, prosperidade e muitos motivos para sorrir.

Para deixar seu dia ainda mais especial, preparamos um presentinho para você:
Você ganhou ${benefit}

Esperamos que aproveite esse carinho preparado especialmente para você.

Com carinho,
J.R Clinic`;
}

function openBirthdayWhatsApp(client: any) {
  const phone = normalizeWhatsApp(client.whatsapp || "");
  if (phone.length < 12 || phone.length > 15) {
    toast.error("O WhatsApp deste cliente parece inválido.");
    return;
  }
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(birthdayMessage(client))}`, "_blank", "noopener,noreferrer");
}

async function loadClients() {
  const { data: isAdmin, error: adminError } = await db.rpc("is_current_user_admin");
  if (adminError) throw adminError;
  if (!isAdmin) throw new Error("Acesso administrativo necessário.");

  const { data, error } = await db
    .from("clients")
    .select("id,name,whatsapp,birth_date,birthday_benefit_type,birthday_discount_percent,birthday_custom_benefit,is_active,created_at,updated_at")
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

function ClientsPage() {
  const { data = [], isLoading, error, refetch, isFetching } = useQuery({ queryKey: ["admin-clients"], queryFn: loadClients, retry: 1 });
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [benefitType, setBenefitType] = useState<BenefitType>("soft_lips");
  const [discount, setDiscount] = useState("");
  const [customBenefit, setCustomBenefit] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const formRef = useRef<HTMLElement | null>(null);

  const today = todayParts();
  const birthdayClients = useMemo(() => data.filter((client: any) => {
    if (!client.is_active || !client.birth_date) return false;
    const parts = birthParts(client.birth_date);
    return parts.month === today.month && parts.day === today.day;
  }), [data, today.day, today.month]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data;
    return data.filter((client: any) => client.name.toLowerCase().includes(term) || String(client.whatsapp || "").includes(term));
  }, [data, search]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setWhatsapp("");
    setBirthDate("");
    setBenefitType("soft_lips");
    setDiscount("");
    setCustomBenefit("");
    setActive(true);
  };

  const editClient = (client: any) => {
    setEditingId(client.id);
    setName(client.name || "");
    setWhatsapp(client.whatsapp || "");
    setBirthDate(client.birth_date || "");
    setBenefitType(client.birthday_benefit_type || "soft_lips");
    setDiscount(client.birthday_discount_percent == null ? "" : String(client.birthday_discount_percent));
    setCustomBenefit(client.birthday_custom_benefit || "");
    setActive(client.is_active !== false);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const deleteClient = async (client: any) => {
    const confirmed = window.confirm(
      `Excluir ${client.name}?\n\nO cliente será removido da lista, mas o histórico de agendamentos será preservado.`,
    );
    if (!confirmed) return;

    setDeletingId(client.id);
    try {
      const { error: deleteError } = await db
        .from("clients")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", client.id)
        .is("deleted_at", null);
      if (deleteError) throw deleteError;

      if (selectedClientId === client.id) setSelectedClientId(null);
      if (editingId === client.id) resetForm();
      toast.success("Cliente excluído. O histórico de agendamentos foi preservado.");
      await refetch();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível excluir o cliente.");
    } finally {
      setDeletingId(null);
    }
  };

  const save = async () => {
    const digits = normalizeWhatsApp(whatsapp);
    if (name.trim().length < 2) { toast.error("Informe o nome do cliente."); return; }
    if (digits.length < 12 || digits.length > 15) { toast.error("Informe um WhatsApp válido com DDD."); return; }
    if (!birthDate) { toast.error("Informe a data de nascimento."); return; }
    if (benefitType === "percent" && !(Number(discount) > 0 && Number(discount) <= 100)) { toast.error("Informe um desconto entre 1% e 100%."); return; }
    if (benefitType === "custom" && customBenefit.trim().length < 2) { toast.error("Descreva o benefício personalizado."); return; }

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const payload = {
        name: name.trim(),
        whatsapp: whatsapp.trim(),
        birth_date: birthDate,
        birthday_benefit_type: benefitType,
        birthday_discount_percent: benefitType === "percent" ? Number(discount) : null,
        birthday_custom_benefit: benefitType === "custom" ? customBenefit.trim() : null,
        is_active: active,
      };

      const result = editingId
        ? await db.from("clients").update(payload).eq("id", editingId).select("id").single()
        : await db.from("clients").insert({ ...payload, created_by: authData.user?.id ?? null }).select("id").single();
      if (result.error) throw result.error;

      toast.success(editingId ? "Cliente atualizado." : "Cliente cadastrado.");
      resetForm();
      await refetch();
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível salvar o cliente.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="grid min-h-screen place-items-center">Carregando clientes...</div>;
  if (error) return <div className="grid min-h-screen place-items-center px-6 text-center">{error instanceof Error ? error.message : "Erro ao carregar clientes."}</div>;

  return (
    <div className="min-h-screen bg-background lg:pl-[252px]">
      <AdminSubpageSidebar active="clients" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Relacionamento</p>
            <h1 className="mt-2 text-3xl font-semibold">Clientes e aniversariantes</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Cadastre clientes, acompanhe aniversários e envie o presente da JR Clinic diretamente pelo WhatsApp.</p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar</Button>
        </div>

        {birthdayClients.length > 0 ? (
          <section className="mt-7 rounded-3xl border border-emerald-300/60 bg-emerald-50/70 p-5 shadow-soft sm:p-6">
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-emerald-600 text-white"><Cake className="size-5" /></span><div><h2 className="text-lg font-bold text-emerald-950">Aniversariante{birthdayClients.length > 1 ? "s" : ""} de hoje 🎉</h2><p className="text-xs text-emerald-900/70">O sistema encontrou {birthdayClients.length} cliente{birthdayClients.length > 1 ? "s" : ""} fazendo aniversário hoje.</p></div></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {birthdayClients.map((client: any) => <article key={client.id} className="rounded-2xl border border-emerald-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{client.name}</p><p className="mt-1 text-xs text-muted-foreground">{client.whatsapp}</p></div><Gift className="size-5 text-emerald-600" /></div><Button type="button" className="mt-4 w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openBirthdayWhatsApp(client)}><MessageCircle className="size-4" /> Enviar parabéns no WhatsApp</Button></article>)}
            </div>
          </section>
        ) : (
          <section className="mt-7 rounded-3xl border border-border bg-card px-5 py-4 shadow-soft"><div className="flex items-center gap-3"><Cake className="size-5 text-primary" /><div><p className="text-sm font-semibold">Nenhum aniversário hoje</p><p className="text-xs text-muted-foreground">Quando houver um aniversariante, o alerta e o botão de WhatsApp aparecerão aqui automaticamente.</p></div></div></section>
        )}

        <section ref={formRef} className="mt-6 scroll-mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <div className="flex items-center gap-2">{editingId ? <Pencil className="size-5 text-primary" /> : <Plus className="size-5 text-primary" />}<h2 className="text-lg font-bold">{editingId ? "Editar cliente" : "Cadastrar cliente"}</h2></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div><Label>Nome</Label><Input className="mt-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" /></div>
            <div><Label>WhatsApp</Label><Input className="mt-2" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(85) 99999-9999" /></div>
            <div><Label>Data de nascimento</Label><Input className="mt-2" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></div>
            <div><Label>Presente de aniversário</Label><Select value={benefitType} onValueChange={(value) => setBenefitType(value as BenefitType)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="soft_lips">Soft Lips da JR Clinic</SelectItem><SelectItem value="percent">Desconto em %</SelectItem><SelectItem value="custom">Benefício personalizado</SelectItem></SelectContent></Select></div>
            {benefitType === "percent" ? <div><Label>Desconto (%)</Label><Input className="mt-2" type="number" min="1" max="100" step="1" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="Ex.: 15" /></div> : null}
            {benefitType === "custom" ? <div className="sm:col-span-2"><Label>Benefício personalizado</Label><Textarea className="mt-2" value={customBenefit} onChange={(e) => setCustomBenefit(e.target.value)} placeholder="Ex.: uma hidratação labial gratuita da J.R Clinic!" /></div> : null}
            <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 sm:col-span-2"><div><p className="text-sm font-medium">Cliente ativo</p><p className="text-[11px] text-muted-foreground">Clientes inativos não aparecem nos alertas de aniversário.</p></div><Switch checked={active} onCheckedChange={setActive} /></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2"><Button onClick={save} disabled={saving}>{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar cliente"}</Button>{editingId ? <Button variant="outline" onClick={resetForm} disabled={saving}>Cancelar edição</Button> : null}</div>
        </section>

        <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold">Clientes cadastrados</h2><p className="mt-1 text-xs text-muted-foreground">{data.length} cliente{data.length === 1 ? "" : "s"} no cadastro.</p></div><div className="relative sm:w-[300px]"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente ou WhatsApp" className="pl-9" /></div></div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
            ) : filtered.map((client: any) => {
              const parts = birthParts(client.birth_date);
              const isBirthday = client.is_active && parts.month === today.month && parts.day === today.day;
              const isDeleting = deletingId === client.id;
              return (
                <article
                  key={client.id}
                  className={`group rounded-2xl border transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md ${isBirthday ? "border-emerald-300 bg-emerald-50/40" : "border-border bg-background"}`}
                >
                  <div className="flex items-start gap-1 p-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedClientId(client.id)}
                      className="min-w-0 flex-1 rounded-xl p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><UserRound className="size-4" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-semibold">{client.name}</p>
                            {!client.is_active ? <Badge variant="secondary" className="shrink-0 text-[10px]">Inativo</Badge> : null}
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{client.whatsapp}</p>
                          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1"><CalendarDays className="size-3" /> {formatBirthDate(client.birth_date)}</span>
                            {isBirthday ? <Badge className="bg-emerald-600 px-1.5 py-0 text-[9px] text-white">Aniversário hoje</Badge> : <span className="font-medium text-primary opacity-0 transition group-hover:opacity-100">Abrir ficha →</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => void deleteClient(client)}
                      disabled={isDeleting}
                      aria-label={`Excluir ${client.name}`}
                      title="Excluir cliente"
                    >
                      <Trash2 className={`size-4 ${isDeleting ? "animate-pulse" : ""}`} />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <ClientProfileDialog
          clientId={selectedClientId}
          open={Boolean(selectedClientId)}
          onOpenChange={(nextOpen) => { if (!nextOpen) setSelectedClientId(null); }}
          onUpdated={async () => { await refetch(); }}
        />
      </main>
    </div>
  );
}
