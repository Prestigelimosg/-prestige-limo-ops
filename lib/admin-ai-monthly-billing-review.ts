import "server-only";

import {
  adminDispatcherBoundaryToPersistenceAdapterActor,
  type AdminBookingPersistenceAdapterActor,
} from "./admin-booking-supabase-adapter";
import type { AdminDispatcherBoundaryContext } from "./admin-dispatcher-auth-boundary";
import {
  loadAdminMonthlyBillingDraftPlans,
  type AdminMonthlyBillingDraftPlanRecord,
} from "./admin-monthly-billing-draft-plan-persistence";
import {
  loadAdminMonthlyBillingGroups,
  type AdminMonthlyBillingGroup,
} from "./admin-monthly-billing-grouping-read";
import {
  loadAdminMonthlyInvoiceDrafts,
  type AdminMonthlyInvoiceDraftRecord,
} from "./admin-monthly-invoice-draft-persistence";
import {
  loadAdminMonthlyInvoiceIssueRecords,
  type AdminMonthlyInvoiceIssueRecordRecord,
} from "./admin-monthly-invoice-issue-record-persistence";
import {
  loadAdminRateSetup,
  type AdminRateSetupBooker,
  type AdminRateSetupCompany,
} from "./admin-rate-setup-read";

export const adminAiMonthlyBillingReviewIntent = "find_monthly_billing_review";
export const adminAiMonthlyBillingReviewPageSize = 10;

export type AdminAiMonthlyBillingReviewStatus =
  | "already_invoiced"
  | "blocked"
  | "locked"
  | "pending_admin_review"
  | "ready";

export type AdminAiMonthlyBillingReviewReference = {
  booking_reference: string;
  display_booking_reference: string;
  reason: string;
  status: "Already invoiced" | "Blocked" | "Ready";
};

export type AdminAiMonthlyBillingReviewRow = {
  already_invoiced_count: number;
  billing_month: string;
  blocked_count: number;
  blocked_reasons: string[];
  booker_id: number | null;
  booker_name: string | null;
  company_id: number | null;
  company_name: string | null;
  customer_id: number | null;
  draft_plan_status: string | null;
  identity_status: "manual_review" | "verified";
  invoice_draft_status: string | null;
  locked: boolean;
  open_customer_path: string | null;
  ready_count: number;
  reference_count: number;
  references: AdminAiMonthlyBillingReviewReference[];
  row_key: string;
  status: AdminAiMonthlyBillingReviewStatus;
  total_count: number;
};

export type AdminAiMonthlyBillingReviewResult = {
  answer: string;
  billing_month: string;
  has_more: boolean;
  intent: typeof adminAiMonthlyBillingReviewIntent;
  page: number;
  page_size: typeof adminAiMonthlyBillingReviewPageSize;
  query: string;
  read_at: string;
  rows: AdminAiMonthlyBillingReviewRow[];
  status: "blocked" | "empty" | "results";
  total_count: number;
};

export type AdminAiMonthlyBillingReviewExecution =
  | { matched: false }
  | { data: AdminAiMonthlyBillingReviewResult; matched: true; ok: true }
  | { error: string; matched: true; ok: false; status: 403 | 500 | 503 };

export type AdminAiMonthlyBillingReviewSnapshot = {
  bookers: AdminRateSetupBooker[];
  companies: AdminRateSetupCompany[];
  draftPlans: AdminMonthlyBillingDraftPlanRecord[];
  groups: AdminMonthlyBillingGroup[];
  invoiceDrafts: AdminMonthlyInvoiceDraftRecord[];
  issueRecords: AdminMonthlyInvoiceIssueRecordRecord[];
};

export type AdminAiMonthlyBillingReviewDependencies = {
  loadSnapshot(
    actor: AdminBookingPersistenceAdapterActor,
    billingMonth: string,
  ): Promise<AdminAiMonthlyBillingReviewSnapshot>;
};

type ParsedMonthlyBillingReview = {
  billingMonth: string;
  kind: "attention" | "review";
  query: string;
};

type RowSeed = {
  draftPlan: AdminMonthlyBillingDraftPlanRecord | null;
  group: AdminMonthlyBillingGroup | null;
  invoiceDraft: AdminMonthlyInvoiceDraftRecord | null;
  seedKey: string;
};

const allowedActorRoles = new Set(["admin", "dispatcher"]);
const maxSourceRows = 250;
const manualIdentityReason = "Verified Company and Booker identity is missing or incomplete.";
const safeReadError = "Monthly billing review failed safely. No draft, invoice, booking, or schedule was changed.";
const blockedActionPattern =
  /\b(?:archive|cancel|charge|create|delete|email|generate|issue|mark|modify|pay|prepare|refund|rerun|run|save|schedule|send|set|trigger|update|write)\b/i;
