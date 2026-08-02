import {
  normalizeChatGptBookingPreview,
  type ChatGptBookingPreviewValidationIssue,
} from "../../../lib/chatgpt-booking-preview";
import { resolveAdminDispatcherBoundary } from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

const adminBookingPreviewPurpose = "admin-booking-preview";
const bookingPreviewConfirmedHeader = "x-prestige-booking-preview-confirmed";
const bookingConfirmationTokenHeader = "x-prestige-booking-confirmation-token";
const bookingConfirmationExpiryHeader = "x-prestige-booking-confirmation-expires-at";

function issue(
  code: string,
  message: string,
): ChatGptBookingPreviewValidationIssue {
  return {
    code,
    field: "request",
    message,
    severity: "error",
  };
}

function safeResponse(
  preview: ReturnType<typeof normalizeChatGptBookingPreview>["preview"],
  validationIssues: ChatGptBookingPreviewValidationIssue[],
  missingRequiredFields: string[],
  status: number,
  headers: HeadersInit = {},
) {
  return Response.json(
    {
      preview,
      validation_issues: validationIssues,
      missing_required_fields: missingRequiredFields,
    },
    {
      headers: {
        "cache-control": "no-store",
        ...Object.fromEntries(new Headers(headers).entries()),
      },
      status,
    },
  );
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPreviewPurpose, {
    allowServerSessionRoleMethodsWithoutRequestToken: ["POST"],
  });

  if (!boundary.ok) {
    return safeResponse(
      null,
      [issue("preview_access_denied", "Booking preview is available only to the authorised admin surface.")],
      [],
      403,
    );
  }

  try {
    const previewInput = await readJsonBody(request);
    const normalized = normalizeChatGptBookingPreview(previewInput);

    if (
      normalized.ok &&
      normalized.canonical_payload &&
      normalized.preview &&
      request.headers.get(bookingPreviewConfirmedHeader) === "true"
    ) {
      const { issueAdminBookingConfirmationToken } = await import(
        "../../../lib/admin-booking-confirmation"
      );
      const confirmation = issueAdminBookingConfirmationToken(
        normalized.canonical_payload,
        normalized.preview,
        previewInput,
      );

      if (!confirmation.ok) {
        return safeResponse(
          normalized.preview,
          [
            ...normalized.validation_issues,
            issue(confirmation.code, confirmation.message),
          ],
          [],
          503,
        );
      }

      return safeResponse(
        normalized.preview,
        normalized.validation_issues,
        [],
        200,
        {
          [bookingConfirmationExpiryHeader]: confirmation.expires_at,
          [bookingConfirmationTokenHeader]: confirmation.token,
        },
      );
    }

    return safeResponse(
      normalized.preview,
      normalized.validation_issues,
      normalized.missing_required_fields,
      normalized.ok ? 200 : 400,
    );
  } catch {
    return safeResponse(
      null,
      [issue("preview_failed_safely", "Booking preview could not be prepared safely.")],
      [],
      500,
    );
  }
}
