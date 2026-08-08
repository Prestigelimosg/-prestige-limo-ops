import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const contractPath = path.join(root, "lib/admin-email-ai-intake-contract.ts");
const runtimePath = path.join(root, "lib/admin-email-ai-intake.ts");
const bookingParserPath = path.join(root, "lib/booking-parser.ts");
const cronRoutePath = path.join(root, "app/api/cron/admin-email-ai-intake/route.ts");
const adminRoutePath = path.join(root, "app/api/admin-email-ai-intake/route.ts");
const pagePath = path.join(root, "app/page.tsx");
const browserTestPath = path.join(root, "scripts/test-booking-ui-browser.mjs");
const ledgerPath = path.join(root, "docs/current-implementation-ledger.md");
const migrationName = fs
  .readdirSync(path.join(root, "supabase/migrations"))
  .find((name) => name.endsWith("_admin_email_ai_intake.sql"));
const timeoutMigrationName = fs
  .readdirSync(path.join(root, "supabase/migrations"))
  .find((name) => name.endsWith("_admin_email_ai_intake_timeout_repair.sql"));
const groundBookerMigrationName = fs
  .readdirSync(path.join(root, "supabase/migrations"))
  .find((name) =>
    name.endsWith("_admin_email_ai_groundbooker_sender.sql"),
  );
const migrationPath = migrationName
  ? path.join(root, "supabase/migrations", migrationName)
  : "";
const timeoutMigrationPath = timeoutMigrationName
  ? path.join(root, "supabase/migrations", timeoutMigrationName)
  : "";
const groundBookerMigrationPath = groundBookerMigrationName
  ? path.join(root, "supabase/migrations", groundBookerMigrationName)
  : "";

for (const requiredPath of [
  contractPath,
  runtimePath,
  bookingParserPath,
  cronRoutePath,
  adminRoutePath,
  pagePath,
  browserTestPath,
  ledgerPath,
  migrationPath,
  timeoutMigrationPath,
  groundBookerMigrationPath,
]) {
  assert.equal(fs.existsSync(requiredPath), true, `Missing required file: ${requiredPath}`);
}

const contract = await import(pathToFileURL(contractPath).href);
const runtimeSource = fs.readFileSync(runtimePath, "utf8");
const contractSource = fs.readFileSync(contractPath, "utf8");
const bookingParserSource = fs.readFileSync(bookingParserPath, "utf8");
const runtimeSourceWithoutEmailInstructions = runtimeSource.replace(
  /const emailAnalysisInstructions = `[\s\S]*?`;/,
  'const emailAnalysisInstructions = "";',
);
const cronRouteSource = fs.readFileSync(cronRoutePath, "utf8");
const adminRouteSource = fs.readFileSync(adminRoutePath, "utf8");
const pageSource = fs.readFileSync(pagePath, "utf8");
const browserTestSource = fs.readFileSync(browserTestPath, "utf8");
const ledgerSource = fs.readFileSync(ledgerPath, "utf8");
const migrationSource = fs.readFileSync(migrationPath, "utf8");
const timeoutMigrationSource = fs.readFileSync(timeoutMigrationPath, "utf8");
const groundBookerMigrationSource = fs.readFileSync(
  groundBookerMigrationPath,
  "utf8",
);

assert.equal(contract.adminEmailAiMailboxAddress, "booking@prestigelimo.sg");
assert.deepEqual(contract.adminEmailAiAllowedSenderAddresses, [
  "info@prestigelimo.sg",
  "transzend@groundbooker.com",
]);
assert.deepEqual(contract.adminEmailAiAppReviewClassifications, [
  "confirmed_booking",
  "amendment",
  "cancellation",
]);
for (const classification of contract.adminEmailAiClassifications) {
  assert.equal(
    contract.adminEmailAiClassificationAppearsInApp(classification),
    ["confirmed_booking", "amendment", "cancellation"].includes(
      classification,
    ),
  );
}

assert.deepEqual(
  contract.decideAdminEmailAiEnvelope({
    deliveredTo: ["booking@prestigelimo.sg"],
    from: ["info@prestigelimo.sg"],
    mailboxAddress: "booking@prestigelimo.sg",
    returnPath: "info@prestigelimo.sg",
    to: ["booking@prestigelimo.sg"],
  }),
  { allowed: true, reason: "exact_allowed_pair" },
);

assert.deepEqual(
  contract.decideAdminEmailAiEnvelope({
    deliveredTo: ["booking@prestigelimo.sg"],
    from: ["transzend@groundbooker.com"],
    mailboxAddress: "booking@prestigelimo.sg",
    returnPath: "transzend@groundbooker.com",
    to: ["info@prestigelimo.sg"],
  }),
  { allowed: true, reason: "exact_allowed_pair" },
);

