import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { listAdminBookings, type AdminBookingPersistenceRecord } from "./admin-booking-persistence";
import {
  adminDispatcherBoundaryToPersistenceAdapterActor,
  type AdminBookingPersistenceAdapterActor,
} from "./admin-booking-supabase-adapter";
import type { AdminDispatcherBoundaryContext } from "./admin-dispatcher-auth-boundary";
import {
  loadAdminRateSetup,
  type AdminRateSetupBooker,
  type AdminRateSetupCompany,
  type AdminRateSetupTraveler,
} from "./admin-rate-setup-read";
import {
  loadAdminSavedBookingsForExactAccountUpcoming,
  type AdminSavedBookingRecord,
} from "./admin-saved-booking-read";

export const adminAiAccountBriefIntent = "find_customer_account_brief";
export const adminAiAccountBriefPageSize = 10;

export type AdminAiAccountBriefKind = "account" | "all_unpaid_bookings" | "unpaid_bookings" | "upcoming_jobs";

export type AdminAiAccountBriefIdentity = {
  booker_id: number;
  booker_name: string;
  company_id: number;
  company_name: string;
  customer_id: number;
  open_customer_path: string;
};

export type AdminAiAccountBriefJob = {
  booking_reference: string;
  pickup_at: string | null;
  public_booking_reference: string | null;
  service_type: string;
  status: string;
};

export type AdminAiAccountBriefInvoice = {
  amount_label: string;
  balance_label: string;
  due_date: string;
  invoice_number: string;
  status: "Unpaid";
};

export type AdminAiAccountBriefAccount = AdminAiAccountBriefIdentity & {
  completed_count: number;
  identity_anomalies: string[];
  issued_invoice_count: number;
  issued_invoice_total_label: string;
  jobs_not_billed_count: number;
  unpaid_invoice_balance_label: string;
  unpaid_invoice_count: number;
  upcoming_count: number;
};

export type AdminAiAccountBriefSummaryRow = AdminAiAccountBriefIdentity & {
  jobs_not_billed_count: number;
};

export type AdminAiAccountBriefResult = {
  account: AdminAiAccountBriefAccount | null;
  accounts_with_jobs_not_billed: AdminAiAccountBriefSummaryRow[];
  answer: string;
  company_options: string[];
  has_more: boolean;
  intent: typeof adminAiAccountBriefIntent;
  jobs_not_billed: AdminAiAccountBriefJob[];
  kind: AdminAiAccountBriefKind;
  manual_folder_guidance: string | null;
  page: number;
  page_size: typeof adminAiAccountBriefPageSize;
  query: string;
  read_at: string;
  status: "ambiguous" | "blocked" | "legacy_identity" | "no_match" | "results" | "traveller_only";
  total_count: number;
  unpaid_invoices: AdminAiAccountBriefInvoice[];
  upcoming_jobs: AdminAiAccountBriefJob[];
};

export type AdminAiAccountBriefExecution =
  | { matched: false }
  | { data: AdminAiAccountBriefResult; matched: true; ok: true }
  | { error: string; matched: true; ok: false; status: 403 | 500 | 503 };

type UnknownRecord = Record<string, unknown>;
type AdminAiAccountBriefClient = Pick<SupabaseClient, "from">;

type ParsedAccountBrief = {
  bookerName: string | null;
  companyName: string | null;
  kind: AdminAiAccountBriefKind;
  query: string;
};

type AccountInvoiceRow = {
  amountCents: number;
  bookerId: number | null;
  customerId: number;
  documentState: string;
  documentType: string;
  dueDate: string;
  invoiceNumber: string;
  issueDate: string;
  references: string[];
  status: "Paid" | "Unpaid";
};

export type AdminAiAccountBriefIdentitySnapshot = {
  bookers: AdminRateSetupBooker[];
  companies: AdminRateSetupCompany[];
  travelers: AdminRateSetupTraveler[];
};

export type AdminAiAccountBriefDataSnapshot = {
  bookings: AdminBookingPersistenceRecord[];
  invoices: AccountInvoiceRow[];
};

