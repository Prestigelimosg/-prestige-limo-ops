import { buildCustomerDriverDetailsLinkSetup } from "../../../lib/customer-driver-details-link-setup-foundation";

export const dynamic = "force-dynamic";

type CustomerDriverDetailsLinkSetup = ReturnType<typeof buildCustomerDriverDetailsLinkSetup>;

const previewReadinessSetupApi = "admin-customer-driver-details-link-preview-readiness-setup" as const;

function fallbackSetup() {
  return buildCustomerDriverDetailsLinkSetup({
    customer_safe_token_placeholder: "customer-safe-placeholder",
  });
}

function readinessFor(setup: CustomerDriverDetailsLinkSetup) {
  return {
    channel: setup.channel,
    channels: setup.channels,
    external_send: false,
    linkEnabled: false,
    linkPayloadReady: false,
    liveAccessEnabled: false,
    missing_requirements: setup.missing_requirements,
    providerConfigured: false,
    status: "blocked",
    tokenIssued: false,
  };
}

function previewFor(setup: CustomerDriverDetailsLinkSetup) {
  return {
    channel: setup.channel,
    channels: setup.channels,
    customer_safe_token_placeholder: setup.customer_safe_token_placeholder,
    delivery_surface: setup.delivery_surface,
    external_send: false,
    expiry_label: setup.expiry_label,
    linkEnabled: false,
    linkPayloadReady: false,
    liveAccessEnabled: false,
    payload: setup.payload,
    providerConfigured: false,
    status: "blocked",
    tokenIssued: false,
    version: setup.version,
  };
}

function disabledAccessFor(setup: CustomerDriverDetailsLinkSetup) {
  return {
    booking_reference: null,
    channel: setup.channel,
    channels: setup.channels,
    customer_details: null,
    customer_safe_token_placeholder: setup.customer_safe_token_placeholder,
    delivery_surface: "customer_driver_details_link_access_disabled_setup_only",
    driver_details: null,
    driver_details_visibility_flags: setup.payload.driver_details_visibility_flags,
    external_send: false,
    expiry_label: setup.expiry_label,
    linkEnabled: false,
    liveAccessEnabled: false,
    no_op: true,
    preview_readiness_source: previewReadinessSetupApi,
    reason: "setup_only_disabled",
    result_label: "blocked/no-op",
    status: "blocked",
    tokenIssued: false,
    version: setup.version,
  } as const;
}

function blockedAccessResponse() {
  const setup = fallbackSetup();
  const access = disabledAccessFor(setup);

  return Response.json({
    access,
    channel: setup.channel,
    channels: setup.channels,
    delivery_surface: access.delivery_surface,
    external_send: false,
    linkEnabled: false,
    liveAccessEnabled: false,
    ok: true,
    preview: previewFor(setup),
    preview_readiness_source: previewReadinessSetupApi,
    providerConfigured: false,
    readiness: readinessFor(setup),
    reason: access.reason,
    result: access,
    setup,
    status: "blocked",
    tokenIssued: false,
    version: setup.version,
  });
}

function safeFailureResponse() {
  const setup = fallbackSetup();
  const access = disabledAccessFor(setup);

  return Response.json(
    {
      access,
      channel: setup.channel,
      channels: setup.channels,
      delivery_surface: access.delivery_surface,
      error: "Customer driver details link access disabled setup request failed safely.",
      external_send: false,
      linkEnabled: false,
      liveAccessEnabled: false,
      ok: false,
      preview: previewFor(setup),
      preview_readiness_source: previewReadinessSetupApi,
      providerConfigured: false,
      readiness: readinessFor(setup),
      reason: access.reason,
      result: access,
      setup,
      status: "blocked",
      tokenIssued: false,
      version: setup.version,
    },
    { status: 500 },
  );
}

export async function GET() {
  try {
    return blockedAccessResponse();
  } catch {
    return safeFailureResponse();
  }
}