for (const blockedInput of [
  {
    deliveredTo: ["booking@prestigelimo.sg"],
    from: ["customer@example.com"],
    mailboxAddress: "booking@prestigelimo.sg",
    returnPath: "customer@example.com",
    to: ["booking@prestigelimo.sg"],
  },
  {
    deliveredTo: ["sales@prestigelimo.sg"],
    from: ["info@prestigelimo.sg"],
    mailboxAddress: "sales@prestigelimo.sg",
    returnPath: "info@prestigelimo.sg",
    to: ["sales@prestigelimo.sg"],
  },
  {
    deliveredTo: ["booking@prestigelimo.sg"],
    from: ["info@prestigelimo.sg"],
    mailboxAddress: "booking@prestigelimo.sg",
    returnPath: "bounce@example.com",
    to: ["booking@prestigelimo.sg"],
  },
  {
    deliveredTo: ["booking@prestigelimo.sg"],
    from: ["transzend@groundbooker.com"],
    mailboxAddress: "booking@prestigelimo.sg",
    returnPath: "transzend@groundbooker.com",
    to: ["booking@prestigelimo.sg"],
  },
  {
    deliveredTo: ["booking@prestigelimo.sg"],
    from: ["transzend@groundbooker.com"],
    mailboxAddress: "booking@prestigelimo.sg",
    returnPath: "info@prestigelimo.sg",
    to: ["info@prestigelimo.sg"],
  },
]) {
  assert.equal(contract.decideAdminEmailAiEnvelope(blockedInput).allowed, false);
}

