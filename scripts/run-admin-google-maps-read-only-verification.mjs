const approval = process.env.PRESTIGE_ADMIN_GOOGLE_MAPS_READ_ONLY_VERIFICATION_APPROVED;
const expectedApproval = "google-maps-admin-map-staging-read-only-approved";
const baseUrl = (
  process.env.PRESTIGE_STAGING_BASE_URL || "https://prestige-limo-ops-staging.vercel.app"
).replace(/\/+$/, "");
const sessionToken = process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN;

const forbiddenResponsePattern =
  /api[_ -]?key|secret|token|password|cookie|service_role|supabase|raw_google|raw_provider|headers|customer_price|quoted_price|driver_payout|paynow|payment|invoice|pdf|billing|customer_rates|driver_payout_rules|internal_admin|admin_note|parser|debug|saved-bookings|admin-saved-bookings/i;

function fail(reason, details = {}) {
  console.log(
    JSON.stringify(
      {
        details,
        ok: false,
        reason,
        result: "google_maps_read_only_verification_blocked",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

function safeHeaders() {
  if (!sessionToken) {
    fail("missing_admin_dispatcher_session_token");
  }

  return {
    referer: `${baseUrl}/`,
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": sessionToken,
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function assertNoUnsafePayload(value, label) {
  const text = JSON.stringify(value);

  if (forbiddenResponsePattern.test(text)) {
    fail("unsafe_response_payload", { label });
  }
}

function assertStatus(actual, expected, label) {
  if (actual !== expected) {
    fail("unexpected_http_status", { actual, expected, label });
  }
}

if (approval !== expectedApproval) {
  fail("missing_explicit_google_maps_read_only_approval");
}

const rootResponse = await fetch(`${baseUrl}/`, {
  method: "GET",
});
const rootText = await rootResponse.text();

assertStatus(rootResponse.status, 200, "staging root");

const publicBoundaryResponse = await fetch(
  `${baseUrl}/api/admin-map-location-search?query=Raffles%20Hotel%20Singapore&page=1`,
  {
    headers: {
      referer: `${baseUrl}/book`,
      "x-prestige-admin-purpose": "admin-booking-persistence",
    },
    method: "GET",
  },
);
const publicBoundaryBody = await readJson(publicBoundaryResponse);

assertStatus(publicBoundaryResponse.status, 403, "public/customer boundary");
assertNoUnsafePayload(publicBoundaryBody, "public/customer boundary");

const searchResponse = await fetch(
  `${baseUrl}/api/admin-map-location-search?query=Raffles%20Hotel%20Singapore&page=1`,
  {
    headers: safeHeaders(),
    method: "GET",
  },
);
const searchBody = await readJson(searchResponse);

assertStatus(searchResponse.status, 200, "Google Maps location search");
assertNoUnsafePayload(searchBody, "Google Maps location search");

const locationSearch = searchBody.location_search || {};

if (locationSearch.provider !== "google_maps_geocoding") {
  fail("unexpected_location_search_provider", {
    provider: locationSearch.provider || null,
  });
}

if (!Array.isArray(locationSearch.results) || locationSearch.results.length < 1) {
  fail("missing_location_search_result");
}

const routeResponse = await fetch(`${baseUrl}/api/admin-map-route-estimates`, {
  body: JSON.stringify({
    booking_reference: "GOOGLE-MAPS-STAGING-PUBLIC-LANDMARK-ONLY",
    destination: {
      label: "Changi Airport Terminal 2",
      latitude: 1.3554,
      longitude: 103.9896,
    },
    origin: {
      label: "Raffles Hotel Singapore",
      latitude: 1.295526,
      longitude: 103.854331,
    },
    route_type: "drive",
  }),
  headers: {
    ...safeHeaders(),
    "content-type": "application/json",
  },
  method: "POST",
});
const routeBody = await readJson(routeResponse);

assertStatus(routeResponse.status, 200, "Google Maps route estimate");
assertNoUnsafePayload(routeBody, "Google Maps route estimate");

const routeEstimate = routeBody.route_estimate || {};

if (routeEstimate.provider !== "google_maps_routes") {
  fail("unexpected_route_estimate_provider", {
    provider: routeEstimate.provider || null,
  });
}

if (
  !Number.isFinite(routeEstimate.distance_meters) ||
  !Number.isFinite(routeEstimate.duration_seconds)
) {
  fail("missing_route_estimate_distance_or_duration");
}

console.log(
  JSON.stringify(
    {
      customer_data_used: false,
      db_write: false,
      google_maps_called_through_guarded_routes: true,
      location_search: {
        found: locationSearch.found,
        provider: locationSearch.provider,
        result_count: locationSearch.results.length,
      },
      ok: true,
      provider_send: false,
      raw_provider_payload_exposed: false,
      route_estimate: {
        distance_meters: routeEstimate.distance_meters,
        duration_seconds: routeEstimate.duration_seconds,
        provider: routeEstimate.provider,
        route_type: routeEstimate.route_type,
      },
      root: {
        has_title: /<title>Prestige Limo Ops<\/title>/i.test(rootText),
        status: rootResponse.status,
      },
      secrets_exposed: false,
      result: "google_maps_read_only_verification_passed",
    },
    null,
    2,
  ),
);
