export type CustomerInvoiceEmailMessageKind = "invoice" | "payment_thank_you" | "reminder";

type CustomerInvoiceActionEmailInput = {
  amountCents: number;
  dueDateLabel: string;
  invoiceNumber: string;
  kind: Exclude<CustomerInvoiceEmailMessageKind, "invoice">;
  paymentMethod?: string;
};

const singaporeDateFormatter = new Intl.DateTimeFormat("en-SG", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Singapore",
  year: "numeric",
});
const monthIndexes: Record<string, number> = {
  apr: 3,
  aug: 7,
  dec: 11,
  feb: 1,
  jan: 0,
  jul: 6,
  jun: 5,
  mar: 2,
  may: 4,
  nov: 10,
  oct: 9,
  sep: 8,
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function singaporeDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function dueDateKey(label: string) {
  const match = label.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);

  if (!match) {
    return null;
  }

  const monthIndex = monthIndexes[match[2].toLowerCase()];

  if (monthIndex === undefined) {
    return null;
  }

  const date = new Date(Date.UTC(Number(match[3]), monthIndex, Number(match[1])));

  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function formatCustomerInvoiceEmailAmount(amountCents: number) {
  return `SGD${(amountCents / 100).toFixed(2)}`;
}

export function buildCustomerInvoiceActionEmail(input: CustomerInvoiceActionEmailInput, now = new Date()) {
  const amount = formatCustomerInvoiceEmailAmount(input.amountCents);
  const dueDate = input.dueDateLabel.trim() || "the stated due date";
  const dueKey = dueDateKey(dueDate);
  const todayKey = singaporeDateKey(now);
  const paymentMethod = input.paymentMethod?.trim() || "the selected payment method";
  let subject: string;
  let paragraphs: string[];

  if (input.kind === "reminder") {
    const timing = dueKey
      ? dueKey < todayKey
        ? `was due on ${dueDate} and is now overdue`
        : dueKey === todayKey
          ? "is due today"
          : `is due on ${dueDate}`
      : `is due on ${dueDate}`;

    subject = `Payment reminder – ${input.invoiceNumber} – ${amount} due ${dueDate}`;
    paragraphs = [
      "Dear Customer,",
      `This is a friendly reminder that invoice ${input.invoiceNumber} for ${amount} remains unpaid and ${timing}.`,
      "The invoice is attached for your reference. If payment has already been arranged, please disregard this reminder or reply with the payment reference so we can update our records.",
      "Thank you.",
      "Best regards,\nFinance Team\nPrestige Limo SG\n+65 9655 0807",
    ];
  } else {
    subject = `Payment received – ${input.invoiceNumber} – ${amount}`;
    paragraphs = [
      "Dear Customer,",
      `Thank you. We have recorded payment of ${amount} for invoice ${input.invoiceNumber} by ${paymentMethod}.`,
      "The paid invoice is attached for your reference.",
      "Thank you for choosing Prestige Limo SG.",
      "Best regards,\nFinance Team\nPrestige Limo SG\n+65 9655 0807",
    ];
  }

  return {
    html: paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join(""),
    subject,
    text: paragraphs.join("\n\n"),
  };
}

export function formatCustomerInvoiceActionSentAt(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : singaporeDateFormatter.format(date);
}
