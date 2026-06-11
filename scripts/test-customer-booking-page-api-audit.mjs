import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const pagePath = "app/book/page.tsx";
const requestRoutePath = "app/api/customer-booking-requests/route.ts";
const memoryRoutePath = "app/api/customer-booking-memory/route.ts";
const memoryAdapterPath = "lib/customer-booking-memory-adapter.ts";
const unsafeCustomerApiPattern =
  /admin_internal_status|short_notice_review_status|internal_admin_note|internal_finance_note|driver_payout|paynow|pay_now|invoice|payment|billing|finance|parser_debug|raw_ai|mock_archive|mock_qa|dev_workbench|session_token|service_role|secret|sql|stack/i;

function extractFetchPaths(source) {
  return [
    ...[...source.matchAll(/fetch\(\s*["']([^"'?]+)(?:[?"'])/g)].map((match) => match[1]),
    ...[...source.matchAll(/fetcher\(\s*`\$\{customerBookingMemoryApiPath\}/g)].map(
      () => "/api/customer-booking-memory",
    ),
  ];
}

function assertNoUnsafeCustomerApiText(value, label) {
  assert.equal(
    unsafeCustomerApiPattern.test(JSON.stringify(value)),
    false,
    `${label}: expected no admin, finance, payout, parser, token, SQL, or archive fields.`,
  );
}

const [pageSource, requestRouteSource, memoryRouteSource, memoryAdapterSource] = await Promise.all(
  [pagePath, requestRoutePath, memoryRoutePath, memoryAdapterPath].map((relativePath) =>
    readFile(path.join(process.cwd(), relativePath), "utf8"),
  ),
);

const pageFetchPaths = extractFetchPaths(pageSource);
const adapterFetchPaths = extractFetchPaths(memoryAdapterSource);
const allCustomerBookingFetchPaths = [...pageFetchPaths, ...adapterFetchPaths].sort();

assert.deepEqual(
  allCustomerBookingFetchPaths,
  ["/api/customer-booking-memory", "/api/customer-booking-requests"],
  "/book customer flow should only call the approved memory and request APIs.",
);
assert.equal(
  pageSource.includes('"x-prestige-customer-purpose": "customer-booking-request"') &&
    memoryAdapterSource.includes('"x-prestige-customer-purpose": "customer-booking-memory-read"'),
  true,
  "/book customer API calls should carry purpose headers.",
);
assert.equal(
  /x-prestige-customer-session-token|authorization|cookie/i.test(`${pageSource}\n${memoryAdapterSource}`),
  false,
  "/book client code must not attach customer tokens, authorization, or cookie headers.",
);
assert.equal(
  pageSource.includes("short_notice_review_required") &&
    !pageSource.includes("admin_internal_status") &&
    !pageSource.includes("short_notice_review_status"),
  true,
  "/book should consume only customer-safe request API response fields.",
);
assert.equal(
  /admin_internal_status\s*:|short_notice_review_status\s*:/.test(
    requestRouteSource.match(/return Response\.json\(\{[\s\S]+?\n    \}\);/)?.[0] || "",
  ),
  false,
  "Customer booking request API response must not return internal admin status fields.",
);
assert.equal(
  requestRouteSource.includes("short_notice_review_required") &&
    memoryRouteSource.includes("memories: result.data.memories") &&
    memoryRouteSource.includes("version: result.data.version"),
  true,
  "Customer booking APIs should expose only approved customer response fields.",
);
assertNoUnsafeCustomerApiText(
  {
    memoryAdapterFetchHeaders: memoryAdapterSource.match(/headers:\s*\{[\s\S]+?\}/)?.[0] || "",
    requestSubmitBody: pageSource.match(/body:\s*JSON\.stringify\(\{[\s\S]+?\}\),/)?.[0] || "",
    requestSubmitHeaders: pageSource.match(/headers:\s*\{[\s\S]+?\}/)?.[0] || "",
  },
  "/book customer API call surface",
);

console.log("Customer booking page API audit passed.");
