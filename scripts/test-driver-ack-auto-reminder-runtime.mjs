import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const source = (await readFile("lib/driver-ack-auto-reminder.ts", "utf8"))
  .replace('import "server-only";', "");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-auto-ack-reminder-"));
const helperPath = path.join(tempDir, "driver-ack-auto-reminder.cjs");
const routePath = path.join(tempDir, "driver-ack-auto-reminder-route.cjs");
const routeRunnerPath = path.join(tempDir, "route-runner.js");
const originalCronSecret = process.env.CRON_SECRET;

await writeFile(
  helperPath,
  ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "driver-ack-auto-reminder.ts",
  }).outputText,
);
const routeSource = (await readFile("app/api/cron/driver-ack-auto-reminders/route.ts", "utf8"))
  .replace('"../../../../lib/driver-ack-auto-reminder"', '"./route-runner"');
await writeFile(
  routePath,
  ts.transpileModule(routeSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "driver-ack-auto-reminder-route.ts",
  }).outputText,
);
await writeFile(
  routeRunnerPath,
  [
    "let calls = 0;",
    "let result = { ok: true, reason: 'ok', candidate_count: 1, eligible_count: 1, reminder_sent_count: 1, skipped_count: 0, failure_count: 0, version: 'driver-ack-auto-reminder-v1' };",
    "exports.__calls = () => calls;",
    "exports.__setResult = (value) => { result = value; };",
    "exports.runDriverAckAutoReminders = async () => { calls += 1; return result; };",
  ].join("\n"),
);
await writeFile(
  path.join(tempDir, "admin-driver-ack-reminder.js"),
  "exports.createAdminDriverAckReminder = async () => { throw new Error('inject the reminder sender'); };\n",
);
await mkdir(path.join(tempDir, "node_modules", "@supabase", "supabase-js"), { recursive: true });
await writeFile(
  path.join(tempDir, "node_modules", "@supabase", "supabase-js", "index.js"),
  "exports.createClient = () => { throw new Error('inject the client'); };\n",
);

class QueryBuilder {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.table = table;
  }
  select() { return this; }
  eq(field, value) { this.filters.push({ field, type: "eq", value }); return this; }
  is(field, value) { this.filters.push({ field, type: "is", value }); return this; }
  lte(field, value) { this.filters.push({ field, type: "lte", value }); return this; }
  in(field, value) { this.filters.push({ field, type: "in", value }); return this; }
  order() { return this; }
  limit() { return this; }
  then(resolve, reject) { return Promise.resolve(this.client.resolve(this)).then(resolve, reject); }
}

const firstLinkId = "11111111-1111-4111-8111-111111111111";
const remindedLinkId = "22222222-2222-4222-8222-222222222222";
const recentLinkId = "33333333-3333-4333-8333-333333333333";
const acknowledgedLinkId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-08-30T10:30:00.000Z");

function createClient({ linkError = null, outboxError = null } = {}) {
  const links = [
    {
      booking_reference: "AUTO-ACK-FIRST",
      created_at: "2026-08-30T10:00:00.000Z",
      driver_id: 17,
      expires_at: "2026-09-01T10:00:00.000Z",
      id: firstLinkId,
      issued_at: "2026-08-30T10:00:00.000Z",
      link_status: "active",
      revoked_at: null,
      safe_link_context: { native_handoff_ciphertext: "v1.opaque.server.only" },
    },
    {
      booking_reference: "AUTO-ACK-ALREADY-SENT",
      created_at: "2026-08-30T09:50:00.000Z",
      driver_id: 17,
      expires_at: "2026-09-01T10:00:00.000Z",
      id: remindedLinkId,
      issued_at: "2026-08-30T09:50:00.000Z",
      link_status: "active",
      revoked_at: null,
      safe_link_context: { native_handoff_ciphertext: "v1.opaque.server.only" },
    },
    {
      booking_reference: "AUTO-ACK-RECENT",
      created_at: "2026-08-30T10:20:00.000Z",
      driver_id: 17,
      expires_at: "2026-09-01T10:00:00.000Z",
      id: recentLinkId,
      issued_at: "2026-08-30T10:20:00.000Z",
      link_status: "active",
      revoked_at: null,
      safe_link_context: { native_handoff_ciphertext: "v1.opaque.server.only" },
    },
    {
      booking_reference: "AUTO-ACK-ACKNOWLEDGED",
      created_at: "2026-08-30T09:45:00.000Z",
      driver_id: 17,
      expires_at: "2026-09-01T10:00:00.000Z",
      id: acknowledgedLinkId,
      issued_at: "2026-08-30T09:45:00.000Z",
      link_status: "active",
      revoked_at: null,
      safe_link_context: {
        driver_acknowledged_at: "2026-08-30T10:05:00.000Z",
        native_handoff_ciphertext: "v1.opaque.server.only",
      },
    },
  ];
  const outbox = [
    {
      driver_job_link_id: remindedLinkId,
      workflow_area: "pending_driver_ack_reminder",
    },
  ];
  return {
    from(table) { return new QueryBuilder(this, table); },
    resolve(query) {
      if (query.table === "driver_job_links") {
        return { data: linkError ? null : links, error: linkError };
      }
      if (query.table === "customer_driver_app_notification_outbox") {
        return { data: outboxError ? null : outbox, error: outboxError };
      }
      throw new Error(`Unexpected table ${query.table}`);
    },
  };
}

