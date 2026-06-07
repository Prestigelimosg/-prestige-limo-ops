import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const runnerPath = path.join(
  process.cwd(),
  "scripts/run-admin-app-notification-production-save-load-verification.mjs",
);
const source = await readFile(runnerPath, "utf8");

function assertIncludes(fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotMatches(pattern, message) {
  assert.ok(!pattern.test(source), message);
}

assertIncludes(
  "PRESTIGE_ADMIN_APP_NOTIFICATION_PRODUCTION_SAVE_LOAD_APPROVED",
  "runner must require an explicit approval environment gate",
);
assertIncludes(
  "stage-admin-app-notification-william-approved",
  "runner must require the exact William approval value",
);
assertIncludes(
  "PROD-APP-NOTIFY-VERIFY-20260607-001",
  "runner must use the expected fake booking reference",
);
assertIncludes(
  "PROD-APP-NOTIFY-EVENT-20260607-001",
  "runner must use the expected fake event key",
);
assertIncludes(
  "/api/admin-app-notifications",
  "runner must verify through the guarded admin app notification API route",
);
assertIncludes(
  ".from(\"admin_app_notification_outbox\")",
  "runner cleanup must target only the admin app notification outbox table",
);
assertIncludes(".delete()", "runner must include exact cleanup for the fake row");
assertIncludes(
  ".eq(\"event_key\", fakeEventKey)",
  "runner cleanup must scope deletes to the exact fake event key",
);
assertIncludes(
  ".eq(\"booking_reference\", fakeBookingReference)",
  "runner cleanup must scope deletes to the exact fake booking reference",
);
assertIncludes(
  "postCleanupDirectRows",
  "runner must verify the exact fake row no longer exists after cleanup",
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

assertNotMatches(/\bsupabase\s+db\b|\bsupabase\s+migration\b|\bsupabase\s+reset\b/i, "runner must not run Supabase CLI commands");
assertNotMatches(/\bcreate\s+table\b|\balter\s+table\b|\bdrop\s+table\b|\btruncate\b|\bgrant\b|\brevoke\b/i, "runner must not contain raw SQL DDL/DCL");
assertNotMatches(
  /\btelegram\.(?:send|post|request)|\bwhatsapp\.(?:send|post|request)|sendSms|sendEmail|mailgun|twilio|nodemailer/i,
  "runner must not send external notifications",
);
assertNotMatches(
  /createInvoice|invoiceDraft|paymentIntent|stripe\.|payoutTransfer|paynowTransfer|generatePdf|pdfkit/i,
  "runner must not create billing/payment/PDF/payout behavior",
);
for (const line of source.split(/\r?\n/)) {
  assert.ok(
    !/console\.log|emitEvidence/.test(line) || !/process\.env\.SUPABASE_|SUPABASE_SERVICE_ROLE_KEY.*process\.env/.test(line),
    "runner must not print Supabase env values",
  );
}

console.log("Admin app notification production runner contract passed.");
