import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const bookPagePath = "app/book/page.tsx";
const customerRequestAdapterPath = "lib/customer-booking-request-adapter.ts";
const customerRequestRoutePath = "app/api/customer-booking-requests/route.ts";
const adminBookingPersistencePath = "lib/admin-booking-persistence.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-voice-booking-draft-field-fill-ui-guard.mjs";

const approvedFieldFillTargets = [
  "passengerName",
  "pickupDate",
  "pickupTime",
  "flightNumber",
  "pickupLocation",
  "dropoffLocation",
];

const approvedSubmittedFields = [
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

function countMatches(source, fragment) {
  return source.split(fragment).length - 1;
}

function firstBlock(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, `Expected ${label}.`);

  return match[0];
}

function extractConstArrayItems(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}[^=]*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const;`));
  assert.ok(match, `Expected const array ${constName}.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractObjectKeys(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}[\\s\\S]*?=\\s*\\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `Expected object ${constName}.`);

  return [...match[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:/gm)].map((item) => item[1]);
}

function extractNewSetItems(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}[^=]*=\\s*new\\s+Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `Expected new Set ${constName}.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function assertSameList(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(filePath)));
    } else {
      files.push(filePath);
    }
  }

  return files;
}

const [
  bookPage,
  customerRequestAdapter,
  customerRequestRoute,
  adminBookingPersistence,
  preactivationSuite,
  apiFiles,
  libFiles,
] = await Promise.all([
  readFile(bookPagePath, "utf8"),
  readFile(customerRequestAdapterPath, "utf8"),
  readFile(customerRequestRoutePath, "utf8"),
  readFile(adminBookingPersistencePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  listFiles("app/api"),
  listFiles("lib"),
]);

assert.equal(
  countMatches(bookPage, 'data-customer-voice-booking-speak-button="true"'),
  1,
  "/book must contain exactly one compact Speak button.",
);
assert.equal(
  countMatches(bookPage, 'data-customer-booking-portal-link="true"'),
  1,
  "/book must keep exactly one Portal link.",
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
  "voiceListening ? \"Listening\" : \"Speak\"",
]) {
  assertIncludes(speakButtonBlock, fragment, `Speak button fragment ${fragment}`);
}

const headerActionBlock = firstBlock(
  bookPage,
  /<div[\s\S]*?data-customer-booking-header-actions="true"[\s\S]*?<\/div>/,
  "header action group",
);

for (const fragment of [
  'data-customer-voice-booking-speak-button="true"',
  'data-customer-booking-portal-link="true"',
  'href="/my-bookings"',
  "Portal",
]) {
  assertIncludes(headerActionBlock, fragment, `header action group fragment ${fragment}`);
}

assertSameList(
  extractConstArrayItems(bookPage, "localVoiceDraftSupportedFields"),
  approvedFieldFillTargets,
  "local voice draft field-fill target list",
);
assertSameList(
  extractConstArrayItems(bookPage, "localVoiceDraftApprovedFields"),
  approvedSubmittedFields,
  "local voice draft approved customer field list",
);
assertSameList(
  extractObjectKeys(bookPage, "localVoiceDraftFieldExtractors"),
  approvedFieldFillTargets,
  "local voice draft extractor keys",
);

for (const fragment of [
  "voiceTranscriptRef",
  "voiceTranscriptRef.current = transcript",
  "applyLocalVoiceDraftFieldFill(voiceTranscriptRef.current)",
  "applyLocalVoiceDraftFieldFillToForm",
  "currentForm[field].trim()",
  "setVoiceDraftFilledFields(result.filledFields)",
  "setForm(result.nextForm)",
  'data-customer-voice-booking-draft-fill="local-only"',
  "data-customer-voice-booking-draft-fill-fields={voiceDraftFilledFields.join(\",\")}",
]) {
  assertIncludes(bookPage, fragment, `local field-fill runtime fragment ${fragment}`);
}

const fieldFillToFormBlock = firstBlock(
  bookPage,
  /function applyLocalVoiceDraftFieldFillToForm[\s\S]*?\n}\n\nexport default function/,
  "local field-fill form transformer",
);
const fieldFillHandlerBlock = firstBlock(
  bookPage,
  /function applyLocalVoiceDraftFieldFill\(transcript: string\) \{[\s\S]*?\n  \}\n\n  function handleSpeakDraft/,
  "local field-fill component handler",
);

for (const forbidden of [
  "specialRequest",
  "submitCustomerBookingRequest",
  "fetch(",
  "/api/ai-parse",
  "FormData",
  "MediaRecorder",
  "navigator.mediaDevices",
  "getUserMedia",
]) {
  assertExcludes(fieldFillToFormBlock, forbidden, `field-fill transformer ${forbidden}`);
  assertExcludes(fieldFillHandlerBlock, forbidden, `field-fill handler ${forbidden}`);
}

for (const forbidden of [
  "/api/ai-parse",
  "fetch(\"/api",
  "fetch('/api",
  "MediaRecorder",
  "navigator.mediaDevices",
  "getUserMedia",
  "audio/webm",
  "audio/mp4",
  "FormData",
  "autoSubmit",
  "autoConfirm",
  "autoDispatch",
]) {
  assertExcludes(bookPage, forbidden, `/book voice field-fill boundary ${forbidden}`);
}

for (const forbidden of [
  "data-customer-voice-booking-sector",
  "data-customer-voice-booking-card",
  "data-customer-voice-booking-page",
  "data-customer-voice-booking-workflow",
  "customer-voice-booking-route",
  "customer-voice-booking-shim",
]) {
  assertExcludes(bookPage, forbidden, "/book must not add duplicate voice sector/card/page/workflow/shim markers");
}

for (const fragment of [
  "submitCustomerBookingRequest(form)",
  'data-customer-booking-submit="true"',
  'type="submit"',
  "This is a booking request only, not a confirmed booking yet.",
  "Our team will review and confirm availability before your booking is confirmed.",
]) {
  assertIncludes(bookPage, fragment, `manual submit/review evidence ${fragment}`);
}

assertIncludes(
  customerRequestAdapter,
  'export const customerBookingRequestApiPath = "/api/customer-booking-requests";',
  "customer request submit path",
);
assertIncludes(customerRequestAdapter, "method: \"POST\"", "customer request adapter POST method");
assertIncludes(customerRequestRoute, "export async function POST(request: Request)", "customer request route POST");
assertIncludes(customerRequestRoute, 'refererUrl.pathname === "/book"', "customer request route /book boundary");

const adapterBodyBlock =
  customerRequestAdapter.match(/function toCustomerBookingRequestApiBody[\s\S]+?\n}/)?.[0] || "";
const persistenceFieldBlock =
  adminBookingPersistence.match(/const customerBookingRequestFields[^=]*=\s*new\s+Set\(\[[\s\S]*?\]\);/)?.[0] ||
  "";

for (const field of approvedSubmittedFields) {
  assertIncludes(adapterBodyBlock, `${field}: input.${field}`, `customer request adapter submitted field ${field}`);
}

for (const forbidden of [
  "specialRequest",
  "voiceTranscript",
  "voice_transcript",
  "transcript",
  "audio",
  "speech",
  "stt",
  "recording",
]) {
  assertExcludes(adapterBodyBlock, forbidden, `customer request adapter body ${forbidden}`);
  assertExcludes(persistenceFieldBlock, forbidden, `customer booking persistence allowlist ${forbidden}`);
}

assertSameList(
  extractNewSetItems(adminBookingPersistence, "customerBookingRequestFields"),
  approvedSubmittedFields,
  "customer booking request accepted persistence fields",
);

const unsafeBackendPathPattern = /(?:customer[-/]voice|voice[-/]booking|speech|stt|audio|recording)/i;
for (const filePath of [...apiFiles, ...libFiles]) {
  assert.equal(
    unsafeBackendPathPattern.test(filePath),
    false,
    `Voice field-fill must not add backend route/helper/shim path: ${filePath}`,
  );
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite field-fill UI guard registration");

console.log("Customer Voice Booking Draft Field-Fill UI guard passed");
