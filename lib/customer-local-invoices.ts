import {
  companyProfilePaymentSummary,
  companyProfileContactLines,
  defaultCompanyProfile,
  type PublicCompanyProfile,
} from "./company-profile-shared";

export type CustomerBillingDocumentType = "credit_note" | "invoice" | "quotation";
export type CustomerLocalInvoiceStatus = "Paid" | "Unpaid";

export type CustomerLocalInvoiceLineItem = {
  amountLabel: string;
  bookingReference?: string;
  description: string;
  quantity?: number;
};

export type CustomerLocalInvoiceRecord = {
  amountCents: number;
  amountLabel: string;
  billingMonthLabel: string;
  customerId: string;
  customerName: string;
  documentState?: "draft" | "issued";
  documentType?: CustomerBillingDocumentType;
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
  originalInvoiceNumber?: string;
};

export type CustomerLocalInvoiceCreateInput = {
  amountCents: number;
  billingMonthLabel: string;
  customerId: string;
  customerName: string;
  dueDateIso: string;
  lineItems?: CustomerLocalInvoiceLineItem[];
  documentType?: CustomerBillingDocumentType;
  originalInvoiceNumber?: string;
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

function isBillingDocumentType(value: unknown): value is CustomerBillingDocumentType {
  return value === "credit_note" || value === "invoice" || value === "quotation";
}

function inferBillingDocumentType(value: string): CustomerBillingDocumentType {
  if (value.startsWith("CN-")) {
    return "credit_note";
  }

  if (value.startsWith("QUO-")) {
    return "quotation";
  }

  return "invoice";
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
    .map<CustomerLocalInvoiceLineItem | null>((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const description = text(item.description);
      const amountLabel = text(item.amountLabel);
      const bookingReference = text(item.bookingReference);
      const quantityValue = numberValue(item.quantity, 1);
      const quantity =
        quantityValue > 0 &&
        quantityValue <= 999 &&
        Math.round(quantityValue * 100) === quantityValue * 100
          ? quantityValue
          : 1;

      if (!description || !amountLabel) {
        return null;
      }

      return bookingReference
        ? { amountLabel, bookingReference, description, quantity }
        : { amountLabel, description, quantity };
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
    documentState: value.documentState === "draft" ? "draft" : "issued",
    documentType: isBillingDocumentType(value.documentType)
      ? value.documentType
      : inferBillingDocumentType(invoiceNumber),
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
    originalInvoiceNumber: text(value.originalInvoiceNumber),
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

export function removeCustomerLocalInvoice(invoiceNumber: string) {
  const targetInvoiceNumber = invoiceNumber.trim();
  const existingRecords = readCustomerLocalInvoices();

  if (!targetInvoiceNumber) {
    return existingRecords;
  }

  return writeCustomerLocalInvoices(
    existingRecords.filter((record) => record.invoiceNumber !== targetInvoiceNumber),
  );
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

function documentPrefix(documentType: CustomerBillingDocumentType) {
  if (documentType === "credit_note") {
    return "CN";
  }

  if (documentType === "quotation") {
    return "QUO";
  }

  return "INV";
}

function nextInvoiceNumber(
  existingRecords: CustomerLocalInvoiceRecord[],
  issueDate: Date,
  documentType: CustomerBillingDocumentType,
) {
  const dateKey = issueDate.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = documentPrefix(documentType);
  const sameDayCount = existingRecords.filter((record) =>
    record.invoiceNumber.startsWith(`${prefix}-${dateKey}-`),
  ).length;

  return `${prefix}-${dateKey}-${String(sameDayCount + 1).padStart(4, "0")}`;
}

export function createCustomerLocalInvoiceRecord(
  input: CustomerLocalInvoiceCreateInput,
  existingRecords = readCustomerLocalInvoices(),
) {
  const issueDate = new Date();
  const dueDate = new Date(`${input.dueDateIso}T00:00:00+08:00`);
  const documentType = input.documentType || "invoice";
  const invoiceNumber = nextInvoiceNumber(existingRecords, issueDate, documentType);
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
    documentState: "issued",
    documentType,
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
    originalInvoiceNumber: input.originalInvoiceNumber,
  } satisfies CustomerLocalInvoiceRecord;
}

function ascii(value: string) {
  return value.replace(/[^\x20-\x7E]/g, " ");
}

function escapePdfText(value: string) {
  return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(value: string, maxLength = 86) {
  const lines: string[] = [];
  const manualLines = value.replace(/\r\n?/g, "\n").split("\n");

  for (const manualLine of manualLines) {
    const words = ascii(manualLine).split(/\s+/).filter(Boolean);
    let line = "";

    if (words.length === 0) {
      lines.push("");
      continue;
    }

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
  }

  return lines.length > 0 ? lines : [""];
}

function pdfTextAt(value: string, x: number, y: number, fontSize = 10, fillColor = "0 g") {
  return `BT ${fillColor} /F1 ${fontSize} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET`;
}

function pdfTextWidth(value: string, fontSize: number) {
  return ascii(value).length * fontSize * 0.52;
}

function pdfRightTextAt(value: string, rightX: number, y: number, fontSize = 10, fillColor = "0 g") {
  const x = Math.max(36, Math.round(rightX - pdfTextWidth(value, fontSize)));

  return pdfTextAt(value, x, y, fontSize, fillColor);
}

function pdfLinePath(x1: number, y1: number, x2: number, y2: number, width = 0.6, color = "0.82 G") {
  return `${color} ${width} w ${x1} ${y1} m ${x2} ${y2} l S`;
}

function pdfRect(x: number, y: number, width: number, height: number, fillColor = "0.95 g") {
  return `${fillColor} ${x} ${y} ${width} ${height} re f`;
}

function invoiceMoneyValue(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");

  return cleaned || "0.00";
}

function invoiceSgdValue(value: string) {
  return `SGD${invoiceMoneyValue(value)}`;
}

function splitInvoiceAddressLines(value: string) {
  return value
    .split(",")
    .map((line) => line.trim())
    .filter(Boolean);
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
  const documentType = invoice.documentType || inferBillingDocumentType(invoice.invoiceNumber);
  const documentTitle =
    documentType === "credit_note"
      ? "CREDIT NOTE"
      : documentType === "quotation"
        ? "QUOTATION"
        : "INVOICE";
  const documentNumberLabel =
    documentType === "credit_note"
      ? "Credit Note#"
      : documentType === "quotation"
        ? "Quotation#"
        : "Invoice#";
  const balanceLabel =
    documentType === "credit_note"
      ? "Credit Amount"
      : documentType === "quotation"
        ? "Quoted Amount"
        : "Balance Due";
  const documentDateLabel =
    documentType === "credit_note"
      ? "Credit Note Date:"
      : documentType === "quotation"
        ? "Quotation Date:"
        : "Invoice Date:";
  const companyName = companyProfile.company_name || defaultCompanyProfile.company_name;
  const contactLine = companyProfileContactLines(companyProfile).join(" | ");
  const companyAddressLines = splitInvoiceAddressLines(
    companyProfile.address || defaultCompanyProfile.address,
  ).slice(0, 4);
  const paymentSummary =
    companyProfilePaymentSummary(companyProfile) ||
    defaultCompanyProfile.bank_payment_instructions ||
    "Payment instructions to confirm.";
  const paymentLines = paymentSummary
    .split(/\n+/)
    .flatMap((line) => wrapText(line, 62))
    .slice(0, 9);
  const [paymentHeading = "Bank Details", ...paymentDetailLines] = paymentLines;
  const termsLines = wrapText(
    companyProfile.invoice_footer_terms ||
      defaultCompanyProfile.invoice_footer_terms ||
      "Thank you for choosing our service.",
    54,
  ).slice(0, 8);
  const noteLines = [
    "Midnight surcharge: $15 applies from 11:00 PM to 6:59 AM.",
    "Waiting time: 15 minutes grace; airport arrivals include 60 minutes grace.",
    "Additional waiting time: $15 per 15-minute block.",
    "Hourly jobs: 15 minutes grace; 16 minutes onward counts as the next hour.",
  ]
    .flatMap((line) => wrapText(line, 54))
    .slice(0, 8);
  const amountValue = invoiceMoneyValue(invoice.amountLabel);
  const sgdAmount = invoiceSgdValue(invoice.amountLabel);
  const paidInvoice = documentType === "invoice" && invoice.status === "Paid";
  const paymentMadeValue = paidInvoice ? `(-) ${sgdAmount}` : "SGD0.00";
  const balanceDueValue = paidInvoice ? "SGD0.00" : sgdAmount;
  const logoDisplayWidth = 150;
  const logoDisplayHeight = logoImage
    ? Math.max(40, Math.min(76, Math.round((logoDisplayWidth * logoImage.height) / logoImage.width)))
    : 0;
  const logoStreamLines = logoImage
    ? [
        "q",
        `${logoDisplayWidth} 0 0 ${logoDisplayHeight} 50 ${728 - logoDisplayHeight} cm`,
        "/Im1 Do",
        "Q",
      ]
    : [];
  const companyHeaderStartY = logoImage ? 660 : 720;
  const companyHeaderCommands = [
    pdfTextAt(companyName, 50, companyHeaderStartY, 9),
    ...companyAddressLines.map((line, index) => pdfTextAt(line, 50, companyHeaderStartY - 12 - index * 11, 8)),
    ...(companyProfile.uen ? [pdfTextAt(`UEN: ${companyProfile.uen}`, 50, companyHeaderStartY - 58, 8)] : []),
    ...(contactLine ? [pdfTextAt(contactLine, 50, companyHeaderStartY - 70, 8)] : []),
  ];
  const billToY = 565;
  const billToNameLines = wrapText(invoice.customerName, 62).slice(0, 2);
  const billToExtraLineOffset = (billToNameLines.length - 1) * 12;
  const billToCommands = [
    pdfTextAt("Bill To", 50, billToY, 9, "0.35 g"),
    ...billToNameLines.map((line, index) => pdfTextAt(line, 50, billToY - 17 - index * 12, 9)),
    pdfTextAt(invoice.customerId, 50, billToY - 30 - billToExtraLineOffset, 8, "0.25 g"),
    pdfTextAt(`Reference: ${invoice.reference}`, 50, billToY - 43 - billToExtraLineOffset, 8, "0.25 g"),
  ];
  const dateX = 390;
  const dateValueRightX = 562;
  const dateCommands = [
    pdfTextAt(documentDateLabel, dateX, billToY - 3, 8, "0.25 g"),
    pdfRightTextAt(invoice.issueDateLabel, dateValueRightX, billToY - 3, 8),
    pdfTextAt("Terms:", dateX, billToY - 24, 8, "0.25 g"),
    pdfRightTextAt("Due by date shown", dateValueRightX, billToY - 24, 8),
    pdfTextAt("Due Date:", dateX, billToY - 45, 8, "0.25 g"),
    pdfRightTextAt(invoice.dueDateLabel, dateValueRightX, billToY - 45, 8),
  ];
  const tableTopY = 492;
  const tableHeaderY = tableTopY - 20;
  const lineItemCommands: string[] = [
    pdfRect(50, tableHeaderY, 512, 22, "0.18 g"),
    pdfTextAt("#", 62, tableHeaderY + 7, 8, "1 g"),
    pdfTextAt("Item & Description", 90, tableHeaderY + 7, 8, "1 g"),
    pdfRightTextAt("Qty", 435, tableHeaderY + 7, 8, "1 g"),
    pdfRightTextAt("Rate", 495, tableHeaderY + 7, 8, "1 g"),
    pdfRightTextAt("Amount", 552, tableHeaderY + 7, 8, "1 g"),
  ];
  let rowY = tableHeaderY - 18;

  invoice.lineItems.slice(0, 4).forEach((item, index) => {
    const descriptionLines = wrapText(item.description, 60).slice(0, 7);
    const rowHeight = Math.max(42, 18 + descriptionLines.length * 11);
    const itemAmountValue = invoiceMoneyValue(item.amountLabel);
    const quantity = typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1;
    const itemAmountCents = parseInvoiceAmountToCents(item.amountLabel) || 0;
    const itemRateValue = invoiceMoneyValue(formatInvoiceAmount(Math.round(itemAmountCents / quantity)));

    lineItemCommands.push(pdfTextAt(String(index + 1), 62, rowY, 8));
    descriptionLines.forEach((line, lineIndex) => {
      lineItemCommands.push(pdfTextAt(line, 90, rowY - lineIndex * 10, lineIndex === 0 ? 8 : 7));
    });
    lineItemCommands.push(pdfRightTextAt(quantity.toFixed(2), 435, rowY, 8));
    lineItemCommands.push(pdfRightTextAt(itemRateValue, 495, rowY, 8));
    lineItemCommands.push(pdfRightTextAt(itemAmountValue, 552, rowY, 8));
    rowY -= rowHeight;
    lineItemCommands.push(pdfLinePath(50, rowY + 11, 562, rowY + 11));
  });

  const totalsY = Math.max(360, rowY - 8);
  const signoffY = 245;
  const paymentY = 182;
  const footerY = 88;
  const streamLines = [
    ...logoStreamLines,
    pdfRightTextAt(documentTitle, 562, 725, 30),
    pdfRightTextAt(`${documentNumberLabel} ${invoice.invoiceNumber}`, 562, 700, 9),
    pdfRightTextAt(balanceLabel, 562, 672, 8),
    pdfRightTextAt(balanceDueValue, 562, 654, 12),
    ...companyHeaderCommands,
    ...billToCommands,
    ...dateCommands,
    ...lineItemCommands,
    pdfRightTextAt("Sub Total", 495, totalsY, 8),
    pdfRightTextAt(amountValue, 562, totalsY, 8),
    pdfRightTextAt("Total", 495, totalsY - 24, 9),
    pdfRightTextAt(sgdAmount, 562, totalsY - 24, 9),
    ...(documentType === "invoice"
      ? [
          pdfRightTextAt("Payment Made", 495, totalsY - 44, 8),
          pdfRightTextAt(paymentMadeValue, 562, totalsY - 44, 8),
        ]
      : []),
    pdfRect(338, totalsY - 78, 224, 26, "0.94 g"),
    pdfRightTextAt(balanceLabel, 495, totalsY - 70, 9),
    pdfRightTextAt(balanceDueValue, 562, totalsY - 70, 9),
    pdfLinePath(50, totalsY + 22, 562, totalsY + 22, 0.8, "0.75 G"),
    pdfTextAt("Thank you for your business", 50, signoffY, 8),
    pdfTextAt("Best Regards,", 50, signoffY - 21, 8),
    pdfTextAt(companyProfile.invoice_signoff_name, 50, signoffY - 32, 8),
    pdfTextAt(companyProfile.phone, 50, signoffY - 43, 8),
    pdfTextAt(paymentHeading, 50, paymentY, 8, "0.35 g"),
    ...paymentDetailLines.map((line, index) =>
      pdfTextAt(line, 50, paymentY - 15 - index * 8, 7),
    ),
    pdfTextAt("Notes", 50, footerY, 8, "0.35 g"),
    ...noteLines.map((line, index) => pdfTextAt(line, 50, footerY - 13 - index * 8, 6.5)),
    pdfTextAt("Terms & Conditions:", 310, footerY, 8, "0.35 g"),
    ...termsLines.map((line, index) => pdfTextAt(line, 310, footerY - 13 - index * 8, 6.5)),
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
