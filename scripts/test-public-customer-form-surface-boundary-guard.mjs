import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-customer-form-surface-boundary-guard.mjs";

const bookPagePath = "app/book/page.tsx";
const portalPagePath = "app/my-bookings/page.tsx";
const requestAdapterPath = "lib/customer-booking-request-adapter.ts";

const publicCustomerFormFields = [
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
  "returnExtraStops",
  "serviceType",
  "vehicleType",
  "passengerCount",
  "luggage",
  "extraStops",
  "specialRequest",
  "travelerId",
];

const submittedCustomerRequestFields = [
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
  "returnExtraStops",
  "serviceType",
  "vehicleType",
  "passengerCount",
  "luggage",
  "extraStops",
  "travelerId",
];

const bookRequiredFields = [
  "contactNo",
  "emailAddress",
  "passengerName",
  "pickupDate",
  "pickupTime",
  "pickupLocation",
  "dropoffLocation",
];

const forbiddenFormFieldFragments = [
  "admin_finance",
  "admin_note",
  "admin_notes",
  "adminnote",
  "adminnotes",
  "auth",
  "billing",
  "calendar",
  "customer_price",
  "customerprice",
  "debug",
  "driver_payout",
  "driverpayout",
  "finance",
  "internal_admin",
  "internal_finance",
  "internaladmin",
  "internalfinance",
  "invoice",
  "location_photo",
  "locationphoto",
  "mock",
  "archive",
  "parser",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "photo",
  "price",
  "provider",
  "rate",
  "secret",
  "send",
  "token",
];

const adapterForbiddenPayloadFragments = [
  "adminInternalStatus",
  "adminNotes",
  "billing",
  "customerPrice",
  "driverPayout",
  "financeNotes",
  "internalAdminNotes",
  "invoice",
  "payment",
  "paynow",
  "payout",
  "pdf",
  "rawAi",
  "specialRequest",
  "token",
];

