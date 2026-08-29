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

  useEffect(() => {
    if (!loading && user) navigate({ to: next ?? "/minha-conta" });
  }, [loading, user, navigate, next]);

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
      options: { redirectTo },
    });
    setBusy(false);
    if (error) toast.error(error.message || "Não foi possível entrar com o Google.");
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-md px-5 py-16 sm:px-8">
        <span className="eyebrow text-muted-foreground">Acesso</span>
        <h1 className="mt-2 text-3xl font-semibold">Sua conta JR Clinic</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Entre para confirmar agendamentos e acompanhar seu histórico de atendimentos.
        </p>

        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-soft">
          <Button variant="outline" className="w-full rounded-full" onClick={signInGoogle} disabled={busy}>
            Continuar com Google
          </Button>

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
              <Button className="w-full rounded-full" disabled={busy} onClick={signIn}>
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
              <Button className="w-full rounded-full" disabled={busy} onClick={signUp}>
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
