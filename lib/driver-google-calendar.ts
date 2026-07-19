import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { buildDriverJobGoogleCalendarEvent } from "./driver-job-calendar-event.ts";
import {
  hashDriverJobLinkToken,
  isDriverJobLinkExpiryOutsideAllowedWindow,
  isDriverJobLinkExpired,
} from "./driver-job-link.ts";
import { loadDriverJobPayloadThroughStatusPersistence } from "./driver-job-status-persistence.ts";

export const driverGoogleCalendarVersion = "driver-google-calendar-v1";
export const driverGoogleCalendarOauthCookieName = "prestige_driver_google_calendar_oauth";
export const driverGoogleCalendarScope = "https://www.googleapis.com/auth/calendar.events";

export type DriverGoogleCalendarStatus =
  | "cal_saved"
  | "save_to_calendar"
  | "update_calendar";

type EnvInput = Record<string, string | undefined>;
type Fetcher = typeof fetch;
type PersistenceClient = Pick<SupabaseClient, "from">;
type UnknownRecord = Record<string, unknown>;

type DriverGoogleCalendarConfig = {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  encryptionKey: Buffer;
  redirectUri: string;
  tokenUri: string;
};

type DriverCalendarContext = {
  driverId: number;
  event: ReturnType<typeof buildDriverJobGoogleCalendarEvent> & { ok: true };
  linkId: string;
  savedEventId: string;
  savedRevision: string;
};

type DriverGoogleCalendarFailureReason =
  | "expired"
  | "invalid_oauth"
  | "not_acknowledged"
  | "not_configured"
  | "provider_failed"
  | "revoked"
  | "unverified_driver"
  | "unauthorized";

type DriverGoogleCalendarHttpStatus = 400 | 401 | 403 | 409 | 410 | 502 | 503;

type DriverGoogleCalendarFailure = {
  ok: false;
  reason: DriverGoogleCalendarFailureReason;
  status: DriverGoogleCalendarHttpStatus;
};

export type DriverGoogleCalendarResult =
  | {
      action: "authorize";
      authorization_url: string;
      cookie_value: string;
      ok: true;
      status: "save_to_calendar";
    }
  | {
      action: "saved";
      ok: true;
      status: "cal_saved";
    }
  | {
      action: "status";
      connected: boolean;
      ok: true;
      status: DriverGoogleCalendarStatus;
    }
  | DriverGoogleCalendarFailure;

export type DriverGoogleCalendarOauthResult =
  | {
      driver_job_url: string;
      ok: true;
    }
  | {
      driver_job_url?: string;
      ok: false;
      reason: DriverGoogleCalendarFailureReason;
      status: 400 | 401 | 403 | 409 | 410 | 502 | 503;
    };

const defaultGoogleTokenUri = "https://oauth2.googleapis.com/token";
const defaultGoogleCalendarApiBaseUrl = "https://www.googleapis.com/calendar/v3";
const googleAuthorizationUri = "https://accounts.google.com/o/oauth2/v2/auth";
const oauthStateAad = "prestige-driver-google-calendar-oauth-state-v1";
const oauthStateLifetimeMs = 10 * 60 * 1000;
const providerTimeoutMs = 12_000;
const linkSelect =
  "id, booking_reference, driver_id, token_hash, link_status, expires_at, revoked_at, safe_link_context, google_calendar_event_id, google_calendar_revision, google_calendar_saved_at";

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function providerToken(value: unknown) {
  const token = text(value);

  return token.length >= 20 && token.length <= 4096 && !/\s/.test(token)
    ? token
    : "";
}

function positiveInteger(value: unknown) {
  const number = Number(value);

  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function envValue(env: EnvInput, name: string) {
  const value = env[name]?.trim();

  return value && value !== "..." && value !== "changeme" ? value : "";
}

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return Buffer.alloc(0);
  }
}

function readEncryptionKey(value: string) {
  const key = base64UrlDecode(value);

  return key.length === 32 ? key : null;
}

