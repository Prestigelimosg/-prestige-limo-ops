import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceAdapterActor,
} from "./admin-booking-supabase-adapter";
import {
  checkAdminBookingPersistenceStagingConfigReadiness,
  checkCustomerBookingRequestPersistenceConfigReadiness,
} from "./admin-booking-supabase-adapter";
import { loadPublicCompanyProfile } from "./company-profile-persistence";
import { defaultCompanyProfile } from "./company-profile-shared";
import {
  createCustomerInvoicePdfBytes,
  formatInvoiceAmount,
  formatInvoiceDate,
  formatInvoiceMonth,
  pdfLogoFromJpegBytes,
  type CustomerLocalInvoiceLineItem,
  type CustomerLocalInvoiceRecord,
  type CustomerLocalInvoiceStatus,
} from "./customer-local-invoices";
import type { CustomerSavedBookingsBoundaryContext } from "./customer-saved-bookings-read";

export const customerInvoiceRecordVersion = "customer-invoice-record-v1";
export const customerInvoiceRecordTableName = "customer_invoice_records";

export type CustomerInvoiceEmailDeliveryStatus = "blocked" | "failed" | "not_sent" | "sent";

export type CustomerInvoiceStoredRecord = CustomerLocalInvoiceRecord & {
  customerEmail?: string;
  emailDeliveryStatus: CustomerInvoiceEmailDeliveryStatus;
  emailSentAt?: string | null;
  pdfFilename: string;
  storageSource: "server";
};

export type CustomerInvoiceCreateInput = {
  amountCents?: unknown;
  billingMonthLabel?: unknown;
  customerEmail?: unknown;
  customerId?: unknown;
  customerName?: unknown;
  dueDateIso?: unknown;
  lineItems?: unknown;
  reference?: unknown;
  route?: unknown;
  service?: unknown;
  status?: unknown;
};

type UnknownRecord = Record<string, unknown>;
type CustomerInvoiceClient = Pick<SupabaseClient, "from">;

type CustomerInvoiceResult<T> =
  | {
      data: T;
      ok: true;
      version: typeof customerInvoiceRecordVersion;
    }
  | {
      error: string;
      ok: false;
      status: 400 | 403 | 404 | 500 | 503;
      version: typeof customerInvoiceRecordVersion;
    };

type CustomerInvoicePdfResult = CustomerInvoiceResult<{
  bytes: Uint8Array;
  contentType: "application/pdf";
  filename: string;
  invoiceNumber: string;
}>;

const customerInvoiceSelect = [
  "id",
  "invoice_number",
  "customer_id",
  "customer_name",
  "customer_email",
  "status",
  "amount_cents",
  "amount_label",
  "billing_month_label",
  "issue_date_iso",
  "issue_date_label",
  "due_date_label",
  "reference",
  "route",
  "service",
  "line_items",
  "pdf_filename",
  "email_delivery_status",
  "email_sent_at",
  "created_at",
  "updated_at",
].join(", ");
const customerInvoicePdfSelect =
  "invoice_number, customer_id, pdf_base64, pdf_content_type, pdf_filename";
const maxTextLength = 1000;
const maxEmailLength = 180;
const safePersistenceConfigError = "Customer invoice persistence is not ready.";
const safeValidationError = "Customer invoice details are invalid or outside the approved customer invoice scope.";
const safeWriteError = "Customer invoice record failed safely.";
const safeReadError = "Customer invoice records failed safely.";
const safeMissingError = "Customer invoice record was not found.";
const safeCustomerAuthError = "Customer invoice records require secure customer account access.";
const forbiddenCustomerInvoiceFragments = [
  "admin_finance",
  "admin_internal_status",
  "admin_note",
  "api_key",
  "debug",
  "dev_archive",
  "driver_payout",
  "driver_token",
  "internal_admin_note",
  "internal_finance",
  "internal_note",
  "mock_archive",
  "mock_qa",
  "parser_debug",
  "parser_learning",
  "paynow_payout",
  "payout",
  "raw_token",
  "secret",
  "server_secret",
  "service_role",
  "token_hash",
];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invoiceNumberPattern = /^INV-\d{8}-\d{4}$/;
const localJpegLogoPattern = /^\/[a-z0-9][a-z0-9/_-]*\.jpe?g$/i;

