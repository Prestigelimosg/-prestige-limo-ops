import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const approvalEnvName =
  "PRESTIGE_ADMIN_MONTHLY_BILLING_INVOICE_DRAFT_PRODUCTION_SAVE_LOAD_APPROVED";
const approvalValue = "stage-monthly-drafts-william-approved";
const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];
const expectedMaskedProductionProjectRef = "kvv...atm";
const fakeBillingCustomerAccount =
  "PROD MONTHLY BILLING DRAFT VERIFY 20260607 SAFE ACCOUNT";
const fakeInvoiceCustomerAccount =
  "PROD MONTHLY INVOICE DRAFT VERIFY 20260607 SAFE ACCOUNT";
const fakeBillingMonth = "2026-06";
const fakeBillingDraftStatus = "ready_for_billing_draft_review";
const fakeInvoiceDraftStatus = "pending_admin_review";
const fakeReadinessStatus = "ready";
const fakeInvoiceTripReference =
  "PROD-INVOICE-DRAFT-VERIFY-20260607-SAFE-TRIP-001";
const requiredEnvKeys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
];
const sourceFiles = [
  "lib/admin-monthly-billing-draft-plan-persistence.ts",
  "lib/admin-monthly-invoice-draft-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-monthly-billing-draft-plans/route.ts",
  "app/api/admin-monthly-invoice-drafts/route.ts",
];
const unsafeBillingDraftEvidencePattern =
  /customer_price|customer_charge|quoted_price|rate_amount|fare_amount|amount_due|billing_amount|billing_rate|invoice_number|payment|payment_link|pdf|stripe|paynow|driver_payout|payout|finance|notification|telegram|sms_send|email_send|proof|photo|live_location|auth_link|customer_auth|driver_auth|raw_ai_prompt|raw_parser_prompt|parser_learning|parser_debug|service_role|server_only|server_secret|internal_admin_note|admin_note|internal_note|token|secret/i;
const unsafeInvoiceDraftEvidencePattern =
  /customer_price|customer_charge|quoted_price|rate_amount|fare_amount|amount_due|billing_amount|billing_rate|final_invoice|issued_invoice|invoice_number|full_invoice_number|payment|payment_link|pdf|stripe|paynow|driver_payout|payout|finance|notification|telegram|sms_send|email_send|proof|photo|live_location|auth_link|customer_auth|driver_auth|raw_ai_prompt|raw_parser_prompt|parser_learning|parser_debug|service_role|server_only|server_secret|internal_admin_note|admin_note|internal_note|token|secret/i;

class SafeFailure extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.code = code;
    this.extra = extra;
  }
}

function emitEvidence(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function failSafely(code, extra = {}) {
  throw new SafeFailure(code, extra);
}

function parseEnvFile(text) {
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);

    if (!match) {
      continue;
    }

    let value = match[2].trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[match[1]] = value;
  }

  return env;
}

function normalizedEnvValue(value) {
  return String(value ?? "").trim();
}

function looksPlaceholder(value) {
  return /^(?:|todo|tbd|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example|YOUR_PROJECT_REF|YOUR_SERVICE_ROLE)$/i.test(
    normalizedEnvValue(value),
  );
}

function validServerCredential(value) {
  const normalized = normalizedEnvValue(value).toLowerCase();

  return (
    normalizedEnvValue(value).length >= 24 &&
    normalized !== "anon" &&
    normalized !== "public" &&
    !normalized.includes("anon_key") &&
    !normalized.includes("public_key") &&
    !normalized.includes("next_public")
  );
}

function projectRefFromSupabaseUrl(value) {
  try {
    const url = new URL(normalizedEnvValue(value));
    const hostname = url.hostname.toLowerCase();
    const parts = hostname.split(".");

    if (
      url.protocol !== "https:" ||
      parts.length < 3 ||
      parts.at(-2) !== "supabase" ||
      parts.at(-1) !== "co"
    ) {
      return null;
    }

    return parts[0] || null;
  } catch {
    return null;
  }
}

