import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/driver-one-hour-pickup-reminder.ts";
const pushPath = "lib/driver-device-push-notification.ts";
const routePath = "app/api/cron/driver-one-hour-pickup-reminders/route.ts";
const workerPath = "public/prestige-driver-push-sw.js";
const vercelPath = "vercel.json";
const ledgerPath = "docs/current-implementation-ledger.md";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";

function assertIncludes(source, fragments, label) {
  for (const fragment of fragments) {
    assert.equal(source.includes(fragment), true, `${label} must include ${fragment}`);
  }
}

function assertExcludes(source, fragments, label) {
  const normalized = source.toLowerCase();
  for (const fragment of fragments) {
    assert.equal(
      normalized.includes(fragment.toLowerCase()),
      false,
      `${label} must exclude ${fragment}`,
    );
  }
}

function transpileTypescript(source, filename) {
  return ts.transpileModule(source.replace('import "server-only";', ""), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

const [helperSource, pushSource, routeSource, workerSource, vercelSource, ledgerSource, suiteSource] =
  await Promise.all(
    [helperPath, pushPath, routePath, workerPath, vercelPath, ledgerPath, suitePath].map(
      (relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8"),
    ),
  );

assertIncludes(
  helperSource,
  [
    "driver-one-hour-pickup-reminder-v1",
    "customer_driver_app_notification_outbox",
    "driver_job_links",
    "driver_job_status_events",
    "sendDriverDevicePushAlertForPickupReminder",
    'delivery_surface: "driver_app"',
    'notification_type: "trip_update"',
    'notification_status: "queued"',
    'priority: "high"',
    'workflow_area: "driver_pickup_reminder"',
    'safe_title: "Pickup in 1 hour"',
    'safe_message: "Your pickup is in 1 hour. Open Driver Portal to review the job."',
    'source_surface: "system"',
    'actor_role: "system"',
    "23505",
  ],
  "one-hour pickup reminder helper",
);
assertExcludes(
  helperSource,
  [
    "customer_price",
    "driver_payout",
    "paynow",
    "invoice",
    "billing",
    "internal_admin_note",
    "passenger_name",
    "contact_phone",
    "flightaware",
    "google calendar",
  ],
  "one-hour pickup reminder privacy and lane isolation",
);

assertIncludes(
  pushSource,
  [
    "sendDriverDevicePushAlertForPickupReminder",
    "Pickup is in 1 hour. Open Driver Portal to review.",
  ],
  "existing Driver device-push sender extension",
);
assertIncludes(
  workerSource,
  ["Pickup is in 1 hour. Open Driver Portal to review."],
  "existing Driver push service worker reminder payload",
);
assertIncludes(
  routeSource,
  [
    'import { runDriverOneHourPickupReminders }',
    'request.headers.get("authorization")',
    "`Bearer ${cronSecret}`",
    "runDriverOneHourPickupReminders()",
  ],
  "authorized one-hour pickup reminder cron route",
);
assertExcludes(
  routeSource,
  ["POST", "request.json", "searchParams.get", "customer_price", "driver_payout", "invoice"],
  "cron route input and privacy boundary",
);

const vercelConfig = JSON.parse(vercelSource);
const reminderCron = vercelConfig.crons.find(
  (entry) => entry.path === "/api/cron/driver-one-hour-pickup-reminders",
);
assert.deepEqual(reminderCron, {
  path: "/api/cron/driver-one-hour-pickup-reminders",
  schedule: "* * * * *",
});
assertIncludes(
  suiteSource,
  ["scripts/test-driver-one-hour-pickup-push-reminder-guard.mjs"],
  "preactivation suite registration",
);
assertIncludes(
  ledgerSource,
  ["Driver One-Hour Pickup App Push Reminder"],
  "implementation ledger",
);

const tempDir = path.join(process.cwd(), ".tmp-driver-one-hour-pickup-reminder-guard");
const tempHelperPath = path.join(tempDir, "lib/driver-one-hour-pickup-reminder.js");
const tempPushPath = path.join(tempDir, "lib/driver-device-push-notification.js");
const tempDriverLinkPath = path.join(tempDir, "lib/driver-job-link.js");
await rm(tempDir, { force: true, recursive: true });
await mkdir(path.dirname(tempHelperPath), { recursive: true });
await writeFile(
  tempHelperPath,
  transpileTypescript(helperSource, path.join(process.cwd(), helperPath)),
);
await writeFile(
  tempPushPath,
  "exports.sendDriverDevicePushAlertForPickupReminder = async () => ({ ok: true, reason: 'send_succeeded' });\n",
);
await writeFile(
  tempDriverLinkPath,
  "exports.isDriverJobLinkExpired = () => false;\nexports.isDriverJobLinkExpiryOutsideAllowedWindow = () => false;\n",
);

class QueryBuilder {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.filters = [];
    this.operation = "select";
    this.payload = null;
  }
  select() { return this; }
  eq(field, value) { this.filters.push(["eq", field, value]); return this; }
  gte(field, value) { this.filters.push(["gte", field, value]); return this; }
  lt(field, value) { this.filters.push(["lt", field, value]); return this; }
  in(field, value) { this.filters.push(["in", field, value]); return this; }
  order() { return this; }
  limit() { return this; }
  insert(payload) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }
  single() { return Promise.resolve(this.client.resolve(this)); }
  then(resolve, reject) {
    return Promise.resolve(this.client.resolve(this)).then(resolve, reject);
  }
}

function createReminderClient({
  duplicate = false,
  statusValue = null,
} = {}) {
  const calls = [];
  const client = {
    calls,
    from(table) { return new QueryBuilder(client, table); },
    resolve(query) {
      calls.push({
        filters: query.filters,
        operation: query.operation,
        payload: query.payload,
        table: query.table,
      });
      if (query.table === "bookings") {
        return {
          data: [
            {
              admin_internal_status: "assigned",
              booking_reference: "ADM-20260726120000",
              cancellation_review_status: null,
              customer_facing_status: "confirmed",
              driver_id: 8,
              pickup_at: "2026-07-26T13:00:30.000Z",
              public_booking_reference: "10850",
              status: "assigned",
            },
          ],
          error: null,
        };
      }
      if (query.table === "driver_job_links") {
        return {
          data: [
            {
              booking_reference: "ADM-20260726120000",
              created_at: "2026-07-26T10:00:00.000Z",
              driver_id: 8,
              expires_at: "2026-07-27T13:00:00.000Z",
              id: "11111111-1111-4111-8111-111111111111",
              link_status: "active",
              revoked_at: null,
              safe_link_context: {},
            },
          ],
          error: null,
        };
      }
      if (query.table === "driver_job_status_events") {
        return {
          data: statusValue
            ? [
                {
                  booking_reference: "ADM-20260726120000",
                  occurred_at: "2026-07-26T11:59:00.000Z",
                  status_value: statusValue,
                },
              ]
            : [],
          error: null,
        };
      }
      if (
        query.table === "customer_driver_app_notification_outbox" &&
        query.operation === "insert"
      ) {
        return duplicate
          ? { data: null, error: { code: "23505" } }
          : {
              data: {
                id: "22222222-2222-4222-8222-222222222222",
                ...query.payload,
                created_at: "2026-07-26T12:00:00.000Z",
                updated_at: "2026-07-26T12:00:00.000Z",
              },
              error: null,
            };
      }
      return { data: null, error: { code: "unexpected_query" } };
    },
  };
  return client;
}

try {
  const helper = createRequire(import.meta.url)(tempHelperPath);
  const sent = [];
  const client = createReminderClient();
  const result = await helper.runDriverOneHourPickupRemindersWithClient(client, {
    now: new Date("2026-07-26T12:00:00.000Z"),
    sendPush: async (_client, input) => {
      sent.push(input);
      return { ok: true, reason: "send_succeeded" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.candidate_count, 1);
  assert.equal(result.notification_count, 1);
  assert.equal(result.push_sent_count, 1);
  assert.equal(result.duplicate_count, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].driver_id, 8);
  assert.equal(sent[0].driver_job_link_id, "11111111-1111-4111-8111-111111111111");
  const bookingCall = client.calls.find((call) => call.table === "bookings");
  assert.deepEqual(
    bookingCall.filters.filter(([operator]) => operator === "gte" || operator === "lt"),
    [
      ["gte", "pickup_at", "2026-07-26T13:00:00.000Z"],
      ["lt", "pickup_at", "2026-07-26T13:01:00.000Z"],
    ],
  );
  const insert = client.calls.find(
    (call) =>
      call.table === "customer_driver_app_notification_outbox" &&
      call.operation === "insert",
  );
  assert.equal(insert.payload.delivery_surface, "driver_app");
  assert.equal(insert.payload.driver_job_link_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(insert.payload.safe_title, "Pickup in 1 hour");
  assert.equal(
    insert.payload.safe_message,
    "Your pickup is in 1 hour. Open Driver Portal to review the job.",
  );
  assert.match(
    insert.payload.event_key,
    /^driver_pickup_60m:ADM-20260726120000:2026-07-26T13:00:30\.000Z$/,
  );
  assertExcludes(
    JSON.stringify(insert.payload),
    [
      "passenger",
      "customer",
      "contact",
      "price",
      "billing",
      "invoice",
      "payment",
      "payout",
      "paynow",
      "internal",
      "parser",
      "debug",
    ],
    "persisted reminder payload",
  );

  const duplicateResult = await helper.runDriverOneHourPickupRemindersWithClient(
    createReminderClient({ duplicate: true }),
    {
      now: new Date("2026-07-26T12:00:00.000Z"),
      sendPush: async () => {
        throw new Error("duplicate reminders must not push");
      },
    },
  );
  assert.equal(duplicateResult.ok, true);
  assert.equal(duplicateResult.notification_count, 0);
  assert.equal(duplicateResult.push_sent_count, 0);
  assert.equal(duplicateResult.duplicate_count, 1);

  for (const terminalStatus of ["pob", "completed"]) {
    const terminalResult = await helper.runDriverOneHourPickupRemindersWithClient(
      createReminderClient({ statusValue: terminalStatus }),
      {
        now: new Date("2026-07-26T12:00:00.000Z"),
        sendPush: async () => {
          throw new Error(`${terminalStatus} jobs must not receive pickup reminders`);
        },
      },
    );
    assert.equal(terminalResult.notification_count, 0);
    assert.equal(terminalResult.push_sent_count, 0);
  }
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Driver one-hour pickup app push reminder guard passed.");
