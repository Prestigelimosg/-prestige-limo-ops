import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { adminAccountAuthIsEnabled } from "./admin-account-session.ts";
import type { AdminAccountSessionClaims } from "./admin-account-session.ts";

type AdminAccountRole = "admin" | "dispatcher";
type DbClient = Pick<SupabaseClient, "from">;
type Env = Record<string, string | undefined>;
type UnknownRecord = Record<string, unknown>;
type AuthUser = { id?: string | null };
type OtpAuth = {
  signInWithOtp: (input: {
    email: string;
    options: { shouldCreateUser: false };
  }) => Promise<{ error: unknown }>;
  signOut: (options?: { scope?: "local" }) => Promise<unknown>;
  verifyOtp: (input: {
    email: string;
    token: string;
    type: "email";
  }) => Promise<{ data: { user?: AuthUser | null } | null; error: unknown }>;
};

export type AdminAccountOtpRequestResult =
  | { deliveryAttempted: boolean; ok: true }
  | { ok: false; reason: "not_configured" };

export type AdminAccountOtpVerificationResult =
  | {
      accountId: string;
      actorLabel: string;
      authUserId: string;
      ok: true;
      role: AdminAccountRole;
    }
  | {
      ok: false;
      reason: "invalid_code" | "not_configured";
    };

export type AdminAccountSessionRevalidationResult =
  | { ok: true }
  | { ok: false; reason: "invalid_session" | "not_configured" };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const otpPattern = /^\d{6}$/;
const placeholderPattern =
  /^(?:todo|tbd|none|null|undefined|placeholder|change[-_ ]?me|replace[-_ ]?me|example)$/i;

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function configuredValue(env: Env, name: string) {
  const value = env[name]?.trim() || "";
  return value && !placeholderPattern.test(value) ? value : "";
}

function normalizedEmail(value: unknown) {
  const email = text(value).toLowerCase();
  return email.length <= 254 && emailPattern.test(email) ? email : "";
}

function normalizedOtp(value: unknown) {
  const token = text(value);
  return otpPattern.test(token) ? token : "";
}

function safeRole(value: unknown): AdminAccountRole | null {
  return value === "admin" || value === "dispatcher" ? value : null;
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

function otpAuth(env: Env) {
  const url = configuredValue(env, "SUPABASE_URL");
  const key = configuredValue(env, "SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) return null;

  try {
    return createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    }).auth as OtpAuth;
  } catch {
    return null;
  }
}

function configuredClients(env: Env, client?: DbClient, auth?: OtpAuth) {
  if (!adminAccountAuthIsEnabled(env)) return null;
  const resolvedClient = client ?? serviceClient(env);
  const resolvedAuth = auth ?? otpAuth(env);
  return resolvedClient && resolvedAuth
    ? { auth: resolvedAuth, client: resolvedClient }
    : null;
}

function configuredAccountClient(env: Env, client?: DbClient) {
  if (!adminAccountAuthIsEnabled(env)) return null;
  return client ?? serviceClient(env);
}

export async function revalidateAdminAccountSession(input: {
  claims: AdminAccountSessionClaims;
  client?: DbClient;
  env?: Env;
}): Promise<AdminAccountSessionRevalidationResult> {
  const env = input.env ?? process.env;
  const client = configuredAccountClient(env, input.client);
  if (!client) return { ok: false, reason: "not_configured" };

  const { data, error } = await client
    .from("admin_access_accounts")
    .select("id, auth_user_id, account_role, account_status, safe_display_label")
    .eq("id", input.claims.accountId)
    .eq("auth_user_id", input.claims.authUserId)
    .eq("account_status", "active")
    .maybeSingle();
  const account = record(data);

  return !error &&
    text(account.id) === input.claims.accountId &&
    text(account.auth_user_id) === input.claims.authUserId &&
    safeRole(account.account_role) === input.claims.role &&
    text(account.safe_display_label) === input.claims.actorLabel
    ? { ok: true }
    : { ok: false, reason: "invalid_session" };
}

export async function requestAdminAccountOtp(input: {
  auth?: OtpAuth;
  client?: DbClient;
  email: unknown;
  env?: Env;
}): Promise<AdminAccountOtpRequestResult> {
  const env = input.env ?? process.env;
  const clients = configuredClients(env, input.client, input.auth);
  if (!clients) return { ok: false, reason: "not_configured" };

  const email = normalizedEmail(input.email);
  if (!email) return { deliveryAttempted: false, ok: true };

  const { data, error } = await clients.client
    .from("admin_access_accounts")
    .select("id")
    .eq("auth_email", email)
    .eq("account_status", "active")
    .maybeSingle();
  if (error || !uuidPattern.test(text(record(data).id))) {
    return { deliveryAttempted: false, ok: true };
  }

  const sent = await clients.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  return { deliveryAttempted: !sent.error, ok: true };
}

export async function verifyAdminAccountOtp(input: {
  auth?: OtpAuth;
  client?: DbClient;
  email: unknown;
  env?: Env;
  token: unknown;
}): Promise<AdminAccountOtpVerificationResult> {
  const env = input.env ?? process.env;
  const clients = configuredClients(env, input.client, input.auth);
  if (!clients) return { ok: false, reason: "not_configured" };

  const email = normalizedEmail(input.email);
  const token = normalizedOtp(input.token);
  if (!email || !token) return { ok: false, reason: "invalid_code" };

  const verified = await clients.auth.verifyOtp({ email, token, type: "email" });
  const authUserId = text(verified.data?.user?.id);
  if (verified.error || !uuidPattern.test(authUserId)) {
    return { ok: false, reason: "invalid_code" };
  }

  try {
    const { data, error } = await clients.client
      .from("admin_access_accounts")
      .select("id, auth_user_id, auth_email, account_role, account_status, safe_display_label")
      .eq("auth_user_id", authUserId)
      .eq("auth_email", email)
      .eq("account_status", "active")
      .maybeSingle();
    const account = record(data);
    const accountId = text(account.id);
    const role = safeRole(account.account_role);
    const actorLabel = text(account.safe_display_label);

    if (
      error ||
      !uuidPattern.test(accountId) ||
      text(account.auth_user_id) !== authUserId ||
      text(account.auth_email) !== email ||
      !role ||
      !actorLabel ||
      actorLabel.length > 160
    ) {
      return { ok: false, reason: "invalid_code" };
    }

    return { accountId, actorLabel, authUserId, ok: true, role };
  } finally {
    await clients.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}
