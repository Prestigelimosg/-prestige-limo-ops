import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contractPath = "docs/customer-voice-booking-draft-field-fill-contract.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-voice-booking-draft-field-fill-contract.mjs";

const bookPagePath = "app/book/page.tsx";
const customerRequestAdapterPath = "lib/customer-booking-request-adapter.ts";
const customerRequestRoutePath = "app/api/customer-booking-requests/route.ts";
const adminBookingPersistencePath = "lib/admin-booking-persistence.ts";
const adminPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const aiParserSchemaPath = "lib/ai-parser-schema.ts";
const bookingParserPath = "lib/booking-parser.ts";

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
  "serviceType",
  "vehicleType",
  "passengerCount",
  "luggage",
  "extraStops",
];

const fullBookFormFields = [...safeSubmittedFieldFillTargets, "specialRequest"];

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

function firstBlock(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, `Missing ${label}.`);

  return match[0];
}

function countMatches(source, fragment) {
  return source.split(fragment).length - 1;
}

function extractNewSetItems(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}[^=]*=\\s*new\\s+Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `Expected new Set ${constName}.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractTypeKeys(source, typeName) {
  const match = source.match(new RegExp(`type\\s+${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `Expected type ${typeName}.`);

  return [...match[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\??:\s/gm)].map((item) => item[1]);
}

function extractObjectKeys(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*:\\s*BookingRequestForm\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `Expected object ${constName}.`);

  return [...match[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*):/gm)].map((item) => item[1]);
}

function extractCustomerBookingFieldMarkers(source) {
  return [...source.matchAll(/data-customer-booking-field="([^"]+)"/g)].map((item) => item[1]);
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
  customerRequestAdapter,
  customerRequestRoute,
  adminBookingPersistence,
  adminPage,
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
    customerRequestAdapterPath,
    customerRequestRoutePath,
    adminBookingPersistencePath,
    adminPagePath,
    aiParseRoutePath,
    aiParserSchemaPath,
    bookingParserPath,
  ].map((path) => readFile(path, "utf8")),
);

const ledgerSection = sectionBetween(ledger, "### Customer Voice Booking Draft Field-Fill Contract Lock");

