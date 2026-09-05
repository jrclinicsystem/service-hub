/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  FileSpreadsheet,
  FileText,
  Printer,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

const reportSections = [
  ["day", "Diário"],
  ["week", "Semanal"],
  ["fortnight", "Quinzenal"],
  ["month", "Mensal"],
  ["professional", "Por profissional / comissões"],
  ["service", "Por serviço"],
  ["payment_method", "Por forma de pagamento"],
  ["expense_category", "Despesas por categoria"],
  ["cost_center", "Por área / centro de custo"],
] as const;

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

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return date.toLocaleDateString("pt-BR", {
    timeZone: value.includes("T") ? "America/Fortaleza" : undefined,
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printHtml(title: string, body: string) {
  const popup = window.open("", "_blank", "width=1100,height=800");
  if (!popup) {
    toast.error("O navegador bloqueou a janela do relatório.");
    return;
  }
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title,
  )}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#222}h1{margin:0 0 6px}p{color:#666}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{border:1px solid #ddd;padding:8px;font-size:12px;text-align:left}th{background:#f5f5f5}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.box{border:1px solid #ddd;padding:12px;border-radius:8px}.value{font-size:18px;font-weight:700;margin-top:4px}@media print{button{display:none}}</style></head><body>${body}<button onclick="window.print()">Imprimir / Salvar em PDF</button></body></html>`);
  popup.document.close();
  popup.focus();
}

async function loadAccess() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sessão expirada.");
  const access = await db
    .from("financial_access")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("is_active", true);
  if (access.error) throw access.error;
  const roles = (access.data ?? []).map((row: any) => String(row.role));
  return {
    user: data.user,
    full: roles.includes("admin") || roles.includes("finance"),
  };
}

async function loadLookups() {
  const results = await Promise.all([
    db.from("accounts_payable_with_status").select("*").order("due_date", { ascending: true }),
    db
      .from("accounts_receivable_with_status")
      .select("*")
      .order("due_date", { ascending: true }),
    db.from("services").select("id,name,is_active").eq("is_active", true).order("name"),
    db.from("cost_centers").select("id,code,name,is_active").eq("is_active", true).order("name"),
    db.from("service_cost_centers").select("service_id,cost_center_id"),
    db.from("payment_methods").select("id,code,name").eq("is_active", true).order("sort_order"),
    db.from("expense_categories").select("id,name").eq("is_active", true).order("name"),
    db
      .from("financial_report_entries")
      .select("professional_id,professional_name_snapshot,service_id,service_name_snapshot")
      .limit(2000),
    db.from("professional_settlements").select("*").order("period_end", { ascending: false }).limit(200),
  ]);
  for (const result of results) if (result.error) throw result.error;
  return {
    payables: results[0].data ?? [],
    receivables: results[1].data ?? [],
    services: results[2].data ?? [],
    centers: results[3].data ?? [],
    mappings: results[4].data ?? [],
    methods: results[5].data ?? [],
    categories: results[6].data ?? [],
    entries: results[7].data ?? [],
    settlements: results[8].data ?? [],
  };
}

async function loadReport(filters: {
  from: string;
  to: string;
  professional: string;
  service: string;
  method: string;
  category: string;
  center: string;
  status: string;
}) {
  const result = await db.rpc("get_financial_report_breakdowns", {
    _from: filters.from,
    _to: filters.to,
    _professional_id: filters.professional || null,
    _service_id: filters.service || null,
    _payment_method_id: filters.method || null,
    _expense_category_id: filters.category || null,
    _cost_center_id: filters.center || null,
    _status: filters.status || null,
  });
  if (result.error) throw result.error;
  return result.data ?? [];
}

async function loadCashByDate(date: string) {
  const result = await db
    .from("financial_cash_report")
    .select("*")
    .eq("business_date", date)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ?? null;
}

