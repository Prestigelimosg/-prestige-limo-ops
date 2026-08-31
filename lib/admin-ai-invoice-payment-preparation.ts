import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminDispatcherBoundaryContext } from "./admin-dispatcher-auth-boundary";

export const adminAiInvoicePaymentPreparationIntent = "prepare_invoice_payment_review";

export type AdminAiInvoicePaymentPreparationInvoice = {
  amount_label: string;
  balance_label: string;
  booker_id: number;
  booker_name: string;
  booking_references: string[];
  company_id: number;
  company_name: string;
  customer_id: number;
  due_date: string;
  invoice_number: string;
  issue_date: string;
  status: "Paid" | "Unpaid";
};

export type AdminAiInvoicePaymentPreparationRequirements = {
  payment_method_required: true;
  payment_methods: ["Bank transfer", "Card", "Cash"];
  thank_you_choice_required: true;
};

export type AdminAiInvoicePaymentPreparationResult = {
  answer: string;
  intent: typeof adminAiInvoicePaymentPreparationIntent;
  invoice: AdminAiInvoicePaymentPreparationInvoice | null;
  open_customer_path: string | null;
  query: string;
  read_at: string;
  ready_for_manual_review: boolean;
  requirements: AdminAiInvoicePaymentPreparationRequirements | null;
  status:
    | "already_paid"
    | "ambiguous"
    | "blocked"
    | "identity_review"
    | "not_found"
    | "ready"
    | "wrong_document";
};

export type AdminAiInvoicePaymentPreparationExecution =
  | { matched: false }
  | { data: AdminAiInvoicePaymentPreparationResult; matched: true; ok: true }
  | { error: string; matched: true; ok: false; status: 403 | 500 | 503 };

type UnknownRecord = Record<string, unknown>;
type AdminAiInvoicePaymentPreparationClient = Pick<SupabaseClient, "from">;

export type AdminAiInvoicePaymentPreparationSnapshot = {
  bookerRows: unknown[];
  companyRows: unknown[];
  invoiceRows: unknown[];
};

export type AdminAiInvoicePaymentPreparationDependencies = {
  loadSnapshot(invoiceNumber: string): Promise<AdminAiInvoicePaymentPreparationSnapshot>;
};

type ParsedInvoicePaymentPreparation = {
  invoiceNumber: string;
  query: string;
};

const allowedActorRoles = new Set(["admin", "dispatcher"]);
const safeConfigError = "Live invoice payment preparation is not configured on this server.";
const safeReadError = "Invoice payment preparation failed safely. No invoice or payment was changed.";
const invoiceNumberPattern = /^(?:(?:INV|QUO|CN)-\d{8}-\d{4}|[A-Z0-9]{2,12}-\d{4,})$/;
const preparePattern = /^prepare\s+invoice\s+([a-z0-9-]+)\s+to\s+mark\s+paid[\s?.!]*$/i;
const helpPattern = /^help\s+me\s+mark\s+invoice\s+([a-z0-9-]+)\s+paid[\s?.!]*$/i;
const injectionPattern =
  /(?:ignore\s+(?:all\s+)?(?:previous|prior)|system\s+prompt|developer\s+message|service[_\s-]?role|api[_\s-]?key|database\s+credential|\b(?:drop|insert|select|update|delete)\s+(?:table|from|into|customer_invoice_records)\b)/i;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function cleanText(value: unknown, maximumLength = 180) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
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

function parseBookingReferences(value: UnknownRecord) {
  const references = [cleanText(value.reference, 160)];
  if (Array.isArray(value.line_items)) {
    value.line_items.forEach((item) => {
      references.push(cleanText(asRecord(item).bookingReference, 160));
    });
  }
  return [...new Set(references.filter(Boolean))].slice(0, 20);
}

function parseInvoicePaymentPreparation(
  messageValue: unknown,
): ParsedInvoicePaymentPreparation | "blocked" | null {
  const query = cleanText(messageValue, 500);
  if (!query || !/\binvoices?\b/i.test(query) || !/\b(?:mark|paid)\b/i.test(query)) return null;
  if (injectionPattern.test(query)) return "blocked";
  const match = query.match(preparePattern) || query.match(helpPattern);
  const invoiceNumber = cleanText(match?.[1], 80).toUpperCase();
  if (!match || !invoiceNumberPattern.test(invoiceNumber)) return "blocked";
  return { invoiceNumber, query };
}

function validActor(context: AdminDispatcherBoundaryContext) {
  return context.mode === "server-session-role-surface" &&
    allowedActorRoles.has(context.role) &&
    Boolean(cleanText(context.actorLabel, 160));
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

function createServerClient(): AdminAiInvoicePaymentPreparationClient {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: { persistSession: false },
  });
}