assert.match(runtimeSource, /store:\s*false/);
assert.match(runtimeSource, /tools:\s*\[\]/);
assert.match(runtimeSource, /parallel_tool_calls:\s*false/);
assert.match(runtimeSource, /PRESTIGE_EMAIL_AI_ENABLED/);
assert.match(runtimeSource, /PRESTIGE_EMAIL_AI_IMAP_PASSWORD/);
assert.match(runtimeSource, /message_id_hash/);
assert.match(runtimeSource, /last_seen_uid/);
assert.match(runtimeSource, /simpleParser/);
assert.match(runtimeSource, /imap\.download/);
assert.match(runtimeSource, /chunkSize:\s*64_000/);
assert.match(runtimeSource, /maxBytes:\s*maximumEmailSourceBytes/);
assert.doesNotMatch(runtimeSource, /imap\.fetchOne/);
assert.match(runtimeSource, /const pendingMessages/);
assert.match(runtimeSource, /for \(const message of pendingMessages\)/);
assert.ok(
  runtimeSource.indexOf("for await (const message of imap.fetch") <
    runtimeSource.indexOf("for (const message of pendingMessages)"),
  "The IMAP envelope iterator must finish before any per-message command runs.",
);
assert.match(runtimeSource, /decideAdminEmailAiEnvelope/);
assert.match(runtimeSource, /classification/);
assert.match(runtimeSource, /confirmed_booking/);
assert.match(runtimeSource, /enquiry/);
assert.match(runtimeSource, /amendment/);
assert.match(runtimeSource, /cancellation/);
assert.match(runtimeSource, /unrelated/);
assert.match(runtimeSource, /uncertain/);
assert.match(runtimeSource, /Always return suggestedReply as an empty string/);
assert.match(
  runtimeSource,
  /Read the complete email before producing the structured booking result\./,
);
assert.match(runtimeSource, /passengerContact/);
assert.match(runtimeSource, /bagCount/);
assert.match(runtimeSource, /extraStopCount/);
assert.match(runtimeSource, /A vehicle's passenger count is capacity and must never replace pax\./);
assert.match(runtimeSource, /never a generic label such as 1 waypoint/);
assert.match(runtimeSource, /never invent a terminal/);
assert.doesNotMatch(runtimeSource, /from "\.\/booking-parser"/);
assert.match(
  runtimeSource,
  /Content under a PAYMENT heading is payment metadata only\./,
);
assert.match(
  runtimeSource,
  /Never copy Stripe or another payment method\/provider into booking pickup, drop-off, extraStopLocation, extraStops, route, or notes\./,
);
assert.match(runtimeSource, /adminEmailAiAppReviewClassifications/);
assert.match(runtimeSource, /adminEmailAiClassificationAppearsInApp/);
assert.match(runtimeSource, /email_confirmed_booking/);
assert.match(runtimeSource, /email_booking_amendment/);
assert.match(runtimeSource, /email_booking_cancellation/);
assert.match(runtimeSource, /sendAdminDevicePushAlert/);
assert.match(runtimeSource, /hyunsoostar@hotmail\.com/);
assert.match(runtimeSource, /Kim Hyun Soo/);
assert.match(runtimeSource, /\+65 98156017/);
assert.match(runtimeSource, /enforcePrestigeTransportKnownBookerEmail/);
assert.match(
  runtimeSource,
  /New booking\\s\+\"Prestige Transport \\d\+\"\\s\+has been received/,
);
assert.match(
  runtimeSource,
  /enforcePrestigeTransportKnownBookerEmail\(\s*input,\s*enforcePrestigeTransportIdentityConsistency\(/,
  "The exact known-Booker email mapping must receive the generic identity-consistency result.",
);
assert.doesNotMatch(contractSource, /hyunsoostar@hotmail\.com|Kim Hyun Soo/);
assert.doesNotMatch(bookingParserSource, /hyunsoostar@hotmail\.com|Kim Hyun Soo/);
assert.match(runtimeSource, /\.eq\("processing_status", "queued"\)/);
assert.match(runtimeSource, /\.in\("classification", \[\.\.\.adminEmailAiAppReviewClassifications\]\)/);
assert.match(runtimeSource, /\? "queued"\s*:\s*"dismissed"/);
assert.match(runtimeSource, /currentSingaporeMonthWindow/);
assert.match(runtimeSource, /tokenUsageMaximumPages/);
assert.match(runtimeSource, /\.gte\("created_at", usageWindow\.start\)/);
assert.match(runtimeSource, /\.lt\("created_at", usageWindow\.end\)/);
assert.match(runtimeSource, /\.range\(pageStart, pageStart \+ tokenUsagePageSize - 1\)/);
assert.match(runtimeSource, /markAdminEmailAiIntakeReviewed/);
assert.match(runtimeSource, /processing_status:\s*"reviewed"/);
assert.match(runtimeSource, /\.eq\("processing_status", "queued"\)/);
assert.match(
  runtimeSource,
  /\.in\("classification", \[\.\.\.adminEmailAiAppReviewClassifications\]\)/,
);

assert.doesNotMatch(runtimeSource, /admin-booking-(?:create|persistence)/);
assert.doesNotMatch(runtimeSource, /google-calendar|calendar/i);
assert.doesNotMatch(
  runtimeSourceWithoutEmailInstructions,
  /invoice|payment|payout|paynow/i,
);
assert.doesNotMatch(runtimeSource, /external_send:\s*true/);
assert.doesNotMatch(runtimeSource, /imap\.append|nodemailer|smtp/i);

assert.match(cronRouteSource, /PRESTIGE_EMAIL_AI_CRON_SECRET/);
assert.match(cronRouteSource, /authorization/);
assert.match(adminRouteSource, /resolveAdminDispatcherBoundary/);
assert.match(adminRouteSource, /export async function GET/);
assert.match(adminRouteSource, /export async function PATCH/);
assert.match(
  adminRouteSource,
  /allowServerSessionRoleMethodsWithoutRequestToken:\s*\["PATCH"\]/,
);
assert.match(adminRouteSource, /intake_id/);
assert.match(adminRouteSource, /processing_status/);
assert.match(adminRouteSource, /markAdminEmailAiIntakeReviewed/);
assert.match(adminRouteSource, /token_usage:\s*result\.data\.token_usage/);
assert.doesNotMatch(adminRouteSource, /export async function POST/);

assert.match(migrationSource, /mailbox_address = 'booking@prestigelimo\.sg'/);
assert.match(migrationSource, /sender_address = 'info@prestigelimo\.sg'/);
assert.match(migrationSource, /enable row level security/);
assert.match(migrationSource, /revoke all on table public\.admin_email_ai_intake[\s\S]*from public, anon, authenticated/);
assert.match(migrationSource, /grant select, insert, update, delete[\s\S]*to service_role/);
assert.match(migrationSource, /prestige_email_ai_intake_endpoint/);
assert.match(migrationSource, /prestige_email_ai_intake_cron_secret/);
assert.doesNotMatch(migrationSource, /create policy/i);
assert.match(timeoutMigrationSource, /cron\.alter_job/);
assert.match(timeoutMigrationSource, /timeout_milliseconds := 120000/);
assert.match(timeoutMigrationSource, /private-email-ai-intake/);
assert.doesNotMatch(timeoutMigrationSource, /create policy/i);
assert.match(
  groundBookerMigrationSource,
  /sender_address in \(\s*'info@prestigelimo\.sg',\s*'transzend@groundbooker\.com'\s*\)/,
);
assert.match(
  groundBookerMigrationSource,
  /drop constraint if exists admin_email_ai_intake_exact_sender_check/,
);
assert.match(
  groundBookerMigrationSource,
  /add constraint admin_email_ai_intake_exact_sender_check/,
);
assert.doesNotMatch(groundBookerMigrationSource, /create policy/i);

assert.match(pageSource, /data-dashboard-email-ai-intake-row/);
assert.match(pageSource, /data-admin-email-ai-monthly-token-usage="true"/);
assert.match(pageSource, /Current Singapore-month Email AI usage\. OpenAI API has no fixed token balance\./);
assert.match(pageSource, /grid-cols-4/);
assert.match(pageSource, /Email · booking@prestigelimo\.sg/);
assert.match(pageSource, /Review in Dispatch/);
assert.doesNotMatch(pageSource, /Review enquiry/);
assert.match(pageSource, /adminEmailAiClassificationAppearsInApp/);
assert.match(pageSource, /adminEmailAiSenderAddressIsAllowed/);
assert.match(pageSource, /From \{clean\(record\.sender_address\)\}/);
assert.match(pageSource, /activeAdminEmailAiIntakeId/);
assert.match(pageSource, /preserveAdminEmailAiReview/);
assert.match(pageSource, /markAdminEmailAiIntakeReviewed/);
assert.match(pageSource, /completeActiveAdminEmailAiReviewAfterSave/);
assert.match(
  pageSource,
  /records:\s*current\.records\.filter\(\s*\(record\)\s*=>\s*clean\(record\.id\)\s*!==\s*intakeId/,
);
assert.match(
  pageSource,
  /dashboardNewBookingRequestAttentionCount \+ adminEmailAiIntakeCount/,
);
assert.doesNotMatch(pageSource, /data-dashboard-email-ai-intake-(?:approve|save|calendar|send)/);

assert.match(
  browserTestSource,
  /00000000-0000-4000-8000-000000000101/,
);
assert.match(
  browserTestSource,
  /00000000-0000-4000-8000-000000000102/,
);
assert.match(browserTestSource, /Expected enquiry email to remain outside the app review feed/);
assert.match(browserTestSource, /Expected private email AI dashboard lane to remain read-only/);
assert.match(browserTestSource, /compact monthly Email AI token usage/);
assert.match(browserTestSource, /dashboardOverdueSingaporeMidnightMs/);
assert.match(browserTestSource, /successful Save \+ CRM to close the exact Email AI intake/);
assert.match(browserTestSource, /Email AI badge to update after successful Save \+ CRM/);
assert.match(browserTestSource, /From info@prestigelimo\\\.sg/);
assert.match(browserTestSource, /Prestige Transport 15787 canonical fields mapped into existing Booking Details/);
assert.match(pageSource, /passenger_phone: clean\(bookingValue\.passengerContact\) \|\| null/);
assert.match(pageSource, /bookingValue\.luggageCount/);
assert.match(pageSource, /passengerContact: clean\(record\.passenger_phone\)/);
assert.match(pageSource, /safeAdminBookingPersistenceCount\(record\.luggage_count\)/);

assert.match(ledgerSource, /### Private Semantic Email AI Intake/);
assert.match(ledgerSource, /booking@prestigelimo\.sg/);
assert.match(ledgerSource, /info@prestigelimo\.sg/);
assert.match(ledgerSource, /before OpenAI/);
assert.match(ledgerSource, /No external reply is sent/);
assert.match(ledgerSource, /classified the message as `enquiry` with 99% confidence/);
assert.match(ledgerSource, /702 OpenAI input tokens plus 274 output tokens/);
assert.match(ledgerSource, /the token totals remained unchanged/);
assert.match(ledgerSource, /No external reply, booking\/CRM\/Calendar\/message\/invoice\/payment/);
assert.match(ledgerSource, /only confirmed bookings, amendments, and cancellations may enter the existing app review feed/);
assert.match(ledgerSource, /Enquiries are ignored by the app and answered manually by Admin from the mailbox/);
assert.match(ledgerSource, /No mailbox draft, email send, new UI lane, route, table, migration, or operational write was added/);
assert.match(ledgerSource, /Production build `143f3bd1`/);
assert.match(ledgerSource, /the Email AI badge showed `0 email`/);
assert.match(ledgerSource, /Chrome reported zero console errors/);
assert.match(
  ledgerSource,
  /actionable Email AI records now reuse the existing Admin device-push sender/,
);
assert.match(
  ledgerSource,
  /Email AI count now contributes to the existing Dashboard alert badge/,
);
assert.match(
  ledgerSource,
  /`Save \+ CRM` path, one same-route guarded PATCH marks only the exact originating Email AI intake as `reviewed`/,
);
assert.match(
  ledgerSource,
  /row disappears and the existing badge count decreases immediately/,
);
assert.match(
  ledgerSource,
  /GroundBooker Exact-Sender Email AI Intake/,
);
assert.match(ledgerSource, /transzend@groundbooker\.com/);
assert.match(
  ledgerSource,
  /original recipient `info@prestigelimo\.sg`/,
);
assert.match(
  ledgerSource,
  /Email AI Payment Section Location Exclusion/,
);
assert.match(
  ledgerSource,
  /`PAYMENT` values such as `Stripe` are payment metadata only/,
);

console.log("Private semantic email AI intake guard passed.");
