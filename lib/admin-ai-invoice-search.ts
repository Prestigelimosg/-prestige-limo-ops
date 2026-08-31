import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminDispatcherBoundaryContext } from "./admin-dispatcher-auth-boundary";

export const adminAiInvoiceSearchIntent = "find_customer_invoices";
export const adminAiInvoiceSearchPageSize = 10;

export type AdminAiInvoiceSearchRow = {
  amount_label: string;
  balance_label: string;
  booking_references: string[];
  due_date: string;
  invoice_number: string;
  issue_date: string;
  status: "Paid" | "Unpaid";
};

export type AdminAiInvoiceSearchResult = {
  answer: string;
  company_name: string | null;
  company_options: string[];
  has_more: boolean;
  intent: typeof adminAiInvoiceSearchIntent;
  legacy_rows_excluded: boolean;
  manual_folder_guidance: string | null;
  open_customer_path: string | null;
  page: number;
  page_size: typeof adminAiInvoiceSearchPageSize;
  query: string;
  read_at: string;
  rows: AdminAiInvoiceSearchRow[];
  status:
    | "ambiguous"
    | "blocked"
    | "legacy_identity"
    | "no_match"
    | "results"
    | "traveller_only";
  booker_name: string | null;
  total_count: number;
};

export type AdminAiInvoiceSearchExecution =
  | { matched: false }
  | {
      data: AdminAiInvoiceSearchResult;
      matched: true;
      ok: true;
    }
  | {
      error: string;
      matched: true;
      ok: false;
      status: 400 | 403 | 500 | 503;
    };

type UnknownRecord = Record<string, unknown>;
type AdminAiInvoiceSearchClient = Pick<SupabaseClient, "from">;

type ParsedInvoiceSearch = {
  bookerName: string;
  companyName: string | null;
  query: string;
};

const safeConfigError = "Live customer invoice search is not configured on this server.";
const safeReadError = "Live customer invoice search failed safely. No invoice was changed.";
const manualFolderGuidance =
  "Open the Customer account manually and review its Company and Booker identity before reading legacy invoices.";
const writeWordPattern =
  /\b(?:archive|cancel|charge|create|delete|email|issue|mark|modify|pay|refund|remove|send|set|update|write)\b/i;
const injectionPattern =
  /(?:ignore\s+(?:all\s+)?(?:previous|prior)|system\s+prompt|developer\s+message|service[_\s-]?role|api[_\s-]?key|database\s+credential|\b(?:drop|insert|select|update|delete)\s+(?:table|from|into|customer_invoice_records)\b)/i;
const invoiceSearchPattern =
  /^(?:show|find|list|get)(?:\s+me)?\s+(?:all\s+)?(.+?)\s+(?:issued\s+)?invoices(?:\s+(?:for|at|from)\s+(.+?))?[\s?.!]*$/i;
const allowedActorRoles = new Set(["admin", "dispatcher"]);

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value: unknown, maximumLength = 180) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function normalizeIdentity(value: unknown) {
  return cleanText(value, 160).toLocaleLowerCase("en-SG");
}

function escapeIlikeLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function safePage(value: unknown) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= 50 ? page : 1;
}

function safeCount(value: unknown) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function safeAmountCents(value: unknown) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 100_000_000 ? amount : null;
}

