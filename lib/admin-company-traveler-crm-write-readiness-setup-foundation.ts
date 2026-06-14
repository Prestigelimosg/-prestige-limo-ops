import "server-only";

export const adminCompanyTravelerCrmWriteReadinessSetupFoundationVersion =
  "admin-company-traveler-crm-write-readiness-setup-foundation-v1";

export const adminCompanyTravelerCrmWriteReadinessActionTypes = [
  "company_create",
  "company_update",
  "company_name_memory",
  "traveler_create",
  "traveler_update",
  "traveler_name_memory",
] as const;

export type AdminCompanyTravelerCrmWriteReadinessActionType =
  (typeof adminCompanyTravelerCrmWriteReadinessActionTypes)[number];

export type AdminCompanyTravelerCrmWriteReadinessActionScope = "company" | "traveler";

export type AdminCompanyTravelerCrmWriteReadinessMissingRequirement =
  | "action_type"
  | "admin_approval"
  | "typed_write_api"
  | "live_write_approval";

export type AdminCompanyTravelerCrmWriteReadinessCompanyFields = {
  company_name: string | null;
  domain: string | null;
  id: number | null;
};

export type AdminCompanyTravelerCrmWriteReadinessTravelerFields = {
  booker_contact: string | null;
  booker_email: string | null;
  booker_name: string | null;
  company_id: number | null;
  default_address: string | null;
  default_dropoff_address: string | null;
  default_pickup_address: string | null;
  id: number | null;
  preferred_vehicle: string | null;
  traveler_name: string | null;
};

export type AdminCompanyTravelerCrmWriteReadinessSetupInput = {
  actionType?: unknown;
  action_type?: unknown;
  bookerContact?: unknown;
  bookerEmail?: unknown;
  bookerName?: unknown;
  booker_contact?: unknown;
  booker_email?: unknown;
  booker_name?: unknown;
  companyId?: unknown;
  companyName?: unknown;
  company_id?: unknown;
  company_name?: unknown;
  defaultAddress?: unknown;
  defaultDropoffAddress?: unknown;
  defaultPickupAddress?: unknown;
  default_address?: unknown;
  default_dropoff_address?: unknown;
  default_pickup_address?: unknown;
  domain?: unknown;
  id?: unknown;
  preferredVehicle?: unknown;
  preferred_vehicle?: unknown;
  travelerId?: unknown;
  travelerName?: unknown;
  traveler_id?: unknown;
  traveler_name?: unknown;
};

export type AdminCompanyTravelerCrmWriteReadinessSetupResult = {
  actionEnabled: false;
  actionLabel: string | null;
  actionScope: AdminCompanyTravelerCrmWriteReadinessActionScope | null;
  actionType: AdminCompanyTravelerCrmWriteReadinessActionType | null;
  action_enabled: false;
  action_label: string | null;
  action_scope: AdminCompanyTravelerCrmWriteReadinessActionScope | null;
  action_type: AdminCompanyTravelerCrmWriteReadinessActionType | null;
  adminReviewRequired: true;
  admin_review_required: true;
  company_fields: AdminCompanyTravelerCrmWriteReadinessCompanyFields;
  delivery_surface: "company_traveler_crm_write_readiness_setup_only";
  external_send: false;
  liveWriteEnabled: false;
  live_write_enabled: false;
  missing_requirements: AdminCompanyTravelerCrmWriteReadinessMissingRequirement[];
  planned_actions: Record<AdminCompanyTravelerCrmWriteReadinessActionType, "planned_only">;
  readiness_status: "blocked_pending_admin_review";
  status: "setup_only";
  traveler_fields: AdminCompanyTravelerCrmWriteReadinessTravelerFields;
  version: typeof adminCompanyTravelerCrmWriteReadinessSetupFoundationVersion;
  writeEnabled: false;
  write_enabled: false;
};

const actionLabels: Record<AdminCompanyTravelerCrmWriteReadinessActionType, string> = {
  company_create: "Review company CRM create",
  company_name_memory: "Review company CRM name-memory",
  company_update: "Review company CRM update",
  traveler_create: "Review traveler CRM create",
  traveler_name_memory: "Review traveler CRM name-memory",
  traveler_update: "Review traveler CRM update",
};

const plannedActions: Record<AdminCompanyTravelerCrmWriteReadinessActionType, "planned_only"> = {
  company_create: "planned_only",
  company_name_memory: "planned_only",
  company_update: "planned_only",
  traveler_create: "planned_only",
  traveler_name_memory: "planned_only",
  traveler_update: "planned_only",
};

