import { constants, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const approvalEnvName =
  "PRESTIGE_ADMIN_MONTHLY_INVOICE_BILLABLE_ITEM_PRICE_REVIEW_PRODUCTION_SAVE_LOAD_APPROVED";
const approvalValue = "stage-billable-price-review-william-approved";
const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];
const expectedMaskedProductionProjectRef = "kvv...atm";
const fakeDraftId = "99999999-9999-4999-8999-999999999981";
const fakeDraftTripLinkId = "99999999-9999-4999-8999-999999999982";
const fakeItemReviewId = "99999999-9999-4999-8999-999999999983";
const fakeCustomerAccount = "SAFE BILLABLE PRICE REVIEW VERIFY 20260610 ACCOUNT";
const fakeBillingMonth = "2026-06";
const fakeBookingReference = "SAFE-BILLABLE-PRICE-VERIFY-20260610-DSP-001";
const fakeBookingType = "DSP";
const fakeBillingItemType = "base_trip";
const fakeCalculationBasis = "dsp_actual_time";
const fakePriceReviewStatus = "approved_for_invoice_draft";
const fakePriceDecision = "include_in_invoice";
const fakeReviewedCustomerAmountCents = 28800;
const fakeDspTotalMinutes = 240;
const fakeDspBillableMinutes = 210;
const fakeDraftStatus = "pending_admin_review";
const fakeReadinessStatus = "ready";
const fakeReadyCount = 1;
const fakeBlockedCount = 0;
const fakeTotalCount = 1;
const fakeSourcePriceContext = {
  booking_type: fakeBookingType,
  calculation_basis: fakeCalculationBasis,
  dsp_billable_minutes: fakeDspBillableMinutes,
  dsp_total_minutes: fakeDspTotalMinutes,
  source: "controlled_billable_price_review_verification",
  verification_scope: "safe_billable_item_price_review_only",
};
const fakeSafePriceReviewContext = {
  next_action: "Load back, then clean up exact fake billable price review chain.",
  price_review_summary: "Safe DSP actual-time billable price review verification row.",
  review_status: "Controlled verification.",
};
const fakeSafePriceReviewNote =
  "Controlled live billable item price review verification only.";
const fakeSafeItemReviewContext = {
  item_review_summary: "Safe parent item review row for billable price review verification.",
  next_action: "Clean up exact parent item review after billable price review cleanup.",
  review_status: "Controlled verification parent.",
};
const liveAttemptMarkerPath = path.join(
  os.tmpdir(),
  "prestige-monthly-invoice-billable-price-review-live-write-attempted.marker",
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
  "lib/admin-monthly-invoice-draft-lock-enforcement.ts",
  "lib/admin-monthly-invoice-billable-item-price-review-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-monthly-invoice-billable-item-price-reviews/route.ts",
];
const unsafeEvidencePattern =
  /customer_price|customer_charge|quoted_price|rate_amount|fare_amount|amount_due|billing_amount|billing_rate|final_invoice|issued_invoice|invoice_number|full_invoice_number|payment|payment_link|pdf|stripe|paynow|driver_payout|payout|finance_note|internal_finance_note|notification|telegram|sms_send|email_send|proof|photo|live_location|auth_link|customer_auth|driver_auth|raw_ai_prompt|raw_parser_prompt|parser_learning|parser_debug|service_role|server_only|server_secret|internal_admin_note|admin_note|internal_note|token|secret/i;

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

    const validation = validateLoadedEnv(parseEnvFile(await readFile(candidatePath, "utf8")), envFileName);

    checked.push(envCandidateSummary(envFileName, validation, true));

    if (validation.ok) {
      return {
        ...validation,
        checked,
      };
    }
  }

  failSafely("monthly_invoice_billable_price_review_production_env_preflight_failed", {
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-monthly-billable-price-live-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    priceReviewPersistence: require(path.join(
      tempDir,
      "lib/admin-monthly-invoice-billable-item-price-review-persistence.js",
    )),
    route: require(path.join(
      tempDir,
      "app/api/admin-monthly-invoice-billable-item-price-reviews/route.js",
    )),
  };
}