function createServerClient() {
  return createClient(
    process.env.SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    {
      auth: {
        persistSession: false,
      },
    },
  );
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenCustomerInvoiceFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength = maxTextLength) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > maxLength || includesForbiddenFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeEmail(value: unknown) {
  const cleaned = safeText(value, maxEmailLength);

  return cleaned && emailPattern.test(cleaned) ? cleaned.toLowerCase() : null;
}

function safeInvoiceNumber(value: unknown) {
  const cleaned = safeText(value, 40);

  return cleaned && invoiceNumberPattern.test(cleaned) ? cleaned : null;
}

function safeStatus(value: unknown): CustomerLocalInvoiceStatus | null {
  return value === "Paid" || value === "Unpaid" ? value : null;
}

function safeAmountCents(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);

  return Number.isInteger(amount) && amount > 0 && amount <= 100000000 ? amount : null;
}

function safeLineItems(value: unknown): CustomerLocalInvoiceLineItem[] | null {
  if (!Array.isArray(value)) {
    return [];
  }

  const lineItems = value
    .map((item) => {
      const record = asRecord(item);
      const amountLabel = safeText(record.amountLabel, 40);
      const description = safeText(record.description, 500);

      return amountLabel && description ? { amountLabel, description } : null;
    })
    .filter((item): item is CustomerLocalInvoiceLineItem => Boolean(item));

  return lineItems.length === value.length ? lineItems : null;
}

function safeActor(actor: AdminBookingPersistenceAdapterActor) {
  return (
    actor.source_surface === "admin_api" &&
    (actor.actor_role === "admin" || actor.actor_role === "dispatcher")
  );
}

