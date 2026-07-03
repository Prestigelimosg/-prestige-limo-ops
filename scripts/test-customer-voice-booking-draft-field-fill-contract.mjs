import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contractPath = "docs/customer-voice-booking-draft-field-fill-contract.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const contractGuardScript = "scripts/test-customer-voice-booking-draft-field-fill-contract.mjs";
const uiGuardScript = "scripts/test-customer-voice-booking-draft-field-fill-ui-guard.mjs";

const bookPagePath = "app/book/page.tsx";
const customerBookingLocalVoiceDraftPath = "lib/customer-booking-local-voice-draft.ts";
const customerRequestAdapterPath = "lib/customer-booking-request-adapter.ts";
const adminBookingPersistencePath = "lib/admin-booking-persistence.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const aiParserSchemaPath = "lib/ai-parser-schema.ts";
const bookingParserPath = "lib/booking-parser.ts";

const approvedFieldFillTargets = [
  "passengerName",
  "pickupDate",
  "pickupTime",
  "flightNumber",
  "pickupLocation",
  "dropoffLocation",
];

const safeSubmittedFieldFillTargets = [
  "companyName",
  "contactNo",
  "emailAddress",
  "passengerName",
  "pickupDate",
  "pickupTime",
  "flightNumber",
  "pickupLocation",
  "dropoffLocation",
  "returnTripRequested",
  "returnPickupDate",
  "returnPickupTime",
  "returnFlightNumber",
  "returnPickupLocation",
  "returnDropoffLocation",
  "serviceType",
  "vehicleType",
  "passengerCount",
  "luggage",
  "extraStops",
];

const excludedFieldFillFragments = [
  "pricing",
  "payout",
  "payment/PDF",
  "billing",
  "dispatch release",
  "driver acknowledgement",
  "admin internal status",
  "provider send fields",
  "auth/location/photo/calendar",
  "`customer_rates`",
  "`driver_payout_rules`",
  "internal/debug/secrets",
  "transcript/audio persistence",
  "`specialRequest` submission unless separately approved",
];