const injectionPattern =
  /(?:ignore\s+(?:all\s+)?(?:previous|prior)|system\s+prompt|developer\s+message|service[_\s-]?role|api[_\s-]?key|database\s+credential|\b(?:drop|insert|select|update|delete)\s+(?:table|from|into|monthly_billing_draft_plans|monthly_invoice_drafts)\b)/i;
const reviewPattern = /^show(?:\s+me)?\s+monthly\s+billing\s+review(?:\s+for\s+(.+?))?[\s?.!]*$/i;
const attentionPattern = /^which\s+monthly\s+billing\s+drafts\s+need\s+attention(?:\s+for\s+(.+?))?[\s?.!]*$/i;
const nonLockingIssueRecordStatuses = new Set(["archived", "voided"]);
const monthNames = new Map([
  ["january", 1], ["jan", 1], ["february", 2], ["feb", 2], ["march", 3], ["mar", 3],
  ["april", 4], ["apr", 4], ["may", 5], ["june", 6], ["jun", 6], ["july", 7],
  ["jul", 7], ["august", 8], ["aug", 8], ["september", 9], ["sep", 9], ["sept", 9],
  ["october", 10], ["oct", 10], ["november", 11], ["nov", 11], ["december", 12], ["dec", 12],
]);

function cleanText(value: unknown, maximumLength = 220) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safeCount(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function safePage(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= 100 ? number : 1;
}

function previousSingaporeBillingMonth(now: Date) {
  const singapore = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const currentYear = singapore.getUTCFullYear();
  const currentMonthIndex = singapore.getUTCMonth();
  const previousMonthIndex = currentMonthIndex === 0 ? 11 : currentMonthIndex - 1;
  const year = currentMonthIndex === 0 ? currentYear - 1 : currentYear;
  return `${year}-${String(previousMonthIndex + 1).padStart(2, "0")}`;
}

function parseMonthToken(value: unknown) {
  const token = cleanText(value, 80).replace(/[?.!]+$/, "").trim();
  if (!token || /^previous\s+(?:billing\s+)?month$/i.test(token)) return null;
  if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(token)) return token;
  const natural = token.match(/^([a-z]+)\s+(\d{4})$/i);
  if (!natural) return "invalid";
  const month = monthNames.get(natural[1].toLowerCase());
  const year = Number(natural[2]);
  if (!month || year < 2000 || year > 2100) return "invalid";
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseMonthlyBillingReview(
  messageValue: unknown,
  now: Date,
): ParsedMonthlyBillingReview | "blocked" | null {
  const query = cleanText(messageValue, 500);
  if (!query || !/monthly\s+billing/i.test(query)) return null;
  if (blockedActionPattern.test(query) || injectionPattern.test(query)) return "blocked";
  const attentionMatch = query.match(attentionPattern);
  const reviewMatch = query.match(reviewPattern);
  const match = attentionMatch || reviewMatch;
  if (!match) return "blocked";
  const previousMonth = previousSingaporeBillingMonth(now);
  const requestedMonth = parseMonthToken(match[1]);
  if (requestedMonth === "invalid" || (requestedMonth && requestedMonth !== previousMonth)) {
    return "blocked";
  }
  return {
    billingMonth: previousMonth,
    kind: attentionMatch ? "attention" : "review",
    query,
  };
}

function validActor(context: AdminDispatcherBoundaryContext) {
  return context.mode === "server-session-role-surface" &&
    allowedActorRoles.has(context.role) &&
    Boolean(cleanText(context.actorLabel, 160));
}

function monthLabel(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;
  return new Intl.DateTimeFormat("en-SG", { month: "long", timeZone: "UTC", year: "numeric" })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

function result(
  parsed: ParsedMonthlyBillingReview,
  page: number,
  input: Partial<AdminAiMonthlyBillingReviewResult>,
): AdminAiMonthlyBillingReviewResult {
  return {
    answer: input.answer || `No monthly billing review records were found for ${monthLabel(parsed.billingMonth)}.`,
    billing_month: parsed.billingMonth,
    has_more: input.has_more === true,
    intent: adminAiMonthlyBillingReviewIntent,
    page,
    page_size: adminAiMonthlyBillingReviewPageSize,
    query: parsed.query,
    read_at: new Date().toISOString(),
    rows: input.rows || [],
    status: input.status || "empty",
    total_count: safeCount(input.total_count),
  };
}

function blockedResult(query: string, page: number, now: Date): AdminAiMonthlyBillingReviewExecution {
  const billingMonth = previousSingaporeBillingMonth(now);
  return {
    data: result(
      { billingMonth, kind: "review", query },
      page,
      {
        answer: `Ask AI can only read the existing ${monthLabel(billingMonth)} monthly billing review. Use the established Admin controls for every draft, invoice, payment, and scheduling action.`,
        status: "blocked",
      },
    ),
    matched: true,
    ok: true,
  };
}

function completeIdentityKey(
  customerIdValue: unknown,
  companyIdValue: unknown,
  bookerIdValue: unknown,
  billingMonth: unknown,
) {
  const customerId = positiveInteger(customerIdValue);
  const companyId = positiveInteger(companyIdValue);
  const bookerId = positiveInteger(bookerIdValue);
  const month = cleanText(billingMonth, 20);
  return customerId && companyId && bookerId && /^\d{4}-\d{2}$/.test(month)
    ? `${customerId}:${companyId}:${bookerId}:${month}`
    : "";
}

function issueRecordLocksDraft(record: AdminMonthlyInvoiceIssueRecordRecord) {
  return record.draft_lock_status === "locked_for_issue" &&
    !nonLockingIssueRecordStatuses.has(record.issue_record_status);
}

function mergeSeed(
  seeds: Map<string, RowSeed>,
  exactKey: string,
  fallbackKey: string,
  field: "draftPlan" | "group" | "invoiceDraft",
  value: AdminMonthlyBillingDraftPlanRecord | AdminMonthlyBillingGroup | AdminMonthlyInvoiceDraftRecord,
) {
  const seedKey = exactKey || fallbackKey;
  const current = seeds.get(seedKey) || {
    draftPlan: null,
    group: null,
    invoiceDraft: null,
    seedKey,
  };
  if (field === "group") current.group = value as AdminMonthlyBillingGroup;
  if (field === "draftPlan") current.draftPlan = value as AdminMonthlyBillingDraftPlanRecord;
  if (field === "invoiceDraft") current.invoiceDraft = value as AdminMonthlyInvoiceDraftRecord;
  seeds.set(seedKey, current);
}

function buildSeeds(snapshot: AdminAiMonthlyBillingReviewSnapshot) {
  const seeds = new Map<string, RowSeed>();
  snapshot.groups.forEach((group, index) => mergeSeed(
    seeds,
    completeIdentityKey(group.customer_id, group.company_id, group.booker_id, group.billing_month),
    `group:${index}:${cleanText(group.billing_month, 20)}`,
    "group",
    group,
  ));
  snapshot.draftPlans.forEach((plan, index) => mergeSeed(
    seeds,
    completeIdentityKey(plan.customer_id, plan.company_id, plan.booker_id, plan.billing_month),
    `plan:${cleanText(plan.id, 120) || index}:${cleanText(plan.billing_month, 20)}`,
    "draftPlan",
    plan,
  ));
  snapshot.invoiceDrafts.forEach((draft, index) => mergeSeed(
    seeds,
    completeIdentityKey(draft.customer_id, draft.company_id, draft.booker_id, draft.billing_month),
    `draft:${cleanText(draft.id, 120) || index}:${cleanText(draft.billing_month, 20)}`,
    "invoiceDraft",
    draft,
  ));
  return [...seeds.values()];
}

function sourceIdentity(seed: RowSeed) {
  const source = seed.group || seed.invoiceDraft || seed.draftPlan;
  return {
    billingMonth: cleanText(source?.billing_month, 20),
    bookerId: positiveInteger(source?.booker_id),
    companyId: positiveInteger(source?.company_id),
    customerId: positiveInteger(source?.customer_id),
  };
}

function verifiedIdentity(
  seed: RowSeed,
  snapshot: AdminAiMonthlyBillingReviewSnapshot,
) {
  const source = sourceIdentity(seed);
  if (!source.customerId || !source.companyId || !source.bookerId) return null;
  const company = snapshot.companies.find((candidate) =>
    positiveInteger(candidate.id) === source.companyId && Boolean(cleanText(candidate.company_name, 160)),
  );
  const booker = snapshot.bookers.find((candidate) =>
    positiveInteger(candidate.id) === source.bookerId &&
    positiveInteger(candidate.company_id) === source.companyId &&
    positiveInteger(candidate.customer_id) === source.customerId &&
    Boolean(cleanText(candidate.booker_name, 160)),
  );
  if (!company || !booker) return null;
  return {
    bookerName: cleanText(booker.booker_name, 160),
    companyName: cleanText(company.company_name, 160),
    ...source,
  };
}

function groupReferences(group: AdminMonthlyBillingGroup | null) {
  if (!group) return [];
  return group.jobs.flatMap((job): AdminAiMonthlyBillingReviewReference[] => {
    const bookingReference = cleanText(job.booking_reference, 160);
    if (!bookingReference) return [];
    return [{
      booking_reference: bookingReference,
      display_booking_reference: cleanText(job.display_booking_reference, 160) || bookingReference,
      reason: cleanText(job.safe_reason, 220),
      status: job.safe_billing_status === "ready"
        ? "Ready"
        : job.safe_billing_status === "covered"
          ? "Already invoiced"
          : "Blocked",
    }];
  });
}

function draftReferences(draft: AdminMonthlyInvoiceDraftRecord | null) {
  if (!draft) return [];
  return draft.linked_trips.flatMap((trip): AdminAiMonthlyBillingReviewReference[] => {
    const bookingReference = cleanText(trip.booking_reference, 160);
    if (!bookingReference) return [];
    return [{
      booking_reference: bookingReference,
      display_booking_reference: bookingReference,
      reason: trip.trip_readiness_status === "blocked" ? "Saved draft trip needs Admin review." : "",
      status: trip.trip_readiness_status === "ready" ? "Ready" : "Blocked",
    }];
  });
}

function rowCounts(seed: RowSeed) {
  const source = seed.group || seed.invoiceDraft || seed.draftPlan;
  return {
    alreadyInvoiced: seed.group ? safeCount(seed.group.covered_count) : 0,
    blocked: safeCount(source?.blocked_count),
    ready: safeCount(source?.ready_count),
    total: seed.group ? safeCount(seed.group.classified_count) : safeCount(source?.total_count),
  };
}

function rowForSeed(
  seed: RowSeed,
  snapshot: AdminAiMonthlyBillingReviewSnapshot,
): AdminAiMonthlyBillingReviewRow {
  const source = sourceIdentity(seed);
  const identity = verifiedIdentity(seed, snapshot);
  const counts = rowCounts(seed);
  const references = groupReferences(seed.group);
  const safeReferences = references.length ? references : draftReferences(seed.invoiceDraft);
  const draftId = cleanText(seed.invoiceDraft?.id, 160);
  const locked = Boolean(draftId && snapshot.issueRecords.some((record) =>
    cleanText(record.draft_id, 160) === draftId && issueRecordLocksDraft(record),
  ));
  const blockedReasons = [...new Set([
    ...safeReferences.filter((reference) => reference.status === "Blocked").map((reference) => reference.reason),
    ...(!identity ? [manualIdentityReason] : []),
  ].map((reason) => cleanText(reason, 220)).filter(Boolean))];
  const invoiceDraftStatus = cleanText(seed.invoiceDraft?.draft_status, 80) || null;
  let status: AdminAiMonthlyBillingReviewStatus = "blocked";
  if (!identity) status = "blocked";
  else if (locked) status = "locked";
  else if (invoiceDraftStatus === "pending_admin_review") status = "pending_admin_review";
  else if (
    counts.blocked > 0 ||
    seed.group?.safe_readiness_status === "blocked" ||
    seed.group?.safe_readiness_status === "mixed" ||
    seed.draftPlan?.readiness_status === "blocked" ||
    seed.draftPlan?.readiness_status === "mixed" ||
    seed.invoiceDraft?.readiness_status === "blocked" ||
    seed.invoiceDraft?.readiness_status === "mixed" ||
    invoiceDraftStatus === "blocked"
  ) status = "blocked";
  else if (counts.ready > 0) status = "ready";
  else if (counts.alreadyInvoiced > 0) status = "already_invoiced";

  return {
    already_invoiced_count: counts.alreadyInvoiced,
    billing_month: source.billingMonth,
    blocked_count: counts.blocked,
    blocked_reasons: blockedReasons,
    booker_id: identity?.bookerId || null,
    booker_name: identity?.bookerName || null,
    company_id: identity?.companyId || null,
    company_name: identity?.companyName || null,
    customer_id: identity?.customerId || null,
    draft_plan_status: cleanText(seed.draftPlan?.draft_status, 80) || null,
    identity_status: identity ? "verified" : "manual_review",
    invoice_draft_status: invoiceDraftStatus,
    locked,
    open_customer_path: identity
      ? `/customers/${encodeURIComponent(String(identity.customerId))}?name=${encodeURIComponent(`${identity.companyName} · ${identity.bookerName}`)}`
      : null,
    ready_count: counts.ready,
    reference_count: safeReferences.length,
    references: safeReferences,
    row_key: identity
      ? `${identity.customerId}:${identity.companyId}:${identity.bookerId}:${source.billingMonth}`
      : `manual:${seed.seedKey}`,
    status,
    total_count: counts.total,
  };
}

async function loadDefaultSnapshot(
  actor: AdminBookingPersistenceAdapterActor,
  billingMonth: string,
): Promise<AdminAiMonthlyBillingReviewSnapshot> {
  const [groups, draftPlans, invoiceDrafts, issueRecords, rateSetup] = await Promise.all([
    loadAdminMonthlyBillingGroups({ billing_month: billingMonth, limit: maxSourceRows, page: 1 }, actor),
    loadAdminMonthlyBillingDraftPlans({ billing_month: billingMonth, limit: maxSourceRows, page: 1 }, actor),
    loadAdminMonthlyInvoiceDrafts({ billing_month: billingMonth, limit: maxSourceRows, page: 1 }, actor),
    loadAdminMonthlyInvoiceIssueRecords({ billing_month: billingMonth, limit: maxSourceRows, page: 1 }, actor),
    loadAdminRateSetup(actor),
  ]);
  if (!groups.ok || !draftPlans.ok || !invoiceDrafts.ok || !issueRecords.ok || !rateSetup.ok) {
    throw new Error(safeReadError);
  }
  if (
    groups.data.pagination.has_next_page ||
    draftPlans.data.pagination.has_next_page ||
    invoiceDrafts.data.pagination.has_next_page ||
    issueRecords.data.pagination.has_next_page
  ) {
    throw new Error(safeReadError);
  }
  return {
    bookers: rateSetup.data.bookers,
    companies: rateSetup.data.companies,
    draftPlans: draftPlans.data.draft_plans,
    groups: groups.data.groups,
    invoiceDrafts: invoiceDrafts.data.invoice_drafts,
    issueRecords: issueRecords.data.issue_records,
  };
}

const defaultDependencies: AdminAiMonthlyBillingReviewDependencies = {
  loadSnapshot: loadDefaultSnapshot,
};

export async function executeAdminAiMonthlyBillingReview(
  messageValue: unknown,
  pageValue: unknown,
  context: AdminDispatcherBoundaryContext,
  dependencies: AdminAiMonthlyBillingReviewDependencies = defaultDependencies,
  now = new Date(),
): Promise<AdminAiMonthlyBillingReviewExecution> {
  const parsed = parseMonthlyBillingReview(messageValue, now);
  const page = safePage(pageValue);
  if (!parsed) return { matched: false };
  if (parsed === "blocked") return blockedResult(cleanText(messageValue, 500), page, now);
  if (!validActor(context)) {
    return { error: "Monthly billing review requires a verified Admin or Dispatcher session.", matched: true, ok: false, status: 403 };
  }

  let snapshot: AdminAiMonthlyBillingReviewSnapshot;
  try {
    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(context);
    snapshot = await dependencies.loadSnapshot(actor, parsed.billingMonth);
  } catch {
    return { error: safeReadError, matched: true, ok: false, status: 500 };
  }

  const allRows = buildSeeds(snapshot)
    .map((seed) => rowForSeed(seed, snapshot))
    .sort((left, right) =>
      (left.company_name || "~").localeCompare(right.company_name || "~") ||
      (left.booker_name || "~").localeCompare(right.booker_name || "~") ||
      left.row_key.localeCompare(right.row_key),
    );
  const rows = parsed.kind === "attention"
    ? allRows.filter((row) =>
      row.status === "blocked" ||
      row.status === "pending_admin_review" ||
      row.status === "ready"
    )
    : allRows;
  const from = (page - 1) * adminAiMonthlyBillingReviewPageSize;
  const pageRows = rows.slice(from, from + adminAiMonthlyBillingReviewPageSize);
  const attentionCount = rows.filter((row) =>
    row.status === "blocked" || row.status === "pending_admin_review" || row.status === "ready",
  ).length;
  const lockedCount = rows.filter((row) => row.status === "locked").length;

  return {
    data: result(parsed, page, {
      answer: rows.length
        ? parsed.kind === "attention"
          ? `Found ${rows.length} monthly billing account${rows.length === 1 ? "" : "s"} needing Admin review for ${monthLabel(parsed.billingMonth)}.`
          : `Found ${rows.length} monthly billing account${rows.length === 1 ? "" : "s"} for ${monthLabel(parsed.billingMonth)}. ${attentionCount} need Admin review; ${lockedCount} ${lockedCount === 1 ? "is" : "are"} locked in the established issue workflow.`
        : undefined,
      has_more: from + pageRows.length < rows.length,
      rows: pageRows,
      status: rows.length ? "results" : "empty",
      total_count: rows.length,
    }),
    matched: true,
    ok: true,
  };
}