type AdminAiAccountBriefSnapshot = AdminAiAccountBriefIdentitySnapshot & AdminAiAccountBriefDataSnapshot;

export type AdminAiAccountBriefDependencies = {
  loadAccountData(actor: AdminBookingPersistenceAdapterActor): Promise<AdminAiAccountBriefDataSnapshot>;
  loadIdentities(actor: AdminBookingPersistenceAdapterActor): Promise<AdminAiAccountBriefIdentitySnapshot>;
  loadUpcomingJobs?(
    actor: AdminBookingPersistenceAdapterActor,
    identity: AdminAiAccountBriefIdentity,
    now: Date,
    page: number,
  ): Promise<{ hasMore: boolean; jobs: AdminAiAccountBriefJob[]; totalCount: number }>;
};

const allowedActorRoles = new Set(["admin", "dispatcher"]);
const safeReadError = "Customer account brief failed safely. No customer, booking, or invoice was changed.";
const manualFolderGuidance =
  "Open the Customer account manually and review its Company and Booker identity before using this brief.";
const blockedActionPattern =
  /\b(?:archive|cancel|charge|create|delete|email|issue|mark|modify|pay|refund|remove|send|set|update|write)\b/i;
const injectionPattern =
  /(?:ignore\s+(?:all\s+)?(?:previous|prior)|system\s+prompt|developer\s+message|service[_\s-]?role|api[_\s-]?key|database\s+credential|\b(?:drop|insert|select|update|delete)\s+(?:table|from|into|bookings|customer_invoice_records)\b)/i;
const allUnpaidBookingsPattern =
  /^show(?:\s+me)?\s+all\s+customers\s+with\s+unpaid\s+bookings[\s?.!]*$/i;
const unpaidBookingsPattern =
  /^show(?:\s+me)?\s+(.+?)(?:'s|’s)?\s+unpaid\s+bookings(?:\s+(?:for|at|from)\s+(.+?))?[\s?.!]*$/i;
const accountPattern =
  /^show(?:\s+me)?\s+(.+?)\s+account(?:\s+(?:for|at|from)\s+(.+?))?[\s?.!]*$/i;
const upcomingJobsPattern =
  /^show(?:\s+me)?\s+upcoming\s+jobs\s+for\s+(.+?)(?:\s+(?:at|for|from)\s+(.+?))?[\s?.!]*$/i;
const clearlyBilledOrClosedStatusPattern =
  /(?:invoice|invoiced|billed|paid|cancelled|canceled|declined|rejected|void|deleted)/i;
const completedStatusPattern = /(?:^|[\s_-])(?:complete|completed|job_completed)(?:$|[\s_-])/i;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value: unknown, maximumLength = 220) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safePage(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= 50 ? number : 1;
}

function normalizeIdentity(value: unknown) {
  return cleanText(value, 160).toLocaleLowerCase("en-SG");
}

function normalizeReference(value: unknown) {
  return cleanText(value, 160).toUpperCase();
}

