import "server-only";

export const customerLiveLocationMapScaffoldVersion =
  "customer-live-location-map-scaffold:v1";

type CustomerLiveLocationEnv = Record<string, string | undefined>;

const closedReason = "customer_live_location_map_scaffold_closed" as const;
const runtimeNotImplementedReason =
  "customer_live_location_map_runtime_not_implemented_safely" as const;
const customerSavedBookingsSessionCookieName =
  "prestige_customer_saved_bookings_session";
const customerSavedBookingsFallbackSessionCookieName =
  "prestige_customer_session";
const allowedRuntimeModes = new Set(["evidence", "runtime"]);
const safeCookieNamePattern = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,79}$/;

function enabled(value: string | undefined) {
  return value === "true";
}

function cleanMode(value: string | undefined) {
  return value?.trim().toLowerCase() || "closed";
}

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

function safeCookieName(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  const cleaned = String(value).trim();

  return safeCookieNamePattern.test(cleaned) ? cleaned : "";
}

function customerSessionCookieNames(env: CustomerLiveLocationEnv = process.env) {
  const configuredName = safeCookieName(
    env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME,
  );

  return configuredName
    ? [configuredName]
    : [
        customerSavedBookingsSessionCookieName,
        customerSavedBookingsFallbackSessionCookieName,
      ];
}

function parseCookieHeader(value: string | null) {
  const cookies = new Map<string, string[]>();

  if (!value) {
    return cookies;
  }

  for (const cookie of value.split(";")) {
    const trimmed = cookie.trim();
    const equalsIndex = trimmed.indexOf("=");
    const rawName = equalsIndex >= 0 ? trimmed.slice(0, equalsIndex).trim() : trimmed;
    const name = safeCookieName(rawName);

    if (!name) {
      continue;
    }

    const rawValue = equalsIndex >= 0 ? trimmed.slice(equalsIndex + 1) : "";
    let decodedValue = "";

    try {
      decodedValue = decodeURIComponent(rawValue).trim();
    } catch {
      decodedValue = rawValue.trim();
    }

    if (!decodedValue) {
      continue;
    }

    cookies.set(name, [...(cookies.get(name) || []), decodedValue]);
  }

  return cookies;
}

export function readCustomerLiveLocationMapSessionToken(
  request: Request,
  env: CustomerLiveLocationEnv = process.env,
) {
  const headerToken =
    request.headers.get("x-prestige-customer-session-token")?.trim() || "";

  if (headerToken) {
    return headerToken;
  }

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const cookieValues = customerSessionCookieNames(env).flatMap(
    (cookieName) => cookies.get(cookieName) || [],
  );

  return cookieValues.length === 1 ? cookieValues[0] : "";
}

export function readCustomerLiveLocationMapGateState(
  env: CustomerLiveLocationEnv = process.env,
) {
  const mode = cleanMode(env.PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_MODE);

  return {
    account_allowlist_configured: configured(
      env.PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ACCOUNT_ALLOWLIST,
    ),
    allowed_booking_references_configured: configured(
      env.PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ALLOWED_BOOKING_REFERENCES,
    ),
    allowed_service_codes_configured: configured(
      env.PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ALLOWED_SERVICE_CODES,
    ),
    browser_allowed_origins_configured: configured(
      env.PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_BROWSER_ALLOWED_ORIGINS,
    ),
    browser_map_id_configured: configured(
      env.PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_BROWSER_MAP_ID,
    ),
    browser_provider_configured: configured(
      env.PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_BROWSER_PROVIDER,
    ),
    live_map_gate_configured: enabled(
      env.PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ENABLED,
    ),
    mode,
    stale_after_seconds_configured: configured(
      env.PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_STALE_AFTER_SECONDS,
    ),
    window_minutes_before_pickup_configured: configured(
      env.PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_WINDOW_MINUTES_BEFORE_PICKUP,
    ),
  };
}

export function isCustomerLiveLocationMapRuntimeGateOpen(
  env: CustomerLiveLocationEnv = process.env,
) {
  const gateState = readCustomerLiveLocationMapGateState(env);

  return (
    gateState.live_map_gate_configured && allowedRuntimeModes.has(gateState.mode)
  );
}

export function isCustomerLiveLocationMapRuntimeCandidateOpen(
  env: CustomerLiveLocationEnv = process.env,
) {
  const driverLiveLocationMode = cleanMode(
    env.PRESTIGE_DRIVER_LIVE_LOCATION_MODE,
  );

  return (
    isCustomerLiveLocationMapRuntimeGateOpen(env) ||
    driverLiveLocationMode === "runtime"
  );
}

function closedBase(env?: CustomerLiveLocationEnv) {
  return {
    customerVisible: false,
    external_send: false,
    gate_state: readCustomerLiveLocationMapGateState(env),
    gpsCaptureEnabled: false,
    liveAccessEnabled: false,
    liveMapEnabled: false,
    locationStorageEnabled: false,
    map_rendered: false,
    marker_count: 0,
    no_op: true,
    reason: closedReason,
    result_label: "blocked/no-op",
    status: "blocked",
    version: customerLiveLocationMapScaffoldVersion,
  } as const;
}

export function buildCustomerLiveLocationMapScaffoldResponse({
  bookingReferencePresent,
  env,
  sessionPresent,
}: {
  bookingReferencePresent: boolean;
  env?: CustomerLiveLocationEnv;
  sessionPresent: boolean;
}) {
  return {
    ...closedBase(env),
    active_driver_marker: null,
    booking_reference_present: bookingReferencePresent,
    customer_surface: "customer_live_location_map_scaffold",
    session_present: sessionPresent,
  } as const;
}

export function buildCustomerLiveLocationMapRuntimeNotImplementedResponse({
  bookingReferencePresent,
  env,
  sessionPresent,
}: {
  bookingReferencePresent: boolean;
  env?: CustomerLiveLocationEnv;
  sessionPresent: boolean;
}) {
  return {
    ...buildCustomerLiveLocationMapScaffoldResponse({
      bookingReferencePresent,
      env,
      sessionPresent,
    }),
    reason: runtimeNotImplementedReason,
  } as const;
}

export function isCustomerLiveLocationMapRequestBoundaryPresent(
  request: Request,
) {
  const headers = request.headers;
  const purpose =
    headers.get("x-prestige-customer-purpose")?.trim().toLowerCase() || "";
  const sessionToken = readCustomerLiveLocationMapSessionToken(request);
  const origin = headers.get("origin")?.trim() || "";
  const referer = headers.get("referer")?.trim() || "";
  const requestOrigin = new URL(request.url).origin;
  const sameOrigin =
    origin === requestOrigin || Boolean(referer && referer.startsWith(requestOrigin));

  return {
    bookingReferencePresent: Boolean(
      new URL(request.url).searchParams.get("booking_reference")?.trim(),
    ),
    ok:
      purpose === "customer-live-location-map-read" &&
      Boolean(sessionToken) &&
      sameOrigin,
    sameOrigin,
    sessionPresent: Boolean(sessionToken),
  };
}
