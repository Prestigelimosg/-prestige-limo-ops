import { customerAppNotificationsRequireAuthResult } from "../../../lib/customer-driver-app-notification-persistence";

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

export async function GET() {
  return safeCustomerAuthRequiredResponse();
}

export async function PATCH() {
  return safeCustomerAuthRequiredResponse();
}