function priceReviewPayload() {
  return {
    billing_item_type: fakeBillingItemType,
    booking_reference: fakeBookingReference,
    booking_type: fakeBookingType,
    calculation_basis: fakeCalculationBasis,
    currency: "SGD",
    draft_id: fakeDraftId,
    draft_trip_link_id: fakeDraftTripLinkId,
    dsp_billable_minutes: fakeDspBillableMinutes,
    dsp_total_minutes: fakeDspTotalMinutes,
    item_review_id: fakeItemReviewId,
    price_decision: fakePriceDecision,
    price_review_status: fakePriceReviewStatus,
    reviewed_customer_amount_cents: fakeReviewedCustomerAmountCents,
    safe_price_review_context: fakeSafePriceReviewContext,
    safe_price_review_note: fakeSafePriceReviewNote,
    source_price_context: fakeSourcePriceContext,
  };
}

function parentDraftPayload() {
  return {
    actor_label: "Billable price review verification",
    actor_role: "admin",
    billing_month: fakeBillingMonth,
    blocked_count: fakeBlockedCount,
    customer_account: fakeCustomerAccount,
    customer_id: "safe-billable-price-review-verify-customer",
    draft_status: fakeDraftStatus,
    id: fakeDraftId,
    ready_count: fakeReadyCount,
    readiness_status: fakeReadinessStatus,
    safe_draft_context: {
      draft_summary: "Safe parent row for billable price review verification.",
      next_action: "Clean up exact parent after billable price review cleanup.",
    },
    safe_draft_note: "Controlled billable price review parent row only.",
    source_grouping_summary: {
      blocked_count: fakeBlockedCount,
      ready_count: fakeReadyCount,
      total_count: fakeTotalCount,
      verification_scope: "safe_billable_price_review_parent_only",
    },
    source_surface: "admin_api",
    total_count: fakeTotalCount,
    updated_at: new Date().toISOString(),
  };
}

function tripLinkPayload() {
  return {
    billing_prep_readiness: "ready",
    booking_reference: fakeBookingReference,
    closeout_id: null,
    closeout_status: "closed",
    draft_id: fakeDraftId,
    id: fakeDraftTripLinkId,
    safe_trip_context: {
      source: "controlled billable price review verification",
      verification_scope: "safe_billable_price_review_trip_link_only",
    },
    trip_readiness_status: "ready",
    updated_at: new Date().toISOString(),
  };
}

