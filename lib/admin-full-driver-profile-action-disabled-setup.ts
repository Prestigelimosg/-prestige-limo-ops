import "server-only";

export const adminFullDriverProfileActionDisabledSetupVersion =
  "admin-full-driver-profile-action-disabled-setup-v1";

export type AdminFullDriverProfileActionDisabledSetupInput = Record<string, unknown>;

export type AdminFullDriverProfileActionDisabledSetupResult = {
  actionEnabled: false;
  actionName: "full_driver_profile_write";
  actionType: "full_driver_profile_write";
  action_enabled: false;
  action_name: "full_driver_profile_write";
  action_type: "full_driver_profile_write";
  adminReviewRequired: true;
  admin_review_required: true;
  allowed_field_names: readonly string[];
  contractReady: boolean;
  contract_ready: boolean;
  delivery_surface: "admin_full_driver_profile_action_disabled_setup_only";
  driver_profile_field_names: string[];
  driver_profile_fields: AdminFullDriverProfileActionDisabledSetupFields;
  external_send: false;
  forbidden_fields_present: string[];
  invalid_fields: string[];
  liveWriteEnabled: false;
  live_write_enabled: false;
  no_op: true;
  ok: boolean;
  reason: "setup_only_disabled" | "unsafe_or_unknown_fields";
  rejected_fields: string[];
  result_label: "blocked/no-op" | "rejected/no-op";
  status: "blocked" | "rejected";
  unknown_fields: string[];
  version: typeof adminFullDriverProfileActionDisabledSetupVersion;
  writeEnabled: false;
  write_enabled: false;
};

type AdminFullDriverProfileActionDisabledSetupFields = {
  availability_status: "available" | "busy" | "inactive" | "off" | null;
  contact_number: string | null;
  driver_name: string | null;
  plate_number: string | null;
  vehicle_type: string | null;
};

const allowedCanonicalFields = [
  "availability_status",
  "contact_number",
  "driver_name",
  "plate_number",
  "vehicle_type",
] as const;

const fieldAliases = new Map<string, (typeof allowedCanonicalFields)[number]>([
  ["availability_status", "availability_status"],
  ["availabilitystatus", "availability_status"],
  ["contact_number", "contact_number"],
  ["contactnumber", "contact_number"],
  ["driver_name", "driver_name"],
  ["drivername", "driver_name"],
  ["plate_number", "plate_number"],
  ["platenumber", "plate_number"],
  ["vehicle_type", "vehicle_type"],
  ["vehicletype", "vehicle_type"],
]);

const ignoredSetupFields = new Set([
  "action",
  "action_name",
  "action_type",
  "actionname",
  "actiontype",
  "type",
]);

const allowedAvailabilityStatuses = new Set(["available", "busy", "inactive", "off"]);

const forbiddenFieldFragments = [
  "admin_finance",
  "admin_note",
  "airport_permit_notes",
  "auth",
  "billing",
  "calendar",
  "customer_price",
  "customer_rate",
  "customer_rates",
  "debug",
  "driver_payout",
  "driver_payout_rules",
  "finance",
  "internal",
  "internal_admin_notes",
  "invoice",
  "live_location",
  "location",
  "mock",
  "notes",
  "parser",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "payout_preferences",
  "pdf",
  "photo",
  "preferred_areas",
  "pricing",
  "provider",
  "send",
  "snapshot",
] as const;

const forbiddenValueFragments = [
  "admin finance",
  "admin note",
  "billing",
  "debug",
  "driver payout",
  "internal admin",
  "internal note",
  "invoice",
  "parser",
  "payment",
  "paynow",
  "payout",
  "pricing",
  "secret",
  "service role",
  "token",
] as const;

