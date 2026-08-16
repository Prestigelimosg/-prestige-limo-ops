import "server-only";

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  hashDriverJobLinkToken,
  isDriverJobLinkExpired,
  isDriverJobLinkExpiryOutsideAllowedWindow,
} from "./driver-job-link.ts";

export const driverAccountDeviceLockVersion = "driver-account-device-lock-v1";

type DbClient = Pick<SupabaseClient, "from">;
type Env = Record<string, string | undefined>;
type UnknownRecord = Record<string, unknown>;
type AuthUser = { id?: string | null };
type AuthAdmin = {
  createUser: (input: {
    app_metadata: Record<string, string>;
    email: string;
    email_confirm: true;
    password: string;
  }) => Promise<{ data: { user?: AuthUser | null } | null; error: unknown }>;
  deleteUser: (userId: string) => Promise<{ error: unknown }>;
};
type PasswordAuth = {
  signInWithPassword: (input: {
    email: string;
    password: string;
  }) => Promise<{ data: { user?: AuthUser | null } | null; error: unknown }>;
  signOut: (options?: { scope?: "local" }) => Promise<unknown>;
};

type AccountSuccess = {
  accountId: string;
  deviceIdHash: string | null;
  driverId: number;
  ok: true;
};

type AccountFailureReason =
  | "account_exists"
  | "account_unavailable"
  | "device_mismatch"
  | "invalid_credentials"
  | "invalid_input"
  | "invalid_link"
  | "not_configured"
  | "not_native_app";

export type DriverAccountResult =
  | AccountSuccess
  | { ok: false; reason: AccountFailureReason };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deviceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deviceHashPattern = /^[0-9a-f]{64}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const placeholderPattern = /^(?:todo|tbd|none|null|undefined|placeholder|changeme|replace_me|example)$/i;

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function configuredValue(env: Env, name: string) {
  const value = env[name]?.trim() || "";
  return value && !placeholderPattern.test(value) ? value : "";
}

function runtimeEnabled(env: Env) {
  return configuredValue(env, "PRESTIGE_DRIVER_ACCOUNT_AUTH_ENABLED") === "true";
}

function deviceSecret(env: Env) {
  const value = configuredValue(env, "PRESTIGE_DRIVER_ACCOUNT_DEVICE_SECRET");
  return value.length >= 32 ? value : "";
}

function normalizedEmail(value: unknown) {
  const email = text(value).toLowerCase();
  return email.length <= 254 && emailPattern.test(email) ? email : "";
}

function validPassword(value: unknown) {
  const password = typeof value === "string" ? value : "";
  return password.length >= 12 && password.length <= 128 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
}

function deviceIdHashFor(value: unknown, env: Env) {
  const installationId = text(value).toLowerCase();
  const secret = deviceSecret(env);
  if (!secret || !deviceIdPattern.test(installationId)) return "";

  return createHash("sha256")
    .update(`${driverAccountDeviceLockVersion}:${secret}:${installationId}`)
    .digest("hex");
}

