import {
  customerSavedBookingsAuthRequiredResult,
  resolveCustomerSavedBookingsBoundary,
} from "../../../../lib/customer-saved-bookings-read";
import { loadCustomerInvoicePdfForPortal } from "../../../../lib/customer-invoice-record-persistence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    invoiceNumber: string;
  }>;
};

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
      error: "Customer invoice PDF failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

function responseBodyFromBytes(bytes: Uint8Array) {
  const body = new ArrayBuffer(bytes.byteLength);

  new Uint8Array(body).set(bytes);

  return body;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const boundary = resolveCustomerSavedBookingsBoundary(request);

    if (!boundary.ok) {
      return safeErrorResponse(boundary);
    }

    const params = await context.params;
    const result = await loadCustomerInvoicePdfForPortal(params.invoiceNumber, boundary.data);

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    return new Response(responseBodyFromBytes(result.data.bytes), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${result.data.filename}"`,
        "Content-Type": result.data.contentType,
      },
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function POST() {
  const result = customerSavedBookingsAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}

export async function PUT() {
  const result = customerSavedBookingsAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}

export async function PATCH() {
  const result = customerSavedBookingsAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}

export async function DELETE() {
  const result = customerSavedBookingsAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}
