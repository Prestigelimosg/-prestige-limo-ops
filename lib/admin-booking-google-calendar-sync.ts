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
type PayoutReadClient = Pick<import("@supabase/supabase-js").SupabaseClient, "from">;
type CalendarSyncOptions = {
  env?: EnvInput;
  fetcher?: Fetcher;
  now?: Date;
  payoutClient?: PayoutReadClient;
};

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

type AdminBookingGoogleCalendarFailure = {
  error: string;
  ok: false;
  status: 400 | 403 | 502 | 503;
};

export type AdminBookingGoogleCalendarSyncResult =
  | {
      data: {
        sync: AdminBookingGoogleCalendarSyncSummary;
      };
      ok: true;
    }
  | AdminBookingGoogleCalendarFailure;

export type AdminBookingGoogleCalendarStatusValue =
  | "cal_saved"
  | "save_to_calendar"
  | "update_calendar";

export type AdminBookingGoogleCalendarStatus = {
  booking_reference: string;
  status: AdminBookingGoogleCalendarStatusValue;
  calendar_payout: string | null;
};

export type AdminBookingGoogleCalendarStatusResult =
  | {
      data: {
        statuses: AdminBookingGoogleCalendarStatus[];
      };
      ok: true;
    }
  | AdminBookingGoogleCalendarFailure;

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
      prestigePayoutInitialized?: "1";
      prestigeCalendarPayout?: string;
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
): AdminBookingGoogleCalendarFailure | null {
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

function providerFailure(): AdminBookingGoogleCalendarFailure {
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

// Only the amount immediately before the existing plate/title separator is editable.
// Other dollar signs (for example in a passenger name) are never payout evidence.
function calendarTitlePayout(summary: unknown) {
  if (typeof summary !== "string") return null;
  const match = summary.match(/^(?:(?:MIDNIGHT JOB - |CANCELLED - ))*([A-Za-z0-9][A-Za-z0-9 -]{0,39}?) \$(0|[1-9]\d{0,5})(\.\d{1,2})? > /);
  return match ? `$${match[2]}${match[3] || ""}` : null;
}

function calendarTitleWithoutPayout(summary: unknown) {
  if (typeof summary !== "string") return "";
  const payout = calendarTitlePayout(summary);
  return payout ? summary.replace(` ${payout} > `, " > ") : summary;
}

function calendarTitleWithPayout(summary: string, payout: string | null) {
  if (!payout || !/^(?:(?:MIDNIGHT JOB - |CANCELLED - ))*[A-Za-z0-9][A-Za-z0-9 -]{0,39} > /.test(summary)) {
    return summary;
  }
  return summary.replace(" > ", ` ${payout} > `);
}

function calendarEventIdentityMatches(value: Record<string, unknown>, expected: GoogleCalendarEventResource) {
  const properties = value.extendedProperties as { private?: Record<string, unknown> } | undefined;
  return value.id === expected.id &&
    properties?.private?.prestigeBookingReference === expected.extendedProperties.private.prestigeBookingReference &&
    properties?.private?.prestigeSource === "prestige_limo_ops";
}

// Best-effort READ ONLY. A missing rate/database must not disable the established Calendar sync.
// Resolve the existing default for this persisted booking, never its manual payout override.
async function readCalendarDefaultPayout(reference: string, options: CalendarSyncOptions): Promise<string | null> {
  try {
    const env = options.env || process.env;
    let client = options.payoutClient;
    if (!client) {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
      const { createClient } = await import("@supabase/supabase-js");
      const deadline = AbortSignal.timeout(3000);
      client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: deadline }) },
      });
    }
    const bookingResult = await client.from("bookings")
      .select("booking_reference, company_id, driver_id, service_type, route_type, pickup_at, vehicle_type_or_category, extra_stop_count, child_seat_required, child_seat_count")
      .eq("booking_reference", reference).maybeSingle();
    const booking = bookingResult.data;
    if (bookingResult.error || !booking || booking.booking_reference !== reference) return null;
    const type = String(booking.service_type || booking.route_type || "").toUpperCase();
    if (!["MNG", "DEP", "TRF", "DSP"].includes(type)) return null;
    const pickup = typeof booking.pickup_at === "string" && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(booking.pickup_at)
      ? new Date(booking.pickup_at) : null;
    if (!pickup || !Number.isFinite(pickup.getTime())) return null;
    const settingsResult = await client.from("rate_settings")
      .select("driver_payout_rules, midnight_payout, extra_stop_payout, child_seat_driver_payout")
      .eq("id", "default").maybeSingle();
    if (settingsResult.error) return null;
    const rateRecord = async (table: string, id: unknown): Promise<{ driver_payout_rules?: unknown }> => {
      if (id === null || id === undefined) return {};
      if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error("Invalid rate identity");
      const result = await client!.from(table).select("driver_payout_rules").eq("id", Number(id)).maybeSingle();
      if (result.error || !result.data) throw new Error("Rate read unavailable");
      return result.data;
    };
    const [company, driver] = await Promise.all([
      rateRecord("companies", booking.company_id), rateRecord("drivers", booking.driver_id),
    ]);
    const { resolvePricing, calculateProfit, initialRateSettings } = await import("./pricing");
    const { payoutRulesFromDb } = await import("./admin-rate-setup-read");
    const saved = settingsResult.data;
    const nonnegative = (value: unknown, fallback: number) => {
      if (value === null || value === undefined || value === "") return fallback;
      if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error("Invalid rate");
      return Number(value);
    };
    const settings = {
      ...initialRateSettings,
      driverPayoutRules: { ...initialRateSettings.driverPayoutRules, ...payoutRulesFromDb(saved?.driver_payout_rules) },
      midnightPayout: nonnegative(saved?.midnight_payout, saved ? 0 : initialRateSettings.midnightPayout),
      extraStopPayout: nonnegative(saved?.extra_stop_payout, initialRateSettings.extraStopPayout) || initialRateSettings.extraStopPayout,
      childSeatDriverPayout: nonnegative(saved?.child_seat_driver_payout, initialRateSettings.childSeatDriverPayout) || initialRateSettings.childSeatDriverPayout,
    };
    const pricing = resolvePricing({
      bookingType: type, vehicleType: booking.vehicle_type_or_category,
      time: new Intl.DateTimeFormat("en-GB", { timeZone: adminBookingCalendarTimezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(pickup),
      extraStopCount: booking.extra_stop_count,
      childSeatRequired: booking.child_seat_required, childSeatCount: booking.child_seat_count,
    }, { driver_payout_rules: payoutRulesFromDb(company.driver_payout_rules) }, null, settings,
      { driver_payout_rules: payoutRulesFromDb(driver.driver_payout_rules) });
    const amount = calculateProfit(pricing).driverPayout;
    if (!Number.isFinite(amount) || amount < 0 || amount > 999999.99) return null;
    return `$${Number(amount.toFixed(2))}`;
  } catch {
    return null;
  }
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

function calendarEventReadUrl(config: GoogleCalendarSyncConfig, eventId: string) {
  return new URL(
    `${config.apiBaseUrl}/calendars/${encodeURIComponent(
      config.calendarId,
    )}/events/${eventId}`,
  );
}

function calendarDateTimeMatches(
  providerValue: unknown,
  expectedValue: string,
  expectedTimeZone: typeof adminBookingCalendarTimezone,
) {
  if (providerValue === expectedValue) {
    return true;
  }

  if (typeof providerValue !== "string") {
    return false;
  }

  const expectedRfc3339 = /(?:Z|[+-]\d{2}:\d{2})$/i.test(expectedValue)
    ? expectedValue
    : expectedTimeZone === "Asia/Singapore"
      ? `${expectedValue}+08:00`
      : expectedValue;
  const providerInstant = Date.parse(providerValue);
  const expectedInstant = Date.parse(expectedRfc3339);

  return (
    Number.isFinite(providerInstant) &&
    Number.isFinite(expectedInstant) &&
    providerInstant === expectedInstant
  );
}

function calendarEventDescriptionMatches(providerValue: unknown, expectedValue: string) {
  if (providerValue === expectedValue) {
    return true;
  }

  if (typeof providerValue !== "string") {
    return false;
  }

  const providerLines = providerValue.split("\n");
  const expectedLines = expectedValue.split("\n");

  if (providerLines.length !== expectedLines.length) {
    return false;
  }

  const expectedPassengerLine = expectedLines.find((line) => line.startsWith("Passenger: "));
  const expectedPassenger = expectedPassengerLine?.slice("Passenger: ".length).trim() || "";

  return expectedLines.every((expectedLine, index) => {
    const providerLine = providerLines[index];

    if (providerLine === expectedLine) {
      return true;
    }

    return Boolean(
      expectedPassenger &&
        expectedLine.startsWith("Customer: ") &&
        providerLine === `${expectedLine} [${expectedPassenger}]`,
    );
  });
}

function providerEventMatchesExpected(
  value: Record<string, unknown>,
  expected: GoogleCalendarEventResource,
) {
  const start =
    value.start && typeof value.start === "object"
      ? (value.start as Record<string, unknown>)
      : null;
  const end =
    value.end && typeof value.end === "object"
      ? (value.end as Record<string, unknown>)
      : null;
  const extendedProperties =
    value.extendedProperties && typeof value.extendedProperties === "object"
      ? (value.extendedProperties as Record<string, unknown>)
      : null;
  const privateProperties =
    extendedProperties?.private && typeof extendedProperties.private === "object"
      ? (extendedProperties.private as Record<string, unknown>)
      : null;
  const reminders =
    value.reminders && typeof value.reminders === "object"
      ? (value.reminders as Record<string, unknown>)
      : null;
  const reminderOverrides = Array.isArray(reminders?.overrides)
    ? reminders.overrides
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object",
        )
        .map((item) => `${String(item.method || "")}:${Number(item.minutes)}`)
        .sort()
    : [];
  const expectedReminderOverrides = expected.reminders.overrides
    .map((item) => `${item.method}:${item.minutes}`)
    .sort();

  return (
    value.id === expected.id &&
    calendarTitleWithoutPayout(value.summary) === expected.summary &&
    calendarEventDescriptionMatches(value.description, expected.description) &&
    value.location === expected.location &&
    calendarDateTimeMatches(
      start?.dateTime,
      expected.start.dateTime,
      expected.start.timeZone,
    ) &&
    start?.timeZone === expected.start.timeZone &&
    calendarDateTimeMatches(
      end?.dateTime,
      expected.end.dateTime,
      expected.end.timeZone,
    ) &&
    end?.timeZone === expected.end.timeZone &&
    privateProperties?.prestigeBookingReference ===
      expected.extendedProperties.private.prestigeBookingReference &&
    privateProperties?.prestigeSource === expected.extendedProperties.private.prestigeSource &&
    reminders?.useDefault === false &&
    JSON.stringify(reminderOverrides) === JSON.stringify(expectedReminderOverrides)
  );
}

