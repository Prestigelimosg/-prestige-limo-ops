import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const scaffoldPath = "lib/customer-live-location-map-scaffold.ts";
const portalAccessLinkPath = "lib/customer-portal-access-link.ts";
const runtimeSessionMapPath = "lib/customer-runtime-session-map.ts";
const runtimePath = "lib/customer-live-location-map-runtime.ts";

function transpileRuntimeModule(source, replacements = []) {
  let transformed = source.replace(/^import "server-only";\n\n/m, "");

  for (const [pattern, replacement] of replacements) {
    transformed = transformed.replace(pattern, replacement);
  }

  transformed = transformed.replace(
    /^import \{ createClient, type SupabaseClient \} from "@supabase\/supabase-js";\n\n/m,
    'const createClient = () => { throw new Error("unexpected real Supabase client in test"); };\n\n',
  );

  return ts.transpileModule(transformed, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

async function writeRuntimeHarness() {
  const tempDir = await mkdtemp(join(tmpdir(), "prestige-customer-live-location-runtime-"));
  const [scaffold, portalAccessLink, runtimeSessionMap, runtime] = await Promise.all([
    readFile(scaffoldPath, "utf8"),
    readFile(portalAccessLinkPath, "utf8"),
    readFile(runtimeSessionMapPath, "utf8"),
    readFile(runtimePath, "utf8"),
  ]);

  await Promise.all([
    writeFile(
      join(tempDir, "customer-live-location-map-scaffold.mjs"),
      transpileRuntimeModule(scaffold),
    ),
    writeFile(
      join(tempDir, "customer-portal-access-link.mjs"),
      transpileRuntimeModule(portalAccessLink),
    ),
    writeFile(
      join(tempDir, "customer-runtime-session-map.mjs"),
      transpileRuntimeModule(runtimeSessionMap),
    ),
    writeFile(
      join(tempDir, "customer-live-location-map-runtime.mjs"),
      transpileRuntimeModule(runtime, [
        [
          /from "\.\/customer-live-location-map-scaffold";/g,
          'from "./customer-live-location-map-scaffold.mjs";',
        ],
        [
          /from "\.\/customer-portal-access-link";/g,
          'from "./customer-portal-access-link.mjs";',
        ],
        [
          /from "\.\/customer-runtime-session-map";/g,
          'from "./customer-runtime-session-map.mjs";',
        ],
      ]),
    ),
  ]);

  return tempDir;
}

function createQueryClient({
  accessRows = [],
  bookingRows = [],
  latestRows = [],
  settingRow = null,
} = {}) {
  const calls = [];

  function filteredRows(rows, filters) {
    return rows.filter((row) =>
      filters.every(([key, value]) => String(row[key] ?? "") === String(value)),
    );
  }

  return {
    calls,
    from(table) {
      const query = {
        filters: [],
        inFilters: [],
        orderSpec: null,
        table,
      };
      const builder = {
        eq(key, value) {
          query.filters.push([key, value]);
          return builder;
        },
        in(key, values) {
          query.inFilters.push([key, values]);
          return builder;
        },
        limit(count) {
          calls.push({ ...query, count, method: "limit" });

          if (table === "customer_access_accounts") {
            return Promise.resolve({
              data: filteredRows(accessRows, query.filters).slice(0, count),
              error: null,
            });
          }

          if (table === "bookings") {
            return Promise.resolve({
              data: filteredRows(bookingRows, query.filters).slice(0, count),
              error: null,
            });
          }

          if (table === "driver_live_location_latest_positions") {
            const rows = filteredRows(latestRows, query.filters)
              .filter((row) =>
                query.inFilters.every(([key, values]) => values.includes(row[key])),
              )
              .slice(0, count);

            return Promise.resolve({ data: rows, error: null });
          }

          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle() {
          calls.push({ ...query, method: "maybeSingle" });

          if (table === "driver_live_location_runtime_settings") {
            return Promise.resolve({ data: settingRow, error: null });
          }

          return Promise.resolve({ data: null, error: null });
        },
        order(key, spec) {
          query.orderSpec = [key, spec];
          return builder;
        },
        select(columns) {
          query.columns = columns;
          return builder;
        },
      };

      return builder;
    },
  };
}

function baseSetting({ adminMapOpen = true, bookingReference, open = true }) {
  return {
    admin_active_jobs_map_enabled: adminMapOpen,
    driver_live_location_allowed_job_references: [bookingReference],
    driver_live_location_capture_enabled: open,
    driver_live_location_mode: "runtime",
    driver_live_location_stale_after_seconds: 300,
    setting_name: "driver_live_location_runtime",
    setting_status: open ? "active" : "closed",
  };
}

function baseEnv({ accountReference, authUserId, sessionToken }) {
  return {
    PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST: accountReference,
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED: "true",
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE: "server-session-token",
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID: authUserId,
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN: sessionToken,
    PRESTIGE_DRIVER_LIVE_LOCATION_MODE: "runtime",
  };
}

function customerRequest({ bookingReference, origin, sessionToken }) {
  return new Request(
    `${origin}/api/customer-live-location-map?booking_reference=${encodeURIComponent(
      bookingReference,
    )}`,
    {
      headers: {
        origin,
        referer: `${origin}/my-bookings`,
        "x-prestige-customer-purpose": "customer-live-location-map-read",
        "x-prestige-customer-session-token": sessionToken,
      },
    },
  );
}

const tempDir = await writeRuntimeHarness();
const originalPortalAccessEnv = {
  PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ACCOUNT_ALLOWLIST:
    process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ACCOUNT_ALLOWLIST,
  PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED:
    process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED,
  PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET:
    process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET,
};

try {
  const {
    handleCustomerLiveLocationMapRuntimeRequest,
    setCustomerLiveLocationMapRuntimeClientForTests,
  } = await import(join(tempDir, "customer-live-location-map-runtime.mjs"));
  const { createCustomerPortalAccessLinkToken } = await import(
    join(tempDir, "customer-portal-access-link.mjs")
  );

  const origin = "https://app.prestigelimo.sg";
  const bookingReference = "DLG-20260625-LIVE";
  const accountReference = "PILOT-ACCOUNT-1";
  const authUserId = "11111111-1111-4111-8111-111111111111";
  const sessionToken = "customer-session-token-20260625-live-map";
  const boundary = {
    bookingReferencePresent: true,
    ok: true,
    sameOrigin: true,
    sessionPresent: true,
  };
  const safeLatestPosition = {
    accuracy_meters: 8,
    booking_reference: bookingReference,
    captured_at: new Date(Date.now() - 10_000).toISOString(),
    heading_degrees: 90,
    latitude: 1.2831,
    longitude: 103.8601,
    sharing_state: "active",
    speed_meters_per_second: 0,
    stale_after: new Date(Date.now() + 120_000).toISOString(),
    updated_at: new Date(Date.now() - 5_000).toISOString(),
  };

  const client = createQueryClient({
    accessRows: [
      {
        account_status: "active",
        auth_user_id: authUserId,
        customer_account_reference: accountReference,
      },
    ],
    bookingRows: [
      {
        booking_reference: bookingReference,
        customer_id: accountReference,
        route_type: "DEP",
        service_type: "Departure",
      },
    ],
    latestRows: [safeLatestPosition],
    settingRow: baseSetting({ bookingReference }),
  });
  setCustomerLiveLocationMapRuntimeClientForTests(client);

  const success = await handleCustomerLiveLocationMapRuntimeRequest({
    boundary,
    env: baseEnv({ accountReference, authUserId, sessionToken }),
    request: customerRequest({ bookingReference, origin, sessionToken }),
  });

  assert.equal(success.status, 200, "correct customer must read live map safely.");
  assert.equal(success.body.ok, true);
  assert.equal(success.body.marker_count, 1);
  assert.equal(success.body.customerVisible, true);
  assert.equal(success.body.external_send, false);
  assert.equal(success.body.gpsCaptureEnabled, false);
  assert.equal(success.body.locationStorageEnabled, false);
  assert.equal(success.body.booking_reference_label, "scoped");
  assert.equal(success.body.active_driver_marker.booking_reference_label, "scoped");
  assert.equal(success.body.active_driver_marker.driver_location_status, "live");
  assert.equal("driver_job_link_id" in success.body.active_driver_marker, false);
  assert.equal("raw_driver_token" in success.body.active_driver_marker, false);
  assert.equal("customer_price" in success.body.active_driver_marker, false);

  const wrongCustomerClient = createQueryClient({
    accessRows: [
      {
        account_status: "active",
        auth_user_id: authUserId,
        customer_account_reference: "PILOT-ACCOUNT-2",
      },
    ],
    bookingRows: [],
    latestRows: [safeLatestPosition],
    settingRow: baseSetting({ bookingReference }),
  });
  setCustomerLiveLocationMapRuntimeClientForTests(wrongCustomerClient);

  const wrongCustomer = await handleCustomerLiveLocationMapRuntimeRequest({
    boundary,
    env: baseEnv({ accountReference, authUserId, sessionToken }),
    request: customerRequest({ bookingReference, origin, sessionToken }),
  });

  assert.equal(wrongCustomer.status, 403);
  assert.equal(wrongCustomer.body.reason, "customer_live_location_map_customer_auth_blocked");
  assert.equal(wrongCustomer.body.customerVisible, false);

  const arrivalServiceClient = createQueryClient({
    accessRows: [
      {
        account_status: "active",
        auth_user_id: authUserId,
        customer_account_reference: accountReference,
      },
    ],
    bookingRows: [
      {
        booking_reference: bookingReference,
        customer_id: accountReference,
        route_type: "ARR",
        service_type: "Arrival",
      },
    ],
    latestRows: [safeLatestPosition],
    settingRow: baseSetting({ bookingReference }),
  });
  setCustomerLiveLocationMapRuntimeClientForTests(arrivalServiceClient);

  const arrivalService = await handleCustomerLiveLocationMapRuntimeRequest({
    boundary,
    env: baseEnv({ accountReference, authUserId, sessionToken }),
    request: customerRequest({ bookingReference, origin, sessionToken }),
  });

  assert.equal(arrivalService.status, 200);
  assert.equal(arrivalService.body.ok, true);
  assert.equal(arrivalService.body.marker_count, 1);
  assert.equal(arrivalService.body.customerVisible, true);

  process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED = "true";
  process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET =
    "customer-portal-access-link-secret-20260706";
  process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ACCOUNT_ALLOWLIST =
    accountReference;
  const portalTokenResult = createCustomerPortalAccessLinkToken(accountReference, {
    linkRevision: "2026-07-06T00:00:00.000Z",
    scope: "portal_account",
  });

  assert.equal(portalTokenResult.ok, true, "portal access token must be created for guard.");

  const portalAccessClient = createQueryClient({
    bookingRows: [
      {
        booking_reference: bookingReference,
        customer_id: accountReference,
        route_type: "MNG",
        service_type: "Arrival",
      },
    ],
    latestRows: [safeLatestPosition],
    settingRow: baseSetting({ bookingReference, open: false }),
  });
  setCustomerLiveLocationMapRuntimeClientForTests(portalAccessClient);

  const portalAccessRead = await handleCustomerLiveLocationMapRuntimeRequest({
    boundary,
    env: {
      PRESTIGE_DRIVER_LIVE_LOCATION_MODE: "runtime",
      PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST: "DIFFERENT-PILOT-ACCOUNT",
    },
    request: customerRequest({
      bookingReference,
      origin,
      sessionToken: portalTokenResult.data.token,
    }),
  });

  assert.equal(portalAccessRead.status, 200);
  assert.equal(portalAccessRead.body.ok, true);
  assert.equal(portalAccessRead.body.marker_count, 1);
  assert.equal(portalAccessRead.body.customerVisible, true);

  const customerReadWithoutAdminMapClient = createQueryClient({
    accessRows: [
      {
        account_status: "active",
        auth_user_id: authUserId,
        customer_account_reference: accountReference,
      },
    ],
    bookingRows: [
      {
        booking_reference: bookingReference,
        customer_id: accountReference,
        route_type: "MNG",
        service_type: "Arrival",
      },
    ],
    latestRows: [safeLatestPosition],
    settingRow: baseSetting({ adminMapOpen: false, bookingReference }),
  });
  setCustomerLiveLocationMapRuntimeClientForTests(customerReadWithoutAdminMapClient);

  const customerReadWithoutAdminMap = await handleCustomerLiveLocationMapRuntimeRequest({
    boundary,
    env: baseEnv({ accountReference, authUserId, sessionToken }),
    request: customerRequest({ bookingReference, origin, sessionToken }),
  });

  assert.equal(customerReadWithoutAdminMap.status, 200);
  assert.equal(customerReadWithoutAdminMap.body.ok, true);
  assert.equal(customerReadWithoutAdminMap.body.marker_count, 1);
  assert.equal(customerReadWithoutAdminMap.body.customerVisible, true);

  const customerReadWithoutCaptureClient = createQueryClient({
    accessRows: [
      {
        account_status: "active",
        auth_user_id: authUserId,
        customer_account_reference: accountReference,
      },
    ],
    bookingRows: [
      {
        booking_reference: bookingReference,
        customer_id: accountReference,
        route_type: "MNG",
        service_type: "Arrival",
      },
    ],
    latestRows: [safeLatestPosition],
    settingRow: baseSetting({ bookingReference, open: false }),
  });
  setCustomerLiveLocationMapRuntimeClientForTests(customerReadWithoutCaptureClient);

  const customerReadWithoutCapture = await handleCustomerLiveLocationMapRuntimeRequest({
    boundary,
    env: baseEnv({ accountReference, authUserId, sessionToken }),
    request: customerRequest({ bookingReference, origin, sessionToken }),
  });

  assert.equal(customerReadWithoutCapture.status, 200);
  assert.equal(customerReadWithoutCapture.body.ok, true);
  assert.equal(customerReadWithoutCapture.body.marker_count, 1);
  assert.equal(customerReadWithoutCapture.body.customerVisible, true);

  setCustomerLiveLocationMapRuntimeClientForTests(client);
  const defaultClosed = await handleCustomerLiveLocationMapRuntimeRequest({
    boundary,
    env: {},
    request: customerRequest({ bookingReference, origin, sessionToken }),
  });

  assert.equal(defaultClosed.status, 503);
  assert.equal(defaultClosed.body.reason, "customer_live_location_map_runtime_gate_closed");
  assert.equal(defaultClosed.body.customerVisible, false);
} finally {
  for (const [key, value] of Object.entries(originalPortalAccessEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Customer live-location app-side runtime path test passed");
