const approvalEnvName = "PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_APPROVED";
const approvalValue = "small-live-customer-runtime-window-approved";
const phaseEnvName = "PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE";
const allowedPhase = "preflight-only";
const exactAllowlistSize = 2;

const requiredProductionGateEnvNames = [
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST",
];

const requiredProofChecklist = [
  "production root health proof before window",
  "exactly two hidden active production customer account references approved privately",
  "exactly two customer sessions mapped privately with no token values printed",
  "exactly two private customer sessions to exactly two allowlisted customer accounts",
  "one latest active booking per allowlisted customer account",
  "customer portal read proof for both allowlisted customers",
  "customer in-app read proof for both allowlisted customers",
  "admin Send In-App fixed-template proof for both allowlisted customers",
  "anonymous, missing-session, wrong-session, wrong-customer, cross-origin, and wrong-referer block proof",
  "audit or access-log proof without private values",
  "monitoring proof during the window",
  "rollback proof with gates closed",
  "post-rollback blocked/no-read proof",
];

const safeCustomerVisibleFields = [
  "booking reference",
  "customer-facing booking status",
  "service type",
  "pickup date/time",
  "pickup location",
  "drop-off location",
  "passenger name",
  "created/updated/month grouping",
  "customer-app notification title",
  "customer-app notification message",
  "customer-app notification status",
  "customer-app notification workflow area",
];

const forbiddenSurfaces = [
  "provider sends",
  "Email/Resend",
  "Telegram",
  "WhatsApp",
  "SMS",
  "Google Maps",
  "OneMap",
  "FlightAware",
  "billing/payment/PDF/invoice",
  "pricing/rates/customer_rates",
  "payout/PayNow/driver_payout_rules",
  "parser/debug/internal/admin notes",
  "secrets/tokens/cookies/JWTs",
  "raw provider payloads",
  "Save Booking internals",
  "/api/admin-saved-bookings internals",
  "live-location/driver GPS",
  "OTS/photo/storage",
  "free-form customer messages",
  "fallback/blast/scheduler/retry",
  "all-customer activation",
];

const fixedCustomerInAppTemplate = {
  safe_message: "Your Prestige Limo driver details are ready in your customer app.",
  safe_title: "Driver details ready",
};

function emit(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function failSafely(code, details = {}) {
  emit({
    ok: false,
    no_op: true,
    code,
    secrets_printed: false,
    private_customer_data_printed: false,
    activation_run: false,
    ...details,
  });
  process.exitCode = 1;
}

function runPreflightOnly() {
  emit({
    ok: true,
    stage: "small-live-customer-runtime-production-window-preflight",
    activation_run: false,
    exact_allowlist_size: exactAllowlistSize,
    target_scope: "two hidden active production customer accounts",
    booking_scope: "one latest active booking per allowlisted customer",
    required_production_gate_env_names: requiredProductionGateEnvNames,
    customer_visible_fields: safeCustomerVisibleFields,
    fixed_customer_in_app_template: fixedCustomerInAppTemplate,
    proof_checklist: requiredProofChecklist,
    rollback_plan: [
      "close customer portal runtime gate",
      "close customer in-app runtime gate",
      "confirm allowlist no longer grants customer reads",
      "confirm admin Send In-App no longer writes outside approved gate",
      "record no-secret evidence only",
    ],
    stop_conditions: [
      "any customer outside exact allowlist can read",
      "wrong customer can read another customer booking or notification",
      "any forbidden field appears",
      "any provider send is attempted",
      "any billing/payment/PDF/payout surface activates",
      "any secret, token, ID, booking reference, contact, or private customer data would be printed",
      "rollback cannot be proven immediately",
    ],
    forbidden_surfaces: forbiddenSurfaces,
    secrets_printed: false,
    private_customer_data_printed: false,
    db_write: false,
    provider_send: false,
    deploy: false,
    env_changed_by_runner: false,
  });
}

if (process.env[approvalEnvName] !== approvalValue) {
  failSafely("small_live_customer_runtime_window_not_approved", {
    required_env_name: approvalEnvName,
    required_value_name_only: approvalValue,
    supported_phase: allowedPhase,
  });
} else if (process.env[phaseEnvName] !== allowedPhase) {
  failSafely("small_live_customer_runtime_window_phase_not_allowed", {
    required_env_name: phaseEnvName,
    required_phase: allowedPhase,
  });
} else {
  runPreflightOnly();
}
