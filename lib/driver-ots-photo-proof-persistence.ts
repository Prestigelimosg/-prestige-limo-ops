import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  hashDriverJobLinkToken,
  isDriverJobLinkExpired,
  isDriverJobLinkExpiryOutsideAllowedWindow,
} from "./driver-job-link.ts";
import { productionDriverJobLinksConfigured } from "./driver-job-link-mode.ts";

export const driverOtsPhotoProofPersistenceVersion =
  "driver-ots-photo-proof-persistence:v1";
export const driverOtsPhotoProofBucketName = "ots-photo-proofs";

export type DriverOtsPhotoProofBlockedReason =
  | "expired"
  | "invalid_file"
  | "not_configured"
  | "ots_required"
  | "revoked"
  | "storage_failed"
  | "too_large"
  | "unauthorized"
  | "unsupported_type";

export type DriverOtsPhotoProofUploadResult =
  | {
      ok: true;
      proof: DriverOtsPhotoProofSafeRecord;
      version: typeof driverOtsPhotoProofPersistenceVersion;
    }
  | {
      ok: false;
      proof: null;
      reason: DriverOtsPhotoProofBlockedReason;
      version: typeof driverOtsPhotoProofPersistenceVersion;
    };

export type AdminDriverOtsPhotoProofReadResult =
  | {
      booking_reference: string;
      ok: true;
      proofs: AdminDriverOtsPhotoProofSafeRecord[];
      summary: {
        has_ots_photo_proof: boolean;
        proof_count: number;
      };
      version: typeof driverOtsPhotoProofPersistenceVersion;
    }
  | {
      error: string;
      ok: false;
      status: number;
      version: typeof driverOtsPhotoProofPersistenceVersion;
    };

export type DriverOtsPhotoProofSafeRecord = {
  booking_reference: string;
  content_type: string;
  customerVisible: false;
  external_send: false;
  file_size_bytes: number;
  photo_type: "ots";
  proof_status: "uploaded";
  uploaded_at: string;
};

export type AdminDriverOtsPhotoProofSafeRecord = DriverOtsPhotoProofSafeRecord & {
  admin_view_url: string;
  admin_view_url_expires_at: string;
  id: string;
};

type DriverJobLinkProofRow = {
  safe_link_context: UnknownRecord;
  booking_reference: string;
  expires_at: string;
  id: string;
  link_status: "active" | "expired" | "revoked";
  revoked_at: string | null;
};

type DriverOtsPhotoProofRow = {
  booking_reference: string;
  content_type: string;
  file_size_bytes: number;
  id: string;
  photo_type: "ots";
  proof_status: "uploaded";
  storage_bucket: string;
  storage_path: string;
  uploaded_at: string;
};

type UnknownRecord = Record<string, unknown>;

const maxBookingReferenceLength = 120;
const maxUploadBytes = 4 * 1024 * 1024;
const signedUrlTtlSeconds = 5 * 60;
const driverJobLinkSelect =
  "id, booking_reference, link_status, expires_at, revoked_at, safe_link_context";
const proofSelect =
  "id, booking_reference, storage_bucket, storage_path, content_type, file_size_bytes, photo_type, proof_status, uploaded_at";
const allowedUploadContentTypes = new Map([
  ["image/heic", "heic"],
  ["image/heif", "heif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const safeReadError = "OTS photo proof read failed safely.";
const safeConfigError = "OTS photo proof storage is not ready on this server.";

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).trim();

  return cleaned ? cleaned : null;
}

function safeIdentifier(value: unknown, maxLength = maxBookingReferenceLength) {
  const cleaned = textOrNull(value);

  return cleaned &&
    cleaned.length <= maxLength &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned)
    ? cleaned
    : null;
}

function safeDateText(value: unknown) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > 80 || Number.isNaN(new Date(cleaned).getTime())) {
    return null;
  }

  return cleaned;
}

function safeInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function safeHashToken(token: string) {
  try {
    return hashDriverJobLinkToken(token);
  } catch {
    return "";
  }
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function getServerOnlyDriverOtsPhotoProofClient():
  | {
      client: SupabaseClient;
      ok: true;
    }
  | {
      ok: false;
      reason: "not_configured";
    } {
  if (!productionDriverJobLinksConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      reason: "not_configured",
    };
  }

  try {
    return {
      client: createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
        },
      }),
      ok: true,
    };
  } catch {
    return {
      ok: false,
      reason: "not_configured",
    };
  }
}

