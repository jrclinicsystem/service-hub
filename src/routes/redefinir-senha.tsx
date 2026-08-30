import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

function safeNext(value: unknown) {
  if (typeof value !== "string") return "/auth";
  if (!value.startsWith("/") || value.startsWith("//")) return "/auth";
  return value;
}

export const Route = createFileRoute("/redefinir-senha")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: safeNext(search['next']),
  }),
  head: () => ({
    meta: [
      { title: "Redefinir senha — JR Clinic" },
      { name: "description", content: "Crie uma nova senha para sua conta JR Clinic." },
    ],
  }),
  component: RedefinirSenha,
});

function RedefinirSenha() {
  const { next } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted && data.session) setReady(true);
    };

    void checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const updatePassword = async () => {
    if (password.length < 6) {
      toast.error("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As duas senhas precisam ser iguais.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Senha alterada com sucesso.");
    window.location.replace(next === "/admin" ? "/admin" : next || "/minha-conta");
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 pb-24 pt-8 sm:px-8 sm:py-16">
        <span className="eyebrow text-muted-foreground">Segurança da conta</span>
        <h1 className="mt-2 text-3xl font-semibold">Crie uma nova senha</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Escolha uma nova senha para continuar usando sua conta JR Clinic.
        </p>

        <div className="mt-7 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
          {!ready ? (
            <div className="py-6 text-center">
              <div className="mx-auto size-8 animate-pulse rounded-full bg-primary/10" />
              <p className="mt-3 text-sm text-muted-foreground">
                Validando seu link de recuperação...
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Se este link expirou, volte ao login e solicite outro.
              </p>
              <Button asChild variant="outline" className="mt-5 rounded-full">
                <a href={next === "/admin" ? "/auth?next=%2Fadmin" : "/auth"}>Voltar ao login</a>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="nova-senha">Nova senha</Label>
                <Input
                  id="nova-senha"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 h-11 rounded-xl"
                  placeholder="Mínimo de 6 caracteres"
                />
              </div>
              <div>
                <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
                <Input
                  id="confirmar-senha"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-2 h-11 rounded-xl"
                />
              </div>
              <Button
                className="h-11 w-full rounded-full"
                onClick={updatePassword}
                disabled={busy}
              >
                {busy ? "Alterando..." : "Salvar nova senha"}
              </Button>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
