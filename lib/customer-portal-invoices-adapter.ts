import type { CustomerLocalInvoiceRecord } from "./customer-local-invoices";

export const customerPortalInvoicesApiPath = "/api/customer-invoices";
export const customerPortalInvoicePdfApiPath = "/api/customer-invoice-pdf";

export type CustomerPortalInvoiceRecord = CustomerLocalInvoiceRecord & {
  pdfFilename?: string;
  storageSource?: "server";
};

type CustomerPortalInvoicesFetch = typeof fetch;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safePortalInvoiceApiRecords(value: unknown) {
  return Array.isArray(value) ? (value as CustomerPortalInvoiceRecord[]) : [];
}

function filenameFromContentDisposition(value: string | null, fallback: string) {
  const match = value?.match(/filename="([^"]+)"/);

  return match?.[1] || fallback;
}

export async function loadCustomerPortalInvoiceRecords({
  fetcher = fetch,
  signal,
}: {
  fetcher?: CustomerPortalInvoicesFetch;
  signal?: AbortSignal;
} = {}): Promise<CustomerPortalInvoiceRecord[] | null> {
  try {
    const response = await fetcher(customerPortalInvoicesApiPath, {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "x-prestige-customer-purpose": "customer-saved-bookings-read",
      },
      signal,
    });
    const result = asRecord(await response.json().catch(() => null));

    return response.ok && result?.ok === true
      ? safePortalInvoiceApiRecords(result.invoices)
      : null;
  } catch {
    return null;
  }
}

export async function fetchCustomerPortalInvoicePdf(
  invoiceNumber: string,
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: CustomerPortalInvoicesFetch;
    signal?: AbortSignal;
  } = {},
): Promise<{ blob: Blob; filename: string } | null> {
  try {
    const response = await fetcher(
      `${customerPortalInvoicePdfApiPath}/${encodeURIComponent(invoiceNumber)}`,
      {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "x-prestige-customer-purpose": "customer-saved-bookings-read",
        },
        signal,
      },
    );

    if (!response.ok) {
      return null;
    }

    return {
      blob: await response.blob(),
      filename: filenameFromContentDisposition(
        response.headers.get("content-disposition"),
        `${invoiceNumber}.pdf`,
      ),
    };
  } catch {
    return null;
  }
}

// Preserve the existing browser download. Updated Customer iOS builds explicitly
// advertise the PDF bridge and return the result of the native save/share sheet.
export async function deliverCustomerPortalInvoicePdf(
  blob: Blob,
  filename: string,
): Promise<"downloaded" | "shared" | "cancelled"> {
  const nativeWindow = window as Window & {
    __prestigeCustomerNativePdf?: number;
    ReactNativeWebView?: { postMessage: (value: string) => void };
  };
  const bridge = nativeWindow.ReactNativeWebView;
  if (!bridge) {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    return "downloaded";
  }
  if (nativeWindow.__prestigeCustomerNativePdf !== 1) throw new Error("Update Prestige SG to open invoice PDFs.");
  if (blob.type !== "application/pdf" || blob.size === 0 || blob.size > 10 * 1024 * 1024) throw new Error("Invalid invoice PDF.");
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      const prefix = "data:application/pdf;base64,";
      if (!value.startsWith(prefix)) reject(new Error("Invalid invoice PDF."));
      else resolve(value.slice(prefix.length));
    };
    reader.onerror = reader.onabort = () => reject(new Error("Invoice PDF could not be read."));
    reader.readAsDataURL(blob);
  });
  const requestId = window.crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("prestige-customer-pdf-result", receive);
      window.removeEventListener("pagehide", cancelled);
    };
    const cancelled = () => { cleanup(); reject(new Error("Invoice page closed.")); };
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.requestId !== requestId || !["shared", "cancelled", "failed"].includes(detail.status)) return;
      cleanup();
      if (detail.status === "failed") reject(new Error("Invoice PDF could not be opened."));
      else resolve(detail.status);
    };
    // A late or unrelated reply must never mark another invoice as downloaded.
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error("Invoice PDF handoff timed out.")); }, 120_000);
    window.addEventListener("prestige-customer-pdf-result", receive);
    window.addEventListener("pagehide", cancelled);
    try {
      bridge.postMessage(JSON.stringify({ type: "customer_invoice_pdf", requestId, filename, base64 }));
    } catch {
      cleanup();
      reject(new Error("Invoice PDF could not be opened."));
    }
  });
}
