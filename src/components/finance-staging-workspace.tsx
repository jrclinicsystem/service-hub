import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  FileSpreadsheet,
  Landmark,
  Printer,
  ReceiptText,
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
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function fortalezaIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function monthStartIso() {
  return `${fortalezaIso().slice(0, 7)}-01`;
}

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function parseMoney(value: string) {
  if (!value.trim()) return Number.NaN;
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return date.toLocaleDateString("pt-BR", {
    timeZone: value.includes("T") ? "America/Fortaleza" : undefined,
  });
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    received: "Recebido",
    paid: "Pago",
    pending: "Pendente",
    overdue: "Atrasado",
    cancelled: "Cancelado",
    refunded: "Estornado",
    open: "Aberto",
    closed: "Fechado",
  };
  return labels[status] ?? status;
}

function commissionTypeLabel(type: string) {
  const labels: Record<string, string> = {
    percentage: "Percentual",
    fixed_per_patient: "Valor por paciente",
    manual: "Manual",
  };
  return labels[type] ?? type;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (["paid", "received", "closed"].includes(status)) return "default";
  if (status === "overdue") return "destructive";
  if (["cancelled", "refunded"].includes(status)) return "outline";
  return "secondary";
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: any;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          {helper ? <p className="mt-1 text-[11px] text-muted-foreground">{helper}</p> : null}
        </div>
        <span className="grid size-10 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Icon className="size-4.5" />
        </span>
      </div>
    </article>
  );
}

async function loadFinanceAccess() {
  const { data: authData, error } = await supabase.auth.getUser();
  if (error || !authData.user) throw new Error("Sessão expirada.");

  const result = await db
    .from("financial_access")
    .select("role,professional_id")
    .eq("user_id", authData.user.id)
    .eq("is_active", true);
  if (result.error) throw result.error;

  const rows = result.data ?? [];
  const roles = rows.map((row: any) => String(row.role));
  return {
    user: authData.user,
    roles,
    professionalId: rows.find((row: any) => row.role === "professional")?.professional_id ?? null,
    full: roles.includes("admin") || roles.includes("finance"),
    reception: roles.includes("reception"),
  };
}

async function loadFullOverview(from: string, to: string) {
  const results = await Promise.all([
    db.rpc("get_financial_dashboard", { _from: from, _to: to }),
    db.from("cash_sessions").select("*").order("business_date", { ascending: false }).limit(30),
    db
      .from("financial_report_entries")
      .select("*")
      .gte("business_date", from)
      .lte("business_date", to)
      .order("occurred_at", { ascending: false })
      .limit(500),
    db
      .from("financial_report_expenses")
      .select("*")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date", { ascending: false })
      .limit(500),
    db.from("accounts_payable_with_status").select("*").order("due_date", { ascending: true }).limit(200),
    db
      .from("accounts_receivable_with_status")
      .select("*")
      .order("due_date", { ascending: true })
      .limit(200),
    db.from("professional_commissions").select("*").order("created_at", { ascending: false }).limit(300),
    db.from("professional_settlements").select("*").order("period_end", { ascending: false }).limit(100),
    db.from("payment_methods").select("*").eq("is_active", true).order("sort_order"),
    db.from("payment_method_fees").select("*").order("effective_from", { ascending: false }).limit(100),
    db.from("cost_centers").select("*").eq("is_active", true).order("name"),
    db.from("expense_categories").select("*").eq("is_active", true).order("name"),
    db.from("professional_commission_rules").select("*").order("effective_from", { ascending: false }).limit(100),
    db
      .from("professionals")
      .select("id,name")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name"),
  ]);

  for (const result of results) if (result.error) throw result.error;

  const [
    dashboard,
    cash,
    entries,
    expenses,
    payables,
    receivables,
    commissions,
    settlements,
    methods,
    fees,
    centers,
    categories,
    rules,
    professionals,
  ] = results;

  return {
    dashboard: dashboard.data ?? [],
    cash: cash.data ?? [],
    entries: entries.data ?? [],
    expenses: expenses.data ?? [],
    payables: payables.data ?? [],
    receivables: receivables.data ?? [],
    commissions: commissions.data ?? [],
    settlements: settlements.data ?? [],
    methods: methods.data ?? [],
    fees: fees.data ?? [],
    centers: centers.data ?? [],
    categories: categories.data ?? [],
    rules: rules.data ?? [],
    professionals: professionals.data ?? [],
  };
}

