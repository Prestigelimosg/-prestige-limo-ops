import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const guardScript = "scripts/test-customer-card-option-default-override-guard.mjs";
const migrationPath =
  "supabase/migrations/20260724010100_add_customer_card_option_defaults.sql";

const [migration, rateRead, adminPage, customerPage, invoiceReview, legacyRoute, ledger, suite] =
  await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile("lib/admin-rate-setup-read.ts", "utf8"),
    readFile("app/page.tsx", "utf8"),
    readFile("app/customers/page.tsx", "utf8"),
    readFile("lib/customer-dsp-invoice-review.ts", "utf8"),
    readFile("app/api/admin-legacy-data/rest/v1/[table]/route.ts", "utf8"),
    readFile("docs/current-implementation-ledger.md", "utf8"),
    readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
  ]);

function includes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

for (const fragment of [
  "alter table public.companies",
  "add column if not exists card_option_default_enabled boolean not null default false",
  "alter table public.travelers",
  "add column if not exists card_option_default_enabled boolean default null",
]) {
  includes(migration, fragment, `migration ${fragment}`);
}

for (const fragment of [
  "card_option_default_enabled: boolean",
  "card_option_default_enabled: boolean | null",
  "card_option_default_enabled",
  "booleanOrNull(record.card_option_default_enabled)",
]) {
  includes(rateRead, fragment, `rate setup read ${fragment}`);
}

for (const fragment of [
  "cardOptionDefaultEnabled: boolean;",
  "cardOptionDefaultTouched: boolean;",
  "card_option_default_enabled?: boolean | null;",
  'data-rate-card-option-default="true"',
  "Invoice card option on by default",
  "cardOptionDefaultEnabled: event.target.checked",
  "cardOptionDefaultTouched: true",
  "card_option_default_enabled",
  "cardOptionDefaultTouched",
  "Card default:",
]) {
  includes(adminPage, fragment, `Rates override ${fragment}`);
}

includes(legacyRoute, '"card_option_default_enabled"', "legacy exact-column allowlist");

for (const fragment of [
  "export function customerInvoiceCardOptionDefaultEnabled",
  "company.id === input.companyId",
  "traveler.id === input.travelerId",
  "traveler.company_id === input.companyId",
  "travelerRecord?.card_option_default_enabled",
  "companyRecord?.card_option_default_enabled",
]) {
  includes(invoiceReview, fragment, `invoice default resolver ${fragment}`);
}

for (const fragment of [
  "customerInvoiceCardOptionDefaultEnabled",
  "readAdminRateSetupForDspInvoice",
  "cardPaymentEnabled: cardOptionDefaultEnabled",
  "setCustomerInvoiceCardPaymentEnabled(cardOptionDefaultEnabled)",
  "company_id",
  "traveler_id",
]) {
  includes(customerPage, fragment, `invoice form default wiring ${fragment}`);
}

includes(
  ledger,
  "### Customer Card Option Default Override (2026-07-24)",
  "implementation ledger section",
);
includes(suite, guardScript, "preactivation registration");

const runtimeDir = await mkdtemp(
  path.join(os.tmpdir(), "prestige-customer-card-option-default-"),
);

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
  const { customerInvoiceCardOptionDefaultEnabled } = require(
    path.join(runtimeDir, "customer-dsp-invoice-review.js"),
  );
  const identity = { companyId: 26, travelerId: 22 };
  const base = {
    companies: [{ card_option_default_enabled: false, id: 26 }],
    travelers: [
      { card_option_default_enabled: null, company_id: 26, id: 22 },
    ],
  };

  assert.equal(customerInvoiceCardOptionDefaultEnabled(identity, base), false);
  assert.equal(
    customerInvoiceCardOptionDefaultEnabled(identity, {
      ...base,
      companies: [{ card_option_default_enabled: true, id: 26 }],
    }),
    true,
    "Exact company default must enable every invoice in that company",
  );
  assert.equal(
    customerInvoiceCardOptionDefaultEnabled(identity, {
      ...base,
      travelers: [
        { card_option_default_enabled: true, company_id: 26, id: 22 },
      ],
    }),
    true,
    "Exact traveler default must enable that traveler invoice",
  );
  assert.equal(
    customerInvoiceCardOptionDefaultEnabled(identity, {
      ...base,
      companies: [{ card_option_default_enabled: true, id: 99 }],
      travelers: [
        { card_option_default_enabled: true, company_id: 99, id: 22 },
      ],
    }),
    false,
    "Unrelated company or mismatched traveler evidence must be ignored",
  );
  assert.equal(
    customerInvoiceCardOptionDefaultEnabled(identity, {
      ...base,
      companies: [{ card_option_default_enabled: true, id: 26 }],
      travelers: [
        { card_option_default_enabled: false, company_id: 26, id: 22 },
      ],
    }),
    false,
    "An explicit traveler false must disable the inherited company default",
  );
} finally {
  await rm(runtimeDir, { force: true, recursive: true });
}

console.log("Customer card-option default override guard passed.");
