import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const appSource = readFileSync("app/page.tsx", "utf8");
const adminBookingsRouteSource = readFileSync("app/api/admin-bookings/route.ts", "utf8");
const adminBookingPersistenceSource = readFileSync("lib/admin-booking-persistence.ts", "utf8");
const adminBookingAdapterSource = readFileSync("lib/admin-booking-supabase-adapter.ts", "utf8");

function assertIncludes(source, fragment, label) {
  assert.ok(source.includes(fragment), `Missing ${label}: ${fragment}`);
}

assertIncludes(appSource, "type SaveCrmBillingIdentityReview", "billing identity review type");
assertIncludes(appSource, "function buildSaveCrmBillingIdentityReview", "billing identity conflict detector");
assertIncludes(appSource, "function formatTravelerBillingAccountLabel", "traveler billing account label");
assertIncludes(appSource, "function resolveSaveCrmBillingIdentityAccountForSave", "save guard resolver");
assertIncludes(appSource, "fetchRecentAdminBookingPersistenceRecordsForBillingIdentity", "fresh recent booking read before save");
assertIncludes(appSource, "Same company/booker has other traveler(s)", "visible same company/booker warning");
assertIncludes(appSource, 'data-save-crm-billing-identity-review="true"', "visible review panel");
assertIncludes(appSource, 'data-save-crm-billing-identity-confirm="true"', "visible admin confirmation button");
assertIncludes(appSource, "customerDisplayNameOverride", "customer display override option");
assertIncludes(appSource, "clean(options.customerDisplayNameOverride)", "override applied before default customer account");
assertIncludes(appSource, "resolveSaveCrmBillingIdentityAccountForSave();", "save/update calls resolver");
assertIncludes(appSource, "const saveCrmBillingIdentityReviewReadLimit = 200;", "wide billing review read limit");
assertIncludes(appSource, "function billingCompanyIdentityMatches", "same-company billing match normalizer");
assertIncludes(appSource, "billingCompanyIdentityIgnoredTokens", "company suffix token normalization");
assertIncludes(appSource, "`${adminBookingsApiPath}?${searchParams.toString()}`", "billing review read sends limit query");
assertIncludes(
  appSource,
  "return merged.slice(0, saveCrmBillingIdentityReviewReadLimit);",
  "billing review source cache keeps the wider read window",
);
assertIncludes(
  adminBookingPersistenceSource,
  "export type AdminBookingListOptions",
  "admin booking list options contract",
);
assertIncludes(
  adminBookingsRouteSource,
  "function adminBookingListLimitFromRequest",
  "admin booking GET limit parser",
);
assertIncludes(
  adminBookingsRouteSource,
  "if (!value)",
  "missing admin booking GET limit keeps the compact default",
);
assertIncludes(
  adminBookingsRouteSource,
  "limit: adminBookingListLimitFromRequest(request)",
  "admin booking GET passes parsed list limit",
);
assertIncludes(
  adminBookingAdapterSource,
  "const defaultAdminBookingListLimit = 25;",
  "default admin booking list limit remains compact",
);
assertIncludes(
  adminBookingAdapterSource,
  "value === null || value === undefined",
  "adapter treats absent list limit as default",
);
assertIncludes(
  adminBookingAdapterSource,
  "const maxAdminBookingListLimit = 200;",
  "billing review read is server-capped",
);
assertIncludes(
  adminBookingAdapterSource,
  ".limit(limit)",
  "admin booking adapter applies parsed safe limit",
);

const saveBookingSection = appSource.slice(
  appSource.indexOf("async function saveBooking()"),
  appSource.indexOf("function bookingRecordReferenceCandidates"),
);
assert.ok(saveBookingSection.includes("return null;"), "Save + CRM must stop before write when review is missing.");
assert.ok(
  saveBookingSection.includes("customerDisplayNameOverride: billingIdentityResolution.accountLabel"),
  "Save + CRM must pass confirmed billing identity into persisted customer account.",
);

const persistenceSaveSection = appSource.slice(
  appSource.indexOf("async function saveAdminBookingOperationalSnapshot()"),
  appSource.indexOf("async function updateAppliedAdminBookingOperationalSnapshot()"),
);
assert.ok(
  persistenceSaveSection.includes("resolveSaveCrmBillingIdentityAccountForSave();"),
  "Lower operational snapshot save must share billing identity guard.",
);

const updateSection = appSource.slice(
  appSource.indexOf("async function updateAppliedAdminBookingOperationalSnapshot()"),
  appSource.indexOf("async function updateAdminCustomerRequestReviewDecision"),
);
assert.ok(
  updateSection.includes("resolveSaveCrmBillingIdentityAccountForSave();"),
  "Applied booking update must share billing identity guard.",
);

console.log("Save + CRM billing identity review guard passed.");
