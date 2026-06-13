import { buildAdminBillingPaymentReadinessSetupFoundation } from "../../../lib/admin-billing-payment-readiness-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

type AdminBillingPaymentReadinessSetup = ReturnType<
  typeof buildAdminBillingPaymentReadinessSetupFoundation
>;

function fallbackReadiness() {
  return buildAdminBillingPaymentReadinessSetupFoundation({});
}

function disabledBillingPaymentFields() {
  return {
    invoicePdfEnabled: false,
    invoiceSendingEnabled: false,
    liveBillingEnabled: false,
    paymentLinksEnabled: false,
    paymentProviderConfigured: false,
    payoutAutomationEnabled: false,
    productionAutoBillingEnabled: false,
  };
}

function readinessFor(setup: AdminBillingPaymentReadinessSetup) {
  return {
    ...disabledBillingPaymentFields(),
    blocked_activation: setup.blocked_activation,
    missing_requirements: setup.missing_requirements,
    policyReady: setup.policyReady,
    policy_surface: setup.policy_surface,
    status: setup.status,
  };
}

function previewFor(setup: AdminBillingPaymentReadinessSetup) {
  return {
    ...disabledBillingPaymentFields(),
    billing_month: setup.billing_month,
    customer_account: setup.customer_account,
    invoice_pdf_generation_planned: setup.invoice_pdf_generation_planned,
    invoice_sending_planned: setup.invoice_sending_planned,
    payment_links_planned: setup.payment_links_planned,
    payout_automation_planned: setup.payout_automation_planned,
    planned_capabilities: setup.planned_capabilities,
    policy_surface: setup.policy_surface,
    production_auto_billing_planned: setup.production_auto_billing_planned,
    status: setup.status,
    version: setup.version,
  };
}

function blockedResponse(error: string) {
  const setup = fallbackReadiness();

  return Response.json(
    {
      ...disabledBillingPaymentFields(),
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
      ...disabledBillingPaymentFields(),
      error: "Billing/payment readiness preview setup request failed safely.",
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
    const setup = buildAdminBillingPaymentReadinessSetupFoundation({
      billing_month: firstParam(searchParams, "billing_month", "billingMonth"),
      customer_account: firstParam(searchParams, "customer_account", "customerAccount"),
    });

    return Response.json({
      ...disabledBillingPaymentFields(),
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
