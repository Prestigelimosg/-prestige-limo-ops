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
      : "Prestige Limo booking update";
  const body =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : "Open My Bookings to review.";
  const tag =
    typeof payload.tag === "string" && payload.tag.trim()
      ? payload.tag.trim()
      : "prestige-customer-booking-update";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: {
        url: "/my-bookings",
      },
      tag,
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = "/my-bookings";

  event.waitUntil(
    self.clients
      .matchAll({
        includeUncontrolled: true,
        type: "window",
      })
      .then((clientList) => {
        const matchingClient = clientList.find((client) =>
          client.url.includes(targetUrl),
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
