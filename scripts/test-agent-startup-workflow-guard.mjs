import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const agents = await readFile("AGENTS.md", "utf8");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));

for (const requiredRule of [
  "Before proposing, testing, or editing a feature",
  "docs/current-implementation-ledger.md",
  "git status --short --branch",
  "git log --oneline -10",
  "Search the existing app, routes, docs, and focused guard scripts for the requested workflow",
  "Run the existing focused guard before changing the workflow",
  "Treat documented behavior with a passing guard as already implemented unless the exact workflow is reproduced as broken in the approved runtime surface",
  "Do not add a second lane, panel, route, helper, button, or write path for an existing workflow",
  "Record every approved fix in the implementation ledger and protect it with a focused regression guard",
  "npm run guard:staged-app-change",
  "Until the owner explicitly declares that real operations have started",
  "existing booking, driver, and customer records may be reused as test data",
  "Prefer reusing an existing test record over creating a duplicate",
  "This test-data permission does not authorize external sends",
  "payment, payout, PayNow, invoice, billing, GPS, provider, authentication, environment, or Supabase configuration changes",
  "# Owner-locked invoice workflow and final layout — do not modify",
  "The entire established customer billing and invoice system is owner-locked",
  "The final owner-approved invoice lower order remains locked as `Notes → sign-off → Bank Details → Terms & Conditions`",
  "the existing `Notes`, `Bank Details`, and `Terms & Conditions` headings are the three closed-by-default disclosures",
  "never add separate links, buttons, panels, routes, or duplicate content",
  "The stored/customer PDF must continue printing all three sections fully",
  "Notes and Terms must never be combined into a side-by-side replacement footer",
  "An unrelated feature request, including AI or communications work, is never permission to change the invoice system",
  "The owner explicitly confirmed that the whole invoice system shown on the Mac at the existing exact-customer folder is correct",
  "1 · Customer profile & invoice prefix",
  "2 · Total invoices",
  "3 · Pending jobs for payment",
  "4 · Selected jobs invoice review",
  "All booking history",
  "If no invoice defect is reproduced and specifically approved, make no invoice application change",
  "scripts/test-customer-folder-multi-job-invoice-handoff-guard.mjs",
  "scripts/test-customer-local-invoice-issue-pdf-portal-guard.mjs",
  "scripts/test-customer-billing-document-lifecycle-guard.mjs",
  "# Owner-locked Driver Calendar workflow — do not modify",
  "First job: `Save & Acknowledge Job` → `Add / Update Calendar` → approve Google once",
  "Future jobs: `Save & Acknowledge Job` → `Add / Update Calendar` with no repeated Google consent",
  "Amendments: acknowledge the amended private link → `Add / Update Calendar` → update the same event without a duplicate",
  "verified driver ID plus the exact stable booking reference",
  "Never use driver name, phone, plate, acknowledgement text, or driver ID alone as event identity",
  "The event must retain the latest private `Open Driver Job` link",
  "Do not replace this workflow with `.ics`, a forced download, a Google event-template link, a subscription feed, an attendee invitation, or an admin/service-account personal-calendar substitute",
  "scripts/test-driver-job-calendar-download-guard.mjs",
  "scripts/test-driver-job-page-browser.mjs",
]) {
  assert.ok(agents.includes(requiredRule), `AGENTS.md missing startup workflow rule: ${requiredRule}`);
}

assert.equal(
  packageJson.scripts?.["guard:staged-app-change"],
  "node scripts/test-staged-app-change-ledger-guard.mjs",
  "package.json must expose the staged app-change ledger guard",
);

const stagedGuard = await readFile("scripts/test-staged-app-change-ledger-guard.mjs", "utf8");
for (const requiredFragment of [
  "git diff --cached --name-only --diff-filter=ACMR",
  "docs/current-implementation-ledger.md",
  "scripts/test-",
  "Application changes require the implementation ledger",
]) {
  assert.ok(stagedGuard.includes(requiredFragment), `staged app-change guard missing: ${requiredFragment}`);
}

console.log("Agent startup workflow guard passed.");
