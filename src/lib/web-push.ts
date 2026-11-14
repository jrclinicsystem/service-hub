import { supabase } from "@/integrations/supabase/client";
import { getPushNotificationConfig } from "@/lib/push.functions";

const db = supabase as any;
const DEVICE_OWNER_KEY = "jrclinic:push-owner";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function storedOwner() {
  try {
    return localStorage.getItem(DEVICE_OWNER_KEY);
  } catch {
    return null;
  }
}

function rememberOwner(id: string | null) {
  try {
    if (id) localStorage.setItem(DEVICE_OWNER_KEY, id);
    else localStorage.removeItem(DEVICE_OWNER_KEY);
  } catch {
    // Private browsing can restrict local storage. Database authorization remains authoritative.
  }
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
  // iPadOS can identify itself as desktop Safari; do not reject a capable
  // installed device just because its user-agent omits the iOS version.
  const match = navigator.userAgent.match(/OS (\\d+)[_.](\\d+)?[_.]?(\\d+)?/);
  if (!match) return true;
  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  return major > 16 || (major === 16 && minor >= 4);
}

export async function currentPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
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
  // Ask on the direct tap gesture, before any other asynchronous operation.
  // iOS Safari is especially strict about losing user activation.
  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("A permissão de notificações não foi concedida.");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sua sessão expirou. Entre novamente.");
  const userId = userData.user.id;

  const configuration = await getPushNotificationConfig();
  if (!configuration.enabled || !configuration.publicKey) {
    throw new Error("O envio ainda não foi configurado pela administração do sistema.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  // Shared device: the previous browser subscription must not survive a change of identity.
  const owner = storedOwner();
  if (subscription && owner && owner !== userId) {
    await subscription.unsubscribe();
    subscription = null;
  }

  const subscribe = () => registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(configuration.publicKey!),
  });

  const registerInDatabase = async (active: PushSubscription) => {
    const json = active.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
      throw new Error("O navegador criou uma inscrição incompleta.");
    }
    // UPSERT never deletes a same-owner subscription, preserving pending deliveries.
    const { error } = await db.from("push_subscriptions").upsert({
      user_id: userId,
      professional_id: professionalId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      device_label: navigator.platform || "Aparelho",
      user_agent: navigator.userAgent.slice(0, 500),
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    if (error) throw new Error(error.message);
  };

  const reusedExisting = Boolean(subscription);
  subscription ??= await subscribe();
  try {
    await registerInDatabase(subscription);
  } catch (firstError) {
    if (!reusedExisting) {
      await subscription.unsubscribe().catch(() => false);
      throw new Error(`Não foi possível vincular este aparelho: ${firstError instanceof Error ? firstError.message : "Erro no banco"}`);
    }
    // An endpoint can belong to an old signed-out or different account.
    // Never seize/delete somebody else's subscription; rotate locally instead.
    await subscription.unsubscribe().catch(() => false);
    subscription = await subscribe();
    try {
      await registerInDatabase(subscription);
    } catch (retryError) {
      await subscription.unsubscribe().catch(() => false);
      throw new Error(`Não foi possível vincular este aparelho: ${retryError instanceof Error ? retryError.message : "Erro no banco"}`);
    }
  }
  rememberOwner(userId);
  return subscription;
}

export async function deactivatePushOnThisDevice() {
  const subscription = await currentPushSubscription().catch(() => null);
  if (subscription) {
    try {
      await db.rpc("release_device_push_subscription", { _endpoint: subscription.endpoint });
    } catch {
      // Supabase session may already be revoked by another tab.
    }
    // Unsubscribe even if the API call failed or the account has already signed out.
    await subscription.unsubscribe().catch(() => false);
  }
  rememberOwner(null);
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const existing = await registration?.getNotifications();
    existing?.forEach((notification) => notification.close());
  } catch {
    // A missing service worker must not prevent logout.
  }
}
