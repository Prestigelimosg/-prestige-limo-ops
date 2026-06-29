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
