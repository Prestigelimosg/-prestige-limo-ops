export const adminOtsPhotoProofSetupFoundationVersion =
  "admin-ots-photo-proof-setup-foundation:v1";

export type AdminOtsPhotoProofSetupInput = {
  booking_ref?: string | null;
  driver_job_token?: string | null;
  service_code?: string | null;
};

export type AdminOtsPhotoProofSetupResult = {
  version: typeof adminOtsPhotoProofSetupFoundationVersion;
  booking_ref: string;
  status: "setup_only";
  ots_photo_proof_status: "disabled";
  camera_capture_status: "disabled";
  file_upload_status: "disabled";
  storage_status: "disabled";
  proof_scope: "job_scoped";
  future_trigger: "driver_ots";
  future_visibility: "admin_only";
  future_customer_visibility: "disabled_by_default";
  notes: string[];
};

function safeText(value: unknown, fallback = "unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function buildAdminOtsPhotoProofSetupFoundation(
  input: AdminOtsPhotoProofSetupInput,
): AdminOtsPhotoProofSetupResult {
  return {
    version: adminOtsPhotoProofSetupFoundationVersion,
    booking_ref: safeText(input.booking_ref),
    status: "setup_only",
    ots_photo_proof_status: "disabled",
    camera_capture_status: "disabled",
    file_upload_status: "disabled",
    storage_status: "disabled",
    proof_scope: "job_scoped",
    future_trigger: "driver_ots",
    future_visibility: "admin_only",
    future_customer_visibility: "disabled_by_default",
    notes: [
      "Setup foundation only.",
      "No real camera capture is active.",
      "No real file upload is active.",
      "No storage write is active.",
      "Future proof must attach to the assigned job only.",
      "Future customer visibility stays disabled unless separately approved.",
    ],
  };
}