for (const fragment of [
  "# Customer Voice Booking Draft Field-Fill Contract",
  "docs/test-only contract for a future Customer Voice Booking Draft Field-Fill lane",
  "Existing customer booking page/form: `app/book/page.tsx`.",
  "Existing compact Speak helper: one `type=\"button\"` control beside the existing Portal link in the `/book` header action group.",
  "Existing customer booking adapter: `lib/customer-booking-request-adapter.ts`.",
  "Existing customer booking submit route: `POST /api/customer-booking-requests`.",
  "Existing `/book` submit call: `submitCustomerBookingRequest(form)`.",
  "Current Speak behavior is compact local transcript helper only.",
  "Current transcript is stored in local React state only.",
  "Current Speak behavior does not fill form fields.",
  "Current Speak behavior does not submit transcript or audio.",
  "Current Speak behavior does not call parser, API, speech-to-text, or provider routes.",
  "`specialRequest` exists in `/book` UI state but is not forwarded by the adapter and is not allowed in customer booking request persistence.",
  "`/api/ai-parse` remains admin/parser-shaped and includes fields such as `customerPriceOverride`",
  "Existing WhatsApp transcript parsing and admin dispatcher intake draft-fill are not Customer Voice Booking Draft Field-Fill.",
  "Customer Voice Booking Draft Field-Fill is a separate future lane from the existing Speak button.",
  "The existing compact Speak button remains input-helper-only until field-fill is separately approved.",
  "Field-fill must never auto-submit.",
  "Field-fill must never auto-confirm.",
  "Field-fill must never auto-dispatch.",
  "Customer must manually review and edit fields before submission.",
  "Customer must manually press Submit Booking Request / BOOK.",
  "Admin review remains required after submission.",
  "Existing submit path must remain `submitCustomerBookingRequest(form)` to `POST /api/customer-booking-requests`.",
  "No transcript or audio may be submitted or stored unless separately approved.",
  "`specialRequest` remains local-only and excluded from submitted field-fill scope until separately approved.",
  "`/api/ai-parse` cannot be used for customer voice field-fill without separate owner approval.",
  "Admin parser/draft-fill cannot be reused directly for public customer voice.",
  "If parsing is uncertain, leave fields unchanged and show the transcript for manual review.",
  "Do not guess unsafe fields.",
  "No duplicate booking page, workflow, sector, card, route, helper, button, or shim may be introduced.",
  "Stanley needs a pickup on 2 June 1000hrs from home to airport SQ123. He stays at 123 Orchard Road.",
  "`passengerName`: Stanley",
  "`pickupDate`: 2 June",
  "`pickupTime`: 1000",
  "`pickupLocation`: 123 Orchard Road",
  "`dropoffLocation`: airport",
  "`flightNumber`: SQ123",
  "Any future implementation must include browser/mobile coverage proving",
  "Speak button remains `type=\"button\"`.",
  "Field-fill does not submit.",
  "Manual Submit Booking Request / BOOK remains required.",
  "Mobile layout does not overflow.",
  "This contract is guarded by `scripts/test-customer-voice-booking-draft-field-fill-contract.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(contract, fragment, `field-fill contract phrase ${fragment}`);
}

for (const field of safeSubmittedFieldFillTargets) {
  assertIncludes(contract, `- \`${field}\``, `safe future field-fill target ${field}`);
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
  "[Customer Voice Booking Draft Field-Fill Contract](customer-voice-booking-draft-field-fill-contract.md)",
  "future customer voice field-fill lane",
  "safe existing customer request fields only",
  "`specialRequest` local-only/excluded",
  "no `/api/ai-parse`, parser, audio storage, provider, DB, Save Booking, admin-saved-bookings, payment/pricing/payout/PDF, dispatch, auth/location/photo/calendar, or shim activation",
]) {
  assertIncludes(docsIndex, fragment, `docs index field-fill fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite field-fill contract registration");
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

assertSameList(extractTypeKeys(bookPage, "BookingRequestForm"), fullBookFormFields, "/book BookingRequestForm fields");
assertSameList(extractObjectKeys(bookPage, "initialForm"), fullBookFormFields, "/book initial form fields");
assertSameList(
  extractCustomerBookingFieldMarkers(bookPage),
  fullBookFormFields,
  "/book customer booking field markers",
);
assertSameList(
  extractNewSetItems(adminBookingPersistence, "customerBookingRequestFields"),
  safeSubmittedFieldFillTargets,
  "customer booking request accepted persistence fields",
);

assert.equal(
  countMatches(bookPage, 'data-customer-voice-booking-speak-button="true"'),
  1,
  "/book must contain exactly one compact Speak button.",
);
const speakButtonBlock = firstBlock(
  bookPage,
  /<button[\s\S]*?data-customer-voice-booking-speak-button="true"[\s\S]*?<\/button>/,
  "approved Speak button block",
);

for (const fragment of [
  'type="button"',
  'data-customer-voice-booking-mode="local-transcript-helper"',
  "onClick={handleSpeakDraft}",
]) {
  assertIncludes(speakButtonBlock, fragment, `Speak button fragment ${fragment}`);
}

const handleSpeakDraftBlock = firstBlock(
  bookPage,
  /function handleSpeakDraft\(\) \{[\s\S]*?\n  \}/,
  "current Speak draft handler",
);

for (const fragment of [
  "setVoiceTranscript(transcript)",
  "setVoiceHelperText(\"Voice draft captured locally. Review it, then type or edit the trip fields yourself.\")",
  "setVoiceTranscript(\"\")",
]) {
  assertIncludes(handleSpeakDraftBlock, fragment, `local Speak handler fragment ${fragment}`);
}

for (const forbidden of [
  "setForm(",
  "submitCustomerBookingRequest",
  "fetch(",
  "/api/ai-parse",
  "FormData",
  "MediaRecorder",
  "navigator.mediaDevices",
]) {
  assertExcludes(handleSpeakDraftBlock, forbidden, `current Speak handler ${forbidden}`);
}

for (const fragment of [
  "submitCustomerBookingRequest(form)",
  'data-customer-booking-submit="true"',
  'type="submit"',
  "This is a booking request only, not a confirmed booking yet.",
  "Our team will review and confirm availability before your booking is confirmed.",
]) {
  assertIncludes(bookPage, fragment, `/book submit/review evidence ${fragment}`);
}

for (const forbidden of [
  "data-customer-voice-booking-field-fill",
  "voiceFieldFill",
  "applyVoiceFieldFill",
  "parseVoiceDraftFields",
  "fillFieldsFromVoice",
  "autoSubmit",
  "autoConfirm",
  "autoDispatch",
  "dispatch release",
  ...forbiddenRuntimeFragments,
]) {
  assertExcludes(bookPage, forbidden, `/book field-fill runtime boundary ${forbidden}`);
}

for (const fragment of [
  'export const customerBookingRequestApiPath = "/api/customer-booking-requests";',
  '"x-prestige-customer-purpose": "customer-booking-request"',
  'method: "POST"',
]) {
  assertIncludes(customerRequestAdapter, fragment, `customer request adapter evidence ${fragment}`);
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
  "export async function POST(request: Request)",
  'refererUrl.pathname === "/book"',
  "parseCustomerBookingRequestPayload",
  "createAdminBooking",
  'source_route: "/book"',
  'action: "customer_booking_request_create"',
]) {
  assertIncludes(customerRequestRoute, fragment, `customer request route evidence ${fragment}`);
}

for (const fragment of [
  'source_channel: "customer-booking-request"',
  'customer_facing_status: "Request Received"',
  "admin_internal_status: adminReviewRequiredStatus",
  "short_notice_review_status",
  "parseAdminBookingOperationalPayload",
]) {
  assertIncludes(adminBookingPersistence, fragment, `customer request persistence evidence ${fragment}`);
}

for (const fragment of [
  'data-dispatch-workflow-step="booking-input-parser"',
  "Paste Booking Message",
  "AI Assist Parse (Mock)",
  "Create Job Card",
  'fetch("/api/ai-parse"',
  "applyParsedBookingMessage",
]) {
  assertIncludes(adminPage, fragment, `admin parser evidence ${fragment}`);
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
