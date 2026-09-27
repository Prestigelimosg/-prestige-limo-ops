import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const app = await readFile("app/page.tsx", "utf8");
const browserGuard = await readFile("scripts/test-pending-driver-ack-queue-browser.mjs", "utf8");
const packageJson = await readFile("package.json", "utf8");
const persistence = await readFile("lib/admin-driver-job-link-persistence.ts", "utf8");

// Execute the real queue projection through a background read, not a copy of its logic.
const projectionStart = app.indexOf("const pendingDriverAckQueueItems =");
const projectionEnd = app.indexOf("const adminNotificationCentreCount =", projectionStart);
assert.ok(projectionStart > -1 && projectionEnd > projectionStart);
const projectQueue = new Function(
  "dashboardDriverJobLinksReadState", "pendingDriverAckQueueEligibleBookings",
  "getActiveJobBookingReference", "bookingPublicReference", "adminDriverJobLinkWaitingMinutes", "currentTimeMs", "clean", "getBookerName",
  ts.transpileModule(app.slice(projectionStart, projectionEnd), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText + "\nreturn pendingDriverAckQueueItems;",
);
const cleanDisplayText = value => String(value ?? "").trim();
const bookerHelperStart = app.indexOf("function getBookerName(");
const bookerHelperEnd = app.indexOf("function bookingMatchesLocalSearch(", bookerHelperStart);
assert.ok(bookerHelperStart > -1 && bookerHelperEnd > bookerHelperStart);
const savedBookerName = new Function("clean", ts.transpileModule(app.slice(bookerHelperStart, bookerHelperEnd), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText + "\nreturn getBookerName;")(cleanDisplayText);
const queueBookings = [{ reference: "ACK-ONE" }, { reference: "ACK-TWO" }];
const firstLink = { id: "link-one", link_status: "active", issued_at: "2026-09-22T00:00:00Z", safe_summary: { acknowledged: false, ack_alert_closed: false } };
const secondLink = { ...firstLink, id: "link-two" };
const retainedLinks = { "ACK-ONE": firstLink, "ACK-TWO": secondLink };
const projectIds = (status, linksByReference) => projectQueue(
  { status, linksByReference }, queueBookings, booking => booking.reference,
  booking => booking.reference, () => 10, 0, cleanDisplayText, savedBookerName,
).map(item => item.linkId);
assert.deepEqual(projectIds("loaded", retainedLinks), ["link-one", "link-two"]);
assert.deepEqual(projectIds("loading", retainedLinks), ["link-one", "link-two"],
  "Background ACK refresh must retain the displayed rows rather than collapse the queue.");
assert.deepEqual(projectIds("loading", {}), [], "First load must not invent pending rows.");
assert.deepEqual(projectIds("loaded", { "ACK-TWO": secondLink }), ["link-two"],
  "A completed refresh must remove rows no longer returned.");
assert.deepEqual(projectIds("loaded", {
  ...retainedLinks, "ACK-ONE": { ...firstLink, safe_summary: { acknowledged: true } },
}), ["link-two"], "A fresh acknowledgement must still clear only its exact row.");
assert.deepEqual(projectIds("loaded", {
  ...retainedLinks, "ACK-ONE": { ...firstLink, safe_summary: { ack_alert_closed: true } },
}), ["link-two"], "A fresh exact-link Close must still clear its row.");
assert.deepEqual(projectIds("error", {}), [], "Existing failed-read behavior is preserved.");

// Display must use the exact saved booking and current link, never the selected draft,
// passenger/customer identity, old driver, or a default service inferred from missing data.
const displayBookings = [
  { reference: "ACK-ONE", public_booking_reference: "11053", contact_display_name: "QA Booker A", service_type: "DEP", driver_plate_number: "OLD1111A" },
  { reference: "ACK-TWO", public_booking_reference: "11054", contact_display_name: "QA Booker B", service_type: "MNG" },
  { reference: "COMBO-PRIMARY", public_booking_reference: "11055", contact_display_name: "QA Booker C", service_type: "DSP" },
  { reference: "COMBO-CHILD", public_booking_reference: "11056", contact_display_name: "QA Booker C", service_type: "TRF" },
  { reference: "UNKNOWN", public_booking_reference: "11057", passenger_name: "NOT THE BOOKER", customer_display_name: "NOT THE BOOKER EITHER" },
];
const comboSummary = { primary_reference: "COMBO-PRIMARY", trip_count: 2, vehicle: "AVF" };
const displayLinks = {
  "ACK-ONE": { ...firstLink, safe_summary: { ...firstLink.safe_summary, assigned_driver_plate: "SNP9124S" } },
  "ACK-TWO": { ...secondLink, safe_summary: { ...secondLink.safe_summary, assigned_driver_plate: "SNP9124S" } },
  "COMBO-PRIMARY": { ...firstLink, id: "combo-primary", safe_summary: { combo: comboSummary, assigned_driver_plate: "SLA3003C" } },
  "COMBO-CHILD": { ...firstLink, id: "combo-child", safe_summary: { combo: comboSummary, assigned_driver_plate: "SLA3003C" } },
  "UNKNOWN": { ...firstLink, id: "unknown", safe_summary: {} },
};
const displayProject = (status, links = displayLinks) => projectQueue(
  { status, linksByReference: links }, displayBookings, booking => booking.reference,
  booking => booking.public_booking_reference || "Reference unavailable", () => 10, 0,
  cleanDisplayText, savedBookerName,
);
const displayRows = displayProject("loaded");
assert.deepEqual(displayRows.map(row => [row.assignedDriverPlate, row.bookerName, row.serviceLabel, row.bookingDisplayReference]), [
  ["SNP9124S", "QA Booker A", "DEP", "11053"],
  ["SNP9124S", "QA Booker B", "MNG", "11054"],
  ["SLA3003C", "QA Booker C", "Combo", "11055"],
  ["Not set", "Not set", "Not set", "11057"],
]);
assert.deepEqual(displayProject("loading"), displayRows, "Refresh must retain all display fields and row identities.");
assert.equal(displayRows[2].publicReference, "AVF Combo · 2 trips", "Keep existing action descriptions independent of the new visible label.");
const reassigned = displayProject("loaded", { ...displayLinks, "ACK-ONE": { ...displayLinks["ACK-ONE"], id: "new-driver-link", safe_summary: { assigned_driver_plate: "SLB2222B" } } });
assert.equal(reassigned[0].assignedDriverPlate, "SLB2222B");
assert.equal(reassigned[0].linkId, "new-driver-link");
assert.equal(reassigned[1].linkId, secondLink.id, "Another job with the same plate must remain independent.");
assert.ok(!displayRows.some(row => row.linkId === "combo-child"), "A combo must remain one primary row.");

function assertIncludes(source, fragment, label) {
  assert.ok(source.includes(fragment), `Missing ${label}: ${fragment}`);
}

const queueStart = app.lastIndexOf('data-pending-driver-ack-queue="true"');
const driverJobLinkStart = app.indexOf('data-dispatch-workflow-step="driver-job-link"');
const driverReportsStart = app.indexOf('data-admin-driver-reports-disclosure="true"');

assert.notEqual(queueStart, -1, "Pending Driver ACK Queue is missing.");
assert.ok(!app.includes("Pending for Driver ACK Queue"), "Do not restore the retired queue heading.");
assert.ok(driverJobLinkStart < driverReportsStart, "Established Driver Reports must remain inside Driver Job Link.");
assert.ok(driverReportsStart < queueStart, "Queue must sit below the complete established Driver Job Link section.");
assert.ok(
  !app.includes('data-admin-driver-job-link-acknowledgement="true"'),
  "Old per-booking acknowledgement pill must not duplicate the queue.",
);

for (const fragment of [
  "Pending for ack",
  'className={`order-[55] min-w-0 rounded-md border transition',
  'data-pending-driver-ack-queue-count={String(pendingDriverAckQueueItems.length)}',
  'data-pending-driver-ack-queue-pulsing=',
  'pendingDriverAckQueueItems.length > 0\n                  ? "animate-pulse',
  'data-pending-driver-ack-queue-list="true"',
  "pendingDriverAckQueueItems.map((item)",
  "{item.assignedDriverPlate} - {item.bookerName} - {item.serviceLabel} - {item.bookingDisplayReference}",
  "{adminDriverJobCardKindLabel(item.jobCardKind)} · Link issued",
  "`Waiting ${item.waitingMinutes} min`",
  'data-pending-driver-ack-queue-link-id={item.linkId}',
  'data-pending-driver-ack-dismiss={item.linkId}',
  'onClick={() => void dismissPendingDriverAckAlert(item.linkId, item.bookingReference)}',
  "Close this alert and stop its reminders. The Job Link remains usable.",
  ">\n                          Close\n                        </button>",
  'pendingDriverAckQueueItems.length > 0 ? (',
  'pendingDriverAckQueueItems.length > 0 ? "text-lg" : "text-sm"',
  "const pendingDriverAckQueueEligibleBookings = operationalBookings",
  ".filter((bookingRecord) => Boolean(getBookingDriverJobStatusReference(bookingRecord)))",
  "const pendingDriverAckQueueReferenceKey = pendingDriverAckQueueReferenceList.join(\"|\")",
  'const driverAckQueueMonitorIsActive = activeTab === "dashboard" || activeTab === "dispatch";',
  "void refreshDashboardDriverJobLinksRead(bookingReferences);",
  "setDashboardDriverJobLinksReadState((current) => ({",
  "[cleanReferenceText(link.booking_reference)]: link",
  "linksByReference[linkReference]",
  "!link.safe_summary.acknowledged",
  "!link.safe_summary.ack_alert_closed",
  "linkId: link.id",
  "function dismissPendingDriverAckAlert(driverJobLinkId: string, bookingReference: string)",
]) {
  assertIncludes(app, fragment, "pending queue wiring");
}

const queueEnd = app.indexOf('data-dispatch-workflow-step="admin-lower-status"', queueStart);
const queueBlock = app.slice(queueStart, queueEnd);

assert.ok(queueEnd > queueStart, "Pending queue block boundary is missing.");
assert.ok(
  !queueBlock.includes("No driver acknowledgements pending."),
  "Zero pending state must stay one slim title-and-count row without a duplicate empty sentence.",
);
assert.ok(
  !queueBlock.includes(".slice("),
  "Queue must support every pending booking without a fixed two-or-three row cap.",
);

const dismissStart = app.indexOf("function dismissPendingDriverAckAlert");
const dismissEnd = app.indexOf("async function loadExactAdminBookingPersistenceRecord", dismissStart);
const dismissBlock = app.slice(dismissStart, dismissEnd);

assert.ok(dismissStart > -1 && dismissEnd > dismissStart, "Exact-link dismiss helper is missing.");
assert.ok(dismissBlock.includes('action: "close_ack_alert"'), "Close must persist the exact link dismissal.");
assert.ok(!dismissBlock.includes("revokeDriverJobLink"), "Dismissing an alert must not revoke a link.");
assert.ok(dismissBlock.includes("driver_job_link_id:exactLinkId"), "Close must carry the exact link identity.");
assert.ok(!dismissBlock.includes("driver_id"), "Dismissal must not key by driver identity.");

for (const fragment of [
  'const configuredAppUrl = process.env.APP_URL?.trim() || "";',
  "const appPort = await getFreePort();",
  '["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(appPort)]',
  "await waitForAppReady(appUrl, getServerLogs);",
  "const appUrl = app.appUrl;",
  "const chromeDebugPort = configuredChromeDebugPort || (await getFreePort());",
  "await stopProcessGroup(app.server);",
  "await openDispatchTab();",
  'button.textContent?.trim() === "Dispatch"',
  "two independent pending Driver ACK rows",
  "one exact alert dismissed while the second remains",
  "hard refresh retained exact-link dismissal",
  "dismissed exact link remains hidden after hard refresh",
  "Close must call only the existing exact-link alert action.",
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
  "const revision = safeDriverJobPayloadRevision(input.driver_job_payload)",
  '"apply_admin_driver_job_link"',
]) {
  assertIncludes(persistence, fragment, "safe job-card revision classification");
}

const createStart = persistence.indexOf("export async function createAdminDriverJobLink");
const revokeStart = persistence.indexOf("export async function revokeAdminDriverJobLink");
const createBlock = persistence.slice(createStart, revokeStart);

assert.ok(!createBlock.includes('link_status: "revoked"'), "Issuing an amendment must not auto-revoke old links.");
assert.ok(!createBlock.includes("revokeAdminDriverJobLink"), "Create must not call the manual revoke lane.");

console.log("Pending Driver ACK Queue guard passed");

const stableSql=await readFile("supabase/migrations/20260913030000_driver_stable_booking_link.sql","utf8");
for(const field of ["for update","v_count>1","l.driver_id is distinct from b.driver_id","'amended'","'job_card_revision',p_revision"])
  assertIncludes(stableSql,field,"atomic same-booking same-driver reuse");
assert.ok(!stableSql.includes("driver_acknowledged_at',"),"Amending a stable link must not reset ACK");