function AlertList({ title, rows, kind }: { title: string; rows: any[]; kind: "pay" | "receive" }) {
  const active = rows.filter((row) => row.alert_status && row.alert_status !== "none");
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-amber-600" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="mt-4 space-y-2">
        {active.length ? (
          active.slice(0, 12).map((row) => {
            const overdue = row.alert_status === "overdue";
            const today = row.alert_status === "due_today";
            const label = overdue
              ? `${Math.abs(Number(row.days_until_due))} dia(s) em atraso`
              : today
                ? "Vence hoje"
                : `Vence em ${row.days_until_due} dia(s)`;
            return (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-3"
              >
                <div>
                  <strong className="text-sm">
                    {kind === "pay" ? row.title : row.client_name_snapshot}
                  </strong>
                  <p className="text-xs text-muted-foreground">
                    {label} · {formatDate(row.due_date)}
                  </p>
                </div>
                <div className="text-right">
                  <strong className="text-sm">
                    {money(
                      kind === "pay"
                        ? row.amount
                        : Number(row.original_amount) - Number(row.amount_received),
                    )}
                  </strong>
                  <div className="mt-1">
                    <Badge variant={overdue ? "destructive" : "secondary"}>
                      {overdue ? "Atrasado" : today ? "Hoje" : "Próximo"}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum alerta de vencimento.</p>
        )}
      </div>
    </section>
  );
}

function exportReport(rows: any[], title: string, from: string, to: string) {
  const tableRows = rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.quantity)}</td><td>${escapeHtml(row.gross_amount)}</td><td>${escapeHtml(row.fee_amount)}</td><td>${escapeHtml(row.net_amount)}</td><td>${escapeHtml(row.commission_amount)}</td><td>${escapeHtml(row.clinic_amount)}</td><td>${escapeHtml(row.expense_amount)}</td><td>${escapeHtml(row.result_amount)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><meta charset="utf-8"><body><h2>JR Clinic - ${escapeHtml(title)}</h2><p>${escapeHtml(from)} a ${escapeHtml(to)}</p><table border="1"><tr><th>Grupo</th><th>Qtd.</th><th>Faturamento</th><th>Taxas</th><th>Líquido</th><th>Comissões</th><th>Clínica</th><th>Despesas</th><th>Resultado</th></tr>${tableRows}</table></body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `jr-clinic-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${from}-${to}.xls`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function printReport(rows: any[], title: string, from: string, to: string) {
  const tableRows = rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.quantity)}</td><td>${money(row.gross_amount)}</td><td>${money(row.fee_amount)}</td><td>${money(row.net_amount)}</td><td>${money(row.commission_amount)}</td><td>${money(row.clinic_amount)}</td><td>${money(row.expense_amount)}</td><td>${money(row.result_amount)}</td></tr>`,
    )
    .join("");
  printHtml(
    title,
    `<h1>JR Clinic — ${escapeHtml(title)}</h1><p>Período: ${formatDate(from)} a ${formatDate(to)}</p><table><tr><th>Grupo</th><th>Qtd.</th><th>Faturamento</th><th>Taxas</th><th>Líquido</th><th>Comissões</th><th>Clínica</th><th>Despesas</th><th>Resultado</th></tr>${tableRows}</table>`,
  );
}

function printCash(row: any) {
  printHtml(
    `Fechamento de caixa ${formatDate(row.business_date)}`,
    `<h1>JR Clinic — Fechamento de Caixa</h1><p>Data: ${formatDate(row.business_date)}</p><div class="grid"><div class="box">Aberto por<div class="value">${escapeHtml(row.opened_by_label || row.opened_by)}</div><small>${formatDateTime(row.opened_at)}</small></div><div class="box">Fechado por<div class="value">${escapeHtml(row.closed_by_label || row.closed_by || "—")}</div><small>${formatDateTime(row.closed_at)}</small></div><div class="box">Status<div class="value">${escapeHtml(row.status)}</div></div></div><table><tr><th>Fundo inicial</th><th>Dinheiro</th><th>Pix</th><th>Débito</th><th>Crédito</th><th>Link</th><th>Saídas dinheiro</th></tr><tr><td>${money(row.opening_cash)}</td><td>${money(row.total_cash)}</td><td>${money(row.total_pix)}</td><td>${money(row.total_debit)}</td><td>${money(row.total_credit)}</td><td>${money(row.total_link)}</td><td>${money(row.total_cash_expenses)}</td></tr></table><div class="grid"><div class="box">Esperado em espécie<div class="value">${money(row.expected_cash)}</div></div><div class="box">Contado<div class="value">${money(row.counted_cash)}</div></div><div class="box">Diferença<div class="value">${money(row.difference_amount)}</div></div></div><p><strong>Observação:</strong> ${escapeHtml(row.closing_note || "Sem observação")}</p>`,
  );
}

function printSettlement(row: any, professionalName: string) {
  printHtml(
    `Fechamento profissional ${professionalName}`,
    `<h1>JR Clinic — Fechamento por Profissional</h1><p>${escapeHtml(professionalName)} · ${formatDate(row.period_start)} a ${formatDate(row.period_end)}</p><div class="grid"><div class="box">Atendimentos<div class="value">${escapeHtml(row.procedures_count)}</div></div><div class="box">Faturamento bruto<div class="value">${money(row.gross_revenue)}</div></div><div class="box">Faturamento líquido<div class="value">${money(row.net_revenue)}</div></div><div class="box">Comissão<div class="value">${money(row.commission_total)}</div></div><div class="box">Parte da clínica<div class="value">${money(row.clinic_total)}</div></div><div class="box">Pendente<div class="value">${money(row.amount_pending)}</div></div></div><table><tr><th>Já repassado</th><th>Pendente</th><th>Status</th></tr><tr><td>${money(row.amount_repassed)}</td><td>${money(row.amount_pending)}</td><td>${escapeHtml(row.status)}</td></tr></table>`,
  );
}

export function FinanceCompletionSuite() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(fortalezaIso());
  const [section, setSection] = useState("month");
  const [professional, setProfessional] = useState("");
  const [service, setService] = useState("");
  const [method, setMethod] = useState("");
  const [category, setCategory] = useState("");
  const [center, setCenter] = useState("");
  const [status, setStatus] = useState("");
  const [cashDate, setCashDate] = useState(fortalezaIso());
  const [savingService, setSavingService] = useState("");

  const access = useQuery({ queryKey: ["finance-completion-access"], queryFn: loadAccess });
  const lookups = useQuery({
    queryKey: ["finance-completion-lookups"],
    queryFn: loadLookups,
    enabled: Boolean(access.data?.full),
  });
  const report = useQuery({
    queryKey: [
      "finance-completion-report",
      from,
      to,
      professional,
      service,
      method,
      category,
      center,
      status,
    ],
    queryFn: () => loadReport({ from, to, professional, service, method, category, center, status }),
    enabled: Boolean(access.data?.full && from && to),
  });
  const cash = useQuery({
    queryKey: ["finance-cash-by-date", cashDate],
    queryFn: () => loadCashByDate(cashDate),
    enabled: Boolean(access.data?.full && cashDate),
  });

  const professionals = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of lookups.data?.entries ?? []) {
      if (row.professional_id) {
        map.set(row.professional_id, row.professional_name_snapshot || "Profissional");
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [lookups.data?.entries]);

  const professionalMap = useMemo(
    () => new Map(professionals.map((item) => [item.id, item.name])),
    [professionals],
  );
  const mappingMap = useMemo(
    () => new Map((lookups.data?.mappings ?? []).map((row: any) => [row.service_id, row.cost_center_id])),
    [lookups.data?.mappings],
  );
  const selectedRows = (report.data ?? []).filter((row: any) => row.section === section);
  const centerRows = (report.data ?? []).filter((row: any) => row.section === "cost_center");
  const sectionTitle = reportSections.find(([value]) => value === section)?.[1] ?? "Relatório";

  const saveServiceCenter = async (serviceId: string, costCenterId: string) => {
    if (!access.data?.user) return;
    setSavingService(serviceId);
    try {
      if (!costCenterId) {
        const result = await db.from("service_cost_centers").delete().eq("service_id", serviceId);
        if (result.error) throw result.error;
      } else {
        const result = await db.from("service_cost_centers").upsert(
          {
            service_id: serviceId,
            cost_center_id: costCenterId,
            created_by: access.data.user.id,
          },
          { onConflict: "service_id" },
        );
        if (result.error) throw result.error;
      }
      toast.success("Área do serviço atualizada.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance-completion-lookups"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-completion-report"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-full-v2"] }),
      ]);
    } catch (error: any) {
      toast.error("Não foi possível atualizar a área.", { description: error?.message });
    } finally {
      setSavingService("");
    }
  };

  if (!access.data?.full) return null;

  return (
    <section className="mx-auto max-w-[1500px] px-5 pb-12 lg:px-8">
      <div className="mb-5 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            <h2 className="text-lg font-semibold">Complementos do financeiro</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Alertas, relatórios completos, áreas da clínica e PDFs de fechamento.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ["finance-completion"] });
            void lookups.refetch();
            void report.refetch();
            void cash.refetch();
          }}
        >
          <RefreshCw className="mr-2 size-4" /> Atualizar
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <AlertList title="Contas a pagar — alertas" rows={lookups.data?.payables ?? []} kind="pay" />
        <AlertList
          title="Contas a receber — alertas"
          rows={lookups.data?.receivables ?? []}
          kind="receive"
        />
      </div>

      <section className="mt-5 rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Relatórios financeiros completos</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Use os filtros combinados e gere Excel ou PDF do resultado exibido.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!selectedRows.length}
              onClick={() => exportReport(selectedRows, sectionTitle, from, to)}
            >
              <FileSpreadsheet className="mr-2 size-4" /> Excel
            </Button>
            <Button
              variant="outline"
              disabled={!selectedRows.length}
              onClick={() => printReport(selectedRows, sectionTitle, from, to)}
            >
              <FileText className="mr-2 size-4" /> PDF
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label>De</Label>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div>
            <Label>Tipo de relatório</Label>
            <select className={selectClass} value={section} onChange={(event) => setSection(event.target.value)}>
              {reportSections.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Status</Label>
            <select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos</option>
              <option value="received">Recebido</option>
              <option value="pending">Pendente</option>
              <option value="paid">Pago</option>
              <option value="refunded">Estornado</option>
            </select>
          </div>
          <select className={selectClass} value={professional} onChange={(event) => setProfessional(event.target.value)}>
            <option value="">Todos os profissionais</option>
            {professionals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select className={selectClass} value={service} onChange={(event) => setService(event.target.value)}>
            <option value="">Todos os serviços</option>
            {(lookups.data?.services ?? []).map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select className={selectClass} value={method} onChange={(event) => setMethod(event.target.value)}>
            <option value="">Todas as formas de pagamento</option>
            {(lookups.data?.methods ?? []).map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select className={selectClass} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Todas as categorias de despesa</option>
            {(lookups.data?.categories ?? []).map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select className={selectClass} value={center} onChange={(event) => setCenter(event.target.value)}>
            <option value="">Todas as áreas</option>
            {(lookups.data?.centers ?? []).map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            onClick={() => {
              setProfessional("");
              setService("");
              setMethod("");
              setCategory("");
              setCenter("");
              setStatus("");
            }}
          >
            Limpar filtros
          </Button>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Grupo</th>
                <th className="p-3">Qtd.</th>
                <th className="p-3">Faturamento</th>
                <th className="p-3">Taxas</th>
                <th className="p-3">Líquido</th>
                <th className="p-3">Comissões</th>
                <th className="p-3">Clínica</th>
                <th className="p-3">Despesas</th>
                <th className="p-3">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {selectedRows.map((row: any) => (
                <tr key={`${row.section}-${row.report_key}`} className="border-t border-border">
                  <td className="p-3 font-medium">{row.label}</td>
                  <td className="p-3">{row.quantity}</td>
                  <td className="p-3">{money(row.gross_amount)}</td>
                  <td className="p-3">{money(row.fee_amount)}</td>
                  <td className="p-3">{money(row.net_amount)}</td>
                  <td className="p-3">{money(row.commission_amount)}</td>
                  <td className="p-3">{money(row.clinic_amount)}</td>
                  <td className="p-3">{money(row.expense_amount)}</td>
                  <td className="p-3 font-semibold">{money(row.result_amount)}</td>
                </tr>
              ))}
              {!selectedRows.length ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    {report.isLoading ? "Carregando relatório..." : "Nenhum dado para os filtros selecionados."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <h3 className="font-semibold">Resultado por área da clínica</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Receita, despesas e resultado de cada centro de custo no período filtrado.
          </p>
          <div className="mt-4 space-y-2">
            {centerRows.map((row: any) => (
              <div key={row.report_key} className="rounded-2xl border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm">{row.label}</strong>
                  <strong>{money(row.result_amount)}</strong>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Faturamento {money(row.gross_amount)} · Despesas {money(row.expense_amount)} · Comissões {money(row.commission_amount)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <h3 className="font-semibold">Serviço → área da clínica</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Define em qual centro de custo os próximos atendimentos do serviço serão contabilizados.
          </p>
          <div className="mt-4 max-h-[420px] space-y-2 overflow-auto pr-1">
            {(lookups.data?.services ?? []).map((serviceRow: any) => (
              <div
                key={serviceRow.id}
                className="grid gap-2 rounded-2xl border border-border p-3 sm:grid-cols-[1fr_220px] sm:items-center"
              >
                <strong className="text-sm">{serviceRow.name}</strong>
                <select
                  className={selectClass}
                  disabled={savingService === serviceRow.id}
                  value={mappingMap.get(serviceRow.id) ?? ""}
                  onChange={(event) => void saveServiceCenter(serviceRow.id, event.target.value)}
                >
                  <option value="">Sem área definida</option>
                  {(lookups.data?.centers ?? []).map((centerRow: any) => (
                    <option key={centerRow.id} value={centerRow.id}>
                      {centerRow.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold">Consultar fechamento de caixa</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Consulte qualquer dia e gere o relatório específico em PDF.
              </p>
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={cashDate} onChange={(event) => setCashDate(event.target.value)} />
            </div>
          </div>
          {cash.data ? (
            <div className="mt-4 rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <strong>{formatDate(cash.data.business_date)}</strong>
                  <p className="text-xs text-muted-foreground">
                    {cash.data.opened_by_label || "Usuário"} · {cash.data.status}
                  </p>
                </div>
                <Button variant="outline" onClick={() => printCash(cash.data)}>
                  <Printer className="mr-2 size-4" /> PDF do caixa
                </Button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-muted/50 p-3">
                  <span className="text-xs text-muted-foreground">Recebido</span>
                  <strong className="mt-1 block">{money(cash.data.total_received)}</strong>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  <span className="text-xs text-muted-foreground">Esperado espécie</span>
                  <strong className="mt-1 block">{money(cash.data.expected_cash)}</strong>
                </div>
                <div className="rounded-xl bg-muted/50 p-3">
                  <span className="text-xs text-muted-foreground">Diferença</span>
                  <strong className="mt-1 block">{money(cash.data.difference_amount)}</strong>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              {cash.isLoading ? "Consultando..." : "Nenhum caixa registrado nessa data."}
            </p>
          )}
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <h3 className="font-semibold">PDF dos fechamentos profissionais</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Fechamentos quinzenais ou mensais já gerados no financeiro.
          </p>
          <div className="mt-4 max-h-[360px] space-y-2 overflow-auto pr-1">
            {(lookups.data?.settlements ?? []).map((row: any) => {
              const name = professionalMap.get(row.professional_id) ?? "Profissional";
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-3"
                >
                  <div>
                    <strong className="text-sm">{name}</strong>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(row.period_start)} a {formatDate(row.period_end)} · {row.procedures_count} atendimento(s)
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => printSettlement(row, name)}>
                    <Printer className="mr-2 size-4" /> PDF
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
