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
  lineItems?: CustomerLocalInvoiceLineItem[];
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
  const lineItems =
    input.lineItems?.length
      ? input.lineItems
      : [
          {
            amountLabel,
            description: `${input.service} - ${input.reference} - ${input.route}`,
          },
        ];

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
    lineItems,
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

export type CustomerInvoicePdfLogoImage = {
  bytes: Uint8Array;
  height: number;
  width: number;
};

const pdfTextEncoder = new TextEncoder();

function bytesForPdfText(value: string) {
  return pdfTextEncoder.encode(value);
}

function concatPdfBytes(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });

  return result;
}

function decodeBase64Bytes(base64: string) {
  try {
    const binary = atob(base64.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}

function readJpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);

  while (offset + 8 < bytes.length) {
    while (bytes[offset] === 0xff) {
      offset += 1;
    }

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    const segmentLength = (bytes[offset] << 8) + bytes[offset + 1];

    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      break;
    }

    if (startOfFrameMarkers.has(marker)) {
      const height = (bytes[offset + 3] << 8) + bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) + bytes[offset + 6];

      return width > 0 && height > 0 ? { height, width } : null;
    }

    offset += segmentLength;
  }

  return null;
}

export function pdfLogoFromJpegBytes(bytes: Uint8Array): CustomerInvoicePdfLogoImage | null {
  const dimensions = readJpegDimensions(bytes);

  return dimensions ? { ...dimensions, bytes } : null;
}

async function loadCustomerInvoicePdfLogoImage(
  companyProfile: PublicCompanyProfile,
): Promise<CustomerInvoicePdfLogoImage | null> {
  const logoImageUrl = companyProfile.logo_image_url || defaultCompanyProfile.logo_image_url;

  if (!logoImageUrl) {
    return null;
  }

  const dataUrlMatch = /^data:image\/jpe?g;base64,([\s\S]+)$/i.exec(logoImageUrl);

  if (dataUrlMatch) {
    const bytes = decodeBase64Bytes(dataUrlMatch[1]);

    return bytes ? pdfLogoFromJpegBytes(bytes) : null;
  }

  if (typeof window === "undefined" || typeof fetch === "undefined") {
    return null;
  }

  if (
    !/^\/[a-z0-9][a-z0-9/_-]*\.jpe?g$/i.test(logoImageUrl) &&
    !/^https:\/\/[^\s"')]+\.jpe?g(?:[?#][^\s"')]*)?$/i.test(logoImageUrl)
  ) {
    return null;
  }

  try {
    const response = await fetch(logoImageUrl, { cache: "force-cache" });

    if (!response.ok) {
      return null;
    }

    return pdfLogoFromJpegBytes(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

export function createCustomerInvoicePdfBytes(
  invoice: CustomerLocalInvoiceRecord,
  companyProfile: PublicCompanyProfile = defaultCompanyProfile,
  logoImage: CustomerInvoicePdfLogoImage | null = null,
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
  const logoDisplayWidth = 150;
  const logoDisplayHeight = logoImage
    ? Math.max(44, Math.min(92, Math.round((logoDisplayWidth * logoImage.height) / logoImage.width)))
    : 0;
  const logoStreamLines = logoImage
    ? [
        "q",
        `${logoDisplayWidth} 0 0 ${logoDisplayHeight} 410 ${764 - logoDisplayHeight} cm`,
        "/Im1 Do",
        "Q",
      ]
    : [];
  const streamLines = [
    ...logoStreamLines,
    "BT",
    "/F1 18 Tf",
    "50 790 Td",
    ...lines.map((line) => pdfLine(line.text, line.size)),
    "ET",
  ];
  const stream = streamLines.join("\n");
  const streamBytes = bytesForPdfText(stream);
  const pageResources = logoImage
    ? "<< /Font << /F1 4 0 R >> /XObject << /Im1 6 0 R >> >>"
    : "<< /Font << /F1 4 0 R >> >>";
  const objects = [
    bytesForPdfText("<< /Type /Catalog /Pages 2 0 R >>"),
    bytesForPdfText("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    bytesForPdfText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources ${pageResources} /Contents 5 0 R >>`,
    ),
    bytesForPdfText("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    concatPdfBytes([
      bytesForPdfText(`<< /Length ${streamBytes.length} >>\nstream\n`),
      streamBytes,
      bytesForPdfText("\nendstream"),
    ]),
    ...(logoImage
      ? [
          concatPdfBytes([
            bytesForPdfText(
              `<< /Type /XObject /Subtype /Image /Width ${logoImage.width} /Height ${logoImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoImage.bytes.length} >>\nstream\n`,
            ),
            logoImage.bytes,
            bytesForPdfText("\nendstream"),
          ]),
        ]
      : []),
  ];
  const pdfChunks = [bytesForPdfText("%PDF-1.4\n")];
  const offsets = [0];
  let pdfLength = pdfChunks[0].length;

  objects.forEach((object, index) => {
    offsets.push(pdfLength);

    const prefix = bytesForPdfText(`${index + 1} 0 obj\n`);
    const suffix = bytesForPdfText("\nendobj\n");

    pdfChunks.push(prefix, object, suffix);
    pdfLength += prefix.length + object.length + suffix.length;
  });

  const xrefOffset = pdfLength;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  pdfChunks.push(bytesForPdfText(xref));

  return concatPdfBytes(pdfChunks);
}

export async function downloadCustomerInvoicePdf(
  invoice: CustomerLocalInvoiceRecord,
  companyProfile?: PublicCompanyProfile,
) {
  if (typeof window === "undefined") {
    return;
  }

  const effectiveCompanyProfile = companyProfile || defaultCompanyProfile;
  const logoImage = await loadCustomerInvoicePdfLogoImage(effectiveCompanyProfile);
  const bytes = createCustomerInvoicePdfBytes(invoice, effectiveCompanyProfile, logoImage);
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
