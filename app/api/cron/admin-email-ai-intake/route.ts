import { runAdminEmailAiIntake } from "../../../../lib/admin-email-ai-intake";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret =
    process.env.PRESTIGE_EMAIL_AI_CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");

  if (
    !cronSecret ||
    cronSecret.length < 32 ||
    authorization !== `Bearer ${cronSecret}`
  ) {
    return Response.json(
      {
        error: "Private email AI intake authorization failed safely.",
        ok: false,
      },
      { status: 401 },
    );
  }

  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    return Response.json(
      {
        error: "Private email AI intake parameters are not supported.",
        ok: false,
      },
      { status: 400 },
    );
  }

  const result = await runAdminEmailAiIntake();

  return Response.json(result, {
    status: result.ok ? 200 : result.status,
  });
}
