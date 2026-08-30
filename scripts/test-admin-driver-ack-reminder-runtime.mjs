import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const source = (await readFile("lib/admin-driver-ack-reminder.ts", "utf8"))
  .replace('import "server-only";', "");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-ack-reminder-"));
const helperPath = path.join(tempDir, "admin-driver-ack-reminder.cjs");

await writeFile(
  helperPath,
  ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "admin-driver-ack-reminder.ts",
  }).outputText,
);
await writeFile(
  path.join(tempDir, "driver-device-push-notification.js"),
  "exports.sendDriverNativePendingAckReminder = async () => ({ ok: false });\n",
);
await writeFile(
  path.join(tempDir, "driver-job-link.js"),
  "exports.isDriverJobLinkExpired = () => false; exports.isDriverJobLinkExpiryOutsideAllowedWindow = () => false;\n",
);
await writeFile(path.join(tempDir, "admin-booking-supabase-adapter.js"), "module.exports = {};\n");

class QueryBuilder {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.filters = [];
    this.operation = "select";
    this.value = null;
  }
  select() { return this; }
  eq(field, value) { this.filters.push([field, value]); return this; }
  is(field, value) { this.filters.push([field, value]); return this; }
  order() { return this; }
  limit(value) { this.limitValue = value; return this; }
  maybeSingle() { return Promise.resolve(this.client.resolve(this)); }
  single() { return Promise.resolve(this.client.resolve(this)); }
  insert(value) { this.operation = "insert"; this.value = value; return this; }
  update(value) { this.operation = "update"; this.value = value; return this; }
  then(resolve, reject) { return Promise.resolve(this.client.resolve(this)).then(resolve, reject); }
}

const linkId = "11111111-1111-4111-8111-111111111111";
const bookingReference = "ACK-REMINDER-TEST";
const now = new Date("2026-08-30T10:30:00.000Z");

function createMockClient({
  audits = [],
  issuedAt = "2026-08-30T10:00:00.000Z",
  newestLinkId = linkId,
  subscriptions = [{ endpoint: "ExpoPushToken[abcdefghijklmnopqrstuvwxyz1234567890]" }],
} = {}) {
  const calls = [];
  const client = {
    calls,
    from(table) { return new QueryBuilder(client, table); },
    resolve(query) {
      calls.push({
        filters: query.filters,
        operation: query.operation,
        table: query.table,
        value: query.value,
      });
      if (query.table === "driver_job_links") {
        const exactIdRead = query.filters.some(([field]) => field === "id");
        return {
          data: exactIdRead
            ? {
                booking_reference: bookingReference,
                created_at: issuedAt,
                driver_id: 8,
                expires_at: "2026-09-01T10:00:00.000Z",
                id: linkId,
                issued_at: issuedAt,
                link_status: "active",
                revoked_at: null,
                safe_link_context: { native_handoff_ciphertext: "v1.opaque.server.only" },
              }
            : {
                expires_at: "2026-09-01T10:00:00.000Z",
                id: newestLinkId,
                link_status: "active",
                revoked_at: null,
              },
          error: null,
        };
      }
      if (query.table === "bookings") {
        return {
          data: {
            admin_internal_status: "assigned",
            booking_reference: bookingReference,
            customer_facing_status: "confirmed",
            driver_id: 8,
            status: "assigned",
          },
          error: null,
        };
      }
      if (query.table === "driver_access_accounts") {
        return {
          data: {
            active_device_id_hash: "a".repeat(64),
            id: "22222222-2222-4222-8222-222222222222",
          },
          error: null,
        };
      }
      if (query.table === "driver_device_push_subscriptions") {
        return { data: subscriptions, error: null };
      }
      if (query.table === "customer_driver_app_notification_outbox") {
        if (query.operation === "insert") {
          return {
            data: { id: "33333333-3333-4333-8333-333333333333" },
            error: null,
          };
        }
        if (query.operation === "update") {
          return { data: null, error: null };
        }
        return { data: audits, error: null };
      }
      throw new Error(`Unexpected table ${query.table}`);
    },
  };
  return client;
}

const actor = {
  actor_label: "Contract Admin",
  actor_role: "admin",
  source_surface: "admin_api",
};

