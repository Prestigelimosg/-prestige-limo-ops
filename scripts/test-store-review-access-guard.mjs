import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
const file = new URL("../lib/store-review-access.ts", import.meta.url);
const mod = { exports: {} };
const runtimeEnv = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, {
  exports: mod.exports, module: mod, Buffer, URL, URLSearchParams, Request, Response, Headers,
  process: { env: runtimeEnv },
  require: name => { if (name === "server-only") return {}; if (name.startsWith("node:")) return require(name); throw Error(name); },
});
const review = mod.exports;
const crypto = require("node:crypto");
const credentials = { admin: "A".repeat(43), driver: "D".repeat(43), customer: "C".repeat(43) };
const env = {
  SUPABASE_URL: "https://fixture.supabase.co",
  PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET: "synthetic-only-".repeat(5),
  PRESTIGE_STORE_REVIEW_ACCESS: JSON.stringify({
    version: 1, databaseOrigin: "https://fixture.supabase.co", expiresAt: "2099-01-01T00:00:00Z",
    credentials: Object.fromEntries(Object.entries(credentials).map(([role, code]) => [role, crypto.createHash("sha256").update(code).digest("hex")])),
    scope: { bookingIds: [9001], bookingReferences: ["TEST-ONLY"], companyId: 901, bookerId: 902, customerId: 903, driverId: 904, travelerIds: [905] },
  }),
};
const now = Date.parse("2026-10-16T00:00:00Z");
for (const role of ["admin", "driver", "customer"]) {
  const cookie = review.issueStoreReviewSession(role, credentials[role], { env, now });
  assert.ok(cookie);
  const session = review.resolveStoreReviewSession(cookie, { env, now });
  assert.equal(session.state, "valid");
  assert.equal(session.role, role);
  assert.equal(review.resolveStoreReviewSession(cookie + "; " + cookie, { env, now }).state, "invalid");
  assert.equal(review.resolveStoreReviewSession(cookie, { env: { ...env, PRESTIGE_STORE_REVIEW_ACCESS: "" }, now }).state, "invalid");
  assert.equal(review.resolveStoreReviewSession(cookie, { env, now: now + 9 * 3600000 }).state, "invalid");
  assert.equal(review.issueStoreReviewSession(role, "wrong", { env, now }), null);
  assert.equal(Boolean(review.issueStoreReviewSession(role, credentials.admin, { env, now })), role === "admin");
  for (const path of ["/api/admin-bookings", "/api/admin-customer-invoices", "/api/driver-job-bids", "/api/customer-booking-requests", "/api/unlisted-future-route"]) {
    assert.equal(review.storeReviewRequestAllowed(session, path, "POST"), false);
    assert.equal(review.storeReviewRequestAllowed(session, path, "GET"), false);
  }
  const ownPath = { admin: "/api/admin-saved-bookings", driver: "/api/driver-portal/jobs", customer: "/api/customer-saved-bookings" }[role];
  assert.equal(review.storeReviewRequestAllowed(session, ownPath, "GET"), true);
  assert.equal(review.storeReviewRequestAllowed(session, ownPath, "PATCH"), false);
  assert.equal(review.storeReviewRequestAllowed(session, "/settings/invoice", "GET"), false);
  let sends = 0;
  const scopedFetch = review.storeReviewReadFetch(session, env.SUPABASE_URL, async (url, init) => {
    sends++;
    const parsed = new URL(url);
    assert.ok(parsed.searchParams.getAll("id").includes("in.(9001)"));
    assert.ok(parsed.searchParams.getAll("booking_reference").includes("in.(TEST-ONLY)"));
    assert.equal(parsed.searchParams.get("company_id"), "eq.901");
    assert.equal(init.redirect, "error");
    return new Response("[]");
  });
  await scopedFetch(env.SUPABASE_URL + "/rest/v1/bookings?id=eq.9999&select=*", { method: "GET" });
  assert.equal(sends, 1);
  for (const [path, method] of [["bookings", "PATCH"], ["rpc/anything", "POST"], ["drivers", "GET"], ["bookings/extra", "GET"]]) {
    await assert.rejects(() => scopedFetch(env.SUPABASE_URL + "/rest/v1/" + path, { method }));
  }
  await assert.rejects(() => scopedFetch("https://outside.invalid/rest/v1/bookings", { method: "GET" }));
  assert.equal(sends, 1);
}
assert.equal(review.resolveStoreReviewSession(null, { env, now }).state, "absent");
assert.equal(review.resolveStoreReviewSession("prestige_store_review_session=broken", { env, now }).state, "invalid");
assert.equal(review.issueStoreReviewSession("admin", credentials.admin, { env: { ...env, SUPABASE_URL: "https://other.supabase.co" }, now }), null);
console.log("PASS: new reviewer credential/session, expiry/revocation, role/API deny, and mandatory test-record Data API constraints (synthetic; zero live calls).");

Object.assign(runtimeEnv, env);
for (const role of ["admin", "driver", "customer"]) {
  const path = {admin:"/admin-sign-in", driver:"/driver-portal",customer:"/customer-access/sign-in"}[role];
  const endpoint = {admin:"/api/admin-auth/session",driver:"/api/driver-auth/session",customer:"/api/customer-principal-access"}[role];
  const headers = {origin:"https://app.test",referer:`https://app.test${path}`};
  const purposeHeader = {admin:"x-prestige-admin-auth-purpose",driver:"x-prestige-driver-purpose"}[role];
  if (purposeHeader) headers[purposeHeader] = `${role}-account-sign-in`;
  const req = (method, extra = {}) => new Request(`https://app.test${endpoint}`, { method, headers:{...headers,...extra} });
  const response = review.storeReviewAuthResponse(req("POST"),role,{action:"reviewer_sign_in",access_code:credentials[role]});
  assert.equal(response.status,200);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  assert.equal(review.storeReviewAuthResponse(req("POST",{origin:"https://evil.test"}),role,{action:"reviewer_sign_in",access_code:credentials[role]}).status,403);
  assert.equal(review.storeReviewAuthResponse(req("POST",{cookie}),role,{action:"recover_pin",pin:"123456"}).status,403);
  if (purposeHeader) assert.equal(review.storeReviewAuthResponse(req("POST",{[purposeHeader]:"wrong"}),role,{action:"reviewer_sign_in",access_code:credentials[role]}).status,403);
  assert.equal(review.storeReviewAuthResponse(req("POST"),role,{action:"ordinary_sign_in"}),null);
  const logout = review.storeReviewAuthResponse(req("POST"),role,{action:"reviewer_sign_out"});
  assert.equal(logout.status,200);
  assert.match(logout.headers.get("set-cookie"),/prestige_store_review_session=;.*Max-Age=0/);
}
const driverPage = fs.readFileSync(new URL("../app/driver-portal/page.tsx",import.meta.url),"utf8");
const predicate = driverPage.match(/const installedAccountSignInRequired = Boolean\(([\s\S]*?)\n  \);/)[1];
const signInRequired = new Function("installationId","readState",`return Boolean(${predicate})`);
assert.equal(signInRequired("new-review-device",{kind:"ready",accountSession:false,reviewSession:true}),false);
assert.equal(signInRequired("existing-device",{kind:"ready",accountSession:false,reviewSession:false}),true);
console.log("PASS: reviewer sign-out isolation, same-origin/purpose checks, blocked PIN recovery and installed-driver reviewer state.");
