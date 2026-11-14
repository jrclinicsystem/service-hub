export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase();
}

export function authErrorMessage(error: { code?: string | undefined; message?: string | undefined }) {
  if (error.code === "email_not_confirmed") return "Confirme seu e-mail antes de entrar. Abra o link de confirmação mais recente.";
  if (error.code === "invalid_credentials" || error.message?.toLowerCase().includes("invalid login credentials")) {
    return "E-mail ou senha incorretos. Se necessário, use ‘Esqueci minha senha’.";
  }
  if (error.code === "user_banned") return "Esta conta está bloqueada. Consulte a administração da JR Clinic.";
  return "Não foi possível entrar agora. Tente novamente em instantes.";
}

// Reads only through the signed-in client/RLS. No role assignment, metadata trust,
// allowlist mutation, or privileged client is involved in this decision.
export async function verifiedPortalAccess(db: any): Promise<"admin" | "professional" | "client"> {
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new Error("Sua sessão expirou. Entre novamente.");
  if (!data.user.email_confirmed_at) throw new Error("Confirme seu e-mail antes de acessar o painel.");

  const admin = await db.rpc("is_current_user_admin");
  if (admin.error) throw new Error("Não foi possível verificar a autorização da conta. Tente novamente.");
  if (admin.data === true) return "admin";

  const email = normalizeAuthEmail(data.user.email ?? "");
  if (!email) return "client";
  // Escape LIKE wildcards: an address must match literally, not another person's email.
  const literalEmail = email.replace(/[\\%_]/g, "\\$&");
  const access = await db.from("professional_access")
    .select("professional_id, email, enabled")
    .ilike("email", literalEmail).eq("enabled", true).maybeSingle();
  if (access.error) throw new Error("Não foi possível verificar a autorização da colaboradora. Tente novamente.");
  if (!access.data?.professional_id || normalizeAuthEmail(access.data.email ?? "") !== email) return "client";

  const professional = await db.from("professionals").select("id, is_active, deleted_at")
    .eq("id", access.data.professional_id).maybeSingle();
  if (professional.error) throw new Error("Não foi possível verificar a agenda autorizada. Tente novamente.");
  return professional.data?.is_active && !professional.data.deleted_at ? "professional" : "client";
}