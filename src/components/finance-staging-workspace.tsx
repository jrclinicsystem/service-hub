/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  FileSpreadsheet,
  Landmark,
  Printer,
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
  return `${values["year"]}-${values["month"]}-${values["day"]}`;
}

function monthStartIso() {
  return `${fortalezaIso().slice(0, 7)}-01`;
}

function addDaysIso(baseIso: string, days: number) {
  const date = new Date(`${baseIso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function periodPreset(preset: string) {
  const today = fortalezaIso();
  const current = new Date(`${today}T12:00:00`);
  if (preset === 'today') return [today, today];
  if (preset === 'yesterday') { const d=addDaysIso(today,-1); return [d,d]; }
  if (preset === '7d') return [addDaysIso(today,-6), today];
  if (preset === 'week') { const dow=current.getDay(); const back=dow===0?6:dow-1; return [addDaysIso(today,-back), today]; }
  if (preset === 'month') return [monthStartIso(), today];
  if (preset === 'prevmonth') { const first=new Date(current.getFullYear(), current.getMonth()-1,1,12); const last=new Date(current.getFullYear(), current.getMonth(),0,12); const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; return [iso(first),iso(last)]; }
  if (preset === '3m' || preset === '6m') { const months=preset==='3m'?2:5; const d=new Date(current.getFullYear(), current.getMonth()-months,1,12); const start=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; return [start,today]; }
  if (preset === 'year') return [`${today.slice(0,4)}-01-01`, today];
  return [monthStartIso(), today];
}

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoney(value: string) {
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

function entryServiceItems(row: any) {
  const items = Array.isArray(row?.service_items) ? row.service_items : [];
  if (items.length) return items;
  const rawNames = Array.isArray(row?.service_names) ? row.service_names : [];
  if (rawNames.length) return rawNames.map((name: unknown) => ({ name: String(name ?? "").trim(), price_snapshot: null, status: "completed" })).filter((item: any) => item.name);
  const fallback = String(row?.service_name_snapshot ?? "").trim();
  return [{ name: fallback || "Serviço", price_snapshot: null, status: "completed" }];
}

function entryServiceLabel(row: any) {
  return entryServiceItems(row).map((item: any) => item.price_snapshot == null ? item.name : `${item.name} (${money(item.price_snapshot)})`).join(" • ");
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

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (["paid", "received", "closed"].includes(status)) return "default";
  if (status === "overdue") return "destructive";
  if (["cancelled", "refunded"].includes(status)) return "outline";
  return "secondary";
}

function commissionEntry(row: any) {
  const value = row?.financial_entry;
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function commissionContext(row: any, professionals: any[]) {
  const entry = commissionEntry(row);
  const professional =
    entry?.professional_name_snapshot ||
    professionals.find((item: any) => item.id === row?.professional_id)?.name ||
    `Profissional ${String(row?.professional_id ?? "").slice(0, 8) || "não identificado"}`;
  const patient = entry?.patient_name_snapshot || "Paciente não identificado";
  const service = entry?.service_name_snapshot || "Serviço não identificado";
  const date = entry?.occurred_at ? formatDate(entry.occurred_at) : "Data não informada";
  return {
    professional,
    patient,
    service,
    date,
    label: `${professional} · ${patient} · ${service} · ${date} · ${money(row?.commission_amount)}`,
  };
}

function historicalCommissionPreview(row: any, rules: any[]) {
  const entry = commissionEntry(row);
  if (!entry?.appointment_id || !entry?.occurred_at || !row?.professional_id) return null;
  if (row.status !== "pending" || row.is_manual_override || Number(row.paid_amount ?? 0) > 0) return null;
  if (Math.abs(Number(row.commission_amount ?? 0)) > 0.0001) return null;

  const today = fortalezaIso();
  const entryDate = fortalezaIso(new Date(entry.occurred_at));
  const rule = [...(rules ?? [])]
    .filter(
      (item: any) =>
        item.professional_id === row.professional_id &&
        item.is_active &&
        item.effective_from <= today &&
        (!item.effective_to || item.effective_to >= today),
    )
    .sort((a: any, b: any) =>
      `${b.effective_from ?? ""}-${b.created_at ?? ""}`.localeCompare(
        `${a.effective_from ?? ""}-${a.created_at ?? ""}`,
      ),
    )[0];

  if (!rule || rule.commission_type === "manual") return null;

  const original = Number(entry.original_amount ?? 0);
  const charged = Number(entry.charged_amount ?? original);
  const net = Number(entry.net_amount ?? charged);
  const base =
    rule.calculation_base === "original"
      ? original
      : rule.calculation_base === "after_discount"
        ? charged
        : net;
  const amount =
    rule.commission_type === "percentage"
      ? Math.round((base * Number(rule.percentage ?? 0) / 100 + Number.EPSILON) * 100) / 100
      : Math.round((Number(rule.fixed_amount ?? 0) + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > net) return null;

  const baseLabel =
    rule.calculation_base === "original"
      ? "valor original"
      : rule.calculation_base === "after_discount"
        ? "valor após desconto"
        : "valor líquido";
  const ruleLabel =
    rule.commission_type === "percentage"
      ? `${Number(rule.percentage ?? 0).toLocaleString("pt-BR")}% sobre ${baseLabel}`
      : `${money(rule.fixed_amount)} por paciente`;

  return { rule, amount, ruleLabel, net, isHistorical: entryDate < rule.effective_from };
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
    db
      .from("accounts_payable_with_status")
      .select("*")
      .order("due_date", { ascending: true })
      .limit(200),
    db
      .from("accounts_receivable_with_status")
      .select("*")
      .order("due_date", { ascending: true })
      .limit(200),
    db
      .from("professional_commissions")
      .select(
        "*,financial_entry:financial_entries(appointment_id,patient_name_snapshot,professional_name_snapshot,service_name_snapshot,occurred_at,original_amount,charged_amount,net_amount)",
      )
      .order("created_at", { ascending: false })
      .limit(300),
    db
      .from("professional_settlements")
      .select("*")
      .order("period_end", { ascending: false })
      .limit(100),
    db.from("payment_methods").select("*").eq("is_active", true).order("sort_order"),
    db
      .from("payment_method_fees")
      .select("*")
      .order("effective_from", { ascending: false })
      .limit(100),
    db.from("cost_centers").select("*").eq("is_active", true).order("name"),
    db.from("expense_categories").select("*").eq("is_active", true).order("name"),
    db
      .from("professional_commission_rules")
      .select("*")
      .order("effective_from", { ascending: false })
      .limit(100),
    db
      .from("professionals")
      .select("id,name,sort_order,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
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
    professionalsDirectory,
  ] = results;

  const reportEntries = entries.data ?? [];
  const serviceItemsByEntry = new Map<string, any[]>();
  const entryIds = Array.from(new Set(reportEntries.map((row: any) => String(row.entry_id ?? row.id ?? "")).filter(Boolean)));

  if (entryIds.length) {
    const entryLinks: any[] = [];
    for (let index = 0; index < entryIds.length; index += 100) {
      const chunk = entryIds.slice(index, index + 100);
      const result = await db.from("financial_entries").select("id,appointment_id").in("id", chunk);
      if (!result.error) entryLinks.push(...(result.data ?? []));
    }

    const appointmentIds = Array.from(new Set(entryLinks.map((row: any) => String(row.appointment_id ?? "")).filter(Boolean)));
    const serviceItemsByAppointment = new Map<string, any[]>();

    for (let index = 0; index < appointmentIds.length; index += 100) {
      const chunk = appointmentIds.slice(index, index + 100);
      const result = await db
        .from("appointment_services")
        .select("appointment_id,position,price_snapshot,status,service:services(name)")
        .in("appointment_id", chunk)
        .order("position", { ascending: true });
      if (result.error) continue;

      for (const row of result.data ?? []) {
        const service = Array.isArray(row.service) ? row.service[0] : row.service;
        const name = String(service?.name ?? "").trim();
        const appointmentId = String(row.appointment_id ?? "");
        if (!appointmentId || !name) continue;
        const items = serviceItemsByAppointment.get(appointmentId) ?? [];
        items.push({ name, price_snapshot: Number(row.price_snapshot ?? 0), status: row.status ?? "completed", position: Number(row.position ?? 0) });
        serviceItemsByAppointment.set(appointmentId, items);
      }
    }

    for (const row of entryLinks) {
      const entryId = String(row.id ?? "");
      const appointmentId = String(row.appointment_id ?? "");
      const items = serviceItemsByAppointment.get(appointmentId) ?? [];
      if (entryId && items.length) serviceItemsByEntry.set(entryId, items);
    }
  }

  const enrichedEntries = reportEntries.map((row: any) => {
    const entryId = String(row.entry_id ?? row.id ?? "");
    const serviceItems = serviceItemsByEntry.get(entryId);
    return serviceItems?.length ? { ...row, service_items: serviceItems, service_names: serviceItems.map((item: any) => item.name) } : row;
  });

  return {
    dashboard: dashboard.data ?? [],
    cash: cash.data ?? [],
    entries: enrichedEntries,
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
    professionalsDirectory: professionalsDirectory.data ?? [],
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
  return { entries: results[0].data ?? [], commissions: results[1].data ?? [] };
}

function excelExport(entries: any[], expenses: any[], from: string, to: string) {
  const escape = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const entryRows = entries
    .map(
      (row) =>
        `<tr><td>${escape(row.business_date)}</td><td>${escape(row.patient_name_snapshot)}</td><td>${escape(row.professional_name_snapshot)}</td><td>${escape(entryServiceLabel(row))}</td><td>${escape(row.payment_method_name)}</td><td>${escape(row.charged_amount)}</td><td>${escape(row.card_fee_amount)}</td><td>${escape(row.net_amount)}</td><td>${escape(row.commission_amount)}</td><td>${escape(row.clinic_amount)}</td><td>${escape(row.status)}</td></tr>`,
    )
    .join("");
  const expenseRows = expenses
    .map(
      (row) =>
        `<tr><td>${escape(row.expense_date)}</td><td>${escape(row.description)}</td><td>${escape(row.category_name)}</td><td>${escape(row.cost_center_name)}</td><td>${escape(row.payment_method_name)}</td><td>${escape(row.amount)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><meta charset="utf-8"><body><h2>JR Clinic - Relatório Financeiro ${from} a ${to}</h2><h3>Entradas</h3><table border="1"><tr><th>Data</th><th>Cliente</th><th>Profissional</th><th>Serviço</th><th>Pagamento</th><th>Bruto</th><th>Taxa</th><th>Líquido</th><th>Comissão</th><th>Clínica</th><th>Status</th></tr>${entryRows}</table><br><h3>Despesas</h3><table border="1"><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Centro</th><th>Pagamento</th><th>Valor</th></tr>${expenseRows}</table></body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
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
        `<tr><td>${formatDate(row.business_date)}</td><td>${row.patient_name_snapshot ?? ""}</td><td>${row.professional_name_snapshot ?? ""}</td><td>${entryServiceLabel(row)}</td><td>${row.payment_method_name ?? "Não informado"}</td><td>${money(row.charged_amount)}</td><td>${money(row.net_amount)}</td></tr>`,
    )
    .join("");

  const expenseRows = expenses
    .map(
      (row) =>
        `<tr><td>${formatDate(row.expense_date)}</td><td>${row.description ?? ""}</td><td>${row.payment_method_name ?? "Não informado"}</td><td>${money(row.amount)}</td></tr>`,
    )
    .join("");

  const entryTotals: Record<string, number> = {};
  const expenseTotals: Record<string, number> = {};
  for (const row of entries) {
    const methodName = String(row.payment_method_name ?? "Não informado");
    entryTotals[methodName] = (entryTotals[methodName] ?? 0) + Number(row.net_amount ?? 0);
  }
  for (const row of expenses) {
    const methodName = String(row.payment_method_name ?? "Não informado");
    expenseTotals[methodName] = (expenseTotals[methodName] ?? 0) + Number(row.amount ?? 0);
  }

  const paymentMethods = Array.from(new Set([...Object.keys(entryTotals), ...Object.keys(expenseTotals)])).sort();
  const paymentRows = paymentMethods
    .map((methodName) => {
      const received = entryTotals[methodName] ?? 0;
      const spent = expenseTotals[methodName] ?? 0;
      return `<tr><td>${methodName}</td><td>${money(received)}</td><td>${money(spent)}</td><td>${money(received - spent)}</td></tr>`;
    })
    .join("");

  const grossTotal = entries.reduce((sum, row) => sum + Number(row.charged_amount ?? 0), 0);
  const feeTotal = entries.reduce((sum, row) => sum + Number(row.card_fee_amount ?? 0), 0);
  const netTotal = entries.reduce((sum, row) => sum + Number(row.net_amount ?? 0), 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const finalResult = netTotal - expenseTotal;

  popup.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Relatório Financeiro JR Clinic</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#222}h1{margin-bottom:4px}h2{margin-top:28px}p{color:#666}table{width:100%;border-collapse:collapse;margin:18px 0 28px}th,td{border:1px solid #ddd;padding:8px;font-size:12px;text-align:left}th{background:#f5f5f5}.summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:20px 0 30px}.box{border:1px solid #ddd;border-radius:8px;padding:12px}.label{font-size:11px;color:#666}.value{font-size:16px;font-weight:700;margin-top:5px}.result{border:2px solid #0f4d3e;background:#f2f8f6}@media print{button{display:none}.summary{grid-template-columns:repeat(5,minmax(0,1fr))}}</style></head><body><h1>JR Clinic — Relatório Financeiro</h1><p>Período: ${formatDate(from)} a ${formatDate(to)}</p><div class="summary"><div class="box"><div class="label">Entradas brutas</div><div class="value">${money(grossTotal)}</div></div><div class="box"><div class="label">Taxas</div><div class="value">${money(feeTotal)}</div></div><div class="box"><div class="label">Entradas líquidas</div><div class="value">${money(netTotal)}</div></div><div class="box"><div class="label">Despesas / saídas</div><div class="value">${money(expenseTotal)}</div></div><div class="box result"><div class="label">Resultado final da clínica</div><div class="value">${money(finalResult)}</div></div></div><h2>Entradas</h2><table><tr><th>Data</th><th>Cliente</th><th>Profissional</th><th>Serviço</th><th>Pagamento</th><th>Bruto</th><th>Líquido</th></tr>${entryRows}</table><h2>Despesas / Saídas</h2><table><tr><th>Data</th><th>Descrição</th><th>Pagamento</th><th>Valor</th></tr>${expenseRows}</table><h2>Totais por forma de pagamento</h2><table><tr><th>Forma de pagamento</th><th>Entradas líquidas</th><th>Saídas</th><th>Saldo</th></tr>${paymentRows}</table><div class="box result"><div class="label">Abatimento final — entradas líquidas menos despesas</div><div class="value">${money(netTotal)} − ${money(expenseTotal)} = ${money(finalResult)}</div></div><button onclick="window.print()">Imprimir / Salvar PDF</button></body></html>`,
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

  if (access.isLoading)
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="size-8 animate-pulse rounded-full bg-primary-soft" />
      </div>
    );
  if (access.error || !access.data?.roles.length) return <EmptyAccess />;
  if (access.data.full)
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
  if (access.data.reception)
    return (
      <ReceptionWorkspace
        data={reception.data}
        loading={reception.isLoading}
        error={reception.error}
        refresh={refresh}
      />
    );
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
  const [activeTab, setActiveTab] = useState("overview");
  const [periodChoice, setPeriodChoice] = useState("month");
  const [openingCash, setOpeningCash] = useState("200,00");
  const [countedCash, setCountedCash] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [editingOpeningCash, setEditingOpeningCash] = useState(false);
  const [correctedOpeningCash, setCorrectedOpeningCash] = useState("");
  const [openingCorrectionReason, setOpeningCorrectionReason] = useState("");
  const [editingClosedCashId, setEditingClosedCashId] = useState("");
  const [correctedCountedCash, setCorrectedCountedCash] = useState("");
  const [closedCorrectionReason, setClosedCorrectionReason] = useState("");
  const [professionalFilter, setProfessionalFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("received");
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
  const [showPaidReceivables, setShowPaidReceivables] = useState(false);
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
  const [editingRuleId, setEditingRuleId] = useState("");
  const [editingFeeId, setEditingFeeId] = useState("");
  const [editingPayableId, setEditingPayableId] = useState("");
  const [payableEdit, setPayableEdit] = useState({ amount: "", due: "" });
  const [editingReceivableId, setEditingReceivableId] = useState("");
  const [receivableEdit, setReceivableEdit] = useState({ amount: "", due: "" });
  const [editingExpenseId, setEditingExpenseId] = useState("");
  const [expenseEditAmount, setExpenseEditAmount] = useState("");

  const metricMap = useMemo(
    () => new Map((data?.dashboard ?? []).map((row: any) => [row.metric, Number(row.value ?? 0)])),
    [data?.dashboard],
  );
  const methods = data?.methods ?? [];
  const methodMap = useMemo(
    () => new Map<string, string>(methods.map((row: any) => [row.id, row.name])),
    [methods],
  );
  const todayCash = (data?.cash ?? []).find((row: any) => row.business_date === fortalezaIso());
  const professionals = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of data?.professionalsDirectory ?? [])
      if (row?.id) map.set(row.id, row.name || "Profissional");
    for (const row of data?.entries ?? [])
      if (row.professional_id && !map.has(row.professional_id))
        map.set(
          row.professional_id,
          row.professional_name_snapshot ||
            `Profissional ${String(row.professional_id).slice(0, 8)}`,
        );
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [data?.professionalsDirectory, data?.entries]);

  const services = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of data?.entries ?? [])
      if (row.service_id) map.set(row.service_id, row.service_name_snapshot || "Serviço");
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
  const groupedEntries = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const row of filteredEntries) {
      const key = row.business_date || fortalezaIso(new Date(row.occurred_at));
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
  }, [filteredEntries]);
  const groupedExpenses = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const row of data?.expenses ?? []) {
      const key = row.expense_date || fortalezaIso(new Date(row.created_at));
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
  }, [data?.expenses]);

  const historicalCommissionCandidates = useMemo(
    () =>
      (data?.commissions ?? [])
        .map((row: any) => ({ row, preview: historicalCommissionPreview(row, data?.rules ?? []) }))
        .filter((item: any) => Boolean(item.preview)),
    [data?.commissions, data?.rules],
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

  const methodId = (code: string) => methods.find((row: any) => row.code === code)?.id ?? null;

  const resetRuleEditor = () => {
    setEditingRuleId("");
    setRule({
      professional: "",
      type: "percentage",
      value: "",
      base: "net_after_fees",
      effective: fortalezaIso(),
    });
  };

  const editCommissionRule = (currentRule: any) => {
    setEditingRuleId(String(currentRule.id));
    setRule({
      professional: currentRule.professional_id ?? "",
      type: currentRule.commission_type ?? "percentage",
      value:
        currentRule.commission_type === "percentage"
          ? String(currentRule.percentage ?? "")
          : currentRule.commission_type === "fixed_per_patient"
            ? String(currentRule.fixed_amount ?? "")
            : "",
      base: currentRule.calculation_base ?? "net_after_fees",
      effective: fortalezaIso(),
    });
  };

  const resetFeeEditor = () => {
    setEditingFeeId("");
    setFee({
      method: "credit",
      percent: "",
      fixed: "0",
      min: "1",
      max: "1",
      effective: fortalezaIso(),
    });
  };

  const editPaymentFee = (currentFee: any) => {
    const currentMethod = methods.find((method: any) => method.id === currentFee.payment_method_id);
    const today = fortalezaIso();
    setEditingFeeId(String(currentFee.id));
    setFee({
      method: currentMethod?.code ?? "credit",
      percent: String(currentFee.fee_percent ?? ""),
      fixed: String(currentFee.fixed_fee ?? "0"),
      min: String(currentFee.installments_min ?? "1"),
      max: String(currentFee.installments_max ?? "1"),
      effective:
        currentFee.effective_from && currentFee.effective_from > today
          ? currentFee.effective_from
          : today,
    });
  };

  const editPendingPayable = (currentPayable: any) => {
    setEditingPayableId(String(currentPayable.id));
    setPayableEdit({
      amount: String(currentPayable.amount ?? ""),
      due: currentPayable.due_date ?? "",
    });
  };

  const resetPayableEditor = () => {
    setEditingPayableId("");
    setPayableEdit({ amount: "", due: "" });
  };

  const editPendingReceivable = (currentReceivable: any) => {
    setEditingReceivableId(String(currentReceivable.id));
    setReceivableEdit({
      amount: String(currentReceivable.original_amount ?? ""),
      due: currentReceivable.due_date ?? "",
    });
  };

  const resetReceivableEditor = () => {
    setEditingReceivableId("");
    setReceivableEdit({ amount: "", due: "" });
  };

  const editExpenseAmount = (currentExpense: any) => {
    setEditingExpenseId(String(currentExpense.expense_id));
    setExpenseEditAmount(String(currentExpense.amount ?? ""));
  };

  const resetExpenseEditor = () => {
    setEditingExpenseId("");
    setExpenseEditAmount("");
  };

  if (loading)
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="size-8 animate-pulse rounded-full bg-primary-soft" />
      </div>
    );
  if (error || !data)
    return (
      <div className="m-8 rounded-3xl border border-destructive/30 bg-card p-6 text-sm text-destructive">
        Falha ao carregar o financeiro: {(error as any)?.message}
      </div>
    );

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
        <div className="space-y-2">
          <select className={selectClass} value={periodChoice} onChange={(e) => { const value=e.target.value; setPeriodChoice(value); if(value!=="custom"){ const [start,end]=periodPreset(value); setFrom(start); setTo(end); } }}>
            <option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="week">Esta semana</option><option value="7d">Últimos 7 dias</option><option value="month">Este mês</option><option value="prevmonth">Mês anterior</option><option value="3m">Últimos 3 meses</option><option value="6m">Últimos 6 meses</option><option value="year">Este ano</option><option value="custom">Personalizado</option>
          </select>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><Label>De</Label><Input type="date" value={from} onChange={(e) => { setPeriodChoice("custom"); setFrom(e.target.value); }} /></div>
            <div><Label>Até</Label><Input type="date" value={to} onChange={(e) => { setPeriodChoice("custom"); setTo(e.target.value); }} /></div>
          </div>
        </div>
      </header>

      {activeTab === "overview" ? (
        <section className="mt-8 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.35fr_.9fr_.9fr]">
            <div className="relative overflow-hidden rounded-[28px] border border-primary/15 bg-primary p-6 text-primary-foreground shadow-[0_18px_50px_-34px_rgba(6,78,62,.75)] sm:p-7">
              <div className="absolute -right-16 -top-16 size-48 rounded-full border border-white/10" />
              <div className="absolute -bottom-24 right-8 size-44 rounded-full bg-white/[0.04]" />
              <div className="relative flex h-full min-h-[178px] flex-col justify-between gap-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-foreground/65">Resultado do período</p>
                    <p className="mt-2 text-sm text-primary-foreground/72">Líquido recebido menos despesas registradas</p>
                  </div>
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
                    <CheckCircle2 className="size-5" />
                  </span>
                </div>
                <div>
                  <strong className="block text-3xl font-semibold tracking-tight sm:text-4xl">{money(metricMap.get("clinic_result"))}</strong>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-primary-foreground/70">
                    <span>Recebido <strong className="ml-1 text-primary-foreground">{money(metricMap.get("received"))}</strong></span>
                    <span>Despesas <strong className="ml-1 text-primary-foreground">{money(metricMap.get("expenses"))}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-border bg-card p-6 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Movimento</p>
                  <h3 className="mt-1 text-lg font-semibold">Receitas</h3>
                </div>
                <span className="grid size-10 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-700">
                  <TrendingUp className="size-4.5" />
                </span>
              </div>
              <div className="mt-6 space-y-4">
                <div><p className="text-xs text-muted-foreground">Hoje</p><strong className="mt-1 block text-2xl font-semibold">{money(metricMap.get("revenue_today"))}</strong></div>
                <div className="border-t border-border pt-4"><p className="text-xs text-muted-foreground">Período selecionado</p><strong className="mt-1 block text-xl font-semibold">{money(metricMap.get("revenue"))}</strong></div>
              </div>
            </div>

            <div className="rounded-[28px] border border-border bg-card p-6 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Disponibilidade</p>
                  <h3 className="mt-1 text-lg font-semibold">Caixa e saldo</h3>
                </div>
                <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Landmark className="size-4.5" />
                </span>
              </div>
              <div className="mt-6 space-y-4">
                <div><p className="text-xs text-muted-foreground">Saldo disponível</p><strong className="mt-1 block text-2xl font-semibold">{money(metricMap.get("available_balance"))}</strong></div>
                <div className="border-t border-border pt-4"><p className="text-xs text-muted-foreground">Comissões geradas</p><strong className="mt-1 block text-xl font-semibold">{money(metricMap.get("commissions"))}</strong></div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-[26px] border border-border bg-card p-5 shadow-soft sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Contas</p><h3 className="mt-1 text-lg font-semibold">Compromissos da clínica</h3></div>
                <CalendarClock className="size-5 text-muted-foreground" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-muted/45 p-4"><p className="text-xs text-muted-foreground">A pagar</p><strong className="mt-1 block text-xl">{money(metricMap.get("payable_pending"))}</strong></div>
                <div className="rounded-2xl bg-muted/45 p-4"><p className="text-xs text-muted-foreground">A receber</p><strong className="mt-1 block text-xl">{money(metricMap.get("receivable_pending"))}</strong></div>
              </div>
            </div>

            <div className="rounded-[26px] border border-border bg-card p-5 shadow-soft sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Atenção</p><h3 className="mt-1 text-lg font-semibold">Pendências e atrasos</h3></div>
                <AlertTriangle className="size-5 text-amber-600" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-amber-500/[0.07] p-4"><p className="text-xs text-muted-foreground">A pagar atrasado</p><strong className="mt-1 block text-lg">{money(metricMap.get("payable_overdue"))}</strong></div>
                <div className="rounded-2xl bg-amber-500/[0.07] p-4"><p className="text-xs text-muted-foreground">A receber atrasado</p><strong className="mt-1 block text-lg">{money(metricMap.get("receivable_overdue"))}</strong></div>
                <div className="rounded-2xl bg-muted/45 p-4"><p className="text-xs text-muted-foreground">Total atrasado</p><strong className="mt-1 block text-lg">{money(Number(metricMap.get("payable_overdue") ?? 0) + Number(metricMap.get("receivable_overdue") ?? 0))}</strong></div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl bg-muted/60 p-1.5">
          {(
            [
              ["overview", "Visão geral"],
              ["cash", "Caixa"],
              ["entries", "Entradas"],
              ["expenses", "Despesas"],
              ["accounts", "Contas"],
              ["commissions", "Comissões"],
              ["reports", "Relatórios"],
              ["settings", "Configurações"],
            ] as const
          ).map(([value, label]) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-5">
          <Panel title="Últimas entradas">
            <EntryList rows={(data.entries ?? []).slice(0, 8)} />
          </Panel>
        </TabsContent>

        <TabsContent value="cash" className="mt-5 space-y-5">
          <Panel
            title="Caixa diário"
            subtitle="Uma única sessão por dia: abertura, movimentações e fechamento."
          >
            {!todayCash ? (
              <div className="grid max-w-md gap-3">
                <div>
                  <Label>Fundo inicial</Label>
                  <Input
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
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
                <div className="space-y-2">
                  <MetricCard
                    icon={Banknote}
                    label="Fundo inicial"
                    value={money(todayCash.opening_cash)}
                  />
                  {!editingOpeningCash ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setCorrectedOpeningCash(String(todayCash.opening_cash ?? "0"));
                        setOpeningCorrectionReason("");
                        setEditingOpeningCash(true);
                      }}
                    >
                      Corrigir abertura
                    </Button>
                  ) : (
                    <div className="space-y-2 rounded-2xl border border-primary/15 bg-primary-soft/30 p-3">
                      <div>
                        <Label className="text-xs">Novo fundo inicial</Label>
                        <Input
                          value={correctedOpeningCash}
                          onChange={(e) => setCorrectedOpeningCash(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Motivo da correção</Label>
                        <Input
                          value={openingCorrectionReason}
                          onChange={(e) => setOpeningCorrectionReason(e.target.value)}
                          placeholder="Ex.: valor informado em duplicidade"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Corrige somente o fundo inicial deste caixa. Entradas e saídas registradas não são alteradas.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1"
                          disabled={busy === "correct-opening-cash"}
                          onClick={() =>
                            run(
                              "correct-opening-cash",
                              async () => {
                                const value = parseMoney(correctedOpeningCash);
                                if (!Number.isFinite(value) || value < 0)
                                  throw new Error("Fundo inicial inválido.");
                                if (!openingCorrectionReason.trim())
                                  throw new Error("Informe o motivo da correção.");
                                const result = await db.rpc("correct_open_cash_session", {
                                  _session_id: todayCash.id,
                                  _opening_cash: value,
                                  _reason: openingCorrectionReason.trim(),
                                });
                                if (result.error) throw result.error;
                                setEditingOpeningCash(false);
                                setCorrectedOpeningCash("");
                                setOpeningCorrectionReason("");
                              },
                              "Abertura do caixa corrigida.",
                            )
                          }
                        >
                          Salvar correção
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy === "correct-opening-cash"}
                          onClick={() => {
                            setEditingOpeningCash(false);
                            setCorrectedOpeningCash("");
                            setOpeningCorrectionReason("");
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <Label>Dinheiro contado</Label>
                  <Input
                    value={countedCash === "" ? String(todayCash.expected_cash ?? 0) : countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                    placeholder="0,00"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Preenchido automaticamente com o valor esperado em espécie. Altere apenas se a contagem física for diferente.
                  </p>
                </div>
                <div>
                  <Label>Observação</Label>
                  <Input
                    value={closingNote}
                    onChange={(e) => setClosingNote(e.target.value)}
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
                          const value = parseMoney(
                            countedCash === "" ? String(todayCash.expected_cash ?? 0) : countedCash,
                          );
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
                <MetricCard
                  icon={ReceiptText}
                  label="Esperado"
                  value={money(todayCash.expected_cash)}
                />
                <MetricCard icon={Banknote} label="Contado" value={money(todayCash.counted_cash)} />
                <MetricCard
                  icon={AlertTriangle}
                  label="Diferença"
                  value={money(todayCash.difference_amount)}
                />
              </div>
            )}
          </Panel>
          <Panel title="Histórico de caixas">
            <div className="space-y-2">
              {(data.cash ?? []).map((row: any) => (
                <div key={row.id} className="rounded-2xl border border-border p-4">
                  <div className="grid gap-2 sm:grid-cols-6 sm:items-center">
                    <strong>{formatDate(row.business_date)}</strong>
                    <span>Inicial {money(row.opening_cash)}</span>
                    <span>Esperado {money(row.expected_cash)}</span>
                    <span>Contado {money(row.counted_cash)}</span>
                    <span>Diferença {money(row.difference_amount)}</span>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                      {row.status === "closed" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingClosedCashId(String(row.id));
                            setCorrectedCountedCash(String(row.counted_cash ?? row.expected_cash ?? 0));
                            setClosedCorrectionReason("");
                          }}
                        >
                          Corrigir fechamento
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {editingClosedCashId === String(row.id) ? (
                    <div className="mt-3 grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-[1fr_1.6fr_auto]">
                      <div>
                        <Label className="text-xs">Dinheiro contado correto</Label>
                        <Input
                          value={correctedCountedCash}
                          onChange={(e) => setCorrectedCountedCash(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Motivo da correção</Label>
                        <Input
                          value={closedCorrectionReason}
                          onChange={(e) => setClosedCorrectionReason(e.target.value)}
                          placeholder="Ex.: caixa fechado sem informar a contagem"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy === `correct-closed-${row.id}`}
                          onClick={() =>
                            run(
                              `correct-closed-${row.id}`,
                              async () => {
                                const value = parseMoney(correctedCountedCash);
                                if (!Number.isFinite(value) || value < 0)
                                  throw new Error("Valor contado inválido.");
                                if (!closedCorrectionReason.trim())
                                  throw new Error("Informe o motivo da correção.");
                                const result = await db.rpc("correct_closed_cash_session", {
                                  _session_id: row.id,
                                  _counted_cash: value,
                                  _reason: closedCorrectionReason.trim(),
                                });
                                if (result.error) throw result.error;
                                setEditingClosedCashId("");
                                setCorrectedCountedCash("");
                                setClosedCorrectionReason("");
                              },
                              "Fechamento do caixa corrigido.",
                            )
                          }
                        >
                          Salvar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingClosedCashId("");
                            setCorrectedCountedCash("");
                            setClosedCorrectionReason("");
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : null}
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
                onChange={(e) => setProfessionalFilter(e.target.value)}
              >
                <option value="all">Todos os profissionais</option>
                {professionals.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
              >
                <option value="all">Todos os serviços</option>
                {services.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
              >
                <option value="all">Todas as formas</option>
                {methods.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Todos os status (inclui pendentes)</option>
                <option value="received">Recebido</option>
                <option value="pending">Pendente</option>
                <option value="refunded">Estornado</option>
              </select>
            </div>
          </Panel>
          <Panel
            title={
              statusFilter === "received"
                ? `Entradas recebidas (${filteredEntries.length})`
                : statusFilter === "pending"
                  ? `Entradas pendentes / a receber (${filteredEntries.length})`
                  : `Entradas (${filteredEntries.length})`
            }
            subtitle={
              statusFilter === "received"
                ? "Somente valores efetivamente recebidos entram como receita, líquido e resultado."
                : statusFilter === "pending"
                  ? "Valores pendentes ficam em contas a receber e só entram na receita quando forem pagos."
                  : undefined
            }
            collapsible
          >
            <div className="space-y-3">
              {groupedEntries.map(([date, rows]) => { const total=(rows as any[]).reduce((sum,row)=>sum+Number(row.net_amount ?? row.charged_amount ?? 0),0); return (
                <details key={date} className="group rounded-2xl border border-border bg-card">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
                    <div><strong className="text-sm">{formatDate(date)}</strong><p className="text-[11px] text-muted-foreground">{(rows as any[]).length} lançamento(s)</p></div>
                    <div className="flex items-center gap-2">
                      <strong className="text-primary">{money(total)}</strong>
                      <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                    </div>
                  </summary>
                  <div className="border-t border-border p-3"><EntryList rows={rows as any[]} /></div>
                </details>
              ); })}
              {!groupedEntries.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma entrada no período selecionado.</p> : null}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="expenses" className="mt-5 space-y-5">
          <Panel title="Nova despesa">
            <div className="grid gap-3 md:grid-cols-6">
              <Input
                type="date"
                value={expense.date}
                onChange={(e) => setExpense({ ...expense, date: e.target.value })}
              />
              <Input
                className="md:col-span-2"
                placeholder="Descrição"
                value={expense.description}
                onChange={(e) => setExpense({ ...expense, description: e.target.value })}
              />
              <Input
                placeholder="Valor"
                value={expense.amount}
                onChange={(e) => setExpense({ ...expense, amount: e.target.value })}
              />
              <select
                className={selectClass}
                value={expense.method}
                onChange={(e) => setExpense({ ...expense, method: e.target.value })}
              >
                {methods.map((m: any) => (
                  <option key={m.id} value={m.code}>
                    {m.name}
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
                onChange={(e) => setExpense({ ...expense, category: e.target.value })}
              >
                <option value="">Sem categoria</option>
                {(data.categories ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={expense.center}
                onChange={(e) => setExpense({ ...expense, center: e.target.value })}
              >
                <option value="">Sem centro de custo</option>
                {(data.centers ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </Panel>
          <Panel title="Despesas do período" collapsible>
            <div className="space-y-3">
              {groupedExpenses.map(([date, dayRows]) => { const dayTotal=(dayRows as any[]).reduce((sum,row)=>sum+Number(row.amount ?? 0),0); return (
              <details key={date} className="group rounded-2xl border border-border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
                  <div><strong className="text-sm">{formatDate(date)}</strong><p className="text-[11px] text-muted-foreground">{(dayRows as any[]).length} saída(s)</p></div>
                  <div className="flex items-center gap-2">
                    <strong className="text-destructive">{money(dayTotal)}</strong>
                    <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                  </div>
                </summary>
                <div className="space-y-2 border-t border-border p-3">
              {(dayRows as any[]).map((row: any) => (
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
                  <div className="text-right">
                    <strong>{money(row.amount)}</strong>
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === `edit-expense-${row.expense_id}` || busy === `delete-expense-${row.expense_id}`}
                        onClick={() => editExpenseAmount(row)}
                      >
                        Editar valor
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        disabled={busy === `delete-expense-${row.expense_id}`}
                        onClick={() => {
                          if (!window.confirm(`Excluir a despesa "${row.description}" de ${money(row.amount)}? Esta ação remove a saída dos relatórios e do caixa vinculado.`)) return;
                          run(
                            `delete-expense-${row.expense_id}`,
                            async () => {
                              const result = await db.rpc("delete_financial_expense", {
                                _expense_id: row.expense_id,
                              });
                              if (result.error) throw result.error;
                              if (editingExpenseId === String(row.expense_id)) resetExpenseEditor();
                            },
                            "Despesa excluída.",
                          );
                        }}
                      >
                        Excluir
                      </Button>
                    </div>
                  </div>
                  {editingExpenseId === String(row.expense_id) ? (
                    <div className="grid w-full gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div>
                        <Label className="text-xs">Novo valor da despesa</Label>
                        <Input
                          value={expenseEditAmount}
                          onChange={(e) => setExpenseEditAmount(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={busy === `edit-expense-${row.expense_id}`}
                          onClick={() =>
                            run(
                              `edit-expense-${row.expense_id}`,
                              async () => {
                                const value = parseMoney(expenseEditAmount);
                                if (!Number.isFinite(value) || value <= 0)
                                  throw new Error("Informe um valor maior que zero.");
                                const result = await db.rpc("update_financial_expense_amount", {
                                  _expense_id: row.expense_id,
                                  _amount: value,
                                });
                                if (result.error) throw result.error;
                                resetExpenseEditor();
                              },
                              "Valor da despesa atualizado.",
                            )
                          }
                        >
                          Salvar
                        </Button>
                        <Button size="sm" variant="outline" onClick={resetExpenseEditor}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
                </div>
              </details>
              ); })}
              {!groupedExpenses.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma saída no período selecionado.</p> : null}
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
                onChange={(e) => setPayable({ ...payable, title: e.target.value })}
              />
              <Input
                placeholder="Fornecedor"
                value={payable.supplier}
                onChange={(e) => setPayable({ ...payable, supplier: e.target.value })}
              />
              <Input
                placeholder="Valor"
                value={payable.amount}
                onChange={(e) => setPayable({ ...payable, amount: e.target.value })}
              />
              <Input
                type="date"
                value={payable.due}
                onChange={(e) => setPayable({ ...payable, due: e.target.value })}
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
                onChange={(e) => setPayable({ ...payable, recurrence: e.target.value })}
              >
                <option value="none">Conta variável</option>
                <option value="monthly">Fixa mensal</option>
                <option value="weekly">Fixa semanal</option>
                <option value="yearly">Fixa anual</option>
              </select>
              <select
                className={selectClass}
                value={payable.category}
                onChange={(e) => setPayable({ ...payable, category: e.target.value })}
              >
                <option value="">Sem categoria</option>
                {(data.categories ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={payable.center}
                onChange={(e) => setPayable({ ...payable, center: e.target.value })}
              >
                <option value="">Sem centro</option>
                {(data.centers ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </Panel>
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel
              title="Contas a pagar"
              subtitle="Valor e vencimento podem ser editados enquanto a conta estiver pendente."
            >
              <select
                className={`${selectClass} mb-3`}
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                {methods.map((m: any) => (
                  <option key={m.id} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div className="space-y-2">
                {(data.payables ?? []).map((row: any) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"
                  >
                    <div>
                      <strong className="text-sm">{row.title}</strong>
                      <p className="text-xs text-muted-foreground">
                        Vence {formatDate(row.due_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <strong>{money(row.amount)}</strong>
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <Badge variant={statusVariant(row.display_status)}>
                          {statusLabel(row.display_status)}
                        </Badge>
                        {row.status === "paid" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === `reverse-receivable-${row.id}`}
                            onClick={() => {
                              if (!window.confirm(`Reverter a baixa de ${row.client_name_snapshot}? O valor sairá das entradas e esta conta voltará para Pendente.`)) return;
                              run(
                                `reverse-receivable-${row.id}`,
                                async () => {
                                  const result = await db.rpc("reverse_account_receivable_payment", {
                                    _receivable_id: row.id,
                                  });
                                  if (result.error) throw result.error;
                                },
                                "Baixa revertida. A conta voltou para Pendente.",
                              );
                            }}
                          >
                            Reverter baixa
                          </Button>
                        ) : null}
                        {row.status === "pending" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === `pay-${row.id}`}
                              onClick={() => editPendingPayable(row)}
                            >
                              Editar
                            </Button>
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
                                    if (editingPayableId === String(row.id)) resetPayableEditor();
                                  },
                                  "Conta paga.",
                                )
                              }
                            >
                              Pagar
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {editingPayableId === String(row.id) ? (
                      <div className="grid w-full gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                        <div>
                          <Label className="text-xs">Valor</Label>
                          <Input
                            value={payableEdit.amount}
                            onChange={(e) =>
                              setPayableEdit({ ...payableEdit, amount: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Vencimento</Label>
                          <Input
                            type="date"
                            value={payableEdit.due}
                            onChange={(e) =>
                              setPayableEdit({ ...payableEdit, due: e.target.value })
                            }
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={busy === `edit-payable-${row.id}`}
                            onClick={() =>
                              run(
                                `edit-payable-${row.id}`,
                                async () => {
                                  const value = parseMoney(payableEdit.amount);
                                  if (!Number.isFinite(value) || value <= 0)
                                    throw new Error("Informe um valor maior que zero.");
                                  if (!payableEdit.due)
                                    throw new Error("Informe a data de vencimento.");
                                  const result = await db.rpc("update_pending_account_payable", {
                                    _account_id: row.id,
                                    _amount: value,
                                    _due_date: payableEdit.due,
                                  });
                                  if (result.error) throw result.error;
                                  resetPayableEditor();
                                },
                                "Conta atualizada.",
                              )
                            }
                          >
                            Salvar
                          </Button>
                          <Button size="sm" variant="outline" onClick={resetPayableEditor}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
            <Panel
              title="Contas a receber / fiado"
              subtitle="Valor e vencimento podem ser editados enquanto a conta estiver pendente e ainda não tiver recebido pagamento."
            >
              <select
                className={`${selectClass} mb-3`}
                value={receiveMethod}
                onChange={(e) => setReceiveMethod(e.target.value)}
              >
                {methods.map((m: any) => (
                  <option key={m.id} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div className="mb-3 flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowPaidReceivables((current) => !current)}
                >
                  {showPaidReceivables ? "Ocultar baixadas" : "Mostrar baixadas"}
                </Button>
              </div>
              <div className="space-y-2">
                {(data.receivables ?? []).filter((row: any) => showPaidReceivables || row.status === "pending").map((row: any) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"
                  >
                    <div>
                      <strong className="text-sm">{row.client_name_snapshot}</strong>
                      <p className="text-xs text-muted-foreground">
                        {row.service_name_snapshot || "Valor a receber"} · vence{" "}
                        {formatDate(row.due_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <strong>
                        {row.status === "paid"
                          ? money(Number(row.amount_received || row.original_amount))
                          : money(Number(row.original_amount) - Number(row.amount_received))}
                      </strong>
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <Badge variant={statusVariant(row.display_status)}>
                          {statusLabel(row.display_status)}
                        </Badge>
                        {row.status === "pending" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === `receive-${row.id}`}
                              onClick={() => editPendingReceivable(row)}
                            >
                              Editar
                            </Button>
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
                                    if (editingReceivableId === String(row.id))
                                      resetReceivableEditor();
                                  },
                                  "Recebimento registrado.",
                                )
                              }
                            >
                              Receber
                            </Button>
                          </>
                        ) : row.status === "paid" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === `reverse-receivable-${row.id}`}
                            onClick={() =>
                              run(
                                `reverse-receivable-${row.id}`,
                                async () => {
                                  const result = await db.rpc("reverse_account_receivable_payment", {
                                    _receivable_id: row.id,
                                  });
                                  if (result.error) throw result.error;
                                },
                                "Baixa desfeita. A conta voltou para pendente e a entrada correspondente foi revertida.",
                              )
                            }
                          >
                            Desfazer pagamento
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {editingReceivableId === String(row.id) ? (
                      <div className="grid w-full gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                        <div>
                          <Label className="text-xs">Valor total a receber</Label>
                          <Input
                            value={receivableEdit.amount}
                            onChange={(e) =>
                              setReceivableEdit({ ...receivableEdit, amount: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Vencimento</Label>
                          <Input
                            type="date"
                            value={receivableEdit.due}
                            onChange={(e) =>
                              setReceivableEdit({ ...receivableEdit, due: e.target.value })
                            }
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={busy === `edit-receivable-${row.id}`}
                            onClick={() =>
                              run(
                                `edit-receivable-${row.id}`,
                                async () => {
                                  const value = parseMoney(receivableEdit.amount);
                                  if (!Number.isFinite(value) || value <= 0)
                                    throw new Error("Informe um valor maior que zero.");
                                  if (!receivableEdit.due)
                                    throw new Error("Informe a data de vencimento.");
                                  const result = await db.rpc("update_pending_account_receivable", {
                                    _receivable_id: row.id,
                                    _original_amount: value,
                                    _due_date: receivableEdit.due,
                                  });
                                  if (result.error) throw result.error;
                                  resetReceivableEditor();
                                },
                                "Conta a receber atualizada.",
                              )
                            }
                          >
                            Salvar
                          </Button>
                          <Button size="sm" variant="outline" onClick={resetReceivableEditor}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="commissions" className="mt-5 space-y-5">
          <Panel title="Fechamento por profissional">
            <div className="grid gap-3 md:grid-cols-4">
              <select
                className={selectClass}
                value={settlement.professional}
                onChange={(e) => setSettlement({ ...settlement, professional: e.target.value })}
              >
                <option value="">Selecione o profissional</option>
                {professionals.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Input
                type="date"
                value={settlement.start}
                onChange={(e) => setSettlement({ ...settlement, start: e.target.value })}
              />
              <Input
                type="date"
                value={settlement.end}
                onChange={(e) => setSettlement({ ...settlement, end: e.target.value })}
              />
              <Button
                disabled={busy === "settlement"}
                onClick={() =>
                  run(
                    "settlement",
                    async () => {
                      if (!settlement.professional) throw new Error("Selecione o profissional.");
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
          <Panel
            title="Comissões zeradas e agendamentos antigos"
            subtitle="Regularize atendimentos que ficaram com comissão zerada por falta de regra e também agendamentos antigos. A regra atual da profissional é aplicada sem alterar o faturamento original."
          >
            {historicalCommissionCandidates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhuma comissão zerada aguardando regularização.
              </div>
            ) : (
              <div className="space-y-2">
                {historicalCommissionCandidates.map(({ row, preview }: any) => {
                  const context = commissionContext(row, professionals);
                  return (
                    <div
                      key={row.id}
                      className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <strong className="text-sm">{context.patient}</strong>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {context.professional} · {context.service} · {context.date}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {preview.isHistorical ? "Agendamento antigo" : "Comissão zerada"} · Líquido {money(preview.net)} · Regra atual: {preview.ruleLabel} · Comissão prevista {money(preview.amount)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0"
                        disabled={busy === `historical-commission-${row.id}`}
                        onClick={() =>
                          run(
                            `historical-commission-${row.id}`,
                            async () => {
                              const result = await db.rpc("generate_historical_commission", {
                                _commission_id: row.id,
                              });
                              if (result.error) throw result.error;
                            },
                            "Comissão recalculada com a regra atual.",
                          )
                        }
                      >
                        {busy === `historical-commission-${row.id}` ? "Aplicando..." : "Aplicar regra atual"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
          <Panel title="Ajuste manual de comissão">
            <div className="grid gap-3 md:grid-cols-4">
              <select
                className={selectClass}
                value={override.commission}
                onChange={(e) => setOverride({ ...override, commission: e.target.value })}
              >
                <option value="">Comissão pendente</option>
                {(data.commissions ?? [])
                  .filter((c: any) => c.status === "pending")
                  .map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {commissionContext(c, professionals).label}
                    </option>
                  ))}
              </select>
              <Input
                placeholder="Novo valor"
                value={override.amount}
                onChange={(e) => setOverride({ ...override, amount: e.target.value })}
              />
              <Input
                placeholder="Motivo obrigatório"
                value={override.reason}
                onChange={(e) => setOverride({ ...override, reason: e.target.value })}
              />
              <Button
                disabled={busy === "override"}
                onClick={() =>
                  run(
                    "override",
                    async () => {
                      const value = parseMoney(override.amount);
                      if (
                        !override.commission ||
                        !Number.isFinite(value) ||
                        !override.reason.trim()
                      )
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
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border p-4"
                  >
                    <div>
                      <strong className="text-sm">
                        {commissionContext(row, professionals).professional}
                      </strong>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {commissionContext(row, professionals).patient} ·{" "}
                        {commissionContext(row, professionals).service}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {commissionContext(row, professionals).date} · {row.commission_type}
                        {row.is_manual_override ? " · ajuste manual" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <strong>{money(row.commission_amount)}</strong>
                      <br />
                      <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
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
                          {formatDate(row.period_start)} — {formatDate(row.period_end)}
                        </strong>
                        <p className="text-xs text-muted-foreground">
                          {row.procedures_count} atendimentos · comissão{" "}
                          {money(row.commission_total)}
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
                <FileSpreadsheet className="mr-2 size-4" />
                Exportar Excel
              </Button>
              <Button
                variant="outline"
                onClick={() => printReport(filteredEntries, data.expenses ?? [], from, to)}
              >
                <Printer className="mr-2 size-4" />
                PDF / Imprimir
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
            <Panel
              title="Taxas das formas de pagamento"
              subtitle="A porcentagem cadastrada é a taxa total aplicada à transação nessa quantidade/faixa de parcelas; não é uma cobrança mensal repetida a cada parcela."
            >
              {editingFeeId ? (
                <div className="mb-4 rounded-2xl border border-primary/15 bg-primary-soft/50 px-4 py-3 text-xs text-primary">
                  Editando uma taxa. A nova configuração valerá a partir da data escolhida e o
                  histórico financeiro já calculado será preservado.
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className={selectClass}
                  value={fee.method}
                  onChange={(e) => setFee({ ...fee, method: e.target.value })}
                >
                  {methods
                    .filter((m: any) => m.code !== "pix" && (m.is_card || m.code === "pix_machine"))
                    .map((m: any) => (
                      <option key={m.id} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                </select>
                <Input
                  placeholder="Taxa total %"
                  value={fee.percent}
                  onChange={(e) => setFee({ ...fee, percent: e.target.value })}
                />
                <Input
                  placeholder="Taxa fixa"
                  value={fee.fixed}
                  onChange={(e) => setFee({ ...fee, fixed: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Parcela mínima (1 a 12)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="12"
                      value={fee.min}
                      onChange={(e) => setFee({ ...fee, min: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Parcela máxima (1 a 12)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="12"
                      value={fee.max}
                      onChange={(e) => setFee({ ...fee, max: e.target.value })}
                    />
                  </div>
                </div>
                <Input
                  type="date"
                  value={fee.effective}
                  onChange={(e) => setFee({ ...fee, effective: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
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
                          const min = Number(fee.min);
                          const max = Number(fee.max);
                          if (!Number.isInteger(min) || min < 1 || min > 12)
                            throw new Error("Parcela mínima deve ficar entre 1 e 12.");
                          if (!Number.isInteger(max) || max < 1 || max > 12)
                            throw new Error("Parcela máxima deve ficar entre 1 e 12.");
                          if (max < min)
                            throw new Error(
                              "Parcela máxima deve ser maior ou igual à parcela mínima.",
                            );
                          const result = await db.rpc("set_payment_method_fee", {
                            _payment_method_code: fee.method,
                            _fee_percent: percent,
                            _fixed_fee: fixed,
                            _installments_min: min,
                            _installments_max: max,
                            _effective_from: fee.effective,
                          });
                          if (result.error) throw result.error;
                          resetFeeEditor();
                        },
                        editingFeeId ? "Taxa atualizada." : "Taxa configurada.",
                      )
                    }
                  >
                    {editingFeeId ? "Atualizar taxa" : "Salvar taxa"}
                  </Button>
                  {editingFeeId ? (
                    <Button variant="outline" disabled={busy === "fee"} onClick={resetFeeEditor}>
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {(data.fees ?? [])
                  .filter(
                    (f: any) =>
                      f.is_active && (!f.effective_to || f.effective_to >= fortalezaIso()),
                  )
                  .map((f: any) => (
                    <div
                      key={f.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-xs"
                    >
                      <div>
                        <div>
                          {methodMap.get(f.payment_method_id) || "Pagamento"} · taxa total{" "}
                          {Number(f.fee_percent)}%
                          {Number(f.fixed_fee) > 0 ? ` + ${money(f.fixed_fee)}` : ""} ·{" "}
                          {Number(f.installments_min) === Number(f.installments_max)
                            ? `${f.installments_min}x`
                            : `${f.installments_min}x a ${f.installments_max}x`}{" "}
                          · desde {formatDate(f.effective_from)}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Percentual aplicado uma única vez sobre o valor da transação.
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => editPaymentFee(f)}>
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          disabled={busy === `fee-disable-${f.id}`}
                          onClick={() => {
                            if (
                              !window.confirm(
                                "Excluir esta taxa da configuração atual? O histórico financeiro já calculado será preservado.",
                              )
                            )
                              return;
                            run(
                              `fee-disable-${f.id}`,
                              async () => {
                                const result = await db.rpc("deactivate_payment_method_fee", {
                                  _fee_id: f.id,
                                });
                                if (result.error) throw result.error;
                                if (editingFeeId === String(f.id)) resetFeeEditor();
                              },
                              "Taxa removida da configuração atual.",
                            );
                          }}
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </Panel>
            <Panel title="Regra de comissão">
              {editingRuleId ? (
                <div className="mb-4 rounded-2xl border border-primary/15 bg-primary-soft/50 px-4 py-3 text-xs text-primary">
                  Editando uma regra existente. A alteração valerá a partir da data escolhida
                  abaixo, preservando o histórico anterior de comissões.
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className={selectClass}
                  value={rule.professional}
                  onChange={(e) => setRule({ ...rule, professional: e.target.value })}
                >
                  <option value="">Profissional</option>
                  {professionals.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  className={selectClass}
                  value={rule.type}
                  onChange={(e) => setRule({ ...rule, type: e.target.value })}
                >
                  <option value="percentage">Percentual</option>
                  <option value="fixed_per_patient">Valor por paciente</option>
                  <option value="manual">Manual</option>
                </select>
                <Input
                  placeholder={rule.type === "percentage" ? "Percentual" : "Valor fixo"}
                  value={rule.value}
                  onChange={(e) => setRule({ ...rule, value: e.target.value })}
                  disabled={rule.type === "manual"}
                />
                <select
                  className={selectClass}
                  value={rule.base}
                  onChange={(e) => setRule({ ...rule, base: e.target.value })}
                >
                  <option value="net_after_fees">Líquido após taxas</option>
                  <option value="after_discount">Após desconto</option>
                  <option value="original">Valor original</option>
                </select>
                <Input
                  type="date"
                  value={rule.effective}
                  onChange={(e) => setRule({ ...rule, effective: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={busy === "rule"}
                    onClick={() =>
                      run(
                        "rule",
                        async () => {
                          if (!rule.professional) throw new Error("Selecione o profissional.");
                          const value = parseMoney(rule.value || "0");
                          const result = await db.rpc("set_professional_commission_rule", {
                            _professional_id: rule.professional,
                            _commission_type: rule.type,
                            _percentage: rule.type === "percentage" ? value : null,
                            _fixed_amount: rule.type === "fixed_per_patient" ? value : null,
                            _calculation_base: rule.base,
                            _effective_from: rule.effective,
                          });
                          if (result.error) throw result.error;
                          resetRuleEditor();
                        },
                        editingRuleId
                          ? "Regra de comissão atualizada."
                          : "Regra de comissão salva.",
                      )
                    }
                  >
                    {editingRuleId ? "Atualizar regra" : "Salvar regra"}
                  </Button>
                  {editingRuleId ? (
                    <Button variant="outline" disabled={busy === "rule"} onClick={resetRuleEditor}>
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {(data.rules ?? [])
                  .filter((r: any) => r.is_active && r.effective_to == null)
                  .map((r: any) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-xs"
                    >
                      <div>
                        <div>
                          {professionals.find((p: any) => p.id === r.professional_id)?.name ||
                            String(r.professional_id).slice(0, 8)}{" "}
                          ·{" "}
                          {r.commission_type === "percentage"
                            ? `${Number(r.percentage)}%`
                            : r.commission_type === "fixed_per_patient"
                              ? `${money(r.fixed_amount)} por paciente`
                              : "Manual"}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {r.calculation_base === "net_after_fees"
                            ? "Líquido após taxas"
                            : r.calculation_base === "after_discount"
                              ? "Após desconto"
                              : "Valor original"}{" "}
                          · vigente desde {formatDate(r.effective_from)}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => editCommissionRule(r)}>
                        Editar
                      </Button>
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
  const [editingOpeningCash, setEditingOpeningCash] = useState(false);
  const [correctedOpeningCash, setCorrectedOpeningCash] = useState("");
  const [openingCorrectionReason, setOpeningCorrectionReason] = useState("");
  const [editingClosedCash, setEditingClosedCash] = useState(false);
  const [correctedClosedCount, setCorrectedClosedCount] = useState("");
  const [closedCorrectionReason, setClosedCorrectionReason] = useState("");
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
              <Input value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
              <Button
                onClick={() =>
                  run(
                    "open",
                    async () => {
                      const result = await db.rpc("open_cash_session", {
                        _opening_cash: parseMoney(openingCash),
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
            <div className="space-y-4">
              <div className="rounded-2xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Fundo inicial informado</p>
                    <strong className="text-lg">{money(todayCash.opening_cash)}</strong>
                  </div>
                  {!editingOpeningCash ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCorrectedOpeningCash(String(todayCash.opening_cash ?? "0"));
                        setOpeningCorrectionReason("");
                        setEditingOpeningCash(true);
                      }}
                    >
                      Corrigir abertura
                    </Button>
                  ) : null}
                </div>
                {editingOpeningCash ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.6fr_auto]">
                    <Input
                      value={correctedOpeningCash}
                      onChange={(e) => setCorrectedOpeningCash(e.target.value)}
                      placeholder="Novo fundo inicial"
                    />
                    <Input
                      value={openingCorrectionReason}
                      onChange={(e) => setOpeningCorrectionReason(e.target.value)}
                      placeholder="Motivo da correção"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy === "correct-opening"}
                        onClick={() =>
                          run(
                            "correct-opening",
                            async () => {
                              const value = parseMoney(correctedOpeningCash);
                              if (!Number.isFinite(value) || value < 0)
                                throw new Error("Fundo inicial inválido.");
                              if (!openingCorrectionReason.trim())
                                throw new Error("Informe o motivo da correção.");
                              const result = await db.rpc("correct_open_cash_session", {
                                _session_id: todayCash.id,
                                _opening_cash: value,
                                _reason: openingCorrectionReason.trim(),
                              });
                              if (result.error) throw result.error;
                              setEditingOpeningCash(false);
                              setCorrectedOpeningCash("");
                              setOpeningCorrectionReason("");
                            },
                            "Abertura do caixa corrigida.",
                          )
                        }
                      >
                        Salvar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy === "correct-opening"}
                        onClick={() => {
                          setEditingOpeningCash(false);
                          setCorrectedOpeningCash("");
                          setOpeningCorrectionReason("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : null}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  A correção altera apenas o fundo inicial. Recebimentos e despesas do dia continuam intactos.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Input
                  placeholder="Dinheiro contado"
                  value={counted === "" ? String(todayCash.expected_cash ?? 0) : counted}
                  onChange={(e) => setCounted(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Valor preenchido automaticamente. Altere somente se a contagem física for diferente.
                </p>
              </div>
              <Input
                placeholder="Observação"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button
                disabled={busy === "close"}
                onClick={() =>
                  run(
                    "close",
                    async () => {
                      const result = await db.rpc("close_cash_session", {
                        _session_id: todayCash.id,
                        _counted_cash: parseMoney(
                          counted === "" ? String(todayCash.expected_cash ?? 0) : counted,
                        ),
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
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard
                  icon={ReceiptText}
                  label="Esperado"
                  value={money(todayCash.expected_cash)}
                />
                <MetricCard icon={Banknote} label="Contado" value={money(todayCash.counted_cash)} />
                <MetricCard
                  icon={AlertTriangle}
                  label="Diferença"
                  value={money(todayCash.difference_amount)}
                />
              </div>
              {!editingClosedCash ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCorrectedClosedCount(String(todayCash.counted_cash ?? todayCash.expected_cash ?? 0));
                    setClosedCorrectionReason("");
                    setEditingClosedCash(true);
                  }}
                >
                  Corrigir fechamento
                </Button>
              ) : (
                <div className="grid gap-2 rounded-2xl border border-border p-3 sm:grid-cols-[1fr_1.6fr_auto]">
                  <Input
                    value={correctedClosedCount}
                    onChange={(e) => setCorrectedClosedCount(e.target.value)}
                    placeholder="Dinheiro contado correto"
                  />
                  <Input
                    value={closedCorrectionReason}
                    onChange={(e) => setClosedCorrectionReason(e.target.value)}
                    placeholder="Motivo da correção"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy === "correct-closed"}
                      onClick={() =>
                        run(
                          "correct-closed",
                          async () => {
                            const value = parseMoney(correctedClosedCount);
                            if (!Number.isFinite(value) || value < 0)
                              throw new Error("Valor contado inválido.");
                            if (!closedCorrectionReason.trim())
                              throw new Error("Informe o motivo da correção.");
                            const result = await db.rpc("correct_closed_cash_session", {
                              _session_id: todayCash.id,
                              _counted_cash: value,
                              _reason: closedCorrectionReason.trim(),
                            });
                            if (result.error) throw result.error;
                            setEditingClosedCash(false);
                            setCorrectedClosedCount("");
                            setClosedCorrectionReason("");
                          },
                          "Fechamento do caixa corrigido.",
                        )
                      }
                    >
                      Salvar
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditingClosedCash(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>
        <Panel title="Receber valores pendentes">
          <select
            className={`${selectClass} mb-3 max-w-xs`}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {(data.methods ?? []).map((m: any) => (
              <option key={m.id} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
          <div className="space-y-2">
            {(data.receivables ?? [])
              .filter((r: any) => r.status === "pending")
              .map((row: any) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between rounded-2xl border border-border p-4"
                >
                  <div>
                    <strong>{row.client_name_snapshot}</strong>
                    <p className="text-xs text-muted-foreground">
                      Vence {formatDate(row.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <strong>
                      {money(Number(row.original_amount) - Number(row.amount_received))}
                    </strong>
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

function Panel({
  title,
  subtitle,
  children,
  collapsible = false,
}: {
  title: string;
  subtitle?: string | undefined;
  children: any;
  collapsible?: boolean;
}) {
  if (collapsible) {
    return (
      <details className="group rounded-3xl border border-border bg-card shadow-soft">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-3xl p-5 transition-colors hover:bg-secondary/30 sm:p-6">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground transition-colors group-open:bg-primary-soft group-open:text-primary">
            <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" />
          </span>
        </summary>
        <div className="border-t border-border p-5 sm:p-6">{children}</div>
      </details>
    );
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EntryList({ rows }: { rows: any[] }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState("");

  const startEdit = (row: any) => {
    setEditingId(String(row.entry_id ?? row.id));
    setAmount(String(row.charged_amount ?? ""));
  };

  const cancelEdit = () => {
    setEditingId("");
    setAmount("");
  };

  const saveAmount = async (row: any) => {
    const entryId = String(row.entry_id ?? row.id ?? "");
    const value = parseMoney(amount);
    if (!entryId) {
      toast.error("Entrada financeira não identificada.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (!window.confirm(`Alterar o valor desta entrada para ${money(value)}? Taxas e comissão vinculada serão recalculadas quando aplicável.`)) return;

    setBusy(entryId);
    try {
      const result = await db.rpc("update_financial_entry_amount", {
        _entry_id: entryId,
        _amount: value,
      });
      if (result.error) throw result.error;
      toast.success("Valor da entrada atualizado.");
      cancelEdit();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance-full-v2"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-completion-report"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-completion-lookups"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-commission-payments-grouped"] }),
        queryClient.invalidateQueries({ queryKey: ["professional-own-commissions"] }),
      ]);
    } catch (error: any) {
      toast.error("Não foi possível editar a entrada.", {
        description: error?.message || "Tente novamente.",
      });
    } finally {
      setBusy("");
    }
  };

  const deleteEntry = async (row: any) => {
    const entryId = String(row.entry_id ?? row.id ?? "");
    if (!entryId) {
      toast.error("Entrada financeira não identificada.");
      return;
    }
    const label = row.patient_name_snapshot || row.service_name_snapshot || "esta entrada";
    if (!window.confirm(`Excluir ${label}? Esta ação remove a entrada do financeiro e não pode ser desfeita.`)) return;

    setBusy(`delete-${entryId}`);
    try {
      const result = await db.rpc("delete_financial_entry", { _entry_id: entryId });
      if (result.error) throw result.error;
      toast.success("Entrada excluída.");
      if (editingId === entryId) cancelEdit();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance-full-v2"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-completion-report"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-completion-lookups"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-commission-payments-grouped"] }),
        queryClient.invalidateQueries({ queryKey: ["professional-own-commissions"] }),
      ]);
    } catch (error: any) {
      toast.error("Não foi possível excluir a entrada.", {
        description: error?.message || "Tente novamente.",
      });
    } finally {
      setBusy("");
    }
  };

  if (!rows.length)
    return <p className="text-sm text-muted-foreground">Nenhum lançamento no período.</p>;
  return (
    <div className="space-y-2">
      {rows.map((row: any) => {
        const entryId = String(row.entry_id ?? row.id ?? "");
        const editing = editingId === entryId;
        return (
          <div
            key={entryId}
            className="grid gap-3 rounded-2xl border border-border p-4 lg:grid-cols-[1.6fr_1fr_1fr_auto] lg:items-center"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">{row.patient_name_snapshot || "Atendimento"}</p>
              <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">Serviços realizados:</span>
                {entryServiceItems(row).map((item: any, index: number) => (
                  <div key={`${item.name}-${index}`} className="flex max-w-xl items-start justify-between gap-3 rounded-lg bg-muted/40 px-2.5 py-1.5">
                    <span className="min-w-0 break-words">{item.name}</span>
                    {item.price_snapshot == null ? null : <strong className="shrink-0 font-medium text-foreground/80">{money(item.price_snapshot)}</strong>}
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
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
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy === `delete-${entryId}`} onClick={() => startEdit(row)}>
                  Editar valor
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={busy === `delete-${entryId}`}
                  onClick={() => deleteEntry(row)}
                >
                  Excluir
                </Button>
              </div>
            </div>
            <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
            {editing ? (
              <div className="grid gap-3 border-t border-border pt-3 lg:col-span-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <Label className="text-xs">Novo valor bruto da entrada</Label>
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Ao salvar, o sistema recalcula a taxa da forma de pagamento, o valor líquido e a comissão vinculada quando houver.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy === entryId} onClick={() => saveAmount(row)}>
                    Salvar
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === entryId} onClick={cancelEdit}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
