import {
  customerSavedBookingsAuthRequiredResult,
  resolveCustomerSavedBookingsBoundary,
} from "../../../lib/customer-saved-bookings-read";
import { loadCustomerInvoiceRecordsForPortal } from "../../../lib/customer-invoice-record-persistence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
      error: "Customer invoice records failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const boundary = resolveCustomerSavedBookingsBoundary(request);

    if (!boundary.ok) {
      return safeErrorResponse(boundary);
    }

    const result = await loadCustomerInvoiceRecordsForPortal(boundary.data);

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    return Response.json({
      invoices: result.data,
      ok: true,
      version: result.version,
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