const blockedFragments = [
  "admin_finance",
  "admin_note",
  "amount_due",
  "billing",
  "card_number",
  "customer_rate",
  "debug",
  "driver_payout",
  "fare_amount",
  "finance",
  "internal_admin",
  "internal_finance",
  "internal_note",
  "invoice",
  "mock_archive",
  "mock_qa",
  "parser",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pricing",
  "rate_override",
  "secret",
  "server_secret",
  "service_role",
  "token",
];

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizedToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesBlockedFragment(value: string) {
  const normalized = normalizedToken(value);

  return blockedFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength = 220) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > maxLength || includesBlockedFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeEmail(value: unknown) {
  const cleaned = safeText(value, 240)?.toLowerCase() || null;

  if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeDomain(value: unknown) {
  const cleaned = safeText(value, 160)?.toLowerCase() || null;

  if (
    !cleaned ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      cleaned,
    )
  ) {
    return null;
  }

  return cleaned;
}

function safePhone(value: unknown) {
  const cleaned = safeText(value, 80);

  if (!cleaned) {
    return null;
  }

  const digits = cleaned.replace(/[^\d+]/g, "");

  return digits.length >= 6 ? cleaned : null;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeActionType(value: unknown): AdminCompanyTravelerCrmWriteReadinessActionType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizedToken(value);

  if (normalized.includes("company") && normalized.includes("create")) {
    return "company_create";
  }

  if (normalized.includes("company") && normalized.includes("update")) {
    return "company_update";
  }

  if (normalized.includes("company") && (normalized.includes("memory") || normalized.includes("remember"))) {
    return "company_name_memory";
  }

  if (normalized.includes("traveler") && normalized.includes("create")) {
    return "traveler_create";
  }

  if (normalized.includes("traveler") && normalized.includes("update")) {
    return "traveler_update";
  }

  if (normalized.includes("traveler") && (normalized.includes("memory") || normalized.includes("remember"))) {
    return "traveler_name_memory";
  }

  return adminCompanyTravelerCrmWriteReadinessActionTypes.includes(
    normalized as AdminCompanyTravelerCrmWriteReadinessActionType,
  )
    ? (normalized as AdminCompanyTravelerCrmWriteReadinessActionType)
    : null;
}

function actionScope(actionType: AdminCompanyTravelerCrmWriteReadinessActionType | null) {
  if (!actionType) {
    return null;
  }

  return actionType.startsWith("company_") ? "company" : "traveler";
}

function missingRequirements(actionType: AdminCompanyTravelerCrmWriteReadinessActionType | null) {
  const missing: AdminCompanyTravelerCrmWriteReadinessMissingRequirement[] = [];

  if (!actionType) {
    missing.push("action_type");
  }

  missing.push("admin_approval", "typed_write_api", "live_write_approval");

  return missing;
}

export function buildAdminCompanyTravelerCrmWriteReadinessSetup(
  input: AdminCompanyTravelerCrmWriteReadinessSetupInput = {},
): AdminCompanyTravelerCrmWriteReadinessSetupResult {
  const actionType = normalizeActionType(firstValue(input.action_type, input.actionType));
  const scope = actionScope(actionType);
  const actionLabel = actionType ? actionLabels[actionType] : null;
  const companyId = positiveInteger(
    firstValue(input.company_id, input.companyId, scope === "company" ? input.id : undefined),
  );
  const travelerId = positiveInteger(
    firstValue(input.traveler_id, input.travelerId, scope === "traveler" ? input.id : undefined),
  );

  return {
    actionEnabled: false,
    actionLabel,
    actionScope: scope,
    actionType,
    action_enabled: false,
    action_label: actionLabel,
    action_scope: scope,
    action_type: actionType,
    adminReviewRequired: true,
    admin_review_required: true,
    company_fields: {
      company_name: safeText(firstValue(input.company_name, input.companyName)),
      domain: safeDomain(input.domain),
      id: companyId,
    },
    delivery_surface: "company_traveler_crm_write_readiness_setup_only",
    external_send: false,
    liveWriteEnabled: false,
    live_write_enabled: false,
    missing_requirements: missingRequirements(actionType),
    planned_actions: plannedActions,
    readiness_status: "blocked_pending_admin_review",
    status: "setup_only",
    traveler_fields: {
      booker_contact: safePhone(firstValue(input.booker_contact, input.bookerContact)),
      booker_email: safeEmail(firstValue(input.booker_email, input.bookerEmail)),
      booker_name: safeText(firstValue(input.booker_name, input.bookerName)),
      company_id: positiveInteger(firstValue(input.company_id, input.companyId)),
      default_address: safeText(firstValue(input.default_address, input.defaultAddress), 500),
      default_dropoff_address: safeText(
        firstValue(input.default_dropoff_address, input.defaultDropoffAddress),
        500,
      ),
      default_pickup_address: safeText(
        firstValue(input.default_pickup_address, input.defaultPickupAddress),
        500,
      ),
      id: travelerId,
      preferred_vehicle: safeText(firstValue(input.preferred_vehicle, input.preferredVehicle), 120),
      traveler_name: safeText(firstValue(input.traveler_name, input.travelerName)),
    },
    version: adminCompanyTravelerCrmWriteReadinessSetupFoundationVersion,
    writeEnabled: false,
    write_enabled: false,
  };
}
