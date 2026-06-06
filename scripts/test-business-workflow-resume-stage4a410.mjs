import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const recommendationPath = path.join(process.cwd(), "docs/business-workflow-resume-stage4a410.md");
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const adminPagePath = path.join(process.cwd(), "app/page.tsx");
const customerRoutePath = path.join(process.cwd(), "app/api/customer-booking-requests/route.ts");
const driverStatusRoutePath = path.join(process.cwd(), "app/api/driver-job/[token]/status/route.ts");
const monthlyBillingPlanPath = path.join(process.cwd(), "docs/regular-customer-monthly-billing-workflow-plan.md");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const recommendation = await readFile(recommendationPath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");
const adminPage = await readFile(adminPagePath, "utf8");
const customerRoute = await readFile(customerRoutePath, "utf8");
const driverStatusRoute = await readFile(driverStatusRoutePath, "utf8");
const monthlyBillingPlan = await readFile(monthlyBillingPlanPath, "utf8");

for (const requiredText of [
  "Stage 4A-410 resumes app/business workflow planning after production admin persistence verification and closeout.",
  "It does not change app behavior, does not run Supabase commands, does not read or write a live database, and does not approve another production persistence stage.",
  "Admin dashboard `/` already has booking intake, parser/manual review, customer-safe copy, driver dispatch copy, driver assignment fields, booking status controls, and the admin booking persistence panel.",
  "Customer booking request submission exists at `/book` through `/api/customer-booking-requests`, with customer-safe wording and admin-review status fields.",
  "Driver job pages and status routes already provide mock/safe acknowledgement, OTW, OTS, POB, and Job Completed workflow coverage.",
  "Monthly billing preparation has planning coverage, but billing, invoice, payment, PDF, payout, and accounting behavior remain blocked.",
  "Build the next approved app/business step as an admin-only **Confirmed Booking To Dispatch Release** workflow.",
  "Start from an applied admin operational snapshot or a reviewed customer booking request.",
  "Show a compact dispatcher release checklist for one booking",
  "Let staff mark the booking as ready for manual dispatch only after the checklist is satisfied.",
  "Keep the first implementation admin-only and UI/local-state only unless William separately approves a narrow persistence update.",
  "Why this is the best next step: production persistence has been verified",
  "Documenting the next workflow direction.",
  "Planning a later UI-only/admin-only implementation stage.",
  "Supabase CLI, raw SQL, migrations, dashboard fixes, live save/load, production writes, or broad production reads.",
  "Customer auth, customer RLS, driver auth, driver token persistence, or production driver status writes.",
  "Billing, payment, invoice, statement, PDF, payout, PayNow payout, accounting, finance export, or monthly billing activation.",
  "Parser-learning, parser rule changes, or parser/debug internals exposure.",
  "A later implementation stage should be explicitly approved and should stay bounded to one admin dashboard workflow.",
]) {
  assertIncludes(recommendation, requiredText);
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
  "admin_internal_status",
  "short_notice_review_status",
]) {
  assertIncludes(customerRoute, customerRouteText);
}

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
