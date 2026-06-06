import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const mapPath = path.join(process.cwd(), "docs/admin-persistence-auth-next-step-map.md");
const indexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertOrdered(text, expected) {
  let lastIndex = -1;

  for (const item of expected) {
    const index = text.indexOf(item);

    assert.ok(index > lastIndex, `Expected ordered item after previous item: ${item}`);
    lastIndex = index;
  }
}

const map = await readFile(mapPath, "utf8");
const docsIndex = await readFile(indexPath, "utf8");

for (const boundary of [
  "Stage 4A-403 is a docs-and-tests map only.",
  "It does not run Supabase CLI commands, run raw SQL, read or write a live database, run live save/load, enable production persistence",
  "Keep persistence OFF.",
  "Use this local map and focused tests to decide the next backend workflow order.",
  "Prepare a separate approval packet for production persistence enablement.",
]) {
  assertIncludes(map, boundary);
}

assertOrdered(map, [
  "1. Admin production persistence enablement gate.",
  "2. Admin save/load production verification.",
  "3. Customer auth/RLS later.",
  "4. Driver auth/token security later.",
  "5. Notifications, billing, PDF, and payment later.",
]);

for (const required of [
  "Approved now:",
  "Still blocked now:",
  "prove persistence starts OFF",
  "prove the kill-switch",
  "prove admin/dispatcher-only access",
  "prove unsafe-field rejection",
  "one controlled admin-only production save/load through the existing API gate",
  "kill-switch OFF before and after",
  "no raw SQL",
  "no Supabase CLI by implication",
]) {
  assertIncludes(map, required);
}

for (const customerBoundary of [
  "Customers must never see driver payout",
  "PayNow payout",
  "internal admin notes",
  "parser/debug internals",
  "admin finance",
  "mock QA/dev archive data",
]) {
  assertIncludes(map, customerBoundary);
}

for (const driverBoundary of [
  "Drivers must never see customer price",
  "billing",
  "invoice/payment",
  "payout comparisons",
  "PayNow payout details",
  "internal finance notes",
  "internal admin notes",
  "mock QA/dev archive data",
]) {
  assertIncludes(map, driverBoundary);
}

for (const reviewedReference of [
  "[Legacy Public Table RLS Hardening Closeout](legacy-public-table-rls-hardening-closeout.md)",
  "[Admin Persistence Production Readiness Gate](admin-persistence-production-readiness-gate.md)",
  "[Admin Persistence Staging Verification Packet](admin-persistence-staging-verification-packet.md)",
  "[Admin Persistence API Staging Save-Load Success Evidence](admin-persistence-api-staging-save-load-success-evidence.md)",
  "`lib/admin-booking-persistence.ts`",
  "`lib/admin-booking-supabase-adapter.ts`",
  "`lib/admin-dispatcher-auth-boundary.ts`",
  "`app/api/admin-bookings/route.ts`",
]) {
  assertIncludes(map, reviewedReference);
}

assert.doesNotMatch(map, /```(?:bash|sql)/i, "Map must not include runnable shell or SQL blocks.");
assertIncludes(
  docsIndex,
  "[Admin Persistence/Auth Next-Step Map](admin-persistence-auth-next-step-map.md)",
  "Docs index must point at the Stage 4A-403 next-step map.",
);

console.log("Admin persistence/auth next-step map audit passed.");
