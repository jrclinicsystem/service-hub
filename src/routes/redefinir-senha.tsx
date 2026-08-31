import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const RECOVERY_TARGET_KEY = "jrclinic:password-recovery-target";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — JR Clinic" },
      { name: "description", content: "Crie uma nova senha para sua conta JR Clinic." },
    ],
  }),
  component: RedefinirSenha,
});

type RecoveryStatus = "checking" | "ready" | "invalid";
type RecoveryTarget = "/admin" | "/minha-conta";

function RedefinirSenha() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [busy, setBusy] = useState(false);
  const [recoveryTarget, setRecoveryTarget] = useState<RecoveryTarget>("/minha-conta");

  useEffect(() => {
    let mounted = true;

    const storedTarget = window.localStorage.getItem(RECOVERY_TARGET_KEY);
    if (storedTarget === "/admin") setRecoveryTarget("/admin");

    const cleanRecoveryUrl = () => {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.hash = "";
      cleanUrl.searchParams.delete("code");
      cleanUrl.searchParams.delete("error");
      cleanUrl.searchParams.delete("error_code");
      cleanUrl.searchParams.delete("error_description");
      window.history.replaceState({}, document.title, `${cleanUrl.pathname}${cleanUrl.search}`);
    };

    const establishRecoverySession = async () => {
      const url = new URL(window.location.href);
      const authCode = url.searchParams.get("code");
      const queryError = url.searchParams.get("error_description") || url.searchParams.get("error");
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const recoveryType = hash.get("type");
      const hashError = hash.get("error_description") || hash.get("error");

      if (queryError || hashError) {
        console.error("[JR Clinic] Password recovery URL error:", queryError || hashError);
        if (mounted) setStatus("invalid");
        return;
      }

      let recoveryError: Error | null = null;

      // Process the recovery payload before considering any pre-existing session.
      // This prevents an older login session from masking the password-recovery session.
      if (authCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(authCode);
        recoveryError = error;
      } else if (accessToken && refreshToken && recoveryType === "recovery") {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        recoveryError = error;
      } else {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          if (mounted) setStatus("invalid");
          return;
        }
      }

      if (recoveryError) {
        console.error("[JR Clinic] Password recovery session error:", recoveryError);
        if (mounted) setStatus("invalid");
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        console.error("[JR Clinic] Password recovery user validation error:", userError);
        if (mounted) setStatus("invalid");
        return;
      }

      cleanRecoveryUrl();
      if (mounted) setStatus("ready");
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
    if (password.length < 8) {
      toast.error("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As duas senhas precisam ser iguais.");
      return;
    }

    setBusy(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setBusy(false);
      setStatus("invalid");
      toast.error("Sua sessão de recuperação expirou. Solicite um novo link.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setBusy(false);
      if (error.message.toLowerCase().includes("auth session missing")) {
        setStatus("invalid");
        toast.error("Sua sessão de recuperação expirou. Solicite um novo link.");
      } else {
        toast.error(error.message);
      }
      return;
    }

    const { data: isAdmin } = await (supabase as any).rpc("is_current_user_admin");
    window.localStorage.removeItem(RECOVERY_TARGET_KEY);
    setBusy(false);

    toast.success("Senha alterada com sucesso.");
    window.location.replace(isAdmin || recoveryTarget === "/admin" ? "/admin" : "/minha-conta");
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
                <a href={recoveryTarget === "/admin" ? "/auth?next=%2Fadmin" : "/auth"}>Solicitar novo link</a>
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
                  placeholder="Mínimo de 8 caracteres"
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
