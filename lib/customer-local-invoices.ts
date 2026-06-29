import {
  defaultCompanyProfile,
  type PublicCompanyProfile,
} from "./company-profile-shared";

export type CustomerLocalInvoiceStatus = "Paid" | "Unpaid";

export type CustomerLocalInvoiceLineItem = {
  amountLabel: string;
  description: string;
};

export type CustomerLocalInvoiceRecord = {
  amountCents: number;
  amountLabel: string;
  billingMonthLabel: string;
  customerId: string;
  customerName: string;
  dueDateLabel: string;
  id: string;
  invoiceNumber: string;
  issueDateIso: string;
  issueDateLabel: string;
  lineItems: CustomerLocalInvoiceLineItem[];
  reference: string;
  route: string;
  service: string;
  source: "local-admin-issued-invoice-v1";
  status: CustomerLocalInvoiceStatus;
};

export type CustomerLocalInvoiceCreateInput = {
  amountCents: number;
  billingMonthLabel: string;
  customerId: string;
  customerName: string;
  dueDateIso: string;
  reference: string;
  route: string;
  service: string;
  status: CustomerLocalInvoiceStatus;
};

const customerLocalInvoicesStorageKey = "prestige.customer.localInvoices.v1";
const invoiceDateFormatter = new Intl.DateTimeFormat("en-SG", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Singapore",
  year: "numeric",
});
const invoiceMonthFormatter = new Intl.DateTimeFormat("en-SG", {
  month: "long",
  timeZone: "Asia/Singapore",
  year: "numeric",
});

function browserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isInvoiceStatus(value: unknown): value is CustomerLocalInvoiceStatus {
  return value === "Paid" || value === "Unpaid";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeLineItems(value: unknown): CustomerLocalInvoiceLineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const description = text(item.description);
      const amountLabel = text(item.amountLabel);

      return description && amountLabel ? { amountLabel, description } : null;
    })
    .filter((item): item is CustomerLocalInvoiceLineItem => Boolean(item));
}

function sanitizeInvoiceRecord(value: unknown): CustomerLocalInvoiceRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const status = isInvoiceStatus(value.status) ? value.status : null;
  const id = text(value.id);
  const invoiceNumber = text(value.invoiceNumber);
  const customerName = text(value.customerName);
  const amountCents = numberValue(value.amountCents);

  if (!status || !id || !invoiceNumber || !customerName || amountCents <= 0) {
    return null;
  }

  return {
    amountCents,
    amountLabel: text(value.amountLabel, formatInvoiceAmount(amountCents)),
    billingMonthLabel: text(value.billingMonthLabel, "Current month"),
    customerId: text(value.customerId, customerName),
    customerName,
    dueDateLabel: text(value.dueDateLabel, "Due date to confirm"),
    id,
    invoiceNumber,
    issueDateIso: text(value.issueDateIso, new Date().toISOString()),
    issueDateLabel: text(value.issueDateLabel, formatInvoiceDate(new Date())),
    lineItems: safeLineItems(value.lineItems),
    reference: text(value.reference, invoiceNumber),
    route: text(value.route, "Route to confirm"),
    service: text(value.service, "Service"),
    source: "local-admin-issued-invoice-v1",
    status,
  };
}

export function readCustomerLocalInvoices() {
  const storage = browserStorage();

  if (!storage) {
    return [];
  }

  try {
    const parsed = JSON.parse(storage.getItem(customerLocalInvoicesStorageKey) || "[]");

    return Array.isArray(parsed)
      ? parsed
          .map(sanitizeInvoiceRecord)
          .filter((record): record is CustomerLocalInvoiceRecord => Boolean(record))
      : [];
  } catch {
    return [];
  }
}

export function writeCustomerLocalInvoices(records: CustomerLocalInvoiceRecord[]) {
  const storage = browserStorage();

  if (!storage) {
    return records;
  }

  storage.setItem(customerLocalInvoicesStorageKey, JSON.stringify(records));
  window.dispatchEvent(new Event("prestige-local-invoices-updated"));

  return records;
}

export function saveCustomerLocalInvoice(record: CustomerLocalInvoiceRecord) {
  const existingRecords = readCustomerLocalInvoices();
  const nextRecords = [
    record,
    ...existingRecords.filter((existingRecord) => existingRecord.id !== record.id),
  ];

  return writeCustomerLocalInvoices(nextRecords);
}