function toLinkProofRow(row: UnknownRecord): DriverJobLinkProofRow | null {
  const bookingReference = safeIdentifier(row.booking_reference);
  const id = safeIdentifier(row.id);
  const expiresAt = safeDateText(row.expires_at);
  const linkStatus = textOrNull(row.link_status);
  const revokedAt = safeDateText(row.revoked_at) || null;

  if (
    !bookingReference ||
    !id ||
    !expiresAt ||
    !["active", "expired", "revoked"].includes(linkStatus || "")
  ) {
    return null;
  }

  return {
    booking_reference: bookingReference,
    safe_link_context: asRecord(row.safe_link_context),
    expires_at: expiresAt,
    id,
    link_status: linkStatus as DriverJobLinkProofRow["link_status"],
    revoked_at: revokedAt,
  };
}

function toProofRow(row: UnknownRecord): DriverOtsPhotoProofRow | null {
  const id = safeIdentifier(row.id);
  const bookingReference = safeIdentifier(row.booking_reference);
  const storageBucket = textOrNull(row.storage_bucket);
  const storagePath = textOrNull(row.storage_path);
  const contentType = textOrNull(row.content_type);
  const fileSizeBytes = safeInteger(row.file_size_bytes);
  const uploadedAt = safeDateText(row.uploaded_at);
  const photoType = textOrNull(row.photo_type);
  const proofStatus = textOrNull(row.proof_status);

  if (
    !id ||
    !bookingReference ||
    storageBucket !== driverOtsPhotoProofBucketName ||
    !storagePath ||
    !contentType ||
    fileSizeBytes === null ||
    !uploadedAt ||
    photoType !== "ots" ||
    proofStatus !== "uploaded"
  ) {
    return null;
  }

  return {
    booking_reference: bookingReference,
    content_type: contentType,
    file_size_bytes: fileSizeBytes,
    id,
    photo_type: "ots",
    proof_status: "uploaded",
    storage_bucket: storageBucket,
    storage_path: storagePath,
    uploaded_at: uploadedAt,
  };
}

function isProofRow(row: DriverOtsPhotoProofRow | null): row is DriverOtsPhotoProofRow {
  return row !== null;
}

function uploadBlockedResult(reason: DriverOtsPhotoProofBlockedReason): DriverOtsPhotoProofUploadResult {
  return {
    ok: false,
    proof: null,
    reason,
    version: driverOtsPhotoProofPersistenceVersion,
  };
}

async function resolveDriverLinkForProof(
  client: SupabaseClient,
  token: string,
): Promise<
  | {
      link: DriverJobLinkProofRow;
      ok: true;
    }
  | {
      ok: false;
      reason: DriverOtsPhotoProofBlockedReason;
    }
> {
  const tokenHash = safeHashToken(token);

  if (!tokenHash) {
    return {
      ok: false,
      reason: "unauthorized",
    };
  }

  const { data, error } = await client
    .from("driver_job_links")
    .select(driverJobLinkSelect)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: "not_configured",
    };
  }

  const link = toLinkProofRow(asRecord(data));

  if (!link) {
    return {
      ok: false,
      reason: "unauthorized",
    };
  }

  if (link.link_status === "revoked" || link.revoked_at) {
    return {
      ok: false,
      reason: "revoked",
    };
  }

  if (
    link.link_status === "expired" ||
    isDriverJobLinkExpired(link.expires_at) ||
    isDriverJobLinkExpiryOutsideAllowedWindow(link.expires_at, new Date(), undefined, link.safe_link_context)
  ) {
    return {
      ok: false,
      reason: "expired",
    };
  }

  return {
    link,
    ok: true,
  };
}

async function loadLatestOtsEventId(client: SupabaseClient, link: DriverJobLinkProofRow) {
  const { data, error } = await client
    .from("driver_job_status_events")
    .select("id, status_value")
    .eq("booking_reference", link.booking_reference)
    .eq("driver_job_link_id", link.id)
    .eq("status_value", "ots")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      reason: "not_configured" as const,
    };
  }

  const row = asRecord(data);
  const id = safeIdentifier(row.id);

  if (!id || row.status_value !== "ots") {
    return {
      ok: false as const,
      reason: "ots_required" as const,
    };
  }

  return {
    id,
    ok: true as const,
  };
}

