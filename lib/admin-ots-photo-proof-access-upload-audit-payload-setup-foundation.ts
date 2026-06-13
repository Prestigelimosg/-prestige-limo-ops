import "server-only";

import {
  buildAdminOtsPhotoProofSetupFoundation,
  type AdminOtsPhotoProofSetupInput,
  type AdminOtsPhotoProofSetupResult,
} from "./admin-ots-photo-proof-setup-foundation";

export const adminOtsPhotoProofAccessUploadAuditPayloadSetupFoundationVersion =
  "admin-ots-photo-proof-access-upload-audit-payload-setup-foundation-v1";

export const adminOtsPhotoProofAccessUploadAuditActionSources = [
  "disabled_access_upload_api",
  "preview_readiness_api",
  "setup_contract_test",
] as const;

export type AdminOtsPhotoProofAccessUploadAuditActionSource =
  (typeof adminOtsPhotoProofAccessUploadAuditActionSources)[number];

export type AdminOtsPhotoProofAccessUploadAuditPayloadMissingRequirement =
  | "action_source"
  | "booking_ref"
  | "disabled_access_upload_result";

export type AdminOtsPhotoProofAccessUploadAuditPayloadSetupInput =
  AdminOtsPhotoProofSetupInput & {
    actionSource?: unknown;
    action_source?: unknown;
    disabledAccessUpload?: unknown;
    disabled_access_upload?: unknown;
    otsAccessUploadResult?: unknown;
    ots_access_upload_result?: unknown;
    setup?: AdminOtsPhotoProofSetupResult | null;
  };

export type AdminOtsPhotoProofAccessUploadAuditBlockedNoOpResult = {
  adminViewerEnabled: false;
  customerVisible: false;
  external_send: false;
  liveAccessEnabled: false;
  no_op: true;
  photoUploadEnabled: false;
  reason: "setup_only_disabled";
  result_label: "blocked/no-op";
  status: "blocked";
  storageEnabled: false;
};

export type AdminOtsPhotoProofAccessUploadAuditStorageMetadata = {
  futureStoragePathPattern: "bookings/{bookingRef}/ots/{timestamp}-{driverId}.jpg";
  photoType: "OTS";
  plannedPrivateBucket: "ots-photo-proofs";
  preview_readiness_source: "admin-ots-photo-proof-preview-readiness-setup";
  realPhotoDataIncluded: false;
  realStorageObjectIncluded: false;
};

export type AdminOtsPhotoProofAccessUploadAuditPayloadSetupResult = {
  actionSource: AdminOtsPhotoProofAccessUploadAuditActionSource | null;
  action_source: AdminOtsPhotoProofAccessUploadAuditActionSource | null;
  adminViewerEnabled: false;
  auditWriteEnabled: false;
  audit_payload: {
    actionSource: AdminOtsPhotoProofAccessUploadAuditActionSource | null;
    action_source: AdminOtsPhotoProofAccessUploadAuditActionSource | null;
    adminViewerEnabled: false;
    auditWriteEnabled: false;
    bookingRef: string | null;
    booking_ref: string | null;
    customerVisible: false;
    disabledAccessUploadStatus: "blocked" | "missing";
    disabled_access_upload_source: "admin-ots-photo-proof-access-upload-disabled-setup";
    disabled_access_upload_status: "blocked" | "missing";
    external_send: false;
    liveAccessEnabled: false;
    metadata: AdminOtsPhotoProofAccessUploadAuditStorageMetadata;
    photoType: "OTS";
    photoUploadEnabled: false;
    preview_readiness_source: "admin-ots-photo-proof-preview-readiness-setup";
    result: AdminOtsPhotoProofAccessUploadAuditBlockedNoOpResult;
    storageEnabled: false;
  };
  audit_write_enabled: false;
  blocked_no_op_result: AdminOtsPhotoProofAccessUploadAuditBlockedNoOpResult;
  bookingRef: string | null;
  booking_ref: string | null;
  customerVisible: false;
  delivery_surface: "admin_ots_photo_proof_access_upload_audit_payload_setup_only";
  disabledAccessUploadStatus: "blocked" | "missing";
  disabled_access_upload_status: "blocked" | "missing";
  external_send: false;
  liveAccessEnabled: false;
  metadata: AdminOtsPhotoProofAccessUploadAuditStorageMetadata;
  missing_requirements: AdminOtsPhotoProofAccessUploadAuditPayloadMissingRequirement[];
  photoType: "OTS";
  photoUploadEnabled: false;
  status: "setup_only";
  storageEnabled: false;
  version: typeof adminOtsPhotoProofAccessUploadAuditPayloadSetupFoundationVersion;
};

const disabledAccessUploadSource = "admin-ots-photo-proof-access-upload-disabled-setup" as const;
const futureStoragePathPattern = "bookings/{bookingRef}/ots/{timestamp}-{driverId}.jpg" as const;
const photoType = "OTS" as const;
const plannedPrivateBucket = "ots-photo-proofs" as const;
const previewReadinessSource = "admin-ots-photo-proof-preview-readiness-setup" as const;

const blockedNoOpResult: AdminOtsPhotoProofAccessUploadAuditBlockedNoOpResult = {
  adminViewerEnabled: false,
  customerVisible: false,
  external_send: false,
  liveAccessEnabled: false,
  no_op: true,
  photoUploadEnabled: false,
  reason: "setup_only_disabled",
  result_label: "blocked/no-op",
  status: "blocked",
  storageEnabled: false,
};