try {
  const helper = createRequire(import.meta.url)(helperPath);
  let sendCount = 0;
  const happyClient = createMockClient();
  const happy = await helper.createAdminDriverAckReminder(
    happyClient,
    { booking_reference: bookingReference, driver_job_link_id: linkId },
    actor,
    {
      now,
      sendNativeReminder: async () => {
        sendCount += 1;
        return {
          native_provider_accepted: true,
          native_provider_request_count: 1,
          ok: true,
          reason: "send_succeeded",
        };
      },
    },
  );
  assert.equal(happy.ok, true);
  assert.equal(happy.data.reminder_count, 1);
  assert.equal(sendCount, 1);
  const insert = happyClient.calls.find(
    (call) => call.table === "customer_driver_app_notification_outbox" && call.operation === "insert",
  );
  assert.equal(insert.value.notification_status, "archived");
  assert.equal(insert.value.workflow_area, "pending_driver_ack_reminder");
  assert.equal(insert.value.driver_job_link_id, linkId);
  assert.equal(insert.value.event_key, `pending-driver-ack-reminder:${linkId}:1`);
  assert.equal(insert.value.safe_message, "Job acknowledgement needed. Tap to review.");
  assert.equal(insert.value.safe_context.reminder_trigger, "manual");
  assert.equal(insert.value.source_surface, "admin_api");
  assert.equal(JSON.stringify(insert.value).includes("token"), false);

  sendCount = 0;
  const earlyClient = createMockClient({ issuedAt: "2026-08-30T10:20:00.000Z" });
  const early = await helper.createAdminDriverAckReminder(
    earlyClient,
    { booking_reference: bookingReference, driver_job_link_id: linkId },
    actor,
    { now, sendNativeReminder: async () => { sendCount += 1; } },
  );
  assert.equal(early.ok, false);
  assert.equal(early.reason, "not_ready");
  assert.equal(sendCount, 0);
  assert.equal(earlyClient.calls.some((call) => call.operation === "insert"), false);

  const cooldown = await helper.createAdminDriverAckReminder(
    createMockClient({ audits: [{ created_at: "2026-08-30T10:20:00.000Z" }] }),
    { booking_reference: bookingReference, driver_job_link_id: linkId },
    actor,
    { now, sendNativeReminder: async () => { throw new Error("must not send"); } },
  );
  assert.equal(cooldown.ok, false);
  assert.equal(cooldown.reason, "cooldown");

  sendCount = 0;
  const automaticAfterExisting = await helper.createAdminDriverAckReminder(
    createMockClient({ audits: [{ created_at: "2026-08-30T10:00:00.000Z" }] }),
    { booking_reference: bookingReference, driver_job_link_id: linkId },
    {
      actor_label: "Driver ACK scheduler",
      actor_role: "system",
      source_surface: "system",
    },
    {
      now,
      sendNativeReminder: async () => { sendCount += 1; },
      trigger: "automatic_first_reminder",
    },
  );
  assert.equal(automaticAfterExisting.ok, false);
  assert.equal(automaticAfterExisting.reason, "automatic_already_attempted");
  assert.equal(sendCount, 0);

  const capped = await helper.createAdminDriverAckReminder(
    createMockClient({
      audits: [
        { created_at: "2026-08-30T10:00:00.000Z" },
        { created_at: "2026-08-30T09:40:00.000Z" },
        { created_at: "2026-08-30T09:20:00.000Z" },
      ],
    }),
    { booking_reference: bookingReference, driver_job_link_id: linkId },
    actor,
    { now, sendNativeReminder: async () => { throw new Error("must not send"); } },
  );
  assert.equal(capped.ok, false);
  assert.equal(capped.reason, "limit_reached");

  const multipleDevices = await helper.createAdminDriverAckReminder(
    createMockClient({ subscriptions: [{ endpoint: "one" }, { endpoint: "two" }] }),
    { booking_reference: bookingReference, driver_job_link_id: linkId },
    actor,
    { now, sendNativeReminder: async () => { throw new Error("must not send"); } },
  );
  assert.equal(multipleDevices.ok, false);
  assert.equal(multipleDevices.reason, "native_app_unavailable");

  const stale = await helper.createAdminDriverAckReminder(
    createMockClient({ newestLinkId: "44444444-4444-4444-8444-444444444444" }),
    { booking_reference: bookingReference, driver_job_link_id: linkId },
    actor,
    { now, sendNativeReminder: async () => { throw new Error("must not send"); } },
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "stale_link");

  console.log("Admin Driver ACK reminder runtime guard passed.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}
