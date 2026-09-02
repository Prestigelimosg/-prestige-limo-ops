import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/codex-monthly-invoice-draft-auto-preparation.ts";
const routePath = "app/api/cron/codex-monthly-invoice-drafts/route.ts";
const adapterPath = "lib/admin-booking-supabase-adapter.ts";
const groupingPath = "lib/admin-monthly-billing-grouping-read.ts";
const candidatesPath = "lib/admin-monthly-invoice-draft-trip-candidates.ts";
const draftsPath = "lib/admin-monthly-invoice-draft-persistence.ts";
const notificationPath = "lib/admin-app-notification-persistence.ts";
const notificationEventsPath = "lib/admin-app-notification-events.ts";
const dashboardPath = "app/page.tsx";
const vercelConfigPath = "vercel.json";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const migrationPath =
  "supabase/migrations/20260831142905_monthly_billing_company_booker_scope.sql";
const guardScript = "scripts/test-codex-monthly-invoice-draft-auto-preparation-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches = fragmentOrPattern instanceof RegExp
    ? fragmentOrPattern.test(source)
    : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
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

async function loadRuntimeHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-monthly-invoice-auto-prep-"));
  const helperOutputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));
  const routeOutputPath = path.join(tempDir, routePath.replace(/\.ts$/, ".js"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const stub = async (relativePath, source) => {
    const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, source);
  };

  await mkdir(path.dirname(helperOutputPath), { recursive: true });
  await mkdir(path.dirname(routeOutputPath), { recursive: true });
  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    helperOutputPath,
    transpileTypescript(await readFile(helperPath, "utf8"), helperPath),
  );
  await writeFile(
    routeOutputPath,
    transpileTypescript(await readFile(routePath, "utf8"), routePath),
  );
  await stub(
    "lib/admin-automation-runtime-control.ts",
    [
      "async function readAdminAutomationRuntimeControl() {",
      "  const state = globalThis.__prestigeMonthlyInvoiceAutoPrepMock;",
      "  state.runtimeReadCount += 1;",
      "  return state.runtimeResult;",
      "}",
      "module.exports = { readAdminAutomationRuntimeControl };",
    ].join("\n"),
  );
  await stub(
    "lib/admin-booking-supabase-adapter.ts",
    [
      "module.exports = {",
      "  codexMonthlyInvoiceAutomationPersistenceAdapterActor: {",
      "    actor_label: 'Codex monthly invoice automation',",
      "    actor_role: 'system',",
      "    boundary_mode: 'codex-monthly-invoice-automation-surface',",
      "    source_surface: 'system',",
      "  },",
      "};",
    ].join("\n"),
  );
  await stub(
    "lib/admin-monthly-billing-grouping-read.ts",
    [
      "async function loadAdminMonthlyBillingGroups(input, actor) {",
      "  const state = globalThis.__prestigeMonthlyInvoiceAutoPrepMock;",
      "  state.groupCalls.push({ actor, input });",
      "  return state.groupResult;",
      "}",
      "module.exports = { loadAdminMonthlyBillingGroups };",
    ].join("\n"),
  );
  await stub(
    "lib/admin-monthly-invoice-draft-persistence.ts",
    [
      "async function loadAdminMonthlyInvoiceDrafts(input, actor) {",
      "  const state = globalThis.__prestigeMonthlyInvoiceAutoPrepMock;",
      "  state.draftReadCalls.push({ actor, input });",
      "  return state.draftReadResult;",
      "}",
      "async function createAdminMonthlyInvoiceDraftFromGroup(input, actor) {",
      "  const state = globalThis.__prestigeMonthlyInvoiceAutoPrepMock;",
      "  state.draftCreateCalls.push({ actor, input });",
      "  return state.draftCreateResult(input);",
      "}",
      "module.exports = { createAdminMonthlyInvoiceDraftFromGroup, loadAdminMonthlyInvoiceDrafts };",
    ].join("\n"),
  );
  await stub(
    "lib/admin-monthly-invoice-draft-trip-candidates.ts",
    [
      "async function loadAdminMonthlyInvoiceDraftTripCandidates(input, actor) {",
      "  const state = globalThis.__prestigeMonthlyInvoiceAutoPrepMock;",
      "  state.candidateCalls.push({ actor, input });",
      "  return state.candidateResult;",
      "}",
      "module.exports = { loadAdminMonthlyInvoiceDraftTripCandidates };",
    ].join("\n"),
  );
  await stub(
    "lib/admin-app-notification-events.ts",
    [
      "async function createMonthlyInvoiceDraftAutomationSummaryAppEvent(input, actor) {",
      "  const state = globalThis.__prestigeMonthlyInvoiceAutoPrepMock;",
      "  state.notificationCalls.push({ actor, input });",
      "  return state.notificationResult;",
      "}",
      "module.exports = { createMonthlyInvoiceDraftAutomationSummaryAppEvent };",
    ].join("\n"),
  );

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(helperOutputPath)(helperOutputPath),
    route: createRequire(routeOutputPath)(routeOutputPath),
  };
}

