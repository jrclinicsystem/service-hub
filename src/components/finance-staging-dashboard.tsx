import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  Landmark,
  ReceiptText,
  Settings2,
  TrendingDown,
  TrendingUp,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const normalized = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return normalized.toLocaleDateString("pt-BR");
}

function statusLabel(status: string) {
  if (status === "received") return "Recebido";
  if (status === "paid") return "Pago";
  if (status === "overdue") return "Atrasado";
  if (status === "cancelled") return "Cancelado";
  if (status === "refunded") return "Estornado";
  return "Pendente";
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "paid" || status === "received") return "default";
  if (status === "overdue") return "destructive";
  if (status === "cancelled" || status === "refunded") return "outline";
  return "secondary";
}

async function loadFinanceAccess() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada.");

  const result = await db
    .from("financial_access")
    .select("role,professional_id")
    .eq("user_id", userData.user.id)
    .eq("is_active", true);
  if (result.error) throw result.error;

  const roles = (result.data ?? []).map((item: any) => item.role as string);
  return {
    user: userData.user,
    roles,
    canViewFullFinance: roles.includes("admin") || roles.includes("finance"),
    canOperateCash: roles.some((role: string) => ["admin", "finance", "reception"].includes(role)),
  };
}

async function loadFinanceOverview() {
  const [dashboard, cash, entries, expenses, payables, receivables, commissions, methods, centers] = await Promise.all([
    db.rpc("get_financial_dashboard", { _from: monthStartIso(), _to: todayIso() }),
    db.from("cash_sessions").select("*").order("business_date", { ascending: false }).order("opened_at", { ascending: false }).limit(8),
    db.from("financial_entries").select("id,patient_name_snapshot,professional_name_snapshot,service_name_snapshot,occurred_at,original_amount,discount_amount,charged_amount,card_fee_amount,net_amount,status,payment_method_id").order("occurred_at", { ascending: false }).limit(30),
    db.from("financial_expenses").select("id,expense_date,description,amount,paid,category_id,cost_center_id").order("expense_date", { ascending: false }).limit(30),
    db.from("accounts_payable_with_status").select("id,title,supplier,amount,due_date,status,display_status").order("due_date", { ascending: true }).limit(30),
    db.from("accounts_receivable_with_status").select("id,client_name_snapshot,service_name_snapshot,original_amount,amount_received,due_date,status,display_status").order("due_date", { ascending: true }).limit(30),
    db.from("professional_commissions").select("id,professional_id,commission_type,commission_amount,clinic_amount,status,paid_at,financial_entry_id,is_manual_override").order("created_at", { ascending: false }).limit(30),
    db.from("payment_methods").select("id,code,name,is_card,is_cash,is_active,sort_order").eq("is_active", true).order("sort_order"),
    db.from("cost_centers").select("id,code,name,is_active").eq("is_active", true).order("name"),
  ]);

  for (const result of [dashboard, cash, entries, expenses, payables, receivables, commissions, methods, centers]) {
    if (result.error) throw result.error;
  }

  return {
    dashboard: dashboard.data ?? [],
    cash: cash.data ?? [],
    entries: entries.data ?? [],
    expenses: expenses.data ?? [],
    payables: payables.data ?? [],
    receivables: receivables.data ?? [],
    commissions: commissions.data ?? [],
    methods: methods.data ?? [],
    centers: centers.data ?? [],
  };
}

function MetricCard({ icon: Icon, label, value, helper }: { icon: any; label: string; value: string; helper?: string }) {
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          {helper ? <p className="mt-1 text-[11px] text-muted-foreground">{helper}</p> : null}
        </div>
        <span className="grid size-10 place-items-center rounded-2xl bg-primary-soft text-primary"><Icon className="size-4.5" /></span>
      </div>
    </article>
  );
}

