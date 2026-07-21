import { createHash } from "node:crypto";

import { resolveAdminCustomerInvoiceBoundary } from "../../../lib/admin-customer-invoice-boundary";
import {
  customerInvoiceRecipientsAllowed,
  selectedCustomerInvoiceRecipients,
} from "../../../lib/customer-invoice-email-recipients";
import {
  loadAdminCustomerInvoiceRecord,
  loadAdminCustomerInvoicePdf,
  recordCustomerInvoiceActionEmailDelivery,
  sanitizeCustomerInvoiceRecipientEmail,
  updateCustomerInvoiceEmailStatus,
} from "../../../lib/customer-invoice-record-persistence";
import {
  buildCustomerInvoiceActionEmail,
  type CustomerInvoiceEmailMessageKind,
} from "../../../lib/customer-invoice-action-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const resendEmailApiUrl = "https://api.resend.com/emails";
const selectedProvider = "resend";
const safeProviderConfigError = "Customer invoice email sending is not configured.";
const safeProviderFailureError = "Customer invoice email failed safely.";
const safeRecipientError = "Customer invoice email recipient is invalid or not allowlisted.";
const safeDraftDocumentError = "Customer invoice email can only send issued documents.";
const safeMessageKindError = "Customer invoice email action is invalid.";
const safeReminderStatusError = "Payment reminders require an unpaid issued invoice.";
const safeThankYouStatusError = "Payment thank-you email requires a paid issued invoice.";