async function readGoogleCalendarEventStatus(
  config: GoogleCalendarSyncConfig,
  fetcher: Fetcher,
  accessToken: string,
  event: AdminBookingCalendarEventData,
): Promise<AdminBookingGoogleCalendarStatus | null> {
  const expected = buildGoogleCalendarEventResource(event);
  const response = await fetcher(calendarEventReadUrl(config, expected.id), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    method: "GET",
  });

  if (response.status === 404) {
    return {
      booking_reference: event.booking_reference,
      status: "save_to_calendar",
      calendar_payout: null,
    };
  }

  if (!response.ok) {
    return null;
  }

  const providerEvent = await readProviderJson(response);

  if (!providerEvent) {
    return null;
  }

  return {
    booking_reference: event.booking_reference,
    calendar_payout: calendarEventIdentityMatches(providerEvent, expected)
      ? calendarTitlePayout(providerEvent.summary) : null,
    status: providerEventMatchesExpected(providerEvent, expected)
      ? "cal_saved"
      : "update_calendar",
  };
}

async function upsertGoogleCalendarEvent(
  config: GoogleCalendarSyncConfig,
  fetcher: Fetcher,
  accessToken: string,
  event: AdminBookingCalendarEventData,
  options: CalendarSyncOptions,
) {
  const eventResource = buildGoogleCalendarEventResource(event);
  let defaultPayout: string | null | undefined;
  const getDefault = async () => {
    if (defaultPayout === undefined) defaultPayout = await readCalendarDefaultPayout(event.booking_reference, options);
    return defaultPayout;
  };
  const hasPlate = calendarTitleWithPayout(event.title, "$0") !== event.title;
  // Keep the established insert/conflict/update sequence and deterministic event ID.
  // Do not read rates for titles without a plate; ACK can seed it when a plate is saved.
  const initialPayout = hasPlate ? await getDefault() : null;
  eventResource.summary = calendarTitleWithPayout(event.title, initialPayout);
  if (initialPayout) eventResource.extendedProperties.private.prestigePayoutInitialized = "1";
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const insertResponse = await fetcher(calendarEventsUrl(config), {
    body: JSON.stringify(eventResource), headers, method: "POST",
  });
  if (insertResponse.ok) return true;
  if (insertResponse.status !== 409) return false;

  // Read before replacing an existing event so an Admin's Calendar amount survives.
  // A concurrent edit yields 412 rather than being overwritten; no blind retry here.
  const currentResponse = await fetcher(calendarEventReadUrl(config, eventResource.id), {
    headers: { Authorization: `Bearer ${accessToken}` }, method: "GET", cache: "no-store",
  });
  if (!currentResponse.ok) return false;
  const current = await readProviderJson(currentResponse);
  if (!current || !calendarEventIdentityMatches(current, eventResource) ||
      typeof current.etag !== "string" || !current.etag || current.status === "cancelled") return false;
  const currentPayout = calendarTitlePayout(current.summary);
  const properties = current.extendedProperties as { private?: Record<string, unknown> };
  const initialized = properties.private?.prestigePayoutInitialized === "1";
  const prefix = typeof current.summary === "string" ? current.summary.split(" > ")[0] : "";
  if (!currentPayout && prefix.includes("$")) return false;
  // Deliberate removal after initialization stays removed. A valid manual amount wins even on legacy events.
  const previousHadPlate = typeof current.summary === "string" && calendarTitleWithPayout(calendarTitleWithoutPayout(current.summary), "$0") !== calendarTitleWithoutPayout(current.summary);
  const carried = !previousHadPlate && typeof properties.private?.prestigeCalendarPayout === "string" &&
    /^\$(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(properties.private.prestigeCalendarPayout)
      ? properties.private.prestigeCalendarPayout : null;
  const payout = currentPayout || carried || (initialized ? null : initialPayout);
  if (payout && !hasPlate) eventResource.extendedProperties.private.prestigeCalendarPayout = payout;
  eventResource.summary = calendarTitleWithPayout(event.title, payout);
  if (initialized || currentPayout || (hasPlate && payout)) {
    eventResource.extendedProperties.private.prestigePayoutInitialized = "1";
  } else {
    delete eventResource.extendedProperties.private.prestigePayoutInitialized;
  }
  const updateResponse = await fetcher(calendarEventsUrl(config, eventResource.id), {
    body: JSON.stringify(eventResource),
    headers: { ...headers, "If-Match": current.etag }, method: "PUT",
  });
  return updateResponse.ok;
}

export async function syncAdminBookingCalendarAgendaToGoogle(
  input: unknown,
  actor: AdminDispatcherBoundaryContext,
  options: CalendarSyncOptions = {},
): Promise<AdminBookingGoogleCalendarSyncResult> {
  const actorFailure = validateActor(actor);

  if (actorFailure) {
    return actorFailure;
  }

  return syncValidatedAdminBookingCalendarAgendaToGoogle(input, options);
}

export async function syncVerifiedDriverDetailsToAdminBookingCalendar(
  input: unknown,
  options: CalendarSyncOptions = {},
): Promise<AdminBookingGoogleCalendarSyncResult> {
  return syncValidatedAdminBookingCalendarAgendaToGoogle(input, options);
}

async function syncValidatedAdminBookingCalendarAgendaToGoogle(
  input: unknown,
  options: CalendarSyncOptions,
): Promise<AdminBookingGoogleCalendarSyncResult> {
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
        options,
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

export async function readAdminBookingCalendarStatusesFromGoogle(
  input: unknown,
  actor: AdminDispatcherBoundaryContext,
  options: CalendarSyncOptions = {},
): Promise<AdminBookingGoogleCalendarStatusResult> {
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

  try {
    const statuses = await Promise.all(
      agendaResult.data.agenda.calendar_events.map((event) =>
        readGoogleCalendarEventStatus(config, fetcher, accessToken, event),
      ),
    );

    if (statuses.some((status) => status === null)) {
      return providerFailure();
    }

    return {
      data: {
        statuses: statuses as AdminBookingGoogleCalendarStatus[],
      },
      ok: true,
    };
  } catch {
    return providerFailure();
  }
}
