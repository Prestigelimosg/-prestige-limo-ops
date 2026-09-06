import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const sourceFiles = [
  "lib/driver-job-status-workflow.ts",
  "lib/driver-job-link.ts",
  "lib/driver-device-push-notification.ts",
  "lib/native-push-badge-count.ts",
  "lib/driver-portal-session.ts",
  "lib/driver-portal-jobs.ts",
];
const sessionSecret = "driver-portal-contract-secret-that-is-long-enough-2026";
const env = { PRESTIGE_DRIVER_PORTAL_SESSION_SECRET: sessionSecret };
const now = new Date("2026-07-22T08:00:00.000Z");
const validExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function writeHarnessFile(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputSource = transpileTypescript(await readFile(sourcePath, "utf8"), sourcePath);
  const jsPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const tsPath = path.join(tempDir, relativePath);
  await mkdir(path.dirname(jsPath), { recursive: true });
  await writeFile(jsPath, outputSource);
  await writeFile(tsPath, outputSource);
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-driver-portal-contract-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const webPushPath = path.join(tempDir, "node_modules/web-push/index.js");
  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(webPushPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    webPushPath,
    "module.exports = { sendNotification: async () => undefined, setVapidDetails: () => undefined };",
  );
  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }
  const require = createRequire(import.meta.url);
  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    jobs: require(path.join(tempDir, "lib/driver-portal-jobs.js")),
    link: require(path.join(tempDir, "lib/driver-job-link.js")),
    session: require(path.join(tempDir, "lib/driver-portal-session.js")),
  };
}

class ReadQuery {
  constructor(table, rows) {
    this.table = table;
    this.rows = rows;
    this.filters = [];
    this.inFilters = [];
    this.isFilters = [];
    this.limitValue = null;
    this.orExpression = "";
    this.rangeValue = null;
    this.requestExactCount = false;
  }

  select(_columns, options = {}) { this.requestExactCount = options.count === "exact"; return this; }
  eq(column, value) { this.filters.push({ column, value }); return this; }
  in(column, values) { this.inFilters.push({ column, values }); return this; }
  is(column, value) { this.isFilters.push({ column, value }); return this; }
  or(expression) { this.orExpression = expression; return this; }
  order() { return this; }
  limit(value) { this.limitValue = value; return this; }
  range(from, to) { this.rangeValue = { from, to }; return this; }

  evaluate() {
    let rows = this.rows.filter((row) =>
      this.filters.every((filter) => row[filter.column] === filter.value) &&
      this.inFilters.every((filter) => filter.values.includes(row[filter.column])) &&
      this.isFilters.every((filter) => row[filter.column] === filter.value)
    );
    if (this.orExpression) {
      const match = this.orExpression.match(
        /^driver_job_link_id\.in\.\(([0-9a-f,-]+)\),and\(driver_job_link_id\.is\.null,workflow_area\.eq\.customer_driver_quick_replies,actor_role\.eq\.customer\)$/,
      );
      assert.ok(match, `Unexpected Driver Portal alert filter: ${this.orExpression}`);
      const currentLinkIds = match[1].split(",");
      rows = rows.filter((row) =>
        currentLinkIds.includes(row.driver_job_link_id) ||
        (row.driver_job_link_id === null &&
          row.workflow_area === "customer_driver_quick_replies" &&
          row.actor_role === "customer")
      );
    }
    if (this.table === "driver_job_links") {
      rows = [...rows].sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
    }
    if (this.table === "driver_job_status_events") {
      rows = [...rows].sort((left, right) => String(right.occurred_at).localeCompare(String(left.occurred_at)));
    }
    if (this.table === "customer_driver_app_notification_outbox") {
      rows = [...rows].sort((left, right) =>
        String(right.created_at).localeCompare(String(left.created_at)) ||
        String(right.id).localeCompare(String(left.id))
      );
    }
    const count = rows.length;
    if (this.limitValue !== null) rows = rows.slice(0, this.limitValue);
    if (this.rangeValue) rows = rows.slice(this.rangeValue.from, this.rangeValue.to + 1);
    return { count, rows };
  }

  maybeSingle() {
    const { rows } = this.evaluate();
    return Promise.resolve({ data: rows.length === 1 ? rows[0] : null, error: rows.length > 1 ? {} : null });
  }

  then(resolve, reject) {
    const result = this.evaluate();
    return Promise.resolve({
      count: this.requestExactCount ? result.count : null,
      data: result.rows,
      error: null,
    }).then(resolve, reject);
  }
}

function createClient(tables) {
  return {
    from(table) {
      return new ReadQuery(table, tables[table] || []);
    },
  };
}

function cookiePair(setCookie) {
  return setCookie.split(";", 1)[0];
}

