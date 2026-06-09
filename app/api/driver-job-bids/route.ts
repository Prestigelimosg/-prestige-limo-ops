import { driverBidRuntimeAccessBlocked } from "../../../lib/driver-portal-bidding-persistence";

export const dynamic = "force-dynamic";

function blockedDriverBidResponse() {
  const result = driverBidRuntimeAccessBlocked<null>();

  if (result.ok) {
    return Response.json(
      {
        error: "Driver bidding requires approved driver auth before runtime access.",
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
  return blockedDriverBidResponse();
}

export async function POST() {
  return blockedDriverBidResponse();
}

export async function PATCH() {
  return blockedDriverBidResponse();
}
