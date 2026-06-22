import "server-only";

import type { AdminBookingResult } from "./admin-booking-persistence";
import type { AdminDispatcherBoundaryContext } from "./admin-dispatcher-auth-boundary";

export const adminMapLocationSearchVersion = "stage-admin-map-location-search-v2";

export type AdminMapLocationSearchProvider = "google_maps_geocoding" | "onemap_search";

export type AdminMapLocationSearchInput = {
  page: number;
  query: string;
  safe_route_context: {
    source: "admin_map_location_search";
  };
};

export type AdminMapLocationSearchResultItem = {
  address: string | null;
  block_no: string | null;
  building: string | null;
  label: string;
  latitude: number;
  longitude: number;
  postal: string | null;
  road_name: string | null;
};

export type AdminMapLocationSearchResult = {
  found: number;
  page: number;
  provider: AdminMapLocationSearchProvider;
  query: string;
  results: AdminMapLocationSearchResultItem[];
  safe_route_context: AdminMapLocationSearchInput["safe_route_context"] & {
    search_status: "loaded";
  };
  total_pages: number;
  version: typeof adminMapLocationSearchVersion;
};

type UnknownRecord = Record<string, unknown>;

const oneMapSearchEndpoint = "https://www.onemap.gov.sg/api/common/elastic/search";
const googleMapsGeocodingEndpoint = "https://maps.googleapis.com/maps/api/geocode/json";
const maxLocationSearchQueryLength = 160;
const maxLocationSearchResultTextLength = 260;
const maxOneMapSearchResponseBytes = 120000;
const maxSearchResults = 8;
const maxSearchPage = 50;
const singaporeLatitudeMin = 1.1;
const singaporeLatitudeMax = 1.5;
const singaporeLongitudeMin = 103.5;
const singaporeLongitudeMax = 104.2;
const safeMapLocationSearchDisabledError =
  "Admin map location search is not enabled on this server.";
const safeMapLocationSearchConfigError =
  "Admin map location search configuration is not ready.";
const safeMapLocationSearchActorError =
  "Admin map location search requires a verified admin or dispatcher server session.";
const safeMapLocationSearchProviderError =
  "Admin map location search provider failed safely.";
const forbiddenMapLocationSearchFragments = [
  "amount_due",
  "auth_link",
  "bank_account",
  "card_number",
  "contact_email",
  "contact_phone",
  "customer_auth",
  "customer_charge",
  "customer_email",
  "customer_phone",
  "customer_price",
  "dev_workbench",
  "driver_auth",
  "driver_payout",
  "email_send",
  "fare_amount",
  "finance",
  "finance_note",
  "full_invoice_number",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "invoice_number",
  "invoice_pdf",
  "live_location",
  "mock_archive",
  "mock_qa",
  "notification",
  "paid_amount",
  "passenger_email",
  "passenger_phone",
  "payment",
  "payment_link",
  "payment_status",
  "paynow",
  "pay_now",
  "pdf",
  "pdf_link",
  "payout",
  "payout_comparison",
  "proof",
  "photo",
  "quoted_price",
  "rate_amount",
  "raw_ai",
  "raw_parser_prompt",
  "service_role",
  "server_secret",
  "secret",
  "send_log",
  "send_state",
  "sms_send",
  "stripe",
  "telegram",
  "token",
  "whatsapp_send",
];

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

  const trimmed = String(value).trim();

  return trimmed ? trimmed : null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenMapLocationSearchFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenMapLocationSearchFragments.some((fragment) => normalized.includes(fragment));
}

