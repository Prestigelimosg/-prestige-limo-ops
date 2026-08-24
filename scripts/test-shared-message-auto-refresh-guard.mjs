import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customerPageSource = await readFile("app/my-bookings/page.tsx", "utf8");
const driverPageSource = await readFile("app/driver-job/[token]/page.tsx", "utf8");
const adminPageSource = await readFile("app/page.tsx", "utf8");

for (const [label, fragment] of [
  ["Customer visible refresh interval", "const CUSTOMER_MESSAGES_VISIBLE_REFRESH_MS = 5_000"],
  ["Customer silent refresh helper", "const refreshExpandedCustomerMessagesWhileVisible = () =>"],
  ["Customer focus refresh", 'window.addEventListener("focus", refreshExpandedCustomerMessagesWhileVisible)'],
  ["Customer visibility refresh", 'document.addEventListener("visibilitychange", refreshExpandedCustomerMessagesWhileVisible)'],
  ["Customer page-show refresh", 'window.addEventListener("pageshow", refreshExpandedCustomerMessagesWhileVisible)'],
  ["Customer interval cleanup", "window.clearInterval(customerMessagesRefreshInterval)"],
  ["Customer overlap cancellation", "customerMessagesAbortController"],
  ["Customer silent content preservation", "silent: true"],
]) {
  assert.ok(customerPageSource.includes(fragment), `${label} is required.`);
}

assert.match(
  customerPageSource,
  /const refreshExpandedCustomerMessagesWhileVisible = \(\) => \{[\s\S]*?document\.visibilityState !== "visible"[\s\S]*?loadTripUpdatesForBooking\([\s\S]*?silent: true[\s\S]*?const customerMessagesRefreshInterval = window\.setInterval\([\s\S]*?CUSTOMER_MESSAGES_VISIBLE_REFRESH_MS[\s\S]*?window\.clearInterval\(customerMessagesRefreshInterval\)/,
  "An expanded PA/Boss booking must refresh its existing Customer message read while visible without requiring tracking or the Refresh button.",
);

const adminAutoRefreshGate = adminPageSource.indexOf("!dashboardDriverJobAutoRefreshEnabled");
assert.notEqual(adminAutoRefreshGate, -1, "Admin 10-second reporting refresh gate must remain established.");
const adminAutoRefreshBlock = adminPageSource.slice(adminAutoRefreshGate, adminAutoRefreshGate + 1_600);
assert.ok(
  adminAutoRefreshBlock.includes("void refreshAdminTodayJobMessageHistory(bookingReference);"),
  "Admin 10-second reporting refresh must include the existing unified message history read.",
);
assert.ok(
  adminAutoRefreshBlock.includes('window.addEventListener("focus", refreshVisibleAdminMessageHistories)') &&
    adminAutoRefreshBlock.includes('document.addEventListener("visibilitychange", refreshVisibleAdminMessageHistories)') &&
    adminAutoRefreshBlock.includes('window.addEventListener("pageshow", refreshVisibleAdminMessageHistories)'),
  "Admin must refresh the existing unified message history when its visible screen regains focus.",
);

for (const fragment of [
  "const DRIVER_APP_UPDATES_VISIBLE_REFRESH_MS = 5_000",
  'window.addEventListener("focus", refreshDriverAppUpdatesOnForeground)',
  'document.addEventListener("visibilitychange", refreshDriverAppUpdatesOnForeground)',
  'window.addEventListener("pageshow", refreshDriverAppUpdatesOnForeground)',
  "refreshDriverAppUpdates({ preserveContent: true })",
]) {
  assert.ok(driverPageSource.includes(fragment), `Driver automatic message refresh must preserve ${fragment}`);
}

assert.equal(
  customerPageSource.match(/\/api\/customer-driver-quick-replies/g)?.length,
  1,
  "Customer messaging must retain one established write route.",
);
assert.equal(
  driverPageSource.match(/\/notifications\?limit=5&page=1/g)?.length,
  1,
  "Driver messaging must retain one token-scoped notification read path.",
);

console.log("Shared PA/Boss, Driver, and Admin automatic message refresh guard passed.");
