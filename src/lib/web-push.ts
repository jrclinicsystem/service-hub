import { supabase } from "@/integrations/supabase/client";
import { getPushNotificationConfig } from "@/lib/push.functions";

const db = supabase as any;

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isInstalledApp() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function supportsIosPush() {
  const match = navigator.userAgent.match(/OS (\d+)[_.](\d+)?[_.]?(\d+)?/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  return major > 16 || (major === 16 && minor >= 4);
}

export async function currentPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  return registration?.pushManager.getSubscription() ?? null;
}

export async function activateProfessionalPush(professionalId: string) {
  if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Este navegador não oferece Web Push em uma conexão segura.");
  }
  if (isIosDevice() && (!isInstalledApp() || !supportsIosPush())) {
    throw new Error("No iPhone, use iOS 16.4 ou superior e instale com Adicionar à Tela de Início antes de ativar.");
  }
  if (typeof Notification === "undefined") throw new Error("Este navegador não permite notificações.");
  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("A permissão de notificações não foi concedida.");

  const configuration = await getPushNotificationConfig();
  if (!configuration.enabled || !configuration.publicKey) {
    throw new Error("O envio ainda não foi configurado pela administração do sistema.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const subscription = registration.pushManager.getSubscription
    ? await registration.pushManager.getSubscription()
    : null;
  const activeSubscription = subscription ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(configuration.publicKey),
  });
  const json = activeSubscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("O navegador criou uma inscrição incompleta.");
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sua sessão expirou. Entre novamente.");

  // Release this endpoint from any previous account on a shared device before linking it.
  const { error: releaseError } = await db.rpc("release_device_push_subscription", {
    _endpoint: json.endpoint,
  });
  if (releaseError) throw new Error(`Não foi possível proteger a inscrição deste aparelho: ${releaseError.message}`);

  const { error } = await db.from("push_subscriptions").upsert({
    user_id: userData.user.id,
    professional_id: professionalId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    device_label: navigator.platform || "Aparelho",
    user_agent: navigator.userAgent.slice(0, 500),
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) {
    await activeSubscription.unsubscribe().catch(() => false);
    throw new Error(`Não foi possível vincular este aparelho à sua agenda: ${error.message}`);
  }
  return activeSubscription;
}

export async function deactivatePushOnThisDevice() {
  try {
    const subscription = await currentPushSubscription();
    if (subscription?.endpoint) {
      await db.rpc("release_device_push_subscription", { _endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
  } catch {
    // Sign-out must still finish when the device is offline or permission was already revoked.
  }
}
