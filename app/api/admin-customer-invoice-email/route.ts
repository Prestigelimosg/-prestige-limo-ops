import { resolveAdminCustomerInvoiceBoundary } from "../../../lib/admin-customer-invoice-boundary";
import {
  loadAdminCustomerInvoicePdf,
  sanitizeCustomerInvoiceRecipientEmail,
  updateCustomerInvoiceEmailStatus,
} from "../../../lib/customer-invoice-record-persistence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const resendEmailApiUrl = "https://api.resend.com/emails";
const selectedProvider = "resend";
const safeProviderConfigError = "Customer invoice email sending is not configured.";
const safeProviderFailureError = "Customer invoice email failed safely.";
const safeRecipientError = "Customer invoice email recipient is invalid or not allowlisted.";
const safeDraftDocumentError = "Customer invoice email can only send issued documents.";

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

    return body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
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
  invoiceNumber: string;
  recipient: string;
  replyTo: string | null;
}) {
  return JSON.stringify({
    attachments: [
      {
        content: input.contentBase64,
        filename: input.filename,
      },
    ],
    from: input.from,
    html: [
      "<p>Dear Customer,</p>",
      `<p>Please find attached ${input.documentLabel.toLowerCase()} <strong>${input.invoiceNumber}</strong> from Prestige Limo SG.</p>`,
      "<p>Thank you for choosing Prestige Limo SG.</p>",
    ].join(""),
    reply_to: input.replyTo || undefined,
    subject: `Prestige Limo SG ${input.documentLabel} ${input.invoiceNumber}`,
    text: [
      "Dear Customer,",
      "",
      `Please find attached ${input.documentLabel.toLowerCase()} ${input.invoiceNumber} from Prestige Limo SG.`,
      "",
      "Thank you for choosing Prestige Limo SG.",
    ].join("\n"),
    to: input.recipient,
  });
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
    const recipient = sanitizeCustomerInvoiceRecipientEmail(body?.recipientEmail);

    if (!recipient) {
      return safeErrorResponse({
        error: safeRecipientError,
        status: 400,
      });
    }

    const pdfResult = await loadAdminCustomerInvoicePdf(invoiceNumber, boundary.actor);

    if (!pdfResult.ok) {
      return safeErrorResponse(pdfResult);
    }

    if (pdfResult.data.documentState !== "issued") {
      const updated = await updateCustomerInvoiceEmailStatus(
        pdfResult.data.invoiceNumber,
        "blocked",
        null,
        boundary.actor,
      );

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
    const allowlist = parseAllowlist(
      cleanConfigValue(process.env.PRESTIGE_CUSTOMER_INVOICE_EMAIL_RECIPIENT_ALLOWLIST),
    );

    if (
      process.env.PRESTIGE_CUSTOMER_INVOICE_EMAIL_SEND_ENABLED !== "true" ||
      provider !== selectedProvider ||
      !validConfigValue(from) ||
      !validProviderToken(apiKey)
    ) {
      const updated = await updateCustomerInvoiceEmailStatus(
        pdfResult.data.invoiceNumber,
        "blocked",
        null,
        boundary.actor,
      );

      return Response.json(
        {
          error: safeProviderConfigError,
          invoice: updated.ok ? updated.data : null,
          ok: false,
        },
        { status: 503 },
      );
    }

    if (allowlist.length > 0 && !allowlist.includes(recipient)) {
      const updated = await updateCustomerInvoiceEmailStatus(
        pdfResult.data.invoiceNumber,
        "blocked",
        null,
        boundary.actor,
      );

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

    try {
      const response = await fetch(resendEmailApiUrl, {
        body: buildProviderBody({
          contentBase64: Buffer.from(pdfResult.data.bytes).toString("base64"),
          documentLabel: documentEmailLabel(pdfResult.data.documentType),
          filename: pdfResult.data.filename,
          from: from as string,
          invoiceNumber: pdfResult.data.invoiceNumber,
          recipient,
          replyTo,
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `customer-invoice-${pdfResult.data.invoiceNumber}-${recipient}`,
        },
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        const updated = await updateCustomerInvoiceEmailStatus(
          pdfResult.data.invoiceNumber,
          "failed",
          null,
          boundary.actor,
        );

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
      const updated = await updateCustomerInvoiceEmailStatus(
        pdfResult.data.invoiceNumber,
        "sent",
        messageId,
        boundary.actor,
      );

      if (!updated.ok) {
        return safeErrorResponse(updated);
      }

      return Response.json({
        invoice: updated.data,
        ok: true,
      });
    } catch {
      const updated = await updateCustomerInvoiceEmailStatus(
        pdfResult.data.invoiceNumber,
        "failed",
        null,
        boundary.actor,
      );

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
