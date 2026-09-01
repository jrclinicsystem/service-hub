import { createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

const title = "Entrar na JR Clinic";
const description =
  "Entre ou crie sua conta JR Clinic para acessar agendamentos, perfil e histórico.";
const RECOVERY_TARGET_KEY = "jrclinic:password-recovery-target";
const PUBLIC_APP_ORIGIN = "https://jrclinic.lovable.app";

function publicAuthOrigin() {
  if (typeof window === "undefined") return PUBLIC_APP_ORIGIN;

  const hostname = window.location.hostname.toLowerCase();
  const localOrPreview =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".localhost") ||
    hostname.includes("lovableproject.com");

  return localOrPreview ? PUBLIC_APP_ORIGIN : window.location.origin;
}

function safeNext(value: unknown) {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value === "/auth") return undefined;
  return value;
}

function isPanelDestination(value?: string) {
  return value === "/profissional" || Boolean(value?.startsWith("/admin"));
}

function adminDestination(value?: string) {
  if (!value || value === "/admin") return "/admin";
  if (value.startsWith("/admin/equipe")) return "/admin#equipe";
  if (value.startsWith("/admin/acessos")) return "/admin#acessos";
  if (value.startsWith("/admin/financeiro")) return "/admin#financeiro";
  if (value.startsWith("/admin/catalogo")) return "/admin#catalogo";
  return "/admin";
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: safeNext(search['next']),
  }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function PasswordField({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative mt-2">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-xl pr-11"
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        title={visible ? "Ocultar senha" : "Mostrar senha"}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function AuthPage() {
  const { user, loading } = useAuth();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);

  useEffect(() => {
    if (loading || !user || checkingAccess) return;

    const finishLogin = async () => {
      const hasExplicitPublicDestination = Boolean(next) && !isPanelDestination(next);
      if (hasExplicitPublicDestination) {
        window.location.replace(next!);
        return;
      }

      setCheckingAccess(true);

      const { data: isAdmin, error: adminError } = await (supabase as any).rpc(
        "is_current_user_admin",
      );

      if (!adminError && isAdmin) {
        window.location.replace(adminDestination(next));
        return;
      }

      const normalizedEmail = (user.email ?? "").trim().toLowerCase();
      const { data: staffAccess, error: staffError } = await (supabase as any)
        .from("professional_access")
        .select("professional_id, enabled")
        .eq("email", normalizedEmail)
        .eq("enabled", true)
        .maybeSingle();

      if (!staffError && staffAccess?.professional_id) {
        window.location.replace("/profissional");
        return;
      }

      if (isPanelDestination(next)) {
        await supabase.auth.signOut();
        toast.error("Este e-mail não está autorizado a acessar o painel da JR Clinic.");
        setCheckingAccess(false);
        return;
      }

      window.location.replace(next ?? "/");
    };

    void finishLogin();
  }, [loading, user, next, checkingAccess]);

  const signIn = async () => {
    if (!email.trim() || !password) {
      toast.error("Digite seu e-mail e senha.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);

    if (error) {
      if (error.message.toLowerCase().includes("invalid login credentials")) {
        toast.error("E-mail ou senha incorretos. Se necessário, use ‘Esqueci minha senha’. ");
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success("Bem-vindo de volta!");
  };

  const sendPasswordReset = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      toast.error("Digite seu e-mail primeiro.");
      return;
    }

    setResetBusy(true);
    const recoveryTarget = next === "/profissional" ? "/profissional" : next?.startsWith("/admin") ? "/admin" : "/minha-conta";
    window.localStorage.setItem(RECOVERY_TARGET_KEY, recoveryTarget);

    const redirectTo = `${publicAuthOrigin()}/redefinir-senha`;
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });
    setResetBusy(false);

    if (error) {
      window.localStorage.removeItem(RECOVERY_TARGET_KEY);
      toast.error(error.message);
      return;
    }

    toast.success("Link de recuperação enviado", {
      description: "Confira seu e-mail e abra o link mais recente para criar uma nova senha.",
    });
  };

  const signUp = async () => {
    if (!name.trim() || !email.trim() || password.length < 8) {
      toast.error("Preencha nome, e-mail e uma senha de pelo menos 8 caracteres.");
      return;
    }

    setBusy(true);
    const redirectTo = `${publicAuthOrigin()}/auth${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { full_name: name.trim() },
      },
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Conta criada! Verifique seu e-mail se a confirmação for solicitada.");
  };

  const isAdminAccess = isPanelDestination(next);

  return (
    <div className="min-h-screen overflow-x-hidden">
      <SiteHeader />

      <main className="mx-auto max-w-md px-4 pb-24 pt-8 sm:px-8 sm:py-16">
        <span className="eyebrow text-muted-foreground">
          {isAdminAccess ? "Acesso ao painel" : "Bem-vindo"}
        </span>
        <h1 className="mt-2 text-3xl font-semibold">
          {isAdminAccess ? "Painel JR Clinic" : "Sua conta JR Clinic"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {isAdminAccess
            ? "Entre com um e-mail administrativo ou de colaborador previamente autorizado."
            : "Entre para agendar, acompanhar atendimentos e manter seus dados em um só lugar."}
        </p>

        <div className="mt-7 rounded-2xl border border-border bg-card p-5 shadow-soft sm:mt-8 sm:p-6">
          {isAdminAccess && (
            <p className="mb-5 text-center text-[11px] leading-relaxed text-muted-foreground">
              Administradores acessam a gestão completa. Colaboradores autorizados são direcionados à própria agenda.
            </p>
          )}

          <Tabs defaultValue="entrar">
            <TabsList className="w-full">
              <TabsTrigger value="entrar" className="flex-1">Entrar</TabsTrigger>
              <TabsTrigger value="criar" className="flex-1">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="entrar" className="mt-5 space-y-4">
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 h-11 rounded-xl"
                  placeholder="voce@email.com"
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="senha">Senha</Label>
                  <button
                    type="button"
                    onClick={sendPasswordReset}
                    disabled={resetBusy}
                    className="text-xs font-medium text-primary transition-opacity hover:opacity-75 disabled:opacity-50"
                  >
                    {resetBusy ? "Enviando..." : "Esqueci minha senha"}
                  </button>
                </div>
                <PasswordField
                  id="senha"
                  autoComplete="current-password"
                  value={password}
                  onChange={setPassword}
                />
              </div>
              <Button
                className="h-11 w-full rounded-full"
                disabled={busy || checkingAccess}
                onClick={signIn}
              >
                {checkingAccess ? "Verificando acesso..." : busy ? "Entrando..." : "Entrar"}
              </Button>
            </TabsContent>

            <TabsContent value="criar" className="mt-5 space-y-4">
              <div>
                <Label htmlFor="nome">Nome completo</Label>
                <Input
                  id="nome"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 h-11 rounded-xl"
                  placeholder="Seu nome"
                />
              </div>
              <div>
                <Label htmlFor="email-novo">E-mail</Label>
                <Input
                  id="email-novo"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 h-11 rounded-xl"
                  placeholder="voce@email.com"
                />
              </div>
              <div>
                <Label htmlFor="senha-nova">Senha</Label>
                <PasswordField
                  id="senha-nova"
                  autoComplete="new-password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Mínimo de 8 caracteres"
                />
              </div>
              <Button
                className="h-11 w-full rounded-full"
                disabled={busy || checkingAccess}
                onClick={signUp}
              >
                {busy ? "Criando..." : "Criar conta"}
              </Button>
            </TabsContent>
          </Tabs>
        </div>

        {!isAdminAccess && (
          <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
            Sua conta será usada para vincular seus agendamentos, histórico e futuros pagamentos.
          </p>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
