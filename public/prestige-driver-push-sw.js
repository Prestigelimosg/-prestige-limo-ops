const databaseName = "prestige-driver-device-alerts";
const databaseVersion = 1;
const linkStoreName = "driver-job-links";

function openDriverAlertDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(linkStoreName)) {
        database.createObjectStore(linkStoreName, { keyPath: "jobKey" });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function rememberDriverJobLink(jobKey, url) {
  if (
    typeof jobKey !== "string" ||
    !/^[0-9a-f]{64}$/.test(jobKey) ||
    typeof url !== "string" ||
    !url.startsWith("/driver-job/")
  ) {
    return;
  }

  const database = await openDriverAlertDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(linkStoreName, "readwrite");
    transaction.objectStore(linkStoreName).put({ jobKey, url });
    transaction.addEventListener("complete", resolve);
    transaction.addEventListener("error", () => reject(transaction.error));
  });
  database.close();
}

async function loadDriverJobLink(jobKey) {
  if (typeof jobKey !== "string" || !/^[0-9a-f]{64}$/.test(jobKey)) {
    return null;
  }

  const database = await openDriverAlertDatabase();
  const result = await new Promise((resolve, reject) => {
    const transaction = database.transaction(linkStoreName, "readonly");
    const request = transaction.objectStore(linkStoreName).get(jobKey);
    request.addEventListener("success", () => resolve(request.result || null));
    request.addEventListener("error", () => reject(request.error));
  });
  database.close();
  return result && typeof result.url === "string" && result.url.startsWith("/driver-job/")
    ? result.url
    : null;
}

self.addEventListener("message", (event) => {
  const data = event.data && typeof event.data === "object" ? event.data : {};
  if (data.type !== "PRESTIGE_REMEMBER_DRIVER_JOB_LINK") {
    return;
  }

  event.waitUntil(rememberDriverJobLink(data.jobKey, data.url));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const jobKey =
    typeof payload.job_key === "string" && /^[0-9a-f]{64}$/.test(payload.job_key)
      ? payload.job_key
      : "";
  const tag =
    typeof payload.tag === "string" && payload.tag.startsWith("prestige-driver-update-")
      ? payload.tag
      : "prestige-driver-update";
  const targetPath =
    typeof payload.target_path === "string" &&
      /^\/driver-job\/[A-Za-z0-9_-]{20,512}$/.test(payload.target_path)
      ? payload.target_path
      : "";
  const body = payload.body === "New Driver Job issued. Tap to review."
    ? "New Driver Job issued. Tap to review."
    : "New Driver Job app update. Tap to review.";

  event.waitUntil(
    self.registration.showNotification("Prestige Limo Ops", {
      body,
      data: { jobKey, targetPath },
      tag,
      renotify: true,
      requireInteraction: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const jobKey =
    event.notification.data && typeof event.notification.data.jobKey === "string"
      ? event.notification.data.jobKey
      : "";
  const targetPath =
    event.notification.data &&
      typeof event.notification.data.targetPath === "string" &&
      /^\/driver-job\/[A-Za-z0-9_-]{20,512}$/.test(event.notification.data.targetPath)
      ? event.notification.data.targetPath
      : "";

  event.waitUntil(
    (targetPath ? Promise.resolve(targetPath) : loadDriverJobLink(jobKey)).then(async (storedTargetUrl) => {
      const targetUrl = storedTargetUrl || "/driver-portal";

      const clientList = await self.clients.matchAll({
        includeUncontrolled: true,
        type: "window",
      });
      const matchingClient = clientList.find((client) => client.url.endsWith(targetUrl));

      if (matchingClient && "focus" in matchingClient) {
        return matchingClient.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
    }),
  );
});
