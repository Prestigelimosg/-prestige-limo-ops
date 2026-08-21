import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { adminAccountAuthIsEnabled } from "./admin-account-session.ts";
import type { AdminAccountSessionClaims } from "./admin-account-session.ts";

type AdminAccountRole = "admin" | "dispatcher";
type DbClient = Pick<SupabaseClient, "from" | "rpc">;
type Env = Record<string, string | undefined>;
type UnknownRecord = Record<string, unknown>;
type AuthUser = {
  email?: string | null;
  email_confirmed_at?: string | null;
  id?: string | null;
};
type PasswordAuth = {
  setSession: (input: {
    access_token: string;
    refresh_token: string;
  }) => Promise<{
    data: { session?: { user?: AuthUser | null } | null; user?: AuthUser | null } | null;
    error: unknown;
  }>;
  signInWithPassword: (input: {
    email: string;
    password: string;
  }) => Promise<{ data: { user?: AuthUser | null } | null; error: unknown }>;
  signOut: (options?: { scope?: "local" }) => Promise<unknown>;
  updateUser: (input: { password: string }) => Promise<{
    data: { user?: AuthUser | null } | null;
    error: unknown;
  }>;
};

export type AdminAccountPinSignInResult =
  | {
      accountId: string;
      actorLabel: string;
      authUserId: string;
      ok: true;
      role: AdminAccountRole;
    }
  | {
      ok: false;
      reason: "invalid_credentials" | "not_configured";
    };

export type AdminAccountPinRecoveryResult =
  | { ok: true }
  | { ok: false; reason: "invalid_recovery" | "not_configured" };

export type AdminAccountSessionRevalidationResult =
  | { ok: true }
  | { ok: false; reason: "invalid_session" | "not_configured" };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const adminPinPattern = /^\d{6}$/;
const adminAccountSignInEmail = "info@prestigelimo.sg";
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

function normalizedAdminPin(value: unknown) {
  const pin = text(value);
  return adminPinPattern.test(pin) ? pin : "";
}

function boundedRecoveryToken(value: unknown) {
  const token = typeof value === "string" ? value : "";
  return token.length > 0 && token.length <= 8192 ? token : "";
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

function passwordAuth(env: Env) {
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
    }).auth as PasswordAuth;
  } catch {
    return null;
  }
}

function configuredClients(env: Env, client?: DbClient, auth?: PasswordAuth) {
  if (!adminAccountAuthIsEnabled(env)) return null;
  const resolvedClient = client ?? serviceClient(env);
  const resolvedAuth = auth ?? passwordAuth(env);
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

export async function resetAdminAccountPinFromRecovery(input: {
  accessToken: unknown;
  auth?: PasswordAuth;
  client?: DbClient;
  env?: Env;
  pin: unknown;
  refreshToken: unknown;
}): Promise<AdminAccountPinRecoveryResult> {
  const env = input.env ?? process.env;
  const clients = configuredClients(env, input.client, input.auth);
  if (!clients) return { ok: false, reason: "not_configured" };

  const accessToken = boundedRecoveryToken(input.accessToken);
  const refreshToken = boundedRecoveryToken(input.refreshToken);
  const pin = normalizedAdminPin(input.pin);
  if (!accessToken || !refreshToken || !pin) {
    return { ok: false, reason: "invalid_recovery" };
  }

  const recovered = await clients.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  try {
    const recoveredUser = recovered.data?.user ?? recovered.data?.session?.user;
    const authUserId = text(recoveredUser?.id);
    if (
      recovered.error ||
      !uuidPattern.test(authUserId) ||
      text(recoveredUser?.email).toLowerCase() !== adminAccountSignInEmail ||
      !recoveredUser?.email_confirmed_at
    ) {
      return { ok: false, reason: "invalid_recovery" };
    }

    const { data, error } = await clients.client
      .from("admin_access_accounts")
      .select("id, auth_user_id, auth_email, account_role, account_status, safe_display_label")
      .eq("auth_user_id", authUserId)
      .eq("auth_email", adminAccountSignInEmail)
      .eq("account_role", "admin")
      .eq("account_status", "active")
      .maybeSingle();
    const account = record(data);
    if (
      error ||
      !uuidPattern.test(text(account.id)) ||
      text(account.auth_user_id) !== authUserId ||
      text(account.auth_email) !== adminAccountSignInEmail ||
      account.account_role !== "admin" ||
      account.account_status !== "active" ||
      text(account.safe_display_label) !== "Owner Admin"
    ) {
      return { ok: false, reason: "invalid_recovery" };
    }

    const updated = await clients.auth.updateUser({ password: pin });
    return !updated.error &&
      text(updated.data?.user?.id) === authUserId &&
      text(updated.data?.user?.email).toLowerCase() === adminAccountSignInEmail
      ? { ok: true }
      : { ok: false, reason: "invalid_recovery" };
  } finally {
    await clients.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}

export async function signInAdminAccountWithPin(input: {
  auth?: PasswordAuth;
  client?: DbClient;
  env?: Env;
  pin: unknown;
}): Promise<AdminAccountPinSignInResult> {
  const env = input.env ?? process.env;
  const clients = configuredClients(env, input.client, input.auth);
  if (!clients) return { ok: false, reason: "not_configured" };

  const pin = normalizedAdminPin(input.pin);
  if (!pin) return { ok: false, reason: "invalid_credentials" };

  const { data: expectedData, error: expectedError } = await clients.client
    .from("admin_access_accounts")
    .select("id, auth_user_id, auth_email, account_role, account_status, safe_display_label")
    .eq("auth_email", adminAccountSignInEmail)
    .eq("account_status", "active")
    .maybeSingle();
  const expected = record(expectedData);
  const expectedAuthUserId = text(expected.auth_user_id);
  if (
    expectedError ||
    !uuidPattern.test(text(expected.id)) ||
    !uuidPattern.test(expectedAuthUserId) ||
    text(expected.auth_email) !== adminAccountSignInEmail ||
    !safeRole(expected.account_role) ||
    !text(expected.safe_display_label)
  ) {
    return { ok: false, reason: "not_configured" };
  }

  const { data: reservationData, error: reservationError } = await clients.client
    .rpc("reserve_admin_auth_pin_attempt", { p_auth_user_id: expectedAuthUserId })
    .maybeSingle();
  const reservation = record(reservationData);
  if (reservationError || typeof reservation.attempt_allowed !== "boolean") {
    return { ok: false, reason: "not_configured" };
  }
  if (!reservation.attempt_allowed) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const signedIn = await clients.auth.signInWithPassword({
    email: adminAccountSignInEmail,
    password: pin,
  });
  try {
    const authUserId = text(signedIn.data?.user?.id);
    if (signedIn.error || authUserId !== expectedAuthUserId) {
      return { ok: false, reason: "invalid_credentials" };
    }

    const { data, error } = await clients.client
      .from("admin_access_accounts")
      .select("id, auth_user_id, auth_email, account_role, account_status, safe_display_label")
      .eq("auth_user_id", authUserId)
      .eq("auth_email", adminAccountSignInEmail)
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
      text(account.auth_email) !== adminAccountSignInEmail ||
      !role ||
      !actorLabel ||
      actorLabel.length > 160
    ) {
      return { ok: false, reason: "invalid_credentials" };
    }

    const { data: cleared, error: clearError } = await clients.client.rpc(
      "clear_admin_auth_pin_attempt",
      { p_auth_user_id: authUserId },
    );
    if (clearError || cleared !== true) {
      return { ok: false, reason: "not_configured" };
    }

    return { accountId, actorLabel, authUserId, ok: true, role };
  } finally {
    await clients.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}
