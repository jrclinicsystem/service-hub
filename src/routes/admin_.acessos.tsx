import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  LogOut,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import logo from "@/assets/jr-clinic-logo.png";
import { AdminSubpageSidebar } from "@/components/admin-subpage-sidebar";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export const Route = createFileRoute("/admin_/acessos")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: "/admin/acessos" } });
  },
  head: () => ({
    meta: [
      { title: "Controle de acessos — JR Clinic" },
      { name: "description", content: "Gerencie administradores gerais e colaboradores da JR Clinic." },
    ],
  }),
  component: AccessManagementPage,
});

async function loadAccessManagement() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sessão expirada. Entre novamente.");

  const { data: isAdmin, error: adminError } = await db.rpc("is_current_user_admin");
  if (adminError) throw adminError;
  if (!isAdmin) {
    return { isAdmin: false as const, currentEmail: (userData.user.email ?? "").toLowerCase() };
  }

  const [admins, collaborators, professionals] = await Promise.all([
    db.from("admin_emails").select("email, enabled, created_at").order("created_at"),
    db
      .from("professional_access")
      .select("id, professional_id, email, enabled, created_at, updated_at, professional:professionals(id, name, specialty, is_active, deleted_at)")
      .order("created_at"),
    db
      .from("professionals")
      .select("id, name, specialty, is_active, deleted_at")
      .is("deleted_at", null)
      .order("name"),
  ]);

  for (const [label, result] of [
    ["administradores", admins],
    ["colaboradores", collaborators],
    ["profissionais", professionals],
  ] as const) {
    if (result.error) throw new Error(`Falha ao carregar ${label}: ${result.error.message}`);
  }

  return {
    isAdmin: true as const,
    currentEmail: (userData.user.email ?? "").toLowerCase(),
    admins: admins.data ?? [],
    collaborators: (collaborators.data ?? []).filter((item: any) => !item.professional?.deleted_at),
    professionals: professionals.data ?? [],
  };
}

function AccessManagementPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [collaboratorDialogOpen, setCollaboratorDialogOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["access-management"],
    queryFn: loadAccessManagement,
    retry: 1,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["access-management"] });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: undefined } });
  };

  const updateAdmin = async (email: string, enabled: boolean) => {
    const { error: updateError } = await db.from("admin_emails").update({ enabled }).eq("email", email);
    if (updateError) return toast.error(updateError.message);
    toast.success(enabled ? "Acesso administrativo ativado." : "Acesso administrativo pausado.");
    void refresh();
  };

  const deleteAdmin = async (email: string) => {
    if (email === data?.currentEmail) return toast.error("Você não pode excluir o próprio acesso enquanto está usando esta conta.");
    if (!window.confirm(`Excluir o acesso administrativo de ${email}?`)) return;
    const { error: deleteError } = await db.from("admin_emails").delete().eq("email", email);
    if (deleteError) return toast.error(deleteError.message);
    toast.success("Acesso administrativo excluído.");
    void refresh();
  };

  const updateCollaborator = async (id: string, enabled: boolean) => {
    const { error: updateError } = await db
      .from("professional_access")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) return toast.error(updateError.message);
    toast.success(enabled ? "Acesso do colaborador ativado." : "Acesso do colaborador pausado.");
    void refresh();
  };

  const deleteCollaborator = async (item: any) => {
    if (!window.confirm(`Excluir o acesso de ${item.email} à agenda de ${item.professional?.name ?? "colaborador"}?`)) return;
    const { error: deleteError } = await db.from("professional_access").delete().eq("id", item.id);
    if (deleteError) return toast.error(deleteError.message);
    toast.success("Acesso do colaborador excluído.");
    void refresh();
  };

  if (isLoading) return <CenteredMessage title="Carregando acessos..." />;
  if (error) return <CenteredMessage title="Não foi possível carregar os acessos." detail={error instanceof Error ? error.message : "Erro inesperado."} action={<Button onClick={() => refetch()}>Tentar novamente</Button>} />;
  if (!data?.isAdmin) return <CenteredMessage title="Acesso administrativo necessário" detail="Somente administradores gerais podem gerenciar permissões." action={<Button asChild><Link to="/profissional">Ir para minha agenda</Link></Button>} />;

  return (
    <div className="min-h-screen bg-background lg:pl-[252px]">
      <AdminSubpageSidebar active="access" />

      <header className="sticky top-0 z-40 border-b border-border/80 bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between px-4 sm:h-16 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logo} alt="JR Clinic" className="h-7 w-auto sm:h-9 lg:hidden" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Controle de acessos</p>
              <p className="hidden text-[11px] text-muted-foreground sm:block">Administradores gerais e colaboradores</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-9" asChild>
              <Link to="/admin"><ChevronLeft className="size-4" /> Painel</Link>
            </Button>
            <Button variant="outline" size="sm" className="h-9 rounded-full" onClick={signOut}>
              <LogOut className="size-4" /><span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="eyebrow text-muted-foreground">Permissões</span>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Acessos do sistema</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Administradores gerais controlam toda a clínica. Colaboradores entram em um portal separado e enxergam somente a agenda vinculada ao próprio e-mail.
            </p>
          </div>
          <Button variant="outline" className="rounded-full" asChild>
            <Link to="/admin/equipe"><Users className="size-4" /> Gerenciar agendas</Link>
          </Button>
        </div>

        <section className="mt-8 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary"><ShieldCheck className="size-5" /></span>
              <div>
                <h2 className="text-lg font-semibold">Administradores gerais</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Acesso total: agendas, serviços, horários, configurações, pagamentos e permissões.</p>
              </div>
            </div>
            <Button className="rounded-full" onClick={() => setAdminDialogOpen(true)}><Plus className="size-4" /> Novo administrador</Button>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-border">
            {data.admins.length === 0 ? <EmptyAccess text="Nenhum administrador cadastrado." /> : data.admins.map((item: any) => {
              const isCurrent = item.email === data.currentEmail;
              return (
                <div key={item.email} className="flex flex-col gap-3 border-b border-border p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{item.email}</p>
                      <Badge className="rounded-full text-[10px]">Administrador geral</Badge>
                      {isCurrent ? <Badge variant="outline" className="rounded-full text-[10px]">Você</Badge> : null}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Pode visualizar e alterar todas as áreas administrativas.</p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Switch checked={item.enabled} disabled={isCurrent} onCheckedChange={(enabled) => updateAdmin(item.email, enabled)} />
                    <Button type="button" variant="ghost" size="icon" className="size-9 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive" disabled={isCurrent} onClick={() => deleteAdmin(item.email)} title="Excluir acesso"><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-secondary text-foreground"><UserRound className="size-5" /></span>
              <div>
                <h2 className="text-lg font-semibold">Colaboradores</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Acesso restrito ao portal individual. Cada e-mail fica vinculado a uma única agenda.</p>
              </div>
            </div>
            <Button variant="secondary" className="rounded-full" onClick={() => setCollaboratorDialogOpen(true)}><Plus className="size-4" /> Novo colaborador</Button>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-border">
            {data.collaborators.length === 0 ? <EmptyAccess text="Nenhum colaborador com acesso liberado." /> : data.collaborators.map((item: any) => (
              <div key={item.id} className="flex flex-col gap-3 border-b border-border p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{item.email}</p>
                    <Badge variant="secondary" className="rounded-full text-[10px]">Colaborador</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Agenda: <span className="font-medium text-foreground">{item.professional?.name ?? "Profissional"}</span>{item.professional?.specialty ? ` · ${item.professional.specialty}` : ""}</p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Switch checked={item.enabled} onCheckedChange={(enabled) => updateCollaborator(item.id, enabled)} />
                  <Button type="button" variant="ghost" size="icon" className="size-9 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => deleteCollaborator(item)} title="Excluir acesso"><Trash2 className="size-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <AdminAccessDialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen} onSaved={refresh} />
      <CollaboratorAccessDialog open={collaboratorDialogOpen} onOpenChange={setCollaboratorDialogOpen} professionals={data.professionals} onSaved={refresh} />
    </div>
  );
}

function AdminAccessDialog({ open, onOpenChange, onSaved }: any) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) return toast.error("Informe um e-mail válido.");
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await db.from("admin_emails").upsert({ email: normalized, enabled: true, created_by: userData.user?.id ?? null }, { onConflict: "email" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Administrador geral autorizado.");
    setEmail("");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value && !busy) setEmail(""); }}>
      <DialogContent className="w-[calc(100%-1rem)] rounded-3xl sm:max-w-md">
        <DialogHeader><DialogTitle>Novo administrador geral</DialogTitle><DialogDescription>Este e-mail terá acesso total ao painel administrativo após entrar na própria conta.</DialogDescription></DialogHeader>
        <div><Label>E-mail</Label><Input className="mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="administrador@email.com" /></div>
        <DialogFooter><Button className="w-full rounded-full sm:w-auto" disabled={busy} onClick={save}>{busy ? "Salvando..." : "Autorizar administrador"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CollaboratorAccessDialog({ open, onOpenChange, professionals, onSaved }: any) {
  const [professionalId, setProfessionalId] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const normalized = email.trim().toLowerCase();
    if (!professionalId) return toast.error("Selecione a agenda do colaborador.");
    if (!normalized.includes("@")) return toast.error("Informe um e-mail válido.");
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await db.from("professional_access").upsert({
      professional_id: professionalId,
      email: normalized,
      enabled: true,
      created_by: userData.user?.id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "professional_id" });
    setBusy(false);
    if (error) {
      if (String(error.message).toLowerCase().includes("professional_access_email_unique")) return toast.error("Este e-mail já está vinculado a outra agenda.");
      return toast.error(error.message);
    }
    toast.success("Colaborador vinculado à agenda.");
    setProfessionalId("");
    setEmail("");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value && !busy) { setProfessionalId(""); setEmail(""); } }}>
      <DialogContent className="w-[calc(100%-1rem)] rounded-3xl sm:max-w-md">
        <DialogHeader><DialogTitle>Novo colaborador</DialogTitle><DialogDescription>O colaborador verá somente a agenda escolhida quando entrar em /profissional.</DialogDescription></DialogHeader>
        <div>
          <Label>Agenda vinculada</Label>
          <Select value={professionalId} onValueChange={setProfessionalId}>
            <SelectTrigger className="mt-2"><SelectValue placeholder="Selecione o profissional" /></SelectTrigger>
            <SelectContent>{professionals.map((professional: any) => <SelectItem key={professional.id} value={professional.id}>{professional.name}{professional.specialty ? ` · ${professional.specialty}` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>E-mail do colaborador</Label><Input className="mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="colaborador@email.com" /></div>
        <DialogFooter><Button className="w-full rounded-full sm:w-auto" disabled={busy} onClick={save}>{busy ? "Salvando..." : "Liberar acesso"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyAccess({ text }: { text: string }) {
  return <div className="p-6 text-center text-sm text-muted-foreground">{text}</div>;
}

function CenteredMessage({ title, detail, action }: any) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-5">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary"><ShieldCheck className="size-5" /></span>
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        {detail ? <p className="mt-2 text-sm text-muted-foreground">{detail}</p> : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}
