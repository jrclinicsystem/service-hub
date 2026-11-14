/** Only known public Web Push services may receive server-side outbound requests. */
export function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isProvider = hostname === "fcm.googleapis.com"
      || hostname === "updates.push.services.mozilla.com"
      || hostname === "web.push.apple.com"
      || (hostname.endsWith(".push.apple.com") && hostname !== ".push.apple.com")
      || (hostname.endsWith(".notify.windows.com") && hostname !== ".notify.windows.com");
    return url.protocol === "https:" && !url.username && !url.password
      && !url.port && !url.hash && isProvider;
  } catch {
    return false;
  }
}
