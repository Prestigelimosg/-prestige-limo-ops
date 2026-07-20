import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile("app/page.tsx", "utf8");
const browserGuard = await readFile("scripts/test-pending-driver-ack-queue-browser.mjs", "utf8");
const packageJson = await readFile("package.json", "utf8");
const persistence = await readFile("lib/admin-driver-job-link-persistence.ts", "utf8");

function assertIncludes(source, fragment, label) {
  assert.ok(source.includes(fragment), `Missing ${label}: ${fragment}`);
}

const queueStart = app.indexOf('data-pending-driver-ack-queue="true"');
const driverJobLinkStart = app.indexOf('data-dispatch-workflow-step="driver-job-link"');
const driverReportsStart = app.indexOf('data-admin-driver-reports-disclosure="true"');

assert.notEqual(queueStart, -1, "Pending Driver ACK Queue is missing.");
assert.ok(driverJobLinkStart < driverReportsStart, "Established Driver Reports must remain inside Driver Job Link.");
assert.ok(driverReportsStart < queueStart, "Queue must sit below the complete established Driver Job Link section.");
assert.ok(
  !app.includes('data-admin-driver-job-link-acknowledgement="true"'),
  "Old per-booking acknowledgement pill must not duplicate the queue.",
);

for (const fragment of [
  "Pending for Driver ACK Queue",
  'className={`order-[55] min-w-0 rounded-md border p-3 transition',
  'data-pending-driver-ack-queue-count={String(pendingDriverAckQueueItems.length)}',
  'data-pending-driver-ack-queue-pulsing=',
  'pendingDriverAckQueueItems.length > 0\n                  ? "animate-pulse',
  'data-pending-driver-ack-queue-list="true"',
  "pendingDriverAckQueueItems.map((item, index)",
  "{index + 1}) {item.publicReference} · {adminDriverJobCardKindLabel(item.jobCardKind)} · Link issued",
  "`Waiting ${item.waitingMinutes} min`",
  'data-pending-driver-ack-queue-link-id={item.linkId}',
  'data-pending-driver-ack-dismiss={item.linkId}',
  'onClick={() => dismissPendingDriverAckAlert(item.linkId)}',
  "Dismiss this alert only. The driver job link remains active.",
  ">\n                        Close\n                      </button>",
  "No driver acknowledgements pending.",
  "const pendingDriverAckQueueEligibleBookings = operationalBookings",
  ".filter((bookingRecord) => Boolean(getBookingDriverJobStatusReference(bookingRecord)))",
  "const pendingDriverAckQueueReferenceKey = pendingDriverAckQueueReferenceList.join(\"|\")",
  'const driverAckQueueMonitorIsActive = activeTab === "dashboard" || activeTab === "dispatch";',
  "void refreshDashboardDriverJobLinksRead(bookingReferences);",
  "setDashboardDriverJobLinksReadState((current) => ({",
  "[cleanReferenceText(link.booking_reference)]: link",
  "linksByReference[linkReference]",
  "!link.safe_summary.acknowledged",
  "!dismissedPendingDriverAckLinkIds.includes(link.id)",
  "linkId: link.id",
  'const adminDismissedPendingDriverAckLinksStorageKey =',
  '"prestige-admin-dismissed-pending-driver-ack-links"',
  "function dismissPendingDriverAckAlert(driverJobLinkId: string)",
  "window.localStorage.setItem(",
  "adminDismissedPendingDriverAckLinksStorageKey,",
]) {
  assertIncludes(app, fragment, "pending queue wiring");
}

const queueEnd = app.indexOf('data-dispatch-workflow-step="admin-lower-status"', queueStart);
const queueBlock = app.slice(queueStart, queueEnd);

assert.ok(queueEnd > queueStart, "Pending queue block boundary is missing.");
assert.ok(
  !queueBlock.includes(".slice("),
  "Queue must support every pending booking without a fixed two-or-three row cap.",
);