const harness = await loadHarness();
try {
  const tokenA = "driver-portal-token-a";
  const tokenB = "driver-portal-token-b";
  const tables = {
    bookings: [
      {
        admin_internal_status: "assigned",
        booking_reference: "PORTAL-A",
        cancellation_review_status: null,
        customer_facing_status: "confirmed",
        driver_id: 7,
        dropoff_location: "Changi Airport",
        flight_no: "SQ123",
        passenger_name: "Safe Passenger",
        pickup_at: "2026-07-23T02:00:00.000Z",
        pickup_location: "Raffles Hotel",
        public_booking_reference: "10850",
        route_summary: "Raffles Hotel > Changi Airport",
        service_type: "DEP",
        status: "assigned",
      },
      {
        admin_internal_status: "assigned",
        booking_reference: "PORTAL-AMENDMENT-PENDING",
        cancellation_review_status: null,
        customer_facing_status: "confirmed",
        driver_id: 7,
        pickup_at: "2026-07-23T05:00:00.000Z",
        pickup_location: "Pending Amendment Pickup",
        status: "assigned",
      },
      {
        admin_internal_status: "assigned",
        booking_reference: "PORTAL-COMPLETED",
        cancellation_review_status: null,
        customer_facing_status: "confirmed",
        driver_id: 7,
        pickup_at: "2026-07-22T03:00:00.000Z",
        pickup_location: "Completed Pickup",
        status: "assigned",
      },
      {
        admin_internal_status: "assigned",
        booking_reference: "PORTAL-B",
        cancellation_review_status: null,
        customer_facing_status: "confirmed",
        driver_id: 8,
        pickup_at: "2026-07-23T04:00:00.000Z",
        pickup_location: "Wrong Driver Pickup",
        status: "assigned",
      },
    ],
    driver_job_links: [
      {
        booking_reference: "PORTAL-A",
        created_at: "2026-07-22T07:00:00.000Z",
        driver_id: 7,
        expires_at: validExpiry,
        id: "11111111-1111-4111-8111-111111111111",
        link_status: "active",
        revoked_at: null,
        safe_link_context: { driver_acknowledged_at: "2026-07-22T07:05:00.000Z", driver_job_payload: {} },
        token_hash: harness.link.hashDriverJobLinkToken(tokenA),
      },
      {
        booking_reference: "PORTAL-A",
        created_at: "2026-07-21T07:00:00.000Z",
        driver_id: 7,
        expires_at: validExpiry,
        id: "22222222-2222-4222-8222-222222222222",
        link_status: "active",
        revoked_at: null,
        safe_link_context: { driver_acknowledged_at: "2026-07-21T07:05:00.000Z" },
        token_hash: harness.link.hashDriverJobLinkToken("older-token-a"),
      },
      {
        booking_reference: "PORTAL-AMENDMENT-PENDING",
        created_at: "2026-07-22T07:55:00.000Z",
        driver_id: 7,
        expires_at: validExpiry,
        id: "55555555-5555-4555-8555-555555555555",
        link_status: "active",
        revoked_at: null,
        safe_link_context: {},
        token_hash: harness.link.hashDriverJobLinkToken("unacknowledged-amendment-token"),
      },
      {
        booking_reference: "PORTAL-AMENDMENT-PENDING",
        created_at: "2026-07-22T05:55:00.000Z",
        driver_id: 7,
        expires_at: validExpiry,
        id: "66666666-6666-4666-8666-666666666666",
        link_status: "active",
        revoked_at: null,
        safe_link_context: { driver_acknowledged_at: "2026-07-22T06:00:00.000Z" },
        token_hash: harness.link.hashDriverJobLinkToken("older-acknowledged-amendment-token"),
      },
      {
        booking_reference: "PORTAL-COMPLETED",
        created_at: "2026-07-22T06:00:00.000Z",
        driver_id: 7,
        expires_at: validExpiry,
        id: "33333333-3333-4333-8333-333333333333",
        link_status: "active",
        revoked_at: null,
        safe_link_context: { driver_acknowledged_at: "2026-07-22T06:05:00.000Z" },
        token_hash: harness.link.hashDriverJobLinkToken("completed-token"),
      },
      {
        booking_reference: "PORTAL-B",
        created_at: "2026-07-22T07:30:00.000Z",
        driver_id: 8,
        expires_at: validExpiry,
        id: "44444444-4444-4444-8444-444444444444",
        link_status: "active",
        revoked_at: null,
        safe_link_context: { driver_acknowledged_at: "2026-07-22T07:35:00.000Z" },
        token_hash: harness.link.hashDriverJobLinkToken(tokenB),
      },
    ],
    driver_job_status_events: [
      { booking_reference: "PORTAL-A", occurred_at: "2026-07-22T07:45:00.000Z", status_value: "ots" },
      { booking_reference: "PORTAL-A", occurred_at: "2026-07-22T07:15:00.000Z", status_value: "driver_otw" },
      { booking_reference: "PORTAL-COMPLETED", occurred_at: "2026-07-22T07:55:00.000Z", status_value: "needs_call" },
      { booking_reference: "PORTAL-COMPLETED", occurred_at: "2026-07-22T07:50:00.000Z", status_value: "completed" },
    ],
    customer_driver_app_notification_outbox: [
      ...Array.from({ length: 122 }, (_, index) => ({
        actor_role: "admin",
        booking_reference: "PORTAL-A",
        created_at: new Date(Date.parse("2026-07-22T07:59:00.000Z") - index * 1000).toISOString(),
        delivery_surface: "driver_app",
        driver_job_link_id: "11111111-1111-4111-8111-111111111111",
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`,
        notification_status: "queued",
        notification_type: "trip_update",
        priority: index === 0 ? "high" : "normal",
        safe_message: `Safe dispatch update ${index + 1}`,
        safe_title: "Message from dispatch",
        workflow_area: "admin_driver_job_messages",
      })),
      {
        actor_role: "customer",
        booking_reference: "PORTAL-A",
        created_at: "2026-07-22T07:58:30.000Z",
        delivery_surface: "driver_app",
        driver_job_link_id: null,
        id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001",
        notification_status: "queued",
        notification_type: "trip_update",
        priority: "normal",
        safe_message: "I am at the lobby.",
        safe_title: "Passenger reply",
        workflow_area: "customer_driver_quick_replies",
      },
      {
        actor_role: "admin",
        booking_reference: "PORTAL-A",
        created_at: "2026-07-22T08:00:00.000Z",
        delivery_surface: "driver_app",
        driver_job_link_id: "22222222-2222-4222-8222-222222222222",
        id: "cccccccc-cccc-4ccc-8ccc-000000000001",
        notification_status: "queued",
        notification_type: "trip_update",
        priority: "urgent",
        safe_message: "Stale-link update",
        safe_title: "Must stay hidden",
        workflow_area: "admin_driver_job_messages",
      },
      {
        actor_role: "admin",
        booking_reference: "PORTAL-B",
        created_at: "2026-07-22T08:00:00.000Z",
        delivery_surface: "driver_app",
        driver_job_link_id: "44444444-4444-4444-8444-444444444444",
        id: "dddddddd-dddd-4ddd-8ddd-000000000001",
        notification_status: "queued",
        notification_type: "trip_update",
        priority: "urgent",
        safe_message: "Other-driver update",
        safe_title: "Must stay hidden",
        workflow_area: "admin_driver_job_messages",
      },
      {
        actor_role: "admin",
        booking_reference: "PORTAL-COMPLETED",
        created_at: "2026-07-22T08:00:00.000Z",
        delivery_surface: "driver_app",
        driver_job_link_id: "33333333-3333-4333-8333-333333333333",
        id: "eeeeeeee-eeee-4eee-8eee-000000000001",
        notification_status: "queued",
        notification_type: "trip_update",
        priority: "urgent",
        safe_message: "Completed-job update",
        safe_title: "Must stay hidden",
        workflow_area: "admin_driver_job_messages",
      },
    ],
  };
  const client = createClient(tables);

  const enrolled = await harness.session.issueDriverPortalSessionForAcknowledgedToken({
    client,
    cookieHeader: null,
    env,
    now,
    token: tokenA,
  });
  assert.equal(enrolled.ok, true);
  assert.match(enrolled.jobKey, /^[0-9a-f]{64}$/);
  for (const attribute of ["Path=/", "Max-Age=2592000", "HttpOnly", "Secure", "SameSite=Lax", "Priority=High"]) {
    assert.equal(enrolled.cookie.includes(attribute), true, `Driver Portal cookie must include ${attribute}.`);
  }
  assert.equal(enrolled.cookie.includes(tokenA), false, "Session cookie must not expose the private job token.");
  assert.equal(enrolled.cookie.includes("driver_id"), false, "Session cookie must keep the internal driver ID opaque.");

  const resolved = harness.session.resolveDriverPortalSession(cookiePair(enrolled.cookie), { env, now });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.claims.driverId, 7);
  assert.equal(
    harness.session.resolveDriverPortalSession(`${cookiePair(enrolled.cookie)}tampered`, { env, now }).ok,
    false,
    "Tampered Driver Portal sessions must fail closed.",
  );

  const accountId = "77777777-7777-4777-8777-777777777777";
  const deviceIdHash = "a".repeat(64);
  const accountCookie = harness.session.issueDriverPortalAccountSession({
    accountId,
    deviceIdHash,
    driverId: 7,
    env,
    now,
  });
  assert.equal(typeof accountCookie, "string");
  const accountSession = harness.session.resolveDriverPortalSession(cookiePair(accountCookie), { env, now });
  assert.equal(accountSession.ok, true);
  assert.deepEqual(accountSession.claims, {
    accountId,
    deviceIdHash,
    driverId: 7,
    expiresAt: now.getTime() + 30 * 24 * 60 * 60 * 1000,
    issuedAt: now.getTime(),
  });
  assert.match(harness.session.clearDriverPortalSessionCookie(), /Max-Age=0/);

  const accountBackedEnrollment = await harness.session.issueDriverPortalSessionForAcknowledgedToken({
    client,
    cookieHeader: cookiePair(accountCookie),
    env,
    now,
    token: tokenA,
  });
  assert.equal(accountBackedEnrollment.ok, true);
  const preservedAccountSession = harness.session.resolveDriverPortalSession(
    cookiePair(accountBackedEnrollment.cookie),
    { env, now },
  );
  assert.equal(preservedAccountSession.ok, true);
  assert.deepEqual(
    preservedAccountSession.claims,
    accountSession.claims,
    "Acknowledging a job while signed in must preserve the verified Driver account and device session.",
  );

  const wrongDriverEnrollment = await harness.session.issueDriverPortalSessionForAcknowledgedToken({
    client,
    cookieHeader: cookiePair(enrolled.cookie),
    env,
    now,
    token: tokenB,
  });
  assert.deepEqual(wrongDriverEnrollment, {
    cookie: null,
    jobKey: null,
    ok: false,
    reason: "driver_mismatch",
  });

  const jobs = await harness.jobs.loadDriverPortalJobs({
    client,
    driverId: 7,
    includeAlerts: true,
    now,
  });
  assert.equal(jobs.ok, true);
  assert.equal(jobs.jobs.length, 1, "Only one newest non-terminal exact-driver job may appear.");
  assert.equal(jobs.jobs[0].payload.reference, "10850");
  assert.equal(
    jobs.jobs[0].payload.pickupLocation,
    "Raffles Hotel",
    "Driver Portal must preserve the saved booking pickup location.",
  );
  assert.equal(
    jobs.jobs[0].payload.dropoffLocation,
    "Changi Airport",
    "Driver Portal must preserve the saved booking drop-off location.",
  );
  assert.equal(jobs.jobs[0].state, "ots");
  assert.equal(jobs.jobs[0].stateLabel, "On site");
  assert.equal(jobs.jobs[0].jobKey, enrolled.jobKey);
  assert.equal(jobs.alertsAvailable, true);
  assert.equal(jobs.alertCount, 123, "Exact current-job alert count must include deterministic pages beyond the first 100 rows.");
  assert.equal(jobs.alerts.length, 1, "Telegram-style alert rows must group the exact count by current job.");
  assert.equal(jobs.alerts[0].jobKey, enrolled.jobKey);
  assert.equal(jobs.alerts[0].latestTitle, "Message from dispatch");
  assert.equal(jobs.alerts[0].updateCount, 123);
  assert.equal(jobs.alerts.some((alert) => alert.latestMessage.includes("Stale-link")), false);
  assert.equal(jobs.alerts.some((alert) => alert.latestMessage.includes("Other-driver")), false);
  assert.equal(jobs.alerts.some((alert) => alert.latestMessage.includes("Completed-job")), false);
  const output = JSON.stringify(jobs);
  for (const forbidden of ["customer_price", "driver_payout", "invoice", "payment", "paynow", "internal_note", "token_hash", tokenA]) {
    assert.equal(output.toLowerCase().includes(forbidden.toLowerCase()), false, `Driver Portal output leaked ${forbidden}.`);
  }

  const wrongDriverJobs = await harness.jobs.loadDriverPortalJobs({ client, driverId: 999, now });
  assert.equal(wrongDriverJobs.ok, true);
  assert.deepEqual(wrongDriverJobs.jobs, []);

  const portalSource = await readFile(path.join(process.cwd(), "app/driver-portal/page.tsx"), "utf8");
  assert.match(portalSource, /data-driver-notification-centre-trigger="true"/);
  assert.match(portalSource, /data-driver-notification-centre="true"/);
  assert.match(portalSource, /data-driver-notification-purpose="available-jobs"/);
  assert.match(portalSource, /data-driver-notification-purpose="job-update"/);
  assert.match(portalSource, /scrollIntoView\(\{[\s\S]*?behavior: "smooth",[\s\S]*?block: "start",?[\s\S]*?\}\)/);
  assert.doesNotMatch(portalSource, /customer_price|driver_payout|invoice|payment|paynow/i);

  console.log("Driver Portal session and exact-driver jobs guard passed.");
} finally {
  await harness.cleanup();
}
