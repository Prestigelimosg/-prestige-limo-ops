import "server-only";

import { createHash, createSign } from "node:crypto";

import {
  adminBookingCalendarTimezone,
  buildAdminBookingCalendarAgenda,
  type AdminBookingCalendarEventData,
} from "./admin-booking-calendar-event";
import type { AdminDispatcherBoundaryContext } from "./admin-dispatcher-auth-boundary";

export const adminBookingGoogleCalendarSyncVersion =
  "admin-booking-google-calendar-sync-v1";
export const adminBookingGoogleCalendarSyncEnvGateName =
  "PRESTIGE_ADMIN_GOOGLE_CALENDAR_SYNC_ENABLED";

const googleCalendarScope = "https://www.googleapis.com/auth/calendar.events";
const defaultGoogleTokenUri = "https://oauth2.googleapis.com/token";
const defaultGoogleCalendarApiBaseUrl =
  "https://www.googleapis.com/calendar/v3";
const maxGoogleProviderResponseBytes = 160000;
const base32HexAlphabet = "0123456789abcdefghijklmnopqrstuv";

const requiredEnvNames = [
  adminBookingGoogleCalendarSyncEnvGateName,
  "PRESTIGE_GOOGLE_CALENDAR_ID",
  "PRESTIGE_GOOGLE_CALENDAR_CLIENT_EMAIL",
  "PRESTIGE_GOOGLE_CALENDAR_PRIVATE_KEY",
] as const;

type EnvInput = Record<string, string | undefined>;
type Fetcher = typeof fetch;

type GoogleCalendarSyncConfig = {
  apiBaseUrl: string;
  calendarId: string;
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
};

export type AdminBookingGoogleCalendarSyncSummary = {
  calendar_provider: "google_calendar";
  connection_mode: "live_provider_sync";
  event_count: number;
  events_synced: number;
  external_provider_write_performed: true;
  live_calendar_provider: "google_calendar";
  live_calendar_write_performed: true;
  notification_delivery: "calendar_native_reminders_only";
  provider_connection: "connected";
  send_updates: "none";
  source_of_truth: "prestige_loaded_bookings";
  sync_method: "google_calendar_events_upsert";
  version: typeof adminBookingGoogleCalendarSyncVersion;
};

export type AdminBookingGoogleCalendarSyncReadiness = {
  enabled: boolean;
  ok: true;
  ready: boolean;
  reason: "sync_gate_closed" | "provider_not_configured" | "ready";
  required_env_names: readonly string[];
  version: typeof adminBookingGoogleCalendarSyncVersion;
};

export type AdminBookingGoogleCalendarSyncResult =
  | {
      data: {
        sync: AdminBookingGoogleCalendarSyncSummary;
      };
      ok: true;
    }
  | {
      error: string;
      ok: false;
      status: 400 | 403 | 502 | 503;
    };

type GoogleCalendarEventResource = {
  description: string;
  end: {
    dateTime: string;
    timeZone: typeof adminBookingCalendarTimezone;
  };
  extendedProperties: {
    private: {
      prestigeBookingReference: string;
      prestigeSource: "prestige_limo_ops";
    };
  };
  id: string;
  location: string;
  reminders: {
    overrides: [
      {
        method: "popup";
        minutes: 120;
      },
      {
        method: "popup";
        minutes: 30;
      },
    ];
    useDefault: false;
  };
  start: {
    dateTime: string;
    timeZone: typeof adminBookingCalendarTimezone;
  };
  summary: string;
};

const safeDisabledError =
  "Admin Google Calendar sync is not enabled on this server.";
const safeConfigError =
  "Admin Google Calendar sync configuration is not ready.";
const safeActorError =
  "Admin Google Calendar sync requires a verified admin or dispatcher server session.";
const safeProviderError =
  "Admin Google Calendar sync provider failed safely.";

function cleanEnvValue(env: EnvInput, key: string): string | null {
  const value = env[key]?.trim();

  return value && value !== "..." && value !== "changeme" ? value : null;
}

function isTruthyGate(value: string | null) {
  return value === "true" || value === "1" || value === "enabled";
}

