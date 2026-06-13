import { buildCustomerDriverAuthReadinessSetup } from "../../../lib/customer-driver-auth-readiness-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

type CustomerDriverAuthReadinessSetup = ReturnType<typeof buildCustomerDriverAuthReadinessSetup>;

function fallbackReadiness() {
  return buildCustomerDriverAuthReadinessSetup({});
}

function disabledAuthFields() {
  return {
    accessPolicyEnabled: false,
    authProviderConfigured: false,
    customerAuthEnabled: false,
    driverAuthEnabled: false,
    liveSessionEnabled: false,
  };
}

function readinessFor(setup: CustomerDriverAuthReadinessSetup) {
  return {
    ...disabledAuthFields(),
    blocked_activation: setup.blocked_activation,
    missing_requirements: setup.missing_requirements,
    policyReady: setup.policyReady,
    policy_surface: setup.policy_surface,
    status: setup.status,
  };
}

function previewFor(setup: CustomerDriverAuthReadinessSetup) {
  return {
    ...disabledAuthFields(),
    booking_reference: setup.booking_reference,
    customer_account_reference: setup.customer_account_reference,
    customer_auth_activation_planned: setup.customer_auth_activation_planned,
    customer_saved_booking_session_planned: setup.customer_saved_booking_session_planned,
    driver_auth_activation_planned: setup.driver_auth_activation_planned,
    driver_only_job_visibility_beyond_token_flow_planned:
      setup.driver_only_job_visibility_beyond_token_flow_planned,
    driver_reference: setup.driver_reference,
    planned_access: setup.planned_access,
    policy_surface: setup.policy_surface,
    status: setup.status,
    version: setup.version,
  };
}

function blockedResponse(error: string) {
  const setup = fallbackReadiness();

  return Response.json(
    {
      ...disabledAuthFields(),
      error,
      ok: false,
      preview: previewFor(setup),
      readiness: readinessFor(setup),
      setup,
      status: "blocked",
      version: setup.version,
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
  const setup = fallbackReadiness();

  return Response.json(
    {
      ...disabledAuthFields(),
      error: "Customer/driver auth readiness preview setup request failed safely.",
      ok: false,
      preview: previewFor(setup),
      readiness: readinessFor(setup),
      setup,
      status: "blocked",
      version: setup.version,
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
    const setup = buildCustomerDriverAuthReadinessSetup({
      booking_reference: firstParam(searchParams, "booking_reference", "bookingReference", "booking_ref"),
      customer_account_reference: firstParam(
        searchParams,
        "customer_account_reference",
        "customerAccountReference",
      ),
      driver_reference: firstParam(searchParams, "driver_reference", "driverReference"),
    });

    return Response.json({
      ...disabledAuthFields(),
      ok: true,
      preview: previewFor(setup),
      readiness: readinessFor(setup),
      setup,
      status: setup.status,
      version: setup.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
