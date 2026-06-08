import { constants, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const approvalEnvName =
  "PRESTIGE_ADMIN_MONTHLY_INVOICE_NUMBER_RESERVATION_PRODUCTION_SAVE_LOAD_APPROVED";
const approvalValue = "phase-5-invoice-number-reservation-william-approved";
const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];
const expectedMaskedProductionProjectRef = "kvv...atm";
const fakeDraftId = "99999999-9999-4999-8999-999999999991";
const fakeCustomerAccount = "SAFE SEQUENCE VERIFY 20260609 ACCOUNT";
const fakeBillingMonth = "2026-06";
const fakeInvoicePrefix = "PIVR26";
const fakeExpectedInvoiceNumber = "PIVR26-0001";
const fakeInitialIssueReviewStatus = "ready_for_future_issue";
const fakeIssueRecordInitialStatus = "draft_locked";
const fakeIssueRecordReservedStatus = "invoice_number_reserved";
const fakeReadinessStatus = "ready";
const fakeReadyCount = 1;
const fakeBlockedCount = 0;
const fakeTotalCount = 1;
const fakeSourceSummary = {
  blocked_count: fakeBlockedCount,
  ready_count: fakeReadyCount,
  total_count: fakeTotalCount,
  verification_scope: "safe_sequence_reservation_only",
};
const fakeSafeIssueContext = {
  issue_summary: "Safe issue review parent row for sequence reservation verification.",
  next_action: "Create issue record, reserve sequence, load back, then clean up exact chain.",
  review_status: "Controlled verification.",
};
const fakeSafeRecordContext = {
  invoice_number_status: "Ready to reserve through the approved sequence API.",
  issue_summary: "Safe invoice number reservation verification row.",
  lock_status: "Draft locked for controlled invoice number reservation verification.",
  next_action: "Reserve invoice number, load back, then clean up exact row.",
};
const fakeSafeIssueNote = "Controlled live issue review parent for sequence reservation only.";
const fakeSafeRecordNote = "Controlled live invoice number reservation verification only.";
const fakeSafeSequenceNote =
  "Controlled live invoice number reservation sequence verification only.";
const liveAttemptMarkerPath = path.join(
  os.tmpdir(),
  "prestige-monthly-invoice-number-reservation-live-write-attempted-after-rpc-fix.marker",
);
const requiredEnvKeys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
];
const sourceFiles = [
  "lib/admin-monthly-invoice-number-reservation.ts",
  "lib/admin-monthly-invoice-issue-record-persistence.ts",
  "lib/admin-monthly-invoice-issue-review-persistence.ts",
  "lib/admin-monthly-invoice-draft-lock-enforcement.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-monthly-invoice-number-reservations/route.ts",
  "app/api/admin-monthly-invoice-issue-records/route.ts",
  "app/api/admin-monthly-invoice-issue-reviews/route.ts",
];
const unsafeEvidencePattern =
  /customer_price|customer_charge|quoted_price|rate_amount|fare_amount|amount_due|billing_amount|billing_rate|payment_link|pdf_link|pdf_url|invoice_pdf_url|stripe_session|paynow|driver_payout|payout|finance_note|internal_finance_note|notification_payload|telegram_payload|sms_send|email_send|proof|photo|live_location|auth_link|customer_auth|driver_auth|raw_ai_prompt|raw_parser_prompt|parser_learning|parser_debug|service_role|server_only|server_secret|internal_admin_note|admin_note|internal_note|token|secret/i;

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
    !["admin", "dispatcher"].includes(normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE))
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

    const validation = validateLoadedEnv(parseEnvFile(await readFile(candidatePath, "utf8")), envFileName);

    checked.push(envCandidateSummary(envFileName, validation, true));

    if (validation.ok) {
      return {
        ...validation,
        checked,
      };
    }
  }

  failSafely("monthly_invoice_number_reservation_production_env_preflight_failed", {
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-monthly-invoice-number-live-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    issueRecordPersistence: require(path.join(
      tempDir,
      "lib/admin-monthly-invoice-issue-record-persistence.js",
    )),
    issueRecordRoute: require(path.join(
      tempDir,
      "app/api/admin-monthly-invoice-issue-records/route.js",
    )),
    issueReviewPersistence: require(path.join(
      tempDir,
      "lib/admin-monthly-invoice-issue-review-persistence.js",
    )),
    issueReviewRoute: require(path.join(
      tempDir,
      "app/api/admin-monthly-invoice-issue-reviews/route.js",
    )),
    reservationPersistence: require(path.join(
      tempDir,
      "lib/admin-monthly-invoice-number-reservation.js",
    )),
    reservationRoute: require(path.join(
      tempDir,
      "app/api/admin-monthly-invoice-number-reservations/route.js",
    )),
  };
}

function parentDraftPayload() {
  return {
    id: fakeDraftId,
    billing_month: fakeBillingMonth,
    blocked_count: fakeBlockedCount,
    customer_account: fakeCustomerAccount,
    customer_id: "safe-invoice-number-verify-customer",
    draft_status: "manager_approved",
    ready_count: fakeReadyCount,
    readiness_status: fakeReadinessStatus,
    safe_draft_context: {
      draft_summary: "Safe parent row for invoice number reservation verification.",
      next_action: "Clean up exact parent after invoice number reservation verification.",
    },
    safe_draft_note: "Controlled invoice number reservation parent row only.",
    source_grouping_summary: fakeSourceSummary,
    source_surface: "admin_api",
    actor_role: "admin",
    actor_label: "Monthly invoice number reservation verification",
    total_count: fakeTotalCount,
    updated_at: new Date().toISOString(),
  };
}