function validateUploadFile(file: File | null | undefined):
  | {
      contentType: string;
      extension: string;
      ok: true;
    }
  | {
      ok: false;
      reason: DriverOtsPhotoProofBlockedReason;
    } {
  if (!file || typeof file.arrayBuffer !== "function") {
    return {
      ok: false,
      reason: "invalid_file",
    };
  }

  if (!file.size || file.size <= 0) {
    return {
      ok: false,
      reason: "invalid_file",
    };
  }

  if (file.size > maxUploadBytes) {
    return {
      ok: false,
      reason: "too_large",
    };
  }

  const contentType = textOrNull(file.type)?.toLowerCase() || "";
  const extension = allowedUploadContentTypes.get(contentType);

  if (!extension) {
    return {
      ok: false,
      reason: "unsupported_type",
    };
  }

  return {
    contentType,
    extension,
    ok: true,
  };
}

function buildStoragePath(link: DriverJobLinkProofRow, extension: string) {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const safeBookingReference = link.booking_reference.replace(/[^A-Za-z0-9._:-]/g, "_");
  const safeLinkId = link.id.replace(/[^A-Za-z0-9-]/g, "");

  return `bookings/${safeBookingReference}/ots/${timestamp}-${safeLinkId}.${extension}`;
}

function safeDriverProofRecord(row: DriverOtsPhotoProofRow): DriverOtsPhotoProofSafeRecord {
  return {
    booking_reference: row.booking_reference,
    content_type: row.content_type,
    customerVisible: false,
    external_send: false,
    file_size_bytes: row.file_size_bytes,
    photo_type: "ots",
    proof_status: "uploaded",
    uploaded_at: row.uploaded_at,
  };
}

export async function uploadDriverOtsPhotoProofForToken({
  file,
  token,
}: {
  file: File | null | undefined;
  token: string;
}): Promise<DriverOtsPhotoProofUploadResult> {
  const clientResult = getServerOnlyDriverOtsPhotoProofClient();

  if (!clientResult.ok) {
    return uploadBlockedResult(clientResult.reason);
  }

  const resolvedLink = await resolveDriverLinkForProof(clientResult.client, token);

  if (!resolvedLink.ok) {
    return uploadBlockedResult(resolvedLink.reason);
  }

  const otsEvent = await loadLatestOtsEventId(clientResult.client, resolvedLink.link);

  if (!otsEvent.ok) {
    return uploadBlockedResult(otsEvent.reason);
  }

  const uploadFile = file || null;

  if (!uploadFile) {
    return uploadBlockedResult("invalid_file");
  }

  const fileValidation = validateUploadFile(uploadFile);

  if (!fileValidation.ok) {
    return uploadBlockedResult(fileValidation.reason);
  }

  const storagePath = buildStoragePath(resolvedLink.link, fileValidation.extension);
  const uploadBytes = new Uint8Array(await uploadFile.arrayBuffer());
  const { error: uploadError } = await clientResult.client.storage
    .from(driverOtsPhotoProofBucketName)
    .upload(storagePath, uploadBytes, {
      contentType: fileValidation.contentType,
      upsert: false,
    });

  if (uploadError) {
    return uploadBlockedResult("storage_failed");
  }

  const insertRow = {
    booking_reference: resolvedLink.link.booking_reference,
    content_type: fileValidation.contentType,
    driver_job_link_id: resolvedLink.link.id,
    file_size_bytes: uploadFile.size,
    ots_status_event_id: otsEvent.id,
    photo_type: "ots",
    proof_status: "uploaded",
    safe_upload_context: {
      customer_visible: false,
      external_send: false,
      source: "driver_job_api",
    },
    source_surface: "driver_job_api",
    storage_bucket: driverOtsPhotoProofBucketName,
    storage_path: storagePath,
  };
  const { data, error: insertError } = await clientResult.client
    .from("driver_ots_photo_proofs")
    .insert(insertRow)
    .select(proofSelect)
    .single();
  const proofRow = toProofRow(asRecord(data));

  if (insertError || !proofRow) {
    await clientResult.client.storage.from(driverOtsPhotoProofBucketName).remove([storagePath]);
    return uploadBlockedResult("not_configured");
  }

  return {
    ok: true,
    proof: safeDriverProofRecord(proofRow),
    version: driverOtsPhotoProofPersistenceVersion,
  };
}

