import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, readHelper, adapter, persistenceAdapter, bookPage, appSmoke] = await Promise.all([
  readFile("app/api/customer-booking-requests/route.ts", "utf8"),
  readFile("lib/customer-saved-bookings-read.ts", "utf8"),
  readFile("lib/customer-booking-request-adapter.ts", "utf8"),
  readFile("lib/admin-booking-supabase-adapter.ts", "utf8"),
  readFile("app/book/page.tsx", "utf8"),
  readFile("scripts/test-app-smoke-browser.mjs", "utf8"),
]);

for (const fragment of [
  "resolveCustomerSavedBookingsBoundaryForPurpose",
  "resolveCustomerSavedBookingsVerifiedIdentity",
  "expiredCustomerSavedBookingsSessionCookieHeaders",
  '"customer-booking-request"',
  '"/book"',
  "customer_id: verifiedIdentity.data.customer_account_reference",
  "company_id: verifiedIdentity.data.company_id",
  "booker_id: verifiedIdentity.data.booker_id",
  "Saved customer portal access was cleared. Review the request and submit it again.",
  "status: 409",
]) {
  assert.ok(route.includes(fragment), `PA booking request route must include ${fragment}`);
}

for (const fragment of [
  'actor.boundary_mode === "customer-booking-request-surface"',
  'actor.actor_role === "system"',
  "dbIdentifierOrNull(booking.customer_id)",
  "dbIdentifierOrNull(booking.company_id)",
  "dbIdentifierOrNull(booking.booker_id)",
  "bindExactBookerCustomerAccount",
]) {
  assert.ok(persistenceAdapter.includes(fragment), `Verified PA persistence must include ${fragment}`);
}

const submitMarker = 'data-customer-booking-submit="true"';
const submitMarkerIndex = bookPage.indexOf(submitMarker);
const submitButtonStart = bookPage.lastIndexOf("<button", submitMarkerIndex);
const submitButtonEnd = bookPage.indexOf("</button>", submitMarkerIndex);
assert.ok(
  submitMarkerIndex >= 0 && submitButtonStart >= 0 && submitButtonEnd > submitMarkerIndex,
  "The established customer booking submit button must remain present.",
);
const submitButton = bookPage.slice(submitButtonStart, submitButtonEnd);
assert.match(
  submitButton,
  /disabled=\{\s*submitting\s*\|\|\s*Boolean\(confirmationStatus\)\s*\|\|\s*!bookingSubmissionAccessResolved\s*\|\|\s*!hasBookingSubmissionAccess\s*\}/,
  "The submit button must retain its submitting, successful-submit, access-check, and verified-access locks.",
);
assert.match(
  submitButton,
  /\{confirmationStatus\s*\?\s*"Submitted"\s*:\s*submitting\s*\?\s*"Submitting\.\.\."\s*:\s*!bookingSubmissionAccessResolved\s*\?\s*"Checking booking access\.\.\."\s*:\s*!hasBookingSubmissionAccess\s*\?\s*"Phone verification required"\s*:\s*"Submit Booking Request"\}/,
  "The submit button must retain its current success, progress, access-check, OTP, and ready labels.",
);
assert.match(
  bookPage,
  /function updateField\([\s\S]*?setConfirmationStatus\(null\);[\s\S]*?\n  \}/,
  "Editing a safe booking field must continue clearing the successful-submit lock.",
);

assert.ok(
  appSmoke.includes(
    'await setCustomerBookingField("luggage", "2");\n      await clickCustomerBookingSubmit("second valid customer booking request for same pickup date/time after edit");',
  ) &&
    appSmoke.includes('second valid customer booking request for same pickup date/time after edit') &&
    appSmoke.includes('await setCustomerBookingField("luggage", "3");'),
  "Browser repeat and disabled-intake checks must edit a safe field before retrying the protected submitted form.",
);

assert.ok(
  readHelper.includes("export async function resolveCustomerSavedBookingsVerifiedIdentity"),
  "Existing customer session helper must expose server-verified portal identity.",
);
assert.ok(
  readHelper.includes("hasCompanyIdentity !== hasBookerIdentity"),
  "Partial verified PA identity must fail closed.",
);
assert.ok(
  readHelper.includes("Max-Age=0") && readHelper.includes("HttpOnly") && readHelper.includes("Secure"),
  "Obsolete customer portal cookies must be expired only through a secure server response.",
);