function safeErrorResponse(result: { error: string; status: number }) {
  return Response.json(
    {
      error: result.error,
      ok: false,
    },
    { status: result.status },
  );
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Customer invoice email request failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

function cleanConfigValue(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function validConfigValue(value: string | null) {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();

  return !(
    normalized.includes("placeholder") ||
    normalized.includes("change_me") ||
    normalized.includes("changeme") ||
    normalized.includes("replace_me") ||
    normalized.includes("example") ||
    normalized.includes("<") ||
    normalized.includes(">")
  );
}

function validProviderToken(value: string | null) {
  return !!value && validConfigValue(value) && value.length >= 24;
}

function parseAllowlist(value: string | null) {
  return value
    ? value
        .split(/[\s,]+/)
        .map((entry) => sanitizeCustomerInvoiceRecipientEmail(entry))
        .filter((entry): entry is string => Boolean(entry))
    : [];
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();

    return body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function normalizedMessageId(response: Response) {
  try {
    const body = await response.json();
    const id = typeof body?.id === "string" ? body.id.trim() : "";

    return id || null;
  } catch {
    return null;
  }
}

function buildProviderBody(input: {
  contentBase64: string;
  documentLabel: string;
  filename: string;
  from: string;
  html?: string;
  invoiceNumber: string;
  recipients: string[];
  replyTo: string | null;
  subject?: string;
  text?: string;
}) {
  return JSON.stringify({
    attachments: [
      {
        content: input.contentBase64,
        filename: input.filename,
      },
    ],
    from: input.from,
    html:
      input.html ||
      [
        "<p>Dear Customer,</p>",
        `<p>Please find attached ${input.documentLabel.toLowerCase()} <strong>${input.invoiceNumber}</strong> from Prestige Limo SG.</p>`,
        "<p>Thank you for choosing Prestige Limo SG.</p>",
      ].join(""),
    reply_to: input.replyTo || undefined,
    subject: input.subject || `Prestige Limo SG ${input.documentLabel} ${input.invoiceNumber}`,
    text:
      input.text ||
      [
        "Dear Customer,",
        "",
        `Please find attached ${input.documentLabel.toLowerCase()} ${input.invoiceNumber} from Prestige Limo SG.`,
        "",
        "Thank you for choosing Prestige Limo SG.",
      ].join("\n"),
    to: input.recipients,
  });
}

function safeMessageKind(value: unknown): CustomerInvoiceEmailMessageKind | null {
  return value === undefined || value === "invoice"
    ? "invoice"
    : value === "reminder" || value === "payment_thank_you"
      ? value
      : null;
}

function documentEmailLabel(documentType: string) {
  if (documentType === "credit_note") {
    return "Credit Note";
  }

  if (documentType === "quotation") {
    return "Quotation";
  }

  return "Invoice";
}

export async function POST(request: Request) {
  try {
    const boundary = resolveAdminCustomerInvoiceBoundary(request);

    if (!boundary.ok) {
      return safeErrorResponse(boundary);
    }

    const body = await readJsonBody(request);
    const invoiceNumber = body?.invoiceNumber;
    const messageKind = safeMessageKind(body?.messageKind);
    const recipients = selectedCustomerInvoiceRecipients(
      {
        recipientEmail: body?.recipientEmail,
        recipientEmails: body?.recipientEmails,
      },
      sanitizeCustomerInvoiceRecipientEmail,
    );

    if (!recipients || !messageKind) {
      return safeErrorResponse({
        error: messageKind ? safeRecipientError : safeMessageKindError,
        status: 400,
      });
    }

    const invoiceResult = await loadAdminCustomerInvoiceRecord(invoiceNumber, boundary.actor);

    if (!invoiceResult.ok) {
      return safeErrorResponse(invoiceResult);
    }

    if (messageKind === "reminder" && invoiceResult.data.status !== "Unpaid") {
      return safeErrorResponse({ error: safeReminderStatusError, status: 409 });
    }

    if (messageKind === "payment_thank_you" && invoiceResult.data.status !== "Paid") {
      return safeErrorResponse({ error: safeThankYouStatusError, status: 409 });
    }

    if (messageKind === "payment_thank_you" && invoiceResult.data.thankYouSentAt) {
      return safeErrorResponse({
        error: "Payment thank-you email was already sent for this invoice.",
        status: 409,
      });
    }

    const pdfResult = await loadAdminCustomerInvoicePdf(invoiceNumber, boundary.actor);

    if (!pdfResult.ok) {
      return safeErrorResponse(pdfResult);
    }

    if (pdfResult.data.documentState !== "issued") {
      const updated =
        messageKind === "invoice"
          ? await updateCustomerInvoiceEmailStatus(pdfResult.data.invoiceNumber, "blocked", null, boundary.actor)
          : invoiceResult;

      return Response.json(
        {
          error: safeDraftDocumentError,
          invoice: updated.ok ? updated.data : null,
          ok: false,
        },
        { status: 400 },
      );
    }

    const provider = cleanConfigValue(process.env.PRESTIGE_EMAIL_PROVIDER)?.toLowerCase() || null;
    const from = cleanConfigValue(process.env.PRESTIGE_CUSTOMER_INVOICE_EMAIL_FROM);
    const replyTo = cleanConfigValue(process.env.PRESTIGE_CUSTOMER_INVOICE_EMAIL_REPLY_TO);
    const apiKey = cleanConfigValue(process.env.RESEND_API_KEY);
    const allowlist = parseAllowlist(cleanConfigValue(process.env.PRESTIGE_CUSTOMER_INVOICE_EMAIL_RECIPIENT_ALLOWLIST));

    if (
      process.env.PRESTIGE_CUSTOMER_INVOICE_EMAIL_SEND_ENABLED !== "true" ||
      provider !== selectedProvider ||
      !validConfigValue(from) ||
      !validProviderToken(apiKey)
    ) {
      const updated =
        messageKind === "invoice"
          ? await updateCustomerInvoiceEmailStatus(pdfResult.data.invoiceNumber, "blocked", null, boundary.actor)
          : invoiceResult;

      return Response.json(
        {
          error: safeProviderConfigError,
          invoice: updated.ok ? updated.data : null,
          ok: false,
        },
        { status: 503 },
      );
    }

    if (!customerInvoiceRecipientsAllowed(recipients, allowlist)) {
      const updated =
        messageKind === "invoice"
          ? await updateCustomerInvoiceEmailStatus(pdfResult.data.invoiceNumber, "blocked", null, boundary.actor)
          : invoiceResult;

      return Response.json(
        {
          error: safeRecipientError,
          invoice: updated.ok ? updated.data : null,
          ok: false,
        },
        { status: 403 },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const actionMessage =
      messageKind === "invoice"
        ? null
        : buildCustomerInvoiceActionEmail({
            amountCents: invoiceResult.data.amountCents,
            dueDateLabel: invoiceResult.data.dueDateLabel,
            invoiceNumber: invoiceResult.data.invoiceNumber,
            kind: messageKind,
            paymentMethod: invoiceResult.data.paymentMethod,
          });
    const recipientHash = createHash("sha256")
      .update([...recipients].sort().join(","))
      .digest("hex")
      .slice(0, 24);
    const idempotencyAction =
      messageKind === "reminder"
        ? `reminder-${invoiceResult.data.reminderSendCount + 1}`
        : messageKind === "payment_thank_you"
          ? "payment-thank-you"
          : "invoice";
    const idempotencyKey =
      messageKind === "invoice"
        ? `customer-invoice-${pdfResult.data.invoiceNumber}-${recipientHash}`
        : `customer-invoice-${idempotencyAction}-${pdfResult.data.invoiceNumber}-${recipientHash}`;

    try {
      const response = await fetch(resendEmailApiUrl, {
        body: buildProviderBody({
          contentBase64: Buffer.from(pdfResult.data.bytes).toString("base64"),
          documentLabel: documentEmailLabel(pdfResult.data.documentType),
          filename: pdfResult.data.filename,
          from: from as string,
          html: actionMessage?.html,
          invoiceNumber: pdfResult.data.invoiceNumber,
          recipients,
          replyTo,
          subject: actionMessage?.subject,
          text: actionMessage?.text,
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        const updated =
          messageKind === "invoice"
            ? await updateCustomerInvoiceEmailStatus(pdfResult.data.invoiceNumber, "failed", null, boundary.actor)
            : invoiceResult;

        return Response.json(
          {
            error: safeProviderFailureError,
            invoice: updated.ok ? updated.data : null,
            ok: false,
          },
          { status: 502 },
        );
      }

      const messageId = await normalizedMessageId(response);
      const updated =
        messageKind === "invoice"
          ? await updateCustomerInvoiceEmailStatus(pdfResult.data.invoiceNumber, "sent", messageId, boundary.actor)
          : await recordCustomerInvoiceActionEmailDelivery(
              pdfResult.data.invoiceNumber,
              messageKind,
              messageId,
              boundary.actor,
            );

      if (!updated.ok) {
        return safeErrorResponse(updated);
      }

      return Response.json({
        invoice: updated.data,
        messageKind,
        ok: true,
        recipientEmails: recipients,
      });
    } catch {
      const updated =
        messageKind === "invoice"
          ? await updateCustomerInvoiceEmailStatus(pdfResult.data.invoiceNumber, "failed", null, boundary.actor)
          : invoiceResult;

      return Response.json(
        {
          error: safeProviderFailureError,
          invoice: updated.ok ? updated.data : null,
          ok: false,
        },
        { status: 502 },
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return safeFailureResponse();
  }
}