function includesPrivateContactShape(value: string) {
  return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value) || /(?:\+?\d[\s-]?){8,}/.test(value);
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value)?.replace(/\s+/g, " ");

  if (
    !cleaned ||
    cleaned.length > maxLength ||
    includesForbiddenMapLocationSearchFragment(cleaned) ||
    includesPrivateContactShape(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

function optionalSafeProviderText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value)?.replace(/\s+/g, " ");

  if (!cleaned || cleaned.toUpperCase() === "NIL" || cleaned.toLowerCase() === "null") {
    return null;
  }

  if (
    cleaned.length > maxLength ||
    includesForbiddenMapLocationSearchFragment(cleaned) ||
    includesPrivateContactShape(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

function safePostal(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && /^\d{6}$/.test(cleaned) ? cleaned : null;
}

function safePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 && parsed <= maxSearchPage ? parsed : fallback;
}

function safeNonNegativeInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function safeFiniteCoordinate(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function validLatitude(value: unknown) {
  const parsed = safeFiniteCoordinate(value);

  return parsed !== null && parsed >= singaporeLatitudeMin && parsed <= singaporeLatitudeMax
    ? parsed
    : null;
}

function validLongitude(value: unknown) {
  const parsed = safeFiniteCoordinate(value);

  return parsed !== null && parsed >= singaporeLongitudeMin && parsed <= singaporeLongitudeMax
    ? parsed
    : null;
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function readOneMapToken() {
  return (
    configValueOrNull(process.env.PRESTIGE_ONEMAP_ACCESS_TOKEN) ||
    configValueOrNull(process.env.ONEMAP_ACCESS_TOKEN)
  );
}

function readGoogleMapsApiKey() {
  return configValueOrNull(process.env.PRESTIGE_GOOGLE_MAPS_API_KEY);
}

function selectedLocationSearchProvider(): AdminMapLocationSearchProvider | null {
  const provider = configValueOrNull(process.env.PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER);

  return provider === "onemap_search" || provider === "google_maps_geocoding"
    ? provider
    : null;
}

function readParamsValue(params: URLSearchParams, key: string) {
  const value = params.get(key);

  return value === null ? undefined : value;
}

function providerResponseFailure(): AdminBookingResult<AdminMapLocationSearchResult> {
  return {
    error: safeMapLocationSearchProviderError,
    ok: false,
    status: 502,
  };
}

function validateActor(
  actor: AdminDispatcherBoundaryContext,
): AdminBookingResult<null> {
  if (
    actor.mode !== "server-session-role-surface" ||
    !["admin", "dispatcher"].includes(actor.role) ||
    !safeText(actor.actorLabel, 160)
  ) {
    return {
      error: safeMapLocationSearchActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

export function parseAdminMapLocationSearchParams(
  params: URLSearchParams,
): AdminBookingResult<AdminMapLocationSearchInput> {
  const rawQuery =
    readParamsValue(params, "query") ||
    readParamsValue(params, "q") ||
    readParamsValue(params, "searchVal") ||
    readParamsValue(params, "location_query");
  const query = safeText(rawQuery, maxLocationSearchQueryLength);
  const page = safePositiveInteger(
    readParamsValue(params, "page") || readParamsValue(params, "pageNum"),
    1,
  );

  if (!query || (rawQuery && !query)) {
    return {
      error: "Admin map location search query is malformed.",
      ok: false,
      status: 400,
    };
  }

  if (
    (readParamsValue(params, "page") || readParamsValue(params, "pageNum")) &&
    page === 1 &&
    !["1", "01"].includes(
      String(readParamsValue(params, "page") || readParamsValue(params, "pageNum")),
    )
  ) {
    return {
      error: "Admin map location search page is malformed.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      page,
      query,
      safe_route_context: {
        source: "admin_map_location_search",
      },
    },
    ok: true,
  };
}

function normalizeGooglePostalCode(components: unknown) {
  for (const component of asArray(components)) {
    const record = asRecord(component);
    const types = asArray(record.types).map((type) => String(type));

    if (types.includes("postal_code")) {
      return safePostal(record.long_name ?? record.short_name);
    }
  }

  return null;
}

function normalizeGoogleLocationSearchItem(
  value: unknown,
): AdminMapLocationSearchResultItem | null {
  const record = asRecord(value);
  const geometry = asRecord(record.geometry);
  const location = asRecord(geometry.location);
  const latitude = validLatitude(location.lat);
  const longitude = validLongitude(location.lng);
  const address = optionalSafeProviderText(record.formatted_address, maxLocationSearchResultTextLength);

  if (latitude === null || longitude === null || !address) {
    return null;
  }

  return {
    address,
    block_no: null,
    building: null,
    label: address,
    latitude,
    longitude,
    postal: normalizeGooglePostalCode(record.address_components),
    road_name: null,
  };
}

function normalizeGoogleLocationSearch(
  input: AdminMapLocationSearchInput,
  value: unknown,
): AdminBookingResult<AdminMapLocationSearchResult> {
  const record = asRecord(value);

  if (record.status && record.status !== "OK" && record.status !== "ZERO_RESULTS") {
    return providerResponseFailure();
  }

  const rawResults = asArray(record.results);
  const results = rawResults
    .map(normalizeGoogleLocationSearchItem)
    .filter((result): result is AdminMapLocationSearchResultItem => Boolean(result))
    .slice(0, maxSearchResults);

  return {
    data: {
      found: results.length,
      page: input.page,
      provider: "google_maps_geocoding",
      query: input.query,
      results,
      safe_route_context: {
        ...input.safe_route_context,
        search_status: "loaded",
      },
      total_pages: results.length ? 1 : 0,
      version: adminMapLocationSearchVersion,
    },
    ok: true,
  };
}

function normalizeOneMapLocationSearchItem(
  value: unknown,
): AdminMapLocationSearchResultItem | null {
  const record = asRecord(value);
  const latitude = validLatitude(record.LATITUDE ?? record.latitude);
  const longitude = validLongitude(record.LONGITUDE ?? record.LONGTITUDE ?? record.longitude);
  const address = optionalSafeProviderText(record.ADDRESS ?? record.address, maxLocationSearchResultTextLength);
  const searchValue = optionalSafeProviderText(
    record.SEARCHVAL ?? record.searchval,
    maxLocationSearchResultTextLength,
  );
  const label = searchValue || address;

  if (latitude === null || longitude === null || !label) {
    return null;
  }

  return {
    address,
    block_no: optionalSafeProviderText(record.BLK_NO, 40),
    building: optionalSafeProviderText(record.BUILDING, 120),
    label,
    latitude,
    longitude,
    postal: safePostal(record.POSTAL ?? record.postal),
    road_name: optionalSafeProviderText(record.ROAD_NAME, 160),
  };
}

function normalizeOneMapLocationSearch(
  input: AdminMapLocationSearchInput,
  value: unknown,
): AdminBookingResult<AdminMapLocationSearchResult> {
  const record = asRecord(value);

  if (record.error) {
    return providerResponseFailure();
  }

  const rawResults = asArray(record.results);
  const found = safeNonNegativeInteger(record.found) ?? rawResults.length;
  const page = safePositiveInteger(record.pageNum, input.page);
  const totalPages = safeNonNegativeInteger(record.totalNumPages) ?? (rawResults.length ? page : 0);
  const results = rawResults
    .map(normalizeOneMapLocationSearchItem)
    .filter((result): result is AdminMapLocationSearchResultItem => Boolean(result))
    .slice(0, maxSearchResults);

  return {
    data: {
      found,
      page,
      provider: "onemap_search",
      query: input.query,
      results,
      safe_route_context: {
        ...input.safe_route_context,
        search_status: "loaded",
      },
      total_pages: totalPages,
      version: adminMapLocationSearchVersion,
    },
    ok: true,
  };
}

async function readProviderJson(response: Response) {
  const text = await response.text();

  if (text.length > maxOneMapSearchResponseBytes) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function searchAdminMapLocations(
  input: AdminMapLocationSearchInput,
  actor: AdminDispatcherBoundaryContext,
): Promise<AdminBookingResult<AdminMapLocationSearchResult>> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED !== "true") {
    return {
      error: safeMapLocationSearchDisabledError,
      ok: false,
      status: 503,
    };
  }

  const provider = selectedLocationSearchProvider();

  if (!provider) {
    return {
      error: safeMapLocationSearchConfigError,
      ok: false,
      status: 503,
    };
  }

  if (provider === "google_maps_geocoding") {
    const googleMapsApiKey = readGoogleMapsApiKey();

    if (!googleMapsApiKey) {
      return {
        error: safeMapLocationSearchConfigError,
        ok: false,
        status: 503,
      };
    }

    try {
      const url = new URL(
        configValueOrNull(process.env.PRESTIGE_GOOGLE_MAPS_SEARCH_ENDPOINT) ||
          googleMapsGeocodingEndpoint,
      );

      url.searchParams.set("address", input.query);
      url.searchParams.set("components", "country:SG");
      url.searchParams.set("region", "sg");
      url.searchParams.set("key", googleMapsApiKey);

      const response = await fetch(url, {
        method: "GET",
      });

      if (!response.ok) {
        return providerResponseFailure();
      }

      const providerJson = await readProviderJson(response);

      if (!providerJson) {
        return providerResponseFailure();
      }

      return normalizeGoogleLocationSearch(input, providerJson);
    } catch {
      return providerResponseFailure();
    }
  }

  const oneMapToken = readOneMapToken();

  if (!oneMapToken) {
    return {
      error: safeMapLocationSearchConfigError,
      ok: false,
      status: 503,
    };
  }

  try {
    const url = new URL(
      configValueOrNull(process.env.PRESTIGE_ONEMAP_SEARCH_ENDPOINT) ||
        oneMapSearchEndpoint,
    );

    url.searchParams.set("searchVal", input.query);
    url.searchParams.set("returnGeom", "Y");
    url.searchParams.set("getAddrDetails", "Y");
    url.searchParams.set("pageNum", String(input.page));

    const response = await fetch(url, {
      headers: {
        Authorization: oneMapToken,
      },
      method: "GET",
    });

    if (!response.ok) {
      return providerResponseFailure();
    }

    const providerJson = await readProviderJson(response);

    if (!providerJson) {
      return providerResponseFailure();
    }

    return normalizeOneMapLocationSearch(input, providerJson);
  } catch {
    return providerResponseFailure();
  }
}