function dateFromDueDateIso(value: unknown) {
  const cleaned = safeText(value, 20);

  if (!cleaned || !/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return null;
  }

  const date = new Date(`${cleaned}T00:00:00+08:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function base64FromBytes(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

function bytesFromBase64(value: unknown) {
  const cleaned = safeText(value, 1500000);

  if (!cleaned) {
    return null;
  }

  try {
    return new Uint8Array(Buffer.from(cleaned, "base64"));
  } catch {
    return null;
  }
}

function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function toStoredRecord(row: UnknownRecord): CustomerInvoiceStoredRecord | null {
  const invoiceNumber = safeText(row.invoice_number, 40);
  const customerName = safeText(row.customer_name, 180);
  const amountCents = safeAmountCents(row.amount_cents);
  const status = safeStatus(row.status);

  if (!invoiceNumber || !customerName || !amountCents || !status) {
    return null;
  }

  return {
    amountCents,
    amountLabel: safeText(row.amount_label, 40) || formatInvoiceAmount(amountCents),
    billingMonthLabel: safeText(row.billing_month_label, 80) || "Current month",
    customerEmail: safeEmail(row.customer_email) || undefined,
    customerId: safeText(row.customer_id, 160) || customerName,
    customerName,
    dueDateLabel: safeText(row.due_date_label, 80) || "Due date to confirm",
    emailDeliveryStatus:
      row.email_delivery_status === "sent" ||
      row.email_delivery_status === "blocked" ||
      row.email_delivery_status === "failed"
        ? row.email_delivery_status
        : "not_sent",
    emailSentAt: safeText(row.email_sent_at, 80),
    id: safeText(row.id, 120) || invoiceNumber,
    invoiceNumber,
    issueDateIso: safeText(row.issue_date_iso, 80) || new Date().toISOString(),
    issueDateLabel: safeText(row.issue_date_label, 80) || formatInvoiceDate(new Date()),
    lineItems: safeLineItems(row.line_items) || [],
    pdfFilename: safeText(row.pdf_filename, 180) || `${invoiceNumber}.pdf`,
    reference: safeText(row.reference, 160) || invoiceNumber,
    route: safeText(row.route, 600) || "Route to confirm",
    service: safeText(row.service, 160) || "Service",
    source: "local-admin-issued-invoice-v1",
    status,
    storageSource: "server",
  };
}

function sanitizeCreateInput(input: CustomerInvoiceCreateInput): CustomerInvoiceResult<{
  amountCents: number;
  billingMonthLabel: string;
  customerEmail: string | null;
  customerId: string;
  customerName: string;
  dueDate: Date;
  lineItems: CustomerLocalInvoiceLineItem[];
  reference: string;
  route: string;
  service: string;
  status: CustomerLocalInvoiceStatus;
}> {
  const amountCents = safeAmountCents(input.amountCents);
  const customerId = safeText(input.customerId, 160);
  const customerName = safeText(input.customerName, 180);
  const dueDate = dateFromDueDateIso(input.dueDateIso);
  const reference = safeText(input.reference, 160);
  const route = safeText(input.route, 600);
  const service = safeText(input.service, 160);
  const status = safeStatus(input.status);
  const lineItems = safeLineItems(input.lineItems);

  if (
    !amountCents ||
    !customerId ||
    !customerName ||
    !dueDate ||
    !reference ||
    !route ||
    !service ||
    !status ||
    !lineItems
  ) {
    return {
      error: safeValidationError,
      ok: false,
      status: 400,
      version: customerInvoiceRecordVersion,
    };
  }

  return {
    data: {
      amountCents,
      billingMonthLabel: safeText(input.billingMonthLabel, 80) || formatInvoiceMonth(new Date()),
      customerEmail: safeEmail(input.customerEmail),
      customerId,
      customerName,
      dueDate,
      lineItems,
      reference,
      route,
      service,
      status,
    },
    ok: true,
    version: customerInvoiceRecordVersion,
  };
}

function safeFailure<T>(
  error: string,
  status: 400 | 403 | 404 | 500 | 503,
): CustomerInvoiceResult<T> {
  return {
    error,
    ok: false,
    status,
    version: customerInvoiceRecordVersion,
  };
}

function duplicateInvoiceError(error: unknown) {
  const record = asRecord(error);
  const code = safeText(record.code, 40)?.toLowerCase();
  const message = Object.values(record)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toLowerCase();

  return code === "23505" || message.includes("duplicate key");
}

async function loadServerLogoImage() {
  const profileResult = await loadPublicCompanyProfile();
  const profile = profileResult.profile || defaultCompanyProfile;
  const logoImageUrl = profile.logo_image_url || defaultCompanyProfile.logo_image_url;

  if (!logoImageUrl || !localJpegLogoPattern.test(logoImageUrl)) {
    return {
      logoImage: null,
      profile,
    };
  }

  try {
    const logoPath = path.join(process.cwd(), "public", logoImageUrl.replace(/^\//, ""));
    const logoImage = pdfLogoFromJpegBytes(new Uint8Array(await readFile(logoPath)));

    return {
      logoImage,
      profile,
    };
  } catch {
    return {
      logoImage: null,
      profile,
    };
  }
}

async function nextInvoiceNumber(client: CustomerInvoiceClient, dateKey: string, attempt: number) {
  const { count } = await client
    .from(customerInvoiceRecordTableName)
    .select("id", { count: "exact", head: true })
    .eq("invoice_date_key", dateKey);
  const sequence = Math.max(1, (count || 0) + 1 + attempt);

  return `INV-${dateKey}-${String(sequence).padStart(4, "0")}`;
}

export async function createCustomerInvoiceRecord(
  input: CustomerInvoiceCreateInput,
  actor: AdminBookingPersistenceAdapterActor,
  client: CustomerInvoiceClient = createServerClient(),
): Promise<CustomerInvoiceResult<CustomerInvoiceStoredRecord>> {
  if (!safeActor(actor)) {
    return safeFailure(safePersistenceConfigError, 403);
  }

  const readiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!readiness.ok) {
    return safeFailure(safePersistenceConfigError, 503);
  }

  const sanitized = sanitizeCreateInput(input);

  if (!sanitized.ok) {
    return sanitized;
  }

  const issueDate = new Date();
  const invoiceDateKey = issueDate.toISOString().slice(0, 10).replace(/-/g, "");
  const amountLabel = formatInvoiceAmount(sanitized.data.amountCents);
  const lineItems =
    sanitized.data.lineItems.length > 0
      ? sanitized.data.lineItems
      : [
          {
            amountLabel,
            description: `${sanitized.data.service} - ${sanitized.data.reference} - ${sanitized.data.route}`,
          },
        ];
  const { logoImage, profile } = await loadServerLogoImage();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invoiceNumber = await nextInvoiceNumber(client, invoiceDateKey, attempt);
    const invoiceForPdf: CustomerLocalInvoiceRecord = {
      amountCents: sanitized.data.amountCents,
      amountLabel,
      billingMonthLabel: sanitized.data.billingMonthLabel,
      customerId: sanitized.data.customerId,
      customerName: sanitized.data.customerName,
      dueDateLabel: formatInvoiceDate(sanitized.data.dueDate),
      id: `${invoiceNumber}:${sanitized.data.customerId}:${sanitized.data.reference}`,
      invoiceNumber,
      issueDateIso: issueDate.toISOString(),
      issueDateLabel: formatInvoiceDate(issueDate),
      lineItems,
      reference: sanitized.data.reference,
      route: sanitized.data.route,
      service: sanitized.data.service,
      source: "local-admin-issued-invoice-v1",
      status: sanitized.data.status,
    };
    const pdfBytes = createCustomerInvoicePdfBytes(invoiceForPdf, profile, logoImage);
    const pdfBase64 = base64FromBytes(pdfBytes);
    const pdfSha256 = sha256Hex(pdfBytes);
    const pdfFilename = `${invoiceNumber}.pdf`;
    const { data, error } = await client
      .from(customerInvoiceRecordTableName)
      .insert({
        actor_label: actor.actor_label,
        actor_role: actor.actor_role,
        amount_cents: invoiceForPdf.amountCents,
        amount_label: invoiceForPdf.amountLabel,
        billing_month_label: invoiceForPdf.billingMonthLabel,
        customer_email: sanitized.data.customerEmail,
        customer_id: invoiceForPdf.customerId,
        customer_name: invoiceForPdf.customerName,
        due_date_label: invoiceForPdf.dueDateLabel,
        email_delivery_status: "not_sent",
        invoice_date_key: invoiceDateKey,
        invoice_number: invoiceNumber,
        issue_date_iso: invoiceForPdf.issueDateIso,
        issue_date_label: invoiceForPdf.issueDateLabel,
        line_items: lineItems,
        pdf_base64: pdfBase64,
        pdf_content_type: "application/pdf",
        pdf_filename: pdfFilename,
        pdf_sha256: pdfSha256,
        reference: invoiceForPdf.reference,
        route: invoiceForPdf.route,
        service: invoiceForPdf.service,
        source_surface: "admin_api",
        status: invoiceForPdf.status,
        updated_at: new Date().toISOString(),
      })
      .select(customerInvoiceSelect)
      .single();

    if (!error && data) {
      const record = toStoredRecord(asRecord(data));

      return record ? {
        data: record,
        ok: true,
        version: customerInvoiceRecordVersion,
      } : safeFailure(safeWriteError, 500);
    }

    if (!duplicateInvoiceError(error)) {
      return safeFailure(safeWriteError, 500);
    }
  }

  return safeFailure(safeWriteError, 500);
}

export async function loadAdminCustomerInvoiceRecords(
  actor: AdminBookingPersistenceAdapterActor,
  client: CustomerInvoiceClient = createServerClient(),
): Promise<CustomerInvoiceResult<CustomerInvoiceStoredRecord[]>> {
  if (!safeActor(actor)) {
    return safeFailure(safePersistenceConfigError, 403);
  }

  const readiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!readiness.ok) {
    return safeFailure(safePersistenceConfigError, 503);
  }

  const { data, error } = await client
    .from(customerInvoiceRecordTableName)
    .select(customerInvoiceSelect)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return safeFailure(safeReadError, 500);
  }

  return {
    data: asArray(data).map(asRecord).map(toStoredRecord).filter((record): record is CustomerInvoiceStoredRecord => Boolean(record)),
    ok: true,
    version: customerInvoiceRecordVersion,
  };
}

export async function updateAdminCustomerInvoiceStatus(
  invoiceNumberInput: unknown,
  statusInput: unknown,
  actor: AdminBookingPersistenceAdapterActor,
  client: CustomerInvoiceClient = createServerClient(),
): Promise<CustomerInvoiceResult<CustomerInvoiceStoredRecord>> {
  if (!safeActor(actor)) {
    return safeFailure(safePersistenceConfigError, 403);
  }

  const readiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!readiness.ok) {
    return safeFailure(safePersistenceConfigError, 503);
  }

  const invoiceNumber = safeInvoiceNumber(invoiceNumberInput);
  const status = safeStatus(statusInput);

  if (!invoiceNumber || !status) {
    return safeFailure(safeValidationError, 400);
  }

  const { data, error } = await client
    .from(customerInvoiceRecordTableName)
    .update({
      actor_label: actor.actor_label,
      actor_role: actor.actor_role,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("invoice_number", invoiceNumber)
    .select(customerInvoiceSelect)
    .maybeSingle();

  if (error) {
    return safeFailure(safeWriteError, 500);
  }

  const record = toStoredRecord(asRecord(data));

  if (!record) {
    return safeFailure(safeMissingError, 404);
  }

  const { logoImage, profile } = await loadServerLogoImage();
  const pdfBytes = createCustomerInvoicePdfBytes(record, profile, logoImage);
  const { data: refreshedData, error: refreshedError } = await client
    .from(customerInvoiceRecordTableName)
    .update({
      pdf_base64: base64FromBytes(pdfBytes),
      pdf_content_type: "application/pdf",
      pdf_filename: `${record.invoiceNumber}.pdf`,
      pdf_sha256: sha256Hex(pdfBytes),
      updated_at: new Date().toISOString(),
    })
    .eq("invoice_number", record.invoiceNumber)
    .select(customerInvoiceSelect)
    .maybeSingle();

  if (refreshedError) {
    return safeFailure(safeWriteError, 500);
  }

  const refreshedRecord = toStoredRecord(asRecord(refreshedData));

  return refreshedRecord ? {
    data: refreshedRecord,
    ok: true,
    version: customerInvoiceRecordVersion,
  } : safeFailure(safeMissingError, 404);
}

export async function loadAdminCustomerInvoicePdf(
  invoiceNumberInput: unknown,
  actor: AdminBookingPersistenceAdapterActor,
  client: CustomerInvoiceClient = createServerClient(),
): Promise<CustomerInvoicePdfResult> {
  if (!safeActor(actor)) {
    return safeFailure(safePersistenceConfigError, 403);
  }

  const readiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!readiness.ok) {
    return safeFailure(safePersistenceConfigError, 503);
  }

  const invoiceNumber = safeInvoiceNumber(invoiceNumberInput);

  if (!invoiceNumber) {
    return safeFailure(safeValidationError, 400);
  }

  const { data, error } = await client
    .from(customerInvoiceRecordTableName)
    .select(customerInvoicePdfSelect)
    .eq("invoice_number", invoiceNumber)
    .maybeSingle();

  if (error) {
    return safeFailure(safeReadError, 500);
  }

  const row = asRecord(data);
  const bytes = bytesFromBase64(row.pdf_base64);
  const filename = safeText(row.pdf_filename, 180) || `${invoiceNumber}.pdf`;

  return bytes ? {
    data: {
      bytes,
      contentType: "application/pdf",
      filename,
      invoiceNumber,
    },
    ok: true,
    version: customerInvoiceRecordVersion,
  } : safeFailure(safeMissingError, 404);
}

export async function loadCustomerInvoiceRecordsForPortal(
  context: CustomerSavedBookingsBoundaryContext,
  client: CustomerInvoiceClient = createServerClient(),
): Promise<CustomerInvoiceResult<CustomerInvoiceStoredRecord[]>> {
  const readiness = checkCustomerBookingRequestPersistenceConfigReadiness();
  const customerAccountReference = safeText(context.customer_account_reference, 160);

  if (!readiness.ok) {
    return safeFailure(safePersistenceConfigError, 503);
  }

  if (!customerAccountReference) {
    return safeFailure(safeCustomerAuthError, 403);
  }

  const { data, error } = await client
    .from(customerInvoiceRecordTableName)
    .select(customerInvoiceSelect)
    .eq("customer_id", customerAccountReference)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return safeFailure(safeReadError, 500);
  }

  return {
    data: asArray(data).map(asRecord).map(toStoredRecord).filter((record): record is CustomerInvoiceStoredRecord => Boolean(record)),
    ok: true,
    version: customerInvoiceRecordVersion,
  };
}

export async function loadCustomerInvoicePdfForPortal(
  invoiceNumberInput: unknown,
  context: CustomerSavedBookingsBoundaryContext,
  client: CustomerInvoiceClient = createServerClient(),
): Promise<CustomerInvoicePdfResult> {
  const readiness = checkCustomerBookingRequestPersistenceConfigReadiness();
  const customerAccountReference = safeText(context.customer_account_reference, 160);
  const invoiceNumber = safeInvoiceNumber(invoiceNumberInput);

  if (!readiness.ok) {
    return safeFailure(safePersistenceConfigError, 503);
  }

  if (!customerAccountReference) {
    return safeFailure(safeCustomerAuthError, 403);
  }

  if (!invoiceNumber) {
    return safeFailure(safeValidationError, 400);
  }

  const { data, error } = await client
    .from(customerInvoiceRecordTableName)
    .select(customerInvoicePdfSelect)
    .eq("customer_id", customerAccountReference)
    .eq("invoice_number", invoiceNumber)
    .maybeSingle();

  if (error) {
    return safeFailure(safeReadError, 500);
  }

  const row = asRecord(data);
  const bytes = bytesFromBase64(row.pdf_base64);
  const filename = safeText(row.pdf_filename, 180) || `${invoiceNumber}.pdf`;

  return bytes ? {
    data: {
      bytes,
      contentType: "application/pdf",
      filename,
      invoiceNumber,
    },
    ok: true,
    version: customerInvoiceRecordVersion,
  } : safeFailure(safeMissingError, 404);
}

export async function updateCustomerInvoiceEmailStatus(
  invoiceNumberInput: unknown,
  emailDeliveryStatus: CustomerInvoiceEmailDeliveryStatus,
  emailMessageId: string | null,
  actor: AdminBookingPersistenceAdapterActor,
  client: CustomerInvoiceClient = createServerClient(),
): Promise<CustomerInvoiceResult<CustomerInvoiceStoredRecord>> {
  if (!safeActor(actor)) {
    return safeFailure(safePersistenceConfigError, 403);
  }

  const invoiceNumber = safeInvoiceNumber(invoiceNumberInput);

  if (!invoiceNumber) {
    return safeFailure(safeValidationError, 400);
  }

  const { data, error } = await client
    .from(customerInvoiceRecordTableName)
    .update({
      actor_label: actor.actor_label,
      actor_role: actor.actor_role,
      email_delivery_status: emailDeliveryStatus,
      email_message_id: emailMessageId,
      email_sent_at: emailDeliveryStatus === "sent" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("invoice_number", invoiceNumber)
    .select(customerInvoiceSelect)
    .maybeSingle();

  if (error) {
    return safeFailure(safeWriteError, 500);
  }

  const record = toStoredRecord(asRecord(data));

  return record ? {
    data: record,
    ok: true,
    version: customerInvoiceRecordVersion,
  } : safeFailure(safeMissingError, 404);
}

export function sanitizeCustomerInvoiceRecipientEmail(value: unknown) {
  return safeEmail(value);
}
