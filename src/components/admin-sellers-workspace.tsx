import {
  BadgePercent,
  CircleDollarSign,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatPrice } from "@/lib/clinic";

const db = supabase as any;

type SellerForm = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  commissionPercentage: string;
  isActive: boolean;
};

const emptyForm: SellerForm = {
  name: "",
  email: "",
  phone: "",
  commissionPercentage: "2",
  isActive: true,
};

function formatPercentage(value: unknown) {
  const number = Number(value ?? 0);
  return `${number.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
}

function commissionStatus(status: string) {
  if (status === "pending") return { label: "A pagar", className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" };
  if (status === "suspended") return { label: "Aguardando recebimento", className: "bg-amber-100 text-amber-800 hover:bg-amber-100" };
  return { label: "Cancelada", className: "bg-secondary text-muted-foreground hover:bg-secondary" };
}

export function AdminSellersWorkspace() {
  const [sellers, setSellers] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<SellerForm>(emptyForm);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const [sellerResult, commissionResult] = await Promise.all([
      db
        .from("sellers")
        .select("id, name, email, phone, commission_percentage, is_active, created_at, updated_at, deleted_at")
        .order("name"),
      db
        .from("seller_commissions")
        .select("id, appointment_id, seller_id, seller_name_snapshot, percentage, base_amount, commission_amount, status, created_at, appointment:appointments!seller_commissions_appointment_id_fkey(patient_name, scheduled_date)")
        .order("created_at", { ascending: false })
        .limit(150),
    ]);

    setLoading(false);
    const error = sellerResult.error ?? commissionResult.error;
    if (error) {
      toast.error("Não foi possível carregar os vendedores.", { description: error.message });
      return;
    }
    setSellers(sellerResult.data ?? []);
    setCommissions(commissionResult.data ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const activeSellers = useMemo(
    () => sellers.filter((seller) => seller.is_active && !seller.deleted_at),
    [sellers],
  );

  const receivedSales = useMemo(
    () => commissions.filter((item) => item.status === "pending").reduce((sum, item) => sum + Number(item.base_amount ?? 0), 0),
    [commissions],
  );

  const pendingCommission = useMemo(
    () => commissions.filter((item) => item.status === "pending").reduce((sum, item) => sum + Number(item.commission_amount ?? 0), 0),
    [commissions],
  );

  const waitingCommission = useMemo(
    () => commissions.filter((item) => item.status === "suspended").reduce((sum, item) => sum + Number(item.commission_amount ?? 0), 0),
    [commissions],
  );

  const filteredSellers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return sellers;
    return sellers.filter((seller) =>
      [seller.name, seller.email, seller.phone].some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [sellers, search]);

  const openNew = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (seller: any) => {
    setForm({
      id: seller.id,
      name: seller.name ?? "",
      email: seller.email ?? "",
      phone: seller.phone ?? "",
      commissionPercentage: String(Number(seller.commission_percentage ?? 0)),
      isActive: Boolean(seller.is_active && !seller.deleted_at),
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const name = form.name.trim();
    const percentage = Number(form.commissionPercentage.replace(",", "."));
    if (!name) {
      toast.error("Informe o nome do vendedor.");
      return;
    }
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      toast.error("Informe um percentual entre 0% e 100%.");
      return;
    }

    setSaving(true);
    const { error } = await db.rpc("save_seller", {
      _name: name,
      _commission_percentage: percentage,
      _email: form.email.trim() || null,
      _phone: form.phone.trim() || null,
      _is_active: form.isActive,
      _seller_id: form.id ?? null,
    });
    setSaving(false);

    if (error) {
      toast.error("Não foi possível salvar o vendedor.", { description: error.message });
      return;
    }

    toast.success(form.id ? "Vendedor atualizado." : "Vendedor cadastrado.", {
      description: `${name} · comissão padrão de ${formatPercentage(percentage)}`,
    });
    setDialogOpen(false);
    setForm(emptyForm);
    await load();
  };

  const archive = async (seller: any) => {
    if (!window.confirm(`Excluir ${seller.name} da lista de vendedores ativos? O histórico de vendas e comissões será preservado.`)) return;
    setArchivingId(seller.id);
    const { error } = await db.rpc("archive_seller", { _seller_id: seller.id });
    setArchivingId("");
    if (error) {
      toast.error("Não foi possível excluir o vendedor.", { description: error.message });
      return;
    }
    toast.success("Vendedor removido da lista ativa.", { description: "O histórico de comissões foi mantido." });
    await load();
  };

  return (
    <section className="mx-auto w-full max-w-[1500px] space-y-5">
      <header className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-primary">
            <BadgePercent className="size-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">Comercial</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Vendedores e comissões</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cadastre quem indica clientes, defina a porcentagem padrão e acompanhe a comissão gerada por cada venda. Este módulo é exclusivo para administradores.
          </p>
        </div>
        <Button type="button" className="h-11 shrink-0 rounded-xl" onClick={openNew}>
          <Plus className="size-4" /> Novo vendedor
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={UserRoundCheck} label="Vendedores ativos" value={String(activeSellers.length)} hint={`${sellers.length} cadastrado(s) no total`} />
        <SummaryCard icon={WalletCards} label="Vendas recebidas" value={formatPrice(receivedSales)} hint="Base das comissões liberadas" />
        <SummaryCard icon={CircleDollarSign} label="Comissões a pagar" value={formatPrice(pendingCommission)} hint="Receitas já recebidas" />
        <SummaryCard icon={BadgePercent} label="Aguardando recebimento" value={formatPrice(waitingCommission)} hint="Comissão suspensa até a entrada" />
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Cadastro de vendedores</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Editar a porcentagem altera somente novas indicações; agendamentos já atribuídos mantêm o percentual registrado no momento da atribuição.</p>
          </div>
          <div className="relative w-full sm:w-[320px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar vendedor..." className="h-10 rounded-xl pl-9" />
          </div>
        </div>

        {loading ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Carregando vendedores...</div>
        ) : filteredSellers.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center">
            <UserRoundCheck className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Nenhum vendedor cadastrado.</p>
            <p className="mt-1 text-xs text-muted-foreground">Cadastre o primeiro para habilitar a seleção nos agendamentos.</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredSellers.map((seller) => {
              const active = seller.is_active && !seller.deleted_at;
              return (
                <article key={seller.id} className="rounded-2xl border border-border bg-background/65 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{seller.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{seller.phone || seller.email || "Sem contato informado"}</p>
                    </div>
                    <Badge variant={active ? "default" : "secondary"} className={active ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}>{active ? "Ativo" : seller.deleted_at ? "Excluído" : "Inativo"}</Badge>
                  </div>
                  <div className="mt-4 rounded-xl bg-primary-soft/55 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Comissão padrão</p>
                    <p className="mt-1 text-xl font-semibold text-primary">{formatPercentage(seller.commission_percentage)}</p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => openEdit(seller)}>
                      <Pencil className="size-3.5" /> Editar
                    </Button>
                    {!seller.deleted_at ? (
                      <Button type="button" variant="ghost" size="sm" className="rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive" disabled={archivingId === seller.id} onClick={() => void archive(seller)} title="Excluir vendedor">
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div>
          <h2 className="text-lg font-semibold">Comissões geradas</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">A comissão é independente da comissão do profissional e acompanha automaticamente o status financeiro da venda.</p>
        </div>
        {commissions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhuma comissão de vendedor gerada até o momento.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {commissions.map((item) => {
              const status = commissionStatus(item.status);
              return (
                <div key={item.id} className="grid gap-3 rounded-2xl border border-border bg-background/65 p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center sm:p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{item.seller_name_snapshot}</p>
                      <Badge variant="secondary" className={status.className}>{status.label}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{item.appointment?.patient_name ?? "Cliente"}{item.appointment?.scheduled_date ? ` · ${formatDate(item.appointment.scheduled_date)}` : ""}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Venda</p><p className="mt-0.5 font-semibold">{formatPrice(Number(item.base_amount ?? 0))}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Percentual</p><p className="mt-0.5 font-semibold">{formatPercentage(item.percentage)}</p></div>
                  </div>
                  <div className="sm:text-right"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Comissão</p><p className="mt-0.5 text-base font-semibold text-primary">{formatPrice(Number(item.commission_amount ?? 0))}</p></div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) setDialogOpen(open); }}>
        <DialogContent className="w-[calc(100%-1rem)] rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar vendedor" : "Novo vendedor"}</DialogTitle>
            <DialogDescription>Defina os dados e a porcentagem padrão usada quando este vendedor for selecionado em um agendamento.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5"><Label htmlFor="seller-name">Nome *</Label><Input id="seller-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} disabled={saving} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="seller-phone">Telefone</Label><Input id="seller-phone" inputMode="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} disabled={saving} /></div>
              <div className="space-y-1.5"><Label htmlFor="seller-email">E-mail</Label><Input id="seller-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} disabled={saving} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="seller-percentage">Comissão padrão (%) *</Label><Input id="seller-percentage" type="number" min="0" max="100" step="0.01" inputMode="decimal" value={form.commissionPercentage} onChange={(event) => setForm((current) => ({ ...current, commissionPercentage: event.target.value }))} disabled={saving} /><p className="text-[11px] text-muted-foreground">Exemplo: 2 significa 2% do valor efetivamente vendido, após desconto e antes das taxas do cartão.</p></div>
            <div className="flex items-center justify-between rounded-2xl border border-border p-3"><div><p className="text-sm font-medium">Vendedor ativo</p><p className="mt-0.5 text-[11px] text-muted-foreground">Apenas vendedores ativos aparecem no agendamento.</p></div><Switch checked={form.isActive} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} disabled={saving} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "Salvando..." : "Salvar vendedor"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function SummaryCard({ icon: Icon, label, value, hint }: any) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2 text-primary"><Icon className="size-4" /><span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span></div>
      <p className="mt-3 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
