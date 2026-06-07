import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const approvalEnvName = "PRESTIGE_ADMIN_ONEMAP_READ_ONLY_VERIFICATION_APPROVED";
const approvalValue = "phase-3-william-approved";
const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];
const requiredEnvKeys = [
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
  "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED",
  "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER",
  "PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED",
  "PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER",
];
const tokenEnvKeyOptions = ["PRESTIGE_ONEMAP_ACCESS_TOKEN", "ONEMAP_ACCESS_TOKEN"];
const sourceFiles = [
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-map-location-search.ts",
  "lib/admin-map-route-estimates.ts",
  "app/api/admin-map-location-search/route.ts",
  "app/api/admin-map-route-estimates/route.ts",
];
const unsafeEvidencePattern =
  /contact_phone|contact_email|passenger|customer_price|customer_charge|quoted_price|rate_amount|fare_amount|amount_due|billing_amount|billing_rate|invoice|payment|pdf|stripe|paynow|driver_payout|payout|finance|notification|telegram|sms_send|email_send|proof|photo|live_location|auth_link|customer_auth|driver_auth|raw_ai_prompt|raw_parser_prompt|parser_learning|parser_debug|service_role|server_only|server_secret|internal_admin_note|admin_note|internal_note|manual_extra_charge|secret|token/i;

class SafeFailure extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.code = code;
    this.extra = extra;
  }
}

function emitEvidence(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function failSafely(code, extra = {}) {
  throw new SafeFailure(code, extra);
}

function parseEnvFile(text) {
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);

    if (!match) {
      continue;
    }

    let value = match[2].trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[match[1]] = value;
  }

  return env;
}

function normalizedEnvValue(value) {
  return String(value ?? "").trim();
}

function looksPlaceholder(value) {
  return /^(?:|todo|tbd|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example|YOUR_ONEMAP_TOKEN)$/i.test(
    normalizedEnvValue(value),
  );
}

function validTokenShape(value) {
  const normalized = normalizedEnvValue(value);

  return normalized.length >= 24 && !looksPlaceholder(normalized);
}

function envCandidateSummary(envFileName, validation, exists) {
  return {
    envFileName,
    exists,
    invalid: validation?.invalid || [],
    missing: validation?.missing || [],
    placeholder: validation?.placeholder || [],
    tokenEnvNamePresent: validation?.tokenEnvNamePresent || null,
    valuesPrinted: false,
  };
}

function validateEnv(env, envFileName) {
  const missing = [];
  const placeholder = [];
  const invalid = [];
  const tokenEnvNamePresent = tokenEnvKeyOptions.find((key) => normalizedEnvValue(env[key])) || null;

  for (const key of requiredEnvKeys) {
    const value = normalizedEnvValue(env[key]);

    if (!value) {
      missing.push(key);
    } else if (looksPlaceholder(value)) {
      placeholder.push(key);
    }
  }

  if (!tokenEnvNamePresent) {
    missing.push(tokenEnvKeyOptions.join("|"));
  } else if (!validTokenShape(env[tokenEnvNamePresent])) {
    invalid.push(tokenEnvNamePresent);
  }

  if (
    normalizedEnvValue(env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) &&
    normalizedEnvValue(env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "false"
  ) {
    invalid.push("PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED");
  }

  if (
    normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE) &&
    normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE) !== "server-session-token"
  ) {
    invalid.push("PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE");
  }

  if (
    normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE) &&
    !["admin", "dispatcher"].includes(normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE))
  ) {
    invalid.push("PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE");
  }

  if (
    normalizedEnvValue(env.PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED) &&
    normalizedEnvValue(env.PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED) !== "true"
  ) {
    invalid.push("PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED");
  }

  if (
    normalizedEnvValue(env.PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER) &&
    normalizedEnvValue(env.PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER) !== "onemap_search"
  ) {
    invalid.push("PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER");
  }

  if (
    normalizedEnvValue(env.PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED) &&
    normalizedEnvValue(env.PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED) !== "true"
  ) {
    invalid.push("PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED");
  }

  if (
    normalizedEnvValue(env.PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER) &&
    normalizedEnvValue(env.PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER) !== "onemap_routing"
  ) {
    invalid.push("PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER");
  }

  return {
    env,
    envFileName,
    invalid,
    missing,
    ok: missing.length === 0 && placeholder.length === 0 && invalid.length === 0,
    placeholder,
    tokenEnvNamePresent,
  };
}

