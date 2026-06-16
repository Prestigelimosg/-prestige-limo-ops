import {
  adminLoadBookingsTypedReadAdapterFoundationVersion,
  buildAdminLoadBookingsTypedReadAdapterFoundation,
  fallbackAdminLoadBookingsTypedReadAdapterFoundation,
} from "../../../lib/admin-load-bookings-typed-read-adapter-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

function disabledReadFields() {
  return {
    appPageRuntimeWiringEnabled: false,
    app_page_runtime_wiring_enabled: false,
    databaseClientEnabled: false,
    database_client_enabled: false,
    dbReadEnabled: false,
    db_read_enabled: false,
    endpointChanged: false,
    endpoint_changed: false,
    external_send: false,
    legacyClientEnabled: false,
    legacy_client_enabled: false,
    liveReadEnabled: false,
    liveWriteEnabled: false,
    live_read_enabled: false,
    live_write_enabled: false,
    loadBookingsEndpointChanged: false,
    loadBookingsRuntimeWiringEnabled: false,
    load_bookings_endpoint_changed: false,
    load_bookings_runtime_wiring_enabled: false,
    no_live_read: true,
    no_op: true,
    parserChanged: false,
    parser_changed: false,
    readEnabled: false,
    read_enabled: false,
    saveBookingChanged: false,
    save_booking_changed: false,
    savedBookingsEndpointChanged: false,
    saved_bookings_endpoint_changed: false,
    writeEnabled: false,
    write_enabled: false,
  } as const;
}

function requestInput(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

function blockedResponse(error: string) {
  const result = fallbackAdminLoadBookingsTypedReadAdapterFoundation();

  return Response.json(
    {
      ...disabledReadFields(),
      delivery_surface: result.delivery_surface,
      error,
      ok: false,
      reason: "setup_only_disabled",
      result,
      status: "blocked",
      version: adminLoadBookingsTypedReadAdapterFoundationVersion,
    },
    { status: 403 },
  );
}

function safeFailureResponse() {
  const result = fallbackAdminLoadBookingsTypedReadAdapterFoundation();

  return Response.json(
    {
      ...disabledReadFields(),
      delivery_surface: result.delivery_surface,
      error: "Load Bookings typed read disabled setup request failed safely.",
      ok: false,
      reason: "setup_only_disabled",
      result,
      status: "blocked",
      version: adminLoadBookingsTypedReadAdapterFoundationVersion,
    },
    { status: 500 },
  );
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  return boundary.ok
    ? { context: boundary.context, ok: true }
    : { ok: false, response: blockedResponse(boundary.error) };
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const result = buildAdminLoadBookingsTypedReadAdapterFoundation(requestInput(request));

    return Response.json(
      {
        ...disabledReadFields(),
        delivery_surface: result.delivery_surface,
        ok: result.ok,
        reason: result.ok ? "setup_only_disabled" : "unsafe_or_unknown_fields",
        result,
        status: result.status,
        version: result.version,
      },
      { status: result.ok ? 200 : 400 },
    );
  } catch {
    return safeFailureResponse();
  }
}