function issueReviewPayload() {
  return {
    billing_month: fakeBillingMonth,
    blocked_count: fakeBlockedCount,
    customer_account: fakeCustomerAccount,
    draft_id: fakeDraftId,
    draft_status_snapshot: "manager_approved",
    issue_review_status: fakeInitialIssueReviewStatus,
    ready_count: fakeReadyCount,
    readiness_status: fakeReadinessStatus,
    safe_issue_context: fakeSafeIssueContext,
    safe_issue_note: fakeSafeIssueNote,
    source_draft_summary: fakeSourceSummary,
    total_count: fakeTotalCount,
  };
}

function issueRecordPayload(issueReviewId) {
  return {
    billing_month: fakeBillingMonth,
    customer_account: fakeCustomerAccount,
    draft_id: fakeDraftId,
    draft_lock_status: "locked_for_issue",
    invoice_delivery_status: "not_sent",
    invoice_number: null,
    invoice_number_status: "ready_to_reserve",
    issue_record_status: fakeIssueRecordInitialStatus,
    issue_review_id: issueReviewId,
    payment_record_status: "not_recorded",
    pdf_generation_status: "not_requested",
    safe_issue_record_context: fakeSafeRecordContext,
    safe_issue_record_note: fakeSafeRecordNote,
    source_issue_review_summary: {
      ...fakeSourceSummary,
      issue_review_status: fakeInitialIssueReviewStatus,
    },
  };
}