function maskProjectRef(projectRef) {
  if (!projectRef || projectRef.length < 6) {
    return "invalid-mask";
  }

  return `${projectRef.slice(0, 3)}...${projectRef.slice(-3)}`;
}

function envCandidateSummary(envFileName, validation, exists) {
  return {
    envFileName,
    exists,
    invalid: validation?.invalid || [],
    maskedProductionProjectRef: validation?.maskedProjectRef || null,
    missing: validation?.missing || [],
    placeholder: validation?.placeholder || [],
    valuesPrinted: false,
  };
}

function validateLoadedEnv(env, envFileName) {
  const missing = [];
  const placeholder = [];
  const invalid = [];
  const projectRef = projectRefFromSupabaseUrl(env.SUPABASE_URL);
  const maskedProjectRef = maskProjectRef(projectRef);

  for (const key of requiredEnvKeys) {
    const value = normalizedEnvValue(env[key]);

    if (!value) {
      missing.push(key);
    } else if (looksPlaceholder(value)) {
      placeholder.push(key);
    }
  }

  if (
    normalizedEnvValue(env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) &&
    normalizedEnvValue(env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "false"
  ) {
    invalid.push("PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED");
  }

  if (
    normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE) &&
    normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE) !== "server-session-token"
  ) {
    invalid.push("PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE");
  }

  if (
    normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE) &&
    !["admin", "dispatcher"].includes(
      normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE),
    )
  ) {
    invalid.push("PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE");
  }

  if (
    normalizedEnvValue(env.SUPABASE_SERVICE_ROLE_KEY) &&
    !validServerCredential(env.SUPABASE_SERVICE_ROLE_KEY)
  ) {
    invalid.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (normalizedEnvValue(env.SUPABASE_URL) && maskedProjectRef !== expectedMaskedProductionProjectRef) {
    invalid.push("SUPABASE_URL");
  }

  return {
    env,
    envFileName,
    invalid,
    maskedProjectRef,
    missing,
    ok: missing.length === 0 && placeholder.length === 0 && invalid.length === 0,
    placeholder,
  };
}

async function loadAndValidateEnv() {
  const checked = [];

  for (const envFileName of candidateEnvFileNames) {
    const candidatePath = path.join(process.cwd(), envFileName);

    if (!existsSync(candidatePath)) {
      checked.push(envCandidateSummary(envFileName, null, false));
      continue;
    }

    const validation = validateLoadedEnv(
      parseEnvFile(await readFile(candidatePath, "utf8")),
      envFileName,
    );

    checked.push(envCandidateSummary(envFileName, validation, true));

    if (validation.ok) {
      return {
        ...validation,
        checked,
      };
    }
  }

  failSafely("production_env_preflight_failed", {
    checkedEnvCandidates: checked,
    requiredEnvNames: requiredEnvKeys,
  });
}

function applyLoadedEnv(env) {
  for (const key of requiredEnvKeys) {
    process.env[key] = normalizedEnvValue(env[key]);
  }
}

