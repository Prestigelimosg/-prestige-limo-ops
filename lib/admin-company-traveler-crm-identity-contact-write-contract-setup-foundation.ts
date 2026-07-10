import "server-only";

import {
  adminCompanyTravelerCrmWriteReadinessActionTypes,
  type AdminCompanyTravelerCrmWriteReadinessActionType,
  type AdminCompanyTravelerCrmWriteReadinessActionScope,
} from "./admin-company-traveler-crm-write-readiness-setup-foundation";

export const adminCompanyTravelerCrmIdentityContactWriteContractSetupFoundationVersion =
  "admin-company-traveler-crm-identity-contact-write-contract-setup-foundation-v1";

export type AdminCompanyTravelerCrmIdentityContactWriteContractInput = Record<string, unknown>;

export type AdminCompanyTravelerCrmIdentityContactWriteContractCompanyFields = {
  accounts_email: string | null;
  billing_address: string | null;
  billing_email: string | null;
  company_name: string | null;
  domain: string | null;
  id: number | null;
  main_phone: string | null;
  mobile_phone: string | null;
  operations_email: string | null;
  primary_contact_name: string | null;
  website: string | null;
};

export type AdminCompanyTravelerCrmIdentityContactWriteContractTravelerFields = {
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

export type AdminCompanyTravelerCrmIdentityContactWriteContractMissingRequirement =
  | "action_type"
  | "admin_approval"
  | "company_identity_field"
  | "live_write_approval"
  | "record_id"
  | "traveler_identity_contact_field";

export type AdminCompanyTravelerCrmIdentityContactWriteContractResult = {
  actionEnabled: false;
  actionScope: AdminCompanyTravelerCrmWriteReadinessActionScope | null;
  actionType: AdminCompanyTravelerCrmWriteReadinessActionType | null;
  action_enabled: false;
  action_scope: AdminCompanyTravelerCrmWriteReadinessActionScope | null;
  action_type: AdminCompanyTravelerCrmWriteReadinessActionType | null;
  adminReviewRequired: true;
  admin_review_required: true;
  allowed_fields: readonly string[];
  company_fields: AdminCompanyTravelerCrmIdentityContactWriteContractCompanyFields;
  contractReady: boolean;
  contract_ready: boolean;
  delivery_surface: "company_traveler_crm_identity_contact_write_contract_setup_only";
  external_send: false;
  forbidden_fields_present: string[];
  invalid_fields: string[];
  liveWriteEnabled: false;
  live_write_enabled: false;
  missing_requirements: AdminCompanyTravelerCrmIdentityContactWriteContractMissingRequirement[];
  ok: boolean;
  reason: "missing_required_fields" | "setup_only_no_write" | "unsafe_or_unknown_fields";
  rejected_fields: string[];
  status: "blocked" | "rejected";
  traveler_fields: AdminCompanyTravelerCrmIdentityContactWriteContractTravelerFields;
  unknown_fields: string[];
  version: typeof adminCompanyTravelerCrmIdentityContactWriteContractSetupFoundationVersion;
  writeEnabled: false;
  write_enabled: false;
};

const allowedCanonicalFields = [
  "action_type",
  "accounts_email",
  "billing_address",
  "billing_email",
  "booker_contact",
  "booker_email",
  "booker_name",
  "company_id",
  "company_name",
  "default_address",
  "default_dropoff_address",
  "default_pickup_address",
  "domain",
  "entity_type",
  "id",
  "main_phone",
  "mobile_phone",
  "operations_email",
  "primary_contact_name",
  "preferred_vehicle",
  "traveler_id",
  "traveler_name",
  "website",
] as const;

const fieldAliases = new Map<string, (typeof allowedCanonicalFields)[number]>([
  ["action", "action_type"],
  ["action_type", "action_type"],
  ["actiontype", "action_type"],
  ["accounts_email", "accounts_email"],
  ["accountsemail", "accounts_email"],
  ["billing_address", "billing_address"],
  ["billingaddress", "billing_address"],
  ["billing_email", "billing_email"],
  ["billingemail", "billing_email"],
  ["booker_contact", "booker_contact"],
  ["bookercontact", "booker_contact"],
  ["booker_email", "booker_email"],
  ["bookeremail", "booker_email"],
  ["booker_name", "booker_name"],
  ["bookername", "booker_name"],
  ["company_id", "company_id"],
  ["companyid", "company_id"],
  ["company_name", "company_name"],
  ["companyname", "company_name"],
  ["default_address", "default_address"],
  ["defaultaddress", "default_address"],
  ["default_dropoff_address", "default_dropoff_address"],
  ["defaultdropoffaddress", "default_dropoff_address"],
  ["default_pickup_address", "default_pickup_address"],
  ["defaultpickupaddress", "default_pickup_address"],
  ["domain", "domain"],
  ["entity", "entity_type"],
  ["entity_type", "entity_type"],
  ["entitytype", "entity_type"],
  ["id", "id"],
  ["main_phone", "main_phone"],
  ["mainphone", "main_phone"],
  ["mobile_phone", "mobile_phone"],
  ["mobilephone", "mobile_phone"],
  ["operations_email", "operations_email"],
  ["operationsemail", "operations_email"],
  ["primary_contact_name", "primary_contact_name"],
  ["primarycontactname", "primary_contact_name"],
  ["preferred_vehicle", "preferred_vehicle"],
  ["preferredvehicle", "preferred_vehicle"],
  ["traveler_id", "traveler_id"],
  ["travelerid", "traveler_id"],
  ["traveler_name", "traveler_name"],
  ["travelername", "traveler_name"],
  ["website", "website"],
  ["type", "action_type"],
]);

const forbiddenFieldFragments = [
  "admin_finance",
  "admin_note",
  "auth",
  "billing",
  "calendar",
  "customer_rate",
  "customer_rates",
  "debug",
  "driver_payout",
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
  "payout",
  "pdf",
  "photo",
  "pricing",
  "pricing_source",
  "provider",
  "rate_override",
  "send",
  "surcharge",
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
  "payout",
  "pricing",
  "rate override",
  "secret",
  "service role",
  "token",
] as const;

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

function firstValue(record: Record<string, unknown>, ...fields: string[]) {
  for (const field of fields) {
    if (record[field] !== undefined && record[field] !== null) {
      return record[field];
    }
  }

  return undefined;
}

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned || null;
}