const forbiddenRuntimeFragments = [
  "/api/ai-parse",
  "/api/admin-bookings",
  "/api/admin-saved-bookings",
  "MediaRecorder",
  "navigator.mediaDevices",
  "getUserMedia",
  "audio/webm",
  "audio/mp4",
  "FormData",
];

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matched =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matched, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function extractConstArrayItems(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}[^=]*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const;`));
  assert.ok(match, `Expected const array ${constName}.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractNewSetItems(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}[^=]*=\\s*new\\s+Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `Expected new Set ${constName}.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function assertSameList(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}

const [
  contract,
  docsIndex,
  ledger,
  preactivationSuite,
  bookPage,
  customerBookingLocalVoiceDraft,
  customerRequestAdapter,
  adminBookingPersistence,
  aiParseRoute,
  aiParserSchema,
  bookingParser,
] = await Promise.all(
  [
    contractPath,
    docsIndexPath,
    ledgerPath,
    preactivationSuitePath,
    bookPagePath,
    customerBookingLocalVoiceDraftPath,
    customerRequestAdapterPath,
    adminBookingPersistencePath,
    aiParseRoutePath,
    aiParserSchemaPath,
    bookingParserPath,
  ].map((path) => readFile(path, "utf8")),
);

const ledgerSection = sectionBetween(ledger, "### Customer Voice Booking Draft Field-Fill Contract Lock");
const ledgerImplementationSection = sectionBetween(
  ledger,
  "### Customer Voice Booking Draft Field-Fill Local Helper Implementation Lock",
);

for (const fragment of [
  "# Customer Voice Booking Draft Field-Fill Contract",
  "approved bounded Customer Voice Booking Draft Field-Fill implementation contract",
  "browser-local input-helper field fill from the existing Speak transcript into existing `/book` fields",
  "Existing customer booking page/form: `app/book/page.tsx`.",
  "Existing compact Speak helper: one `type=\"button\"` control beside the existing Portal link in the `/book` header action group.",
  "Existing customer booking adapter: `lib/customer-booking-request-adapter.ts`.",
  "Existing customer booking submit route: `POST /api/customer-booking-requests`.",
  "Existing `/book` submit call: `submitCustomerBookingRequest(form)`.",
  "Current Speak behavior is compact local transcript helper with local draft field-fill.",
  "Current transcript is stored in local React state/ref only.",
  "Current field-fill uses only the browser-local transcript and fills only empty safe fields.",
  "Current field-fill does not overwrite customer-entered fields.",
  "Current field-fill does not submit transcript or audio.",
  "Current field-fill does not call parser, API, speech-to-text, or provider routes.",
  "`specialRequest` exists in `/book` UI state but is not forwarded by the adapter and is not allowed in customer booking request persistence.",
  "`/api/ai-parse` remains admin/parser-shaped and includes fields such as `customerPriceOverride`",
  "Existing WhatsApp transcript parsing and admin dispatcher intake draft-fill are not Customer Voice Booking Draft Field-Fill.",
  "Customer Voice Booking Draft Field-Fill is local input-helper-only inside the existing `/book` customer booking page/form.",
  "The existing compact Speak button remains the only Speak control and remains beside the existing Portal link.",
  "Field-fill must never auto-submit.",
  "Field-fill must never auto-confirm.",
  "Field-fill must never auto-dispatch.",
  "Customer must manually review and edit fields before submission.",
  "Customer must manually press Submit Booking Request / BOOK.",
  "Admin review remains required after submission.",
  "Existing submit path must remain `submitCustomerBookingRequest(form)` to `POST /api/customer-booking-requests`.",
  "No transcript or audio may be submitted or stored unless separately approved.",
  "`specialRequest` remains local-only and excluded from submitted field-fill scope unless separately approved.",
  "`/api/ai-parse` cannot be used for customer voice field-fill without separate owner approval.",
  "Admin parser/draft-fill cannot be reused directly for public customer voice.",
  "If parsing is uncertain, leave fields unchanged and show the transcript for manual review.",
  "Do not guess unsafe fields.",
  "No duplicate booking page, workflow, sector, card, route, helper, button, or shim may be introduced.",
  "Stanley needs a pickup on 2 June 1000hrs from home to airport SQ123. He stays at 123 Orchard Road.",
  "`passengerName`: Stanley",
  "`pickupDate`: unchanged because 2 June has no year",
  "`pickupTime`: 10:00",
  "`pickupLocation`: 123 Orchard Road",
  "`dropoffLocation`: airport",
  "`flightNumber`: SQ123",
  "Field-fill fills only empty safe fields and does not overwrite customer-entered fields.",
  "No `/api/ai-parse`, admin parser, backend speech-to-text, provider send, audio storage, Save Booking, `/api/admin-saved-bookings`, payment/PDF, pricing, payout, dispatch, auth/location/photo/calendar, or shim behavior is activated.",
  "This contract is guarded by `scripts/test-customer-voice-booking-draft-field-fill-contract.mjs`, `scripts/test-customer-voice-booking-draft-field-fill-ui-guard.mjs`, and `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(contract, fragment, `field-fill contract phrase ${fragment}`);
}

for (const field of approvedFieldFillTargets) {
  assertIncludes(contract, `- \`${field}\``, `approved local field-fill target ${field}`);
}

for (const field of safeSubmittedFieldFillTargets) {
  assertIncludes(contract, `- \`${field}\``, `safe submitted field-fill target ${field}`);
}

for (const fragment of excludedFieldFillFragments) {
  assertIncludes(contract, fragment, `excluded field-fill fragment ${fragment}`);
}

