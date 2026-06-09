import { getDriverJobPayloadForTokenContract } from "../../../../../lib/driver-job-link-contract.ts";
import { getProductionDriverJobPayloadForToken } from "../../../../../lib/driver-job-link-production.ts";
import { isProductionDriverJobLinkMode } from "../../../../../lib/driver-job-link-mode.ts";
import {
  mockDriverJobBookingsById,
  mockDriverJobLinks,
} from "../../../../../lib/driver-job-link-mock-store.ts";
import { getDriverJobIssueChoice } from "../../../../../lib/driver-job-issue-alert.ts";

type DriverJobIssueAlertRouteContext = {
  params: Promise<{
    token: string;
  }>;
};

const blockedStatusByReason = {
  expired: 410,
  not_configured: 503,
  revoked: 403,
  unauthorized: 401,
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function readJsonBody(request: Request) {
  try {
    return asRecord(await request.json());
  } catch {
    return {};
  }
}

function malformedIssueResponse() {
  return Response.json(
    {
      error: "Driver issue alert details are malformed.",
      ok: false,
    },
    { status: 400 },
  );
}

function safeFailureResponse(status = 500) {
  return Response.json(
    {
      error: "Driver issue alert failed safely.",
      ok: false,
    },
    { status },
  );
}

export async function POST(request: Request, context: DriverJobIssueAlertRouteContext) {
  const [{ token }, body] = await Promise.all([context.params, readJsonBody(request)]);
  const issueChoice = getDriverJobIssueChoice(body.issue_type);

  if (!issueChoice) {
    return malformedIssueResponse();
  }

  if (isProductionDriverJobLinkMode()) {
    const jobResult = await getProductionDriverJobPayloadForToken(token);

    if (!jobResult.ok) {
      return Response.json(jobResult, { status: blockedStatusByReason[jobResult.reason] });
    }

    const { createDriverJobIssueAdminAppNotification } = await import(
      "../../../../../lib/admin-app-notification-persistence.ts"
    );
    const notificationResult = await createDriverJobIssueAdminAppNotification({
      booking_reference: jobResult.payload.reference,
      driver_status: jobResult.payload.status,
      issue_label: issueChoice.label,
      issue_type: issueChoice.value,
    });

    if (!notificationResult.ok) {
      return safeFailureResponse(notificationResult.status);
    }

    return Response.json({
      alert: {
        issue_label: issueChoice.label,
        issue_type: issueChoice.value,
        notification_status: notificationResult.data.notification_status,
      },
      external_send: false,
      mode: "production",
      ok: true,
    });
  }

  const jobResult = getDriverJobPayloadForTokenContract({
    bookingsById: mockDriverJobBookingsById,
    links: mockDriverJobLinks,
    token,
  });

  if (!jobResult.ok) {
    return Response.json(
      {
        ok: false,
        reason: jobResult.reason,
      },
      { status: blockedStatusByReason[jobResult.reason] },
    );
  }

  return Response.json({
    alert: {
      issue_label: issueChoice.label,
      issue_type: issueChoice.value,
      notification_status: "queued",
    },
    external_send: false,
    mode: "mock",
    ok: true,
  });
}
