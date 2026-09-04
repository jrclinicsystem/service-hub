import { CalendarCheck2, CircleDollarSign, Clock3, ReceiptText, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatPrice } from "@/lib/clinic";

function localDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  return new Date(year, month - 1, day, 12);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function appointmentValue(item: any) {
  return Number(item?.service_price_snapshot ?? item?.service?.price ?? 0) || 0;
}

export function AdminOperationSummary({ appointments }: { appointments: any[] }) {
  const summary = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const sevenDays = new Date(today);
    sevenDays.setDate(sevenDays.getDate() + 7);

    const nonCancelled = appointments.filter((item) => item.status !== "cancelado");
    const attended = nonCancelled.filter((item) => item.status === "atendido");
    const confirmedOrAttended = nonCancelled.filter((item) => item.status === "confirmado" || item.status === "atendido");
    const pending = nonCancelled.filter((item) => item.status === "pendente" || item.status === "aguardando_pagamento");
    const currentMonth = monthKey(now);
    const monthAttended = attended.filter((item) => String(item.scheduled_date ?? "").startsWith(currentMonth));
    const monthRevenue = monthAttended.reduce((sum, item) => sum + appointmentValue(item), 0);
    const totalRevenue = attended.reduce((sum, item) => sum + appointmentValue(item), 0);
    const averageTicket = attended.length ? totalRevenue / attended.length : 0;
    const confirmationRate = nonCancelled.length ? Math.round((confirmedOrAttended.length / nonCancelled.length) * 100) : 0;
    const upcomingSeven = nonCancelled.filter((item) => {
      if (item.status === "atendido") return false;
      const date = localDate(item.scheduled_date);
      return date && date >= today && date <= sevenDays;
    }).length;

    const chart = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1, 12);
      const key = monthKey(date);
      const revenue = attended
        .filter((item) => String(item.scheduled_date ?? "").startsWith(key))
        .reduce((sum, item) => sum + appointmentValue(item), 0);
      return {
        month: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        revenue,
      };
    });

    return {
      monthRevenue,
      monthAppointments: monthAttended.length,
      averageTicket,
      confirmationRate,
      upcomingSeven,
      pending: pending.length,
      chart,
    };
  }, [appointments]);

  return (
    <section className="flex min-h-[330px] w-full flex-col rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4.5 text-primary" />
            <h2 className="text-base font-bold tracking-[-0.01em] text-foreground sm:text-lg">Resumo operacional</h2>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground sm:text-[11px]">Receita contabilizada somente após o atendimento ser concluído.</p>
        </div>
        <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-primary">Atual</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <MiniMetric icon={CircleDollarSign} label="Receita do mês" value={formatPrice(summary.monthRevenue)} />
        <MiniMetric icon={ReceiptText} label="Ticket médio" value={formatPrice(summary.averageTicket)} />
        <MiniMetric icon={CalendarCheck2} label="Confirmação" value={`${summary.confirmationRate}%`} />
        <MiniMetric icon={Clock3} label="Próximos 7 dias" value={String(summary.upcomingSeven)} />
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-xl border border-border/70 bg-background/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-foreground sm:text-base">Receita realizada</p>
            <p className="mt-0.5 text-[9px] text-muted-foreground">Últimos 6 meses · somente atendimentos concluídos</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-primary">{summary.monthAppointments} atendido(s) neste mês</p>
            <p className="text-[9px] text-muted-foreground">{summary.pending} pendência(s) ativas</p>
          </div>
        </div>

        <div className="mt-2 h-[130px] min-h-[130px] w-full text-primary">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={summary.chart} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.08} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={9} tick={{ fill: "currentColor", opacity: 0.55 }} />
              <YAxis tickLine={false} axisLine={false} fontSize={8} tick={{ fill: "currentColor", opacity: 0.45 }} tickFormatter={(value) => value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)} />
              <Tooltip formatter={(value: any) => [formatPrice(Number(value ?? 0)), "Receita"]} labelFormatter={(label) => String(label).toUpperCase()} contentStyle={{ borderRadius: 12, fontSize: 11 }} />
              <Area type="monotone" dataKey="revenue" stroke="currentColor" fill="currentColor" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function MiniMetric({ icon: Icon, label, value }: any) {
  return (
    <div className="rounded-xl bg-secondary/45 p-3">
      <Icon className="size-3.5 text-primary" />
      <p className="mt-2 truncate text-[10px] font-semibold text-foreground/75 sm:text-[11px]">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold sm:text-base">{value}</p>
    </div>
  );
}