function forcePersistenceOff() {
  process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "false";
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

async function writeHarnessFile(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function writeRuntimeModules(tempDir) {
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const tempSupabaseDir = path.join(tempDir, "node_modules/@supabase");
  const workspaceSupabaseDir = path.join(process.cwd(), "node_modules/@supabase");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(tempSupabaseDir, { recursive: true });
  await writeFile(serverOnlyPath, "");

  try {
    await symlink(
      path.join(workspaceSupabaseDir, "supabase-js"),
      path.join(tempSupabaseDir, "supabase-js"),
      "dir",
    );
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
  }
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-monthly-drafts-live-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    billingDraftPersistence: require(path.join(
      tempDir,
      "lib/admin-monthly-billing-draft-plan-persistence.js",
    )),
    billingDraftRoute: require(path.join(
      tempDir,
      "app/api/admin-monthly-billing-draft-plans/route.js",
    )),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    invoiceDraftPersistence: require(path.join(
      tempDir,
      "lib/admin-monthly-invoice-draft-persistence.js",
    )),
    invoiceDraftRoute: require(path.join(
      tempDir,
      "app/api/admin-monthly-invoice-drafts/route.js",
    )),
  };
}

function billingDraftPayload() {
  return {
    billing_month: fakeBillingMonth,
    blocked_count: 0,
    customer_account: fakeBillingCustomerAccount,
    customer_id: "stage-live-billing-draft-safe-customer",
    draft_status: fakeBillingDraftStatus,
    ready_count: 1,
    readiness_status: fakeReadinessStatus,
    safe_draft_context: {
      draft_summary: "One safe monthly plan row verified.",
      next_action: "Load back and clean up exact fake row.",
    },
    safe_draft_note: "Controlled live monthly plan verification only.",
    source_grouping_summary: {
      blocked_count: 0,
      ready_count: 1,
      total_count: 1,
    },
    total_count: 1,
  };
}

function invoiceDraftPayload() {
  return {
    billing_month: fakeBillingMonth,
    blocked_count: 0,
    customer_account: fakeInvoiceCustomerAccount,
    customer_id: "stage-live-invoice-draft-safe-customer",
    draft_status: fakeInvoiceDraftStatus,
    linked_trips: [
      {
        billing_prep_readiness: "ready",
        booking_reference: fakeInvoiceTripReference,
        closeout_id: null,
        closeout_status: "closed",
        safe_trip_context: {
          next_action: "Load back and clean up exact fake draft.",
        },
        trip_readiness_status: "ready",
      },
    ],
    ready_count: 1,
    readiness_status: fakeReadinessStatus,
    safe_draft_context: {
      draft_summary: "One safe draft row verified.",
      next_action: "Load back and clean up exact fake draft.",
      review_status: "Controlled verification pending cleanup.",
    },
    safe_draft_note: "Controlled live draft verification only.",
    source_grouping_summary: {
      blocked_count: 0,
      ready_count: 1,
      total_count: 1,
    },
    total_count: 1,
  };
}

function adminHeaders() {
  return {
    "content-type": "application/json",
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
  };
}

function requestWithJson(url, body, headers) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
}

function getRequest(url, headers) {
  return new Request(url, {
    headers,
    method: "GET",
  });
}

async function readResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function safeResultName(result) {
  if (result?.status === 200 && result?.body?.ok === true) {
    return "passed";
  }

  return result?.status ? `blocked-${result.status}` : "blocked";
}

function billingDraftRecordMatchesFake(row) {
  return (
    row?.billing_month === fakeBillingMonth &&
    row?.customer_account === fakeBillingCustomerAccount &&
    row?.draft_status === fakeBillingDraftStatus &&
    row?.readiness_status === fakeReadinessStatus &&
    row?.ready_count === 1 &&
    row?.blocked_count === 0 &&
    row?.total_count === 1 &&
    row?.safe_draft_note === "Controlled live monthly plan verification only." &&
    row?.source_surface === "admin_api" &&
    ["admin", "dispatcher"].includes(row?.actor_role)
  );
}

function invoiceDraftRecordMatchesFake(row) {
  return (
    row?.billing_month === fakeBillingMonth &&
    row?.customer_account === fakeInvoiceCustomerAccount &&
    row?.draft_status === fakeInvoiceDraftStatus &&
    row?.readiness_status === fakeReadinessStatus &&
    row?.ready_count === 1 &&
    row?.blocked_count === 0 &&
    row?.total_count === 1 &&
    row?.safe_draft_note === "Controlled live draft verification only." &&
    row?.source_surface === "admin_api" &&
    ["admin", "dispatcher"].includes(row?.actor_role) &&
    Array.isArray(row?.linked_trips) &&
    row.linked_trips.length === 1 &&
    row.linked_trips[0]?.booking_reference === fakeInvoiceTripReference &&
    row.linked_trips[0]?.trip_readiness_status === "ready"
  );
}

function safeBillingRecordContainsUnsafeFields(row) {
  return unsafeBillingDraftEvidencePattern.test(JSON.stringify(row));
}