function serviceClient(env: Env) {
  const url = configuredValue(env, "SUPABASE_URL");
  const key = configuredValue(env, "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;

  try {
    return createClient(url, key, { auth: { persistSession: false } });
  } catch {
    return null;
  }
}

function passwordAuth(env: Env) {
  const url = configuredValue(env, "SUPABASE_URL") || configuredValue(env, "NEXT_PUBLIC_SUPABASE_URL");
  const key = configuredValue(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !key) return null;

  try {
    return createClient(url, key, { auth: { persistSession: false } }).auth;
  } catch {
    return null;
  }
}

function failure(reason: AccountFailureReason): DriverAccountResult {
  return { ok: false, reason };
}

export async function createDriverAccountForAcknowledgedLink(input: {
  authorizedDriverId: unknown;
  authAdmin?: AuthAdmin;
  client?: DbClient;
  email: unknown;
  env?: Env;
  password: unknown;
  token: string;
}): Promise<DriverAccountResult> {
  const env = input.env ?? process.env;
  const email = normalizedEmail(input.email);
  const authorizedDriverId = positiveInteger(input.authorizedDriverId);
  if (!email || !validPassword(input.password)) return failure("invalid_input");
  if (!authorizedDriverId) return failure("invalid_link");
  if (!runtimeEnabled(env)) return failure("not_configured");

  const client = input.client ?? serviceClient(env);
  const authAdmin = input.authAdmin ?? serviceClient(env)?.auth.admin;
  if (!client || !authAdmin) return failure("not_configured");

  let tokenHash = "";
  try {
    tokenHash = hashDriverJobLinkToken(input.token);
  } catch {
    return failure("invalid_link");
  }

  const { data: linkData, error: linkError } = await client
    .from("driver_job_links")
    .select("id, booking_reference, driver_id, link_status, expires_at, revoked_at, safe_link_context")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  const link = record(linkData);
  const linkId = text(link.id);
  const reference = text(link.booking_reference);
  const driverId = positiveInteger(link.driver_id);
  const context = record(link.safe_link_context);
  const expiresAt = text(link.expires_at);
  if (
    linkError || !uuidPattern.test(linkId) || !reference || !driverId ||
    driverId !== authorizedDriverId ||
    link.link_status !== "active" || link.revoked_at ||
    !text(context.driver_acknowledged_at) || !expiresAt ||
    isDriverJobLinkExpired(expiresAt) || isDriverJobLinkExpiryOutsideAllowedWindow(expiresAt)
  ) {
    return failure("invalid_link");
  }

  const { data: bookingData, error: bookingError } = await client
    .from("bookings")
    .select("driver_id")
    .eq("booking_reference", reference)
    .maybeSingle();
  if (bookingError || positiveInteger(record(bookingData).driver_id) !== driverId) {
    return failure("invalid_link");
  }

  const driverReference = String(driverId);
  const { data: existingAccount, error: existingError } = await client
    .from("driver_access_accounts")
    .select("id")
    .eq("driver_reference", driverReference)
    .maybeSingle();
  if (existingError) return failure("account_unavailable");
  if (record(existingAccount).id) return failure("account_exists");

  const { data: reservationData, error: reservationError } = await client
    .from("driver_account_enrollments")
    .insert({
      driver_id: driverId,
      driver_job_link_id: linkId,
      email_normalized: email,
      enrollment_status: "reserved",
    })
    .select("id")
    .single();
  let reservationId = text(record(reservationData).id);
  if (reservationError || !uuidPattern.test(reservationId)) {
    const { data: failedReservationData, error: failedReservationError } = await client
      .from("driver_account_enrollments")
      .select("id, enrollment_status, auth_user_id")
      .eq("driver_job_link_id", linkId)
      .eq("driver_id", driverId)
      .maybeSingle();
    const failedReservation = record(failedReservationData);
    const failedReservationId = text(failedReservation.id);
    if (
      failedReservationError || !uuidPattern.test(failedReservationId) ||
      failedReservation.enrollment_status !== "failed" || text(failedReservation.auth_user_id)
    ) {
      return failure("account_exists");
    }

    const { data: retriedReservationData, error: retriedReservationError } = await client
      .from("driver_account_enrollments")
      .update({
        email_normalized: email,
        enrollment_status: "reserved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", failedReservationId)
      .eq("enrollment_status", "failed")
      .is("auth_user_id", null)
      .select("id")
      .maybeSingle();
    reservationId = text(record(retriedReservationData).id);
    if (retriedReservationError || reservationId !== failedReservationId) {
      return failure("account_unavailable");
    }
  }

  const created = await authAdmin.createUser({
    app_metadata: {
      prestige_driver_reference: driverReference,
      prestige_enrollment_id: reservationId,
    },
    email,
    email_confirm: true,
    password: input.password as string,
  });
  const authUserId = text(created.data?.user?.id);
  if (created.error || !uuidPattern.test(authUserId)) {
    await client.from("driver_account_enrollments").update({
      enrollment_status: "failed",
      updated_at: new Date().toISOString(),
    }).eq("id", reservationId);
    return failure("account_unavailable");
  }

  const payload = record(context.driver_job_payload);
  const safeLabel = text(payload.assigned_driver_name || payload.driver_name).slice(0, 160) || `Driver ${driverId}`;
  const { data: accountData, error: accountError } = await client
    .from("driver_access_accounts")
    .insert({
      account_status: "pending_setup",
      auth_provider: "supabase_auth",
      auth_user_id: authUserId,
      driver_reference: driverReference,
      safe_display_label: safeLabel,
      source_driver_job_link_id: linkId,
      source_surface: "system",
    })
    .select("id")
    .single();
  const accountId = text(record(accountData).id);
  if (accountError || !uuidPattern.test(accountId)) {
    const deleted = await authAdmin.deleteUser(authUserId).catch(() => ({ error: true }));
    await client.from("driver_account_enrollments").update({
      auth_user_id: deleted.error ? authUserId : null,
      enrollment_status: "failed",
      updated_at: new Date().toISOString(),
    }).eq("id", reservationId);
    return failure("account_unavailable");
  }

  const consumedAt = new Date().toISOString();
  const { error: consumedError } = await client
    .from("driver_account_enrollments")
    .update({
      auth_user_id: authUserId,
      consumed_at: consumedAt,
      enrollment_status: "consumed",
      updated_at: consumedAt,
    })
    .eq("driver_job_link_id", linkId)
    .eq("driver_id", driverId);
  if (consumedError) return failure("account_unavailable");

  return { accountId, deviceIdHash: null, driverId, ok: true };
}

export async function signInDriverAccountForInstallation(input: {
  auth?: PasswordAuth;
  client?: DbClient;
  email: unknown;
  env?: Env;
  installationId: unknown;
  password: unknown;
}): Promise<DriverAccountResult> {
  const env = input.env ?? process.env;
  const email = normalizedEmail(input.email);
  const deviceIdHash = deviceIdHashFor(input.installationId, env);
  if (!email || !validPassword(input.password)) return failure("invalid_credentials");
  if (!deviceIdHash) return failure("not_native_app");
  if (!runtimeEnabled(env)) return failure("not_configured");

  const client = input.client ?? serviceClient(env);
  const auth = input.auth ?? passwordAuth(env);
  if (!client || !auth) return failure("not_configured");

  const signedIn = await auth.signInWithPassword({ email, password: input.password as string });
  const authUserId = text(signedIn.data?.user?.id);
  if (signedIn.error || !uuidPattern.test(authUserId)) return failure("invalid_credentials");

  try {
    const { data: accountData, error: accountError } = await client
      .from("driver_access_accounts")
      .select("id, auth_user_id, driver_reference, account_status, active_device_id_hash")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    const account = record(accountData);
    const accountId = text(account.id);
    const driverId = positiveInteger(account.driver_reference);
    const savedDeviceHash = text(account.active_device_id_hash);
    if (accountError || !uuidPattern.test(accountId) || !driverId) {
      return failure("invalid_credentials");
    }
    if (account.account_status === "suspended" || account.account_status === "revoked") {
      return failure("invalid_credentials");
    }
    if (savedDeviceHash && savedDeviceHash !== deviceIdHash) {
      return failure("device_mismatch");
    }

    if (!savedDeviceHash) {
      const boundAt = new Date().toISOString();
      const { data: boundData, error: bindError } = await client
        .from("driver_access_accounts")
        .update({
          account_status: "active",
          active_device_id_hash: deviceIdHash,
          device_bound_at: boundAt,
          updated_at: boundAt,
        })
        .eq("id", accountId)
        .eq("account_status", "pending_setup")
        .is("active_device_id_hash", null)
        .select("id, active_device_id_hash, account_status")
        .maybeSingle();
      const boundAccount = record(boundData);
      if (
        bindError || text(boundAccount.id) !== accountId ||
        text(boundAccount.active_device_id_hash) !== deviceIdHash ||
        boundAccount.account_status !== "active"
      ) {
        return failure("device_mismatch");
      }
    } else if (account.account_status !== "active") {
      return failure("invalid_credentials");
    }

    return { accountId, deviceIdHash, driverId, ok: true };
  } finally {
    await auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}

export async function verifyDriverAccountSession(input: {
  accountId: string;
  client: DbClient;
  deviceIdHash: string;
  driverId: number;
  env?: Env;
  installationId: unknown;
}) {
  const requestDeviceHash = deviceIdHashFor(input.installationId, input.env ?? process.env);
  if (
    !uuidPattern.test(input.accountId) ||
    !deviceHashPattern.test(input.deviceIdHash) ||
    requestDeviceHash !== input.deviceIdHash ||
    !positiveInteger(input.driverId)
  ) {
    return false;
  }

  const { data, error } = await input.client
    .from("driver_access_accounts")
    .select("id")
    .eq("id", input.accountId)
    .eq("driver_reference", String(input.driverId))
    .eq("account_status", "active")
    .eq("active_device_id_hash", input.deviceIdHash)
    .maybeSingle();

  return !error && text(record(data).id) === input.accountId;
}