async function loadDefaultSnapshot(
  invoiceNumber: string,
): Promise<AdminAiInvoicePaymentPreparationSnapshot> {
  const database = createServerClient();
  const invoiceResult = await database
    .from("customer_invoice_records")
    .select(
      "invoice_number, customer_id, booker_id, document_type, document_state, status, amount_cents, issue_date_iso, issue_date_label, due_date_label, reference, line_items",
    )
    .eq("invoice_number", invoiceNumber)
    .limit(3);
  if (invoiceResult.error) throw new Error(safeReadError);
  const invoiceRows = Array.isArray(invoiceResult.data) ? invoiceResult.data : [];
  if (invoiceRows.length !== 1) return { bookerRows: [], companyRows: [], invoiceRows };

  const invoice = asRecord(invoiceRows[0]);
  const bookerId = positiveInteger(invoice.booker_id);
  const customerId = positiveInteger(invoice.customer_id);
  if (!bookerId || !customerId) return { bookerRows: [], companyRows: [], invoiceRows };

  const bookerResult = await database
    .from("bookers")
    .select("id, company_id, customer_id, booker_name")
    .eq("id", bookerId)
    .limit(2);
  if (bookerResult.error) throw new Error(safeReadError);
  const bookerRows = Array.isArray(bookerResult.data) ? bookerResult.data : [];
  if (bookerRows.length !== 1) return { bookerRows, companyRows: [], invoiceRows };

  const companyId = positiveInteger(asRecord(bookerRows[0]).company_id);
  if (!companyId) return { bookerRows, companyRows: [], invoiceRows };
  const companyResult = await database
    .from("companies")
    .select("id, company_name")
    .eq("id", companyId)
    .limit(2);
  if (companyResult.error) throw new Error(safeReadError);
  return {
    bookerRows,
    companyRows: Array.isArray(companyResult.data) ? companyResult.data : [],
    invoiceRows,
  };
}

const defaultDependencies: AdminAiInvoicePaymentPreparationDependencies = {
  loadSnapshot: loadDefaultSnapshot,
};

function result(
  query: string,
  input: Omit<AdminAiInvoicePaymentPreparationResult, "intent" | "query" | "read_at">,
): AdminAiInvoicePaymentPreparationResult {
  return {
    ...input,
    intent: adminAiInvoicePaymentPreparationIntent,
    query,
    read_at: new Date().toISOString(),
  };
}

function blockedResult(query: string): AdminAiInvoicePaymentPreparationExecution {
  return {
    data: result(query, {
      answer: "Ask AI can prepare only one exact issued invoice number for manual payment review. Bulk, name-based, Company-wide, and automatic payment actions are not allowed.",
      invoice: null,
      open_customer_path: null,
      ready_for_manual_review: false,
      requirements: null,
      status: "blocked",
    }),
    matched: true,
    ok: true,
  };
}

