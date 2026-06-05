import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export const diagnosticStage = "4A-391";
export const envFilePath = path.join(process.cwd(), ".env.stage4a388.local");
export const requiredEnvKeys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
];
export const priorVerificationReferences = [
  "STAGING-VERIFY-4A388-20260605063421-BWH52V",
  "STAGING-VERIFY-4A390-20260605072200-KAC4OT",
];
export const readonlyFetchTimeoutMs = 15_000;
export const tableNames = [
  "customers",
  "customer_contacts",
  "bookings",
  "booking_route_points",
  "booking_service_items",
  "audit_logs",
];
export const columnContracts = [
  {
    name: "customers_write_shape",
    table: "customers",
    variants: [
      ["id", "display_name", "status"],
      ["id", "display_name", "account_status"],
    ],
  },
  {
    name: "customer_contacts_write_shape",
    table: "customer_contacts",
    variants: [
      ["id", "customer_id", "display_name", "phone", "email", "role_label", "is_primary"],
      ["id", "customer_id", "contact_name", "phone", "email", "contact_type"],
    ],
  },
  {
    name: "bookings_current_write_load_shape",
    table: "bookings",
    variants: [
      [
        "id",
        "booking_reference",
        "customer_id",
        "customer_display_name",
        "contact_display_name",
        "contact_phone",
        "contact_email",
        "service_type",
        "pickup_at",
        "pickup_location",
        "dropoff_location",
        "route_summary",
        "passenger_name",
        "passenger_phone",
        "admin_internal_status",
        "customer_facing_status",
        "short_notice_review_status",
        "request_review_status",
        "change_review_status",
        "cancellation_review_status",
        "source_surface",
        "created_at",
        "updated_at",
      ],
    ],
  },
  {
    name: "booking_route_points_write_shape",
    table: "booking_route_points",
    variants: [
      ["id", "booking_id", "sequence", "point_type", "location", "notes"],
      ["id", "booking_id", "sequence_number", "point_type", "location_text", "timing_note"],
    ],
  },
  {
    name: "booking_service_items_write_shape",
    table: "booking_service_items",
    variants: [
      ["id", "booking_id", "item_type", "quantity", "notes"],
      ["id", "booking_id", "service_item_type", "quantity", "blocks_count"],
    ],
  },
  {
    name: "audit_logs_write_shape",
    table: "audit_logs",
    variants: [
      [
        "id",
        "booking_id",
        "customer_id",
        "actor_role",
        "action_type",
        "booking_reference",
        "source_surface",
        "reason",
        "safe_before",
        "safe_after",
      ],
      [
        "id",
        "entity_type",
        "entity_id",
        "action",
        "source_route",
        "actor_label",
        "change_summary",
        "booking_reference",
      ],
    ],
  },
];
export const embeddedLoadContract = {
  name: "bookings_embedded_load_shape",
  table: "bookings",
  select:
    "id, booking_reference, customer_id, customer_display_name, contact_display_name, contact_phone, contact_email, service_type, pickup_at, pickup_location, dropoff_location, route_summary, passenger_name, passenger_phone, admin_internal_status, customer_facing_status, short_notice_review_status, request_review_status, change_review_status, cancellation_review_status, source_surface, created_at, updated_at, booking_route_points(point_type, sequence, location, notes), booking_service_items(item_type, quantity, notes)",
};

const placeholderPattern =
  /^(?:|todo|tbd|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example|YOUR_PROJECT_REF|YOUR_SERVICE_ROLE)$/i;
const productionPattern = /(?:^|[-_\s./])(prod|production|live)(?:[-_\s./]|$)/i;

export function parseEnvFile(text) {
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
  return placeholderPattern.test(normalizedEnvValue(value));
}

function looksProduction(value) {
  return productionPattern.test(normalizedEnvValue(value));
}

