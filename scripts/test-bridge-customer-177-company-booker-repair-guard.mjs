import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const migrationPath =
  "supabase/migrations/20260901230229_bridge_customer_177_company_booker_account.sql";
const guardPath = "scripts/test-bridge-customer-177-company-booker-repair-guard.mjs";

const [migration, ledger, suite] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
]);

for (const fragment of [
  "set transaction isolation level serializable",
  "bridge_customer_177_precondition_drift",
  "bridge_customer_177_dependency_drift",
  "bridge_customer_177_affected_row_count_mismatch",
  "bridge_customer_177_protected_row_drift",
  "bridge_customer_177_postcondition_failed",
  "where b.id = 20",
  "and b.company_id = 45",
  "and b.customer_id is null",
  "customer_id = 177",
  "customer_rates = t.customer_rates",
  "customer_rates = '{\"DEP\":{\"S\":170},\"DSP\":{\"S\":160},\"MNG\":{\"S\":180},\"TRF\":{\"S\":150}}'::jsonb",
]) {
  assert.ok(migration.includes(fragment), `Missing Customer177 repair contract: ${fragment}`);
}

const persistentUpdates = [...migration.matchAll(/update\s+public\.([a-z_]+)/gi)].map(
  ([, table]) => table,
);
assert.deepEqual(persistentUpdates, ["bookers"]);
assert.doesNotMatch(migration, /delete\s+from\s+public\./i);
assert.doesNotMatch(migration, /insert\s+into\s+public\./i);
assert.doesNotMatch(migration, /alter\s+table\s+public\./i);
assert.doesNotMatch(migration, /update\s+public\.(customers|companies|travelers|bookings)/i);
assert.doesNotMatch(migration, /update\s+public\.(customer_invoice_records|monthly_billing_draft_plans|monthly_invoice_drafts|customer_access_accounts)/i);

assert.ok(ledger.includes("Bridge Data Centres Customer177 Company + Booker Production Repair"));
assert.ok(ledger.includes("Booker `20` / Company `45` / Customer `177`"));
assert.ok(ledger.includes("Traveller `33`"));
assert.ok(ledger.includes("Traveller `34`"));
assert.ok(ledger.includes("booking `10873` / row `195`"));
assert.ok(ledger.includes(guardPath));
assert.ok(suite.includes(guardPath));

const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "prestige-bridge-177-rate-"));

try {
  for (const moduleName of ["hourly-billing", "pricing", "customer-dsp-invoice-review"]) {
    const source = await readFile(`lib/${moduleName}.ts`, "utf8");
    await writeFile(
      path.join(runtimeDir, `${moduleName}.js`),
      ts.transpileModule(source, {
        compilerOptions: {
          esModuleInterop: true,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    );
  }

  const require = createRequire(import.meta.url);
  const { calculateCustomerInvoiceRateReview } = require(
    path.join(runtimeDir, "customer-dsp-invoice-review.js"),
  );
  const input = {
    actualMinutes: 585,
    billingEndedAt: "2026-08-06T19:15:00+08:00",
    billingStartedAt: "2026-08-06T09:30:00+08:00",
    bookingType: "DSP",
    bookerId: 20,
    childSeatCount: 0,
    companyId: 45,
    customerId: 177,
    extraStopCount: 0,
    pickupAt: "2026-08-06T02:00:00+00:00",
    travelerId: 33,
    vehicleType: "S",
  };
  const customerRates = {
    DEP: { S: 170 },
    DSP: { S: 160 },
    MNG: { S: 180 },
    TRF: { S: 150 },
  };
  const commonSetup = {
    companies: [{ customer_rates: {}, id: 45 }],
    settings: {
      child_seat_customer_surcharge: 15,
      customer_rates: { DSP: { S: 65 } },
      extra_stop_surcharge: 0,
      midnight_surcharge: 15,
    },
    travelers: [{ company_id: 45, customer_rates: customerRates, id: 33 }],
  };
  const before = calculateCustomerInvoiceRateReview(
    { ...input, bookerId: 20, customerId: null },
    commonSetup,
  );
  const after = calculateCustomerInvoiceRateReview(input, {
    ...commonSetup,
    bookers: [
      { company_id: 45, customer_id: 177, customer_rates: customerRates, id: 20 },
    ],
  });

  assert.equal(before?.customerRateSource, "legacy_traveler");
  assert.equal(after?.customerRateSource, "account");
  assert.equal(before?.rateCents, 16000);
  assert.equal(after?.rateCents, 16000);
  assert.equal(before?.amountCents, after?.amountCents);
} finally {
  await rm(runtimeDir, { recursive: true, force: true });
}

console.log("Bridge Customer177 Company + Booker repair guard passed.");
