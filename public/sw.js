// JR Clinic messaging service worker. No application/data caching is performed.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function safeInternalPath(value) {
  try {
    const url = new URL(value || "/profissional", self.location.origin);
    if (url.origin !== self.location.origin) return "/profissional";
    if (url.pathname !== "/profissional") return "/profissional";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/profissional";
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch {
      data = {};
    }
    const title = typeof data.title === "string" && data.title.length <= 120
      ? data.title
      : "JR Clinic";
    const body = typeof data.body === "string" && data.body.length <= 300
      ? data.body
      : "Há uma atualização na sua agenda.";
    const tag = typeof data.tag === "string" && data.tag.length <= 100
      ? data.tag
      : `jr-clinic-${Date.now()}`;
    await self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icons/jr-clinic-192.png",
      badge: "/icons/jr-clinic-192.png",
      data: { url: safeInternalPath(data.url) },
      renotify: false,
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeInternalPath(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(target);
      await existing.focus();
      return;
    }
    await self.clients.openWindow(target);
  })());
});