function readConfig(env: EnvInput = process.env): DriverGoogleCalendarConfig | null {
  if (envValue(env, "PRESTIGE_DRIVER_GOOGLE_CALENDAR_SYNC_ENABLED") !== "true") {
    return null;
  }

  const clientId = envValue(env, "PRESTIGE_DRIVER_GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = envValue(env, "PRESTIGE_DRIVER_GOOGLE_OAUTH_CLIENT_SECRET");
  const redirectUri = envValue(env, "PRESTIGE_DRIVER_GOOGLE_OAUTH_REDIRECT_URI");
  const encryptionKey = readEncryptionKey(
    envValue(env, "PRESTIGE_DRIVER_GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY"),
  );

  try {
    const redirectUrl = new URL(redirectUri);

    if (
      !clientId ||
      !clientSecret ||
      !encryptionKey ||
      !["http:", "https:"].includes(redirectUrl.protocol) ||
      redirectUrl.pathname !== "/api/driver-google-calendar-oauth/callback" ||
      redirectUrl.search ||
      redirectUrl.hash
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return {
    apiBaseUrl: (envValue(env, "PRESTIGE_DRIVER_GOOGLE_CALENDAR_API_BASE_URL") || defaultGoogleCalendarApiBaseUrl).replace(/\/+$/g, ""),
    clientId,
    clientSecret,
    encryptionKey,
    redirectUri,
    tokenUri: envValue(env, "PRESTIGE_DRIVER_GOOGLE_OAUTH_TOKEN_URI") || defaultGoogleTokenUri,
  };
}

export function getDriverGoogleCalendarReadiness(env: EnvInput = process.env) {
  return {
    enabled: envValue(env, "PRESTIGE_DRIVER_GOOGLE_CALENDAR_SYNC_ENABLED") === "true",
    ready: Boolean(readConfig(env)),
    version: driverGoogleCalendarVersion,
  };
}

function getClient(): PersistenceClient | null {
  const supabaseUrl = envValue(process.env, "SUPABASE_URL");
  const serviceRoleKey = envValue(process.env, "SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) return null;

  try {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  } catch {
    return null;
  }
}

function failure(
  reason: DriverGoogleCalendarFailureReason,
  status: DriverGoogleCalendarHttpStatus,
): DriverGoogleCalendarFailure {
  return { ok: false, reason, status };
}

function encrypt(value: string, key: Buffer, aad: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ["v1", base64UrlEncode(iv), base64UrlEncode(tag), base64UrlEncode(ciphertext)].join(".");
}

function decrypt(value: string, key: Buffer, aad: string) {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");

  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) return "";

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, base64UrlDecode(ivValue));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(base64UrlDecode(tagValue));
    return Buffer.concat([
      decipher.update(base64UrlDecode(ciphertextValue)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

function oauthCookieValue(state: string, key: Buffer) {
  return createHmac("sha256", key).update(state).digest("base64url");
}

export function verifyDriverGoogleCalendarOauthCookie(
  state: string,
  cookieValue: string,
  env: EnvInput = process.env,
) {
  const config = readConfig(env);

  if (!config) return false;

  const expected = Buffer.from(oauthCookieValue(state, config.encryptionKey));
  const actual = Buffer.from(text(cookieValue));

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function driverJobOrigin(config: DriverGoogleCalendarConfig) {
  return new URL(config.redirectUri).origin;
}

function driverJobUrl(config: DriverGoogleCalendarConfig, token: string) {
  return new URL(`/driver-job/${encodeURIComponent(token)}`, driverJobOrigin(config)).toString();
}

async function loadContext(
  token: string,
  config: DriverGoogleCalendarConfig,
  client: PersistenceClient,
): Promise<DriverCalendarContext | DriverGoogleCalendarFailure> {
  let tokenHash = "";

  try {
    tokenHash = hashDriverJobLinkToken(token);
  } catch {
    return failure("unauthorized", 401);
  }

  const { data, error } = await client
    .from("driver_job_links")
    .select(linkSelect)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) return failure("not_configured", 503);

  const link = asRecord(data);
  const linkId = text(link.id);
  const bookingReference = text(link.booking_reference);
  const driverId = positiveInteger(link.driver_id);
  const safeContext = asRecord(link.safe_link_context);
  const expiresAt = text(link.expires_at);

  if (!linkId || !bookingReference || text(link.token_hash) !== tokenHash) {
    return failure("unauthorized", 401);
  }

  if (text(link.link_status) === "revoked" || text(link.revoked_at)) {
    return failure("revoked", 403);
  }

  if (
    text(link.link_status) === "expired" ||
    isDriverJobLinkExpired(expiresAt) ||
    isDriverJobLinkExpiryOutsideAllowedWindow(expiresAt)
  ) {
    return failure("expired", 410);
  }

  if (!text(safeContext.driver_acknowledged_at)) {
    return failure("not_acknowledged", 409);
  }

  if (!driverId) return failure("unverified_driver", 409);

  const { data: bookingData, error: bookingError } = await client
    .from("bookings")
    .select("driver_id")
    .eq("booking_reference", bookingReference)
    .maybeSingle();
  const currentDriverId = positiveInteger(asRecord(bookingData).driver_id);

  if (bookingError) return failure("not_configured", 503);
  if (!currentDriverId || currentDriverId !== driverId) {
    return failure("unverified_driver", 409);
  }

  const payloadResult = await loadDriverJobPayloadThroughStatusPersistence({ client, token });

  if (!payloadResult.ok) {
    const reason = payloadResult.reason === "not_configured"
      ? "not_configured"
      : payloadResult.reason;
    return failure(reason, reason === "expired" ? 410 : reason === "revoked" ? 403 : 401);
  }

  const event = buildDriverJobGoogleCalendarEvent(
    payloadResult.payload,
    driverId,
    driverJobUrl(config, token),
  );

  if (!event.ok) return failure("not_configured", 503);

  return {
    driverId,
    event,
    linkId,
    savedEventId: text(link.google_calendar_event_id),
    savedRevision: text(link.google_calendar_revision),
  };
}

async function readConnection(client: PersistenceClient, driverId: number) {
  const { data, error } = await client
    .from("driver_google_calendar_connections")
    .select("driver_id, encrypted_refresh_token")
    .eq("driver_id", driverId)
    .maybeSingle();

  return error ? { error: true as const, row: null } : { error: false as const, row: asRecord(data) };
}

async function requestAccessToken(
  config: DriverGoogleCalendarConfig,
  refreshToken: string,
  fetcher: Fetcher,
) {
  const response = await fetcher(config.tokenUri, {
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal: AbortSignal.timeout(providerTimeoutMs),
  });
  const body = await response.json().catch(() => null) as UnknownRecord | null;
  const accessToken = providerToken(body?.access_token);

  return response.ok && accessToken ? accessToken : "";
}

async function writeGoogleEvent(
  config: DriverGoogleCalendarConfig,
  accessToken: string,
  context: DriverCalendarContext,
  client: PersistenceClient,
  fetcher: Fetcher,
) {
  const eventPath = `${config.apiBaseUrl}/calendars/primary/events/${encodeURIComponent(context.event.event.id)}?sendUpdates=none`;
  const request = (url: string, method: "POST" | "PUT") => fetcher(url, {
    body: JSON.stringify(context.event.event),
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    method,
    signal: AbortSignal.timeout(providerTimeoutMs),
  });
  let response = await request(eventPath, "PUT");

  if (response.status === 404) {
    response = await request(
      `${config.apiBaseUrl}/calendars/primary/events?sendUpdates=none`,
      "POST",
    );
  }

  if (!response.ok) return false;

  const { error } = await client
    .from("driver_job_links")
    .update({
      google_calendar_event_id: context.event.event.id,
      google_calendar_revision: context.event.revision,
      google_calendar_saved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", context.linkId)
    .eq("driver_id", context.driverId);

  return !error;
}

function buildAuthorization(
  config: DriverGoogleCalendarConfig,
  token: string,
  now = new Date(),
) {
  const verifier = base64UrlEncode(randomBytes(48));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = encrypt(JSON.stringify({
    exp: now.getTime() + oauthStateLifetimeMs,
    nonce: base64UrlEncode(randomBytes(24)),
    token,
    verifier,
  }), config.encryptionKey, oauthStateAad);
  const url = new URL(googleAuthorizationUri);

  url.searchParams.set("access_type", "offline");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", driverGoogleCalendarScope);
  url.searchParams.set("state", state);

  return {
    authorizationUrl: url.toString(),
    cookieValue: oauthCookieValue(state, config.encryptionKey),
  };
}

export async function readDriverGoogleCalendarStatus(
  token: string,
): Promise<DriverGoogleCalendarResult> {
  const config = readConfig();
  const client = getClient();

  if (!config || !client) return failure("not_configured", 503);

  const context = await loadContext(token, config, client);
  if ("ok" in context) return context;

  const connection = await readConnection(client, context.driverId);
  if (connection.error) return failure("not_configured", 503);

  const connected = Boolean(text(connection.row?.encrypted_refresh_token));
  const saved = connected &&
    context.savedEventId === context.event.event.id &&
    context.savedRevision === context.event.revision;

  return {
    action: "status",
    connected,
    ok: true,
    status: saved ? "cal_saved" : connected ? "update_calendar" : "save_to_calendar",
  };
}

export async function saveOrAuthorizeDriverGoogleCalendar(
  token: string,
  fetcher: Fetcher = fetch,
): Promise<DriverGoogleCalendarResult> {
  const config = readConfig();
  const client = getClient();

  if (!config || !client) return failure("not_configured", 503);

  const context = await loadContext(token, config, client);
  if ("ok" in context) return context;

  const connection = await readConnection(client, context.driverId);
  if (connection.error) return failure("not_configured", 503);

  const encryptedRefreshToken = text(connection.row?.encrypted_refresh_token);

  if (!encryptedRefreshToken) {
    const authorization = buildAuthorization(config, token);
    return {
      action: "authorize",
      authorization_url: authorization.authorizationUrl,
      cookie_value: authorization.cookieValue,
      ok: true,
      status: "save_to_calendar",
    };
  }

  const refreshToken = decrypt(
    encryptedRefreshToken,
    config.encryptionKey,
    `prestige-driver-google-calendar-refresh-token-v1:${context.driverId}`,
  );

  if (!refreshToken) return failure("invalid_oauth", 400);

  try {
    const accessToken = await requestAccessToken(config, refreshToken, fetcher);
    if (!accessToken) return failure("provider_failed", 502);
    const saved = await writeGoogleEvent(config, accessToken, context, client, fetcher);
    return saved
      ? { action: "saved", ok: true, status: "cal_saved" }
      : failure("provider_failed", 502);
  } catch {
    return failure("provider_failed", 502);
  }
}

function readOauthState(state: string, config: DriverGoogleCalendarConfig) {
  const decrypted = decrypt(state, config.encryptionKey, oauthStateAad);

  try {
    const payload = JSON.parse(decrypted) as UnknownRecord;
    const token = text(payload.token);
    const verifier = text(payload.verifier);
    const expiresAt = Number(payload.exp);

    return token && verifier && Number.isFinite(expiresAt) && expiresAt >= Date.now()
      ? { token, verifier }
      : null;
  } catch {
    return null;
  }
}

export async function completeDriverGoogleCalendarOauth(input: {
  code: string;
  cookieValue: string;
  state: string;
}, fetcher: Fetcher = fetch): Promise<DriverGoogleCalendarOauthResult> {
  const config = readConfig();
  const client = getClient();

  if (!config || !client) return { ok: false, reason: "not_configured", status: 503 };
  if (!verifyDriverGoogleCalendarOauthCookie(input.state, input.cookieValue)) {
    return { ok: false, reason: "invalid_oauth", status: 400 };
  }

  const oauthState = readOauthState(input.state, config);
  if (!oauthState) {
    return { ok: false, reason: "invalid_oauth", status: 400 };
  }

  const returnUrl = driverJobUrl(config, oauthState.token);

  if (!text(input.code)) {
    return {
      driver_job_url: returnUrl,
      ok: false,
      reason: "invalid_oauth",
      status: 400,
    };
  }

  const context = await loadContext(oauthState.token, config, client);

  if ("ok" in context) {
    return {
      driver_job_url: returnUrl,
      ok: false,
      reason: context.reason,
      status: context.status,
    };
  }

  try {
    const response = await fetcher(config.tokenUri, {
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: text(input.code),
        code_verifier: oauthState.verifier,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: AbortSignal.timeout(providerTimeoutMs),
    });
    const body = await response.json().catch(() => null) as UnknownRecord | null;
    const refreshToken = providerToken(body?.refresh_token);
    const accessToken = providerToken(body?.access_token);

    if (!response.ok || !refreshToken || !accessToken) {
      return { driver_job_url: returnUrl, ok: false, reason: "provider_failed", status: 502 };
    }

    const encryptedRefreshToken = encrypt(
      refreshToken,
      config.encryptionKey,
      `prestige-driver-google-calendar-refresh-token-v1:${context.driverId}`,
    );
    const { error } = await client
      .from("driver_google_calendar_connections")
      .upsert({
        driver_id: context.driverId,
        encrypted_refresh_token: encryptedRefreshToken,
        provider: "google_calendar",
        scope: driverGoogleCalendarScope,
        updated_at: new Date().toISOString(),
      }, { onConflict: "driver_id" });

    if (error) {
      return { driver_job_url: returnUrl, ok: false, reason: "not_configured", status: 503 };
    }

    const saved = await writeGoogleEvent(config, accessToken, context, client, fetcher);

    return saved
      ? { driver_job_url: returnUrl, ok: true }
      : { driver_job_url: returnUrl, ok: false, reason: "provider_failed", status: 502 };
  } catch {
    return { driver_job_url: returnUrl, ok: false, reason: "provider_failed", status: 502 };
  }
}