function safeInvoiceRecordContainsUnsafeFields(row) {
  return unsafeInvoiceDraftEvidencePattern.test(JSON.stringify(row));
}

function cleanupClientFromEnv() {
  return createClient(
    normalizedEnvValue(process.env.SUPABASE_URL),
    normalizedEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY),
    {
      auth: {
        persistSession: false,
      },
    },
  );
}

async function loadExactBillingDraftRows(client) {
  const { data, error } = await client
    .from("monthly_billing_draft_plans")
    .select(
      "customer_account, customer_id, billing_month, draft_status, readiness_status, ready_count, blocked_count, total_count, source_grouping_summary, safe_draft_note, safe_draft_context, source_surface, actor_role",
    )
    .eq("customer_account", fakeBillingCustomerAccount)
    .eq("billing_month", fakeBillingMonth);

  if (error) {
    failSafely("monthly_billing_draft_direct_select_failed_safely", {
      productionDbTouched: true,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function loadExactInvoiceDraftRows(client) {
  const { data, error } = await client
    .from("monthly_invoice_drafts")
    .select(
      "id, customer_account, customer_id, billing_month, draft_status, readiness_status, ready_count, blocked_count, total_count, source_grouping_summary, safe_draft_note, safe_draft_context, source_surface, actor_role",
    )
    .eq("customer_account", fakeInvoiceCustomerAccount)
    .eq("billing_month", fakeBillingMonth);

  if (error) {
    failSafely("monthly_invoice_draft_direct_select_failed_safely", {
      productionDbTouched: true,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function loadInvoiceDraftLinks(client, draftId) {
  const { data, error } = await client
    .from("monthly_invoice_draft_trip_links")
    .select(
      "draft_id, booking_reference, closeout_id, trip_readiness_status, closeout_status, billing_prep_readiness, safe_trip_context",
    )
    .eq("draft_id", draftId);

  if (error) {
    failSafely("monthly_invoice_draft_links_direct_select_failed_safely", {
      productionDbTouched: true,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function cleanupExactBillingDraftRow(client) {
  const rows = await loadExactBillingDraftRows(client);

  if (
    rows.length !== 1 ||
    !billingDraftRecordMatchesFake(rows[0]) ||
    safeBillingRecordContainsUnsafeFields(rows[0])
  ) {
    failSafely("monthly_billing_draft_cleanup_exact_match_failed", {
      matchedRows: rows.length,
      productionDbTouched: true,
    });
  }

  const { data, error } = await client
    .from("monthly_billing_draft_plans")
    .delete()
    .eq("customer_account", fakeBillingCustomerAccount)
    .eq("billing_month", fakeBillingMonth)
    .select("customer_account, billing_month");

  if (error || !Array.isArray(data) || data.length !== 1) {
    failSafely("monthly_billing_draft_cleanup_delete_failed_safely", {
      deletedRows: Array.isArray(data) ? data.length : 0,
      productionDbTouched: true,
    });
  }

  const remainingRows = await loadExactBillingDraftRows(client);

  if (remainingRows.length !== 0) {
    failSafely("monthly_billing_draft_cleanup_verify_absent_failed", {
      remainingRows: remainingRows.length,
      productionDbTouched: true,
    });
  }

  return {
    deletedRows: data.length,
    postCleanupRows: remainingRows.length,
  };
}

async function cleanupExactInvoiceDraftRow(client) {
  const rows = await loadExactInvoiceDraftRows(client);

  if (
    rows.length !== 1 ||
    !rows[0]?.id ||
    !invoiceDraftRecordMatchesFake({
      ...rows[0],
      linked_trips: [
        {
          booking_reference: fakeInvoiceTripReference,
          trip_readiness_status: "ready",
        },
      ],
    }) ||
    safeInvoiceRecordContainsUnsafeFields(rows[0])
  ) {
    failSafely("monthly_invoice_draft_cleanup_exact_match_failed", {
      matchedRows: rows.length,
      productionDbTouched: true,
    });
  }

  const links = await loadInvoiceDraftLinks(client, rows[0].id);

  if (
    links.length !== 1 ||
    links[0]?.booking_reference !== fakeInvoiceTripReference ||
    links[0]?.trip_readiness_status !== "ready" ||
    safeInvoiceRecordContainsUnsafeFields(links[0])
  ) {
    failSafely("monthly_invoice_draft_link_cleanup_exact_match_failed", {
      matchedLinks: links.length,
      productionDbTouched: true,
    });
  }

  const { data, error } = await client
    .from("monthly_invoice_drafts")
    .delete()
    .eq("id", rows[0].id)
    .select("id, customer_account, billing_month");

  if (error || !Array.isArray(data) || data.length !== 1) {
    failSafely("monthly_invoice_draft_cleanup_delete_failed_safely", {
      deletedRows: Array.isArray(data) ? data.length : 0,
      productionDbTouched: true,
    });
  }

  const remainingRows = await loadExactInvoiceDraftRows(client);
  const remainingLinks = await loadInvoiceDraftLinks(client, rows[0].id);

  if (remainingRows.length !== 0 || remainingLinks.length !== 0) {
    failSafely("monthly_invoice_draft_cleanup_verify_absent_failed", {
      remainingLinks: remainingLinks.length,
      remainingRows: remainingRows.length,
      productionDbTouched: true,
    });
  }

  return {
    deletedRows: data.length,
    postCleanupLinks: remainingLinks.length,
    postCleanupRows: remainingRows.length,
  };
}

async function verifyNoPreExistingRows(client) {
  const billingRows = await loadExactBillingDraftRows(client);
  const invoiceRows = await loadExactInvoiceDraftRows(client);

  if (billingRows.length !== 0 || invoiceRows.length !== 0) {
    failSafely("monthly_draft_fake_reference_already_exists", {
      existingBillingDraftRows: billingRows.length,
      existingInvoiceDraftRows: invoiceRows.length,
      productionDbTouched: true,
    });
  }
}

async function main() {
  if (process.env[approvalEnvName] !== approvalValue) {
    failSafely("missing_explicit_william_approval_env", {
      requiredApprovalEnvName: approvalEnvName,
    });
  }

  const validation = await loadAndValidateEnv();

  applyLoadedEnv(validation.env);

  const harness = await loadHarness();

  try {
    const parsedBillingPayload =
      harness.billingDraftPersistence.parseAdminMonthlyBillingDraftPlanSavePayload(
        billingDraftPayload(),
      );
    const parsedInvoicePayload =
      harness.invoiceDraftPersistence.parseAdminMonthlyInvoiceDraftCreatePayload(
        invoiceDraftPayload(),
      );

    if (!parsedBillingPayload.ok || !parsedInvoicePayload.ok) {
      failSafely("safe_monthly_draft_payload_rejected_before_live_write", {
        billingPayloadOk: parsedBillingPayload.ok,
        invoicePayloadOk: parsedInvoicePayload.ok,
      });
    }

    const blockedBillingAnonymous = await readResponse(
      await harness.billingDraftRoute.GET(
        getRequest(
          `http://localhost/api/admin-monthly-billing-draft-plans?billing_month=${fakeBillingMonth}`,
          {},
        ),
      ),
    );
    const blockedInvoiceCustomerReferer = await readResponse(
      await harness.invoiceDraftRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-invoice-drafts",
          invoiceDraftPayload(),
          {
            ...adminHeaders(),
            referer: "http://localhost/book",
          },
        ),
      ),
    );
    const blockedInvoiceDriverReferer = await readResponse(
      await harness.invoiceDraftRoute.GET(
        getRequest(
          `http://localhost/api/admin-monthly-invoice-drafts?billing_month=${fakeBillingMonth}`,
          {
            ...adminHeaders(),
            referer: "http://localhost/driver-job-demo",
          },
        ),
      ),
    );

    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "true";

    const unsafeBillingPayloadResult = await readResponse(
      await harness.billingDraftRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-billing-draft-plans",
          {
            ...billingDraftPayload(),
            safe_draft_note: "Create payment link.",
          },
          adminHeaders(),
        ),
      ),
    );
    const unsafeInvoicePayloadResult = await readResponse(
      await harness.invoiceDraftRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-invoice-drafts",
          {
            ...invoiceDraftPayload(),
            invoice_number: "unsafe",
          },
          adminHeaders(),
        ),
      ),
    );

    if (
      blockedBillingAnonymous.status !== 403 ||
      blockedInvoiceCustomerReferer.status !== 403 ||
      blockedInvoiceDriverReferer.status !== 403 ||
      unsafeBillingPayloadResult.status !== 400 ||
      unsafeInvoicePayloadResult.status !== 400
    ) {
      failSafely("monthly_draft_route_safety_gate_failed_before_live_write", {
        billingAnonymousGate: safeResultName(blockedBillingAnonymous),
        billingUnsafePayloadGate: safeResultName(unsafeBillingPayloadResult),
        invoiceCustomerRefererGate: safeResultName(blockedInvoiceCustomerReferer),
        invoiceDriverRefererGate: safeResultName(blockedInvoiceDriverReferer),
        invoiceUnsafePayloadGate: safeResultName(unsafeInvoicePayloadResult),
      });
    }

    const cleanupClient = cleanupClientFromEnv();

    await verifyNoPreExistingRows(cleanupClient);

    const billingSaveResult = await readResponse(
      await harness.billingDraftRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-billing-draft-plans",
          billingDraftPayload(),
          adminHeaders(),
        ),
      ),
    );

    if (
      billingSaveResult.status !== 200 ||
      billingSaveResult.body?.ok !== true ||
      !billingDraftRecordMatchesFake(billingSaveResult.body.draft_plan) ||
      safeBillingRecordContainsUnsafeFields(billingSaveResult.body.draft_plan)
    ) {
      failSafely("controlled_monthly_billing_draft_save_failed_safely", {
        productionDbTouched: true,
        status: billingSaveResult.status,
      });
    }

    const billingLoadResult = await readResponse(
      await harness.billingDraftRoute.GET(
        getRequest(
          `http://localhost/api/admin-monthly-billing-draft-plans?billing_month=${fakeBillingMonth}&customer_account_search=${encodeURIComponent(
            fakeBillingCustomerAccount,
          )}&readiness_status=${fakeReadinessStatus}&limit=5&page=1`,
          adminHeaders(),
        ),
      ),
    );
    const loadedBillingRows = Array.isArray(billingLoadResult.body?.draft_plans)
      ? billingLoadResult.body.draft_plans.filter(
          (row) => row.customer_account === fakeBillingCustomerAccount,
        )
      : [];

    if (
      billingLoadResult.status !== 200 ||
      billingLoadResult.body?.ok !== true ||
      loadedBillingRows.length !== 1 ||
      !billingDraftRecordMatchesFake(loadedBillingRows[0]) ||
      safeBillingRecordContainsUnsafeFields(loadedBillingRows[0])
    ) {
      failSafely("controlled_monthly_billing_draft_load_failed_safely", {
        matchedRows: loadedBillingRows.length,
        productionDbTouched: true,
        status: billingLoadResult.status,
      });
    }

    const invoiceSaveResult = await readResponse(
      await harness.invoiceDraftRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-invoice-drafts",
          invoiceDraftPayload(),
          adminHeaders(),
        ),
      ),
    );

    if (
      invoiceSaveResult.status !== 200 ||
      invoiceSaveResult.body?.ok !== true ||
      !invoiceDraftRecordMatchesFake(invoiceSaveResult.body.invoice_draft) ||
      safeInvoiceRecordContainsUnsafeFields(invoiceSaveResult.body.invoice_draft)
    ) {
      failSafely("controlled_monthly_invoice_draft_save_failed_safely", {
        productionDbTouched: true,
        status: invoiceSaveResult.status,
      });
    }

    const invoiceLoadResult = await readResponse(
      await harness.invoiceDraftRoute.GET(
        getRequest(
          `http://localhost/api/admin-monthly-invoice-drafts?billing_month=${fakeBillingMonth}&customer_account_search=${encodeURIComponent(
            fakeInvoiceCustomerAccount,
          )}&readiness_status=${fakeReadinessStatus}&limit=5&page=1`,
          adminHeaders(),
        ),
      ),
    );
    const loadedInvoiceRows = Array.isArray(invoiceLoadResult.body?.invoice_drafts)
      ? invoiceLoadResult.body.invoice_drafts.filter(
          (row) => row.customer_account === fakeInvoiceCustomerAccount,
        )
      : [];

    if (
      invoiceLoadResult.status !== 200 ||
      invoiceLoadResult.body?.ok !== true ||
      loadedInvoiceRows.length !== 1 ||
      !invoiceDraftRecordMatchesFake(loadedInvoiceRows[0]) ||
      safeInvoiceRecordContainsUnsafeFields(loadedInvoiceRows[0])
    ) {
      failSafely("controlled_monthly_invoice_draft_load_failed_safely", {
        matchedRows: loadedInvoiceRows.length,
        productionDbTouched: true,
        status: invoiceLoadResult.status,
      });
    }

    const billingCleanupResult = await cleanupExactBillingDraftRow(cleanupClient);
    const invoiceCleanupResult = await cleanupExactInvoiceDraftRow(cleanupClient);

    const postCleanupBillingLoad = await readResponse(
      await harness.billingDraftRoute.GET(
        getRequest(
          `http://localhost/api/admin-monthly-billing-draft-plans?billing_month=${fakeBillingMonth}&customer_account_search=${encodeURIComponent(
            fakeBillingCustomerAccount,
          )}&limit=5&page=1`,
          adminHeaders(),
        ),
      ),
    );
    const postCleanupInvoiceLoad = await readResponse(
      await harness.invoiceDraftRoute.GET(
        getRequest(
          `http://localhost/api/admin-monthly-invoice-drafts?billing_month=${fakeBillingMonth}&customer_account_search=${encodeURIComponent(
            fakeInvoiceCustomerAccount,
          )}&limit=5&page=1`,
          adminHeaders(),
        ),
      ),
    );

    if (
      postCleanupBillingLoad.status !== 200 ||
      postCleanupBillingLoad.body?.ok !== true ||
      postCleanupBillingLoad.body.draft_plans?.some(
        (row) => row.customer_account === fakeBillingCustomerAccount,
      ) ||
      postCleanupInvoiceLoad.status !== 200 ||
      postCleanupInvoiceLoad.body?.ok !== true ||
      postCleanupInvoiceLoad.body.invoice_drafts?.some(
        (row) => row.customer_account === fakeInvoiceCustomerAccount,
      )
    ) {
      failSafely("monthly_draft_post_cleanup_route_load_failed", {
        productionDbTouched: true,
      });
    }

    forcePersistenceOff();

    const finalEnv = parseEnvFile(await readFile(path.join(process.cwd(), validation.envFileName), "utf8"));

    if (normalizedEnvValue(finalEnv.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "false") {
      failSafely("local_env_persistence_default_not_off_after_monthly_draft_verification", {
        productionDbTouched: true,
      });
    }

    emitEvidence({
      cleanupRollback: {
        billingDraftDeletedRows: billingCleanupResult.deletedRows,
        billingDraftPostCleanupRows: billingCleanupResult.postCleanupRows,
        cleanupDeletedExactFakeRows: true,
        cleanupMethod:
          "Supabase JS exact account/month delete on monthly_billing_draft_plans and monthly_invoice_drafts",
        cleanupScope: ["customer_account", "billing_month", "draft_id"],
        envFileChanged: false,
        invoiceDraftDeletedRows: invoiceCleanupResult.deletedRows,
        invoiceDraftPostCleanupLinks: invoiceCleanupResult.postCleanupLinks,
        invoiceDraftPostCleanupRows: invoiceCleanupResult.postCleanupRows,
        persistenceDefaultAfter: "off",
        processKillSwitchAfter: "off",
      },
      env: {
        checkedEnvCandidates: validation.checked,
        envFileName: validation.envFileName,
        persistenceDefaultBefore: "off",
        requiredEnvNamesPresent: requiredEnvKeys,
        valuesPrinted: false,
      },
      fakeRows: {
        billingDraft: {
          billing_month: fakeBillingMonth,
          customer_account: fakeBillingCustomerAccount,
          draft_status: fakeBillingDraftStatus,
          readiness_status: fakeReadinessStatus,
          safeFieldsOnly: true,
        },
        invoiceDraft: {
          billing_month: fakeBillingMonth,
          customer_account: fakeInvoiceCustomerAccount,
          draft_status: fakeInvoiceDraftStatus,
          linked_trip_reference: fakeInvoiceTripReference,
          readiness_status: fakeReadinessStatus,
          safeFieldsOnly: true,
        },
      },
      fullProjectRefPrinted: false,
      liveApiRouteVerificationAttemptCount: 1,
      maskedProductionProjectRef: validation.maskedProjectRef,
      noBillingActivationPaymentPdfPayoutLocationNotificationParserLearning: true,
      noBroadProductionWrites: true,
      noCustomerDriverAuthOrPolicies: true,
      noMigration: true,
      noRawSql: true,
      noRealBookingsCustomersOrChildRowsTouched: true,
      noSecretsPrinted: true,
      noSupabaseCli: true,
      ok: true,
      productionDbTouched: true,
      result: {
        billingDraftApiRouteLoad: safeResultName(billingLoadResult),
        billingDraftApiRouteSave: safeResultName(billingSaveResult),
        billingDraftPostCleanupLoad: safeResultName(postCleanupBillingLoad),
        billingUnsafePayloadGate: safeResultName(unsafeBillingPayloadResult),
        blockedBillingAnonymousGate: safeResultName(blockedBillingAnonymous),
        blockedInvoiceCustomerRefererGate: safeResultName(blockedInvoiceCustomerReferer),
        blockedInvoiceDriverRefererGate: safeResultName(blockedInvoiceDriverReferer),
        exactCleanup: "passed",
        invoiceDraftApiRouteLoad: safeResultName(invoiceLoadResult),
        invoiceDraftApiRouteSave: safeResultName(invoiceSaveResult),
        invoiceDraftPostCleanupLoad: safeResultName(postCleanupInvoiceLoad),
        invoiceUnsafePayloadGate: safeResultName(unsafeInvoicePayloadResult),
        loadedRowsMatched: true,
        rowDataPrinted: false,
      },
      stage: "monthly-billing-and-invoice-draft-live-verification",
      targetMatchesPriorProductionEvidence: true,
      touchScope: [
        "one admin-gated POST save through /api/admin-monthly-billing-draft-plans",
        "one admin-gated GET load through /api/admin-monthly-billing-draft-plans for the exact fake account/month",
        "one exact account/month cleanup delete scoped to monthly_billing_draft_plans only",
        "one admin-gated POST save through /api/admin-monthly-invoice-drafts",
        "one admin-gated GET load through /api/admin-monthly-invoice-drafts for the exact fake account/month",
        "one exact draft cleanup delete scoped to monthly_invoice_drafts, with linked trip cleanup via cascade",
      ],
      unsafeFieldsWritten: false,
      writtenScope: {
        monthlyBillingDraftPlans: "one clearly marked fake row only",
        monthlyInvoiceDraftTripLinks: "one clearly marked fake link row only",
        monthlyInvoiceDrafts: "one clearly marked fake row only",
        realBookings: "none",
        realCustomers: "none",
      },
    });
  } finally {
    forcePersistenceOff();
    await harness.cleanup();
  }
}

main().catch((error) => {
  forcePersistenceOff();

  if (error instanceof SafeFailure) {
    emitEvidence({
      error: error.code,
      ok: false,
      persistenceDefaultAfter: "off",
      ...error.extra,
    });
    process.exit(1);
  }

  emitEvidence({
    error: "unexpected_monthly_draft_production_save_load_runner_failure_sanitized",
    ok: false,
    persistenceDefaultAfter: "off",
  });
  process.exit(1);
});
