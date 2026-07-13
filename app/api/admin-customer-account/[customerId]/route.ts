import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../../lib/admin-dispatcher-auth-boundary";
import {
  deleteAdminCustomerAccount,
  inspectAdminCustomerAccountDeletion,
} from "../../../../lib/admin-customer-account-delete";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ customerId: string }> };
type BoundaryResult =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

function requireBoundary(request: Request): BoundaryResult {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose, {
    additionalSameOriginRefererPathPrefixes: ["/customers/"],
    allowServerSessionRoleMethodsWithoutRequestToken: ["DELETE"],
  });

  return boundary.ok
    ? { context: boundary.context, ok: true }
    : {
        ok: false,
        response: Response.json({ error: boundary.error, ok: false }, { status: 403 }),
      };
}

async function readJsonBody(request: Request) {
  try {
    const value = await request.json();

    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function safeFailureResponse() {
  return Response.json(
    { error: "Customer account request failed safely.", ok: false },
    { status: 500 },
  );
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const boundary = requireBoundary(request);
    if (!boundary.ok) return boundary.response;

    const { customerId } = await context.params;
    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await inspectAdminCustomerAccountDeletion(customerId, actor);

    return result.ok
      ? Response.json({ inspection: result.data, ok: true })
      : Response.json({ error: result.error, ok: false }, { status: result.status });
  } catch {
    return safeFailureResponse();
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const boundary = requireBoundary(request);
    if (!boundary.ok) return boundary.response;

    const { customerId } = await context.params;
    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const body = await readJsonBody(request);
    const result = await deleteAdminCustomerAccount(
      { ...body, customer_id: customerId },
      actor,
    );

    return result.ok
      ? Response.json({ deleted_customer: result.data.customer, ok: true, version: result.data.version })
      : Response.json({ error: result.error, ok: false }, { status: result.status });
  } catch {
    return safeFailureResponse();
  }
}
