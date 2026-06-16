import "server-only";

export const adminRateSettingsWriteActionDisabledSetupVersion =
  "admin-rate-settings-write-action-disabled-setup-v1";

export type AdminRateSettingsWriteActionDisabledSetupInput = Record<string, unknown>;

export type AdminRateSettingsWriteActionDisabledSetupResult = {
  actionEnabled: false;
  actionName: "default_rate_settings_write";
  actionType: "default_rate_settings_write";
  action_enabled: false;
  action_name: "default_rate_settings_write";
  action_type: "default_rate_settings_write";
  adminReviewRequired: true;
  admin_review_required: true;
  allowed_field_names: readonly string[];
  contractReady: boolean;
  contract_ready: boolean;
  delivery_surface: "admin_rate_settings_write_action_disabled_setup_only";
  external_send: false;
  forbidden_fields_present: string[];
  invalid_fields: string[];
  liveWriteEnabled: false;
  live_write_enabled: false;
  no_op: true;
  ok: boolean;
  rate_settings_fields: AdminRateSettingsWriteActionDisabledSetupFields;
  rate_settings_field_names: string[];
  reason: "setup_only_disabled" | "unsafe_or_unknown_fields";
  rejected_fields: string[];
  result_label: "blocked/no-op" | "rejected/no-op";
  status: "blocked" | "rejected";
  unknown_fields: string[];
  version: typeof adminRateSettingsWriteActionDisabledSetupVersion;
  writeEnabled: false;
  write_enabled: false;
};

type AdminRateSettingsWriteActionDisabledSetupFields = {
  child_seat_customer_surcharge: number | null;
  child_seat_driver_payout: number | null;
  extra_stop_payout: number | null;
  extra_stop_surcharge: number | null;
  id: "default" | null;
  midnight_payout: number | null;
  midnight_surcharge: number | null;
};

const allowedCanonicalFields = [
  "child_seat_customer_surcharge",
  "child_seat_driver_payout",
  "extra_stop_payout",
  "extra_stop_surcharge",
  "id",
  "midnight_payout",
  "midnight_surcharge",
] as const;

const fieldAliases = new Map<string, (typeof allowedCanonicalFields)[number]>([
  ["child_seat_customer_surcharge", "child_seat_customer_surcharge"],
  ["childseatcustomersurcharge", "child_seat_customer_surcharge"],
  ["child_seat_driver_payout", "child_seat_driver_payout"],
  ["childseatdriverpayout", "child_seat_driver_payout"],
  ["extra_stop_payout", "extra_stop_payout"],
  ["extrastoppayout", "extra_stop_payout"],
  ["extra_stop_surcharge", "extra_stop_surcharge"],
  ["extrastopsurcharge", "extra_stop_surcharge"],
  ["id", "id"],
  ["midnight_payout", "midnight_payout"],
  ["midnightpayout", "midnight_payout"],
  ["midnight_surcharge", "midnight_surcharge"],
  ["midnightsurcharge", "midnight_surcharge"],
]);

const ignoredSetupFields = new Set([
  "action",
  "action_name",
  "action_type",
  "actionname",
  "actiontype",
  "type",
]);

const forbiddenFieldFragments = [
  "admin_finance",
  "admin_note",
  "auth",
  "billing",
  "calendar",
  "customer_price",
  "customer_rate",
  "customer_rates",
  "debug",
  "driver_payout_amount",
  "driver_payout_rule",
  "driver_payout_rules",
  "finance",
  "internal",
  "invoice",
  "live_location",
  "location",
  "mock",
  "parser",
  "payment",
  "pay_now",
  "paynow",
  "payout_snapshot",
  "pdf",
  "photo",
  "pricing",
  "pricing_snapshot",
  "pricing_source",
  "provider",
  "rate_override",
  "send",
  "snapshot",
  "surcharge_snapshot",
] as const;