export function validateEnv(env) {
  const missing = [];
  const placeholder = [];
  const production = [];
  const invalid = [];

  for (const key of requiredEnvKeys) {
    const value = normalizedEnvValue(env[key]);

    if (!value) {
      missing.push(key);
    } else if (looksPlaceholder(value)) {
      placeholder.push(key);
    } else if (looksProduction(value)) {
      production.push(key);
    }
  }

  if (normalizedEnvValue(env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "true") {
    invalid.push("PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED");
  }

  if (!["server-session-token", "server-session"].includes(normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE))) {
    invalid.push("PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE");
  }

  if (!["admin", "dispatcher"].includes(normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE))) {
    invalid.push("PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE");
  }

  if (missing.length > 0) {
    return {
      ok: false,
      category: "env_missing",
    };
  }

  if (placeholder.length > 0 || invalid.length > 0) {
    return {
      ok: false,
      category: "env_placeholder",
    };
  }

  if (production.length > 0) {
    return {
      ok: false,
      category: "production_refused",
    };
  }

  return {
    ok: true,
  };
}

function applyLoadedEnv(env) {
  for (const key of requiredEnvKeys) {
    process.env[key] = normalizedEnvValue(env[key]);
  }

  if (process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE === "server-session") {
    process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE = "server-session-token";
  }
}

function errorText(error) {
  const record = error && typeof error === "object" ? error : {};

  return Object.values(record)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => String(value).toLowerCase())
    .join(" ");
}

export function categorizeReadonlyFailure(error) {
  const record = error && typeof error === "object" ? error : {};
  const haystack = errorText(error);
  const code = String(record.code ?? "").toLowerCase();
  const statusValue = Number(record.status);
  const status = Number.isFinite(statusValue) ? statusValue : null;

  if (
    status === 401 ||
    code === "401" ||
    haystack.includes("invalid api") ||
    haystack.includes("invalid jwt") ||
    haystack.includes("jwt")
  ) {
    return "auth_or_key_rejected";
  }

  if (
    status === 403 ||
    code === "42501" ||
    haystack.includes("permission denied") ||
    haystack.includes("row level security") ||
    haystack.includes("row-level security") ||
    haystack.includes("rls")
  ) {
    return "permission_or_rls_denied";
  }

  if (
    code === "42p01" ||
    haystack.includes("could not find the table") ||
    (haystack.includes("relation") && haystack.includes("does not exist"))
  ) {
    return "table_unreachable";
  }

  if (
    code === "42703" ||
    code === "pgrst204" ||
    (haystack.includes("column") &&
      (haystack.includes("does not exist") ||
        haystack.includes("not found") ||
        haystack.includes("schema cache")))
  ) {
    return "column_missing";
  }

  return "unknown_readonly_failure";
}

function check(name, status, extra = {}) {
  return {
    name,
    status,
    ...extra,
  };
}

async function runSelect(client, table, columns) {
  const result = await client.from(table).select(columns, { count: "exact" }).limit(0);

  return result;
}

async function readonlyFetch(input, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), readonlyFetchTimeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkTableReachability(client) {
  const checks = [];

  for (const table of tableNames) {
    const result = await runSelect(client, table, "id");

    checks.push(
      result.error
        ? check(`table:${table}`, "fail", { category: categorizeReadonlyFailure(result.error) })
        : check(`table:${table}`, "pass"),
    );
  }

  return checks;
}

async function checkColumnContract(client, contract) {
  const variantResults = [];

  for (const [index, columns] of contract.variants.entries()) {
    const result = await runSelect(client, contract.table, columns.join(", "));

    variantResults.push(
      result.error
        ? {
            variant: index + 1,
            category: categorizeReadonlyFailure(result.error),
            status: "fail",
          }
        : {
            variant: index + 1,
            status: "pass",
          },
    );
  }

  const passingVariant = variantResults.find((result) => result.status === "pass");

  if (passingVariant) {
    return check(`columns:${contract.name}`, "pass", {
      variant: passingVariant.variant,
    });
  }

  return check(`columns:${contract.name}`, "fail", {
    category: variantResults[0]?.category || "unknown_readonly_failure",
  });
}

