import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/customer-thirty-minute-pickup-reminder.ts";
const routePath = "app/api/cron/customer-thirty-minute-pickup-reminders/route.ts";
const migrationPath = "supabase/migrations/20260818073000_customer_thirty_minute_pickup_reminder_cron.sql";
const ledgerPath = "docs/current-implementation-ledger.md";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";

const [helperSource, routeSource, migrationSource, ledgerSource, suiteSource] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(migrationPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(suitePath, "utf8"),
]);

for (const fragment of [
  "runCustomerThirtyMinutePickupRemindersWithClient",
  "pickupWindowStartMinutes = 30",
  "pickupWindowEndMinutes = 31",
  'delivery_surface: "customer_app"',
  'event_key: customerPickupReminderEventKey',
  'workflow_area: "customer_pickup_reminder_30m"',
  'safe_title: "Pickup in 30 minutes"',
  'safe_message: "Your pickup is in 30 minutes. Open My Bookings to track your driver and view trip updates."',
  "sendCustomerDevicePushAlertForAppUpdate",
]) {
  assert.ok(helperSource.includes(fragment), `Missing customer reminder helper fragment: ${fragment}`);
}

for (const fragment of [
  "customer-thirty-minute-pickup-reminders",
  "prestige_customer_pickup_reminder_endpoint",
  "prestige_customer_pickup_reminder_cron_secret",
  "https://app.prestigelimo.sg/api/cron/customer-thirty-minute-pickup-reminders",
]) {
  assert.ok(migrationSource.includes(fragment), `Missing prepared schedule fragment: ${fragment}`);
}
assert.equal(/SUPABASE_SERVICE_ROLE_KEY|VAPID|decrypted_secret\s*=/.test(migrationSource), false);

for (const fragment of [
  "PRESTIGE_CUSTOMER_PICKUP_REMINDER_CRON_SECRET",
  "runCustomerThirtyMinutePickupReminders()",
  'request.headers.get("authorization")',
]) {
  assert.ok(routeSource.includes(fragment), `Missing protected customer reminder route fragment: ${fragment}`);
}

assert.ok(
  ledgerSource.includes("Customer Thirty-Minute Pickup App Reminder"),
  "Implementation ledger must record the customer reminder lane.",
);
assert.ok(
  suiteSource.includes("scripts/test-customer-thirty-minute-pickup-reminder-guard.mjs"),
  "Preactivation suite must register the customer reminder guard.",
);

assert.equal(/invoice|payment|payout|paynow|customer_price|driver_payout/i.test(helperSource), false);
assert.equal(/\bexpo\b|\bapns\b|whatsapp|telegram|twilio|resend/i.test(helperSource), false);

function transpile(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-30m-reminder-"));
const outputPath = path.join(tempDir, "lib/customer-thirty-minute-pickup-reminder.js");
await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(path.join(tempDir, "node_modules/server-only"), { recursive: true });
await mkdir(path.join(tempDir, "node_modules/@supabase/supabase-js"), { recursive: true });
await writeFile(path.join(tempDir, "node_modules/server-only/index.js"), "");
await writeFile(
  path.join(tempDir, "node_modules/@supabase/supabase-js/index.js"),
  "exports.createClient = () => { throw new Error('runtime client must not be used by this guard'); };",
);
await writeFile(
  path.join(tempDir, "lib/customer-device-push-notification.js"),
  "exports.sendCustomerDevicePushAlertForAppUpdate = async () => ({ ok: true });",
);
await writeFile(outputPath, transpile(helperSource, helperPath));

function createClient({ bookings, insertError = null, statuses = [] }) {
  const inserts = [];
  return {
    inserts,
    from(table) {
      const query = { filters: [], inFilters: [], table };
      const builder = {
        eq(key, value) {
          query.filters.push([key, value]);
          return builder;
        },
        gte() { return builder; },
        in(key, values) {
          query.inFilters.push([key, values]);
          return builder;
        },
        insert(payload) {
          inserts.push({ payload, table });
          return {
            select() {
              return {
                async single() {
                  return insertError
                    ? { data: null, error: insertError }
                    : { data: { id: "11111111-1111-4111-8111-111111111111", ...payload }, error: null };
                },
              };
            },
          };
        },
        limit() {
          if (table === "bookings") return Promise.resolve({ data: bookings, error: null });
          if (table === "driver_job_status_events") {
            const refs = query.inFilters.find(([key]) => key === "booking_reference")?.[1] || [];
            return Promise.resolve({
              data: statuses.filter((row) => refs.includes(row.booking_reference)),
              error: null,
            });
          }
          return Promise.resolve({ data: [], error: null });
        },
        lt() { return builder; },
        order() { return builder; },
        select() { return builder; },
      };
      return builder;
    },
  };
}

try {
  const helper = createRequire(import.meta.url)(outputPath);
  const now = new Date("2026-08-18T04:00:00.000Z");
  const services = ["MNG", "DEP", "TRF", "DSP"];
  const bookings = services.map((service, index) => ({
    admin_internal_status: "confirmed",
    booking_reference: `CUSTOMER-30M-${index + 1}`,
    cancellation_review_status: "not_required",
    customer_facing_status: "confirmed",
    pickup_at: new Date(now.getTime() + 30.5 * 60_000).toISOString(),
    service_type: service,
    status: "confirmed",
  }));
  const client = createClient({ bookings });
  const sent = [];
  const result = await helper.runCustomerThirtyMinutePickupRemindersWithClient(client, {
    now,
    sendPush: async (_client, notification) => {
      sent.push(notification);
      return { ok: true };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.candidate_count, 4);
  assert.equal(result.notification_count, 4);
  assert.equal(result.push_sent_count, 4);
  assert.equal(client.inserts.length, 4);
  assert.deepEqual(
    client.inserts.map(({ payload }) => payload.safe_context.service_family),
    services,
    "All four approved car-service families must use the same reminder lane.",
  );
  assert.equal(sent.every((row) => row.delivery_surface === "customer_app"), true);

  const blockedClient = createClient({
    bookings,
    statuses: bookings.map((booking) => ({
      booking_reference: booking.booking_reference,
      occurred_at: now.toISOString(),
      status_value: "pob",
    })),
  });
  const blocked = await helper.runCustomerThirtyMinutePickupRemindersWithClient(blockedClient, { now });
  assert.equal(blocked.notification_count, 0, "POB bookings must not receive the reminder.");

  const duplicateClient = createClient({ bookings: [bookings[0]], insertError: { code: "23505" } });
  const duplicate = await helper.runCustomerThirtyMinutePickupRemindersWithClient(duplicateClient, { now });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate_count, 1);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Customer thirty-minute pickup reminder guard passed.");