const forbiddenValueFragments = [
  "admin finance",
  "admin note",
  "billing",
  "customer rate",
  "debug",
  "driver payout",
  "internal admin",
  "internal note",
  "invoice",
  "parser",
  "payment",
  "paynow",
  "pricing",
  "rate override",
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

function finiteNonNegativeNumber(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function defaultIdOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return String(value).trim().toLowerCase() === "default" ? "default" : null;
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

export function buildAdminRateSettingsWriteActionDisabledSetup(
  input: AdminRateSettingsWriteActionDisabledSetupInput = {},
): AdminRateSettingsWriteActionDisabledSetupResult {
  const { forbiddenFields, normalized, unknownFields } = normalizeInput(input);
  const rateSettingsFields = {
    child_seat_customer_surcharge: finiteNonNegativeNumber(normalized.child_seat_customer_surcharge),
    child_seat_driver_payout: finiteNonNegativeNumber(normalized.child_seat_driver_payout),
    extra_stop_payout: finiteNonNegativeNumber(normalized.extra_stop_payout),
    extra_stop_surcharge: finiteNonNegativeNumber(normalized.extra_stop_surcharge),
    id: defaultIdOrNull(normalized.id),
    midnight_payout: finiteNonNegativeNumber(normalized.midnight_payout),
    midnight_surcharge: finiteNonNegativeNumber(normalized.midnight_surcharge),
  };
  const invalidFields = unique(
    [
      fieldInvalid(normalized, "child_seat_customer_surcharge", rateSettingsFields.child_seat_customer_surcharge)
        ? "child_seat_customer_surcharge"
        : "",
      fieldInvalid(normalized, "child_seat_driver_payout", rateSettingsFields.child_seat_driver_payout)
        ? "child_seat_driver_payout"
        : "",
      fieldInvalid(normalized, "extra_stop_payout", rateSettingsFields.extra_stop_payout)
        ? "extra_stop_payout"
        : "",
      fieldInvalid(normalized, "extra_stop_surcharge", rateSettingsFields.extra_stop_surcharge)
        ? "extra_stop_surcharge"
        : "",
      fieldInvalid(normalized, "id", rateSettingsFields.id) ? "id" : "",
      fieldInvalid(normalized, "midnight_payout", rateSettingsFields.midnight_payout)
        ? "midnight_payout"
        : "",
      fieldInvalid(normalized, "midnight_surcharge", rateSettingsFields.midnight_surcharge)
        ? "midnight_surcharge"
        : "",
    ].filter(Boolean),
  );
  const rateSettingsFieldNames = Object.entries(rateSettingsFields)
    .filter(([, value]) => value !== null)
    .map(([field]) => field)
    .sort();
  const rejectedFields = unique([...forbiddenFields, ...unknownFields, ...invalidFields]);
  const ok = rejectedFields.length === 0;
  const status = ok ? "blocked" : "rejected";
  const resultLabel = ok ? "blocked/no-op" : "rejected/no-op";

  return {
    ...disabledFields(),
    actionName: "default_rate_settings_write",
    actionType: "default_rate_settings_write",
    action_name: "default_rate_settings_write",
    action_type: "default_rate_settings_write",
    allowed_field_names: allowedCanonicalFields,
    contractReady: ok,
    contract_ready: ok,
    delivery_surface: "admin_rate_settings_write_action_disabled_setup_only",
    forbidden_fields_present: forbiddenFields,
    invalid_fields: invalidFields,
    ok,
    rate_settings_fields: rateSettingsFields,
    rate_settings_field_names: rateSettingsFieldNames,
    reason: ok ? "setup_only_disabled" : "unsafe_or_unknown_fields",
    rejected_fields: rejectedFields,
    result_label: resultLabel,
    status,
    unknown_fields: unknownFields,
    version: adminRateSettingsWriteActionDisabledSetupVersion,
  };
}

export function fallbackAdminRateSettingsWriteActionDisabledSetup() {
  return buildAdminRateSettingsWriteActionDisabledSetup({});
}
