import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const readerPath = path.join(process.cwd(), "lib/admin-saved-booking-read.ts");
const readerSource = await readFile(readerPath, "utf8");

assert.match(readerSource, /loadAdminSavedBookingsForExactAccountUpcoming/);
assert.match(readerSource, /\.eq\("customer_id", customerId\)[\s\S]*?\.eq\("company_id", companyId\)[\s\S]*?\.eq\("booker_id", bookerId\)[\s\S]*?\.gte\(pickupColumn/);
assert.match(readerSource, /\.limit\(maxExactAccountUpcomingRows \+ 1\)/);
assert.match(readerSource, /loadAdminSavedBookingsForExactSgtDate/);
assert.match(readerSource, /\.gte\(pickupColumn, bounds\.start\)[\s\S]*?\.lt\(pickupColumn, bounds\.end\)[\s\S]*?\.limit\(maxExactSgtDateRows \+ 1\)/);
assert.doesNotMatch(readerSource, /loadAdminSavedBookingsForExact(?:AccountUpcoming|SgtDate)[\s\S]*?\.(?:insert|update|delete|upsert|rpc)\(/);

class Query {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.filters = [];
    this.orders = [];
    this.resultLimit = null;
  }

  select(columns) {
    this.columns = columns;
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, type: "eq", value });
    return this;
  }

  gte(column, value) {
    this.filters.push({ column, type: "gte", value });
    return this;
  }

  lt(column, value) {
    this.filters.push({ column, type: "lt", value });
    return this;
  }

  order(column, options) {
    this.orders.push({ column, options });
    return this;
  }

  limit(value) {
    this.resultLimit = value;
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.client.resolve(this)).then(resolve, reject);
  }
}

class Client {
  constructor(rows) {
    this.rows = rows;
    this.calls = [];
  }

  from(table) {
    assert.equal(table, "bookings");
    const query = new Query(this, table);
    this.calls.push(query);
    return query;
  }

  resolve(query) {
    let rows = [...this.rows];
    for (const filter of query.filters) {
      if (filter.type === "eq") rows = rows.filter((row) => row[filter.column] === filter.value);
      if (filter.type === "gte") rows = rows.filter((row) => row[filter.column] >= filter.value);
      if (filter.type === "lt") rows = rows.filter((row) => row[filter.column] < filter.value);
    }
    for (const order of [...query.orders].reverse()) {
      rows.sort((left, right) => String(left[order.column] || "").localeCompare(String(right[order.column] || "")));
    }
    if (query.resultLimit !== null) rows = rows.slice(0, query.resultLimit);
    return { data: rows, error: null };
  }
}

const tempDir = await mkdtemp(path.join(process.cwd(), ".tmp-admin-ai-bounded-booking-read-"));

try {
  const readerTarget = path.join(tempDir, "lib/admin-saved-booking-read.js");
  const serverOnlyTarget = path.join(tempDir, "node_modules/server-only/index.js");
  const supabaseTarget = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");
  await mkdir(path.dirname(readerTarget), { recursive: true });
  await mkdir(path.dirname(serverOnlyTarget), { recursive: true });
  await mkdir(path.dirname(supabaseTarget), { recursive: true });
  await writeFile(serverOnlyTarget, "module.exports = {};\n");
  await writeFile(supabaseTarget, "exports.createClient = () => globalThis.__adminAiBoundedBookingReadClient;\n");
  await writeFile(readerTarget, ts.transpileModule(readerSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: readerPath,
  }).outputText);
  const require = createRequire(import.meta.url);
  const reader = require(readerTarget);
  const actor = {
    actor_label: "Guard Admin",
    actor_role: "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  };
  const rows = [
    { id: 1, booking_reference: "ADM-UPCOMING", public_booking_reference: "11901", customer_id: 197, company_id: 56, booker_id: 28, pickup_at: "2026-09-02T02:00:00.000Z" },
    { id: 2, booking_reference: "ADM-WRONG-COMPANY", customer_id: 197, company_id: 57, booker_id: 28, pickup_at: "2026-09-02T03:00:00.000Z" },
    { id: 3, booking_reference: "ADM-PAST", customer_id: 197, company_id: 56, booker_id: 28, pickup_at: "2026-08-31T23:59:59.000Z" },
    { id: 4, booking_reference: "ADM-DATE-START", customer_id: 198, company_id: 60, booker_id: 30, pickup_at: "2026-09-01T16:00:00.000Z" },
    { id: 5, booking_reference: "ADM-DATE-END", customer_id: 198, company_id: 60, booker_id: 30, pickup_at: "2026-09-02T16:00:00.000Z" },
  ];
  const client = new Client(rows);
  globalThis.__adminAiBoundedBookingReadClient = client;
  process.env.SUPABASE_URL = "https://guard.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "guard-service-role-key-long-enough";

  const upcoming = await reader.loadAdminSavedBookingsForExactAccountUpcoming({
    booker_id: 28,
    company_id: 56,
    customer_id: 197,
    pickup_at_or_after: "2026-09-01T00:00:00.000Z",
  }, actor);
  assert.equal(upcoming.ok, true);
  assert.deepEqual(upcoming.data.bookings.map((booking) => booking.booking_reference), ["ADM-UPCOMING"]);
  assert.deepEqual(client.calls[0].filters, [
    { column: "customer_id", type: "eq", value: 197 },
    { column: "company_id", type: "eq", value: 56 },
    { column: "booker_id", type: "eq", value: 28 },
    { column: "pickup_at", type: "gte", value: "2026-09-01T00:00:00.000Z" },
  ]);
  assert.equal(client.calls[0].resultLimit, 251);

  const exactDate = await reader.loadAdminSavedBookingsForExactSgtDate({ sgt_date: "2026-09-02" }, actor);
  assert.equal(exactDate.ok, true);
  assert.deepEqual(exactDate.data.bookings.map((booking) => booking.booking_reference), [
    "ADM-DATE-START",
    "ADM-UPCOMING",
    "ADM-WRONG-COMPANY",
  ]);
  assert.deepEqual(client.calls[1].filters, [
    { column: "pickup_at", type: "gte", value: "2026-09-01T16:00:00.000Z" },
    { column: "pickup_at", type: "lt", value: "2026-09-02T16:00:00.000Z" },
  ]);
  assert.equal(client.calls[1].resultLimit, 101);
  assert.equal((await reader.loadAdminSavedBookingsForExactSgtDate({ sgt_date: "2026-02-30" }, actor)).ok, false);
} finally {
  delete globalThis.__adminAiBoundedBookingReadClient;
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Admin Ask AI bounded saved-booking read guard passed.");