export function FinanceStagingDashboard() {
  const queryClient = useQueryClient();
  const access = useQuery({ queryKey: ["finance-access"], queryFn: loadFinanceAccess, retry: 1 });
  const overview = useQuery({ queryKey: ["finance-overview"], queryFn: loadFinanceOverview, enabled: Boolean(access.data?.canViewFullFinance), retry: 1 });
  const [openingCash, setOpeningCash] = useState("200,00");
  const [opening, setOpening] = useState(false);

  const metricMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of overview.data?.dashboard ?? []) map.set(row.metric, Number(row.value ?? 0));
    return map;
  }, [overview.data?.dashboard]);

  const methodMap = useMemo(() => new Map((overview.data?.methods ?? []).map((m: any) => [m.id, m.name])), [overview.data?.methods]);
  const todayCash = (overview.data?.cash ?? []).find((item: any) => item.business_date === todayIso());

  const openCash = async () => {
    const value = Number(openingCash.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Informe um fundo de caixa válido.");
      return;
    }
    setOpening(true);
    try {
      const result = await db.rpc("open_cash_session", { _opening_cash: value, _business_date: todayIso() });
      if (result.error) throw result.error;
      toast.success("Caixa aberto com sucesso.");
      await queryClient.invalidateQueries({ queryKey: ["finance-overview"] });
    } catch (error: any) {
      toast.error("Não foi possível abrir o caixa.", { description: error?.message || "Erro inesperado." });
    } finally {
      setOpening(false);
    }
  };

  if (access.isLoading) {
    return <div className="grid min-h-[60vh] place-items-center"><div className="size-8 animate-pulse rounded-full bg-primary-soft" /></div>;
  }

  if (access.error || !access.data?.roles.length) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-100 text-amber-800"><AlertTriangle className="size-5" /></span>
        <h1 className="mt-5 text-2xl font-semibold">Acesso financeiro ainda não configurado</h1>
        <p className="mt-2 text-sm text-muted-foreground">Este é o ambiente de testes. Cadastre seu usuário em financial_access como administrador ou financeiro para começar a validar o módulo.</p>
      </div>
    );
  }

  if (!access.data.canViewFullFinance) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary"><CircleDollarSign className="size-5" /></span>
        <h1 className="mt-5 text-2xl font-semibold">Acesso financeiro restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">Seu perfil pode operar funções específicas, mas o dashboard completo é exclusivo de Administrador e Financeiro.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-amber-500 text-white hover:bg-amber-500">AMBIENTE DE TESTE</Badge>
            <Badge variant="outline">Financeiro</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Painel financeiro</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Base isolada para validar caixa, entradas, despesas, contas e comissões antes de qualquer implantação na clínica.</p>
        </div>
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          Nenhum dado desta tela deve ser tratado como produção.
        </div>
      </header>

      {overview.isLoading ? (
        <div className="mt-8 grid min-h-80 place-items-center rounded-3xl border border-border bg-card"><div className="size-8 animate-pulse rounded-full bg-primary-soft" /></div>
      ) : overview.error ? (
        <div className="mt-8 rounded-3xl border border-destructive/20 bg-card p-6 text-sm text-destructive">Não foi possível carregar o financeiro: {(overview.error as any)?.message}</div>
      ) : (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={TrendingUp} label="Faturamento do mês" value={formatMoney(metricMap.get("revenue"))} />
            <MetricCard icon={TrendingDown} label="Despesas do mês" value={formatMoney(metricMap.get("expenses"))} />
            <MetricCard icon={UsersRound} label="Comissões" value={formatMoney(metricMap.get("commissions"))} />
            <MetricCard icon={Landmark} label="Resultado da clínica" value={formatMoney(metricMap.get("clinic_result"))} helper="Líquido após taxas, comissões e despesas" />
          </section>

          <Tabs defaultValue="overview" className="mt-8">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl bg-muted/60 p-1.5">
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="cash">Caixa</TabsTrigger>
              <TabsTrigger value="entries">Entradas</TabsTrigger>
              <TabsTrigger value="expenses">Despesas</TabsTrigger>
              <TabsTrigger value="accounts">Contas</TabsTrigger>
              <TabsTrigger value="commissions">Comissões</TabsTrigger>
              <TabsTrigger value="settings">Configurações</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-5 space-y-5">
              <div className="grid gap-4 lg:grid-cols-3">
                <MetricCard icon={CalendarClock} label="Contas a pagar pendentes" value={formatMoney(metricMap.get("payable_pending"))} />
                <MetricCard icon={AlertTriangle} label="Contas atrasadas" value={formatMoney(metricMap.get("payable_overdue"))} />
                <MetricCard icon={WalletCards} label="A receber" value={formatMoney(metricMap.get("receivable_pending"))} />
              </div>
              <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
                <h2 className="font-semibold">Últimas entradas</h2>
                <div className="mt-4 space-y-3">
                  {(overview.data?.entries ?? []).slice(0, 6).map((entry: any) => (
                    <div key={entry.id} className="flex flex-col gap-2 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="text-sm font-semibold">{entry.patient_name_snapshot || "Atendimento"}</p><p className="text-xs text-muted-foreground">{entry.service_name_snapshot || "Serviço"} · {entry.professional_name_snapshot || "Profissional"}</p></div>
                      <div className="text-left sm:text-right"><p className="text-sm font-semibold">{formatMoney(entry.charged_amount)}</p><p className="text-xs text-muted-foreground">{formatDate(entry.occurred_at)}</p></div>
                    </div>
                  ))}
                  {!overview.data?.entries?.length ? <p className="text-sm text-muted-foreground">Nenhuma entrada registrada no staging ainda.</p> : null}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="cash" className="mt-5">
              <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div><h2 className="text-lg font-semibold">Caixa diário</h2><p className="mt-1 text-xs text-muted-foreground">Abertura obrigatória, movimentações do dia e fechamento com conferência física.</p></div>
                  {todayCash ? <Badge variant={todayCash.status === "open" ? "default" : "secondary"}>{todayCash.status === "open" ? "Caixa aberto" : "Caixa fechado"}</Badge> : <Badge variant="outline">Ainda não aberto</Badge>}
                </div>
                {todayCash ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard icon={Banknote} label="Fundo inicial" value={formatMoney(todayCash.opening_cash)} />
                    <MetricCard icon={TrendingUp} label="Dinheiro recebido" value={formatMoney(todayCash.total_cash)} />
                    <MetricCard icon={ReceiptText} label="Saídas em dinheiro" value={formatMoney(todayCash.total_cash_expenses)} />
                    <MetricCard icon={CircleDollarSign} label="Esperado em espécie" value={formatMoney(todayCash.expected_cash ?? todayCash.opening_cash)} />
                  </div>
                ) : (
                  <div className="mt-5 max-w-sm rounded-2xl border border-dashed border-border p-4">
                    <Label htmlFor="opening-cash">Fundo de caixa inicial</Label>
                    <Input id="opening-cash" className="mt-2" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} placeholder="200,00" />
                    <Button className="mt-3 w-full" disabled={opening || !access.data.canOperateCash} onClick={openCash}>{opening ? "Abrindo..." : "Abrir caixa de hoje"}</Button>
                  </div>
                )}
                <div className="mt-6 space-y-2">
                  {(overview.data?.cash ?? []).map((session: any) => (
                    <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3 text-sm">
                      <span className="font-medium">{formatDate(session.business_date)}</span>
                      <span className="text-muted-foreground">Inicial {formatMoney(session.opening_cash)}</span>
                      <Badge variant={session.status === "open" ? "default" : "secondary"}>{session.status === "open" ? "Aberto" : "Fechado"}</Badge>
                    </div>
                  ))}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="entries" className="mt-5">
              <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
                <h2 className="text-lg font-semibold">Entradas</h2>
                <p className="mt-1 text-xs text-muted-foreground">Atendimentos finalizados entram aqui. Agendamento e confirmação não geram faturamento.</p>
                <div className="mt-5 space-y-3">
                  {(overview.data?.entries ?? []).map((entry: any) => (
                    <div key={entry.id} className="grid gap-3 rounded-2xl border border-border p-4 lg:grid-cols-[1.6fr_1fr_1fr_auto] lg:items-center">
                      <div><p className="text-sm font-semibold">{entry.patient_name_snapshot || "Atendimento"}</p><p className="text-xs text-muted-foreground">{entry.service_name_snapshot || "Serviço"} · {entry.professional_name_snapshot || "Profissional"}</p></div>
                      <div className="text-xs text-muted-foreground">{methodMap.get(entry.payment_method_id) || "Pagamento"}<br />{formatDate(entry.occurred_at)}</div>
                      <div className="text-xs"><span className="text-muted-foreground">Bruto:</span> {formatMoney(entry.charged_amount)}<br /><span className="text-muted-foreground">Líquido:</span> {formatMoney(entry.net_amount)}</div>
                      <Badge variant={statusVariant(entry.status)}>{statusLabel(entry.status)}</Badge>
                    </div>
                  ))}
                  {!overview.data?.entries?.length ? <p className="text-sm text-muted-foreground">Nenhuma entrada registrada.</p> : null}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="expenses" className="mt-5">
              <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
                <h2 className="text-lg font-semibold">Saídas e despesas</h2>
                <p className="mt-1 text-xs text-muted-foreground">Base pronta para categoria, centro de custo, data, valor e forma de pagamento.</p>
                <div className="mt-5 space-y-3">
                  {(overview.data?.expenses ?? []).map((expense: any) => (
                    <div key={expense.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
                      <div><p className="text-sm font-semibold">{expense.description}</p><p className="text-xs text-muted-foreground">{formatDate(expense.expense_date)}</p></div>
                      <p className="text-sm font-semibold">{formatMoney(expense.amount)}</p>
                    </div>
                  ))}
                  {!overview.data?.expenses?.length ? <p className="text-sm text-muted-foreground">Nenhuma despesa lançada no staging ainda.</p> : null}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="accounts" className="mt-5 grid gap-5 xl:grid-cols-2">
              <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
                <h2 className="text-lg font-semibold">Contas a pagar</h2>
                <div className="mt-4 space-y-3">
                  {(overview.data?.payables ?? []).map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border p-4"><div><p className="text-sm font-semibold">{item.title}</p><p className="text-xs text-muted-foreground">Vence {formatDate(item.due_date)}</p></div><div className="text-right"><p className="text-sm font-semibold">{formatMoney(item.amount)}</p><Badge className="mt-1" variant={statusVariant(item.display_status)}>{statusLabel(item.display_status)}</Badge></div></div>
                  ))}
                  {!overview.data?.payables?.length ? <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada.</p> : null}
                </div>
              </section>
              <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
                <h2 className="text-lg font-semibold">Contas a receber / fiado</h2>
                <div className="mt-4 space-y-3">
                  {(overview.data?.receivables ?? []).map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border p-4"><div><p className="text-sm font-semibold">{item.client_name_snapshot}</p><p className="text-xs text-muted-foreground">{item.service_name_snapshot || "Valor a receber"} · vence {formatDate(item.due_date)}</p></div><div className="text-right"><p className="text-sm font-semibold">{formatMoney(Number(item.original_amount) - Number(item.amount_received))}</p><Badge className="mt-1" variant={statusVariant(item.display_status)}>{statusLabel(item.display_status)}</Badge></div></div>
                  ))}
                  {!overview.data?.receivables?.length ? <p className="text-sm text-muted-foreground">Nenhum valor pendente.</p> : null}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="commissions" className="mt-5">
              <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
                <h2 className="text-lg font-semibold">Comissões</h2>
                <p className="mt-1 text-xs text-muted-foreground">Suporta percentual, valor fixo por paciente e ajuste manual auditável.</p>
                <div className="mt-5 space-y-3">
                  {(overview.data?.commissions ?? []).map((commission: any) => (
                    <div key={commission.id} className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <div><p className="text-sm font-semibold">Profissional {String(commission.professional_id).slice(0, 8)}</p><p className="text-xs text-muted-foreground">{commission.commission_type === "percentage" ? "Percentual" : commission.commission_type === "fixed_per_patient" ? "Valor por paciente" : "Manual"}{commission.is_manual_override ? " · ajuste manual" : ""}</p></div>
                      <div className="text-right"><p className="text-xs text-muted-foreground">Profissional</p><p className="font-semibold">{formatMoney(commission.commission_amount)}</p></div>
                      <div className="text-right"><p className="text-xs text-muted-foreground">Clínica</p><p className="font-semibold">{formatMoney(commission.clinic_amount)}</p><Badge className="mt-1" variant={statusVariant(commission.status)}>{statusLabel(commission.status)}</Badge></div>
                    </div>
                  ))}
                  {!overview.data?.commissions?.length ? <p className="text-sm text-muted-foreground">Nenhuma comissão gerada ainda.</p> : null}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="settings" className="mt-5 grid gap-5 xl:grid-cols-2">
              <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
                <div className="flex items-center gap-2"><CreditCard className="size-4 text-primary" /><h2 className="font-semibold">Formas de pagamento</h2></div>
                <div className="mt-4 space-y-2">{(overview.data?.methods ?? []).map((method: any) => <div key={method.id} className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm"><span>{method.name}</span><span className="text-xs text-muted-foreground">{method.is_card ? "Aceita taxa" : method.is_cash ? "Espécie" : "Digital"}</span></div>)}</div>
              </section>
              <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
                <div className="flex items-center gap-2"><Settings2 className="size-4 text-primary" /><h2 className="font-semibold">Centros de custo</h2></div>
                <div className="mt-4 space-y-2">{(overview.data?.centers ?? []).map((center: any) => <div key={center.id} className="rounded-2xl border border-border px-4 py-3 text-sm">{center.name}</div>)}</div>
              </section>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
