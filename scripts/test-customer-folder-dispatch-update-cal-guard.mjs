import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dispatchPageSource = readFileSync("app/page.tsx", "utf8");
const customerFolderSource = readFileSync(
  "app/customers/[customerId]/saved-bookings-panel.tsx",
  "utf8",
);
const customerDashboardSource = readFileSync("app/customers/page.tsx", "utf8");
const customerInvoiceFolderSource = readFileSync(
  "app/customers/[customerId]/customer-invoice-folder-panel.tsx",
  "utf8",
);
const savedBookingsReadSource = readFileSync(
  "lib/admin-customer-saved-bookings-read.ts",
  "utf8",
);
const updateAppliedStart = dispatchPageSource.indexOf(
  "async function updateAppliedAdminBookingOperationalSnapshot()",
);
const updateAppliedEnd = dispatchPageSource.indexOf(
  "async function updateAdminCustomerRequestReviewDecision",
  updateAppliedStart,
);
const updateAppliedSource =
  updateAppliedStart >= 0 && updateAppliedEnd > updateAppliedStart
    ? dispatchPageSource.slice(updateAppliedStart, updateAppliedEnd)
    : "";

function assertIncludes(source, fragment, label) {
  assert.ok(
    source.includes(fragment),
    `${label} missing expected fragment: ${fragment}`,
  );
}

function assertExcludes(source, fragment, label) {
  assert.equal(source.includes(fragment), false, `${label} must exclude ${fragment}`);
}

function assertBefore(source, earlier, later, label) {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);

  assert.ok(earlierIndex >= 0, `${label} missing earlier fragment: ${earlier}`);
  assert.ok(laterIndex >= 0, `${label} missing later fragment: ${later}`);
  assert.ok(
    earlierIndex < laterIndex,
    `${label} expected "${earlier}" before "${later}"`,
  );
}

assertIncludes(
  customerFolderSource,
  "customer_return_url",
  "customer folder edit href must carry the return URL into Dispatch",
);
assertIncludes(
  customerFolderSource,
  "load_saved_jobs",
  "customer folder Dispatch return URL must ask the customer page to reload saved jobs",
);
assertIncludes(
  customerFolderSource,
  "focus_booking_reference",
  "customer folder Dispatch return URL must carry the exact booking reference back",
);
assertIncludes(
  customerFolderSource,
  "void loadSavedBookings({",
  "customer folder return URL must auto-load saved bookings on return",
);
assertIncludes(
  customerFolderSource,
  "params.set(\"booking_reference\", focusBookingReference)",
  "customer folder return read must pass the exact booking reference to the safe read route",
);
assertIncludes(
  customerDashboardSource,
  "params.set(\"search\", trimmedSearch)",
  "customer dashboard quick search must pass typed letters to the guarded customer account read",
);
assertIncludes(
  customerDashboardSource,
  "void loadRegularCustomerAccounts(trimmedSearch)",
  "customer dashboard quick search must auto-load matching accounts while typing",
);
assertIncludes(
  customerDashboardSource,
  "regularCustomerAccountSearchRequestRef",
  "customer dashboard quick search must ignore stale account search responses",
);
assertIncludes(
  customerFolderSource,
  "data-customer-folder-saved-bookings-description-toggle",
  "customer folder saved booking rows must provide a soft inline description toggle",
);
assertIncludes(
  customerFolderSource,
  "data-customer-folder-saved-bookings-description",
  "customer folder saved booking rows must show description details inline without moving the job",
);
assertIncludes(
  customerFolderSource,
  "tab: \"dispatch\"",
  "customer folder edit href must open the Dispatch tab",
);
assertIncludes(
  dispatchPageSource,
  "data-dashboard-quick-search-results",
  "Operations Dashboard quick search must render visible loaded-booking results",
);
assertIncludes(
  dispatchPageSource,
  "data-dashboard-quick-search-result",
  "Operations Dashboard quick search result rows must be clickable",
);
assertIncludes(
  dispatchPageSource,
  "dashboardSearchResultBookings",
  "Operations Dashboard quick search must derive visible result rows from loaded bookings",
);
assertIncludes(
  dispatchPageSource,
  "dashboardSearchSourceBookings",
  "Operations Dashboard quick search must count loaded operational bookings separately from matches",
);
assertIncludes(
  dispatchPageSource,
  "bookingMatchesLocalSearch(bookingRecord, searchTerm)",
  "Operations Dashboard quick search must use the shared booking matcher",
);
assertIncludes(
  updateAppliedSource,
  "window.location.assign(customerReturnUrl)",
  "Dispatch update must return to the customer folder after save/update",
);
assertIncludes(
  savedBookingsReadSource,
  "booking_reference: string | null",
  "saved booking read params must support exact booking reference handoff",
);
assertIncludes(
  savedBookingsReadSource,
  "const exactReferenceMatches =",
  "saved booking read must explicitly bound exact-reference matching",
);
assertIncludes(
  savedBookingsReadSource,
  "if (!baseMatches || (requestedBookingReference && !exactReferenceMatches))",
  "saved booking read must require both the selected customer and exact returned reference to match",
);
assertIncludes(
  savedBookingsReadSource,
  "pickup_location: safeText(booking.pickup_location",
  "saved booking read must expose safe pickup location for inline description",
);
assertIncludes(
  savedBookingsReadSource,
  "dropoff_location: safeText(booking.dropoff_location",
  "saved booking read must expose safe drop-off location for inline description",
);
assertIncludes(
  updateAppliedSource,
  "method: \"PATCH\"",
  "real saved jobs must still use the guarded PATCH update path",
);
assertBefore(
  updateAppliedSource,
  "const updateMessage = {",
  "returnToCustomerFolderAfterUpdate();",
  "successful real update must prepare message before returning",
);

assertIncludes(
  customerFolderSource,
  "savedBookingReadFailureMessage(error)",
  "customer folder read failures must use the real safe error state",
);
assertIncludes(
  customerFolderSource,
  "`No saved jobs returned for ${customerName}.`",
  "customer folder empty reads must remain empty instead of fabricating jobs",
);
for (const [label, source] of [
  ["Dispatch", dispatchPageSource],
  ["Customers dashboard", customerDashboardSource],
  ["Customer saved-bookings panel", customerFolderSource],
  ["Customer invoice folder", customerInvoiceFolderSource],
]) {
  for (const forbidden of [
    "FAKE-RITZ",
    "Fake Ritz",
    "fakeRitz",
    "prestige-fake-ritz-dispatch-edits",
    "ready_fake_ritz_invoice",
    "ready-fake-ritz-invoice",
  ]) {
    assertExcludes(source, forbidden, `${label} retired fake booking lane`);
  }
}

console.log("customer folder dispatch Update + Cal guard passed");