export function formatInvoiceAmount(amountCents: number) {
  return `$${(Math.max(0, amountCents) / 100).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

export function parseInvoiceAmountToCents(value: string) {
  const amount = Number(value.replace(/[^0-9.]/g, ""));

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100);
}

export function formatInvoiceDate(date: Date) {
  return invoiceDateFormatter.format(date);
}

export function formatInvoiceMonth(date: Date) {
  return invoiceMonthFormatter.format(date);
}

export function invoiceDateInputDaysFromNow(days: number) {
  const date = new Date();

  date.setDate(date.getDate() + days);

  return date.toISOString().slice(0, 10);
}

function nextInvoiceNumber(existingRecords: CustomerLocalInvoiceRecord[], issueDate: Date) {
  const dateKey = issueDate.toISOString().slice(0, 10).replace(/-/g, "");
  const sameDayCount = existingRecords.filter((record) =>
    record.invoiceNumber.startsWith(`INV-${dateKey}-`),
  ).length;

  return `INV-${dateKey}-${String(sameDayCount + 1).padStart(4, "0")}`;
}

export function createCustomerLocalInvoiceRecord(
  input: CustomerLocalInvoiceCreateInput,
  existingRecords = readCustomerLocalInvoices(),
) {
  const issueDate = new Date();
  const dueDate = new Date(`${input.dueDateIso}T00:00:00+08:00`);
  const invoiceNumber = nextInvoiceNumber(existingRecords, issueDate);
  const amountLabel = formatInvoiceAmount(input.amountCents);

  return {
    amountCents: input.amountCents,
    amountLabel,
    billingMonthLabel: input.billingMonthLabel || formatInvoiceMonth(issueDate),
    customerId: input.customerId,
    customerName: input.customerName,
    dueDateLabel: Number.isNaN(dueDate.getTime()) ? "Due date to confirm" : formatInvoiceDate(dueDate),
    id: `${invoiceNumber}:${input.customerId}:${input.reference}`,
    invoiceNumber,
    issueDateIso: issueDate.toISOString(),
    issueDateLabel: formatInvoiceDate(issueDate),
    lineItems: [
      {
        amountLabel,
        description: `${input.service} - ${input.reference} - ${input.route}`,
      },
    ],
    reference: input.reference,
    route: input.route,
    service: input.service,
    source: "local-admin-issued-invoice-v1",
    status: input.status,
  } satisfies CustomerLocalInvoiceRecord;
}

function ascii(value: string) {
  return value.replace(/[^\x20-\x7E]/g, " ");
}

function escapePdfText(value: string) {
  return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(value: string, maxLength = 86) {
  const words = ascii(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;

    if (nextLine.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines.length > 0 ? lines : [""];
}

function pdfLine(value: string, fontSize = 10) {
  return `/${"F1"} ${fontSize} Tf (${escapePdfText(value)}) Tj 0 -15 Td`;
}

export function createCustomerInvoicePdfBytes(
  invoice: CustomerLocalInvoiceRecord,
  companyProfile: PublicCompanyProfile = defaultCompanyProfile,
) {
  const companyName = companyProfile.company_name || defaultCompanyProfile.company_name;
  const contactLine = [
    companyProfile.whatsapp_phone || companyProfile.phone,
    companyProfile.email,
  ]
    .filter(Boolean)
    .join(" | ");
  const paymentLines = wrapText(
    companyProfile.bank_payment_instructions ||
      defaultCompanyProfile.bank_payment_instructions ||
      "Payment instructions to confirm.",
    92,
  );
  const termsLines = wrapText(
    companyProfile.invoice_footer_terms ||
      defaultCompanyProfile.invoice_footer_terms ||
      "Thank you for choosing our service.",
    92,
  );
  const lines = [
    { size: 18, text: "INVOICE" },
    { size: 12, text: invoice.invoiceNumber },
    { size: 10, text: companyName },
    { size: 9, text: contactLine },
    { size: 9, text: companyProfile.address || "" },
    { size: 9, text: companyProfile.uen || "" },
    { size: 10, text: "" },
    { size: 11, text: `Bill to: ${invoice.customerName}` },
    { size: 10, text: `Issue date: ${invoice.issueDateLabel}` },
    { size: 10, text: `Due date: ${invoice.dueDateLabel}` },
    { size: 10, text: `Status: ${invoice.status}` },
    { size: 10, text: `Billing month: ${invoice.billingMonthLabel}` },
    { size: 10, text: "" },
    { size: 12, text: "Trip / Service" },
    ...invoice.lineItems.flatMap((item) =>
      wrapText(`${item.description} - ${item.amountLabel}`, 90).map((textLine) => ({
        size: 10,
        text: textLine,
      })),
    ),
    { size: 10, text: "" },
    { size: 13, text: `Total: ${invoice.amountLabel}` },
    { size: 10, text: "" },
    { size: 12, text: "Payment Instructions" },
    ...paymentLines.map((textLine) => ({ size: 9, text: textLine })),
    { size: 10, text: "" },
    { size: 12, text: "Terms" },
    ...termsLines.slice(0, 8).map((textLine) => ({ size: 8, text: textLine })),
  ];
  const streamLines = [
    "BT",
    "/F1 18 Tf",
    "50 790 Td",
    ...lines.map((line) => pdfLine(line.text, line.size)),
    "ET",
  ];
  const stream = streamLines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export function downloadCustomerInvoicePdf(
  invoice: CustomerLocalInvoiceRecord,
  companyProfile?: PublicCompanyProfile,
) {
  if (typeof window === "undefined") {
    return;
  }

  const bytes = createCustomerInvoicePdfBytes(invoice, companyProfile);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `${invoice.invoiceNumber}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