function installRuntimeMock(overrides = {}) {
  const group = {
    billing_month: "2026-06",
    blocked_count: 0,
    booker_id: 101,
    classified_count: 1,
    company_id: 100,
    covered_count: 0,
    customer_account: "Safe Customer",
    customer_id: "safe-customer-id",
    ready_count: 1,
    safe_readiness_status: "ready",
    total_count: 1,
  };
  const candidate = {
    billing_month: "2026-06",
    billing_prep_readiness: "ready",
    booking_reference: "SAFE-MONTHLY-001",
    booker_id: 101,
    closeout_id: "11111111-1111-4111-8111-111111111111",
    closeout_status: "closed",
    company_id: 100,
    customer_account: "Safe Customer",
    customer_id: "safe-customer-id",
    safe_trip_context: {
      readiness_reason: "Ready closeout has no draft trip link yet.",
      source: "completed_booking_closeout",
    },
    trip_readiness_status: "ready",
  };
  const state = {
    candidateCalls: [],
    candidateResult: {
      data: {
        pagination: { has_next_page: false, total_candidate_count: 1 },
        summary: { blocked_count: 0, ready_count: 1, total_count: 1 },
        trip_candidates: [candidate],
      },
      ok: true,
    },
    draftCreateCalls: [],
    draftCreateResult: (input) => ({ data: { id: "safe-draft-id", ...input }, ok: true }),
    draftReadCalls: [],
    draftReadResult: {
      data: {
        invoice_drafts: [],
        pagination: { has_next_page: false, total_draft_count: 0 },
      },
      ok: true,
    },
    groupCalls: [],
    groupResult: {
      data: {
        groups: [group],
        pagination: { has_next_page: false, total_group_count: 1 },
        summary: {
          blocked_count: 0,
          classified_count: 1,
          covered_count: 0,
          ready_count: 1,
        },
      },
      ok: true,
    },
    notificationCalls: [],
    notificationResult: { status: "created" },
    runtimeReadCount: 0,
    runtimeResult: {
      automation_enabled: true,
      ok: true,
      runtime_status: "active",
    },
    ...overrides,
  };

  globalThis.__prestigeMonthlyInvoiceAutoPrepMock = state;
  return state;
}

const [
  helper,
  route,
  adapter,
  grouping,
  candidates,
  drafts,
  notification,
  notificationEvents,
  dashboard,
  vercelConfig,
  ledger,
  preactivationSuite,
  migration,
] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(adapterPath, "utf8"),
  readFile(groupingPath, "utf8"),
  readFile(candidatesPath, "utf8"),
  readFile(draftsPath, "utf8"),
  readFile(notificationPath, "utf8"),
  readFile(notificationEventsPath, "utf8"),
  readFile(dashboardPath, "utf8"),
  readFile(vercelConfigPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(migrationPath, "utf8"),
]);

