import { runCustomerThirtyMinutePickupReminders } from "../../../../lib/customer-thirty-minute-pickup-reminder";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.PRESTIGE_CUSTOMER_PICKUP_REMINDER_CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return Response.json(
      { error: "Customer pickup reminder authorization failed safely.", ok: false },
      { status: 401 },
    );
  }

  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    return Response.json(
      { error: "Customer pickup reminder parameters are not supported.", ok: false },
      { status: 400 },
    );
  }

  try {
    const result = await runCustomerThirtyMinutePickupReminders();
    return Response.json({ ok: result.ok, result }, { status: result.ok ? 200 : 503 });
  } catch {
    return Response.json(
      { error: "Customer pickup reminder failed safely.", ok: false },
      { status: 500 },
    );
  }
}
