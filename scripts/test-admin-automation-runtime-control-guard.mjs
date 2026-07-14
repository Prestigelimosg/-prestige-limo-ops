import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-automation-runtime-control.ts";
const routePath = "app/api/admin-automation-runtime/route.ts";
const pagePath = "app/page.tsx";
const migrationPath =
  "supabase/migrations/20260714022319_admin_automation_runtime_settings.sql";
const ledgerPath = "docs/current-implementation-ledger.md";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";
const browserPath = "scripts/test-booking-ui-browser.mjs";
const mobileBrowserPath = "scripts/test-mobile-usability-browser.mjs";
const guardPath = "scripts/test-admin-automation-runtime-control-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matched =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matched, false, `${label} must not include ${fragmentOrPattern}.`);
}

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

async function loadHelperHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-automation-runtime-"));
  const sourcePath = path.join(process.cwd(), helperPath);
  const outputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await writeFile(
    outputPath,
    transpileTypescript(await readFile(sourcePath, "utf8"), sourcePath),
  );
  await writeFile(serverOnlyPath, "");
  await writeFile(
    supabasePath,
    "exports.createClient = () => { throw new Error('test client injection required'); };",
  );

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(outputPath)(outputPath),
  };
}

function createRuntimeClient(initialRow = null) {
  let row = initialRow ? { ...initialRow } : null;
  const calls = [];

  const chain = {
    eq(column, value) {
      calls.push({ column, operation: "eq", value });
      return chain;
    },
    async maybeSingle() {
      calls.push({ operation: "maybeSingle" });
      return { data: row ? { ...row } : null, error: null };
    },
    select(columns) {
      calls.push({ columns, operation: "select" });
      return chain;
    },
    upsert(payload, options) {
      calls.push({ operation: "upsert", options, payload: { ...payload } });
      row = { created_at: "2026-07-14T00:00:00.000Z", ...row, ...payload };
      return chain;
    },
  };

  return {
    calls,
    client: {
      from(table) {
        calls.push({ operation: "from", table });
        return chain;
      },
    },
    row: () => (row ? { ...row } : null),
  };
}

const [helperSource, routeSource, pageSource, migration, ledger, suite, browser, mobileBrowser] = await Promise.all(
  [helperPath, routePath, pagePath, migrationPath, ledgerPath, suitePath, browserPath, mobileBrowserPath].map((file) =>
    readFile(path.join(process.cwd(), file), "utf8"),
  ),
);

for (const fragment of [
  "server-only",
  'const runtimeSettingsTable = "admin_automation_runtime_settings"',
  'const runtimeSettingName = "admin_automation_runtime"',
  "readAdminAutomationRuntimeControl",
  "setAdminAutomationRuntimeControl",
  "setAdminAutomationRuntimeControlClientForTests",
  "automation_enabled",
  "booking_intake_enabled: true",
  "calendar_auto_write_enabled: false",
  "customer_driver_email_auto_send_enabled: false",
  "invoice_auto_issue_enabled: false",
  "external_send: false",
  "customerVisible: false",
]) {
  assertIncludes(helperSource, fragment, `automation helper ${fragment}`);
}

assertExcludes(
  helperSource,
  /customer_price|driver_payout|paynow|invoice_number|payment|parser_debug|internal_admin_note|raw_provider|token_hash|raw_token|mock_archive/i,
  "automation helper forbidden operational/private fields",
);

for (const fragment of [
  'export const dynamic = "force-dynamic"',
  "resolveAdminDispatcherBoundary",
  'allowServerSessionRoleMethodsWithoutRequestToken: ["PATCH"]',
  "readAdminAutomationRuntimeControl",
  "setAdminAutomationRuntimeControl",
  "export async function GET",
  "export async function PATCH",
  'allowedBodyFields = new Set(["enabled"])',
  "customerVisible: false",
  "external_send: false",
]) {
  assertIncludes(routeSource, fragment, `automation route ${fragment}`);
}

assertExcludes(routeSource, /export async function (?:POST|PUT|DELETE)/, "automation route extra writes");

for (const fragment of [
  "create table if not exists public.admin_automation_runtime_settings",
  "setting_name text primary key",
  "automation_enabled boolean not null default false",
  "setting_name = 'admin_automation_runtime'",
  "setting_status in ('closed', 'active')",
  "setting_status = 'active' and automation_enabled",
  "setting_status = 'closed' and not automation_enabled",
  "enable row level security",
  "revoke all on table public.admin_automation_runtime_settings from public, anon, authenticated",
  "grant select, insert, update, delete on table public.admin_automation_runtime_settings to service_role",
  "values ('admin_automation_runtime', 'closed', false, 'system')",
]) {
  assertIncludes(migration, fragment, `automation migration ${fragment}`);
}

assertExcludes(
  migration,
  /customer|driver|booking|invoice|payment|payout|paynow|parser|provider|email|calendar|gps|location|photo|token|secret/i,
  "automation setting migration operational data",
);

for (const fragment of [
  'const adminAutomationRuntimeApiPath = "/api/admin-automation-runtime"',
  "loadAdminAutomationRuntimeControl",
  "updateAdminAutomationRuntimeControl",
  "handleAdminAutomationRuntimeToggle",
  'role="switch"',
  'data-admin-automation-runtime-toggle="true"',
  'data-admin-automation-runtime-enabled={adminAutomationRuntimeEnabled ? "true" : "false"}',
  "Automation ON",
  "Automation OFF",
  "Bookings and manual actions stay available.",
]) {
  assertIncludes(pageSource, fragment, `automation dashboard ${fragment}`);
}

