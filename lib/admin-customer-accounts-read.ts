import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceRecord,
  AdminBookingResult,
} from "./admin-booking-persistence";
import { listAdminBookings } from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import { formatVerifiedCustomerAccountTitle } from "./admin-customer-account-title";

export const adminCustomerAccountsReadVersion = "admin-customer-accounts-read-v1";

export type AdminCustomerAccountsReadParams = {
  customerId: string | null;
  limit: number;
  search: string | null;
};

export type AdminCustomerAccountSafeRecord = {
  account_scope_key: string;
  account_scope_label: string | null;
  completed_count: number;
  customer_account: string;
  customer_directory_label: string;
  customer_folder_key: string;
  customer_folder_active: boolean;
  customer_id: string | null;
  guest_account_billing_enabled: boolean;
  latest_booking_reference: string | null;
  latest_public_booking_reference: string | null;
  latest_pickup_at: string | null;
  latest_service_type: string | null;
  saved_booking_count: number;
  source: "admin_booking_persistence" | "customer_directory";
  upcoming_count: number;
  verified_company_id: string | null;
};

export type AdminCustomerAccountsReadSummary = {
  recent_read_count: number;
  returned_count: number;
  total_account_count: number;
};

export type AdminCustomerAccountsReadData = {
  accounts: AdminCustomerAccountSafeRecord[];
  summary: AdminCustomerAccountsReadSummary;
  version: typeof adminCustomerAccountsReadVersion;
};

type UnknownRecord = Record<string, unknown>;
type MutableCustomerAccount = Omit<AdminCustomerAccountSafeRecord, "verified_company_id"> & {
  latestSortValue: string;
  verifiedBookerIds: Set<string>;
  verifiedCompanyIds: Set<string>;
};
type InternalCustomerAccount = AdminCustomerAccountSafeRecord & {
  verified_booker_ids: string[];
};

const defaultLimit = 10;
const maxLimit = 1000;
const accountSourceReadLimit = 200;
const customerRelationshipReadLimit = 1000;
const maxSearchLength = 80;
const customerDirectoryReadLimit = 1000;
const customerIdentityDirectoryReadLimit = 1000;
const malformedParamsError = "Admin customer accounts read parameters are malformed.";
const forbiddenParamsError =
  "Admin customer accounts read parameters include unsupported or unsafe fields.";
const allowedParams = new Set(["customer_id", "limit", "search"]);
const forbiddenSafeTextFragments = [
  "admin_finance",
  "admin_note",
  "auth_link",
  "contact_email",
  "contact_phone",
  "debug",
  "dev_archive",
  "dev_workbench",
  "driver_note",
  "driver_payout",
  "email_payload",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "live_location",
  "mock_archive",
  "mock_qa",
  "notification",
  "parser",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "proof",
  "raw_ai",
  "raw_token",
  "secret",
  "send",
  "server_secret",
  "service_role",
  "stripe",
  "token",
  "whatsapp",
];

function textOrNull(value: unknown, maxLength = 160) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function normalizeToken(value: string | null | undefined) {
  return (
    value
      ?.replace(/([a-z])([A-Z])/g, "$1_$2")
      .replace(/[^a-z0-9]+/gi, "_")
      .toLowerCase() || ""
  );
}

function includesForbiddenSafeTextFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenSafeTextFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength = 160) {
  const cleaned = textOrNull(value, maxLength);

  if (!cleaned || includesForbiddenSafeTextFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeCustomerFolderName(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > 120 || includesForbiddenSafeTextFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function readParamKeys(params: URLSearchParams | UnknownRecord) {
  return params instanceof URLSearchParams ? [...params.keys()] : Object.keys(params);
}

function positiveInteger(value: unknown, defaultValue: number, maxValue: number) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxValue ? parsed : null;
}

function searchText(value: unknown) {
  const cleaned = textOrNull(value, maxSearchLength);

  if (!cleaned) {
    return null;
  }

  return includesForbiddenSafeTextFragment(cleaned) ? false : cleaned;
}

function filterAccountsBySearch(accounts: AdminCustomerAccountSafeRecord[], search: string | null) {
  const normalizedSearch = search?.trim().toLowerCase();

  if (!normalizedSearch) {
    return accounts;
  }

  return accounts.filter((account) => {
    const scopeSearchText = (account.account_scope_label || "")
      .replace(/\b(Booker|Passenger|Traveller):/gi, "")
      .toLowerCase();
    const customerIdSearchText = (account.customer_id || "")
      .replace(/^customer[-_]?/i, "")
      .toLowerCase();
    const accountSearchText = [
      account.customer_account,
      customerIdSearchText,
      account.latest_booking_reference || "",
      account.latest_public_booking_reference || "",
    ]
      .join(" ")
      .toLowerCase();

    return (
      accountSearchText.includes(normalizedSearch) ||
      scopeSearchText.includes(normalizedSearch)
    );
  });
}

function accountScopeFromBooking(booking: AdminBookingPersistenceRecord) {
  const bookerName = safeText(booking.contact_display_name, 80);
  const travellerName = safeText(booking.passenger_name, 80);
  const bookerKey = normalizeToken(bookerName);
  const travellerKey = normalizeToken(travellerName);
  const labelParts = [
    travellerName ? `Passenger: ${travellerName}` : null,
    bookerName && bookerKey !== travellerKey ? `Booker: ${bookerName}` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    key: travellerKey || (bookerKey ? `booker_${bookerKey}` : "booker_traveller_not_set"),
    label: labelParts.length > 0 ? labelParts.join(" / ") : null,
  };
}

function customerFolderKey(customerId: string | null, customerAccount: string, accountScopeKey: string) {
  const accountKey = customerId || normalizeToken(customerAccount);

  return [accountKey, accountScopeKey].filter(Boolean).join("::");
}

function customerAccountDisplayLabel(booking: AdminBookingPersistenceRecord) {
  return safeText(booking.customer_display_name, 120) || "";
}

function statusToken(value: unknown) {
  return normalizeToken(textOrNull(value, 80));
}

function customerDirectoryRowIsActive(record: UnknownRecord | undefined) {
  if (!record) {
    return false;
  }

  const statuses = [statusToken(record.status), statusToken(record.account_status)].filter(Boolean);

  return statuses.length > 0 && statuses.every((status) => status === "active");
}

function verifiedCompanyId(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : null;
}

function isCompletedBooking(booking: AdminBookingPersistenceRecord) {
  const adminStatus = statusToken(booking.admin_internal_status);
  const customerStatus = statusToken(booking.customer_facing_status);

  return adminStatus === "completed" || customerStatus === "completed";
}

function isClosedBooking(booking: AdminBookingPersistenceRecord) {
  const adminStatus = statusToken(booking.admin_internal_status);
  const customerStatus = statusToken(booking.customer_facing_status);

  return (
    isCompletedBooking(booking) ||
    adminStatus === "cancelled" ||
    adminStatus === "archived" ||
    customerStatus === "cancelled" ||
    customerStatus === "declined"
  );
}

function pickupSortValue(value: unknown) {
  return safeText(value, 80) || "";
}

function updateLatestBooking(account: MutableCustomerAccount, booking: AdminBookingPersistenceRecord) {
  const pickupAt = pickupSortValue(booking.pickup_at || booking.pickup_datetime);
  const bookingReference = safeText(booking.booking_reference, 120);
  const publicBookingReference = safeText(booking.public_booking_reference, 40);
  const serviceType = safeText(booking.service_type || booking.route_type, 80);

  if (pickupAt && pickupAt >= account.latestSortValue) {
    account.latestSortValue = pickupAt;
    account.latest_pickup_at = pickupAt;
    account.latest_booking_reference = bookingReference;
    account.latest_public_booking_reference = publicBookingReference;
    account.latest_service_type = serviceType;
  }
}

function toSafeAccount(account: MutableCustomerAccount): InternalCustomerAccount {
  return {
    account_scope_key: account.account_scope_key,
    account_scope_label: account.account_scope_label,
    completed_count: account.completed_count,
    customer_account: account.customer_account,
    customer_directory_label: account.customer_directory_label,
    customer_folder_key: account.customer_folder_key,
    customer_folder_active: account.customer_folder_active,
    customer_id: account.customer_id,
    guest_account_billing_enabled: account.guest_account_billing_enabled,
    latest_booking_reference: account.latest_booking_reference,
    latest_public_booking_reference: account.latest_public_booking_reference,
    latest_pickup_at: account.latest_pickup_at,
    latest_service_type: account.latest_service_type,
    saved_booking_count: account.saved_booking_count,
    source: account.source,
    upcoming_count: account.upcoming_count,
    verified_booker_ids: Array.from(account.verifiedBookerIds),
    verified_company_id:
      account.verifiedCompanyIds.size === 1
        ? Array.from(account.verifiedCompanyIds)[0]
        : null,
  };
}

function toCustomerAccounts(
  bookings: AdminBookingPersistenceRecord[],
): InternalCustomerAccount[] {
  const accounts = new Map<string, MutableCustomerAccount>();

  for (const booking of bookings) {
    const customerAccount = customerAccountDisplayLabel(booking);

    if (!customerAccount) {
      continue;
    }

    const customerId = safeText(booking.customer_id, 120);
    const accountScope = accountScopeFromBooking(booking);
    const key = customerFolderKey(customerId, customerAccount, accountScope.key);
    const current =
      accounts.get(key) ||
      ({
        account_scope_key: accountScope.key,
        account_scope_label: accountScope.label,
        completed_count: 0,
        customer_account: customerAccount,
        customer_directory_label: "",
        customer_folder_key: key,
        customer_folder_active: false,
        customer_id: customerId,
        guest_account_billing_enabled: false,
        latest_booking_reference: null,
        latest_public_booking_reference: null,
        latest_pickup_at: null,
        latest_service_type: null,
        latestSortValue: "",
        saved_booking_count: 0,
        source: "admin_booking_persistence",
        upcoming_count: 0,
        verifiedBookerIds: new Set<string>(),
        verifiedCompanyIds: new Set<string>(),
      } satisfies MutableCustomerAccount);

    const companyId = verifiedCompanyId(booking.company_id);
    const bookerId = verifiedCompanyId(booking.booker_id);

    if (companyId) {
      current.verifiedCompanyIds.add(companyId);
    }
    if (bookerId) {
      current.verifiedBookerIds.add(bookerId);
    }

    current.saved_booking_count += 1;

    if (isCompletedBooking(booking)) {
      current.completed_count += 1;
    } else if (!isClosedBooking(booking)) {
      current.upcoming_count += 1;
    }

    updateLatestBooking(current, booking);
    accounts.set(key, current);
  }

  return [...accounts.values()]
    .sort(
      (first, second) =>
        second.latestSortValue.localeCompare(first.latestSortValue) ||
        first.customer_account.localeCompare(second.customer_account),
    )
    .map(toSafeAccount);
}

function configValueOrNull(value: string | undefined) {
  const cleaned = value?.trim();

  return cleaned && !/placeholder|change[_-]?me|replace[_-]?me|example/i.test(cleaned)
    ? cleaned
    : null;
}

function validServerDatabaseUrl(value: string | null) {
  if (!value) return false;

  try {
    const url = new URL(value);

    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function validServerCredential(value: string | null) {
  const normalized = value?.toLowerCase() || "";

  return Boolean(
    value &&
      value.length >= 24 &&
      normalized !== "anon" &&
      normalized !== "public" &&
      !normalized.includes("anon_key") &&
      !normalized.includes("public_key") &&
      !normalized.includes("next_public"),
  );
}

function customerDirectoryClient() {
  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!validServerDatabaseUrl(supabaseUrl) || !validServerCredential(serviceRoleKey)) {
    return null;
  }

  try {
    return createClient(supabaseUrl as string, serviceRoleKey as string, {
      auth: { persistSession: false },
    });
  } catch {
    return null;
  }
}

function exactCustomerId(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : null;
}

function mergeCustomerDirectoryRows(
  bookingAccounts: InternalCustomerAccount[],
  rows: unknown[],
  relationshipRows: unknown[],
  companyRows: unknown[],
  bookerRows: unknown[],
) {
  const directoryRowsByCustomerId = new Map(
    rows.flatMap((row) => {
      const record = row !== null && typeof row === "object" && !Array.isArray(row)
        ? (row as UnknownRecord)
        : {};
      const customerId = exactCustomerId(record.id);

      return customerId ? [[customerId, record] as const] : [];
    }),
  );
  const verifiedCompanyIdsByCustomerId = new Map<string, Set<string>>();
  const companiesById = new Map(
    companyRows.flatMap((row) => {
      const record = row !== null && typeof row === "object" && !Array.isArray(row)
        ? (row as UnknownRecord)
        : {};
      const companyId = verifiedCompanyId(record.id);

      return companyId ? [[companyId, record] as const] : [];
    }),
  );
  const bookersById = new Map(
    bookerRows.flatMap((row) => {
      const record = row !== null && typeof row === "object" && !Array.isArray(row)
        ? (row as UnknownRecord)
        : {};
      const bookerId = verifiedCompanyId(record.id);

      return bookerId ? [[bookerId, record] as const] : [];
    }),
  );
  const bookersByCustomerCompany = new Map<string, Array<[string, UnknownRecord]>>();

  for (const [bookerId, booker] of bookersById.entries()) {
    const customerId = exactCustomerId(booker.customer_id);
    const companyId = verifiedCompanyId(booker.company_id);

    if (!customerId || !companyId) {
      continue;
    }

    const companyIds = verifiedCompanyIdsByCustomerId.get(customerId) || new Set<string>();
    companyIds.add(companyId);
    verifiedCompanyIdsByCustomerId.set(customerId, companyIds);
    const customerCompanyKey = `${customerId}:${companyId}`;
    const accountBookers = bookersByCustomerCompany.get(customerCompanyKey) || [];
    accountBookers.push([bookerId, booker]);
    bookersByCustomerCompany.set(customerCompanyKey, accountBookers);
  }

  for (const account of bookingAccounts) {
    const customerId = exactCustomerId(account.customer_id);
    const companyId = verifiedCompanyId(account.verified_company_id);

    if (!customerId || !companyId) {
      continue;
    }

    const companyIds = verifiedCompanyIdsByCustomerId.get(customerId) || new Set<string>();

    companyIds.add(companyId);
    verifiedCompanyIdsByCustomerId.set(customerId, companyIds);
  }

  for (const row of relationshipRows) {
    const record = row !== null && typeof row === "object" && !Array.isArray(row)
      ? (row as UnknownRecord)
      : {};
    const customerId = exactCustomerId(record.customer_id);
    const companyId = verifiedCompanyId(record.company_id);

    if (!customerId || !companyId) {
      continue;
    }

    const companyIds = verifiedCompanyIdsByCustomerId.get(customerId) || new Set<string>();

    companyIds.add(companyId);
    verifiedCompanyIdsByCustomerId.set(customerId, companyIds);
  }

  const enrichedBookingAccounts = bookingAccounts.map((account) => {
    const customerId = exactCustomerId(account.customer_id) || "";
    const directoryRow = directoryRowsByCustomerId.get(customerId);
    const verifiedCompanyIds = verifiedCompanyIdsByCustomerId.get(customerId) || new Set<string>();
    const guestAccountBillingEnabled = directoryRow?.customer_type === "hotel";
    const directoryCustomerAccount = safeText(directoryRow?.display_name, 120);
    const companyId = verifiedCompanyIds.size === 1 ? Array.from(verifiedCompanyIds)[0] : null;
    const companyRecord = companyId ? companiesById.get(companyId) : undefined;
    const companyName = guestAccountBillingEnabled
      ? null
      : safeText(companyRecord?.company_name, 120);
    const exactAccountBookers = companyId
      ? bookersByCustomerCompany.get(`${customerId}:${companyId}`) || []
      : [];
    const bookingBookerIds = account.verified_booker_ids;
    const exactBooker =
      exactAccountBookers.length === 1 &&
      (bookingBookerIds.length === 0 ||
        (bookingBookerIds.length === 1 && bookingBookerIds[0] === exactAccountBookers[0][0]))
        ? exactAccountBookers[0][1]
        : undefined;
    const bookerName = guestAccountBillingEnabled
      ? null
      : safeText(exactBooker?.booker_name, 80);

    return {
      ...account,
      customer_account: formatVerifiedCustomerAccountTitle({
        bookerName,
        companyName,
        directoryLabel: directoryCustomerAccount,
      }),
      customer_directory_label: directoryCustomerAccount || "",
      customer_folder_active: customerDirectoryRowIsActive(directoryRow),
      guest_account_billing_enabled: guestAccountBillingEnabled,
      verified_company_id: companyId,
    };
  });
  const linkedCustomerIds = new Set(
    enrichedBookingAccounts.map((account) => exactCustomerId(account.customer_id)).filter(Boolean),
  );
  const directoryOnlyAccounts = rows.flatMap((row) => {
    const record = row !== null && typeof row === "object" && !Array.isArray(row)
      ? (row as UnknownRecord)
      : {};
    const customerId = exactCustomerId(record.id);
    const customerAccount = safeText(record.display_name, 120);
    const verifiedCompanyIds = verifiedCompanyIdsByCustomerId.get(customerId || "") || new Set<string>();

    if (!customerId || !customerAccount || linkedCustomerIds.has(customerId)) {
      return [];
    }

    const guestAccountBillingEnabled = record.customer_type === "hotel";
    const companyId = verifiedCompanyIds.size === 1 ? Array.from(verifiedCompanyIds)[0] : null;
    const companyName = guestAccountBillingEnabled
      ? null
      : safeText(companiesById.get(companyId || "")?.company_name, 120);
    const exactAccountBookers = companyId
      ? bookersByCustomerCompany.get(`${customerId}:${companyId}`) || []
      : [];
    const bookerName =
      !guestAccountBillingEnabled && exactAccountBookers.length === 1
        ? safeText(exactAccountBookers[0][1].booker_name, 80)
        : null;

    return [{
      account_scope_key: "customer_account",
      account_scope_label: null,
      completed_count: 0,
      customer_account: formatVerifiedCustomerAccountTitle({
        bookerName,
        companyName,
        directoryLabel: customerAccount,
      }),
      customer_directory_label: customerAccount,
      customer_folder_key: `${customerId}::customer_account`,
      customer_folder_active: customerDirectoryRowIsActive(record),
      customer_id: customerId,
      guest_account_billing_enabled: guestAccountBillingEnabled,
      latest_booking_reference: null,
      latest_public_booking_reference: null,
      latest_pickup_at: null,
      latest_service_type: null,
      saved_booking_count: 0,
      source: "customer_directory" as const,
      upcoming_count: 0,
      verified_booker_ids: [],
      verified_company_id: companyId,
    }];
  });

  return [...enrichedBookingAccounts, ...directoryOnlyAccounts].map((account) => {
    const safeAccount: Partial<InternalCustomerAccount> = { ...account };

    delete safeAccount.verified_booker_ids;

    return safeAccount as AdminCustomerAccountSafeRecord;
  });
}

export function parseAdminCustomerAccountsReadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminCustomerAccountsReadParams> {
  const unsupportedParam = readParamKeys(params).find((key) => !allowedParams.has(key));

  if (unsupportedParam) {
    return {
      error: forbiddenParamsError,
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(readParamsValue(params, "limit"), defaultLimit, maxLimit);
  const search = searchText(readParamsValue(params, "search"));
  const rawCustomerId = readParamsValue(params, "customer_id");
  const customerId = rawCustomerId === undefined || rawCustomerId === null || rawCustomerId === ""
    ? null
    : exactCustomerId(rawCustomerId);

  if (!limit || search === false || (rawCustomerId && !customerId)) {
    return {
      error: malformedParamsError,
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      customerId,
      limit,
      search,
    },
    ok: true,
  };
}

export async function loadAdminCustomerAccounts(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminCustomerAccountsReadData>> {
  const parsed = parseAdminCustomerAccountsReadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const bookingsResult = await listAdminBookings(actor, {
    limit: accountSourceReadLimit,
  });

  if (!bookingsResult.ok) {
    return bookingsResult;
  }

  const client: Pick<SupabaseClient, "from"> | null = customerDirectoryClient();

  if (!client) {
    return {
      error: "Admin customer directory configuration is not ready.",
      ok: false,
      status: 503,
    };
  }

  const { data: customerRows, error: customerError } = await client
    .from("customers")
    .select("id, display_name, account_status, status, customer_type")
    .order("display_name", { ascending: true })
    .limit(customerDirectoryReadLimit);

  if (customerError || !Array.isArray(customerRows)) {
    return {
      error: "Admin customer directory read failed safely.",
      ok: false,
      status: 500,
    };
  }


  const { data: relationshipRows, error: relationshipError } = await client
    .from("bookings")
    .select("customer_id, company_id")
    .limit(customerRelationshipReadLimit);

  if (relationshipError || !Array.isArray(relationshipRows)) {
    return {
      error: "Admin customer relationship read failed safely.",
      ok: false,
      status: 500,
    };
  }

  const { data: companyRows, error: companyError } = await client
    .from("companies")
    .select("id, company_name")
    .limit(customerIdentityDirectoryReadLimit);

  if (companyError || !Array.isArray(companyRows)) {
    return {
      error: "Admin customer Company identity read failed safely.",
      ok: false,
      status: 500,
    };
  }

  const { data: bookerRows, error: bookerError } = await client
    .from("bookers")
    .select("id, company_id, customer_id, booker_name")
    .limit(customerIdentityDirectoryReadLimit);

  if (bookerError || !Array.isArray(bookerRows)) {
    return {
      error: "Admin customer Booker identity read failed safely.",
      ok: false,
      status: 500,
    };
  }

  const accounts = mergeCustomerDirectoryRows(
    toCustomerAccounts(bookingsResult.data),
    customerRows,
    relationshipRows,
    companyRows,
    bookerRows,
  );
  const exactAccounts = parsed.data.customerId
    ? accounts.filter((account) => account.customer_id === parsed.data.customerId)
    : accounts;
  const filteredAccounts = filterAccountsBySearch(exactAccounts, parsed.data.search);
  const returnedAccounts = filteredAccounts.slice(0, parsed.data.limit);

  return {
    data: {
      accounts: returnedAccounts,
      summary: {
        recent_read_count: bookingsResult.data.length,
        returned_count: returnedAccounts.length,
        total_account_count: accounts.length,
      },
      version: adminCustomerAccountsReadVersion,
    },
    ok: true,
  };
}

export async function updateAdminCustomerAccountProfile(
  input: UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminCustomerAccountSafeRecord>> {
  const allowedWriteFields = new Set(["customer_id", "display_name", "guest_account_billing_enabled"]);

  if (Object.keys(input).some((key) => !allowedWriteFields.has(key))) {
    return { error: forbiddenParamsError, ok: false, status: 400 };
  }

  const customerId = exactCustomerId(input.customer_id);
  const displayNameProvided = Object.hasOwn(input, "display_name");
  const guestAccountBillingProvided = Object.hasOwn(input, "guest_account_billing_enabled");
  const displayName = displayNameProvided ? safeCustomerFolderName(input.display_name) : null;
  const enabled = input.guest_account_billing_enabled;

  if (
    !customerId ||
    !actor?.actor_role ||
    (!displayNameProvided && !guestAccountBillingProvided) ||
    (displayNameProvided && !displayName) ||
    (guestAccountBillingProvided && typeof enabled !== "boolean")
  ) {
    return { error: malformedParamsError, ok: false, status: 400 };
  }

  const client: Pick<SupabaseClient, "from"> | null = customerDirectoryClient();

  if (!client) {
    return { error: "Admin customer directory configuration is not ready.", ok: false, status: 503 };
  }

  const updatePayload: { customer_type?: "corporate" | "hotel"; display_name?: string } = {};

  if (displayName) {
    updatePayload.display_name = displayName;
  }

  if (guestAccountBillingProvided) {
    Object.assign(updatePayload, { customer_type: enabled ? "hotel" : "corporate" });
  }

  const { data, error } = await client
    .from("customers")
    .update(updatePayload)
    .eq("id", customerId)
    .select("id, display_name, customer_type, account_status, status")
    .single();
  const record = data !== null && typeof data === "object" ? (data as UnknownRecord) : {};
  const savedCustomerId = exactCustomerId(record.id);
  const customerAccount = safeText(record.display_name, 120);

  if (error || savedCustomerId !== customerId || !customerAccount) {
    return { error: "Admin customer account profile update failed safely.", ok: false, status: 500 };
  }

  return {
    data: {
      account_scope_key: "customer_account",
      account_scope_label: null,
      completed_count: 0,
      customer_account: customerAccount,
      customer_directory_label: customerAccount,
      customer_folder_key: `${customerId}::customer_account`,
      customer_folder_active: customerDirectoryRowIsActive(record),
      customer_id: customerId,
      guest_account_billing_enabled: record.customer_type === "hotel",
      latest_booking_reference: null,
      latest_public_booking_reference: null,
      latest_pickup_at: null,
      latest_service_type: null,
      saved_booking_count: 0,
      source: "customer_directory",
      upcoming_count: 0,
      verified_company_id: null,
    },
    ok: true,
  };
}
