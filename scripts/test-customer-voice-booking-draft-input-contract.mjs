import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contractPath = "docs/customer-voice-booking-draft-input-contract.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-voice-booking-draft-input-contract.mjs";

const bookPagePath = "app/book/page.tsx";
const customerRequestAdapterPath = "lib/customer-booking-request-adapter.ts";
const customerRequestRoutePath = "app/api/customer-booking-requests/route.ts";
const adminBookingPersistencePath = "lib/admin-booking-persistence.ts";
const adminPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const aiParserSchemaPath = "lib/ai-parser-schema.ts";
const bookingParserPath = "lib/booking-parser.ts";

const safeCustomerBookingFields = [
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

const forbiddenCustomerVoiceFragments = [
  "customer_price",
  "customerPrice",
  "quoted_price",
  "driver_payout",
  "driverPayout",
  "paynow",
  "pay_now",
  "payment",
  "billing",
  "invoice",
  "pdf",
  "payout",
  "finance",
  "provider",
  "send",
  "auth",
  "live_location",
  "photo",
  "calendar",
  "parser_debug",
  "raw_ai",
  "parser_prompt",
  "internal_admin",
  "admin_note",
  "service_role",
  "server_secret",
  "secret",
  "token",
  "mock_archive",
  "mock_qa",
  "dev_workbench",
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

const ledgerSection = sectionBetween(ledger, "### Customer Voice Booking Draft Input Contract Lock");

for (const fragment of [
  "# Customer Voice Booking Draft Input Contract",
  "docs/test-only",
  "Existing customer booking page/form: `app/book/page.tsx`.",
  "Existing customer booking adapter: `lib/customer-booking-request-adapter.ts`.",
  "Existing customer booking submit route: `POST /api/customer-booking-requests`.",
  "Existing `/book` flow uses structured customer request fields",
  "Existing `/book` submit uses `submitCustomerBookingRequest(form)`",
  "Customer booking requests map to customer-facing `Request Received` and internal admin `Admin Review Required` review state.",
  "Parser/draft-fill exists in the admin dispatcher intake, not the customer `/book` page.",
  "Existing WhatsApp transcript parsing is not Customer Voice Booking Draft Input.",
  "`/api/ai-parse` is not safe to expose or reuse for customer voice without separate owner approval",
  "Future Customer Voice Booking Draft Input is an input helper only.",
  "Any future Speak control must be compact and placed inside the existing `/book` customer booking page/form.",
  "Do not add a new sector, giant card, duplicate booking page, duplicate booking workflow, duplicate route, duplicate helper, or new shim for the first version.",
  "Voice transcript may only fill a bounded draft transcript field or existing safe customer booking request fields.",
  "Customer must review and edit the draft before submission.",
  "Customer must manually press BOOK / Submit Booking Request.",
  "Admin review remains required after submission.",
  "Speaking alone must not create a booking.",
  "No auto-submit.",
  "No auto-confirm.",
  "No auto-dispatch.",
  "No Dispatch Release activation.",
  "No Driver Acknowledgement activation.",
  "No audio storage in the first version.",
  "No customer/traveler memory writes in the first version.",
  "No speech-to-text provider integration in the first version.",
  "Browser `SpeechRecognition` or browser-only dictation, if later approved, must include an unsupported-browser fallback",
  "Parser/draft-fill from voice requires separate owner approval unless a future guard proves a safe customer draft parser path.",
  "`/api/ai-parse` cannot be exposed or reused for customer voice without separate owner approval.",
  "Existing `/book` submit route must be reused: `POST /api/customer-booking-requests`.",
  "Save Booking + CRM must remain untouched.",
  "`POST /api/admin-bookings` must remain untouched.",
  "`/api/admin-saved-bookings` must remain untouched.",
  "No pricing, payout, payment, PDF, invoice, billing, finance, PayNow payout, customer price, driver payout",
  "Stanley needs a pickup on 2 June 1000hrs from home to airport SQ123. He stays at 123 Orchard Road.",
  "This contract is guarded by `scripts/test-customer-voice-booking-draft-input-contract.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(contract, fragment, `voice contract phrase ${fragment}`);
}

for (const fragment of [
  "Customer Voice Booking Draft Input Contract Lock",
  "This is a docs/test-only contract guard",
  "Future voice booking is input-helper-only",
  "compact and colocated inside the existing `/book` customer booking page/form",
  "No new sector, giant card, duplicate booking page, duplicate booking workflow, duplicate route/helper/shim",
  "Customer must review/edit and manually press BOOK / Submit Booking Request",
  "Admin review remains required",
  "Speaking alone must not create a booking, auto-submit, auto-confirm, auto-dispatch, trigger Dispatch Release, or trigger Driver Acknowledgement.",
  "No audio storage, customer/traveler memory write, speech-to-text provider integration, provider send, env change, DB read/write, parser change, `/api/ai-parse` exposure, Save Booking change, `/api/admin-saved-bookings` change, pricing/payout/payment/PDF activation, dispatch activation, auth/location/photo/calendar activation, or new shim is approved.",
  "Existing `/book` submit path stays `submitCustomerBookingRequest(form)` to `POST /api/customer-booking-requests`.",
  "This lock adds `docs/customer-voice-booking-draft-input-contract.md`, adds `scripts/test-customer-voice-booking-draft-input-contract.mjs`, and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger voice contract fragment ${fragment}`);
}

for (const fragment of [
  "[Customer Voice Booking Draft Input Contract](customer-voice-booking-draft-input-contract.md)",
  "future compact Speak input helper",
  "input-helper-only",
  "manual customer submit and admin review required",
]) {
  assertIncludes(docsIndex, fragment, `docs index voice contract fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite voice contract registration");

assertSameList(
  extractTypeKeys(bookPage, "BookingRequestForm"),
  [...safeCustomerBookingFields, "specialRequest"],
  "/book BookingRequestForm fields",
);
assertSameList(
  extractObjectKeys(bookPage, "initialForm"),
  [...safeCustomerBookingFields, "specialRequest"],
  "/book initial form fields",
);
assertSameList(
  extractNewSetItems(adminBookingPersistence, "customerBookingRequestFields"),
  safeCustomerBookingFields,
  "customer booking request accepted persistence fields",
);

for (const fragment of [
  'data-customer-booking-page="true"',
  'data-customer-booking-form="true"',
  'data-customer-booking-submit="true"',
  "submitCustomerBookingRequest(form)",
  "This is a booking request only, not a confirmed booking yet.",
  "Our team will review and confirm availability before your booking is confirmed.",
]) {
  assertIncludes(bookPage, fragment, `/book evidence ${fragment}`);
}

for (const fragment of [
  'export const customerBookingRequestApiPath = "/api/customer-booking-requests";',
  '"x-prestige-customer-purpose": "customer-booking-request"',
  'method: "POST"',
]) {
  assertIncludes(customerRequestAdapter, fragment, `customer request adapter evidence ${fragment}`);
}

for (const fragment of [
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

for (const forbidden of [
  "SpeechRecognition",
  "webkitSpeechRecognition",
  "data-customer-voice-booking",
  "data-customer-booking-speak",
  "Speak Booking",
  "voice input",
]) {
  assertExcludes(bookPage, forbidden, "/book runtime source");
}

assertExcludes(bookPage, "/api/ai-parse", "/book must not call admin AI parser route");
assertExcludes(bookPage, "/api/admin-bookings", "/book must not call admin booking route");
assertExcludes(bookPage, "/api/admin-saved-bookings", "/book must not call admin saved bookings route");

const adapterBodyBlock =
  customerRequestAdapter.match(/function toCustomerBookingRequestApiBody[\s\S]+?\n}/)?.[0] || "";

for (const field of safeCustomerBookingFields) {
  assertIncludes(adapterBodyBlock, `${field}: input.${field}`, `customer request adapter submitted field ${field}`);
}

for (const forbidden of forbiddenCustomerVoiceFragments) {
  assertExcludes(adapterBodyBlock, forbidden, `customer request adapter body ${forbidden}`);
}

console.log("Customer Voice Booking Draft Input contract guard passed");
