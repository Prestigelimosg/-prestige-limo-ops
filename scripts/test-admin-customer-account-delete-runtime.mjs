import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-delete-"));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class Query {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.filters = [];
    this.action = "select";
    this.countOptions = null;
    this.updatePayload = null;
  }

  delete() { this.action = "delete"; return this; }
  eq(column, value) { this.filters.push({ column, value }); return this; }
  limit() { return this; }
  select(_columns, options) { this.countOptions = options || null; return this; }
  update(payload) { this.action = "update"; this.updatePayload = payload; return this; }
  then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject); }

  execute() {
    const rows = this.client.tables[this.table] || [];
    const matches = rows.filter((row) => this.filters.every(({ column, value }) => row[column] === value));

    this.client.operations.push({
      action: this.action,
      filters: clone(this.filters),
      table: this.table,
      updatePayload: clone(this.updatePayload),
    });

    if (this.countOptions?.count === "exact" && this.countOptions?.head) {
      return { count: matches.length, data: null, error: null };
    }

    if (this.action === "update") {
      for (const row of matches) Object.assign(row, this.updatePayload);
      return { data: clone(matches), error: null };
    }

    if (this.action === "delete") {
      this.client.tables[this.table] = rows.filter((row) => !matches.includes(row));
      return { data: clone(matches), error: null };
    }

    return { data: clone(matches), error: null };
  }
}

class Client {
  constructor(seed) {
    this.operations = [];
    this.tables = clone(seed);
  }

  from(table) { return new Query(this, table); }
}

try {
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");
  const helperPath = path.join(tempDir, "lib/admin-customer-account-delete.js");
  const source = await readFile(
    new URL("../lib/admin-customer-account-delete.ts", import.meta.url),
    "utf8",
  );

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await mkdir(path.dirname(helperPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(supabasePath, "module.exports = { createClient() { throw new Error('unexpected live client'); } };");
  await writeFile(
    helperPath,
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  );

  const require = createRequire(import.meta.url);
  const helper = require(helperPath);
  const actor = {
    actor_label: "Exact customer delete test admin",
    actor_role: "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  };
  const seed = {
    bookings: [{ customer_id: 11, id: 1 }],
    customer_access_accounts: [
      { account_status: "active", customer_account_reference: "11", id: "access-11" },
      { account_status: "active", customer_account_reference: "12", id: "access-12" },
    ],
    customer_contacts: [{ customer_id: 12, id: 1 }],
    customer_invoice_records: [],
    customers: [
      { account_status: "active", display_name: "Blocked Customer", id: 11, status: "active" },
      { account_status: "active", display_name: "Eligible Customer", id: 12, status: "active" },
    ],
    monthly_billing_draft_plans: [],
    monthly_invoice_drafts: [],
  };

  const blockedClient = new Client(seed);
  const blocked = await helper.inspectAdminCustomerAccountDeletion("11", actor, blockedClient);
  assert.equal(blocked.ok, true);
  assert.equal(blocked.data.eligible, false);
  assert.deepEqual(blocked.data.blockers, ["bookings"]);
  assert.equal(blockedClient.operations.some((operation) => operation.action !== "select"), false);

  const blockedDelete = await helper.deleteAdminCustomerAccount(
    { confirmation_name: "Blocked Customer", customer_id: "11" },
    actor,
    blockedClient,
  );
  assert.equal(blockedDelete.ok, false);
  assert.equal(blockedDelete.status, 409);
  assert.equal(blockedClient.tables.customers.length, 2);

  const eligibleClient = new Client(seed);
  const wrongName = await helper.deleteAdminCustomerAccount(
    { confirmation_name: "Wrong Customer", customer_id: "12" },
    actor,
    eligibleClient,
  );
  assert.equal(wrongName.ok, false);
  assert.equal(wrongName.status, 400);
  assert.equal(eligibleClient.tables.customer_access_accounts[1].account_status, "active");

  const deleted = await helper.deleteAdminCustomerAccount(
    { confirmation_name: "Eligible Customer", customer_id: "12" },
    actor,
    eligibleClient,
  );
  assert.equal(deleted.ok, true);
  assert.equal(deleted.data.customer.id, 12);
  assert.equal(eligibleClient.tables.customers.some((customer) => customer.id === 12), false);
  assert.equal(eligibleClient.tables.customer_access_accounts[1].account_status, "revoked");
  assert.deepEqual(
    eligibleClient.operations.filter((operation) => operation.action !== "select").map((operation) => operation.action),
    ["update", "delete"],
  );

  const deniedClient = new Client(seed);
  const denied = await helper.inspectAdminCustomerAccountDeletion(
    "12",
    { ...actor, actor_role: "local-dev-admin", boundary_mode: "local-dev-admin-surface" },
    deniedClient,
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 403);
  assert.equal(deniedClient.operations.length, 0);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Admin exact customer account delete runtime guard passed.");
