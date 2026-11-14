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

async function showPushNotification(event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  let title = "JR Clinic";
  if (typeof data.title === "string" && data.title.length <= 120) {
    title = data.title;
  }
  let body = "Há uma atualização na sua agenda.";
  if (typeof data.body === "string" && data.body.length <= 300) {
    body = data.body;
  }
  let tag = `jr-clinic-${Date.now()}`;
  if (typeof data.tag === "string" && data.tag.length <= 100) {
    tag = data.tag;
  }

  await self.registration.showNotification(title, {
    body,
    tag,
    icon: "/icons/jr-clinic-192.png",
    badge: "/icons/jr-clinic-192.png",
    data: { url: safeInternalPath(data.url) },
    renotify: false,
  });
}

self.addEventListener("push", (event) => {
  event.waitUntil(showPushNotification(event));
});

async function openNotification(target) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (existing) {
    await existing.navigate(target);
    await existing.focus();
    return;
  }
  await self.clients.openWindow(target);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeInternalPath(event.notification.data?.url);
  event.waitUntil(openNotification(target));
});