export async function executeAdminAiInvoicePaymentPreparation(
  messageValue: unknown,
  context: AdminDispatcherBoundaryContext,
  dependencies: AdminAiInvoicePaymentPreparationDependencies = defaultDependencies,
): Promise<AdminAiInvoicePaymentPreparationExecution> {
  const parsed = parseInvoicePaymentPreparation(messageValue);
  if (!parsed) return { matched: false };
  if (parsed === "blocked") return blockedResult(cleanText(messageValue, 500));
  if (!validActor(context)) {
    return {
      error: "Invoice payment preparation requires a verified Admin or Dispatcher session.",
      matched: true,
      ok: false,
      status: 403,
    };
  }
  if (dependencies === defaultDependencies && !validConfig()) {
    return { error: safeConfigError, matched: true, ok: false, status: 503 };
  }

  let snapshot: AdminAiInvoicePaymentPreparationSnapshot;
  try {
    snapshot = await dependencies.loadSnapshot(parsed.invoiceNumber);
  } catch {
    return { error: safeReadError, matched: true, ok: false, status: 500 };
  }

  const exactInvoices = snapshot.invoiceRows
    .map(asRecord)
    .filter((row) => cleanText(row.invoice_number, 80).toUpperCase() === parsed.invoiceNumber);
  if (exactInvoices.length === 0) {
    return {
      data: result(parsed.query, {
        answer: `No exact invoice numbered ${parsed.invoiceNumber} was found. Nothing was prepared or changed.`,
        invoice: null,
        open_customer_path: null,
        ready_for_manual_review: false,
        requirements: null,
        status: "not_found",
      }),
      matched: true,
      ok: true,
    };
  }
  if (exactInvoices.length !== 1) {
    return {
      data: result(parsed.query, {
        answer: `${parsed.invoiceNumber} is not unique. Open the Customer account manually; nothing was prepared or changed.`,
        invoice: null,
        open_customer_path: null,
        ready_for_manual_review: false,
        requirements: null,
        status: "ambiguous",
      }),
      matched: true,
      ok: true,
    };
  }

  const invoiceRow = exactInvoices[0];
  if (invoiceRow.document_type !== "invoice" || invoiceRow.document_state !== "issued") {
    return {
      data: result(parsed.query, {
        answer: `${parsed.invoiceNumber} is not an issued invoice. Quotations, credit notes, and drafts cannot be prepared for Mark paid.`,
        invoice: null,
        open_customer_path: null,
        ready_for_manual_review: false,
        requirements: null,
        status: "wrong_document",
      }),
      matched: true,
      ok: true,
    };
  }

  const customerId = positiveInteger(invoiceRow.customer_id);
  const bookerId = positiveInteger(invoiceRow.booker_id);
  const bookerRows = snapshot.bookerRows.map(asRecord);
  const booker = bookerRows.length === 1 ? bookerRows[0] : null;
  const companyId = positiveInteger(booker?.company_id);
  const companyRows = snapshot.companyRows.map(asRecord);
  const company = companyRows.length === 1 ? companyRows[0] : null;
  const identityValid = Boolean(
    customerId &&
    bookerId &&
    booker &&
    positiveInteger(booker.id) === bookerId &&
    positiveInteger(booker.customer_id) === customerId &&
    companyId &&
    company &&
    positiveInteger(company.id) === companyId &&
    cleanText(booker.booker_name, 160) &&
    cleanText(company.company_name, 160),
  );
  const amountCents = safeAmountCents(invoiceRow.amount_cents);
  const invoiceStatus = invoiceRow.status === "Paid" || invoiceRow.status === "Unpaid"
    ? invoiceRow.status
    : null;
  if (!identityValid || !amountCents || !invoiceStatus) {
    return {
      data: result(parsed.query, {
        answer: `${parsed.invoiceNumber} needs manual identity review. Exact Customer, Company, and Booker evidence is incomplete or inconsistent; no invoice details or action were prepared.`,
        invoice: null,
        open_customer_path: null,
        ready_for_manual_review: false,
        requirements: null,
        status: "identity_review",
      }),
      matched: true,
      ok: true,
    };
  }

  const bookerName = cleanText(booker?.booker_name, 160);
  const companyName = cleanText(company?.company_name, 160);
  const invoice: AdminAiInvoicePaymentPreparationInvoice = {
    amount_label: formatAmount(amountCents),
    balance_label: invoiceStatus === "Paid" ? formatAmount(0) : formatAmount(amountCents),
    booker_id: bookerId as number,
    booker_name: bookerName,
    booking_references: parseBookingReferences(invoiceRow),
    company_id: companyId as number,
    company_name: companyName,
    customer_id: customerId as number,
    due_date: cleanText(invoiceRow.due_date_label, 80) || "Due date not recorded",
    invoice_number: parsed.invoiceNumber,
    issue_date:
      cleanText(invoiceRow.issue_date_label, 80) ||
      cleanText(invoiceRow.issue_date_iso, 80) ||
      "Issue date not recorded",
    status: invoiceStatus,
  };
  const openCustomerPath =
    `/customers/${encodeURIComponent(String(customerId))}` +
    `?name=${encodeURIComponent(`${companyName} · ${bookerName}`)}`;

  if (invoiceStatus === "Paid") {
    return {
      data: result(parsed.query, {
        answer: `${parsed.invoiceNumber} is already Paid. No Mark paid preparation or payment action is available.`,
        invoice,
        open_customer_path: openCustomerPath,
        ready_for_manual_review: false,
        requirements: null,
        status: "already_paid",
      }),
      matched: true,
      ok: true,
    };
  }

  return {
    data: result(parsed.query, {
      answer: `${parsed.invoiceNumber} is ready for manual payment review in the existing Customer Account Section 2. Ask AI has not marked it paid.`,
      invoice,
      open_customer_path: openCustomerPath,
      ready_for_manual_review: true,
      requirements: {
        payment_method_required: true,
        payment_methods: ["Bank transfer", "Card", "Cash"],
        thank_you_choice_required: true,
      },
      status: "ready",
    }),
    matched: true,
    ok: true,
  };
}
