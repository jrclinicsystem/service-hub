import {
  BadgePercent,
  CalendarDays,
  CircleDollarSign,
  Eye,
  Mail,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
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
  if (status === "pending")
    return { label: "A pagar", className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" };
  if (status === "suspended")
    return {
      label: "Aguardando recebimento",
      className: "bg-amber-100 text-amber-800 hover:bg-amber-100",
    };
  return { label: "Cancelada", className: "bg-secondary text-muted-foreground hover:bg-secondary" };
}

function sellerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "V";
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : ""}`.toUpperCase();
}

async function loadAllSellerCommissions() {
  const pageSize = 1000;
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const result = await db
      .from("seller_commissions")
      .select(
        "id, appointment_id, seller_id, seller_name_snapshot, percentage, base_amount, commission_amount, status, created_at, appointment:appointments!seller_commissions_appointment_id_fkey(patient_name, scheduled_date)",
      )
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (result.error) return { data: null, error: result.error };
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return { data: rows, error: null };
}

function sellerMetrics(history: any[]) {
  const validSales = history.filter((item) => item.status !== "cancelled");
  return {
    salesCount: validSales.length,
    totalSales: validSales.reduce((sum, item) => sum + Number(item.base_amount ?? 0), 0),
    generatedCommission: validSales.reduce(
      (sum, item) => sum + Number(item.commission_amount ?? 0),
      0,
    ),
    payableCommission: history
      .filter((item) => item.status === "pending")
      .reduce((sum, item) => sum + Number(item.commission_amount ?? 0), 0),
    waitingCommission: history
      .filter((item) => item.status === "suspended")
      .reduce((sum, item) => sum + Number(item.commission_amount ?? 0), 0),
  };
}

export function AdminSellersWorkspace() {
  const [sellers, setSellers] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [profileSellerId, setProfileSellerId] = useState("");
  const [form, setForm] = useState<SellerForm>(emptyForm);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const [sellerResult, commissionResult] = await Promise.all([
      db
        .from("sellers")
        .select(
          "id, name, email, phone, commission_percentage, is_active, created_at, updated_at, deleted_at",
        )
        .order("name"),
      loadAllSellerCommissions(),
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
    () =>
      commissions
        .filter((item) => item.status === "pending")
        .reduce((sum, item) => sum + Number(item.base_amount ?? 0), 0),
    [commissions],
  );

  const pendingCommission = useMemo(
    () =>
      commissions
        .filter((item) => item.status === "pending")
        .reduce((sum, item) => sum + Number(item.commission_amount ?? 0), 0),
    [commissions],
  );

  const waitingCommission = useMemo(
    () =>
      commissions
        .filter((item) => item.status === "suspended")
        .reduce((sum, item) => sum + Number(item.commission_amount ?? 0), 0),
    [commissions],
  );

  const filteredSellers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const visibleSellers = sellers.filter((seller) => !seller.deleted_at);
    if (!term) return visibleSellers;
    return visibleSellers.filter((seller) =>
      [seller.name, seller.email, seller.phone].some((value) =>
        String(value ?? "")
          .toLocaleLowerCase("pt-BR")
          .includes(term),
      ),
    );
  }, [sellers, search]);

  const selectedSeller = useMemo(
    () => sellers.find((seller) => seller.id === profileSellerId) ?? null,
    [sellers, profileSellerId],
  );

  const selectedSellerHistory = useMemo(
    () =>
      selectedSeller
        ? commissions.filter((item) => item.seller_id === selectedSeller.id)
        : [],
    [commissions, selectedSeller],
  );

  const selectedSellerMetrics = useMemo(
    () => sellerMetrics(selectedSellerHistory),
    [selectedSellerHistory],
  );

  const openNew = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (seller: any) => {
    setProfileSellerId("");
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
    if (
      !window.confirm(
        `Excluir ${seller.name} da lista de vendedores ativos? O histórico de vendas e comissões será preservado.`,
      )
    )
      return;
    setArchivingId(seller.id);
    const { error } = await db.rpc("archive_seller", { _seller_id: seller.id });
    setArchivingId("");
    if (error) {
      toast.error("Não foi possível excluir o vendedor.", { description: error.message });
      return;
    }
    toast.success("Vendedor removido da lista ativa.", {
      description: "O histórico de vendas e comissões foi preservado internamente.",
    });
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
            Cadastre quem indica clientes, defina a porcentagem padrão e acompanhe o histórico
            individual de vendas e comissões. Este módulo é exclusivo para administradores.
          </p>
        </div>
        <Button type="button" className="h-11 shrink-0 rounded-xl" onClick={openNew}>
          <Plus className="size-4" /> Novo vendedor
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={UserRoundCheck}
          label="Vendedores ativos"
          value={String(activeSellers.length)}
          hint={`${sellers.length} cadastrado(s) no total`}
        />
        <SummaryCard
          icon={WalletCards}
          label="Vendas recebidas"
          value={formatPrice(receivedSales)}
          hint="Base das comissões liberadas"
        />
        <SummaryCard
          icon={CircleDollarSign}
          label="Comissões a pagar"
          value={formatPrice(pendingCommission)}
          hint="Receitas já recebidas"
        />
        <SummaryCard
          icon={BadgePercent}
          label="Aguardando recebimento"
          value={formatPrice(waitingCommission)}
          hint="Comissão suspensa até a entrada"
        />
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Cadastro de vendedores</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Cada vendedor possui uma ficha própria com vendas, valores e comissões. Alterar a
              porcentagem afeta somente novas indicações.
            </p>
          </div>
          <div className="relative w-full sm:w-[320px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar vendedor..."
              className="h-10 rounded-xl pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Carregando vendedores...
          </div>
        ) : filteredSellers.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center">
            <UserRoundCheck className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Nenhum vendedor cadastrado.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cadastre o primeiro para habilitar a seleção nos agendamentos.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(250px,290px))] justify-start gap-3">
            {filteredSellers.map((seller) => {
              const active = seller.is_active && !seller.deleted_at;
              const history = commissions.filter((item) => item.seller_id === seller.id);
              const metrics = sellerMetrics(history);

              return (
                <article
                  key={seller.id}
                  className="w-full rounded-2xl border border-border bg-background/65 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Vendedor
                      </p>
                      <p className="mt-1 truncate text-base font-semibold">{seller.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {seller.phone || seller.email || "Sem contato informado"}
                      </p>
                    </div>
                    <Badge
                      variant={active ? "default" : "secondary"}
                      className={active ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}
                    >
                      {active ? "Ativo" : seller.deleted_at ? "Excluído" : "Inativo"}
                    </Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-border bg-card p-2.5">
                      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                        Vendas
                      </p>
                      <p className="mt-1 text-base font-semibold">{metrics.salesCount}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-2.5">
                      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                        Vendido
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold">
                        {formatPrice(metrics.totalSales)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 rounded-xl bg-primary-soft/55 p-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          Comissão padrão
                        </p>
                        <p className="mt-1 text-lg font-semibold text-primary">
                          {formatPercentage(seller.commission_percentage)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          Gerada
                        </p>
                        <p className="mt-1 text-xs font-semibold">
                          {formatPrice(metrics.generatedCommission)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    className="mt-3 w-full rounded-xl"
                    onClick={() => setProfileSellerId(seller.id)}
                  >
                    <Eye className="size-3.5" /> Ver ficha do vendedor
                  </Button>

                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 rounded-xl"
                      onClick={() => openEdit(seller)}
                    >
                      <Pencil className="size-3.5" /> Editar
                    </Button>
                    {!seller.deleted_at ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        disabled={archivingId === seller.id}
                        onClick={() => void archive(seller)}
                        title="Excluir vendedor"
                      >
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
          <p className="mt-0.5 text-xs text-muted-foreground">
            Visão geral de todas as comissões. O histórico completo de cada vendedor também fica
            disponível na ficha individual.
          </p>
        </div>
        {commissions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhuma comissão de vendedor gerada até o momento.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {commissions.slice(0, 150).map((item) => {
              const status = commissionStatus(item.status);
              return (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-2xl border border-border bg-background/65 p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center sm:p-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{item.seller_name_snapshot}</p>
                      <Badge variant="secondary" className={status.className}>
                        {status.label}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.appointment?.patient_name ?? "Cliente"}
                      {item.appointment?.scheduled_date
                        ? ` · ${formatDate(item.appointment.scheduled_date)}`
                        : ""}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Venda
                      </p>
                      <p className="mt-0.5 font-semibold">
                        {formatPrice(Number(item.base_amount ?? 0))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Percentual
                      </p>
                      <p className="mt-0.5 font-semibold">{formatPercentage(item.percentage)}</p>
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Comissão
                    </p>
                    <p className="mt-0.5 text-base font-semibold text-primary">
                      {formatPrice(Number(item.commission_amount ?? 0))}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {commissions.length > 150 ? (
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Exibindo as 150 comissões mais recentes nesta visão geral. O histórico completo continua
            disponível nas fichas individuais dos vendedores.
          </p>
        ) : null}
      </div>

      <Dialog
        open={Boolean(selectedSeller)}
        onOpenChange={(open) => {
          if (!open) setProfileSellerId("");
        }}
      >
        <DialogContent className="max-h-[92vh] w-[calc(100%-1rem)] overflow-y-auto rounded-3xl sm:max-w-4xl">
          {selectedSeller ? (
            <>
              <DialogHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-sm font-bold text-primary">
                      {sellerInitials(selectedSeller.name ?? "Vendedor")}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Ficha do vendedor
                      </p>
                      <DialogTitle className="mt-1 truncate text-xl">
                        {selectedSeller.name}
                      </DialogTitle>
                      <DialogDescription className="mt-1">
                        Histórico individual de vendas e comissões registradas para este vendedor.
                      </DialogDescription>
                    </div>
                  </div>
                  <Badge
                    variant={
                      selectedSeller.is_active && !selectedSeller.deleted_at
                        ? "default"
                        : "secondary"
                    }
                    className={
                      selectedSeller.is_active && !selectedSeller.deleted_at
                        ? "w-fit bg-emerald-600 text-white hover:bg-emerald-600"
                        : "w-fit"
                    }
                  >
                    {selectedSeller.is_active && !selectedSeller.deleted_at
                      ? "Ativo"
                      : selectedSeller.deleted_at
                        ? "Excluído"
                        : "Inativo"}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="grid gap-3 md:grid-cols-3">
                <ProfileInfo
                  icon={Phone}
                  label="Telefone"
                  value={selectedSeller.phone || "Não informado"}
                />
                <ProfileInfo
                  icon={Mail}
                  label="E-mail"
                  value={selectedSeller.email || "Não informado"}
                />
                <ProfileInfo
                  icon={BadgePercent}
                  label="Comissão padrão"
                  value={formatPercentage(selectedSeller.commission_percentage)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <ProfileMetric
                  label="Vendas"
                  value={String(selectedSellerMetrics.salesCount)}
                  hint="não canceladas"
                />
                <ProfileMetric
                  label="Total vendido"
                  value={formatPrice(selectedSellerMetrics.totalSales)}
                  hint="volume atribuído"
                />
                <ProfileMetric
                  label="Comissão gerada"
                  value={formatPrice(selectedSellerMetrics.generatedCommission)}
                  hint="histórico válido"
                />
                <ProfileMetric
                  label="A pagar"
                  value={formatPrice(selectedSellerMetrics.payableCommission)}
                  hint="recebidas"
                />
                <ProfileMetric
                  label="Aguardando"
                  value={formatPrice(selectedSellerMetrics.waitingCommission)}
                  hint="entrada financeira"
                />
              </div>

              <div className="rounded-2xl border border-border">
                <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <ReceiptText className="size-4 text-primary" />
                      <h3 className="text-sm font-semibold">Histórico de vendas</h3>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cada venda permanece vinculada ao vendedor com o percentual registrado no
                      momento da indicação.
                    </p>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {selectedSellerHistory.length} registro(s)
                  </p>
                </div>

                {selectedSellerHistory.length === 0 ? (
                  <div className="p-8 text-center">
                    <ReceiptText className="mx-auto size-5 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">Nenhuma venda registrada ainda.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Quando este vendedor for associado a um agendamento e a comissão for gerada,
                      a venda aparecerá aqui.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {selectedSellerHistory.map((item) => {
                      const status = commissionStatus(item.status);
                      return (
                        <div
                          key={item.id}
                          className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] sm:items-center"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold">
                                {item.appointment?.patient_name ?? "Cliente"}
                              </p>
                              <Badge variant="secondary" className={status.className}>
                                {status.label}
                              </Badge>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <CalendarDays className="size-3.5" />
                              <span>
                                {item.appointment?.scheduled_date
                                  ? formatDate(item.appointment.scheduled_date)
                                  : "Data não informada"}
                              </span>
                            </div>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                              Valor da venda
                            </p>
                            <p className="mt-1 text-sm font-semibold">
                              {formatPrice(Number(item.base_amount ?? 0))}
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                              Percentual
                            </p>
                            <p className="mt-1 text-sm font-semibold">
                              {formatPercentage(item.percentage)}
                            </p>
                          </div>
                          <div className="sm:text-right">
                            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                              Comissão
                            </p>
                            <p className="mt-1 text-base font-semibold text-primary">
                              {formatPrice(Number(item.commission_amount ?? 0))}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => openEdit(selectedSeller)}
                  className="rounded-xl"
                >
                  <Pencil className="size-4" /> Editar vendedor
                </Button>
                <Button
                  onClick={() => setProfileSellerId("")}
                  className="rounded-xl"
                >
                  Fechar ficha
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!saving) setDialogOpen(open);
        }}
      >
        <DialogContent className="w-[calc(100%-1rem)] rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar vendedor" : "Novo vendedor"}</DialogTitle>
            <DialogDescription>
              Defina os dados e a porcentagem padrão usada quando este vendedor for selecionado em
              um agendamento.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="seller-name">Nome *</Label>
              <Input
                id="seller-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                disabled={saving}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="seller-phone">Telefone</Label>
                <Input
                  id="seller-phone"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, phone: event.target.value }))
                  }
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seller-email">E-mail</Label>
                <Input
                  id="seller-email"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  disabled={saving}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seller-percentage">Comissão padrão (%) *</Label>
              <Input
                id="seller-percentage"
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                value={form.commissionPercentage}
                onChange={(event) =>
                  setForm((current) => ({ ...current, commissionPercentage: event.target.value }))
                }
                disabled={saving}
              />
              <p className="text-[11px] text-muted-foreground">
                Exemplo: 2 significa 2% do valor efetivamente vendido, após desconto e antes das
                taxas do cartão.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border p-3">
              <div>
                <p className="text-sm font-medium">Vendedor ativo</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Apenas vendedores ativos aparecem no agendamento.
                </p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, isActive: checked }))
                }
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Salvando..." : "Salvar vendedor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function SummaryCard({ icon: Icon, label, value, hint }: any) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2 text-primary">
        <Icon className="size-4" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="mt-3 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function ProfileInfo({ icon: Icon, label, value }: any) {
  return (
    <div className="rounded-2xl border border-border bg-background/65 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5" />
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em]">{label}</p>
      </div>
      <p className="mt-2 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function ProfileMetric({ label, value, hint }: any) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}
