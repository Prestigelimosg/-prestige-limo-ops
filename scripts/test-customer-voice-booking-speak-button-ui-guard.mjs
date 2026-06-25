import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const bookPagePath = "app/book/page.tsx";
const customerBookingLocalVoiceDraftPath = "lib/customer-booking-local-voice-draft.ts";
const customerRequestAdapterPath = "lib/customer-booking-request-adapter.ts";
const customerRequestRoutePath = "app/api/customer-booking-requests/route.ts";
const adminBookingPersistencePath = "lib/admin-booking-persistence.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-voice-booking-speak-button-ui-guard.mjs";

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
  customerBookingLocalVoiceDraft,
  customerRequestAdapter,
  customerRequestRoute,
  adminBookingPersistence,
  preactivationSuite,
  apiFiles,
  libFiles,
] = await Promise.all([
  readFile(bookPagePath, "utf8"),
  readFile(customerBookingLocalVoiceDraftPath, "utf8"),
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
  "/book must contain exactly one approved compact Speak button.",
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

assert.equal(
  countMatches(bookPage, 'data-customer-booking-portal-link="true"'),
  1,
  "Existing Portal link must remain exactly once.",
);
assertIncludes(bookPage, 'href="/my-bookings"', "Portal href remains unchanged");

for (const fragment of [
  "getCustomerBookingSpeechRecognitionConstructor",
  "Voice dictation is not supported in this browser. Type the trip details manually.",
  "voiceRecognitionRef",
  "voiceTranscript",
  'data-customer-voice-booking-helper="true"',
  'data-customer-voice-booking-local-only="true"',
  'data-customer-voice-booking-transcript="true"',
]) {
  assertIncludes(bookPage, fragment, `local voice helper fragment ${fragment}`);
}

for (const fragment of [
  "getCustomerBookingSpeechRecognitionConstructor",
  "browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null",
  "transcriptFromCustomerBookingSpeechEvent",
]) {
  assertIncludes(customerBookingLocalVoiceDraft, fragment, `shared local voice helper fragment ${fragment}`);
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
]) {
  assertExcludes(bookPage, forbidden, "/book Speak helper runtime boundary");
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
  "type=\"submit\"",
]) {
  assertIncludes(bookPage, fragment, `Submit semantics remain ${fragment}`);
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

for (const forbidden of [
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

const unsafeBackendPathPattern = /(?:customer[-/]voice|voice[-/]booking|speech|stt|audio|recording)/i;
for (const filePath of [...apiFiles, ...libFiles]) {
  if (filePath === customerBookingLocalVoiceDraftPath) {
    continue;
  }

  assert.equal(
    unsafeBackendPathPattern.test(filePath),
    false,
    `Speak helper must not add backend route/helper/shim path: ${filePath}`,
  );
}

for (const forbiddenPattern of [
  /auto[-\s]?submit/i,
  /auto[-\s]?confirm/i,
  /auto[-\s]?dispatch/i,
  /dispatch release/i,
]) {
  assertExcludes(bookPage, forbiddenPattern, "/book Speak helper must not add automated workflow language");
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite Speak button UI guard registration");

console.log("Customer Voice Booking Speak button UI guard passed");
