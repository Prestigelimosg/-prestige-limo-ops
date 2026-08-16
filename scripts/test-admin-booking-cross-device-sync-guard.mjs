import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const persistencePath = "lib/admin-booking-persistence.ts";
const adapterPath = "lib/admin-booking-supabase-adapter.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const bookingUiBrowserPath = "scripts/test-booking-ui-browser.mjs";
const guardScript = "scripts/test-admin-booking-cross-device-sync-guard.mjs";

function includes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function excludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), false, `${label} must exclude ${fragment}.`);
}

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end after ${startFragment}: ${endFragment}`);
  return source.slice(start, end);
}

const [appPage, persistence, adapter, ledger, preactivationSuite, bookingUiBrowser] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(persistencePath, "utf8"),
  readFile(adapterPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(bookingUiBrowserPath, "utf8"),
]);

const clearMessageBlock = sectionBetween(
  appPage,
  'data-dispatcher-clear-message-button="true"',
  "{aiAssistMessage ? (",
);
const parseBookingBlock = sectionBetween(
  appPage,
  "async function applyParsedBookingMessage",
  "async function handleParseBookingMessage",
);
const saveBookingBlock = sectionBetween(
  appPage,
  "async function saveBooking",
  "function bookingRecordReferenceCandidates",
);
const loadBookingsBlock = sectionBetween(
  appPage,
  "async function loadBookings",
  "function rememberHandledCustomerBookingRequest",
);
const syncLoadedBookingBlock = sectionBetween(
  appPage,
  "function syncLoadedBookingFromRemoteRecord",
  "function requestDriverJobLinkVehicleFallbackRefresh",
);
const updateBookingBlock = sectionBetween(
  appPage,
  "async function updateAppliedAdminBookingOperationalSnapshot",
  "function getDispatchCopyText",
);
const verifyBookingVersionBlock = sectionBetween(
  appPage,
  "async function verifyLoadedAdminBookingVersionBeforeUpdate",
  "async function updateAppliedAdminBookingOperationalSnapshot",
);
const applyOperationalSnapshotBlock = sectionBetween(
  appPage,
  "function applyAdminBookingOperationalSnapshot",
  "function applyLatestAdminBookingOperationalSnapshot",
);
const primaryActionBlock = sectionBetween(
  appPage,
  "const activeAppliedBookingReference =",
  "const jobCardFeedback =",
);
excludes(
  clearMessageBlock,
  "clearLoadedBookingSelectionContext();",
  "Clear Message must preserve the exact loaded booking edit identity",
);
includes(clearMessageBlock, "clearBookingMessageInput();", "Clear Message still clears only parser text");

for (const fragment of [
  "adminBookingCreateIntentRef",
  "explicitNewBooking",
  "A saved booking is already loaded for editing",
]) {
  includes(parseBookingBlock, fragment, `loaded-booking parser guard ${fragment}`);
}

includes(
  loadBookingsBlock,
  "syncLoadedBookingFromRemoteRecord",
  "three-second booking load invokes cross-device form sync",
);
for (const fragment of ["loadedAdminBookingBaselineRef", "adminBookingFormSyncSignature"]) {
  includes(syncLoadedBookingBlock, fragment, `cross-device polling sync ${fragment}`);
}

includes(
  updateBookingBlock,
  "verifyLoadedAdminBookingVersionBeforeUpdate",
  "Update + Cal runs the version preflight",
);
includes(updateBookingBlock, "expected_updated_at", "PATCH carries the loaded version");
includes(
  verifyBookingVersionBlock,
  "setAdminBookingCrossDeviceConflict",
  "version preflight records an exact-booking conflict",
);
for (const fragment of [
  "adminBookingCreateIntentRef.current = false",
  "loadedAdminBookingBaselineRef.current",
  "adminBookingFormSyncSignature(appliedSnapshot.booking)",
  "updatedAt: clean(record.updated_at)",
]) {
  includes(
    applyOperationalSnapshotBlock,
    fragment,
    `applied operational snapshot version baseline ${fragment}`,
  );
}

for (const fragment of [
  "adminBookingCreateIntentRef.current",
  "Booking update identity was lost",
  "Editing booking",
]) {
  includes(primaryActionBlock, fragment, `primary exact-booking action ${fragment}`);
}

includes(
  saveBookingBlock,
  "resetAdminBookingFormAfterSuccessfulPersistence();",
  "successful Save + CRM clears the completed form",
);
includes(
  updateBookingBlock,
  "resetAdminBookingFormAfterSuccessfulPersistence();",
  "successful Update + Cal clears the completed form",
);

for (const fragment of [
  "expected_updated_at?: string | null;",
  '"expected_updated_at"',
  "Missing or malformed expected booking update timestamp.",
]) {
  includes(persistence, fragment, `PATCH version contract ${fragment}`);
}

for (const fragment of [
  "safeUpdateConflictError",
  "expected_updated_at",
  "409",
  '.eq("updated_at", existing.updated_at)',
]) {
  includes(adapter, fragment, `Supabase compare-and-set update ${fragment}`);
}

const ledgerSection = sectionBetween(
  ledger,
  "### Exact-Booking Cross-Device Edit Identity And Conflict Repair",
  "\n### ",
);

for (const fragment of [
  "10866",
  "10867",
  "Clear Message",
  "three-second",
  "expected_updated_at",
  "Calendar",
]) {
  includes(ledgerSection, fragment, `ledger cross-device repair ${fragment}`);
}

includes(preactivationSuite, guardScript, "cross-device sync guard registration");
for (const fragment of [
  "clearMessageEditIdentityState.primaryLabel, \"Update + Cal\"",
  "clearMessageEditIdentityState.editIdentity, /Editing booking 10839/",
  "updateAfterDriverDeleteState.bookingUpdate?.expected_updated_at",
  "updateAfterDriverDeleteState.flightValue, \"\"",
  "updateAfterDriverDeleteState.editIdentityCount, 0",
  "updateAfterDriverDeleteState.primarySaveLabel, \"Save + CRM\"",
]) {
  includes(bookingUiBrowser, fragment, `visible browser save-reset coverage ${fragment}`);
}

console.log("Admin booking cross-device sync guard passed");
