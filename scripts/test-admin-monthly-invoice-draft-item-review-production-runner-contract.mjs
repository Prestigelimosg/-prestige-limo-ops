import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const runnerPath = path.join(
  process.cwd(),
  "scripts/run-admin-monthly-invoice-draft-item-review-production-save-load-verification.mjs",
);
const source = await readFile(runnerPath, "utf8");

function assertIncludes(fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotMatches(pattern, message) {
  assert.ok(!pattern.test(source), message);
}

assertIncludes(
  "PRESTIGE_ADMIN_MONTHLY_INVOICE_DRAFT_ITEM_REVIEW_PRODUCTION_SAVE_LOAD_APPROVED",
  "runner must require an explicit approval environment gate",
);
assertIncludes(
  "stage-monthly-invoice-draft-item-review-william-approved",
  "runner must require the exact William approval value",
);
assertIncludes(
  "77777777-7777-4777-8777-777777777771",
  "runner must use the expected fake draft id",
);
assertIncludes(
  "77777777-7777-4777-8777-777777777772",
  "runner must use the expected fake draft trip link id",
);
assertIncludes(
  "SAFE-INVOICE-DRAFT-ITEM-REVIEW-VERIFY-20260608-TRIP-001",
  "runner must use the expected fake booking reference",
);
assertIncludes(
  "/api/admin-monthly-invoice-draft-item-reviews",
  "runner must verify through the guarded admin item-review API route",
);
assertIncludes(
  ".from(\"monthly_invoice_draft_item_reviews\")",
  "runner cleanup must target the monthly invoice draft item review table",
);
assertIncludes(
  ".from(\"monthly_invoice_draft_trip_links\")",
  "runner must create and clean up the exact fake trip-link row required by the FK",
);
assertIncludes(
  ".from(\"monthly_invoice_drafts\")",
  "runner must create and clean up the exact fake parent draft row required by the FK",
);
assertIncludes(".delete()", "runner must include exact cleanup for fake rows");
assertIncludes(
  ".eq(\"draft_id\", fakeDraftId)",
  "runner cleanup must scope deletes to the exact fake draft id",
);
assertIncludes(
  ".eq(\"id\", fakeDraftTripLinkId)",
  "runner trip-link cleanup must scope deletes to the exact fake trip link id",
);
assertIncludes(
  ".eq(\"id\", fakeDraftId)",
  "runner parent cleanup must scope deletes to the exact fake parent draft id",
);
assertIncludes(
  ".eq(\"booking_reference\", fakeBookingReference)",
  "runner cleanup must scope deletes to the exact fake booking reference",
);
assertIncludes(
  ".eq(\"customer_account\", fakeCustomerAccount)",
  "runner cleanup must scope parent deletes to the exact fake account",
);
assertIncludes(
  ".eq(\"billing_month\", fakeBillingMonth)",
  "runner cleanup must scope parent deletes to the exact fake billing month",
);
assertIncludes(
  "postCleanupDirectItemReviewRows",
  "runner must verify the exact fake item-review row no longer exists after cleanup",
);
assertIncludes(
  "postCleanupDirectTripLinkRows",
  "runner must verify the exact fake trip-link row no longer exists after cleanup",
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

assertNotMatches(/\bsupabase\s+db\b|\bsupabase\s+migration\b|\bsupabase\s+reset\b/i, "runner must not run Supabase CLI commands");
assertNotMatches(/\bcreate\s+table\b|\balter\s+table\b|\bdrop\s+table\b|\btruncate\b|\bgrant\b|\brevoke\b/i, "runner must not contain raw SQL DDL/DCL");
assertNotMatches(
  /\btelegram\.(?:send|post|request)|\bwhatsapp\.(?:send|post|request)|sendSms|sendEmail|mailgun|twilio|nodemailer/i,
  "runner must not send external notifications",
);
assertNotMatches(
  /createInvoice|paymentIntent|stripe\.|payoutTransfer|paynowTransfer|generatePdf|pdfkit|finalInvoiceNumber|invoiceNumber\s*:/i,
  "runner must not create final invoice/payment/PDF/payout behavior",
);

for (const line of source.split(/\r?\n/)) {
  assert.ok(
    !/console\.log|emitEvidence/.test(line) ||
      !/process\.env\.SUPABASE_|SUPABASE_SERVICE_ROLE_KEY.*process\.env/.test(line),
    "runner must not print Supabase env values",
  );
}

console.log("Admin monthly invoice draft item review production runner contract passed.");