for (const fragment of [
  "Customer Voice Booking Draft Field-Fill Contract Lock",
  "docs/test-only lock for a future Customer Voice Booking Draft Field-Fill lane",
  "The existing compact Speak button remains input-helper-only until field-fill is separately approved.",
  "Future field-fill must never auto-submit, auto-confirm, auto-dispatch, trigger Dispatch Release, or trigger Driver Acknowledgement.",
  "Customer must manually review/edit fields and manually press Submit Booking Request / BOOK.",
  "Admin review remains required after submission.",
  "Existing `/book` submit path remains `submitCustomerBookingRequest(form)` to `POST /api/customer-booking-requests`.",
  "Transcript/audio must not be submitted or stored unless separately approved.",
  "remains local-only and excluded from submitted field-fill scope until separately approved.",
  "`/api/ai-parse` cannot be used for customer voice field-fill without separate owner approval.",
  "Admin parser/draft-fill cannot be reused directly for public customer voice.",
  "If parsing is uncertain, leave fields unchanged and show the transcript for manual review; do not guess unsafe fields.",
  "No duplicate booking page, workflow, sector, card, route, helper, button, or shim is approved.",
  "This lock is guarded by `docs/customer-voice-booking-draft-field-fill-contract.md`, `scripts/test-customer-voice-booking-draft-field-fill-contract.mjs`, and `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger field-fill fragment ${fragment}`);
}

for (const field of safeSubmittedFieldFillTargets) {
  assertIncludes(ledgerSection, `\`${field}\``, `ledger safe field-fill target ${field}`);
}

for (const fragment of excludedFieldFillFragments) {
  assertIncludes(ledgerSection, fragment, `ledger excluded field-fill fragment ${fragment}`);
}

for (const fragment of [
  "bounded owner-approved Customer Voice Booking Draft Field-Fill implementation",
  "existing `/book` customer booking page/form only",
  "The existing compact Speak button remains the only Speak control",
  "remains `type=\"button\"`",
  "beside the existing Portal link",
  "No new booking page, customer workflow, UI sector, card, route, helper button, backend route, or shim is introduced.",
  "browser-local React state/ref only",
  "no transcript or audio is submitted, stored, recorded, sent to a provider, or written to DB",
  "Local field-fill runs only from the existing browser `SpeechRecognition` transcript after local capture ends.",
  "Field-fill only fills empty approved fields and does not overwrite customer-entered values.",
  "Approved local field-fill targets are `passengerName`, `pickupDate`, `pickupTime`, `flightNumber`, `pickupLocation`, and `dropoffLocation`.",
  "`specialRequest` remains local-only/excluded from submitted field-fill scope",
  "Date field-fill is conservative",
  "no-year phrases such as `2 June` remain unchanged",
  "`pickupTime` 10:00",
  "leaving `pickupDate` unchanged because no year is present",
  "Customer must manually review/edit fields and manually press Submit Booking Request / BOOK.",
  "Existing `/book` submit path remains `submitCustomerBookingRequest(form)` to `POST /api/customer-booking-requests`.",
  "do not create, confirm, dispatch, or release a booking",
  "No parser changes, `/api/ai-parse` usage, admin parser reuse, Save Booking changes, `/api/admin-saved-bookings` changes, provider sends, env changes, DB read/write, production deploy, pricing/payout/payment/PDF activation, dispatch activation, auth/location/photo/calendar activation, audio storage, backend speech-to-text, or new shims are approved.",
  "scripts/test-customer-voice-booking-draft-field-fill-ui-guard.mjs",
]) {
  assertIncludes(ledgerImplementationSection, fragment, `ledger implementation field-fill fragment ${fragment}`);
}

for (const fragment of [
  "[Customer Voice Booking Draft Field-Fill Contract](customer-voice-booking-draft-field-fill-contract.md)",
  "approved local customer voice field-fill lane",
  "browser-local transcript helper",
  "empty safe existing customer request fields only",
  "`specialRequest` local-only/excluded",
  "no `/api/ai-parse`, parser, audio storage, provider, DB, Save Booking, admin-saved-bookings, payment/pricing/payout/PDF, dispatch, auth/location/photo/calendar, or shim activation",
]) {
  assertIncludes(docsIndex, fragment, `docs index field-fill fragment ${fragment}`);
}

assertIncludes(preactivationSuite, contractGuardScript, "preactivation suite field-fill contract registration");
assertIncludes(preactivationSuite, uiGuardScript, "preactivation suite field-fill UI guard registration");
assertIncludes(
  preactivationSuite,
  "scripts/test-customer-voice-booking-draft-input-contract.mjs",
  "preactivation suite existing draft input registration",
);
assertIncludes(
  preactivationSuite,
  "scripts/test-customer-voice-booking-speak-button-ui-guard.mjs",
  "preactivation suite Speak button UI guard registration",
);

assertSameList(
  extractConstArrayItems(customerBookingLocalVoiceDraft, "customerBookingLocalVoiceDraftSupportedFields"),
  approvedFieldFillTargets,
  "local voice helper field-fill targets",
);
assertSameList(
  extractConstArrayItems(customerBookingLocalVoiceDraft, "localVoiceDraftApprovedFields"),
  safeSubmittedFieldFillTargets,
  "local voice helper approved submitted fields",
);
assertSameList(
  extractNewSetItems(adminBookingPersistence, "customerBookingRequestFields"),
  safeSubmittedFieldFillTargets,
  "customer booking request accepted persistence fields",
);

for (const fragment of [
  'data-customer-voice-booking-speak-button="true"',
  'data-customer-voice-booking-mode="local-transcript-helper"',
  'data-customer-voice-booking-local-only="true"',
  'data-customer-voice-booking-transcript="true"',
  'data-customer-voice-booking-draft-fill="local-only"',
  "voiceTranscriptRef",
  "applyCustomerBookingLocalVoiceDraftFieldFillToForm",
  "submitCustomerBookingRequest(form)",
]) {
  assertIncludes(bookPage, fragment, `/book field-fill evidence ${fragment}`);
}

for (const fragment of [
  "function localVoiceDraftPickupDate",
  "function localVoiceDraftPickupTime",
  "function localVoiceDraftKnownPickupAddress",
  "function localVoiceDraftPickupLocation",
  "function localVoiceDraftDropoffLocation",
  "export function applyCustomerBookingLocalVoiceDraftFieldFillToForm",
]) {
  assertIncludes(customerBookingLocalVoiceDraft, fragment, `local voice helper field-fill evidence ${fragment}`);
}

for (const forbidden of [
  ...forbiddenRuntimeFragments,
  "autoSubmit",
  "autoConfirm",
  "autoDispatch",
]) {
  assertExcludes(bookPage, forbidden, `/book field-fill runtime boundary ${forbidden}`);
}

const adapterBodyBlock =
  customerRequestAdapter.match(/function toCustomerBookingRequestApiBody[\s\S]+?\n}/)?.[0] || "";
