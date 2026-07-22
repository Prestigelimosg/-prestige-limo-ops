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
    this.limitValue = null;
  }

  select() { return this; }
  eq(column, value) { this.filters.push({ column, value }); return this; }
  in(column, values) { this.inFilters.push({ column, values }); return this; }
  order() { return this; }
  limit(value) { this.limitValue = value; return this; }

  evaluate() {
    let rows = this.rows.filter((row) =>
      this.filters.every((filter) => row[filter.column] === filter.value) &&
      this.inFilters.every((filter) => filter.values.includes(row[filter.column]))
    );
    if (this.table === "driver_job_links") {
      rows = [...rows].sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
    }
    if (this.table === "driver_job_status_events") {
      rows = [...rows].sort((left, right) => String(right.occurred_at).localeCompare(String(left.occurred_at)));
    }
    if (this.limitValue !== null) rows = rows.slice(0, this.limitValue);
    return rows;
  }

  maybeSingle() {
    const rows = this.evaluate();
    return Promise.resolve({ data: rows.length === 1 ? rows[0] : null, error: rows.length > 1 ? {} : null });
  }

  then(resolve, reject) {
    return Promise.resolve({ data: this.evaluate(), error: null }).then(resolve, reject);
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

  const jobs = await harness.jobs.loadDriverPortalJobs({ client, driverId: 7, now });
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
  const output = JSON.stringify(jobs);
  for (const forbidden of ["customer_price", "driver_payout", "invoice", "payment", "paynow", "internal_note", "token_hash", tokenA]) {
    assert.equal(output.toLowerCase().includes(forbidden.toLowerCase()), false, `Driver Portal output leaked ${forbidden}.`);
  }

  const wrongDriverJobs = await harness.jobs.loadDriverPortalJobs({ client, driverId: 999, now });
  assert.equal(wrongDriverJobs.ok, true);
  assert.deepEqual(wrongDriverJobs.jobs, []);

  console.log("Driver Portal session and exact-driver jobs guard passed.");
} finally {
  await harness.cleanup();
}