for (const fragment of [
  "alter table public.monthly_billing_draft_plans",
  "alter table public.monthly_invoice_drafts",
  "add column if not exists company_id bigint references public.companies(id) on delete restrict",
  "add column if not exists booker_id bigint references public.bookers(id) on delete restrict",
  "monthly_billing_draft_plans_verified_identity_month_key",
  "monthly_invoice_drafts_verified_identity_month_key",
  "(customer_id, company_id, booker_id, billing_month)",
]) {
  assertIncludes(migration, fragment, `monthly Company Booker migration ${fragment}`);
}
for (const forbidden of [
  /update\s+public\.monthly_(?:billing_draft_plans|invoice_drafts)/i,
  /insert\s+into\s+public\.monthly_(?:billing_draft_plans|invoice_drafts)/i,
  /create\s+policy/i,
  /grant\s+/i,
]) {
  assertExcludes(migration, forbidden, "monthly Company Booker migration legacy-data boundary");
}

for (const fragment of [
  "readAdminAutomationRuntimeControl",
  "loadAdminMonthlyBillingGroups",
  "loadAdminMonthlyInvoiceDraftTripCandidates",
  "loadAdminMonthlyInvoiceDrafts",
  "createAdminMonthlyInvoiceDraftFromGroup",
  "createMonthlyInvoiceDraftAutomationSummaryAppEvent",
  "pending_admin_review",
  "existingDraftsByKey",
  "candidateResult.data.summary.total_count !== group.ready_count",
  "candidate.trip_readiness_status !== \"ready\"",
  "sameReferences",
  "calendar_auto_write_enabled: false",
  "customer_driver_email_auto_send_enabled: false",
  "external_send: false",
  "invoice_auto_issue_enabled: false",
]) {
  assertIncludes(helper, fragment, `monthly invoice auto-preparation helper ${fragment}`);
}

for (const fragment of [
  "authorization",
  "CRON_SECRET",
  "Bearer ${cronSecret}",
  "runCodexMonthlyInvoiceDraftAutoPreparation",
  'export const dynamic = "force-dynamic"',
]) {
  assertIncludes(route, fragment, `monthly invoice cron route ${fragment}`);
}

assertIncludes(adapter, '"codex-monthly-invoice-automation-surface"');
assertIncludes(adapter, 'actor_label: "Codex monthly invoice automation"');
for (const source of [grouping, candidates, drafts, notification]) {
  assertIncludes(source, "isVerifiedCodexMonthlyInvoiceAutomationActor");
}

for (const fragment of [
  "classified_count: classifiedCount",
  "covered_count: coveredCount",
  "ready_count: readyCount",
]) {
  assertIncludes(notificationEvents, fragment, `monthly classification notification ${fragment}`);
}

for (const fragment of [
  'data-admin-monthly-billing-dashboard-classifications="true"',
  "data-admin-monthly-billing-dashboard-classification-row={status}",
  'status === "covered"',
  '"Already invoiced"',
  'safe_payment_status?: "paid" | "unpaid" | null',
  'data-admin-monthly-billing-dashboard-review-booking="true"',
  'data-admin-monthly-billing-dashboard-resolve-booking="true"',
  '`Review booking ${reference} in Dispatch`',
  'className="inline-flex min-h-11',
  'handleAdminMonthlyBillingDashboardBookingReview',
  'handleAdminMonthlyBillingDashboardBookingResolve',
  'adminMonthlyBillingDashboardJobIsActionable',
  "loadAdminMonthlyBillingGroupsRead",
]) {
  assertIncludes(dashboard, fragment, `monthly classification Dashboard ${fragment}`);
}

for (const fragment of [
  'safe_payment_status: candidate.safePaymentStatus',
  'status === "Paid" ? "paid" : status === "Unpaid" ? "unpaid" : null',
  'monthlyBillingIssuedRecordSelect',
]) {
  assertIncludes(grouping, fragment, `monthly classification payment evidence ${fragment}`);
}