async function loadEnvCandidates() {
  const checked = [];
  const processValidation = validateEnv(process.env, "process.env");

  checked.push(envCandidateSummary("process.env", processValidation, true));

  if (processValidation.ok) {
    return {
      ...processValidation,
      checked,
    };
  }

  for (const envFileName of candidateEnvFileNames) {
    const candidatePath = path.join(process.cwd(), envFileName);

    if (!existsSync(candidatePath)) {
      checked.push(envCandidateSummary(envFileName, null, false));
      continue;
    }

    const validation = validateEnv(parseEnvFile(await readFile(candidatePath, "utf8")), envFileName);

    checked.push(envCandidateSummary(envFileName, validation, true));

    if (validation.ok) {
      return {
        ...validation,
        checked,
      };
    }
  }

  failSafely("onemap_read_only_env_preflight_failed", {
    checkedEnvCandidates: checked,
    requiredEnvNames: [...requiredEnvKeys, tokenEnvKeyOptions.join("|")],
  });
}

function applyLoadedEnv(env) {
  for (const key of [...requiredEnvKeys, ...tokenEnvKeyOptions]) {
    const value = normalizedEnvValue(env[key]);

    if (value) {
      process.env[key] = value;
    }
  }
}

function forcePersistenceOff() {
  process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "false";
}

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function writeHarnessFile(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function writeRuntimeModules(tempDir) {
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-onemap-read-only-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    locationRoute: require(path.join(tempDir, "app/api/admin-map-location-search/route.js")),
    routeEstimateRoute: require(path.join(tempDir, "app/api/admin-map-route-estimates/route.js")),
  };
}

function adminHeaders() {
  return {
    "content-type": "application/json",
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
  };
}

async function readResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function getRequest(url, headers) {
  return new Request(url, {
    headers,
    method: "GET",
  });
}

function postRequest(url, headers, body) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
}

function safeResultName(result) {
  if (result?.status === 200 && result?.body?.ok === true) {
    return "passed";
  }

  return result?.status ? `blocked-${result.status}` : "blocked";
}

function responseContainsUnsafeEvidence(body) {
  return unsafeEvidencePattern.test(JSON.stringify(body));
}

function safeSearchSummary(body) {
  const search = body?.location_search || {};
  const results = Array.isArray(search.results) ? search.results : [];

  return {
    firstResultHasCoordinate:
      Number.isFinite(Number(results[0]?.latitude)) && Number.isFinite(Number(results[0]?.longitude)),
    ok: body?.ok === true,
    provider: search.provider || null,
    resultCount: results.length,
    rowDataPrinted: false,
    searchStatus: search.safe_route_context?.search_status || null,
    versionPresent: typeof search.version === "string" && search.version.length > 0,
  };
}

function safeRouteSummary(body) {
  const estimate = body?.route_estimate || {};

  return {
    distanceMetersPresent: Number.isFinite(Number(estimate.distance_meters)),
    durationSecondsPresent: Number.isFinite(Number(estimate.duration_seconds)),
    ok: body?.ok === true,
    provider: estimate.provider || null,
    routeStatus: estimate.safe_route_context?.route_status || null,
    routeType: estimate.route_type || null,
    rowDataPrinted: false,
    versionPresent: typeof estimate.version === "string" && estimate.version.length > 0,
  };
}

