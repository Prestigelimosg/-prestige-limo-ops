import { runCodexMonthlyInvoiceDraftAutoPreparation } from "../../../../lib/codex-monthly-invoice-draft-auto-preparation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return Response.json(
      {
        error: "Monthly billing automation authorization failed safely.",
        ok: false,
      },
      { status: 401 },
    );
  }

  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    return Response.json(
      {
        error: "Monthly billing automation parameters are not supported.",
        ok: false,
      },
      { status: 400 },
    );
  }

  try {
    const result = await runCodexMonthlyInvoiceDraftAutoPreparation();

    return Response.json(
      {
        ok: result.status !== "error",
        result,
      },
      { status: result.status === "error" ? 503 : 200 },
    );
  } catch {
    return Response.json(
      {
        error: "Monthly billing automation failed safely.",
        ok: false,
      },
      { status: 500 },
    );
  }
}
