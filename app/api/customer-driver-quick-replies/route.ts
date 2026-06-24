import {
  sendCustomerQuickReplyToDriver,
} from "../../../lib/customer-driver-app-notification-persistence";

export const dynamic = "force-dynamic";

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Customer/driver quick reply request failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const result = await sendCustomerQuickReplyToDriver(request, await readJsonBody(request));

    return Response.json(result.body, { status: result.status });
  } catch {
    return safeFailureResponse();
  }
}
