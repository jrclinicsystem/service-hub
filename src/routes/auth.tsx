import { createFileRoute } from "@tanstack/react-router";
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

function safeNext(value: unknown) {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value === "/auth") return undefined;
  return value;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: safeNext(search.next),
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

function AuthPage() {
  const { user, loading } = useAuth();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);

  useEffect(() => {
    if (loading || !user || checkingAccess) return;

    const finishLogin = async () => {
      if (next !== "/admin") {
        window.location.replace(next ?? "/");
        return;
      }

      setCheckingAccess(true);
      const normalizedEmail = user.email?.trim().toLowerCase() ?? "";

      if (!normalizedEmail) {
        await supabase.auth.signOut();
        toast.error("Não foi possível identificar o e-mail desta conta.");
        setCheckingAccess(false);
        return;
      }

      const { data: allowed, error: accessError } = await supabase
        .from("admin_emails")
        .select("email")
        .eq("email", normalizedEmail)
        .eq("enabled", true)
        .maybeSingle();

      if (accessError || !allowed) {
        await supabase.auth.signOut();
        toast.error("Este e-mail não está autorizado a acessar o painel da JR Clinic.");
        setCheckingAccess(false);
        return;
      }

      window.location.replace("/admin");
    };

    void finishLogin();
  }, [loading, user, next, checkingAccess]);

  const signIn = async () => {
    if (!email.trim() || !password) return toast.error("Digite seu e-mail e senha.");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Bem-vindo de volta!");
  };

  const signUp = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) {
      return toast.error("Preencha nome, e-mail e uma senha de pelo menos 6 caracteres.");
    }

    setBusy(true);
    const redirectTo = `${window.location.origin}/auth${next ? `?next=${encodeURIComponent(next)}` : ""}`;
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

  const isAdminAccess = next === "/admin";

  return (
    <div className="min-h-screen overflow-x-hidden">
      <SiteHeader />

      <main className="mx-auto max-w-md px-4 pb-24 pt-8 sm:px-8 sm:py-16">
        <span className="eyebrow text-muted-foreground">
          {isAdminAccess ? "Acesso administrativo" : "Bem-vindo"}
        </span>
        <h1 className="mt-2 text-3xl font-semibold">
          {isAdminAccess ? "Painel JR Clinic" : "Sua conta JR Clinic"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {isAdminAccess
            ? "Entre com um dos e-mails previamente autorizados para administrar a clínica."
            : "Entre para agendar, acompanhar atendimentos e manter seus dados em um só lugar."}
        </p>

        <div className="mt-7 rounded-2xl border border-border bg-card p-5 shadow-soft sm:mt-8 sm:p-6">
          {isAdminAccess && (
            <p className="mb-5 text-center text-[11px] leading-relaxed text-muted-foreground">
              Somente contas com e-mail administrativo autorizado conseguem entrar no painel.
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
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 h-11 rounded-xl"
                />
              </div>
              <Button
                className="h-11 w-full rounded-full"
                disabled={busy || checkingAccess}
                onClick={signIn}
              >
                {busy ? "Entrando..." : "Entrar"}
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
                <Input
                  id="senha-nova"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 h-11 rounded-xl"
                  placeholder="Mínimo de 6 caracteres"
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