try {
  const helper = createRequire(import.meta.url)(helperPath);
  const calls = [];
  const result = await helper.runDriverAckAutoRemindersWithClient(createClient(), {
    now,
    sendReminder: async (_client, input, actor, options) => {
      calls.push({ actor, input, options });
      return {
        data: {
          next_available_at: "2026-08-30T10:45:00.000Z",
          provider_accepted: true,
          reminder_count: 1,
          version: "admin-driver-ack-reminder-v1",
        },
        ok: true,
        status: 200,
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.candidate_count, 2);
  assert.equal(result.eligible_count, 1);
  assert.equal(result.reminder_sent_count, 1);
  assert.equal(result.skipped_count, 1);
  assert.equal(result.failure_count, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.driver_job_link_id, firstLinkId);
  assert.equal(calls[0].input.booking_reference, "AUTO-ACK-FIRST");
  assert.equal(calls[0].actor.actor_role, "system");
  assert.equal(calls[0].actor.source_surface, "system");
  assert.equal(calls[0].options.trigger, "automatic_first_reminder");

  const readFailure = await helper.runDriverAckAutoRemindersWithClient(
    createClient({ linkError: { message: "blocked" } }),
    { now, sendReminder: async () => { throw new Error("must not send"); } },
  );
  assert.equal(readFailure.ok, false);
  assert.equal(readFailure.reason, "read_failed");

  const outboxFailure = await helper.runDriverAckAutoRemindersWithClient(
    createClient({ outboxError: { message: "blocked" } }),
    { now, sendReminder: async () => { throw new Error("must not send"); } },
  );
  assert.equal(outboxFailure.ok, false);
  assert.equal(outboxFailure.reason, "read_failed");

  const sendFailure = await helper.runDriverAckAutoRemindersWithClient(createClient(), {
    now,
    sendReminder: async () => ({
      error: "provider failed safely",
      ok: false,
      reason: "provider_failed",
      status: 500,
    }),
  });
  assert.equal(sendFailure.ok, false);
  assert.equal(sendFailure.reason, "send_failed");
  assert.equal(sendFailure.failure_count, 1);

  process.env.CRON_SECRET = "exact-test-cron-secret";
  const route = createRequire(import.meta.url)(routePath);
  const routeRunner = createRequire(import.meta.url)(routeRunnerPath);
  const unauthorized = await route.GET(
    new Request("http://localhost/api/cron/driver-ack-auto-reminders"),
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(routeRunner.__calls(), 0);

  const parameterized = await route.GET(
    new Request("http://localhost/api/cron/driver-ack-auto-reminders?force=true", {
      headers: { authorization: "Bearer exact-test-cron-secret" },
    }),
  );
  assert.equal(parameterized.status, 400);
  assert.equal(routeRunner.__calls(), 0);

  const authorized = await route.GET(
    new Request("http://localhost/api/cron/driver-ack-auto-reminders", {
      headers: { authorization: "Bearer exact-test-cron-secret" },
    }),
  );
  assert.equal(authorized.status, 200);
  assert.equal((await authorized.json()).result.reminder_sent_count, 1);
  assert.equal(routeRunner.__calls(), 1);

  routeRunner.__setResult({
    candidate_count: 1,
    eligible_count: 1,
    failure_count: 1,
    ok: false,
    reason: "send_failed",
    reminder_sent_count: 0,
    skipped_count: 0,
    version: "driver-ack-auto-reminder-v1",
  });
  const failedRun = await route.GET(
    new Request("http://localhost/api/cron/driver-ack-auto-reminders", {
      headers: { authorization: "Bearer exact-test-cron-secret" },
    }),
  );
  assert.equal(failedRun.status, 503);

  console.log("Driver ACK automatic first-reminder runtime passed.");
} finally {
  if (originalCronSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalCronSecret;
  }
  await rm(tempDir, { force: true, recursive: true });
}
