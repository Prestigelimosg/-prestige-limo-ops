import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile("app/page.tsx", "utf8");
const persistence = await readFile("lib/admin-driver-job-link-persistence.ts", "utf8");

function assertIncludes(source, fragment, label) {
  assert.ok(source.includes(fragment), `Missing ${label}: ${fragment}`);
}

const queueStart = app.indexOf('data-pending-driver-ack-queue="true"');
const driverJobLinkStart = app.indexOf('data-dispatch-workflow-step="driver-job-link"');
const driverReportsStart = app.indexOf('data-admin-driver-reports-disclosure="true"');

assert.notEqual(queueStart, -1, "Pending Driver ACK Queue is missing.");
assert.ok(queueStart < driverJobLinkStart, "Queue must replace the old header pill above the established link card.");
assert.ok(driverJobLinkStart < driverReportsStart, "Established Driver Reports must remain inside Driver Job Link.");
assert.ok(
  !app.includes('data-admin-driver-job-link-acknowledgement="true"'),
  "Old per-booking acknowledgement pill must not duplicate the queue.",
);

for (const fragment of [
  "Pending for Driver ACK Queue",
  'data-pending-driver-ack-queue-count={String(pendingDriverAckQueueItems.length)}',
  'data-pending-driver-ack-queue-pulsing=',
  'pendingDriverAckQueueItems.length > 0\n                  ? "animate-pulse',
  'data-pending-driver-ack-queue-list="true"',
  "pendingDriverAckQueueItems.map((item, index)",
  "{index + 1}) {item.publicReference} · {adminDriverJobCardKindLabel(item.jobCardKind)} · Link issued",
  "`Waiting ${item.waitingMinutes} min`",
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
]) {
  assertIncludes(app, fragment, "pending queue wiring");
}

assert.ok(
  !app.slice(queueStart, driverJobLinkStart).includes(".slice("),
  "Queue must support every pending booking without a fixed two-or-three row cap.",
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