function itemReviewPayload() {
  return {
    actor_label: "Billable price review verification",
    actor_role: "admin",
    billing_item_decision: "include_in_draft",
    booking_reference: fakeBookingReference,
    draft_id: fakeDraftId,
    draft_trip_link_id: fakeDraftTripLinkId,
    extra_charge_review_status: "none",
    id: fakeItemReviewId,
    item_review_status: "reviewed",
    safe_item_review_context: fakeSafeItemReviewContext,
    safe_item_review_note: "Controlled billable price review parent item-review row only.",
    source_surface: "admin_api",
    source_trip_summary: {
      billing_prep_readiness: "ready",
      booking_reference: fakeBookingReference,
      closeout_status: "closed",
      source: "monthly_invoice_draft_trip_link",
      verification_scope: "safe_billable_price_review_item_parent_only",
    },
    trip_detail_review_status: "reviewed",
    updated_at: new Date().toISOString(),
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

function priceReviewRecordMatchesFake(row) {
  return (
    row?.billing_item_type === fakeBillingItemType &&
    row?.booking_reference === fakeBookingReference &&
    row?.booking_type === fakeBookingType &&
    row?.calculation_basis === fakeCalculationBasis &&
    row?.currency === "SGD" &&
    row?.draft_id === fakeDraftId &&
    row?.draft_trip_link_id === fakeDraftTripLinkId &&
    row?.dsp_billable_minutes === fakeDspBillableMinutes &&
    row?.dsp_total_minutes === fakeDspTotalMinutes &&
    row?.item_review_id === fakeItemReviewId &&
    row?.price_decision === fakePriceDecision &&
    row?.price_review_status === fakePriceReviewStatus &&
    row?.reviewed_customer_amount_cents === fakeReviewedCustomerAmountCents &&
    row?.safe_price_review_context?.price_review_summary ===
      fakeSafePriceReviewContext.price_review_summary &&
    row?.safe_price_review_context?.next_action === fakeSafePriceReviewContext.next_action &&
    row?.safe_price_review_context?.review_status === fakeSafePriceReviewContext.review_status &&
    row?.safe_price_review_note === fakeSafePriceReviewNote &&
    row?.source_price_context?.verification_scope === fakeSourcePriceContext.verification_scope &&
    row?.source_surface === "admin_api" &&
    ["admin", "dispatcher"].includes(row?.actor_role)
  );
}

function parentDraftRecordMatchesFake(row) {
  return (
    row?.id === fakeDraftId &&
    row?.billing_month === fakeBillingMonth &&
    row?.blocked_count === fakeBlockedCount &&
    row?.customer_account === fakeCustomerAccount &&
    row?.draft_status === fakeDraftStatus &&
    row?.ready_count === fakeReadyCount &&
    row?.readiness_status === fakeReadinessStatus &&
    row?.safe_draft_note === "Controlled billable price review parent row only." &&
    row?.source_surface === "admin_api" &&
    row?.actor_role === "admin" &&
    row?.total_count === fakeTotalCount
  );
}

function tripLinkRecordMatchesFake(row) {
  return (
    row?.id === fakeDraftTripLinkId &&
    row?.billing_prep_readiness === "ready" &&
    row?.booking_reference === fakeBookingReference &&
    row?.closeout_status === "closed" &&
    row?.draft_id === fakeDraftId &&
    row?.safe_trip_context?.verification_scope === "safe_billable_price_review_trip_link_only" &&
    row?.trip_readiness_status === "ready"
  );
}

function itemReviewRecordMatchesFake(row) {
  return (
    row?.id === fakeItemReviewId &&
    row?.billing_item_decision === "include_in_draft" &&
    row?.booking_reference === fakeBookingReference &&
    row?.draft_id === fakeDraftId &&
    row?.draft_trip_link_id === fakeDraftTripLinkId &&
    row?.extra_charge_review_status === "none" &&
    row?.item_review_status === "reviewed" &&
    row?.safe_item_review_context?.verification_scope !== "unsafe" &&
    row?.safe_item_review_note ===
      "Controlled billable price review parent item-review row only." &&
    row?.source_trip_summary?.verification_scope === "safe_billable_price_review_item_parent_only" &&
    row?.source_surface === "admin_api" &&
    row?.actor_role === "admin" &&
    row?.trip_detail_review_status === "reviewed"
  );
}

function safeRecordContainsUnsafeFields(row) {
  return unsafeEvidencePattern.test(JSON.stringify(row));
}

async function writeLiveAttemptMarker() {
  try {
    await writeFile(
      liveAttemptMarkerPath,
      `Monthly invoice billable price review controlled live write attempted for ${fakeDraftId}\n`,
      {
        flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        mode: 0o600,
      },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      failSafely("controlled_monthly_invoice_billable_price_review_live_write_already_attempted");
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

async function loadExactPriceReviewRows(client) {
  const { data, error } = await client
    .from("monthly_invoice_billable_item_price_reviews")
    .select(
      "id, draft_id, draft_trip_link_id, item_review_id, booking_reference, booking_type, billing_item_type, calculation_basis, price_review_status, price_decision, reviewed_customer_amount_cents, currency, dsp_total_minutes, dsp_billable_minutes, source_price_context, safe_price_review_note, safe_price_review_context, source_surface, actor_role, actor_label",
    )
    .eq("draft_id", fakeDraftId)
    .eq("booking_reference", fakeBookingReference)
    .eq("item_review_id", fakeItemReviewId)
    .eq("billing_item_type", fakeBillingItemType);

  if (error) {
    failSafely("controlled_monthly_invoice_billable_price_review_preselect_failed_safely", {
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function loadExactItemReviewRows(client) {
  const { data, error } = await client
    .from("monthly_invoice_draft_item_reviews")
    .select(
      "id, draft_id, draft_trip_link_id, booking_reference, item_review_status, trip_detail_review_status, extra_charge_review_status, billing_item_decision, source_trip_summary, safe_item_review_note, safe_item_review_context, source_surface, actor_role, actor_label",
    )
    .eq("id", fakeItemReviewId)
    .eq("draft_id", fakeDraftId)
    .eq("booking_reference", fakeBookingReference);

  if (error) {
    failSafely("controlled_monthly_invoice_billable_price_review_item_parent_preselect_failed_safely", {
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function loadExactTripLinkRows(client) {
  const { data, error } = await client
    .from("monthly_invoice_draft_trip_links")
    .select(
      "id, draft_id, booking_reference, closeout_id, trip_readiness_status, closeout_status, billing_prep_readiness, safe_trip_context",
    )
    .eq("id", fakeDraftTripLinkId)
    .eq("draft_id", fakeDraftId)
    .eq("booking_reference", fakeBookingReference);

  if (error) {
    failSafely("controlled_monthly_invoice_billable_price_review_trip_link_preselect_failed_safely", {
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  return Array.isArray(data) ? data : [];
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
    failSafely("controlled_monthly_invoice_billable_price_review_parent_preselect_failed_safely", {
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function createExactParentChain(client) {
  const existingParents = await loadExactParentDraftRows(client);
  const existingTripLinks = await loadExactTripLinkRows(client);
  const existingItemReviews = await loadExactItemReviewRows(client);
  const existingPriceReviews = await loadExactPriceReviewRows(client);

  if (
    existingParents.length !== 0 ||
    existingTripLinks.length !== 0 ||
    existingItemReviews.length !== 0 ||
    existingPriceReviews.length !== 0
  ) {
    failSafely("controlled_monthly_invoice_billable_price_review_fake_rows_already_exist", {
      existingItemReviewRows: existingItemReviews.length,
      existingParentRows: existingParents.length,
      existingPriceReviewRows: existingPriceReviews.length,
      existingTripLinkRows: existingTripLinks.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const { data: parentDraft, error: parentError } = await client
    .from("monthly_invoice_drafts")
    .insert(parentDraftPayload())
    .select(
      "id, customer_account, customer_id, billing_month, draft_status, readiness_status, ready_count, blocked_count, total_count, source_grouping_summary, safe_draft_note, safe_draft_context, source_surface, actor_role, actor_label",
    )
    .single();

  if (
    parentError ||
    !parentDraftRecordMatchesFake(parentDraft) ||
    safeRecordContainsUnsafeFields(parentDraft)
  ) {
    failSafely("controlled_monthly_invoice_billable_price_review_parent_create_failed_safely", {
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const { data: tripLink, error: tripLinkError } = await client
    .from("monthly_invoice_draft_trip_links")
    .insert(tripLinkPayload())
    .select(
      "id, draft_id, booking_reference, closeout_id, trip_readiness_status, closeout_status, billing_prep_readiness, safe_trip_context",
    )
    .single();

  if (
    tripLinkError ||
    !tripLinkRecordMatchesFake(tripLink) ||
    safeRecordContainsUnsafeFields(tripLink)
  ) {
    failSafely("controlled_monthly_invoice_billable_price_review_trip_link_create_failed_safely", {
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const { data: itemReview, error: itemReviewError } = await client
    .from("monthly_invoice_draft_item_reviews")
    .insert(itemReviewPayload())
    .select(
      "id, draft_id, draft_trip_link_id, booking_reference, item_review_status, trip_detail_review_status, extra_charge_review_status, billing_item_decision, source_trip_summary, safe_item_review_note, safe_item_review_context, source_surface, actor_role, actor_label",
    )
    .single();

  if (
    itemReviewError ||
    !itemReviewRecordMatchesFake(itemReview) ||
    safeRecordContainsUnsafeFields(itemReview)
  ) {
    failSafely("controlled_monthly_invoice_billable_price_review_item_parent_create_failed_safely", {
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  return {
    itemReview,
    parentDraft,
    tripLink,
  };
}

async function cleanupExactFakeRows({ requirePriceReview = true } = {}) {
  const client = cleanupClientFromEnv();
  const priceRows = await loadExactPriceReviewRows(client);

  if (
    priceRows.length > 1 ||
    (requirePriceReview && priceRows.length !== 1) ||
    (priceRows.length === 1 &&
      (!priceReviewRecordMatchesFake(priceRows[0]) || safeRecordContainsUnsafeFields(priceRows[0])))
  ) {
    failSafely("controlled_monthly_invoice_billable_price_review_cleanup_exact_match_failed", {
      matchedPriceReviewRows: priceRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  let deletedPriceRows = [];

  if (priceRows.length === 1) {
    const { data, error } = await client
      .from("monthly_invoice_billable_item_price_reviews")
      .delete()
      .eq("draft_id", fakeDraftId)
      .eq("booking_reference", fakeBookingReference)
      .eq("item_review_id", fakeItemReviewId)
      .eq("billing_item_type", fakeBillingItemType)
      .select("draft_id, item_review_id, booking_reference, booking_type, billing_item_type");

    if (error || !Array.isArray(data) || data.length !== 1) {
      failSafely("controlled_monthly_invoice_billable_price_review_cleanup_delete_failed_safely", {
        deletedPriceReviewRows: Array.isArray(data) ? data.length : 0,
        productionDbTouched: true,
        verificationDraftId: fakeDraftId,
      });
    }

    deletedPriceRows = data;
  }

  const postPriceCleanupRows = await loadExactPriceReviewRows(client);

  if (postPriceCleanupRows.length !== 0) {
    failSafely("controlled_monthly_invoice_billable_price_review_cleanup_verify_absent_failed", {
      remainingPriceReviewRows: postPriceCleanupRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const itemRows = await loadExactItemReviewRows(client);

  if (
    itemRows.length !== 1 ||
    !itemReviewRecordMatchesFake(itemRows[0]) ||
    safeRecordContainsUnsafeFields(itemRows[0])
  ) {
    failSafely("controlled_monthly_invoice_billable_price_review_item_parent_cleanup_exact_match_failed", {
      matchedItemReviewRows: itemRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const { data: deletedItemRows, error: itemDeleteError } = await client
    .from("monthly_invoice_draft_item_reviews")
    .delete()
    .eq("id", fakeItemReviewId)
    .eq("draft_id", fakeDraftId)
    .eq("booking_reference", fakeBookingReference)
    .select("id, draft_id, draft_trip_link_id, booking_reference, item_review_status");

  if (itemDeleteError || !Array.isArray(deletedItemRows) || deletedItemRows.length !== 1) {
    failSafely("controlled_monthly_invoice_billable_price_review_item_parent_cleanup_delete_failed_safely", {
      deletedItemReviewRows: Array.isArray(deletedItemRows) ? deletedItemRows.length : 0,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const postItemCleanupRows = await loadExactItemReviewRows(client);

  if (postItemCleanupRows.length !== 0) {
    failSafely("controlled_monthly_invoice_billable_price_review_item_parent_cleanup_verify_absent_failed", {
      remainingItemReviewRows: postItemCleanupRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const tripRows = await loadExactTripLinkRows(client);

  if (
    tripRows.length !== 1 ||
    !tripLinkRecordMatchesFake(tripRows[0]) ||
    safeRecordContainsUnsafeFields(tripRows[0])
  ) {
    failSafely("controlled_monthly_invoice_billable_price_review_trip_link_cleanup_exact_match_failed", {
      matchedTripLinkRows: tripRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const { data: deletedTripRows, error: tripDeleteError } = await client
    .from("monthly_invoice_draft_trip_links")
    .delete()
    .eq("id", fakeDraftTripLinkId)
    .eq("draft_id", fakeDraftId)
    .eq("booking_reference", fakeBookingReference)
    .select("id, draft_id, booking_reference, trip_readiness_status");

  if (tripDeleteError || !Array.isArray(deletedTripRows) || deletedTripRows.length !== 1) {
    failSafely("controlled_monthly_invoice_billable_price_review_trip_link_cleanup_delete_failed_safely", {
      deletedTripLinkRows: Array.isArray(deletedTripRows) ? deletedTripRows.length : 0,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const postTripCleanupRows = await loadExactTripLinkRows(client);

  if (postTripCleanupRows.length !== 0) {
    failSafely("controlled_monthly_invoice_billable_price_review_trip_link_cleanup_verify_absent_failed", {
      remainingTripLinkRows: postTripCleanupRows.length,
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
    failSafely("controlled_monthly_invoice_billable_price_review_parent_cleanup_exact_match_failed", {
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
    .select("id, customer_account, billing_month, draft_status");

  if (parentDeleteError || !Array.isArray(deletedParentRows) || deletedParentRows.length !== 1) {
    failSafely("controlled_monthly_invoice_billable_price_review_parent_cleanup_delete_failed_safely", {
      deletedParentRows: Array.isArray(deletedParentRows) ? deletedParentRows.length : 0,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  const postParentCleanupRows = await loadExactParentDraftRows(client);

  if (postParentCleanupRows.length !== 0) {
    failSafely("controlled_monthly_invoice_billable_price_review_parent_cleanup_verify_absent_failed", {
      remainingParentRows: postParentCleanupRows.length,
      productionDbTouched: true,
      verificationDraftId: fakeDraftId,
    });
  }

  return {
    deletedItemReviewRows: deletedItemRows.length,
    deletedParentRows: deletedParentRows.length,
    deletedPriceReviewRows: deletedPriceRows.length,
    deletedTripLinkRows: deletedTripRows.length,
    postItemCleanupRows: postItemCleanupRows.length,
    postParentCleanupRows: postParentCleanupRows.length,
    postPriceCleanupRows: postPriceCleanupRows.length,
    postTripCleanupRows: postTripCleanupRows.length,
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
    const parsed =
      harness.priceReviewPersistence.parseAdminMonthlyInvoiceBillableItemPriceReviewSavePayload(
        priceReviewPayload(),
      );

    if (!parsed.ok) {
      failSafely("safe_monthly_invoice_billable_price_review_payload_rejected_before_live_write", {
        verificationDraftId: fakeDraftId,
      });
    }

    const blockedAnonymous = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-monthly-invoice-billable-item-price-reviews?draft_id=${fakeDraftId}`,
          {},
        ),
      ),
    );
    const blockedCustomerReferer = await readResponse(
      await harness.route.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-invoice-billable-item-price-reviews",
          priceReviewPayload(),
          {
            ...adminHeaders(),
            referer: "http://localhost/book",
          },
        ),
      ),
    );
    const blockedDriverReferer = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-monthly-invoice-billable-item-price-reviews?draft_id=${fakeDraftId}`,
          {
            ...adminHeaders(),
            referer: "http://localhost/driver-job-demo",
          },
        ),
      ),
    );

    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "true";

    const unsafePayloadResult = await readResponse(
      await harness.route.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-invoice-billable-item-price-reviews",
          {
            ...priceReviewPayload(),
            safe_price_review_note: "Create payment link.",
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
      failSafely("monthly_invoice_billable_price_review_route_safety_gate_failed_before_live_write", {
        anonymousGate: safeResultName(blockedAnonymous),
        customerRefererGate: safeResultName(blockedCustomerReferer),
        driverRefererGate: safeResultName(blockedDriverReferer),
        unsafePayloadGate: safeResultName(unsafePayloadResult),
        verificationDraftId: fakeDraftId,
      });
    }

    await writeLiveAttemptMarker();

    const cleanupClient = cleanupClientFromEnv();
    const { itemReview, parentDraft, tripLink } = await createExactParentChain(cleanupClient);
    const preExistingLoad = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-monthly-invoice-billable-item-price-reviews?draft_id=${fakeDraftId}&booking_reference=${encodeURIComponent(
            fakeBookingReference,
          )}&item_review_id=${fakeItemReviewId}&billing_item_type=${fakeBillingItemType}&limit=10&page=1`,
          adminHeaders(),
        ),
      ),
    );

    if (
      preExistingLoad.status !== 200 ||
      preExistingLoad.body?.ok !== true ||
      !Array.isArray(preExistingLoad.body.price_reviews) ||
      preExistingLoad.body.price_reviews.length !== 0
    ) {
      await cleanupExactFakeRows({ requirePriceReview: false });
      failSafely("monthly_invoice_billable_price_review_fake_reference_already_exists_or_preload_failed", {
        matchedRows: Array.isArray(preExistingLoad.body?.price_reviews)
          ? preExistingLoad.body.price_reviews.length
          : null,
        productionDbTouched: true,
        verificationDraftId: fakeDraftId,
      });
    }

    const saveResult = await readResponse(
      await harness.route.POST(
        requestWithJson(
          "http://localhost/api/admin-monthly-invoice-billable-item-price-reviews",
          priceReviewPayload(),
          adminHeaders(),
        ),
      ),
    );

    if (
      saveResult.status !== 200 ||
      saveResult.body?.ok !== true ||
      !priceReviewRecordMatchesFake(saveResult.body.price_review) ||
      safeRecordContainsUnsafeFields(saveResult.body.price_review)
    ) {
      await cleanupExactFakeRows({ requirePriceReview: false });
      failSafely("controlled_monthly_invoice_billable_price_review_save_failed_safely", {
        productionDbTouched: true,
        status: saveResult.status,
        verificationDraftId: fakeDraftId,
      });
    }

    const loadResult = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-monthly-invoice-billable-item-price-reviews?draft_id=${fakeDraftId}&booking_reference=${encodeURIComponent(
            fakeBookingReference,
          )}&item_review_id=${fakeItemReviewId}&booking_type=${fakeBookingType}&price_review_status=${fakePriceReviewStatus}&price_decision=${fakePriceDecision}&limit=10&page=1`,
          adminHeaders(),
        ),
      ),
    );
    const loadedRecord = Array.isArray(loadResult.body?.price_reviews)
      ? loadResult.body.price_reviews.find((record) => priceReviewRecordMatchesFake(record))
      : null;

    if (
      loadResult.status !== 200 ||
      loadResult.body?.ok !== true ||
      !loadedRecord ||
      safeRecordContainsUnsafeFields(loadedRecord)
    ) {
      await cleanupExactFakeRows();
      failSafely("controlled_monthly_invoice_billable_price_review_load_failed_safely", {
        productionDbTouched: true,
        status: loadResult.status,
        verificationDraftId: fakeDraftId,
      });
    }

    const cleanupResult = await cleanupExactFakeRows();
    const postCleanupRouteLoad = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-monthly-invoice-billable-item-price-reviews?draft_id=${fakeDraftId}&booking_reference=${encodeURIComponent(
            fakeBookingReference,
          )}&item_review_id=${fakeItemReviewId}&limit=10&page=1`,
          adminHeaders(),
        ),
      ),
    );

    if (
      postCleanupRouteLoad.status !== 200 ||
      postCleanupRouteLoad.body?.ok !== true ||
      !Array.isArray(postCleanupRouteLoad.body.price_reviews) ||
      postCleanupRouteLoad.body.price_reviews.length !== 0
    ) {
      failSafely("controlled_monthly_invoice_billable_price_review_post_cleanup_route_load_failed", {
        matchedRows: Array.isArray(postCleanupRouteLoad.body?.price_reviews)
          ? postCleanupRouteLoad.body.price_reviews.length
          : null,
        productionDbTouched: true,
        verificationDraftId: fakeDraftId,
      });
    }

    forcePersistenceOff();

    const finalEnv = parseEnvFile(await readFile(path.join(process.cwd(), validation.envFileName), "utf8"));

    if (normalizedEnvValue(finalEnv.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "false") {
      failSafely("local_env_persistence_default_not_off_after_monthly_invoice_billable_price_review_verification", {
        productionDbTouched: true,
        verificationDraftId: fakeDraftId,
      });
    }

    emitEvidence({
      cleanupRollback: {
        cleanupDeletedExactFakeItemReviewRow: true,
        cleanupDeletedExactFakeParentDraftRow: true,
        cleanupDeletedExactFakePriceReviewRow: true,
        cleanupDeletedExactFakeTripLinkRow: true,
        cleanupMethod:
          "Supabase JS exact draft_id, item_review_id, billing_item_type, booking_reference, trip_link id, customer_account, and billing_month deletes",
        cleanupScope: [
          "draft_id",
          "draft_trip_link_id",
          "item_review_id",
          "billing_item_type",
          "booking_reference",
          "customer_account",
          "billing_month",
        ],
        deletedItemReviewRows: cleanupResult.deletedItemReviewRows,
        deletedParentRows: cleanupResult.deletedParentRows,
        deletedPriceReviewRows: cleanupResult.deletedPriceReviewRows,
        deletedTripLinkRows: cleanupResult.deletedTripLinkRows,
        envFileChanged: false,
        persistenceDefaultAfter: "off",
        postCleanupDirectItemReviewRows: cleanupResult.postItemCleanupRows,
        postCleanupDirectParentRows: cleanupResult.postParentCleanupRows,
        postCleanupDirectPriceReviewRows: cleanupResult.postPriceCleanupRows,
        postCleanupDirectTripLinkRows: cleanupResult.postTripCleanupRows,
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
      fakeBillablePriceReview: {
        billing_item_type: fakeBillingItemType,
        booking_reference: fakeBookingReference,
        booking_type: fakeBookingType,
        calculation_basis: fakeCalculationBasis,
        dsp_billable_minutes: fakeDspBillableMinutes,
        dsp_total_minutes: fakeDspTotalMinutes,
        item_review_id: fakeItemReviewId,
        price_decision: fakePriceDecision,
        price_review_status: fakePriceReviewStatus,
        reviewed_customer_amount_cents: fakeReviewedCustomerAmountCents,
        safeFieldsOnly: true,
      },
      fakeParentInvoiceDraft: {
        createdOnlyForForeignKey: true,
        draft_id: parentDraft.id,
        safeFieldsOnly: true,
      },
      fakeParentItemReview: {
        createdOnlyForForeignKey: true,
        item_review_id: itemReview.id,
        safeFieldsOnly: true,
      },
      fakeParentTripLink: {
        createdOnlyForForeignKey: true,
        draft_trip_link_id: tripLink.id,
        safeFieldsOnly: true,
      },
      fullProjectRefPrinted: false,
      liveApiRouteVerificationAttemptCount: 1,
      maskedProductionProjectRef: validation.maskedProjectRef,
      noBillingActivationPaymentPdfPayoutLocationParserLearning: true,
      noBroadProductionWrites: true,
      noCustomerDriverAuthActivation: true,
      noExternalNotificationSending: true,
      noRawSql: true,
      noRealBookingsCustomersOrUnrelatedRowsTouched: true,
      noSecretsPrinted: true,
      ok: true,
      productionDbTouched: true,
      result: {
        adminApiRouteLoad: safeResultName(loadResult),
        adminApiRouteSave: safeResultName(saveResult),
        anonymousGate: safeResultName(blockedAnonymous),
        customerRefererGate: safeResultName(blockedCustomerReferer),
        driverRefererGate: safeResultName(blockedDriverReferer),
        exactCleanup: "passed",
        postCleanupLoad: safeResultName(postCleanupRouteLoad),
        rowDataPrinted: false,
        unsafePayloadGate: safeResultName(unsafePayloadResult),
      },
      stage: "monthly-invoice-billable-price-review-production-verification",
      supabaseCliInsideRunner: false,
      targetMatchesPriorProductionEvidence: true,
      touchScope: [
        "one direct fake parent monthly_invoice_drafts row inserted only to satisfy the required draft_id foreign key",
        "one direct fake monthly_invoice_draft_trip_links row inserted only to satisfy the draft_trip_link_id foreign key",
        "one direct fake monthly_invoice_draft_item_reviews row inserted only to satisfy the required item_review_id foreign key",
        "one admin-gated POST save through /api/admin-monthly-invoice-billable-item-price-reviews",
        "one admin-gated GET load through /api/admin-monthly-invoice-billable-item-price-reviews for the exact fake draft id, item review id, and booking reference",
        "one exact cleanup delete scoped to monthly_invoice_billable_item_price_reviews by draft_id, item_review_id, billing_item_type, and booking_reference",
        "one exact cleanup delete scoped to monthly_invoice_draft_item_reviews by id, draft_id, and booking_reference",
        "one exact cleanup delete scoped to monthly_invoice_draft_trip_links by id, draft_id, and booking_reference",
        "one exact cleanup delete scoped to monthly_invoice_drafts by id, customer_account, and billing_month",
        "one admin-gated GET load after cleanup to confirm no exact fake billable price review remains",
      ],
      unsafeFieldsWritten: false,
      verificationDraftId: fakeDraftId,
      verificationReference: fakeBookingReference,
      writtenScope: {
        bookings: "none",
        customerContacts: "none",
        customers: "none",
        externalNotificationSends: "none",
        monthlyInvoiceBillableItemPriceReviews:
          "one clearly marked fake billable price review row only",
        monthlyInvoiceDraftItemReviews:
          "one exact fake parent item review row only, created for the required billable price review foreign key and then deleted",
        monthlyInvoiceDraftTripLinks:
          "one exact fake trip link row only, created for the required foreign key and then deleted",
        monthlyInvoiceDrafts:
          "one exact fake parent row only, created for the required foreign key and then deleted",
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
      stage: "monthly-invoice-billable-price-review-production-verification",
      ...error.extra,
    });
    process.exit(1);
  }

  emitEvidence({
    error: "unexpected_monthly_invoice_billable_price_review_production_save_load_runner_failure_sanitized",
    ok: false,
    persistenceDefaultAfter: "off",
    stage: "monthly-invoice-billable-price-review-production-verification",
  });
  process.exit(1);
});
