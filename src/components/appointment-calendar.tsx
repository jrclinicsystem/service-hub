import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthStart(value?: string) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-").map(Number);
    return new Date(year, month - 1, 1, 12);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 12);
}

export function AppointmentCalendar({
  appointments,
  selectedDate,
  onSelectDate,
  title = "Calendário",
  description = "Visualize rapidamente os dias com atendimentos.",
}: {
  appointments: any[];
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
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
      if (appointment.status === "confirmado") current.confirmed += 1;
      else current.pending += 1;
      result.set(appointment.scheduled_date, current);
    }
    return result;
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

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" /><h2 className="text-lg font-semibold">{title}</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="size-8 rounded-full" onClick={() => moveMonth(-1)} aria-label="Mês anterior"><ChevronLeft className="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-8 rounded-full" onClick={() => moveMonth(1)} aria-label="Próximo mês"><ChevronRight className="size-4" /></Button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-base font-semibold capitalize">{visibleMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
        {selectedDate ? <button type="button" className="text-[11px] font-semibold text-primary hover:underline" onClick={() => onSelectDate?.("")}>Limpar filtro</button> : null}
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:gap-2">
        {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} className="aspect-square" />;
          const key = isoDate(year, month, day);
          const count = counts.get(key);
          const active = selectedDate === key;
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate?.(key)}
              className={`relative aspect-square min-h-10 rounded-xl border p-1 text-left transition sm:min-h-14 sm:p-2 ${active ? "border-primary bg-primary text-primary-foreground" : count ? "border-primary/25 bg-primary-soft/45 hover:border-primary/45" : "border-border bg-background hover:bg-secondary/40"}`}
            >
              <span className={`text-[11px] font-semibold sm:text-sm ${isToday && !active ? "text-primary" : ""}`}>{day}</span>
              {count ? <span className={`absolute bottom-1 right-1 grid min-w-4 place-items-center rounded-full px-1 text-[8px] font-bold sm:bottom-1.5 sm:right-1.5 sm:min-w-5 sm:text-[9px] ${active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"}`}>{count.total}</span> : null}
              {count?.pending ? <span className={`absolute bottom-1 left-1 size-1.5 rounded-full sm:bottom-2 sm:left-2 ${active ? "bg-primary-foreground/80" : "bg-amber-500"}`} title={`${count.pending} pendente(s)`} /> : null}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span><span className="mr-1 inline-block size-2 rounded-full bg-primary" />Dia com atendimento</span>
        <span><span className="mr-1 inline-block size-2 rounded-full bg-amber-500" />Há confirmação pendente</span>
      </div>
    </section>
  );
}
