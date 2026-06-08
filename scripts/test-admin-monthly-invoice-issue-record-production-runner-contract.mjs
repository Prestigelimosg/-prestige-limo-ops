import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const runnerPath = path.join(
  process.cwd(),
  "scripts/run-admin-monthly-invoice-issue-record-production-save-load-verification.mjs",
);
const source = await readFile(runnerPath, "utf8");

function assertIncludes(fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotMatches(pattern, message) {
  assert.ok(!pattern.test(source), message);
}

assertIncludes(
  "PRESTIGE_ADMIN_MONTHLY_INVOICE_ISSUE_RECORD_PRODUCTION_SAVE_LOAD_APPROVED",
  "runner must require an explicit approval environment gate",
);
assertIncludes(
  "phase-5-invoice-issue-record-william-approved",
  "runner must require the exact William approval value",
);
assertIncludes(
  "88888888-8888-4888-8888-888888888881",
  "runner must use the expected fake draft id",
);
assertIncludes(
  "SAFE INVOICE ISSUE RECORD VERIFY 20260608 ACCOUNT",
  "runner must use the expected fake customer account",
);
assertIncludes(
  "PLO-VERIFY-20260608-001",
  "runner must use the expected fake invoice number",
);
assertIncludes(
  "/api/admin-monthly-invoice-issue-records",
  "runner must verify through the guarded admin invoice issue record API route",
);
assertIncludes(
  "/api/admin-monthly-invoice-issue-reviews",
  "runner must create the required fake issue-review parent through the guarded API route",
);
assertIncludes(
  ".from(\"monthly_invoice_issue_records\")",
  "runner cleanup must target the monthly invoice issue records table",
);
assertIncludes(
  ".from(\"monthly_invoice_issue_reviews\")",
  "runner cleanup must target the monthly invoice issue reviews table",
);
assertIncludes(
  ".from(\"monthly_invoice_drafts\")",
  "runner must create and clean up the exact fake parent draft row required by the FKs",
);
assertIncludes(".delete()", "runner must include exact cleanup for fake rows");
assertIncludes(
  ".eq(\"id\", issueRecordId)",
  "runner issue-record cleanup must scope deletes to the exact fake issue record id",
);
assertIncludes(
  ".eq(\"issue_review_id\", issueReviewId)",
  "runner issue-record cleanup must scope deletes to the exact fake issue review id",
);
assertIncludes(
  ".eq(\"draft_id\", fakeDraftId)",
  "runner cleanup must scope deletes to the exact fake draft id",
);
assertIncludes(
  ".eq(\"customer_account\", fakeCustomerAccount)",
  "runner cleanup must scope deletes to the exact fake account",
);
assertIncludes(
  ".eq(\"billing_month\", fakeBillingMonth)",
  "runner cleanup must scope deletes to the exact fake billing month",
);
assertIncludes(
  "fakeIssueRecordUpdatedStatus = \"paid\"",
  "runner must update the fake issue record to the manual paid state before cleanup",
);
assertIncludes(
  "postCleanupDirectIssueRecordRows",
  "runner must verify the exact fake issue record row no longer exists after cleanup",
);
assertIncludes(
  "postCleanupDirectIssueReviewRows",
  "runner must verify the exact fake issue review row no longer exists after cleanup",
);
assertIncludes(
  "postCleanupDirectParentRows",
  "runner must verify the exact fake parent draft row no longer exists after cleanup",
);
assertIncludes(
  "process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = \"false\"",
  "runner must force the persistence kill switch off after verification",
);
assertIncludes(
  "blockedAnonymous.status !== 403",
  "runner must verify anonymous/public access is blocked before live write",
);
assertIncludes(
  "blockedCustomerReferer.status !== 403",
  "runner must verify customer-style access is blocked before live write",
);
assertIncludes(
  "blockedDriverReferer.status !== 403",
  "runner must verify driver-style access is blocked before live write",
);
assertIncludes(
  "unsafePayloadResult.status !== 400",
  "runner must verify unsafe payload content is rejected before live write",
);
assertIncludes(
  "externalNotificationSends: \"none\"",
  "runner must not send external notifications",
);
assertIncludes(
  "noAutomaticPayment: true",
  "runner must record that no automatic payment was activated",
);
assertIncludes(
  "noPdfGenerationOrSending: true",
  "runner must record that PDF generation/sending was not activated",
);
assertIncludes(
  "noPayout: true",
  "runner must record that payouts were not activated",
);

assertNotMatches(/\bsupabase\s+db\b|\bsupabase\s+migration\b|\bsupabase\s+reset\b/i, "runner must not run Supabase CLI commands");
assertNotMatches(/\bcreate\s+table\b|\balter\s+table\b|\bdrop\s+table\b|\btruncate\b|\bgrant\b|\brevoke\b/i, "runner must not contain raw SQL DDL/DCL");
assertNotMatches(
  /\btelegram\.(?:send|post|request)|\bwhatsapp\.(?:send|post|request)|sendSms|sendEmail|mailgun|twilio|nodemailer/i,
  "runner must not send external notifications",
);
assertNotMatches(
  /createInvoice|paymentIntent|stripe\.|payoutTransfer|paynowTransfer|generatePdf|pdfkit/i,
  "runner must not create payment/PDF/payout behavior",
);

for (const line of source.split(/\r?\n/)) {
  assert.ok(
    !/console\.log|emitEvidence/.test(line) ||
      !/process\.env\.SUPABASE_|SUPABASE_SERVICE_ROLE_KEY.*process\.env/.test(line),
    "runner must not print Supabase env values",
  );
}

console.log("Admin monthly invoice issue record production runner contract passed.");