const dismissStart = app.indexOf("function dismissPendingDriverAckAlert");
const dismissEnd = app.indexOf("function loadSelectedBooking", dismissStart);
const dismissBlock = app.slice(dismissStart, dismissEnd);

assert.ok(dismissStart > -1 && dismissEnd > dismissStart, "Exact-link dismiss helper is missing.");
assert.ok(!dismissBlock.includes("fetch("), "Dismissing an alert must not call an API.");
assert.ok(!dismissBlock.includes("revokeDriverJobLink"), "Dismissing an alert must not revoke a link.");
assert.ok(!dismissBlock.includes("bookingReference"), "Dismissal must not key by booking reference.");
assert.ok(!dismissBlock.includes("driver_id"), "Dismissal must not key by driver identity.");

const dismissedStorageReadStart = app.indexOf(
  "const [dismissedPendingDriverAckLinkIds, setDismissedPendingDriverAckLinkIds]",
);
const dismissedStorageReadEnd = app.indexOf(
  "const [\n    loadBookingsTypedOperationalCardsById",
  dismissedStorageReadStart,
);
const dismissedStorageReadBlock = app.slice(dismissedStorageReadStart, dismissedStorageReadEnd);

assert.ok(
  dismissedStorageReadStart > -1 && dismissedStorageReadEnd > dismissedStorageReadStart,
  "Exact-link local-storage hydration block is missing.",
);
assertIncludes(
  dismissedStorageReadBlock,
  "window.localStorage.getItem(adminDismissedPendingDriverAckLinksStorageKey)",
  "exact-link local-storage read",
);
assertIncludes(
  dismissedStorageReadBlock,
  "parsed.map(cleanReferenceText).filter(Boolean).slice(-500)",
  "bounded exact-link local-storage hydration",
);

for (const fragment of [
  'const configuredAppUrl = process.env.APP_URL?.trim() || "";',
  "const appPort = await getFreePort();",
  '["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(appPort)]',
  "await waitForAppReady(appUrl, getServerLogs);",
  "const appUrl = app.appUrl;",
  "const chromeDebugPort = configuredChromeDebugPort || (await getFreePort());",
  "await stopProcessGroup(app.server);",
  "two independent pending Driver ACK rows",
  "one exact alert dismissed while the second remains",
  "hard refresh retained exact-link dismissal",
  "dismissed exact link remains hidden after hard refresh",
  "Close must not create POST, PATCH, DELETE, or other mutations.",
  "new link ID for the same booking appears after older dismissal",
  "Close must leave the exact private link active.",
  "assert.deepEqual(amendedQueue.ids, [amendedLinkId, secondLinkId])",
]) {
  assertIncludes(browserGuard, fragment, "self-contained focused pending ACK Close browser coverage");
}

assertIncludes(
  packageJson,
  '"test:pending-driver-ack-queue-browser": "node scripts/test-pending-driver-ack-queue-browser.mjs"',
  "focused pending ACK Close browser command",
);

for (const fragment of [
  'export type AdminDriverJobCardKind = "amendment" | "new" | "reissued";',
  "classifyAdminDriverJobCardKind(",
  'return "new";',
  '? "reissued"\n    : "amendment";',
  '.eq("booking_reference", input.booking_reference)',
  '.order("created_at", { ascending: false })',
  "job_card_revision: safeDriverJobPayloadRevision(input.driver_job_payload)",
  "job_card_kind: jobCardKind",
]) {
  assertIncludes(persistence, fragment, "safe job-card revision classification");
}

const createStart = persistence.indexOf("export async function createAdminDriverJobLink");
const revokeStart = persistence.indexOf("export async function revokeAdminDriverJobLink");
const createBlock = persistence.slice(createStart, revokeStart);

assert.ok(!createBlock.includes('link_status: "revoked"'), "Issuing an amendment must not auto-revoke old links.");
assert.ok(!createBlock.includes("revokeAdminDriverJobLink"), "Create must not call the manual revoke lane.");

console.log("Pending Driver ACK Queue guard passed");
