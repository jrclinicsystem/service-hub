import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthStart(value?: string) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [yearStr, monthStr] = value.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    return new Date(year, month - 1, 1, 12);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 12);
}

export function AppointmentCalendar({
  appointments,
  selectedDate,
  onSelectDate,
  onOpenDate,
  title = "Calendário",
  description = "Visualize rapidamente os dias com atendimentos.",
}: {
  appointments: any[];
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
  onOpenDate?: (date: string) => void;
  title?: string;
  description?: string;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(selectedDate));
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const today = new Date();
  const todayKey = isoDate(today.getFullYear(), today.getMonth(), today.getDate());

  const counts = useMemo(() => {
    const result = new Map<string, { total: number; pending: number; confirmed: number }>();
    for (const appointment of appointments) {
      if (!appointment?.scheduled_date || appointment.status === "cancelado") continue;
      const current = result.get(appointment.scheduled_date) ?? { total: 0, pending: 0, confirmed: 0 };
      current.total += 1;
      if (appointment.status === "confirmado" || appointment.status === "atendido") current.confirmed += 1;
      else current.pending += 1;
      result.set(appointment.scheduled_date, current);
    }
    return result;
  }, [appointments]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const appointmentYears = appointments
      .map((item) => Number(String(item?.scheduled_date ?? "").slice(0, 4)))
      .filter((value) => Number.isFinite(value) && value > 2000);
    const min = Math.min(currentYear - 2, ...appointmentYears);
    const max = Math.max(currentYear + 5, ...appointmentYears);
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  }, [appointments]);

  const firstWeekday = new Date(year, month, 1, 12).getDay();
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  const moveMonth = (amount: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1, 12));
  };

  const setMonth = (nextMonth: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), nextMonth, 1, 12));
  };

  const setYear = (nextYear: number) => {
    setVisibleMonth((current) => new Date(nextYear, current.getMonth(), 1, 12));
  };

  return (
    <section className="w-full max-w-[560px] rounded-2xl border border-border bg-card p-3 shadow-soft sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4.5 shrink-0 text-primary" />
            <h2 className="truncate text-base font-bold tracking-[-0.01em] text-foreground sm:text-lg">{title}</h2>
          </div>
          <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground sm:text-[11px]">{description}</p>
          {onOpenDate ? <p className="mt-1 text-[9px] font-medium text-primary/75">1 clique filtra · 2 cliques abrem o dia</p> : null}
        </div>
        {selectedDate ? (
          <button type="button" className="shrink-0 text-[10px] font-semibold text-primary hover:underline" onClick={() => onSelectDate?.("")}>Limpar</button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="icon" className="size-8 shrink-0 rounded-lg" onClick={() => moveMonth(-1)} aria-label="Mês anterior">
          <ChevronLeft className="size-3.5" />
        </Button>

        <select
          aria-label="Selecionar mês"
          value={month}
          onChange={(event) => setMonth(Number(event.target.value))}
          className="h-8 min-w-[125px] flex-1 rounded-lg border border-border bg-background px-2 text-xs font-medium outline-none focus:border-primary sm:flex-none"
        >
          {monthNames.map((name, index) => <option key={name} value={index}>{name}</option>)}
        </select>

        <select
          aria-label="Selecionar ano"
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
          className="h-8 w-[82px] rounded-lg border border-border bg-background px-2 text-xs font-medium outline-none focus:border-primary"
        >
          {yearOptions.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>

        <Button type="button" variant="outline" size="icon" className="size-8 shrink-0 rounded-lg" onClick={() => moveMonth(1)} aria-label="Próximo mês">
          <ChevronRight className="size-3.5" />
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">
        {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((day) => <span key={day}>{day}</span>)}
      </div>

      <div className="mt-1.5 grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} className="h-9 sm:h-10" />;
          const key = isoDate(year, month, day);
          const count = counts.get(key);
          const active = selectedDate === key;
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate?.(key)}
              onDoubleClick={() => onOpenDate?.(key)}
              className={`relative h-9 rounded-lg border px-1 text-center transition sm:h-10 ${active ? "border-primary bg-primary text-primary-foreground" : count ? "border-primary/25 bg-primary-soft/45 hover:border-primary/45" : "border-border bg-background hover:bg-secondary/40"}`}
            >
              <span className={`text-[10px] font-semibold sm:text-[11px] ${isToday && !active ? "text-primary" : ""}`}>{day}</span>
              {count ? <span className={`absolute right-0.5 top-0.5 grid min-w-3.5 place-items-center rounded-full px-0.5 text-[7px] font-bold ${active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"}`}>{count.total}</span> : null}
              {count?.pending ? <span className={`absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full ${active ? "bg-primary-foreground/80" : "bg-amber-500"}`} title={`${count.pending} pendente(s)`} /> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
        <span><span className="mr-1 inline-block size-1.5 rounded-full bg-primary" />Com atendimento</span>
        <span><span className="mr-1 inline-block size-1.5 rounded-full bg-amber-500" />Pendente</span>
      </div>
    </section>
  );
}
