import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync("app/page.tsx", "utf8");
function section(start, end) {
  const a = source.indexOf(start);
  assert.ok(a >= 0, `Missing ${start}`);
  const b = source.indexOf(end, a);
  assert.ok(b > a, `Missing ${end}`);
  return source.slice(a, b);
}
const builder = section("      const savedBookingNotices =", "      const saveMessage =");
const filter = section("  const dashboardSystemNoticeIsRoutineSuccess =", "\n\n  if (");
const run = (code, context) => vm.runInNewContext(ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const clean = (v) => String(v ?? "").trim();
const fixture = (reference = "ADM-SYNTHETIC-1", publicReference = "11001", fields = {}) => ({
  record: { booking_reference: reference, public_booking_reference: publicReference },
  bookingValue: { date: "2026-10-01", time: "1200", pickup: "A", dropoff: "B", ...fields },
});
const notices = (savedBookings, calendarSyncResults) => JSON.parse(JSON.stringify(run(
  builder + "\nsavedBookingNotices", {
    savedBookings, calendarSyncResults, clean,
    formatAdminBookingPickupDateTime: (b) => b.date && /^([01][0-9]|2[0-3])[0-5][0-9]$/.test(b.time) ? "valid" : null,
  },
)));
let result = notices([fixture(undefined, undefined, { pickup: "", dropoff: "" })], [{ ok: true, skipped: true }]);
assert.equal(result[0].text, "Booking 11001 — Add pickup or drop-off.");
assert.equal(result[0].bookingReference, "ADM-SYNTHETIC-1");
assert.equal(result[0].needsAttention, true);
result = notices([fixture(undefined, undefined, { time: "9999" })], [{ ok: true, skipped: true }]);
assert.equal(result[0].text, "Booking 11001 — Check pickup date/time.");
result = notices([fixture(undefined, undefined, { date: "", pickup: "", dropoff: "" })], [{ ok: true, skipped: true }]);
assert.equal(result[0].text, "Booking 11001 — Check pickup date/time. Add pickup or drop-off.");
// A valid pickup OR drop-off already satisfies the unchanged Calendar gate.
result = notices([fixture(undefined, undefined, { dropoff: "" })], [{ ok: true }]);
assert.equal(result[0].text, "Booking 11001 — Saved to Calendar.");
assert.equal(result[0].needsAttention, false);
result = notices([fixture(), fixture("ADM-SYNTHETIC-2", "11002")], [{ ok: true }, { ok: false, message: "PRIVATE PROVIDER ERROR" }]);
assert.equal(result[1].text, "Booking 11002 — Calendar not updated. Check Update + Cal.");
assert.equal(result[1].bookingReference, "ADM-SYNTHETIC-2");
assert.equal(result[1].needsAttention, true);
assert.ok(!JSON.stringify(result.map((n) => n.text)).includes("ADM-"));
assert.ok(!JSON.stringify(result).includes("PRIVATE PROVIDER ERROR"));
result = notices([fixture("ADM-SYNTHETIC", null)], [{ ok: false }]);
assert.equal(result[0].text, "Saved booking (number unavailable) — Calendar not updated. Check Update + Cal.");
for (const tone of ["info", "success"]) {
  assert.equal(run(filter + '\ndashboardSystemNoticeIsRoutineSuccess({tone, text:"No queued saved admin app notifications."})', { clean, tone }), true);
}
assert.equal(run(filter + '\ndashboardSystemNoticeIsRoutineSuccess({tone:"error", text:"No queued saved admin app notifications."})', { clean }), false);
assert.equal(run(filter + '\ndashboardSystemNoticeIsRoutineSuccess({tone:"error", text:"Could not load alerts"})', { clean }), false);
const panel = section("            {dashboardSystemNotices.length > 0 ? (", "\n            <section");
assert.ok(panel.includes("notice.bookingNotices?.length"));
assert.ok(panel.includes("loadAdminAiReadOnlyBookingInDispatch("));
assert.ok(panel.includes("bookingNotice.bookingReference,"));
assert.ok(panel.includes("Open in Dispatch"));
assert.ok(panel.includes("disabled={Boolean(adminAiReadOnlyBookingNavigationPendingKey)}"));
assert.ok(panel.includes('text: "Could not open this booking. Try again."'));
assert.ok(panel.includes("{notice.text}"), "Keep genuine unrelated notices visible");
for (const forbidden of ["fetch(", "createGoogleCalendar", "saveBooking(", 'method: "POST"']) assert.ok(!panel.includes(forbidden));
const loader = section("  async function loadAdminAiReadOnlyBookingInDispatch(", "  async function handleAdminAiReadOnlyBookingNavigation(");
assert.ok(loader.includes("suppressCustomerRequestHandledMemory: true"));
assert.ok(loader.includes("loadExactAdminBookingPersistenceRecord("));
const save = section("      const calendarSyncResults:", "      if (postSuccessFormAction ===");
assert.ok(save.includes("adminBookingCalendarReadyForRealSync(savedBooking.bookingValue)"));
assert.ok(save.includes("await autoSyncSavedBookingGoogleCalendar(savedBooking.record)"));
assert.ok(save.includes("bookingNotices: savedBookingNotices"));
console.log("Admin booking notice guard passed: exact reference, missing details, each return leg, failures, empty notices and read-only Dispatch handoff.");