const dashboardReviewNavigationSource = dashboard.slice(
  dashboard.indexOf("async function handleAdminMonthlyBillingDashboardBookingReview"),
  dashboard.indexOf("async function handleAdminAiTodaysWorkLoadMore"),
);
assertIncludes(
  dashboardReviewNavigationSource,
  "loadAdminAiReadOnlyBookingInDispatch",
  "monthly classification review existing exact Dispatch loader",
);
assertIncludes(
  dashboardReviewNavigationSource,
  "loadAdminMonthlyBillingGroupsRead",
  "monthly classification Resolve authoritative recheck",
);
assertExcludes(
  dashboardReviewNavigationSource,
  /method:\s*"(?:POST|PUT|PATCH|DELETE)"|\b(?:saveBooking|createInvoice|issueInvoice|markInvoice)\s*\(/,
  "monthly classification review and Resolve write boundary",
);

const vercelConfigValue = JSON.parse(vercelConfig);
assert.deepEqual(
  vercelConfigValue.crons?.filter(
    (entry) => entry.path === "/api/cron/codex-monthly-invoice-drafts",
  ),
  [
    {
      path: "/api/cron/codex-monthly-invoice-drafts",
      schedule: "0 0 1 * *",
    },
  ],
);
assert.deepEqual(vercelConfigValue.crons, [
  {
    path: "/api/cron/driver-ack-auto-reminders",
    schedule: "* * * * *",
  },
  {
    path: "/api/cron/codex-monthly-invoice-drafts",
    schedule: "0 0 1 * *",
  },
]);

for (const forbidden of [
  /fetch\s*\(/,
  /resend/i,
  /stripe/i,
  /whatsapp/i,
  /telegram/i,
  /sms/i,
  /invoice_auto_issue_enabled:\s*true/,
  /calendar_auto_write_enabled:\s*true/,
  /customer_driver_email_auto_send_enabled:\s*true/,
  /external_send:\s*true/,
]) {
  assertExcludes(helper, forbidden, "monthly invoice auto-preparation external/write boundary");
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite registration");
for (const phrase of [
  "### Automatic Monthly Invoice Draft Preparation",
  "08:00 Singapore time on the first calendar day of each month",
  "previous Singapore billing month",
  "Automation OFF or unavailable performs zero grouping, candidate, draft, or notification writes",
  "refreshes an unlocked existing customer/month draft when its exact ready trip set changes",
  "`pending_admin_review`",
  "one consolidated internal admin-app notification",
  "250 customer groups and 250 ready trip candidates per customer group",
  "existing grouping reader examines at most 500 completed booking rows and 500 matching issued-document rows",
  "No customer/invoice page layout, invoice issue, invoice number, PDF, payment, payout, calendar, customer/driver message, or external send changed",
  "### Monthly Invoice Draft Production Scheduler Activation",
  "fresh random 64-character secret",
  "exact READY Production deployment `dpl_GEsHpMkUyhSqY8XaniytrgC54pfi` was rebuilt with `vercel redeploy`",
  "READY replacement `dpl_FQjDABfqJW6nGjLK2G8akANiHetc`",
  "exactly one project cron: `/api/cron/codex-monthly-invoice-drafts`",
  "The next normal eligible run after this 15 July 2026 activation is 1 August 2026 at 08:00 SGT",
  "Missing authorization returned HTTP 401",
  "`reason: not_first_day`",
  "master Automation row remains `active` with `automation_enabled = true`",
  "created zero monthly invoice drafts and zero admin-app notifications",
  "does not claim that the first eligible Production run has prepared a real draft",
  "never auto-issued or auto-sent",
]) {
  assertIncludes(ledger, phrase, `monthly invoice automation ledger ${phrase}`);
}

const harness = await loadRuntimeHarness();

try {
  const offDayMock = installRuntimeMock();
  const offDay = await harness.helper.runCodexMonthlyInvoiceDraftAutoPreparation({
    now: new Date("2026-07-02T00:00:00.000Z"),
  });
  assert.equal(offDay.reason, "not_first_day");
  assert.equal(offDay.prepared_count, 0);
  assert.equal(offDayMock.runtimeReadCount, 0);
  assert.equal(offDayMock.draftCreateCalls.length, 0);

  const closedMock = installRuntimeMock({
    runtimeResult: {
      automation_enabled: false,
      ok: true,
      runtime_status: "closed",
    },
  });
  const closed = await harness.helper.runCodexMonthlyInvoiceDraftAutoPreparation({
    now: new Date("2026-07-01T00:00:00.000Z"),
  });
  assert.equal(closed.reason, "runtime_closed");
  assert.equal(closed.automation_enabled, false);
  assert.equal(closedMock.groupCalls.length, 0);
  assert.equal(closedMock.draftCreateCalls.length, 0);

  const preparedMock = installRuntimeMock();
  const prepared = await harness.helper.runCodexMonthlyInvoiceDraftAutoPreparation({
    now: new Date("2026-07-01T00:00:00.000Z"),
  });
  assert.equal(prepared.billing_month, "2026-06");
  assert.equal(prepared.reason, "prepared");
  assert.equal(prepared.prepared_count, 1);
  assert.equal(prepared.failed_count, 0);
  assert.equal(prepared.external_send, false);
  assert.equal(prepared.invoice_auto_issue_enabled, false);
  assert.equal(prepared.calendar_auto_write_enabled, false);
  assert.equal(prepared.customer_driver_email_auto_send_enabled, false);
  assert.equal(preparedMock.draftCreateCalls.length, 1);
  assert.deepEqual(
    {
      booker_id: preparedMock.draftCreateCalls[0].input.booker_id,
      company_id: preparedMock.draftCreateCalls[0].input.company_id,
      customer_id: preparedMock.draftCreateCalls[0].input.customer_id,
    },
    { booker_id: 101, company_id: 100, customer_id: "safe-customer-id" },
  );
  assert.deepEqual(
    {
      booker_id: preparedMock.candidateCalls[0].input.booker_id,
      company_id: preparedMock.candidateCalls[0].input.company_id,
      customer_id: preparedMock.candidateCalls[0].input.customer_id,
    },
    { booker_id: 101, company_id: 100, customer_id: "safe-customer-id" },
  );
  assert.equal(preparedMock.draftCreateCalls[0].input.draft_status, "pending_admin_review");
  assert.equal(preparedMock.draftCreateCalls[0].input.linked_trips.length, 1);
  assert.equal(preparedMock.notificationCalls.length, 1);
  assert.deepEqual(preparedMock.notificationCalls[0].input, {
    billingMonth: "2026-06",
    blockedCount: 0,
    classifiedCount: 1,
    coveredCount: 0,
    failedCount: 0,
    preparedCount: 1,
    readyCount: 1,
    skippedExistingCount: 0,
  });

  const existingMock = installRuntimeMock({
    draftReadResult: {
      data: {
        invoice_drafts: [
          {
            billing_month: "2026-06",
            booker_id: 101,
            company_id: 100,
            customer_account: "Safe Customer",
            customer_id: "safe-customer-id",
            linked_trips: [{ booking_reference: "SAFE-MONTHLY-001" }],
          },
        ],
        pagination: { has_next_page: false, total_draft_count: 1 },
      },
      ok: true,
    },
  });
  const existing = await harness.helper.runCodexMonthlyInvoiceDraftAutoPreparation({
    now: new Date("2026-07-01T00:00:00.000Z"),
  });
  assert.equal(existing.reason, "no_work");
  assert.equal(existing.skipped_existing_count, 1);
  assert.equal(existingMock.candidateCalls.length, 1);
  assert.equal(existingMock.draftCreateCalls.length, 0);
  assert.equal(existingMock.notificationCalls.length, 1);

  const refreshMock = installRuntimeMock({
    draftReadResult: {
      data: {
        invoice_drafts: [
          {
            billing_month: "2026-06",
            booker_id: 101,
            company_id: 100,
            customer_account: "Safe Customer",
            customer_id: "safe-customer-id",
            linked_trips: [],
          },
        ],
        pagination: { has_next_page: false, total_draft_count: 1 },
      },
      ok: true,
    },
  });
  const refreshed = await harness.helper.runCodexMonthlyInvoiceDraftAutoPreparation({
    now: new Date("2026-07-01T00:00:00.000Z"),
  });
  assert.equal(refreshed.reason, "prepared");
  assert.equal(refreshMock.draftCreateCalls.length, 1);
  assert.deepEqual(
    refreshMock.draftCreateCalls[0].input.linked_trips.map((trip) => trip.booking_reference),
    ["SAFE-MONTHLY-001"],
  );

  const coveredOnlyMock = installRuntimeMock({
    groupResult: {
      data: {
        groups: [
          {
            billing_month: "2026-06",
            blocked_count: 0,
            booker_id: 501,
            classified_count: 1,
            company_id: 500,
            covered_count: 1,
            customer_account: "Covered Customer",
            customer_id: "covered-customer-id",
            ready_count: 0,
            safe_readiness_status: "blocked",
            total_count: 0,
          },
        ],
        pagination: { has_next_page: false, total_group_count: 1 },
        summary: {
          blocked_count: 0,
          classified_count: 1,
          covered_count: 1,
          ready_count: 0,
        },
      },
      ok: true,
    },
  });
  const coveredOnly = await harness.helper.runCodexMonthlyInvoiceDraftAutoPreparation({
    now: new Date("2026-07-01T00:00:00.000Z"),
  });
  assert.equal(coveredOnly.reason, "no_work");
  assert.equal(coveredOnlyMock.candidateCalls.length, 0);
  assert.equal(coveredOnlyMock.draftCreateCalls.length, 0);
  assert.equal(coveredOnlyMock.notificationCalls.length, 1);

  const legacyIdentityMock = installRuntimeMock({
    groupResult: {
      data: {
        groups: [
          {
            billing_month: "2026-06",
            blocked_count: 1,
            booker_id: null,
            classified_count: 1,
            company_id: 100,
            covered_count: 0,
            customer_account: "Legacy Customer",
            customer_id: "legacy-customer-id",
            ready_count: 0,
            safe_readiness_status: "blocked",
            total_count: 1,
          },
        ],
        pagination: { has_next_page: false, total_group_count: 1 },
        summary: {
          blocked_count: 1,
          classified_count: 1,
          covered_count: 0,
          ready_count: 0,
        },
      },
      ok: true,
    },
  });
  const legacyIdentity = await harness.helper.runCodexMonthlyInvoiceDraftAutoPreparation({
    now: new Date("2026-07-01T00:00:00.000Z"),
  });
  assert.equal(legacyIdentity.reason, "no_work");
  assert.equal(legacyIdentityMock.candidateCalls.length, 0);
  assert.equal(legacyIdentityMock.draftCreateCalls.length, 0);
  assert.equal(legacyIdentityMock.notificationCalls.length, 1);

  const mismatchMock = installRuntimeMock({
    candidateResult: {
      data: {
        pagination: { has_next_page: false, total_candidate_count: 0 },
        summary: { blocked_count: 0, ready_count: 0, total_count: 0 },
        trip_candidates: [],
      },
      ok: true,
    },
  });
  const mismatch = await harness.helper.runCodexMonthlyInvoiceDraftAutoPreparation({
    now: new Date("2026-07-01T00:00:00.000Z"),
  });
  assert.equal(mismatch.reason, "partial_failure");
  assert.equal(mismatch.failed_count, 1);
  assert.equal(mismatchMock.draftCreateCalls.length, 0);

  assert.equal(
    harness.helper.previousSingaporeBillingMonth(new Date("2026-01-01T00:00:00.000Z")),
    "2025-12",
  );

  const originalCronSecret = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    installRuntimeMock();
    const missingSecretResponse = await harness.route.GET(
      new Request("http://localhost/api/cron/codex-monthly-invoice-drafts"),
    );
    assert.equal(missingSecretResponse.status, 401);

    process.env.CRON_SECRET = "safe-test-secret";
    const queryResponse = await harness.route.GET(
      new Request("http://localhost/api/cron/codex-monthly-invoice-drafts?force=true", {
        headers: { authorization: "Bearer safe-test-secret" },
      }),
    );
    assert.equal(queryResponse.status, 400);
  } finally {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  }
} finally {
  delete globalThis.__prestigeMonthlyInvoiceAutoPrepMock;
  await harness.cleanup();
}

console.log("Codex monthly invoice draft auto-preparation guard passed.");
