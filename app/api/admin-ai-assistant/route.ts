import {
  adminAiAssistantPurpose,
  requestAdminAiConversation,
} from "../../../lib/admin-ai-runtime";
import { executeAdminAiBookingBrief } from "../../../lib/admin-ai-booking-brief";
import { executeAdminAiInvoiceSearch } from "../../../lib/admin-ai-invoice-search";
import { executeAdminAiTodaysWorkBrief } from "../../../lib/admin-ai-todays-work-brief";
import { resolveAdminDispatcherBoundary } from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

async function readJsonBody(request: Request) {
  try {
    const value = await request.json();

    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      external_send: false,
      ok: false,
      write_action: false,
    },
    { status: 403 },
  );
}

export async function POST(request: Request) {
  const boundary = resolveAdminDispatcherBoundary(request, adminAiAssistantPurpose, {
    allowServerSessionRoleMethodsWithoutRequestToken: ["POST"],
  });

  if (!boundary.ok) {
    return blockedResponse(boundary.error);
  }

  const body = await readJsonBody(request);
  const todaysWorkBrief = await executeAdminAiTodaysWorkBrief(
    body.message,
    body.todays_work_page,
    boundary.context,
  );

  if (todaysWorkBrief.matched) {
    if (!todaysWorkBrief.ok) {
      return Response.json(
        {
          error: todaysWorkBrief.error,
          external_send: false,
          ok: false,
          write_action: false,
        },
        { status: todaysWorkBrief.status },
      );
    }

    return Response.json({
      answer: todaysWorkBrief.data.answer,
      external_send: false,
      model: "Prestige live records",
      ok: true,
      todays_work_brief: todaysWorkBrief.data,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      write_action: false,
    });
  }

  const bookingBrief = await executeAdminAiBookingBrief(body.message, boundary.context);

  if (bookingBrief.matched) {
    if (!bookingBrief.ok) {
      return Response.json(
        {
          error: bookingBrief.error,
          external_send: false,
          ok: false,
          write_action: false,
        },
        { status: bookingBrief.status },
      );
    }

    return Response.json({
      answer: bookingBrief.data.answer,
      booking_brief: bookingBrief.data,
      external_send: false,
      model: "Prestige live records",
      ok: true,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      write_action: false,
    });
  }

  const invoiceSearch = await executeAdminAiInvoiceSearch(
    body.message,
    body.invoice_search_page,
    boundary.context,
  );

  if (invoiceSearch.matched) {
    if (!invoiceSearch.ok) {
      return Response.json(
        {
          error: invoiceSearch.error,
          external_send: false,
          ok: false,
          write_action: false,
        },
        { status: invoiceSearch.status },
      );
    }

    return Response.json({
      answer: invoiceSearch.data.answer,
      external_send: false,
      invoice_search: invoiceSearch.data,
      model: "Prestige live records",
      ok: true,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      write_action: false,
    });
  }

  const result = await requestAdminAiConversation(body.message, body.history);

  if (!result.ok) {
    return Response.json(
      {
        error: result.error,
        external_send: false,
        ok: false,
        write_action: false,
      },
      { status: result.status },
    );
  }

  return Response.json({
    answer: result.data.answer,
    external_send: false,
    model: result.model,
    ok: true,
    usage: result.usage,
    write_action: false,
  });
}