function disabledFields() {
  return {
    actionEnabled: false,
    action_enabled: false,
    adminReviewRequired: true,
    admin_review_required: true,
    external_send: false,
    liveWriteEnabled: false,
    live_write_enabled: false,
    no_op: true,
    writeEnabled: false,
    write_enabled: false,
  } as const;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function unique(values: string[]) {
  return [...new Set(values)].sort();
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function canonicalFieldName(key: string) {
  return fieldAliases.get(normalizeToken(key)) || null;
}

function hasForbiddenFieldFragment(key: string) {
  const normalized = normalizeToken(key);

  return forbiddenFieldFragments.some((fragment) => normalized.includes(fragment));
}

function hasForbiddenValueFragment(value: string) {
  const normalized = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

  return forbiddenValueFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength: number) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > maxLength || hasForbiddenValueFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeAvailabilityStatus(value: unknown) {
  const cleaned = safeText(value, 80)?.toLowerCase() || null;

  return cleaned && allowedAvailabilityStatuses.has(cleaned)
    ? (cleaned as AdminFullDriverProfileActionDisabledSetupFields["availability_status"])
    : null;
}

function normalizeInput(input: unknown) {
  const source = asRecord(input);
  const forbiddenFields: string[] = [];
  const normalized: Record<string, unknown> = {};
  const unknownFields: string[] = [];

  for (const key of Object.keys(source)) {
    const normalizedKey = normalizeToken(key);
    const canonical = canonicalFieldName(key);
    const rawValue = source[key];

    if (ignoredSetupFields.has(normalizedKey)) {
      continue;
    }

    if (canonical) {
      if (typeof rawValue === "string" && hasForbiddenValueFragment(rawValue)) {
        forbiddenFields.push(key);
        continue;
      }

      if (normalized[canonical] === undefined) {
        normalized[canonical] = rawValue;
      }
      continue;
    }

    if (hasForbiddenFieldFragment(key)) {
      forbiddenFields.push(key);
    } else {
      unknownFields.push(key);
    }
  }

  return {
    forbiddenFields: unique(forbiddenFields),
    normalized,
    unknownFields: unique(unknownFields),
  };
}

function fieldInvalid(normalizedFields: Record<string, unknown>, field: string, value: unknown) {
  return normalizedFields[field] !== undefined && value === null;
}

export function buildAdminFullDriverProfileActionDisabledSetup(
  input: AdminFullDriverProfileActionDisabledSetupInput = {},
): AdminFullDriverProfileActionDisabledSetupResult {
  const { forbiddenFields, normalized, unknownFields } = normalizeInput(input);
  const driverProfileFields = {
    availability_status: safeAvailabilityStatus(normalized.availability_status),
    contact_number: safeText(normalized.contact_number, 120),
    driver_name: safeText(normalized.driver_name, 220),
    plate_number: safeText(normalized.plate_number, 80),
    vehicle_type: safeText(normalized.vehicle_type, 120),
  };
  const invalidFields = unique(
    [
      fieldInvalid(normalized, "availability_status", driverProfileFields.availability_status)
        ? "availability_status"
        : "",
      fieldInvalid(normalized, "contact_number", driverProfileFields.contact_number)
        ? "contact_number"
        : "",
      fieldInvalid(normalized, "driver_name", driverProfileFields.driver_name) ? "driver_name" : "",
      fieldInvalid(normalized, "plate_number", driverProfileFields.plate_number) ? "plate_number" : "",
      fieldInvalid(normalized, "vehicle_type", driverProfileFields.vehicle_type) ? "vehicle_type" : "",
    ].filter(Boolean),
  );
  const driverProfileFieldNames = Object.entries(driverProfileFields)
    .filter(([, value]) => value !== null)
    .map(([field]) => field)
    .sort();
  const rejectedFields = unique([...forbiddenFields, ...unknownFields, ...invalidFields]);
  const ok = rejectedFields.length === 0;
  const status = ok ? "blocked" : "rejected";
  const resultLabel = ok ? "blocked/no-op" : "rejected/no-op";

  return {
    ...disabledFields(),
    actionName: "full_driver_profile_write",
    actionType: "full_driver_profile_write",
    action_name: "full_driver_profile_write",
    action_type: "full_driver_profile_write",
    allowed_field_names: allowedCanonicalFields,
    contractReady: ok,
    contract_ready: ok,
    delivery_surface: "admin_full_driver_profile_action_disabled_setup_only",
    driver_profile_field_names: driverProfileFieldNames,
    driver_profile_fields: driverProfileFields,
    forbidden_fields_present: forbiddenFields,
    invalid_fields: invalidFields,
    ok,
    reason: ok ? "setup_only_disabled" : "unsafe_or_unknown_fields",
    rejected_fields: rejectedFields,
    result_label: resultLabel,
    status,
    unknown_fields: unknownFields,
    version: adminFullDriverProfileActionDisabledSetupVersion,
  };
}

export function fallbackAdminFullDriverProfileActionDisabledSetup() {
  return buildAdminFullDriverProfileActionDisabledSetup({});
}