const plannedStorageMetadata: AdminOtsPhotoProofAccessUploadAuditStorageMetadata = {
  futureStoragePathPattern,
  photoType,
  plannedPrivateBucket,
  preview_readiness_source: previewReadinessSource,
  realPhotoDataIncluded: false,
  realStorageObjectIncluded: false,
};

const blockedFragments = [
  "amount_due",
  "auth",
  "base64",
  "billing",
  "camera",
  "customer_price",
  "debug",
  "driver_payout",
  "file",
  "finance",
  "internal_admin",
  "internal_finance",
  "invoice",
  "object",
  "password",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "photo_data",
  "secret",
  "server_secret",
  "service_role",
  "storage_object",
  "token",
  "upload",
];

function normalizedText(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function safeBookingRef(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > 80) {
    return null;
  }

  return blockedFragments.some((fragment) => normalizedText(cleaned).includes(fragment)) ? null : cleaned;
}

function safeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeActionSource(
  value: unknown,
): AdminOtsPhotoProofAccessUploadAuditActionSource | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");

  return adminOtsPhotoProofAccessUploadAuditActionSources.includes(
    normalized as AdminOtsPhotoProofAccessUploadAuditActionSource,
  )
    ? (normalized as AdminOtsPhotoProofAccessUploadAuditActionSource)
    : null;
}

function setupFrom(
  input: AdminOtsPhotoProofAccessUploadAuditPayloadSetupInput,
): AdminOtsPhotoProofSetupResult {
  return input.setup ?? buildAdminOtsPhotoProofSetupFoundation(input);
}

function disabledAccessUploadFrom(input: AdminOtsPhotoProofAccessUploadAuditPayloadSetupInput) {
  return safeRecord(
    firstValue(
      input.disabledAccessUpload,
      input.disabled_access_upload,
      input.otsAccessUploadResult,
      input.ots_access_upload_result,
    ),
  );
}

function hasBlockedNoOpAccessUploadResult(value: Record<string, unknown>) {
  return (
    value.delivery_surface === "ots_photo_proof_access_upload_disabled_setup_only" &&
    value.status === "blocked" &&
    value.reason === "setup_only_disabled" &&
    value.result_label === "blocked/no-op" &&
    value.no_op === true &&
    value.external_send === false &&
    value.photoUploadEnabled === false &&
    value.storageEnabled === false &&
    value.adminViewerEnabled === false &&
    value.customerVisible === false &&
    value.liveAccessEnabled === false
  );
}

export function buildAdminOtsPhotoProofAccessUploadAuditPayloadSetup(
  input: AdminOtsPhotoProofAccessUploadAuditPayloadSetupInput,
): AdminOtsPhotoProofAccessUploadAuditPayloadSetupResult {
  const setup = setupFrom(input);
  const actionSource = normalizeActionSource(firstValue(input.actionSource, input.action_source));
  const disabledAccessUpload = disabledAccessUploadFrom(input);
  const disabledAccessUploadReady = hasBlockedNoOpAccessUploadResult(disabledAccessUpload);
  const disabledAccessUploadStatus = disabledAccessUploadReady ? "blocked" : "missing";
  const bookingRef = safeBookingRef(setup.booking_ref);
  const missingRequirements: AdminOtsPhotoProofAccessUploadAuditPayloadMissingRequirement[] = [];

  if (!actionSource) {
    missingRequirements.push("action_source");
  }

  if (!bookingRef) {
    missingRequirements.push("booking_ref");
  }

  if (!disabledAccessUploadReady) {
    missingRequirements.push("disabled_access_upload_result");
  }

  return {
    actionSource,
    action_source: actionSource,
    adminViewerEnabled: false,
    auditWriteEnabled: false,
    audit_payload: {
      actionSource,
      action_source: actionSource,
      adminViewerEnabled: false,
      auditWriteEnabled: false,
      bookingRef,
      booking_ref: bookingRef,
      customerVisible: false,
      disabledAccessUploadStatus: disabledAccessUploadStatus,
      disabled_access_upload_source: disabledAccessUploadSource,
      disabled_access_upload_status: disabledAccessUploadStatus,
      external_send: false,
      liveAccessEnabled: false,
      metadata: plannedStorageMetadata,
      photoType,
      photoUploadEnabled: false,
      preview_readiness_source: previewReadinessSource,
      result: blockedNoOpResult,
      storageEnabled: false,
    },
    audit_write_enabled: false,
    blocked_no_op_result: blockedNoOpResult,
    bookingRef,
    booking_ref: bookingRef,
    customerVisible: false,
    delivery_surface: "admin_ots_photo_proof_access_upload_audit_payload_setup_only",
    disabledAccessUploadStatus: disabledAccessUploadStatus,
    disabled_access_upload_status: disabledAccessUploadStatus,
    external_send: false,
    liveAccessEnabled: false,
    metadata: plannedStorageMetadata,
    missing_requirements: missingRequirements,
    photoType,
    photoUploadEnabled: false,
    status: "setup_only",
    storageEnabled: false,
    version: adminOtsPhotoProofAccessUploadAuditPayloadSetupFoundationVersion,
  };
}
