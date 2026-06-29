const APP_VERSION = "20260629-F78";
const CACHE_NAME = `premtek-${APP_VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("premtek-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

function shouldBypass(requestUrl) {
  let requestPath = "";
  try {
    requestPath = new URL(requestUrl).pathname;
  } catch {
    return true;
  }

  return (
    requestPath.startsWith("/_next/static/") ||
    requestPath === "/sw.js" ||
    requestPath === "/version.json" ||
    requestUrl.includes("googleapis.com") ||
    requestUrl.includes("firebaseio.com") ||
    requestUrl.includes("firebasestorage.googleapis.com") ||
    requestUrl.includes("identitytoolkit") ||
    requestUrl.includes("securetoken") ||
    !requestUrl.startsWith(self.location.origin)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;
  if (shouldBypass(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, cloned).catch(() => undefined);
          });
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match("/");
          if (fallback) return fallback;
          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }),
    );
    return;
  }

  if (["style", "script", "worker", "font", "image"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (!response || response.status !== 200) return response;
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, cloned).catch(() => undefined);
          });
          return response;
        });
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "裝機戰情室", body: "有新通知" };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "premtek",
      data: data.url ? { url: data.url } : {},
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard/install";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((win) => win.url === targetUrl && "focus" in win);
      return existing ? existing.focus() : clients.openWindow(targetUrl);
    }),
  );
});

