import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  adminBookingPersistencePurpose,
  resolveAdminDispatcherBoundary,
} from "../../../../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminLegacyRouteContext = {
  params: Promise<{
    table: string;
  }>;
};

type SupabaseRouteQueryResult = {
  data: unknown;
  error: unknown;
};

type SupabaseRouteQuery = PromiseLike<SupabaseRouteQueryResult> & {
  eq(column: string, value: string): SupabaseRouteQuery;
  ilike(column: string, value: string): SupabaseRouteQuery;
  limit(count: number): SupabaseRouteQuery;
  maybeSingle(): Promise<SupabaseRouteQueryResult>;
  order(column: string, options: { ascending: boolean }): SupabaseRouteQuery;
  select(columns: string): SupabaseRouteQuery;
  single(): Promise<SupabaseRouteQueryResult>;
};

const allowedColumnsByTable: Record<string, Set<string>> = {
  bookings: new Set([
    "id",
    "company_id",
    "booker_id",
    "traveler_id",
    "booking_type",
    "vehicle",
    "pickup_time",
    "pickup_address",
    "dropoff_address",
    "flight_no",
    "route",
    "pax",
    "job_card",
    "status",
    "driver_id",
    "driver_name",
    "driver_contact",
    "driver_plate_number",
    "customer_rate",
    "customer_rate_unit",
    "customer_price_amount",
    "customer_rate_override",
    "customer_price_override_reason",
    "driver_payout_min",
    "driver_payout_max",
    "driver_payout_amount",
    "driver_payout_override",
    "driver_payout_reason",
    "driver_payout_unit",
    "driver_notes",
    "driver_dispatch_include_payout",
    "midnight_surcharge",
    "midnight_payout",
    "extra_stop_count",
    "extra_stop_surcharge",
    "extra_stop_payout",
    "child_seat_required",
    "child_seat_count",
    "child_seat_type",
    "child_seat_customer_surcharge",
    "child_seat_driver_payout",
    "pricing_source",
    "created_at",
    "updated_at",
  ]),
  companies: new Set([
    "id",
    "company_name",
    "domain",
    "customer_rates",
    "driver_payout_rules",
    "transzend_excel_privacy",
    "created_at",
    "updated_at",
  ]),
  drivers: new Set([
    "id",
    "driver_name",
    "contact_number",
    "vehicle_type",
    "plate_number",
    "payout_preferences",
    "driver_payout_rules",
    "availability_status",
    "notes",
    "preferred_areas",
    "airport_permit_notes",
    "created_at",
    "updated_at",
  ]),
  rate_settings: new Set([
    "id",
    "customer_rates",
    "driver_payout_rules",
    "midnight_surcharge",
    "extra_stop_surcharge",
    "midnight_payout",
    "extra_stop_payout",
    "child_seat_customer_surcharge",
    "child_seat_driver_payout",
    "created_at",
    "updated_at",
  ]),
  saved_addresses: new Set([
    "id",
    "company_id",
    "traveler_id",
    "label",
    "address",
    "address_role",
    "is_default",
    "use_count",
    "created_at",
    "updated_at",
  ]),
  travelers: new Set([
    "id",
    "company_id",
    "traveler_name",
    "preferred_vehicle",
    "default_address",
    "default_pickup_address",
    "default_dropoff_address",
    "booker_id",
    "booker_name",
    "booker_contact",
    "booker_email",
    "customer_rates",
    "driver_payout_rules",
    "created_at",
    "updated_at",
  ]),
};

const allowedEmbeddedSelectsByTable: Record<string, Set<string>> = {
  bookings: new Set([
    "bookers(booker_name, email, phone)",
    "companies(company_name, domain)",
    "travelers(traveler_name)",
  ]),
};

const allowedTables = new Set(Object.keys(allowedColumnsByTable));

const safeBlockedMessage =
  "Admin legacy data is available only from the internal admin dashboard.";
const safeConfigMessage = "Admin legacy data is not configured on this server.";
const safeFailureMessage = "Admin legacy data request failed safely.";
const safeUnsupportedMessage = "Admin legacy data request is outside the allowed contract.";
const unsafeFieldPattern =
  /paynow|invoice|payment|pdf|billing|finance|parser_debug|raw_ai|parser_prompt|parser_learning|mock_archive|mock_qa|dev_workbench|service_role|server_only|secret|token|key/i;

function jsonError(error: string, status: number) {
  return Response.json({ error, message: error, ok: false }, { status });
}

