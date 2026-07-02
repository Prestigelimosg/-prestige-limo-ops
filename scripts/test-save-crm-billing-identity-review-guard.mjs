import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const appSource = readFileSync("app/page.tsx", "utf8");

function assertIncludes(fragment, label) {
  assert.ok(appSource.includes(fragment), `Missing ${label}: ${fragment}`);
}

assertIncludes("type SaveCrmBillingIdentityReview", "billing identity review type");
assertIncludes("function buildSaveCrmBillingIdentityReview", "billing identity conflict detector");
assertIncludes("function formatTravelerBillingAccountLabel", "traveler billing account label");
assertIncludes("function resolveSaveCrmBillingIdentityAccountForSave", "save guard resolver");
assertIncludes("fetchRecentAdminBookingPersistenceRecordsForBillingIdentity", "fresh recent booking read before save");
assertIncludes("Same company/booker has other traveler(s)", "visible same company/booker warning");
assertIncludes('data-save-crm-billing-identity-review="true"', "visible review panel");
assertIncludes('data-save-crm-billing-identity-confirm="true"', "visible admin confirmation button");
assertIncludes("customerDisplayNameOverride", "customer display override option");
assertIncludes("clean(options.customerDisplayNameOverride)", "override applied before default customer account");
assertIncludes("resolveSaveCrmBillingIdentityAccountForSave();", "save/update calls resolver");

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