function formatAmount(amountCents: number) {
  return `SGD${(amountCents / 100).toLocaleString("en-SG", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function bookingReferenceSet(invoice: AccountInvoiceRow) {
  return new Set(invoice.references.map(normalizeReference).filter(Boolean));
}

function bookingReferences(booking: AdminBookingPersistenceRecord) {
  return [booking.booking_reference, booking.public_booking_reference]
    .map(normalizeReference)
    .filter(Boolean);
}

function bookingStatus(booking: AdminBookingPersistenceRecord) {
  return cleanText(
    booking.customer_facing_status || booking.admin_internal_status,
    100,
  ) || "Status not recorded";
}

function safeInvoice(value: unknown): AccountInvoiceRow | null {
  const record = asRecord(value);
  const customerId = positiveInteger(record.customer_id);
  const invoiceNumber = cleanText(record.invoice_number, 80);
  const amountCents = Number(record.amount_cents);
  const status = record.status === "Paid" ? "Paid" : record.status === "Unpaid" ? "Unpaid" : null;

  if (!customerId || !invoiceNumber || !Number.isSafeInteger(amountCents) || amountCents <= 0 || !status) {
    return null;
  }

  return {
    amountCents,
    bookerId: positiveInteger(record.booker_id),
    customerId,
    documentState: cleanText(record.document_state, 40),
    documentType: cleanText(record.document_type, 40),
    dueDate: cleanText(record.due_date_label, 80) || "Due date not recorded",
    invoiceNumber,
    issueDate: cleanText(record.issue_date_label || record.issue_date_iso, 80),
    references: [
      cleanText(record.reference, 160),
      ...asArray(record.line_items).map((item) => cleanText(asRecord(item).bookingReference, 160)),
    ].filter(Boolean),
    status,
  };
}

function parseAccountBrief(messageValue: unknown): ParsedAccountBrief | "blocked" | null {
  const query = cleanText(messageValue, 500);

  if (!query || (!/\baccount\b/i.test(query) && !/\bunpaid\s+bookings\b/i.test(query) && !/\bupcoming\s+jobs\b/i.test(query))) {
    return null;
  }

  if (blockedActionPattern.test(query) || injectionPattern.test(query)) return "blocked";

  if (allUnpaidBookingsPattern.test(query)) {
    return { bookerName: null, companyName: null, kind: "all_unpaid_bookings", query };
  }

  const unpaidMatch = query.match(unpaidBookingsPattern);
  const upcomingMatch = query.match(upcomingJobsPattern);
  const accountMatch = query.match(accountPattern);
  const match = unpaidMatch || upcomingMatch || accountMatch;

  if (!match) return "blocked";

  let bookerName = cleanText(match[1], 160).replace(/(?:'s|’s)$/i, "").trim();
  let companyName = cleanText(match[2], 160);
  const separatorMatch = bookerName.match(/^(.+?)\s*[·|]\s*(.+)$/);

  if (separatorMatch && !companyName) {
    companyName = cleanText(separatorMatch[1], 160);
    bookerName = cleanText(separatorMatch[2], 160);
  }

  if (!bookerName || /\b(?:and|or)\b/i.test(bookerName) || injectionPattern.test(`${bookerName} ${companyName}`)) {
    return "blocked";
  }

  return {
    bookerName,
    companyName: companyName || null,
    kind: unpaidMatch ? "unpaid_bookings" : upcomingMatch ? "upcoming_jobs" : "account",
    query,
  };
}

function validActor(context: AdminDispatcherBoundaryContext) {
  return context.mode === "server-session-role-surface" &&
    allowedActorRoles.has(context.role) &&
    Boolean(cleanText(context.actorLabel, 160));
}

function result(
  parsed: ParsedAccountBrief,
  page: number,
  input: Partial<AdminAiAccountBriefResult>,
): AdminAiAccountBriefResult {
  return {
    account: input.account || null,
    accounts_with_jobs_not_billed: input.accounts_with_jobs_not_billed || [],
    answer: input.answer || "No exact Company + Booker account was found.",
    company_options: input.company_options || [],
    has_more: input.has_more === true,
    intent: adminAiAccountBriefIntent,
    jobs_not_billed: input.jobs_not_billed || [],
    kind: parsed.kind,
    manual_folder_guidance: input.manual_folder_guidance || null,
    page,
    page_size: adminAiAccountBriefPageSize,
    query: parsed.query,
    read_at: new Date().toISOString(),
    status: input.status || "no_match",
    total_count: Number.isSafeInteger(input.total_count) && (input.total_count || 0) >= 0
      ? input.total_count || 0
      : 0,
    unpaid_invoices: input.unpaid_invoices || [],
    upcoming_jobs: input.upcoming_jobs || [],
  };
}

function blockedResult(query: string, page: number): AdminAiAccountBriefExecution {
  return {
    data: result(
      { bookerName: null, companyName: null, kind: "account", query },
      page,
      {
        answer:
          "Ask AI can only read an exact Company + Booker account here. Customer, invoice, payment, and booking changes must use the existing confirmed controls.",
        status: "blocked",
      },
    ),
    matched: true,
    ok: true,
  };
}

function identityFor(
  booker: AdminRateSetupBooker,
  company: AdminRateSetupCompany,
): AdminAiAccountBriefIdentity | null {
  const bookerId = positiveInteger(booker.id);
  const companyId = positiveInteger(booker.company_id);
  const customerId = positiveInteger(booker.customer_id);
  const bookerName = cleanText(booker.booker_name, 160);
  const companyName = cleanText(company.company_name, 160);

  if (!bookerId || !companyId || !customerId || !bookerName || !companyName || company.id !== companyId) {
    return null;
  }

  return {
    booker_id: bookerId,
    booker_name: bookerName,
    company_id: companyId,
    company_name: companyName,
    customer_id: customerId,
    open_customer_path:
      `/customers/${encodeURIComponent(String(customerId))}` +
      `?name=${encodeURIComponent(`${companyName} · ${bookerName}`)}`,
  };
}

function exactTupleBookings(snapshot: AdminAiAccountBriefSnapshot, identity: AdminAiAccountBriefIdentity) {
  return snapshot.bookings.filter((booking) =>
    positiveInteger(booking.customer_id) === identity.customer_id &&
    positiveInteger(booking.company_id) === identity.company_id &&
    positiveInteger(booking.booker_id) === identity.booker_id,
  );
}

function exactIssuedInvoices(snapshot: AdminAiAccountBriefSnapshot, identity: AdminAiAccountBriefIdentity) {
  return snapshot.invoices.filter((invoice) =>
    invoice.customerId === identity.customer_id &&
    invoice.bookerId === identity.booker_id &&
    invoice.documentType === "invoice" &&
    invoice.documentState === "issued",
  );
}

function jobsNotBilled(
  snapshot: AdminAiAccountBriefSnapshot,
  identity: AdminAiAccountBriefIdentity,
) {
  const issuedReferenceSets = exactIssuedInvoices(snapshot, identity).map(bookingReferenceSet);

  return exactTupleBookings(snapshot, identity).filter((booking) => {
    if (clearlyBilledOrClosedStatusPattern.test(bookingStatus(booking))) return false;
    const references = bookingReferences(booking);
    return !issuedReferenceSets.some((referenceSet) => references.some((reference) => referenceSet.has(reference)));
  });
}

function accountSummary(
  snapshot: AdminAiAccountBriefSnapshot,
  identity: AdminAiAccountBriefIdentity,
  now: Date,
): AdminAiAccountBriefAccount {
  const bookings = exactTupleBookings(snapshot, identity);
  const issuedInvoices = exactIssuedInvoices(snapshot, identity);
  const unpaidInvoices = issuedInvoices.filter((invoice) => invoice.status === "Unpaid");
  const anomalies: string[] = [];
  const hasPartialBookingIdentity = snapshot.bookings.some((booking) =>
    positiveInteger(booking.customer_id) === identity.customer_id &&
    (!positiveInteger(booking.company_id) || !positiveInteger(booking.booker_id)),
  );
  const hasLegacyInvoiceIdentity = snapshot.invoices.some((invoice) =>
    invoice.customerId === identity.customer_id && !invoice.bookerId,
  );

  if (hasPartialBookingIdentity) anomalies.push("Some saved bookings have partial Company or Booker identity and were excluded.");
  if (hasLegacyInvoiceIdentity) anomalies.push("Some issued invoice rows have no verified Booker identity and were excluded.");

  return {
    ...identity,
    completed_count: bookings.filter((booking) => completedStatusPattern.test(bookingStatus(booking))).length,
    identity_anomalies: anomalies,
    issued_invoice_count: issuedInvoices.length,
    issued_invoice_total_label: formatAmount(issuedInvoices.reduce((total, invoice) => total + invoice.amountCents, 0)),
    jobs_not_billed_count: jobsNotBilled(snapshot, identity).length,
    unpaid_invoice_balance_label: formatAmount(unpaidInvoices.reduce((total, invoice) => total + invoice.amountCents, 0)),
    unpaid_invoice_count: unpaidInvoices.length,
    upcoming_count: bookings.filter((booking) => {
      const pickupAt = cleanText(booking.pickup_at || booking.pickup_datetime, 100);
      return Boolean(pickupAt && Number.isFinite(Date.parse(pickupAt)) && Date.parse(pickupAt) >= now.getTime()) &&
        !completedStatusPattern.test(bookingStatus(booking)) &&
        !clearlyBilledOrClosedStatusPattern.test(bookingStatus(booking));
    }).length,
  };
}

function jobRow(booking: AdminBookingPersistenceRecord): AdminAiAccountBriefJob | null {
  const bookingReference = cleanText(booking.booking_reference, 160);
  if (!bookingReference) return null;
  return {
    booking_reference: bookingReference,
    pickup_at: cleanText(booking.pickup_at || booking.pickup_datetime, 100) || null,
    public_booking_reference: cleanText(booking.public_booking_reference, 100) || null,
    service_type: cleanText(booking.service_type, 80) || "Service not recorded",
    status: bookingStatus(booking),
  };
}

function safeUpcomingJob(value: unknown): AdminAiAccountBriefJob | null {
  const row = asRecord(value);
  const bookingReference = cleanText(row.booking_reference, 160);
  const pickupAt = cleanText(row.pickup_at || row.pickup_datetime, 100);
  if (!bookingReference || !pickupAt || !Number.isFinite(Date.parse(pickupAt))) return null;
  return {
    booking_reference: bookingReference,
    pickup_at: pickupAt,
    public_booking_reference: cleanText(row.public_booking_reference, 100) || null,
    service_type: cleanText(row.service_type, 80) || "Service not recorded",
    status: cleanText(row.admin_internal_status || row.customer_facing_status, 100) || "Status not recorded",
  };
}

function savedBookingIsUpcomingOperational(booking: AdminSavedBookingRecord) {
  const statuses = [booking.admin_internal_status, booking.status, booking.customer_facing_status]
    .map((status) => cleanText(status, 100))
    .filter(Boolean);

  return statuses.every((status) =>
    !completedStatusPattern.test(status) && !clearlyBilledOrClosedStatusPattern.test(status)
  );
}

async function loadDefaultIdentities(
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminAiAccountBriefIdentitySnapshot> {
  const rateSetup = await loadAdminRateSetup(actor);

  if (!rateSetup.ok) throw new Error(safeReadError);

  return {
    bookers: rateSetup.data.bookers,
    companies: rateSetup.data.companies,
    travelers: rateSetup.data.travelers,
  };
}

async function loadDefaultAccountData(
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminAiAccountBriefDataSnapshot> {
  const bookings = await listAdminBookings(actor, { limit: 200 });

  if (!bookings.ok) throw new Error(safeReadError);

  const database: AdminAiAccountBriefClient = createClient(
    process.env.SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { persistSession: false } },
  );
  const invoiceResult = await database
    .from("customer_invoice_records")
    .select(
      "invoice_number, customer_id, booker_id, document_type, document_state, status, amount_cents, issue_date_iso, issue_date_label, due_date_label, reference, line_items",
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  if (invoiceResult.error) throw new Error(safeReadError);

  return {
    bookings: bookings.data,
    invoices: asArray(invoiceResult.data).map(safeInvoice).filter((row): row is AccountInvoiceRow => Boolean(row)),
  };
}

const defaultDependencies: AdminAiAccountBriefDependencies = {
  loadAccountData: loadDefaultAccountData,
  loadIdentities: loadDefaultIdentities,
  async loadUpcomingJobs(actor, identity, now, page) {
    const from = (page - 1) * adminAiAccountBriefPageSize;
    const loaded = await loadAdminSavedBookingsForExactAccountUpcoming({
      booker_id: identity.booker_id,
      company_id: identity.company_id,
      customer_id: identity.customer_id,
      pickup_at_or_after: now.toISOString(),
    }, actor);

    if (!loaded.ok) throw new Error(safeReadError);

    const allJobs = loaded.data.bookings
      .filter(savedBookingIsUpcomingOperational)
      .map(safeUpcomingJob)
      .filter((job): job is AdminAiAccountBriefJob => Boolean(job));
    const jobs = allJobs.slice(from, from + adminAiAccountBriefPageSize);
    return {
      hasMore: from + jobs.length < allJobs.length,
      jobs,
      totalCount: allJobs.length,
    };
  },
};

export async function executeAdminAiAccountBrief(
  messageValue: unknown,
  pageValue: unknown,
  context: AdminDispatcherBoundaryContext,
  dependencies: AdminAiAccountBriefDependencies = defaultDependencies,
  now = new Date(),
): Promise<AdminAiAccountBriefExecution> {
  const parsed = parseAccountBrief(messageValue);
  const page = safePage(pageValue);

  if (!parsed) return { matched: false };
  if (parsed === "blocked") return blockedResult(cleanText(messageValue, 500), page);
  if (!validActor(context)) {
    return { error: "Customer account brief requires a verified Admin or Dispatcher session.", matched: true, ok: false, status: 403 };
  }

  let identitySnapshot: AdminAiAccountBriefIdentitySnapshot;
  let actor: AdminBookingPersistenceAdapterActor;
  try {
    actor = adminDispatcherBoundaryToPersistenceAdapterActor(context);
    identitySnapshot = await dependencies.loadIdentities(actor);
  } catch {
    return { error: safeReadError, matched: true, ok: false, status: 500 };
  }

  const companiesById = new Map(identitySnapshot.companies.map((company) => [company.id, company]));
  const completeIdentities = identitySnapshot.bookers.flatMap((booker) => {
    const company = companiesById.get(booker.company_id);
    const identity = company ? identityFor(booker, company) : null;
    return identity ? [identity] : [];
  });

  if (parsed.kind === "all_unpaid_bookings") {
    let accountData: AdminAiAccountBriefDataSnapshot;
    try {
      accountData = await dependencies.loadAccountData(actor);
    } catch {
      return { error: safeReadError, matched: true, ok: false, status: 500 };
    }
    const snapshot = { ...identitySnapshot, ...accountData };
    const summaries = completeIdentities
      .filter((identity, index, identities) =>
        identities.findIndex((candidate) =>
          candidate.customer_id === identity.customer_id &&
          candidate.company_id === identity.company_id &&
          candidate.booker_id === identity.booker_id,
        ) === index,
      )
      .map((identity) => ({ ...identity, jobs_not_billed_count: jobsNotBilled(snapshot, identity).length }))
      .filter((summary) => summary.jobs_not_billed_count > 0)
      .sort((left, right) =>
        left.company_name.localeCompare(right.company_name) || left.booker_name.localeCompare(right.booker_name),
      );
    const from = (page - 1) * adminAiAccountBriefPageSize;
    const rows = summaries.slice(from, from + adminAiAccountBriefPageSize);
    const incompleteIdentityCount = identitySnapshot.bookers.length - completeIdentities.length;
    return {
      data: result(parsed, page, {
        accounts_with_jobs_not_billed: rows,
        answer: summaries.length
          ? `Found ${summaries.length} exact Company + Booker account${summaries.length === 1 ? "" : "s"} with Jobs not billed yet.${incompleteIdentityCount ? ` ${incompleteIdentityCount} account identity row${incompleteIdentityCount === 1 ? "" : "s"} require manual review and were excluded.` : ""}`
          : `No verified Company + Booker accounts currently have Jobs not billed yet.${incompleteIdentityCount ? ` ${incompleteIdentityCount} account identity row${incompleteIdentityCount === 1 ? "" : "s"} require manual review and were excluded.` : ""}`,
        has_more: from + rows.length < summaries.length,
        manual_folder_guidance: incompleteIdentityCount ? manualFolderGuidance : null,
        status: "results",
        total_count: summaries.length,
      }),
      matched: true,
      ok: true,
    };
  }

  const exactBookers = identitySnapshot.bookers.filter((booker) =>
    normalizeIdentity(booker.booker_name) === normalizeIdentity(parsed.bookerName),
  );
  const travelerMatches = identitySnapshot.travelers.filter((traveler) =>
    normalizeIdentity(traveler.traveler_name) === normalizeIdentity(parsed.bookerName),
  );
  let candidates = exactBookers;

  if (parsed.companyName) {
    const exactCompanies = identitySnapshot.companies.filter((company) =>
      normalizeIdentity(company.company_name) === normalizeIdentity(parsed.companyName),
    );
    const companyIds = new Set(exactCompanies.map((company) => company.id));
    candidates = candidates.filter((booker) => companyIds.has(booker.company_id));
  }

  if (candidates.length === 0) {
    return {
      data: result(parsed, page, {
        answer: travelerMatches.length
          ? `${parsed.bookerName} matches a Traveller, not a Booker. No customer, booking, or invoice detail was read.`
          : `No exact Booker named ${parsed.bookerName} was found. No customer, booking, or invoice detail was read.`,
        status: travelerMatches.length ? "traveller_only" : "no_match",
      }),
      matched: true,
      ok: true,
    };
  }

  const identities = candidates.flatMap((booker) => {
    const company = companiesById.get(booker.company_id);
    const identity = company ? identityFor(booker, company) : null;
    return identity ? [identity] : [];
  });

  if (candidates.length !== 1 || identities.length !== 1) {
    const companyOptions = [...new Set(identities.map((identity) => identity.company_name))]
      .sort((left, right) => left.localeCompare(right));
    const legacyIdentity = identities.length !== candidates.length || identities.length === 0;
    return {
      data: result(parsed, page, {
        answer: legacyIdentity
          ? `${parsed.bookerName} has missing Company, Booker, or Customer identity. No detail was read.`
          : `More than one Booker named ${parsed.bookerName} exists. Add the Company name; no detail was read.`,
        company_options: companyOptions,
        manual_folder_guidance: legacyIdentity ? manualFolderGuidance : null,
        status: legacyIdentity ? "legacy_identity" : "ambiguous",
      }),
      matched: true,
      ok: true,
    };
  }

  const identity = identities[0];
  if (parsed.kind === "upcoming_jobs") {
    if (!dependencies.loadUpcomingJobs) {
      return { error: safeReadError, matched: true, ok: false, status: 500 };
    }
    try {
      const upcoming = await dependencies.loadUpcomingJobs(actor, identity, now, page);
      return {
        data: result(parsed, page, {
          answer: `${identity.company_name} · ${identity.booker_name} has ${upcoming.totalCount} upcoming job${upcoming.totalCount === 1 ? "" : "s"}.`,
          has_more: upcoming.hasMore,
          status: "results",
          total_count: upcoming.totalCount,
          upcoming_jobs: upcoming.jobs,
        }),
        matched: true,
        ok: true,
      };
    } catch {
      return { error: safeReadError, matched: true, ok: false, status: 500 };
    }
  }

  let accountData: AdminAiAccountBriefDataSnapshot;
  try {
    accountData = await dependencies.loadAccountData(actor);
  } catch {
    return { error: safeReadError, matched: true, ok: false, status: 500 };
  }
  const snapshot = { ...identitySnapshot, ...accountData };
  const account = accountSummary(snapshot, identity, now);
  const jobs = jobsNotBilled(snapshot, identity).map(jobRow).filter((row): row is AdminAiAccountBriefJob => Boolean(row));
  const unpaidInvoices = exactIssuedInvoices(snapshot, identity)
    .filter((invoice) => invoice.status === "Unpaid")
    .map<AdminAiAccountBriefInvoice>((invoice) => ({
      amount_label: formatAmount(invoice.amountCents),
      balance_label: formatAmount(invoice.amountCents),
      due_date: invoice.dueDate,
      invoice_number: invoice.invoiceNumber,
      status: "Unpaid",
    }));

  return {
    data: result(parsed, page, {
      account,
      answer: parsed.kind === "unpaid_bookings"
        ? `${identity.company_name} · ${identity.booker_name} has ${jobs.length} Job${jobs.length === 1 ? "" : "s"} not billed yet and ${unpaidInvoices.length} unpaid invoice${unpaidInvoices.length === 1 ? "" : "s"}.`
        : `Account brief for ${identity.company_name} · ${identity.booker_name}.`,
      jobs_not_billed: jobs,
      status: "results",
      total_count: jobs.length,
      unpaid_invoices: unpaidInvoices,
    }),
    matched: true,
    ok: true,
  };
}
