// Called by the two existing page refreshes; no extra timer or native command.
let nextActivityAt = 0;
export function reportDriverActivity(installationId: string) {
  if (typeof document === "undefined" || document.visibilityState !== "visible" || !installationId || Date.now() < nextActivityAt) return;
  nextActivityAt = Date.now() + 60_000;
  try {
    void fetch("/api/driver-auth/session", {
      method: "PATCH", credentials: "same-origin", cache: "no-store",
      headers: { "x-prestige-driver-purpose": "driver-account-activity", "x-prestige-driver-installation-id": installationId },
      signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(3000) : undefined,
    }).catch(() => undefined);
  } catch { /* Older WebViews and activity failures must not interrupt job refresh. */ }
}
