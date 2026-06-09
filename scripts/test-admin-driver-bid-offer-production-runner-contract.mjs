import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const runnerPath = path.join(
  process.cwd(),
  "scripts/run-admin-driver-bid-offer-production-save-load-verification.mjs",
);
const source = await readFile(runnerPath, "utf8");

function assertIncludes(fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotMatches(pattern, message) {
  assert.ok(!pattern.test(source), message);
}

assertIncludes(
  "PRESTIGE_ADMIN_DRIVER_BID_OFFER_PRODUCTION_SAVE_LOAD_APPROVED",
  "runner must require an explicit approval environment gate",
);
assertIncludes(
  "stage-driver-bid-offer-william-approved",
  "runner must require the exact William approval value",
);
assertIncludes(
  "PROD-DRIVER-BID-OFFER-VERIFY-20260610-001",
  "runner must use the expected fake booking reference",
);
assertIncludes(
  "/api/admin-driver-job-bid-offers",
  "runner must verify through the guarded admin driver bid offer API route",
);
assertIncludes(
  "parseAdminDriverJobBidOfferSavePayload",
  "runner must validate the fake bid offer payload before live write",
);
assertIncludes(
  ".from(\"driver_job_bid_offers\")",
  "runner cleanup must target the driver job bid offers table",
);
assertIncludes(
  ".from(\"driver_job_bids\")",
  "runner cleanup must inspect the linked driver job bids table",
);
assertIncludes(".delete()", "runner must include exact cleanup for the fake rows");
assertIncludes(
  ".eq(\"id\", insertedOfferId)",
  "runner cleanup must scope offer deletes to the exact inserted offer id",
);
assertIncludes(
  ".eq(\"booking_reference\", fakeBookingReference)",
  "runner cleanup must scope deletes to the exact fake booking reference",
);
assertIncludes(
  ".eq(\"driver_job_bid_offer_id\", insertedOfferId)",
  "runner cleanup must scope linked bid deletes to the exact inserted offer id",
);
assertIncludes(
  "postCleanupDirectBidOfferRows",
  "runner must verify the exact fake bid offer no longer exists after cleanup",
);
assertIncludes(
  "postCleanupDirectBidRows",
  "runner must verify linked fake bid rows no longer exist after cleanup",
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
  "noRuntimeDriverBidWrite: true",
  "runner must keep runtime driver bid writes out of this admin-only verification",
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

console.log("Admin driver bid offer production runner contract passed.");
