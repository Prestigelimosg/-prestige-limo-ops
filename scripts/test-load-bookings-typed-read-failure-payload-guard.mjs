import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const routePath = "app/api/admin-load-bookings-typed-read/route.ts";
const typedReadGatedHelperPath = "lib/admin-load-bookings-typed-read-gated.ts";
const appPagePath = "app/page.tsx";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-load-bookings-typed-read-failure-payload-guard.mjs";
const typedReadPath = "/api/admin-load-bookings-typed-read";
const legacySavedBookingsPath = "/api/admin-saved-bookings";
const adminBookingsPath = "/api/admin-bookings";

const writePathPattern =
  /\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(|\.rpc\s*\(|rpc\s*\(/i;
const forbiddenFailurePayloadFragments = [
  "booking:",
  "bookings:",
  "data:",
  "records:",
  "safe_card",
  "safe_dto",
  "result.data",
  "mapped.booking",
  "mapped.bookings",
];

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function countMatches(source, fragment) {
  return source.split(fragment).length - 1;
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

function blockFrom(source, marker, startAt = 0) {
  const markerIndex = source.indexOf(marker, startAt);
  assert.notEqual(markerIndex, -1, `Missing block marker: ${marker}`);
  const openIndex = source.indexOf("{", markerIndex);
  assert.notEqual(openIndex, -1, `Missing opening brace for block marker: ${marker}`);

  let depth = 0;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }

    if (depth === 0) {
      return {
        block: source.slice(markerIndex, index + 1),
        endIndex: index + 1,
        markerIndex,
      };
    }
  }

  throw new Error(`Unclosed block for marker: ${marker}`);
}

function assertFailurePayloadShape(block, label) {
  assertIncludes(block, "...gate", `${label} gate metadata`);
  assertIncludes(block, "ok: false", `${label} ok false`);

  for (const fragment of forbiddenFailurePayloadFragments) {
    assertExcludes(block, fragment, `${label} forbidden payload fragment ${fragment}`);
  }

  assertExcludes(block, writePathPattern, `${label} write path`);
}

const [
  ledger,
  typedReadRoute,
  typedReadGatedHelper,
  appPage,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  aiParseRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(typedReadGatedHelperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Load Bookings Typed Read Failure Payload Guard Lock",
);

for (const phrase of [
  "Load Bookings typed-read failure and blocked payload shape is guarded before any future endpoint migration.",
  "This is a docs/test-only guard; it does not approve endpoint migration, env changes, deployment, live reads, or DB writes.",
  "Non-ready typed-read responses must expose only gate metadata plus safe `ok`, `status`, `error`, and optional `rejected_fields` field-name lists.",
  "Blocked, closed-gate, safe-failure, and read-helper failure responses must not include `booking`, `bookings`, raw `data`, `records`, safe cards, DTOs, customer pricing, driver payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, or mock QA/dev archive fields.",
  "Rejected unsafe-record responses may include only `rejected_fields` field names and must not include mapped booking/card/DTO payloads or raw saved-booking rows.",
  "The app bridge must return `null` for non-OK, blocked, failed, rejected, malformed, or non-list typed-read responses and must continue the legacy `GET /api/admin-saved-bookings` booking/form/detail read.",
  "The typed-read endpoint remains GET-only and read-only.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings`.",
  "`/api/admin-saved-bookings` remains separate and unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No pricing, payout, customer rates, driver payout rules, PayNow payout details, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, or mock QA/dev archive fields are approved for customer or driver visibility.",
  "This lock adds `scripts/test-load-bookings-typed-read-failure-payload-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Failure payload ledger phrase: ${phrase}`);
}

for (const forbiddenPhrase of [
  "failure payload may include bookings",
  "blocked response may include safe cards",
  "rejected response may return raw rows",
  "endpoint migration is approved",
  "DB write approved",
  "pricing approved",
  "payout approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, `Forbidden failure payload ledger phrase: ${forbiddenPhrase}`);
}

assertIncludes(typedReadRoute, "export async function GET", "typed route GET");
for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  assertExcludes(typedReadRoute, `export async function ${method}`, `typed route ${method}`);
}
assertExcludes(typedReadRoute, writePathPattern, "typed route write path");
assertExcludes(typedReadRoute, "console.", "typed route console/env output");
assertIncludes(typedReadRoute, "return safeFailureResponse();", "typed route catch safe failure");

const blockedResponseBlock = blockFrom(typedReadRoute, "function blockedResponse").block;
assertFailurePayloadShape(blockedResponseBlock, "blocked response");
assertIncludes(blockedResponseBlock, "status: \"blocked\"", "blocked response status");
assertIncludes(blockedResponseBlock, "{ status }", "blocked response status option");
assertExcludes(blockedResponseBlock, "loadAdminSavedBooking", "blocked response read helper");
assertExcludes(blockedResponseBlock, "adminDispatcherBoundaryToPersistenceAdapterActor", "blocked response actor conversion");
assertExcludes(blockedResponseBlock, "new URL", "blocked response search params");

const safeFailureResponseBlock = blockFrom(typedReadRoute, "function safeFailureResponse").block;
assertFailurePayloadShape(safeFailureResponseBlock, "safe failure response");
assertIncludes(safeFailureResponseBlock, "status: \"failed\"", "safe failure response status");
assertIncludes(safeFailureResponseBlock, "{ status: 500 }", "safe failure response HTTP status");
assertExcludes(safeFailureResponseBlock, "loadAdminSavedBooking", "safe failure read helper");
assertExcludes(safeFailureResponseBlock, "new URL", "safe failure search params");

const getBlock = blockFrom(typedReadRoute, "export async function GET").block;
assertIncludes(
  getBlock,
  "blockedResponse(\"Load Bookings typed read is not enabled on this server.\", 503)",
  "closed gate blocked response",
);

let searchFrom = 0;
const resultFailureBlocks = [];
while (resultFailureBlocks.length < 2) {
  const block = blockFrom(getBlock, "if (!result.ok)", searchFrom);
  resultFailureBlocks.push(block.block);
  searchFrom = block.endIndex;
}

for (const [index, resultFailureBlock] of resultFailureBlocks.entries()) {
  const label = index === 0 ? "detail read failure" : "list read failure";
  assertFailurePayloadShape(resultFailureBlock, label);
  assertIncludes(resultFailureBlock, "error: result.error", `${label} safe error`);
  assertIncludes(resultFailureBlock, "status: \"failed\"", `${label} failed status`);
  assertIncludes(resultFailureBlock, "{ status: result.status }", `${label} response status`);
}

searchFrom = 0;
const rejectedBlocks = [];
while (rejectedBlocks.length < 2) {
  const block = blockFrom(getBlock, "if (!mapped.ok)", searchFrom);
  rejectedBlocks.push(block.block);
  searchFrom = block.endIndex;
}

for (const [index, rejectedBlock] of rejectedBlocks.entries()) {
  const label = index === 0 ? "detail rejected response" : "list rejected response";
  assertFailurePayloadShape(rejectedBlock, label);
  assertIncludes(
    rejectedBlock,
    "error: \"Load Bookings typed read rejected unsafe record fields.\"",
    `${label} safe error`,
  );
  assertIncludes(rejectedBlock, "rejected_fields: mapped.rejected_fields", `${label} rejected field names`);
  assertIncludes(rejectedBlock, "status: \"rejected\"", `${label} rejected status`);
  assertIncludes(rejectedBlock, "{ status: 422 }", `${label} response status`);
}

assert.equal(countMatches(typedReadRoute, "booking: mapped.booking"), 1, "only ready detail returns booking.");
assert.equal(countMatches(typedReadRoute, "bookings: mapped.bookings"), 1, "only ready list returns bookings.");
assertExcludes(typedReadRoute, "booking: result.data.booking", "raw detail response");
assertExcludes(typedReadRoute, "bookings: result.data.bookings", "raw list response");
assertExcludes(typedReadRoute, "safe_card", "route-level safe card failure leak");
assertExcludes(typedReadRoute, "safe_dto", "route-level safe DTO failure leak");

assertIncludes(typedReadGatedHelper, "writeEnabled: false", "typed gate write disabled");
assertIncludes(typedReadGatedHelper, "liveWriteEnabled: false", "typed gate live write disabled");
assertExcludes(typedReadGatedHelper, writePathPattern, "typed gate helper write path");
assertExcludes(typedReadGatedHelper, "console.", "typed gate helper console/env output");

const typedDisplayBridge = sliceBetween(
  appPage,
  "async function fetchLoadBookingsTypedOperationalDisplayResult",
  "function getLoadBookingsOperationalDisplayTitle",
);
assertIncludes(typedDisplayBridge, `fetch(\`\${adminLoadBookingsTypedReadApiPath}?`, "typed bridge fetch");
assertIncludes(typedDisplayBridge, 'method: "GET"', "typed bridge GET method");
assertIncludes(
  typedDisplayBridge,
  "if (!response.ok || responseBody?.ok !== true || !Array.isArray(responseBody.bookings))",
  "typed bridge rejects non-ready payloads",
);
assertIncludes(typedDisplayBridge, "return null;", "typed bridge null rollback");
assertExcludes(typedDisplayBridge, "setMessage", "typed bridge must not display typed failure payload");
assertExcludes(typedDisplayBridge, "responseBody.error", "typed bridge must not surface typed failure error");
for (const forbiddenBridgeFragment of [
  "responseBody.status",
  /responseBody\.booking(?!s)/,
  "responseBody.data",
  "responseBody.records",
  "responseBody.safe_card",
  "responseBody.safe_dto",
  "responseBody.rejected_fields",
  "customer_price",
  "customer_rate",
  "driver_payout",
  "PayNow",
  "payment",
  "billing",
  "invoice",
  "parser_debug",
  "debug_payload",
  "mock_archive",
  "mock_qa",
]) {
  assertExcludes(
    typedDisplayBridge,
    forbiddenBridgeFragment,
    `typed bridge forbidden failure payload fragment ${String(forbiddenBridgeFragment)}`,
  );
}

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
const typedFetchFragment = "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)";
const legacyFetchFragment = "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`";
const typedFetchIndex = loadBookingsBlock.indexOf(typedFetchFragment);
const legacyFetchIndex = loadBookingsBlock.indexOf(legacyFetchFragment);
assert.notEqual(typedFetchIndex, -1, "Load Bookings typed display fetch exists.");
assert.notEqual(legacyFetchIndex, -1, "Load Bookings legacy saved-bookings fetch exists.");
assert.equal(typedFetchIndex < legacyFetchIndex, true, "typed read must not replace legacy load order.");
assertIncludes(loadBookingsBlock, `${typedFetchFragment}.catch(() => null)`, "typed bridge catches failures");
assertIncludes(loadBookingsBlock, "setBookings(loadedBookings);", "legacy bookings remain source");
assertIncludes(
  loadBookingsBlock,
  "setLoadBookingsTypedOperationalCardsById(typedOperationalDisplay?.cardsById ?? {})",
  "typed cards empty fallback",
);
assertIncludes(
  loadBookingsBlock,
  "setLoadBookingsTypedOperationalCardOrder(typedOperationalDisplay?.orderedCardIds ?? [])",
  "typed order empty fallback",
);
assertExcludes(loadBookingsBlock, "setBookings(typedOperationalDisplay", "typed read records replacement");
assertExcludes(loadBookingsBlock, "return typedOperationalDisplay", "typed read short circuit");
assertExcludes(loadBookingsBlock, "throw typedOperationalDisplay", "typed read thrown payload");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, `fetch("${adminBookingsPath}"`, "Save Booking + CRM endpoint");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, legacySavedBookingsPath, "Save Booking saved-bookings separation");
assertExcludes(saveBookingBlock, typedReadPath, "Save Booking typed-read separation");

assertIncludes(adminSavedBookingsRoute, "export async function GET", "saved-bookings GET");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "saved-bookings list");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "saved-bookings detail");
assertExcludes(adminSavedBookingsRoute, typedReadPath, "saved-bookings typed route coupling");
assertExcludes(adminSavedBookingsRoute, "admin-load-bookings-typed-read-gated", "saved-bookings typed helper coupling");

for (const [label, source] of [
  ["admin-bookings route", adminBookingsRoute],
  ["ai-parse route", aiParseRoute],
]) {
  assertExcludes(source, typedReadPath, `${label} typed-read path`);
  assertExcludes(source, "admin-load-bookings-typed-read-gated", `${label} typed-read helper`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation failure payload guard registration");

console.log("Load Bookings typed read failure payload guard passed");