async function checkEmbeddedLoadContract(client) {
  const result = await client.from(embeddedLoadContract.table).select(embeddedLoadContract.select).limit(0);

  return result.error
    ? check(`columns:${embeddedLoadContract.name}`, "fail", {
        category: categorizeReadonlyFailure(result.error),
      })
    : check(`columns:${embeddedLoadContract.name}`, "pass");
}

async function checkPriorReferencesByCount(client) {
  const checks = [];
  let foundAny = false;

  for (const reference of priorVerificationReferences) {
    const bookingResult = await client
      .from("bookings")
      .select("booking_reference", { count: "exact" })
      .eq("booking_reference", reference)
      .limit(0);
    const auditResult = await client
      .from("audit_logs")
      .select("booking_reference", { count: "exact" })
      .eq("booking_reference", reference)
      .limit(0);

    if (bookingResult.error) {
      checks.push(
        check("prior_reference:bookings_count", "fail", {
          category: categorizeReadonlyFailure(bookingResult.error),
        }),
      );
    } else if ((bookingResult.count || 0) > 0) {
      foundAny = true;
    }

    if (auditResult.error) {
      checks.push(
        check("prior_reference:audit_logs_count", "fail", {
          category: categorizeReadonlyFailure(auditResult.error),
        }),
      );
    } else if ((auditResult.count || 0) > 0) {
      foundAny = true;
    }
  }

  if (checks.some((item) => item.status === "fail")) {
    return checks;
  }

  return [
    check("prior_reference:count_only", "pass", {
      category: foundAny ? "partial_row_possible" : "no_partial_rows_found",
    }),
  ];
}

function diagnosticSummary(checks) {
  const failed = checks.filter((item) => item.status === "fail");
  const categories = [
    ...new Set(
      checks
        .map((item) => item.category)
        .filter(Boolean),
    ),
  ];

  return {
    ok: failed.length === 0,
    categories,
    failedCheckNames: failed.map((item) => item.name),
  };
}

export async function runReadonlyDiagnostic(client) {
  const checks = [
    check("client:server_side_init", "pass"),
    ...(await checkTableReachability(client)),
  ];

  for (const contract of columnContracts) {
    checks.push(await checkColumnContract(client, contract));
  }

  checks.push(await checkEmbeddedLoadContract(client));
  checks.push(...(await checkPriorReferencesByCount(client)));

  const summary = diagnosticSummary(checks);

  return {
    ok: summary.ok,
    stage: diagnosticStage,
    mode: "readonly",
    liveSaveLoadRetryAttempted: false,
    categories: summary.categories,
    failedCheckNames: summary.failedCheckNames,
    checks,
  };
}

async function loadEnvAndCreateClient() {
  if (!existsSync(envFilePath)) {
    return {
      ok: false,
      category: "env_missing",
    };
  }

  const env = parseEnvFile(await readFile(envFilePath, "utf8"));
  const validation = validateEnv(env);

  if (!validation.ok) {
    return validation;
  }

  applyLoadedEnv(env);

  try {
    return {
      ok: true,
      client: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          persistSession: false,
        },
        global: {
          fetch: readonlyFetch,
        },
      }),
    };
  } catch {
    return {
      ok: false,
      category: "client_init_failed",
    };
  }
}

function emit(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

export async function main() {
  const clientResult = await loadEnvAndCreateClient();

  if (!clientResult.ok) {
    emit({
      ok: false,
      stage: diagnosticStage,
      mode: "readonly",
      liveSaveLoadRetryAttempted: false,
      categories: [clientResult.category],
      failedCheckNames: ["env_or_client_preflight"],
    });
    process.exit(1);
  }

  try {
    const result = await runReadonlyDiagnostic(clientResult.client);

    emit(result);
    process.exit(result.ok ? 0 : 1);
  } catch {
    emit({
      ok: false,
      stage: diagnosticStage,
      mode: "readonly",
      liveSaveLoadRetryAttempted: false,
      categories: ["unknown_readonly_failure"],
      failedCheckNames: ["unexpected_readonly_diagnostic_failure"],
    });
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
