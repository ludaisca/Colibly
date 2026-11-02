/* Service worker de Colibly: solo notificaciones push (lib/notifications/push.ts).
   No cachea nada ni intercepta peticiones: la app sigue siendo 100 % en línea. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Colibly", body: event.data ? event.data.text() : "" };
  }
  const link = typeof data.link === "string" && data.link.startsWith("/") && !data.link.startsWith("//") ? data.link : "/";
  event.waitUntil(
    self.registration.showNotification(data.title || "Colibly", {
      body: data.body || "",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      icon: "/apple-icon",
      badge: "/apple-icon",
      data: { link },
    })
  );
});

// Al hacer clic: si ya hay una pestaña de la app, se enfoca y navega ahí; si
// no, se abre una nueva.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client.focus().then((focused) => (focused && "navigate" in focused ? focused.navigate(url) : undefined));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
