import { runOtsPhotoRetention } from "../../../../lib/driver-ots-photo-proof-persistence";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false }, { status: 401 });
  }
  if (new URL(request.url).search) return Response.json({ ok: false }, { status: 400 });
  const result = await runOtsPhotoRetention();
  return Response.json(result, { status: result.ok ? 200 : 503 });
}