export function parseAdminDriverOtsPhotoProofParams(params: URLSearchParams | UnknownRecord) {
  const bookingReference = safeIdentifier(
    params instanceof URLSearchParams ? params.get("booking_reference") : params.booking_reference,
  );
  const rawLimit = params instanceof URLSearchParams ? params.get("limit") : params.limit;
  const parsedLimit = rawLimit === undefined || rawLimit === null || rawLimit === ""
    ? 3
    : Number(rawLimit);

  if (!bookingReference) {
    return {
      error: "Missing or malformed OTS photo proof booking_reference.",
      ok: false as const,
      status: 400,
    };
  }

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 10) {
    return {
      error: "Malformed OTS photo proof limit rejected.",
      ok: false as const,
      status: 400,
    };
  }

  return {
    data: {
      booking_reference: bookingReference,
      limit: parsedLimit,
    },
    ok: true as const,
  };
}

export async function loadAdminDriverOtsPhotoProofs(
  params: URLSearchParams | UnknownRecord,
): Promise<AdminDriverOtsPhotoProofReadResult> {
  const parsedParams = parseAdminDriverOtsPhotoProofParams(params);

  if (!parsedParams.ok) {
    return {
      error: parsedParams.error,
      ok: false,
      status: parsedParams.status,
      version: driverOtsPhotoProofPersistenceVersion,
    };
  }

  const clientResult = getServerOnlyDriverOtsPhotoProofClient();

  if (!clientResult.ok) {
    return {
      error: safeConfigError,
      ok: false,
      status: 503,
      version: driverOtsPhotoProofPersistenceVersion,
    };
  }

  try {
    const { data, error } = await clientResult.client
      .from("driver_ots_photo_proofs")
      .select(proofSelect)
      .eq("booking_reference", parsedParams.data.booking_reference)
      .eq("photo_type", "ots")
      .eq("proof_status", "uploaded")
      .order("uploaded_at", { ascending: false })
      .limit(parsedParams.data.limit);

    if (error) {
      return {
        error: safeReadError,
        ok: false,
        status: 503,
        version: driverOtsPhotoProofPersistenceVersion,
      };
    }

    const proofs = [];

    for (const proofRow of asArray(data).map((row) => toProofRow(asRecord(row))).filter(isProofRow)) {
      const { data: signedUrlData, error: signedUrlError } = await clientResult.client.storage
        .from(driverOtsPhotoProofBucketName)
        .createSignedUrl(proofRow.storage_path, signedUrlTtlSeconds);

      // Keep exact metadata available for retry if bytes were removed but the
      // metadata delete failed, or signing is temporarily unavailable.
      proofs.push({
        ...safeDriverProofRecord(proofRow),
        admin_view_url: !signedUrlError && signedUrlData?.signedUrl ? signedUrlData.signedUrl : "",
        admin_view_url_expires_at: new Date(
          Date.now() + signedUrlTtlSeconds * 1000,
        ).toISOString(),
        id: proofRow.id,
      });
    }

    return {
      booking_reference: parsedParams.data.booking_reference,
      ok: true,
      proofs,
      summary: {
        has_ots_photo_proof: proofs.length > 0,
        proof_count: proofs.length,
      },
      version: driverOtsPhotoProofPersistenceVersion,
    };
  } catch {
    return {
      error: safeReadError,
      ok: false,
      status: 500,
      version: driverOtsPhotoProofPersistenceVersion,
    };
  }
}

function photoDeleteFailure(status = 503) {
  return { ok: false as const, status, error: "Photo could not be deleted. Refresh and try again." };
}

type ExactPhotoDeleteTarget = { id: string; booking_reference: string; uploaded_at: string };

function parsePhotoDeleteTarget(value: unknown): ExactPhotoDeleteTarget | null {
  const row = asRecord(value);
  if (Object.keys(row).length !== 3 ||
      !Object.keys(row).every((key) => ["id", "booking_reference", "uploaded_at"].includes(key)) ||
      typeof row.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id) ||
      typeof row.booking_reference !== "string" || safeIdentifier(row.booking_reference) !== row.booking_reference ||
      typeof row.uploaded_at !== "string" || !safeDateText(row.uploaded_at)) return null;
  return { id: row.id, booking_reference: row.booking_reference, uploaded_at: row.uploaded_at };
}