function formatAmount(amountCents: number) {
  return `SGD${(amountCents / 100).toLocaleString("en-SG", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function parseLineItemBookingReferences(value: unknown) {
  return asArray(value)
    .flatMap((item) => {
      const bookingReference = cleanText(asRecord(item).bookingReference, 160);
      return bookingReference ? [bookingReference] : [];
    });
}

function safeInvoiceRow(value: unknown): AdminAiInvoiceSearchRow | null {
  const record = asRecord(value);
  const invoiceNumber = cleanText(record.invoice_number, 80);
  const amountCents = safeAmountCents(record.amount_cents);
  const status = record.status === "Paid" ? "Paid" : record.status === "Unpaid" ? "Unpaid" : null;

  if (!invoiceNumber || !amountCents || !status) {
    return null;
  }

  const references = [
    cleanText(record.reference, 160),
    ...parseLineItemBookingReferences(record.line_items),
  ].filter(Boolean);

  return {
    amount_label: formatAmount(amountCents),
    balance_label: status === "Paid" ? formatAmount(0) : formatAmount(amountCents),
    booking_references: [...new Set(references)].slice(0, 20),
    due_date: cleanText(record.due_date_label, 80) || "Due date not recorded",
    invoice_number: invoiceNumber,
    issue_date:
      cleanText(record.issue_date_label, 80) ||
      cleanText(record.issue_date_iso, 80) ||
      "Issue date not recorded",
    status,
  };
}

function invoiceSearchResult(
  parsed: ParsedInvoiceSearch,
  page: number,
  input: Partial<AdminAiInvoiceSearchResult>,
): AdminAiInvoiceSearchResult {
  return {
    answer: input.answer || "No matching issued invoices were found.",
    booker_name: input.booker_name || null,
    company_name: input.company_name || null,
    company_options: input.company_options || [],
    has_more: input.has_more === true,
    intent: adminAiInvoiceSearchIntent,
    legacy_rows_excluded: input.legacy_rows_excluded === true,
    manual_folder_guidance: input.manual_folder_guidance || null,
    open_customer_path: input.open_customer_path || null,
    page,
    page_size: adminAiInvoiceSearchPageSize,
    query: parsed.query,
    read_at: new Date().toISOString(),
    rows: input.rows || [],
    status: input.status || "no_match",
    total_count: safeCount(input.total_count),
  };
}

function parseInvoiceSearch(messageValue: unknown): ParsedInvoiceSearch | "blocked" | null {
  const query = cleanText(messageValue, 500);

  if (!query || !/\binvoices?\b/i.test(query)) {
    return null;
  }

  if (writeWordPattern.test(query) || injectionPattern.test(query)) {
    return "blocked";
  }

  const match = query.match(invoiceSearchPattern);
  const bookerName = cleanText(match?.[1], 160);
  const companyName = cleanText(match?.[2], 160);

  if (
    !match ||
    !bookerName ||
    /\b(?:and|or)\b/i.test(bookerName) ||
    injectionPattern.test(bookerName) ||
    (companyName && injectionPattern.test(companyName))
  ) {
    return "blocked";
  }

  return {
    bookerName,
    companyName: companyName || null,
    query,
  };
}

function validActor(context: AdminDispatcherBoundaryContext) {
  return (
    context.mode === "server-session-role-surface" &&
    allowedActorRoles.has(context.role) &&
    Boolean(cleanText(context.actorLabel, 160))
  );
}

function validConfig() {
  const url = cleanText(process.env.SUPABASE_URL, 500);
  const key = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY, 2_000);

  if (!url || !key || key.length < 24 || /(?:placeholder|change.?me|example)/i.test(`${url} ${key}`)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !/(?:localhost|example)/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function createServerClient(): AdminAiInvoiceSearchClient {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: { persistSession: false },
  });
}

function blockedResult(query: string, page: number): AdminAiInvoiceSearchExecution {
  const parsed = { bookerName: "", companyName: null, query };
  return {
    data: invoiceSearchResult(parsed, page, {
      answer:
        "Ask AI can only read invoices here. Use “Show me all Booker Name invoices” or add “for Company Name”. Payment, email, issue, edit, and bulk actions must use the existing confirmed invoice controls.",
      status: "blocked",
    }),
    matched: true,
    ok: true,
  };
}

export async function executeAdminAiInvoiceSearch(
  messageValue: unknown,
  pageValue: unknown,
  context: AdminDispatcherBoundaryContext,
  client?: AdminAiInvoiceSearchClient,
): Promise<AdminAiInvoiceSearchExecution> {
  const parsed = parseInvoiceSearch(messageValue);
  const page = safePage(pageValue);

  if (!parsed) {
    return { matched: false };
  }

  if (parsed === "blocked") {
    return blockedResult(cleanText(messageValue, 500), page);
  }

  if (!validActor(context)) {
    return {
      error: "Live customer invoice search requires a verified Admin or Dispatcher session.",
      matched: true,
      ok: false,
      status: 403,
    };
  }

  if (!client && !validConfig()) {
    return { error: safeConfigError, matched: true, ok: false, status: 503 };
  }

  const database = client || createServerClient();
  const companyNameKey = normalizeIdentity(parsed.companyName);
  let verifiedCompany: { id: number; name: string } | null = null;

  if (parsed.companyName) {
    const { data, error } = await database
      .from("companies")
      .select("id, company_name")
      .ilike("company_name", escapeIlikeLiteral(parsed.companyName))
      .order("id", { ascending: true })
      .limit(3);

    if (error) {
      return { error: safeReadError, matched: true, ok: false, status: 500 };
    }

    const companies = asArray(data)
      .map(asRecord)
      .map((row) => ({ id: positiveInteger(row.id), name: cleanText(row.company_name, 160) }))
      .filter((row): row is { id: number; name: string } => Boolean(row.id && row.name))
      .filter((row) => normalizeIdentity(row.name) === companyNameKey);

    if (companies.length !== 1) {
      return {
        data: invoiceSearchResult(parsed, page, {
          answer: companies.length > 1
            ? "More than one exact Company matched. Open the Customer account manually."
            : `No exact Company named ${parsed.companyName} was found. No invoice rows were read.`,
          status: companies.length > 1 ? "ambiguous" : "no_match",
        }),
        matched: true,
        ok: true,
      };
    }

    verifiedCompany = companies[0];
  }

  let bookerQuery = database
    .from("bookers")
    .select("id, company_id, customer_id, booker_name")
    .ilike("booker_name", escapeIlikeLiteral(parsed.bookerName));

  if (verifiedCompany) {
    bookerQuery = bookerQuery.eq("company_id", verifiedCompany.id);
  }

  const { data: bookerData, error: bookerError } = await bookerQuery
    .order("id", { ascending: true })
    .limit(20);

  if (bookerError) {
    return { error: safeReadError, matched: true, ok: false, status: 500 };
  }

  const exactBookerRows = asArray(bookerData)
    .map(asRecord)
    .filter((row) => normalizeIdentity(row.booker_name) === normalizeIdentity(parsed.bookerName));

  if (exactBookerRows.length === 0) {
    let travelerQuery = database
      .from("travelers")
      .select("id")
      .ilike("traveler_name", escapeIlikeLiteral(parsed.bookerName));

    if (verifiedCompany) {
      travelerQuery = travelerQuery.eq("company_id", verifiedCompany.id);
    }

    const { data: travelerData, error: travelerError } = await travelerQuery
      .limit(2);

    if (travelerError) {
      return { error: safeReadError, matched: true, ok: false, status: 500 };
    }

    const travellerOnly = asArray(travelerData).length > 0;
    return {
      data: invoiceSearchResult(parsed, page, {
        answer: travellerOnly
          ? `${parsed.bookerName} matches a Traveller, not a Booker. Search with the Booker name; no invoice rows were read.`
          : `No exact Booker named ${parsed.bookerName} was found. No invoice rows were read.`,
        status: travellerOnly ? "traveller_only" : "no_match",
      }),
      matched: true,
      ok: true,
    };
  }

  const candidateCompanyIds = [...new Set(
    exactBookerRows.map((row) => positiveInteger(row.company_id)).filter((id): id is number => Boolean(id)),
  )];
  let companiesById = new Map<number, string>();

  if (verifiedCompany) {
    companiesById.set(verifiedCompany.id, verifiedCompany.name);
  } else if (candidateCompanyIds.length > 0) {
    const { data: companyData, error: companyError } = await database
      .from("companies")
      .select("id, company_name")
      .in("id", candidateCompanyIds)
      .order("id", { ascending: true })
      .limit(20);

    if (companyError) {
      return { error: safeReadError, matched: true, ok: false, status: 500 };
    }

    companiesById = new Map(
      asArray(companyData)
        .map(asRecord)
        .flatMap((row) => {
          const id = positiveInteger(row.id);
          const name = cleanText(row.company_name, 160);
          return id && name ? [[id, name] as const] : [];
        }),
    );
  }

  const candidates = exactBookerRows.map((row) => ({
    bookerId: positiveInteger(row.id),
    bookerName: cleanText(row.booker_name, 160),
    companyId: positiveInteger(row.company_id),
    customerId: positiveInteger(row.customer_id),
  }));
  const completeCandidates = candidates.filter((candidate) =>
    Boolean(
      candidate.bookerId &&
      candidate.bookerName &&
      candidate.companyId &&
      candidate.customerId &&
      companiesById.has(candidate.companyId),
    ),
  );

  if (completeCandidates.length !== 1 || candidates.length !== 1) {
    const companyOptions = [...new Set(
      completeCandidates
        .map((candidate) => candidate.companyId ? companiesById.get(candidate.companyId) || "" : "")
        .filter(Boolean),
    )].sort((left, right) => left.localeCompare(right));
    const legacyIdentity = completeCandidates.length === 0;

    return {
      data: invoiceSearchResult(parsed, page, {
        answer: legacyIdentity
          ? `${parsed.bookerName} has missing Company, Booker, or Customer identity. No invoice rows were read.`
          : `More than one Booker named ${parsed.bookerName} exists. Add the Company name; no invoice rows were read.`,
        company_options: companyOptions,
        legacy_rows_excluded: legacyIdentity,
        manual_folder_guidance: legacyIdentity ? manualFolderGuidance : null,
        status: legacyIdentity ? "legacy_identity" : "ambiguous",
      }),
      matched: true,
      ok: true,
    };
  }

  const candidate = completeCandidates[0];
  const companyName = companiesById.get(candidate.companyId as number) || "";
  const from = (page - 1) * adminAiInvoiceSearchPageSize;
  const to = from + adminAiInvoiceSearchPageSize - 1;
  const [invoiceResult, legacyResult] = await Promise.all([
    database
      .from("customer_invoice_records")
      .select(
        "invoice_number, status, amount_cents, issue_date_iso, issue_date_label, due_date_label, reference, line_items",
        { count: "exact" },
      )
      .eq("customer_id", candidate.customerId as number)
      .eq("booker_id", candidate.bookerId as number)
      .eq("document_type", "invoice")
      .eq("document_state", "issued")
      .order("created_at", { ascending: false })
      .range(from, to),
    database
      .from("customer_invoice_records")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", candidate.customerId as number)
      .is("booker_id", null)
      .eq("document_type", "invoice")
      .eq("document_state", "issued"),
  ]);

  if (invoiceResult.error || legacyResult.error) {
    return { error: safeReadError, matched: true, ok: false, status: 500 };
  }

  const rows = asArray(invoiceResult.data)
    .map(safeInvoiceRow)
    .filter((row): row is AdminAiInvoiceSearchRow => Boolean(row));
  const totalCount = safeCount(invoiceResult.count);
  const legacyRowsExcluded = safeCount(legacyResult.count) > 0;

  return {
    data: invoiceSearchResult(parsed, page, {
      answer: totalCount > 0
        ? `Found ${totalCount} issued invoice${totalCount === 1 ? "" : "s"} for ${companyName} · ${candidate.bookerName}.`
        : `No issued invoices were found for ${companyName} · ${candidate.bookerName}.`,
      booker_name: candidate.bookerName,
      company_name: companyName,
      has_more: to + 1 < totalCount,
      legacy_rows_excluded: legacyRowsExcluded,
      manual_folder_guidance: legacyRowsExcluded ? manualFolderGuidance : null,
      open_customer_path:
        `/customers/${encodeURIComponent(String(candidate.customerId))}` +
        `?name=${encodeURIComponent(`${companyName} · ${candidate.bookerName}`)}`,
      rows,
      status: "results",
      total_count: totalCount,
    }),
    matched: true,
    ok: true,
  };
}
