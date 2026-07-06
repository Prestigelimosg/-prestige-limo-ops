import {
  customerAppNotificationsRequireAuthResult,
  readCustomerAppNotificationsForControlledRuntime,
  readCustomerAppNotificationsForPortalAccessRuntime,
  readCustomerAppNotificationsForStagingEvidence,
} from "../../../lib/customer-driver-app-notification-persistence";

export const dynamic = "force-dynamic";

function safeCustomerAuthRequiredResponse() {
  const result = customerAppNotificationsRequireAuthResult();

  if (result.ok) {
    return Response.json(
      {
        error: "Customer app notifications require secure customer account auth.",
        ok: false,
      },
      { status: 403 },
    );
  }

  return Response.json(
    {
      error: result.error,
      ok: false,
    },
    { status: result.status },
  );
}

export async function GET(request: Request) {
  try {
    const portalAccessReadResult = await readCustomerAppNotificationsForPortalAccessRuntime(request);

    if (portalAccessReadResult.handled) {
      return Response.json(portalAccessReadResult.body, {
        status: portalAccessReadResult.status,
      });
    }

    const runtimeReadResult = await readCustomerAppNotificationsForControlledRuntime(request);

    if (runtimeReadResult.handled) {
      return Response.json(runtimeReadResult.body, { status: runtimeReadResult.status });
    }

    const readResult = await readCustomerAppNotificationsForStagingEvidence(request);

    if (readResult.handled) {
      return Response.json(readResult.body, { status: readResult.status });
    }
  } catch {
    return Response.json(
      {
        error: "Customer app notifications read failed safely.",
        ok: false,
      },
      { status: 500 },
    );
  }

  return safeCustomerAuthRequiredResponse();
}

export async function PATCH() {
  return safeCustomerAuthRequiredResponse();
}
