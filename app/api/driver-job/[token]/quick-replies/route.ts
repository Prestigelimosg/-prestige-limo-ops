import {
  sendDriverQuickReplyToCustomer,
} from "../../../../../lib/customer-driver-app-notification-persistence";

export const dynamic = "force-dynamic";

type DriverJobQuickReplyRouteContext = {
  params: Promise<{
    token: string;
  }>;
};

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
      error: "Driver quick reply request failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

export async function POST(request: Request, context: DriverJobQuickReplyRouteContext) {
  try {
    const [{ token }, body] = await Promise.all([context.params, readJsonBody(request)]);
    const result = await sendDriverQuickReplyToCustomer(token, body);

    return Response.json(result.body, { status: result.status });
  } catch {
    return safeFailureResponse();
  }
}