function safeText(value: unknown, maxLength = 220) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || hasForbiddenValueFragment(cleaned)) {
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
    cleaned.includes("..") ||
    cleaned.startsWith(".") ||
    cleaned.endsWith(".") ||
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

function safeContact(value: unknown) {
  return safeText(value, 160);
}

function safeCustomerProfileText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength) {
    return null;
  }

  const normalized = cleaned.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const disallowed = forbiddenValueFragments.filter((fragment) => fragment !== "billing");

  return disallowed.some((fragment) => normalized.includes(fragment)) ? null : cleaned;
}

function safeCustomerProfileEmail(value: unknown) {
  const cleaned = safeCustomerProfileText(value, 240)?.toLowerCase() || null;

  return cleaned && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : null;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeActionType(value: unknown): AdminCompanyTravelerCrmWriteReadinessActionType | null {
  const cleaned = safeText(value, 120);

  if (!cleaned) {
    return null;
  }

  const normalized = normalizeToken(cleaned);

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

function normalizeInput(input: unknown) {
  const record = asRecord(input);
  const normalized: Record<string, unknown> = {};
  const forbiddenFields: string[] = [];
  const unknownFields: string[] = [];

  for (const key of Object.keys(record)) {
    const canonical = canonicalFieldName(key);

    if (
      hasForbiddenFieldFragment(key) &&
      canonical !== "billing_address" &&
      canonical !== "billing_email"
    ) {
      forbiddenFields.push(key);
      continue;
    }

    if (!canonical) {
      unknownFields.push(key);
      continue;
    }

    if (normalized[canonical] === undefined) {
      normalized[canonical] = record[key];
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

export function buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup(
  input: AdminCompanyTravelerCrmIdentityContactWriteContractInput = {},
): AdminCompanyTravelerCrmIdentityContactWriteContractResult {
  const { forbiddenFields, normalized, unknownFields } = normalizeInput(input);
  const actionType = normalizeActionType(firstValue(normalized, "action_type"));
  const scope = actionScope(actionType);
  const companyId = positiveInteger(firstValue(normalized, "company_id", scope === "company" ? "id" : ""));
  const travelerId = positiveInteger(firstValue(normalized, "traveler_id", scope === "traveler" ? "id" : ""));
  const companyFields = {
    accounts_email: safeCustomerProfileEmail(firstValue(normalized, "accounts_email")),
    billing_address: safeCustomerProfileText(firstValue(normalized, "billing_address"), 500),
    billing_email: safeCustomerProfileEmail(firstValue(normalized, "billing_email")),
    company_name: safeText(firstValue(normalized, "company_name")),
    domain: safeDomain(firstValue(normalized, "domain")),
    id: companyId,
    main_phone: safeContact(firstValue(normalized, "main_phone")),
    mobile_phone: safeContact(firstValue(normalized, "mobile_phone")),
    operations_email: safeCustomerProfileEmail(firstValue(normalized, "operations_email")),
    primary_contact_name: safeText(firstValue(normalized, "primary_contact_name"), 160),
    website: safeDomain(firstValue(normalized, "website")),
  };
  const travelerFields = {
    booker_contact: safeContact(firstValue(normalized, "booker_contact")),
    booker_email: safeEmail(firstValue(normalized, "booker_email")),
    booker_name: safeText(firstValue(normalized, "booker_name")),
    company_id: positiveInteger(firstValue(normalized, "company_id")),
    default_address: safeText(firstValue(normalized, "default_address"), 500),
    default_dropoff_address: safeText(firstValue(normalized, "default_dropoff_address"), 500),
    default_pickup_address: safeText(firstValue(normalized, "default_pickup_address"), 500),
    id: travelerId,
    preferred_vehicle: safeText(firstValue(normalized, "preferred_vehicle"), 120),
    traveler_name: safeText(firstValue(normalized, "traveler_name")),
  };
  const invalidFields = unique(
    [
      fieldInvalid(normalized, "company_name", companyFields.company_name) ? "company_name" : "",
      fieldInvalid(normalized, "domain", companyFields.domain) ? "domain" : "",
      fieldInvalid(normalized, "billing_address", companyFields.billing_address) ? "billing_address" : "",
      fieldInvalid(normalized, "main_phone", companyFields.main_phone) ? "main_phone" : "",
      fieldInvalid(normalized, "mobile_phone", companyFields.mobile_phone) ? "mobile_phone" : "",
      fieldInvalid(normalized, "website", companyFields.website) ? "website" : "",
      fieldInvalid(normalized, "primary_contact_name", companyFields.primary_contact_name)
        ? "primary_contact_name"
        : "",
      fieldInvalid(normalized, "billing_email", companyFields.billing_email) ? "billing_email" : "",
      fieldInvalid(normalized, "accounts_email", companyFields.accounts_email) ? "accounts_email" : "",
      fieldInvalid(normalized, "operations_email", companyFields.operations_email)
        ? "operations_email"
        : "",
      fieldInvalid(normalized, "booker_contact", travelerFields.booker_contact) ? "booker_contact" : "",
      fieldInvalid(normalized, "booker_email", travelerFields.booker_email) ? "booker_email" : "",
      fieldInvalid(normalized, "booker_name", travelerFields.booker_name) ? "booker_name" : "",
      fieldInvalid(normalized, "default_address", travelerFields.default_address) ? "default_address" : "",
      fieldInvalid(normalized, "default_dropoff_address", travelerFields.default_dropoff_address)
        ? "default_dropoff_address"
        : "",
      fieldInvalid(normalized, "default_pickup_address", travelerFields.default_pickup_address)
        ? "default_pickup_address"
        : "",
      fieldInvalid(normalized, "preferred_vehicle", travelerFields.preferred_vehicle)
        ? "preferred_vehicle"
        : "",
      fieldInvalid(normalized, "traveler_name", travelerFields.traveler_name) ? "traveler_name" : "",
    ].filter(Boolean),
  );
  const missingRequirements: AdminCompanyTravelerCrmIdentityContactWriteContractMissingRequirement[] = [];

  if (!actionType) {
    missingRequirements.push("action_type");
  }

  if (actionType?.endsWith("_update") && !companyId && !travelerId) {
    missingRequirements.push("record_id");
  }

  if (
    scope === "company" &&
    !companyFields.company_name &&
    !companyFields.domain &&
    !companyFields.website &&
    !companyFields.id
  ) {
    missingRequirements.push("company_identity_field");
  }

  if (
    scope === "traveler" &&
    !travelerFields.traveler_name &&
    !travelerFields.booker_contact &&
    !travelerFields.booker_email &&
    !travelerFields.booker_name &&
    !travelerFields.default_address &&
    !travelerFields.default_pickup_address &&
    !travelerFields.default_dropoff_address &&
    !travelerFields.preferred_vehicle &&
    !travelerFields.id
  ) {
    missingRequirements.push("traveler_identity_contact_field");
  }

  missingRequirements.push("admin_approval", "live_write_approval");

  const rejectedFields = unique([...forbiddenFields, ...unknownFields, ...invalidFields]);
  const contractReady =
    rejectedFields.length === 0 &&
    actionType !== null &&
    !missingRequirements.includes("record_id") &&
    !missingRequirements.includes("company_identity_field") &&
    !missingRequirements.includes("traveler_identity_contact_field");
  const ok = contractReady;
  const reason = rejectedFields.length > 0
    ? "unsafe_or_unknown_fields"
    : contractReady
      ? "setup_only_no_write"
      : "missing_required_fields";

  return {
    actionEnabled: false,
    actionScope: scope,
    actionType,
    action_enabled: false,
    action_scope: scope,
    action_type: actionType,
    adminReviewRequired: true,
    admin_review_required: true,
    allowed_fields: allowedCanonicalFields,
    company_fields: companyFields,
    contractReady,
    contract_ready: contractReady,
    delivery_surface: "company_traveler_crm_identity_contact_write_contract_setup_only",
    external_send: false,
    forbidden_fields_present: forbiddenFields,
    invalid_fields: invalidFields,
    liveWriteEnabled: false,
    live_write_enabled: false,
    missing_requirements: missingRequirements,
    ok,
    reason,
    rejected_fields: rejectedFields,
    status: ok ? "blocked" : "rejected",
    traveler_fields: travelerFields,
    unknown_fields: unknownFields,
    version: adminCompanyTravelerCrmIdentityContactWriteContractSetupFoundationVersion,
    writeEnabled: false,
    write_enabled: false,
  };
}