function reservationPayload(issueRecordId) {
  return {
    billing_month: fakeBillingMonth,
    customer_account: fakeCustomerAccount,
    invoice_prefix: fakeInvoicePrefix,
    issue_record_id: issueRecordId,
    safe_sequence_note: fakeSafeSequenceNote,
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

function requestWithJson(url, body, headers, method = "POST") {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method,
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

function safeRecordContainsUnsafeFields(row) {
  return unsafeEvidencePattern.test(JSON.stringify(row));
}

function sanitizedUnexpectedError(error) {
  const name = typeof error?.name === "string" ? error.name : "Error";
  const message = typeof error?.message === "string" ? error.message : "unexpected error";
  const sanitizedMessage = message
    .replace(/https:\/\/[a-z0-9-]+\.supabase\.co/gi, "https://masked.supabase.co")
    .replace(/[A-Za-z0-9_=-]{24,}/g, "[redacted]");

  return {
    unexpectedErrorMessage: sanitizedMessage.slice(0, 160),
    unexpectedErrorName: name.slice(0, 80),
  };
}

function parentDraftRecordMatchesFake(row) {
  return (
    row?.id === fakeDraftId &&
    row?.billing_month === fakeBillingMonth &&
    row?.blocked_count === fakeBlockedCount &&
    row?.customer_account === fakeCustomerAccount &&
    row?.draft_status === "manager_approved" &&
    row?.ready_count === fakeReadyCount &&
    row?.readiness_status === fakeReadinessStatus &&
    row?.safe_draft_note === "Controlled invoice number reservation parent row only." &&
    row?.source_grouping_summary?.verification_scope === fakeSourceSummary.verification_scope &&
    row?.source_surface === "admin_api" &&
    row?.actor_role === "admin" &&
    row?.total_count === fakeTotalCount
  );
}

function issueReviewRecordMatchesFake(row) {
  return (
    row?.billing_month === fakeBillingMonth &&
    row?.blocked_count === fakeBlockedCount &&
    row?.customer_account === fakeCustomerAccount &&
    row?.draft_id === fakeDraftId &&
    row?.draft_status_snapshot === "manager_approved" &&
    row?.issue_review_status === fakeInitialIssueReviewStatus &&
    row?.ready_count === fakeReadyCount &&
    row?.readiness_status === fakeReadinessStatus &&
    row?.safe_issue_context?.issue_summary === fakeSafeIssueContext.issue_summary &&
    row?.safe_issue_context?.next_action === fakeSafeIssueContext.next_action &&
    row?.safe_issue_context?.review_status === fakeSafeIssueContext.review_status &&
    row?.safe_issue_note === fakeSafeIssueNote &&
    row?.source_draft_summary?.verification_scope === fakeSourceSummary.verification_scope &&
    row?.source_surface === "admin_api" &&
    ["admin", "dispatcher"].includes(row?.actor_role) &&
    row?.total_count === fakeTotalCount
  );
}

function issueRecordMatchesInitialFake(row, issueReviewId) {
  return (
    row?.billing_month === fakeBillingMonth &&
    row?.customer_account === fakeCustomerAccount &&
    row?.draft_id === fakeDraftId &&
    row?.draft_lock_status === "locked_for_issue" &&
    row?.invoice_delivery_status === "not_sent" &&
    row?.invoice_number === null &&
    row?.invoice_number_status === "ready_to_reserve" &&
    row?.issue_record_status === fakeIssueRecordInitialStatus &&
    row?.issue_review_id === issueReviewId &&
    row?.payment_record_status === "not_recorded" &&
    row?.pdf_generation_status === "not_requested" &&
    row?.safe_issue_record_context?.issue_summary === fakeSafeRecordContext.issue_summary &&
    row?.safe_issue_record_note === fakeSafeRecordNote &&
    row?.source_issue_review_summary?.verification_scope === fakeSourceSummary.verification_scope &&
    row?.source_surface === "admin_api" &&
    ["admin", "dispatcher"].includes(row?.actor_role)
  );
}

function issueRecordMatchesReservedFake(row, issueReviewId, issueRecordId) {
  return (
    row?.id === issueRecordId &&
    row?.billing_month === fakeBillingMonth &&
    row?.customer_account === fakeCustomerAccount &&
    row?.draft_id === fakeDraftId &&
    row?.draft_lock_status === "locked_for_issue" &&
    row?.invoice_delivery_status === "not_sent" &&
    row?.invoice_number === fakeExpectedInvoiceNumber &&
    row?.invoice_number_status === "reserved" &&
    row?.invoice_prefix === fakeInvoicePrefix &&
    row?.invoice_sequence_number === 1 &&
    row?.issue_record_status === fakeIssueRecordReservedStatus &&
    row?.issue_review_id === issueReviewId &&
    row?.payment_record_status === "not_recorded" &&
    row?.pdf_generation_status === "not_requested" &&
    row?.safe_issue_record_context?.invoice_number_status ===
      "Invoice number reserved by approved sequence API." &&
    row?.safe_issue_record_context?.next_action ===
      "Review invoice issue readiness before any PDF, payment, or send step." &&
    row?.safe_issue_record_note === fakeSafeRecordNote &&
    row?.source_issue_review_summary?.verification_scope === fakeSourceSummary.verification_scope &&
    row?.source_surface === "admin_api" &&
    ["admin", "dispatcher"].includes(row?.actor_role)
  );
}

function routeIssueRecordMatchesReservedFake(row, issueReviewId, issueRecordId) {
  return (
    row?.id === issueRecordId &&
    row?.billing_month === fakeBillingMonth &&
    row?.customer_account === fakeCustomerAccount &&
    row?.draft_id === fakeDraftId &&
    row?.draft_lock_status === "locked_for_issue" &&
    row?.invoice_delivery_status === "not_sent" &&
    row?.invoice_number === fakeExpectedInvoiceNumber &&
    row?.invoice_number_status === "reserved" &&
    row?.issue_record_status === fakeIssueRecordReservedStatus &&
    row?.issue_review_id === issueReviewId &&
    row?.payment_record_status === "not_recorded" &&
    row?.pdf_generation_status === "not_requested" &&
    row?.safe_issue_record_context?.invoice_number_status ===
      "Invoice number reserved by approved sequence API." &&
    row?.source_issue_review_summary?.verification_scope === fakeSourceSummary.verification_scope &&
    row?.source_surface === "admin_api" &&
    ["admin", "dispatcher"].includes(row?.actor_role)
  );
}

function reservationResultMatchesFake(row, issueRecordId) {
  return (
    row?.invoice_number === fakeExpectedInvoiceNumber &&
    row?.invoice_number_status === "reserved" &&
    row?.invoice_prefix === fakeInvoicePrefix &&
    row?.invoice_sequence_number === 1 &&
    row?.issue_record_id === issueRecordId
  );
}

function sequenceRecordMatchesReservedFake(row) {
  return (
    row?.customer_account === fakeCustomerAccount &&
    row?.invoice_prefix === fakeInvoicePrefix &&
    row?.last_reserved_invoice_number === fakeExpectedInvoiceNumber &&
    row?.last_reserved_sequence_number === 1 &&
    row?.next_sequence_number === 2 &&
    row?.safe_sequence_note === fakeSafeSequenceNote &&
    row?.sequence_status === "active" &&
    row?.source_surface === "admin_api" &&
    ["admin", "dispatcher"].includes(row?.actor_role)
  );
}

async function writeLiveAttemptMarker() {
  try {
    await writeFile(
      liveAttemptMarkerPath,
      `Monthly invoice number reservation controlled live write attempted for ${fakeDraftId}\n`,
      {
        flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        mode: 0o600,
      },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      failSafely("controlled_monthly_invoice_number_reservation_live_write_already_attempted");
    }

    throw error;
  }
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

async function loadExactParentDraftRows(client) {
  const { data, error } = await client
    .from("monthly_invoice_drafts")
    .select(
      "id, customer_account, customer_id, billing_month, draft_status, readiness_status, ready_count, blocked_count, total_count, source_grouping_summary, safe_draft_note, safe_draft_context, source_surface, actor_role, actor_label",
    )
    .eq("id", fakeDraftId)
    .eq("customer_account", fakeCustomerAccount)
    .eq("billing_month", fakeBillingMonth);

  if (error) {
    failSafely("controlled_monthly_invoice_number_reservation_parent_preselect_failed_safely", {
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function loadExactIssueReviewRows(client) {
  const { data, error } = await client
    .from("monthly_invoice_issue_reviews")
    .select(
      "id, draft_id, customer_account, billing_month, draft_status_snapshot, issue_review_status, readiness_status, ready_count, blocked_count, total_count, source_draft_summary, safe_issue_note, safe_issue_context, source_surface, actor_role, actor_label",
    )
    .eq("draft_id", fakeDraftId)
    .eq("customer_account", fakeCustomerAccount)
    .eq("billing_month", fakeBillingMonth);

  if (error) {
    failSafely("controlled_monthly_invoice_number_reservation_review_preselect_failed_safely", {
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function loadExactIssueRecordRows(client) {
  const { data, error } = await client
    .from("monthly_invoice_issue_records")
    .select(
      "id, issue_review_id, draft_id, customer_account, billing_month, issue_record_status, draft_lock_status, invoice_number, invoice_prefix, invoice_sequence_number, invoice_number_status, invoice_number_reserved_at, pdf_generation_status, invoice_delivery_status, payment_record_status, source_issue_review_summary, safe_issue_record_note, safe_issue_record_context, source_surface, actor_role, actor_label",
    )
    .eq("draft_id", fakeDraftId)
    .eq("customer_account", fakeCustomerAccount)
    .eq("billing_month", fakeBillingMonth);

  if (error) {
    failSafely("controlled_monthly_invoice_number_reservation_record_preselect_failed_safely", {
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function loadExactSequenceRowsByAccount(client) {
  const { data, error } = await client
    .from("customer_invoice_sequences")
    .select(
      "id, customer_account, invoice_prefix, next_sequence_number, last_reserved_sequence_number, last_reserved_invoice_number, sequence_status, safe_sequence_note, source_surface, actor_role, actor_label",
    )
    .eq("customer_account", fakeCustomerAccount);

  if (error) {
    failSafely("controlled_monthly_invoice_number_reservation_sequence_account_preselect_failed_safely", {
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function loadExactSequenceRowsByPrefix(client) {
  const { data, error } = await client
    .from("customer_invoice_sequences")
    .select(
      "id, customer_account, invoice_prefix, next_sequence_number, last_reserved_sequence_number, last_reserved_invoice_number, sequence_status, safe_sequence_note, source_surface, actor_role, actor_label",
    )
    .eq("invoice_prefix", fakeInvoicePrefix);

  if (error) {
    failSafely("controlled_monthly_invoice_number_reservation_sequence_prefix_preselect_failed_safely", {
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function verifyNoPreExistingRows(client) {
  const parentRows = await loadExactParentDraftRows(client);
  const reviewRows = await loadExactIssueReviewRows(client);
  const recordRows = await loadExactIssueRecordRows(client);
  const sequenceAccountRows = await loadExactSequenceRowsByAccount(client);
  const sequencePrefixRows = await loadExactSequenceRowsByPrefix(client);

  if (
    parentRows.length !== 0 ||
    reviewRows.length !== 0 ||
    recordRows.length !== 0 ||
    sequenceAccountRows.length !== 0 ||
    sequencePrefixRows.length !== 0
  ) {
    failSafely("controlled_monthly_invoice_number_reservation_fake_chain_already_exists", {
      existingIssueRecordRows: recordRows.length,
      existingIssueReviewRows: reviewRows.length,
      existingParentRows: parentRows.length,
      existingSequenceAccountRows: sequenceAccountRows.length,
      existingSequencePrefixRows: sequencePrefixRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }
}

async function createExactParentDraft(client) {
  const { data, error } = await client
    .from("monthly_invoice_drafts")
    .insert(parentDraftPayload())
    .select(
      "id, customer_account, customer_id, billing_month, draft_status, readiness_status, ready_count, blocked_count, total_count, source_grouping_summary, safe_draft_note, safe_draft_context, source_surface, actor_role, actor_label",
    )
    .single();

  if (error || !parentDraftRecordMatchesFake(data) || safeRecordContainsUnsafeFields(data)) {
    failSafely("controlled_monthly_invoice_number_reservation_parent_create_failed_safely", {
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  return data;
}

async function cleanupExactFakeRows(issueReviewId, issueRecordId) {
  const client = cleanupClientFromEnv();
  const issueRecordRows = await loadExactIssueRecordRows(client);

  if (
    issueRecordRows.length !== 1 ||
    !issueRecordMatchesReservedFake(issueRecordRows[0], issueReviewId, issueRecordId) ||
    safeRecordContainsUnsafeFields(issueRecordRows[0])
  ) {
    failSafely("controlled_monthly_invoice_number_reservation_cleanup_exact_match_failed", {
      matchedIssueRecordRows: issueRecordRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const { data: deletedIssueRecordRows, error: issueRecordDeleteError } = await client
    .from("monthly_invoice_issue_records")
    .delete()
    .eq("id", issueRecordId)
    .eq("issue_review_id", issueReviewId)
    .eq("draft_id", fakeDraftId)
    .eq("customer_account", fakeCustomerAccount)
    .eq("billing_month", fakeBillingMonth)
    .eq("invoice_prefix", fakeInvoicePrefix)
    .eq("invoice_sequence_number", 1)
    .select("id, issue_review_id, draft_id, customer_account, billing_month, invoice_prefix, invoice_sequence_number");

  if (
    issueRecordDeleteError ||
    !Array.isArray(deletedIssueRecordRows) ||
    deletedIssueRecordRows.length !== 1
  ) {
    failSafely("controlled_monthly_invoice_number_reservation_record_cleanup_delete_failed_safely", {
      deletedIssueRecordRows: Array.isArray(deletedIssueRecordRows)
        ? deletedIssueRecordRows.length
        : 0,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const postIssueRecordCleanupRows = await loadExactIssueRecordRows(client);

  if (postIssueRecordCleanupRows.length !== 0) {
    failSafely("controlled_monthly_invoice_number_reservation_record_cleanup_verify_absent_failed", {
      remainingIssueRecordRows: postIssueRecordCleanupRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const issueReviewRows = await loadExactIssueReviewRows(client);

  if (
    issueReviewRows.length !== 1 ||
    issueReviewRows[0]?.id !== issueReviewId ||
    !issueReviewRecordMatchesFake(issueReviewRows[0]) ||
    safeRecordContainsUnsafeFields(issueReviewRows[0])
  ) {
    failSafely("controlled_monthly_invoice_number_reservation_review_cleanup_exact_match_failed", {
      matchedIssueReviewRows: issueReviewRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const { data: deletedIssueReviewRows, error: issueReviewDeleteError } = await client
    .from("monthly_invoice_issue_reviews")
    .delete()
    .eq("id", issueReviewId)
    .eq("draft_id", fakeDraftId)
    .eq("customer_account", fakeCustomerAccount)
    .eq("billing_month", fakeBillingMonth)
    .select("id, draft_id, customer_account, billing_month");

  if (
    issueReviewDeleteError ||
    !Array.isArray(deletedIssueReviewRows) ||
    deletedIssueReviewRows.length !== 1
  ) {
    failSafely("controlled_monthly_invoice_number_reservation_review_cleanup_delete_failed_safely", {
      deletedIssueReviewRows: Array.isArray(deletedIssueReviewRows)
        ? deletedIssueReviewRows.length
        : 0,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const postIssueReviewCleanupRows = await loadExactIssueReviewRows(client);

  if (postIssueReviewCleanupRows.length !== 0) {
    failSafely("controlled_monthly_invoice_number_reservation_review_cleanup_verify_absent_failed", {
      remainingIssueReviewRows: postIssueReviewCleanupRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const parentRows = await loadExactParentDraftRows(client);

  if (
    parentRows.length !== 1 ||
    !parentDraftRecordMatchesFake(parentRows[0]) ||
    safeRecordContainsUnsafeFields(parentRows[0])
  ) {
    failSafely("controlled_monthly_invoice_number_reservation_parent_cleanup_exact_match_failed", {
      matchedParentRows: parentRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const { data: deletedParentRows, error: parentDeleteError } = await client
    .from("monthly_invoice_drafts")
    .delete()
    .eq("id", fakeDraftId)
    .eq("customer_account", fakeCustomerAccount)
    .eq("billing_month", fakeBillingMonth)
    .select("id, customer_account, billing_month");

  if (parentDeleteError || !Array.isArray(deletedParentRows) || deletedParentRows.length !== 1) {
    failSafely("controlled_monthly_invoice_number_reservation_parent_cleanup_delete_failed_safely", {
      deletedParentRows: Array.isArray(deletedParentRows) ? deletedParentRows.length : 0,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const postParentCleanupRows = await loadExactParentDraftRows(client);

  if (postParentCleanupRows.length !== 0) {
    failSafely("controlled_monthly_invoice_number_reservation_parent_cleanup_verify_absent_failed", {
      remainingParentRows: postParentCleanupRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const sequenceAccountRows = await loadExactSequenceRowsByAccount(client);
  const sequencePrefixRows = await loadExactSequenceRowsByPrefix(client);

  if (
    sequenceAccountRows.length !== 1 ||
    sequencePrefixRows.length !== 1 ||
    sequenceAccountRows[0]?.id !== sequencePrefixRows[0]?.id ||
    !sequenceRecordMatchesReservedFake(sequenceAccountRows[0]) ||
    safeRecordContainsUnsafeFields(sequenceAccountRows[0])
  ) {
    failSafely("controlled_monthly_invoice_number_reservation_sequence_cleanup_exact_match_failed", {
      matchedSequenceAccountRows: sequenceAccountRows.length,
      matchedSequencePrefixRows: sequencePrefixRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const { data: deletedSequenceRows, error: sequenceDeleteError } = await client
    .from("customer_invoice_sequences")
    .delete()
    .eq("customer_account", fakeCustomerAccount)
    .eq("invoice_prefix", fakeInvoicePrefix)
    .eq("last_reserved_invoice_number", fakeExpectedInvoiceNumber)
    .eq("last_reserved_sequence_number", 1)
    .select("id, customer_account, invoice_prefix, last_reserved_invoice_number, last_reserved_sequence_number");

  if (
    sequenceDeleteError ||
    !Array.isArray(deletedSequenceRows) ||
    deletedSequenceRows.length !== 1
  ) {
    failSafely("controlled_monthly_invoice_number_reservation_sequence_cleanup_delete_failed_safely", {
      deletedSequenceRows: Array.isArray(deletedSequenceRows) ? deletedSequenceRows.length : 0,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const postSequenceAccountRows = await loadExactSequenceRowsByAccount(client);
  const postSequencePrefixRows = await loadExactSequenceRowsByPrefix(client);

  if (postSequenceAccountRows.length !== 0 || postSequencePrefixRows.length !== 0) {
    failSafely("controlled_monthly_invoice_number_reservation_sequence_cleanup_verify_absent_failed", {
      remainingSequenceAccountRows: postSequenceAccountRows.length,
      remainingSequencePrefixRows: postSequencePrefixRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  return {
    deletedIssueRecordRows: deletedIssueRecordRows.length,
    deletedIssueReviewRows: deletedIssueReviewRows.length,
    deletedParentRows: deletedParentRows.length,
    deletedSequenceRows: deletedSequenceRows.length,
    postIssueRecordCleanupRows: postIssueRecordCleanupRows.length,
    postIssueReviewCleanupRows: postIssueReviewCleanupRows.length,
    postParentCleanupRows: postParentCleanupRows.length,
    postSequenceAccountRows: postSequenceAccountRows.length,
    postSequencePrefixRows: postSequencePrefixRows.length,
  };
}

async function main() {
  if (process.env[approvalEnvName] !== approvalValue) {
    failSafely("missing_explicit_william_approval_env", {
      requiredApprovalEnvName: approvalEnvName,
      requiredApprovalValue: approvalValue,
    });
  }

  const validation = await loadAndValidateEnv();

  applyLoadedEnv(validation.env);

  const harness = await loadHarness();

  try {
    const parsedIssueReview =
      harness.issueReviewPersistence.parseAdminMonthlyInvoiceIssueReviewCreatePayload(
        issueReviewPayload(),
      );
    const parsedIssueRecord =
      harness.issueRecordPersistence.parseAdminMonthlyInvoiceIssueRecordCreatePayload(
        issueRecordPayload("11111111-1111-4111-8111-111111111111"),
      );
    const parsedReservation =
      harness.reservationPersistence.parseAdminMonthlyInvoiceNumberReservationPayload(
        reservationPayload("11111111-1111-4111-8111-111111111111"),
      );

    if (!parsedIssueReview.ok || !parsedIssueRecord.ok || !parsedReservation.ok) {
      failSafely("safe_monthly_invoice_number_reservation_payload_rejected_before_live_write", {
        issueRecordPayloadOk: parsedIssueRecord.ok,
        issueReviewPayloadOk: parsedIssueReview.ok,
        reservationPayloadOk: parsedReservation.ok,
        verificationDraftId: fakeDraftId,
      });
    }

    const blockedAnonymous = await readResponse(
      await harness.reservationRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-invoice-number-reservations",
          reservationPayload("11111111-1111-4111-8111-111111111111"),
          {},
        ),
      ),
    );
    const blockedCustomerReferer = await readResponse(
      await harness.reservationRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-invoice-number-reservations",
          reservationPayload("11111111-1111-4111-8111-111111111111"),
          {
            ...adminHeaders(),
            referer: "http://localhost/book",
          },
        ),
      ),
    );
    const blockedDriverReferer = await readResponse(
      await harness.reservationRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-invoice-number-reservations",
          reservationPayload("11111111-1111-4111-8111-111111111111"),
          {
            ...adminHeaders(),
            referer: "http://localhost/driver-job-demo",
          },
        ),
      ),
    );

    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "true";

    const unsafePayloadResult = await readResponse(
      await harness.reservationRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-invoice-number-reservations",
          {
            ...reservationPayload("11111111-1111-4111-8111-111111111111"),
            payment_link: "https://example.invalid/pay",
          },
          adminHeaders(),
        ),
      ),
    );

    if (
      blockedAnonymous.status !== 403 ||
      blockedCustomerReferer.status !== 403 ||
      blockedDriverReferer.status !== 403 ||
      unsafePayloadResult.status !== 400
    ) {
      failSafely("monthly_invoice_number_reservation_route_safety_gate_failed_before_live_write", {
        anonymousGate: safeResultName(blockedAnonymous),
        customerRefererGate: safeResultName(blockedCustomerReferer),
        driverRefererGate: safeResultName(blockedDriverReferer),
        unsafePayloadGate: safeResultName(unsafePayloadResult),
        verificationDraftId: fakeDraftId,
      });
    }

    await writeLiveAttemptMarker();

    const cleanupClient = cleanupClientFromEnv();

    await verifyNoPreExistingRows(cleanupClient);

    const parentDraft = await createExactParentDraft(cleanupClient);
    const issueReviewSaveResult = await readResponse(
      await harness.issueReviewRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-invoice-issue-reviews",
          issueReviewPayload(),
          adminHeaders(),
        ),
      ),
    );
    const issueReviewId = issueReviewSaveResult.body?.issue_review?.id;

    if (
      issueReviewSaveResult.status !== 200 ||
      issueReviewSaveResult.body?.ok !== true ||
      !issueReviewId ||
      !issueReviewRecordMatchesFake(issueReviewSaveResult.body.issue_review) ||
      safeRecordContainsUnsafeFields(issueReviewSaveResult.body.issue_review)
    ) {
      failSafely("controlled_monthly_invoice_number_reservation_review_save_failed_safely", {
        productionDbTouched: true,
        status: issueReviewSaveResult.status,
        verificationDraftId: fakeDraftId,
      });
    }

    const saveResult = await readResponse(
      await harness.issueRecordRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-invoice-issue-records",
          issueRecordPayload(issueReviewId),
          adminHeaders(),
        ),
      ),
    );
    const issueRecordId = saveResult.body?.issue_record?.id;

    if (
      saveResult.status !== 200 ||
      saveResult.body?.ok !== true ||
      !issueRecordId ||
      !issueRecordMatchesInitialFake(saveResult.body.issue_record, issueReviewId) ||
      safeRecordContainsUnsafeFields(saveResult.body.issue_record)
    ) {
      failSafely("controlled_monthly_invoice_number_reservation_issue_record_save_failed_safely", {
        productionDbTouched: true,
        status: saveResult.status,
        verificationDraftId: fakeDraftId,
      });
    }

    const reservationResult = await readResponse(
      await harness.reservationRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-invoice-number-reservations",
          reservationPayload(issueRecordId),
          adminHeaders(),
        ),
      ),
    );

    if (
      reservationResult.status !== 200 ||
      reservationResult.body?.ok !== true ||
      !reservationResultMatchesFake(
        reservationResult.body.invoice_number_reservation,
        issueRecordId,
      ) ||
      safeRecordContainsUnsafeFields(reservationResult.body.invoice_number_reservation)
    ) {
      failSafely("controlled_monthly_invoice_number_reservation_save_failed_safely", {
        productionDbTouched: true,
        status: reservationResult.status,
        verificationDraftId: fakeDraftId,
      });
    }

    const loadResult = await readResponse(
      await harness.issueRecordRoute.GET(
        getRequest(
          `http://localhost/api/admin-monthly-invoice-issue-records?issue_record_id=${issueRecordId}&invoice_number_status=reserved&limit=10&page=1`,
          adminHeaders(),
        ),
      ),
    );
    const loadedRecord = Array.isArray(loadResult.body?.issue_records)
      ? loadResult.body.issue_records.find((record) =>
          routeIssueRecordMatchesReservedFake(record, issueReviewId, issueRecordId),
        )
      : null;

    if (
      loadResult.status !== 200 ||
      loadResult.body?.ok !== true ||
      !loadedRecord ||
      safeRecordContainsUnsafeFields(loadedRecord)
    ) {
      failSafely("controlled_monthly_invoice_number_reservation_load_failed_safely", {
        productionDbTouched: true,
        status: loadResult.status,
        verificationDraftId: fakeDraftId,
      });
    }

    const directIssueRecordRows = await loadExactIssueRecordRows(cleanupClient);
    const directSequenceRows = await loadExactSequenceRowsByAccount(cleanupClient);

    if (
      directIssueRecordRows.length !== 1 ||
      !issueRecordMatchesReservedFake(directIssueRecordRows[0], issueReviewId, issueRecordId) ||
      directSequenceRows.length !== 1 ||
      !sequenceRecordMatchesReservedFake(directSequenceRows[0]) ||
      safeRecordContainsUnsafeFields(directIssueRecordRows[0]) ||
      safeRecordContainsUnsafeFields(directSequenceRows[0])
    ) {
      failSafely("controlled_monthly_invoice_number_reservation_direct_load_failed_safely", {
        matchedIssueRecordRows: directIssueRecordRows.length,
        matchedSequenceRows: directSequenceRows.length,
        productionDbTouched: true,
        verificationDraftId: fakeDraftId,
      });
    }

    const cleanupResult = await cleanupExactFakeRows(issueReviewId, issueRecordId);
    const postCleanupRouteLoad = await readResponse(
      await harness.issueRecordRoute.GET(
        getRequest(
          `http://localhost/api/admin-monthly-invoice-issue-records?issue_record_id=${issueRecordId}&limit=10&page=1`,
          adminHeaders(),
        ),
      ),
    );

    if (
      postCleanupRouteLoad.status !== 200 ||
      postCleanupRouteLoad.body?.ok !== true ||
      !Array.isArray(postCleanupRouteLoad.body.issue_records) ||
      postCleanupRouteLoad.body.issue_records.length !== 0
    ) {
      failSafely("controlled_monthly_invoice_number_reservation_post_cleanup_route_load_failed", {
        matchedRows: Array.isArray(postCleanupRouteLoad.body?.issue_records)
          ? postCleanupRouteLoad.body.issue_records.length
          : null,
        productionDbTouched: true,
        verificationDraftId: fakeDraftId,
      });
    }

    forcePersistenceOff();

    const finalEnv = parseEnvFile(await readFile(path.join(process.cwd(), validation.envFileName), "utf8"));

    if (normalizedEnvValue(finalEnv.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "false") {
      failSafely("local_env_persistence_default_not_off_after_monthly_invoice_number_reservation_verification", {
        productionDbTouched: true,
        verificationDraftId: fakeDraftId,
      });
    }

    emitEvidence({
      cleanupRollback: {
        cleanupDeletedExactFakeIssueRecordRow: true,
        cleanupDeletedExactFakeIssueReviewRow: true,
        cleanupDeletedExactFakeParentDraftRow: true,
        cleanupDeletedExactFakeSequenceRow: true,
        cleanupMethod:
          "Supabase JS exact deletes scoped by issue_record_id, issue_review_id, draft_id, customer_account, billing_month, invoice_prefix, and invoice_sequence_number",
        cleanupScope: [
          "issue_record_id",
          "issue_review_id",
          "draft_id",
          "customer_account",
          "billing_month",
          "invoice_prefix",
          "invoice_sequence_number",
        ],
        deletedIssueRecordRows: cleanupResult.deletedIssueRecordRows,
        deletedIssueReviewRows: cleanupResult.deletedIssueReviewRows,
        deletedParentRows: cleanupResult.deletedParentRows,
        deletedSequenceRows: cleanupResult.deletedSequenceRows,
        envFileChanged: false,
        persistenceDefaultAfter: "off",
        postCleanupDirectIssueRecordRows: cleanupResult.postIssueRecordCleanupRows,
        postCleanupDirectIssueReviewRows: cleanupResult.postIssueReviewCleanupRows,
        postCleanupDirectParentRows: cleanupResult.postParentCleanupRows,
        postCleanupDirectSequenceAccountRows: cleanupResult.postSequenceAccountRows,
        postCleanupDirectSequencePrefixRows: cleanupResult.postSequencePrefixRows,
        postCleanupRouteLoadMatchedRows: 0,
        processKillSwitchAfter: "off",
      },
      env: {
        checkedEnvCandidates: validation.checked,
        envFileName: validation.envFileName,
        persistenceDefaultBefore: "off",
        requiredEnvNamesPresent: requiredEnvKeys,
        valuesPrinted: false,
      },
      fakeInvoiceIssueRecord: {
        billing_month: fakeBillingMonth,
        customer_account: fakeCustomerAccount,
        draft_id: fakeDraftId,
        invoice_number: fakeExpectedInvoiceNumber,
        invoice_number_status: "reserved",
        invoice_prefix: fakeInvoicePrefix,
        invoice_sequence_number: 1,
        issue_record_status_after_reservation: fakeIssueRecordReservedStatus,
        issue_record_status_before_reservation: fakeIssueRecordInitialStatus,
        issue_review_id: issueReviewId,
        safeFieldsOnly: true,
      },
      fakeInvoiceIssueReview: {
        createdOnlyForForeignKey: true,
        issue_review_id: issueReviewId,
        safeFieldsOnly: true,
      },
      fakeParentInvoiceDraft: {
        createdOnlyForForeignKey: true,
        draft_id: parentDraft.id,
        safeFieldsOnly: true,
      },
      fakeSequence: {
        customer_account: fakeCustomerAccount,
        invoice_prefix: fakeInvoicePrefix,
        last_reserved_invoice_number: fakeExpectedInvoiceNumber,
        last_reserved_sequence_number: 1,
        next_sequence_number_after_reservation: 2,
        safeFieldsOnly: true,
      },
      fullProjectRefPrinted: false,
      liveApiRouteVerificationAttemptCount: 1,
      maskedProductionProjectRef: validation.maskedProjectRef,
      noAutomaticPayment: true,
      noBillingGateway: true,
      noBroadProductionWrites: true,
      noCustomerDriverAuthActivation: true,
      noExternalNotificationSending: true,
      noMigration: true,
      noPdfGenerationOrSending: true,
      noPayout: true,
      noRawSql: true,
      noRealBookingsCustomersOrChildRowsTouched: true,
      noSecretsPrinted: true,
      noSupabaseCli: true,
      ok: true,
      productionDbTouched: true,
      result: {
        adminApiRouteIssueRecordLoad: safeResultName(loadResult),
        adminApiRouteIssueRecordSave: safeResultName(saveResult),
        adminApiRouteReservation: safeResultName(reservationResult),
        anonymousGate: safeResultName(blockedAnonymous),
        customerRefererGate: safeResultName(blockedCustomerReferer),
        driverRefererGate: safeResultName(blockedDriverReferer),
        exactCleanup: "passed",
        issueReviewRouteSave: safeResultName(issueReviewSaveResult),
        postCleanupLoad: safeResultName(postCleanupRouteLoad),
        rowDataPrinted: false,
        unsafePayloadGate: safeResultName(unsafePayloadResult),
      },
      stage: "monthly-invoice-number-reservation-production-verification",
      targetMatchesPriorProductionEvidence: true,
      touchScope: [
        "one direct fake parent monthly_invoice_drafts row inserted only to satisfy the required draft_id foreign key",
        "one admin-gated POST save through /api/admin-monthly-invoice-issue-reviews to create the required fake issue-review parent",
        "one admin-gated POST save through /api/admin-monthly-invoice-issue-records to create the required reservable fake issue record",
        "one admin-gated POST through /api/admin-monthly-invoice-number-reservations to reserve one invoice number",
        "one admin-gated GET load through /api/admin-monthly-invoice-issue-records for the exact fake issue_record_id",
        "one exact cleanup delete scoped to monthly_invoice_issue_records by id, issue_review_id, draft_id, customer_account, billing_month, invoice_prefix, and invoice_sequence_number",
        "one exact cleanup delete scoped to monthly_invoice_issue_reviews by id, draft_id, customer_account, and billing_month",
        "one exact cleanup delete scoped to monthly_invoice_drafts by id, customer_account, and billing_month",
        "one exact cleanup delete scoped to customer_invoice_sequences by customer_account, invoice_prefix, invoice number, and sequence number",
        "one admin-gated GET load after cleanup to confirm no exact fake issue-record row remains",
      ],
      unsafeFieldsWritten: false,
      verificationDraftId: fakeDraftId,
      writtenScope: {
        bookings: "none",
        customerContacts: "none",
        customers: "none",
        externalNotificationSends: "none",
        invoicePdf: "none",
        monthlyInvoiceDrafts:
          "one exact fake parent row only, created for the required issue-review and issue-record foreign keys and then deleted",
        monthlyInvoiceIssueRecords:
          "one clearly marked fake issue-record row only, reserved through the approved sequence API and then deleted",
        monthlyInvoiceIssueReviews:
          "one exact fake parent issue-review row only, created for the required issue-record foreign key and then deleted",
        monthlyInvoiceNumberSequences:
          "one exact fake customer_invoice_sequences row only, created by the approved reservation RPC and then deleted",
        payments: "none",
        payouts: "none",
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
      stage: "monthly-invoice-number-reservation-production-verification",
      ...error.extra,
    });
    process.exit(1);
  }

  emitEvidence({
    error: "unexpected_monthly_invoice_number_reservation_production_runner_failure_sanitized",
    ok: false,
    persistenceDefaultAfter: "off",
    stage: "monthly-invoice-number-reservation-production-verification",
    ...sanitizedUnexpectedError(error),
  });
  process.exit(1);
});
