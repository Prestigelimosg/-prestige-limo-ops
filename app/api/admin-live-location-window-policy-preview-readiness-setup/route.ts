import { buildLiveLocationWindowPolicySetup } from "../../../lib/live-location-window-policy-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

type LiveLocationWindowPolicySetup = ReturnType<typeof buildLiveLocationWindowPolicySetup>;

function fallbackPolicy() {
  return buildLiveLocationWindowPolicySetup({});
}

function readinessFor(policy: LiveLocationWindowPolicySetup) {
  return {
    admin_live_map_planned: policy.admin_live_map_planned,
    auto_stop_minutes_after_pob: policy.auto_stop_minutes_after_pob,
    customer_live_map_link_planned: policy.customer_live_map_link_planned,
    customer_window_opens_minutes_before_pickup: policy.customer_visible_window_minutes_before_pickup,
    customerVisible: false,
    gpsCaptureEnabled: false,
    liveAccessEnabled: false,
    liveMapEnabled: false,
    locationStorageEnabled: false,
    policyReady: policy.policyReady,
    status: policy.status,
  };
}

function previewFor(policy: LiveLocationWindowPolicySetup) {
  return {
    admin_live_map_planned: policy.admin_live_map_planned,
    auto_stop_minutes_after_pob: policy.auto_stop_minutes_after_pob,
    booking_reference: policy.booking_reference,
    customer_live_map_link_planned: policy.customer_live_map_link_planned,
    customer_window_opens_minutes_before_pickup: policy.customer_visible_window_minutes_before_pickup,
    customerVisible: false,
    gpsCaptureEnabled: false,
    liveAccessEnabled: false,
    liveMapEnabled: false,
    locationStorageEnabled: false,
    planned_windows: policy.planned_windows,
    policy_surface: policy.policy_surface,
    status: policy.status,
    version: policy.version,
  };
}

function blockedResponse(error: string) {
  const policy = fallbackPolicy();

  return Response.json(
    {
      customerVisible: false,
      error,
      gpsCaptureEnabled: false,
      liveAccessEnabled: false,
      liveMapEnabled: false,
      locationStorageEnabled: false,
      ok: false,
      policy,
      preview: previewFor(policy),
      readiness: readinessFor(policy),
      status: "blocked",
      version: policy.version,
    },
    { status: 403 },
  );
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  return boundary.ok
    ? { context: boundary.context, ok: true }
    : { ok: false, response: blockedResponse(boundary.error) };
}

function safeFailureResponse() {
  const policy = fallbackPolicy();

  return Response.json(
    {
      customerVisible: false,
      error: "Live location window policy preview readiness setup request failed safely.",
      gpsCaptureEnabled: false,
      liveAccessEnabled: false,
      liveMapEnabled: false,
      locationStorageEnabled: false,
      ok: false,
      policy,
      preview: previewFor(policy),
      readiness: readinessFor(policy),
      status: "blocked",
      version: policy.version,
    },
    { status: 500 },
  );
}

function firstParam(searchParams: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const value = searchParams.get(key);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const searchParams = new URL(request.url).searchParams;
    const policy = buildLiveLocationWindowPolicySetup({
      booking_reference: firstParam(searchParams, "booking_reference", "bookingReference", "booking_ref"),
      pickup_at: firstParam(searchParams, "pickup_at", "pickupAt"),
      pob_at: firstParam(searchParams, "pob_at", "pobAt"),
    });

    return Response.json({
      customerVisible: false,
      gpsCaptureEnabled: false,
      liveAccessEnabled: false,
      liveMapEnabled: false,
      locationStorageEnabled: false,
      ok: true,
      policy,
      preview: previewFor(policy),
      readiness: readinessFor(policy),
      status: policy.status,
      version: policy.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
