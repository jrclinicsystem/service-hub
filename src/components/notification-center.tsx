import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const db = supabase as any;
const PAGE_SIZE = 20;

const eventLabels: Record<string, string> = {
  novo_agendamento: "Novo agendamento",
  confirmacao: "Confirmação",
  cancelamento: "Cancelamento",
  remarcacao: "Remarcação",
  remarcacao_sessao: "Sessão remarcada",
  transferencia_recebida: "Transferência recebida",
  transferencia_saida: "Transferência enviada",
};

function formatMoment(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Fortaleza",
  }).format(new Date(value));
}

export function NotificationCenter({ mode }: { mode: "professional" | "admin" }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<"all" | "unread">("all");
  const [professionalId, setProfessionalId] = useState("all");

  const unread = useQuery({
    queryKey: ["professional-notifications-unread", mode, user?.id],
    enabled: Boolean(user?.id),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count, error } = await db.from("professional_notifications")
        .select("id", { count: "exact", head: true }).is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    refetchOnWindowFocus: true,
  });

  const professionals = useQuery({
    queryKey: ["notification-professionals", user?.id],
    enabled: mode === "admin" && Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await db.from("professionals").select("id,name")
        .eq("is_active", true).is("deleted_at", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const list = useQuery({
    queryKey: ["professional-notifications", mode, user?.id, page, status, professionalId],
    enabled: open && Boolean(user?.id),
    queryFn: async () => {
      let query = db.from("professional_notifications").select(
        "id,event_type,title,body,service_name,scheduled_date,scheduled_time,deep_link,read_at,created_at,recipient_professional_id,professional:professionals!professional_notifications_recipient_professional_id_fkey(id,name)",
        { count: "exact" },
      ).order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (status === "unread") query = query.is("read_at", null);
      if (mode === "admin" && professionalId !== "all") query = query.eq("recipient_professional_id", professionalId);
      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
    refetchInterval: open ? 15_000 : false,
  });

  useEffect(() => {
    setOpen(false);
    setPage(0);
    setProfessionalId("all");
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    void list.refetch();
    void unread.refetch();
    // Refresh whenever the central is opened; page/filter changes own their query keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["professional-notifications"] });
    await queryClient.invalidateQueries({ queryKey: ["professional-notifications-unread"] });
  };

  const markRead = async (id: string) => {
    const { error } = await db.from("professional_notifications")
      .update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
    if (error) {
      toast.error("Não foi possível marcar a notificação como lida.", { description: error.message });
      return;
    }
    await invalidate();
  };

  const rows = list.data?.rows ?? [];
  const total = list.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={mode === "admin"
            ? "admin-notification-trigger relative rounded-full lg:h-11 lg:w-full lg:justify-start lg:gap-3 lg:rounded-xl lg:border-transparent lg:bg-transparent lg:px-3 lg:text-white/75 lg:shadow-none lg:hover:bg-white/10 lg:hover:text-white"
            : "relative rounded-full"}
          aria-label={`Abrir notificações${unread.data ? `, ${unread.data} não lidas` : ""}`}
          aria-expanded={open}
        >
          <Bell className="size-4 shrink-0" />
          {mode === "admin" ? (
            <span className="hidden text-[13px] font-medium lg:inline">Notificações</span>
          ) : null}
          {unread.data ? (
            <span className={mode === "admin"
              ? "absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground lg:static lg:ml-auto"
              : "absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"}>
              {unread.data > 99 ? "99+" : unread.data}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent
        className="z-[200] flex w-full flex-col overflow-hidden border-l border-border bg-background p-0 text-foreground shadow-2xl sm:max-w-lg"
        overlayClassName="z-[190] bg-black/55"
      >
        <SheetHeader className="border-b border-border px-5 py-5 pr-12">
          <SheetTitle>{mode === "admin" ? "Central da clínica" : "Minhas notificações"}</SheetTitle>
          <SheetDescription>
            {mode === "admin" ? "Histórico agregado, somente leitura, de todas as profissionais." : "Somente eventos vinculados à sua agenda e permissão atual."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3">
          <select aria-label="Filtrar por leitura" className="h-9 rounded-lg border border-input bg-background px-3 text-xs" value={status} onChange={(event) => { setStatus(event.target.value as "all" | "unread"); setPage(0); }}>
            <option value="all">Todas</option>
            <option value="unread">Não lidas</option>
          </select>
          {mode === "admin" ? (
            <select aria-label="Filtrar por profissional" className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs" value={professionalId} onChange={(event) => { setProfessionalId(event.target.value); setPage(0); }}>
              <option value="all">Todas as profissionais</option>
              {(professionals.data ?? []).map((professional: any) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
            </select>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {list.isLoading ? <p className="py-10 text-center text-sm text-muted-foreground">Carregando notificações...</p> : null}
          {list.error ? (
            <div className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              A central ainda não está disponível neste ambiente. A migração do backend precisa ser instalada.
            </div>
          ) : null}
          {!list.isLoading && !list.error && rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhuma notificação encontrada.</div>
          ) : null}
          <div className="space-y-3">
            {rows.map((item: any) => (
              <article key={item.id} className={`rounded-2xl border p-4 ${item.read_at ? "border-border bg-card" : "border-primary/30 bg-primary-soft/35"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.read_at ? "outline" : "default"} className="rounded-full text-[10px]">{eventLabels[item.event_type] ?? item.event_type}</Badge>
                      {!item.read_at ? <span className="text-[10px] font-medium text-primary">Não lida</span> : null}
                    </div>
                    <h3 className="mt-2 text-sm font-semibold">{item.title}</h3>
                  </div>
                  {mode === "professional" && !item.read_at ? (
                    <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" title="Marcar como lida" aria-label="Marcar como lida" onClick={() => markRead(item.id)}><Check className="size-4" /></Button>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                {item.service_name ? <p className="mt-2 text-xs font-medium">{item.service_name}</p> : null}
                {mode === "admin" ? <p className="mt-1 text-[11px] text-muted-foreground">Profissional: {item.professional?.name ?? "Histórico"}</p> : null}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                  <time className="text-[10px] text-muted-foreground" dateTime={item.created_at}>{formatMoment(item.created_at)}</time>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" asChild>
                    <a href={mode === "admin" ? "/admin#agendamentos" : item.deep_link} onClick={() => { if (mode === "professional" && !item.read_at) void markRead(item.id); setOpen(false); }}>
                      Abrir agendamento <ExternalLink className="size-3" />
                    </a>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <Button type="button" variant="outline" size="sm" disabled={page === 0 || list.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft className="size-4" /> Anterior</Button>
          <span className="text-xs text-muted-foreground">Página {page + 1} de {totalPages}</span>
          <Button type="button" variant="outline" size="sm" disabled={page + 1 >= totalPages || list.isFetching} onClick={() => setPage((current) => current + 1)}>Próxima <ChevronRight className="size-4" /></Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