async function loadReceptionOverview() {
  const results = await Promise.all([
    db.from("cash_sessions").select("*").order("business_date", { ascending: false }).limit(15),
    db
      .from("accounts_receivable_with_status")
      .select("*")
      .order("due_date", { ascending: true })
      .limit(100),
    db
      .from("payment_methods")
      .select("id,code,name,is_cash")
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  for (const result of results) if (result.error) throw result.error;
  return {
    cash: results[0].data ?? [],
    receivables: results[1].data ?? [],
    methods: results[2].data ?? [],
  };
}

async function loadProfessionalOverview() {
  const results = await Promise.all([
    db
      .from("financial_entries")
      .select(
        "id,patient_name_snapshot,service_name_snapshot,occurred_at,charged_amount,net_amount,status,professional_id",
      )
      .order("occurred_at", { ascending: false })
      .limit(100),
    db
      .from("professional_commissions")
      .select(
        "id,financial_entry_id,commission_type,commission_amount,clinic_amount,status,paid_at,professional_id",
      )
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  for (const result of results) if (result.error) throw result.error;
  return {
    entries: results[0].data ?? [],
    commissions: results[1].data ?? [],
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function excelExport(entries: any[], expenses: any[], from: string, to: string) {
  const entryRows = entries
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.business_date)}</td><td>${escapeHtml(row.patient_name_snapshot)}</td><td>${escapeHtml(row.professional_name_snapshot)}</td><td>${escapeHtml(row.service_name_snapshot)}</td><td>${escapeHtml(row.payment_method_name)}</td><td>${escapeHtml(row.charged_amount)}</td><td>${escapeHtml(row.card_fee_amount)}</td><td>${escapeHtml(row.net_amount)}</td><td>${escapeHtml(row.commission_amount)}</td><td>${escapeHtml(row.clinic_amount)}</td><td>${escapeHtml(row.status)}</td></tr>`,
    )
    .join("");
  const expenseRows = expenses
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.expense_date)}</td><td>${escapeHtml(row.description)}</td><td>${escapeHtml(row.category_name)}</td><td>${escapeHtml(row.cost_center_name)}</td><td>${escapeHtml(row.payment_method_name)}</td><td>${escapeHtml(row.amount)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><meta charset="utf-8"><body><h2>JR Clinic - Relatório Financeiro ${from} a ${to}</h2><h3>Entradas</h3><table border="1"><tr><th>Data</th><th>Cliente</th><th>Profissional</th><th>Serviço</th><th>Pagamento</th><th>Bruto</th><th>Taxa</th><th>Líquido</th><th>Comissão</th><th>Clínica</th><th>Status</th></tr>${entryRows}</table><br><h3>Despesas</h3><table border="1"><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Centro</th><th>Pagamento</th><th>Valor</th></tr>${expenseRows}</table></body></html>`;
  const blob = new Blob(["\ufeff", html], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `jr-clinic-financeiro-${from}-${to}.xls`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function printReport(entries: any[], expenses: any[], from: string, to: string) {
  const popup = window.open("", "_blank", "width=1100,height=800");
  if (!popup) {
    toast.error("O navegador bloqueou a janela de impressão.");
    return;
  }

  const entryRows = entries
    .map(
      (row) =>
        `<tr><td>${formatDate(row.business_date)}</td><td>${escapeHtml(row.patient_name_snapshot)}</td><td>${escapeHtml(row.professional_name_snapshot)}</td><td>${escapeHtml(row.service_name_snapshot)}</td><td>${money(row.charged_amount)}</td><td>${money(row.net_amount)}</td></tr>`,
    )
    .join("");
  const expenseRows = expenses
    .map(
      (row) =>
        `<tr><td>${formatDate(row.expense_date)}</td><td>${escapeHtml(row.description)}</td><td>${money(row.amount)}</td></tr>`,
    )
    .join("");

  popup.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Relatório Financeiro JR Clinic</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#222}h1{margin-bottom:4px}p{color:#666}table{width:100%;border-collapse:collapse;margin:18px 0 28px}th,td{border:1px solid #ddd;padding:8px;font-size:12px;text-align:left}th{background:#f5f5f5}@media print{button{display:none}}</style></head><body><h1>JR Clinic — Relatório Financeiro</h1><p>Período: ${formatDate(from)} a ${formatDate(to)}</p><h2>Entradas</h2><table><tr><th>Data</th><th>Cliente</th><th>Profissional</th><th>Serviço</th><th>Bruto</th><th>Líquido</th></tr>${entryRows}</table><h2>Despesas</h2><table><tr><th>Data</th><th>Descrição</th><th>Valor</th></tr>${expenseRows}</table><button onclick="window.print()">Imprimir / Salvar PDF</button></body></html>`,
  );
  popup.document.close();
  popup.focus();
}

export function FinanceStagingWorkspace() {
  const queryClient = useQueryClient();
  const access = useQuery({
    queryKey: ["finance-access-v2"],
    queryFn: loadFinanceAccess,
    retry: 1,
  });
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(fortalezaIso());

  const full = useQuery({
    queryKey: ["finance-full-v2", from, to],
    queryFn: () => loadFullOverview(from, to),
    enabled: Boolean(access.data?.full),
    retry: 1,
  });
  const reception = useQuery({
    queryKey: ["finance-reception-v2"],
    queryFn: loadReceptionOverview,
    enabled: Boolean(access.data?.reception && !access.data?.full),
    retry: 1,
  });
  const professional = useQuery({
    queryKey: ["finance-professional-v2"],
    queryFn: loadProfessionalOverview,
    enabled: Boolean(
      access.data?.roles.includes("professional") && !access.data?.full && !access.data?.reception,
    ),
    retry: 1,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance-full-v2"] }),
      queryClient.invalidateQueries({ queryKey: ["finance-reception-v2"] }),
      queryClient.invalidateQueries({ queryKey: ["finance-professional-v2"] }),
    ]);
  };

  if (access.isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="size-8 animate-pulse rounded-full bg-primary-soft" />
      </div>
    );
  }
  if (access.error || !access.data?.roles.length) return <EmptyAccess />;
  if (access.data.full) {
    return (
      <FullFinanceWorkspace
        access={access.data}
        data={full.data}
        loading={full.isLoading}
        error={full.error}
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        refresh={refresh}
      />
    );
  }
  if (access.data.reception) {
    return (
      <ReceptionWorkspace
        data={reception.data}
        loading={reception.isLoading}
        error={reception.error}
        refresh={refresh}
      />
    );
  }
  return (
    <ProfessionalWorkspace
      data={professional.data}
      loading={professional.isLoading}
      error={professional.error}
    />
  );
}

function EmptyAccess() {
  return (
    <div className="mx-auto max-w-xl px-5 py-16 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-100 text-amber-800">
        <AlertTriangle className="size-5" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold">Acesso financeiro não configurado</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        O usuário precisa de um perfil financeiro no ambiente de staging.
      </p>
    </div>
  );
}

function FullFinanceWorkspace({
  access,
  data,
  loading,
  error,
  from,
  to,
  setFrom,
  setTo,
  refresh,
}: any) {
  const [busy, setBusy] = useState("");
  const [openingCash, setOpeningCash] = useState("200,00");
  const [countedCash, setCountedCash] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [professionalFilter, setProfessionalFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expense, setExpense] = useState({
    date: fortalezaIso(),
    description: "",
    amount: "",
    method: "pix",
    category: "",
    center: "",
  });
  const [payable, setPayable] = useState({
    title: "",
    supplier: "",
    amount: "",
    due: fortalezaIso(),
    recurrence: "none",
    category: "",
    center: "",
  });
  const [payMethod, setPayMethod] = useState("pix");
  const [receiveMethod, setReceiveMethod] = useState("pix");
  const [settlement, setSettlement] = useState({
    professional: "",
    start: monthStartIso(),
    end: fortalezaIso(),
  });
  const [override, setOverride] = useState({ commission: "", amount: "", reason: "" });
  const [fee, setFee] = useState({
    method: "credit",
    percent: "",
    fixed: "0",
    min: "1",
    max: "1",
    effective: fortalezaIso(),
  });
  const [rule, setRule] = useState({
    professional: "",
    type: "percentage",
    value: "",
    base: "net_after_fees",
    effective: fortalezaIso(),
  });

  const metricMap = useMemo(
    () => new Map((data?.dashboard ?? []).map((row: any) => [row.metric, Number(row.value ?? 0)])),
    [data?.dashboard],
  );
  const methods = useMemo(() => data?.methods ?? [], [data?.methods]);
  const methodMap = useMemo(
    () => new Map<string, string>(methods.map((row: any) => [row.id, row.name])),
    [methods],
  );
  const todayCash = (data?.cash ?? []).find((row: any) => row.business_date === fortalezaIso());

  const professionals = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of data?.professionals ?? []) {
      if (row.id) map.set(row.id, row.name || `Profissional ${String(row.id).slice(0, 8)}`);
    }
    for (const row of data?.entries ?? []) {
      if (row.professional_id && !map.has(row.professional_id)) {
        map.set(
          row.professional_id,
          row.professional_name_snapshot || `Profissional ${String(row.professional_id).slice(0, 8)}`,
        );
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [data?.professionals, data?.entries]);

  const professionalMap = useMemo(
    () => new Map<string, string>(professionals.map((row) => [row.id, row.name])),
    [professionals],
  );

  const services = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of data?.entries ?? []) {
      if (row.service_id) map.set(row.service_id, row.service_name_snapshot || "Serviço");
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [data?.entries]);

  const filteredEntries = useMemo(
    () =>
      (data?.entries ?? []).filter(
        (row: any) =>
          (professionalFilter === "all" || row.professional_id === professionalFilter) &&
          (serviceFilter === "all" || row.service_id === serviceFilter) &&
          (methodFilter === "all" || row.payment_method_id === methodFilter) &&
          (statusFilter === "all" || row.status === statusFilter),
      ),
    [data?.entries, professionalFilter, serviceFilter, methodFilter, statusFilter],
  );

  const run = async (key: string, fn: () => Promise<void>, success: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      await refresh();
    } catch (err: any) {
      toast.error("Não foi possível concluir a operação.", {
        description: err?.message ?? "Erro inesperado.",
      });
    } finally {
      setBusy("");
    }
  };

  const methodId = (code: string) =>
    methods.find((row: any) => row.code === code)?.id ?? null;

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="size-8 animate-pulse rounded-full bg-primary-soft" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="m-8 rounded-3xl border border-destructive/30 bg-card p-6 text-sm text-destructive">
        Falha ao carregar o financeiro: {(error as any)?.message}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1540px] px-5 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex gap-2">
            <Badge className="bg-amber-500 text-white hover:bg-amber-500">AMBIENTE DE TESTE</Badge>
            <Badge variant="outline">Supabase Staging</Badge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Financeiro JR Clinic</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operações, caixa, comissões, contas e relatórios em ambiente isolado.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label>De</Label>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
        </div>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={TrendingUp} label="Faturamento do dia" value={money(metricMap.get("revenue_today"))} />
        <MetricCard icon={CircleDollarSign} label="Faturamento do período" value={money(metricMap.get("revenue"))} />
        <MetricCard icon={WalletCards} label="Recebido" value={money(metricMap.get("received"))} />
        <MetricCard icon={Landmark} label="Saldo disponível" value={money(metricMap.get("available_balance"))} />
        <MetricCard icon={TrendingDown} label="Despesas" value={money(metricMap.get("expenses"))} />
        <MetricCard icon={UsersRound} label="Comissões" value={money(metricMap.get("commissions"))} />
        <MetricCard icon={CheckCircle2} label="Resultado da clínica" value={money(metricMap.get("clinic_result"))} />
        <MetricCard icon={AlertTriangle} label="Contas atrasadas" value={money(metricMap.get("payable_overdue"))} />
      </section>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl bg-muted/60 p-1.5">
          {[
            ["overview", "Visão geral"],
            ["cash", "Caixa"],
            ["entries", "Entradas"],
            ["expenses", "Despesas"],
            ["accounts", "Contas"],
            ["commissions", "Comissões"],
            ["reports", "Relatórios"],
            ["settings", "Configurações"],
          ].map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard icon={CalendarClock} label="A pagar" value={money(metricMap.get("payable_pending"))} />
            <MetricCard icon={AlertTriangle} label="A pagar atrasado" value={money(metricMap.get("payable_overdue"))} />
            <MetricCard icon={WalletCards} label="A receber" value={money(metricMap.get("receivable_pending"))} />
            <MetricCard icon={AlertTriangle} label="A receber atrasado" value={money(metricMap.get("receivable_overdue"))} />
          </div>
          <Panel title="Últimas entradas">
            <EntryList rows={(data.entries ?? []).slice(0, 8)} />
          </Panel>
        </TabsContent>

        <TabsContent value="cash" className="mt-5 space-y-5">
          <Panel title="Caixa diário" subtitle="Uma única sessão por dia: abertura, movimentações e fechamento.">
            {!todayCash ? (
              <div className="grid max-w-md gap-3">
                <div>
                  <Label>Fundo inicial</Label>
                  <Input
                    value={openingCash}
                    onChange={(event) => setOpeningCash(event.target.value)}
                    placeholder="200,00"
                  />
                </div>
                <Button
                  disabled={busy === "open-cash"}
                  onClick={() =>
                    run(
                      "open-cash",
                      async () => {
                        const value = parseMoney(openingCash);
                        if (!Number.isFinite(value) || value < 0)
                          throw new Error("Fundo inicial inválido.");
                        const result = await db.rpc("open_cash_session", {
                          _opening_cash: value,
                          _business_date: fortalezaIso(),
                        });
                        if (result.error) throw result.error;
                      },
                      "Caixa aberto.",
                    )
                  }
                >
                  Abrir caixa de hoje
                </Button>
              </div>
            ) : todayCash.status === "open" ? (
              <div className="grid gap-4 lg:grid-cols-4">
                <MetricCard icon={Banknote} label="Fundo inicial" value={money(todayCash.opening_cash)} />
                <div>
                  <Label>Dinheiro contado</Label>
                  <Input
                    value={countedCash}
                    onChange={(event) => setCountedCash(event.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label>Observação</Label>
                  <Input
                    value={closingNote}
                    onChange={(event) => setClosingNote(event.target.value)}
                    placeholder="Opcional"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    disabled={busy === "close-cash"}
                    onClick={() =>
                      run(
                        "close-cash",
                        async () => {
                          const value = parseMoney(countedCash);
                          if (!Number.isFinite(value) || value < 0)
                            throw new Error("Valor contado inválido.");
                          const result = await db.rpc("close_cash_session", {
                            _session_id: todayCash.id,
                            _counted_cash: value,
                            _note: closingNote || null,
                          });
                          if (result.error) throw result.error;
                        },
                        "Caixa fechado.",
                      )
                    }
                  >
                    Fechar caixa
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-4">
                <MetricCard icon={Banknote} label="Inicial" value={money(todayCash.opening_cash)} />
                <MetricCard icon={ReceiptText} label="Esperado" value={money(todayCash.expected_cash)} />
                <MetricCard icon={Banknote} label="Contado" value={money(todayCash.counted_cash)} />
                <MetricCard icon={AlertTriangle} label="Diferença" value={money(todayCash.difference_amount)} />
              </div>
            )}
          </Panel>
          <Panel title="Histórico de caixas">
            <div className="space-y-2">
              {(data.cash ?? []).map((row: any) => (
                <div
                  key={row.id}
                  className="grid gap-2 rounded-2xl border border-border p-4 sm:grid-cols-5 sm:items-center"
                >
                  <strong>{formatDate(row.business_date)}</strong>
                  <span>Inicial {money(row.opening_cash)}</span>
                  <span>Esperado {money(row.expected_cash)}</span>
                  <span>Diferença {money(row.difference_amount)}</span>
                  <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                </div>
              ))}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="entries" className="mt-5 space-y-5">
          <Panel title="Filtros">
            <div className="grid gap-3 md:grid-cols-4">
              <select
                className={selectClass}
                value={professionalFilter}
                onChange={(event) => setProfessionalFilter(event.target.value)}
              >
                <option value="all">Todos os profissionais</option>
                {professionals.map((professional: any) => (
                  <option key={professional.id} value={professional.id}>
                    {professional.name}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={serviceFilter}
                onChange={(event) => setServiceFilter(event.target.value)}
              >
                <option value="all">Todos os serviços</option>
                {services.map((service: any) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={methodFilter}
                onChange={(event) => setMethodFilter(event.target.value)}
              >
                <option value="all">Todas as formas</option>
                {methods.map((method: any) => (
                  <option key={method.id} value={method.id}>
                    {method.name}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">Todos os status</option>
                <option value="received">Recebido</option>
                <option value="pending">Pendente</option>
                <option value="refunded">Estornado</option>
              </select>
            </div>
          </Panel>
          <Panel title={`Entradas (${filteredEntries.length})`}>
            <EntryList rows={filteredEntries} />
          </Panel>
        </TabsContent>

        <TabsContent value="expenses" className="mt-5 space-y-5">
          <Panel title="Nova despesa">
            <div className="grid gap-3 md:grid-cols-6">
              <Input
                type="date"
                value={expense.date}
                onChange={(event) => setExpense({ ...expense, date: event.target.value })}
              />
              <Input
                className="md:col-span-2"
                placeholder="Descrição"
                value={expense.description}
                onChange={(event) => setExpense({ ...expense, description: event.target.value })}
              />
              <Input
                placeholder="Valor"
                value={expense.amount}
                onChange={(event) => setExpense({ ...expense, amount: event.target.value })}
              />
              <select
                className={selectClass}
                value={expense.method}
                onChange={(event) => setExpense({ ...expense, method: event.target.value })}
              >
                {methods.map((method: any) => (
                  <option key={method.id} value={method.code}>
                    {method.name}
                  </option>
                ))}
              </select>
              <Button
                disabled={busy === "expense"}
                onClick={() =>
                  run(
                    "expense",
                    async () => {
                      const amount = parseMoney(expense.amount);
                      if (!expense.description.trim() || !Number.isFinite(amount) || amount <= 0)
                        throw new Error("Descrição e valor são obrigatórios.");
                      const result = await db.from("financial_expenses").insert({
                        expense_date: expense.date,
                        description: expense.description.trim(),
                        amount,
                        payment_method_id: methodId(expense.method),
                        category_id: expense.category || null,
                        cost_center_id: expense.center || null,
                        paid: true,
                        paid_at: new Date().toISOString(),
                        created_by: access.user.id,
                      });
                      if (result.error) throw result.error;
                      setExpense({ ...expense, description: "", amount: "" });
                    },
                    "Despesa registrada.",
                  )
                }
              >
                Registrar
              </Button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <select
                className={selectClass}
                value={expense.category}
                onChange={(event) => setExpense({ ...expense, category: event.target.value })}
              >
                <option value="">Sem categoria</option>
                {(data.categories ?? []).map((category: any) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={expense.center}
                onChange={(event) => setExpense({ ...expense, center: event.target.value })}
              >
                <option value="">Sem centro de custo</option>
                {(data.centers ?? []).map((center: any) => (
                  <option key={center.id} value={center.id}>
                    {center.name}
                  </option>
                ))}
              </select>
            </div>
          </Panel>
          <Panel title="Despesas do período">
            <div className="space-y-2">
              {(data.expenses ?? []).map((row: any) => (
                <div
                  key={row.expense_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"
                >
                  <div>
                    <strong className="text-sm">{row.description}</strong>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(row.expense_date)} · {row.category_name || "Sem categoria"} ·{" "}
                      {row.cost_center_name || "Sem centro"}
                    </p>
                  </div>
                  <strong>{money(row.amount)}</strong>
                </div>
              ))}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="accounts" className="mt-5 space-y-5">
          <Panel title="Cadastrar conta a pagar">
            <div className="grid gap-3 md:grid-cols-6">
              <Input
                className="md:col-span-2"
                placeholder="Conta / título"
                value={payable.title}
                onChange={(event) => setPayable({ ...payable, title: event.target.value })}
              />
              <Input
                placeholder="Fornecedor"
                value={payable.supplier}
                onChange={(event) => setPayable({ ...payable, supplier: event.target.value })}
              />
              <Input
                placeholder="Valor"
                value={payable.amount}
                onChange={(event) => setPayable({ ...payable, amount: event.target.value })}
              />
              <Input
                type="date"
                value={payable.due}
                onChange={(event) => setPayable({ ...payable, due: event.target.value })}
              />
              <Button
                disabled={busy === "payable"}
                onClick={() =>
                  run(
                    "payable",
                    async () => {
                      const amount = parseMoney(payable.amount);
                      if (!payable.title.trim() || !Number.isFinite(amount) || amount <= 0)
                        throw new Error("Título e valor são obrigatórios.");
                      const result = await db.from("accounts_payable").insert({
                        title: payable.title.trim(),
                        supplier: payable.supplier.trim() || null,
                        amount,
                        due_date: payable.due,
                        status: "pending",
                        is_fixed: payable.recurrence !== "none",
                        recurrence_type: payable.recurrence,
                        category_id: payable.category || null,
                        cost_center_id: payable.center || null,
                        created_by: access.user.id,
                      });
                      if (result.error) throw result.error;
                      setPayable({ ...payable, title: "", supplier: "", amount: "" });
                    },
                    "Conta cadastrada.",
                  )
                }
              >
                Cadastrar
              </Button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <select
                className={selectClass}
                value={payable.recurrence}
                onChange={(event) => setPayable({ ...payable, recurrence: event.target.value })}
              >
                <option value="none">Conta variável</option>
                <option value="monthly">Fixa mensal</option>
                <option value="weekly">Fixa semanal</option>
                <option value="yearly">Fixa anual</option>
              </select>
              <select
                className={selectClass}
                value={payable.category}
                onChange={(event) => setPayable({ ...payable, category: event.target.value })}
              >
                <option value="">Sem categoria</option>
                {(data.categories ?? []).map((category: any) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={payable.center}
                onChange={(event) => setPayable({ ...payable, center: event.target.value })}
              >
                <option value="">Sem centro</option>
                {(data.centers ?? []).map((center: any) => (
                  <option key={center.id} value={center.id}>
                    {center.name}
                  </option>
                ))}
              </select>
            </div>
          </Panel>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="Contas a pagar" subtitle="Escolha a forma e marque como paga.">
              <select
                className={`${selectClass} mb-3`}
                value={payMethod}
                onChange={(event) => setPayMethod(event.target.value)}
              >
                {methods.map((method: any) => (
                  <option key={method.id} value={method.code}>
                    {method.name}
                  </option>
                ))}
              </select>
              <div className="space-y-2">
                {(data.payables ?? []).map((row: any) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border p-4"
                  >
                    <div>
                      <strong className="text-sm">{row.title}</strong>
                      <p className="text-xs text-muted-foreground">Vence {formatDate(row.due_date)}</p>
                    </div>
                    <div className="text-right">
                      <strong>{money(row.amount)}</strong>
                      <div className="mt-2 flex gap-2">
                        <Badge variant={statusVariant(row.display_status)}>
                          {statusLabel(row.display_status)}
                        </Badge>
                        {row.status === "pending" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === `pay-${row.id}`}
                            onClick={() =>
                              run(
                                `pay-${row.id}`,
                                async () => {
                                  const result = await db.rpc("pay_account_payable", {
                                    _account_id: row.id,
                                    _payment_method_code: payMethod,
                                    _paid_at: new Date().toISOString(),
                                  });
                                  if (result.error) throw result.error;
                                },
                                "Conta paga.",
                              )
                            }
                          >
                            Pagar
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title="Contas a receber / fiado"
              subtitle="Recebimentos atualizam a receita sem duplicar faturamento."
            >
              <select
                className={`${selectClass} mb-3`}
                value={receiveMethod}
                onChange={(event) => setReceiveMethod(event.target.value)}
              >
                {methods.map((method: any) => (
                  <option key={method.id} value={method.code}>
                    {method.name}
                  </option>
                ))}
              </select>
              <div className="space-y-2">
                {(data.receivables ?? []).map((row: any) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border p-4"
                  >
                    <div>
                      <strong className="text-sm">{row.client_name_snapshot}</strong>
                      <p className="text-xs text-muted-foreground">
                        {row.service_name_snapshot || "Valor a receber"} · vence {formatDate(row.due_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <strong>{money(Number(row.original_amount) - Number(row.amount_received))}</strong>
                      <div className="mt-2 flex gap-2">
                        <Badge variant={statusVariant(row.display_status)}>
                          {statusLabel(row.display_status)}
                        </Badge>
                        {row.status === "pending" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === `receive-${row.id}`}
                            onClick={() =>
                              run(
                                `receive-${row.id}`,
                                async () => {
                                  const result = await db.rpc("receive_account_receivable", {
                                    _receivable_id: row.id,
                                    _payment_method_code: receiveMethod,
                                    _received_at: new Date().toISOString(),
                                  });
                                  if (result.error) throw result.error;
                                },
                                "Recebimento registrado.",
                              )
                            }
                          >
                            Receber
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="commissions" className="mt-5 space-y-5">
          <Panel
            title="Fechamento por profissional"
            subtitle="Profissionais ativos aparecem aqui mesmo antes do primeiro atendimento."
          >
            <div className="grid gap-3 md:grid-cols-4">
              <select
                className={selectClass}
                value={settlement.professional}
                onChange={(event) =>
                  setSettlement({ ...settlement, professional: event.target.value })
                }
              >
                <option value="">Selecione o profissional</option>
                {professionals.map((professional: any) => (
                  <option key={professional.id} value={professional.id}>
                    {professional.name}
                  </option>
                ))}
              </select>
              <Input
                type="date"
                value={settlement.start}
                onChange={(event) => setSettlement({ ...settlement, start: event.target.value })}
              />
              <Input
                type="date"
                value={settlement.end}
                onChange={(event) => setSettlement({ ...settlement, end: event.target.value })}
              />
              <Button
                disabled={busy === "settlement"}
                onClick={() =>
                  run(
                    "settlement",
                    async () => {
                      if (!settlement.professional)
                        throw new Error("Selecione o profissional.");
                      const result = await db.rpc("generate_professional_settlement", {
                        _professional_id: settlement.professional,
                        _period_start: settlement.start,
                        _period_end: settlement.end,
                      });
                      if (result.error) throw result.error;
                    },
                    "Fechamento gerado.",
                  )
                }
              >
                Gerar fechamento
              </Button>
            </div>
          </Panel>

          <Panel title="Ajuste manual de comissão">
            <div className="grid gap-3 md:grid-cols-4">
              <select
                className={selectClass}
                value={override.commission}
                onChange={(event) => setOverride({ ...override, commission: event.target.value })}
              >
                <option value="">Comissão pendente</option>
                {(data.commissions ?? [])
                  .filter((commission: any) => commission.status === "pending")
                  .map((commission: any) => (
                    <option key={commission.id} value={commission.id}>
                      {professionalMap.get(commission.professional_id) || "Profissional"} ·{" "}
                      {money(commission.commission_amount)}
                    </option>
                  ))}
              </select>
              <Input
                placeholder="Novo valor"
                value={override.amount}
                onChange={(event) => setOverride({ ...override, amount: event.target.value })}
              />
              <Input
                placeholder="Motivo obrigatório"
                value={override.reason}
                onChange={(event) => setOverride({ ...override, reason: event.target.value })}
              />
              <Button
                disabled={busy === "override"}
                onClick={() =>
                  run(
                    "override",
                    async () => {
                      const value = parseMoney(override.amount);
                      if (!override.commission || !Number.isFinite(value) || !override.reason.trim())
                        throw new Error("Comissão, valor e motivo são obrigatórios.");
                      const result = await db.rpc("override_professional_commission", {
                        _commission_id: override.commission,
                        _commission_amount: value,
                        _reason: override.reason.trim(),
                      });
                      if (result.error) throw result.error;
                      setOverride({ commission: "", amount: "", reason: "" });
                    },
                    "Comissão ajustada e auditada.",
                  )
                }
              >
                Aplicar ajuste
              </Button>
            </div>
          </Panel>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="Comissões">
              <div className="space-y-2">
                {(data.commissions ?? []).map((row: any) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"
                  >
                    <div>
                      <strong className="text-sm">
                        {professionalMap.get(row.professional_id) ||
                          `Profissional ${String(row.professional_id).slice(0, 8)}`}
                      </strong>
                      <p className="text-xs text-muted-foreground">
                        {commissionTypeLabel(row.commission_type)}
                        {row.is_manual_override ? " · ajuste manual" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <strong>{money(row.commission_amount)}</strong>
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                        {row.status === "pending" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === `commission-${row.id}`}
                            onClick={() =>
                              run(
                                `commission-${row.id}`,
                                async () => {
                                  const result = await db.rpc("mark_commission_paid", {
                                    _commission_id: row.id,
                                  });
                                  if (result.error) throw result.error;
                                },
                                "Comissão marcada como paga.",
                              )
                            }
                          >
                            Marcar paga
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Fechamentos">
              <div className="space-y-2">
                {(data.settlements ?? []).map((row: any) => (
                  <div key={row.id} className="rounded-2xl border border-border p-4">
                    <div className="flex justify-between gap-3">
                      <div>
                        <strong className="text-sm">
                          {professionalMap.get(row.professional_id) || "Profissional"}
                        </strong>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(row.period_start)} — {formatDate(row.period_end)} ·{" "}
                          {row.procedures_count} atendimentos · comissão {money(row.commission_total)}
                        </p>
                      </div>
                      <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                    </div>
                    {row.status === "open" ? (
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(
                            `close-settlement-${row.id}`,
                            async () => {
                              const result = await db.rpc("close_professional_settlement", {
                                _settlement_id: row.id,
                              });
                              if (result.error) throw result.error;
                            },
                            "Fechamento encerrado.",
                          )
                        }
                      >
                        Encerrar
                      </Button>
                    ) : null}
                    {["open", "closed"].includes(row.status) ? (
                      <Button
                        className="mt-3 ml-2"
                        size="sm"
                        onClick={() =>
                          run(
                            `pay-settlement-${row.id}`,
                            async () => {
                              const result = await db.rpc("pay_professional_settlement", {
                                _settlement_id: row.id,
                              });
                              if (result.error) throw result.error;
                            },
                            "Repasse marcado como pago.",
                          )
                        }
                      >
                        Marcar repasse pago
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="mt-5 space-y-5">
          <Panel
            title="Relatórios e exportações"
            subtitle="Os filtros da aba Entradas são aplicados à exportação."
          >
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => excelExport(filteredEntries, data.expenses ?? [], from, to)}
              >
                <FileSpreadsheet className="mr-2 size-4" /> Exportar Excel
              </Button>
              <Button
                variant="outline"
                onClick={() => printReport(filteredEntries, data.expenses ?? [], from, to)}
              >
                <Printer className="mr-2 size-4" /> PDF / Imprimir
              </Button>
            </div>
          </Panel>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              icon={TrendingUp}
              label="Bruto filtrado"
              value={money(
                filteredEntries.reduce(
                  (sum: number, row: any) => sum + Number(row.charged_amount || 0),
                  0,
                ),
              )}
            />
            <MetricCard
              icon={CreditCard}
              label="Taxas"
              value={money(
                filteredEntries.reduce(
                  (sum: number, row: any) => sum + Number(row.card_fee_amount || 0),
                  0,
                ),
              )}
            />
            <MetricCard
              icon={Landmark}
              label="Parte da clínica"
              value={money(
                filteredEntries.reduce(
                  (sum: number, row: any) => sum + Number(row.clinic_amount || 0),
                  0,
                ),
              )}
            />
          </div>
          <Panel title="Prévia do relatório">
            <EntryList rows={filteredEntries.slice(0, 50)} />
          </Panel>
        </TabsContent>

        <TabsContent value="settings" className="mt-5 space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="Taxas das formas de pagamento">
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className={selectClass}
                  value={fee.method}
                  onChange={(event) => setFee({ ...fee, method: event.target.value })}
                >
                  {methods
                    .filter((method: any) => method.is_card)
                    .map((method: any) => (
                      <option key={method.id} value={method.code}>
                        {method.name}
                      </option>
                    ))}
                </select>
                <Input
                  placeholder="Taxa %"
                  value={fee.percent}
                  onChange={(event) => setFee({ ...fee, percent: event.target.value })}
                />
                <Input
                  placeholder="Taxa fixa"
                  value={fee.fixed}
                  onChange={(event) => setFee({ ...fee, fixed: event.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={fee.min}
                    onChange={(event) => setFee({ ...fee, min: event.target.value })}
                  />
                  <Input
                    type="number"
                    min="1"
                    value={fee.max}
                    onChange={(event) => setFee({ ...fee, max: event.target.value })}
                  />
                </div>
                <Input
                  type="date"
                  value={fee.effective}
                  onChange={(event) => setFee({ ...fee, effective: event.target.value })}
                />
                <Button
                  disabled={busy === "fee"}
                  onClick={() =>
                    run(
                      "fee",
                      async () => {
                        const percent = parseMoney(fee.percent);
                        const fixed = parseMoney(fee.fixed);
                        if (
                          !Number.isFinite(percent) ||
                          percent < 0 ||
                          !Number.isFinite(fixed) ||
                          fixed < 0
                        )
                          throw new Error("Taxas inválidas.");
                        const result = await db.rpc("set_payment_method_fee", {
                          _payment_method_code: fee.method,
                          _fee_percent: percent,
                          _fixed_fee: fixed,
                          _installments_min: Number(fee.min),
                          _installments_max: Number(fee.max),
                          _effective_from: fee.effective,
                        });
                        if (result.error) throw result.error;
                      },
                      "Taxa configurada.",
                    )
                  }
                >
                  Salvar taxa
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                {(data.fees ?? [])
                  .filter((row: any) => row.is_active)
                  .slice(0, 8)
                  .map((row: any) => (
                    <div key={row.id} className="rounded-xl border border-border px-3 py-2 text-xs">
                      {methodMap.get(row.payment_method_id) || "Pagamento"} ·{" "}
                      {Number(row.fee_percent)}% + {money(row.fixed_fee)} · {row.installments_min}–
                      {row.installments_max}x · desde {formatDate(row.effective_from)}
                    </div>
                  ))}
              </div>
            </Panel>

            <Panel
              title="Regra de comissão"
              subtitle="A lista usa todos os profissionais ativos, inclusive quem ainda não realizou atendimento."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className={selectClass}
                  value={rule.professional}
                  onChange={(event) => setRule({ ...rule, professional: event.target.value })}
                >
                  <option value="">Profissional</option>
                  {professionals.map((professional: any) => (
                    <option key={professional.id} value={professional.id}>
                      {professional.name}
                    </option>
                  ))}
                </select>
                <select
                  className={selectClass}
                  value={rule.type}
                  onChange={(event) => setRule({ ...rule, type: event.target.value })}
                >
                  <option value="percentage">Percentual</option>
                  <option value="fixed_per_patient">Valor por paciente</option>
                  <option value="manual">Manual</option>
                </select>
                <Input
                  placeholder={rule.type === "percentage" ? "Percentual" : "Valor fixo"}
                  value={rule.value}
                  onChange={(event) => setRule({ ...rule, value: event.target.value })}
                  disabled={rule.type === "manual"}
                />
                <select
                  className={selectClass}
                  value={rule.base}
                  onChange={(event) => setRule({ ...rule, base: event.target.value })}
                >
                  <option value="net_after_fees">Líquido após taxas</option>
                  <option value="after_discount">Após desconto</option>
                  <option value="original">Valor original</option>
                </select>
                <Input
                  type="date"
                  value={rule.effective}
                  onChange={(event) => setRule({ ...rule, effective: event.target.value })}
                />
                <Button
                  disabled={busy === "rule"}
                  onClick={() =>
                    run(
                      "rule",
                      async () => {
                        if (!rule.professional) throw new Error("Selecione o profissional.");
                        const value = rule.type === "manual" ? 0 : parseMoney(rule.value);
                        if (rule.type !== "manual" && (!Number.isFinite(value) || value < 0))
                          throw new Error("Informe um valor de comissão válido.");
                        const result = await db.rpc("set_professional_commission_rule", {
                          _professional_id: rule.professional,
                          _commission_type: rule.type,
                          _percentage: rule.type === "percentage" ? value : null,
                          _fixed_amount: rule.type === "fixed_per_patient" ? value : null,
                          _calculation_base: rule.base,
                          _effective_from: rule.effective,
                        });
                        if (result.error) throw result.error;
                      },
                      "Regra de comissão atualizada.",
                    )
                  }
                >
                  Salvar regra
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                {(data.rules ?? [])
                  .filter((row: any) => row.is_active && row.effective_to == null)
                  .slice(0, 8)
                  .map((row: any) => (
                    <div key={row.id} className="rounded-xl border border-border px-3 py-2 text-xs">
                      {professionalMap.get(row.professional_id) ||
                        String(row.professional_id).slice(0, 8)}{" "}
                      ·{" "}
                      {row.commission_type === "percentage"
                        ? `${Number(row.percentage)}%`
                        : row.commission_type === "fixed_per_patient"
                          ? `${money(row.fixed_amount)} por paciente`
                          : "Manual"}
                    </div>
                  ))}
              </div>
            </Panel>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReceptionWorkspace({ data, loading, error, refresh }: any) {
  const [openingCash, setOpeningCash] = useState("200,00");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("pix");
  const [busy, setBusy] = useState("");
  const todayCash = (data?.cash ?? []).find((row: any) => row.business_date === fortalezaIso());

  const run = async (key: string, fn: () => Promise<void>, success: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      await refresh();
    } catch (err: any) {
      toast.error("Operação não concluída.", { description: err?.message });
    } finally {
      setBusy("");
    }
  };

  if (loading)
    return <div className="grid min-h-[60vh] place-items-center">Carregando financeiro...</div>;
  if (error || !data)
    return <div className="m-8 text-destructive">Falha ao carregar operações financeiras.</div>;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <Badge className="bg-amber-500 text-white hover:bg-amber-500">STAGING · RECEPÇÃO</Badge>
      <h1 className="mt-3 text-3xl font-semibold">Operações financeiras</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A recepção opera caixa e recebimentos, sem acesso ao resultado financeiro da clínica.
      </p>
      <div className="mt-8 space-y-5">
        <Panel title="Caixa de hoje">
          {!todayCash ? (
            <div className="flex max-w-md gap-2">
              <Input value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} />
              <Button
                disabled={busy === "open"}
                onClick={() =>
                  run(
                    "open",
                    async () => {
                      const value = parseMoney(openingCash);
                      if (!Number.isFinite(value) || value < 0)
                        throw new Error("Fundo inicial inválido.");
                      const result = await db.rpc("open_cash_session", {
                        _opening_cash: value,
                        _business_date: fortalezaIso(),
                      });
                      if (result.error) throw result.error;
                    },
                    "Caixa aberto.",
                  )
                }
              >
                Abrir
              </Button>
            </div>
          ) : todayCash.status === "open" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                placeholder="Dinheiro contado"
                value={counted}
                onChange={(event) => setCounted(event.target.value)}
              />
              <Input
                placeholder="Observação"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <Button
                disabled={busy === "close"}
                onClick={() =>
                  run(
                    "close",
                    async () => {
                      const value = parseMoney(counted);
                      if (!Number.isFinite(value) || value < 0)
                        throw new Error("Informe o dinheiro contado.");
                      const result = await db.rpc("close_cash_session", {
                        _session_id: todayCash.id,
                        _counted_cash: value,
                        _note: note || null,
                      });
                      if (result.error) throw result.error;
                    },
                    "Caixa fechado.",
                  )
                }
              >
                Fechar caixa
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard icon={ReceiptText} label="Esperado" value={money(todayCash.expected_cash)} />
              <MetricCard icon={Banknote} label="Contado" value={money(todayCash.counted_cash)} />
              <MetricCard icon={AlertTriangle} label="Diferença" value={money(todayCash.difference_amount)} />
            </div>
          )}
        </Panel>

        <Panel title="Receber valores pendentes">
          <select
            className={`${selectClass} mb-3 max-w-xs`}
            value={method}
            onChange={(event) => setMethod(event.target.value)}
          >
            {(data.methods ?? []).map((row: any) => (
              <option key={row.id} value={row.code}>
                {row.name}
              </option>
            ))}
          </select>
          <div className="space-y-2">
            {(data.receivables ?? [])
              .filter((row: any) => row.status === "pending")
              .map((row: any) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between rounded-2xl border border-border p-4"
                >
                  <div>
                    <strong>{row.client_name_snapshot}</strong>
                    <p className="text-xs text-muted-foreground">Vence {formatDate(row.due_date)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <strong>{money(Number(row.original_amount) - Number(row.amount_received))}</strong>
                    <Button
                      size="sm"
                      disabled={busy === row.id}
                      onClick={() =>
                        run(
                          row.id,
                          async () => {
                            const result = await db.rpc("receive_account_receivable", {
                              _receivable_id: row.id,
                              _payment_method_code: method,
                              _received_at: new Date().toISOString(),
                            });
                            if (result.error) throw result.error;
                          },
                          "Recebimento registrado.",
                        )
                      }
                    >
                      Receber
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ProfessionalWorkspace({ data, loading, error }: any) {
  if (loading)
    return <div className="grid min-h-[60vh] place-items-center">Carregando produção...</div>;
  if (error || !data)
    return <div className="m-8 text-destructive">Falha ao carregar sua produção financeira.</div>;

  const revenue = (data.entries ?? []).reduce(
    (sum: number, row: any) => sum + Number(row.charged_amount || 0),
    0,
  );
  const commission = (data.commissions ?? []).reduce(
    (sum: number, row: any) => sum + Number(row.commission_amount || 0),
    0,
  );
  const pending = (data.commissions ?? [])
    .filter((row: any) => row.status === "pending")
    .reduce((sum: number, row: any) => sum + Number(row.commission_amount || 0), 0);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <Badge variant="outline">Minha produção</Badge>
      <h1 className="mt-3 text-3xl font-semibold">Produção e comissões</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Você visualiza somente seus próprios atendimentos e repasses.
      </p>
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <MetricCard icon={TrendingUp} label="Produção" value={money(revenue)} />
        <MetricCard icon={UsersRound} label="Comissão total" value={money(commission)} />
        <MetricCard icon={CalendarClock} label="Comissão pendente" value={money(pending)} />
      </section>
      <div className="mt-6">
        <Panel title="Atendimentos">
          <div className="space-y-2">
            {(data.entries ?? []).map((row: any) => (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-2xl border border-border p-4"
              >
                <div>
                  <strong>{row.patient_name_snapshot || "Atendimento"}</strong>
                  <p className="text-xs text-muted-foreground">
                    {row.service_name_snapshot || "Serviço"} · {formatDate(row.occurred_at)}
                  </p>
                </div>
                <strong>{money(row.charged_amount)}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: any }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EntryList({ rows }: { rows: any[] }) {
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">Nenhum lançamento no período.</p>;

  return (
    <div className="space-y-2">
      {rows.map((row: any) => (
        <div
          key={row.entry_id ?? row.id}
          className="grid gap-3 rounded-2xl border border-border p-4 lg:grid-cols-[1.6fr_1fr_1fr_auto] lg:items-center"
        >
          <div>
            <p className="text-sm font-semibold">{row.patient_name_snapshot || "Atendimento"}</p>
            <p className="text-xs text-muted-foreground">
              {row.service_name_snapshot || "Serviço"} ·{" "}
              {row.professional_name_snapshot || "Profissional"}
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {row.payment_method_name || "Pagamento"}
            <br />
            {formatDate(row.business_date || row.occurred_at)}
          </div>
          <div className="text-xs">
            <span className="text-muted-foreground">Bruto:</span> {money(row.charged_amount)}
            <br />
            <span className="text-muted-foreground">Líquido:</span> {money(row.net_amount)}
          </div>
          <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
        </div>
      ))}
    </div>
  );
}
