import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  categorizeReadonlyFailure,
  columnContracts,
  embeddedLoadContract,
  parseEnvFile,
  runReadonlyDiagnostic,
  tableNames,
  validateEnv,
} from "./check-admin-booking-staging-readonly-contract.mjs";

const runnerPath = path.join(process.cwd(), "scripts/check-admin-booking-staging-readonly-contract.mjs");
const runner = await readFile(runnerPath, "utf8");
const secretSentinel = "SUPABASE_SERVICE_ROLE_KEY_SENTINEL_DO_NOT_LEAK";
const tokenSentinel = "DISPATCHER_SESSION_TOKEN_SENTINEL_DO_NOT_LEAK";
const urlSentinel = "readonly-contract-stage-ref";
const forbiddenStage390Approval = [
  "PRESTIGE_ADMIN_BOOKING_STAGING_WRITE_VERIFICATION_APPROVED",
  "stage-4a-390-william-approved",
].join("=");

class MockReadonlyQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.columns = "";
    this.filters = [];
    this.head = false;
  }

  select(columns, options = {}) {
    this.columns = columns;
    this.head = options.head === true;
    this.client.operations.push({
      action: "select",
      columns,
      head: this.head,
      table: this.table,
    });

    return this;
  }

  limit(count) {
    this.client.operations.push({
      action: "limit",
      count,
      table: this.table,
    });

    return this;
  }

  eq(column) {
    this.filters.push(column);
    this.client.operations.push({
      action: "eq",
      column,
      table: this.table,
    });

    return this;
  }

  then(onFulfilled, onRejected) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  execute() {
    return this.client.resultFor(this.table, this.columns);
  }
}

class MockReadonlyClient {
  constructor(failures = {}) {
    this.failures = failures;
    this.operations = [];
  }

  from(table) {
    assert.ok(tableNames.includes(table), `Unexpected diagnostic table: ${table}`);

    return new MockReadonlyQuery(this, table);
  }

  resultFor(table, columns) {
    const failure = Object.entries(this.failures).find(([signature]) => {
      if (!signature.includes(":")) {
        return columns.includes(signature);
      }

      const [expectedTable, expectedColumns] = signature.split(":", 2);

      return table === expectedTable && columns.includes(expectedColumns);
    });

    if (failure) {
      return {
        count: 0,
        data: null,
        error: failure[1],
      };
    }

    return {
      count: 0,
      data: null,
      error: null,
    };
  }
}

function assertNoUnsafeOutput(value, label) {
  const text = JSON.stringify(value);

  assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY_SENTINEL|DISPATCHER_SESSION_TOKEN_SENTINEL/);
  assert.doesNotMatch(text, /readonly-contract-stage-ref/);
  assert.doesNotMatch(text, /sql|stack|service_role|server_secret/i, label);
}

for (const forbiddenCall of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
  assert.doesNotMatch(runner, new RegExp(forbiddenCall.replace(/[().]/g, "\\$&")));
}

assert.doesNotMatch(
  runner,
  new RegExp(forbiddenStage390Approval),
);
assert.ok(columnContracts.length >= 6);
assert.match(runner, /readonlyFetchTimeoutMs = 15_000/);
assert.match(runner, /AbortController/);
assert.ok(embeddedLoadContract.select.includes("booking_route_points(point_type, sequence, location, notes)"));
assert.ok(embeddedLoadContract.select.includes("booking_service_items(item_type, quantity, notes)"));

const parsedEnv = parseEnvFile(
  [
    ["SUPABASE_URL", urlSentinel].join("="),
    ["SUPABASE_SERVICE_ROLE_KEY", secretSentinel].join("="),
    "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED=true",
    "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE=server-session-token",
    "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE=admin",
    ["PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN", tokenSentinel].join("="),
  ].join("\n"),
);
const envValidation = validateEnv(parsedEnv);

assert.equal(envValidation.ok, true);
assert.equal(validateEnv({}).category, "env_missing");
assert.equal(
  validateEnv({
    ...parsedEnv,
    SUPABASE_SERVICE_ROLE_KEY: "YOUR_SERVICE_ROLE",
  }).category,
  "env_placeholder",
);
assert.equal(
  validateEnv({
    ...parsedEnv,
    SUPABASE_URL: "production-ref",
  }).category,
  "production_refused",
);

assert.equal(categorizeReadonlyFailure({ code: "42P01" }), "table_unreachable");
assert.equal(categorizeReadonlyFailure({ code: "42703" }), "column_missing");
assert.equal(categorizeReadonlyFailure({ code: "42501" }), "permission_or_rls_denied");
assert.equal(categorizeReadonlyFailure({ status: 401 }), "auth_or_key_rejected");

const fallbackShapeClient = new MockReadonlyClient({
  "customers: status": { code: "42703" },
  "customer_contacts:role_label, is_primary": { code: "42703" },
});
const fallbackShapeResult = await runReadonlyDiagnostic(fallbackShapeClient);

assert.equal(fallbackShapeResult.ok, true);
assert.equal(
  fallbackShapeResult.checks.find((item) => item.name === "columns:customers_write_shape").variant,
  2,
);
assert.equal(
  fallbackShapeResult.checks.find((item) => item.name === "columns:customer_contacts_write_shape").variant,
  2,
);
assert.equal(
  fallbackShapeResult.checks.find((item) => item.name === "prior_reference:count_only").category,
  "no_partial_rows_found",
);
assertNoUnsafeOutput(fallbackShapeResult, "fallback-shape diagnostic output should stay sanitized");

const failingClient = new MockReadonlyClient({
  "bookings:pickup_at": { code: "42703" },
});
const failingResult = await runReadonlyDiagnostic(failingClient);

assert.equal(failingResult.ok, false);
assert.ok(failingResult.categories.includes("column_missing"));
assert.ok(failingResult.failedCheckNames.includes("columns:bookings_current_write_load_shape"));
assertNoUnsafeOutput(failingResult, "failing diagnostic output should stay sanitized");

for (const operation of [...fallbackShapeClient.operations, ...failingClient.operations]) {
  assert.ok(["eq", "limit", "select"].includes(operation.action));
}

console.log("Admin booking staging read-only diagnostic contract tests passed.");
