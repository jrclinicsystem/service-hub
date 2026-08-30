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
    next: safeNext(search["next"]),
  }),
  head: () => ({
    meta: [
      { title: "Redefinir senha — JR Clinic" },
      { name: "description", content: "Crie uma nova senha para sua conta JR Clinic." },
    ],
  }),
  component: RedefinirSenha,
});

type RecoveryStatus = "checking" | "ready" | "invalid";

function RedefinirSenha() {
  const { next } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    const cleanRecoveryUrl = () => {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.hash = "";
      cleanUrl.searchParams.delete("code");
      window.history.replaceState({}, document.title, `${cleanUrl.pathname}${cleanUrl.search}`);
    };

    const establishRecoverySession = async () => {
      // Supabase may have already consumed the recovery URL automatically.
      const existing = await supabase.auth.getSession();
      if (existing.data.session) {
        if (mounted) setStatus("ready");
        cleanRecoveryUrl();
        return;
      }

      const url = new URL(window.location.href);
      const authCode = url.searchParams.get("code");
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const recoveryType = hash.get("type");

      let recoveryError: Error | null = null;

      // PKCE recovery links return ?code=...
      if (authCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(authCode);
        recoveryError = error;
      }
      // Implicit recovery links return tokens in the URL fragment.
      else if (accessToken && refreshToken && recoveryType === "recovery") {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        recoveryError = error;
      }

      if (recoveryError) {
        console.error("[JR Clinic] Password recovery session error:", recoveryError);
        if (mounted) setStatus("invalid");
        return;
      }

      const verified = await supabase.auth.getSession();
      if (verified.data.session) {
        cleanRecoveryUrl();
        if (mounted) setStatus("ready");
      } else if (mounted) {
        setStatus("invalid");
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        setStatus("ready");
      }
    });

    void establishRecoverySession();

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const updatePassword = async () => {
    if (status !== "ready") {
      toast.error("O link de recuperação não está mais válido. Solicite um novo link.");
      return;
    }
    if (password.length < 6) {
      toast.error("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As duas senhas precisam ser iguais.");
      return;
    }

    setBusy(true);

    // Revalidate immediately before changing the password so the UI can never
    // submit against a missing/expired recovery session.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setBusy(false);
      setStatus("invalid");
      toast.error("Sua sessão de recuperação expirou. Solicite um novo link.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      if (error.message.toLowerCase().includes("auth session missing")) {
        setStatus("invalid");
        toast.error("Sua sessão de recuperação expirou. Solicite um novo link.");
      } else {
        toast.error(error.message);
      }
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
          {status === "checking" ? (
            <div className="py-6 text-center">
              <div className="mx-auto size-8 animate-pulse rounded-full bg-primary/10" />
              <p className="mt-3 text-sm text-muted-foreground">Validando seu link de recuperação...</p>
            </div>
          ) : status === "invalid" ? (
            <div className="py-6 text-center">
              <p className="text-sm font-medium">Este link não possui mais uma sessão válida.</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Volte ao login e solicite um novo link de recuperação. Use sempre o link mais recente recebido no e-mail.
              </p>
              <Button asChild variant="outline" className="mt-5 rounded-full">
                <a href={next === "/admin" ? "/auth?next=%2Fadmin" : "/auth"}>Solicitar novo link</a>
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
              <Button className="h-11 w-full rounded-full" onClick={updatePassword} disabled={busy}>
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
