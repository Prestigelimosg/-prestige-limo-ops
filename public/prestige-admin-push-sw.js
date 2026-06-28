self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : "Prestige Limo Ops";
  const body =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : "Open Dashboard to review.";
  const url =
    typeof payload.url === "string" && payload.url.startsWith("/")
      ? payload.url
      : "/";
  const tag =
    typeof payload.tag === "string" && payload.tag.trim()
      ? payload.tag.trim()
      : "prestige-admin-alert";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: {
        url,
      },
      tag,
      renotify: true,
      requireInteraction: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    event.notification.data &&
    typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/";

  event.waitUntil(
    self.clients
      .matchAll({
        includeUncontrolled: true,
        type: "window",
      })
      .then((clientList) => {
        const matchingClient = clientList.find((client) =>
          client.url.endsWith(targetUrl),
        );

        if (matchingClient && "focus" in matchingClient) {
          return matchingClient.focus();
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }

        return undefined;
      }),
  );
});