const persistenceFieldBlock =
  adminBookingPersistence.match(/const customerBookingRequestFields[^=]*=\s*new\s+Set\(\[[\s\S]*?\]\);/)?.[0] ||
  "";

for (const field of safeSubmittedFieldFillTargets) {
  assertIncludes(adapterBodyBlock, `${field}: input.${field}`, `customer request adapter submitted field ${field}`);
}

for (const forbidden of ["specialRequest", "voiceTranscript", "voice_transcript", "transcript", "audio", "speech", "stt"]) {
  assertExcludes(adapterBodyBlock, forbidden, `customer request adapter body ${forbidden}`);
  assertExcludes(persistenceFieldBlock, forbidden, `customer booking persistence allowlist ${forbidden}`);
}

for (const fragment of [
  "AI parser API route is ready but not connected to OpenAI yet.",
  "Live AI parsing is not enabled yet. Use AI_PARSE_MODE=mock.",
]) {
  assertIncludes(aiParseRoute, fragment, `ai-parse route guard evidence ${fragment}`);
}

assertIncludes(aiParserSchema, "customerPriceOverride", "AI parser schema remains admin/parser-shaped");
assertIncludes(bookingParser, "WhatsAppTranscript", "Existing parser remains WhatsApp-transcript-oriented");

console.log("Customer Voice Booking Draft Field-Fill contract guard passed");
