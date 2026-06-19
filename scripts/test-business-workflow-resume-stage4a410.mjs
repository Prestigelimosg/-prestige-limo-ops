import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const recommendationPath = path.join(process.cwd(), "docs/business-workflow-resume-stage4a410.md");
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const preactivationSuitePath = path.join(process.cwd(), "scripts/test-preactivation-verification-suite.mjs");
const adminPagePath = path.join(process.cwd(), "app/page.tsx");
const customerRoutePath = path.join(process.cwd(), "app/api/customer-booking-requests/route.ts");
const bookingPersistencePath = path.join(process.cwd(), "lib/admin-booking-persistence.ts");
const driverStatusRoutePath = path.join(process.cwd(), "app/api/driver-job/[token]/status/route.ts");
const monthlyBillingPlanPath = path.join(process.cwd(), "docs/regular-customer-monthly-billing-workflow-plan.md");
const guardScript = "scripts/test-business-workflow-resume-stage4a410.mjs";

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const recommendation = await readFile(recommendationPath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");
const preactivationSuite = await readFile(preactivationSuitePath, "utf8");
const adminPage = await readFile(adminPagePath, "utf8");
const customerRoute = await readFile(customerRoutePath, "utf8");
const bookingPersistence = await readFile(bookingPersistencePath, "utf8");
const driverStatusRoute = await readFile(driverStatusRoutePath, "utf8");
const monthlyBillingPlan = await readFile(monthlyBillingPlanPath, "utf8");

for (const requiredText of [
  "Stage 4A-410 resumes app/business workflow planning after production admin persistence verification and closeout.",
  "It does not change app behavior, does not run Supabase commands, does not read or write a live database, and does not approve another production persistence stage.",
  "Admin dashboard `/` already has booking intake, parser/manual review, customer-safe copy, driver dispatch copy, driver assignment fields, booking status controls, and the admin booking persistence panel.",
  "Customer booking request submission exists at `/book` through `/api/customer-booking-requests`, with customer-safe wording and admin-review status fields.",
  "Driver job pages and status routes already provide mock/safe acknowledgement, OTW, OTS, POB, and Job Completed workflow coverage.",
  "Monthly billing preparation has planning coverage, but billing, invoice, payment, PDF, payout, and accounting behavior remain blocked.",
  "The previously recommended admin-only **Confirmed Booking To Dispatch Release** workflow is complete.",
  "`766f305 Guard confirmed dispatch release eligibility` implemented the confirmed-only Dispatch Release eligibility boundary.",
  "`ef080ee Record staging smoke for confirmed dispatch release` recorded and promoted the staging smoke evidence.",
  "Requested, Pending Staff Review, Cancelled, and Completed bookings are not eligible for Dispatch Release; Completed remains closeout/review-only.",
  "No duplicate Dispatch Release UI sector/button/card/route/helper/shim was added.",
  "Why this matters: production persistence has been verified",
  "Documenting the completed workflow outcome.",
  "Planning a later UI-only/admin-only implementation stage only after a fresh no-edit readiness audit and explicit owner approval naming the lane.",
  "Supabase CLI, raw SQL, migrations, dashboard fixes, live save/load, production writes, or broad production reads.",
  "Customer auth, customer RLS, driver auth, driver token persistence, or production driver status writes.",
  "Billing, payment, invoice, statement, PDF, payout, PayNow payout, accounting, finance export, or monthly billing activation.",
  "Parser-learning, parser rule changes, or parser/debug internals exposure.",
  "A later implementation stage should be explicitly approved, named after a fresh no-edit readiness audit, and stay bounded to one existing workflow.",
]) {
  assertIncludes(recommendation, requiredText);
}

for (const staleText of [
  "Build the next approved app/business step as an admin-only **Confirmed Booking To Dispatch Release** workflow.",
  "Documenting the next workflow direction.",
  "Planning a later UI-only/admin-only implementation stage.",
  "A later implementation stage should be explicitly approved and should stay bounded to one admin dashboard workflow.",
]) {
  assertNotMatches(recommendation, new RegExp(staleText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `stale Stage 4A-410 wording: ${staleText}`);
}

for (const currentSurface of [
  "Admin Booking Persistence",
  "Customer booking requests loaded here require admin review before confirmation.",
  "Assigned Driver",
  "Driver Dispatch",
  "Driver Job Link",
  "data-admin-booking-customer-request-decision",
]) {
  assertIncludes(adminPage, currentSurface);
}

for (const customerRouteText of [
  "customer-booking-request",
  "Customer booking request",
  "customer_facing_status",
  "short_notice_review_required",
  "short_notice_review_status",
]) {
  assertIncludes(customerRoute, customerRouteText);
}

for (const persistenceText of [
  "parseCustomerBookingRequestPayload",
  "customer_facing_status",
  "admin_internal_status",
  "short_notice_review_status",
  "request_review_status",
]) {
  assertIncludes(bookingPersistence, persistenceText);
}

assertNotMatches(
  customerRoute,
  /request:\s*\{[\s\S]+?(admin_internal_status|request_review_status)/,
  "Customer booking request public response must not expose internal admin review status fields.",
);

for (const driverRouteText of [
  "applyProductionDriverJobStatusUpdate",
  "Mock-backed route skeleton only. No Supabase writes and no Driver Database access.",
  "PATCH",
]) {
  assertIncludes(driverStatusRoute, driverRouteText);
}

for (const billingPlanText of [
  "This is a workflow planning and acceptance checklist only.",
  "Real invoice generation is not approved.",
  "Stripe is later only.",
]) {
  assertIncludes(monthlyBillingPlan, billingPlanText);
}

assertIncludes(
  docsIndex,
  "[Business Workflow Resume Stage 4A-410](business-workflow-resume-stage4a410.md)",
  "Docs index must point at the Stage 4A-410 workflow recommendation.",
);

assertIncludes(
  preactivationSuite,
  guardScript,
  "Preactivation suite must include the Stage 4A-410 workflow recommendation guard.",
);

for (const [label, text] of [
  ["recommendation", recommendation],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(
    text,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}|kvvsg[a-z0-9]+hxatm/i,
    `${label} secret leak`,
  );
  assertNotMatches(text, /```(?:bash|sql)/i, `${label} must not include runnable shell or SQL blocks`);
}

console.log("Business workflow resume Stage 4A-410 audit passed.");