for (const forbidden of ["company_id", "booker_id", "traveler_id", "customer_id"]) {
  assert.equal(
    adapter.match(/const allowedApiRequestFields = new Set\(\[[\s\S]+?\]\);/)?.[0].includes(forbidden),
    false,
    `Customer form adapter must not submit ${forbidden}.`,
  );
}

console.log("Customer booking request PA identity guard passed.");

// Execute the existing resolver, including the PA root handoff omitted by source guards.
const ts = (await import("typescript")).default;
const ast = ts.createSourceFile("identity.ts", readHelper, ts.ScriptTarget.Latest, true);
const resolverText = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "resolveCustomerSavedBookingsVerifiedIdentity").getText(ast).replace(/^export /, "");
const rootMembership = { company_id: 11, booker_id: 21, customer_account_reference: "101", traveler_id: null, membership_role: "managing_pa" };
let principal = { ok: true, data: { principal_role: "pa", normalized_email: "pa@example.test", memberships: [rootMembership] } };
let failRead = false;
const travelerRows = [
  { id: 31, company_id: 11, booker_id: 21, traveler_name: "Boss A" },
  { id: 32, company_id: 11, booker_id: 21, traveler_name: "Boss B" },
  { id: 33, company_id: 11, booker_id: 22, traveler_name: "Boss A" },
  { id: 34, company_id: 12, booker_id: 21, traveler_name: "Boss A" },
];
const client = { from(table) {
  assert.equal(table, "travelers");
  let rows = travelerRows;
  const query = { select() { return query; }, eq(k,v) { rows = rows.filter((row) => row[k] === v); return query; }, limit(n) { rows = rows.slice(0,n); return query; }, then(resolve,reject) { return Promise.resolve({ data: rows, error: failRead ? { message: "fixture failure" } : null }).then(resolve,reject); } };
  return query;
} };
const resolver = new Function("getServerOnlyCustomerSavedBookingsSupabaseClient", "assertActiveCustomerPrincipalSession", "customerSavedBookingsAuthRequiredResult", "verifiedIdentityId", "asRecord", "asArray", "safeTextFromDb", ts.transpileModule(resolverText + "\nreturn resolveCustomerSavedBookingsVerifiedIdentity;", {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(
  () => ({ok:true,data:client}), async () => principal, () => ({ok:false,status:403}),
  (value) => Number.isSafeInteger(Number(value)) && Number(value)>0 ? Number(value) : null,
  (value) => value || {}, (value) => Array.isArray(value) ? value : [], (value) => typeof value === "string" ? value.trim() || null : null,
);
const ctx = { mode: "principal-device-session", principal_session_token: "fixture" };
for (const id of [31,32]) {
  const result = await resolver(ctx, id);
  assert.equal(result.ok, true);
  assert.equal(result.data.traveler_id, id, "PA's explicitly selected Boss must reach booking persistence");
  assert.equal(result.data.booker_id, 21);
  assert.equal(result.data.customer_account_reference, "101");
  assert.equal(result.data.traveler_name, id === 31 ? "Boss A" : "Boss B");
}
assert.equal((await resolver(ctx, "")).data.traveler_id, null, "Free-typed passenger stays optional, without creating or guessing a traveller");
for (const invalid of [33,34,999,"wrong",0,-1]) assert.equal((await resolver(ctx, invalid)).ok, false, "Invalid or another account's traveller must fail closed");
failRead = true;
assert.equal((await resolver(ctx, 31)).ok, false);
failRead = false;
principal.data = { ...principal.data, principal_role:"boss", memberships:[{...rootMembership,traveler_id:31,membership_role:"boss",verified_boss_name:"Boss A"}] };
assert.equal((await resolver(ctx)).data.traveler_id, 31, "Boss keeps own identity without another selection");
assert.equal((await resolver(ctx, 32)).ok, false);
assert.equal((await resolver(ctx, "wrong")).ok, false);
console.log("PA selected Boss, optional passenger, cross-account and Boss self-only resolver execution passed.");