assertExcludes(pageSource, /Codex Review Page|Automation Review Page/, "duplicate automation review page");

for (const phrase of [
  "The existing Operations Dashboard header now contains one compact admin-only `Automation ON / OFF` switch; no new review page, route-level UI, booking panel, invoice panel, or duplicate workbench was added.",
  "The switch persists one singleton server-side setting in `admin_automation_runtime_settings`, defaults closed, and is readable/writable only through the existing verified same-origin admin/dispatcher boundary and service-role-only table access.",
  "Turning Automation OFF never blocks customer booking intake, deletes queued reviews, changes a booking/calendar, issues an invoice, sends customer/driver Email, or removes manual admin actions.",
  "This first pass is control-only: calendar conflict checks, job-card queueing, scheduled monthly invoice preparation, and automatic Driver Details Email remain disabled until their later separately guarded passes.",
  "Remote migration `20260714022319_admin_automation_runtime_settings` is applied to the configured `prestige-limo-ops` Supabase project.",
  "The singleton was tested as the `service_role` from ON back to OFF inside one database transaction, so no other session could observe the temporary ON state; the committed row remains exactly one `closed / false` record.",
  "The established mobile browser guard now uses current stable admin/customer selectors and copy, and verifies the same compact Automation switch remains visible, contained, accessible, and OFF across the existing 320–1440 px viewport matrix without clicking it.",
]) {
  assertIncludes(ledger, phrase, `automation ledger ${phrase}`);
}

assertIncludes(suite, guardPath, "preactivation suite automation guard registration");

for (const fragment of [
  'Bookings: "Find saved jobs"',
  'url.includes("/api/admin-automation-runtime")',
  'const checkAdminAutomationRuntimeToggle = async (viewport)',
  'state.text, "Automation OFF"',
  'state.runtimeState, "closed"',
  'document.querySelector("[data-dispatch-workflow-step=\'job-card-preview\']")',
  '"Customer Billing Overview"',
  '"automatic saved-bookings load"',
]) {
  assertIncludes(mobileBrowser, fragment, `automation mobile runtime ${fragment}`);
}
assertExcludes(
  mobileBrowser,
  'Bookings: "Load Bookings"',
  "mobile browser retired Bookings tab copy",
);
assertExcludes(
  mobileBrowser,
  'clickButtonByText("Load Bookings")',
  "mobile browser retired manual bookings load action",
);

for (const fragment of [
  'String(target).includes("/api/admin-automation-runtime")',
  'document.querySelector("[data-admin-automation-runtime-toggle=\'true\']")',
  'assert.equal(automationOnState.enabled, "true")',
  'assert.deepEqual(automationOnState.patchBodies.at(-1), { enabled: true })',
  'assert.equal(automationOffState.enabled, "false")',
  'assert.deepEqual(automationOffState.patchBodies.at(-1), { enabled: false })',
]) {
  assertIncludes(browser, fragment, `automation browser runtime ${fragment}`);
}

const harness = await loadHelperHarness();

try {
  const runtime = createRuntimeClient();
  harness.helper.setAdminAutomationRuntimeControlClientForTests(runtime.client);

  const missing = await harness.helper.readAdminAutomationRuntimeControl();
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "setting_missing");
  assert.equal(missing.runtime_status, "error");
  assert.equal(missing.automation_enabled, false);
  assert.equal(missing.booking_intake_enabled, true);
  assert.equal(missing.external_send, false);

  const actor = { actorLabel: "Owner", role: "admin" };
  const enabled = await harness.helper.setAdminAutomationRuntimeControl({
    actor,
    enabled: true,
  });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.action, "enable");
  assert.equal(enabled.runtime_status, "active");
  assert.equal(enabled.automation_enabled, true);
  assert.equal(enabled.reason, "runtime_enabled");
  assert.equal(enabled.calendar_auto_write_enabled, false);
  assert.equal(enabled.customer_driver_email_auto_send_enabled, false);
  assert.equal(enabled.invoice_auto_issue_enabled, false);

  const readEnabled = await harness.helper.readAdminAutomationRuntimeControl();
  assert.equal(readEnabled.ok, true);
  assert.equal(readEnabled.automation_enabled, true);

  const disabled = await harness.helper.setAdminAutomationRuntimeControl({
    actor,
    enabled: false,
  });
  assert.equal(disabled.ok, true);
  assert.equal(disabled.action, "disable");
  assert.equal(disabled.runtime_status, "closed");
  assert.equal(disabled.automation_enabled, false);
  assert.equal(disabled.reason, "runtime_disabled");
  assert.equal(runtime.row().updated_by_role, "admin");

  const blocked = await harness.helper.setAdminAutomationRuntimeControl({
    actor: { actorLabel: "Customer", role: "customer" },
    enabled: true,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "admin_session_required");
  assert.equal(blocked.automation_enabled, false);
} finally {
  harness.helper.setAdminAutomationRuntimeControlClientForTests(null);
  await harness.cleanup();
}

console.log("Admin automation runtime control guard passed.");
