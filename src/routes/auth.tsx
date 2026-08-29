import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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

const title = "Entrar na JR Clinic — acesso do paciente";
const description =
  "Acesse sua conta da JR Clinic para agendar atendimentos, acompanhar consultas e gerenciar seus dados.";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: search.next === "/admin" ? "/admin" : undefined,
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
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);

  useEffect(() => {
    if (loading || !user || checkingAccess) return;

    const finishLogin = async () => {
      if (next !== "/admin") {
        navigate({ to: "/minha-conta" });
        return;
      }

      setCheckingAccess(true);
      const normalizedEmail = user.email?.trim().toLowerCase() ?? "";

      if (!normalizedEmail) {
        await supabase.auth.signOut();
        toast.error("Não foi possível identificar o e-mail desta conta Google.");
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

      navigate({ to: "/admin" });
    };

    void finishLogin();
  }, [loading, user, navigate, next, checkingAccess]);

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Bem-vindo de volta!");
  };

  const signUp = async () => {
    setBusy(true);
    const redirectTo = next
      ? `${window.location.origin}/auth?next=${encodeURIComponent(next)}`
      : `${window.location.origin}/auth`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { full_name: name },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Conta criada! Verifique seu e-mail se a confirmação for solicitada.");
  };

  const signInGoogle = async () => {
    setBusy(true);
    const redirectTo = next
      ? `${window.location.origin}/auth?next=${encodeURIComponent(next)}`
      : `${window.location.origin}/auth`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message || "Não foi possível entrar com o Google.");
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-md px-5 py-16 sm:px-8">
        <span className="eyebrow text-muted-foreground">{next === "/admin" ? "Acesso administrativo" : "Acesso"}</span>
        <h1 className="mt-2 text-3xl font-semibold">
          {next === "/admin" ? "Painel JR Clinic" : "Sua conta JR Clinic"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {next === "/admin"
            ? "Entre com um dos e-mails previamente autorizados para administrar a clínica."
            : "Entre para confirmar agendamentos e acompanhar seu histórico de atendimentos."}
        </p>

        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-soft">
          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={signInGoogle}
            disabled={busy || checkingAccess}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="mr-2 size-4">
              <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
              <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z" />
              <path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.46H3.04A10 10 0 0 0 2 12c0 1.61.39 3.13 1.04 4.54l3.35-2.61Z" />
              <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.61C7.18 7.7 9.39 5.94 12 5.94Z" />
            </svg>
            Continuar com Google
          </Button>

          {next === "/admin" && (
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              Somente contas Google com e-mail autorizado conseguem entrar no painel.
            </p>
          )}

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou use e-mail
            <span className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="entrar">
            <TabsList className="w-full">
              <TabsTrigger value="entrar" className="flex-1">
                Entrar
              </TabsTrigger>
              <TabsTrigger value="criar" className="flex-1">
                Criar conta
              </TabsTrigger>
            </TabsList>

            <TabsContent value="entrar" className="mt-5 space-y-4">
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2"
                  placeholder="voce@email.com"
                />
              </div>
              <div>
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2"
                />
              </div>
              <Button className="w-full rounded-full" disabled={busy || checkingAccess} onClick={signIn}>
                Entrar
              </Button>
            </TabsContent>

            <TabsContent value="criar" className="mt-5 space-y-4">
              <div>
                <Label htmlFor="nome">Nome completo</Label>
                <Input
                  id="nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-2"
                  placeholder="Como no documento"
                />
              </div>
              <div>
                <Label htmlFor="email-novo">E-mail</Label>
                <Input
                  id="email-novo"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2"
                  placeholder="voce@email.com"
                />
              </div>
              <div>
                <Label htmlFor="senha-nova">Senha</Label>
                <Input
                  id="senha-nova"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2"
                  placeholder="Mínimo de 6 caracteres"
                />
              </div>
              <Button className="w-full rounded-full" disabled={busy || checkingAccess} onClick={signUp}>
                Criar conta
              </Button>
            </TabsContent>
          </Tabs>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Prefere só olhar?{" "}
          <Link to="/catalogo" className="underline">
            Explorar o catálogo
          </Link>
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