const contractChecks = [
  {
    label: "customer booking page client API audit",
    script: "scripts/test-customer-booking-page-api-audit.mjs",
    requiredFragments: [
      "/book customer flow should only call the approved memory and request APIs.",
      "/book should delegate API calls to customer-safe client adapters instead of owning raw fetch calls.",
      "Customer booking page API audit passed.",
    ],
  },
  {
    label: "public route source privacy boundary guard",
    script: "scripts/test-public-route-source-privacy-boundary-guard.mjs",
    requiredFragments: [
      "Customer booking and customer portal source must not render driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive details.",
      "Public route source privacy boundary guard passed",
    ],
  },
  {
    label: "public API request input boundary guard",
    script: "scripts/test-public-api-request-input-boundary-guard.mjs",
    requiredFragments: [
      "Customer booking request POST input must stay limited to the approved customer form fields and must reject forbidden or unknown finance/internal/parser/token/archive fields before persistence.",
      "Public API request input boundary guard passed",
    ],
  },
  {
    label: "customer booking request adapter contract",
    script: "scripts/test-customer-booking-request-adapter.mjs",
    requiredFragments: [
      "Adapter should submit only approved customer booking request fields.",
      "Adapter must not forward finance/internal/free-note fields.",
      "Customer booking request adapter contract passed.",
    ],
  },
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

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function normalizeToken(value) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenFormFieldFragment(value) {
  const normalized = normalizeToken(value);

  return forbiddenFormFieldFragments.some((fragment) => normalized.includes(fragment));
}

function assertSameList(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}

function assertSafeFormFieldNames(values, allowedFields, label) {
  for (const value of values) {
    assert.equal(
      allowedFields.includes(value),
      true,
      `${label} contains unapproved field/control name ${value}.`,
    );
    assert.equal(
      includesForbiddenFormFieldFragment(value),
      false,
      `${label} contains forbidden finance/internal/provider field fragment in ${value}.`,
    );
  }
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

function extractArrayItems(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}[^=]*=\\s*\\[([\\s\\S]*?)\\];`));
  assert.ok(match, `Expected array ${constName}.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractAttributeValues(source, attrName) {
  return [...source.matchAll(new RegExp(`${attrName}="([^"]+)"`, "g"))].map((item) => item[1]);
}

function extractStaticNameValues(source) {
  return [...source.matchAll(/\bname="([^"]+)"/g)].map((item) => item[1]);
}

function runContractCheck({ label, script }) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });

  assert.equal(
    result.status,
    0,
    [
      `${label} failed while running ${script}.`,
      result.stdout.trim(),
      result.stderr.trim(),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const allPaths = [
  ledgerPath,
  preactivationSuitePath,
  bookPagePath,
  portalPagePath,
  requestAdapterPath,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const bookPage = files[bookPagePath];
const portalPage = files[portalPagePath];
const requestAdapter = files[requestAdapterPath];
const ledgerSection = sectionBetween(ledger, "### Public Customer Form Surface Boundary Guard Lock");

for (const phrase of [
  "Public customer booking request form surface is guarded on `/book`; `/my-bookings` may only link to `/book` for new booking requests.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.",
  "`/book` `BookingRequestForm` keys must stay limited to request-only customer trip/contact fields.",
  "`/book` required fields must stay limited to contact number, passenger name, pickup date, pickup time, pickup location, and drop-off location.",
  "`/my-bookings` must not define or submit a duplicate new-request form.",
  "Customer request field data attributes and static control names must stay on the approved form-field allowlist and must not introduce pricing, payout, PayNow, billing, invoice, payment/PDF, provider/send, auth, location-photo, calendar, parser/debug, token/secret, internal/admin finance/note, mock archive, or rate fields.",
  "`/book` continues to submit through `submitCustomerBookingRequest` and the customer-safe adapter, not raw fetch/session/admin plumbing.",
  "`/my-bookings` new-request link must not submit to customer booking request persistence.",
  "The separately guarded fixed-template customer-to-driver quick-reply POST does not create a duplicate booking-request form, submit booking-request fields, or call customer booking-request persistence.",
  "Customer request copy must remain request-only and must not create a price, payment, invoice, PDF, or billing file from these forms.",
  "The customer request adapter may submit only the approved API payload fields and must not forward `specialRequest` or finance/internal/free-note fields.",
  "This guard coordinates the customer booking page API audit, public route source privacy guard, public API request input guard, and customer booking request adapter contract in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-customer-form-surface-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public customer form surface ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation public customer form surface guard registration");

assertSameList(extractTypeKeys(bookPage, "BookingRequestForm"), publicCustomerFormFields, "/book BookingRequestForm fields");
assertSameList(extractObjectKeys(bookPage, "initialForm"), publicCustomerFormFields, "/book initial form fields");
assertSameList(extractArrayItems(bookPage, "requiredFields"), bookRequiredFields, "/book required fields");
assertSameList(
  extractAttributeValues(bookPage, "data-customer-booking-field"),
  publicCustomerFormFields,
  "/book customer booking field attributes",
);
assertSafeFormFieldNames(
  extractAttributeValues(bookPage, "data-customer-booking-field"),
  publicCustomerFormFields,
  "/book customer booking field attributes",
);
assertSafeFormFieldNames(
  extractStaticNameValues(bookPage),
  publicCustomerFormFields,
  "/book static form control names",
);

for (const fragment of [
  'const isBookRequestLink = section === "New Booking Request";',
  'data-customer-portal-book-request-link="true"',
  'href="/book"',
]) {
  assertIncludes(portalPage, fragment, `/my-bookings New Booking Request link ${fragment}`);
}

for (const removedPortalFragment of [
  "type BookingRequestForm =",
  "initialBookingRequestForm",
  "requiredBookingRequestFields",
  "data-customer-portal-request-form",
  "data-customer-portal-request-field",
  "data-customer-portal-submit-request",
  "handleBookingRequestSubmit",
  "data-customer-portal-pickup-time",
  "data-customer-portal-book-request-handoff",
]) {
  assertExcludes(portalPage, removedPortalFragment, `/my-bookings removed duplicate request form ${removedPortalFragment}`);
}

for (const fragment of [
  "submitCustomerBookingRequest(form)",
  "data-customer-booking-form=\"true\"",
  "Our team will review and confirm your booking shortly. Thank you",
  "This is a booking request only, not a confirmed booking yet.",
  "No price, payment, invoice, PDF, or billing file is created here.",
  "Our team will review and confirm availability before your booking is confirmed.",
  "Type of service",
  "Please select service type",
  "Vehicle type",
]) {
  assertIncludes(bookPage, fragment, `/book form surface ${fragment}`);
}

for (const removedFragment of [
  "Prestige Limo will review and confirm your booking shortly.",
  "This is a booking request only. It is not confirmed until Prestige confirms it.",
  "Trip type",
  "Preferred vehicle",
  "Please select trip type",
]) {
  assertExcludes(bookPage, removedFragment, `/book removed request notice ${removedFragment}`);
}

assert.equal(
  bookPage.indexOf("Extra stops") < bookPage.indexOf('data-customer-booking-return-trip-control="true"'),
  true,
  "/book return-trip checkbox must remain below Extra stops.",
);

for (const forbiddenPattern of [
  /\bfetch\s*\(/,
  /x-prestige-admin-purpose/i,
  /\/api\/admin/i,
  /\/api\/admin-saved-bookings/i,
  /customer_price|driver_payout|paynow|payout|internal_admin|parser_debug|mock_archive|mock_qa/i,
]) {
  assertExcludes(bookPage, forbiddenPattern, "/book customer form surface");
}

for (const fragment of [
  'data-customer-portal-book-request-link="true"',
  'href="/book"',
]) {
  assertIncludes(portalPage, fragment, `/my-bookings booking request handoff ${fragment}`);
}

for (const removedFragment of [
  "Mobile web trip view for your confirmed and requested rides. Use request review for changes.",
  "Prestige Limo will review and confirm your booking shortly.",
  "This is a booking request only. It is not confirmed until Prestige confirms it.",
  "Booking request received for review. This is not confirmed yet.",
  "${companyName} staff will reply to confirm availability.",
]) {
  assertExcludes(portalPage, removedFragment, `/my-bookings removed copy ${removedFragment}`);
}

for (const forbiddenPattern of [
  /submitCustomerBookingRequest/,
  /\/api\/customer-booking-requests/i,
  /x-prestige-admin-purpose/i,
  /\/api\/admin/i,
  /\/api\/admin-saved-bookings/i,
  /customer_price|driver_payout|paynow|payout|internal_admin|parser_debug|mock_archive|mock_qa/i,
]) {
  assertExcludes(portalPage, forbiddenPattern, "/my-bookings customer request form surface");
}

assertSameList(
  extractTypeKeys(requestAdapter, "CustomerBookingRequestSubmitInput"),
  submittedCustomerRequestFields,
  "customer request adapter input fields",
);
const adapterBodyBlock =
  requestAdapter.match(/function toCustomerBookingRequestApiBody[\s\S]+?\n}/)?.[0] || "";

for (const field of submittedCustomerRequestFields) {
  assertIncludes(adapterBodyBlock, `${field}: input.${field}`, `adapter submitted field ${field}`);
}

for (const forbiddenFragment of adapterForbiddenPayloadFragments) {
  assertExcludes(
    adapterBodyBlock,
    forbiddenFragment,
    `customer request adapter submitted payload ${forbiddenFragment}`,
  );
}

for (const { label, requiredFragments, script } of contractChecks) {
  const source = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(source, fragment, `${label} source fragment ${fragment}`);
  }
}

for (const contractCheck of contractChecks) {
  runContractCheck(contractCheck);
}

console.log("Public customer form surface boundary guard passed");