function normalizePrivateKey(value: string) {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

function normalizeApiBaseUrl(value: string) {
  return value.replace(/\/+$/g, "");
}

function readGoogleCalendarSyncConfig(
  env: EnvInput,
): GoogleCalendarSyncConfig | null {
  const calendarId = cleanEnvValue(env, "PRESTIGE_GOOGLE_CALENDAR_ID");
  const clientEmail = cleanEnvValue(
    env,
    "PRESTIGE_GOOGLE_CALENDAR_CLIENT_EMAIL",
  );
  const privateKey = cleanEnvValue(
    env,
    "PRESTIGE_GOOGLE_CALENDAR_PRIVATE_KEY",
  );
  const tokenUri =
    cleanEnvValue(env, "PRESTIGE_GOOGLE_CALENDAR_TOKEN_URI") ||
    defaultGoogleTokenUri;
  const apiBaseUrl =
    cleanEnvValue(env, "PRESTIGE_GOOGLE_CALENDAR_API_BASE_URL") ||
    defaultGoogleCalendarApiBaseUrl;

  if (!calendarId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    apiBaseUrl: normalizeApiBaseUrl(apiBaseUrl),
    calendarId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
    tokenUri,
  };
}

export function getAdminBookingGoogleCalendarSyncReadiness(
  env: EnvInput = process.env,
): AdminBookingGoogleCalendarSyncReadiness {
  const enabled = isTruthyGate(
    cleanEnvValue(env, adminBookingGoogleCalendarSyncEnvGateName),
  );

  if (!enabled) {
    return {
      enabled: false,
      ok: true,
      ready: false,
      reason: "sync_gate_closed",
      required_env_names: requiredEnvNames,
      version: adminBookingGoogleCalendarSyncVersion,
    };
  }

  if (!readGoogleCalendarSyncConfig(env)) {
    return {
      enabled: true,
      ok: true,
      ready: false,
      reason: "provider_not_configured",
      required_env_names: requiredEnvNames,
      version: adminBookingGoogleCalendarSyncVersion,
    };
  }

  return {
    enabled: true,
    ok: true,
    ready: true,
    reason: "ready",
    required_env_names: requiredEnvNames,
    version: adminBookingGoogleCalendarSyncVersion,
  };
}

function validateActor(
  actor: AdminDispatcherBoundaryContext,
): AdminBookingGoogleCalendarSyncResult | null {
  if (
    actor.mode !== "server-session-role-surface" ||
    !["admin", "dispatcher"].includes(actor.role)
  ) {
    return {
      error: safeActorError,
      ok: false,
      status: 403,
    };
  }

  return null;
}

function providerFailure(): AdminBookingGoogleCalendarSyncResult {
  return {
    error: safeProviderError,
    ok: false,
    status: 502,
  };
}

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function buildServiceAccountJwt(config: GoogleCalendarSyncConfig, now: Date) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + 3600;
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const claimSet = {
    aud: config.tokenUri,
    exp: expiresAt,
    iat: issuedAt,
    iss: config.clientEmail,
    scope: googleCalendarScope,
  };
  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(claimSet),
  )}`;
  const signer = createSign("RSA-SHA256");

  signer.update(unsignedToken);
  signer.end();

  return `${unsignedToken}.${base64UrlEncode(signer.sign(config.privateKey))}`;
}

async function readProviderJson(response: Response) {
  const text = await response.text();

  if (text.length > maxGoogleProviderResponseBytes) {
    return null;
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function safeAccessToken(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const token = value.trim();

  return token.length >= 20 && token.length <= 4096 && !/\s/.test(token)
    ? token
    : null;
}

async function requestGoogleAccessToken(
  config: GoogleCalendarSyncConfig,
  fetcher: Fetcher,
  now: Date,
) {
  const body = new URLSearchParams({
    assertion: buildServiceAccountJwt(config, now),
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
  });

  const response = await fetcher(config.tokenUri, {
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    return null;
  }

  const json = await readProviderJson(response);

  return safeAccessToken(json?.access_token);
}

function base32HexFromBuffer(buffer: Buffer) {
  let bits = 0;
  let output = "";
  let value = 0;

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += base32HexAlphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += base32HexAlphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

function buildGoogleCalendarEventId(event: AdminBookingCalendarEventData) {
  const hash = createHash("sha256")
    .update(event.booking_reference.trim().toUpperCase())
    .digest();

  return `prestige${base32HexFromBuffer(hash).slice(0, 44)}`;
}

function buildGoogleCalendarEventResource(
  event: AdminBookingCalendarEventData,
): GoogleCalendarEventResource {
  return {
    description: event.description,
    end: {
      dateTime: event.ends_at_local,
      timeZone: adminBookingCalendarTimezone,
    },
    extendedProperties: {
      private: {
        prestigeBookingReference: event.booking_reference,
        prestigeSource: "prestige_limo_ops",
      },
    },
    id: buildGoogleCalendarEventId(event),
    location: event.location,
    reminders: {
      overrides: [
        {
          method: "popup",
          minutes: 120,
        },
        {
          method: "popup",
          minutes: 30,
        },
      ],
      useDefault: false,
    },
    start: {
      dateTime: event.starts_at_local,
      timeZone: adminBookingCalendarTimezone,
    },
    summary: event.title,
  };
}

function calendarEventsUrl(
  config: GoogleCalendarSyncConfig,
  eventId?: string,
) {
  const url = new URL(
    `${config.apiBaseUrl}/calendars/${encodeURIComponent(
      config.calendarId,
    )}/events${eventId ? `/${eventId}` : ""}`,
  );

  url.searchParams.set("sendUpdates", "none");

  return url;
}

async function upsertGoogleCalendarEvent(
  config: GoogleCalendarSyncConfig,
  fetcher: Fetcher,
  accessToken: string,
  event: AdminBookingCalendarEventData,
) {
  const eventResource = buildGoogleCalendarEventResource(event);
  const commonRequest = {
    body: JSON.stringify(eventResource),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  };
  const insertResponse = await fetcher(calendarEventsUrl(config), {
    ...commonRequest,
    method: "POST",
  });

  if (insertResponse.ok) {
    return true;
  }

  if (insertResponse.status !== 409) {
    return false;
  }

  const updateResponse = await fetcher(
    calendarEventsUrl(config, eventResource.id),
    {
      ...commonRequest,
      method: "PUT",
    },
  );

  return updateResponse.ok;
}

export async function syncAdminBookingCalendarAgendaToGoogle(
  input: unknown,
  actor: AdminDispatcherBoundaryContext,
  options: {
    env?: EnvInput;
    fetcher?: Fetcher;
    now?: Date;
  } = {},
): Promise<AdminBookingGoogleCalendarSyncResult> {
  const actorFailure = validateActor(actor);

  if (actorFailure) {
    return actorFailure;
  }

  const agendaResult = buildAdminBookingCalendarAgenda(input, {
    now: options.now,
  });

  if (!agendaResult.ok) {
    return agendaResult;
  }

  const env = options.env || process.env;
  const readiness = getAdminBookingGoogleCalendarSyncReadiness(env);

  if (!readiness.enabled) {
    return {
      error: safeDisabledError,
      ok: false,
      status: 503,
    };
  }

  const config = readGoogleCalendarSyncConfig(env);

  if (!readiness.ready || !config) {
    return {
      error: safeConfigError,
      ok: false,
      status: 503,
    };
  }

  const fetcher = options.fetcher || fetch;
  const accessToken = await requestGoogleAccessToken(
    config,
    fetcher,
    options.now || new Date(),
  );

  if (!accessToken) {
    return providerFailure();
  }

  let eventsSynced = 0;

  try {
    for (const event of agendaResult.data.agenda.calendar_events) {
      const synced = await upsertGoogleCalendarEvent(
        config,
        fetcher,
        accessToken,
        event,
      );

      if (!synced) {
        return providerFailure();
      }

      eventsSynced += 1;
    }
  } catch {
    return providerFailure();
  }

  return {
    data: {
      sync: {
        calendar_provider: "google_calendar",
        connection_mode: "live_provider_sync",
        event_count: agendaResult.data.agenda.event_count,
        events_synced: eventsSynced,
        external_provider_write_performed: true,
        live_calendar_provider: "google_calendar",
        live_calendar_write_performed: true,
        notification_delivery: "calendar_native_reminders_only",
        provider_connection: "connected",
        send_updates: "none",
        source_of_truth: "prestige_loaded_bookings",
        sync_method: "google_calendar_events_upsert",
        version: adminBookingGoogleCalendarSyncVersion,
      },
    },
    ok: true,
  };
}