function cleanServerValue(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function isPlaceholderConfigValue(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    normalized === "placeholder" ||
    normalized === "change-me" ||
    normalized === "change-this" ||
    normalized === "changeme" ||
    normalized === "replace-me" ||
    normalized === "example" ||
    normalized.includes("your-") ||
    normalized.includes("your_") ||
    normalized.includes("<") ||
    normalized.includes(">")
  );
}

function getServerOnlySupabaseClient() {
  const supabaseUrl = cleanServerValue(process.env.SUPABASE_URL);
  const serviceRoleKey = cleanServerValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    isPlaceholderConfigValue(supabaseUrl) ||
    isPlaceholderConfigValue(serviceRoleKey)
  ) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function requireAdminBoundary(request: Request) {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  if (!boundary.ok) {
    return {
      ok: false as const,
      response: jsonError(safeBlockedMessage, 403),
    };
  }

  if (boundary.context.mode === "local-dev-admin-surface" && isProductionRuntime()) {
    return {
      ok: false as const,
      response: jsonError(safeBlockedMessage, 403),
    };
  }

  return { ok: true as const, context: boundary.context };
}

function readRequestSearchParams(request: Request) {
  return new URL(request.url).searchParams;
}

function asRouteQuery(query: unknown) {
  return query as SupabaseRouteQuery;
}

function splitTopLevelSelect(selectColumns: string) {
  const tokens: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < selectColumns.length; index += 1) {
    const character = selectColumns[index];

    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
    } else if (character === "," && depth === 0) {
      tokens.push(selectColumns.slice(start, index).trim());
      start = index + 1;
    }
  }

  tokens.push(selectColumns.slice(start).trim());

  return tokens.filter(Boolean);
}

function isAllowedColumn(table: string, column: string) {
  return Boolean(
    allowedColumnsByTable[table]?.has(column) &&
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(column) &&
      !unsafeFieldPattern.test(column),
  );
}

function isAllowedEmbeddedSelect(table: string, selectToken: string) {
  const normalizedToken = selectToken.replace(/\s+/g, " ").trim();

  return Boolean(allowedEmbeddedSelectsByTable[table]?.has(normalizedToken));
}

function validateSelectColumns(table: string, selectColumns: string | null) {
  if (!selectColumns || selectColumns.trim() === "*" || selectColumns.includes("*")) {
    return safeUnsupportedMessage;
  }

  for (const token of splitTopLevelSelect(selectColumns)) {
    if (token.includes("(")) {
      if (!isAllowedEmbeddedSelect(table, token)) {
        return safeUnsupportedMessage;
      }
    } else if (!isAllowedColumn(table, token)) {
      return safeUnsupportedMessage;
    }
  }

  return null;
}

