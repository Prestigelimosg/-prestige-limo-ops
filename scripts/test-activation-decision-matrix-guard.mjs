import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const matrixRows = [
  {
    area: "Live DB/write/migrations",
    approvals: ["Explicit", "schema/write scope", "migration plan", "rollback plan"],
  },
  {
    area: "Deployment",
    approvals: ["Explicit", "deployment", "rollback", "production readiness"],
  },
  {
    area: "Email provider/env/live sending",
    approvals: ["Explicit", "provider/env", "recipient safety", "live-send"],
  },
  {
    area: "WhatsApp provider/env/live sending",
    approvals: ["Explicit", "provider/env", "customer-safe template", "live-send"],
  },
  {
    area: "SMS provider/env/live sending",
    approvals: ["Explicit", "provider/env", "short customer-safe message policy", "live-send"],
  },
  {
    area: "Telegram bot token/env/live sending",
    approvals: ["Explicit", "bot token/env", "internal-admin recipient policy", "live-send"],
  },
  {
    area: "FlightAware live lookup/scheduler",
    approvals: ["Explicit", "FlightAware provider/env", "scheduler/rate-limit", "live external lookup"],
  },
  {
    area: "Live location/GPS/storage/customer map",
    approvals: ["Explicit", "GPS capture", "storage policy", "customer-visible map"],
  },
  {
    area: "OTS photo upload/Supabase Storage/admin viewer",
    approvals: ["Explicit", "camera/upload", "private bucket", "admin viewer", "access-control"],
  },
  {
    area: "Customer/driver auth/Supabase Auth/session/token issuing",
    approvals: ["Explicit", "auth provider", "session/token", "access policy", "customer/driver access"],
  },
  {
    area: "Billing/payment/PDF/payout/payment links",
    approvals: ["Explicit", "payment provider", "PDF/invoice", "payout", "payment-link"],
  },
  {
    area: "CRM/calendar amendment update actions",
    approvals: ["Explicit", "admin approval workflow", "CRM booking update", "calendar update/cancel"],
  },
  {
    area:
      "Risky shim write paths: `rate_settings`, full drivers, `customer_rates`, `driver_payout_rules`, pricing, payout",
    approvals: ["Explicit", "one-family split/gating approval", "typed helpers/APIs/tests"],
  },
];
const requiredBlockedFragments = [
  "live DB/write",
  "migrations",
  "deployment",
  "provider/env activation",
  "external APIs",
  "live sending",
  "payment/PDF/payout",
  "auth activation",
  "FlightAware live lookup",
  "live location activation",
  "photo upload/storage",
  "CRM/calendar amendment updates",
  "risky shim write paths",
];

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n## ") {
  const start = source.indexOf(startHeading);

  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);

  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function assertIncludes(source, fragment, label) {
  assert.equal(
    normalize(source).includes(normalize(fragment)),
    true,
    `${label} missing expected fragment: ${fragment}`,
  );
}

function parseMatrixRows(matrixSection) {
  return matrixSection
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.includes("---"))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter(([area]) => area !== "Blocked live area");
}

const ledger = await readFile(ledgerPath, "utf8");
const masterSection = sectionBetween(ledger, "## Master Pre-Activation Completion Audit Lock");
const matrixSection = sectionBetween(ledger, "## Activation Decision Matrix");
const parsedRows = parseMatrixRows(matrixSection);

assert.equal(
  parsedRows.length,
  matrixRows.length,
  "Activation decision matrix must keep exactly one compact row for each blocked live area.",
);

for (const required of matrixRows) {
  const row = parsedRows.find(([area]) => area === required.area);

  assert.ok(row, `Activation decision matrix missing row: ${required.area}`);
  assert.equal(row.length, 2, `${required.area} row must keep exactly two columns.`);
  assert.match(
    row[1],
    /explicit/i,
    `${required.area} row must require explicit approval before activation.`,
  );
  assert.match(
    row[1],
    /approval/i,
    `${required.area} row must use approval language before activation.`,
  );

  for (const approvalFragment of required.approvals) {
    assertIncludes(row[1], approvalFragment, `${required.area} approval requirement`);
  }
}

for (const blockedFragment of requiredBlockedFragments) {
  assertIncludes(masterSection, blockedFragment, "Master pre-activation blocked-live list");
}

assertIncludes(ledger, "No new shims", "Activation decision matrix guard ledger rules");
assertIncludes(
  ledger,
  "unless explicitly approved",
  "Activation decision matrix guard ledger live-activation rules",
);

console.log("activation decision matrix guard passed");
