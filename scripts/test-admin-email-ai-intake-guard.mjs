import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const contractPath = path.join(root, "lib/admin-email-ai-intake-contract.ts");
const runtimePath = path.join(root, "lib/admin-email-ai-intake.ts");
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
const migrationPath = migrationName
  ? path.join(root, "supabase/migrations", migrationName)
  : "";
const timeoutMigrationPath = timeoutMigrationName
  ? path.join(root, "supabase/migrations", timeoutMigrationName)
  : "";

for (const requiredPath of [
  contractPath,
  runtimePath,
  cronRoutePath,
  adminRoutePath,
  pagePath,
  browserTestPath,
  ledgerPath,
  migrationPath,
  timeoutMigrationPath,
]) {
  assert.equal(fs.existsSync(requiredPath), true, `Missing required file: ${requiredPath}`);
}

const contract = await import(pathToFileURL(contractPath).href);
const runtimeSource = fs.readFileSync(runtimePath, "utf8");
const cronRouteSource = fs.readFileSync(cronRoutePath, "utf8");
const adminRouteSource = fs.readFileSync(adminRoutePath, "utf8");
const pageSource = fs.readFileSync(pagePath, "utf8");
const browserTestSource = fs.readFileSync(browserTestPath, "utf8");
const ledgerSource = fs.readFileSync(ledgerPath, "utf8");
const migrationSource = fs.readFileSync(migrationPath, "utf8");
const timeoutMigrationSource = fs.readFileSync(timeoutMigrationPath, "utf8");

assert.equal(contract.adminEmailAiMailboxAddress, "booking@prestigelimo.sg");
assert.equal(contract.adminEmailAiAllowedSenderAddress, "info@prestigelimo.sg");

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

assert.doesNotMatch(runtimeSource, /admin-booking-(?:create|persistence)/);
assert.doesNotMatch(runtimeSource, /google-calendar|calendar/i);
assert.doesNotMatch(runtimeSource, /invoice|payment|payout|paynow/i);
assert.doesNotMatch(runtimeSource, /external_send:\s*true/);

assert.match(cronRouteSource, /PRESTIGE_EMAIL_AI_CRON_SECRET/);
assert.match(cronRouteSource, /authorization/);
assert.match(adminRouteSource, /resolveAdminDispatcherBoundary/);
assert.match(adminRouteSource, /export async function GET/);
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

assert.match(pageSource, /data-dashboard-email-ai-intake-row/);
assert.match(pageSource, /Email · booking@prestigelimo\.sg/);
assert.match(pageSource, /Review in Dispatch/);
assert.match(pageSource, /Review enquiry/);
assert.doesNotMatch(pageSource, /data-dashboard-email-ai-intake-(?:approve|save|calendar|send)/);

assert.match(browserTestSource, /browser-email-ai-confirmed/);
assert.match(browserTestSource, /browser-email-ai-enquiry/);
assert.match(browserTestSource, /Opening the saved enquiry draft must not charge OpenAI again/);
assert.match(browserTestSource, /Expected private email AI dashboard lane to remain read-only/);

assert.match(ledgerSource, /### Private Semantic Email AI Intake/);
assert.match(ledgerSource, /booking@prestigelimo\.sg/);
assert.match(ledgerSource, /info@prestigelimo\.sg/);
assert.match(ledgerSource, /before OpenAI/);
assert.match(ledgerSource, /No external reply is sent/);

console.log("Private semantic email AI intake guard passed.");