// Photo uploads are immutable; every removal re-reads the exact identity and
// matches that snapshot when deleting metadata. Concurrent retries are harmless.
async function deleteExactOtsPhoto(client: SupabaseClient, target: ExactPhotoDeleteTarget) {
  const { data, error } = await client.from("driver_ots_photo_proofs")
    .select(proofSelect).eq("id", target.id).maybeSingle();
  if (error) return photoDeleteFailure();
  if (!data) return { ok: true as const, deleted: false };
  const proof = toProofRow(asRecord(data));
  if (!proof || proof.booking_reference !== target.booking_reference ||
      proof.uploaded_at !== target.uploaded_at ||
      !proof.storage_path.startsWith(`bookings/${proof.booking_reference}/ots/`) ||
      !/^[0-9]{14}-[A-Za-z0-9-]+\.(heic|heif|jpg|png|webp)$/.test(proof.storage_path.split("/").at(-1) || "") ||
      proof.storage_path.split("/").length !== 4) return photoDeleteFailure(409);

  // Always remove bytes through Storage, never SQL. A successful empty result
  // is an already absent object, including a retry after metadata deletion failed.
  const removed = await client.storage.from(driverOtsPhotoProofBucketName).remove([proof.storage_path]);
  if (removed.error || !Array.isArray(removed.data) ||
      removed.data.some((object) => object.name !== proof.storage_path)) return photoDeleteFailure();
  const deleted = await client.from("driver_ots_photo_proofs").delete()
    .eq("id", proof.id).eq("booking_reference", proof.booking_reference)
    .eq("uploaded_at", proof.uploaded_at).eq("storage_bucket", proof.storage_bucket)
    .eq("storage_path", proof.storage_path).eq("photo_type", "ots").eq("proof_status", "uploaded")
    .select("id");
  if (deleted.error || !Array.isArray(deleted.data)) return photoDeleteFailure();
  if (deleted.data.length === 0) {
    const current = await client.from("driver_ots_photo_proofs").select("id").eq("id", proof.id).maybeSingle();
    if (current.error || current.data) return photoDeleteFailure(409);
  }
  return { ok: true as const, deleted: true };
}

export async function deleteAdminDriverOtsPhotoProof(value: unknown) {
  const target = parsePhotoDeleteTarget(value);
  if (!target) return photoDeleteFailure(400);
  const connection = getServerOnlyDriverOtsPhotoProofClient();
  if (!connection.ok) return photoDeleteFailure();
  try { return await deleteExactOtsPhoto(connection.client, target); }
  catch { return photoDeleteFailure(); }
}

// Calendar months in Singapore, clamping month-end (31 January -> 30 April).
export function otsPhotoRetentionDueAt(uploadedAt: string): string | null {
  const timestamp = new Date(uploadedAt).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const local = new Date(timestamp + 8 * 60 * 60 * 1000);
  const day = local.getUTCDate();
  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() + 3);
  const lastDay = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
  local.setUTCDate(Math.min(day, lastDay));
  return new Date(local.getTime() - 8 * 60 * 60 * 1000).toISOString();
}

export async function runOtsPhotoRetention(now = new Date()) {
  if (process.env.PRESTIGE_OTS_PHOTO_RETENTION_ENABLED !== "true") {
    return { ok: true, enabled: false, deleted: 0 };
  }
  const connection = getServerOnlyDriverOtsPhotoProofClient();
  if (!connection.ok || !Number.isFinite(now.getTime())) return { ok: false, enabled: true, deleted: 0 };
  let deleted = 0;
  try {
    // Three calendar months cannot be shorter than 89 days. This is only a
    // bounded candidate read; each candidate's precise due date is checked below.
    const { data, error } = await connection.client.from("driver_ots_photo_proofs")
      .select(proofSelect).eq("proof_status", "uploaded").eq("photo_type", "ots")
      .lte("uploaded_at", new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000).toISOString())
      .order("uploaded_at", { ascending: true }).order("id", { ascending: true }).limit(100);
    if (error || !Array.isArray(data)) return { ok: false, enabled: true, deleted };
    for (const row of data) {
      const proof = toProofRow(asRecord(row));
      const due = proof && otsPhotoRetentionDueAt(proof.uploaded_at);
      if (!proof || !due) return { ok: false, enabled: true, deleted };
      if (new Date(due).getTime() > now.getTime()) continue;
      const result = await deleteExactOtsPhoto(connection.client, proof);
      if (!result.ok) return { ok: false, enabled: true, deleted };
      if (result.deleted) deleted++;
    }
    return { ok: true, enabled: true, deleted, batchFull: data.length === 100 };
  } catch { return { ok: false, enabled: true, deleted }; }
}