function validateSearchContract(table: string, searchParams: URLSearchParams, options?: { requireSelect?: boolean }) {
  const selectColumns = searchParams.get("select");
  const selectError = validateSelectColumns(table, selectColumns);

  if ((options?.requireSelect || selectColumns) && selectError) {
    return selectError;
  }

  const singleMode = searchParams.get("single");

  if (singleMode && singleMode !== "maybe" && singleMode !== "single") {
    return safeUnsupportedMessage;
  }

  for (const orderValue of searchParams.getAll("order")) {
    const [column, direction] = orderValue.split(".");

    if (!isAllowedColumn(table, column) || (direction && direction !== "asc" && direction !== "desc")) {
      return safeUnsupportedMessage;
    }
  }

  for (const [key, value] of searchParams.entries()) {
    if (["limit", "order", "select", "single", "upsert"].includes(key)) {
      continue;
    }

    if (!isAllowedColumn(table, key) || (!value.startsWith("eq.") && !value.startsWith("ilike."))) {
      return safeUnsupportedMessage;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validatePayloadContract(table: string, payload: unknown) {
  if (!isRecord(payload)) {
    return safeUnsupportedMessage;
  }

  for (const key of Object.keys(payload)) {
    if (!isAllowedColumn(table, key)) {
      return safeUnsupportedMessage;
    }
  }

  return null;
}

function applyFilters(query: SupabaseRouteQuery, searchParams: URLSearchParams) {
  let nextQuery = query;

  for (const [key, value] of searchParams.entries()) {
    if (["limit", "order", "select", "single", "upsert"].includes(key)) {
      continue;
    }

    if (value.startsWith("eq.")) {
      nextQuery = nextQuery.eq(key, value.slice(3));
    } else if (value.startsWith("ilike.")) {
      nextQuery = nextQuery.ilike(key, value.slice(6));
    }
  }

  return nextQuery;
}

function applyOrderingAndLimit(query: SupabaseRouteQuery, searchParams: URLSearchParams) {
  let nextQuery = query;

  for (const orderValue of searchParams.getAll("order")) {
    const [column, direction] = orderValue.split(".");

    if (column) {
      nextQuery = nextQuery.order(column, { ascending: direction !== "desc" });
    }
  }

  const limitValue = Number(searchParams.get("limit") || "");

  if (Number.isSafeInteger(limitValue) && limitValue > 0) {
    nextQuery = nextQuery.limit(limitValue);
  }

  return nextQuery;
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function safeResult(data: unknown) {
  return Response.json(data);
}

async function finalizeQuery(query: SupabaseRouteQuery, searchParams: URLSearchParams) {
  const singleMode = searchParams.get("single");
  const result =
    singleMode === "single"
      ? await query.single()
      : singleMode === "maybe"
        ? await query.maybeSingle()
        : await query;

  if (result.error) {
    return jsonError(safeFailureMessage, 500);
  }

  return safeResult(result.data ?? null);
}

async function withAdminLegacyClient(
  request: Request,
  context: AdminLegacyRouteContext,
  prepare: (table: string) => Promise<Response | null> | Response | null,
  handler: (table: string, client: SupabaseClient) => Promise<Response>,
) {
  try {
    const boundary = requireAdminBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const { table } = await context.params;

    if (!allowedTables.has(table)) {
      return jsonError(safeBlockedMessage, 404);
    }

    const preparedResponse = await prepare(table);

    if (preparedResponse) {
      return preparedResponse;
    }

    const client = getServerOnlySupabaseClient();

    if (!client) {
      return jsonError(safeConfigMessage, 503);
    }

    return await handler(table, client);
  } catch {
    return jsonError(safeFailureMessage, 500);
  }
}

export async function GET(request: Request, context: AdminLegacyRouteContext) {
  const searchParams = readRequestSearchParams(request);

  return withAdminLegacyClient(
    request,
    context,
    (table) => {
      const contractError = validateSearchContract(table, searchParams, { requireSelect: true });

      return contractError ? jsonError(contractError, 400) : null;
    },
    async (table, client) => {
    const selectColumns = searchParams.get("select") as string;
    let query = asRouteQuery(client.from(table).select(selectColumns));

    query = applyFilters(query, searchParams);
    query = applyOrderingAndLimit(query, searchParams);

    return finalizeQuery(query, searchParams);
    },
  );
}

export async function POST(request: Request, context: AdminLegacyRouteContext) {
  const searchParams = readRequestSearchParams(request);
  const selectColumns = searchParams.get("select");
  let body: Record<string, unknown> = {};

  return withAdminLegacyClient(
    request,
    context,
    async (table) => {
      const contractError = validateSearchContract(table, searchParams);

      if (contractError) {
        return jsonError(contractError, 400);
      }

      const bodyValue = await readJsonBody(request);
      const payloadError = validatePayloadContract(table, bodyValue);

      if (!payloadError) {
        body = bodyValue as Record<string, unknown>;
      }

      return payloadError ? jsonError(payloadError, 400) : null;
    },
    async (table, client) => {
    let query = asRouteQuery(
      searchParams.get("upsert") === "1"
        ? client.from(table).upsert(body)
        : client.from(table).insert(body),
    );

    if (selectColumns) {
      query = query.select(selectColumns);
    }

    return finalizeQuery(query, searchParams);
    },
  );
}

export async function PATCH(request: Request, context: AdminLegacyRouteContext) {
  const searchParams = readRequestSearchParams(request);
  const selectColumns = searchParams.get("select");
  let body: Record<string, unknown> = {};

  return withAdminLegacyClient(
    request,
    context,
    async (table) => {
      const contractError = validateSearchContract(table, searchParams);

      if (contractError) {
        return jsonError(contractError, 400);
      }

      const bodyValue = await readJsonBody(request);
      const payloadError = validatePayloadContract(table, bodyValue);

      if (!payloadError) {
        body = bodyValue as Record<string, unknown>;
      }

      return payloadError ? jsonError(payloadError, 400) : null;
    },
    async (table, client) => {
    let query = asRouteQuery(client.from(table).update(body));

    query = applyFilters(query, searchParams);

    if (selectColumns) {
      query = query.select(selectColumns);
    }

    return finalizeQuery(query, searchParams);
    },
  );
}

export async function DELETE(request: Request, context: AdminLegacyRouteContext) {
  const searchParams = readRequestSearchParams(request);

  return withAdminLegacyClient(
    request,
    context,
    (table) => {
      const contractError = validateSearchContract(table, searchParams);

      return contractError ? jsonError(contractError, 400) : null;
    },
    async (table, client) => {
    let query = asRouteQuery(client.from(table).delete());

    query = applyFilters(query, searchParams);

    return finalizeQuery(query, searchParams);
    },
  );
}