async function main() {
  if (process.env[approvalEnvName] !== approvalValue) {
    failSafely("missing_explicit_william_onemap_read_only_approval_env", {
      requiredApprovalEnvName: approvalEnvName,
    });
  }

  const validation = await loadEnvCandidates();

  applyLoadedEnv(validation.env);
  forcePersistenceOff();

  const harness = await loadHarness();

  try {
    const blockedAnonymousSearch = await readResponse(
      await harness.locationRoute.GET(
        getRequest("http://localhost/api/admin-map-location-search?query=Raffles%20Hotel%20Singapore&page=1", {
          referer: "http://localhost/",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        }),
      ),
    );
    const blockedCustomerSearch = await readResponse(
      await harness.locationRoute.GET(
        getRequest("http://localhost/api/admin-map-location-search?query=Raffles%20Hotel%20Singapore&page=1", {
          ...adminHeaders(),
          referer: "http://localhost/book",
        }),
      ),
    );
    const blockedWrongTokenRoute = await readResponse(
      await harness.routeEstimateRoute.POST(
        postRequest(
          "http://localhost/api/admin-map-route-estimates",
          {
            ...adminHeaders(),
            "x-prestige-admin-session-token": "wrong-token",
          },
          {
            destination: {
              label: "CHANGI AIRPORT TERMINAL 2",
              latitude: 1.355537,
              longitude: 103.986477,
            },
            origin: {
              label: "RAFFLES HOTEL SINGAPORE",
              latitude: 1.294781,
              longitude: 103.854556,
            },
            route_type: "drive",
          },
        ),
      ),
    );
    const searchResult = await readResponse(
      await harness.locationRoute.GET(
        getRequest("http://localhost/api/admin-map-location-search?query=Raffles%20Hotel%20Singapore&page=1", adminHeaders()),
      ),
    );
    const routeResult = await readResponse(
      await harness.routeEstimateRoute.POST(
        postRequest(
          "http://localhost/api/admin-map-route-estimates",
          adminHeaders(),
          {
            booking_reference: "ONEMAP-READ-ONLY-PHASE3",
            destination: {
              label: "CHANGI AIRPORT TERMINAL 2",
              latitude: 1.355537,
              longitude: 103.986477,
            },
            origin: {
              label: "RAFFLES HOTEL SINGAPORE",
              latitude: 1.294781,
              longitude: 103.854556,
            },
            route_type: "drive",
          },
        ),
      ),
    );
    const unsafeEvidenceExposed =
      responseContainsUnsafeEvidence(searchResult.body) || responseContainsUnsafeEvidence(routeResult.body);

    if (
      blockedAnonymousSearch.status !== 403 ||
      blockedCustomerSearch.status !== 403 ||
      blockedWrongTokenRoute.status !== 403 ||
      searchResult.status !== 200 ||
      searchResult.body?.ok !== true ||
      routeResult.status !== 200 ||
      routeResult.body?.ok !== true ||
      unsafeEvidenceExposed
    ) {
      failSafely("onemap_read_only_verification_failed_safely", {
        blockedAnonymousSearch: safeResultName(blockedAnonymousSearch),
        blockedCustomerSearch: safeResultName(blockedCustomerSearch),
        blockedWrongTokenRoute: safeResultName(blockedWrongTokenRoute),
        liveDbWrites: false,
        noPostPatchPutDeleteToDatabase: true,
        noSupabaseCommand: true,
        routeStatus: routeResult.status,
        searchStatus: searchResult.status,
        unsafeEvidenceExposed,
      });
    }

    emitEvidence({
      env: {
        checkedEnvCandidates: validation.checked,
        envFileName: validation.envFileName,
        mapGateEnabledForReadOnly: true,
        persistenceDefaultBeforeAndAfter: "off",
        requiredEnvNamesPresent: [...requiredEnvKeys, validation.tokenEnvNamePresent],
        valuesPrinted: false,
      },
      liveDbWrites: false,
      liveOneMapReadOnlyCalls: {
        locationSearchGetCount: 1,
        routeEstimateGetCountViaServerPost: 1,
      },
      noCustomerDriverAuthActivation: true,
      noEnvSecretsPrinted: true,
      noInvoicePdfPaymentPayoutNotificationBehavior: true,
      noSupabaseCommand: true,
      ok: true,
      persistenceDefaultAfter: "off",
      readOnlyResult: {
        locationSearch: safeSearchSummary(searchResult.body),
        routeEstimate: safeRouteSummary(routeResult.body),
        unsafeEvidenceExposed,
      },
      routeSafety: {
        anonymousSearchGate: safeResultName(blockedAnonymousSearch),
        customerRefererSearchGate: safeResultName(blockedCustomerSearch),
        wrongTokenRouteGate: safeResultName(blockedWrongTokenRoute),
      },
      safePublicLandmarkScope: {
        destination: "CHANGI AIRPORT TERMINAL 2",
        origin: "RAFFLES HOTEL SINGAPORE",
        privateCustomerDataUsed: false,
      },
      stage: "phase-3-onemap-read-only",
    });
  } finally {
    forcePersistenceOff();
    await harness.cleanup();
  }
}

main().catch((error) => {
  forcePersistenceOff();

  if (error instanceof SafeFailure) {
    emitEvidence({
      error: error.code,
      ok: false,
      persistenceDefaultAfter: "off",
      stage: "phase-3-onemap-read-only",
      ...error.extra,
    });
    process.exit(1);
  }

  emitEvidence({
    error: "unexpected_onemap_read_only_verification_failure",
    ok: false,
    persistenceDefaultAfter: "off",
    stage: "phase-3-onemap-read-only",
  });
  process.exit(1);
});
