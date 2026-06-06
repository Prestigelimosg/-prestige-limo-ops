"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  mergeParsedBookingState,
  parseBookingMessage,
} from "../lib/booking-parser";
import {
  sanitizeAiParseResult,
  type AiParseResult,
} from "../lib/ai-parser-schema";
import { mockCustomers } from "./customers/_data/mock-customers";
import {
  calculateProfit,
  defaultChildSeatCustomerSurcharge,
  defaultChildSeatDriverPayout,
  defaultCustomerRates,
  defaultDriverPayoutRules,
  initialRateSettings,
  normalizeBookingType,
  normalizeChildSeatCount,
  normalizeExtraStopCount,
  numericRate,
  payoutAmountFromRule,
  resolvePricing,
  type DriverPayoutRule,
  type DriverPayoutRules,
  type RateRules,
  type RateSettings,
} from "../lib/pricing";
import { mockDriverJobTokens } from "../lib/driver-job-link-mock-tokens";

const adminLegacyDataPurpose = "admin-booking-persistence";
const adminLegacyTables = {
  bookers: "bookers",
  bookings: "bookings",
  companies: "companies",
  drivers: "drivers",
  rateSettings: "rate_settings",
  savedAddresses: "saved_addresses",
  travelers: "travelers",
} as const;

const adminBookingSelectColumns = [
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
  "companies(company_name, domain)",
  "bookers(booker_name, email, phone)",
  "travelers(traveler_name)",
].join(", ");

type AdminLegacyDataTable = (typeof adminLegacyTables)[keyof typeof adminLegacyTables];
type AdminLegacyDataMode = "delete" | "insert" | "select" | "update" | "upsert";
type AdminLegacyDataFilterOperator = "eq" | "ilike";
type AdminLegacyDataResult<T = unknown> = {
  data: T | null;
  error: { code?: string; message: string } | null;
};

type AdminLegacyDataFilter = {
  column: string;
  operator: AdminLegacyDataFilterOperator;
  value: string | number | boolean | null;
};

type AdminLegacyDataOrder = {
  ascending: boolean;
  column: string;
};

function adminLegacyDataError(message: string): AdminLegacyDataResult {
  return {
    data: null,
    error: {
      message,
    },
  };
}

function normalizeAdminLegacyDataResponse<T>(
  payload: unknown,
  singleMode?: "maybe" | "single",
): AdminLegacyDataResult<T> {
  const rawPayload = payload as { data?: unknown; error?: unknown; message?: unknown; ok?: unknown };
  const data = rawPayload && rawPayload.ok === true && "data" in rawPayload ? rawPayload.data : payload;
  const normalizedData =
    singleMode && Array.isArray(data)
      ? (data[0] ?? null)
      : data;

  return {
    data: (normalizedData ?? null) as T | null,
    error: null,
  };
}

function readAdminLegacyDataError(payload: unknown, fallback: string) {
  const responsePayload = payload as { code?: unknown; error?: unknown; message?: unknown };
  const message =
    typeof responsePayload?.error === "string"
      ? responsePayload.error
      : typeof responsePayload?.message === "string"
        ? responsePayload.message
        : fallback;

  return {
    code: typeof responsePayload?.code === "string" ? responsePayload.code : undefined,
    message,
  };
}

class AdminLegacyDataQuery<T = unknown> implements PromiseLike<AdminLegacyDataResult<T>> {
  private filters: AdminLegacyDataFilter[] = [];
  private mode: AdminLegacyDataMode = "select";
  private orders: AdminLegacyDataOrder[] = [];
  private payload: unknown = null;
  private resultLimit: number | null = null;
  private selectedColumns: string | null = null;

  constructor(private readonly table: AdminLegacyDataTable) {}

  select(columns: string) {
    this.selectedColumns = columns;

    return this;
  }

  eq(column: string, value: string | number | boolean | null) {
    this.filters.push({ column, operator: "eq", value });

    return this;
  }

  ilike(column: string, value: string | number | boolean | null) {
    this.filters.push({ column, operator: "ilike", value });

    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });

    return this;
  }

  limit(count: number) {
    this.resultLimit = count;

    return this;
  }

  insert(payload: unknown) {
    this.mode = "insert";
    this.payload = payload;

    return this;
  }

  update(payload: unknown) {
    this.mode = "update";
    this.payload = payload;

    return this;
  }

  upsert(payload: unknown) {
    this.mode = "upsert";
    this.payload = payload;

    return this;
  }

  delete() {
    this.mode = "delete";

    return this;
  }

  single() {
    return this.execute("single");
  }

  maybeSingle() {
    return this.execute("maybe");
  }

  then<TResult1 = AdminLegacyDataResult<T>, TResult2 = never>(
    onfulfilled?: ((value: AdminLegacyDataResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private buildUrl(singleMode?: "maybe" | "single") {
    const searchParams = new URLSearchParams();

    if (this.selectedColumns) {
      searchParams.set("select", this.selectedColumns);
    }

    if (this.resultLimit) {
      searchParams.set("limit", String(this.resultLimit));
    }

    if (singleMode) {
      searchParams.set("single", singleMode);
    }

    if (this.mode === "upsert") {
      searchParams.set("upsert", "1");
    }

    for (const order of this.orders) {
      searchParams.append("order", `${order.column}.${order.ascending ? "asc" : "desc"}`);
    }

    for (const filter of this.filters) {
      searchParams.append(filter.column, `${filter.operator}.${String(filter.value ?? "")}`);
    }

    const query = searchParams.toString();

    return `/api/admin-legacy-data/rest/v1/${this.table}${query ? `?${query}` : ""}`;
  }

  private async execute(singleMode?: "maybe" | "single"): Promise<AdminLegacyDataResult<T>> {
    const methodByMode: Record<AdminLegacyDataMode, string> = {
      delete: "DELETE",
      insert: "POST",
      select: "GET",
      update: "PATCH",
      upsert: "POST",
    };
    const method = methodByMode[this.mode];
    const hasBody = ["PATCH", "POST"].includes(method);

    try {
      const response = await fetch(this.buildUrl(singleMode), {
        ...(hasBody ? { body: JSON.stringify(this.payload ?? {}) } : {}),
        headers: {
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          "x-prestige-admin-purpose": adminLegacyDataPurpose,
        },
        method,
      });
      const responseBody = await response.json().catch(() => null);

      if (!response.ok) {
        const error = readAdminLegacyDataError(responseBody, "Admin data request failed.");

        return {
          data: null,
          error,
        } as AdminLegacyDataResult<T>;
      }

      return normalizeAdminLegacyDataResponse<T>(responseBody, singleMode);
    } catch {
      return adminLegacyDataError("Admin data request failed.") as AdminLegacyDataResult<T>;
    }
  }
}

function createAdminLegacyDataClient() {
  if (typeof fetch !== "function") {
    return null;
  }

  return {
    from<T = unknown>(table: AdminLegacyDataTable) {
      return new AdminLegacyDataQuery<T>(table);
    },
  };
}

const adminLegacyDataClient = createAdminLegacyDataClient();

type BookingForm = {
  company: string;
  bookingType: string;
  vehicle: string;
  date: string;
  time: string;
  flight: string;
  pickup: string;
  dropoff: string;
  booker: string;
  bookerContact: string;
  bookerEmail: string;
  name: string;
  pax: string;
  childSeatRequired: string;
  childSeatCount: string;
  childSeatType: string;
  extraStopCount: string;
  extraStopLocation: string;
  manualExtraCharges: string;
  manualExtraChargesNote: string;
  driverId: string;
  driverName: string;
  driverContact: string;
  driverPlate: string;
  customerPriceOverride: string;
  customerPriceOverrideReason: string;
  driverPayoutOverride: string;
  savedDriverPayoutAmount: string;
  driverPayoutReason: string;
  driverNotes: string;
  driverIncludePayout: string;
};

type CompanyRecord = {
  id: number;
  company_name: string | null;
  domain: string | null;
  customer_rates?: RateRules | null;
  driver_payout_rules?: DriverPayoutRules | null;
  transzend_excel_privacy?: boolean | null;
};

type BookerRecord = {
  id: number;
  company_id: number;
  booker_name: string | null;
  email: string | null;
  phone: string | null;
};

type CompanyIdLookupRecord = {
  company_id?: number | null;
};

type RateSettingsRecord = {
  child_seat_customer_surcharge?: number | null;
  child_seat_driver_payout?: number | null;
  customer_rates?: RateRules | null;
  driver_payout_rules?: DriverPayoutRules | null;
  extra_stop_payout?: number | null;
  extra_stop_surcharge?: number | null;
  midnight_payout?: number | null;
  midnight_surcharge?: number | null;
};

type TravelerRecord = {
  id: number;
  company_id: number;
  traveler_name: string | null;
  preferred_vehicle?: string | null;
  default_address?: string | null;
  default_pickup_address?: string | null;
  default_dropoff_address?: string | null;
  booker_id?: number | null;
  booker_name?: string | null;
  booker_contact?: string | null;
  booker_email?: string | null;
  customer_rates?: RateRules | null;
  driver_payout_rules?: DriverPayoutRules | null;
};

type SavedAddressRecord = {
  id: number;
  company_id: number | null;
  traveler_id: number | null;
  label: string | null;
  address: string | null;
  address_role: string | null;
  is_default: boolean | null;
  use_count: number | null;
};

type DriverRecord = {
  id: number;
  driver_name: string | null;
  contact_number: string | null;
  vehicle_type: string | null;
  plate_number: string | null;
  payout_preferences: string | null;
  driver_payout_rules?: DriverPayoutRules | null;
  availability_status: string | null;
  notes: string | null;
  preferred_areas: string | null;
  airport_permit_notes: string | null;
};

type DashboardDriverCandidate = {
  optionValue: string;
  driverId: number | null;
  driverName: string;
  contactNumber: string;
  vehicleType: string;
  plateNumber: string;
  availabilityStatus: string;
  notes: string;
  preferredAreas: string;
  sourceDriver: DriverRecord | null;
  searchValues: Array<string | null | undefined>;
};

type NameMemory = {
  company?: string;
  companyId?: number;
  travelerId?: number;
  savedAddress?: string;
  preferredVehicle?: string;
};

type BookingRecord = {
  id: string | number;
  company_id: number | null;
  booker_id: number | null;
  traveler_id: number | null;
  booking_type: string | null;
  vehicle: string | null;
  pickup_time: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  flight_no: string | null;
  route: string | null;
  pax: number | null;
  job_card: string | null;
  status: string | null;
  driver_id?: number | null;
  driver_name: string | null;
  driver_contact?: string | null;
  driver_plate_number?: string | null;
  customer_rate?: number | null;
  customer_rate_unit?: string | null;
  customer_price_amount?: number | null;
  customer_rate_override?: number | null;
  customer_price_override_reason?: string | null;
  driver_payout_min?: number | null;
  driver_payout_max?: number | null;
  driver_payout_amount?: number | null;
  driver_payout_override?: number | null;
  driver_payout_reason?: string | null;
  driver_payout_unit?: string | null;
  driver_notes?: string | null;
  driver_dispatch_include_payout?: boolean | null;
  midnight_surcharge?: number | null;
  midnight_payout?: number | null;
  extra_stop_count?: number | null;
  extra_stop_surcharge?: number | null;
  extra_stop_payout?: number | null;
  child_seat_required?: boolean | null;
  child_seat_count?: number | null;
  child_seat_type?: string | null;
  child_seat_customer_surcharge?: number | null;
  child_seat_driver_payout?: number | null;
  pricing_source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  companies?: {
    company_name: string | null;
    domain: string | null;
  } | null;
  bookers?: {
    booker_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  travelers?: {
    traveler_name: string | null;
  } | null;
};

type BookingStatusValue = "assigned" | "confirmed" | "driver_otw" | "pob" | "completed";

type Message = {
  tone: "info" | "success" | "error";
  text: string;
};

type RateOverrideListMessage = Message & {
  recordId?: number;
};

type DriverDeleteMessage = Message & {
  driverId: string;
};

type CopyFeedback = Message & {
  target: DispatchCopyTarget;
};

type DispatchCopyTarget = "customerCopy" | "driverDispatch" | "jobCard";

type CopyEditState = {
  draftText: string;
  editedText: string | null;
  generatedText: string;
  isEditing: boolean;
  sourceKey: string;
};

type BookingCopyTarget = "driverDispatch" | "jobCard";

type DispatchReleaseReadinessState = "needs-action" | "ready";

type DispatchReleaseChecklistItem = {
  detail: string;
  key: string;
  label: string;
  state: DispatchReleaseReadinessState;
};

type DriverAcknowledgementFollowUpStatus = "pending" | "acknowledged" | "needs-call";

type DayOfTripDispatchMonitorStatus =
  | "reminder-due"
  | "otw"
  | "ots"
  | "pob"
  | "completed"
  | "needs-call";

type DayOfTripExceptionEscalationStatus =
  | "driver-no-response"
  | "late-reminder-due"
  | "dispatcher-call"
  | "replacement-review"
  | "customer-update"
  | "closed-locally";

type DispatchRecoveryReplacementStatus =
  | "review-needed"
  | "driver-reviewed"
  | "vehicle-reviewed"
  | "copy-ready"
  | "job-link-ready"
  | "ready-locally";

type PostRecoveryUpdateStatus =
  | "review-needed"
  | "customer-copy-reviewed"
  | "driver-copy-reviewed"
  | "original-driver-reviewed"
  | "job-link-ready"
  | "eta-ready"
  | "ready-locally";

type DayOfTripCompletionHandoffStatus =
  | "review-needed"
  | "trip-completed"
  | "driver-completed"
  | "customer-closeout-ready"
  | "exception-reviewed"
  | "ready-locally";

type CompletedTripCloseoutReviewStatus =
  | "review-needed"
  | "trip-completed"
  | "driver-reviewed"
  | "customer-closeout-reviewed"
  | "exception-reviewed"
  | "billing-note-reviewed"
  | "ready-locally";

type CloseoutToBillingPreparationReviewStatus =
  | "review-needed"
  | "closeout-reviewed"
  | "account-ready"
  | "details-reviewed"
  | "extra-charges-reviewed"
  | "billing-note-reviewed"
  | "ready-locally";

type BillingPreparationExceptionReviewStatus =
  | "review-needed"
  | "missing-account"
  | "details-incomplete"
  | "extra-charges-pending"
  | "disputed-waived-charges"
  | "billing-action-required"
  | "cleared-locally";

type AdminBookingPersistenceRecord = {
  booking_reference: string;
  source_channel?: string | null;
  customer_id?: number | null;
  pickup_datetime?: string | null;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  route_type?: string | null;
  customer_display_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  pax_count?: number | null;
  luggage_count?: number | null;
  vehicle_type_or_category?: string | null;
  customer_facing_status?: string | null;
  admin_internal_status?: string | null;
  short_notice_review_status?: string | null;
  parser_source_reference?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  route_points?: Array<{
    point_type?: "pickup" | "dropoff" | "stop" | "waypoint";
    sequence_number?: number | null;
    location_text?: string | null;
    timing_note?: string | null;
  }>;
  service_items?: Array<{
    service_item_type?: "child_seat" | "extra_stop" | "waiting_time" | "midnight_charge";
    quantity?: number | null;
    blocks_count?: number | null;
  }>;
};

type AdminBookingPersistenceRequestBody = {
  booking: {
    booking_reference: string;
    source_channel: string;
    customer_id: number | null;
    pickup_datetime: string | null;
    pickup_location: string | null;
    dropoff_location: string | null;
    route_type: string | null;
    customer_display_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    pax_count: number | null;
    luggage_count: number | null;
    vehicle_type_or_category: string | null;
    customer_facing_status: string;
    admin_internal_status: string;
    short_notice_review_status: string | null;
    parser_source_reference: string | null;
  };
  route_points: NonNullable<AdminBookingPersistenceRecord["route_points"]>;
  service_items: NonNullable<AdminBookingPersistenceRecord["service_items"]>;
};

type AdminBookingPersistenceAction = "save" | "load" | "update";
type AdminCustomerRequestReviewDecisionKey =
  | "needs-review"
  | "approve-internally"
  | "decline-internally";
type AdminCustomerRequestStatusFilter =
  | "all"
  | "needs-review"
  | "approved-internally"
  | "declined-internally"
  | "short-notice-review-required";
const adminBookingPersistenceAllStatusFilter = "all";
const adminCustomerRequestAllStatusFilter: AdminCustomerRequestStatusFilter = "all";
const adminCustomerRequestReviewDecisions: Array<{
  adminInternalStatus: string;
  key: AdminCustomerRequestReviewDecisionKey;
  label: string;
  successLabel: string;
}> = [
  {
    adminInternalStatus: "Admin Review Required",
    key: "needs-review",
    label: "Needs Review",
    successLabel: "Needs Review",
  },
  {
    adminInternalStatus: "Ready for Confirmation",
    key: "approve-internally",
    label: "Approve Internally",
    successLabel: "Approved Internally",
  },
  {
    adminInternalStatus: "Declined Internally",
    key: "decline-internally",
    label: "Decline Internally",
    successLabel: "Declined Internally",
  },
];
const adminCustomerRequestStatusFilterOptions: Array<{
  key: AdminCustomerRequestStatusFilter;
  label: string;
}> = [
  { key: "all", label: "All requests" },
  { key: "needs-review", label: "Needs review" },
  { key: "approved-internally", label: "Approved internally" },
  { key: "declined-internally", label: "Declined internally" },
  { key: "short-notice-review-required", label: "Short-notice review required" },
];

type AdminBookingSnapshotApplyResult =
  | {
      booking: BookingForm;
      ok: true;
      reviewStatus: string;
    }
  | {
      error: string;
      ok: false;
    };

type AppTab = "dispatch" | "bookings" | "completed" | "dashboard" | "drivers" | "rates";

const appTabs: Array<{ id: AppTab; label: string }> = [
  { id: "dispatch", label: "Dispatch" },
  { id: "bookings", label: "Bookings" },
  { id: "completed", label: "Completed" },
  { id: "dashboard", label: "Dashboard" },
  { id: "drivers", label: "Drivers" },
  { id: "rates", label: "Rates" },
];

const adminAccessLinks = [
  { href: "/", label: "Admin Home" },
  { href: "/book", label: "Book Request" },
  { href: "/my-bookings", label: "My Bookings" },
  { href: "/customers", label: "Customers" },
  { href: "/driver-job-demo", label: "Driver Demo" },
  { href: "/driver-job/mock-driver-job-valid-a", label: "Token Demo" },
] as const;

type AiDraftBooking = AiParseResult["bookings"][number];

type ParsedBooking = Partial<BookingForm> & {
  success?: boolean;
  cleanedLines?: string[];
  extractedBookingsPreview?: Array<{
    passenger?: string;
    company?: string;
    booker?: string;
    vehicle?: string;
    date?: string;
    time?: string;
    type?: string;
    flight?: string;
    pickup?: string;
    dropoff?: string;
    pax?: string;
  }>;
  parserWarning?: string;
  multipleBookingsDetected?: boolean;
};
type ParsedDebugBooking = BookingForm & {
  success?: boolean;
  cleanedLines?: string[];
  extractedBookingsPreview?: Array<{
    passenger?: string;
    company?: string;
    booker?: string;
    vehicle?: string;
    date?: string;
    time?: string;
    type?: string;
    flight?: string;
    pickup?: string;
    dropoff?: string;
    pax?: string;
  }>;
  parserWarning?: string;
  multipleBookingsDetected?: boolean;
};

type CustomerMatchConfidence = "High" | "Medium" | "Needs review";
type CustomerMatchSuggestedAction =
  | "Create new customer folder"
  | "Leave unlinked"
  | "Link to existing customer"
  | "Update existing customer contact";

type MockCustomerMatchSuggestion = {
  confidence: CustomerMatchConfidence;
  customerId: string | null;
  customerName: string;
  isExistingCustomer: boolean;
  matchReason: string;
  suggestedAction: CustomerMatchSuggestedAction;
};

type CustomerMatchFeedback = Message & {
  action: "create" | "leave" | "link";
};

type DriverDraft = {
  driverId: string;
  driverSearch: string;
  driverName: string;
  driverContact: string;
  driverPlate: string;
  payoutOverride: string;
  payoutReason: string;
  notes: string;
  includePayout: boolean;
};

type RateOverrideDraft = {
  companyName: string;
  bossName: string;
  customerRates: RateRules;
  driverPayoutRules: DriverPayoutRules;
  transzendExcelPrivacy: boolean;
};

type DriverProfileDraft = {
  driverId: string;
  driverName: string;
  contactNumber: string;
  vehicleType: string;
  plateNumber: string;
  payoutPreferences: string;
  availabilityStatus: string;
  notes: string;
  preferredAreas: string;
  airportPermitNotes: string;
  payoutRules: DriverPayoutRules;
};

type ReplacementDriverDraft = {
  driverName: string;
  driverContact: string;
  carPlate: string;
  vehicleModel: string;
  reason: string;
  note: string;
};

type ReplacementDriverFeedback = Message & {
  action: string;
};

function getAssignedDriverSummary(bookingRecord: BookingRecord, driverDraft?: DriverDraft) {
  return {
    contact: clean(bookingRecord.driver_contact) || clean(driverDraft?.driverContact),
    name: clean(bookingRecord.driver_name) || clean(driverDraft?.driverName) || "—",
    plate: clean(bookingRecord.driver_plate_number) || clean(driverDraft?.driverPlate),
    vehicle: clean(bookingRecord.vehicle),
  };
}

function AssignedDriverSummaryBlock({
  bookingRecord,
  driverDraft,
  flush = false,
}: {
  bookingRecord: BookingRecord;
  driverDraft?: DriverDraft;
  flush?: boolean;
}) {
  const driverSummary = getAssignedDriverSummary(bookingRecord, driverDraft);

  return (
    <div
      className={`${flush ? "" : "mt-2 "}rounded-md border border-sky-100 bg-sky-50/70 px-3 py-2 text-sm text-slate-700`}
      data-assigned-driver-summary={String(bookingRecord.id)}
    >
      <p className="font-semibold text-sky-950">Assigned Driver</p>
      <div className="mt-1 space-y-1">
        <p className="break-words">Driver: {driverSummary.name}</p>
        {driverSummary.contact ? (
          <p className="break-words">Driver contact: {driverSummary.contact}</p>
        ) : null}
        {driverSummary.vehicle ? <p className="break-words">Vehicle: {driverSummary.vehicle}</p> : null}
        {driverSummary.plate ? <p className="break-words">Car plate: {driverSummary.plate}</p> : null}
      </div>
    </div>
  );
}

function DispatcherStatusSummaryBlock({
  bookingRecord,
  flush = false,
}: {
  bookingRecord: BookingRecord;
  flush?: boolean;
}) {
  return (
    <div
      className={`${flush ? "" : "mt-2 "}rounded-md border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm text-slate-700`}
      data-dispatcher-status-summary={String(bookingRecord.id)}
    >
      <p className="font-semibold text-emerald-950">Dispatcher Status</p>
      <p className="mt-1 break-words">Status: {bookingStatusLabel(bookingRecord.status)}</p>
    </div>
  );
}

function getOperationalReadinessSummary(bookingRecord: BookingRecord) {
  const normalizedStatus = clean(bookingRecord.status).toLowerCase();
  const hasDriver = hasBookingDriver(bookingRecord);

  const otsProof =
    normalizedStatus === "completed"
      ? "Expected before completion"
      : normalizedStatus === "pob"
        ? "Expected before POB"
        : normalizedStatus === "driver_otw"
          ? "Needed when driver reaches OTS"
          : "Pending OTS step";
  const exceptionReplacement =
    normalizedStatus === "cancelled"
      ? "Review replacement needed"
      : hasDriver
        ? "No replacement recorded"
        : "Driver TBC";

  return {
    exceptionReplacement,
    otsProof,
  };
}

function OperationalReadinessSummaryBlock({
  bookingRecord,
  flush = false,
}: {
  bookingRecord: BookingRecord;
  flush?: boolean;
}) {
  const readinessSummary = getOperationalReadinessSummary(bookingRecord);

  return (
    <div
      className={`${flush ? "" : "mt-2 "}rounded-md border border-amber-100 bg-amber-50/70 px-3 py-2 text-sm text-slate-700`}
      data-operational-readiness-summary={String(bookingRecord.id)}
    >
      <p className="font-semibold text-amber-950">Operational Readiness</p>
      <div className="mt-1 space-y-1">
        <p className="break-words">OTS Proof: {readinessSummary.otsProof}</p>
        <p className="break-words">
          Exception / Replacement: {readinessSummary.exceptionReplacement}
        </p>
        <p className="text-xs text-slate-500">Mock/local checklist only.</p>
      </div>
    </div>
  );
}

function OperationalCardSection({
  children,
  className = "",
  section,
  title,
}: {
  children: ReactNode;
  className?: string;
  section: string;
  title: string;
}) {
  return (
    <section
      className={`border-t border-stone-200 pt-2 first:border-t-0 first:pt-0 ${className}`}
      data-operational-card-section={section}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</p>
      <div className="mt-1 space-y-1 text-sm text-slate-700">{children}</div>
    </section>
  );
}

const initialRateOverrideDraft: RateOverrideDraft = {
  companyName: "",
  bossName: "",
  customerRates: {},
  driverPayoutRules: {},
  transzendExcelPrivacy: false,
};

const initialDriverProfileDraft: DriverProfileDraft = {
  driverId: "",
  driverName: "",
  contactNumber: "",
  vehicleType: "",
  plateNumber: "",
  payoutPreferences: "",
  availabilityStatus: "available",
  notes: "",
  preferredAreas: "",
  airportPermitNotes: "",
  payoutRules: {},
};

const initialReplacementDriverDraft: ReplacementDriverDraft = {
  driverName: "",
  driverContact: "",
  carPlate: "",
  vehicleModel: "",
  reason: "breakdown",
  note: "",
};

const replacementDriverActions = [
  {
    feedback:
      "Mock replacement details saved locally only. No booking, driver assignment, dispatch, Supabase row, or notification was updated.",
    key: "save",
    label: "Save Replacement Details — Mock Only",
  },
  {
    feedback:
      "Mock cancellation note recorded locally only. The current driver assignment was not cancelled in any live system.",
    key: "cancel",
    label: "Mark Current Driver Cancelled — Mock Only",
  },
  {
    feedback:
      "Future staff reassign placeholder acknowledged locally only. No reassign API, dispatch update, or Supabase write was called.",
    key: "reassign",
    label: "Reassign Replacement Later — Future Staff Workflow",
  },
];

const telegramAlertPreviewSafetyText =
  "Mock/local only. Does not send Telegram, WhatsApp, SMS, or email. Does not update booking, driver status, Supabase, notification logs, or customer/driver records.";

const telegramAlertPreviewTemplates = [
  {
    key: "assignment",
    label: "New driver job assignment",
    messageLines: [
      "Job MOCK-JOB-042: New assignment ready for review.",
      "Pickup: 27 May 2026, 1530hrs.",
      "Location: Changi Airport T3 Arrival Pickup.",
      "Type: MNG / Arrival.",
      "Open secure job link: [secure job link placeholder].",
    ],
  },
  {
    key: "acknowledgement",
    label: "Driver acknowledgement reminder",
    messageLines: [
      "Job MOCK-JOB-042: Please acknowledge this assignment in Prestige Limo Ops.",
      "Pickup: 27 May 2026, 1530hrs.",
      "Location: Changi Airport T3 Arrival Pickup.",
      "Type: MNG / Arrival.",
      "Open secure job link: [secure job link placeholder].",
    ],
  },
  {
    key: "one-hour",
    label: "1-hour before pickup reminder",
    messageLines: [
      "Job MOCK-JOB-042: Pickup is in about 1 hour.",
      "Pickup: 27 May 2026, 1530hrs.",
      "Location: Changi Airport T3 Arrival Pickup.",
      "Type: MNG / Arrival.",
      "Open secure job link: [secure job link placeholder].",
    ],
  },
  {
    key: "otw",
    label: "OTW reminder",
    messageLines: [
      "Job MOCK-JOB-042: Please update OTW in the secure job link when you are on the way.",
      "Pickup: 27 May 2026, 1530hrs.",
      "Location: Changi Airport T3 Arrival Pickup.",
      "Type: MNG / Arrival.",
      "Open secure job link: [secure job link placeholder].",
    ],
  },
  {
    key: "ots",
    label: "OTS reminder",
    messageLines: [
      "Job MOCK-JOB-042: Please update OTS in the secure job link once you are on the spot.",
      "Pickup: 27 May 2026, 1530hrs.",
      "Location: Changi Airport T3 Arrival Pickup.",
      "Type: MNG / Arrival.",
      "Open secure job link: [secure job link placeholder].",
    ],
  },
  {
    key: "pob",
    label: "POB reminder",
    messageLines: [
      "Job MOCK-JOB-042: Please update POB in the secure job link after passenger on board.",
      "Pickup: 27 May 2026, 1530hrs.",
      "Location: Changi Airport T3 Arrival Pickup.",
      "Type: MNG / Arrival.",
      "Open secure job link: [secure job link placeholder].",
    ],
  },
  {
    key: "completed",
    label: "Job Completed reminder",
    messageLines: [
      "Job MOCK-JOB-042: Please mark Job Completed in the secure job link after drop-off.",
      "Pickup: 27 May 2026, 1530hrs.",
      "Location: Changi Airport T3 Arrival Pickup.",
      "Type: MNG / Arrival.",
      "Open secure job link: [secure job link placeholder].",
    ],
  },
  {
    key: "replacement",
    label: "Dispatcher replacement alert",
    messageLines: [
      "Job MOCK-JOB-042: Dispatcher replacement review needed.",
      "Pickup: 27 May 2026, 1530hrs.",
      "Location: Changi Airport T3 Arrival Pickup.",
      "Type: MNG / Arrival.",
      "Open secure job link: [secure job link placeholder].",
    ],
  },
] as const;

type TelegramAlertPreviewType = (typeof telegramAlertPreviewTemplates)[number]["key"];

const rateBookingTypes: Array<keyof Required<RateRules>> = ["MNG", "DEP", "TRF", "DSP"];

const rateLabels: Record<keyof Required<RateRules>, string> = {
  MNG: "MNG / Arrival",
  DEP: "DEP / Departure",
  TRF: "TRF / Transfer",
  DSP: "DSP / Hourly",
};

const customerBookingTypeLabels: Record<keyof Required<RateRules>, string> = {
  MNG: "Arrival",
  DEP: "Departure",
  TRF: "City Transfer",
  DSP: "Hourly",
};

const customerLiveLocationEligibleTypes = new Set<ReturnType<typeof normalizeBookingType>>([
  "DEP",
  "TRF",
  "DSP",
]);

const customerLiveLocationWindowMs = 30 * 60 * 1000;

const dispatchCopyLabels: Record<DispatchCopyTarget, string> = {
  customerCopy: "Customer copy",
  driverDispatch: "Driver dispatch",
  jobCard: "Job card",
};

const mockDriverJobPath = `/driver-job/${mockDriverJobTokens.validA}`;
const fallbackDriverJobUrl = `http://localhost:3000${mockDriverJobPath}`;
const configuredDriverJobBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";

function normalizePublicBaseUrl(value: string) {
  const cleanValue = value.trim();

  if (!cleanValue) {
    return "";
  }

  try {
    return new URL(cleanValue).origin;
  } catch {
    return "";
  }
}

function getDriverJobBaseUrl() {
  const configuredBaseUrl = normalizePublicBaseUrl(configuredDriverJobBaseUrl);

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

function getDriverJobUrl() {
  return new URL(mockDriverJobPath, getDriverJobBaseUrl()).toString();
}

function subscribeToDriverJobUrlChange() {
  return () => {};
}

function createInitialCopyEditStates(): Record<DispatchCopyTarget, CopyEditState> {
  return {
    customerCopy: { draftText: "", editedText: null, generatedText: "", isEditing: false, sourceKey: "" },
    driverDispatch: { draftText: "", editedText: null, generatedText: "", isEditing: false, sourceKey: "" },
    jobCard: { draftText: "", editedText: null, generatedText: "", isEditing: false, sourceKey: "" },
  };
}

const childSeatTypeOptions = [
  "infant seat",
  "toddler seat",
  "booster seat",
  "customer did not specify",
] as const;

const publicEmailDomains = new Set([
  "126.com",
  "163.com",
  "aol.com",
  "daum.net",
  "fastmail.com",
  "gmail.com",
  "gmx.com",
  "gmx.net",
  "googlemail.com",
  "hanmail.net",
  "hey.com",
  "hotmail.com",
  "icloud.com",
  "kakao.com",
  "live.com",
  "mac.com",
  "mail.com",
  "me.com",
  "msn.com",
  "naver.com",
  "outlook.com",
  "pm.me",
  "proton.me",
  "protonmail.com",
  "qq.com",
  "rediffmail.com",
  "rocketmail.com",
  "sina.com",
  "tutanota.com",
  "tutamail.com",
  "yahoo.com",
  "yahoo.com.sg",
  "yandex.com",
  "yandex.ru",
  "ymail.com",
  "zoho.com",
]);
const internalPrestigeEmailDomains = new Set([
  "prestige-limo.sg",
  "prestigelimo.sg",
  "prestigetransport.sg",
]);
const internalPrestigeAccountTokens = new Set([
  "prestige-limo",
  "prestigelimo",
  "prestigetransport",
]);

const requiredFields: Array<keyof BookingForm> = [
  "date",
  "time",
  "pickup",
  "dropoff",
  "booker",
];

function createInitialBooking(): BookingForm {
  return {
    company: "",
    bookingType: "MNG",
    vehicle: "AVF",
    date: "",
    time: "",
    flight: "",
    pickup: "",
    dropoff: "",
    booker: "",
    bookerContact: "",
    bookerEmail: "",
    name: "",
    pax: "1",
    childSeatRequired: "",
    childSeatCount: "",
    childSeatType: "",
    extraStopCount: "",
    extraStopLocation: "",
    manualExtraCharges: "",
    manualExtraChargesNote: "",
    driverId: "",
    driverName: "",
    driverContact: "",
    driverPlate: "",
    customerPriceOverride: "",
    customerPriceOverrideReason: "",
    driverPayoutOverride: "",
    savedDriverPayoutAmount: "",
    driverPayoutReason: "",
    driverNotes: "",
    driverIncludePayout: "",
  };
}

const fieldLabels: Record<keyof BookingForm, string> = {
  company: "Company / Account",
  bookingType: "Booking type",
  vehicle: "Vehicle",
  date: "Pickup date",
  time: "Pickup time",
  flight: "Flight number",
  pickup: "Pickup",
  dropoff: "Drop-off",
  booker: "Booker",
  bookerContact: "Booker WhatsApp / Contact",
  bookerEmail: "Booker email (optional)",
  name: "Passenger name",
  pax: "Pax",
  childSeatRequired: "Child seat required",
  childSeatCount: "Child seat count",
  childSeatType: "Child seat type",
  extraStopCount: "Extra stops",
  extraStopLocation: "Extra stop location",
  manualExtraCharges: "Extra Charges",
  manualExtraChargesNote: "Extra Charges note / reason",
  driverId: "Driver",
  driverName: "Driver Name",
  driverContact: "Driver Contact",
  driverPlate: "Driver Car Plate",
  customerPriceOverride: "Customer price override",
  customerPriceOverrideReason: "Customer override reason",
  driverPayoutOverride: "Driver payout override",
  savedDriverPayoutAmount: "Saved driver payout amount",
  driverPayoutReason: "Override reason",
  driverNotes: "Driver notes",
  driverIncludePayout: "Include payout in dispatch",
};

const fieldOrder: Array<keyof BookingForm> = [
  "company",
  "bookingType",
  "vehicle",
  "date",
  "time",
  "flight",
  "pickup",
  "dropoff",
  "booker",
  "bookerContact",
  "bookerEmail",
  "name",
  "pax",
];

function clean(value: string | null | undefined) {
  return (value ?? "").trim();
}

function isInactiveDriver(driver: DriverRecord | null | undefined) {
  return clean(driver?.availability_status).toLowerCase() === "inactive";
}

function isAssignableDriver(driver: DriverRecord) {
  return !isInactiveDriver(driver);
}

function hasBookingDriver(bookingRecord: Pick<BookingRecord, "driver_id" | "driver_name">) {
  return Boolean(bookingRecord.driver_id || clean(bookingRecord.driver_name));
}

function undoCompletedStatus(
  bookingRecord: Pick<BookingRecord, "driver_id" | "driver_name">,
): BookingStatusValue {
  return hasBookingDriver(bookingRecord) ? "assigned" : "confirmed";
}

function revertOtwStatus(
  bookingRecord: Pick<BookingRecord, "driver_id" | "driver_name">,
): BookingStatusValue {
  return hasBookingDriver(bookingRecord) ? "assigned" : "confirmed";
}

function statusAfterClearingAssignedDriver(status: string | null) {
  return clean(status).toLowerCase() === "completed" ? "completed" : "confirmed";
}

function bookingStatusLabel(status: string | null) {
  const normalizedStatus = clean(status).toLowerCase();

  if (normalizedStatus === "confirmed") {
    return "Confirmed";
  }

  if (normalizedStatus === "assigned") {
    return "Assigned";
  }

  if (normalizedStatus === "driver_otw") {
    return "Driver OTW";
  }

  if (normalizedStatus === "pob") {
    return "POB";
  }

  if (normalizedStatus === "completed") {
    return "Completed";
  }

  if (normalizedStatus === "cancelled") {
    return "Cancelled";
  }

  return clean(status) || "Pending";
}

function isMarkCompletionMessage(message: Message | null | undefined) {
  return Boolean(
    message &&
      (message.text === "Marking booking completed..." ||
        message.text === "Booking marked completed." ||
        message.text.startsWith("Mark completed failed")),
  );
}

function isUndoCompletionMessage(message: Message | null | undefined) {
  return Boolean(
    message &&
      (message.text === "Undoing completion..." ||
        message.text === "Completion undone." ||
        message.text.startsWith("Undo completed failed")),
  );
}

function isDeleteCompletedJobMessage(message: Message | null | undefined) {
  return Boolean(
    message &&
      (message.text === "Delete cancelled." ||
        message.text === "Deleting completed job..." ||
        message.text === "Completed job deleted." ||
        message.text.startsWith("Delete completed job failed")),
  );
}

function isDashboardStatusMessage(message: Message | null | undefined) {
  if (!message) {
    return false;
  }

  return (
    isMarkCompletionMessage(message) ||
    message.text === "Marking driver OTW..." ||
    message.text === "Driver marked OTW." ||
    message.text.startsWith("Mark OTW failed") ||
    message.text === "Marking passenger on board..." ||
    message.text === "Passenger on board." ||
    message.text.startsWith("Mark POB failed") ||
    message.text === "Reverting status..." ||
    message.text === "Status reverted." ||
    message.text.startsWith("Revert status failed")
  );
}

function getNeedsReviewWarnings(booking: BookingForm) {
  const warnings: string[] = [];
  const bookingType = normalizeBookingType(booking.bookingType);
  const paxValue = Number(clean(booking.pax));
  const customerPriceOverride = clean(booking.customerPriceOverride);
  const customerPriceOverrideValue = Number(customerPriceOverride);

  if (!clean(booking.date)) {
    warnings.push("Missing pickup date");
  }

  if (!clean(booking.time)) {
    warnings.push("Missing pickup time");
  }

  if (!clean(booking.pickup)) {
    warnings.push("Missing pickup");
  }

  if (!clean(booking.dropoff)) {
    warnings.push("Missing drop-off");
  }

  if (!clean(booking.bookingType)) {
    warnings.push("Missing booking type");
  }

  if (!clean(booking.vehicle)) {
    warnings.push("Missing vehicle");
  }

  if (!clean(booking.pax) || !Number.isFinite(paxValue) || paxValue < 1) {
    warnings.push("Missing or invalid pax");
  }

  if (!clean(booking.name)) {
    warnings.push("Missing traveler / name");
  }

  if (bookingType === "MNG" && !clean(booking.flight)) {
    warnings.push("Missing flight for arrival");
  }

  if (normalizeExtraStopCount(booking.extraStopCount) > 0 && !clean(booking.extraStopLocation)) {
    warnings.push("Extra stop location missing");
  }

  if (
    clean(booking.childSeatRequired) === "yes" &&
    normalizeChildSeatCount(booking.childSeatRequired, booking.childSeatCount) < 1
  ) {
    warnings.push("Child seat count missing");
  }

  if (
    customerPriceOverride &&
    (!Number.isFinite(customerPriceOverrideValue) || customerPriceOverrideValue < 0)
  ) {
    warnings.push("Quoted price override is not a valid number");
  }

  return warnings;
}

function getDispatchReleaseTripWarnings(booking: BookingForm) {
  const warnings: string[] = [];
  const bookingType = normalizeBookingType(booking.bookingType);
  const paxValue = Number(clean(booking.pax));

  if (!clean(booking.date)) {
    warnings.push("Pickup date missing");
  }

  if (!clean(booking.time)) {
    warnings.push("Pickup time missing");
  }

  if (!clean(booking.pickup)) {
    warnings.push("Pickup missing");
  }

  if (!clean(booking.dropoff)) {
    warnings.push("Drop-off missing");
  }

  if (!clean(booking.bookingType)) {
    warnings.push("Service type missing");
  }

  if (!clean(booking.vehicle)) {
    warnings.push("Vehicle missing");
  }

  if (!clean(booking.pax) || !Number.isFinite(paxValue) || paxValue < 1) {
    warnings.push("Passenger count missing");
  }

  if (!clean(booking.name)) {
    warnings.push("Passenger name missing");
  }

  if (bookingType === "MNG" && !clean(booking.flight)) {
    warnings.push("Arrival flight missing");
  }

  if (normalizeExtraStopCount(booking.extraStopCount) > 0 && !clean(booking.extraStopLocation)) {
    warnings.push("Extra stop location missing");
  }

  if (
    clean(booking.childSeatRequired) === "yes" &&
    normalizeChildSeatCount(booking.childSeatRequired, booking.childSeatCount) < 1
  ) {
    warnings.push("Child seat count missing");
  }

  return warnings;
}

function getReviewAcceptanceKey(booking: BookingForm, warnings = getNeedsReviewWarnings(booking)) {
  return JSON.stringify({
    booking,
    warnings,
  });
}

function formatPrivacySafePlace(value: string | null | undefined, fallback: string) {
  const text = clean(value);

  if (!text) {
    return fallback;
  }

  const sanitized = text
    .replace(/(?:^|[,\s])#\s*[a-z0-9]+(?:[-/][a-z0-9]+)?/gi, " ")
    .replace(/\b(?:unit|floor|level|lvl)\s*#?\s*[a-z0-9]+(?:[-/][a-z0-9]+)?/gi, " ")
    .replace(/\b(?:blk|block)\s*\d+[a-z]?\b/gi, " ")
    .replace(/\b(?:postal|singapore)\s*\d{5,6}\b/gi, " ")
    .replace(/\b\d{5,6}\b/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^,+\s*/, "")
    .replace(/^\d+[a-z]?(?:[-/]\d+[a-z]?)?\s+/i, "")
    .replace(/^,+\s*/, "")
    .trim();
  const firstSafeSegment = sanitized
    .split(",")
    .map((part) => clean(part))
    .find(Boolean);

  return firstSafeSegment || fallback;
}

type ItineraryDisplayStop = {
  location: string;
  time: string;
};

function formatItineraryTimeForDispatch(value: string) {
  const compactTime = clean(value).replace(/\s+/g, "").toLowerCase();
  const amPmMatch = compactTime.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)$/);

  if (amPmMatch) {
    let hour = Number(amPmMatch[1]);
    const minute = amPmMatch[2] || "00";

    if (amPmMatch[3] === "pm" && hour < 12) {
      hour += 12;
    }

    if (amPmMatch[3] === "am" && hour === 12) {
      hour = 0;
    }

    return `${String(hour).padStart(2, "0")}${minute}hrs`;
  }

  return formatPickupTime(compactTime);
}

function formatDriverItineraryLocation(value: string) {
  const sanitized = clean(value)
    .replace(/\s*,?\s*#\s*[a-z0-9]+(?:[-/][a-z0-9]+)?\s*,?\s*/gi, ", ")
    .replace(/\bSingapore\s+\d{5,6}\b/gi, "")
    .replace(/\b\d{5,6}\b/g, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/,\s*$/g, "")
    .replace(/^,\s*/g, "")
    .trim();
  const parts = sanitized
    .split(",")
    .map((part) => clean(part))
    .filter((part) => part && !/^singapore$/i.test(part));

  if (parts.length <= 1) {
    return parts[0] || sanitized;
  }

  if (/^\d+[a-z]?\b/i.test(parts[0]) && /\b(?:square|hotel|office|atrium|sands)\b/i.test(parts[1])) {
    return `${parts[1]}, ${parts[0]}`;
  }

  const namedLandmark =
    parts.find((part, index) => index > 0 && part.includes("@")) ||
    parts.find((part, index) => index > 0 && /\b(?:tower|square|hotel|atrium|sands|bay)\b/i.test(part));

  if (namedLandmark) {
    return `${parts[0]}, ${namedLandmark}`;
  }

  return parts.slice(0, 2).join(", ");
}

function parseItineraryDisplayStops(value: string) {
  const rawStops = clean(value)
    .split(/\s*>\s*/g)
    .map((part) => clean(part))
    .filter(Boolean);

  if (rawStops.length < 2) {
    return [];
  }

  const stops = rawStops
    .map((rawStop): ItineraryDisplayStop => {
      const stopMatch = rawStop.match(/^(.+?)\s+(?:at|by)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{3,4}\s*hrs?)$/i);

      if (!stopMatch?.[1] || !stopMatch[2]) {
        return {
          location: formatDriverItineraryLocation(rawStop),
          time: "",
        };
      }

      return {
        location: formatDriverItineraryLocation(stopMatch[1]),
        time: formatItineraryTimeForDispatch(stopMatch[2]),
      };
    })
    .filter((stop) => clean(stop.location));
  const timedStopCount = stops.filter((stop) => clean(stop.time)).length;

  return timedStopCount >= 2 ? stops : [];
}

function isDspMultiStopItineraryBooking(
  bookingValue: Pick<BookingForm, "bookingType" | "extraStopCount" | "extraStopLocation">,
  itineraryStops = parseItineraryDisplayStops(bookingValue.extraStopLocation),
) {
  return clean(bookingValue.bookingType).toUpperCase() === "DSP" &&
    normalizeExtraStopCount(bookingValue.extraStopCount) >= 2 &&
    itineraryStops.length >= 2;
}

function formatPrivacySafeRoute(
  bookingValue: Pick<BookingForm, "bookingType" | "pickup" | "extraStopCount" | "extraStopLocation" | "dropoff">,
) {
  const pickup = formatPrivacySafePlace(bookingValue.pickup, "Pickup");
  const dropoff = formatPrivacySafePlace(bookingValue.dropoff, "Drop-off");
  const itineraryStops = parseItineraryDisplayStops(bookingValue.extraStopLocation);

  if (isDspMultiStopItineraryBooking(bookingValue, itineraryStops)) {
    return [pickup, "Multi-stop itinerary hidden for privacy", dropoff].filter(Boolean).join(" > ");
  }

  const extraStopParts = clean(bookingValue.extraStopLocation)
    .split(/\s*>\s*/g)
    .map((stop) => formatPrivacySafePlace(stop, "Extra stop"))
    .filter((stop) => stop && stop !== "Extra stop");

  return [pickup, ...extraStopParts, dropoff].filter(Boolean).join(" > ");
}

function hasParsedValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return clean(value).length > 0;
  }

  return value !== null && value !== undefined;
}

function normaliseEmail(value: string) {
  return clean(value).toLowerCase();
}

function normaliseEmailDomain(value: string | null | undefined) {
  return clean(value).toLowerCase().replace(/^www\./, "");
}

function isPublicEmailDomain(value: string | null | undefined) {
  const domain = normaliseEmailDomain(value);

  return Boolean(domain && publicEmailDomains.has(domain));
}

function isInternalPrestigeEmailDomain(value: string | null | undefined) {
  const domain = normaliseEmailDomain(value);

  return Boolean(domain && internalPrestigeEmailDomains.has(domain));
}

function isIgnoredAccountEmailDomain(value: string | null | undefined) {
  return isPublicEmailDomain(value) || isInternalPrestigeEmailDomain(value);
}

function isInternalPrestigeAccount(value: string | null | undefined) {
  const account = clean(value).toLowerCase().replace(/\s+/g, "");

  return Boolean(account && internalPrestigeAccountTokens.has(account));
}

function getPublicEmailLocalPart(value: string | null | undefined) {
  const email = normaliseEmail(value ?? "");
  const [localPart, domain] = email.split("@");

  return localPart && isPublicEmailDomain(domain) ? localPart : "";
}

function getEmailDomain(value: string) {
  const email = normaliseEmail(value);
  const domain = normaliseEmailDomain(email.split("@")[1]);

  return isIgnoredAccountEmailDomain(domain) ? "" : domain;
}

function normalizeCompanyAccount(value: string | null | undefined, email: string | null | undefined = "") {
  const companyName = clean(value);
  const publicEmailLocalPart = getPublicEmailLocalPart(email);

  if (
    !companyName ||
    isIgnoredAccountEmailDomain(companyName) ||
    isInternalPrestigeAccount(companyName) ||
    (publicEmailLocalPart && companyName.toLowerCase() === publicEmailLocalPart)
  ) {
    return "";
  }

  return companyName;
}

const mockCustomerDomainMatches = new Map([
  ["marriott.com", "ritz-carlton"],
  ["ritzcarlton.com", "ritz-carlton"],
  ["ritzcarlton.com.sg", "ritz-carlton"],
  ["ubs.com", "ubs"],
  ["ubs.com.sg", "ubs"],
]);

function findMockCustomerById(customerId: string | null | undefined) {
  return mockCustomers.find((customer) => customer.id === customerId) ?? null;
}

function findMockCustomerByText(value: string | null | undefined, onlyIndividual = false) {
  const query = normalizeCompactSearch(value);

  if (!query) {
    return null;
  }

  return (
    mockCustomers.find((customer) => {
      if (onlyIndividual && clean(customer.accountType).toLowerCase() !== "individual") {
        return false;
      }

      const searchableValues = [
        customer.companyName,
        customer.id,
        customer.invoicePrefix,
      ].map(normalizeCompactSearch);

      return searchableValues.some(
        (candidate) => candidate && (candidate === query || candidate.includes(query) || query.includes(candidate)),
      );
    }) ?? null
  );
}

function findMockCustomerByEmailDomain(domain: string | null | undefined) {
  const emailDomain = normaliseEmailDomain(domain);
  const mappedCustomer = findMockCustomerById(mockCustomerDomainMatches.get(emailDomain));

  if (mappedCustomer) {
    return mappedCustomer;
  }

  return findMockCustomerByText(emailDomain.replace(/\.[a-z]{2,}$/i, ""));
}

function getMockCustomerMatchSuggestion(bookingValue: BookingForm): MockCustomerMatchSuggestion {
  const safeCompany = normalizeCompanyAccount(bookingValue.company, bookingValue.bookerEmail);
  const email = normaliseEmail(bookingValue.bookerEmail);
  const rawEmailDomain = normaliseEmailDomain(email.split("@")[1]);
  const organizationEmailDomain = getEmailDomain(email);
  const hasPublicEmail = Boolean(rawEmailDomain && isPublicEmailDomain(rawEmailDomain));
  const personName = clean(bookingValue.name) || clean(bookingValue.booker);
  const contactValue = clean(bookingValue.bookerEmail) || clean(bookingValue.bookerContact);
  const companyMatch = findMockCustomerByText(safeCompany);

  if (organizationEmailDomain) {
    const domainMatch = findMockCustomerByEmailDomain(organizationEmailDomain);

    if (domainMatch) {
      return {
        confidence: "High",
        customerId: domainMatch.id,
        customerName: domainMatch.companyName,
        isExistingCustomer: true,
        matchReason: `Organization email domain ${organizationEmailDomain} matches an existing mock customer folder.`,
        suggestedAction: "Link to existing customer",
      };
    }
  }

  if (companyMatch) {
    return {
      confidence: "High",
      customerId: companyMatch.id,
      customerName: companyMatch.companyName,
      isExistingCustomer: true,
      matchReason: `Company/account "${safeCompany}" matches an existing mock customer folder.`,
      suggestedAction: "Link to existing customer",
    };
  }

  if (organizationEmailDomain) {
    return {
      confidence: "Medium",
      customerId: null,
      customerName: "New customer suggested",
      isExistingCustomer: false,
      matchReason: `Organization email domain ${organizationEmailDomain} does not match a current mock customer.`,
      suggestedAction: "Create new customer folder",
    };
  }

  if (hasPublicEmail) {
    const individualMatch =
      findMockCustomerByText(personName, true) ||
      findMockCustomerByText(contactValue, true);

    if (individualMatch) {
      return {
        confidence: "Medium",
        customerId: individualMatch.id,
        customerName: individualMatch.companyName,
        isExistingCustomer: true,
        matchReason: `Public/personal email domain ${rawEmailDomain} is not used to create a company account; matched by individual name/email only.`,
        suggestedAction: "Update existing customer contact",
      };
    }

    return {
      confidence: "Needs review",
      customerId: null,
      customerName: "New customer suggested",
      isExistingCustomer: false,
      matchReason: `Public/personal email domain ${rawEmailDomain} is not used to create or suggest a company account.`,
      suggestedAction: "Create new customer folder",
    };
  }

  const individualNameMatch = findMockCustomerByText(personName, true);

  if (individualNameMatch) {
    return {
      confidence: "Medium",
      customerId: individualNameMatch.id,
      customerName: individualNameMatch.companyName,
      isExistingCustomer: true,
      matchReason: "Passenger/booker name matches an existing individual mock customer folder.",
      suggestedAction: "Update existing customer contact",
    };
  }

  return {
    confidence: "Needs review",
    customerId: null,
    customerName: "New customer suggested",
    isExistingCustomer: false,
    matchReason: "No existing mock customer matched the parsed company, domain, name, email, or contact.",
    suggestedAction: "Create new customer folder",
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseEmail(value));
}

function normalizePhone(value: string) {
  return clean(value).replace(/[^\d+]/g, "");
}

function normalizeCompactSearch(value: string | null | undefined) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function driverSearchValuesMatch(
  values: Array<string | null | undefined>,
  query: string,
) {
  const search = clean(query).toLowerCase();
  const compactSearch = normalizeCompactSearch(search);
  const phoneSearch = /[a-z]/i.test(search) ? "" : normalizePhone(search);

  if (!search) {
    return false;
  }

  return values.some((value) => {
    const searchableValue = clean(value).toLowerCase();

    return (
      searchableValue.includes(search) ||
      Boolean(phoneSearch && normalizePhone(searchableValue).includes(phoneSearch)) ||
      Boolean(compactSearch && normalizeCompactSearch(searchableValue).includes(compactSearch))
    );
  });
}

function driverMatchesSearch(driver: DriverRecord, query: string) {
  return driverSearchValuesMatch(
    [
      driver.driver_name,
      driver.contact_number,
      driver.plate_number,
      driver.vehicle_type,
      driver.availability_status,
      driver.preferred_areas,
      driver.notes,
    ],
    query,
  );
}

function driverDraftMatchesSearch(driverDraft: DriverDraft, query: string) {
  return driverSearchValuesMatch(
    [
      driverDraft.driverName,
      driverDraft.driverContact,
      driverDraft.driverPlate,
      driverDraft.notes,
    ],
    query,
  );
}

function dashboardDriverCandidateMatchesSearch(
  candidate: DashboardDriverCandidate,
  query: string,
) {
  return driverSearchValuesMatch(candidate.searchValues, query);
}

function isInactiveDashboardDriverCandidate(candidate: DashboardDriverCandidate | null | undefined) {
  return clean(candidate?.availabilityStatus).toLowerCase() === "inactive";
}

function dashboardDriverCandidateLabel(candidate: DashboardDriverCandidate) {
  const driverName =
    clean(candidate.driverName) ||
    (candidate.driverId !== null ? `Driver ${candidate.driverId}` : "Saved driver");
  const availability = clean(candidate.availabilityStatus);

  return availability ? `${driverName} (${availability})` : driverName;
}

function isRatesSetupErrorMessage(value: string) {
  const text = clean(value).toLowerCase();

  return (
    (text.includes("schema cache") &&
      (text.includes("rate_settings") ||
        text.includes("customer_rates") ||
        text.includes("driver_payout_rules"))) ||
    text.includes("relation \"public.rate_settings\" does not exist") ||
    text.includes("relation \"rate_settings\" does not exist") ||
    text.includes("column \"customer_rates\" does not exist") ||
    text.includes("column \"driver_payout_rules\" does not exist") ||
    text.includes("column \"midnight_surcharge\" does not exist") ||
    text.includes("column \"extra_stop_surcharge\" does not exist") ||
    text.includes("column \"midnight_payout\" does not exist") ||
    text.includes("column \"extra_stop_payout\" does not exist") ||
    text.includes("column \"child_seat_customer_surcharge\" does not exist") ||
    text.includes("column \"child_seat_driver_payout\" does not exist")
  );
}

function formatRatesSetupError(value: string, fallbackPrefix: string) {
  return isRatesSetupErrorMessage(value)
    ? `${fallbackPrefix}Rates database not set up. Run Supabase migration.`
    : `${fallbackPrefix}${value}`;
}

function formatSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : "Unknown Supabase error.";
  }

  const details = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };

  return [
    details.message,
    details.details ? `Details: ${details.details}` : "",
    details.hint ? `Hint: ${details.hint}` : "",
    details.code ? `Code: ${details.code}` : "",
  ].filter(Boolean).join(" ");
}

function compactParsedBooking(parsedBooking: ParsedBooking | null | undefined) {
  return Object.fromEntries(
    Object.entries(parsedBooking ?? {}).filter(([key, value]) =>
      key === "success" ? typeof value === "boolean" : key === "time" ? value !== undefined : hasParsedValue(value),
    ),
  ) as ParsedBooking;
}

function parseBookingMessageForState(messageText: string): ParsedBooking {
  return compactParsedBooking(parseBookingMessage(messageText));
}

function mergeParsedBookingIntoForm(
  currentBooking: BookingForm,
  parsedBooking: ParsedBooking,
): BookingForm {
  const parsedName = clean(parsedBooking.name);
  const parsedExtraStopLocation = clean(parsedBooking.extraStopLocation);
  const parsedExtraStopCount = parsedExtraStopLocation ? clean(parsedBooking.extraStopCount) || "1" : parsedBooking.extraStopCount;
  const bookingFields = Object.fromEntries(
    Object.entries(parsedBooking).filter(
      ([key]) => !["success", "cleanedLines", "extractedBookingsPreview", "parserWarning", "multipleBookingsDetected", "standbyUntil", "returnDestination"].includes(key),
    ),
  ) as Partial<BookingForm>;
  const mergedBooking = mergeParsedBookingState(currentBooking, {
    ...bookingFields,
    ...(parsedName ? { name: parsedName } : {}),
    ...(parsedExtraStopCount ? { extraStopCount: parsedExtraStopCount } : {}),
  });
  const safeCompany = normalizeCompanyAccount(
    mergedBooking.company,
    clean(mergedBooking.bookerEmail) || clean(currentBooking.bookerEmail),
  );

  return {
    ...currentBooking,
    ...mergedBooking,
    company: safeCompany,
    booker:
      clean(mergedBooking.booker) ||
      clean(currentBooking.booker) ||
      (!safeCompany && parsedName && clean(mergedBooking.bookingType).toUpperCase() !== "DSP"
        ? parsedName
        : ""),
    name: parsedName,
  };
}

function mergeCrmUpdatesIntoForm(
  currentBooking: BookingForm,
  crmUpdates: ParsedBooking,
): BookingForm {
  const currentName = clean(currentBooking.name);
  const crmName = clean(crmUpdates.name);
  const bookingFields = Object.fromEntries(
    Object.entries(crmUpdates).filter(
      ([key]) => !["success", "cleanedLines", "extractedBookingsPreview", "parserWarning", "multipleBookingsDetected", "standbyUntil", "returnDestination"].includes(key),
    ),
  ) as Partial<BookingForm>;
  const mergedBooking = mergeParsedBookingState(currentBooking, {
    ...bookingFields,
    name: currentName || crmName,
  });
  const safeCompany = normalizeCompanyAccount(
    mergedBooking.company,
    clean(mergedBooking.bookerEmail) || clean(currentBooking.bookerEmail),
  );

  return {
    ...currentBooking,
    ...mergedBooking,
    company: safeCompany,
    name: currentName || crmName,
  };
}

function formatDate(value: string) {
  if (!value) {
    return "Date TBC";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatMoney(value: string | number | null | undefined) {
  return numericRate(value).toFixed(2);
}

function formatCompactMoney(value: string | number | null | undefined) {
  const formattedValue = formatMoney(value);

  return formattedValue.endsWith(".00") ? formattedValue.slice(0, -3) : formattedValue;
}

function getPricingReviewWarnings(pricing: { customerPrice: number; driverPayout: number; profit: number }) {
  if (pricing.profit >= 0) {
    return [];
  }

  return [
    `Negative profit: customer $${formatCompactMoney(pricing.customerPrice)} is below driver payout $${formatCompactMoney(pricing.driverPayout)}`,
  ];
}

function finiteNumber(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    (typeof value === "string" && !clean(value))
  ) {
    return null;
  }

  const parsedValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function bookingCardPriceAmounts(bookingRecord: BookingRecord) {
  const childSeatCount = normalizeChildSeatCount(
    Boolean(bookingRecord.child_seat_required) || Boolean(finiteNumber(bookingRecord.child_seat_count)),
    bookingRecord.child_seat_count,
  );
  const extraStopCount = normalizeExtraStopCount(bookingRecord.extra_stop_count);
  const customerBasePrice = finiteNumber(bookingRecord.customer_rate);
  const driverBasePayout = finiteNumber(bookingRecord.driver_payout_min);
  const customerPrice =
    finiteNumber(bookingRecord.customer_price_amount) ??
    finiteNumber(bookingRecord.customer_rate_override) ??
    (customerBasePrice === null
      ? null
      : customerBasePrice +
        (finiteNumber(bookingRecord.midnight_surcharge) ?? 0) +
        extraStopCount * (finiteNumber(bookingRecord.extra_stop_surcharge) ?? 0) +
        (finiteNumber(bookingRecord.child_seat_customer_surcharge) ??
          childSeatCount * defaultChildSeatCustomerSurcharge));
  const driverPrice =
    finiteNumber(bookingRecord.driver_payout_override) ??
    (driverBasePayout === null
      ? null
      : driverBasePayout +
        (finiteNumber(bookingRecord.midnight_payout) ?? 0) +
        extraStopCount * (finiteNumber(bookingRecord.extra_stop_payout) ?? 0) +
        (finiteNumber(bookingRecord.child_seat_driver_payout) ?? childSeatCount * defaultChildSeatDriverPayout)) ??
    finiteNumber(bookingRecord.driver_payout_amount);

  return {
    customerPrice,
    driverPrice,
  };
}

function bookingCardPriceLine(bookingRecord: BookingRecord) {
  const { customerPrice, driverPrice } = bookingCardPriceAmounts(bookingRecord);

  if (customerPrice === null && driverPrice === null) {
    return "";
  }

  const customerText = customerPrice === null ? "—" : `$${formatCompactMoney(customerPrice)}`;
  const driverText = driverPrice === null ? "—" : `$${formatCompactMoney(driverPrice)}`;

  return `Customer ${customerText} / Driver ${driverText}`;
}

function positiveRateOrDefault(value: unknown, fallback: number) {
  const numericValue = finiteNumber(value);

  return numericValue !== null && numericValue > 0 ? numericValue : fallback;
}

function normalizeCustomerRateRules(rules: RateRules | null | undefined) {
  const source = (rules ?? {}) as Record<string, unknown>;
  const normalizedRules: RateRules = {};

  for (const bookingType of rateBookingTypes) {
    const numericValue = finiteNumber(source[bookingType]);

    if (numericValue !== null) {
      normalizedRules[bookingType] = numericValue;
    }
  }

  return normalizedRules;
}

function normalizeDriverPayoutRules(rules: DriverPayoutRules | null | undefined) {
  const source = (rules ?? {}) as Record<string, DriverPayoutRule | number | string | null | undefined>;
  const normalizedRules: DriverPayoutRules = {};

  for (const bookingType of rateBookingTypes) {
    const rule = source[bookingType];

    if (rule === null || rule === undefined) {
      continue;
    }

    if (typeof rule !== "object") {
      const amount = finiteNumber(rule);

      if (amount !== null) {
        normalizedRules[bookingType] =
          bookingType === "DSP" ? { amount, perHour: true } : { min: amount, max: amount };
      }

      continue;
    }

    const amount = finiteNumber(rule.amount);
    const min = finiteNumber(rule.min);
    const max = finiteNumber(rule.max);
    const normalizedRule: DriverPayoutRule = {};

    if (amount !== null) {
      normalizedRule.amount = amount;
    }

    if (min !== null) {
      normalizedRule.min = min;
    }

    if (max !== null) {
      normalizedRule.max = max;
    }

    if (rule.perHour !== undefined) {
      normalizedRule.perHour = Boolean(rule.perHour);
    }

    if (Object.keys(normalizedRule).length > 0) {
      normalizedRules[bookingType] = normalizedRule;
    }
  }

  return normalizedRules;
}

function getNonPositiveRateOverrideLabels(
  customerRates: RateRules | null | undefined,
  driverPayoutRules: DriverPayoutRules | null | undefined,
) {
  const invalidLabels: string[] = [];
  const customerSource = (customerRates ?? {}) as Record<string, unknown>;
  const driverSource = (driverPayoutRules ?? {}) as Record<string, DriverPayoutRule | number | string | null | undefined>;

  for (const bookingType of rateBookingTypes) {
    if (Object.prototype.hasOwnProperty.call(customerSource, bookingType)) {
      const numericValue = finiteNumber(customerSource[bookingType]);

      if (numericValue === null || numericValue <= 0) {
        invalidLabels.push(`${bookingType} customer`);
      }
    }

    if (!Object.prototype.hasOwnProperty.call(driverSource, bookingType)) {
      continue;
    }

    const payoutRule = driverSource[bookingType];

    if (payoutRule === null || payoutRule === undefined) {
      continue;
    }

    if (typeof payoutRule !== "object") {
      const amount = finiteNumber(payoutRule);

      if (amount === null || amount <= 0) {
        invalidLabels.push(`${bookingType} driver`);
      }

      continue;
    }

    const payoutValues = [payoutRule.amount, payoutRule.min, payoutRule.max]
      .map((value) => finiteNumber(value))
      .filter((value): value is number => value !== null);

    if (payoutValues.length === 0 || payoutValues.some((value) => value <= 0)) {
      invalidLabels.push(`${bookingType} driver`);
    }
  }

  return invalidLabels;
}

function formatOverrideSummary(
  customerRates: RateRules | null | undefined,
  driverPayoutRules: DriverPayoutRules | null | undefined,
) {
  const normalizedCustomerRates = normalizeCustomerRateRules(customerRates);
  const normalizedDriverPayoutRules = normalizeDriverPayoutRules(driverPayoutRules);
  const customerLabels = rateBookingTypes
    .filter((bookingType) => normalizedCustomerRates[bookingType] !== undefined)
    .map((bookingType) => `${bookingType} ${formatMoney(normalizedCustomerRates[bookingType])}`);
  const driverLabels = rateBookingTypes
    .filter((bookingType) => normalizedDriverPayoutRules[bookingType] !== undefined)
    .map((bookingType) => {
      const payoutRule = normalizedDriverPayoutRules[bookingType]!;

      return `${bookingType} ${formatMoney(payoutAmountFromRule(payoutRule))}`;
    });

  return {
    customerText: customerLabels.length > 0 ? `Customer: ${customerLabels.join(", ")}` : "Customer: None",
    driverText: driverLabels.length > 0 ? `Driver: ${driverLabels.join(", ")}` : "Driver: None",
    hasOverrides: customerLabels.length > 0 || driverLabels.length > 0,
  };
}

function hasRateOverrideValues(record: Pick<CompanyRecord, "customer_rates" | "driver_payout_rules">) {
  return formatOverrideSummary(record.customer_rates, record.driver_payout_rules).hasOverrides;
}

function statusClass(tone: Message["tone"]) {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (tone === "error") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function bookingStatusClass(status: string | null) {
  const normalizedStatus = clean(status).toLowerCase();

  if (normalizedStatus === "confirmed") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (normalizedStatus === "assigned") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  if (normalizedStatus === "driver_otw") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  if (normalizedStatus === "pob") {
    return "bg-indigo-50 text-indigo-700 ring-indigo-200";
  }

  if (normalizedStatus === "completed") {
    return "bg-slate-100 text-slate-700 ring-slate-300";
  }

  if (normalizedStatus === "cancelled") {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  return "bg-orange-50 text-orange-700 ring-orange-200";
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseJobCardDate(jobCard: string | null) {
  if (!jobCard) {
    return null;
  }

  const match = jobCard.match(/(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/);
  if (!match) {
    return null;
  }

  const parsedDate = new Date(match[1]);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function normaliseTimeForSort(value: string | null) {
  const digits = clean(value).replace(/\D/g, "");

  if (digits.length >= 4) {
    return Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4));
  }

  if (digits.length > 0) {
    return Number(digits) * 60;
  }

  return 0;
}

function formatPickupTime(value: string | null | undefined) {
  const digits = clean(value).replace(/\D/g, "");

  if (digits.length >= 4) {
    return `${digits.slice(0, 2)}${digits.slice(2, 4)}hrs`;
  }

  if (digits.length > 0) {
    return `${digits.padStart(2, "0")}00hrs`;
  }

  return "Time TBC";
}

function normalizePickupTimeForStorage(value: string | null | undefined) {
  return formatPickupTime(value).replace("hrs", "").replace("Time TBC", "");
}

function getKnownCompanyForRelationship(bookerName: string, personName: string, companyName: string) {
  const key = [bookerName, personName, companyName].map((value) => clean(value).toLowerCase()).join(" ");

  if (/\bjune\s+aw\b|\btiger\s+global\b|\bmr\s+deep\b|\bmr\s+stanley\b/.test(key)) {
    return "Tiger Global";
  }

  if (/\bnicole\s+yap\b|\bmr\s+rohan\s+singh\b|\bbny\b/.test(key)) {
    return "BNY";
  }

  if (/\bsharron\b|\bshiseido\b/.test(key)) {
    return "Shiseido";
  }

  if (/\bpolly\s+wong\b|\bapollo\b/.test(key)) {
    return "Apollo";
  }

  return "";
}

function blankCompanyRecord(companyName: string, customerRates: RateRules = {}, driverPayoutRules: DriverPayoutRules = {}): CompanyRecord {
  return {
    id: 0,
    company_name: companyName || "Draft",
    domain: null,
    customer_rates: customerRates,
    driver_payout_rules: driverPayoutRules,
  };
}

function calculateSavedDriverPayout(
  bookingRecord: BookingRecord,
  selectedDriver: DriverRecord | undefined,
  settings: RateSettings,
  manualPayoutOverride = "",
) {
  const manualPayout = clean(manualPayoutOverride) ? numericRate(manualPayoutOverride) : null;

  if (manualPayout !== null) {
    return manualPayout;
  }

  const bookingType = normalizeBookingType(bookingRecord.booking_type);
  const midnightPayout = numericRate(bookingRecord.midnight_payout);
  const extraStopCount = normalizeExtraStopCount(bookingRecord.extra_stop_count);
  const extraStopPayout =
    bookingType === "DSP" ? 0 : numericRate(bookingRecord.extra_stop_payout ?? settings.extraStopPayout);
  const extraStopDriverAmount =
    extraStopCount * extraStopPayout;
  const childSeatDriverAmount = numericRate(bookingRecord.child_seat_driver_payout);
  const storedBasePayout =
    numericRate(bookingRecord.driver_payout_min) ||
    Math.max(
      0,
      numericRate(bookingRecord.driver_payout_amount) -
        midnightPayout -
        extraStopDriverAmount -
        childSeatDriverAmount,
    );
  const selectedDriverPayoutSnapshot = driverPayoutSnapshotFromRule(
    bookingType,
    selectedDriver?.driver_payout_rules?.[bookingType],
  );
  const basePayout = selectedDriverPayoutSnapshot
    ? selectedDriverPayoutSnapshot.basePayout
    : storedBasePayout;

  return basePayout + midnightPayout + extraStopDriverAmount + childSeatDriverAmount;
}

function driverPayoutSnapshotFromRule(
  bookingType: ReturnType<typeof normalizeBookingType>,
  payoutRule: DriverPayoutRule | null | undefined,
) {
  if (!payoutRule) {
    return null;
  }

  const amount = finiteNumber(payoutRule.amount);
  const min = finiteNumber(payoutRule.min);
  const max = finiteNumber(payoutRule.max);
  const basePayout = amount ?? min ?? 0;

  return {
    basePayout,
    driverPayoutMin: min ?? basePayout,
    driverPayoutMax: max ?? basePayout,
    driverPayoutUnit: bookingType === "DSP" || payoutRule.perHour ? "hour" : "job",
  };
}

function formatChildSeatNote(countValue: string | number | null | undefined, typeValue: string | null | undefined) {
  const count = normalizeChildSeatCount(true, countValue);
  const seatType = clean(typeValue);

  if (count <= 0) {
    return "";
  }

  if (seatType) {
    return `Child seat: ${count} x ${seatType}`;
  }

  return `Child seat: ${count}`;
}

function formatPickupDateTime(dateValue: string, timeValue: string | null | undefined) {
  return `${formatDate(dateValue)}, ${formatPickupTime(timeValue)}`;
}

function getBookingDate(bookingRecord: BookingRecord) {
  const jobCardDate = parseJobCardDate(bookingRecord.job_card);

  if (jobCardDate) {
    return jobCardDate;
  }

  if (bookingRecord.created_at) {
    const createdAt = new Date(bookingRecord.created_at);

    if (!Number.isNaN(createdAt.getTime())) {
      return createdAt;
    }
  }

  return new Date(0);
}

function getBookingDateKey(bookingRecord: BookingRecord) {
  return toDateKey(getBookingDate(bookingRecord));
}

function getBookingSortValue(bookingRecord: BookingRecord) {
  const parsedCreatedAt = bookingRecord.created_at ? new Date(bookingRecord.created_at).getTime() : Number.NaN;

  if (Number.isFinite(parsedCreatedAt)) {
    return parsedCreatedAt;
  }

  const parsedUpdatedAt = bookingRecord.updated_at ? new Date(bookingRecord.updated_at).getTime() : Number.NaN;

  if (Number.isFinite(parsedUpdatedAt)) {
    return parsedUpdatedAt;
  }

  return Number(bookingRecord.id) || 0;
}

function sortBookingsNewestFirst(bookingRecords: BookingRecord[]) {
  return [...bookingRecords].sort(
    (firstBooking, secondBooking) => getBookingSortValue(secondBooking) - getBookingSortValue(firstBooking),
  );
}

function getBookingCompany(bookingRecord: BookingRecord) {
  return getBookingCompanyName(bookingRecord) || "Unlinked company";
}

function getBookingCompanyName(bookingRecord: BookingRecord) {
  const companyName = clean(bookingRecord.companies?.company_name);
  const companyDomain = clean(bookingRecord.companies?.domain);
  const safeCompanyName = normalizeCompanyAccount(companyName, bookingRecord.bookers?.email);

  if (
    !safeCompanyName ||
    isIgnoredAccountEmailDomain(companyDomain) ||
    safeCompanyName.toLowerCase() === "internal account"
  ) {
    return "";
  }

  return safeCompanyName;
}

function getRecentBookingTitle(bookingRecord: BookingRecord) {
  return getBookingCompanyName(bookingRecord) || getBookingName(bookingRecord) || getBookerName(bookingRecord) || "Unlinked booking";
}

function getJobCardName(jobCard: string | null) {
  const match = clean(jobCard).match(/^\s*(?:name|passenger)\s*:\s*(.+)$/im);

  return clean(match?.[1]);
}

const legacyBrowserTestBookingName = "BROWSER UI TEST Mr Lee";
const persistedBrowserTestBookingMarkers = [
  "BROWSER UI TEST",
  "TEST SAVE TRAVELER",
  "TEST SAVE BOOKER",
  "SUCCESS TEST TRAVELER",
  "SUCCESS TEST BOOKER",
];

function isLegacyMrLeeBrowserTestBooking(bookingRecord: BookingRecord) {
  const travelerName = clean(bookingRecord.travelers?.traveler_name) || getJobCardName(bookingRecord.job_card);

  return (
    clean(travelerName).toLowerCase() === "mr lee" &&
    clean(bookingRecord.flight_no).toUpperCase() === "SQ306" &&
    clean(bookingRecord.pickup_address).toLowerCase() === "10 scotts road" &&
    clean(bookingRecord.dropoff_address).toLowerCase() === "changi airport" &&
    getBookingDateKey(bookingRecord) === "2026-05-20" &&
    formatPickupTime(bookingRecord.pickup_time) === "0700hrs"
  );
}

function isBrowserUiMockBooking(bookingRecord: BookingRecord) {
  return /^ui-/i.test(clean(String(bookingRecord.id)));
}

function isPersistedBrowserTestBooking(bookingRecord: BookingRecord) {
  if (isBrowserUiMockBooking(bookingRecord)) {
    return false;
  }

  const searchableText = [
    getBookingName(bookingRecord),
    getBookerName(bookingRecord),
    getBookingCompanyName(bookingRecord),
    bookingRecord.job_card,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  return persistedBrowserTestBookingMarkers.some((marker) => searchableText.includes(marker));
}

function isOperationalBooking(bookingRecord: BookingRecord) {
  return !isLegacyMrLeeBrowserTestBooking(bookingRecord) && !isPersistedBrowserTestBooking(bookingRecord);
}

function getBookingName(bookingRecord: BookingRecord) {
  if (isLegacyMrLeeBrowserTestBooking(bookingRecord)) {
    return legacyBrowserTestBookingName;
  }

  return clean(bookingRecord.travelers?.traveler_name) || getJobCardName(bookingRecord.job_card);
}

function getBookerName(bookingRecord: BookingRecord) {
  const jobCardBooker = clean(bookingRecord.job_card).match(/^\s*booker\s*:\s*(.+)$/im);

  return clean(bookingRecord.bookers?.booker_name) || clean(jobCardBooker?.[1]);
}

function bookingMatchesLocalSearch(bookingRecord: BookingRecord, searchValue: string) {
  const query = clean(searchValue).toLowerCase();

  if (!query) {
    return true;
  }

  const searchableText = [
    getBookingName(bookingRecord),
    getBookerName(bookingRecord),
    getBookingCompany(bookingRecord),
    bookingRecord.flight_no,
    bookingRecord.pickup_address,
    bookingRecord.dropoff_address,
    bookingRecord.route,
    bookingRecord.driver_name,
    bookingRecord.booking_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchableText.includes(query);
}

function formatDashboardRoute(bookingRecord: BookingRecord) {
  const routePoints = getRoutePoints(bookingRecord);
  const pickup = formatPrivacySafePlace(
    clean(bookingRecord.pickup_address) || routePoints[0],
    "Pickup",
  );
  const dropoff = formatPrivacySafePlace(
    clean(bookingRecord.dropoff_address) || routePoints[routePoints.length - 1],
    "Drop-off",
  );

  return `${pickup} → ${dropoff}`;
}

function formatCreatedAt(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return clean(value);
  }

  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getRoutePoints(bookingRecord: BookingRecord) {
  const routePoints = (clean(bookingRecord.route) || getJobCardRouteLine(bookingRecord.job_card))
    .split(/\s*>\s*/)
    .map((point) => clean(point))
    .filter(Boolean);

  if (routePoints.length >= 2) {
    return routePoints;
  }

  return [
    clean(bookingRecord.pickup_address),
    clean(bookingRecord.dropoff_address),
  ].filter(Boolean);
}

function bookingRecordToForm(bookingRecord: BookingRecord): BookingForm {
  const routePoints = getRoutePoints(bookingRecord);
  const pickup = clean(bookingRecord.pickup_address) || routePoints[0] || "";
  const dropoff = clean(bookingRecord.dropoff_address) || routePoints[routePoints.length - 1] || "";
  const extraStopLocations = routePoints.slice(1, -1);
  const extraStopCount = normalizeExtraStopCount(bookingRecord.extra_stop_count) || extraStopLocations.length;
  const childSeatRequired = Boolean(bookingRecord.child_seat_required);
  const savedDriverPayout = bookingCardPriceAmounts(bookingRecord).driverPrice;
  const hasManualDriverPayoutOverride =
    bookingRecord.driver_payout_override !== null && bookingRecord.driver_payout_override !== undefined;

  return {
    ...createInitialBooking(),
    company: getBookingCompanyName(bookingRecord),
    bookingType: clean(bookingRecord.booking_type) || "MNG",
    vehicle: clean(bookingRecord.vehicle) || "AVF",
    date: getBookingDateKey(bookingRecord),
    time: formatPickupTime(bookingRecord.pickup_time),
    flight: clean(bookingRecord.flight_no),
    pickup,
    extraStopLocation: extraStopLocations.join(" > "),
    dropoff,
    booker: getBookerName(bookingRecord),
    bookerContact: clean(bookingRecord.bookers?.phone),
    bookerEmail: clean(bookingRecord.bookers?.email),
    name: getBookingName(bookingRecord),
    pax: String(bookingRecord.pax || 1),
    driverId: bookingRecord.driver_id ? String(bookingRecord.driver_id) : "",
    driverName: clean(bookingRecord.driver_name),
    driverContact: clean(bookingRecord.driver_contact),
    driverPlate: clean(bookingRecord.driver_plate_number),
    childSeatRequired: childSeatRequired ? "yes" : "",
    childSeatCount: childSeatRequired ? String(normalizeChildSeatCount(true, bookingRecord.child_seat_count)) : "",
    childSeatType: childSeatRequired ? clean(bookingRecord.child_seat_type) : "",
    extraStopCount: extraStopCount ? String(extraStopCount) : "",
    customerPriceOverride:
      bookingRecord.customer_rate_override === null || bookingRecord.customer_rate_override === undefined
        ? ""
        : String(bookingRecord.customer_rate_override),
    customerPriceOverrideReason: clean(bookingRecord.customer_price_override_reason),
    driverPayoutOverride:
      !hasManualDriverPayoutOverride
        ? ""
        : String(bookingRecord.driver_payout_override),
    savedDriverPayoutAmount:
      hasManualDriverPayoutOverride || savedDriverPayout === null ? "" : String(savedDriverPayout),
    driverPayoutReason: clean(bookingRecord.driver_payout_reason),
    driverNotes: clean(bookingRecord.driver_notes),
    driverIncludePayout: bookingRecord.driver_dispatch_include_payout ? "yes" : "",
  };
}

function stripBookerFromJobCard(jobCard: string) {
  return jobCard
    .split("\n")
    .filter((line) => !/^\s*booker\s*:/i.test(line))
    .join("\n")
    .trim();
}

function markLegacyBrowserTestJobCard(bookingRecord: BookingRecord, jobCard: string) {
  if (!isLegacyMrLeeBrowserTestBooking(bookingRecord)) {
    return jobCard;
  }

  const markedJobCard = jobCard.replace(
    /^(\s*(?:name|passenger)\s*:\s*)Mr Lee\s*$/im,
    `$1${legacyBrowserTestBookingName}`,
  );

  return markedJobCard === jobCard ? `${jobCard}\nName: ${legacyBrowserTestBookingName}` : markedJobCard;
}

function getBookingJobCard(bookingRecord: BookingRecord) {
  if (bookingRecord.job_card) {
    return markLegacyBrowserTestJobCard(bookingRecord, stripBookerFromJobCard(bookingRecord.job_card));
  }

  const childSeatLine = bookingRecord.child_seat_required
    ? formatChildSeatNote(bookingRecord.child_seat_count, bookingRecord.child_seat_type)
    : "";

  return [
    `${bookingRecord.vehicle || "Vehicle"} ${bookingRecord.booking_type || "Booking"}`,
    formatPickupDateTime(getBookingDateKey(bookingRecord), bookingRecord.pickup_time),
    "",
    bookingRecord.flight_no
      ? `Flight: ${bookingRecord.flight_no}\n${bookingRecord.route || "Route TBC"}`
      : bookingRecord.route || "Route TBC",
    "",
    getBookingName(bookingRecord) ? `Name: ${getBookingName(bookingRecord)}` : "",
    `Pax: ${bookingRecord.pax || 1}`,
    childSeatLine,
  ]
    .filter(Boolean)
    .join("\n");
}

function customerBookingTypeLabel(value: string | null | undefined) {
  return customerBookingTypeLabels[normalizeBookingType(value)];
}

function parsePickupDateTimeMs(dateValue: string, timeValue: string | null | undefined) {
  const date = clean(dateValue);
  const time = normalizePickupTimeForStorage(timeValue);

  if (!date || time.length < 4) {
    return null;
  }

  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(2, 4));

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  const pickupDateTime = new Date(
    `${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`,
  );
  const pickupTimeMs = pickupDateTime.getTime();

  return Number.isFinite(pickupTimeMs) ? pickupTimeMs : null;
}

function formatAdminBookingPickupDateTime(bookingValue: BookingForm) {
  const date = clean(bookingValue.date);
  const time = normalizePickupTimeForStorage(bookingValue.time);

  if (!date || time.length < 4) {
    return null;
  }

  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(2, 4));

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  return `${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+08:00`;
}

function isAdminShortNoticeReviewRequired(bookingValue: BookingForm, currentTimeMs: number) {
  const pickupTimeMs = parsePickupDateTimeMs(bookingValue.date, bookingValue.time);

  return pickupTimeMs !== null && pickupTimeMs - currentTimeMs < 24 * 60 * 60 * 1000;
}

function createAdminBookingReference() {
  return `ADM-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

function getAdminExtraStopLocations(value: string) {
  const cleanedValue = clean(value);

  if (!cleanedValue) {
    return [];
  }

  const itineraryStops = parseItineraryDisplayStops(cleanedValue);

  if (itineraryStops.length > 0) {
    return itineraryStops.map((stop) => stop.location);
  }

  return cleanedValue
    .split(/\s*(?:>|;|\n)\s*/g)
    .map((part) => clean(part))
    .filter(Boolean);
}

function buildAdminBookingPersistencePayload(
  bookingValue: BookingForm,
  currentTimeMs: number,
  bookingReference = createAdminBookingReference(),
): AdminBookingPersistenceRequestBody {
  const shortNoticeReviewRequired = isAdminShortNoticeReviewRequired(bookingValue, currentTimeMs);
  const pickupLocation = clean(bookingValue.pickup) || null;
  const dropoffLocation = clean(bookingValue.dropoff) || null;
  const extraStopLocations = getAdminExtraStopLocations(bookingValue.extraStopLocation);
  const routePointCandidates: Array<AdminBookingPersistenceRequestBody["route_points"][number] | null> = [
    pickupLocation
      ? {
          point_type: "pickup" as const,
          sequence_number: 1,
          location_text: pickupLocation,
          timing_note: null,
        }
      : null,
    ...extraStopLocations.map((location, index) => ({
      point_type: "stop" as const,
      sequence_number: index + 2,
      location_text: location,
      timing_note: null,
    })),
    dropoffLocation
      ? {
          point_type: "dropoff" as const,
          sequence_number: extraStopLocations.length + 2,
          location_text: dropoffLocation,
          timing_note: null,
        }
      : null,
  ];
  const routePoints = routePointCandidates.filter(
    (routePoint): routePoint is AdminBookingPersistenceRequestBody["route_points"][number] =>
      Boolean(routePoint),
  );
  const childSeatCount =
    clean(bookingValue.childSeatRequired) === "yes"
      ? normalizeChildSeatCount(bookingValue.childSeatRequired, bookingValue.childSeatCount)
      : 0;
  const extraStopCount = normalizeExtraStopCount(bookingValue.extraStopCount);
  const serviceItemCandidates: Array<AdminBookingPersistenceRequestBody["service_items"][number] | null> = [
    childSeatCount > 0
      ? {
          service_item_type: "child_seat" as const,
          quantity: childSeatCount,
          blocks_count: null,
        }
      : null,
    extraStopCount > 0
      ? {
          service_item_type: "extra_stop" as const,
          quantity: extraStopCount,
          blocks_count: null,
        }
      : null,
    isMockMidnightChargeDetected(bookingValue.time)
      ? {
          service_item_type: "midnight_charge" as const,
          quantity: 1,
          blocks_count: null,
        }
      : null,
  ];
  const serviceItems = serviceItemCandidates.filter(
    (serviceItem): serviceItem is AdminBookingPersistenceRequestBody["service_items"][number] =>
      Boolean(serviceItem),
  );
  const customerDisplayName =
    normalizeCompanyAccount(bookingValue.company, bookingValue.bookerEmail) ||
    clean(bookingValue.booker) ||
    clean(bookingValue.name) ||
    null;

  return {
    booking: {
      booking_reference: bookingReference,
      source_channel: "admin-dashboard",
      customer_id: null,
      pickup_datetime: formatAdminBookingPickupDateTime(bookingValue),
      pickup_location: pickupLocation,
      dropoff_location: dropoffLocation,
      route_type: clean(bookingValue.bookingType) || null,
      customer_display_name: customerDisplayName,
      contact_phone: clean(bookingValue.bookerContact) || null,
      contact_email: clean(bookingValue.bookerEmail) || null,
      pax_count: Number(clean(bookingValue.pax)) || null,
      luggage_count: null,
      vehicle_type_or_category: clean(bookingValue.vehicle) || null,
      customer_facing_status: "Received",
      admin_internal_status: shortNoticeReviewRequired ? "Admin Review Required" : "Draft",
      short_notice_review_status: shortNoticeReviewRequired ? "Admin Review Required" : "Not Required",
      parser_source_reference: parsedSourceReference(bookingValue),
    },
    route_points: routePoints,
    service_items: serviceItems,
  };
}

function safeAdminBookingPersistenceCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function adminBookingPersistenceRecordIsCustomerRequest(record: AdminBookingPersistenceRecord) {
  return clean(record.source_channel) === "customer-booking-request";
}

function adminBookingPersistenceRecordIsShortNotice(
  record: AdminBookingPersistenceRecord,
  currentTimeMs: number,
) {
  const pickupDateTime = clean(record.pickup_datetime);
  const pickupMs = pickupDateTime ? new Date(pickupDateTime).getTime() : Number.NaN;

  return (
    clean(record.short_notice_review_status) === "Admin Review Required" ||
    (Number.isFinite(pickupMs) && pickupMs - currentTimeMs < 24 * 60 * 60 * 1000)
  );
}

function adminCustomerRequestDecisionStatuses(
  record: AdminBookingPersistenceRecord,
  decision: (typeof adminCustomerRequestReviewDecisions)[number],
  currentTimeMs: number,
) {
  const shortNoticeReviewRequired = adminBookingPersistenceRecordIsShortNotice(record, currentTimeMs);

  return {
    admin_internal_status:
      decision.key === "approve-internally" && shortNoticeReviewRequired
        ? "Admin Review Required"
        : decision.adminInternalStatus,
    customer_facing_status: clean(record.customer_facing_status) || "Request Received",
    short_notice_review_status: shortNoticeReviewRequired ? "Admin Review Required" : "Not Required",
    shortNoticeReviewRequired,
  };
}

function buildAdminCustomerRequestDecisionPayload(
  record: AdminBookingPersistenceRecord,
  decision: (typeof adminCustomerRequestReviewDecisions)[number],
  currentTimeMs: number,
): AdminBookingPersistenceRequestBody | null {
  const bookingReference = clean(record.booking_reference);
  const pickupDateTime = clean(record.pickup_datetime);
  const pickupLocation = clean(record.pickup_location);
  const dropoffLocation = clean(record.dropoff_location);
  const routeType = clean(record.route_type);
  const customerDisplayName = clean(record.customer_display_name);
  const contactPhone = clean(record.contact_phone);
  const routePoints: AdminBookingPersistenceRequestBody["route_points"] = [];

  for (const [index, routePoint] of (record.route_points || []).entries()) {
    const locationText = clean(routePoint.location_text);

    if (!routePoint.point_type || !locationText) {
      continue;
    }

    routePoints.push({
      point_type: routePoint.point_type,
      sequence_number: safeAdminBookingPersistenceCount(routePoint.sequence_number) || index + 1,
      location_text: locationText,
      timing_note: clean(routePoint.timing_note) || null,
    });
  }

  const hasPickupRoutePoint = routePoints.some((routePoint) => routePoint.point_type === "pickup");
  const hasDropoffRoutePoint = routePoints.some((routePoint) => routePoint.point_type === "dropoff");

  if (
    !bookingReference ||
    !pickupDateTime ||
    !pickupLocation ||
    !dropoffLocation ||
    !routeType ||
    !customerDisplayName ||
    !contactPhone ||
    !hasPickupRoutePoint ||
    !hasDropoffRoutePoint
  ) {
    return null;
  }

  const serviceItems: AdminBookingPersistenceRequestBody["service_items"] = [];

  for (const serviceItem of record.service_items || []) {
    const quantity = safeAdminBookingPersistenceCount(serviceItem.quantity);
    const blocksCount = safeAdminBookingPersistenceCount(serviceItem.blocks_count);

    if (!serviceItem.service_item_type || ((quantity ?? 0) < 1 && (blocksCount ?? 0) < 1)) {
      continue;
    }

    serviceItems.push({
      service_item_type: serviceItem.service_item_type,
      quantity,
      blocks_count: blocksCount,
    });
  }

  const statuses = adminCustomerRequestDecisionStatuses(record, decision, currentTimeMs);

  return {
    booking: {
      booking_reference: bookingReference,
      source_channel: "customer-booking-request",
      customer_id: safeAdminBookingPersistenceCount(record.customer_id),
      pickup_datetime: pickupDateTime,
      pickup_location: pickupLocation,
      dropoff_location: dropoffLocation,
      route_type: routeType,
      customer_display_name: customerDisplayName,
      contact_phone: contactPhone,
      contact_email: clean(record.contact_email) || null,
      pax_count: safeAdminBookingPersistenceCount(record.pax_count),
      luggage_count: safeAdminBookingPersistenceCount(record.luggage_count),
      vehicle_type_or_category: clean(record.vehicle_type_or_category) || null,
      customer_facing_status: statuses.customer_facing_status,
      admin_internal_status: statuses.admin_internal_status,
      short_notice_review_status: statuses.short_notice_review_status,
      parser_source_reference: clean(record.parser_source_reference) || null,
    },
    route_points: routePoints,
    service_items: serviceItems,
  };
}

function parsedSourceReference(bookingValue: BookingForm) {
  const flight = clean(bookingValue.flight);
  const booker = clean(bookingValue.booker);

  return [flight ? `Flight ${flight}` : "", booker ? `Booker ${booker}` : ""]
    .filter(Boolean)
    .join(" / ") || null;
}

function adminBookingPersistenceStatusValues(record: AdminBookingPersistenceRecord) {
  return [
    clean(record.admin_internal_status),
    clean(record.short_notice_review_status),
    clean(record.customer_facing_status),
  ].filter(Boolean);
}

function adminBookingPersistencePickupSearchValues(record: AdminBookingPersistenceRecord) {
  const rawPickupDateTime = clean(record.pickup_datetime);

  if (!rawPickupDateTime) {
    return [];
  }

  const parsedPickupDateTime = new Date(rawPickupDateTime);

  if (Number.isNaN(parsedPickupDateTime.getTime())) {
    return [rawPickupDateTime];
  }

  return [
    rawPickupDateTime,
    parsedPickupDateTime.toLocaleString("en-SG", {
      dateStyle: "medium",
      timeStyle: "short",
    }),
  ];
}

function adminBookingPersistencePickupDisplay(record: AdminBookingPersistenceRecord) {
  const pickupValues = adminBookingPersistencePickupSearchValues(record);

  return pickupValues[1] || pickupValues[0] || "Pickup time TBC";
}

function adminCustomerRequestWaitTimeLabel(
  record: AdminBookingPersistenceRecord,
  currentTimeMs: number,
) {
  const createdAt = clean(record.created_at);

  if (!createdAt) {
    return "Waiting time: not available";
  }

  const createdMs = new Date(createdAt).getTime();

  if (!Number.isFinite(createdMs) || createdMs > currentTimeMs) {
    return "Waiting time: not available";
  }

  const waitMinutes = Math.floor((currentTimeMs - createdMs) / (60 * 1000));

  if (waitMinutes < 60) {
    return `Waiting: ${Math.max(0, waitMinutes)} min`;
  }

  const waitHours = Math.floor(waitMinutes / 60);

  if (waitHours < 24) {
    return `Waiting: ${waitHours} hr`;
  }

  const waitDays = Math.floor(waitHours / 24);

  return `Waiting: ${waitDays} ${waitDays === 1 ? "day" : "days"}`;
}

function adminBookingPersistencePickupTimeMs(record: AdminBookingPersistenceRecord) {
  const pickupDateTime = clean(record.pickup_datetime);

  if (!pickupDateTime) {
    return Number.POSITIVE_INFINITY;
  }

  const pickupMs = new Date(pickupDateTime).getTime();

  return Number.isFinite(pickupMs) ? pickupMs : Number.POSITIVE_INFINITY;
}

function adminCustomerRequestPriorityBucket(
  record: AdminBookingPersistenceRecord,
  currentTimeMs: number,
) {
  const adminInternalStatus = clean(record.admin_internal_status).toLowerCase();
  const customerFacingStatus = clean(record.customer_facing_status).toLowerCase();

  if (adminBookingPersistenceRecordIsShortNotice(record, currentTimeMs)) {
    return 0;
  }

  if (adminInternalStatus === "admin review required") {
    return 1;
  }

  if (adminInternalStatus === "needs review" || customerFacingStatus === "needs review") {
    return 2;
  }

  return 3;
}

function orderAdminBookingPersistenceRecordsForCustomerRequestPriority(
  records: AdminBookingPersistenceRecord[],
  currentTimeMs: number,
) {
  return records
    .map((record, index) => ({ index, record }))
    .sort((left, right) => {
      const leftIsCustomerRequest = adminBookingPersistenceRecordIsCustomerRequest(left.record);
      const rightIsCustomerRequest = adminBookingPersistenceRecordIsCustomerRequest(right.record);

      if (leftIsCustomerRequest !== rightIsCustomerRequest) {
        return leftIsCustomerRequest ? -1 : 1;
      }

      if (!leftIsCustomerRequest || !rightIsCustomerRequest) {
        return left.index - right.index;
      }

      const priorityBucketDifference =
        adminCustomerRequestPriorityBucket(left.record, currentTimeMs) -
        adminCustomerRequestPriorityBucket(right.record, currentTimeMs);

      if (priorityBucketDifference !== 0) {
        return priorityBucketDifference;
      }

      const pickupDifference =
        adminBookingPersistencePickupTimeMs(left.record) -
        adminBookingPersistencePickupTimeMs(right.record);

      if (pickupDifference !== 0) {
        return pickupDifference;
      }

      const bookingReferenceDifference = clean(left.record.booking_reference).localeCompare(
        clean(right.record.booking_reference),
      );

      return bookingReferenceDifference || left.index - right.index;
    })
    .map(({ record }) => record);
}

function adminBookingPersistenceRouteSummary(record: AdminBookingPersistenceRecord) {
  return [
    clean(record.pickup_location) || "Pickup TBC",
    clean(record.dropoff_location) || "Drop-off TBC",
  ].join(" > ");
}

function adminBookingPersistencePrimaryStatus(record: AdminBookingPersistenceRecord) {
  return clean(record.admin_internal_status) ||
    clean(record.short_notice_review_status) ||
    clean(record.customer_facing_status) ||
    "Draft";
}

function adminBookingPersistenceSourceLabel(record: AdminBookingPersistenceRecord) {
  const sourceChannel = clean(record.source_channel);

  if (sourceChannel === "customer-booking-request") {
    return "Customer request intake";
  }

  if (sourceChannel === "admin-dashboard") {
    return "Admin dashboard snapshot";
  }

  return sourceChannel || "Operational snapshot";
}

function adminBookingPersistenceSearchValues(record: AdminBookingPersistenceRecord) {
  return [
    clean(record.booking_reference),
    clean(record.customer_display_name),
    clean(record.contact_phone),
    clean(record.contact_email),
    clean(record.pickup_location),
    clean(record.dropoff_location),
    clean(record.route_type),
    clean(record.vehicle_type_or_category),
    ...adminBookingPersistenceStatusValues(record),
    ...adminBookingPersistencePickupSearchValues(record),
  ].filter(Boolean);
}

function adminCustomerRequestServiceItemSearchValues(record: AdminBookingPersistenceRecord) {
  return (record.service_items || []).flatMap((serviceItem) => {
    const serviceItemType = clean(serviceItem.service_item_type);
    const friendlyServiceItemType = serviceItemType.replaceAll("_", " ");

    return [
      serviceItemType,
      friendlyServiceItemType,
      safeAdminBookingPersistenceCount(serviceItem.quantity)?.toString() || "",
      safeAdminBookingPersistenceCount(serviceItem.blocks_count)?.toString() || "",
    ].filter(Boolean);
  });
}

function adminCustomerRequestSearchValues(record: AdminBookingPersistenceRecord) {
  return [
    ...adminBookingPersistenceSearchValues(record),
    clean(record.source_channel),
    adminBookingPersistenceSourceLabel(record),
    ...(record.route_points || []).flatMap((routePoint) => [
      clean(routePoint.point_type),
      safeAdminBookingPersistenceCount(routePoint.sequence_number)?.toString() || "",
      clean(routePoint.location_text),
      clean(routePoint.timing_note),
    ]),
    ...adminCustomerRequestServiceItemSearchValues(record),
  ].filter(Boolean);
}

function adminCustomerRequestMatchesStatusFilter(
  record: AdminBookingPersistenceRecord,
  statusFilter: AdminCustomerRequestStatusFilter,
) {
  if (statusFilter === "all") {
    return true;
  }

  const adminInternalStatus = clean(record.admin_internal_status);
  const shortNoticeReviewStatus = clean(record.short_notice_review_status);

  if (statusFilter === "needs-review") {
    return adminInternalStatus === "Admin Review Required";
  }

  if (statusFilter === "approved-internally") {
    return adminInternalStatus === "Ready for Confirmation";
  }

  if (statusFilter === "declined-internally") {
    return adminInternalStatus === "Declined Internally";
  }

  return shortNoticeReviewStatus === "Admin Review Required";
}

function filterAdminCustomerRequestRecords(
  records: AdminBookingPersistenceRecord[],
  searchValue: string,
  statusFilter: AdminCustomerRequestStatusFilter,
) {
  const normalizedSearchValue = clean(searchValue).toLowerCase();

  return records
    .filter(adminBookingPersistenceRecordIsCustomerRequest)
    .filter((record) => {
      const searchMatches =
        !normalizedSearchValue ||
        adminCustomerRequestSearchValues(record)
          .join("\n")
          .toLowerCase()
          .includes(normalizedSearchValue);

      return searchMatches && adminCustomerRequestMatchesStatusFilter(record, statusFilter);
    });
}

function filterAdminBookingPersistenceRecords(
  records: AdminBookingPersistenceRecord[],
  searchValue: string,
  statusFilter: string,
) {
  const normalizedSearchValue = clean(searchValue).toLowerCase();
  const cleanedStatusFilter = clean(statusFilter);

  return records.filter((record) => {
    const statusValues = adminBookingPersistenceStatusValues(record);
    const statusMatches =
      cleanedStatusFilter === adminBookingPersistenceAllStatusFilter ||
      statusValues.includes(cleanedStatusFilter);
    const searchMatches =
      !normalizedSearchValue ||
      adminBookingPersistenceSearchValues(record)
        .join("\n")
        .toLowerCase()
        .includes(normalizedSearchValue);

    return statusMatches && searchMatches;
  });
}

function getAdminBookingPersistenceStatusOptions(records: AdminBookingPersistenceRecord[]) {
  return Array.from(
    new Set(records.flatMap((record) => adminBookingPersistenceStatusValues(record))),
  ).sort((first, second) => first.localeCompare(second));
}

function findAdminBookingPersistenceRecordByReference(
  records: AdminBookingPersistenceRecord[],
  reference: string,
) {
  const cleanedReference = clean(reference);

  if (!cleanedReference) {
    return null;
  }

  return (
    records.find(
      (record) => clean(record.booking_reference) === cleanedReference,
    ) || null
  );
}

function adminBookingPersistenceFailureMessage(
  action: AdminBookingPersistenceAction,
  rawError: unknown,
) {
  const prefix =
    action === "save"
      ? "Operational booking save failed"
      : action === "update"
        ? "Operational booking update failed"
        : "Operational booking load failed";
  const normalizedError =
    rawError instanceof Error ? clean(rawError.message).toLowerCase() : clean(String(rawError || "")).toLowerCase();

  if (/not enabled|configuration/.test(normalizedError)) {
    return `${prefix}: admin booking persistence is not enabled or configured on this server.`;
  }

  if (/forbidden/.test(normalizedError)) {
    return `${prefix}: request includes fields outside the approved operational booking scope.`;
  }

  if (/unknown/.test(normalizedError)) {
    return `${prefix}: request includes unknown operational booking fields.`;
  }

  if (/missing|required/.test(normalizedError)) {
    return `${prefix}: required operational booking details are missing.`;
  }

  if (/malformed|invalid|route_points|service_items|route point|service item/.test(normalizedError)) {
    return `${prefix}: operational route or service item details need review.`;
  }

  return `${prefix} safely.`;
}

function adminSnapshotPickupDateTimeParts(value: string | null | undefined) {
  const rawValue = clean(value);
  const directMatch = rawValue.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);

  if (directMatch) {
    return {
      date: directMatch[1],
      time: `${directMatch[2]}${directMatch[3]}`,
    };
  }

  const parsedDate = new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).formatToParts(parsedDate);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  const year = partValue("year");
  const month = partValue("month");
  const day = partValue("day");
  const hour = partValue("hour");
  const minute = partValue("minute");

  return year && month && day && hour && minute
    ? {
        date: `${year}-${month}-${day}`,
        time: `${hour}${minute}`,
      }
    : null;
}

function adminSnapshotSortedRoutePoints(record: AdminBookingPersistenceRecord) {
  return Array.isArray(record.route_points)
    ? [...record.route_points].sort(
        (left, right) =>
          (left.sequence_number ?? Number.MAX_SAFE_INTEGER) -
          (right.sequence_number ?? Number.MAX_SAFE_INTEGER),
      )
    : [];
}

function adminSnapshotServiceItemQuantity(record: AdminBookingPersistenceRecord, serviceItemType: string) {
  if (!Array.isArray(record.service_items)) {
    return 0;
  }

  return record.service_items
    .filter((item) => item.service_item_type === serviceItemType)
    .reduce((total, item) => {
      const quantity = Number(item.quantity);

      return Number.isInteger(quantity) && quantity > 0 ? total + quantity : total;
    }, 0);
}

function adminSnapshotFlightReference(record: AdminBookingPersistenceRecord) {
  const sourceReference = clean(record.parser_source_reference);
  const flightMatch = sourceReference.match(/\bflight\s+([A-Z0-9-]+)/i);

  return flightMatch?.[1]?.toUpperCase() || "";
}

function adminOperationalSnapshotToBookingForm(
  record: AdminBookingPersistenceRecord,
): AdminBookingSnapshotApplyResult {
  const bookingReference = clean(record.booking_reference);
  const dateTimeParts = adminSnapshotPickupDateTimeParts(record.pickup_datetime);
  const routePoints = adminSnapshotSortedRoutePoints(record);
  const pickupLocation =
    clean(routePoints.find((point) => point.point_type === "pickup")?.location_text) ||
    clean(record.pickup_location);
  const dropoffLocation =
    clean(routePoints.find((point) => point.point_type === "dropoff")?.location_text) ||
    clean(record.dropoff_location);
  const stopLocations = routePoints
    .filter((point) => point.point_type === "stop" || point.point_type === "waypoint")
    .map((point) => clean(point.location_text))
    .filter(Boolean);
  const routeType = clean(record.route_type);
  const customerDisplayName = clean(record.customer_display_name);
  const contactPhone = clean(record.contact_phone);

  if (!bookingReference || !dateTimeParts || !pickupLocation || !dropoffLocation || !routeType) {
    return {
      error: "Operational snapshot is missing required route details.",
      ok: false,
    };
  }

  if (!customerDisplayName || !contactPhone) {
    return {
      error: "Operational snapshot is missing required customer contact details.",
      ok: false,
    };
  }

  const childSeatCount = adminSnapshotServiceItemQuantity(record, "child_seat");
  const extraStopCount =
    adminSnapshotServiceItemQuantity(record, "extra_stop") || stopLocations.length;
  const paxCount = Number(record.pax_count);

  return {
    booking: {
      ...createInitialBooking(),
      booker: customerDisplayName,
      bookerContact: contactPhone,
      bookerEmail: clean(record.contact_email),
      bookingType: routeType,
      childSeatCount: childSeatCount > 0 ? String(childSeatCount) : "",
      childSeatRequired: childSeatCount > 0 ? "yes" : "",
      company: customerDisplayName,
      date: dateTimeParts.date,
      dropoff: dropoffLocation,
      extraStopCount: extraStopCount > 0 ? String(extraStopCount) : "",
      extraStopLocation: stopLocations.join(" > "),
      flight: adminSnapshotFlightReference(record),
      name: customerDisplayName,
      pax: Number.isInteger(paxCount) && paxCount > 0 ? String(paxCount) : "1",
      pickup: pickupLocation,
      time: dateTimeParts.time,
      vehicle: clean(record.vehicle_type_or_category) || "AVF",
    },
    ok: true,
    reviewStatus:
      clean(record.short_notice_review_status) ||
      clean(record.admin_internal_status) ||
      clean(record.customer_facing_status),
  };
}

function customerLiveLocationState(
  booking: BookingForm,
  currentTimeMs: number,
  secureLiveLocationLink = "",
) {
  const bookingType = normalizeBookingType(booking.bookingType);
  const secureLink = clean(secureLiveLocationLink);

  if (!customerLiveLocationEligibleTypes.has(bookingType)) {
    return {
      copyLine: "",
      helperText: "Customer live location link is not available for Arrival bookings.",
    };
  }

  const pickupTimeMs = parsePickupDateTimeMs(booking.date, booking.time);

  if (pickupTimeMs === null) {
    return {
      copyLine: "",
      helperText: "Customer live location link requires pickup date and time.",
    };
  }

  const windowStartMs = pickupTimeMs - customerLiveLocationWindowMs;

  if (currentTimeMs < windowStartMs) {
    return {
      copyLine: "",
      helperText: "Customer live location link becomes available 30 minutes before pickup.",
    };
  }

  if (currentTimeMs > pickupTimeMs) {
    return {
      copyLine: "",
      helperText: "Customer live location link is only available within 30 minutes before pickup.",
    };
  }

  if (!secureLink) {
    return {
      copyLine: "",
      helperText: "Customer live location link requires secure driver live location setup.",
    };
  }

  return {
    copyLine: `Live location: ${secureLink}`,
    helperText: "Customer live location link is available.",
  };
}

function getJobCardRouteLine(jobCard: string | null | undefined) {
  return clean(jobCard)
    .split("\n")
    .map((line) => clean(line))
    .find((line) => line.includes(">")) || "";
}

function getDriverDispatchCard(bookingRecord: BookingRecord, driverDraft: DriverDraft) {
  const driverName = clean(driverDraft.driverName) || clean(bookingRecord.driver_name) || "Driver TBC";
  const driverContact = clean(driverDraft.driverContact) || clean(bookingRecord.driver_contact);
  const driverPlate = clean(driverDraft.driverPlate) || clean(bookingRecord.driver_plate_number);
  const routeText =
    clean(bookingRecord.route) ||
    getJobCardRouteLine(bookingRecord.job_card) ||
    `${clean(bookingRecord.pickup_address) || "Pickup"} > ${
      clean(bookingRecord.dropoff_address) || "Drop-off"
    }`;
  const payoutAmount =
    numericRate(driverDraft.payoutOverride) ||
    numericRate(bookingRecord.driver_payout_override) ||
    bookingCardPriceAmounts(bookingRecord).driverPrice ||
    numericRate(bookingRecord.driver_payout_amount);
  const includePayout = driverDraft.includePayout || Boolean(bookingRecord.driver_dispatch_include_payout);
  const childSeatLine = bookingRecord.child_seat_required
    ? formatChildSeatNote(bookingRecord.child_seat_count, bookingRecord.child_seat_type)
    : "";

  return [
    "DRIVER DISPATCH",
    "",
    `Driver: ${driverName}`,
    driverContact ? `Contact: ${driverContact}` : "",
    driverPlate ? `Plate: ${driverPlate}` : "",
    "",
    `${bookingRecord.vehicle || "Vehicle"} ${bookingRecord.booking_type || "Booking"}`,
    formatPickupDateTime(getBookingDateKey(bookingRecord), bookingRecord.pickup_time),
    "",
    bookingRecord.flight_no ? `Flight: ${bookingRecord.flight_no}` : "",
    routeText,
    "",
    getBookingName(bookingRecord) ? `Passenger: ${getBookingName(bookingRecord)}` : "",
    `Pax: ${bookingRecord.pax || 1}`,
    childSeatLine,
    includePayout && payoutAmount ? `Payout: $${payoutAmount}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseMockChargeTimeToMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function isMockMidnightChargeDetected(value: string) {
  const minutes = parseMockChargeTimeToMinutes(value);
  if (minutes === null) {
    return false;
  }

  return minutes >= 23 * 60 || minutes <= 6 * 60 + 59;
}

export default function Home() {
  const [booking, setBooking] = useState<BookingForm>(() => createInitialBooking());
  const [activeTab, setActiveTab] = useState<AppTab>("dispatch");
  const [isInternalQaMockArchiveOpen, setIsInternalQaMockArchiveOpen] = useState(false);
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingMessageResetKey, setBookingMessageResetKey] = useState(0);
  const [parsedDebugBooking, setParsedDebugBooking] = useState<ParsedDebugBooking | null>(null);
  const [showParserDebug, setShowParserDebug] = useState(false);
  const [multiBookingNotice, setMultiBookingNotice] = useState<ParsedBooking | null>(null);
  const [aiDraft, setAiDraft] = useState<AiParseResult | null>(null);
  const [aiAssistMessage, setAiAssistMessage] = useState<Message | null>(null);
  const [aiAssistSafetyAccepted, setAiAssistSafetyAccepted] = useState(false);
  const [aiAssistLoading, setAiAssistLoading] = useState(false);
  const [aiAssistResponseNote, setAiAssistResponseNote] = useState("");
  const bookingMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [driverDrafts, setDriverDrafts] = useState<Record<string, DriverDraft>>({});
  const [driverAssignmentMessages, setDriverAssignmentMessages] =
    useState<Record<string, Message>>({});
  const [bookingCompletionMessages, setBookingCompletionMessages] =
    useState<Record<string, Message>>({});
  const [bookingCopyMessages, setBookingCopyMessages] =
    useState<Record<string, Message>>({});
  const [loadedBookingId, setLoadedBookingId] = useState("");
  const [driverProfileDraft, setDriverProfileDraft] =
    useState<DriverProfileDraft>(initialDriverProfileDraft);
  const [replacementDriverDraft, setReplacementDriverDraft] =
    useState<ReplacementDriverDraft>(initialReplacementDriverDraft);
  const [replacementDriverFeedback, setReplacementDriverFeedback] =
    useState<ReplacementDriverFeedback | null>(null);
  const [mockMidnightChargeOverrideMode, setMockMidnightChargeOverrideMode] =
    useState<"auto" | "force-on" | "force-off">("auto");
  const [mockMidnightChargeOverrideReason, setMockMidnightChargeOverrideReason] = useState("");
  const [telegramAlertPreviewType, setTelegramAlertPreviewType] =
    useState<TelegramAlertPreviewType>("assignment");
  const [telegramAlertPreviewFeedback, setTelegramAlertPreviewFeedback] =
    useState<Message | null>(null);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [savingDriverProfile, setSavingDriverProfile] = useState(false);
  const [deactivatingDriverProfile, setDeactivatingDriverProfile] = useState(false);
  const [deletingDriverId, setDeletingDriverId] = useState<string | null>(null);
  const [driverDeleteMessage, setDriverDeleteMessage] = useState<DriverDeleteMessage | null>(null);
  const [assigningBookingId, setAssigningBookingId] = useState<string | null>(null);
  const [completingBookingId, setCompletingBookingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [bookingsSearchTerm, setBookingsSearchTerm] = useState("");
  const [completedSearchTerm, setCompletedSearchTerm] = useState("");
  const [driverSearchTerm, setDriverSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rateSettings, setRateSettings] = useState<RateSettings>(initialRateSettings);
  const [rateOverrideDraft, setRateOverrideDraft] =
    useState<RateOverrideDraft>(initialRateOverrideDraft);
  const [rateCompanies, setRateCompanies] = useState<CompanyRecord[]>([]);
  const [rateTravelers, setRateTravelers] = useState<TravelerRecord[]>([]);
  const [ratesLoaded, setRatesLoaded] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const [rateAction, setRateAction] = useState<"load" | "defaults" | "override" | "remove-override" | null>(null);
  const [rateMessageTarget, setRateMessageTarget] = useState<"header" | "override">("header");
  const [rateOverrideListMessages, setRateOverrideListMessages] =
    useState<{ company?: RateOverrideListMessage; boss?: RateOverrideListMessage }>({});
  const [bookingSaveMessage, setBookingSaveMessage] = useState<Message | null>(null);
  const [adminBookingPersistenceRecords, setAdminBookingPersistenceRecords] =
    useState<AdminBookingPersistenceRecord[]>([]);
  const [adminBookingPersistenceMessage, setAdminBookingPersistenceMessage] =
    useState<Message | null>(null);
  const [adminBookingPersistenceAction, setAdminBookingPersistenceAction] =
    useState<AdminBookingPersistenceAction | null>(null);
  const [appliedAdminBookingSnapshotReference, setAppliedAdminBookingSnapshotReference] =
    useState("");
  const [adminBookingPersistenceSearch, setAdminBookingPersistenceSearch] =
    useState("");
  const [adminBookingPersistenceStatusFilter, setAdminBookingPersistenceStatusFilter] =
    useState(adminBookingPersistenceAllStatusFilter);
  const [adminCustomerRequestSearch, setAdminCustomerRequestSearch] =
    useState("");
  const [adminCustomerRequestStatusFilter, setAdminCustomerRequestStatusFilter] =
    useState<AdminCustomerRequestStatusFilter>(adminCustomerRequestAllStatusFilter);
  const [customerMatchFeedback, setCustomerMatchFeedback] = useState<CustomerMatchFeedback | null>(null);
  const [deletingCompletedBookingId, setDeletingCompletedBookingId] = useState<string | null>(null);
  const [copyEditStates, setCopyEditStates] =
    useState<Record<DispatchCopyTarget, CopyEditState>>(createInitialCopyEditStates);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const [driverJobLinkCopyMessage, setDriverJobLinkCopyMessage] = useState<Message | null>(null);
  const [dispatchReleaseMessage, setDispatchReleaseMessage] = useState<Message | null>(null);
  const [dispatchReleaseLocalNote, setDispatchReleaseLocalNote] = useState("");
  const [driverAcknowledgementMessage, setDriverAcknowledgementMessage] = useState<Message | null>(null);
  const [driverAcknowledgementFollowUpStatus, setDriverAcknowledgementFollowUpStatus] =
    useState<DriverAcknowledgementFollowUpStatus>("pending");
  const [driverAcknowledgementFollowUpNote, setDriverAcknowledgementFollowUpNote] = useState("");
  const [dayOfTripDispatchMonitorStatus, setDayOfTripDispatchMonitorStatus] =
    useState<DayOfTripDispatchMonitorStatus>("reminder-due");
  const [dayOfTripExceptionEscalationStatus, setDayOfTripExceptionEscalationStatus] =
    useState<DayOfTripExceptionEscalationStatus>("late-reminder-due");
  const [dayOfTripExceptionEscalationNote, setDayOfTripExceptionEscalationNote] = useState("");
  const [dispatchRecoveryReplacementStatus, setDispatchRecoveryReplacementStatus] =
    useState<DispatchRecoveryReplacementStatus>("review-needed");
  const [dispatchRecoveryReplacementNote, setDispatchRecoveryReplacementNote] = useState("");
  const [postRecoveryUpdateStatus, setPostRecoveryUpdateStatus] =
    useState<PostRecoveryUpdateStatus>("review-needed");
  const [postRecoveryUpdateNote, setPostRecoveryUpdateNote] = useState("");
  const [dayOfTripCompletionHandoffStatus, setDayOfTripCompletionHandoffStatus] =
    useState<DayOfTripCompletionHandoffStatus>("review-needed");
  const [dayOfTripCompletionHandoffNote, setDayOfTripCompletionHandoffNote] = useState("");
  const [completedTripCloseoutReviewStatus, setCompletedTripCloseoutReviewStatus] =
    useState<CompletedTripCloseoutReviewStatus>("review-needed");
  const [completedTripCloseoutReviewNote, setCompletedTripCloseoutReviewNote] = useState("");
  const [closeoutToBillingPreparationReviewStatus, setCloseoutToBillingPreparationReviewStatus] =
    useState<CloseoutToBillingPreparationReviewStatus>("review-needed");
  const [closeoutToBillingPreparationReviewNote, setCloseoutToBillingPreparationReviewNote] =
    useState("");
  const [billingPreparationExceptionReviewStatus, setBillingPreparationExceptionReviewStatus] =
    useState<BillingPreparationExceptionReviewStatus>("review-needed");
  const [billingPreparationExceptionReviewNote, setBillingPreparationExceptionReviewNote] =
    useState("");
  const [acceptedReviewWarningKey, setAcceptedReviewWarningKey] = useState("");
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const [message, setMessage] = useState<Message>({
    tone: "info",
    text: "Ready for dispatch.",
  });
  const driverJobLinkUrl = useSyncExternalStore(
    subscribeToDriverJobUrlChange,
    getDriverJobUrl,
    () => fallbackDriverJobUrl,
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 30 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const adminBookingPersistenceStatusOptions = useMemo(
    () => getAdminBookingPersistenceStatusOptions(adminBookingPersistenceRecords),
    [adminBookingPersistenceRecords],
  );
  const filteredAdminBookingPersistenceRecords = useMemo(
    () =>
      filterAdminBookingPersistenceRecords(
        adminBookingPersistenceRecords,
        adminBookingPersistenceSearch,
        adminBookingPersistenceStatusFilter,
      ),
    [
      adminBookingPersistenceRecords,
      adminBookingPersistenceSearch,
      adminBookingPersistenceStatusFilter,
    ],
  );
  const adminBookingPersistenceHasActiveFilters =
    Boolean(clean(adminBookingPersistenceSearch)) ||
    adminBookingPersistenceStatusFilter !== adminBookingPersistenceAllStatusFilter;
  const adminCustomerRequestRecords = useMemo(
    () => filteredAdminBookingPersistenceRecords.filter(adminBookingPersistenceRecordIsCustomerRequest),
    [filteredAdminBookingPersistenceRecords],
  );
  const filteredAdminCustomerRequestRecords = useMemo(
    () =>
      orderAdminBookingPersistenceRecordsForCustomerRequestPriority(
        filterAdminCustomerRequestRecords(
          filteredAdminBookingPersistenceRecords,
          adminCustomerRequestSearch,
          adminCustomerRequestStatusFilter,
        ),
        currentTimeMs,
      ),
    [
      adminCustomerRequestSearch,
      adminCustomerRequestStatusFilter,
      currentTimeMs,
      filteredAdminBookingPersistenceRecords,
    ],
  );
  const adminCustomerRequestHasActiveFilters =
    Boolean(clean(adminCustomerRequestSearch)) ||
    adminCustomerRequestStatusFilter !== adminCustomerRequestAllStatusFilter;
  const prioritizedAdminBookingPersistenceRecords = useMemo(
    () =>
      orderAdminBookingPersistenceRecordsForCustomerRequestPriority(
        filteredAdminBookingPersistenceRecords,
        currentTimeMs,
      ),
    [currentTimeMs, filteredAdminBookingPersistenceRecords],
  );
  const displayedAdminBookingPersistenceRecords = adminCustomerRequestHasActiveFilters
    ? filteredAdminCustomerRequestRecords
    : prioritizedAdminBookingPersistenceRecords;
  const appliedAdminBookingSnapshot = useMemo(() => {
    return findAdminBookingPersistenceRecordByReference(
      adminBookingPersistenceRecords,
      appliedAdminBookingSnapshotReference,
    );
  }, [adminBookingPersistenceRecords, appliedAdminBookingSnapshotReference]);
  const appliedAdminBookingSnapshotHiddenByFilters =
    Boolean(appliedAdminBookingSnapshot) &&
    !findAdminBookingPersistenceRecordByReference(
      displayedAdminBookingPersistenceRecords,
      appliedAdminBookingSnapshotReference,
    );

  const telegramAlertPreviewTemplate = useMemo(
    () =>
      telegramAlertPreviewTemplates.find((template) => template.key === telegramAlertPreviewType) ||
      telegramAlertPreviewTemplates[0],
    [telegramAlertPreviewType],
  );
  const telegramAlertPreviewMessage = useMemo(
    () => telegramAlertPreviewTemplate.messageLines.join("\n"),
    [telegramAlertPreviewTemplate],
  );

  const route = useMemo(() => {
    const pickup = clean(booking.pickup);
    const dropoff = clean(booking.dropoff);
    const extraStopLocation = clean(booking.extraStopLocation);

    if (!pickup && !dropoff && !extraStopLocation) {
      return "Pickup > Drop-off";
    }

    return [
      pickup || "Pickup",
      extraStopLocation,
      dropoff || "Drop-off",
    ].filter(Boolean).join(" > ");
  }, [booking.dropoff, booking.extraStopLocation, booking.pickup]);

  const itineraryDisplayStops = useMemo(
    () => parseItineraryDisplayStops(booking.extraStopLocation),
    [booking.extraStopLocation],
  );
  const isDspItinerary = isDspMultiStopItineraryBooking(booking, itineraryDisplayStops);

  const jobCard = useMemo(() => {
    const flightLine = clean(booking.flight) ? `Flight: ${clean(booking.flight)}\n` : "";
    const safeCompany = normalizeCompanyAccount(booking.company, booking.bookerEmail);
    const companyLine = safeCompany ? `Company: ${safeCompany}\n` : "";
    const childSeatLine =
      clean(booking.childSeatRequired) === "yes"
        ? formatChildSeatNote(booking.childSeatCount, booking.childSeatType)
        : "";

    return [
      `${clean(booking.vehicle) || "Vehicle"} ${clean(booking.bookingType) || "Booking"}`,
      formatPickupDateTime(booking.date, booking.time),
      "",
      `${flightLine}${route}`,
      "",
      companyLine.trimEnd(),
      clean(booking.name) ? `Name: ${clean(booking.name)}` : "",
      `Pax: ${Number(clean(booking.pax)) || 1}`,
      childSeatLine,
    ]
      .filter(Boolean)
      .join("\n");
  }, [booking, route]);

  const jobCardPreview = useMemo(() => {
    const flightLine = clean(booking.flight) ? `Flight: ${clean(booking.flight)}\n` : "";
    const safeCompany = normalizeCompanyAccount(booking.company, booking.bookerEmail);
    const companyLine = safeCompany ? `Company: ${safeCompany}\n` : "";
    const childSeatLine =
      clean(booking.childSeatRequired) === "yes"
        ? formatChildSeatNote(booking.childSeatCount, booking.childSeatType)
        : "";

    return [
      `${clean(booking.vehicle) || "Vehicle"} ${clean(booking.bookingType) || "Booking"}`,
      formatPickupDateTime(booking.date, booking.time),
      "",
      `${flightLine}${formatPrivacySafeRoute(booking)}`,
      "",
      companyLine.trimEnd(),
      `Pax: ${Number(clean(booking.pax)) || 1}`,
      childSeatLine,
    ]
      .filter(Boolean)
      .join("\n");
  }, [booking]);

  const draftPricing = useMemo(() => {
    const safeCompany = normalizeCompanyAccount(booking.company, booking.bookerEmail);
    const matchingCompany = rateCompanies.find(
      (company) => clean(company.company_name).toLowerCase() === safeCompany.toLowerCase(),
    );
    const matchingTraveler = rateTravelers.find(
      (traveler) => clean(traveler.traveler_name).toLowerCase() === clean(booking.name).toLowerCase(),
    );
    const bookingDriverId = clean(booking.driverId);
    const bookingDriverName = clean(booking.driverName).toLowerCase();
    const matchingDriver = drivers.find(
      (driver) =>
        (bookingDriverId && String(driver.id) === bookingDriverId) ||
        (bookingDriverName && clean(driver.driver_name).toLowerCase() === bookingDriverName),
    );
    const pricing = resolvePricing(
      booking,
      matchingCompany ?? blankCompanyRecord(safeCompany),
      matchingTraveler ?? null,
      rateSettings,
      matchingDriver ?? null,
    );

    return {
      ...pricing,
      ...calculateProfit(
        pricing,
        booking.customerPriceOverride,
        clean(booking.driverPayoutOverride) || booking.savedDriverPayoutAmount,
      ),
    };
  }, [booking, drivers, rateCompanies, rateSettings, rateTravelers]);

  const visibleChildSeatTypeOptions = useMemo(() => {
    const currentChildSeatType = clean(booking.childSeatType);

    if (
      currentChildSeatType &&
      !childSeatTypeOptions.includes(currentChildSeatType as (typeof childSeatTypeOptions)[number])
    ) {
      return [currentChildSeatType, ...childSeatTypeOptions];
    }

    return [...childSeatTypeOptions];
  }, [booking.childSeatType]);

  const pricingReviewWarnings = useMemo(
    () => getPricingReviewWarnings(draftPricing),
    [draftPricing],
  );
  const needsReviewWarnings = useMemo(
    () => [...getNeedsReviewWarnings(booking), ...pricingReviewWarnings],
    [booking, pricingReviewWarnings],
  );
  const needsReviewAcceptanceKey = useMemo(
    () => getReviewAcceptanceKey(booking, needsReviewWarnings),
    [booking, needsReviewWarnings],
  );
  const manualExtraChargesAmountPreview = clean(booking.manualExtraCharges)
    ? `$${formatMoney(booking.manualExtraCharges)}`
    : "$0.00";
  const manualExtraChargesNotePreview = clean(booking.manualExtraChargesNote) || "Blank";
  const hasNeedsReviewWarnings = needsReviewWarnings.length > 0;
  const reviewWarningsAccepted = hasNeedsReviewWarnings && acceptedReviewWarningKey === needsReviewAcceptanceKey;
  const customerMatchSuggestion = useMemo(
    () =>
      parsedDebugBooking && !parsedDebugBooking.multipleBookingsDetected
        ? getMockCustomerMatchSuggestion(booking)
        : null,
    [booking, parsedDebugBooking],
  );

  const displayedCompanyOverrideRecords = useMemo(
    () =>
      rateCompanies.filter(
        (companyRecord) =>
          hasRateOverrideValues(companyRecord) ||
          rateOverrideListMessages.company?.recordId === companyRecord.id,
      ),
    [rateCompanies, rateOverrideListMessages.company?.recordId],
  );
  const displayedBossOverrideRecords = useMemo(
    () =>
      rateTravelers.filter(
        (travelerRecord) =>
          hasRateOverrideValues(travelerRecord) ||
          rateOverrideListMessages.boss?.recordId === travelerRecord.id,
      ),
    [rateTravelers, rateOverrideListMessages.boss?.recordId],
  );
  const assignableDrivers = useMemo(() => drivers.filter(isAssignableDriver), [drivers]);
  const filteredDrivers = useMemo(() => {
    const query = clean(driverSearchTerm);

    if (!query) {
      return [];
    }

    return drivers.filter((driver) => driverMatchesSearch(driver, query));
  }, [driverSearchTerm, drivers]);
  const driverDatabaseSearchQuery = clean(driverSearchTerm);
  const operationalBookings = useMemo(() => bookings.filter(isOperationalBooking), [bookings]);
  const dashboardDriverCandidates = useMemo(() => {
    const candidateMap = new Map<string, DashboardDriverCandidate>();
    const driversById = new Map(drivers.map((driver) => [driver.id, driver]));

    for (const driver of assignableDrivers) {
      candidateMap.set(`driver:${driver.id}`, {
        optionValue: String(driver.id),
        driverId: driver.id,
        driverName: clean(driver.driver_name),
        contactNumber: clean(driver.contact_number),
        vehicleType: clean(driver.vehicle_type),
        plateNumber: clean(driver.plate_number),
        availabilityStatus: clean(driver.availability_status),
        notes: clean(driver.notes),
        preferredAreas: clean(driver.preferred_areas),
        sourceDriver: driver,
        searchValues: [
          driver.driver_name,
          driver.contact_number,
          driver.plate_number,
          driver.vehicle_type,
          driver.availability_status,
          driver.preferred_areas,
          driver.notes,
        ],
      });
    }

    for (const bookingRecord of operationalBookings) {
      const bookingDriverId = bookingRecord.driver_id ?? null;
      const bookingDriverName = clean(bookingRecord.driver_name);
      const bookingDriverContact = clean(bookingRecord.driver_contact);
      const bookingDriverPlate = clean(bookingRecord.driver_plate_number);

      if (!bookingDriverId && !bookingDriverName && !bookingDriverContact && !bookingDriverPlate) {
        continue;
      }

      const linkedDriver = bookingDriverId !== null ? driversById.get(bookingDriverId) : null;

      if (linkedDriver && isInactiveDriver(linkedDriver)) {
        continue;
      }

      const candidateKey = bookingDriverId !== null
        ? `driver:${bookingDriverId}`
        : `booking:${bookingRecord.id}:${normalizeCompactSearch(
            [bookingDriverName, bookingDriverContact, bookingDriverPlate].join(" "),
          )}`;
      const existingCandidate = candidateMap.get(candidateKey);
      const bookingSearchValues = [
        bookingDriverName,
        bookingDriverContact,
        bookingDriverPlate,
        bookingRecord.vehicle,
        bookingRecord.driver_notes,
      ];

      if (existingCandidate) {
        existingCandidate.searchValues.push(...bookingSearchValues);
        existingCandidate.driverName ||= bookingDriverName;
        existingCandidate.contactNumber ||= bookingDriverContact;
        existingCandidate.plateNumber ||= bookingDriverPlate;
        existingCandidate.vehicleType ||= clean(bookingRecord.vehicle);
        existingCandidate.notes ||= clean(bookingRecord.driver_notes);
        continue;
      }

      candidateMap.set(candidateKey, {
        optionValue: bookingDriverId !== null ? String(bookingDriverId) : `booking:${bookingRecord.id}`,
        driverId: bookingDriverId,
        driverName: bookingDriverName,
        contactNumber: bookingDriverContact,
        vehicleType: clean(bookingRecord.vehicle),
        plateNumber: bookingDriverPlate,
        availabilityStatus: "",
        notes: clean(bookingRecord.driver_notes),
        preferredAreas: "",
        sourceDriver: linkedDriver ?? null,
        searchValues: bookingSearchValues,
      });
    }

    return [...candidateMap.values()];
  }, [assignableDrivers, drivers, operationalBookings]);

  const assignedDriverId = clean(booking.driverId);
  const assignedDriverName = clean(booking.driverName).toLowerCase();
  const assignedDriverRecord = drivers.find(
    (driver) =>
      (assignedDriverId && String(driver.id) === assignedDriverId) ||
      (assignedDriverName && clean(driver.driver_name).toLowerCase() === assignedDriverName),
  );
  const assignedDriverSelectValue = assignedDriverId || (assignedDriverRecord ? String(assignedDriverRecord.id) : "");
  const assignedDriverIsInactive = Boolean(assignedDriverRecord && isInactiveDriver(assignedDriverRecord));
  const showSavedAssignedDriverOption = Boolean(
    assignedDriverId && (!assignedDriverRecord || assignedDriverIsInactive),
  );
  const assignedDriverPlate = clean(booking.driverPlate) || clean(assignedDriverRecord?.plate_number);
  const customerLiveLocation = useMemo(
    () => customerLiveLocationState(booking, currentTimeMs),
    [booking, currentTimeMs],
  );

  const customerCopyCard = useMemo(() => {
    const serviceType = customerBookingTypeLabel(booking.bookingType);
    const childSeatLine =
      clean(booking.childSeatRequired) === "yes"
        ? formatChildSeatNote(booking.childSeatCount, booking.childSeatType)
        : "";
    const flightLine = clean(booking.flight) ? `Flight: ${clean(booking.flight)}` : "";
    const pickupLocation = clean(booking.pickup);
    const dropoffLocation = clean(booking.dropoff);
    const pickupLine = pickupLocation ? `Pickup: ${pickupLocation}` : "";
    const dropoffLine = dropoffLocation ? `Drop-off: ${dropoffLocation}` : "";
    const routeLines = isDspItinerary
      ? [
          flightLine,
          pickupLine,
          dropoffLine,
          "",
          "Itinerary:",
          ...itineraryDisplayStops.map((stop) => `${stop.time || "Time TBC"} - ${stop.location}`),
        ]
      : [
          flightLine,
          pickupLine,
          dropoffLine,
          `Route: ${route}`,
        ];
    const driverLines = [
      clean(booking.driverName) ? `Driver: ${clean(booking.driverName)}` : "",
      clean(booking.driverContact) ? `Driver contact: ${clean(booking.driverContact)}` : "",
      assignedDriverPlate ? `Car plate: ${assignedDriverPlate}` : "",
    ];
    const sections = [
      ["CUSTOMER BOOKING DETAILS"],
      [
        clean(booking.name) ? `Passenger: ${clean(booking.name)}` : "",
        serviceType ? `Service: ${serviceType}` : "",
        formatPickupDateTime(booking.date, booking.time),
      ],
      routeLines,
      driverLines,
      [customerLiveLocation.copyLine],
      [
        `Pax: ${Number(clean(booking.pax)) || 1}`,
        childSeatLine,
      ],
      ["Thank you for choosing Prestige Limo SG."],
    ];

    return sections
      .filter((section) => section.some((line) => clean(line)))
      .map((section) => section.join("\n").trim())
      .join("\n\n");
  }, [assignedDriverPlate, booking, customerLiveLocation.copyLine, isDspItinerary, itineraryDisplayStops, route]);

  const draftDriverDispatchCard = useMemo(() => {
    const bookingDriverId = clean(booking.driverId);
    const bookingDriverName = clean(booking.driverName).toLowerCase();
    const selectedDriver = drivers.find(
      (driver) =>
        (bookingDriverId && String(driver.id) === bookingDriverId) ||
        (bookingDriverName && clean(driver.driver_name).toLowerCase() === bookingDriverName),
    );
    const driverPlate = clean(booking.driverPlate) || clean(selectedDriver?.plate_number);
    const driverPayout = draftPricing.driverPayout;
    const childSeatLine =
      clean(booking.childSeatRequired) === "yes"
        ? formatChildSeatNote(booking.childSeatCount, booking.childSeatType)
        : "";
    const flightLine = clean(booking.flight) ? `Flight: ${clean(booking.flight)}` : "";
    const routeLines = isDspItinerary
      ? [
          flightLine,
          `Pickup: ${clean(booking.pickup) || "Pickup"}`,
          "",
          "Itinerary:",
          ...itineraryDisplayStops.map((stop) => `${stop.time || "Time TBC"} - ${stop.location}`),
        ]
      : [
          flightLine,
          route,
        ];
    const sections = [
      ["DRIVER DISPATCH"],
      [
        `Driver: ${clean(booking.driverName) || "Driver TBC"}`,
        clean(booking.driverContact) ? `Contact: ${clean(booking.driverContact)}` : "",
        driverPlate ? `Plate: ${driverPlate}` : "",
      ],
      [
        `${clean(booking.vehicle) || "Vehicle"} ${clean(booking.bookingType) || "Booking"}`,
        formatPickupDateTime(booking.date, booking.time),
      ],
      routeLines,
      [
        clean(booking.name) ? `Passenger: ${clean(booking.name)}` : "",
        `Pax: ${Number(clean(booking.pax)) || 1}`,
        childSeatLine,
        booking.driverIncludePayout && driverPayout ? `Payout: $${driverPayout}` : "",
      ],
    ];

    return sections
      .filter((section) => section.some((line) => clean(line)))
      .map((section) => section.join("\n").trim())
      .join("\n\n");
  }, [booking, draftPricing.driverPayout, drivers, isDspItinerary, itineraryDisplayStops, route]);

  const driverJobLinkMessage = useMemo(() => {
    const driverName = clean(booking.driverName) || "Driver";
    const flightLine = clean(booking.flight) ? `Flight: ${clean(booking.flight)}` : "";
    const localDemoWarning = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/.test(driverJobLinkUrl)
      ? "Local demo link only. Set NEXT_PUBLIC_APP_URL before sending to drivers."
      : "";
    const routeText = isDspItinerary
      ? [
          clean(booking.pickup) ? `Pickup: ${clean(booking.pickup)}` : "",
          clean(booking.dropoff) ? `Drop-off: ${clean(booking.dropoff)}` : "",
          "Itinerary:",
          ...itineraryDisplayStops.map((stop) => `${stop.time || "Time TBC"} - ${stop.location}`),
        ]
          .filter(Boolean)
          .join("\n")
      : route;
    const sections = [
      [
        "Driver Job Link",
        `Hi ${driverName},`,
        "Please open this driver job link and update your status:",
        driverJobLinkUrl,
        "Mock/demo driver job link only until secure production driver links are implemented.",
        localDemoWarning,
      ],
      [
        "Job:",
        loadedBookingId ? `Reference: ${loadedBookingId}` : "",
        formatPickupDateTime(booking.date, booking.time),
        flightLine,
      ],
      [
        "Pickup:",
        clean(booking.pickup) || "Pickup",
      ],
      [
        "Drop-off:",
        clean(booking.dropoff) || "Drop-off",
      ],
      [
        "Route:",
        routeText,
      ],
      [
        "Status to update:",
        "OTW / POB / Job Completed",
      ],
    ];

    return sections
      .filter((section) => section.some((line) => clean(line)))
      .map((section) => section.join("\n").trim())
      .join("\n\n");
  }, [booking, driverJobLinkUrl, isDspItinerary, itineraryDisplayStops, loadedBookingId, route]);

  const generatedDispatchCopyMessages = useMemo(
    () => ({
      customerCopy: customerCopyCard,
      driverDispatch: draftDriverDispatchCard,
      jobCard: jobCardPreview,
    }),
    [customerCopyCard, draftDriverDispatchCard, jobCardPreview],
  );
  const dispatchCopyResetKey = useMemo(
    () =>
      [
        loadedBookingId,
        jobCardPreview,
        customerCopyCard,
        draftDriverDispatchCard,
      ].join("\n--- copy reset ---\n"),
    [customerCopyCard, draftDriverDispatchCard, jobCardPreview, loadedBookingId],
  );

  const dashboardBookings = useMemo(() => {
    const query = clean(searchTerm).toLowerCase();

    return operationalBookings
      .filter((bookingRecord) => {
        if (!query) {
          return true;
        }

        const searchableText = [
          getBookingName(bookingRecord),
          getBookingCompany(bookingRecord),
          bookingRecord.flight_no,
          bookingRecord.route,
          bookingRecord.driver_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(query);
      })
      .sort((firstBooking, secondBooking) => {
        const firstDate = getBookingDateKey(firstBooking);
        const secondDate = getBookingDateKey(secondBooking);

        if (firstDate !== secondDate) {
          return firstDate.localeCompare(secondDate);
        }

        return (
          normaliseTimeForSort(firstBooking.pickup_time) -
          normaliseTimeForSort(secondBooking.pickup_time)
        );
      });
  }, [operationalBookings, searchTerm]);
  const completedBookings = useMemo(
    () =>
      operationalBookings.filter(
        (bookingRecord) => clean(bookingRecord.status).toLowerCase() === "completed",
      ),
    [operationalBookings],
  );
  const filteredRecentBookings = useMemo(
    () =>
      operationalBookings.filter((bookingRecord) =>
        bookingMatchesLocalSearch(bookingRecord, bookingsSearchTerm),
      ),
    [operationalBookings, bookingsSearchTerm],
  );
  const filteredCompletedBookings = useMemo(
    () =>
      completedBookings.filter((bookingRecord) =>
        bookingMatchesLocalSearch(bookingRecord, completedSearchTerm),
      ),
    [completedBookings, completedSearchTerm],
  );
  const hasBookingsSearch = Boolean(clean(bookingsSearchTerm));
  const hasCompletedSearch = Boolean(clean(completedSearchTerm));
  const loadedBookingIds = new Set(operationalBookings.map((bookingRecord) => String(bookingRecord.id)));
  const completedBookingIds = new Set(completedBookings.map((bookingRecord) => String(bookingRecord.id)));
  const completedTabCompletionMessages = Object.entries(bookingCompletionMessages).filter(
    ([bookingId, completionMessage]) =>
      loadedBookingIds.has(bookingId) &&
      !completedBookingIds.has(bookingId) &&
      completionMessage.text === "Completion undone." &&
      isUndoCompletionMessage(completionMessage),
  );
  const completedTabDeleteMessages = Object.entries(bookingCompletionMessages).filter(
    ([bookingId, completionMessage]) =>
      !loadedBookingIds.has(bookingId) &&
      completionMessage.text === "Completed job deleted." &&
      isDeleteCompletedJobMessage(completionMessage),
  );

  const multiBookingPreviewItems = Array.isArray(multiBookingNotice?.extractedBookingsPreview)
    ? multiBookingNotice.extractedBookingsPreview.filter(Boolean)
    : [];
  const aiDraftBookings = aiDraft?.bookings ?? [];
  const parsedDebugPreviewItems = Array.isArray(parsedDebugBooking?.extractedBookingsPreview)
    ? parsedDebugBooking.extractedBookingsPreview.filter(Boolean)
    : [];
  const shouldShowParserDebugPanel = Boolean(
    parsedDebugBooking &&
      (showParserDebug ||
        parsedDebugBooking.parserWarning ||
        parsedDebugPreviewItems.length > 0 ||
        parsedDebugBooking.multipleBookingsDetected),
  );

  const todayKey = toDateKey(new Date());
  const todayBookings = dashboardBookings.filter(
    (bookingRecord) => getBookingDateKey(bookingRecord) === todayKey,
  );
  const upcomingBookings = dashboardBookings.filter(
    (bookingRecord) => getBookingDateKey(bookingRecord) > todayKey,
  );
  const otherBookings = dashboardBookings.filter(
    (bookingRecord) => getBookingDateKey(bookingRecord) < todayKey,
  );

  function update(field: keyof BookingForm, value: string) {
    setCustomerMatchFeedback(null);
    setBooking((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function setDriverAssignmentMessage(bookingId: string, nextMessage: Message | null) {
    setDriverAssignmentMessages((current) => {
      if (!nextMessage) {
        const next = { ...current };
        delete next[bookingId];
        return next;
      }

      return {
        ...current,
        [bookingId]: nextMessage,
      };
    });
  }

  function clearReviewAndSaveState() {
    setAcceptedReviewWarningKey("");
    setBookingSaveMessage(null);
    setCustomerMatchFeedback(null);
  }

  function clearParseArtifacts() {
    setParsedDebugBooking(null);
    setShowParserDebug(false);
    setMultiBookingNotice(null);
    setAiDraft(null);
    setAiAssistMessage(null);
    setAiAssistLoading(false);
    setAiAssistResponseNote("");
    clearReviewAndSaveState();
    setMessage({
      tone: "info",
      text: "Ready for dispatch.",
    });
  }

  function clearBookingMessageInput() {
    clearParseArtifacts();
    setBookingMessage("");
    setBookingMessageResetKey((current) => current + 1);

    if (bookingMessageRef.current) {
      bookingMessageRef.current.value = "";
    }
  }

  function applyExtractedBooking(preview: NonNullable<ParsedBooking["extractedBookingsPreview"]>[number]) {
    const safePreview = preview ?? {};
    const sharedContextSource: Partial<BookingForm> = multiBookingNotice ?? parsedDebugBooking ?? {};
    const sharedContext = {
      company: clean(sharedContextSource.company),
      booker: clean(sharedContextSource.booker),
      bookerContact: clean(sharedContextSource.bookerContact),
      bookerEmail: clean(sharedContextSource.bookerEmail),
      vehicle: clean(sharedContextSource.vehicle),
    };

    setBooking((current) => ({
      ...current,
      ...(sharedContext.company ? { company: sharedContext.company } : {}),
      ...(sharedContext.booker ? { booker: sharedContext.booker } : {}),
      ...(sharedContext.bookerContact ? { bookerContact: sharedContext.bookerContact } : {}),
      ...(sharedContext.bookerEmail ? { bookerEmail: sharedContext.bookerEmail } : {}),
      vehicle: clean(safePreview.vehicle) || sharedContext.vehicle || current.vehicle,
      name: clean(safePreview.passenger),
      bookingType: clean(safePreview.type) || current.bookingType,
      date: clean(safePreview.date),
      time: clean(safePreview.time),
      flight: clean(safePreview.flight),
      pickup: clean(safePreview.pickup),
      dropoff: clean(safePreview.dropoff),
      pax: clean(safePreview.pax) || current.pax,
    }));
    setMessage({
      tone: "success",
      text: "Selected extracted booking. Review before saving.",
    });
    setParsedDebugBooking(null);
    setShowParserDebug(false);
    setMultiBookingNotice(null);
    setAcceptedReviewWarningKey("");
    setBookingSaveMessage(null);
    setCustomerMatchFeedback(null);
  }

  function setMockCustomerMatchAction(action: CustomerMatchFeedback["action"]) {
    if (!customerMatchSuggestion) {
      return;
    }

    if (action === "link") {
      setCustomerMatchFeedback({
        action,
        tone: customerMatchSuggestion.isExistingCustomer ? "success" : "error",
        text: customerMatchSuggestion.isExistingCustomer
          ? `Mock link selected for ${customerMatchSuggestion.customerName}. No customer record was written.`
          : "No existing mock customer folder is available to link. No customer record was written.",
      });
      return;
    }

    if (action === "create") {
      setCustomerMatchFeedback({
        action,
        tone: "success",
        text: `Mock create selected for ${customerMatchSuggestion.customerName}. No customer folder was created.`,
      });
      return;
    }

    setCustomerMatchFeedback({
      action,
      tone: "info",
      text: "Mock booking left unlinked. No customer record was changed.",
    });
  }

  function updateDefaultCustomerRate(bookingType: keyof Required<RateRules>, value: string) {
    setRateSettings((current) => ({
      ...current,
      customerRates: {
        ...current.customerRates,
        [bookingType]: numericRate(value),
      },
    }));
  }

  function updateDefaultDriverPayout(bookingType: keyof Required<RateRules>, value: string) {
    setRateSettings((current) => ({
      ...current,
      driverPayoutRules: {
        ...current.driverPayoutRules,
        [bookingType]:
          bookingType === "DSP"
            ? { amount: numericRate(value), perHour: true }
            : { min: numericRate(value), max: numericRate(value) },
      },
    }));
  }

  function updateCompanyOverrideRate(bookingType: keyof Required<RateRules>, value: string) {
    setRateOverrideDraft((current) => ({
      ...current,
      customerRates: clean(value)
        ? {
            ...current.customerRates,
            [bookingType]: numericRate(value),
          }
        : Object.fromEntries(
            Object.entries(current.customerRates).filter(([key]) => key !== bookingType),
          ) as RateRules,
    }));
  }

  function updateCompanyOverridePayout(bookingType: keyof Required<RateRules>, value: string) {
    setRateOverrideDraft((current) => ({
      ...current,
      driverPayoutRules: clean(value)
        ? {
            ...current.driverPayoutRules,
            [bookingType]:
              bookingType === "DSP"
                ? { amount: numericRate(value), perHour: true }
                : { min: numericRate(value), max: numericRate(value) },
          }
        : Object.fromEntries(
            Object.entries(current.driverPayoutRules).filter(([key]) => key !== bookingType),
          ) as DriverPayoutRules,
    }));
  }

  function bookingRecordToDriverDraft(bookingRecord: BookingRecord): DriverDraft {
    return {
      driverId: clean(bookingRecord.driver_id ? String(bookingRecord.driver_id) : ""),
      driverSearch: "",
      driverName: clean(bookingRecord.driver_name),
      driverContact: clean(bookingRecord.driver_contact),
      driverPlate: clean(bookingRecord.driver_plate_number),
      payoutOverride: clean(bookingRecord.driver_payout_override ? String(bookingRecord.driver_payout_override) : ""),
      payoutReason: clean(bookingRecord.driver_payout_reason),
      notes: clean(bookingRecord.driver_notes),
      includePayout: Boolean(bookingRecord.driver_dispatch_include_payout),
    };
  }

  function getDriverDraft(bookingRecord: BookingRecord) {
    return driverDrafts[String(bookingRecord.id)] ?? bookingRecordToDriverDraft(bookingRecord);
  }

  function findDashboardDriverCandidate(value: string | boolean) {
    const selectedValue = typeof value === "string" ? clean(value) : "";

    if (!selectedValue) {
      return null;
    }

    return (
      dashboardDriverCandidates.find(
        (candidate) =>
          candidate.optionValue === selectedValue ||
          (candidate.driverId !== null && String(candidate.driverId) === selectedValue),
      ) ?? null
    );
  }

  function loadDriverProfileDraft(driver: DriverRecord) {
    setDriverProfileDraft({
      driverId: String(driver.id),
      driverName: clean(driver.driver_name),
      contactNumber: clean(driver.contact_number),
      vehicleType: clean(driver.vehicle_type),
      plateNumber: clean(driver.plate_number),
      payoutPreferences: clean(driver.payout_preferences),
      availabilityStatus: clean(driver.availability_status) || "available",
      notes: clean(driver.notes),
      preferredAreas: clean(driver.preferred_areas),
      airportPermitNotes: clean(driver.airport_permit_notes),
      payoutRules: driver.driver_payout_rules ?? {},
    });
  }

  function applyDriverToBooking(driverId: string) {
    if (!driverId) {
      setBooking((current) => ({
        ...current,
        driverId: "",
        driverName: "",
        driverContact: "",
        driverPlate: "",
        driverNotes: "",
      }));
      return;
    }

    const selectedDriver = drivers.find((driver) => String(driver.id) === driverId);

    if (!selectedDriver) {
      setBooking((current) => ({
        ...current,
        driverId,
      }));
      return;
    }

    setBooking((current) => ({
      ...current,
      driverId,
      driverName: clean(selectedDriver.driver_name),
      driverContact: clean(selectedDriver.contact_number),
      driverPlate: clean(selectedDriver.plate_number),
      driverNotes: clean(selectedDriver.notes),
    }));
  }

  function updateDriverProfilePayout(bookingType: keyof Required<RateRules>, value: string) {
    setDriverProfileDraft((current) => ({
      ...current,
      payoutRules: {
        ...current.payoutRules,
        [bookingType]:
          bookingType === "DSP"
            ? { amount: numericRate(value), perHour: true }
            : { min: numericRate(value), max: numericRate(value) },
      },
    }));
  }

  function updateDriverDraft(
    bookingRecord: BookingRecord,
    field: keyof DriverDraft,
    value: string | boolean,
  ) {
    const bookingId = String(bookingRecord.id);
    const selectedDashboardDriver =
      field === "driverId" ? findDashboardDriverCandidate(value) : null;
    const clearedDriverSelection =
      field === "driverId" && typeof value === "string" && !clean(value)
        ? {
            driverSearch: "",
            driverName: "",
            driverContact: "",
            driverPlate: "",
            payoutOverride: "",
            payoutReason: "",
            notes: "",
            includePayout: false,
          }
        : {};

    setDriverDrafts((current) => {
      const currentDriverDraft = current[bookingId] ?? bookingRecordToDriverDraft(bookingRecord);
      const selectedDriverForSearch = currentDriverDraft.driverId
        ? findDashboardDriverCandidate(currentDriverDraft.driverId)
        : null;
      const selectedDriverMatchesNewSearch = selectedDriverForSearch
        ? dashboardDriverCandidateMatchesSearch(selectedDriverForSearch, value.toString())
        : false;
      const currentDraftMatchesNewSearch = driverDraftMatchesSearch(currentDriverDraft, value.toString());
      const searchChangedAwayFromSelectedDriver =
        field === "driverSearch" &&
        typeof value === "string" &&
        Boolean(clean(value)) &&
        Boolean(currentDriverDraft.driverId) &&
        !selectedDriverMatchesNewSearch &&
        !currentDraftMatchesNewSearch;
      const clearedStaleDriverSelection = searchChangedAwayFromSelectedDriver
        ? {
            driverId: "",
            driverName: "",
            driverContact: "",
            driverPlate: "",
            payoutOverride: "",
            payoutReason: "",
            notes: "",
            includePayout: false,
          }
        : {};

      return {
        ...current,
        [bookingId]: {
          ...currentDriverDraft,
          [field]: value,
          ...clearedDriverSelection,
          ...clearedStaleDriverSelection,
          ...(selectedDashboardDriver
            ? {
                driverName: clean(selectedDashboardDriver.driverName),
                driverSearch: clean(selectedDashboardDriver.driverName),
                driverContact: clean(selectedDashboardDriver.contactNumber),
                driverPlate: clean(selectedDashboardDriver.plateNumber),
                payoutOverride: "",
                payoutReason: "",
                notes: clean(selectedDashboardDriver.notes),
              }
            : {}),
        },
      };
    });
  }

  function validateBooking() {
    if (clean(booking.bookerEmail) && !isValidEmail(booking.bookerEmail)) {
      setMessage({
        tone: "error",
        text: "Booker email must be valid when provided.",
      });
      return false;
    }

    return true;
  }

  function isAirportAddress(value: string) {
    return /\b(?:changi|airport|terminal|t[1-4])\b/i.test(value);
  }

  function getReusableNameAddress() {
    const pickup = clean(booking.pickup);
    const dropoff = clean(booking.dropoff);

    if (pickup && isAirportAddress(pickup) && dropoff && !isAirportAddress(dropoff)) {
      return dropoff;
    }

    if (dropoff && isAirportAddress(dropoff) && pickup && !isAirportAddress(pickup)) {
      return pickup;
    }

    return dropoff || pickup;
  }

  function applyNameMemory(parsedBooking: ParsedBooking, nameMemory: NameMemory) {
    const enrichedBooking = { ...parsedBooking };
    const bookingType = clean(enrichedBooking.bookingType || booking.bookingType).toUpperCase();
    const safeMemoryCompany = normalizeCompanyAccount(
      nameMemory.company,
      clean(enrichedBooking.bookerEmail) || clean(booking.bookerEmail),
    );

    if (!clean(enrichedBooking.company) && safeMemoryCompany) {
      enrichedBooking.company = safeMemoryCompany;
    }

    if (!clean(enrichedBooking.vehicle) && nameMemory.preferredVehicle) {
      enrichedBooking.vehicle = nameMemory.preferredVehicle;
    }

    if (nameMemory.savedAddress) {
      if (bookingType === "DEP" && !clean(enrichedBooking.pickup)) {
        enrichedBooking.pickup = nameMemory.savedAddress;
      } else if (!clean(enrichedBooking.dropoff)) {
        enrichedBooking.dropoff = nameMemory.savedAddress;
      }
    }

    return enrichedBooking;
  }

  async function lookupNameMemory(personName: string): Promise<NameMemory | null> {
    if (!adminLegacyDataClient || !personName) {
      return null;
    }

    const nameResult = await adminLegacyDataClient
      .from(adminLegacyTables.travelers)
      .select("id, company_id, traveler_name, preferred_vehicle, default_address, default_pickup_address, default_dropoff_address, booker_id, booker_name, booker_contact, booker_email, customer_rates, driver_payout_rules")
      .ilike("traveler_name", personName)
      .limit(1)
      .maybeSingle();

    if (nameResult.error || !nameResult.data) {
      return null;
    }

    const nameRecord = nameResult.data as TravelerRecord;
    const [companyResult, addressResult] = await Promise.all([
      adminLegacyDataClient
        .from(adminLegacyTables.companies)
      .select("id, company_name")
        .eq("id", nameRecord.company_id)
        .limit(1)
        .maybeSingle(),
      adminLegacyDataClient
        .from(adminLegacyTables.savedAddresses)
        .select("id, company_id, traveler_id, label, address, address_role, is_default, use_count")
        .eq("traveler_id", nameRecord.id)
        .order("is_default", { ascending: false })
        .order("use_count", { ascending: false })
        .order("last_used_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (companyResult.error || addressResult.error) {
      return null;
    }

    const companyRecord = companyResult.data as CompanyRecord | null;
    const savedAddress = addressResult.data as SavedAddressRecord | null;

    return {
      company: normalizeCompanyAccount(companyRecord?.company_name, nameRecord.booker_email),
      companyId: nameRecord.company_id,
      travelerId: nameRecord.id,
      savedAddress: clean(savedAddress?.address) || clean(nameRecord.default_address),
      preferredVehicle: clean(nameRecord.preferred_vehicle),
    };
  }

  async function applyParsedBookingMessage(messageText: string) {
    clearParseArtifacts();
    setLoadedBookingId("");

    if (!clean(messageText)) {
      setMessage({ tone: "error", text: "Paste a booking message before parsing." });
      return;
    }

    setBooking(() => createInitialBooking());

    const parsedBooking = parseBookingMessageForState(messageText);

    const detectedFields = Object.entries(parsedBooking).filter(([, value]) => hasParsedValue(value)).length;

    if (detectedFields === 0) {
      setMessage({
        tone: "error",
        text: "No booking details detected. Add labels like pickup, dropoff, date, time, name, or flight.",
      });
      return;
    }

    if (parsedBooking.multipleBookingsDetected) {
      const finalForm = createInitialBooking();

      setMultiBookingNotice(parsedBooking);
      setParsedDebugBooking({
        ...finalForm,
        ...(parsedBooking.cleanedLines ? { cleanedLines: parsedBooking.cleanedLines } : {}),
        ...(parsedBooking.extractedBookingsPreview
          ? { extractedBookingsPreview: parsedBooking.extractedBookingsPreview }
          : {}),
        ...(parsedBooking.company ? { company: parsedBooking.company } : {}),
        ...(parsedBooking.booker ? { booker: parsedBooking.booker } : {}),
        success: false,
        multipleBookingsDetected: true,
        parserWarning: parsedBooking.parserWarning,
      });
      setMessage({
        tone: "error",
        text: parsedBooking.parserWarning || "Multiple bookings detected. Please select one extracted booking.",
      });
      return;
    }

    setMultiBookingNotice(null);
    const parsedBookingForMerge = { ...parsedBooking };
    const finalForm = mergeParsedBookingIntoForm(createInitialBooking(), parsedBookingForMerge);

    const finalDebugBooking = {
      ...finalForm,
      ...(parsedBookingForMerge.cleanedLines ? { cleanedLines: parsedBookingForMerge.cleanedLines } : {}),
    };

    setBooking(() => finalForm);
    setParsedDebugBooking(() => ({
      ...finalForm,
      ...(parsedBookingForMerge.cleanedLines ? { cleanedLines: parsedBookingForMerge.cleanedLines } : {}),
    }));
    setMessage({
      tone: "success",
      text: `Parsed ${detectedFields} field${detectedFields === 1 ? "" : "s"}. Review before saving.`,
    });

    if (getNeedsReviewWarnings(finalForm).length > 0) {
      return;
    }

    const nameMemory = await lookupNameMemory(parsedBooking.name || "");

    if (nameMemory) {
      const crmEnrichedBooking = applyNameMemory(parsedBookingForMerge, nameMemory);
      const crmUpdatesForMerge = {
        ...crmEnrichedBooking,
        name: clean(parsedBookingForMerge.name) || clean(crmEnrichedBooking.name),
      };

      setBooking((prev) => mergeCrmUpdatesIntoForm(prev, crmUpdatesForMerge));
      setParsedDebugBooking((prev) => ({
        ...mergeCrmUpdatesIntoForm(prev ?? finalDebugBooking, crmUpdatesForMerge),
        ...(crmUpdatesForMerge.cleanedLines ? { cleanedLines: crmUpdatesForMerge.cleanedLines } : {}),
      }));
      setMessage({
        tone: "success",
        text: `Parsed ${detectedFields} fields and applied CRM memory. Review before saving.`,
      });
    }
  }

  async function handleParseBookingMessage() {
    await applyParsedBookingMessage(bookingMessage);
  }

  async function handleMockAiAssistParse() {
    if (!aiAssistSafetyAccepted) {
      setAiDraft(null);
      setAiAssistResponseNote("");
      setAiAssistMessage({
        tone: "error",
        text: "Tick the AI safety checkbox to enable AI Assist.",
      });
      return;
    }

    if (!clean(bookingMessage)) {
      setAiDraft(null);
      setAiAssistResponseNote("");
      setAiAssistMessage({
        tone: "error",
        text: "Paste a booking message before using AI Assist Parse.",
      });
      return;
    }

    setAiDraft(null);
    setAiAssistResponseNote("");
    setAiAssistMessage(null);
    setAiAssistLoading(true);

    try {
      const response = await fetch("/api/ai-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean(bookingMessage) }),
      });
      const responseBody = await response.json().catch(() => ({})) as {
        ok?: unknown;
        error?: unknown;
        result?: unknown;
      };

      if (!response.ok || responseBody.ok !== true) {
        setAiDraft(null);
        setAiAssistMessage({
          tone: "error",
          text: typeof responseBody.error === "string"
            ? responseBody.error
            : "AI Assist Parse failed. Please try again.",
        });
        return;
      }

      setAiDraft(sanitizeAiParseResult(responseBody.result));
      setAiAssistResponseNote("Mock AI Assist response from local API route. No OpenAI request was made.");
      setAiAssistMessage(null);
    } catch {
      setAiDraft(null);
      setAiAssistResponseNote("");
      setAiAssistMessage({
        tone: "error",
        text: "AI Assist Parse failed. Local mock API route did not respond.",
      });
    } finally {
      setAiAssistLoading(false);
    }
  }

  async function resolveCompany() {
    if (!adminLegacyDataClient) {
      throw new Error("Admin data API is not available.");
    }

    const client = adminLegacyDataClient;
    const detectedCompany = getKnownCompanyForRelationship(
      booking.booker,
      booking.name,
      booking.company,
    );
    const companyName = normalizeCompanyAccount(detectedCompany || booking.company, booking.bookerEmail);
    const bookerName = clean(booking.booker);
    const personName = clean(booking.name);
    const bookerContact = normalizePhone(booking.bookerContact);
    const domain = getEmailDomain(booking.bookerEmail);

    async function getCompanyById(companyId: number | null) {
      if (!companyId) {
        return null;
      }

      const companyResult = await client
        .from(adminLegacyTables.companies)
        .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
        .eq("id", companyId)
        .limit(1)
        .maybeSingle();

      if (companyResult.error) {
        throw new Error(companyResult.error.message);
      }

      const companyRecord = companyResult.data as CompanyRecord | null;
      const safeCompanyName = normalizeCompanyAccount(companyRecord?.company_name, booking.bookerEmail);

      if (
        companyRecord &&
        ((clean(companyRecord.company_name) && !safeCompanyName) || isIgnoredAccountEmailDomain(companyRecord.domain))
      ) {
        return null;
      }

      return companyRecord;
    }

    async function getCompanyBySafeName(safeCompanyName: string) {
      if (!safeCompanyName) {
        return null;
      }

      const existingByName = await client
        .from(adminLegacyTables.companies)
        .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
        .ilike("company_name", safeCompanyName)
        .limit(1)
        .maybeSingle();

      if (existingByName.error) {
        throw new Error(existingByName.error.message);
      }

      return (existingByName.data as CompanyRecord | null) ?? null;
    }

    if (companyName) {
      const existingByName = await getCompanyBySafeName(companyName);

      if (existingByName) {
        return existingByName;
      }
    }

    if (bookerContact) {
      const existingByContact = await client
        .from(adminLegacyTables.bookers)
        .select("company_id")
        .eq("phone", bookerContact)
        .limit(1)
        .maybeSingle();

      if (existingByContact.error) {
        throw new Error(existingByContact.error.message);
      }

      const contactLookup = existingByContact.data as CompanyIdLookupRecord | null;
      const companyByContact = await getCompanyById(contactLookup?.company_id ?? null);

      if (companyByContact) {
        return companyByContact;
      }
    }

    if (domain) {
      const existingByDomain = await client
        .from(adminLegacyTables.companies)
        .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
        .eq("domain", domain)
        .limit(1)
        .maybeSingle();

      if (existingByDomain.error) {
        throw new Error(existingByDomain.error.message);
      }

      if (existingByDomain.data) {
        return existingByDomain.data as CompanyRecord;
      }
    }

    if (bookerName) {
      const existingByBooker = await client
        .from(adminLegacyTables.bookers)
        .select("company_id")
        .ilike("booker_name", bookerName)
        .limit(1)
        .maybeSingle();

      if (existingByBooker.error) {
        throw new Error(existingByBooker.error.message);
      }

      const bookerLookup = existingByBooker.data as CompanyIdLookupRecord | null;
      const companyByBooker = await getCompanyById(bookerLookup?.company_id ?? null);

      if (companyByBooker) {
        return companyByBooker;
      }
    }

    if (personName) {
      const existingByName = await client
        .from(adminLegacyTables.travelers)
        .select("company_id")
        .ilike("traveler_name", personName)
        .limit(1)
        .maybeSingle();

      if (existingByName.error) {
        throw new Error(existingByName.error.message);
      }

      const nameLookup = existingByName.data as CompanyIdLookupRecord | null;
      const companyByName = await getCompanyById(nameLookup?.company_id ?? null);

      if (companyByName) {
        return companyByName;
      }
    }

    const companyNameToCreate = companyName || domain;

    if (!companyNameToCreate) {
      return blankCompanyRecord("");
    }

    const createdCompany = await client
      .from(adminLegacyTables.companies)
      .insert({
        company_name: companyNameToCreate,
        domain: domain || null,
        customer_rates: {},
        driver_payout_rules: {},
      })
      .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
      .single();

    if (createdCompany.error) {
      const duplicateCompanyName =
        createdCompany.error.code === "23505" ||
        /duplicate key value violates unique constraint "companies_company_name_key"/i.test(
          createdCompany.error.message,
        );

      if (duplicateCompanyName) {
        const existingByName = await getCompanyBySafeName(companyNameToCreate);

        if (existingByName) {
          return existingByName;
        }
      }

      throw new Error(createdCompany.error.message);
    }

    return createdCompany.data as CompanyRecord;
  }

  async function resolveBooker(companyId: number) {
    if (!adminLegacyDataClient) {
      throw new Error("Admin data API is not available.");
    }

    const client = adminLegacyDataClient;
    const email = normaliseEmail(booking.bookerEmail);
    const phone = normalizePhone(booking.bookerContact);
    const bookerName = clean(booking.booker) || (!clean(booking.company) ? clean(booking.name) : "");

    if (!bookerName) {
      return null;
    }

    async function updateBookerIfNeeded(bookerRecord: BookerRecord) {
      const updatePayload = {
        booker_name: bookerRecord.booker_name || bookerName,
        email: bookerRecord.email || email || null,
        phone: bookerRecord.phone || phone || null,
      };

      const { error } = await client.from(adminLegacyTables.bookers).update(updatePayload).eq("id", bookerRecord.id);

      if (error) {
        throw new Error(error.message);
      }

      return {
        ...bookerRecord,
        ...updatePayload,
      };
    }

    if (phone) {
      const existingByPhone = await client
        .from(adminLegacyTables.bookers)
        .select("id, company_id, booker_name, email, phone")
        .eq("company_id", companyId)
        .eq("phone", phone)
        .limit(1)
        .maybeSingle();

      if (existingByPhone.error) {
        throw new Error(existingByPhone.error.message);
      }

      if (existingByPhone.data) {
        return updateBookerIfNeeded(existingByPhone.data as BookerRecord);
      }
    }

    if (email) {
      const existingByEmail = await client
        .from(adminLegacyTables.bookers)
        .select("id, company_id, booker_name, email, phone")
        .eq("company_id", companyId)
        .eq("email", email)
        .limit(1)
        .maybeSingle();

      if (existingByEmail.error) {
        throw new Error(existingByEmail.error.message);
      }

      if (existingByEmail.data) {
        return updateBookerIfNeeded(existingByEmail.data as BookerRecord);
      }
    }

    const existingByName = await client
      .from(adminLegacyTables.bookers)
      .select("id, company_id, booker_name, email, phone")
      .eq("company_id", companyId)
      .ilike("booker_name", bookerName)
      .limit(1)
      .maybeSingle();

    if (existingByName.error) {
      throw new Error(existingByName.error.message);
    }

    if (existingByName.data) {
      return updateBookerIfNeeded(existingByName.data as BookerRecord);
    }

    const createdBooker = await client
      .from(adminLegacyTables.bookers)
      .insert({
        company_id: companyId,
        booker_name: bookerName,
        email: email || null,
        phone: phone || null,
      })
      .select("id, company_id, booker_name, email, phone")
      .single();

    if (createdBooker.error) {
      throw new Error(createdBooker.error.message);
    }

    return createdBooker.data as BookerRecord;
  }

  async function resolveName(companyId: number, booker: BookerRecord | null) {
    if (!adminLegacyDataClient) {
      throw new Error("Admin data API is not available.");
    }

    const personName = clean(booking.name);

    if (!personName) {
      return null;
    }

    const existingName = await adminLegacyDataClient
      .from(adminLegacyTables.travelers)
      .select("id, company_id, traveler_name, preferred_vehicle, default_address, default_pickup_address, default_dropoff_address, booker_id, booker_name, booker_contact, booker_email, customer_rates, driver_payout_rules")
      .eq("company_id", companyId)
      .ilike("traveler_name", personName)
      .limit(1)
      .maybeSingle();

    if (existingName.error) {
      throw new Error(existingName.error.message);
    }

    if (existingName.data) {
      const existingRecord = existingName.data as TravelerRecord;
      const updatePayload: Partial<TravelerRecord> = {
        booker_id: existingRecord.booker_id || booker?.id || null,
        booker_name: existingRecord.booker_name || clean(booker?.booker_name),
        booker_contact: existingRecord.booker_contact || clean(booker?.phone),
        booker_email: existingRecord.booker_email || clean(booker?.email),
      };

      const { error } = await adminLegacyDataClient.from(adminLegacyTables.travelers).update(updatePayload).eq("id", existingRecord.id);

      if (error) {
        throw new Error(error.message);
      }

      return {
        ...existingRecord,
        ...updatePayload,
      };
    }

    const createdName = await adminLegacyDataClient
      .from(adminLegacyTables.travelers)
      .insert({
        company_id: companyId,
        traveler_name: personName,
        booker_id: booker?.id ?? null,
        booker_name: clean(booker?.booker_name) || null,
        booker_contact: clean(booker?.phone) || null,
        booker_email: clean(booker?.email) || null,
      })
      .select("id, company_id, traveler_name, preferred_vehicle, default_address, default_pickup_address, default_dropoff_address, booker_id, booker_name, booker_contact, booker_email, customer_rates, driver_payout_rules")
      .single();

    if (createdName.error) {
      throw new Error(createdName.error.message);
    }

    return createdName.data as TravelerRecord;
  }

  async function rememberNameCrmDetails(companyId: number, travelerId: number | null) {
    if (!adminLegacyDataClient || !travelerId) {
      return;
    }

    const address = getReusableNameAddress();
    const preferredVehicle = clean(booking.vehicle);
    const updatePayload: Partial<TravelerRecord> = {};

    if (preferredVehicle) {
      updatePayload.preferred_vehicle = preferredVehicle;
    }

    if (address) {
      updatePayload.default_address = address;
    }

    if (clean(booking.pickup) && !isAirportAddress(booking.pickup)) {
      updatePayload.default_pickup_address = clean(booking.pickup);
    }

    if (clean(booking.dropoff) && !isAirportAddress(booking.dropoff)) {
      updatePayload.default_dropoff_address = clean(booking.dropoff);
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await adminLegacyDataClient.from(adminLegacyTables.travelers).update(updatePayload).eq("id", travelerId);

      if (error) {
        throw new Error(error.message);
      }
    }

    if (!address) {
      return;
    }

    const existingAddress = await adminLegacyDataClient
      .from(adminLegacyTables.savedAddresses)
      .select("id, company_id, traveler_id, label, address, address_role, is_default, use_count")
      .eq("traveler_id", travelerId)
      .ilike("address", address)
      .limit(1)
      .maybeSingle();

    if (existingAddress.error) {
      throw new Error(existingAddress.error.message);
    }

    if (existingAddress.data) {
      const savedAddress = existingAddress.data as SavedAddressRecord;
      const { error } = await adminLegacyDataClient
        .from(adminLegacyTables.savedAddresses)
        .update({
          company_id: companyId,
          address,
          is_default: true,
          use_count: (savedAddress.use_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", savedAddress.id);

      if (error) {
        throw new Error(error.message);
      }

      return;
    }

    const { error } = await adminLegacyDataClient.from(adminLegacyTables.savedAddresses).insert({
      company_id: companyId,
      traveler_id: travelerId,
      label: "Default",
      address,
      address_role: "traveler_default",
      is_default: true,
      use_count: 1,
      last_used_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  async function loadRates(successText = "Rates loaded.", options?: { preserveAction?: boolean }) {
    if (!adminLegacyDataClient) {
      if (!options?.preserveAction) {
        setRateMessageTarget("header");
      }
      const errorMessage =
        "Admin data API is not available.";

      setMessage({
        tone: "error",
        text: `Load failed: ${errorMessage}`,
      });
      return { ok: false, errorMessage };
    }

    setSavingRates(true);
    if (!options?.preserveAction) {
      setRateAction("load");
      setRateMessageTarget("header");
    }
    setMessage({ tone: "info", text: "Loading rates..." });

    try {
      const [settingsResult, companiesResult, travelersResult] = await Promise.all([
        adminLegacyDataClient
          .from(adminLegacyTables.rateSettings)
          .select("customer_rates, driver_payout_rules, midnight_surcharge, extra_stop_surcharge, midnight_payout, extra_stop_payout, child_seat_customer_surcharge, child_seat_driver_payout")
          .eq("id", "default")
          .limit(1)
          .maybeSingle(),
        adminLegacyDataClient
          .from(adminLegacyTables.companies)
          .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
          .order("company_name", { ascending: true }),
        adminLegacyDataClient
          .from(adminLegacyTables.travelers)
          .select("id, company_id, traveler_name, customer_rates, driver_payout_rules")
          .order("traveler_name", { ascending: true }),
      ]);

      const loadError = settingsResult.error || companiesResult.error || travelersResult.error;

      if (loadError) {
        throw new Error(formatSupabaseError(loadError));
      }

      const settings = settingsResult.data as RateSettingsRecord | null;
      const loadedCustomerRates = normalizeCustomerRateRules(settings?.customer_rates as RateRules | null | undefined);
      const loadedDriverPayoutRules = normalizeDriverPayoutRules(
        settings?.driver_payout_rules as DriverPayoutRules | null | undefined,
      );

      setRateSettings({
        customerRates: {
          ...defaultCustomerRates,
          ...loadedCustomerRates,
        },
        driverPayoutRules: {
          ...defaultDriverPayoutRules,
          ...loadedDriverPayoutRules,
        },
        midnightSurcharge: settings ? numericRate(settings.midnight_surcharge) : initialRateSettings.midnightSurcharge,
        extraStopSurcharge: settings
          ? positiveRateOrDefault(settings.extra_stop_surcharge, initialRateSettings.extraStopSurcharge)
          : initialRateSettings.extraStopSurcharge,
        midnightPayout: settings ? numericRate(settings.midnight_payout) : initialRateSettings.midnightPayout,
        extraStopPayout: settings
          ? positiveRateOrDefault(settings.extra_stop_payout, initialRateSettings.extraStopPayout)
          : initialRateSettings.extraStopPayout,
        childSeatCustomerSurcharge: settings?.child_seat_customer_surcharge === undefined
          ? defaultChildSeatCustomerSurcharge
          : positiveRateOrDefault(settings.child_seat_customer_surcharge, defaultChildSeatCustomerSurcharge),
        childSeatDriverPayout: settings?.child_seat_driver_payout === undefined
          ? defaultChildSeatDriverPayout
          : positiveRateOrDefault(settings.child_seat_driver_payout, defaultChildSeatDriverPayout),
      });

      setRateCompanies(
        ((companiesResult.data ?? []) as CompanyRecord[]).map((companyRecord) => ({
          ...companyRecord,
          customer_rates: normalizeCustomerRateRules(companyRecord.customer_rates),
          driver_payout_rules: normalizeDriverPayoutRules(companyRecord.driver_payout_rules),
        })),
      );
      setRateTravelers(
        ((travelersResult.data ?? []) as TravelerRecord[]).map((travelerRecord) => ({
          ...travelerRecord,
          customer_rates: normalizeCustomerRateRules(travelerRecord.customer_rates),
          driver_payout_rules: normalizeDriverPayoutRules(travelerRecord.driver_payout_rules),
        })),
      );
      setRatesLoaded(true);
      setMessage({ tone: "success", text: successText });
      return { ok: true, errorMessage: "" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown rate load error.";

      setMessage({
        tone: "error",
        text: formatRatesSetupError(errorMessage, "Load failed: "),
      });
      return { ok: false, errorMessage };
    } finally {
      if (!options?.preserveAction) {
        setRateAction(null);
      }
      setSavingRates(false);
    }
  }

  async function saveDefaultRates() {
    if (!adminLegacyDataClient) {
      setRateMessageTarget("header");
      setMessage({
        tone: "error",
        text: "Save failed: Admin data API is not available.",
      });
      return;
    }

    setSavingRates(true);
    setRateAction("defaults");
    setRateMessageTarget("header");
    setMessage({ tone: "info", text: "Saving default rates..." });

    try {
      const customerRates = {
        ...defaultCustomerRates,
        ...normalizeCustomerRateRules(rateSettings.customerRates),
      };
      const driverPayoutRules = {
        ...defaultDriverPayoutRules,
        ...normalizeDriverPayoutRules(rateSettings.driverPayoutRules),
      };
      const { error } = await adminLegacyDataClient
        .from(adminLegacyTables.rateSettings)
        .upsert({
          id: "default",
          customer_rates: customerRates,
          driver_payout_rules: driverPayoutRules,
          midnight_surcharge: rateSettings.midnightSurcharge,
          extra_stop_surcharge: rateSettings.extraStopSurcharge,
          midnight_payout: rateSettings.midnightPayout,
          extra_stop_payout: rateSettings.extraStopPayout,
          child_seat_customer_surcharge: rateSettings.childSeatCustomerSurcharge,
          child_seat_driver_payout: rateSettings.childSeatDriverPayout,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(formatSupabaseError(error));
      }

      setRateSettings((current) => ({
        ...current,
        customerRates,
        driverPayoutRules,
      }));
      setMessage({ tone: "success", text: "Default rates saved." });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown default rate save error.";

      setMessage({
        tone: "error",
        text: formatRatesSetupError(errorMessage, "Save failed: "),
      });
    } finally {
      setRateAction(null);
      setSavingRates(false);
    }
  }

  async function saveRateOverride() {
    setRateMessageTarget("override");

    if (!adminLegacyDataClient) {
      setMessage({
        tone: "error",
        text: "Save rate override failed: Admin data API is not available.",
      });
      return;
    }

    const companyName = clean(rateOverrideDraft.companyName);
    const bossName = clean(rateOverrideDraft.bossName);
    const invalidRateLabels = getNonPositiveRateOverrideLabels(
      rateOverrideDraft.customerRates,
      rateOverrideDraft.driverPayoutRules,
    );
    const overrideCustomerRates = normalizeCustomerRateRules(rateOverrideDraft.customerRates);
    const overrideDriverPayoutRules = normalizeDriverPayoutRules(rateOverrideDraft.driverPayoutRules);
    const hasOverrideValues = formatOverrideSummary(
      overrideCustomerRates,
      overrideDriverPayoutRules,
    ).hasOverrides;

    if (!companyName && !bossName) {
      setMessage({
        tone: "error",
        text: "Save rate override failed: Enter a company/account or boss/name before saving overrides.",
      });
      return;
    }

    if (invalidRateLabels.length > 0) {
      setMessage({
        tone: "error",
        text: `Save rate override failed: Enter positive numbers for rate overrides. Check: ${invalidRateLabels.join(", ")}.`,
      });
      return;
    }

    if (!hasOverrideValues) {
      setMessage({
        tone: "error",
        text: "Save rate override failed: Enter at least one customer or driver rate override before saving.",
      });
      return;
    }

    setSavingRates(true);
    setRateAction("override");
    setMessage({ tone: "info", text: "Saving rate override..." });

    let companyOverrideSaved = false;

    try {
      let company: CompanyRecord | null = rateCompanies.find(
        (companyRecord) => clean(companyRecord.company_name).toLowerCase() === companyName.toLowerCase(),
      ) ?? null;

      if (!company) {
        const existingCompany = await adminLegacyDataClient
          .from(adminLegacyTables.companies)
          .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
          .ilike("company_name", companyName || "Internal Account")
          .limit(1)
          .maybeSingle();

        if (existingCompany.error) {
          throw new Error(existingCompany.error.message);
        }

        company = existingCompany.data as CompanyRecord | null;
      }

      if (!company) {
        const createdCompany = await adminLegacyDataClient
          .from(adminLegacyTables.companies)
          .insert({
            company_name: companyName || "Internal Account",
            customer_rates: bossName ? {} : overrideCustomerRates,
            driver_payout_rules: bossName ? {} : overrideDriverPayoutRules,
            transzend_excel_privacy: rateOverrideDraft.transzendExcelPrivacy,
          })
          .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
          .single();

        if (createdCompany.error) {
          throw new Error(createdCompany.error.message);
        }

        company = createdCompany.data as CompanyRecord;
      }

      const mergedCompanyRates = bossName
        ? normalizeCustomerRateRules(company.customer_rates)
        : {
            ...normalizeCustomerRateRules(company.customer_rates),
            ...overrideCustomerRates,
          };
      const mergedCompanyPayouts = bossName
        ? normalizeDriverPayoutRules(company.driver_payout_rules)
        : {
            ...normalizeDriverPayoutRules(company.driver_payout_rules),
            ...overrideDriverPayoutRules,
          };

      const companyUpdate = await adminLegacyDataClient
        .from(adminLegacyTables.companies)
        .update({
          customer_rates: mergedCompanyRates,
          driver_payout_rules: mergedCompanyPayouts,
          transzend_excel_privacy: rateOverrideDraft.transzendExcelPrivacy,
          updated_at: new Date().toISOString(),
        })
        .eq("id", company.id)
        .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
        .single();

      if (companyUpdate.error) {
        throw new Error(companyUpdate.error.message);
      }

      companyOverrideSaved = true;

      if (bossName) {
        const existingTraveler = await adminLegacyDataClient
          .from(adminLegacyTables.travelers)
          .select("id, company_id, traveler_name, customer_rates, driver_payout_rules")
          .eq("company_id", company.id)
          .ilike("traveler_name", bossName)
          .limit(1)
          .maybeSingle();

        if (existingTraveler.error) {
          throw new Error(existingTraveler.error.message);
        }

        if (existingTraveler.data) {
          const traveler = existingTraveler.data as TravelerRecord;
          const travelerUpdate = await adminLegacyDataClient
            .from(adminLegacyTables.travelers)
            .update({
              customer_rates: {
                ...normalizeCustomerRateRules(traveler.customer_rates),
                ...overrideCustomerRates,
              },
              driver_payout_rules: {
                ...normalizeDriverPayoutRules(traveler.driver_payout_rules),
                ...overrideDriverPayoutRules,
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", traveler.id);

          if (travelerUpdate.error) {
            throw new Error(travelerUpdate.error.message);
          }
        } else {
          const travelerInsert = await adminLegacyDataClient.from(adminLegacyTables.travelers).insert({
            company_id: company.id,
            traveler_name: bossName,
            customer_rates: overrideCustomerRates,
            driver_payout_rules: overrideDriverPayoutRules,
          });

          if (travelerInsert.error) {
            throw new Error(travelerInsert.error.message);
          }
        }
      }

      setRateOverrideDraft({
        companyName: companyName || "Internal Account",
        bossName,
        customerRates: overrideCustomerRates,
        driverPayoutRules: overrideDriverPayoutRules,
        transzendExcelPrivacy: rateOverrideDraft.transzendExcelPrivacy,
      });
      const reloadResult = await loadRates("Override saved.", { preserveAction: true });

      if (!reloadResult.ok) {
        setMessage({
          tone: "error",
          text: `Rate override saved, but reload failed: ${reloadResult.errorMessage}`,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown rate save error.";
      const partialSaveWarning =
        companyOverrideSaved && bossName
          ? " Company override may already be saved; reload rates and review before relying on this boss/name override."
          : "";

      setMessage({
        tone: "error",
        text: formatRatesSetupError(
          `${errorMessage}${partialSaveWarning}`,
          "Save rate override failed: ",
        ),
      });
    } finally {
      setRateAction(null);
      setSavingRates(false);
    }
  }

  async function removeCompanyRateOverride(companyRecord: CompanyRecord) {
    const companyName = clean(companyRecord.company_name) || "this company";

    setRateOverrideListMessages((current) => ({
      ...current,
      company: { tone: "info", text: `Removing ${companyName} override...`, recordId: companyRecord.id },
    }));

    if (!adminLegacyDataClient) {
      setRateOverrideListMessages((current) => ({
        ...current,
        company: {
          tone: "error",
          text: "Remove override failed: Admin data API is not available.",
          recordId: companyRecord.id,
        },
      }));
      return;
    }

    setSavingRates(true);
    setRateAction("remove-override");

    try {
      const { error } = await adminLegacyDataClient
        .from(adminLegacyTables.companies)
        .update({
          customer_rates: {},
          driver_payout_rules: {},
          updated_at: new Date().toISOString(),
        })
        .eq("id", companyRecord.id);

      if (error) {
        throw new Error(formatSupabaseError(error));
      }

      setRateCompanies((current) =>
        current.map((candidate) =>
          candidate.id === companyRecord.id
            ? { ...candidate, customer_rates: {}, driver_payout_rules: {} }
            : candidate,
        ),
      );
      setRateOverrideDraft((current) => {
        const currentCompany = clean(current.companyName).toLowerCase();
        const removedCompany = clean(companyRecord.company_name).toLowerCase();

        if (current.bossName || currentCompany !== removedCompany) {
          return current;
        }

        return {
          ...current,
          customerRates: {},
          driverPayoutRules: {},
        };
      });
      setRateOverrideListMessages((current) => ({
        ...current,
        company: { tone: "success", text: `${companyName} override removed.`, recordId: companyRecord.id },
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown override remove error.";

      setRateOverrideListMessages((current) => ({
        ...current,
        company: {
          tone: "error",
          text: formatRatesSetupError(errorMessage, "Remove override failed: "),
          recordId: companyRecord.id,
        },
      }));
    } finally {
      setRateAction(null);
      setSavingRates(false);
    }
  }

  async function removeBossRateOverride(travelerRecord: TravelerRecord) {
    const bossName = clean(travelerRecord.traveler_name) || "this boss/name";

    setRateOverrideListMessages((current) => ({
      ...current,
      boss: { tone: "info", text: `Removing ${bossName} override...`, recordId: travelerRecord.id },
    }));

    if (!adminLegacyDataClient) {
      setRateOverrideListMessages((current) => ({
        ...current,
        boss: {
          tone: "error",
          text: "Remove override failed: Admin data API is not available.",
          recordId: travelerRecord.id,
        },
      }));
      return;
    }

    setSavingRates(true);
    setRateAction("remove-override");

    try {
      const { error } = await adminLegacyDataClient
        .from(adminLegacyTables.travelers)
        .update({
          customer_rates: {},
          driver_payout_rules: {},
          updated_at: new Date().toISOString(),
        })
        .eq("id", travelerRecord.id);

      if (error) {
        throw new Error(formatSupabaseError(error));
      }

      setRateTravelers((current) =>
        current.map((candidate) =>
          candidate.id === travelerRecord.id
            ? { ...candidate, customer_rates: {}, driver_payout_rules: {} }
            : candidate,
        ),
      );
      setRateOverrideDraft((current) => {
        const currentBoss = clean(current.bossName).toLowerCase();
        const removedBoss = clean(travelerRecord.traveler_name).toLowerCase();

        if (currentBoss !== removedBoss) {
          return current;
        }

        return {
          ...current,
          customerRates: {},
          driverPayoutRules: {},
        };
      });
      setRateOverrideListMessages((current) => ({
        ...current,
        boss: { tone: "success", text: `${bossName} override removed.`, recordId: travelerRecord.id },
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown override remove error.";

      setRateOverrideListMessages((current) => ({
        ...current,
        boss: {
          tone: "error",
          text: formatRatesSetupError(errorMessage, "Remove override failed: "),
          recordId: travelerRecord.id,
        },
      }));
    } finally {
      setRateAction(null);
      setSavingRates(false);
    }
  }

  async function loadDrivers(
    successText = "Driver database loaded.",
    loadingText = "Loading driver database...",
  ) {
    if (!adminLegacyDataClient) {
      setMessage({
        tone: "error",
        text: "Load drivers failed: Admin data API is not available.",
      });
      return;
    }

    setLoadingDrivers(true);
    setMessage({ tone: "info", text: loadingText });

    try {
      const { data, error } = await adminLegacyDataClient
        .from(adminLegacyTables.drivers)
        .select("id, driver_name, contact_number, vehicle_type, plate_number, payout_preferences, driver_payout_rules, availability_status, notes, preferred_areas, airport_permit_notes")
        .order("driver_name", { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      setDrivers((data ?? []) as DriverRecord[]);
      setMessage({ tone: "success", text: successText });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown driver load error.";
      setMessage({ tone: "error", text: `Load drivers failed: ${errorMessage}` });
    } finally {
      setLoadingDrivers(false);
    }
  }

  async function saveDriverProfile() {
    if (!adminLegacyDataClient) {
      setMessage({
        tone: "error",
        text: "Save driver failed: Admin data API is not available.",
      });
      return;
    }

    const driverName = clean(driverProfileDraft.driverName);
    const contactNumber = clean(driverProfileDraft.contactNumber);
    const vehicleType = clean(driverProfileDraft.vehicleType);
    const plateNumber = clean(driverProfileDraft.plateNumber);
    const normalizedContactNumber = normalizePhone(contactNumber);
    const normalizedPlateNumber = plateNumber.toLowerCase().replace(/\s+/g, "");

    if (!driverName) {
      setMessage({ tone: "error", text: "Driver name is required." });
      return;
    }

    if (!contactNumber) {
      setMessage({ tone: "error", text: "Contact number is required." });
      return;
    }

    if (!vehicleType) {
      setMessage({ tone: "error", text: "Vehicle type is required." });
      return;
    }

    if (!plateNumber) {
      setMessage({ tone: "error", text: "Plate number is required." });
      return;
    }

    setSavingDriverProfile(true);
    setMessage({ tone: "info", text: "Saving driver profile..." });

    try {
      let existingDriverId = clean(driverProfileDraft.driverId);
      let existingDriver: DriverRecord | null = existingDriverId
        ? drivers.find((driver) => String(driver.id) === existingDriverId) ?? null
        : drivers.find(
            (driver) => clean(driver.driver_name).toLowerCase() === driverName.toLowerCase(),
          ) ?? null;
      existingDriverId = existingDriverId || clean(existingDriver?.id ? String(existingDriver.id) : "");

      const duplicateContactDriver = drivers.find(
        (driver) =>
          String(driver.id) !== existingDriverId &&
          normalizePhone(clean(driver.contact_number)) === normalizedContactNumber,
      );

      if (duplicateContactDriver) {
        setMessage({
          tone: "error",
          text: `Contact number already belongs to ${clean(duplicateContactDriver.driver_name) || "another driver"}.`,
        });
        return;
      }

      const duplicatePlateDriver = drivers.find(
        (driver) =>
          String(driver.id) !== existingDriverId &&
          clean(driver.plate_number).toLowerCase().replace(/\s+/g, "") === normalizedPlateNumber,
      );

      if (duplicatePlateDriver) {
        setMessage({
          tone: "error",
          text: `Plate number already belongs to ${clean(duplicatePlateDriver.driver_name) || "another driver"}.`,
        });
        return;
      }

      if (!existingDriverId && !existingDriver) {
        const existingResult = await adminLegacyDataClient
          .from(adminLegacyTables.drivers)
          .select("id, driver_name, contact_number, vehicle_type, plate_number, payout_preferences, driver_payout_rules, availability_status, notes, preferred_areas, airport_permit_notes")
          .ilike("driver_name", driverName)
          .limit(1)
          .maybeSingle();

        if (existingResult.error) {
          throw new Error(existingResult.error.message);
        }

        existingDriver = existingResult.data as DriverRecord | null;
      }

      existingDriverId = existingDriverId || clean(existingDriver?.id ? String(existingDriver.id) : "");

      const payload = {
        driver_name: driverName,
        contact_number: contactNumber,
        vehicle_type: vehicleType,
        plate_number: plateNumber,
        payout_preferences: clean(driverProfileDraft.payoutPreferences) || null,
        driver_payout_rules: driverProfileDraft.payoutRules,
        availability_status: clean(driverProfileDraft.availabilityStatus) || "available",
        notes: clean(driverProfileDraft.notes) || null,
        preferred_areas: clean(driverProfileDraft.preferredAreas) || null,
        airport_permit_notes: clean(driverProfileDraft.airportPermitNotes) || null,
        updated_at: new Date().toISOString(),
      };
      const result = existingDriverId
        ? await adminLegacyDataClient.from(adminLegacyTables.drivers).update(payload).eq("id", existingDriverId)
        : await adminLegacyDataClient.from(adminLegacyTables.drivers).insert(payload);

      if (result.error) {
        throw new Error(result.error.message);
      }

      setDriverProfileDraft(initialDriverProfileDraft);
      await loadDrivers("Driver profile saved.", "Refreshing driver database...");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown driver save error.";
      setMessage({ tone: "error", text: `Save driver failed: ${errorMessage}` });
    } finally {
      setSavingDriverProfile(false);
    }
  }

  async function deactivateDriverProfile() {
    if (!adminLegacyDataClient) {
      setMessage({
        tone: "error",
        text: "Deactivate driver failed: Admin data API is not available.",
      });
      return;
    }

    const driverId = clean(driverProfileDraft.driverId);

    if (!driverId) {
      setMessage({ tone: "error", text: "Select an existing driver before deactivating." });
      return;
    }

    setDeactivatingDriverProfile(true);
    setMessage({ tone: "info", text: "Deactivating driver..." });

    try {
      const payload = {
        availability_status: "inactive",
        updated_at: new Date().toISOString(),
      };
      const result = await adminLegacyDataClient.from(adminLegacyTables.drivers).update(payload).eq("id", driverId);

      if (result.error) {
        throw new Error(result.error.message);
      }

      setDrivers((current) =>
        current.map((driver) =>
          String(driver.id) === driverId
            ? {
                ...driver,
                availability_status: "inactive",
              }
            : driver,
        ),
      );
      setDriverProfileDraft((current) =>
        current.driverId === driverId
          ? {
              ...current,
              availabilityStatus: "inactive",
            }
          : current,
      );
      setMessage({ tone: "success", text: "Driver deactivated." });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown driver deactivate error.";
      setMessage({ tone: "error", text: `Deactivate driver failed: ${errorMessage}` });
    } finally {
      setDeactivatingDriverProfile(false);
    }
  }

  function clearDeletedDriverIdFromBookingState(driverId: string) {
    const matchesDeletedDriver = (value: string | number | null | undefined) =>
      clean(value === null || value === undefined ? "" : String(value)) === driverId;

    setBooking((current) =>
      matchesDeletedDriver(current.driverId)
        ? {
            ...current,
            driverId: "",
          }
        : current,
    );
    setBookings((current) =>
      current.map((currentBooking) =>
        matchesDeletedDriver(currentBooking.driver_id)
          ? {
              ...currentBooking,
              driver_id: null,
            }
          : currentBooking,
      ),
    );
    setDriverDrafts((current) => {
      let changed = false;
      const nextDrafts = Object.fromEntries(
        Object.entries(current).map(([bookingId, driverDraft]) => {
          if (!matchesDeletedDriver(driverDraft.driverId)) {
            return [bookingId, driverDraft];
          }

          changed = true;
          return [
            bookingId,
            {
              ...driverDraft,
              driverId: "",
            },
          ];
        }),
      );

      return changed ? nextDrafts : current;
    });
  }

  async function deleteDriverProfile(driver: DriverRecord, assignedJobCount: number) {
    const driverId = clean(String(driver.id));

    if (!driverId) {
      setDriverDeleteMessage({
        driverId: "",
        tone: "error",
        text: "Delete driver failed: missing driver id.",
      });
      return;
    }

    if (!adminLegacyDataClient) {
      setDriverDeleteMessage({
        driverId,
        tone: "error",
        text: "Delete driver failed: Admin data API is not available.",
      });
      return;
    }

    const confirmationText =
      assignedJobCount > 0
        ? `This driver has ${assignedJobCount} assigned job${assignedJobCount === 1 ? "" : "s"}. Delete this driver from the Driver Database? Existing bookings will keep their saved driver details. This cannot be undone.`
        : "Delete this driver from the Driver Database? This cannot be undone.";

    if (!window.confirm(confirmationText)) {
      setDriverDeleteMessage({
        driverId,
        tone: "info",
        text: "Driver delete cancelled.",
      });
      return;
    }

    setDeletingDriverId(driverId);
    setDriverDeleteMessage({
      driverId,
      tone: "info",
      text: "Deleting driver...",
    });

    try {
      const result = await adminLegacyDataClient.from(adminLegacyTables.drivers).delete().eq("id", driverId);

      if (result.error) {
        throw new Error(result.error.message);
      }

      setDrivers((current) => current.filter((candidate) => String(candidate.id) !== driverId));
      clearDeletedDriverIdFromBookingState(driverId);
      setDriverProfileDraft((current) =>
        current.driverId === driverId ? initialDriverProfileDraft : current,
      );
      setDriverDeleteMessage({
        driverId,
        tone: "success",
        text: "Driver deleted.",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown driver delete error.";
      setDriverDeleteMessage({
        driverId,
        tone: "error",
        text: `Delete driver failed: ${errorMessage}`,
      });
    } finally {
      setDeletingDriverId(null);
    }
  }

  async function saveBooking() {
    const currentNeedsReviewWarnings = [
      ...getNeedsReviewWarnings(booking),
      ...getPricingReviewWarnings(draftPricing),
    ];
    const currentReviewAcceptanceKey = getReviewAcceptanceKey(booking, currentNeedsReviewWarnings);

    if (
      currentNeedsReviewWarnings.length > 0 &&
      acceptedReviewWarningKey !== currentReviewAcceptanceKey
    ) {
      const reviewMessage = {
        tone: "error",
        text: "Please review warnings before saving.",
      } satisfies Message;

      setMessage(reviewMessage);
      setBookingSaveMessage(reviewMessage);
      return;
    }

    setBookingSaveMessage(null);

    if (!validateBooking()) {
      return;
    }

    if (!adminLegacyDataClient) {
      const saveMessage = {
        tone: "error",
        text: "Booking save failed: Admin data API is not available.",
      } satisfies Message;

      setMessage({
        tone: saveMessage.tone,
        text: saveMessage.text,
      });
      setBookingSaveMessage(saveMessage);
      return;
    }

    setSaving(true);
    setMessage({ tone: "info", text: "Saving booking + CRM..." });
    setBookingSaveMessage({ tone: "info", text: "Saving booking + CRM..." });

    try {
      const fallbackCompanyName =
        normalizeCompanyAccount(
          getKnownCompanyForRelationship(booking.booker, booking.name, booking.company) || booking.company,
          booking.bookerEmail,
        );
      let company: CompanyRecord = blankCompanyRecord(fallbackCompanyName);
      let booker: BookerRecord | null = null;
      let name: TravelerRecord | null = null;
      let crmUpdateFailed = false;
      let crmErrorMessage = "";

      try {
        company = await resolveCompany();
        if (company.id) {
          booker = await resolveBooker(company.id);
          name = await resolveName(company.id, booker);
        }
      } catch (error) {
        crmUpdateFailed = true;
        crmErrorMessage = error instanceof Error ? error.message : "Unknown CRM update error.";
      }

      const bookingDriverId = clean(booking.driverId);
      const bookingDriverName = clean(booking.driverName).toLowerCase();
      const selectedDriver = drivers.find(
        (driver) =>
          (bookingDriverId && String(driver.id) === bookingDriverId) ||
          (bookingDriverName && clean(driver.driver_name).toLowerCase() === bookingDriverName),
      ) ?? null;
      const fallbackDriverId = Number(bookingDriverId);
      const resolvedDriverId =
        selectedDriver?.id ?? (Number.isFinite(fallbackDriverId) && fallbackDriverId > 0 ? fallbackDriverId : null);
      const pricing = resolvePricing(
        booking,
        company,
        name,
        rateSettings,
        selectedDriver,
      );
      const pricingSnapshot = calculateProfit(
        pricing,
        booking.customerPriceOverride,
        clean(booking.driverPayoutOverride) || booking.savedDriverPayoutAmount,
      );

      const bookingPayload = {
        company_id: company.id || null,
        booker_id: booker?.id ?? null,
        traveler_id: name?.id ?? null,
        booking_type: clean(booking.bookingType),
        vehicle: clean(booking.vehicle),
        pickup_time: normalizePickupTimeForStorage(booking.time),
        pickup_address: clean(booking.pickup),
        dropoff_address: clean(booking.dropoff),
        flight_no: clean(booking.flight),
        route,
        pax: Number(clean(booking.pax)) || 1,
        job_card: jobCard,
        driver_id: resolvedDriverId,
        driver_name: clean(booking.driverName) || null,
        driver_contact: clean(booking.driverContact) || clean(selectedDriver?.contact_number) || null,
        driver_plate_number: clean(booking.driverPlate) || clean(selectedDriver?.plate_number) || null,
        customer_rate: pricing.customerRate,
        customer_rate_unit: pricing.customerRateUnit,
        customer_price_amount: pricingSnapshot.customerPrice,
        customer_rate_override: clean(booking.customerPriceOverride)
          ? numericRate(booking.customerPriceOverride)
          : null,
        customer_price_override_reason: clean(booking.customerPriceOverrideReason) || null,
        driver_payout_min: pricing.driverPayoutMin,
        driver_payout_max: pricing.driverPayoutMax,
        driver_payout_amount: pricingSnapshot.driverPayout,
        driver_payout_override: clean(booking.driverPayoutOverride)
          ? numericRate(booking.driverPayoutOverride)
          : null,
        driver_payout_reason: clean(booking.driverPayoutReason) || null,
        driver_payout_unit: pricing.driverPayoutUnit,
        driver_notes: clean(booking.driverNotes) || null,
        driver_dispatch_include_payout: Boolean(booking.driverIncludePayout),
        midnight_surcharge: pricing.midnightSurcharge,
        midnight_payout: pricing.midnightPayout,
        extra_stop_count: pricing.extraStopCount,
        extra_stop_surcharge: pricing.extraStopSurcharge,
        extra_stop_payout: pricing.extraStopPayout,
        child_seat_required: clean(booking.childSeatRequired) === "yes",
        child_seat_count: pricing.childSeatCount,
        child_seat_type:
          clean(booking.childSeatRequired) === "yes" ? clean(booking.childSeatType) || null : null,
        child_seat_customer_surcharge: pricing.childSeatCustomerAmount,
        child_seat_driver_payout: pricing.childSeatDriverAmount,
        pricing_source: pricingSnapshot.customerPriceSource,
        status: clean(booking.driverName) ? "assigned" : "confirmed",
      };
      const { data: savedBooking, error } = await adminLegacyDataClient.from(adminLegacyTables.bookings).insert(bookingPayload).select("id").single();

      const savedBookingId = (savedBooking as { id?: string | number } | null)?.id;

      if (error || !savedBookingId) {
        const saveMessage = {
          tone: "error",
          text: `Booking save failed: ${error ? formatSupabaseError(error) : "No saved booking id returned."}`,
        } satisfies Message;

        setMessage(saveMessage);
        setBookingSaveMessage(saveMessage);
      } else {
        if (!crmUpdateFailed && company.id) {
          try {
            await rememberNameCrmDetails(company.id, name?.id ?? null);
          } catch (error) {
            crmUpdateFailed = true;
            crmErrorMessage = error instanceof Error ? error.message : "Unknown CRM memory update error.";
          }
        }

        const savedBookingResult = await fetchSavedBookingById(savedBookingId);

        if (savedBookingResult.error || !savedBookingResult.data) {
          const saveMessage = {
            tone: "success",
            text: `Booking saved successfully: ${savedBookingId}`,
          } satisfies Message;

          setMessage({
            tone: saveMessage.tone,
            text: `${saveMessage.text}. Recent booking reload failed: ${
              savedBookingResult.error ? formatSupabaseError(savedBookingResult.error) : "No booking row returned."
            }`,
          });
          setBookingSaveMessage(saveMessage);
          setAcceptedReviewWarningKey("");
          return;
        }

        const savedBookingRecord = savedBookingResult.data as BookingRecord;
        setBookings((currentBookings) =>
          sortBookingsNewestFirst([
            savedBookingRecord,
            ...currentBookings.filter((currentBooking) => String(currentBooking.id) !== String(savedBookingRecord.id)),
          ]),
        );
        const saveMessage = {
          tone: crmUpdateFailed ? "error" : "success",
          text: crmUpdateFailed
            ? `Booking saved, but CRM update failed: ${crmErrorMessage || "Unknown CRM error."}`
            : `Booking saved successfully: ${savedBookingId}`,
        } satisfies Message;

        setMessage(saveMessage);
        setBookingSaveMessage(saveMessage);
        setAcceptedReviewWarningKey("");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown save error.";
      const saveMessage = { tone: "error", text: `Booking save failed: ${errorMessage}` } satisfies Message;
      setMessage(saveMessage);
      setBookingSaveMessage(saveMessage);
    } finally {
      setSaving(false);
    }
  }

  async function fetchSavedBookingById(bookingId: string | number) {
    if (!adminLegacyDataClient) {
      return {
        data: null,
        error: new Error("Admin data API is not available."),
      };
    }

    return adminLegacyDataClient
      .from(adminLegacyTables.bookings)
      .select(adminBookingSelectColumns)
      .eq("id", bookingId)
      .limit(1)
      .maybeSingle();
  }

  async function loadBookings(successText = "Bookings loaded.", options?: { silent?: boolean }) {
    if (!adminLegacyDataClient) {
      if (!options?.silent) {
        setMessage({
          tone: "error",
          text: "Admin data API is not available.",
        });
      }
      return;
    }

    setLoading(true);
    if (!options?.silent) {
      setMessage({ tone: "info", text: "Loading bookings..." });
    }

    try {
      const { data, error } = await adminLegacyDataClient
        .from(adminLegacyTables.bookings)
        .select(adminBookingSelectColumns)
        .order("created_at", { ascending: false })
        .limit(25);

      if (error) {
        if (!options?.silent) {
          setMessage({ tone: "error", text: `Load bookings failed: ${formatSupabaseError(error)}` });
        }
      } else {
        const loadedBookings = sortBookingsNewestFirst((data ?? []) as BookingRecord[]);
        setBookings(loadedBookings);
        if (!options?.silent) {
          if (loadedBookings.length === 0) {
            setMessage({ tone: "info", text: "No bookings found." });
          } else {
            setMessage({ tone: "success", text: `${successText} Choose a booking below.` });
          }
        }
      }
    } catch (error) {
      if (!options?.silent) {
        const errorMessage = error instanceof Error ? error.message : "Unknown load error.";
        setMessage({ tone: "error", text: `Load bookings failed: ${errorMessage}` });
      }
    } finally {
      setLoading(false);
    }
  }

  function loadSelectedBooking(bookingRecord: BookingRecord) {
    setBooking(() => bookingRecordToForm(bookingRecord));
    setLoadedBookingId(String(bookingRecord.id));
    setActiveTab("dispatch");
    clearBookingMessageInput();
    setMessage({
      tone: "success",
      text: `Booking ${bookingRecord.id || clean(bookingRecord.flight_no) || getBookingDateKey(bookingRecord)} loaded.`,
    });
  }

  async function saveAdminBookingOperationalSnapshot() {
    const payload = buildAdminBookingPersistencePayload(booking, currentTimeMs);

    setAdminBookingPersistenceAction("save");
    setAdminBookingPersistenceMessage({
      tone: "info",
      text: "Saving operational booking fields...",
    });

    try {
      const response = await fetch("/api/admin-bookings", {
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Admin booking save failed.");
      }

      const savedBooking = result.booking as AdminBookingPersistenceRecord;
      setAdminBookingPersistenceRecords((current) => [
        savedBooking,
        ...current.filter(
          (record) => record.booking_reference !== savedBooking.booking_reference,
        ),
      ]);
      setAdminBookingPersistenceMessage({
        tone: "success",
        text: `Operational booking saved: ${savedBooking.booking_reference}`,
      });
    } catch (error) {
      setAdminBookingPersistenceMessage({
        tone: "error",
        text: adminBookingPersistenceFailureMessage("save", error),
      });
    } finally {
      setAdminBookingPersistenceAction(null);
    }
  }

  async function loadAdminBookingOperationalSnapshots() {
    setAdminBookingPersistenceAction("load");
    setAdminBookingPersistenceMessage({
      tone: "info",
      text: "Loading operational booking fields...",
    });

    try {
      const response = await fetch("/api/admin-bookings", {
        headers: {
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "GET",
      });
      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Admin booking load failed.");
      }

      const loadedBookings = Array.isArray(result.bookings)
        ? (result.bookings as AdminBookingPersistenceRecord[])
        : [];
      const currentAppliedReference = clean(appliedAdminBookingSnapshotReference);
      const loadedAppliedSnapshot = findAdminBookingPersistenceRecordByReference(
        loadedBookings,
        currentAppliedReference,
      );
      setAdminBookingPersistenceRecords(loadedBookings);
      setAdminBookingPersistenceSearch("");
      setAdminBookingPersistenceStatusFilter(adminBookingPersistenceAllStatusFilter);
      setAdminCustomerRequestSearch("");
      setAdminCustomerRequestStatusFilter(adminCustomerRequestAllStatusFilter);
      setAppliedAdminBookingSnapshotReference(
        loadedAppliedSnapshot ? currentAppliedReference : "",
      );
      setAdminBookingPersistenceMessage({
        tone: loadedBookings.length > 0 ? "success" : "info",
        text:
          loadedBookings.length > 0
            ? `Loaded ${loadedBookings.length} operational booking records.${
                currentAppliedReference && !loadedAppliedSnapshot
                  ? " Applied snapshot cleared because it is no longer in the loaded list."
                  : ""
              }`
            : `No operational booking records loaded.${
                currentAppliedReference ? " Applied snapshot cleared." : ""
              }`,
      });
    } catch (error) {
      setAdminBookingPersistenceMessage({
        tone: "error",
        text: adminBookingPersistenceFailureMessage("load", error),
      });
    } finally {
      setAdminBookingPersistenceAction(null);
    }
  }

  function applyAdminBookingOperationalSnapshot(
    record: AdminBookingPersistenceRecord | null | undefined,
  ) {
    if (!record) {
      setAppliedAdminBookingSnapshotReference("");
      setAdminBookingPersistenceMessage({
        tone: "info",
        text: "No operational booking records loaded to apply. Applied snapshot selection cleared.",
      });
      return;
    }

    const appliedSnapshot = adminOperationalSnapshotToBookingForm(record);

    if (!appliedSnapshot.ok) {
      setAppliedAdminBookingSnapshotReference("");
      setAdminBookingPersistenceMessage({
        tone: "error",
        text: "Operational snapshot could not be applied: required operational details are missing. Applied snapshot selection cleared.",
      });
      return;
    }

    const bookingReference = clean(record.booking_reference) || "selected snapshot";
    const reviewSuffix =
      appliedSnapshot.reviewStatus === "Admin Review Required"
        ? " Admin Review Required."
        : "";

    setBooking(() => appliedSnapshot.booking);
    setLoadedBookingId("");
    setAppliedAdminBookingSnapshotReference(bookingReference);
    setActiveTab("dispatch");
    clearBookingMessageInput();
    setAdminBookingPersistenceMessage({
      tone: "success",
      text: `Operational snapshot applied: ${bookingReference}.${reviewSuffix}`,
    });
  }

  function applyLatestAdminBookingOperationalSnapshot() {
    if (
      adminBookingPersistenceRecords.length > 0 &&
      displayedAdminBookingPersistenceRecords.length === 0 &&
      (adminBookingPersistenceHasActiveFilters || adminCustomerRequestHasActiveFilters)
    ) {
      setAdminBookingPersistenceMessage({
        tone: "info",
        text: adminCustomerRequestHasActiveFilters
          ? "No customer booking requests match this search/filter."
          : "No loaded operational snapshots match this search/filter.",
      });
      return;
    }

    applyAdminBookingOperationalSnapshot(displayedAdminBookingPersistenceRecords[0]);
  }

  function clearAdminBookingPersistenceFilters() {
    const hadActiveFilters = adminBookingPersistenceHasActiveFilters;

    setAdminBookingPersistenceSearch("");
    setAdminBookingPersistenceStatusFilter(adminBookingPersistenceAllStatusFilter);

    if (hadActiveFilters) {
      setAdminBookingPersistenceMessage({
        tone: "info",
        text: "Operational snapshot filters cleared.",
      });
    }
  }

  function clearAdminCustomerRequestFilters() {
    const hadActiveFilters = adminCustomerRequestHasActiveFilters;

    setAdminCustomerRequestSearch("");
    setAdminCustomerRequestStatusFilter(adminCustomerRequestAllStatusFilter);

    if (hadActiveFilters) {
      setAdminBookingPersistenceMessage({
        tone: "info",
        text: "Customer request filters cleared.",
      });
    }
  }

  function clearAppliedAdminBookingOperationalSnapshot() {
    setAppliedAdminBookingSnapshotReference("");
    setAdminBookingPersistenceMessage({
      tone: "success",
      text: "Applied operational snapshot cleared. Current dispatch form values were kept.",
    });
  }

  async function updateAppliedAdminBookingOperationalSnapshot() {
    const targetBookingReference = clean(appliedAdminBookingSnapshotReference);

    if (!targetBookingReference) {
      setAdminBookingPersistenceMessage({
        tone: "info",
        text: "Apply a loaded operational snapshot before updating.",
      });
      return;
    }

    const payload = buildAdminBookingPersistencePayload(
      booking,
      currentTimeMs,
      targetBookingReference,
    );

    setAdminBookingPersistenceAction("update");
    setAdminBookingPersistenceMessage({
      tone: "info",
      text: "Updating applied operational booking fields...",
    });

    try {
      const response = await fetch("/api/admin-bookings", {
        body: JSON.stringify({
          target_booking_reference: targetBookingReference,
          ...payload,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "PATCH",
      });
      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Admin booking update failed.");
      }

      const updatedBooking = result.booking as AdminBookingPersistenceRecord;
      const updatedBookingReference = clean(updatedBooking.booking_reference) || targetBookingReference;
      setAdminBookingPersistenceRecords((current) => [
        updatedBooking,
        ...current.filter(
          (record) => record.booking_reference !== updatedBookingReference,
        ),
      ]);
      setAppliedAdminBookingSnapshotReference(updatedBookingReference);
      setAdminBookingPersistenceMessage({
        tone: "success",
        text: `Operational booking updated: ${updatedBookingReference}${
          updatedBooking.short_notice_review_status === "Admin Review Required"
            ? ". Admin Review Required."
            : "."
        }`,
      });
    } catch (error) {
      setAdminBookingPersistenceMessage({
        tone: "error",
        text: adminBookingPersistenceFailureMessage("update", error),
      });
    } finally {
      setAdminBookingPersistenceAction(null);
    }
  }

  async function updateAdminCustomerRequestReviewDecision(
    record: AdminBookingPersistenceRecord,
    decisionKey: AdminCustomerRequestReviewDecisionKey,
  ) {
    const decision = adminCustomerRequestReviewDecisions.find((candidate) => candidate.key === decisionKey);
    const targetBookingReference = clean(record.booking_reference);

    if (!decision || !targetBookingReference || !adminBookingPersistenceRecordIsCustomerRequest(record)) {
      setAdminBookingPersistenceMessage({
        tone: "error",
        text: "Customer request review decision could not be saved: loaded request details need review.",
      });
      return;
    }

    const payload = buildAdminCustomerRequestDecisionPayload(record, decision, currentTimeMs);

    if (!payload) {
      setAdminBookingPersistenceMessage({
        tone: "error",
        text: "Customer request review decision could not be saved: required operational details are missing.",
      });
      return;
    }

    const statuses = adminCustomerRequestDecisionStatuses(record, decision, currentTimeMs);

    setAdminBookingPersistenceAction("update");
    setAdminBookingPersistenceMessage({
      tone: "info",
      text: "Saving internal customer request review decision...",
    });

    try {
      const response = await fetch("/api/admin-bookings", {
        body: JSON.stringify({
          target_booking_reference: targetBookingReference,
          ...payload,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "PATCH",
      });
      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Admin review decision update failed.");
      }

      const updatedBooking = result.booking as AdminBookingPersistenceRecord;
      const updatedBookingReference = clean(updatedBooking.booking_reference) || targetBookingReference;
      setAdminBookingPersistenceRecords((current) => [
        updatedBooking,
        ...current.filter(
          (currentRecord) => clean(currentRecord.booking_reference) !== updatedBookingReference,
        ),
      ]);

      if (clean(appliedAdminBookingSnapshotReference) === targetBookingReference) {
        setAppliedAdminBookingSnapshotReference(updatedBookingReference);
      }

      setAdminBookingPersistenceMessage({
        tone: "success",
        text: `Internal review decision saved for ${updatedBookingReference}: ${decision.successLabel}. No customer notification sent.${
          statuses.shortNoticeReviewRequired
            ? " Short-notice review remains Admin Review Required."
            : ""
        }`,
      });
    } catch (error) {
      setAdminBookingPersistenceMessage({
        tone: "error",
        text: adminBookingPersistenceFailureMessage("update", error),
      });
    } finally {
      setAdminBookingPersistenceAction(null);
    }
  }

  function getDispatchCopyText(target: DispatchCopyTarget) {
    const copyEditState = copyEditStates[target];
    const generatedText = generatedDispatchCopyMessages[target];

    return copyEditState.sourceKey === dispatchCopyResetKey &&
      copyEditState.generatedText === generatedText &&
      copyEditState.editedText !== null
      ? copyEditState.editedText
      : generatedText;
  }

  function getRenderableCopyEditState(target: DispatchCopyTarget) {
    const copyEditState = copyEditStates[target];

    return copyEditState.sourceKey === dispatchCopyResetKey &&
      copyEditState.generatedText === generatedDispatchCopyMessages[target]
      ? copyEditState
      : {
          ...copyEditState,
          draftText: "",
          editedText: null,
          isEditing: false,
        };
  }

  function updateCopyEditDraft(target: DispatchCopyTarget, value: string) {
    setCopyEditStates((current) => ({
      ...current,
      [target]: {
        ...current[target],
        draftText: value,
      },
    }));
  }

  function startCopyEdit(target: DispatchCopyTarget) {
    setCopyEditStates((current) => ({
      ...current,
      [target]: {
        ...current[target],
        draftText:
          current[target].sourceKey === dispatchCopyResetKey &&
          current[target].generatedText === generatedDispatchCopyMessages[target] &&
          current[target].editedText !== null
            ? current[target].editedText
            : generatedDispatchCopyMessages[target],
        generatedText: generatedDispatchCopyMessages[target],
        isEditing: true,
        sourceKey: dispatchCopyResetKey,
      },
    }));
    setCopyFeedback({
      target,
      tone: "info",
      text: `${dispatchCopyLabels[target]} ready to edit.`,
    });
  }

  function saveCopyEdit(target: DispatchCopyTarget) {
    setCopyEditStates((current) => ({
      ...current,
      [target]: {
        ...current[target],
        editedText: current[target].draftText,
        isEditing: false,
      },
    }));
    setCopyFeedback({
      target,
      tone: "success",
      text: `${dispatchCopyLabels[target]} edit saved.`,
    });
  }

  function cancelCopyEdit(target: DispatchCopyTarget) {
    setCopyEditStates((current) => ({
      ...current,
      [target]: {
        draftText: "",
        editedText: null,
        generatedText: generatedDispatchCopyMessages[target],
        isEditing: false,
        sourceKey: dispatchCopyResetKey,
      },
    }));
    setCopyFeedback({
      target,
      tone: "info",
      text: `${dispatchCopyLabels[target]} edit cancelled. Generated text restored.`,
    });
  }

  async function copyDispatchCopy(target: DispatchCopyTarget) {
    try {
      await navigator.clipboard.writeText(getDispatchCopyText(target));
      setCopyFeedback({ target, tone: "success", text: `${dispatchCopyLabels[target]} copied.` });
    } catch {
      setCopyFeedback({
        target,
        tone: "error",
        text: `Copy failed. Select the ${dispatchCopyLabels[target].toLowerCase()} text manually.`,
      });
    }
  }

  async function copyJobCard() {
    await copyDispatchCopy("jobCard");
  }

  async function copyCustomerCopy() {
    await copyDispatchCopy("customerCopy");
  }

  async function copyDriverJobLink() {
    try {
      await navigator.clipboard.writeText(driverJobLinkMessage);
      setDriverJobLinkCopyMessage({ tone: "success", text: "Driver job link copied." });
    } catch {
      setDriverJobLinkCopyMessage({
        tone: "error",
        text: "Copy failed. Select the driver job link text manually.",
      });
    }
  }

  function assignDraftDriver() {
    if (!clean(booking.driverName)) {
      setMessage({ tone: "error", text: "Enter a driver name before assigning this draft." });
      return;
    }

    setMessage({
      tone: "success",
      text: "Driver applied to draft. Save booking to keep this assignment.",
    });
  }

  function updateReplacementDriverDraft(field: keyof ReplacementDriverDraft, value: string) {
    setReplacementDriverDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function markReplacementDriverPlaceholder(action: (typeof replacementDriverActions)[number]) {
    setReplacementDriverFeedback({
      action: action.key,
      text: action.feedback,
      tone: "success",
    });
  }

  function updateTelegramAlertPreviewType(value: TelegramAlertPreviewType) {
    setTelegramAlertPreviewType(value);
    setTelegramAlertPreviewFeedback(null);
  }

  function generateTelegramAlertMockPreview() {
    setTelegramAlertPreviewFeedback({
      text: "Mock only — no Telegram message sent.",
      tone: "success",
    });
  }

  async function copyDraftDriverDispatch() {
    await copyDispatchCopy("driverDispatch");
  }

  async function copySavedJobCard(bookingRecord: BookingRecord) {
    const bookingId = String(bookingRecord.id);

    try {
      await navigator.clipboard.writeText(getBookingJobCard(bookingRecord));
      setBookingCopyMessage(bookingId, "jobCard", {
        tone: "success",
        text: "Booking job card copied.",
      });
    } catch {
      setBookingCopyMessage(bookingId, "jobCard", {
        tone: "error",
        text: "Copy failed. Select the booking details manually.",
      });
    }
  }

  function bookingCopyMessageKey(bookingId: string, target: BookingCopyTarget) {
    return `${bookingId}:${target}`;
  }

  function setBookingCopyMessage(
    bookingId: string,
    target: BookingCopyTarget,
    nextMessage: Message,
  ) {
    setBookingCopyMessages((current) => ({
      ...current,
      [bookingCopyMessageKey(bookingId, target)]: nextMessage,
    }));
  }

  function setBookingCompletionMessage(bookingId: string, nextMessage: Message | null) {
    setBookingCompletionMessages((current) => {
      if (!nextMessage) {
        const nextMessages = { ...current };
        delete nextMessages[bookingId];
        return nextMessages;
      } else {
        return { [bookingId]: nextMessage };
      }
    });
  }

  async function updateBookingStatusOnly(
    bookingRecord: BookingRecord,
    nextStatus: BookingStatusValue,
    loadingText: string,
    successText: string,
    errorPrefix: string,
  ) {
    const bookingId = String(bookingRecord.id);

    if (!adminLegacyDataClient) {
      const errorMessage = {
        tone: "error",
        text: `${errorPrefix}: Admin data API is not available.`,
      } satisfies Message;
      setBookingCompletionMessage(bookingId, errorMessage);
      return;
    }

    const loadingMessage = { tone: "info", text: loadingText } satisfies Message;
    setCompletingBookingId(bookingId);
    setBookingCompletionMessage(bookingId, loadingMessage);

    try {
      const updatedAt = new Date().toISOString();
      const { error } = await adminLegacyDataClient
        .from(adminLegacyTables.bookings)
        .update({
          status: nextStatus,
          updated_at: updatedAt,
        })
        .eq("id", bookingRecord.id);

      if (error) {
        throw new Error(error.message);
      }

      setBookings((current) =>
        current.map((currentBooking) =>
          currentBooking.id === bookingRecord.id
            ? {
                ...currentBooking,
                status: nextStatus,
                updated_at: updatedAt,
              }
            : currentBooking,
        ),
      );

      const successMessage = { tone: "success", text: successText } satisfies Message;
      setBookingCompletionMessage(bookingId, successMessage);
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Unknown booking status error.";
      const errorMessage = { tone: "error", text: `${errorPrefix}: ${errorText}` } satisfies Message;
      setBookingCompletionMessage(bookingId, errorMessage);
    } finally {
      setCompletingBookingId(null);
    }
  }

  async function markBookingCompleted(bookingRecord: BookingRecord) {
    await updateBookingStatusOnly(
      bookingRecord,
      "completed",
      "Marking booking completed...",
      "Booking marked completed.",
      "Mark completed failed",
    );
  }

  async function markBookingOtw(bookingRecord: BookingRecord) {
    await updateBookingStatusOnly(
      bookingRecord,
      "driver_otw",
      "Marking driver OTW...",
      "Driver marked OTW.",
      "Mark OTW failed",
    );
  }

  async function markBookingPob(bookingRecord: BookingRecord) {
    await updateBookingStatusOnly(
      bookingRecord,
      "pob",
      "Marking passenger on board...",
      "Passenger on board.",
      "Mark POB failed",
    );
  }

  async function revertBookingStatus(bookingRecord: BookingRecord) {
    const currentStatus = clean(bookingRecord.status).toLowerCase();
    const nextStatus = currentStatus === "pob" ? "driver_otw" : revertOtwStatus(bookingRecord);

    await updateBookingStatusOnly(
      bookingRecord,
      nextStatus,
      "Reverting status...",
      "Status reverted.",
      "Revert status failed",
    );
  }

  async function undoBookingCompleted(bookingRecord: BookingRecord) {
    await updateBookingStatusOnly(
      bookingRecord,
      undoCompletedStatus(bookingRecord),
      "Undoing completion...",
      "Completion undone.",
      "Undo completed failed",
    );
  }

  async function deleteCompletedBooking(bookingRecord: BookingRecord) {
    const bookingId = String(bookingRecord.id);

    if (clean(bookingRecord.status).toLowerCase() !== "completed") {
      setBookingCompletionMessage(bookingId, {
        tone: "error",
        text: "Delete completed job failed: only completed jobs can be deleted here.",
      });
      return;
    }

    const confirmed = window.confirm("Delete this completed job from the app? This cannot be undone.");

    if (!confirmed) {
      setBookingCompletionMessage(bookingId, { tone: "info", text: "Delete cancelled." });
      return;
    }

    if (!adminLegacyDataClient) {
      setBookingCompletionMessage(bookingId, {
        tone: "error",
        text: "Delete completed job failed: Admin data API is not available.",
      });
      return;
    }

    setDeletingCompletedBookingId(bookingId);
    setBookingCompletionMessage(bookingId, { tone: "info", text: "Deleting completed job..." });

    try {
      const { error } = await adminLegacyDataClient.from(adminLegacyTables.bookings).delete().eq("id", bookingRecord.id);

      if (error) {
        throw new Error(error.message);
      }

      setBookings((current) =>
        current.filter((currentBooking) => String(currentBooking.id) !== bookingId),
      );
      setBookingCompletionMessage(bookingId, { tone: "success", text: "Completed job deleted." });
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Unknown completed job delete error.";
      setBookingCompletionMessage(bookingId, {
        tone: "error",
        text: `Delete completed job failed: ${errorText}`,
      });
    } finally {
      setDeletingCompletedBookingId(null);
    }
  }

  async function clearAssignedDriver(bookingRecord: BookingRecord) {
    const bookingId = String(bookingRecord.id);
    const nextStatus = statusAfterClearingAssignedDriver(bookingRecord.status);

    if (!adminLegacyDataClient) {
      const errorMessage = {
        tone: "error",
        text: "Clear assigned driver failed: Admin data API is not available.",
      } satisfies Message;
      setMessage(errorMessage);
      setDriverAssignmentMessage(bookingId, errorMessage);
      return;
    }

    const loadingMessage = { tone: "info", text: "Clearing assigned driver..." } satisfies Message;
    setAssigningBookingId(bookingId);
    setMessage(loadingMessage);
    setDriverAssignmentMessage(bookingId, loadingMessage);

    try {
      const { error } = await adminLegacyDataClient
        .from(adminLegacyTables.bookings)
        .update({
          driver_id: null,
          driver_name: null,
          driver_contact: null,
          driver_plate_number: null,
          driver_payout_override: null,
          driver_payout_reason: null,
          driver_notes: null,
          driver_dispatch_include_payout: false,
          status: nextStatus,
        })
        .eq("id", bookingRecord.id);

      if (error) {
        throw new Error(error.message);
      }

      setBookings((current) =>
        current.map((currentBooking) =>
          currentBooking.id === bookingRecord.id
            ? {
                ...currentBooking,
                driver_id: null,
                driver_name: null,
                driver_contact: null,
                driver_plate_number: null,
                driver_payout_override: null,
                driver_payout_reason: null,
                driver_notes: null,
                driver_dispatch_include_payout: false,
                status: nextStatus,
              }
            : currentBooking,
        ),
      );
      setDriverDrafts((current) => {
        const next = { ...current };
        delete next[bookingId];
        return next;
      });

      if (loadedBookingId === bookingId) {
        setBooking((current) => ({
          ...current,
          driverId: "",
          driverName: "",
          driverContact: "",
          driverPlate: "",
          driverPayoutOverride: "",
          savedDriverPayoutAmount: "",
          driverPayoutReason: "",
          driverNotes: "",
          driverIncludePayout: "",
        }));
      }

      const successMessage = { tone: "success", text: "Assigned driver cleared." } satisfies Message;
      setMessage(successMessage);
      setDriverAssignmentMessage(bookingId, successMessage);
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Unknown driver clear error.";
      const errorMessage = {
        tone: "error",
        text: `Clear assigned driver failed: ${errorText}`,
      } satisfies Message;
      setMessage(errorMessage);
      setDriverAssignmentMessage(bookingId, errorMessage);
    } finally {
      setAssigningBookingId(null);
    }
  }

  async function assignDriver(bookingRecord: BookingRecord) {
    const bookingId = String(bookingRecord.id);
    const driverDraft = getDriverDraft(bookingRecord);
    const selectedDashboardDriver = findDashboardDriverCandidate(driverDraft.driverId);
    const selectedDriver =
      selectedDashboardDriver?.sourceDriver ??
      drivers.find((driver) => String(driver.id) === driverDraft.driverId);
    const selectedDriverId = selectedDriver?.id ?? selectedDashboardDriver?.driverId ?? null;
    const driverName =
      clean(driverDraft.driverName) ||
      clean(selectedDashboardDriver?.driverName) ||
      clean(selectedDriver?.driver_name);
    const manualPayoutText = clean(driverDraft.payoutOverride);
    const manualPayout = manualPayoutText ? finiteNumber(manualPayoutText) : null;
    const bookingType = normalizeBookingType(bookingRecord.booking_type);
    const selectedDriverPayoutSnapshot = driverPayoutSnapshotFromRule(
      bookingType,
      selectedDriver?.driver_payout_rules?.[bookingType],
    );
    const selectedDriverPayoutFields = selectedDriverPayoutSnapshot
      ? {
          driver_payout_min: selectedDriverPayoutSnapshot.driverPayoutMin,
          driver_payout_max: selectedDriverPayoutSnapshot.driverPayoutMax,
          driver_payout_unit: selectedDriverPayoutSnapshot.driverPayoutUnit,
        }
      : {};
    const calculatedPayout = calculateSavedDriverPayout(
      bookingRecord,
      selectedDriver,
      rateSettings,
      driverDraft.payoutOverride,
    );

    if (!driverName) {
      const errorMessage = {
        tone: "error",
        text: "Driver name is required before assignment.",
      } satisfies Message;
      setMessage(errorMessage);
      setDriverAssignmentMessage(bookingId, errorMessage);
      return;
    }

    if (manualPayoutText && (manualPayout === null || manualPayout <= 0)) {
      const errorMessage = {
        tone: "error",
        text: "Override payout must be greater than $0.",
      } satisfies Message;
      setMessage(errorMessage);
      setDriverAssignmentMessage(bookingId, errorMessage);
      return;
    }

    if (!adminLegacyDataClient) {
      const errorMessage = {
        tone: "error",
        text: "Assign driver failed: Admin data API is not available.",
      } satisfies Message;
      setMessage(errorMessage);
      setDriverAssignmentMessage(bookingId, errorMessage);
      return;
    }

    const loadingMessage = { tone: "info", text: "Assigning driver..." } satisfies Message;
    setAssigningBookingId(bookingId);
    setMessage(loadingMessage);
    setDriverAssignmentMessage(bookingId, loadingMessage);

    try {
      const { error } = await adminLegacyDataClient
        .from(adminLegacyTables.bookings)
        .update({
          driver_id: selectedDriverId,
          driver_name: driverName,
          driver_contact:
            clean(driverDraft.driverContact) ||
            clean(selectedDashboardDriver?.contactNumber) ||
            clean(selectedDriver?.contact_number) ||
            null,
          driver_plate_number:
            clean(driverDraft.driverPlate) ||
            clean(selectedDashboardDriver?.plateNumber) ||
            clean(selectedDriver?.plate_number) ||
            null,
          driver_payout_amount: calculatedPayout || null,
          ...selectedDriverPayoutFields,
          driver_payout_override: manualPayout,
          driver_payout_reason: clean(driverDraft.payoutReason) || null,
          driver_notes: clean(driverDraft.notes) || null,
          driver_dispatch_include_payout: driverDraft.includePayout,
          status: "assigned",
        })
        .eq("id", bookingRecord.id);

      if (error) {
        throw new Error(error.message);
      }

      setBookings((current) =>
        current.map((currentBooking) =>
          currentBooking.id === bookingRecord.id
            ? {
                ...currentBooking,
                driver_id: selectedDriverId,
                driver_name: driverName,
                driver_contact:
                  clean(driverDraft.driverContact) ||
                  clean(selectedDashboardDriver?.contactNumber) ||
                  clean(selectedDriver?.contact_number),
                driver_plate_number:
                  clean(driverDraft.driverPlate) ||
                  clean(selectedDashboardDriver?.plateNumber) ||
                  clean(selectedDriver?.plate_number),
                driver_payout_amount: calculatedPayout,
                ...selectedDriverPayoutFields,
                driver_payout_override: manualPayout,
                driver_payout_reason: clean(driverDraft.payoutReason),
                driver_notes: clean(driverDraft.notes),
                driver_dispatch_include_payout: driverDraft.includePayout,
                status: "assigned",
              }
            : currentBooking,
        ),
      );
      const successMessage = { tone: "success", text: "Assigned driver updated." } satisfies Message;
      setMessage(successMessage);
      setDriverAssignmentMessage(bookingId, successMessage);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown driver assignment error.";
      const assignmentErrorMessage = {
        tone: "error",
        text: `Assign driver failed: ${errorMessage}`,
      } satisfies Message;
      setMessage(assignmentErrorMessage);
      setDriverAssignmentMessage(bookingId, assignmentErrorMessage);
    } finally {
      setAssigningBookingId(null);
    }
  }

  async function copyDriverDispatch(bookingRecord: BookingRecord) {
    const bookingId = String(bookingRecord.id);

    try {
      await navigator.clipboard.writeText(getDriverDispatchCard(bookingRecord, getDriverDraft(bookingRecord)));
      setBookingCopyMessage(bookingId, "driverDispatch", {
        tone: "success",
        text: "Driver dispatch copied.",
      });
    } catch {
      setBookingCopyMessage(bookingId, "driverDispatch", {
        tone: "error",
        text: "Copy failed. Select the dispatch details manually.",
      });
    }
  }

  function renderBookingCards(sectionBookings: BookingRecord[], emptyText: string) {
    if (sectionBookings.length === 0) {
      return (
        <div className="rounded-md border border-dashed border-stone-300 p-6 text-center text-sm text-slate-500">
          {emptyText}
        </div>
      );
    }

    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sectionBookings.map((savedBooking) => {
          const driverDraft = getDriverDraft(savedBooking);
          const bookingId = String(savedBooking.id);
          const normalizedBookingStatus = clean(savedBooking.status).toLowerCase();
          const isAssigned = normalizedBookingStatus === "assigned";
          const isCompleted = normalizedBookingStatus === "completed";
          const isDriverOtw = normalizedBookingStatus === "driver_otw";
          const isPob = normalizedBookingStatus === "pob";
          const canMarkOtw = normalizedBookingStatus === "confirmed" || normalizedBookingStatus === "assigned";
          const canMarkPob = isDriverOtw;
          const bookingType = clean(savedBooking.booking_type) || "Booking";
          const vehicle = clean(savedBooking.vehicle) || "Vehicle";
          const bookerName = getBookerName(savedBooking);
          const travelerName = getBookingName(savedBooking);
          const driverName = clean(savedBooking.driver_name) || clean(driverDraft.driverName);
          const priceAmounts = bookingCardPriceAmounts(savedBooking);
          const priceLine = bookingCardPriceLine(savedBooking);
          const hasDriver = Boolean(driverName);
          const hasSavedDriver = Boolean(clean(savedBooking.driver_name) || savedBooking.driver_id);
          const driverAssignmentMessage = driverAssignmentMessages[bookingId] ?? null;
          const rawBookingCompletionMessage = bookingCompletionMessages[bookingId] ?? null;
          const bookingCompletionMessage = isDashboardStatusMessage(rawBookingCompletionMessage)
            ? rawBookingCompletionMessage
            : null;
          const driverDispatchCopyMessage =
            bookingCopyMessages[bookingCopyMessageKey(bookingId, "driverDispatch")] ?? null;
          const jobCardCopyMessage =
            bookingCopyMessages[bookingCopyMessageKey(bookingId, "jobCard")] ?? null;
          const revertStatusLabel = isPob
            ? "Revert to OTW"
            : `Revert to ${hasSavedDriver ? "assigned" : "confirmed"}`;
          const selectedDashboardDriver = findDashboardDriverCandidate(driverDraft.driverId);
          const selectedDraftDriver =
            selectedDashboardDriver?.sourceDriver ??
            drivers.find((driver) => String(driver.id) === driverDraft.driverId);
          const selectedDraftDriverPayout = selectedDraftDriver
            ? calculateSavedDriverPayout(savedBooking, selectedDraftDriver, rateSettings)
            : null;
          const assignmentPayoutPlaceholder =
            selectedDraftDriverPayout && selectedDraftDriverPayout > 0
              ? selectedDraftDriverPayout
              : priceAmounts.driverPrice;
          const selectedDraftDriverIsInactive = Boolean(
            selectedDashboardDriver
              ? isInactiveDashboardDriverCandidate(selectedDashboardDriver)
              : selectedDraftDriver && isInactiveDriver(selectedDraftDriver),
          );
          const dashboardDriverSearchQuery = clean(driverDraft.driverSearch);
          const matchingDashboardDrivers = dashboardDriverSearchQuery
            ? dashboardDriverCandidates.filter((candidate) =>
                dashboardDriverCandidateMatchesSearch(candidate, dashboardDriverSearchQuery),
              )
            : [];
          const selectedDriverInDashboardMatches = matchingDashboardDrivers.some(
            (candidate) =>
              candidate.optionValue === driverDraft.driverId ||
              (candidate.driverId !== null && String(candidate.driverId) === driverDraft.driverId),
          );
          const showSavedDashboardDriverOption = Boolean(
            driverDraft.driverId &&
              (!selectedDashboardDriver || selectedDraftDriverIsInactive || !selectedDriverInDashboardMatches),
          );
          const dashboardDriverSearchCount = matchingDashboardDrivers.length;

          return (
            <article
              className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
              data-dashboard-operational-card={bookingId}
              key={savedBooking.id}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">
                    {bookingType} / {vehicle}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatPickupDateTime(getBookingDateKey(savedBooking), savedBooking.pickup_time)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${bookingStatusClass(
                    savedBooking.status,
                  )}`}
                >
                  {bookingStatusLabel(savedBooking.status)}
                </span>
              </div>

              <div className="mt-3 grid gap-3" data-dashboard-operational-body={bookingId}>
                <OperationalCardSection section="booking" title="Booking">
                  {savedBooking.flight_no ? <p>Flight {savedBooking.flight_no}</p> : null}
                  <p>Booker: {bookerName || "—"}</p>
                  <p>Traveler: {travelerName || "—"}</p>
                </OperationalCardSection>
                <OperationalCardSection section="route" title="Route">
                  <p className="break-words">Route: {formatDashboardRoute(savedBooking)}</p>
                </OperationalCardSection>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-operational-card-summary-grid={bookingId}>
                  <DispatcherStatusSummaryBlock bookingRecord={savedBooking} flush />
                  <AssignedDriverSummaryBlock
                    bookingRecord={savedBooking}
                    driverDraft={driverDraft}
                    flush
                  />
                  <OperationalReadinessSummaryBlock bookingRecord={savedBooking} flush />
                </div>
                <OperationalCardSection section="vehicle-pax-price" title="Vehicle / pax / price">
                  <p>Vehicle: {vehicle}</p>
                  <p>Pax: {savedBooking.pax || 1}</p>
                  {savedBooking.child_seat_required ? (
                    <p>{formatChildSeatNote(savedBooking.child_seat_count, savedBooking.child_seat_type)}</p>
                  ) : null}
                  {normalizeExtraStopCount(savedBooking.extra_stop_count) > 0 ? (
                    <p>Extra stops: {normalizeExtraStopCount(savedBooking.extra_stop_count)}</p>
                  ) : null}
                  {priceLine ? <p>{priceLine}</p> : null}
                  {savedBooking.customer_price_override_reason ? (
                    <p>Customer override: {savedBooking.customer_price_override_reason}</p>
                  ) : null}
                </OperationalCardSection>
              </div>

              <div className="mt-4 border-t border-stone-200 pt-3" data-dashboard-action-group={bookingId}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Internal actions
                </p>
                <button
                  className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                  data-dashboard-load-booking="true"
                  onClick={() => loadSelectedBooking(savedBooking)}
                  type="button"
                >
                  Load this booking
                </button>

                {!isCompleted || bookingCompletionMessage ? (
                  <div className="mt-2 flex flex-col gap-2" data-dashboard-status-controls={bookingId}>
                    {canMarkOtw ? (
                      <button
                        className="h-10 w-full rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        data-dashboard-mark-otw={bookingId}
                        disabled={completingBookingId === bookingId}
                        onClick={() => markBookingOtw(savedBooking)}
                        type="button"
                      >
                        {completingBookingId === bookingId ? "Marking..." : "Mark OTW"}
                      </button>
                    ) : null}
                    {canMarkPob ? (
                      <button
                        className="h-10 w-full rounded-md border border-indigo-300 bg-white px-3 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        data-dashboard-mark-pob={bookingId}
                        disabled={completingBookingId === bookingId}
                        onClick={() => markBookingPob(savedBooking)}
                        type="button"
                      >
                        {completingBookingId === bookingId ? "Marking..." : "Mark POB"}
                      </button>
                    ) : null}
                    {isDriverOtw ? (
                      <button
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        data-dashboard-revert-status={bookingId}
                        disabled={completingBookingId === bookingId}
                        onClick={() => revertBookingStatus(savedBooking)}
                        type="button"
                      >
                        {completingBookingId === bookingId ? "Reverting..." : revertStatusLabel}
                      </button>
                    ) : null}
                    {!isCompleted ? (
                      <button
                        className="h-10 w-full rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        data-dashboard-mark-completed={bookingId}
                        disabled={completingBookingId === bookingId}
                        onClick={() => markBookingCompleted(savedBooking)}
                        type="button"
                      >
                        {completingBookingId === bookingId ? "Marking..." : "Mark completed"}
                      </button>
                    ) : null}
                    {isPob ? (
                      <button
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        data-dashboard-revert-status={bookingId}
                        disabled={completingBookingId === bookingId}
                        onClick={() => revertBookingStatus(savedBooking)}
                        type="button"
                      >
                        {completingBookingId === bookingId ? "Reverting..." : revertStatusLabel}
                      </button>
                    ) : null}
                    {bookingCompletionMessage ? (
                      <p
                        className={`rounded-md border px-3 py-2 text-xs ${statusClass(
                          bookingCompletionMessage.tone,
                        )}`}
                        data-booking-completion-message={bookingId}
                      >
                        {bookingCompletionMessage.text}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {!isCompleted ? (
                <div className="mt-4 rounded-md border border-stone-200 bg-white p-3">
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-slate-900">Assign driver to this booking</h4>
                    <p className="mt-1 text-xs text-slate-500">This updates the selected booking only.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        Search drivers
                      </span>
                      <input
                        className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                        data-dashboard-driver-search-input={bookingId}
                        onChange={(event) =>
                          updateDriverDraft(savedBooking, "driverSearch", event.target.value)
                        }
                        placeholder="Name, phone, plate, vehicle, status"
                        value={driverDraft.driverSearch}
                      />
                      {dashboardDriverSearchQuery ? (
                        <p
                          className="mt-1 text-xs text-slate-500"
                          data-dashboard-driver-search-count={bookingId}
                        >
                          Showing {dashboardDriverSearchCount} matching{" "}
                          {dashboardDriverSearchCount === 1 ? "driver" : "drivers"}.
                        </p>
                      ) : (
                        <p
                          className="mt-1 text-xs text-slate-500"
                          data-dashboard-driver-search-helper={bookingId}
                        >
                          Search driver name, phone, plate, or vehicle to show drivers.
                        </p>
                      )}
                      {dashboardDriverSearchQuery && dashboardDriverSearchCount === 0 ? (
                        <p
                          className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                          data-dashboard-driver-search-empty={bookingId}
                        >
                          No matching drivers found.
                        </p>
                      ) : null}
                    </label>
                    <label className="sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        Driver
                      </span>
                      <select
                        className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                        data-dashboard-driver-select={bookingId}
                        onChange={(event) =>
                          updateDriverDraft(savedBooking, "driverId", event.target.value)
                        }
                        value={driverDraft.driverId}
                      >
                        <option value="">Manual / unselected</option>
                        {showSavedDashboardDriverOption ? (
                          <option disabled={selectedDraftDriverIsInactive} value={driverDraft.driverId}>
                            Saved:{" "}
                            {clean(driverDraft.driverName) ||
                              clean(selectedDashboardDriver?.driverName) ||
                              clean(selectedDraftDriver?.driver_name) ||
                              `Driver ${driverDraft.driverId}`}
                            {selectedDraftDriverIsInactive ? " (inactive)" : ""}
                          </option>
                        ) : null}
                        {matchingDashboardDrivers.map((candidate) => (
                          <option key={candidate.optionValue} value={candidate.optionValue}>
                            {dashboardDriverCandidateLabel(candidate)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        Driver Name
                      </span>
                      <input
                        className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                        onChange={(event) =>
                          updateDriverDraft(savedBooking, "driverName", event.target.value)
                        }
                        placeholder="Driver name"
                        value={driverDraft.driverName}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        Driver Contact
                      </span>
                      <input
                        className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                        onChange={(event) =>
                          updateDriverDraft(savedBooking, "driverContact", event.target.value)
                        }
                        placeholder="Phone / WhatsApp"
                        value={driverDraft.driverContact}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        Driver Car Plate
                      </span>
                      <input
                        className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                        onChange={(event) =>
                          updateDriverDraft(savedBooking, "driverPlate", event.target.value)
                        }
                        placeholder="Plate: —"
                        value={driverDraft.driverPlate}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        Override Payout
                      </span>
                      <input
                        className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                        min={0}
                        onChange={(event) =>
                          updateDriverDraft(savedBooking, "payoutOverride", event.target.value)
                        }
                        placeholder={`${assignmentPayoutPlaceholder ?? ""}`}
                        type="number"
                        value={driverDraft.payoutOverride}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        Override Reason
                      </span>
                      <input
                        className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                        onChange={(event) =>
                          updateDriverDraft(savedBooking, "payoutReason", event.target.value)
                        }
                        value={driverDraft.payoutReason}
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        Driver Notes
                      </span>
                      <input
                        className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                        onChange={(event) =>
                          updateDriverDraft(savedBooking, "notes", event.target.value)
                        }
                        placeholder="Assignment notes"
                        value={driverDraft.notes}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        checked={driverDraft.includePayout}
                        onChange={(event) =>
                          updateDriverDraft(savedBooking, "includePayout", event.target.checked)
                        }
                        type="checkbox"
                      />
                      Include payout
                    </label>
                  </div>
                  <button
                    className="mt-3 h-10 w-full rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    data-dashboard-assign-driver={bookingId}
                    disabled={assigningBookingId === bookingId}
                    onClick={() => assignDriver(savedBooking)}
                    type="button"
                  >
                    {assigningBookingId === bookingId ? "Assigning..." : "Assign to this booking"}
                  </button>
                  {hasSavedDriver ? (
                    <button
                      className="mt-2 h-10 w-full rounded-md border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-800 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      data-dashboard-clear-driver={bookingId}
                      disabled={assigningBookingId === bookingId}
                      onClick={() => clearAssignedDriver(savedBooking)}
                      type="button"
                    >
                      {assigningBookingId === bookingId ? "Clearing..." : "Clear assigned driver"}
                    </button>
                  ) : null}
                  {driverAssignmentMessage ? (
                    <p
                      className={`mt-2 rounded-md border px-3 py-2 text-xs ${statusClass(
                        driverAssignmentMessage.tone,
                      )}`}
                      data-driver-assignment-message={bookingId}
                    >
                      {driverAssignmentMessage.text}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!isCompleted && (isAssigned || hasDriver) ? (
                <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-slate-800">
                  <p className="font-semibold text-sky-900">Dispatch</p>
                  <p className="mt-1">Driver: {clean(savedBooking.driver_name) || driverDraft.driverName}</p>
                  {driverDraft.driverContact ? <p>Contact: {driverDraft.driverContact}</p> : null}
                  {getBookingName(savedBooking) ? (
                    <p>Passenger: {getBookingName(savedBooking)}</p>
                  ) : null}
                  <button
                    className="mt-3 h-10 w-full rounded-md border border-sky-300 bg-white px-3 text-sm font-semibold text-sky-900 transition hover:bg-sky-50"
                    data-dashboard-copy-driver-dispatch={bookingId}
                    onClick={() => copyDriverDispatch(savedBooking)}
                    type="button"
                  >
                    Copy Driver Dispatch
                  </button>
                  {driverDispatchCopyMessage ? (
                    <p
                      className={`mt-2 rounded-md border px-3 py-2 text-xs ${statusClass(
                        driverDispatchCopyMessage.tone,
                      )}`}
                      data-dashboard-copy-feedback={`${bookingId}:driverDispatch`}
                    >
                      {driverDispatchCopyMessage.text}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!isCompleted ? (
                <>
                  <button
                    className="mt-4 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                    data-dashboard-copy-job-card={bookingId}
                    onClick={() => copySavedJobCard(savedBooking)}
                    type="button"
                  >
                    Copy WhatsApp Job Card
                  </button>
                  {jobCardCopyMessage ? (
                    <p
                      className={`mt-2 rounded-md border px-3 py-2 text-xs ${statusClass(
                        jobCardCopyMessage.tone,
                      )}`}
                      data-dashboard-copy-feedback={`${bookingId}:jobCard`}
                    >
                      {jobCardCopyMessage.text}
                    </p>
                  ) : null}
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    );
  }

  const pricingPanel = (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-xl font-semibold">Pricing</h2>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border border-stone-200 bg-stone-50 px-2 py-3">
          <p className="text-xs text-slate-500">Customer</p>
          <p className="text-lg font-semibold">${formatMoney(draftPricing.customerPrice)}</p>
        </div>
        <div className="rounded-md border border-stone-200 bg-stone-50 px-2 py-3">
          <p className="text-xs text-slate-500">Driver</p>
          <p className="text-lg font-semibold">${formatMoney(draftPricing.driverPayout)}</p>
        </div>
        <div className="rounded-md border border-stone-200 bg-stone-50 px-2 py-3">
          <p className="text-xs text-slate-500">Profit</p>
          <p className="text-lg font-semibold">${formatMoney(draftPricing.profit)}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Source: {draftPricing.customerPriceSource}; customer rate ${formatMoney(draftPricing.customerRate)}/
        {draftPricing.customerRateUnit}; driver payout ${formatMoney(draftPricing.driverPayoutMin)}
        {draftPricing.driverPayoutMax !== draftPricing.driverPayoutMin
          ? `-${formatMoney(draftPricing.driverPayoutMax)}`
          : ""}
        /{draftPricing.driverPayoutUnit} ({draftPricing.driverPayoutSource})
      </p>
      {draftPricing.midnightSurcharge ||
      draftPricing.midnightPayout ||
      draftPricing.extraStopCount ||
      draftPricing.childSeatCount ? (
        <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-slate-700">
          {draftPricing.midnightSurcharge || draftPricing.midnightPayout ? (
            <p>
              Midnight: customer +${formatMoney(draftPricing.midnightSurcharge)} / driver +$
              {formatMoney(draftPricing.midnightPayout)}
            </p>
          ) : null}
          {draftPricing.extraStopCount ? (
            <p>
              Extra stops: {draftPricing.extraStopCount} x customer +$
              {formatCompactMoney(draftPricing.extraStopSurcharge)} / driver +$
              {formatCompactMoney(draftPricing.extraStopPayout)}
            </p>
          ) : null}
          {draftPricing.childSeatCount ? (
            <p>
              Child seat: {draftPricing.childSeatCount} x customer +$
              {formatCompactMoney(draftPricing.childSeatCustomerSurcharge)} / driver +$
              {formatCompactMoney(draftPricing.childSeatDriverPayout)}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Customer Price Override
          </span>
          <input
            className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            min={0}
            onChange={(event) => update("customerPriceOverride", event.target.value)}
            placeholder={formatMoney(draftPricing.customerPrice)}
            type="number"
            value={booking.customerPriceOverride}
          />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Override Reason
          </span>
          <input
            className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            onChange={(event) => update("customerPriceOverrideReason", event.target.value)}
            placeholder="Custom quote / VIP / account rule"
            value={booking.customerPriceOverrideReason}
          />
        </label>
      </div>
    </div>
  );

  const statusPanel = (
    <div
      className={`rounded-md border px-4 py-3 text-sm ${statusClass(message.tone)}`}
      data-status-panel="global"
    >
      {message.text}
    </div>
  );
  const rateOverrideStatusPanel = (
    <div
      className={`rounded-md border px-4 py-3 text-sm ${statusClass(message.tone)}`}
      data-rate-feedback="override"
    >
      {message.text}
    </div>
  );

  const recentBookingsPanel = operationalBookings.length > 0 ? (
    <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Recent Bookings</h3>
          <p className="text-xs text-slate-500">Search only the bookings currently loaded below.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:min-w-[460px]">
          <label className="flex-1">
            <span className="sr-only">Search loaded bookings</span>
            <input
              className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              data-bookings-search-input="true"
              onChange={(event) => setBookingsSearchTerm(event.target.value)}
              placeholder="Search passenger, company, flight, route, driver"
              type="search"
              value={bookingsSearchTerm}
            />
          </label>
          {hasBookingsSearch ? (
            <button
              className="h-11 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={() => setBookingsSearchTerm("")}
              type="button"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
      {hasBookingsSearch && filteredRecentBookings.length === 0 ? (
        <p
          className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          data-bookings-search-empty="true"
        >
          No matching bookings found.
        </p>
      ) : null}
      {filteredRecentBookings.length > 0 ? (
      <div className="mt-3 max-h-80 space-y-2 overflow-auto">
        {filteredRecentBookings.map((savedBooking) => {
          const routePoints = getRoutePoints(savedBooking);
          const pickup = clean(savedBooking.pickup_address) || routePoints[0] || "Pickup";
          const dropoff =
            clean(savedBooking.dropoff_address) ||
            routePoints[routePoints.length - 1] ||
            "Drop-off";
          const routeText = routePoints.length >= 2 ? routePoints.join(" > ") : `${pickup} > ${dropoff}`;
          const createdAt = formatCreatedAt(savedBooking.created_at);
          const bookingId = String(savedBooking.id);
          const isCompleted = clean(savedBooking.status).toLowerCase() === "completed";
          const rawBookingCompletionMessage = bookingCompletionMessages[bookingId] ?? null;
          const bookingCompletionMessage = isMarkCompletionMessage(rawBookingCompletionMessage)
            ? rawBookingCompletionMessage
            : null;
          const priceLine = bookingCardPriceLine(savedBooking);

          return (
            <article
              className="rounded-md border border-stone-200 bg-white p-3 text-sm shadow-sm"
              data-recent-operational-card={bookingId}
              key={`recent-${savedBooking.id}`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-950">
                      {getRecentBookingTitle(savedBooking)} · {formatPickupDateTime(getBookingDateKey(savedBooking), savedBooking.pickup_time)}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${bookingStatusClass(
                        savedBooking.status,
                      )}`}
                    >
                      {bookingStatusLabel(savedBooking.status)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3" data-recent-operational-body={bookingId}>
                    <OperationalCardSection section="booking" title="Booking">
                      {clean(savedBooking.flight_no) ? <p>Flight {clean(savedBooking.flight_no)}</p> : null}
                      <p>Booker: {getBookerName(savedBooking) || "Unknown"}</p>
                      <p>Name: {getBookingName(savedBooking) || "Unknown"}</p>
                    </OperationalCardSection>
                    <OperationalCardSection section="route" title="Route">
                      <p className="break-words">Route: {routeText}</p>
                    </OperationalCardSection>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-operational-card-summary-grid={bookingId}>
                      <DispatcherStatusSummaryBlock bookingRecord={savedBooking} flush />
                      <AssignedDriverSummaryBlock bookingRecord={savedBooking} flush />
                      <OperationalReadinessSummaryBlock bookingRecord={savedBooking} flush />
                    </div>
                    <OperationalCardSection section="vehicle-pax-price" title="Vehicle / pax / price">
                      <p>Vehicle: {clean(savedBooking.vehicle) || "Vehicle TBC"}</p>
                      <p>Pax: {savedBooking.pax || 1}</p>
                      {priceLine ? <p>{priceLine}</p> : null}
                      {createdAt ? <p className="text-xs text-slate-500">Created {createdAt}</p> : null}
                    </OperationalCardSection>
                  </div>
                </div>
                <div className="flex flex-col gap-2" data-recent-operational-actions={bookingId}>
                  <button
                    className="h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    onClick={() => loadSelectedBooking(savedBooking)}
                    type="button"
                  >
                    Load this booking
                  </button>
                  {!isCompleted ? (
                    <button
                      className="h-10 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      data-bookings-mark-completed={bookingId}
                      disabled={completingBookingId === bookingId}
                      onClick={() => markBookingCompleted(savedBooking)}
                      type="button"
                    >
                      {completingBookingId === bookingId ? "Marking..." : "Mark completed"}
                    </button>
                  ) : null}
                  {bookingCompletionMessage ? (
                    <p
                      className={`rounded-md border px-3 py-2 text-xs ${statusClass(
                        bookingCompletionMessage.tone,
                      )}`}
                      data-booking-completion-message={bookingId}
                    >
                      {bookingCompletionMessage.text}
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      ) : null}
    </div>
  ) : (
    <div className="mt-4 rounded-md border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-slate-500">
      No bookings loaded.
    </div>
  );
  const completedEmptyState = (
    <div className="mt-4 rounded-md border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-slate-500">
      No completed bookings loaded yet.
    </div>
  );
  const completedBookingsPanel = (
    <>
      {completedTabCompletionMessages.length > 0 ? (
        <div className="mt-4 space-y-2" data-completed-undo-feedback-list="true">
          {completedTabCompletionMessages.map(([bookingId, completionMessage]) => (
            <div
              className="rounded-md border border-stone-200 bg-white p-3 text-sm"
              data-completed-undo-feedback-card={bookingId}
              key={`completed-message-${bookingId}`}
            >
              <p
                className={`rounded-md border px-3 py-2 text-xs ${statusClass(
                  completionMessage.tone,
                )}`}
                data-booking-completion-message={bookingId}
              >
                {completionMessage.text}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {completedTabDeleteMessages.length > 0 ? (
        <div className="mt-4 space-y-2" data-completed-delete-feedback-list="true">
          {completedTabDeleteMessages.map(([bookingId, completionMessage]) => (
            <div
              className="rounded-md border border-stone-200 bg-white p-3 text-sm"
              data-completed-delete-feedback-card={bookingId}
              key={`completed-delete-message-${bookingId}`}
            >
              <p
                className={`rounded-md border px-3 py-2 text-xs ${statusClass(
                  completionMessage.tone,
                )}`}
                data-booking-completion-message={bookingId}
              >
                {completionMessage.text}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {completedBookings.length > 0 ? (
        <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Completed Bookings</h3>
              <p className="text-xs text-slate-500">Search completed bookings already loaded in this browser.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:min-w-[460px]">
              <label className="flex-1">
                <span className="sr-only">Search completed bookings</span>
                <input
                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  data-completed-search-input="true"
                  onChange={(event) => setCompletedSearchTerm(event.target.value)}
                  placeholder="Search passenger, company, flight, route, driver"
                  type="search"
                  value={completedSearchTerm}
                />
              </label>
              {hasCompletedSearch ? (
                <button
                  className="h-11 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  onClick={() => setCompletedSearchTerm("")}
                  type="button"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
          {hasCompletedSearch && filteredCompletedBookings.length === 0 ? (
            <p
              className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              data-completed-search-empty="true"
            >
              No matching completed bookings found.
            </p>
          ) : null}
          {filteredCompletedBookings.length > 0 ? (
          <div className="mt-3 max-h-[32rem] space-y-2 overflow-auto">
            {filteredCompletedBookings.map((savedBooking) => {
              const routePoints = getRoutePoints(savedBooking);
              const pickup = clean(savedBooking.pickup_address) || routePoints[0] || "Pickup";
              const dropoff =
                clean(savedBooking.dropoff_address) ||
                routePoints[routePoints.length - 1] ||
                "Drop-off";
              const routeText = routePoints.length >= 2 ? routePoints.join(" > ") : `${pickup} > ${dropoff}`;
              const createdAt = formatCreatedAt(savedBooking.created_at);
              const bookingId = String(savedBooking.id);
              const rawBookingCompletionMessage = bookingCompletionMessages[bookingId] ?? null;
              const bookingCompletionMessage =
                isUndoCompletionMessage(rawBookingCompletionMessage) ||
                isDeleteCompletedJobMessage(rawBookingCompletionMessage)
                ? rawBookingCompletionMessage
                : null;
              const priceLine = bookingCardPriceLine(savedBooking);
              return (
                <article
                  className="rounded-md border border-stone-200 bg-white p-3 text-sm shadow-sm"
                  data-completed-operational-card={bookingId}
                  key={`completed-${savedBooking.id}`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">
                          {getRecentBookingTitle(savedBooking)} · {formatPickupDateTime(getBookingDateKey(savedBooking), savedBooking.pickup_time)}
                        </p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${bookingStatusClass(
                            savedBooking.status,
                          )}`}
                        >
                          {bookingStatusLabel(savedBooking.status)}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3" data-completed-operational-body={bookingId}>
                        <OperationalCardSection section="booking" title="Booking">
                          {clean(savedBooking.flight_no) ? <p>Flight {clean(savedBooking.flight_no)}</p> : null}
                          <p>Booker: {getBookerName(savedBooking) || "Unknown"}</p>
                          <p>Name: {getBookingName(savedBooking) || "Unknown"}</p>
                        </OperationalCardSection>
                        <OperationalCardSection section="route" title="Route">
                          <p className="break-words">Route: {routeText}</p>
                        </OperationalCardSection>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-operational-card-summary-grid={bookingId}>
                          <DispatcherStatusSummaryBlock bookingRecord={savedBooking} flush />
                          <AssignedDriverSummaryBlock bookingRecord={savedBooking} flush />
                          <OperationalReadinessSummaryBlock bookingRecord={savedBooking} flush />
                        </div>
                        <OperationalCardSection section="vehicle-pax-price" title="Vehicle / pax / price">
                          <p>Vehicle: {clean(savedBooking.vehicle) || "Vehicle TBC"}</p>
                          <p>Pax: {savedBooking.pax || 1}</p>
                          {priceLine ? <p>{priceLine}</p> : null}
                          {createdAt ? <p className="text-xs text-slate-500">Created {createdAt}</p> : null}
                        </OperationalCardSection>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2" data-completed-operational-actions={bookingId}>
                      <button
                        className="h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                        data-completed-load-booking="true"
                        onClick={() => loadSelectedBooking(savedBooking)}
                        type="button"
                      >
                        Load this booking
                      </button>
                      <button
                        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        data-completed-undo-booking={bookingId}
                        disabled={completingBookingId === bookingId || deletingCompletedBookingId === bookingId}
                        onClick={() => undoBookingCompleted(savedBooking)}
                        type="button"
                      >
                        {completingBookingId === bookingId ? "Undoing..." : "Undo completed"}
                      </button>
                      <button
                        className="h-10 rounded-md border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-800 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        data-completed-delete-booking={bookingId}
                        disabled={deletingCompletedBookingId === bookingId || completingBookingId === bookingId}
                        onClick={() => deleteCompletedBooking(savedBooking)}
                        type="button"
                      >
                        {deletingCompletedBookingId === bookingId ? "Deleting..." : "Delete"}
                      </button>
                      {bookingCompletionMessage ? (
                        <p
                          className={`rounded-md border px-3 py-2 text-xs ${statusClass(
                            bookingCompletionMessage.tone,
                          )}`}
                          data-booking-completion-message={bookingId}
                        >
                          {bookingCompletionMessage.text}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          ) : null}
        </div>
      ) : null}
      {completedBookings.length === 0 ? completedEmptyState : null}
    </>
  );

  const jobCardCopyEditState = getRenderableCopyEditState("jobCard");
  const customerCopyEditState = getRenderableCopyEditState("customerCopy");
  const driverDispatchCopyEditState = getRenderableCopyEditState("driverDispatch");
  const jobCardCopyText = getDispatchCopyText("jobCard");
  const customerCopyText = getDispatchCopyText("customerCopy");
  const driverDispatchCopyText = getDispatchCopyText("driverDispatch");
  const showDriverJobLinkCopy = Boolean(clean(loadedBookingId));
  const dispatchReleaseTripWarnings = getDispatchReleaseTripWarnings(booking);
  const dispatchReleaseTripComplete = dispatchReleaseTripWarnings.length === 0;
  const dispatchReleaseAppliedStatus = appliedAdminBookingSnapshot
    ? adminBookingPersistencePrimaryStatus(appliedAdminBookingSnapshot)
    : "";
  const dispatchReleaseShortNoticeRequiresReview =
    isAdminShortNoticeReviewRequired(booking, currentTimeMs) ||
    clean(appliedAdminBookingSnapshot?.short_notice_review_status) === "Admin Review Required";
  const dispatchReleaseAppliedIsCustomerRequest = Boolean(
    appliedAdminBookingSnapshot &&
    adminBookingPersistenceRecordIsCustomerRequest(appliedAdminBookingSnapshot),
  );
  const dispatchReleaseReviewStatus = clean(dispatchReleaseAppliedStatus);
  const dispatchReleaseReviewStatusLower = dispatchReleaseReviewStatus.toLowerCase();
  const dispatchReleaseReviewCleared =
    dispatchReleaseTripComplete &&
    !dispatchReleaseShortNoticeRequiresReview &&
    (!dispatchReleaseAppliedIsCustomerRequest ||
      dispatchReleaseReviewStatusLower === "ready for confirmation" ||
      dispatchReleaseReviewStatusLower.includes("approved"));
  const dispatchReleaseDriverName = clean(booking.driverName) || clean(assignedDriverRecord?.driver_name);
  const dispatchReleaseDriverContact = clean(booking.driverContact) || clean(assignedDriverRecord?.contact_number);
  const dispatchReleaseDriverPlate = assignedDriverPlate;
  const dispatchReleaseDriverMissing = [
    dispatchReleaseDriverName ? "" : "driver name",
    dispatchReleaseDriverContact ? "" : "driver contact",
    dispatchReleaseDriverPlate ? "" : "car plate",
  ].filter(Boolean);
  const dispatchReleaseDriverReady = dispatchReleaseDriverMissing.length === 0;
  const dispatchReleaseCustomerCopyHasPlaceholder =
    /\bTBC\b|Pickup > Drop-off|Date TBC|Time TBC/i.test(customerCopyText);
  const dispatchReleaseCustomerCopyReady =
    dispatchReleaseTripComplete &&
    dispatchReleaseDriverReady &&
    clean(customerCopyText).startsWith("CUSTOMER BOOKING DETAILS") &&
    !dispatchReleaseCustomerCopyHasPlaceholder;
  const dispatchReleaseDriverDispatchHasPlaceholder =
    /\bTBC\b|Pickup > Drop-off|Date TBC|Time TBC/i.test(driverDispatchCopyText);
  const dispatchReleaseDriverDispatchHasFinanceLine = /payout\s*:/i.test(driverDispatchCopyText);
  const dispatchReleaseDriverDispatchReady =
    dispatchReleaseTripComplete &&
    dispatchReleaseDriverReady &&
    clean(driverDispatchCopyText).startsWith("DRIVER DISPATCH") &&
    !dispatchReleaseDriverDispatchHasPlaceholder &&
    !dispatchReleaseDriverDispatchHasFinanceLine;
  const dispatchReleaseDriverJobLinkReady =
    dispatchReleaseTripComplete &&
    dispatchReleaseDriverReady &&
    showDriverJobLinkCopy &&
    Boolean(clean(driverJobLinkUrl));
  const dispatchReleaseChecklist: DispatchReleaseChecklistItem[] = [
    {
      detail: dispatchReleaseTripComplete
        ? "Complete."
        : `Needs: ${dispatchReleaseTripWarnings.slice(0, 3).join(", ")}${
            dispatchReleaseTripWarnings.length > 3 ? "..." : ""
          }`,
      key: "trip-completeness",
      label: "Trip completeness",
      state: dispatchReleaseTripComplete ? "ready" : "needs-action",
    },
    {
      detail: dispatchReleaseReviewCleared
        ? "Clear."
        : dispatchReleaseShortNoticeRequiresReview
          ? "Admin review needed."
          : dispatchReleaseAppliedIsCustomerRequest
            ? `Status: ${dispatchReleaseReviewStatus || "Needs review"}.`
            : "Complete trip details.",
      key: "review-clearance",
      label: "Review clearance",
      state: dispatchReleaseReviewCleared ? "ready" : "needs-action",
    },
    {
      detail: dispatchReleaseDriverReady
        ? "Name/contact/plate ready."
        : `Needs: ${dispatchReleaseDriverMissing.join(", ")}.`,
      key: "assigned-driver",
      label: "Assigned driver details",
      state: dispatchReleaseDriverReady ? "ready" : "needs-action",
    },
    {
      detail: dispatchReleaseCustomerCopyReady
        ? "Ready for staff review."
        : "Needs trip/driver details.",
      key: "customer-copy",
      label: "Customer copy readiness",
      state: dispatchReleaseCustomerCopyReady ? "ready" : "needs-action",
    },
    {
      detail: dispatchReleaseDriverDispatchReady
        ? "Ready for staff review."
        : dispatchReleaseDriverDispatchHasFinanceLine
          ? "Remove private finance line."
          : "Needs trip/driver details.",
      key: "driver-dispatch-copy",
      label: "Driver dispatch copy readiness",
      state: dispatchReleaseDriverDispatchReady ? "ready" : "needs-action",
    },
    {
      detail: dispatchReleaseDriverJobLinkReady
        ? "Link copy available."
        : "Load saved booking first.",
      key: "driver-job-link",
      label: "Driver job link readiness",
      state: dispatchReleaseDriverJobLinkReady ? "ready" : "needs-action",
    },
  ];
  const dispatchReleaseReady = dispatchReleaseChecklist.every((item) => item.state === "ready");
  const dispatchReleaseContextLabel = appliedAdminBookingSnapshot
    ? `Applied snapshot: ${clean(appliedAdminBookingSnapshot.booking_reference) || "selected operational snapshot"}`
    : loadedBookingId
      ? `Loaded booking: ${loadedBookingId}`
      : "Current dispatch draft";
  const dispatchReleasePendingCount = dispatchReleaseChecklist.filter((item) => item.state !== "ready").length;
  const dispatchReleaseLocalStatus = dispatchReleaseMessage && dispatchReleaseReady
    ? "Marked ready locally"
    : dispatchReleaseReady
      ? "Ready to mark locally"
      : "Not ready for local release";
  const dispatchReleaseHandoffItems: DispatchReleaseChecklistItem[] = [
    {
      detail: dispatchReleaseReady
        ? "All release checks clear."
        : `${dispatchReleasePendingCount} check${dispatchReleasePendingCount === 1 ? "" : "s"} pending.`,
      key: "release-status",
      label: "Release status",
      state: dispatchReleaseReady ? "ready" : "needs-action",
    },
    {
      detail: dispatchReleaseCustomerCopyReady ? "Customer update copy ready." : "Review customer copy.",
      key: "customer-update-copy",
      label: "Customer update copy",
      state: dispatchReleaseCustomerCopyReady ? "ready" : "needs-action",
    },
    {
      detail: dispatchReleaseDriverDispatchReady ? "Driver dispatch copy ready." : "Review driver dispatch copy.",
      key: "driver-dispatch-copy",
      label: "Driver dispatch copy",
      state: dispatchReleaseDriverDispatchReady ? "ready" : "needs-action",
    },
    {
      detail: dispatchReleaseDriverJobLinkReady ? "Driver job link ready." : "Driver job link not ready.",
      key: "driver-job-link",
      label: "Driver job link",
      state: dispatchReleaseDriverJobLinkReady ? "ready" : "needs-action",
    },
    {
      detail: dispatchReleaseDriverReady
        ? `${dispatchReleaseDriverName} · ${dispatchReleaseDriverPlate}`
        : `Needs: ${dispatchReleaseDriverMissing.join(", ")}.`,
      key: "assigned-driver-summary",
      label: "Assigned driver summary",
      state: dispatchReleaseDriverReady ? "ready" : "needs-action",
    },
    {
      detail: `${dispatchReleaseLocalStatus}. ${clean(dispatchReleaseLocalNote) || "No local release note."}`,
      key: "local-release-note",
      label: "Local release note/status",
      state: dispatchReleaseReady ? "ready" : "needs-action",
    },
  ];
  const driverAcknowledgementCoreReady =
    Boolean(dispatchReleaseDriverName) &&
    Boolean(dispatchReleaseDriverContact) &&
    dispatchReleaseDriverDispatchReady &&
    dispatchReleaseDriverJobLinkReady;
  const driverAcknowledgementLocalStatus =
    driverAcknowledgementMessage && driverAcknowledgementCoreReady
      ? "Ready locally"
      : driverAcknowledgementCoreReady
        ? "Ready to mark locally"
        : "Acknowledgement pending";
  const driverAcknowledgementNextAction = !dispatchReleaseDriverName
    ? "Assign driver before acknowledgement."
    : !dispatchReleaseDriverContact
      ? "Add driver contact before acknowledgement."
      : !dispatchReleaseDriverDispatchReady
        ? "Prepare driver dispatch copy."
        : !dispatchReleaseDriverJobLinkReady
          ? "Prepare driver job link."
          : driverAcknowledgementMessage
            ? "Monitor manual driver acknowledgement."
            : "Mark ready locally, then contact driver manually.";
  const driverAcknowledgementItems: DispatchReleaseChecklistItem[] = [
    {
      detail: dispatchReleaseDriverName ? dispatchReleaseDriverName : "Driver not assigned.",
      key: "driver-assigned",
      label: "Driver assigned",
      state: dispatchReleaseDriverName ? "ready" : "needs-action",
    },
    {
      detail: dispatchReleaseDriverContact ? "Contact available." : "Driver contact missing.",
      key: "driver-contact",
      label: "Driver contact available",
      state: dispatchReleaseDriverContact ? "ready" : "needs-action",
    },
    {
      detail: dispatchReleaseDriverDispatchReady ? "Dispatch copy prepared." : "Dispatch copy needs review.",
      key: "dispatch-copy",
      label: "Dispatch copy prepared",
      state: dispatchReleaseDriverDispatchReady ? "ready" : "needs-action",
    },
    {
      detail: dispatchReleaseDriverJobLinkReady ? "Driver job link prepared." : "Driver job link not prepared.",
      key: "driver-job-link",
      label: "Driver job link prepared",
      state: dispatchReleaseDriverJobLinkReady ? "ready" : "needs-action",
    },
    {
      detail: driverAcknowledgementLocalStatus,
      key: "acknowledgement-local-status",
      label: "Acknowledgement local status",
      state: driverAcknowledgementCoreReady ? "ready" : "needs-action",
    },
    {
      detail: driverAcknowledgementNextAction,
      key: "next-dispatcher-action",
      label: "Next dispatcher action",
      state: driverAcknowledgementCoreReady ? "ready" : "needs-action",
    },
  ];
  const driverAcknowledgementFollowUpStatusLabel =
    driverAcknowledgementFollowUpStatus === "acknowledged"
      ? "Acknowledged locally"
      : driverAcknowledgementFollowUpStatus === "needs-call"
        ? "No response / needs call"
        : "Acknowledgement pending";
  const driverAcknowledgementFollowUpNextAction = !driverAcknowledgementCoreReady
    ? "Complete readiness first."
    : driverAcknowledgementFollowUpStatus === "acknowledged"
      ? "Monitor trip after local acknowledgement."
      : driverAcknowledgementFollowUpStatus === "needs-call"
        ? "Call driver; escalate if no response."
        : "Request acknowledgement, then update outcome.";
  const driverAcknowledgementFollowUpOptions: {
    label: string;
    value: DriverAcknowledgementFollowUpStatus;
  }[] = [
    { label: "Pending", value: "pending" },
    { label: "Acknowledged", value: "acknowledged" },
    { label: "Needs Call", value: "needs-call" },
  ];
  const driverAcknowledgementFollowUpItems: DispatchReleaseChecklistItem[] = [
    {
      detail:
        driverAcknowledgementFollowUpStatus === "pending"
          ? "Waiting for acknowledgement."
          : "No longer current.",
      key: "acknowledgement-pending",
      label: "Acknowledgement pending",
      state: driverAcknowledgementFollowUpStatus === "pending" ? "needs-action" : "ready",
    },
    {
      detail:
        driverAcknowledgementFollowUpStatus === "acknowledged"
          ? "Acknowledged locally."
          : "Not acknowledged yet.",
      key: "acknowledged-locally",
      label: "Acknowledged locally",
      state: driverAcknowledgementFollowUpStatus === "acknowledged" ? "ready" : "needs-action",
    },
    {
      detail:
        driverAcknowledgementFollowUpStatus === "needs-call"
          ? "Call needed."
          : "No call flag.",
      key: "no-response-needs-call",
      label: "No response / needs call",
      state: driverAcknowledgementFollowUpStatus === "needs-call" ? "needs-action" : "ready",
    },
    {
      detail: driverAcknowledgementFollowUpNextAction,
      key: "next-dispatcher-action",
      label: "Next dispatcher action",
      state:
        driverAcknowledgementCoreReady && driverAcknowledgementFollowUpStatus === "acknowledged"
          ? "ready"
          : "needs-action",
    },
    {
      detail: `${driverAcknowledgementFollowUpStatusLabel}. ${
        clean(driverAcknowledgementFollowUpNote) || "No local note."
      }`,
      key: "local-follow-up-note",
      label: "Local follow-up note/status",
      state: driverAcknowledgementFollowUpStatus === "acknowledged" ? "ready" : "needs-action",
    },
  ];
  const dayOfTripDriverAcknowledged = driverAcknowledgementFollowUpStatus === "acknowledged";
  const dayOfTripNoResponse =
    driverAcknowledgementFollowUpStatus === "needs-call" ||
    dayOfTripDispatchMonitorStatus === "needs-call";
  const dayOfTripDispatchMonitorStatusLabel =
    dayOfTripDispatchMonitorStatus === "needs-call"
      ? "No response / needs call"
      : dayOfTripDispatchMonitorStatus === "completed"
        ? "Completed"
        : dayOfTripDispatchMonitorStatus === "pob"
          ? "POB"
          : dayOfTripDispatchMonitorStatus === "ots"
            ? "OTS"
            : dayOfTripDispatchMonitorStatus === "otw"
              ? "OTW"
              : "Reminder due";
  const dayOfTripDispatchMonitorNextAction = dayOfTripNoResponse
    ? "Call driver; escalate if no response."
    : !dayOfTripDriverAcknowledged
      ? "Confirm driver acknowledgement before day-of-trip progress."
      : dayOfTripDispatchMonitorStatus === "completed"
        ? "Close trip locally after staff review."
        : dayOfTripDispatchMonitorStatus === "pob"
          ? "Watch for manual completion update."
          : dayOfTripDispatchMonitorStatus === "ots"
            ? "Watch for manual POB update."
            : dayOfTripDispatchMonitorStatus === "otw"
              ? "Watch for manual OTS update."
              : "Manual reminder due; update progress after driver reply.";
  const dayOfTripDispatchMonitorOptions: {
    label: string;
    value: DayOfTripDispatchMonitorStatus;
  }[] = [
    { label: "Reminder Due", value: "reminder-due" },
    { label: "OTW", value: "otw" },
    { label: "OTS", value: "ots" },
    { label: "POB", value: "pob" },
    { label: "Completed", value: "completed" },
    { label: "Needs Call", value: "needs-call" },
  ];
  const dayOfTripProgressReached = (status: DayOfTripDispatchMonitorStatus) => {
    const order: DayOfTripDispatchMonitorStatus[] = ["otw", "ots", "pob", "completed"];
    const currentIndex = order.indexOf(dayOfTripDispatchMonitorStatus);
    const statusIndex = order.indexOf(status);

    return currentIndex >= 0 && statusIndex >= 0 && currentIndex >= statusIndex;
  };
  const dayOfTripDispatchMonitorItems: DispatchReleaseChecklistItem[] = [
    {
      detail: dayOfTripDriverAcknowledged ? "Acknowledged locally." : "Not acknowledged locally.",
      key: "driver-acknowledged",
      label: "Driver acknowledged",
      state: dayOfTripDriverAcknowledged ? "ready" : "needs-action",
    },
    {
      detail:
        dayOfTripDispatchMonitorStatus === "reminder-due"
          ? "Manual reminder due."
          : "Reminder cleared locally.",
      key: "reminder-due",
      label: "Reminder due",
      state: dayOfTripDispatchMonitorStatus === "reminder-due" ? "needs-action" : "ready",
    },
    {
      detail: dayOfTripProgressReached("otw") ? "Marked OTW locally." : "Not marked OTW locally.",
      key: "otw",
      label: "OTW",
      state: dayOfTripProgressReached("otw") ? "ready" : "needs-action",
    },
    {
      detail: dayOfTripProgressReached("ots") ? "Marked OTS locally." : "Not marked OTS locally.",
      key: "ots",
      label: "OTS",
      state: dayOfTripProgressReached("ots") ? "ready" : "needs-action",
    },
    {
      detail: dayOfTripProgressReached("pob") ? "Marked POB locally." : "Not marked POB locally.",
      key: "pob",
      label: "POB",
      state: dayOfTripProgressReached("pob") ? "ready" : "needs-action",
    },
    {
      detail:
        dayOfTripDispatchMonitorStatus === "completed"
          ? "Marked completed locally."
          : "Not completed locally.",
      key: "completed",
      label: "Completed",
      state: dayOfTripDispatchMonitorStatus === "completed" ? "ready" : "needs-action",
    },
    {
      detail: dayOfTripNoResponse ? "Call needed." : "No call flag.",
      key: "no-response-needs-call",
      label: "No response / needs call",
      state: dayOfTripNoResponse ? "needs-action" : "ready",
    },
    {
      detail: dayOfTripDispatchMonitorNextAction,
      key: "next-dispatcher-action",
      label: "Next dispatcher action",
      state: dayOfTripDispatchMonitorStatus === "completed" ? "ready" : "needs-action",
    },
  ];
  const dayOfTripExceptionEscalationClosed =
    dayOfTripExceptionEscalationStatus === "closed-locally";
  const dayOfTripExceptionDriverNoResponse =
    !dayOfTripExceptionEscalationClosed &&
    (dayOfTripNoResponse || dayOfTripExceptionEscalationStatus === "driver-no-response");
  const dayOfTripExceptionReminderDue =
    !dayOfTripExceptionEscalationClosed &&
    (dayOfTripDispatchMonitorStatus === "reminder-due" ||
      dayOfTripExceptionEscalationStatus === "late-reminder-due");
  const dayOfTripExceptionNeedsDispatcherCall =
    !dayOfTripExceptionEscalationClosed &&
    (dayOfTripExceptionEscalationStatus === "dispatcher-call" ||
      dayOfTripExceptionDriverNoResponse ||
      dayOfTripExceptionReminderDue);
  const dayOfTripExceptionReplacementMayBeNeeded =
    !dayOfTripExceptionEscalationClosed &&
    (dayOfTripExceptionEscalationStatus === "replacement-review" ||
      dayOfTripExceptionEscalationStatus === "driver-no-response");
  const dayOfTripExceptionCustomerUpdateMayBeNeeded =
    !dayOfTripExceptionEscalationClosed &&
    (dayOfTripExceptionEscalationStatus === "customer-update" ||
      dayOfTripExceptionEscalationStatus === "replacement-review");
  const dayOfTripExceptionEscalationStatusLabel =
    dayOfTripExceptionEscalationStatus === "closed-locally"
      ? "Closed locally"
      : dayOfTripExceptionEscalationStatus === "customer-update"
        ? "Customer update may be needed"
        : dayOfTripExceptionEscalationStatus === "replacement-review"
          ? "Replacement driver may be needed"
          : dayOfTripExceptionEscalationStatus === "dispatcher-call"
            ? "Needs dispatcher call"
            : dayOfTripExceptionEscalationStatus === "driver-no-response"
              ? "Driver no response"
              : "Driver late / reminder due";
  const dayOfTripExceptionEscalationOptions: {
    label: string;
    value: DayOfTripExceptionEscalationStatus;
  }[] = [
    { label: "No Response", value: "driver-no-response" },
    { label: "Late Reminder", value: "late-reminder-due" },
    { label: "Call Needed", value: "dispatcher-call" },
    { label: "Replacement", value: "replacement-review" },
    { label: "Customer Update", value: "customer-update" },
    { label: "Closed", value: "closed-locally" },
  ];
  const dayOfTripExceptionEscalationNextAction = dayOfTripExceptionEscalationClosed
    ? "No open escalation; keep the local note for staff handoff."
    : dayOfTripExceptionCustomerUpdateMayBeNeeded
      ? "Prepare local customer update wording after dispatcher review."
      : dayOfTripExceptionReplacementMayBeNeeded
        ? "Check backup driver options locally and call dispatcher lead."
        : dayOfTripExceptionNeedsDispatcherCall
          ? "Call driver and record the result in the local escalation note."
          : "Monitor progress and keep the local escalation note current.";
  const dayOfTripExceptionEscalationItems: DispatchReleaseChecklistItem[] = [
    {
      detail: dayOfTripExceptionDriverNoResponse ? "No response flag is open." : "No no-response flag.",
      key: "driver-no-response",
      label: "Driver no response",
      state: dayOfTripExceptionDriverNoResponse ? "needs-action" : "ready",
    },
    {
      detail: dayOfTripExceptionReminderDue
        ? "Driver late / reminder due locally."
        : "No late/reminder due flag.",
      key: "driver-late-reminder-due",
      label: "Driver late / reminder due",
      state: dayOfTripExceptionReminderDue ? "needs-action" : "ready",
    },
    {
      detail: dayOfTripExceptionNeedsDispatcherCall
        ? "Dispatcher call needed."
        : "No dispatcher call flag.",
      key: "needs-dispatcher-call",
      label: "Needs dispatcher call",
      state: dayOfTripExceptionNeedsDispatcherCall ? "needs-action" : "ready",
    },
    {
      detail: dayOfTripExceptionReplacementMayBeNeeded
        ? "Review backup driver locally."
        : "No replacement flag.",
      key: "replacement-driver-may-be-needed",
      label: "Replacement driver may be needed",
      state: dayOfTripExceptionReplacementMayBeNeeded ? "needs-action" : "ready",
    },
    {
      detail: dayOfTripExceptionCustomerUpdateMayBeNeeded
        ? "Prepare customer update locally."
        : "No customer update flag.",
      key: "customer-update-may-be-needed",
      label: "Customer update may be needed",
      state: dayOfTripExceptionCustomerUpdateMayBeNeeded ? "needs-action" : "ready",
    },
    {
      detail: dayOfTripExceptionEscalationNextAction,
      key: "next-escalation-action",
      label: "Next escalation action",
      state: dayOfTripExceptionEscalationClosed ? "ready" : "needs-action",
    },
    {
      detail: `${dayOfTripExceptionEscalationStatusLabel}. ${
        clean(dayOfTripExceptionEscalationNote) || "No local note."
      }`,
      key: "local-escalation-note-status",
      label: "Local escalation note/status",
      state: dayOfTripExceptionEscalationClosed ? "ready" : "needs-action",
    },
  ];
  const dispatchRecoveryReplacementStatusLabel =
    dispatchRecoveryReplacementStatus === "ready-locally"
      ? "Ready locally"
      : dispatchRecoveryReplacementStatus === "job-link-ready"
        ? "New driver job link ready"
        : dispatchRecoveryReplacementStatus === "copy-ready"
          ? "Recovery copy ready"
          : dispatchRecoveryReplacementStatus === "vehicle-reviewed"
            ? "Replacement vehicle reviewed"
            : dispatchRecoveryReplacementStatus === "driver-reviewed"
              ? "Replacement driver reviewed"
              : "Recovery review needed";
  const dispatchRecoveryReplacementOptions: {
    label: string;
    value: DispatchRecoveryReplacementStatus;
  }[] = [
    { label: "Review Needed", value: "review-needed" },
    { label: "Driver Reviewed", value: "driver-reviewed" },
    { label: "Vehicle Reviewed", value: "vehicle-reviewed" },
    { label: "Copy Ready", value: "copy-ready" },
    { label: "Job Link Ready", value: "job-link-ready" },
    { label: "Ready Locally", value: "ready-locally" },
  ];
  const dispatchRecoveryReplacementReached = (status: DispatchRecoveryReplacementStatus) => {
    const order: DispatchRecoveryReplacementStatus[] = [
      "driver-reviewed",
      "vehicle-reviewed",
      "copy-ready",
      "job-link-ready",
      "ready-locally",
    ];
    const currentIndex = order.indexOf(dispatchRecoveryReplacementStatus);
    const statusIndex = order.indexOf(status);

    return currentIndex >= 0 && statusIndex >= 0 && currentIndex >= statusIndex;
  };
  const dispatchRecoveryReplacementDriverReviewed =
    dispatchRecoveryReplacementReached("driver-reviewed") ||
    (Boolean(clean(replacementDriverDraft.driverName)) &&
      Boolean(clean(replacementDriverDraft.driverContact)));
  const dispatchRecoveryReplacementVehicleReviewed =
    dispatchRecoveryReplacementReached("vehicle-reviewed") ||
    Boolean(clean(replacementDriverDraft.carPlate) || clean(replacementDriverDraft.vehicleModel));
  const dispatchRecoveryReplacementCustomerUpdateReady =
    dispatchRecoveryReplacementReached("copy-ready") || !dayOfTripExceptionCustomerUpdateMayBeNeeded;
  const dispatchRecoveryReplacementDispatchCopyReady =
    dispatchRecoveryReplacementReached("copy-ready") &&
    dispatchRecoveryReplacementDriverReviewed &&
    dispatchRecoveryReplacementVehicleReviewed;
  const dispatchRecoveryReplacementJobLinkReady =
    dispatchRecoveryReplacementReached("job-link-ready");
  const dispatchRecoveryReplacementReadyLocally =
    dispatchRecoveryReplacementStatus === "ready-locally";
  const dispatchRecoveryReplacementNextAction = dispatchRecoveryReplacementReadyLocally
    ? "Recovery handoff ready locally; keep dispatcher note current."
    : !dispatchRecoveryReplacementDriverReviewed
      ? "Review replacement driver details locally."
      : !dispatchRecoveryReplacementVehicleReviewed
        ? "Review replacement vehicle details locally."
        : !dispatchRecoveryReplacementDispatchCopyReady
          ? "Update customer and driver dispatch copy locally."
          : !dispatchRecoveryReplacementJobLinkReady
            ? "Prepare the new driver job link locally."
            : "Mark recovery ready locally after dispatcher review.";
  const dispatchRecoveryReplacementItems: DispatchReleaseChecklistItem[] = [
    {
      detail: dispatchRecoveryReplacementDriverReviewed
        ? "Replacement driver reviewed locally."
        : "Replacement driver not reviewed locally.",
      key: "replacement-driver-review",
      label: "Replacement driver review",
      state: dispatchRecoveryReplacementDriverReviewed ? "ready" : "needs-action",
    },
    {
      detail: dispatchRecoveryReplacementVehicleReviewed
        ? "Replacement vehicle reviewed locally."
        : "Replacement vehicle not reviewed locally.",
      key: "replacement-vehicle-review",
      label: "Replacement vehicle review",
      state: dispatchRecoveryReplacementVehicleReviewed ? "ready" : "needs-action",
    },
    {
      detail: dayOfTripExceptionCustomerUpdateMayBeNeeded
        ? dispatchRecoveryReplacementCustomerUpdateReady
          ? "Customer update copy ready locally."
          : "Customer update still needs local copy review."
        : "No customer update flag.",
      key: "customer-update-readiness",
      label: "Customer update readiness",
      state: dispatchRecoveryReplacementCustomerUpdateReady ? "ready" : "needs-action",
    },
    {
      detail: dispatchRecoveryReplacementDispatchCopyReady
        ? "Driver dispatch copy update ready locally."
        : "Update driver dispatch copy after replacement review.",
      key: "dispatch-copy-update-readiness",
      label: "Dispatch copy update readiness",
      state: dispatchRecoveryReplacementDispatchCopyReady ? "ready" : "needs-action",
    },
    {
      detail: dispatchRecoveryReplacementJobLinkReady
        ? "New driver job link prepared locally."
        : "New driver job link not prepared locally.",
      key: "new-driver-job-link-readiness",
      label: "New driver job link readiness",
      state: dispatchRecoveryReplacementJobLinkReady ? "ready" : "needs-action",
    },
    {
      detail: dispatchRecoveryReplacementNextAction,
      key: "next-recovery-action",
      label: "Next recovery action",
      state: dispatchRecoveryReplacementReadyLocally ? "ready" : "needs-action",
    },
    {
      detail: `${dispatchRecoveryReplacementStatusLabel}. ${
        clean(dispatchRecoveryReplacementNote) || "No local note."
      }`,
      key: "local-recovery-note-status",
      label: "Local recovery note/status",
      state: dispatchRecoveryReplacementReadyLocally ? "ready" : "needs-action",
    },
  ];
  const postRecoveryUpdateStatusLabel =
    postRecoveryUpdateStatus === "ready-locally"
      ? "Post-recovery updates ready"
      : postRecoveryUpdateStatus === "eta-ready"
        ? "Customer ETA/update ready"
        : postRecoveryUpdateStatus === "job-link-ready"
          ? "New driver job link ready"
          : postRecoveryUpdateStatus === "original-driver-reviewed"
            ? "Original driver follow-up reviewed"
            : postRecoveryUpdateStatus === "driver-copy-reviewed"
              ? "Replacement driver copy reviewed"
              : postRecoveryUpdateStatus === "customer-copy-reviewed"
                ? "Customer update copy reviewed"
                : "Post-recovery update review needed";
  const postRecoveryUpdateOptions: {
    label: string;
    value: PostRecoveryUpdateStatus;
  }[] = [
    { label: "Review Needed", value: "review-needed" },
    { label: "Customer Copy", value: "customer-copy-reviewed" },
    { label: "Driver Copy", value: "driver-copy-reviewed" },
    { label: "Original Driver", value: "original-driver-reviewed" },
    { label: "Job Link Ready", value: "job-link-ready" },
    { label: "ETA Ready", value: "eta-ready" },
    { label: "Ready Locally", value: "ready-locally" },
  ];
  const postRecoveryUpdateReached = (status: PostRecoveryUpdateStatus) => {
    const order: PostRecoveryUpdateStatus[] = [
      "customer-copy-reviewed",
      "driver-copy-reviewed",
      "original-driver-reviewed",
      "job-link-ready",
      "eta-ready",
      "ready-locally",
    ];
    const currentIndex = order.indexOf(postRecoveryUpdateStatus);
    const statusIndex = order.indexOf(status);

    return currentIndex >= 0 && statusIndex >= 0 && currentIndex >= statusIndex;
  };
  const postRecoveryCustomerUpdateCopyReviewed =
    postRecoveryUpdateReached("customer-copy-reviewed");
  const postRecoveryReplacementDriverDispatchCopyReviewed =
    postRecoveryUpdateReached("driver-copy-reviewed") ||
    (dispatchRecoveryReplacementReadyLocally && dispatchRecoveryReplacementDispatchCopyReady);
  const postRecoveryOriginalDriverFollowUpReviewed =
    postRecoveryUpdateReached("original-driver-reviewed") || dayOfTripExceptionEscalationClosed;
  const postRecoveryNewDriverJobLinkReady =
    postRecoveryUpdateReached("job-link-ready") || dispatchRecoveryReplacementJobLinkReady;
  const postRecoveryCustomerEtaUpdateReady = postRecoveryUpdateReached("eta-ready");
  const postRecoveryUpdateReadyLocally = postRecoveryUpdateStatus === "ready-locally";
  const postRecoveryUpdateNextAction = postRecoveryUpdateReadyLocally
    ? "Post-recovery update handoff ready locally; keep dispatcher note current."
    : !postRecoveryCustomerUpdateCopyReviewed
      ? "Review customer update copy locally."
      : !postRecoveryReplacementDriverDispatchCopyReviewed
        ? "Review replacement driver dispatch copy locally."
        : !postRecoveryOriginalDriverFollowUpReviewed
          ? "Review original driver follow-up locally."
          : !postRecoveryNewDriverJobLinkReady
            ? "Prepare new driver job link readiness locally."
            : !postRecoveryCustomerEtaUpdateReady
              ? "Review customer ETA/update status locally."
              : "Mark post-recovery updates ready locally.";
  const postRecoveryUpdateItems: DispatchReleaseChecklistItem[] = [
    {
      detail: postRecoveryCustomerUpdateCopyReviewed
        ? "Customer update copy reviewed locally."
        : "Customer update copy not reviewed locally.",
      key: "customer-update-copy-reviewed",
      label: "Customer update copy reviewed",
      state: postRecoveryCustomerUpdateCopyReviewed ? "ready" : "needs-action",
    },
    {
      detail: postRecoveryReplacementDriverDispatchCopyReviewed
        ? "Replacement driver dispatch copy reviewed locally."
        : "Replacement driver dispatch copy not reviewed locally.",
      key: "replacement-driver-dispatch-copy-reviewed",
      label: "Replacement driver dispatch copy reviewed",
      state: postRecoveryReplacementDriverDispatchCopyReviewed ? "ready" : "needs-action",
    },
    {
      detail: postRecoveryOriginalDriverFollowUpReviewed
        ? "Original driver follow-up reviewed locally."
        : "Original driver follow-up not reviewed locally.",
      key: "original-driver-follow-up-reviewed",
      label: "Original driver follow-up reviewed",
      state: postRecoveryOriginalDriverFollowUpReviewed ? "ready" : "needs-action",
    },
    {
      detail: postRecoveryNewDriverJobLinkReady
        ? "New driver job link ready locally."
        : "New driver job link not ready locally.",
      key: "new-driver-job-link-readiness",
      label: "New driver job link readiness",
      state: postRecoveryNewDriverJobLinkReady ? "ready" : "needs-action",
    },
    {
      detail: postRecoveryCustomerEtaUpdateReady
        ? "Customer ETA/update status reviewed locally."
        : "Customer ETA/update status not reviewed locally.",
      key: "customer-eta-update-status",
      label: "Customer ETA/update status",
      state: postRecoveryCustomerEtaUpdateReady ? "ready" : "needs-action",
    },
    {
      detail: postRecoveryUpdateNextAction,
      key: "next-dispatcher-action",
      label: "Next dispatcher action",
      state: postRecoveryUpdateReadyLocally ? "ready" : "needs-action",
    },
    {
      detail: `${postRecoveryUpdateStatusLabel}. ${
        clean(postRecoveryUpdateNote) || "No local note."
      }`,
      key: "local-update-note-status",
      label: "Local update note/status",
      state: postRecoveryUpdateReadyLocally ? "ready" : "needs-action",
    },
  ];
  const dayOfTripCompletionHandoffStatusLabel =
    dayOfTripCompletionHandoffStatus === "ready-locally"
      ? "Completion handoff ready"
      : dayOfTripCompletionHandoffStatus === "exception-reviewed"
        ? "Exception/resolution reviewed"
        : dayOfTripCompletionHandoffStatus === "customer-closeout-ready"
          ? "Customer closeout update ready"
          : dayOfTripCompletionHandoffStatus === "driver-completed"
            ? "Driver completion reviewed"
            : dayOfTripCompletionHandoffStatus === "trip-completed"
              ? "Final trip status reviewed"
              : "Completion handoff review needed";
  const dayOfTripCompletionHandoffOptions: {
    label: string;
    value: DayOfTripCompletionHandoffStatus;
  }[] = [
    { label: "Review Needed", value: "review-needed" },
    { label: "Trip Complete", value: "trip-completed" },
    { label: "Driver Complete", value: "driver-completed" },
    { label: "Customer Closeout", value: "customer-closeout-ready" },
    { label: "Exception Reviewed", value: "exception-reviewed" },
    { label: "Ready Locally", value: "ready-locally" },
  ];
  const dayOfTripCompletionHandoffReached = (status: DayOfTripCompletionHandoffStatus) => {
    const order: DayOfTripCompletionHandoffStatus[] = [
      "trip-completed",
      "driver-completed",
      "customer-closeout-ready",
      "exception-reviewed",
      "ready-locally",
    ];
    const currentIndex = order.indexOf(dayOfTripCompletionHandoffStatus);
    const statusIndex = order.indexOf(status);

    return currentIndex >= 0 && statusIndex >= 0 && currentIndex >= statusIndex;
  };
  const dayOfTripCompletionFinalTripStatusReady =
    dayOfTripCompletionHandoffReached("trip-completed") ||
    dayOfTripDispatchMonitorStatus === "completed";
  const dayOfTripCompletionDriverStatusReady =
    dayOfTripCompletionHandoffReached("driver-completed") ||
    dayOfTripDispatchMonitorStatus === "completed";
  const dayOfTripCompletionCustomerCloseoutReady =
    dayOfTripCompletionHandoffReached("customer-closeout-ready") ||
    postRecoveryUpdateReadyLocally;
  const dayOfTripCompletionExceptionResolutionReviewed =
    dayOfTripCompletionHandoffReached("exception-reviewed") ||
    dayOfTripExceptionEscalationClosed;
  const dayOfTripCompletionHandoffReadyLocally =
    dayOfTripCompletionHandoffStatus === "ready-locally";
  const dayOfTripCompletionHandoffNextAction = dayOfTripCompletionHandoffReadyLocally
    ? "Completion handoff ready locally; keep closeout note current."
    : !dayOfTripCompletionFinalTripStatusReady
      ? "Confirm final trip status locally."
      : !dayOfTripCompletionDriverStatusReady
        ? "Review driver completion status locally."
        : !dayOfTripCompletionCustomerCloseoutReady
          ? "Review customer closeout update readiness locally."
          : !dayOfTripCompletionExceptionResolutionReviewed
            ? "Review exception/resolution note locally."
            : "Mark completion handoff ready locally.";
  const dayOfTripCompletionHandoffItems: DispatchReleaseChecklistItem[] = [
    {
      detail: dayOfTripCompletionFinalTripStatusReady
        ? "Final trip status reviewed locally."
        : "Final trip status not reviewed locally.",
      key: "final-trip-status",
      label: "Final trip status",
      state: dayOfTripCompletionFinalTripStatusReady ? "ready" : "needs-action",
    },
    {
      detail: dayOfTripCompletionDriverStatusReady
        ? "Driver completion status reviewed locally."
        : "Driver completion status not reviewed locally.",
      key: "driver-completion-status",
      label: "Driver completion status",
      state: dayOfTripCompletionDriverStatusReady ? "ready" : "needs-action",
    },
    {
      detail: dayOfTripCompletionCustomerCloseoutReady
        ? "Customer closeout update ready locally."
        : "Customer closeout update not reviewed locally.",
      key: "customer-closeout-update-readiness",
      label: "Customer closeout update readiness",
      state: dayOfTripCompletionCustomerCloseoutReady ? "ready" : "needs-action",
    },
    {
      detail: dayOfTripCompletionExceptionResolutionReviewed
        ? "Exception/resolution note reviewed locally."
        : "Exception/resolution note not reviewed locally.",
      key: "exception-resolution-note-reviewed",
      label: "Exception/resolution note reviewed",
      state: dayOfTripCompletionExceptionResolutionReviewed ? "ready" : "needs-action",
    },
    {
      detail: dayOfTripCompletionHandoffNextAction,
      key: "next-admin-closeout-action",
      label: "Next admin closeout action",
      state: dayOfTripCompletionHandoffReadyLocally ? "ready" : "needs-action",
    },
    {
      detail: `${dayOfTripCompletionHandoffStatusLabel}. ${
        clean(dayOfTripCompletionHandoffNote) || "No local note."
      }`,
      key: "local-completion-note-status",
      label: "Local completion note/status",
      state: dayOfTripCompletionHandoffReadyLocally ? "ready" : "needs-action",
    },
  ];
  const completedTripCloseoutReviewStatusLabel =
    completedTripCloseoutReviewStatus === "ready-locally"
      ? "Completed trip closeout ready"
      : completedTripCloseoutReviewStatus === "billing-note-reviewed"
        ? "Billing-readiness note reviewed"
        : completedTripCloseoutReviewStatus === "exception-reviewed"
          ? "Exception/resolution reviewed"
          : completedTripCloseoutReviewStatus === "customer-closeout-reviewed"
            ? "Customer closeout reviewed"
            : completedTripCloseoutReviewStatus === "driver-reviewed"
              ? "Driver completion reviewed"
              : completedTripCloseoutReviewStatus === "trip-completed"
                ? "Trip completion reviewed"
                : "Completed trip closeout review needed";
  const completedTripCloseoutReviewOptions: {
    label: string;
    value: CompletedTripCloseoutReviewStatus;
  }[] = [
    { label: "Review Needed", value: "review-needed" },
    { label: "Trip Complete", value: "trip-completed" },
    { label: "Driver Reviewed", value: "driver-reviewed" },
    { label: "Customer Closeout", value: "customer-closeout-reviewed" },
    { label: "Exception Reviewed", value: "exception-reviewed" },
    { label: "Billing Note", value: "billing-note-reviewed" },
    { label: "Ready Locally", value: "ready-locally" },
  ];
  const completedTripCloseoutReviewReached = (status: CompletedTripCloseoutReviewStatus) => {
    const order: CompletedTripCloseoutReviewStatus[] = [
      "trip-completed",
      "driver-reviewed",
      "customer-closeout-reviewed",
      "exception-reviewed",
      "billing-note-reviewed",
      "ready-locally",
    ];
    const currentIndex = order.indexOf(completedTripCloseoutReviewStatus);
    const statusIndex = order.indexOf(status);

    return currentIndex >= 0 && statusIndex >= 0 && currentIndex >= statusIndex;
  };
  const completedTripCloseoutTripCompleted =
    completedTripCloseoutReviewReached("trip-completed") ||
    dayOfTripCompletionFinalTripStatusReady;
  const completedTripCloseoutDriverCompletionReviewed =
    completedTripCloseoutReviewReached("driver-reviewed") ||
    dayOfTripCompletionDriverStatusReady;
  const completedTripCloseoutCustomerCloseoutReviewed =
    completedTripCloseoutReviewReached("customer-closeout-reviewed") ||
    dayOfTripCompletionCustomerCloseoutReady;
  const completedTripCloseoutExceptionResolutionReviewed =
    completedTripCloseoutReviewReached("exception-reviewed") ||
    dayOfTripCompletionExceptionResolutionReviewed;
  const completedTripCloseoutBillingReadinessNoteReviewed =
    completedTripCloseoutReviewReached("billing-note-reviewed");
  const completedTripCloseoutReviewReadyLocally =
    completedTripCloseoutReviewStatus === "ready-locally";
  const completedTripCloseoutReviewNextAction = completedTripCloseoutReviewReadyLocally
    ? "Completed trip closeout ready locally; keep closeout note current."
    : !completedTripCloseoutTripCompleted
      ? "Confirm trip completion locally."
      : !completedTripCloseoutDriverCompletionReviewed
        ? "Review driver completion locally."
        : !completedTripCloseoutCustomerCloseoutReviewed
          ? "Review customer closeout locally."
          : !completedTripCloseoutExceptionResolutionReviewed
            ? "Review exception/resolution locally."
            : !completedTripCloseoutBillingReadinessNoteReviewed
              ? "Review billing-readiness note locally."
              : "Mark completed trip closeout ready locally.";
  const completedTripCloseoutReviewItems: DispatchReleaseChecklistItem[] = [
    {
      detail: completedTripCloseoutTripCompleted
        ? "Trip completion reviewed locally."
        : "Trip completion not reviewed locally.",
      key: "trip-completed",
      label: "Trip completed",
      state: completedTripCloseoutTripCompleted ? "ready" : "needs-action",
    },
    {
      detail: completedTripCloseoutDriverCompletionReviewed
        ? "Driver completion reviewed locally."
        : "Driver completion not reviewed locally.",
      key: "driver-completion-reviewed",
      label: "Driver completion reviewed",
      state: completedTripCloseoutDriverCompletionReviewed ? "ready" : "needs-action",
    },
    {
      detail: completedTripCloseoutCustomerCloseoutReviewed
        ? "Customer closeout reviewed locally."
        : "Customer closeout not reviewed locally.",
      key: "customer-closeout-reviewed",
      label: "Customer closeout reviewed",
      state: completedTripCloseoutCustomerCloseoutReviewed ? "ready" : "needs-action",
    },
    {
      detail: completedTripCloseoutExceptionResolutionReviewed
        ? "Exception/resolution reviewed locally."
        : "Exception/resolution not reviewed locally.",
      key: "exception-resolution-reviewed",
      label: "Exception/resolution reviewed",
      state: completedTripCloseoutExceptionResolutionReviewed ? "ready" : "needs-action",
    },
    {
      detail: completedTripCloseoutBillingReadinessNoteReviewed
        ? "Billing-readiness note reviewed locally."
        : "Billing-readiness note not reviewed locally.",
      key: "billing-readiness-note-reviewed",
      label: "Billing-readiness note reviewed",
      state: completedTripCloseoutBillingReadinessNoteReviewed ? "ready" : "needs-action",
    },
    {
      detail: completedTripCloseoutReviewNextAction,
      key: "next-admin-closeout-action",
      label: "Next admin closeout action",
      state: completedTripCloseoutReviewReadyLocally ? "ready" : "needs-action",
    },
    {
      detail: `${completedTripCloseoutReviewStatusLabel}. ${
        clean(completedTripCloseoutReviewNote) || "No local note."
      }`,
      key: "local-closeout-note-status",
      label: "Local closeout note/status",
      state: completedTripCloseoutReviewReadyLocally ? "ready" : "needs-action",
    },
  ];
  const closeoutToBillingPreparationReviewStatusLabel =
    closeoutToBillingPreparationReviewStatus === "ready-locally"
      ? "Billing preparation review ready"
      : closeoutToBillingPreparationReviewStatus === "billing-note-reviewed"
        ? "Billing note reviewed"
        : closeoutToBillingPreparationReviewStatus === "extra-charges-reviewed"
          ? "Extra charges review checked"
          : closeoutToBillingPreparationReviewStatus === "details-reviewed"
            ? "Trip/service details reviewed"
            : closeoutToBillingPreparationReviewStatus === "account-ready"
              ? "Customer/account billing readiness reviewed"
              : closeoutToBillingPreparationReviewStatus === "closeout-reviewed"
                ? "Closeout reviewed"
                : "Closeout to billing preparation review needed";
  const closeoutToBillingPreparationReviewOptions: {
    label: string;
    value: CloseoutToBillingPreparationReviewStatus;
  }[] = [
    { label: "Review Needed", value: "review-needed" },
    { label: "Closeout Reviewed", value: "closeout-reviewed" },
    { label: "Account Ready", value: "account-ready" },
    { label: "Trip Details", value: "details-reviewed" },
    { label: "Extra Charges", value: "extra-charges-reviewed" },
    { label: "Billing Note", value: "billing-note-reviewed" },
    { label: "Ready Locally", value: "ready-locally" },
  ];
  const closeoutToBillingPreparationReviewReached = (
    status: CloseoutToBillingPreparationReviewStatus,
  ) => {
    const order: CloseoutToBillingPreparationReviewStatus[] = [
      "closeout-reviewed",
      "account-ready",
      "details-reviewed",
      "extra-charges-reviewed",
      "billing-note-reviewed",
      "ready-locally",
    ];
    const currentIndex = order.indexOf(closeoutToBillingPreparationReviewStatus);
    const statusIndex = order.indexOf(status);

    return currentIndex >= 0 && statusIndex >= 0 && currentIndex >= statusIndex;
  };
  const closeoutToBillingCloseoutReviewed =
    closeoutToBillingPreparationReviewReached("closeout-reviewed") ||
    completedTripCloseoutReviewReadyLocally;
  const closeoutToBillingCustomerAccountReady =
    closeoutToBillingPreparationReviewReached("account-ready");
  const closeoutToBillingTripServiceDetailsReviewed =
    closeoutToBillingPreparationReviewReached("details-reviewed") ||
    completedTripCloseoutTripCompleted;
  const closeoutToBillingExtraChargesReviewed =
    closeoutToBillingPreparationReviewReached("extra-charges-reviewed");
  const closeoutToBillingNoteReviewed =
    closeoutToBillingPreparationReviewReached("billing-note-reviewed");
  const closeoutToBillingPreparationReviewReadyLocally =
    closeoutToBillingPreparationReviewStatus === "ready-locally";
  const closeoutToBillingPreparationReviewNextAction =
    closeoutToBillingPreparationReviewReadyLocally
      ? "Billing preparation review ready locally; keep billing-prep note current."
      : !closeoutToBillingCloseoutReviewed
        ? "Review completed trip closeout locally."
        : !closeoutToBillingCustomerAccountReady
          ? "Review customer/account billing readiness locally."
          : !closeoutToBillingTripServiceDetailsReviewed
            ? "Review trip/service details locally."
            : !closeoutToBillingExtraChargesReviewed
              ? "Review extra charges need locally."
              : !closeoutToBillingNoteReviewed
                ? "Review billing note locally."
                : "Mark billing preparation review ready locally.";
  const closeoutToBillingPreparationReviewItems: DispatchReleaseChecklistItem[] = [
    {
      detail: closeoutToBillingCloseoutReviewed
        ? "Completed trip closeout reviewed locally."
        : "Completed trip closeout not reviewed locally.",
      key: "closeout-reviewed",
      label: "Closeout reviewed",
      state: closeoutToBillingCloseoutReviewed ? "ready" : "needs-action",
    },
    {
      detail: closeoutToBillingCustomerAccountReady
        ? "Customer/account billing readiness reviewed locally."
        : "Customer/account billing readiness not reviewed locally.",
      key: "customer-account-billing-readiness",
      label: "Customer/account billing readiness",
      state: closeoutToBillingCustomerAccountReady ? "ready" : "needs-action",
    },
    {
      detail: closeoutToBillingTripServiceDetailsReviewed
        ? "Trip/service details reviewed locally."
        : "Trip/service details not reviewed locally.",
      key: "trip-service-details-reviewed",
      label: "Trip/service details reviewed",
      state: closeoutToBillingTripServiceDetailsReviewed ? "ready" : "needs-action",
    },
    {
      detail: closeoutToBillingExtraChargesReviewed
        ? "Extra charges review checked locally."
        : "Extra charges review still needed locally.",
      key: "extra-charges-review-needed",
      label: "Extra charges review needed",
      state: closeoutToBillingExtraChargesReviewed ? "ready" : "needs-action",
    },
    {
      detail: closeoutToBillingNoteReviewed
        ? "Billing note reviewed locally."
        : "Billing note not reviewed locally.",
      key: "billing-note-reviewed",
      label: "Billing note reviewed",
      state: closeoutToBillingNoteReviewed ? "ready" : "needs-action",
    },
    {
      detail: closeoutToBillingPreparationReviewNextAction,
      key: "next-billing-preparation-action",
      label: "Next billing preparation action",
      state: closeoutToBillingPreparationReviewReadyLocally ? "ready" : "needs-action",
    },
    {
      detail: `${closeoutToBillingPreparationReviewStatusLabel}. ${
        clean(closeoutToBillingPreparationReviewNote) || "No local note."
      }`,
      key: "local-billing-prep-note-status",
      label: "Local billing-prep note/status",
      state: closeoutToBillingPreparationReviewReadyLocally ? "ready" : "needs-action",
    },
  ];
  const billingPreparationExceptionReviewStatusLabel =
    billingPreparationExceptionReviewStatus === "cleared-locally"
      ? "Billing prep exceptions cleared"
      : billingPreparationExceptionReviewStatus === "billing-action-required"
        ? "Billing note/action required"
        : billingPreparationExceptionReviewStatus === "disputed-waived-charges"
          ? "Disputed or waived charges flagged"
          : billingPreparationExceptionReviewStatus === "extra-charges-pending"
            ? "Extra charges pending"
            : billingPreparationExceptionReviewStatus === "details-incomplete"
              ? "Trip/service details incomplete"
              : billingPreparationExceptionReviewStatus === "missing-account"
                ? "Missing billing account"
                : "Billing preparation exception review needed";
  const billingPreparationExceptionReviewOptions: {
    label: string;
    value: BillingPreparationExceptionReviewStatus;
  }[] = [
    { label: "Review Needed", value: "review-needed" },
    { label: "Missing Account", value: "missing-account" },
    { label: "Details Missing", value: "details-incomplete" },
    { label: "Extra Charges", value: "extra-charges-pending" },
    { label: "Dispute/Waiver", value: "disputed-waived-charges" },
    { label: "Billing Action", value: "billing-action-required" },
    { label: "Cleared Locally", value: "cleared-locally" },
  ];
  const billingPreparationExceptionReviewClearedLocally =
    billingPreparationExceptionReviewStatus === "cleared-locally";
  const billingPreparationMissingBillingAccount =
    !billingPreparationExceptionReviewClearedLocally &&
    (billingPreparationExceptionReviewStatus === "missing-account" ||
      !closeoutToBillingCustomerAccountReady);
  const billingPreparationIncompleteTripServiceDetails =
    !billingPreparationExceptionReviewClearedLocally &&
    (billingPreparationExceptionReviewStatus === "details-incomplete" ||
      !closeoutToBillingTripServiceDetailsReviewed);
  const billingPreparationExtraChargesPending =
    !billingPreparationExceptionReviewClearedLocally &&
    (billingPreparationExceptionReviewStatus === "extra-charges-pending" ||
      !closeoutToBillingExtraChargesReviewed);
  const billingPreparationDisputedOrWaivedCharges =
    !billingPreparationExceptionReviewClearedLocally &&
    billingPreparationExceptionReviewStatus === "disputed-waived-charges";
  const billingPreparationBillingNoteActionRequired =
    !billingPreparationExceptionReviewClearedLocally &&
    (billingPreparationExceptionReviewStatus === "billing-action-required" ||
      !closeoutToBillingNoteReviewed);
  const billingPreparationExceptionReviewNextAction =
    billingPreparationExceptionReviewClearedLocally
      ? "Billing preparation exceptions cleared locally; keep exception note current."
      : billingPreparationMissingBillingAccount
        ? "Confirm billing account before billing preparation."
        : billingPreparationIncompleteTripServiceDetails
          ? "Complete trip/service detail review locally."
          : billingPreparationExtraChargesPending
            ? "Resolve extra charges review locally."
            : billingPreparationDisputedOrWaivedCharges
              ? "Review disputed or waived charges locally."
              : billingPreparationBillingNoteActionRequired
                ? "Review billing note/action locally."
                : "Mark billing-prep exceptions cleared locally.";
  const billingPreparationExceptionReviewItems: DispatchReleaseChecklistItem[] = [
    {
      detail: billingPreparationExceptionReviewClearedLocally
        ? "Billing account readiness cleared locally."
        : billingPreparationExceptionReviewStatus === "missing-account"
          ? "Missing billing account flagged locally."
          : billingPreparationMissingBillingAccount
            ? "Billing account readiness not confirmed locally."
            : "Billing account readiness confirmed locally.",
      key: "missing-billing-account",
      label: "Missing billing account",
      state: billingPreparationMissingBillingAccount ? "needs-action" : "ready",
    },
    {
      detail: billingPreparationExceptionReviewClearedLocally
        ? "Trip/service details cleared locally."
        : billingPreparationExceptionReviewStatus === "details-incomplete"
          ? "Incomplete trip/service details flagged locally."
          : billingPreparationIncompleteTripServiceDetails
            ? "Trip/service details not complete locally."
            : "Trip/service details confirmed locally.",
      key: "incomplete-trip-service-details",
      label: "Incomplete trip/service details",
      state: billingPreparationIncompleteTripServiceDetails ? "needs-action" : "ready",
    },
    {
      detail: billingPreparationExceptionReviewClearedLocally
        ? "Extra charges review cleared locally."
        : billingPreparationExceptionReviewStatus === "extra-charges-pending"
          ? "Extra charges pending locally."
          : billingPreparationExtraChargesPending
            ? "Extra charges review not cleared locally."
            : "Extra charges review confirmed locally.",
      key: "extra-charges-pending",
      label: "Extra charges pending",
      state: billingPreparationExtraChargesPending ? "needs-action" : "ready",
    },
    {
      detail: billingPreparationDisputedOrWaivedCharges
        ? "Disputed or waived charges flagged locally."
        : "No dispute or waiver flag recorded locally.",
      key: "disputed-waived-charges",
      label: "Disputed or waived charges",
      state: billingPreparationDisputedOrWaivedCharges ? "needs-action" : "ready",
    },
    {
      detail: billingPreparationExceptionReviewClearedLocally
        ? "Billing note/action cleared locally."
        : billingPreparationExceptionReviewStatus === "billing-action-required"
          ? "Billing note/action required locally."
          : billingPreparationBillingNoteActionRequired
            ? "Billing note/action not reviewed locally."
            : "Billing note/action reviewed locally.",
      key: "billing-note-action-required",
      label: "Billing note/action required",
      state: billingPreparationBillingNoteActionRequired ? "needs-action" : "ready",
    },
    {
      detail: billingPreparationExceptionReviewNextAction,
      key: "next-billing-prep-action",
      label: "Next billing-prep action",
      state: billingPreparationExceptionReviewClearedLocally ? "ready" : "needs-action",
    },
    {
      detail: `${billingPreparationExceptionReviewStatusLabel}. ${
        clean(billingPreparationExceptionReviewNote) || "No local exception note."
      }`,
      key: "local-exception-note-status",
      label: "Local exception note/status",
      state: billingPreparationExceptionReviewClearedLocally ? "ready" : "needs-action",
    },
  ];
  const mockMidnightChargeOverrideAutoDetected = isMockMidnightChargeDetected("22:59");
  const mockMidnightChargeOverrideDetected =
    mockMidnightChargeOverrideMode === "force-on"
      ? true
      : mockMidnightChargeOverrideMode === "force-off"
        ? false
        : mockMidnightChargeOverrideAutoDetected;
  const mockMidnightChargeOverrideStatus = mockMidnightChargeOverrideDetected
    ? "Midnight Charge shown under Extra Charges - Mock Only"
    : "No Midnight Charge shown - Mock Only";
  const showLegacyExtraChargeQaSections = false;

  return (
    <main className="min-h-screen bg-stone-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-stone-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
              Internal limousine operations
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">
              Prestige Limo Ops Dispatch
            </h1>
          </div>
          <div className="flex flex-col gap-2 sm:min-w-80">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
                <p className="text-xs text-slate-500">Saved</p>
                <p className="text-lg font-semibold">{operationalBookings.length}</p>
              </div>
              <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
                <p className="text-xs text-slate-500">Status</p>
                <p className="text-lg font-semibold">Live</p>
              </div>
              <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
                <p className="text-xs text-slate-500">Mode</p>
                <p className="text-lg font-semibold">Admin</p>
              </div>
            </div>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-900 bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              data-customers-payments-entry="true"
              href="/customers"
            >
              Customers & Payments
            </Link>
          </div>
        </header>

        <nav
          aria-label="Primary operations tabs"
          className="grid grid-cols-2 gap-2 rounded-lg border border-stone-200 bg-white p-2 shadow-sm sm:grid-cols-3 lg:grid-cols-6"
          role="tablist"
        >
          {appTabs.map((tab) => {
            const selected = activeTab === tab.id;

            return (
              <button
                aria-selected={selected}
                className={`h-10 w-full rounded-md px-3 text-sm font-semibold transition ${
                  selected
                    ? "bg-slate-950 text-white"
                    : "border border-stone-200 bg-white text-slate-700 hover:bg-stone-50"
                }`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <section
          aria-label="Admin URL access hub"
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-sm"
          data-admin-access-hub="true"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Admin Access
              </p>
              <p className="text-xs text-slate-500">Useful routes</p>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {adminAccessLinks.map((link) => (
                <Link
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-stone-200 bg-stone-50 px-2 text-center text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white"
                  data-admin-access-link={link.href}
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-label="Internal QA / Mock Workbench Archive — Mock Only"
          className="order-last rounded-lg bg-white shadow-sm ring-1 ring-slate-200"
          data-internal-qa-mock-archive="true"
          data-mock-workflow-review-group="true"
        >
          <button
            aria-expanded={isInternalQaMockArchiveOpen}
            className="m-2 flex min-h-12 w-[calc(100%-1rem)] cursor-pointer flex-col gap-1 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-white sm:flex-row sm:items-center sm:justify-between"
            data-internal-qa-mock-archive-toggle="true"
            onClick={() => setIsInternalQaMockArchiveOpen((current) => !current)}
            type="button"
          >
            <span className="font-semibold text-slate-950">
              Internal QA / Mock Workbench Archive — Mock Only
            </span>
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
              {isInternalQaMockArchiveOpen ? "Expanded" : "Collapsed by default"}
            </span>
          </button>
          {isInternalQaMockArchiveOpen ? (
            <>
          <div className="mx-2 mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold uppercase tracking-[0.08em] text-slate-500">Archive groups</p>
            <ul
              className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3"
              data-internal-qa-mock-archive-groups="true"
            >
              <li>Customer Intake / Account / Booking Review</li>
              <li>Dispatch / Driver / Fleet Readiness</li>
              <li>Route / Airport / Itinerary Readiness</li>
              <li>Customer Service Recovery / Replacement / Completion</li>
              <li>Finance / Extra Charges / Closeout</li>
              <li>Quote / Risk / SLA / Audit</li>
              <li>Legacy close-cycle / DSP / receivables / accounting QA</li>
            </ul>
            <p className="mt-2 text-[11px] leading-5">
              Existing frozen mock/local/static admin review sections only. No real API, storage, Supabase, billing,
              notification, parser, dispatch, booking save/load, or payment behavior.
            </p>
          </div>
          <div
            aria-label="Frozen mock/local/static workbench sections"
            className="mt-4 grid gap-6"
            data-internal-qa-mock-archive-content="true"
          >
        <section
          aria-label="Customer request intake handoff"
          className="rounded-lg border border-indigo-100 bg-white px-3 py-2 shadow-sm"
          data-customer-intake-handoff="true"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="shrink-0 md:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-indigo-700">
                  Customer Intake
                </span>{" "}
                <span className="text-slate-600">Request handoff</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-5">
              {[
                ["Source", "/book"],
                ["Contact", "Name, phone, email"],
                ["Trip", "Pickup, drop-off, time"],
                ["Status", "Needs review"],
                ["Next", "Review before driver"],
              ].map(([label, value]) => (
                <div
                  className="flex min-h-9 min-w-0 items-center rounded-md border border-indigo-100 bg-indigo-50/60 px-2 py-1.5"
                  data-customer-intake-handoff-item={label}
                  key={label}
                >
                  <p className="break-words text-xs font-medium leading-snug text-slate-800">
                    <span className="font-semibold uppercase tracking-[0.06em] text-indigo-700">
                      {label}:{" "}
                    </span>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-customer-intake-handoff-boundary="true"
          >
            Mock/local only. No customer request is stored or sent here.
          </p>
        </section>

        <section
          aria-label="Dispatcher intake confirmation readiness"
          className="rounded-lg border border-emerald-100 bg-white px-3 py-2 shadow-sm"
          data-intake-confirmation-readiness="true"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="shrink-0 md:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-emerald-700">
                  Intake Review
                </span>{" "}
                <span className="text-slate-600">Confirmation readiness</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              {[
                ["Source", "/book mock"],
                ["Review", "Dispatcher check"],
                ["Customer", "Contact details"],
                ["Trip", "Route and time"],
                ["Confirm", "Not automatic"],
                ["Next", "Review before confirmed booking"],
              ].map(([label, value]) => (
                <div
                  className="flex min-h-9 min-w-0 items-center rounded-md border border-emerald-100 bg-emerald-50/60 px-2 py-1.5"
                  data-intake-confirmation-readiness-item={label}
                  key={label}
                >
                  <p className="break-words text-xs font-medium leading-snug text-slate-800">
                    <span className="font-semibold uppercase tracking-[0.06em] text-emerald-700">
                      {label}:{" "}
                    </span>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-intake-confirmation-readiness-boundary="true"
          >
            Mock/local only. No confirmed booking, driver assignment, request save, or API call is created here.
          </p>
        </section>

        <section
          aria-label="Confirmed booking driver assignment readiness"
          className="rounded-lg border border-sky-100 bg-white px-3 py-2 shadow-sm"
          data-driver-assignment-readiness="true"
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-sky-700">
                  Driver Assignment
                </span>{" "}
                <span className="text-slate-600">Confirmed booking readiness</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-6">
              {[
                ["Status", "Confirmed"],
                ["Service", "Vehicle/service"],
                ["Assign", "Dispatcher ready"],
                ["Driver details", "Collect next"],
                ["Notify", "Future/not sent"],
                ["Next", "Assign driver"],
              ].map(([label, value]) => (
                <div
                  className="flex min-h-9 min-w-0 items-center rounded-md border border-sky-100 bg-sky-50/60 px-2 py-1.5"
                  data-driver-assignment-readiness-item={label}
                  key={label}
                >
                  <p className="break-words text-xs font-medium leading-snug text-slate-800">
                    <span className="font-semibold uppercase tracking-[0.06em] text-sky-700">
                      {label}:{" "}
                    </span>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-driver-assignment-readiness-boundary="true"
          >
            Mock/local only. No driver assignment, driver detail save, customer notification, storage, API call,
            WhatsApp, email, or message channel.
          </p>
        </section>

        <section
          aria-label="Confirmed booking to driver assignment handoff"
          className="rounded-lg border border-blue-100 bg-white px-3 py-2 shadow-sm"
          data-admin-confirmed-driver-assignment-handoff="true"
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="shrink-0 lg:w-48">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-blue-700">
                  Confirmed Booking
                </span>{" "}
                <span className="text-slate-600">Driver Assignment Handoff</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              {[
                ["Review", "Staff approved"],
                ["Dispatch", "Ready for assignment review"],
                ["Driver", "Manual assignment here"],
                ["Details", "Collected later"],
                ["Customer", "Do not send details yet"],
                ["Next", "Dispatcher confirms driver"],
              ].map(([label, value]) => (
                <div
                  className="flex min-h-9 min-w-0 items-center rounded-md border border-blue-100 bg-blue-50/60 px-2 py-1.5"
                  data-admin-confirmed-driver-assignment-handoff-item={label}
                  key={label}
                >
                  <p className="break-words text-xs font-medium leading-snug text-slate-800">
                    <span className="font-semibold uppercase tracking-[0.06em] text-blue-700">
                      {label}:{" "}
                    </span>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-admin-confirmed-driver-assignment-handoff-boundary="true"
          >
            Guidance only. This section does not assign a driver, save data, notify customers,
            send driver details, or create billing, payout, or PDF.
          </p>
        </section>

        <section
          aria-label="DSP job completion billing preparation handoff"
          className="rounded-lg border border-violet-100 bg-white px-3 py-2 shadow-sm"
          data-admin-dsp-completion-billing-prep-handoff="true"
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="shrink-0 lg:w-48">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-violet-700">
                  DSP / Job Completion
                </span>{" "}
                <span className="text-slate-600">Billing Prep Handoff</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              {[
                ["Completion", "Admin review required"],
                ["Hours", "Check DSP/extra time"],
                ["Exceptions", "Staff check"],
                ["Billing prep", "Not invoiced / review-only"],
                ["Customer", "No invoice/payment/PDF"],
                ["Driver", "No payout/accounting"],
              ].map(([label, value]) => (
                <div
                  className="flex min-h-9 min-w-0 items-center rounded-md border border-violet-100 bg-violet-50/60 px-2 py-1.5"
                  data-admin-dsp-completion-billing-prep-handoff-item={label}
                  key={label}
                >
                  <p className="break-words text-xs font-medium leading-snug text-slate-800">
                    <span className="font-semibold uppercase tracking-[0.06em] text-violet-700">
                      {label}:{" "}
                    </span>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-admin-dsp-completion-billing-prep-handoff-boundary="true"
          >
            Read-only admin handoff. No invoice, statement, PDF, payment, payout, accounting, customer notification,
            storage, API call, or save behavior is created here.
          </p>
        </section>

        <section
          aria-label="Driver assignment detail collection readiness"
          className="rounded-lg border border-cyan-100 bg-white px-3 py-2 shadow-sm"
          data-driver-detail-collection-readiness="true"
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-cyan-700">
                  Driver Details
                </span>{" "}
                <span className="text-slate-600">Collection readiness</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-6">
              {[
                ["Assigned", "Driver selected"],
                ["Contact", "Name/contact ready"],
                ["Vehicle", "Model/plate ready"],
                ["Verify", "Dispatcher check"],
                ["Update", "Future/not sent"],
                ["Next", "Review details"],
              ].map(([label, value]) => (
                <div
                  className="flex min-h-9 min-w-0 items-center rounded-md border border-cyan-100 bg-cyan-50/60 px-2 py-1.5"
                  data-driver-detail-collection-readiness-item={label}
                  key={label}
                >
                  <p className="break-words text-xs font-medium leading-snug text-slate-800">
                    <span className="font-semibold uppercase tracking-[0.06em] text-cyan-700">
                      {label}:{" "}
                    </span>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-driver-detail-collection-readiness-boundary="true"
          >
            Mock/local only. No driver detail collection, assignment, save, customer update, storage, API call,
            or message channel.
          </p>
        </section>

        <section
          aria-label="Driver details customer update readiness"
          className="rounded-lg border border-indigo-100 bg-white px-3 py-2 shadow-sm"
          data-driver-details-customer-update-readiness="true"
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-indigo-700">
                  Customer Update
                </span>{" "}
                <span className="text-slate-600">Driver details readiness</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-6">
              {[
                ["Details", "Driver details received"],
                ["Draft", "Customer update draft"],
                ["Channel", "Future/not sent"],
                ["Contact", "Customer contact check"],
                ["Review", "Dispatcher review"],
                ["Next", "Prepare update"],
              ].map(([label, value]) => (
                <div
                  className="flex min-h-9 min-w-0 items-center rounded-md border border-indigo-100 bg-indigo-50/60 px-2 py-1.5"
                  data-driver-details-customer-update-readiness-item={label}
                  key={label}
                >
                  <p className="break-words text-xs font-medium leading-snug text-slate-800">
                    <span className="font-semibold uppercase tracking-[0.06em] text-indigo-700">
                      {label}:{" "}
                    </span>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-driver-details-customer-update-readiness-boundary="true"
          >
            Mock/local only. No customer update persistence, notification sending, driver detail collection,
            assignment, save, storage, API call, or message channel.
          </p>
        </section>

        <section
          aria-label="Customer update delivery review readiness"
          className="rounded-lg border border-violet-100 bg-white px-3 py-2 shadow-sm"
          data-customer-update-delivery-review-readiness="true"
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-violet-700">
                  Delivery Review
                </span>{" "}
                <span className="text-slate-600">Customer update readiness</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-6">
              {[
                ["Update", "Customer update prepared"],
                ["Review", "Future delivery review"],
                ["Channel", "Message check, not sent"],
                ["Audit", "Contact/audit review"],
                ["Approval", "Dispatcher approval"],
                ["Next", "Review before future update"],
              ].map(([label, value]) => (
                <div
                  className="flex min-h-9 min-w-0 items-center rounded-md border border-violet-100 bg-violet-50/60 px-2 py-1.5"
                  data-customer-update-delivery-review-readiness-item={label}
                  key={label}
                >
                  <p className="break-words text-xs font-medium leading-snug text-slate-800">
                    <span className="font-semibold uppercase tracking-[0.06em] text-violet-700">
                      {label}:{" "}
                    </span>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-customer-update-delivery-review-readiness-boundary="true"
          >
            Mock/local only. No customer update persistence, delivery, notification sending, driver detail collection,
            assignment, save, storage, API call, or message channel.
          </p>
        </section>

        <section
          aria-label="Delivery review dispatcher approval readiness"
          className="rounded-lg border border-amber-100 bg-white px-3 py-2 shadow-sm"
          data-delivery-review-dispatcher-approval-readiness="true"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="shrink-0 md:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-amber-700">
                  Dispatcher Approval
                </span>{" "}
                <span className="text-slate-600">Delivery review readiness</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-6">
              {[
                ["Review", "Review status"],
                ["Approval", "Future approval review"],
                ["Channel", "Final check, not sent"],
                ["Audit", "Contact/audit ready"],
                ["Boundary", "Mock/local only"],
                ["Next", "Review boundary"],
              ].map(([label, value]) => (
                <div
                  className="flex min-h-9 min-w-0 items-center rounded-md border border-amber-100 bg-amber-50/60 px-2 py-1.5"
                  data-delivery-review-dispatcher-approval-readiness-item={label}
                  key={label}
                >
                  <p className="break-words text-xs font-medium leading-snug text-slate-800">
                    <span className="font-semibold uppercase tracking-[0.06em] text-amber-700">
                      {label}:{" "}
                    </span>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-delivery-review-dispatcher-approval-readiness-boundary="true"
          >
            Mock/local only. No customer update persistence, approval persistence, delivery, notification sending,
            driver detail collection, assignment, save, storage, API call, or message channel.
          </p>
        </section>

        <section
          aria-label="Dispatcher approval future notification queue readiness"
          className="rounded-lg border border-lime-100 bg-white px-3 py-1.5 shadow-sm"
          data-dispatcher-approval-notification-queue-readiness="true"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="shrink-0 md:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-lime-700">
                  Notification Queue
                </span>{" "}
                <span className="text-slate-600">Dispatcher approval readiness</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-6">
              {[
                ["Approval", "Approval status"],
                ["Queue", "Future queue review"],
                ["Channel", "Message readiness, not sent"],
                ["Audit", "Contact/audit ready"],
                ["Boundary", "Mock/local only"],
                ["Next", "Review future queue boundary"],
              ].map(([label, value]) => (
                <div
                  className="flex min-h-9 min-w-0 items-center rounded-md border border-lime-100 bg-lime-50/60 px-2 py-1.5"
                  data-dispatcher-approval-notification-queue-readiness-item={label}
                  key={label}
                >
                  <p className="break-words text-xs font-medium leading-snug text-slate-800">
                    <span className="font-semibold uppercase tracking-[0.06em] text-lime-700">
                      {label}:{" "}
                    </span>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-dispatcher-approval-notification-queue-readiness-boundary="true"
          >
            Mock/local only. No customer update persistence, approval persistence, notification queue persistence,
            delivery, notification sending, driver detail collection, assignment, save, storage, API call, or message
            channel.
          </p>
        </section>

        <section
          aria-label="Future notification queue customer update audit readiness"
          className="rounded-lg border border-rose-100 bg-white px-3 py-1.5 shadow-sm"
          data-future-notification-queue-customer-update-audit-readiness="true"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="shrink-0 md:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-rose-700">
                  Customer Audit
                </span>{" "}
                <span className="text-slate-600">Future queue readiness</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-6">
              {[
                ["Queue", "Future queue status"],
                ["Audit", "Future audit review"],
                ["Channel", "Message audit, not sent"],
                ["Contact", "Contact/audit ready"],
                ["Boundary", "Mock/local only"],
                ["Next", "Review audit boundary"],
              ].map(([label, value]) => (
                <div
                  className="flex min-h-9 min-w-0 items-center rounded-md border border-rose-100 bg-rose-50/60 px-2 py-1.5"
                  data-future-notification-queue-customer-update-audit-readiness-item={label}
                  key={label}
                >
                  <p className="break-words text-xs font-medium leading-snug text-slate-800">
                    <span className="font-semibold uppercase tracking-[0.06em] text-rose-700">
                      {label}:{" "}
                    </span>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-future-notification-queue-customer-update-audit-readiness-boundary="true"
          >
            Mock/local only. No customer update persistence, approval persistence, notification queue persistence,
            audit persistence, delivery, notification sending, driver detail collection, assignment, save, storage,
            API call, or message channel.
          </p>
        </section>

        <section
          aria-label="Mock driver detail customer update preview"
          className="rounded-lg border border-teal-100 bg-white px-3 py-2 shadow-sm"
          data-mock-driver-detail-customer-update-preview="true"
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-teal-700">
                  Driver Update Preview
                </span>{" "}
                <span className="text-slate-600">Mock customer note</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="grid min-w-0 grid-cols-3 gap-1.5 sm:gap-2">
                {[
                  ["Driver", "Name/phone ready"],
                  ["Vehicle", "Model/plate ready"],
                  ["Contact", "Customer check"],
                  ["Channel", "Future/not sent"],
                  ["Review", "Dispatcher only"],
                  ["Boundary", "Mock/local"],
                ].map(([label, value]) => (
                  <div
                    className="flex min-h-8 min-w-0 items-center rounded-md border border-teal-100 bg-teal-50/60 px-1.5 py-1"
                    data-mock-driver-detail-customer-update-preview-item={label}
                    key={label}
                  >
                    <p className="break-words text-xs font-medium leading-snug text-slate-800">
                      <span className="font-semibold uppercase tracking-[0.06em] text-teal-700">
                        {label}:{" "}
                      </span>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <p
                className="min-w-0 rounded-md border border-teal-100 bg-teal-50/60 px-3 py-2 text-xs font-medium leading-5 text-slate-700"
                data-mock-driver-detail-customer-update-preview-copy="true"
              >
                Future customer preview, not sent: driver name, phone, vehicle model, and plate for later
                message-channel review.
              </p>
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-mock-driver-detail-customer-update-preview-boundary="true"
          >
            Mock/local only. No driver detail persistence, customer update persistence, approval persistence,
            notification queue persistence, audit persistence, storage, API call, delivery, assignment, save, billing,
            or message channel.
          </p>
        </section>

        <section
          aria-label="Mock DSP usage accounting review preview"
          className="rounded-lg border border-amber-100 bg-white px-3 py-2 shadow-sm"
          data-mock-dsp-usage-accounting-preview="true"
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-amber-700">
                  DSP Usage Review
                </span>{" "}
                <span className="text-slate-600">Mock billing note</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="grid min-w-0 grid-cols-3 gap-1.5 sm:gap-2">
                {[
                  ["Job", "DSP/disposal"],
                  ["Time", "Start/completed"],
                  ["Hours", "Total/included/extra"],
                  ["Line", "Future/not billed"],
                  ["Review", "Dispatcher/accounting"],
                  ["Boundary", "Mock/local"],
                ].map(([label, value]) => (
                  <div
                    className="flex min-h-8 min-w-0 items-center rounded-md border border-amber-100 bg-amber-50/70 px-1.5 py-1"
                    data-mock-dsp-usage-accounting-preview-item={label}
                    key={label}
                  >
                    <p className="break-words text-xs font-medium leading-snug text-slate-800">
                      <span className="font-semibold uppercase tracking-[0.06em] text-amber-700">
                        {label}:{" "}
                      </span>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <p
                className="min-w-0 rounded-md border border-amber-100 bg-amber-50/70 px-3 py-2 text-xs font-medium leading-5 text-slate-700"
                data-mock-dsp-usage-accounting-preview-copy="true"
              >
                Future monthly billing line preview only: total hours, included hours, and extra hours for later
                dispatcher/accounting review. Not billed or saved.
              </p>
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-mock-dsp-usage-accounting-preview-boundary="true"
          >
            Mock/local only. No billing automation, invoice, payment, PDF, account charge, statement, storage, API
            call, save, notification, or customer account behavior.
          </p>
        </section>

        <section
          aria-label="Mock monthly DSP usage rollup reconciliation review"
          className="rounded-lg border border-cyan-100 bg-white px-3 py-2 shadow-sm"
          data-mock-dsp-monthly-rollup-review="true"
        >
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-cyan-700">
                  Monthly DSP Rollup
                </span>{" "}
                <span className="text-slate-600">Mock reconciliation</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-cyan-100 bg-cyan-50/70 px-3 py-2 text-xs font-medium leading-5 text-slate-700"
                data-mock-dsp-monthly-rollup-review-copy="true"
              >
                Static mock sample rows only for completed DSP/disposal usage by customer/month. Nothing is billed,
                saved, posted, or sent.
              </p>
              <div className="grid min-w-0 gap-1.5" data-mock-dsp-monthly-rollup-review-rows="true">
                {[
                  {
                    charge: "Not billed",
                    customer: "UBS Priority",
                    extra: "4.50h",
                    included: "8.00h",
                    jobs: "3 jobs",
                    month: "May 2026",
                    reconciliation: "Needs review",
                    total: "12.50h",
                  },
                  {
                    charge: "Not billed",
                    customer: "Ritz-Carlton",
                    extra: "1.25h",
                    included: "6.00h",
                    jobs: "2 jobs",
                    month: "May 2026",
                    reconciliation: "Matched to mock usage",
                    total: "7.25h",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-4 gap-1 rounded-md border border-cyan-100 bg-cyan-50/70 p-1.5 text-[10px] leading-tight text-slate-800 xl:grid-cols-8"
                    data-mock-dsp-monthly-rollup-review-row={row.customer}
                    key={`${row.customer}-${row.month}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.customer],
                      ["Month", "Month", row.month],
                      ["Job count", "Jobs", row.jobs],
                      ["Total DSP hours", "Total", row.total],
                      ["Included hours", "Included", row.included],
                      ["Extra hours", "Extra", row.extra],
                      ["Charge status", "Status", row.charge],
                      ["Reconciliation", "Recon", row.reconciliation],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase tracking-[0.04em] text-cyan-700"
                          data-mock-dsp-monthly-rollup-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <p
                className="min-w-0 rounded-md border border-cyan-100 bg-cyan-50/70 px-3 py-2 text-xs font-medium leading-5 text-slate-700"
                data-mock-dsp-monthly-rollup-review-detail="true"
              >
                Selected mock review: UBS Priority May 2026, 3 jobs, 12.50h total, 8.00h included, 4.50h extra.
                Future monthly invoice line - mock only, not created.
              </p>
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-mock-dsp-monthly-rollup-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, payment, PDF, accounting posting, customer account,
            statement, storage, API call, save, notification, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock DSP reconciliation exceptions adjustments review"
          className="rounded-lg border border-sky-100 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-dsp-reconciliation-exceptions-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-sky-700">
                  DSP Exceptions
                </span>{" "}
                <span className="text-slate-600">Mock adjustments</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-sky-100 bg-sky-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                data-mock-dsp-reconciliation-exceptions-review-copy="true"
              >
                Static mock exception rows only for reconciliation review. Nothing is billed, saved, posted, or sent.
              </p>
              <div className="grid min-w-0 gap-1.5" data-mock-dsp-reconciliation-exceptions-review-rows="true">
                {[
                  {
                    adjusted: "Review needed",
                    customer: "UBS Priority",
                    difference: "TBC",
                    issue: "Missing job completed time",
                    month: "May 2026",
                    note: "Driver completion time missing",
                    original: "Pending",
                    status: "Not saved / not billed",
                  },
                  {
                    adjusted: "6.75h",
                    customer: "Ritz-Carlton",
                    difference: "-0.50h",
                    issue: "Disputed extra hours",
                    month: "May 2026",
                    note: "Customer disputed waiting time",
                    original: "7.25h",
                    status: "Mock adjustment review",
                  },
                  {
                    adjusted: "5.50h",
                    customer: "VIP Customer",
                    difference: "+0.50h",
                    issue: "Driver completion time needs review",
                    month: "May 2026",
                    note: "Dispatcher confirmation needed",
                    original: "5.00h",
                    status: "Not saved / not billed",
                  },
                  {
                    adjusted: "11.50h",
                    customer: "UBS Priority",
                    difference: "-1.00h",
                    issue: "Manual goodwill adjustment",
                    month: "May 2026",
                    note: "Goodwill adjustment before future review",
                    original: "12.50h",
                    status: "Mock-only adjustment",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-4 gap-1 rounded-md border border-sky-100 bg-sky-50/70 p-1 text-[10px] leading-[1.1] text-slate-800 xl:grid-cols-8"
                    data-mock-dsp-reconciliation-exceptions-review-row={row.issue}
                    key={`${row.customer}-${row.issue}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.customer],
                      ["Month", "Month", row.month],
                      ["Issue type", "Issue", row.issue],
                      ["Original hours", "Original", row.original],
                      ["Proposed adjusted hours", "Adjusted", row.adjusted],
                      ["Difference", "Diff", row.difference],
                      ["Reason/note", "Note", row.note],
                      ["Mock reconciliation status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase tracking-[0.04em] text-sky-700"
                          data-mock-dsp-reconciliation-exceptions-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <p
                className="min-w-0 rounded-md border border-sky-100 bg-sky-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                data-mock-dsp-reconciliation-exceptions-review-detail="true"
              >
                Selected mock exception: Ritz-Carlton May 2026 disputed extra hours, 7.25h original, 6.75h adjusted,
                -0.50h difference. Future invoice adjustment line - mock only, not created. Not saved / not billed.
              </p>
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-mock-dsp-reconciliation-exceptions-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, payment, PDF, accounting posting, customer account,
            statement, storage, API call, save, notification, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock DSP reconciliation approval packet accounting handoff review"
          className="rounded-lg border border-indigo-100 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-dsp-approval-packet-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase tracking-[0.08em] text-indigo-700">
                  DSP Approval Packet
                </span>{" "}
                <span className="text-slate-600">Mock handoff</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-indigo-100 bg-indigo-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                data-mock-dsp-approval-packet-review-copy="true"
              >
                Static/mock approval packet data only for dispatcher/accounting handoff review. Nothing is approved,
                billed, saved, posted, or sent.
              </p>
              <div className="grid min-w-0 gap-1.5" data-mock-dsp-approval-packet-review-rows="true">
                {[
                  {
                    account: "UBS Priority",
                    adjustments: "2 adjustments",
                    exceptions: "4 exceptions",
                    extra: "4.50h",
                    finalExtra: "3.50h",
                    included: "8.00h",
                    jobs: "3 jobs",
                    month: "May 2026",
                    status: "Not saved / not billed",
                    total: "12.50h",
                  },
                  {
                    account: "Ritz-Carlton",
                    adjustments: "1 adjustment",
                    exceptions: "1 exception",
                    extra: "1.25h",
                    finalExtra: "0.75h",
                    included: "6.00h",
                    jobs: "2 jobs",
                    month: "May 2026",
                    status: "Mock handoff review",
                    total: "7.25h",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-5 gap-1 rounded-md border border-indigo-100 bg-indigo-50/70 p-1 text-[10px] leading-[1.1] text-slate-800 xl:grid-cols-10"
                    data-mock-dsp-approval-packet-review-row={row.account}
                    key={`${row.account}-${row.month}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Month", "Month", row.month],
                      ["Job count", "Jobs", row.jobs],
                      ["Total DSP hours", "Total", row.total],
                      ["Included hours", "Included", row.included],
                      ["Extra hours", "Extra", row.extra],
                      ["Exception count", "Exceptions", row.exceptions],
                      ["Adjustment count", "Adjustments", row.adjustments],
                      ["Final reviewed extra hours", "Final extra", row.finalExtra],
                      ["Mock approval/handoff status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase tracking-[0.04em] text-indigo-700"
                          data-mock-dsp-approval-packet-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-indigo-100 bg-indigo-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-dsp-approval-packet-review-handoff="true"
                >
                  Future accounting handoff - mock only. Future monthly invoice line - not created. No invoice/payment/PDF
                  generated. Not saved / not billed.
                </p>
                <p
                  className="min-w-0 rounded-md border border-indigo-100 bg-indigo-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-dsp-approval-packet-review-exceptions="true"
                >
                  Exception/adjustment summary: missing completion time reviewed, disputed extra hours reviewed, manual
                  goodwill adjustment noted, dispatcher/accounting review note kept for mock handoff.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-mock-dsp-approval-packet-review-boundary="true"
          >
            Mock/local only. No approval persistence, billing automation, invoice, payment, PDF, accounting posting,
            customer account, statement, storage, API call, save, notification, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock accounting statement preview reconciliation packet"
          className="rounded-lg border border-violet-100 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-accounting-statement-preview="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-violet-700">Accounting Statement</span>{" "}
                <span className="text-slate-600">Mock preview</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-violet-100 bg-violet-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                data-mock-accounting-statement-preview-copy="true"
              >
                Static/mock statement preview data only for future reconciliation review. Nothing is charged, posted,
                billed, saved, generated, or sent.
              </p>
              <div className="grid min-w-0 gap-1.5" data-mock-accounting-statement-preview-rows="true">
                {[
                  {
                    account: "UBS Priority",
                    amount: "$ -- not charged",
                    approvedJobs: "3 jobs",
                    extra: "3.50h",
                    finalHours: "11.50h",
                    included: "8.00h",
                    month: "May 2026",
                    rate: "Mock DSP rate / not charged",
                    reconciliation: "Approved handoff reviewed",
                    status: "Not saved / not posted / not billed",
                  },
                  {
                    account: "Ritz-Carlton",
                    amount: "$ -- not charged",
                    approvedJobs: "2 jobs",
                    extra: "0.75h",
                    finalHours: "6.75h",
                    included: "6.00h",
                    month: "May 2026",
                    rate: "Mock DSP rate / not charged",
                    reconciliation: "Adjustments noted",
                    status: "Future preview only",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-5 gap-1 rounded-md border border-violet-100 bg-violet-50/70 p-1 text-[10px] leading-[1.1] text-slate-800 xl:grid-cols-10"
                    data-mock-accounting-statement-preview-row={row.account}
                    key={`${row.account}-${row.month}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Statement month", "Month", row.month],
                      ["Approved DSP job count", "Jobs", row.approvedJobs],
                      ["Final reviewed DSP hours", "Final hrs", row.finalHours],
                      ["Included hours", "Included", row.included],
                      ["Extra billable hours", "Extra", row.extra],
                      ["Mock rate label", "Rate", row.rate],
                      ["Mock amount placeholder", "Amount", row.amount],
                      ["Reconciliation status", "Recon", row.reconciliation],
                      ["Statement preview status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-violet-700"
                          data-mock-accounting-statement-preview-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-violet-100 bg-violet-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-accounting-statement-preview-line="true"
                >
                  Future statement line - mock only. Future monthly invoice preview - not created. No invoice number
                  generated. No PDF/payment link generated. Not saved / not posted / not billed.
                </p>
                <p
                  className="min-w-0 rounded-md border border-violet-100 bg-violet-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-accounting-statement-preview-note="true"
                >
                  Reconciliation note: approved handoff reviewed, exceptions carried forward, adjustments noted,
                  accounting review pending.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-mock-accounting-statement-preview-boundary="true"
          >
            Mock/local only. No billing automation, invoice, statement, payment link, PDF, accounting posting, customer
            account, account charge, storage, API call, save, post, approval, notification, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock statement variance approval decision review"
          className="rounded-lg border border-amber-100 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-statement-variance-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-amber-700">Statement Variance</span>{" "}
                <span className="text-slate-600">Mock decision</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-amber-100 bg-amber-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                data-mock-statement-variance-review-copy="true"
              >
                Static/mock variance review data only for dispatcher/accounting approval decision review. Nothing is
                approved, billed, posted, saved, generated, or sent.
              </p>
              <div className="grid min-w-0 gap-1.5" data-mock-statement-variance-review-rows="true">
                {[
                  {
                    account: "UBS Priority",
                    amountVariance: "$ -- not charged",
                    approvalDecision: "Match pending",
                    approvedHandoffHours: "11.50h",
                    extraVariance: "0.00h",
                    includedVariance: "0.00h",
                    month: "May 2026",
                    reconciliationDecision: "Matches preview",
                    statementPreviewHours: "11.50h",
                    status: "Not billed / not posted",
                    varianceHours: "0.00h",
                  },
                  {
                    account: "Ritz-Carlton",
                    amountVariance: "$ -- not charged",
                    approvalDecision: "Review variance",
                    approvedHandoffHours: "7.25h",
                    extraVariance: "-0.50h",
                    includedVariance: "0.00h",
                    month: "May 2026",
                    reconciliationDecision: "Disputed extra hours",
                    statementPreviewHours: "6.75h",
                    status: "Not billed / not posted",
                    varianceHours: "-0.50h",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-5 gap-1 rounded-md border border-amber-100 bg-amber-50/70 p-1 text-[10px] leading-[1.1] text-slate-800 xl:grid-cols-11"
                    data-mock-statement-variance-review-row={`${row.account}-${row.approvalDecision}`}
                    key={`${row.account}-${row.month}-${row.approvalDecision}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Statement month", "Month", row.month],
                      ["Approved DSP handoff hours", "Handoff", row.approvedHandoffHours],
                      ["Statement preview hours", "Preview", row.statementPreviewHours],
                      ["Variance hours", "Variance", row.varianceHours],
                      ["Included hours variance", "Inc var", row.includedVariance],
                      ["Extra hours variance", "Extra var", row.extraVariance],
                      ["Mock amount variance placeholder", "Amount", row.amountVariance],
                      ["Approval decision status", "Decision", row.approvalDecision],
                      ["Reconciliation decision status", "Recon", row.reconciliationDecision],
                      ["Not-billed/not-posted status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-amber-700"
                          data-mock-statement-variance-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-amber-100 bg-amber-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-statement-variance-review-note="true"
                >
                  Variance review - mock only. Statement approval decision - not saved. Accounting approval pending.
                  Approved handoff matches statement preview, minor extra-hours variance requiring review, exception
                  carried forward, and manual goodwill adjustment noted. Not billed / not posted.
                </p>
                <p
                  className="min-w-0 rounded-md border border-amber-100 bg-amber-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-statement-variance-review-generation="true"
                >
                  No invoice number generated. No PDF/payment link generated. No customer account posting generated. No
                  accounting record generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-mock-statement-variance-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, statement, account charge, approval persistence, PDF,
            accounting record, customer account posting, storage, API call, save, post, notification, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock receivables handoff QA statement release review"
          className="rounded-lg border border-emerald-100 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-receivables-handoff-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-emerald-700">Receivables Handoff</span>{" "}
                <span className="text-slate-600">Mock QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-emerald-100 bg-emerald-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                data-mock-receivables-handoff-review-copy="true"
              >
                Static/mock receivables handoff QA data only for statement release review. Nothing is released,
                billed, posted, saved, generated, or sent.
              </p>
              <div className="grid min-w-0 gap-1.5" data-mock-receivables-handoff-review-rows="true">
                {[
                  {
                    account: "UBS Priority",
                    billingContact: "Contact verified",
                    carryForward: "Manual goodwill noted",
                    month: "May 2026",
                    qaStatus: "QA pending",
                    releaseDecision: "Hold for accounting",
                    releaseReadiness: "Ready for mock review",
                    status: "Not billed / not posted / not sent",
                    varianceDecision: "Matched to preview",
                  },
                  {
                    account: "Ritz-Carlton",
                    billingContact: "Billing contact final check",
                    carryForward: "Disputed extra hours carried",
                    month: "May 2026",
                    qaStatus: "QA needs contact check",
                    releaseDecision: "Do not release",
                    releaseReadiness: "Release blocked in mock",
                    status: "Not billed / not posted / not sent",
                    varianceDecision: "Review variance",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-3 gap-1 rounded-md border border-emerald-100 bg-emerald-50/70 p-1 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-5 xl:grid-cols-9"
                    data-mock-receivables-handoff-review-row={`${row.account}-${row.varianceDecision}`}
                    key={`${row.account}-${row.month}-${row.varianceDecision}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Statement month", "Month", row.month],
                      ["Variance decision status", "Variance", row.varianceDecision],
                      ["Receivables QA status", "QA", row.qaStatus],
                      ["Billing contact check", "Contact", row.billingContact],
                      ["Statement release readiness", "Release", row.releaseReadiness],
                      ["Exception carry-forward status", "Carry", row.carryForward],
                      ["Mock release decision", "Decision", row.releaseDecision],
                      ["Not-posted/not-billed status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-emerald-700"
                          data-mock-receivables-handoff-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-emerald-100 bg-emerald-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-receivables-handoff-review-note="true"
                >
                  Receivables handoff QA - mock only. Statement release review - not saved. Approved variance matched
                  to statement preview, billing contact needs final check, exception carried forward, and accounting
                  review pending. Not billed / not posted / not sent.
                </p>
                <p
                  className="min-w-0 rounded-md border border-emerald-100 bg-emerald-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-receivables-handoff-review-generation="true"
                >
                  No invoice number generated. No PDF/payment link generated. No customer account posting generated. No
                  receivables record generated. No accounting record generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-mock-receivables-handoff-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, statement release, account charge, approval persistence,
            statement release persistence, PDF, receivables record, accounting record, customer account posting,
            storage, API call, save, post, notification, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock receivables aging and follow-up QA review"
          className="rounded-lg border border-sky-100 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-receivables-aging-follow-up-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-sky-700">Receivables Aging</span>{" "}
                <span className="text-slate-600">Mock Follow-up QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-sky-100 bg-sky-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                data-mock-receivables-aging-follow-up-review-copy="true"
              >
                Static/mock receivables aging review data only for future follow-up QA. Nothing is reminded, collected,
                posted, billed, saved, generated, or sent.
              </p>
              <div className="grid min-w-0 gap-1.5" data-mock-receivables-aging-follow-up-review-rows="true">
                {[
                  {
                    account: "UBS Priority",
                    agingBucket: "Current / not due",
                    billingContact: "Contact verified",
                    carryForward: "Manual goodwill noted",
                    daysOutstanding: "0 days",
                    followUpDecision: "Monitor only",
                    followUpQa: "Follow-up not due",
                    month: "May 2026",
                    status: "Not sent / not posted / not billed",
                  },
                  {
                    account: "Ritz-Carlton",
                    agingBucket: "1-30 day review",
                    billingContact: "Billing contact final check",
                    carryForward: "Disputed extra hours carried",
                    daysOutstanding: "18 days",
                    followUpDecision: "Prepare mock follow-up",
                    followUpQa: "Follow-up ready",
                    month: "May 2026",
                    status: "Not sent / not posted / not billed",
                  },
                  {
                    account: "VIP Customer",
                    agingBucket: "1-30 day review",
                    billingContact: "Billing contact needs check",
                    carryForward: "Exception carried forward",
                    daysOutstanding: "24 days",
                    followUpDecision: "Hold for contact QA",
                    followUpQa: "QA needs contact check",
                    month: "May 2026",
                    status: "Not sent / not posted / not billed",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-3 gap-1 rounded-md border border-sky-100 bg-sky-50/70 p-1 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-5 xl:grid-cols-9"
                    data-mock-receivables-aging-follow-up-review-row={`${row.account}-${row.agingBucket}`}
                    key={`${row.account}-${row.month}-${row.daysOutstanding}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Statement month", "Month", row.month],
                      ["Mock aging bucket", "Aging", row.agingBucket],
                      ["Days outstanding", "Days", row.daysOutstanding],
                      ["Follow-up QA status", "QA", row.followUpQa],
                      ["Billing contact status", "Contact", row.billingContact],
                      ["Exception carry-forward status", "Carry", row.carryForward],
                      ["Mock follow-up decision", "Decision", row.followUpDecision],
                      ["Not-sent/not-posted/not-billed status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-sky-700"
                          data-mock-receivables-aging-follow-up-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-sky-100 bg-sky-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-receivables-aging-follow-up-review-note="true"
                >
                  Receivables aging review - mock only. Follow-up QA - not saved. Current/not due, 1-30 day follow-up
                  ready, billing contact needs check, and exception carried forward. Not sent / not posted / not billed.
                </p>
                <p
                  className="min-w-0 rounded-md border border-sky-100 bg-sky-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-receivables-aging-follow-up-review-generation="true"
                >
                  No customer reminder generated. No payment link generated. No receivables record generated. No
                  collection action created. No invoice number generated. No PDF generated. No customer account posting
                  generated. No accounting record generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-mock-receivables-aging-follow-up-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, payment, statement release, account charge, aging
            persistence, follow-up persistence, collection persistence, PDF, receivables record, collection record,
            customer account posting, storage, API call, save, post, notification, reminder, follow-up, collection, or
            send behavior.
          </p>
        </section>

        <section
          aria-label="Mock collections escalation and credit write-off QA review"
          className="rounded-lg border border-rose-100 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-collections-credit-writeoff-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-rose-700">Collections Escalation</span>{" "}
                <span className="text-slate-600">Credit Write-off QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-rose-100 bg-rose-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                data-mock-collections-credit-writeoff-review-copy="true"
              >
                Static/mock collections escalation and credit/write-off QA data only for internal review. Nothing is
                escalated, credited, written off, posted, billed, saved, generated, or sent.
              </p>
              <div className="grid min-w-0 gap-1.5" data-mock-collections-credit-writeoff-review-rows="true">
                {[
                  {
                    account: "UBS Priority",
                    agingBucket: "Current / no escalation",
                    carryForward: "Manual goodwill noted",
                    creditWriteoff: "No credit/write-off review",
                    daysOutstanding: "0 days",
                    escalationQa: "Escalation not due",
                    followUpStatus: "Monitor only",
                    mockDecision: "Keep current",
                    month: "May 2026",
                    status: "Not sent / not posted / not billed / not written off",
                  },
                  {
                    account: "Ritz-Carlton",
                    agingBucket: "1-30 day review",
                    carryForward: "Disputed extra hours carried",
                    creditWriteoff: "Credit review not started",
                    daysOutstanding: "18 days",
                    escalationQa: "Follow-up ready",
                    followUpStatus: "Prepare mock follow-up",
                    mockDecision: "No escalation yet",
                    month: "May 2026",
                    status: "Not sent / not posted / not billed / not written off",
                  },
                  {
                    account: "VIP Customer",
                    agingBucket: "31-60 day review",
                    carryForward: "Exception carried forward",
                    creditWriteoff: "Credit/write-off candidate review",
                    daysOutstanding: "42 days",
                    escalationQa: "Escalation needs manager review",
                    followUpStatus: "Follow-up held",
                    mockDecision: "Review write-off candidate",
                    month: "May 2026",
                    status: "Not sent / not posted / not billed / not written off",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-3 gap-1 rounded-md border border-rose-100 bg-rose-50/70 p-1 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-5 xl:grid-cols-10"
                    data-mock-collections-credit-writeoff-review-row={`${row.account}-${row.agingBucket}`}
                    key={`${row.account}-${row.month}-${row.daysOutstanding}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Statement month", "Month", row.month],
                      ["Mock aging bucket", "Aging", row.agingBucket],
                      ["Days outstanding", "Days", row.daysOutstanding],
                      ["Escalation QA status", "Esc QA", row.escalationQa],
                      ["Follow-up status", "Follow-up", row.followUpStatus],
                      ["Credit/write-off review status", "Credit/WO", row.creditWriteoff],
                      ["Exception carry-forward status", "Carry", row.carryForward],
                      ["Mock decision status", "Decision", row.mockDecision],
                      ["Not-sent/not-posted/not-billed/not-written-off status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-rose-700"
                          data-mock-collections-credit-writeoff-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-rose-100 bg-rose-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-collections-credit-writeoff-review-note="true"
                >
                  Collections escalation review - mock only. Credit/write-off QA - not saved. Current account/no
                  escalation, follow-up ready, escalation needs manager review, credit/write-off candidate review, and
                  exception carried forward. Not sent / not posted / not billed / not written off.
                </p>
                <p
                  className="min-w-0 rounded-md border border-rose-100 bg-rose-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-collections-credit-writeoff-review-generation="true"
                >
                  No customer reminder generated. No payment link generated. No collection action created. No credit
                  note generated. No write-off record generated. No receivables record generated. No invoice number
                  generated. No PDF generated. No customer account posting generated. No accounting record generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-mock-collections-credit-writeoff-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, payment, statement release, account charge, approval
            persistence, aging persistence, follow-up persistence, collection persistence, credit note persistence,
            write-off persistence, PDF, receivables record, collection record, credit note, write-off record, customer
            account posting, storage, API call, save, post, notification, reminder, escalation, follow-up, collection,
            credit, write-off, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock payment allocation remittance reconciliation and short-pay dispute QA review"
          className="rounded-lg border border-emerald-100 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-payment-allocation-remittance-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-emerald-700">Payment Allocation</span>{" "}
                <span className="text-slate-600">Remittance / Short-pay QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-emerald-100 bg-emerald-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                data-mock-payment-allocation-remittance-review-copy="true"
              >
                Static/mock payment allocation, remittance reconciliation, and short-pay dispute QA data only for
                internal review. Nothing is allocated, reconciled, disputed, posted, billed, saved, generated, or sent.
              </p>
              <div className="grid min-w-0 gap-1.5" data-mock-payment-allocation-remittance-review-rows="true">
                {[
                  {
                    account: "UBS Priority",
                    allocationQa: "Allocation full match",
                    decision: "Keep matched in mock",
                    disputeCarry: "No dispute carry-forward",
                    month: "May 2026",
                    paymentRef: "MOCK-PAY-UBS-MAY",
                    receivedAmount: "$ -- not posted",
                    remittanceMatch: "Remittance matched",
                    shortPayOverpay: "Full match / no dispute",
                    statementAmount: "$ -- not charged",
                    status: "Not allocated / not posted / not reconciled / not billed",
                  },
                  {
                    account: "Ritz-Carlton",
                    allocationQa: "Allocation needs review",
                    decision: "Hold short-pay dispute",
                    disputeCarry: "Disputed extra hours carried",
                    month: "May 2026",
                    paymentRef: "MOCK-PAY-RITZ-SHORT",
                    receivedAmount: "$ -- short-pay not posted",
                    remittanceMatch: "Remittance reference mismatch",
                    shortPayOverpay: "Short-pay needs review",
                    statementAmount: "$ -- not charged",
                    status: "Not allocated / not posted / not reconciled / not billed",
                  },
                  {
                    account: "VIP Customer",
                    allocationQa: "Allocation exception review",
                    decision: "Carry credit in mock review",
                    disputeCarry: "Dispute carried forward",
                    month: "May 2026",
                    paymentRef: "MOCK-PAY-VIP-OVER",
                    receivedAmount: "$ -- overpay not posted",
                    remittanceMatch: "Remittance advice needs QA",
                    shortPayOverpay: "Overpayment / credit carry-forward",
                    statementAmount: "$ -- not charged",
                    status: "Not allocated / not posted / not reconciled / not billed",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-4 gap-0.5 rounded-md border border-emerald-100 bg-emerald-50/70 p-1 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-6 xl:grid-cols-11"
                    data-mock-payment-allocation-remittance-review-row={`${row.account}-${row.paymentRef}`}
                    key={`${row.account}-${row.month}-${row.paymentRef}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Statement month", "Month", row.month],
                      ["Mock payment reference", "Pay ref", row.paymentRef],
                      ["Statement amount", "Stmt amt", row.statementAmount],
                      ["Received amount", "Rcvd amt", row.receivedAmount],
                      ["Allocation QA status", "Alloc QA", row.allocationQa],
                      ["Remittance match status", "Remit", row.remittanceMatch],
                      ["Short-pay/overpay status", "Short/over", row.shortPayOverpay],
                      ["Dispute carry-forward status", "Dispute", row.disputeCarry],
                      ["Mock decision status", "Decision", row.decision],
                      ["Not-allocated/not-posted/not-reconciled/not-billed status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-emerald-700"
                          data-mock-payment-allocation-remittance-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-emerald-100 bg-emerald-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-payment-allocation-remittance-review-note="true"
                >
                  Payment allocation review - mock only. Remittance reconciliation QA - not saved. Short-pay dispute
                  review - not saved. Full match/no dispute, short-pay needs review, remittance reference mismatch,
                  overpayment/credit carry-forward, and dispute carried forward. Not allocated / not posted / not
                  reconciled / not billed.
                </p>
                <p
                  className="min-w-0 rounded-md border border-emerald-100 bg-emerald-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-payment-allocation-remittance-review-generation="true"
                >
                  No payment record generated. No remittance record generated. No customer account posting generated.
                  No invoice number generated. No PDF generated. No payment link generated. No receivables record
                  generated. No collection action created. No credit note generated. No write-off record generated. No
                  accounting record generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-mock-payment-allocation-remittance-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, payment, statement release, account charge, approval
            persistence, payment allocation persistence, remittance persistence, dispute persistence, collection
            persistence, credit note persistence, write-off persistence, PDF, receivables record, collection record,
            credit note, write-off record, customer account posting, payment record, remittance record, dispute record,
            storage, API call, save, post, reconcile, allocate, dispute, notification, reminder, follow-up, collection,
            credit, write-off, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock month-end AR close and dispute-resolution approval packet QA review"
          className="rounded-lg border border-cyan-100 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-month-end-ar-close-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-cyan-700">Month-end AR Close</span>{" "}
                <span className="text-slate-600">Dispute packet QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-cyan-100 bg-cyan-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                data-mock-month-end-ar-close-review-copy="true"
              >
                Static/mock month-end AR close and dispute-resolution approval packet QA data only for internal review.
                Nothing is closed, approved, posted, reconciled, billed, saved, generated, or sent.
              </p>
              <div className="grid min-w-0 gap-1.5" data-mock-month-end-ar-close-review-rows="true">
                {[
                  {
                    account: "UBS Priority",
                    accountingHandoff: "Accounting handoff ready",
                    closeDecision: "Fully reconciled / ready for close",
                    creditCarry: "No credit carry-forward",
                    managerApproval: "Manager approval not needed",
                    month: "May 2026",
                    paymentStatus: "Reconciled payment matched",
                    shortPayResolution: "No short-pay dispute",
                    status: "Not closed / not posted / not reconciled / not billed",
                    unresolvedDispute: "No unresolved dispute",
                  },
                  {
                    account: "Ritz-Carlton",
                    accountingHandoff: "Accounting handoff pending",
                    closeDecision: "Hold mock close",
                    creditCarry: "No credit carry-forward",
                    managerApproval: "Manager approval needed",
                    month: "May 2026",
                    paymentStatus: "Short-pay not reconciled",
                    shortPayResolution: "Short-pay resolution pending",
                    status: "Not closed / not posted / not reconciled / not billed",
                    unresolvedDispute: "Unresolved short-pay dispute",
                  },
                  {
                    account: "VIP Customer",
                    accountingHandoff: "Accounting handoff pending",
                    closeDecision: "Carry credit before close",
                    creditCarry: "Credit carry-forward pending",
                    managerApproval: "Manager approval needed",
                    month: "May 2026",
                    paymentStatus: "Overpayment match reviewed",
                    shortPayResolution: "Short-pay resolved in mock",
                    status: "Not closed / not posted / not reconciled / not billed",
                    unresolvedDispute: "Dispute carried forward",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-5 gap-0.5 rounded-md border border-cyan-100 bg-cyan-50/70 p-1 text-[10px] leading-[1.1] text-slate-800 xl:grid-cols-10"
                    data-mock-month-end-ar-close-review-row={`${row.account}-${row.month}`}
                    key={`${row.account}-${row.month}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Statement month", "Month", row.month],
                      ["Reconciled payment status", "Payment", row.paymentStatus],
                      ["Unresolved dispute status", "Dispute", row.unresolvedDispute],
                      ["Credit carry-forward status", "Credit", row.creditCarry],
                      ["Short-pay resolution status", "Short-pay", row.shortPayResolution],
                      ["Manager approval status", "Mgr QA", row.managerApproval],
                      ["Accounting handoff status", "Acct handoff", row.accountingHandoff],
                      ["Mock close decision status", "Decision", row.closeDecision],
                      ["Not-closed/not-posted/not-reconciled/not-billed status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-cyan-700"
                          data-mock-month-end-ar-close-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-cyan-100 bg-cyan-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-month-end-ar-close-review-note="true"
                >
                  Month-end AR close review - mock only. Dispute-resolution approval packet - not saved. Fully
                  reconciled/ready for close, unresolved short-pay dispute, credit carry-forward pending, manager
                  approval needed, and accounting handoff pending. Not closed / not posted / not reconciled / not
                  billed.
                </p>
                <p
                  className="min-w-0 rounded-md border border-cyan-100 bg-cyan-50/70 px-2 py-1.5 text-xs font-medium leading-4 text-slate-700"
                  data-mock-month-end-ar-close-review-generation="true"
                >
                  No AR close record generated. No accounting handoff generated. No customer account posting generated.
                  No invoice number generated. No PDF generated. No payment link generated. No payment record
                  generated. No remittance record generated. No dispute record generated. No receivables record
                  generated. No collection action created. No credit note generated. No write-off record generated. No
                  accounting record generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-xs leading-4 text-slate-500"
            data-mock-month-end-ar-close-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, payment, statement release, account charge, approval
            persistence, payment allocation persistence, remittance persistence, dispute persistence, AR close
            persistence, month-end close persistence, collection persistence, credit note persistence, write-off
            persistence, PDF, receivables record, collection record, credit note, write-off record, customer account
            posting, payment record, remittance record, dispute record, AR close record, month-end close record,
            accounting handoff, storage, API call, save, post, reconcile, allocate, dispute, close, notification,
            reminder, follow-up, collection, credit, write-off, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock accounting handoff GL close exception and audit export QA review"
          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-accounting-handoff-gl-audit-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-slate-700">Accounting Handoff</span>{" "}
                <span className="text-slate-600">GL / Audit QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50/80 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-accounting-handoff-gl-audit-review-copy="true"
              >
                Static/mock accounting handoff, GL close exception, and audit export QA data only for internal review.
                Nothing is handed off, posted, exported, billed, saved, generated, or sent.
              </p>
              <div className="grid min-w-0 gap-1.5" data-mock-accounting-handoff-gl-audit-review-rows="true">
                {[
                  {
                    account: "UBS Priority",
                    accountingHandoff: "Accounting handoff ready",
                    arClose: "AR close ready for accounting handoff",
                    auditExport: "Audit export ready for mock review",
                    glException: "No GL exception",
                    managerApproval: "Manager/accounting approval not needed",
                    month: "May 2026",
                    handoffDecision: "Ready for mock handoff",
                    status: "Not handed off / not posted / not exported / not billed",
                    unresolvedException: "No unresolved exception carry-forward",
                  },
                  {
                    account: "Ritz-Carlton",
                    accountingHandoff: "Accounting handoff pending",
                    arClose: "AR close held for exception",
                    auditExport: "Audit export readiness pending",
                    glException: "GL exception needs review",
                    managerApproval: "Manager/accounting approval needed",
                    month: "May 2026",
                    handoffDecision: "Hold GL close exception",
                    status: "Not handed off / not posted / not exported / not billed",
                    unresolvedException: "Unresolved short-pay exception carried forward",
                  },
                  {
                    account: "VIP Customer",
                    accountingHandoff: "Accounting handoff pending",
                    arClose: "AR close carry-forward pending",
                    auditExport: "Audit export readiness pending",
                    glException: "Credit carry-forward GL review",
                    managerApproval: "Manager/accounting approval needed",
                    month: "May 2026",
                    handoffDecision: "Carry exception before export",
                    status: "Not handed off / not posted / not exported / not billed",
                    unresolvedException: "Unresolved exception carried forward",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-2 gap-1 rounded-md border border-zinc-200 bg-zinc-50/80 p-1 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-5 xl:grid-cols-10"
                    data-mock-accounting-handoff-gl-audit-review-row={`${row.account}-${row.month}`}
                    key={`${row.account}-${row.month}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Statement month", "Month", row.month],
                      ["AR close status", "AR close", row.arClose],
                      ["Accounting handoff status", "Acct handoff", row.accountingHandoff],
                      ["GL exception status", "GL exception", row.glException],
                      ["Audit export readiness status", "Audit export", row.auditExport],
                      ["Unresolved exception carry-forward status", "Carry", row.unresolvedException],
                      ["Manager/accounting approval status", "Mgr/acct QA", row.managerApproval],
                      ["Mock handoff decision status", "Decision", row.handoffDecision],
                      ["Not-handed-off/not-posted/not-exported/not-billed status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-slate-700"
                          data-mock-accounting-handoff-gl-audit-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50/80 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-accounting-handoff-gl-audit-review-note="true"
                >
                  Accounting handoff review - mock only. GL close exception QA - not saved. Audit export readiness - not
                  exported. AR close ready for accounting handoff, GL exception needs review, audit export readiness
                  pending, manager/accounting approval needed, and unresolved exception carried forward. Not handed off
                  / not posted / not exported / not billed.
                </p>
                <p
                  className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50/80 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-accounting-handoff-gl-audit-review-generation="true"
                >
                  No GL record generated. No journal entry generated. No accounting handoff generated. No audit export
                  file generated. No customer account posting generated. No invoice number generated. No PDF generated.
                  No payment link generated. No payment record generated. No remittance record generated. No dispute
                  record generated. No receivables record generated. No collection action created. No credit note
                  generated. No write-off record generated. No accounting record generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-[10px] leading-[1.15] text-slate-500"
            data-mock-accounting-handoff-gl-audit-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, payment, statement release, account charge, approval
            persistence, payment allocation persistence, remittance persistence, dispute persistence, AR close
            persistence, GL close persistence, accounting handoff persistence, journal entry persistence, audit export
            persistence, PDF, receivables record, collection record, credit note, write-off record, customer account
            posting, payment record, remittance record, dispute record, AR close record, GL record, journal entry,
            accounting handoff record, audit export file, storage, API call, save, post, reconcile, allocate, dispute,
            close, export, notification, reminder, follow-up, collection, credit, write-off, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock audit evidence packet finance close sign-off and archive-readiness QA review"
          className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-audit-evidence-finance-archive-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-amber-700">Audit Evidence</span>{" "}
                <span className="text-slate-600">Finance / Archive QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-amber-200 bg-amber-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-audit-evidence-finance-archive-review-copy="true"
              >
                Static/mock audit evidence packet, finance close sign-off, and archive-readiness QA data only for
                internal review. Nothing is signed off, archived, exported, billed, saved, generated, or sent.
              </p>
              <div className="grid min-w-0 gap-1.5" data-mock-audit-evidence-finance-archive-review-rows="true">
                {[
                  {
                    account: "UBS Priority",
                    accountingHandoff: "Accounting handoff ready",
                    archiveReadiness: "Archive-readiness ready for mock review",
                    auditEvidence: "Audit evidence packet ready",
                    financeSignoff: "Finance close sign-off ready",
                    managerFinanceApproval: "Manager/finance approval not needed",
                    month: "May 2026",
                    archiveDecision: "Ready for mock archive review",
                    status: "Not signed off / not archived / not exported / not billed",
                    unresolvedEvidence: "No unresolved evidence exception carry-forward",
                  },
                  {
                    account: "Ritz-Carlton",
                    accountingHandoff: "Accounting handoff pending",
                    archiveReadiness: "Archive-readiness pending",
                    auditEvidence: "Evidence exception needs review",
                    financeSignoff: "Finance sign-off needed",
                    managerFinanceApproval: "Manager/finance approval needed",
                    month: "May 2026",
                    archiveDecision: "Hold finance sign-off",
                    status: "Not signed off / not archived / not exported / not billed",
                    unresolvedEvidence: "Unresolved short-pay evidence exception carried forward",
                  },
                  {
                    account: "VIP Customer",
                    accountingHandoff: "Accounting handoff held",
                    archiveReadiness: "Archive-readiness pending",
                    auditEvidence: "Credit carry-forward evidence pending",
                    financeSignoff: "Finance close sign-off pending",
                    managerFinanceApproval: "Manager/finance approval needed",
                    month: "May 2026",
                    archiveDecision: "Carry evidence before archive",
                    status: "Not signed off / not archived / not exported / not billed",
                    unresolvedEvidence: "Unresolved evidence exception carried forward",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-2 gap-1 rounded-md border border-amber-200 bg-amber-50/75 p-1 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-5 xl:grid-cols-10"
                    data-mock-audit-evidence-finance-archive-review-row={`${row.account}-${row.month}`}
                    key={`${row.account}-${row.month}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Statement month", "Month", row.month],
                      ["Accounting handoff status", "Acct handoff", row.accountingHandoff],
                      ["Audit evidence packet status", "Evidence", row.auditEvidence],
                      ["Finance close sign-off status", "Finance sign-off", row.financeSignoff],
                      ["Archive-readiness status", "Archive ready", row.archiveReadiness],
                      ["Unresolved evidence exception carry-forward status", "Carry", row.unresolvedEvidence],
                      ["Manager/finance approval status", "Mgr/fin QA", row.managerFinanceApproval],
                      ["Mock archive decision status", "Decision", row.archiveDecision],
                      ["Not-signed-off/not-archived/not-exported/not-billed status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-amber-700"
                          data-mock-audit-evidence-finance-archive-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-amber-200 bg-amber-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-audit-evidence-finance-archive-review-note="true"
                >
                  Audit evidence packet review - mock only. Finance close sign-off QA - not saved.
                  Archive-readiness review - not archived. Audit evidence packet ready, finance sign-off needed,
                  archive-readiness pending, manager/finance approval needed, and unresolved evidence exception carried
                  forward. Not signed off / not archived / not exported / not billed.
                </p>
                <p
                  className="min-w-0 rounded-md border border-amber-200 bg-amber-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-audit-evidence-finance-archive-review-generation="true"
                >
                  No audit evidence file generated. No finance sign-off record generated. No archive record generated.
                  No audit export file generated. No GL record generated. No journal entry generated. No accounting
                  handoff generated. No customer account posting generated. No invoice number generated. No PDF
                  generated. No payment link generated. No payment record generated. No remittance record generated.
                  No dispute record generated. No receivables record generated. No collection action created. No
                  credit note generated. No write-off record generated. No accounting record generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-[10px] leading-[1.15] text-slate-500"
            data-mock-audit-evidence-finance-archive-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, payment, statement release, account charge, approval
            persistence, payment allocation persistence, remittance persistence, dispute persistence, AR close
            persistence, GL close persistence, accounting handoff persistence, journal entry persistence, audit export
            persistence, audit evidence persistence, finance sign-off persistence, archive persistence, PDF,
            receivables record, collection record, credit note, write-off record, customer account posting, payment
            record, remittance record, dispute record, AR close record, GL record, journal entry, accounting handoff
            record, audit export file, audit evidence file, finance sign-off record, archive record, storage, API call,
            save, post, reconcile, allocate, dispute, close, export, archive, notification, reminder, follow-up,
            collection, credit, write-off, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock post-close exception reopen audit inquiry retrieval and retention-readiness QA review"
          className="rounded-lg border border-lime-200 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-post-close-audit-retention-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-lime-700">Post-close</span>{" "}
                <span className="text-slate-600">Audit / Retention QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-lime-200 bg-lime-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-post-close-audit-retention-review-copy="true"
              >
                Static/mock post-close exception reopen, audit inquiry retrieval, and retention-readiness QA data only
                for internal review. Nothing is reopened, retrieved, exported, archived, retained, billed, saved,
                generated, or sent.
              </p>
              <div className="grid min-w-0 gap-1.5" data-mock-post-close-audit-retention-review-rows="true">
                {[
                  {
                    account: "UBS Priority",
                    archiveStatus: "Archive-readiness ready for mock lookup",
                    auditInquiryRetrieval: "Audit inquiry retrieval ready",
                    financeClose: "Finance close sign-off ready",
                    month: "May 2026",
                    postCloseException: "Closed account / no reopen needed",
                    reopenApproval: "Reopen approval not needed",
                    retentionReadiness: "Retention-readiness ready",
                    retrievalDecision: "Ready for mock inquiry lookup",
                    status: "Not reopened / not retrieved / not exported / not billed",
                  },
                  {
                    account: "Ritz-Carlton",
                    archiveStatus: "Archive-readiness pending",
                    auditInquiryRetrieval: "Audit inquiry retrieval held",
                    financeClose: "Finance sign-off pending",
                    month: "May 2026",
                    postCloseException: "Post-close exception needs manager review",
                    reopenApproval: "Reopen request blocked pending approval",
                    retentionReadiness: "Retention-readiness pending",
                    retrievalDecision: "Hold mock retrieval",
                    status: "Not reopened / not retrieved / not exported / not billed",
                  },
                  {
                    account: "VIP Customer",
                    archiveStatus: "Archive evidence carried forward",
                    auditInquiryRetrieval: "Audit inquiry retrieval needs evidence QA",
                    financeClose: "Finance close sign-off pending",
                    month: "May 2026",
                    postCloseException: "Unresolved evidence exception carried forward",
                    reopenApproval: "Manager/finance approval needed",
                    retentionReadiness: "Retention-readiness pending",
                    retrievalDecision: "Carry exception before retrieval",
                    status: "Not reopened / not retrieved / not exported / not billed",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-2 gap-1 rounded-md border border-lime-200 bg-lime-50/75 p-1 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-5 xl:grid-cols-10"
                    data-mock-post-close-audit-retention-review-row={`${row.account}-${row.month}`}
                    key={`${row.account}-${row.month}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Statement month", "Month", row.month],
                      ["Finance close status", "Finance close", row.financeClose],
                      ["Archive status", "Archive", row.archiveStatus],
                      ["Post-close exception status", "Post-close", row.postCloseException],
                      ["Audit inquiry retrieval status", "Audit retrieval", row.auditInquiryRetrieval],
                      ["Retention-readiness status", "Retention", row.retentionReadiness],
                      ["Reopen approval status", "Reopen QA", row.reopenApproval],
                      ["Mock retrieval decision status", "Decision", row.retrievalDecision],
                      ["Not-reopened/not-retrieved/not-exported/not-billed status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-lime-700"
                          data-mock-post-close-audit-retention-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-lime-200 bg-lime-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-post-close-audit-retention-review-note="true"
                >
                  Post-close exception review - mock only. Audit inquiry retrieval QA - not saved.
                  Retention-readiness review - not archived. Closed account/no reopen needed, audit inquiry retrieval
                  ready, post-close exception needs manager review, retention-readiness pending, reopen request blocked
                  pending approval, and unresolved evidence exception carried forward. Not reopened / not retrieved /
                  not exported / not billed.
                </p>
                <p
                  className="min-w-0 rounded-md border border-lime-200 bg-lime-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-post-close-audit-retention-review-generation="true"
                >
                  No post-close exception record generated. No audit inquiry record generated. No retrieval/export file
                  generated. No retention record generated. No audit evidence file generated. No finance sign-off
                  record generated. No archive record generated. No audit export file generated. No GL record
                  generated. No journal entry generated. No accounting handoff generated. No customer account posting
                  generated. No invoice number generated. No PDF generated. No payment link generated. No payment
                  record generated. No remittance record generated. No dispute record generated. No receivables record
                  generated. No collection action created. No credit note generated. No write-off record generated. No
                  accounting record generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-[10px] leading-[1.15] text-slate-500"
            data-mock-post-close-audit-retention-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, payment, statement release, account charge, approval
            persistence, payment allocation persistence, remittance persistence, dispute persistence, AR close
            persistence, GL close persistence, accounting handoff persistence, journal entry persistence, audit export
            persistence, audit evidence persistence, finance sign-off persistence, archive persistence, retention
            persistence, post-close exception persistence, audit inquiry persistence, retrieval/export persistence, PDF,
            receivables record, collection record, credit note, write-off record, customer account posting, payment
            record, remittance record, dispute record, AR close record, GL record, journal entry, accounting handoff
            record, audit export file, audit evidence file, finance sign-off record, archive record, retention record,
            post-close exception record, audit inquiry record, retrieval/export file, storage, API call, save, post,
            reconcile, allocate, dispute, close, reopen, retrieve, export, archive, retain, notification, reminder,
            follow-up, collection, credit, write-off, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock close-cycle evidence index audit inquiry response packet and retention exception approval QA review"
          className="rounded-lg border border-cyan-200 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-close-cycle-evidence-response-retention-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-cyan-700">Close-cycle</span>{" "}
                <span className="text-slate-600">Evidence / Response QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-close-cycle-evidence-response-retention-review-copy="true"
              >
                Static/mock close-cycle evidence index, audit inquiry response packet, and retention exception approval
                QA data only for internal review. Nothing is indexed, approved, exported, billed, saved, generated, or
                sent.
              </p>
              <div
                className="grid min-w-0 gap-1.5"
                data-mock-close-cycle-evidence-response-retention-review-rows="true"
              >
                {[
                  {
                    account: "UBS Priority",
                    auditInquiryResponse: "Audit inquiry response packet ready",
                    evidenceCarryForward: "No unresolved evidence carry-forward",
                    evidenceIndex: "Evidence index ready",
                    month: "May 2026",
                    postCloseReview: "Post-close review complete / no reopen",
                    responseDecision: "Ready for mock response packet QA",
                    responsePacketCompleteness: "Response packet complete",
                    retentionExceptionApproval: "Retention exception approval not needed",
                    status: "Not indexed / not approved / not exported / not billed",
                  },
                  {
                    account: "Ritz-Carlton",
                    auditInquiryResponse: "Audit inquiry response packet held",
                    evidenceCarryForward: "Unresolved short-pay evidence carried forward",
                    evidenceIndex: "Missing evidence requires follow-up",
                    month: "May 2026",
                    postCloseReview: "Post-close exception needs manager review",
                    responseDecision: "Hold mock response packet",
                    responsePacketCompleteness: "Response packet blocked pending manager review",
                    retentionExceptionApproval: "Retention exception needs approval",
                    status: "Not indexed / not approved / not exported / not billed",
                  },
                  {
                    account: "VIP Customer",
                    auditInquiryResponse: "Audit inquiry response needs evidence QA",
                    evidenceCarryForward: "Carried evidence exception remains unresolved",
                    evidenceIndex: "Evidence index missing exception item",
                    month: "May 2026",
                    postCloseReview: "Unresolved evidence exception carried forward",
                    responseDecision: "Carry evidence before response",
                    responsePacketCompleteness: "Response packet incomplete",
                    retentionExceptionApproval: "Retention exception approval needed",
                    status: "Not indexed / not approved / not exported / not billed",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-2 gap-1 rounded-md border border-cyan-200 bg-cyan-50/75 p-1 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-5 xl:grid-cols-10"
                    data-mock-close-cycle-evidence-response-retention-review-row={`${row.account}-${row.month}`}
                    key={`${row.account}-${row.month}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Statement month", "Month", row.month],
                      ["Post-close review status", "Post-close", row.postCloseReview],
                      ["Evidence index status", "Evidence index", row.evidenceIndex],
                      ["Audit inquiry response status", "Audit response", row.auditInquiryResponse],
                      ["Response packet completeness status", "Packet", row.responsePacketCompleteness],
                      ["Retention exception approval status", "Retention approval", row.retentionExceptionApproval],
                      ["Evidence carry-forward status", "Carry", row.evidenceCarryForward],
                      ["Mock response decision status", "Decision", row.responseDecision],
                      ["Not-indexed/not-approved/not-exported/not-billed status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-cyan-700"
                          data-mock-close-cycle-evidence-response-retention-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-close-cycle-evidence-response-retention-review-note="true"
                >
                  Close-cycle evidence index - mock only. Audit inquiry response packet - not saved. Retention
                  exception approval - not approved. Evidence index ready, audit inquiry response packet ready, missing
                  evidence requires follow-up, retention exception needs approval, response packet blocked pending
                  manager review, and carried evidence exception remains unresolved. Not indexed / not approved / not
                  exported / not billed.
                </p>
                <p
                  className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-close-cycle-evidence-response-retention-review-generation="true"
                >
                  No evidence index generated. No audit response packet generated. No retention approval record
                  generated. No post-close exception record generated. No audit inquiry record generated. No
                  retrieval/export file generated. No retention record generated. No audit evidence file generated. No
                  finance sign-off record generated. No archive record generated. No audit export file generated. No GL
                  record generated. No journal entry generated. No accounting handoff generated. No customer account
                  posting generated. No invoice number generated. No PDF generated. No payment link generated. No
                  payment record generated. No remittance record generated. No dispute record generated. No receivables
                  record generated. No collection action created. No credit note generated. No write-off record
                  generated. No accounting record generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-[10px] leading-[1.15] text-slate-500"
            data-mock-close-cycle-evidence-response-retention-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, payment, statement release, account charge, approval
            persistence, payment allocation persistence, remittance persistence, dispute persistence, AR close
            persistence, GL close persistence, accounting handoff persistence, journal entry persistence, audit export
            persistence, audit evidence persistence, finance sign-off persistence, archive persistence, retention
            persistence, post-close exception persistence, audit inquiry persistence, retrieval/export persistence,
            response packet persistence, retention exception approval persistence, close-cycle evidence index
            persistence, evidence index persistence, PDF, receivables record, collection record, credit note, write-off
            record, customer account posting, payment record, remittance record, dispute record, AR close record, GL
            record, journal entry, accounting handoff record, audit export file, audit evidence file, finance sign-off
            record, archive record, retention record, post-close exception record, audit inquiry record,
            retrieval/export file, response packet, evidence index, storage, API call, save, post, reconcile, allocate,
            dispute, close, reopen, retrieve, export, archive, retain, approve, index, notification, reminder,
            follow-up, collection, credit, write-off, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock internal close-cycle exception resolution and audit response handoff QA review"
          className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-close-cycle-exception-resolution-audit-handoff-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-rose-700">Close-cycle</span>{" "}
                <span className="text-slate-600">Exception / Handoff QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-rose-200 bg-rose-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-close-cycle-exception-resolution-audit-handoff-review-copy="true"
              >
                Static/mock internal close-cycle exception resolution, audit response handoff, and retention exception
                disposition QA data only for internal review. Nothing is resolved, handed off, exported, billed, saved,
                generated, approved, indexed, or sent.
              </p>
              <div
                className="grid min-w-0 gap-1.5"
                data-mock-close-cycle-exception-resolution-audit-handoff-review-rows="true"
              >
                {[
                  {
                    account: "UBS Priority",
                    auditHandoff: "Handoff ready",
                    carriedResolution: "No carried exception",
                    closeCycleEvidence: "Evidence ready",
                    followUpQueue: "No evidence follow-up needed",
                    managerReview: "Approved - mock only",
                    month: "May 2026",
                    resolutionDecision: "Ready for mock handoff QA",
                    retentionDisposition: "Not needed",
                    status: "Not resolved / not handed off / not exported / not billed",
                  },
                  {
                    account: "Ritz-Carlton",
                    auditHandoff: "Handoff held",
                    carriedResolution: "Short-pay evidence open",
                    closeCycleEvidence: "Missing evidence requires follow-up",
                    followUpQueue: "Follow-up queued",
                    managerReview: "Blocked pending manager review",
                    month: "May 2026",
                    resolutionDecision: "Hold mock handoff",
                    retentionDisposition: "Disposition pending",
                    status: "Not resolved / not handed off / not exported / not billed",
                  },
                  {
                    account: "VIP Customer",
                    auditHandoff: "Waiting for evidence QA",
                    carriedResolution: "Carried exception still unresolved",
                    closeCycleEvidence: "Carried evidence exception remains unresolved",
                    followUpQueue: "Queue active",
                    managerReview: "Outcome pending",
                    month: "May 2026",
                    resolutionDecision: "Carry exception before handoff",
                    retentionDisposition: "Needs approval",
                    status: "Not resolved / not handed off / not exported / not billed",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-2 gap-1 rounded-md border border-rose-200 bg-rose-50/75 p-1 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-5 xl:grid-cols-10"
                    data-mock-close-cycle-exception-resolution-audit-handoff-review-row={`${row.account}-${row.month}`}
                    key={`${row.account}-${row.month}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Statement month", "Month", row.month],
                      ["Close-cycle evidence status", "Evidence", row.closeCycleEvidence],
                      ["Manager review outcome status", "Mgr review", row.managerReview],
                      ["Evidence follow-up queue status", "Follow-up", row.followUpQueue],
                      ["Audit response handoff status", "Audit handoff", row.auditHandoff],
                      ["Retention exception disposition status", "Retention disp", row.retentionDisposition],
                      ["Carried exception resolution status", "Carry", row.carriedResolution],
                      ["Mock resolution decision status", "Decision", row.resolutionDecision],
                      ["Not-resolved/not-handed-off/not-exported/not-billed status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-rose-700"
                          data-mock-close-cycle-exception-resolution-audit-handoff-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-rose-200 bg-rose-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-close-cycle-exception-resolution-audit-handoff-review-note="true"
                >
                  Close-cycle exception resolution - mock only. Audit response handoff QA - not saved. Retention
                  exception disposition - not approved. Manager review approved - mock only, evidence follow-up queued,
                  audit response handoff ready, retention exception disposition pending, resolution blocked pending
                  manager review, and carried exception still unresolved. Not resolved / not handed off / not exported /
                  not billed.
                </p>
                <p
                  className="min-w-0 rounded-md border border-rose-200 bg-rose-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-close-cycle-exception-resolution-audit-handoff-review-generation="true"
                >
                  No exception resolution record generated. No audit response handoff record generated. No retention
                  approval record generated. No evidence index generated. No audit response packet generated. No
                  post-close exception record generated. No audit inquiry record generated. No retrieval/export file
                  generated. No retention record generated. No audit evidence file generated. No finance sign-off
                  record generated. No archive record generated. No audit export file generated. No GL record
                  generated. No journal entry generated. No accounting handoff generated. No customer account posting
                  generated. No invoice number generated. No PDF generated. No payment link generated. No payment
                  record generated. No invoice/payment/PDF generated. No remittance record generated. No dispute record
                  generated. No receivables record generated. No collection action created. No credit note generated. No
                  write-off record generated. No accounting record generated. No waiting-time record generated. No
                  extra-charge record generated. No customer charge record generated. No driver payout record generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-[10px] leading-[1.15] text-slate-500"
            data-mock-close-cycle-exception-resolution-audit-handoff-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, payment, statement release, account charge, approval
            persistence, payment allocation persistence, remittance persistence, dispute persistence, AR close
            persistence, GL close persistence, accounting handoff persistence, journal entry persistence, audit export
            persistence, audit evidence persistence, finance sign-off persistence, archive persistence, retention
            persistence, post-close exception persistence, audit inquiry persistence, retrieval/export persistence,
            response packet persistence, retention exception approval persistence, close-cycle evidence index
            persistence, evidence index persistence, exception resolution persistence, audit response handoff
            persistence, waiting-time persistence, extra-charge persistence, PDF, receivables record, collection record,
            credit note, write-off record, customer account posting, payment record, remittance record, dispute record,
            AR close record, GL record, journal entry, accounting handoff record, audit export file, audit evidence
            file, finance sign-off record, archive record, retention record, post-close exception record, audit inquiry
            record, retrieval/export file, response packet, evidence index, exception resolution record, audit response
            handoff record, retention approval record, waiting-time record, extra-charge record, customer charge record,
            driver payout record, storage, API call, save, post, reconcile, allocate, dispute, close, reopen, retrieve,
            export, archive, retain, approve, index, resolve, handoff, notification, reminder, follow-up, collection,
            credit, write-off, or send behavior.
          </p>
        </section>

        <section
          aria-label="Extra Charges Control Center Mock Only"
          className="rounded-lg border border-teal-200 bg-white px-3 py-2 shadow-sm"
          data-mock-extra-charges-control-center="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-teal-700">Extra Charges Control Center</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-extra-charges-control-center-copy="true"
                >
                  Internal/admin-only consolidated Extra Charges QA preview for Waiting Time, Extra Stops, Midnight
                  Charge, grouping, separation, variance, reconciliation, dispatcher handoff, billing decisions, payout
                  decisions, and the local-only midnight override preview. Static/mock/local only.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-semibold uppercase text-teal-700">
                Mock Only / no actions
              </p>
            </div>

            <div
              className="grid min-w-0 gap-1.5 rounded-md border border-teal-200 bg-teal-50/70 p-2 text-[10px] leading-[1.15] text-slate-800 sm:grid-cols-2 lg:grid-cols-4"
              data-mock-extra-charges-control-center-summary="true"
            >
              {[
                ["Display group", "Extra Charges"],
                ["Scope", "Waiting Time / Extra Stops / Midnight Charge"],
                ["Review mode", "Mock/local/static with local-only override preview"],
                ["Workflow boundary", "No billing, invoice, payment, PDF, payout, accounting, storage, API, Supabase, or notifications"],
              ].map(([label, value]) => (
                <p className="min-w-0 break-words" key={label}>
                  <span className="block font-semibold uppercase text-teal-700">{label}</span>
                  <span>{value}</span>
                </p>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5" data-mock-extra-charges-control-center-rows="true">
              {[
                {
                  billingDecision: "Customer billing approved in mock review",
                  chargeType: "Waiting Time",
                  customerChargeRule: "$15 customer per 15-minute waiting block",
                  detectionReviewStatus: "2 waiting blocks need dispatcher variance review",
                  dispatcherHandoff: "Dispatcher handoff pending / driver payout reconciliation pending",
                  displayGroup: "Extra Charges",
                  driverPayoutRule: "$10 driver per 15-minute waiting block",
                  internalSeparation: "Waiting Time source stays separate from Extra Stops and Midnight Charge",
                  nextAction: "Confirm waiting block evidence before future billing or payout review",
                  payoutDecision: "Driver payout approved in mock review",
                },
                {
                  billingDecision: "Hold for dispatcher confirmation; no billing created",
                  chargeType: "Extra Stops",
                  customerChargeRule: "Extra-stop customer charge reviewed separately",
                  detectionReviewStatus: "Route extra review pending",
                  dispatcherHandoff: "Route variance and dispatcher approval handoff pending",
                  displayGroup: "Extra Charges",
                  driverPayoutRule: "Extra-stop driver payout reviewed separately",
                  internalSeparation: "Extra Stops source stays separate from Waiting Time and Midnight Charge",
                  nextAction: "Confirm route extra before any future billing or payout review",
                  payoutDecision: "Hold separately; no payout created",
                },
                {
                  billingDecision: "Customer billing waived in mock example",
                  chargeType: "Midnight Charge",
                  customerChargeRule: "$15 customer midnight charge",
                  detectionReviewStatus: "Detected for 23:00 / 11:00pm and 06:59 / 6:59am; not detected for 07:00 / 7:00am and 22:59 / 10:59pm",
                  dispatcherHandoff: "Waiver note and driver payout reconciliation reviewed separately",
                  displayGroup: "Extra Charges",
                  driverPayoutRule: "$10 driver midnight payout",
                  internalSeparation: "Midnight Charge source stays separate from Waiting Time and Extra Stops",
                  nextAction: "Review driver payout even though customer charge is waived",
                  payoutDecision: "Driver payout still reviewed separately",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 grid-cols-2 gap-1 rounded-md border border-teal-200 bg-white p-1.5 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-3 xl:grid-cols-[repeat(10,minmax(0,1fr))]"
                  data-mock-extra-charges-control-center-row={row.chargeType}
                  key={row.chargeType}
                >
                  {[
                    ["Charge type", "Type", row.chargeType],
                    ["Display group", "Group", row.displayGroup],
                    ["Customer charge rule", "Customer", row.customerChargeRule],
                    ["Driver payout rule", "Driver", row.driverPayoutRule],
                    ["Detection / review status", "Detect / QA", row.detectionReviewStatus],
                    ["Billing decision", "Billing", row.billingDecision],
                    ["Payout decision", "Payout", row.payoutDecision],
                    ["Dispatcher handoff / reconciliation status", "Handoff", row.dispatcherHandoff],
                    ["Internal separation status", "Separate", row.internalSeparation],
                    ["Next internal action", "Next", row.nextAction],
                  ].map(([label, shortLabel, value]) => (
                    <p className="min-w-0 break-words" key={label}>
                      <span
                        className="block font-semibold uppercase text-teal-700"
                        data-mock-extra-charges-control-center-column={label}
                      >
                        {shortLabel}
                      </span>
                      <span>{value}</span>
                    </p>
                  ))}
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div
                className="grid min-w-0 gap-1.5 rounded-md border border-sky-200 bg-sky-50/75 p-2"
                data-mock-extra-charges-control-center-detection="true"
              >
                <p className="text-[10px] font-semibold uppercase leading-[1.1] text-sky-700">
                  Midnight detection examples
                </p>
                <div className="grid min-w-0 gap-1 sm:grid-cols-2">
                  {[
                    { boundary: "11:00pm included", time: "23:00 / 11:00pm", value: "23:00" },
                    { boundary: "6:59am included", time: "06:59 / 6:59am", value: "06:59" },
                    { boundary: "7:00am excluded", time: "07:00 / 7:00am", value: "07:00" },
                    { boundary: "10:59pm excluded", time: "22:59 / 10:59pm", value: "22:59" },
                  ].map((row) => {
                    const detected = isMockMidnightChargeDetected(row.value);
                    return (
                      <p
                        className="min-w-0 rounded-md border border-sky-200 bg-white px-2 py-1 text-[10px] font-medium leading-[1.15] text-slate-800"
                        data-mock-extra-charges-control-center-detection-row={row.value}
                        key={row.value}
                      >
                        <span className="block font-semibold uppercase text-sky-700">{row.time}</span>
                        <span>{detected ? "Detected" : "Not detected"} - {row.boundary}</span>
                      </p>
                    );
                  })}
                </div>
              </div>

              <div
                className="grid min-w-0 gap-1.5 rounded-md border border-sky-200 bg-sky-50/75 p-2 text-[10px] leading-[1.15] text-slate-700 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]"
                data-mock-extra-charges-control-center-override-preview="true"
              >
                <label className="grid min-w-0 gap-1">
                  <span className="font-semibold uppercase text-sky-700">Manual Override Mock Only</span>
                  <select
                    className="min-h-9 w-full rounded-md border border-sky-200 bg-white px-2 text-[11px] text-slate-800"
                    data-mock-midnight-charge-override-mode="true"
                    value={mockMidnightChargeOverrideMode}
                    onChange={(event) =>
                      setMockMidnightChargeOverrideMode(event.target.value as "auto" | "force-on" | "force-off")
                    }
                  >
                    <option value="auto">Use auto-detection - Mock Only</option>
                    <option value="force-on">Override to apply Midnight Charge - Mock Only</option>
                    <option value="force-off">Override to remove Midnight Charge - Mock Only</option>
                  </select>
                </label>
                <label className="grid min-w-0 gap-1">
                  <span className="font-semibold uppercase text-sky-700">Override Reason Mock Only</span>
                  <input
                    className="min-h-9 w-full rounded-md border border-sky-200 bg-white px-2 text-[11px] text-slate-800"
                    data-mock-midnight-charge-override-reason="true"
                    placeholder="Blank by default"
                    type="text"
                    value={mockMidnightChargeOverrideReason}
                    onChange={(event) => setMockMidnightChargeOverrideReason(event.target.value)}
                  />
                </label>
                <p
                  className="min-w-0 rounded-md border border-sky-200 bg-white px-2 py-1.5 font-medium"
                  data-mock-midnight-charge-override-preview-status="true"
                >
                  Staff override preview - mock only and local-only. Auto sample: 22:59 / 10:59pm is not detected.
                  Current preview: {mockMidnightChargeOverrideStatus}. Override Reason blank by default; current
                  reason is {mockMidnightChargeOverrideReason ? "entered locally only" : "blank"}.
                </p>
              </div>
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-extra-charges-control-center-rules="true"
              >
                Locked rules - mock only. Waiting Time: 1 waiting block = 15 minutes, customer waiting charge $15 per
                waiting block, driver waiting payout $10 per waiting block. Midnight Charge: customer charge $15,
                driver payout $10, applies from 11:00pm / 23:00 through 6:59am / 06:59 inclusive; 7:00am / 07:00 and
                10:59pm / 22:59 are excluded.
              </p>
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-extra-charges-control-center-separation="true"
              >
                Display and decision separation - mock only. Waiting Time, Extra Stops, and Midnight Charge may display
                together under Extra Charges, but each charge type remains internally distinct. Customer billing
                approval and driver payout approval are separate decisions. A waived customer charge does not
                automatically cancel driver payout review.
              </p>
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-extra-charges-control-center-generation="true"
              >
                Consolidated control center only. No real extra-charge workflow, approval workflow, combined charge
                calculation, invoice, payment link, PDF, payout, accounting posting, finance export, customer charge
                record, driver payout record, override record, audit record, or customer notification is created.
              </p>
            </div>
          </div>
          <p
            className="mt-1 text-[10px] leading-[1.15] text-slate-500"
            data-mock-extra-charges-control-center-boundary="true"
          >
            Mock/local only. No real extra-charge workflow, approval workflow, combined charge calculation, billing
            automation, monthly invoice, invoice generation, payment link, PDF generation, accounting integration,
            finance export, customer account, customer auth, or driver payout creation. No waiting-time persistence,
            extra-stop persistence, midnight-charge persistence, approval-decision persistence, customer-charge
            persistence, or driver-payout persistence. No save/load behavior,
            storage/localStorage/sessionStorage/cookies/IndexedDB, API call/fetch/XHR/sendBeacon/WebSocket, Supabase,
            parser file changes, package script changes, test:safe membership changes, message-channel delivery,
            customer notification, notification, or send behavior.
          </p>
        </section>

        {showLegacyExtraChargeQaSections ? (
          <>
        <section
          aria-label="Mock waiting time extra charges pricing and driver payout planning QA review"
          className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-waiting-time-extra-charges-planning-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-amber-700">Waiting Time</span>{" "}
                <span className="text-slate-600">Extra Charges QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-amber-200 bg-amber-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-waiting-time-extra-charges-planning-review-copy="true"
              >
                Static/mock waiting-time, extra-charge pricing, and driver payout planning QA data only for internal
                review. Nothing is billed, paid, posted, saved, calculated as a real price, generated, exported, or
                sent.
              </p>
              <div
                className="grid min-w-0 gap-1.5"
                data-mock-waiting-time-extra-charges-planning-review-rows="true"
              >
                {[
                  {
                    account: "UBS Priority",
                    customerPreview: "No customer extra charge preview",
                    customerWaitingCharge: "$15 per block",
                    dispatcherReview: "No review needed",
                    driverPayoutPreview: "No driver payout preview",
                    driverWaitingPayout: "$10 per block",
                    extraChargeType: "No waiting / no extra stop",
                    extraStopReview: "No extra stop review",
                    jobRef: "May 2026 / JOB-UBS-042",
                    minutesPerBlock: "15 minutes",
                    pricingDecision: "No waiting time / no extra charge",
                    status: "Not billed / not paid / not posted / not saved",
                    waitingBlocks: "0 blocks",
                  },
                  {
                    account: "Ritz-Carlton",
                    customerPreview: "Waiting blocks ready for dispatcher review",
                    customerWaitingCharge: "$15 per block",
                    dispatcherReview: "Dispatcher review pending",
                    driverPayoutPreview: "Driver payout preview needs dispatcher confirmation",
                    driverWaitingPayout: "$10 per block",
                    extraChargeType: "Waiting time only",
                    extraStopReview: "Extra stops separate / none",
                    jobRef: "May 2026 / JOB-RITZ-118",
                    minutesPerBlock: "15 minutes",
                    pricingDecision: "Customer charge preview blocked from real billing",
                    status: "Not billed / not paid / not posted / not saved",
                    waitingBlocks: "2 blocks",
                  },
                  {
                    account: "VIP Customer",
                    customerPreview: "Extra stop preview only / no wait charge",
                    customerWaitingCharge: "$15 per block",
                    dispatcherReview: "Dispatcher confirms route extra",
                    driverPayoutPreview: "Extra stop payout preview not paid",
                    driverWaitingPayout: "$10 per block",
                    extraChargeType: "Extra stop only",
                    extraStopReview: "Extra stop charge reviewed separately",
                    jobRef: "May 2026 / JOB-VIP-207",
                    minutesPerBlock: "15 minutes",
                    pricingDecision: "Keep waiting time separate",
                    status: "Not billed / not paid / not posted / not saved",
                    waitingBlocks: "0 blocks",
                  },
                  {
                    account: "UBS Priority",
                    customerPreview: "Extra Charges preview groups waiting + stop",
                    customerWaitingCharge: "$15 per block",
                    dispatcherReview: "Needs dispatcher confirmation",
                    driverPayoutPreview: "Waiting payout preview plus stop payout",
                    driverWaitingPayout: "$10 per block",
                    extraChargeType: "Waiting time + extra stop",
                    extraStopReview: "Extra stop reviewed separately",
                    jobRef: "May 2026 / JOB-UBS-209",
                    minutesPerBlock: "15 minutes",
                    pricingDecision: "Mock combined display only",
                    status: "Not billed / not paid / not posted / not saved",
                    waitingBlocks: "3 blocks",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-2 gap-1 rounded-md border border-amber-200 bg-amber-50/75 p-1 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-4 xl:grid-cols-[repeat(13,minmax(0,1fr))]"
                    data-mock-waiting-time-extra-charges-planning-review-row={`${row.account}-${row.jobRef}`}
                    key={`${row.account}-${row.jobRef}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Statement month or job reference", "Job ref", row.jobRef],
                      ["Extra charge type", "Type", row.extraChargeType],
                      ["Waiting blocks", "Blocks", row.waitingBlocks],
                      ["Minutes per block", "Min/block", row.minutesPerBlock],
                      ["Customer waiting charge per block", "Cust wait", row.customerWaitingCharge],
                      ["Driver waiting payout per block", "Driver wait", row.driverWaitingPayout],
                      ["Extra stop review status", "Stop review", row.extraStopReview],
                      ["Customer extra-charge preview status", "Cust preview", row.customerPreview],
                      ["Driver payout preview status", "Driver preview", row.driverPayoutPreview],
                      ["Dispatcher review status", "Dispatch QA", row.dispatcherReview],
                      ["Mock pricing decision status", "Decision", row.pricingDecision],
                      ["Not-billed/not-paid/not-posted/not-saved status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-amber-700"
                          data-mock-waiting-time-extra-charges-planning-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-amber-200 bg-amber-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-waiting-time-extra-charges-planning-review-note="true"
                >
                  Waiting time pricing review - mock only. 1 waiting block = 15 minutes. Customer waiting charge: $15
                  per block. Driver waiting payout: $10 per block. Waiting time remains separate from extra stops
                  internally and remains internally distinct from extra stops. Extra Charges display may group waiting
                  time and extra stops. No waiting time / no extra charge, waiting time blocks ready for dispatcher
                  review, extra stop charge reviewed separately, waiting time plus extra stop shown under Extra Charges
                  preview, driver payout preview needs dispatcher confirmation, and customer charge preview blocked
                  from real billing. Not billed / not paid / not posted / not saved.
                </p>
                <p
                  className="min-w-0 rounded-md border border-amber-200 bg-amber-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-waiting-time-extra-charges-planning-review-generation="true"
                >
                  No customer charge record generated. No driver payout record generated. No waiting-time record
                  generated. No extra-charge record generated. No invoice number generated. No PDF generated. No
                  payment link generated. No receivables record generated. No collection action created. No credit note
                  generated. No write-off record generated. No accounting record generated. No invoice/payment/PDF
                  generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-[10px] leading-[1.15] text-slate-500"
            data-mock-waiting-time-extra-charges-planning-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, payment, statement release, customer charge, driver
            payout, waiting-time persistence, extra-charge persistence, customer-charge persistence, driver-payout
            persistence, approval persistence, account charge, PDF, receivables record, collection record, credit note,
            write-off record, customer account posting, accounting record, payment record, remittance record, dispute
            record, storage, API call, fetch, XHR, sendBeacon, WebSocket, Supabase, save, post,
            calculate-real-price, pay, bill, export, notification, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock extra charges variance dispatcher approval and driver payout reconciliation QA review"
          className="rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-extra-charges-variance-approval-reconciliation-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-teal-700">Extra Charges</span>{" "}
                <span className="text-slate-600">Variance / Approval QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-extra-charges-variance-approval-reconciliation-review-copy="true"
              >
                Static/mock extra-charge variance, dispatcher approval handoff, and driver payout reconciliation QA
                data only for internal review. Nothing is billed, paid, approved, posted, saved, reconciled,
                generated, exported, or sent.
              </p>
              <div
                className="grid min-w-0 gap-1.5"
                data-mock-extra-charges-variance-approval-reconciliation-review-rows="true"
              >
                {[
                  {
                    account: "UBS Priority",
                    chargeSource: "No waiting / no extra stop",
                    customerChargeReview: "No customer charge variance",
                    customerWaitingCharge: "$15 per block",
                    dispatcherApprovalHandoff: "No approval handoff needed",
                    driverPayoutReconciliation: "No driver payout variance",
                    driverWaitingPayout: "$10 per block",
                    extraStopReview: "No extra-stop review",
                    jobRef: "May 2026 / JOB-UBS-042",
                    status: "Not approved / not billed / not paid / not saved",
                    waitingBlockRule: "15 minutes per block",
                    waitingVariance: "No waiting-time variance",
                  },
                  {
                    account: "Ritz-Carlton",
                    chargeSource: "Waiting time only",
                    customerChargeReview: "Customer waiting charge review pending",
                    customerWaitingCharge: "$15 per block",
                    dispatcherApprovalHandoff: "Dispatcher approval handoff pending",
                    driverPayoutReconciliation: "Driver waiting payout reconciliation pending",
                    driverWaitingPayout: "$10 per block",
                    extraStopReview: "Extra stops separate / none",
                    jobRef: "May 2026 / JOB-RITZ-118",
                    status: "Not approved / not billed / not paid / not saved",
                    waitingBlockRule: "15 minutes per block",
                    waitingVariance: "2 waiting blocks need review",
                  },
                  {
                    account: "VIP Customer",
                    chargeSource: "Extra stop only",
                    customerChargeReview: "Extra-stop customer charge review pending",
                    customerWaitingCharge: "$15 per block",
                    dispatcherApprovalHandoff: "Route extra handoff pending",
                    driverPayoutReconciliation: "Extra-stop payout reconciliation not paid",
                    driverWaitingPayout: "$10 per block",
                    extraStopReview: "Extra stop reviewed separately",
                    jobRef: "May 2026 / JOB-VIP-207",
                    status: "Not approved / not billed / not paid / not saved",
                    waitingBlockRule: "15 minutes per block",
                    waitingVariance: "No waiting-time variance",
                  },
                  {
                    account: "UBS Priority",
                    chargeSource: "Waiting time + extra stop",
                    customerChargeReview: "Combined Extra Charges display needs review",
                    customerWaitingCharge: "$15 per block",
                    dispatcherApprovalHandoff: "Dispatcher approval handoff needs confirmation",
                    driverPayoutReconciliation: "Waiting payout plus stop payout reconciliation pending",
                    driverWaitingPayout: "$10 per block",
                    extraStopReview: "Extra stop kept separate internally",
                    jobRef: "May 2026 / JOB-UBS-209",
                    status: "Not approved / not billed / not paid / not saved",
                    waitingBlockRule: "15 minutes per block",
                    waitingVariance: "3 waiting blocks need review",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-2 gap-1 rounded-md border border-teal-200 bg-teal-50/75 p-1 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-4 xl:grid-cols-[repeat(12,minmax(0,1fr))]"
                    data-mock-extra-charges-variance-approval-reconciliation-review-row={`${row.account}-${row.jobRef}`}
                    key={`${row.account}-${row.jobRef}`}
                  >
                    {[
                      ["Customer/account", "Acct", row.account],
                      ["Statement month or job reference", "Job ref", row.jobRef],
                      ["Charge source", "Source", row.chargeSource],
                      ["Waiting block rule", "Block rule", row.waitingBlockRule],
                      ["Customer waiting charge per block", "Cust wait", row.customerWaitingCharge],
                      ["Driver waiting payout per block", "Driver wait", row.driverWaitingPayout],
                      ["Extra-stop review status", "Stop review", row.extraStopReview],
                      ["Waiting-time variance status", "Wait variance", row.waitingVariance],
                      ["Customer charge review status", "Cust review", row.customerChargeReview],
                      ["Driver payout reconciliation status", "Driver recon", row.driverPayoutReconciliation],
                      ["Dispatcher approval handoff status", "Approval handoff", row.dispatcherApprovalHandoff],
                      ["Not-approved/not-billed/not-paid/not-saved status", "Status", row.status],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-teal-700"
                          data-mock-extra-charges-variance-approval-reconciliation-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-extra-charges-variance-approval-reconciliation-review-note="true"
                >
                  Extra charges variance review - mock only. 1 waiting block = 15 minutes. Customer waiting charge:
                  $15 per block. Driver waiting payout: $10 per block. Waiting time remains separate from extra stops
                  internally and remains internally distinct from extra stops. Extra Charges display may group waiting
                  time and extra stops, but variance review keeps waiting-time and extra-stop sources separate before
                  any future billing or payout work. Not approved / not billed / not paid / not saved.
                </p>
                <p
                  className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-extra-charges-variance-approval-reconciliation-review-generation="true"
                >
                  No dispatcher approval record generated. No driver payout reconciliation record generated. No
                  customer charge record generated. No waiting-time record generated. No extra-charge record generated.
                  No invoice number generated. No PDF generated. No payment link generated. No accounting record
                  generated. No invoice/payment/PDF generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-[10px] leading-[1.15] text-slate-500"
            data-mock-extra-charges-variance-approval-reconciliation-review-boundary="true"
          >
            Mock/local only. No billing automation, invoice, monthly invoice, payment, payment link, PDF, accounting
            integration, customer account, customer auth, waiting-time persistence, extra-charge persistence,
            customer-charge persistence, driver-payout persistence, approval persistence, reconciliation persistence,
            customer charge record, driver payout record, waiting-time record, extra-charge record, dispatcher approval
            record, storage, localStorage, sessionStorage, API call, fetch, XHR, sendBeacon, WebSocket, Supabase, save,
            load, post, reconcile, approve, pay, bill, export, message-channel delivery, customer notification,
            notification, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock midnight charge auto-detection and manual override QA review"
          className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-midnight-charge-auto-detection-override-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-sky-700">Midnight Charge</span>{" "}
                <span className="text-slate-600">Auto-detection / Override QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-sky-200 bg-sky-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-midnight-charge-auto-detection-override-copy="true"
              >
                Static/mock midnight charge auto-detection and manual override preview data only for internal review.
                Nothing is billed, paid, approved, posted, saved, persisted, reconciled, generated, exported, or sent.
              </p>
              <div className="grid min-w-0 gap-1.5" data-mock-midnight-charge-auto-detection-override-rows="true">
                {[
                  {
                    boundary: "11:00pm included",
                    detectionTime: "23:00",
                    displayTime: "23:00 / 11:00pm",
                    overrideCue: "Override allowed if corrected later",
                  },
                  {
                    boundary: "6:59am included",
                    detectionTime: "06:59",
                    displayTime: "06:59 / 6:59am",
                    overrideCue: "Override allowed if pickup time corrected",
                  },
                  {
                    boundary: "7:00am not included",
                    detectionTime: "07:00",
                    displayTime: "07:00 / 7:00am",
                    overrideCue: "Override allowed if booking time was wrong",
                  },
                  {
                    boundary: "10:59pm not included",
                    detectionTime: "22:59",
                    displayTime: "22:59 / 10:59pm",
                    overrideCue: "Override allowed if late-night time was missed",
                  },
                ].map((row) => {
                  const detected = isMockMidnightChargeDetected(row.detectionTime);
                  return (
                    <div
                      className="grid min-w-0 grid-cols-2 gap-1 rounded-md border border-sky-200 bg-sky-50/75 p-1 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-4 xl:grid-cols-[repeat(10,minmax(0,1fr))]"
                      data-mock-midnight-charge-auto-detection-override-row={row.detectionTime}
                      key={row.detectionTime}
                    >
                      {[
                        ["Booking or pickup time", "Time", row.displayTime],
                        ["Window boundary", "Boundary", row.boundary],
                        ["Auto-detection result", "Auto", detected ? "Detected" : "Not detected"],
                        ["Customer midnight charge", "Cust mid", "$15"],
                        ["Driver midnight payout", "Driver mid", "$10"],
                        ["Charge type", "Type", "Midnight Charge"],
                        ["Display group", "Group", "Extra Charges"],
                        ["Internal distinction", "Distinct", "Separate from waiting time and extra stops"],
                        ["Manual override cue", "Override", row.overrideCue],
                        ["Mock status", "Status", detected ? "Mock detected / not billed" : "Mock not detected / not billed"],
                      ].map(([label, shortLabel, value]) => (
                        <p className="min-w-0 break-words" key={label}>
                          <span
                            className="block font-semibold uppercase text-sky-700"
                            data-mock-midnight-charge-auto-detection-override-column={label}
                          >
                            {shortLabel}
                          </span>
                          <span>{value}</span>
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div
                className="grid min-w-0 gap-1.5 rounded-md border border-sky-200 bg-sky-50/75 p-2 text-[10px] leading-[1.15] text-slate-700 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]"
                data-mock-midnight-charge-override-preview="true"
              >
                <label className="grid min-w-0 gap-1">
                  <span className="font-semibold uppercase text-sky-700">Manual Override Mock Only</span>
                  <select
                    className="min-h-9 w-full rounded-md border border-sky-200 bg-white px-2 text-[11px] text-slate-800"
                    data-mock-midnight-charge-override-mode="true"
                    value={mockMidnightChargeOverrideMode}
                    onChange={(event) =>
                      setMockMidnightChargeOverrideMode(event.target.value as "auto" | "force-on" | "force-off")
                    }
                  >
                    <option value="auto">Use auto-detection - Mock Only</option>
                    <option value="force-on">Override to apply Midnight Charge - Mock Only</option>
                    <option value="force-off">Override to remove Midnight Charge - Mock Only</option>
                  </select>
                </label>
                <label className="grid min-w-0 gap-1">
                  <span className="font-semibold uppercase text-sky-700">Override Reason Mock Only</span>
                  <input
                    className="min-h-9 w-full rounded-md border border-sky-200 bg-white px-2 text-[11px] text-slate-800"
                    data-mock-midnight-charge-override-reason="true"
                    placeholder="Blank by default"
                    type="text"
                    value={mockMidnightChargeOverrideReason}
                    onChange={(event) => setMockMidnightChargeOverrideReason(event.target.value)}
                  />
                </label>
                <p
                  className="min-w-0 rounded-md border border-sky-200 bg-white px-2 py-1.5 font-medium"
                  data-mock-midnight-charge-override-preview-status="true"
                >
                  Staff override preview - mock only. Auto sample: 22:59 / 10:59pm is not detected. Current preview:{" "}
                  {mockMidnightChargeOverrideStatus}. Override Reason blank by default; current reason is{" "}
                  {mockMidnightChargeOverrideReason ? "entered locally only" : "blank"}.
                </p>
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-2">
                <p
                  className="min-w-0 rounded-md border border-sky-200 bg-sky-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-midnight-charge-auto-detection-override-note="true"
                >
                  Midnight charge auto-detection review - mock only. Midnight charge customer charge: $15. Midnight
                  charge driver payout: $10. Applies when booking time or pickup time is between 11:00pm and 6:59am.
                  11:00pm and 6:59am are included. 7:00am and 10:59pm are not included. Midnight Charge displays
                  under Extra Charges and remains internally distinct from waiting time, extra stops, and all other
                  extra charges. Existing waiting-time rule remains: 1 waiting block = 15 minutes, customer waiting
                  charge $15 per block, driver waiting payout $10 per block, and waiting time remains internally
                  distinct from extra stops.
                </p>
                <p
                  className="min-w-0 rounded-md border border-sky-200 bg-sky-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-midnight-charge-auto-detection-override-generation="true"
                >
                  No midnight-charge record generated. No customer charge record generated. No driver payout record
                  generated. No waiting-time record generated. No extra-charge record generated. No override record
                  generated. No booking record generated. No invoice number generated. No PDF generated. No payment
                  link generated. No accounting record generated. No invoice/payment/PDF generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-[10px] leading-[1.15] text-slate-500"
            data-mock-midnight-charge-auto-detection-override-boundary="true"
          >
            Mock/local only. No billing automation, invoice, monthly invoice, payment, payment link, PDF, accounting
            integration, customer account, customer auth, waiting-time persistence, extra-charge persistence,
            midnight-charge persistence, customer-charge persistence, driver-payout persistence, approval persistence,
            reconciliation persistence, manual override persistence, customer charge record, driver payout record,
            midnight-charge record, waiting-time record, extra-charge record, override record, booking record, storage,
            localStorage, sessionStorage, cookies, IndexedDB, API call, fetch, XHR, sendBeacon, WebSocket, Supabase,
            save, load, post, reconcile, approve, pay, bill, export, message-channel delivery, customer notification,
            notification, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock combined extra charges summary and charge type separation QA review"
          className="rounded-lg border border-lime-200 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-combined-extra-charges-summary-separation-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-lime-700">Combined Extra Charges</span>{" "}
                <span className="text-slate-600">Summary / Charge Type Separation QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-lime-200 bg-lime-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-combined-extra-charges-summary-separation-review-copy="true"
              >
                Static/mock combined Extra Charges summary and charge-type separation QA data only for internal
                review. This is a future QA preview for grouping charge display while keeping each charge type
                separate. Nothing is calculated as a real combined charge, billed, paid, posted, saved, persisted,
                generated, exported, or sent.
              </p>
              <div
                className="grid min-w-0 gap-1.5"
                data-mock-combined-extra-charges-summary-separation-review-rows="true"
              >
                {[
                  {
                    chargeType: "Waiting Time",
                    customerCharge: "$15 customer per 15-minute block",
                    displayGroup: "Extra Charges",
                    driverPayout: "$10 driver per 15-minute block",
                    internalSeparation: "Separate waiting-time source, not extra stops or midnight charge",
                    reviewStatus: "15-minute block rule protected / display-only",
                  },
                  {
                    chargeType: "Extra Stops",
                    customerCharge: "Extra-stop customer charge reviewed separately",
                    displayGroup: "Extra Charges",
                    driverPayout: "Extra-stop driver payout reviewed separately",
                    internalSeparation: "Separate extra-stop source, not waiting time or midnight charge",
                    reviewStatus: "Route extra reviewed separately / display-only",
                  },
                  {
                    chargeType: "Midnight Charge",
                    customerCharge: "$15 customer midnight charge",
                    displayGroup: "Extra Charges",
                    driverPayout: "$10 driver midnight payout",
                    internalSeparation: "Separate midnight-charge source, not waiting time or extra stops",
                    reviewStatus: "11:00pm to 6:59am rule protected / display-only",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-2 gap-1 rounded-md border border-lime-200 bg-lime-50/75 p-1 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-3 xl:grid-cols-6"
                    data-mock-combined-extra-charges-summary-separation-review-row={row.chargeType}
                    key={row.chargeType}
                  >
                    {[
                      ["Charge type", "Type", row.chargeType],
                      ["Display group", "Group", row.displayGroup],
                      ["Customer charge", "Customer", row.customerCharge],
                      ["Driver payout", "Driver", row.driverPayout],
                      ["Internal separation status", "Separate", row.internalSeparation],
                      ["Review status", "Review", row.reviewStatus],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-lime-700"
                          data-mock-combined-extra-charges-summary-separation-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
                <p
                  className="min-w-0 rounded-md border border-lime-200 bg-lime-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-combined-extra-charges-summary-separation-review-note="true"
                >
                  Combined Extra Charges summary - mock only. Waiting Time, Extra Stops, and Midnight Charge may
                  display together under Extra Charges, but each charge type remains internally distinct for future
                  billing, driver payout, audit, and dispute review. Waiting time remains internally distinct from
                  extra stops. Midnight Charge remains internally distinct from waiting time, extra stops, and other
                  extra charges.
                </p>
                <p
                  className="min-w-0 rounded-md border border-lime-200 bg-lime-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-combined-extra-charges-summary-separation-review-rule="true"
                >
                  Locked rules preview - mock only. Waiting Time: 1 waiting block = 15 minutes, customer waiting
                  charge $15 per waiting block, driver waiting payout $10 per waiting block. Midnight Charge:
                  customer charge $15, driver payout $10, applies from 11:00pm to 6:59am; 11:00pm and 6:59am are
                  included, 7:00am and 10:59pm are not included.
                </p>
                <p
                  className="min-w-0 rounded-md border border-lime-200 bg-lime-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-combined-extra-charges-summary-separation-review-generation="true"
                >
                  Combined display only. No invoice generated. No payout created. No accounting posting. Not saved. No
                  real combined charge calculation, customer charge record, driver payout record, waiting-time record,
                  extra-stop record, midnight-charge record, extra-charge record, invoice/payment/PDF, or accounting
                  record generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-[10px] leading-[1.15] text-slate-500"
            data-mock-combined-extra-charges-summary-separation-review-boundary="true"
          >
            Mock/local only. No real combined charge calculation, billing automation, monthly invoice, invoice,
            payment, payment link, PDF, accounting integration, customer account, customer auth, waiting-time
            persistence, extra-stop persistence, midnight-charge persistence, extra-charge persistence, customer-charge
            persistence, driver-payout persistence, charge grouping persistence, customer charge record, driver payout
            record, waiting-time record, extra-stop record, midnight-charge record, extra-charge record, storage,
            localStorage, sessionStorage, cookies, IndexedDB, API call, fetch, XHR, sendBeacon, WebSocket, Supabase,
            save, load, post, calculate, reconcile, approve, pay, bill, export, message-channel delivery, customer
            notification, notification, or send behavior.
          </p>
        </section>

        <section
          aria-label="Mock extra charges approval decision billing and payout separation QA review"
          className="rounded-lg border border-cyan-200 bg-white px-2.5 py-1.5 shadow-sm"
          data-mock-extra-charges-approval-decision-separation-review="true"
        >
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start">
            <div className="shrink-0 lg:w-44">
              <h2 className="text-sm font-semibold text-slate-950">
                <span className="uppercase text-cyan-700">Extra Charges Approval Decision</span>{" "}
                <span className="text-slate-600">Billing &amp; Payout Separation QA</span>
              </h2>
            </div>
            <div className="grid min-w-0 flex-1 gap-2">
              <p
                className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-extra-charges-approval-decision-separation-review-copy="true"
              >
                Static/mock Extra Charges approval decision and billing/payout separation QA data only for internal
                review. This is not active real billing or payout. Nothing is approved as a real workflow, billed,
                paid, posted, saved, persisted, generated, exported, or sent.
              </p>
              <div
                className="grid min-w-0 gap-1.5"
                data-mock-extra-charges-approval-decision-separation-review-rows="true"
              >
                {[
                  {
                    chargeType: "Waiting Time",
                    customerBillingDecision: "Customer billing approved in mock review",
                    dispatcherReviewStatus: "Dispatcher reviewed waiting blocks",
                    displayGroup: "Extra Charges",
                    driverPayoutDecision: "Driver payout approved in mock review",
                    separationNote: "Waiting Time source stays separate from Extra Stops and Midnight Charge",
                  },
                  {
                    chargeType: "Extra Stops",
                    customerBillingDecision: "Hold for dispatcher confirmation",
                    dispatcherReviewStatus: "Route extra confirmation pending",
                    displayGroup: "Extra Charges",
                    driverPayoutDecision: "Hold separately; no billing or payout created",
                    separationNote: "Extra Stops source stays separate from Waiting Time and Midnight Charge",
                  },
                  {
                    chargeType: "Midnight Charge",
                    customerBillingDecision: "Customer billing waived in mock example",
                    dispatcherReviewStatus: "Waiver reviewed as billing-only decision",
                    displayGroup: "Extra Charges",
                    driverPayoutDecision: "Driver payout still reviewed separately",
                    separationNote: "Midnight Charge source stays separate from Waiting Time and Extra Stops",
                  },
                ].map((row) => (
                  <div
                    className="grid min-w-0 grid-cols-2 gap-1 rounded-md border border-cyan-200 bg-cyan-50/75 p-1 text-[10px] leading-[1.1] text-slate-800 sm:grid-cols-3 xl:grid-cols-6"
                    data-mock-extra-charges-approval-decision-separation-review-row={row.chargeType}
                    key={row.chargeType}
                  >
                    {[
                      ["Charge type", "Type", row.chargeType],
                      ["Display group", "Group", row.displayGroup],
                      ["Customer billing decision", "Cust bill", row.customerBillingDecision],
                      ["Driver payout decision", "Driver pay", row.driverPayoutDecision],
                      ["Dispatcher review status", "Review", row.dispatcherReviewStatus],
                      ["Separation note", "Separate", row.separationNote],
                    ].map(([label, shortLabel, value]) => (
                      <p className="min-w-0 break-words" key={label}>
                        <span
                          className="block font-semibold uppercase text-cyan-700"
                          data-mock-extra-charges-approval-decision-separation-review-column={label}
                        >
                          {shortLabel}
                        </span>
                        <span>{value}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
                <p
                  className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-extra-charges-approval-decision-separation-review-note="true"
                >
                  Extra Charges approval decision review - mock only. Waiting Time, Extra Stops, and Midnight Charge
                  may display together under Extra Charges, but each charge type remains internally distinct. Customer
                  billing approval and driver payout approval are separate decisions for future review.
                </p>
                <p
                  className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-extra-charges-approval-decision-separation-review-rule="true"
                >
                  Locked rules preview - mock only. Waiting Time: 1 waiting block = 15 minutes, customer waiting
                  charge $15 per waiting block, driver waiting payout $10 per waiting block. Midnight Charge:
                  customer charge $15, driver payout $10, applies from 11:00pm to 6:59am; 11:00pm and 6:59am are
                  included, 7:00am and 10:59pm are not included.
                </p>
                <p
                  className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                  data-mock-extra-charges-approval-decision-separation-review-generation="true"
                >
                  Waived customer charge does not automatically cancel driver payout review. No invoice generated. No
                  payout created. No accounting posting. Not saved. No real approval workflow, combined charge
                  calculation, customer charge record, driver payout record, approval-decision record, waiting-time
                  record, extra-stop record, midnight-charge record, invoice/payment/PDF, or accounting record
                  generated.
                </p>
              </div>
            </div>
          </div>
          <p
            className="mt-1 text-[10px] leading-[1.15] text-slate-500"
            data-mock-extra-charges-approval-decision-separation-review-boundary="true"
          >
            Mock/local only. No real approval workflow, real combined charge calculation, billing automation, monthly
            invoice, invoice, payment, payment link, PDF, accounting integration, customer account, customer auth,
            waiting-time persistence, extra-stop persistence, midnight-charge persistence, approval-decision
            persistence, extra-charge persistence, customer-charge persistence, driver-payout persistence, customer
            charge record, driver payout record, approval-decision record, waiting-time record, extra-stop record,
            midnight-charge record, extra-charge record, storage, localStorage, sessionStorage, cookies, IndexedDB,
            API call, fetch, XHR, sendBeacon, WebSocket, Supabase, save, load, post, calculate, reconcile, approve,
            pay, bill, export, parser file changes, package script changes, test:safe membership changes,
            message-channel delivery, customer notification, notification, or send behavior.
          </p>
        </section>

          </>
        ) : null}

        <section
          aria-label="Completed Job Closeout Center Mock Only"
          className="rounded-lg border border-emerald-200 bg-white px-3 py-2 shadow-sm"
          data-mock-completed-job-closeout-center="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-emerald-700">Completed Job Closeout Center</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-completed-job-closeout-center-copy="true"
                >
                  Internal/admin-only completed-job closeout preview for staff review. Static/mock/local display data
                  only; no real closeout, billing, payout, invoice, payment, finance posting, storage, API, or
                  Supabase behavior is active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-700">
                Display-only center
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-completed-job-closeout-center-search-summary="true"
            >
              {[
                ["Search scope", "Completed jobs ready for closeout QA"],
                ["Filter summary", "Clean / extra-charge review / waived billing"],
                ["Mock results", "3 completed jobs maximum"],
                ["Mode", "Mock Only / display-only / no actions"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-emerald-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5" data-mock-completed-job-closeout-center-rows="true">
              {[
                {
                  account: "UBS Priority",
                  closeoutReadiness: "Ready for mock closeout",
                  completionStatus: "Completed cleanly",
                  customerBillingReadiness: "Customer billing ready - mock review only",
                  dispatcherExceptionStatus: "No dispatcher exception",
                  driverPayoutReadiness: "Driver payout ready - mock review only",
                  extraChargesStatus:
                    "Extra Charges: Waiting Time none; Extra Stops none; Midnight Charge none; all charge types separate",
                  financeHandoffStatus: "Finance/month-end handoff ready",
                  jobReference: "PLO-CLOSE-101",
                  nextInternalAction: "Finance review queue - display only",
                  serviceType: "MNG Arrival",
                },
                {
                  account: "Ritz-Carlton",
                  closeoutReadiness: "Hold for dispatcher closeout review",
                  completionStatus: "Completed with route and time review",
                  customerBillingReadiness: "Customer billing held until extra charges are reviewed",
                  dispatcherExceptionStatus: "Waiting Time and Extra Stops need dispatcher confirmation",
                  driverPayoutReadiness: "Driver payout review pending for waiting time and extra stop",
                  extraChargesStatus:
                    "Extra Charges: Waiting Time 2 blocks; Extra Stops 1; Midnight Charge not detected; sources separate",
                  financeHandoffStatus: "Finance/month-end handoff blocked in mock",
                  jobReference: "PLO-CLOSE-118",
                  nextInternalAction: "Confirm each Extra Charges source before future billing or payout",
                  serviceType: "DSP Hourly",
                },
                {
                  account: "VIP Customer",
                  closeoutReadiness: "Closeout needs payout review",
                  completionStatus: "Completed with customer charge waiver",
                  customerBillingReadiness: "Customer charge waived in mock example",
                  dispatcherExceptionStatus: "Billing waiver noted; payout review still separate",
                  driverPayoutReadiness: "Driver payout still under review separately",
                  extraChargesStatus:
                    "Extra Charges: Waiting Time none; Extra Stops none; Midnight Charge detected; midnight source separate",
                  financeHandoffStatus: "Finance/month-end handoff pending driver payout review",
                  jobReference: "PLO-CLOSE-207",
                  nextInternalAction: "Review driver payout even though customer charge is waived",
                  serviceType: "DEP Departure",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-emerald-200 bg-emerald-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1.1fr_1.1fr_1.35fr_1.35fr_1.35fr_1.15fr]"
                  data-mock-completed-job-closeout-center-row={row.jobReference}
                  key={row.jobReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-completed-job-closeout-center-column="Job reference customer service"
                    >
                      Job
                    </span>
                    <span className="block">{row.jobReference}</span>
                    <span className="block">{row.account}</span>
                    <span className="block">{row.serviceType}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-completed-job-closeout-center-column="Completion status closeout readiness"
                    >
                      Status / Closeout
                    </span>
                    <span className="block">{row.completionStatus}</span>
                    <span className="block">{row.closeoutReadiness}</span>
                  </p>
                  <p
                    className="min-w-0 break-words"
                    data-mock-completed-job-closeout-center-extra-charges="true"
                  >
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-completed-job-closeout-center-column="Extra charges status"
                    >
                      Extra Charges
                    </span>
                    <span>{row.extraChargesStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-completed-job-closeout-center-column="Customer billing and driver payout readiness"
                    >
                      Billing / Payout
                    </span>
                    <span className="block">{row.customerBillingReadiness}</span>
                    <span className="block">{row.driverPayoutReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-completed-job-closeout-center-column="Dispatcher exception and finance handoff status"
                    >
                      Exception / Finance
                    </span>
                    <span className="block">{row.dispatcherExceptionStatus}</span>
                    <span className="block">{row.financeHandoffStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-completed-job-closeout-center-column="Next internal action"
                    >
                      Next
                    </span>
                    <span>{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-completed-job-closeout-center-rule="true"
              >
                Locked rules - mock only. Waiting Time: 1 waiting block = 15 minutes, customer charge $15 per waiting
                block, driver payout $10 per waiting block. Midnight Charge: customer charge $15, driver payout $10,
                applies from 11:00pm / 23:00 through 6:59am / 06:59 inclusive; 7:00am / 07:00 and 10:59pm / 22:59 are
                excluded.
              </p>
              <p
                className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-completed-job-closeout-center-separation="true"
              >
                Extra Charges summary - mock only. Waiting Time, Extra Stops, and Midnight Charge may display together
                under Extra Charges, but each charge type remains internally distinct for future billing, driver payout,
                audit, and dispute review.
              </p>
              <p
                className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-completed-job-closeout-center-decision="true"
              >
                Customer billing approval and driver payout approval are separate decisions. Waived customer charge does
                not automatically cancel driver payout review. No invoice generated, no payment link created, no PDF
                generated, no payout created, no accounting posting, not saved.
              </p>
            </div>

            <p
              className="text-[10px] leading-[1.15] text-slate-500"
              data-mock-completed-job-closeout-center-boundary="true"
            >
              Future workflow boundary: Mock/local only. No real job closeout workflow, completed-job persistence,
              real combined charge calculation, billing automation, monthly invoice, invoice generation, payment link,
              PDF generation, accounting integration, accounting posting, customer account, customer auth, driver
              payout creation, waiting-time persistence, extra-stop persistence, midnight-charge persistence,
              approval-decision persistence, extra-charge persistence, customer-charge persistence, driver-payout
              persistence, save/load behavior, storage, localStorage, sessionStorage, cookies, IndexedDB, API call,
              fetch, XHR, sendBeacon, WebSocket, Supabase, parser file changes, package script changes, test:safe
              membership changes, message-channel delivery, customer notification, notification, or send behavior.
            </p>
          </div>
        </section>

        <section
          aria-label="Month-End Closeout Workbench Mock Only"
          className="rounded-lg border border-cyan-200 bg-white px-3 py-2 shadow-sm"
          data-mock-month-end-closeout-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-cyan-700">Month-End Closeout Workbench</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-month-end-closeout-workbench-copy="true"
                >
                  Internal/admin-only month-end grouping preview for completed jobs after the Completed Job Closeout
                  Center. Static/mock/local display data only; no real month-end closeout, statement, invoice, payment,
                  payout, PDF, accounting posting, storage, API, or Supabase behavior is active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-semibold uppercase text-cyan-700">
                Display-only workbench
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-month-end-closeout-workbench-filter-summary="true"
            >
              {[
                ["Closeout month", "May 2026"],
                ["Account filter", "All mock accounts with completed jobs"],
                ["Grouping source", "Completed Job Closeout Center rows grouped by account/month"],
                ["Mock results", "3 account/month groups maximum / display-only"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-cyan-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5" data-mock-month-end-closeout-workbench-rows="true">
              {[
                {
                  account: "UBS Priority",
                  billingReadiness: "Customer billing ready for future month-end handoff",
                  closeoutMonth: "May 2026",
                  completedJobsCount: "18 completed jobs",
                  driverPayoutReadiness: "Driver payout handoff ready - mock review only",
                  exceptionStatus: "0 exceptions / clean month-end closeout group",
                  extraChargesStatus:
                    "Extra Charges: Waiting Time reviewed; Extra Stops none; Midnight Charge reviewed; all charge types separate",
                  financeHandoffStatus: "Finance/month-end handoff ready",
                  groupReference: "PLO-ME-2026-05-UBS",
                  nextInternalAction: "Queue finance QA handoff - display only",
                  statementInvoiceReadiness: "Statement/invoice readiness reviewed - not generated",
                },
                {
                  account: "Ritz-Carlton",
                  billingReadiness: "Customer billing blocked pending extra-charge exception review",
                  closeoutMonth: "May 2026",
                  completedJobsCount: "7 completed jobs",
                  driverPayoutReadiness: "Driver payout review pending for waiting time and extra stop",
                  exceptionStatus: "2 exceptions / dispatcher review required",
                  extraChargesStatus:
                    "Extra Charges: Waiting Time 2 blocks; Extra Stops 1; Midnight Charge not detected; sources separate",
                  financeHandoffStatus: "Finance/month-end handoff blocked in mock",
                  groupReference: "PLO-ME-2026-05-RITZ",
                  nextInternalAction: "Resolve Extra Charges exception review before future billing or payout",
                  statementInvoiceReadiness: "Statement/invoice readiness not ready",
                },
                {
                  account: "VIP Customer",
                  billingReadiness: "Customer charge waived in mock month-end example",
                  closeoutMonth: "May 2026",
                  completedJobsCount: "3 completed jobs",
                  driverPayoutReadiness: "Driver payout still pending review separately",
                  exceptionStatus: "1 waiver exception / payout review still open",
                  extraChargesStatus:
                    "Extra Charges: Waiting Time none; Extra Stops none; Midnight Charge detected; midnight source separate",
                  financeHandoffStatus: "Finance/month-end handoff pending driver payout review",
                  groupReference: "PLO-ME-2026-05-VIP",
                  nextInternalAction: "Review driver payout even though customer charge is waived",
                  statementInvoiceReadiness: "Statement/invoice waiver note only - not generated",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-cyan-200 bg-cyan-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.25fr_1.25fr_1.25fr_1.25fr]"
                  data-mock-month-end-closeout-workbench-row={row.groupReference}
                  key={row.groupReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-month-end-closeout-workbench-column="Closeout month customer account completed jobs count"
                    >
                      Month / Account
                    </span>
                    <span className="block">{row.groupReference}</span>
                    <span className="block">{row.closeoutMonth}</span>
                    <span className="block">{row.account}</span>
                    <span className="block">{row.completedJobsCount}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-month-end-closeout-workbench-column="Billing readiness driver payout readiness"
                    >
                      Billing / Payout
                    </span>
                    <span className="block">{row.billingReadiness}</span>
                    <span className="block">{row.driverPayoutReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-month-end-closeout-workbench-column="Exception count status"
                    >
                      Exceptions
                    </span>
                    <span>{row.exceptionStatus}</span>
                  </p>
                  <p className="min-w-0 break-words" data-mock-month-end-closeout-workbench-extra-charges="true">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-month-end-closeout-workbench-column="Extra charges review status"
                    >
                      Extra Charges
                    </span>
                    <span>{row.extraChargesStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-month-end-closeout-workbench-column="Finance month-end handoff status statement invoice readiness"
                    >
                      Finance / Statement
                    </span>
                    <span className="block">{row.financeHandoffStatus}</span>
                    <span className="block">{row.statementInvoiceReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-month-end-closeout-workbench-column="Next internal action"
                    >
                      Next
                    </span>
                    <span>{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-month-end-closeout-workbench-rule="true"
              >
                Locked rules - mock only. Waiting Time: 1 waiting block = 15 minutes, customer charge $15 per waiting
                block, driver payout $10 per waiting block. Midnight Charge: customer charge $15, driver payout $10,
                applies from 11:00pm / 23:00 through 6:59am / 06:59 inclusive; 7:00am / 07:00 and 10:59pm / 22:59 are
                excluded.
              </p>
              <p
                className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-month-end-closeout-workbench-separation="true"
              >
                Extra Charges month-end grouping - mock only. Waiting Time, Extra Stops, and Midnight Charge may display
                together under Extra Charges, but each charge type remains internally distinct for future billing,
                driver payout, audit, and dispute review.
              </p>
              <p
                className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-month-end-closeout-workbench-decision="true"
              >
                Customer billing approval and driver payout approval are separate decisions. Waived customer charge does
                not automatically cancel driver payout review. No invoice generated, no statement generated, no payment
                link created, no PDF generated, no payout created, no accounting posting, not saved.
              </p>
            </div>

            <p
              className="text-[10px] leading-[1.15] text-slate-500"
              data-mock-month-end-closeout-workbench-boundary="true"
            >
              Future workflow boundary: Mock/local only. No real month-end closeout workflow, completed-job persistence,
              monthly billing persistence, statement generation, invoice generation, real combined charge calculation,
              billing automation, monthly invoice, payment link, PDF generation, accounting integration, accounting
              posting, finance export, customer account, customer auth, driver payout creation, waiting-time persistence,
              extra-stop persistence, midnight-charge persistence, approval-decision persistence, extra-charge
              persistence, customer-charge persistence, driver-payout persistence, save/load behavior, storage,
              localStorage, sessionStorage, cookies, IndexedDB, API call, fetch, XHR, sendBeacon, WebSocket, Supabase,
              parser file changes, package script changes, test:safe membership changes, message-channel delivery,
              customer notification, notification, or send behavior.
            </p>
          </div>
        </section>

        <section
          aria-label="Finance Exception Resolution Workbench Mock Only"
          className="rounded-lg border border-teal-200 bg-white px-3 py-2 shadow-sm"
          data-mock-finance-exception-resolution-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-teal-700">Finance Exception Resolution Workbench</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-finance-exception-resolution-workbench-copy="true"
                >
                  Internal/admin-only finance exception preview for month-end account rows from the Month-End Closeout
                  Workbench. Static/mock/local display data only; no real exception resolution, statement, invoice,
                  payment, payout, PDF, accounting posting, finance export, storage, API, or Supabase behavior is
                  active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-semibold uppercase text-teal-700">
                Display-only exception workbench
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-finance-exception-resolution-workbench-filter-summary="true"
            >
              {[
                ["Exception month", "May 2026"],
                ["Source", "Month-End Closeout Workbench exception rows"],
                ["Scope", "Open billing, payout, statement, and finance review exceptions"],
                ["Mock results", "3 exception rows maximum / display-only"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-teal-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5" data-mock-finance-exception-resolution-workbench-rows="true">
              {[
                {
                  account: "Ritz-Carlton",
                  billingImpact: "Hold customer billing until Extra Charges evidence is reviewed",
                  closeoutMonth: "May 2026",
                  dispatcherFollowUpStatus: "Dispatcher follow-up needed for waiting-time proof",
                  driverPayoutImpact: "Driver payout still under review for Waiting Time and Extra Stops",
                  exceptionReference: "PLO-FIN-EX-2026-05-RITZ-EV",
                  exceptionType: "Extra-charge evidence missing",
                  extraCharges:
                    "Extra Charges: Waiting Time 2 blocks; Extra Stops 1; Midnight Charge not detected; sources separate",
                  financeReviewStatus: "Finance review blocked in mock",
                  nextInternalAction: "Collect evidence before future statement or payout review",
                  relatedGroup: "PLO-ME-2026-05-RITZ / PLO-CLOSE-118",
                  resolutionReadiness: "Not ready - mock exception open",
                },
                {
                  account: "VIP Customer",
                  billingImpact: "Customer charge waived in mock month-end review",
                  closeoutMonth: "May 2026",
                  dispatcherFollowUpStatus: "Dispatcher waiver note reviewed",
                  driverPayoutImpact: "Driver payout review remains separate from customer waiver",
                  exceptionReference: "PLO-FIN-EX-2026-05-VIP-WAIVER",
                  exceptionType: "Customer charge waived / payout still reviewed",
                  extraCharges:
                    "Extra Charges: Waiting Time none; Extra Stops none; Midnight Charge detected; midnight source separate",
                  financeReviewStatus: "Finance waiver note held for mock review",
                  nextInternalAction: "Review driver payout even though customer charge is waived",
                  relatedGroup: "PLO-ME-2026-05-VIP / PLO-CLOSE-207",
                  resolutionReadiness: "Payout review pending - display only",
                },
                {
                  account: "Ritz-Carlton",
                  billingImpact: "Statement/invoice readiness blocked by finance review note",
                  closeoutMonth: "May 2026",
                  dispatcherFollowUpStatus: "Dispatcher confirms route exception before future handoff",
                  driverPayoutImpact: "No payout created; review remains pending",
                  exceptionReference: "PLO-FIN-EX-2026-05-RITZ-STMT",
                  exceptionType: "Statement/invoice readiness blocked",
                  extraCharges:
                    "Extra Charges: Waiting Time reviewed separately; Extra Stops needs confirmation; Midnight Charge excluded",
                  financeReviewStatus: "Finance note unresolved in mock",
                  nextInternalAction: "Clear finance note before future month-end handoff",
                  relatedGroup: "PLO-ME-2026-05-RITZ",
                  resolutionReadiness: "Blocked - no statement or invoice generated",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-teal-200 bg-teal-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.15fr_1.15fr_1.25fr_1.25fr]"
                  data-mock-finance-exception-resolution-workbench-row={row.exceptionReference}
                  key={row.exceptionReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-finance-exception-resolution-workbench-column="Exception reference closeout month customer account related job month-end group"
                    >
                      Exception / Group
                    </span>
                    <span className="block">{row.exceptionReference}</span>
                    <span className="block">{row.closeoutMonth}</span>
                    <span className="block">{row.account}</span>
                    <span className="block">{row.relatedGroup}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-finance-exception-resolution-workbench-column="Exception type"
                    >
                      Exception Type
                    </span>
                    <span className="block">{row.exceptionType}</span>
                    <span className="block" data-mock-finance-exception-resolution-workbench-extra-charges="true">
                      {row.extraCharges}
                    </span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-finance-exception-resolution-workbench-column="Customer billing impact"
                    >
                      Billing Impact
                    </span>
                    <span>{row.billingImpact}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-finance-exception-resolution-workbench-column="Driver payout impact"
                    >
                      Payout Impact
                    </span>
                    <span>{row.driverPayoutImpact}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-finance-exception-resolution-workbench-column="Finance review status dispatcher follow-up status"
                    >
                      Review / Follow-up
                    </span>
                    <span className="block">{row.financeReviewStatus}</span>
                    <span className="block">{row.dispatcherFollowUpStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-finance-exception-resolution-workbench-column="Resolution readiness next internal action"
                    >
                      Resolution / Next
                    </span>
                    <span className="block">{row.resolutionReadiness}</span>
                    <span className="block">{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-finance-exception-resolution-workbench-rule="true"
              >
                Locked rules - mock only. Waiting Time: 1 waiting block = 15 minutes, customer charge $15 per waiting
                block, driver payout $10 per waiting block. Midnight Charge: customer charge $15, driver payout $10,
                applies from 11:00pm / 23:00 through 6:59am / 06:59 inclusive; 7:00am / 07:00 and 10:59pm / 22:59 are
                excluded.
              </p>
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-finance-exception-resolution-workbench-separation="true"
              >
                Finance exception review - mock only. Waiting Time, Extra Stops, and Midnight Charge may display under
                Extra Charges where relevant, but each charge type remains internally distinct for billing, payout,
                audit, and dispute review.
              </p>
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-finance-exception-resolution-workbench-decision="true"
              >
                Customer billing approval and driver payout approval are separate decisions. Waived customer charge does
                not automatically cancel driver payout review. No exception saved, no statement generated, no invoice
                generated, no payment link created, no PDF generated, no payout created, no accounting posting, no
                finance export, and not saved.
              </p>
            </div>

            <p
              className="text-[10px] leading-[1.15] text-slate-500"
              data-mock-finance-exception-resolution-workbench-boundary="true"
            >
              Future workflow boundary: Mock/local only. No real finance exception workflow, real month-end closeout
              workflow, completed-job persistence, monthly billing persistence, statement generation, invoice
              generation, real combined charge calculation, billing automation, monthly invoice, payment link, PDF
              generation, accounting integration, accounting posting, finance export, customer account, customer auth,
              driver payout creation, waiting-time persistence, extra-stop persistence, midnight-charge persistence,
              approval-decision persistence, exception persistence, extra-charge persistence, customer-charge
              persistence, driver-payout persistence, save/load behavior, storage, localStorage, sessionStorage,
              cookies, IndexedDB, API call, fetch, XHR, sendBeacon, WebSocket, Supabase, parser file changes, package
              script changes, test:safe membership changes, message-channel delivery, customer notification,
              notification, or send behavior.
            </p>
          </div>
        </section>

        <section
          aria-label="Driver Job Completion and Exception Intake Workbench Mock Only"
          className="rounded-lg border border-amber-200 bg-white px-3 py-2 shadow-sm"
          data-mock-driver-job-completion-exception-intake-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-amber-700">Driver Job Completion &amp; Exception Intake Workbench</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-driver-job-completion-exception-intake-workbench-copy="true"
                >
                  Internal/admin-only driver completion and exception intake preview for dispatch review after driver
                  status updates. Static/mock/local display data only; no real completion, live location, proof/photo
                  upload, notification, replacement dispatch, closeout, storage, API, or Supabase behavior is active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase text-amber-700">
                Display-only intake
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-driver-job-completion-exception-intake-workbench-filter-summary="true"
            >
              {[
                ["Review scope", "Completed and exception driver jobs"],
                ["Status filter", "Clean / proof pending / exception reported"],
                ["Mock results", "3 driver job rows maximum"],
                ["Mode", "Mock Only / display-only / no actions"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-amber-200 bg-amber-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-amber-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div
              className="grid min-w-0 gap-1.5"
              data-mock-driver-job-completion-exception-intake-workbench-rows="true"
            >
              {[
                {
                  closeoutHandoffReadiness: "Ready for completed-job closeout handoff",
                  completionStatus: "Completed cleanly",
                  dispatcherFollowUpStatus: "No dispatcher follow-up required",
                  driver: "Arun Lim",
                  exceptionType: "None",
                  jobReference: "PLO-DRV-COMP-101",
                  nextInternalAction: "Move to closeout review - display only",
                  otsPobCompletedStatus: "OTS confirmed; POB confirmed; Job Completed confirmed",
                  proofPhotoStatus: "Proof/photo received in mock review",
                  replacementVehicleStatus: "No replacement vehicle needed",
                  serviceType: "Arrival",
                  vehiclePlate: "Mercedes E-Class / SGM101A",
                },
                {
                  closeoutHandoffReadiness: "Hold closeout handoff until proof/photo is reviewed",
                  completionStatus: "Completed; proof pending",
                  dispatcherFollowUpStatus: "Dispatcher follow-up pending for proof/photo",
                  driver: "Nadia Tan",
                  exceptionType: "Proof/photo pending",
                  jobReference: "PLO-DRV-COMP-118",
                  nextInternalAction: "Request proof review in future workflow - display only",
                  otsPobCompletedStatus: "OTS confirmed; POB confirmed; Job Completed confirmed",
                  proofPhotoStatus: "Proof/photo pending - not uploaded here",
                  replacementVehicleStatus: "No replacement vehicle needed",
                  serviceType: "Hourly",
                  vehiclePlate: "Toyota Alphard / SJA8822K",
                },
                {
                  closeoutHandoffReadiness: "Closeout handoff blocked until exception review",
                  completionStatus: "Driver exception reported",
                  dispatcherFollowUpStatus: "Dispatcher follow-up required",
                  driver: "Marcus Lee",
                  exceptionType: "Late driver / car breakdown",
                  jobReference: "PLO-DRV-COMP-207",
                  nextInternalAction: "Review replacement need before closeout - display only",
                  otsPobCompletedStatus: "OTS delayed; POB pending review; Job Completed not confirmed",
                  proofPhotoStatus: "Proof/photo not required until exception is reviewed",
                  replacementVehicleStatus: "Replacement vehicle needed - mock review only",
                  serviceType: "Departure",
                  vehiclePlate: "Mercedes V-Class / SKX7408D",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-amber-200 bg-amber-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1.1fr_1.05fr_1.15fr_1.35fr]"
                  data-mock-driver-job-completion-exception-intake-workbench-row={row.jobReference}
                  key={row.jobReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-amber-700"
                      data-mock-driver-job-completion-exception-intake-workbench-column="Job reference driver vehicle plate service type"
                    >
                      Job / Driver
                    </span>
                    <span className="block">{row.jobReference}</span>
                    <span className="block">{row.driver}</span>
                    <span className="block">{row.vehiclePlate}</span>
                    <span className="block">{row.serviceType}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-amber-700"
                      data-mock-driver-job-completion-exception-intake-workbench-column="Completion status"
                    >
                      Completion
                    </span>
                    <span>{row.completionStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-amber-700"
                      data-mock-driver-job-completion-exception-intake-workbench-column="OTS POB completed status"
                    >
                      OTS / POB / Completed
                    </span>
                    <span>{row.otsPobCompletedStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-amber-700"
                      data-mock-driver-job-completion-exception-intake-workbench-column="Proof photo status"
                    >
                      Proof / Photo
                    </span>
                    <span>{row.proofPhotoStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-amber-700"
                      data-mock-driver-job-completion-exception-intake-workbench-column="Exception type replacement vehicle status"
                    >
                      Exception / Replacement
                    </span>
                    <span className="block">{row.exceptionType}</span>
                    <span className="block">{row.replacementVehicleStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-amber-700"
                      data-mock-driver-job-completion-exception-intake-workbench-column="Dispatcher follow-up status closeout handoff readiness next internal action"
                    >
                      Follow-up / Closeout
                    </span>
                    <span className="block">{row.dispatcherFollowUpStatus}</span>
                    <span className="block">{row.closeoutHandoffReadiness}</span>
                    <span className="block">{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-amber-200 bg-amber-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-driver-job-completion-exception-intake-workbench-progression="true"
              >
                Completion progression - mock only. OTS, POB, and Job Completed status are shown for review only;
                nothing is acknowledged, completed, persisted, dispatched, or saved from this preview.
              </p>
              <p
                className="min-w-0 rounded-md border border-amber-200 bg-amber-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-driver-job-completion-exception-intake-workbench-exception-note="true"
              >
                Exception intake - mock only. Proof/photo pending, late driver, car breakdown, missed job, replacement
                vehicle need, dispatcher follow-up, and closeout handoff readiness stay as static review labels.
              </p>
              <p
                className="min-w-0 rounded-md border border-amber-200 bg-amber-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-driver-job-completion-exception-intake-workbench-safety="true"
              >
                Mock Only. No live location activated, no proof/photo uploaded, no notification sent, no driver
                acknowledgement sent, no job completion saved, no replacement car dispatch created, no closeout record
                created, no billing, invoice, payment, PDF, payout, accounting, or finance export created.
              </p>
            </div>

            <p
              className="text-[10px] leading-[1.15] text-slate-500"
              data-mock-driver-job-completion-exception-intake-workbench-boundary="true"
            >
              Future workflow boundary: Mock/local only. No real driver job completion workflow, OTS/POB/completed
              persistence, proof/photo upload, live location behavior, driver acknowledgement behavior, replacement
              vehicle dispatch, closeout workflow, closeout record, billing, invoice, statement, payment, payment link,
              PDF, payout, accounting posting, finance export, customer account, customer auth, save/load behavior,
              storage, localStorage, sessionStorage, cookies, IndexedDB, API call, fetch, XHR, sendBeacon, WebSocket,
              Supabase, parser file changes, package script changes, test:safe membership changes, message-channel
              delivery, customer notification, notification, or send behavior.
            </p>
          </div>
        </section>

        <section
          aria-label="Replacement Vehicle and Service Recovery Workbench Mock Only"
          className="rounded-lg border border-rose-200 bg-white px-3 py-2 shadow-sm"
          data-mock-replacement-vehicle-service-recovery-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-rose-700">Replacement Vehicle &amp; Service Recovery Workbench</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-replacement-vehicle-service-recovery-workbench-copy="true"
                >
                  Internal/admin-only service recovery preview for late driver, car breakdown, missed job, and
                  replacement vehicle situations. Static/mock/local display data only; no real replacement dispatch,
                  backup driver assignment, customer update, live location, proof/photo upload, closeout, storage, API,
                  or Supabase behavior is active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold uppercase text-rose-700">
                Display-only recovery workbench
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-replacement-vehicle-service-recovery-workbench-filter-summary="true"
            >
              {[
                ["Recovery scope", "Late driver / breakdown / missed job / replacement need"],
                ["Source", "Driver exception and dispatcher escalation review"],
                ["Mock results", "3 recovery rows maximum"],
                ["Mode", "Mock Only / display-only / no actions"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-rose-200 bg-rose-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-rose-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div
              className="grid min-w-0 gap-1.5"
              data-mock-replacement-vehicle-service-recovery-workbench-rows="true"
            >
              {[
                {
                  backupDriverStatus: "Backup driver pending confirmation",
                  closeoutHandoffReadiness: "Hold closeout until replacement details are reviewed",
                  customerAccount: "Ritz-Carlton",
                  customerImpact: "Pickup delay risk; customer update readiness pending",
                  customerUpdateReadiness: "Draft customer update not sent",
                  dispatcherEscalationStatus: "Dispatcher escalation open in mock review",
                  exceptionType: "Car breakdown reported",
                  nextInternalAction: "Confirm backup driver before future service recovery handoff",
                  originalDriver: "Marcus Lee",
                  originalVehiclePlate: "Mercedes V-Class / SKX7408D",
                  recoveryReference: "PLO-REC-2026-05-BREAKDOWN",
                  relatedJobReference: "PLO-DRV-COMP-207",
                  replacementVehicleStatus: "Replacement vehicle identified - mock review only",
                },
                {
                  backupDriverStatus: "Backup driver on standby - not assigned",
                  closeoutHandoffReadiness: "Closeout handoff waiting on customer-impact review",
                  customerAccount: "UBS Priority",
                  customerImpact: "Late driver risk; customer update needed",
                  customerUpdateReadiness: "Customer update readiness requires dispatcher review",
                  dispatcherEscalationStatus: "Dispatcher escalation in progress - display only",
                  exceptionType: "Late driver risk",
                  nextInternalAction: "Review customer impact before any future update",
                  originalDriver: "Nadia Tan",
                  originalVehiclePlate: "Toyota Alphard / SJA8822K",
                  recoveryReference: "PLO-REC-2026-05-LATE",
                  relatedJobReference: "PLO-DRV-COMP-118",
                  replacementVehicleStatus: "Replacement car not needed yet",
                },
                {
                  backupDriverStatus: "Backup driver review blocked by manager approval",
                  closeoutHandoffReadiness: "Closeout handoff blocked until service recovery review",
                  customerAccount: "VIP Customer",
                  customerImpact: "Missed job / service recovery review required",
                  customerUpdateReadiness: "Manager approval required before customer update",
                  dispatcherEscalationStatus: "Manager escalation required - mock only",
                  exceptionType: "Missed job / service recovery review",
                  nextInternalAction: "Get manager approval before future closeout handoff",
                  originalDriver: "Arun Lim",
                  originalVehiclePlate: "Mercedes E-Class / SGM101A",
                  recoveryReference: "PLO-REC-2026-05-MISSED",
                  relatedJobReference: "PLO-CLOSE-207",
                  replacementVehicleStatus: "Replacement vehicle status under review",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-rose-200 bg-rose-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1.15fr_1.1fr_1.15fr_1.15fr_1.25fr_1.25fr]"
                  data-mock-replacement-vehicle-service-recovery-workbench-row={row.recoveryReference}
                  key={row.recoveryReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-rose-700"
                      data-mock-replacement-vehicle-service-recovery-workbench-column="Recovery reference related job reference customer account"
                    >
                      Recovery / Job
                    </span>
                    <span className="block">{row.recoveryReference}</span>
                    <span className="block">{row.relatedJobReference}</span>
                    <span className="block">{row.customerAccount}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-rose-700"
                      data-mock-replacement-vehicle-service-recovery-workbench-column="Original driver original vehicle plate exception type"
                    >
                      Original Driver / Exception
                    </span>
                    <span className="block">{row.originalDriver}</span>
                    <span className="block">{row.originalVehiclePlate}</span>
                    <span className="block">{row.exceptionType}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-rose-700"
                      data-mock-replacement-vehicle-service-recovery-workbench-column="Replacement vehicle status backup driver status"
                    >
                      Replacement / Backup
                    </span>
                    <span className="block">{row.replacementVehicleStatus}</span>
                    <span className="block">{row.backupDriverStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-rose-700"
                      data-mock-replacement-vehicle-service-recovery-workbench-column="Customer impact customer update readiness"
                    >
                      Customer Impact
                    </span>
                    <span className="block">{row.customerImpact}</span>
                    <span className="block">{row.customerUpdateReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-rose-700"
                      data-mock-replacement-vehicle-service-recovery-workbench-column="Dispatcher escalation status closeout handoff readiness"
                    >
                      Escalation / Closeout
                    </span>
                    <span className="block">{row.dispatcherEscalationStatus}</span>
                    <span className="block">{row.closeoutHandoffReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-rose-700"
                      data-mock-replacement-vehicle-service-recovery-workbench-column="Next internal action"
                    >
                      Next Internal Action
                    </span>
                    <span>{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-rose-200 bg-rose-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-replacement-vehicle-service-recovery-workbench-recovery-note="true"
              >
                Service recovery - mock only. Replacement vehicle status, backup driver status, customer impact,
                dispatcher escalation, customer update readiness, and closeout handoff readiness stay as static review
                labels.
              </p>
              <p
                className="min-w-0 rounded-md border border-rose-200 bg-rose-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-replacement-vehicle-service-recovery-workbench-distinction="true"
              >
                This is separate from Driver Job Completion intake: it focuses on recovery triage, replacement car
                readiness, backup driver readiness, customer impact, and dispatcher escalation before closeout handoff.
              </p>
              <p
                className="min-w-0 rounded-md border border-rose-200 bg-rose-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-replacement-vehicle-service-recovery-workbench-safety="true"
              >
                Mock Only. No replacement car dispatch created, no backup driver assigned, no customer update sent, no
                driver acknowledgement sent, no live location activated, no proof/photo uploaded, no job status saved,
                no closeout record created, no billing, invoice, payment, PDF, payout, accounting, or finance export
                created.
              </p>
            </div>

            <p
              className="text-[10px] leading-[1.15] text-slate-500"
              data-mock-replacement-vehicle-service-recovery-workbench-boundary="true"
            >
              Future workflow boundary: Mock/local only. No real replacement vehicle dispatch, backup driver assignment,
              driver acknowledgement behavior, customer update sending, notification sending, live location behavior,
              proof/photo upload, job status persistence, closeout workflow, closeout record, billing, invoice,
              statement, payment, payment link, PDF, payout, accounting posting, finance export, customer account,
              customer auth, save/load behavior, storage, localStorage, sessionStorage, cookies, IndexedDB, API call,
              fetch, XHR, sendBeacon, WebSocket, Supabase, parser file changes, package script changes, test:safe
              membership changes, message-channel delivery, customer notification, notification, or send behavior.
            </p>
          </div>
        </section>

        <section
          aria-label="Customer Service Recovery Communication Workbench Mock Only"
          className="rounded-lg border border-cyan-200 bg-white px-3 py-2 shadow-sm"
          data-mock-customer-service-recovery-communication-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-cyan-700">Customer Service Recovery Communication Workbench</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-customer-service-recovery-communication-workbench-copy="true"
                >
                  Internal/admin-only customer recovery communication preview after service recovery review.
                  Static/mock/local display data only; no real customer update, notification, goodwill credit,
                  invoice adjustment, payment link, PDF, closeout record, storage, API, or Supabase behavior is active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-semibold uppercase text-cyan-700">
                Display-only communication workbench
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-customer-service-recovery-communication-workbench-filter-summary="true"
            >
              {[
                ["Communication scope", "Late driver / replacement used / missed job recovery"],
                ["Source", "Service recovery rows and customer impact review"],
                ["Mock results", "3 customer recovery rows maximum"],
                ["Mode", "Mock Only / display-only / no actions"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-cyan-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div
              className="grid min-w-0 gap-1.5"
              data-mock-customer-service-recovery-communication-workbench-rows="true"
            >
              {[
                {
                  closeoutHandoffReadiness: "Ready after dispatcher confirms customer impact",
                  communicationReadiness: "Customer update prepared for internal review",
                  communicationReference: "PLO-COMM-2026-05-LATE",
                  customerAccount: "UBS Priority",
                  customerImpact: "Pickup timing risk; customer impact reviewed",
                  goodwillNoChargeReviewStatus: "No goodwill/no-charge review needed",
                  managerApprovalStatus: "Manager approval not required",
                  messageChannelReadiness: "Message-channel readiness pending - not delivered",
                  nextInternalAction: "Review customer wording before any future update",
                  proposedCustomerUpdate: "Delay update prepared - not sent",
                  relatedRecoveryJobReference: "PLO-REC-2026-05-LATE / PLO-DRV-COMP-118",
                  serviceIssue: "Late driver risk",
                },
                {
                  closeoutHandoffReadiness: "Hold closeout until goodwill review is decided",
                  communicationReadiness: "Customer impact reviewed; update draft held",
                  communicationReference: "PLO-COMM-2026-05-REPLACE",
                  customerAccount: "Ritz-Carlton",
                  customerImpact: "Replacement vehicle used; arrival timing impact reviewed",
                  goodwillNoChargeReviewStatus: "Goodwill/no-charge review pending",
                  managerApprovalStatus: "Manager approval pending for goodwill review",
                  messageChannelReadiness: "Message-channel readiness held - not delivered",
                  nextInternalAction: "Confirm goodwill/no-charge review before future message",
                  proposedCustomerUpdate: "Replacement vehicle explanation prepared - not sent",
                  relatedRecoveryJobReference: "PLO-REC-2026-05-BREAKDOWN / PLO-DRV-COMP-207",
                  serviceIssue: "Replacement vehicle used",
                },
                {
                  closeoutHandoffReadiness: "Closeout handoff blocked until manager approval",
                  communicationReadiness: "Customer update blocked pending manager review",
                  communicationReference: "PLO-COMM-2026-05-MISSED",
                  customerAccount: "VIP Customer",
                  customerImpact: "Missed job/service recovery impact needs manager review",
                  goodwillNoChargeReviewStatus: "No-charge review required before future closeout",
                  managerApprovalStatus: "Manager approval required before customer update",
                  messageChannelReadiness: "Message-channel readiness blocked - not delivered",
                  nextInternalAction: "Get manager approval before future update and closeout",
                  proposedCustomerUpdate: "Service recovery apology draft held - not sent",
                  relatedRecoveryJobReference: "PLO-REC-2026-05-MISSED / PLO-CLOSE-207",
                  serviceIssue: "Missed job / service recovery",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-cyan-200 bg-cyan-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1.2fr_1.15fr_1.2fr_1.25fr_1.2fr_1.25fr]"
                  data-mock-customer-service-recovery-communication-workbench-row={row.communicationReference}
                  key={row.communicationReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-customer-service-recovery-communication-workbench-column="Communication reference related recovery job reference customer account"
                    >
                      Communication / Recovery
                    </span>
                    <span className="block">{row.communicationReference}</span>
                    <span className="block">{row.relatedRecoveryJobReference}</span>
                    <span className="block">{row.customerAccount}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-customer-service-recovery-communication-workbench-column="Service issue customer impact"
                    >
                      Issue / Impact
                    </span>
                    <span className="block">{row.serviceIssue}</span>
                    <span className="block">{row.customerImpact}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-customer-service-recovery-communication-workbench-column="Proposed customer update"
                    >
                      Proposed Update
                    </span>
                    <span>{row.proposedCustomerUpdate}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-customer-service-recovery-communication-workbench-column="Manager approval status goodwill no-charge review status"
                    >
                      Approval / Goodwill
                    </span>
                    <span className="block">{row.managerApprovalStatus}</span>
                    <span className="block">{row.goodwillNoChargeReviewStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-customer-service-recovery-communication-workbench-column="Communication readiness message-channel readiness"
                    >
                      Communication / Channel
                    </span>
                    <span className="block">{row.communicationReadiness}</span>
                    <span className="block">{row.messageChannelReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-customer-service-recovery-communication-workbench-column="Closeout handoff readiness next internal action"
                    >
                      Closeout / Next
                    </span>
                    <span className="block">{row.closeoutHandoffReadiness}</span>
                    <span className="block">{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-customer-service-recovery-communication-workbench-communication-note="true"
              >
                Customer recovery communication - mock only. Customer impact, proposed customer update, manager
                approval, goodwill/no-charge review, communication readiness, message-channel readiness, and closeout
                handoff readiness stay as static review labels.
              </p>
              <p
                className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-customer-service-recovery-communication-workbench-distinction="true"
              >
                This is separate from Replacement Vehicle &amp; Service Recovery: it reviews customer-facing wording,
                goodwill/no-charge status, manager approval, and message-channel readiness before future closeout.
              </p>
              <p
                className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-customer-service-recovery-communication-workbench-safety="true"
              >
                Mock Only. No customer update sent, no message-channel delivery, no customer notification sent, no
                goodwill credit created, no no-charge billing decision saved, no invoice adjusted, no payment link
                created, no PDF generated, no accounting posting, no finance export, no closeout record created.
              </p>
            </div>

            <p
              className="text-[10px] leading-[1.15] text-slate-500"
              data-mock-customer-service-recovery-communication-workbench-boundary="true"
            >
              Future workflow boundary: Mock/local only. No real customer update sending, message-channel delivery,
              customer notification sending, goodwill credit creation, no-charge billing decision persistence, invoice
              adjustment, payment link, PDF generation, accounting integration, accounting posting, finance export,
              customer account, customer auth, closeout workflow, closeout record, replacement vehicle dispatch, backup
              driver assignment, driver acknowledgement behavior, live location behavior, proof/photo upload, job status
              persistence, billing, invoice, statement, payment, payout, save/load behavior, storage, localStorage,
              sessionStorage, cookies, IndexedDB, API call, fetch, XHR, sendBeacon, WebSocket, Supabase, parser file
              changes, package script changes, test:safe membership changes, customer notification, notification, or
              send behavior.
            </p>
          </div>
        </section>

        <section
          aria-label="Fleet Driver Readiness Workbench Mock Only"
          className="rounded-lg border border-emerald-200 bg-white px-3 py-2 shadow-sm"
          data-mock-fleet-driver-readiness-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-emerald-700">Fleet &amp; Driver Readiness Workbench</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-fleet-driver-readiness-workbench-copy="true"
                >
                  Internal/admin-only fleet and driver readiness preview before dispatch. Static/mock/local display data
                  only; no real driver assignment, vehicle assignment, schedule change, fleet tracking, notification,
                  storage, API, or Supabase behavior is active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-700">
                Display-only readiness workbench
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-fleet-driver-readiness-workbench-filter-summary="true"
            >
              {[
                ["Readiness scope", "Drivers, vehicles, schedule conflicts, backup coverage"],
                ["Source", "Mock operations readiness review before dispatch"],
                ["Mock results", "3 fleet/driver readiness rows maximum"],
                ["Mode", "Mock Only / display-only / no actions"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-emerald-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5" data-mock-fleet-driver-readiness-workbench-rows="true">
              {[
                {
                  backupCoverageStatus: "Backup coverage not needed",
                  dispatchReadiness: "Dispatch ready - no assignment created",
                  driver: "Arun Lim",
                  driverReadinessStatus: "Driver ready for dispatch review",
                  maintenanceDocumentationStatus: "Documentation current / maintenance clear",
                  nextInternalAction: "Keep on ready list for future dispatcher assignment",
                  nextJobWindow: "Today 14:30-16:00",
                  readinessReference: "PLO-FLEET-2026-05-READY",
                  scheduleConflictStatus: "No schedule conflict",
                  serviceClass: "Arrival",
                  vehiclePlate: "Mercedes E-Class / SGM101A",
                  vehicleReadinessStatus: "Vehicle readiness checked - mock only",
                },
                {
                  backupCoverageStatus: "Backup vehicle watch needed",
                  dispatchReadiness: "Dispatch hold until documents are reviewed",
                  driver: "Nadia Tan",
                  driverReadinessStatus: "Driver ready; vehicle review pending",
                  maintenanceDocumentationStatus: "Vehicle documentation check pending",
                  nextInternalAction: "Review maintenance/documentation before future dispatch",
                  nextJobWindow: "Today 18:00-22:00",
                  readinessReference: "PLO-FLEET-2026-05-DOCS",
                  scheduleConflictStatus: "No driver schedule conflict",
                  serviceClass: "Hourly",
                  vehiclePlate: "Toyota Alphard / SJA8822K",
                  vehicleReadinessStatus: "Maintenance check pending - display only",
                },
                {
                  backupCoverageStatus: "Backup driver review needed",
                  dispatchReadiness: "Dispatch readiness blocked in mock review",
                  driver: "Marcus Lee",
                  driverReadinessStatus: "Driver schedule conflict risk",
                  maintenanceDocumentationStatus: "Vehicle documentation ready; driver timing needs review",
                  nextInternalAction: "Review backup driver before future dispatch",
                  nextJobWindow: "Tomorrow 06:30-08:30",
                  readinessReference: "PLO-FLEET-2026-05-CONFLICT",
                  scheduleConflictStatus: "Schedule conflict risk with earlier job",
                  serviceClass: "Departure",
                  vehiclePlate: "Mercedes V-Class / SKX7408D",
                  vehicleReadinessStatus: "Vehicle ready; schedule risk remains",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-emerald-200 bg-emerald-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1.2fr_1.15fr_1.1fr_1.2fr_1.2fr_1.25fr]"
                  data-mock-fleet-driver-readiness-workbench-row={row.readinessReference}
                  key={row.readinessReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-fleet-driver-readiness-workbench-column="Readiness reference driver vehicle plate"
                    >
                      Readiness / Driver
                    </span>
                    <span className="block">{row.readinessReference}</span>
                    <span className="block">{row.driver}</span>
                    <span className="block">{row.vehiclePlate}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-fleet-driver-readiness-workbench-column="Service class next job window"
                    >
                      Service / Window
                    </span>
                    <span className="block">{row.serviceClass}</span>
                    <span>{row.nextJobWindow}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-fleet-driver-readiness-workbench-column="Driver readiness status vehicle readiness status"
                    >
                      Driver / Vehicle
                    </span>
                    <span className="block">{row.driverReadinessStatus}</span>
                    <span>{row.vehicleReadinessStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-fleet-driver-readiness-workbench-column="Schedule conflict status maintenance documentation status"
                    >
                      Conflict / Docs
                    </span>
                    <span className="block">{row.scheduleConflictStatus}</span>
                    <span>{row.maintenanceDocumentationStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-fleet-driver-readiness-workbench-column="Backup coverage status dispatch readiness"
                    >
                      Backup / Dispatch
                    </span>
                    <span className="block">{row.backupCoverageStatus}</span>
                    <span>{row.dispatchReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-fleet-driver-readiness-workbench-column="Next internal action"
                    >
                      Next Internal Action
                    </span>
                    <span>{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-fleet-driver-readiness-workbench-readiness-note="true"
              >
                Fleet readiness - mock only. Driver readiness, vehicle readiness, schedule conflict,
                maintenance/documentation, backup coverage, dispatch readiness, and next internal action stay as static
                review labels.
              </p>
              <p
                className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-fleet-driver-readiness-workbench-distinction="true"
              >
                This is separate from Customer Service Recovery, Replacement Vehicle Recovery, and Driver Job
                Completion: it reviews pre-dispatch fleet and driver readiness only.
              </p>
              <p
                className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-fleet-driver-readiness-workbench-safety="true"
              >
                Mock Only. No driver assigned, no vehicle assigned, no schedule changed, no live location activated, no
                driver acknowledgement sent, no customer update sent, no notification sent, no job status saved, no
                dispatch record created, no maintenance record created, no billing, invoice, payment, PDF, payout,
                accounting, or finance export created. No save/load and no API/storage/Supabase behavior.
              </p>
            </div>

            <p className="text-[10px] leading-[1.15] text-slate-500" data-mock-fleet-driver-readiness-workbench-boundary="true">
              Future workflow boundary: Mock/local only. No real fleet scheduling workflow, driver assignment, vehicle
              assignment, backup driver assignment, backup vehicle assignment, schedule update, maintenance record,
              driver acknowledgement behavior, customer update sending, notification sending, live location behavior,
              job status persistence, dispatch workflow, dispatch record, billing, invoice, statement, payment, payment
              link, PDF, payout, accounting posting, finance export, customer account, customer auth, save/load
              behavior, storage, localStorage, sessionStorage, cookies, IndexedDB, API call, fetch, XHR, sendBeacon,
              WebSocket, Supabase, parser file changes, package script changes, test:safe membership changes,
              message-channel delivery, customer notification, notification, fleet tracking, or send behavior.
            </p>
          </div>
        </section>

        <section
          aria-label="Operations Handover Shift Briefing Workbench Mock Only"
          className="rounded-lg border border-sky-200 bg-white px-3 py-2 shadow-sm"
          data-mock-operations-handover-shift-briefing-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-sky-700">Operations Handover &amp; Shift Briefing Workbench</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-operations-handover-shift-briefing-workbench-copy="true"
                >
                  Internal/admin-only shift handover and daily briefing preview for active operations priorities.
                  Static/mock/local display data only; no real scheduling, customer update, notification, persistence,
                  storage, API, or Supabase behavior is active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold uppercase text-sky-700">
                Display-only shift briefing
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-operations-handover-shift-briefing-workbench-filter-summary="true"
            >
              {[
                ["Shift/date scope", "Today shift handover / daily operations briefing"],
                ["Source", "Mock cross-workbench operations review"],
                ["Mock results", "3 handover rows maximum"],
                ["Mode", "Mock Only / display-only / no actions"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-sky-200 bg-sky-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-sky-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5" data-mock-operations-handover-shift-briefing-workbench-rows="true">
              {[
                {
                  currentStatus: "VIP airport job confirmed; monitor flight timing",
                  customerImpact: "Customer impact low; no customer update sent",
                  driverFleetImpact: "Driver/fleet ready; no schedule conflict",
                  financeCloseoutImpact: "No finance/closeout impact",
                  handoverReadiness: "Ready for next shift briefing",
                  handoverReference: "PLO-HANDOVER-2026-05-MORNING",
                  nextInternalAction: "Monitor flight timing before future dispatch review",
                  ownerNextShiftAssignee: "Morning dispatcher",
                  priorityArea: "VIP airport priority",
                  relatedJobAccount: "PLO-ARR-VIP-204 / VIP Customer",
                  riskExceptionSummary: "Flight timing watch only",
                  shiftWindow: "Morning handover 06:00-10:00",
                },
                {
                  currentStatus: "Manager/customer update review pending",
                  customerImpact: "Customer impact review pending; update not sent",
                  driverFleetImpact: "Replacement vehicle and backup driver status carried for review",
                  financeCloseoutImpact: "Closeout handoff held until recovery review",
                  handoverReadiness: "Handover needs manager review",
                  handoverReference: "PLO-HANDOVER-2026-05-RECOVERY",
                  nextInternalAction: "Review manager/customer update readiness before future closeout",
                  ownerNextShiftAssignee: "Afternoon lead dispatcher",
                  priorityArea: "Service recovery",
                  relatedJobAccount: "PLO-REC-2026-05-BREAKDOWN / Ritz-Carlton",
                  riskExceptionSummary: "Replacement/service recovery case needs manager review",
                  shiftWindow: "Afternoon handover 14:00-18:00",
                },
                {
                  currentStatus: "Evidence pending before billing handoff",
                  customerImpact: "No customer message prepared",
                  driverFleetImpact: "No driver/fleet action",
                  financeCloseoutImpact: "Finance/closeout blocked pending evidence",
                  handoverReadiness: "Handover held for evidence review",
                  handoverReference: "PLO-HANDOVER-2026-05-CLOSEOUT",
                  nextInternalAction: "Collect evidence in future workflow before finance handoff",
                  ownerNextShiftAssignee: "Finance/admin next shift",
                  priorityArea: "Finance closeout",
                  relatedJobAccount: "PLO-FIN-EXC-2026-05-EVIDENCE / UBS Priority",
                  riskExceptionSummary: "Extra-charge evidence missing; hold billing handoff",
                  shiftWindow: "Month-end handover 17:00-19:00",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-sky-200 bg-sky-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1.2fr_1.15fr_1.15fr_1.15fr_1.15fr_1.25fr]"
                  data-mock-operations-handover-shift-briefing-workbench-row={row.handoverReference}
                  key={row.handoverReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-sky-700"
                      data-mock-operations-handover-shift-briefing-workbench-column="Handover reference shift handover window"
                    >
                      Handover / Shift
                    </span>
                    <span className="block">{row.handoverReference}</span>
                    <span>{row.shiftWindow}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-sky-700"
                      data-mock-operations-handover-shift-briefing-workbench-column="Priority area related job account"
                    >
                      Priority / Related
                    </span>
                    <span className="block">{row.priorityArea}</span>
                    <span>{row.relatedJobAccount}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-sky-700"
                      data-mock-operations-handover-shift-briefing-workbench-column="Current status risk exception summary"
                    >
                      Status / Risk
                    </span>
                    <span className="block">{row.currentStatus}</span>
                    <span>{row.riskExceptionSummary}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-sky-700"
                      data-mock-operations-handover-shift-briefing-workbench-column="Owner next shift assignee customer impact"
                    >
                      Owner / Customer
                    </span>
                    <span className="block">{row.ownerNextShiftAssignee}</span>
                    <span>{row.customerImpact}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-sky-700"
                      data-mock-operations-handover-shift-briefing-workbench-column="Driver fleet impact finance closeout impact"
                    >
                      Driver-Fleet / Finance
                    </span>
                    <span className="block">{row.driverFleetImpact}</span>
                    <span>{row.financeCloseoutImpact}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-sky-700"
                      data-mock-operations-handover-shift-briefing-workbench-column="Handover readiness next internal action"
                    >
                      Readiness / Next
                    </span>
                    <span className="block">{row.handoverReadiness}</span>
                    <span>{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-sky-200 bg-sky-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-operations-handover-shift-briefing-workbench-coverage-note="true"
              >
                Operations handover - mock only. Handover reference, shift window, priority area, related job/account,
                status, risk summary, owner/next shift assignee, customer impact, driver/fleet impact, finance/closeout
                impact, handover readiness, and next internal action stay as static review labels.
              </p>
              <p
                className="min-w-0 rounded-md border border-sky-200 bg-sky-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-operations-handover-shift-briefing-workbench-distinction="true"
              >
                This is separate from Fleet &amp; Driver Readiness, Customer Service Recovery, Replacement Vehicle
                Recovery, and Driver Job Completion: it summarizes cross-shift priorities and handover readiness only.
              </p>
              <p
                className="min-w-0 rounded-md border border-sky-200 bg-sky-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-operations-handover-shift-briefing-workbench-safety="true"
              >
                Mock Only. No shift handover saved, no job status changed, no driver assigned, no vehicle assigned, no
                schedule changed, no customer update sent, no notification sent, no live location activated, no dispatch
                record created, no closeout record created, no billing, invoice, payment, PDF, payout, accounting, or
                finance export created. No save/load and no API/storage/Supabase behavior.
              </p>
            </div>

            <p
              className="text-[10px] leading-[1.15] text-slate-500"
              data-mock-operations-handover-shift-briefing-workbench-boundary="true"
            >
              Future workflow boundary: Mock/local only. No real operations handover workflow, shift scheduling
              workflow, driver assignment, vehicle assignment, backup driver assignment, backup vehicle assignment,
              schedule update, job status persistence, dispatch workflow, dispatch record, customer update sending,
              notification sending, live location behavior, closeout workflow, closeout record, billing, invoice,
              statement, payment, payment link, PDF, payout, accounting posting, finance export, customer account,
              customer auth, save/load behavior, storage, localStorage, sessionStorage, cookies, IndexedDB, API call,
              fetch, XHR, sendBeacon, WebSocket, Supabase, parser file changes, package script changes, test:safe
              membership changes, message-channel delivery, customer notification, notification, or send behavior.
            </p>
          </div>
        </section>

        <section
          aria-label="Customer Account Service Profile Workbench Mock Only"
          className="rounded-lg border border-indigo-200 bg-white px-3 py-2 shadow-sm"
          data-mock-customer-account-service-profile-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-indigo-700">Customer Account &amp; Service Profile Workbench</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-customer-account-service-profile-workbench-copy="true"
                >
                  Internal/admin-only regular customer/account service profile preview for service preferences, billing
                  contact readiness, VIP notes, and monthly billing readiness. Static/mock/local display data only; no
                  real CRM/account profile, customer database, billing, notification, storage, API, or Supabase behavior
                  is active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold uppercase text-indigo-700">
                Display-only account review
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-customer-account-service-profile-workbench-filter-summary="true"
            >
              {[
                ["Account scope", "Regular customer/account service profiles"],
                ["Source", "Mock service preference and billing-readiness review"],
                ["Mock results", "3 account rows maximum"],
                ["Mode", "Mock Only / display-only / no actions"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-indigo-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5" data-mock-customer-account-service-profile-workbench-rows="true">
              {[
                {
                  accountReference: "PLO-ACCT-PROFILE-UBS",
                  billingContactReadiness: "Billing contact confirmed for mock review",
                  customerAccount: "UBS Priority",
                  internalReviewStatus: "Profile review ready",
                  monthlyBillingReadiness: "Monthly billing ready in mock review - not activated",
                  nextInternalAction: "Keep account profile ready for future dispatcher reference",
                  openOperationsNote: "Confirm flight timing preference before future booking review",
                  primaryBookerContact: "Sarah Lim / Corporate travel desk",
                  servicePreferenceSummary: "Airport arrivals, departures, and VIP transfers",
                  usualServicePattern: "Weekday executive airport movement",
                  vipSpecialHandlingNotes: "VIP meet-and-greet preference noted",
                },
                {
                  accountReference: "PLO-ACCT-PROFILE-RITZ",
                  billingContactReadiness: "Billing contact needs confirmation",
                  customerAccount: "Ritz-Carlton Concierge",
                  internalReviewStatus: "Needs billing contact review",
                  monthlyBillingReadiness: "Monthly billing held in mock review",
                  nextInternalAction: "Confirm billing contact before future monthly handoff",
                  openOperationsNote: "Concierge service notes reviewed; billing contact still pending",
                  primaryBookerContact: "Concierge desk / Hotel travel desk",
                  servicePreferenceSummary: "Guest transfers, luggage handling, and concierge notes",
                  usualServicePattern: "Airport and hourly concierge requests",
                  vipSpecialHandlingNotes: "Guest privacy and concierge handoff notes reviewed",
                },
                {
                  accountReference: "PLO-ACCT-PROFILE-VIP",
                  billingContactReadiness: "Private billing contact not saved",
                  customerAccount: "VIP Private Customer",
                  internalReviewStatus: "Manager review pending",
                  monthlyBillingReadiness: "Monthly billing handoff pending manager review",
                  nextInternalAction: "Review special handling notes before future account handoff",
                  openOperationsNote: "Special handling notes pending manager review before billing handoff",
                  primaryBookerContact: "Personal assistant / private contact",
                  servicePreferenceSummary: "Private airport transfer and standby preference",
                  usualServicePattern: "Ad hoc VIP movements with privacy handling",
                  vipSpecialHandlingNotes: "VIP/special handling notes pending manager review",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-indigo-200 bg-indigo-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1.15fr_1.2fr_1.15fr_1.15fr_1.15fr_1.2fr]"
                  data-mock-customer-account-service-profile-workbench-row={row.accountReference}
                  key={row.accountReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-customer-account-service-profile-workbench-column="Account reference customer account"
                    >
                      Account / Customer
                    </span>
                    <span className="block">{row.accountReference}</span>
                    <span>{row.customerAccount}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-customer-account-service-profile-workbench-column="Primary booker contact billing contact readiness"
                    >
                      Booker / Billing
                    </span>
                    <span className="block">{row.primaryBookerContact}</span>
                    <span>{row.billingContactReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-customer-account-service-profile-workbench-column="Service preference summary usual service pattern"
                    >
                      Service Pattern
                    </span>
                    <span className="block">{row.servicePreferenceSummary}</span>
                    <span>{row.usualServicePattern}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-customer-account-service-profile-workbench-column="VIP special handling notes monthly billing readiness"
                    >
                      VIP / Billing
                    </span>
                    <span className="block">{row.vipSpecialHandlingNotes}</span>
                    <span>{row.monthlyBillingReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-customer-account-service-profile-workbench-column="Open operations note internal review status"
                    >
                      Ops Note / Review
                    </span>
                    <span className="block">{row.openOperationsNote}</span>
                    <span>{row.internalReviewStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-customer-account-service-profile-workbench-column="Next internal action"
                    >
                      Next Internal Action
                    </span>
                    <span>{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-customer-account-service-profile-workbench-coverage-note="true"
              >
                Customer profile review - mock only. Account reference, customer/account, primary booker/contact,
                billing contact readiness, service preference summary, usual service pattern, VIP/special handling
                notes, monthly billing readiness, open operations note, internal review status, and next internal action
                stay as static review labels.
              </p>
              <p
                className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-customer-account-service-profile-workbench-distinction="true"
              >
                This is separate from Operations Handover, Fleet &amp; Driver Readiness, Customer Service Recovery,
                Replacement Vehicle Recovery, and Driver Job Completion: it reviews customer/account service profile
                readiness only.
              </p>
              <p
                className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-customer-account-service-profile-workbench-safety="true"
              >
                Mock Only. No customer profile saved, no CRM/account record created, no billing contact saved, no
                monthly billing activated, no invoice generated, no statement generated, no payment link created, no PDF
                generated, no customer notification sent, and no message-channel delivery. No save/load and no
                API/storage/Supabase behavior.
              </p>
            </div>

            <p
              className="text-[10px] leading-[1.15] text-slate-500"
              data-mock-customer-account-service-profile-workbench-boundary="true"
            >
              Future workflow boundary: Mock/local only. No real customer account/profile workflow, CRM record
              creation, billing contact persistence, monthly billing activation, invoice generation, statement
              generation, payment links, PDF generation, customer notification sending, message-channel delivery,
              customer account behavior, customer auth, save/load behavior, storage, localStorage, sessionStorage,
              cookies, IndexedDB, API call, fetch, XHR, sendBeacon, WebSocket, Supabase, parser file changes, package
              script changes, test:safe membership changes, billing, invoice, statement, payment, payout, accounting
              posting, finance export, or send behavior.
            </p>
          </div>
        </section>

        <section
          aria-label="Booking Intake Quality Account Matching Workbench Mock Only"
          className="rounded-lg border border-teal-200 bg-white px-3 py-2 shadow-sm"
          data-mock-booking-intake-account-matching-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-teal-700">Booking Intake Quality &amp; Account Matching Workbench</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-booking-intake-account-matching-workbench-copy="true"
                >
                  Internal/admin-only booking intake quality and customer/account matching preview before operational
                  handoff. Static/mock/local display data only; no real parser change, customer account link, booking
                  save, dispatch job, storage, API, or Supabase behavior is active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-semibold uppercase text-teal-700">
                Display-only intake review
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-booking-intake-account-matching-workbench-filter-summary="true"
            >
              {[
                ["Intake scope", "Booking intake quality and account matching"],
                ["Source", "Mock parser/manual review and dispatcher intake QA"],
                ["Mock results", "3 booking intake rows maximum"],
                ["Mode", "Mock Only / display-only / no actions"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-teal-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5" data-mock-booking-intake-account-matching-workbench-rows="true">
              {[
                {
                  bookerContactReadiness: "Booker/contact ready for dispatcher review",
                  customerAccountMatch: "UBS matched from organization domain ubs.com - mock review only",
                  dispatchHandoffReadiness: "Dispatch handoff ready in mock review",
                  flightTimingReadiness: "Flight and pickup timing complete",
                  intakeReference: "PLO-INTAKE-MATCH-UBS",
                  missingDetailExceptionSummary: "No missing detail exception in mock row",
                  nextInternalAction: "Dispatcher may continue future operational review",
                  parserManualReviewStatus: "Parser suggestion checked; manual review complete",
                  passengerReadiness: "Passenger name and pax ready",
                  routeCompleteness: "Pickup, drop-off, and route complete",
                  sourceChannel: "Corporate email booking",
                  vehiclePaxReadiness: "Vehicle class and pax ready",
                },
                {
                  bookerContactReadiness: "Contact ready; company/account blank",
                  customerAccountMatch: "Public/personal email domain - no company/account created",
                  dispatchHandoffReadiness: "Dispatch handoff held for account review",
                  flightTimingReadiness: "Pickup timing ready",
                  intakeReference: "PLO-INTAKE-MANUAL-PERSONAL",
                  missingDetailExceptionSummary: "Manual account review needed before any future link",
                  nextInternalAction: "Confirm whether this stays private customer or maps to an account",
                  parserManualReviewStatus: "Manual account review separate from parser behavior",
                  passengerReadiness: "Passenger ready",
                  routeCompleteness: "Route complete",
                  sourceChannel: "Public/personal email booking",
                  vehiclePaxReadiness: "Vehicle and pax ready",
                },
                {
                  bookerContactReadiness: "Booker contact present",
                  customerAccountMatch: "Prestige Transport ignored as own company - not a customer/account",
                  dispatchHandoffReadiness: "Dispatch handoff blocked in mock review",
                  flightTimingReadiness: "Flight detail missing; pickup timing needs review",
                  intakeReference: "PLO-INTAKE-MISSING-DETAIL",
                  missingDetailExceptionSummary: "Drop-off or flight detail incomplete; dispatcher review required",
                  nextInternalAction: "Collect missing route/flight detail before future dispatch handoff",
                  parserManualReviewStatus: "Parser/manual review required - no parser change made",
                  passengerReadiness: "Passenger name ready",
                  routeCompleteness: "Route incomplete until missing detail is confirmed",
                  sourceChannel: "Forwarded operations message",
                  vehiclePaxReadiness: "Vehicle/pax readiness pending missing detail review",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-teal-200 bg-teal-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1.1fr_1.25fr_1.05fr_1.05fr_1.25fr_1.2fr]"
                  data-mock-booking-intake-account-matching-workbench-row={row.intakeReference}
                  key={row.intakeReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-booking-intake-account-matching-workbench-column="Intake reference source channel"
                    >
                      Intake / Source
                    </span>
                    <span className="block">{row.intakeReference}</span>
                    <span>{row.sourceChannel}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-booking-intake-account-matching-workbench-column="Customer account match booker contact readiness"
                    >
                      Account / Contact
                    </span>
                    <span className="block">{row.customerAccountMatch}</span>
                    <span>{row.bookerContactReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-booking-intake-account-matching-workbench-column="Passenger readiness route completeness"
                    >
                      Passenger / Route
                    </span>
                    <span className="block">{row.passengerReadiness}</span>
                    <span>{row.routeCompleteness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-booking-intake-account-matching-workbench-column="Flight timing readiness vehicle pax readiness"
                    >
                      Timing / Vehicle
                    </span>
                    <span className="block">{row.flightTimingReadiness}</span>
                    <span>{row.vehiclePaxReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-booking-intake-account-matching-workbench-column="Parser manual review status missing detail exception summary"
                    >
                      Review / Exception
                    </span>
                    <span className="block">{row.parserManualReviewStatus}</span>
                    <span>{row.missingDetailExceptionSummary}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-booking-intake-account-matching-workbench-column="Dispatch handoff readiness next internal action"
                    >
                      Handoff / Next
                    </span>
                    <span className="block">{row.dispatchHandoffReadiness}</span>
                    <span>{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-booking-intake-account-matching-workbench-coverage-note="true"
              >
                Intake quality review - mock only. Intake reference, source/channel, customer/account match,
                booker/contact readiness, passenger readiness, route completeness, flight/timing readiness, vehicle/pax
                readiness, parser/manual review status, missing detail/exception summary, dispatch handoff readiness,
                and next internal action stay as static review labels.
              </p>
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-booking-intake-account-matching-workbench-rules="true"
              >
                Matching rules preserved: Prestige Transport is our own company and is not a customer/account;
                organization email domains may support inference such as ubs.com to UBS; public/personal email domains
                must not create a company/account; manual account review stays separate from automatic parser behavior.
              </p>
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-booking-intake-account-matching-workbench-safety="true"
              >
                Mock Only. No parser change, no booking saved, no account linked, no customer profile saved, no
                customer/contact record created, no dispatch job created, no driver assigned, no vehicle assigned, no
                customer update sent, no notification sent, and no billing, invoice, payment, PDF, payout, accounting,
                or finance export created.
              </p>
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-[1fr_2fr]">
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-booking-intake-account-matching-workbench-distinction="true"
              >
                This is separate from Customer Account &amp; Service Profile, Operations Handover, Fleet &amp; Driver
                Readiness, Customer Service Recovery, Replacement Vehicle Recovery, and Driver Job Completion: it reviews
                booking intake quality and account matching before operational handoff only.
              </p>
              <p
                className="text-[10px] leading-[1.15] text-slate-500"
                data-mock-booking-intake-account-matching-workbench-boundary="true"
              >
                Future workflow boundary: Mock/local only. No parser behavior changes, parser file changes, parser test
                changes, real booking intake workflow, customer/account matching workflow, CRM creation, customer profile
                creation, customer/contact persistence, booking save/load behavior, account linking, dispatch job
                creation, driver assignment, vehicle assignment, schedule update, customer update sending, notification
                sending, live location behavior, billing, invoice, statement, payment, payment link, PDF, payout,
                accounting posting, finance export, customer account/auth behavior, localStorage, sessionStorage,
                cookies, IndexedDB, API call, fetch, XHR, sendBeacon, WebSocket, Supabase, package script changes,
                test:safe membership changes, message-channel delivery, customer notification, notification, or send
                behavior.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Airport Flight Monitoring Pickup Readiness Workbench Mock Only"
          className="rounded-lg border border-cyan-200 bg-white px-3 py-2 shadow-sm"
          data-mock-airport-flight-pickup-readiness-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-cyan-700">
                    Airport Flight Monitoring &amp; Pickup Readiness Workbench
                  </span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-airport-flight-pickup-readiness-workbench-copy="true"
                >
                  Internal/admin-only airport pickup readiness preview for flight timing, terminal/FBO readiness,
                  driver staging, meet-and-greet, customer contact, delay risk, and dispatch readiness. Static/mock/local
                  display data only; no real flight API, maps API, live tracking, dispatch automation, storage, API, or
                  Supabase behavior is active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-semibold uppercase text-cyan-700">
                Display-only airport readiness
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-airport-flight-pickup-readiness-workbench-filter-summary="true"
            >
              {[
                ["Airport/date scope", "Mock Changi and Seletar/WSSL airport pickup readiness"],
                ["Source", "Mock dispatcher airport timing and FBO review"],
                ["Mock results", "3 airport pickup rows maximum"],
                ["Mode", "Mock Only / display-only / no actions"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-cyan-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5" data-mock-airport-flight-pickup-readiness-workbench-rows="true">
              {[
                {
                  airportReadinessReference: "PLO-AIR-READY-CHANGI-ARR",
                  airportTerminalFbo: "Changi Airport T3 arrival belt",
                  customerAccount: "UBS Priority",
                  customerContactReadiness: "Customer contact ready",
                  delayExceptionRisk: "Low delay risk; monitor landing time manually",
                  dispatchReadiness: "Dispatch readiness ready in mock review",
                  driverStagingStatus: "Driver staging ready; no dispatch created",
                  flightTailNumber: "SQ333",
                  flightTimingStatus: "Flight on time - mock review only",
                  jobReference: "PLO-ARR-2026-05-CHG1",
                  meetGreetReadiness: "Meet-and-greet ready",
                  nextInternalAction: "Keep airport pickup ready for future dispatcher review",
                  scheduledPickupWindow: "27 May 2026 15:30-16:00",
                },
                {
                  airportReadinessReference: "PLO-AIR-READY-CHANGI-DEP",
                  airportTerminalFbo: "Changi Airport T1 departure curb",
                  customerAccount: "Ritz-Carlton Concierge",
                  customerContactReadiness: "Customer contact ready; update not sent",
                  delayExceptionRisk: "Monitor traffic/timing manually; no maps API",
                  dispatchReadiness: "Dispatch readiness monitor only",
                  driverStagingStatus: "Driver staging watch pending traffic review",
                  flightTailNumber: "SQ326",
                  flightTimingStatus: "Pickup window confirmed - no live flight tracking",
                  jobReference: "PLO-DEP-2026-05-CHG2",
                  meetGreetReadiness: "Meet-and-greet not required",
                  nextInternalAction: "Keep departure timing on manual dispatcher watch",
                  scheduledPickupWindow: "28 May 2026 09:10-09:40",
                },
                {
                  airportReadinessReference: "PLO-AIR-READY-SELETAR-FBO",
                  airportTerminalFbo: "Seletar Airport / WSSL / Jet Aviation FBO",
                  customerAccount: "VIP Private Customer",
                  customerContactReadiness: "Customer contact pending manager check",
                  delayExceptionRisk: "FBO/tail confirmation risk; do not convert to Changi",
                  dispatchReadiness: "Dispatch handoff held in mock review",
                  driverStagingStatus: "Driver staging held until manual FBO confirmation",
                  flightTailNumber: "Tail 9V-PJT / manual confirmation pending",
                  flightTimingStatus: "Private-jet timing requires manual confirmation",
                  jobReference: "PLO-PJ-2026-05-WSSL",
                  meetGreetReadiness: "FBO meet-and-greet readiness checked",
                  nextInternalAction: "Confirm tail/FBO manually; keep Seletar/WSSL/Jet Aviation",
                  scheduledPickupWindow: "29 May 2026 20:00-20:30",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-cyan-200 bg-cyan-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1.05fr_1.15fr_1.1fr_1.15fr_1.15fr_1.25fr]"
                  data-mock-airport-flight-pickup-readiness-workbench-row={row.airportReadinessReference}
                  key={row.airportReadinessReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-airport-flight-pickup-readiness-workbench-column="Airport readiness reference job reference"
                    >
                      Airport / Job
                    </span>
                    <span className="block">{row.airportReadinessReference}</span>
                    <span>{row.jobReference}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-airport-flight-pickup-readiness-workbench-column="Customer account airport terminal FBO"
                    >
                      Customer / Location
                    </span>
                    <span className="block">{row.customerAccount}</span>
                    <span>{row.airportTerminalFbo}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-airport-flight-pickup-readiness-workbench-column="Flight tail number scheduled pickup window"
                    >
                      Flight / Window
                    </span>
                    <span className="block">{row.flightTailNumber}</span>
                    <span>{row.scheduledPickupWindow}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-airport-flight-pickup-readiness-workbench-column="Flight timing status driver staging status"
                    >
                      Timing / Staging
                    </span>
                    <span className="block">{row.flightTimingStatus}</span>
                    <span>{row.driverStagingStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-airport-flight-pickup-readiness-workbench-column="Meet and greet readiness customer contact readiness"
                    >
                      Meet / Contact
                    </span>
                    <span className="block">{row.meetGreetReadiness}</span>
                    <span>{row.customerContactReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-cyan-700"
                      data-mock-airport-flight-pickup-readiness-workbench-column="Delay exception risk dispatch readiness next internal action"
                    >
                      Risk / Dispatch / Next
                    </span>
                    <span className="block">{row.delayExceptionRisk}</span>
                    <span className="block">{row.dispatchReadiness}</span>
                    <span>{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-airport-flight-pickup-readiness-workbench-coverage-note="true"
              >
                Airport pickup review - mock only. Airport readiness reference, job reference, customer/account,
                airport/terminal/FBO, flight/tail number, scheduled pickup window, flight timing status, driver staging
                status, meet-and-greet readiness, customer contact readiness, delay/exception risk, dispatch readiness,
                and next internal action stay as static review labels.
              </p>
              <p
                className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-airport-flight-pickup-readiness-workbench-rules="true"
              >
                Airport rules preserved: Seletar Airport / WSSL / Jet Aviation FBO is a private-jet airport location;
                Seletar/WSSL/Jet Aviation is airport arrival/departure evidence like Changi but remains
                Seletar/WSSL/Jet Aviation and is not converted to Changi. Pickup from Seletar/WSSL to hotel/location is
                private-jet arrival-style readiness; drop-off to Seletar/WSSL is private-jet departure-style readiness.
              </p>
              <p
                className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-airport-flight-pickup-readiness-workbench-safety="true"
              >
                Mock Only. No flight API connected, no live flight tracking activated, no maps or traffic API connected,
                no driver dispatch created, no driver assigned, no live location activated, no customer update sent, no
                notification sent, no airport/FBO confirmation sent, no booking saved, no job status changed, and no
                billing, invoice, payment, PDF, payout, accounting, or finance export created. No save/load, no
                API/storage/Supabase behavior, and no parser change.
              </p>
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-[1fr_2fr]">
              <p
                className="min-w-0 rounded-md border border-cyan-200 bg-cyan-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-airport-flight-pickup-readiness-workbench-distinction="true"
              >
                This is separate from Booking Intake, Fleet Readiness, Operations Handover, Customer Account Profile,
                Customer Service Recovery, Replacement Vehicle Recovery, and Driver Job Completion: it reviews airport
                flight monitoring and pickup readiness before any future dispatch automation only.
              </p>
              <p
                className="text-[10px] leading-[1.15] text-slate-500"
                data-mock-airport-flight-pickup-readiness-workbench-boundary="true"
              >
                Future workflow boundary: Mock/local only. No real flight API behavior, live flight tracking,
                maps/traffic API behavior, airport/FBO confirmation sending, driver dispatch workflow, driver
                assignment, vehicle assignment, live location behavior, customer update sending, notification sending,
                booking save/load behavior, job status persistence, parser behavior changes, parser file changes,
                parser test changes, billing, invoice, statement, payment, payment link, PDF, payout, accounting
                posting, finance export, customer account/auth behavior, localStorage, sessionStorage, cookies,
                IndexedDB, API call, fetch, XHR, sendBeacon, WebSocket, Supabase, package script changes, test:safe
                membership changes, message-channel delivery, customer notification, notification, or send behavior.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Route Itinerary Readiness Workbench Mock Only"
          className="rounded-lg border border-emerald-200 bg-white px-3 py-2 shadow-sm"
          data-mock-route-itinerary-readiness-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-emerald-700">Route &amp; Itinerary Readiness Workbench</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-route-itinerary-readiness-workbench-copy="true"
                >
                  Internal/admin-only route and itinerary readiness preview for pickup/drop-off readiness, route
                  completeness, multi-stop clarity, passenger/contact readiness, timing risk, special handling, and
                  dispatch handoff. Static/mock/local display data only; no real route optimization, maps/geocoding API,
                  dispatch workflow, storage, API, or Supabase behavior is active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-700">
                Display-only route readiness
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-route-itinerary-readiness-workbench-filter-summary="true"
            >
              {[
                ["Route/date scope", "Mock pickup, drop-off, and waypoint readiness"],
                ["Source", "Mock dispatcher route and itinerary review"],
                ["Mock results", "3 route/itinerary rows maximum"],
                ["Mode", "Mock Only / display-only / no actions"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-emerald-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5" data-mock-route-itinerary-readiness-workbench-rows="true">
              {[
                {
                  customerAccount: "UBS Priority",
                  dispatchHandoffReadiness: "Dispatch handoff ready in mock review",
                  dropoffReadiness: "Marina Bay Sands drop-off confirmed",
                  jobReference: "PLO-ARR-2026-05-ROUTE1",
                  nextInternalAction: "Keep airport transfer route ready for future dispatcher handoff",
                  passengerContactReadiness: "Passenger/contact ready",
                  pickupReadiness: "Changi Airport T3 pickup confirmed",
                  routeExceptionRisk: "Low route risk; no route optimization",
                  routeReadinessReference: "PLO-ROUTE-READY-AIRPORT",
                  routeWaypointSummary: "Changi Airport T3 > Marina Bay Sands",
                  specialHandlingChildSeatNote: "No child seat; arrival meet note reviewed",
                  timingReadiness: "Pickup window and arrival buffer reviewed",
                },
                {
                  customerAccount: "Ritz-Carlton Concierge",
                  dispatchHandoffReadiness: "Dispatcher confirmation needed",
                  dropoffReadiness: "Raffles Hotel final drop-off retained",
                  jobReference: "PLO-DSP-2026-05-MULTI",
                  nextInternalAction: "Confirm full stop order before future dispatch handoff",
                  passengerContactReadiness: "Passenger/contact ready",
                  pickupReadiness: "Ritz-Carlton lobby pickup confirmed",
                  routeExceptionRisk: "Multi-stop sequence review; preserve all later waypoints",
                  routeReadinessReference: "PLO-ROUTE-READY-MULTISTOP",
                  routeWaypointSummary: "Ritz-Carlton > Gardens by the Bay > National Gallery > Raffles Hotel",
                  specialHandlingChildSeatNote: "Extra Stops shown as itinerary context only - not billed",
                  timingReadiness: "Stop sequence timing needs dispatcher confirmation",
                },
                {
                  customerAccount: "VIP Private Customer",
                  dispatchHandoffReadiness: "Dispatch handoff held in mock review",
                  dropoffReadiness: "Marina Bay event entrance confirmed",
                  jobReference: "PLO-VIP-2026-05-CHILD",
                  nextInternalAction: "Confirm child seat note before future dispatch handoff",
                  passengerContactReadiness: "Passenger ready; contact pending manager check",
                  pickupReadiness: "Private residence gate pickup reviewed",
                  routeExceptionRisk: "Special handling and child seat confirmation risk",
                  routeReadinessReference: "PLO-ROUTE-READY-VIP-CHILD",
                  routeWaypointSummary: "Private residence > school pickup waypoint > Marina Bay event entrance",
                  specialHandlingChildSeatNote: "Child seat note pending final confirmation - service handling only",
                  timingReadiness: "VIP timing buffer reviewed manually",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-emerald-200 bg-emerald-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1.05fr_1.15fr_1.25fr_1.15fr_1.15fr_1.25fr]"
                  data-mock-route-itinerary-readiness-workbench-row={row.routeReadinessReference}
                  key={row.routeReadinessReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-route-itinerary-readiness-workbench-column="Route readiness reference job reference"
                    >
                      Route / Job
                    </span>
                    <span className="block">{row.routeReadinessReference}</span>
                    <span>{row.jobReference}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-route-itinerary-readiness-workbench-column="Customer account pickup readiness drop-off readiness"
                    >
                      Customer / Pickup / Drop-off
                    </span>
                    <span className="block">{row.customerAccount}</span>
                    <span className="block">{row.pickupReadiness}</span>
                    <span>{row.dropoffReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-route-itinerary-readiness-workbench-column="Route waypoint summary timing readiness"
                    >
                      Waypoints / Timing
                    </span>
                    <span className="block">{row.routeWaypointSummary}</span>
                    <span>{row.timingReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-route-itinerary-readiness-workbench-column="Passenger contact readiness special handling child seat note"
                    >
                      Passenger / Handling
                    </span>
                    <span className="block">{row.passengerContactReadiness}</span>
                    <span>{row.specialHandlingChildSeatNote}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-route-itinerary-readiness-workbench-column="Route exception risk dispatch handoff readiness"
                    >
                      Risk / Handoff
                    </span>
                    <span className="block">{row.routeExceptionRisk}</span>
                    <span>{row.dispatchHandoffReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-emerald-700"
                      data-mock-route-itinerary-readiness-workbench-column="Next internal action"
                    >
                      Next Internal Action
                    </span>
                    <span>{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-route-itinerary-readiness-workbench-coverage-note="true"
              >
                Route readiness review - mock only. Route readiness reference, job reference, customer/account, pickup
                readiness, drop-off readiness, route/waypoint summary, timing readiness, passenger/contact readiness,
                special handling/child seat note, route exception risk, dispatch handoff readiness, and next internal
                action stay as static review labels.
              </p>
              <p
                className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-route-itinerary-readiness-workbench-rules="true"
              >
                Route rules preserved: route and itinerary readiness stays separate from parser behavior; multi-stop
                route review preserves all waypoints and must not drop later waypoints. Extra Stops appear as
                route/itinerary context only and are not calculated or billed. Child seat notes are service-handling
                context only, with no pricing, billing, or inventory behavior. Manual route review stays separate from
                automatic parser behavior.
              </p>
              <p
                className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-route-itinerary-readiness-workbench-safety="true"
              >
                Mock Only. No route optimization, no maps or geocoding API connected, no traffic API connected, no
                booking saved, no dispatch job created, no driver assigned, no vehicle assigned, no customer update
                sent, no notification sent, no job status changed, and no billing, invoice, payment, PDF, payout,
                accounting, or finance export created. No save/load, no API/storage/Supabase behavior, and no parser
                change.
              </p>
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-[1fr_2fr]">
              <p
                className="min-w-0 rounded-md border border-emerald-200 bg-emerald-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-route-itinerary-readiness-workbench-distinction="true"
              >
                This is separate from Airport Flight Monitoring, Booking Intake, Customer Account Profile, Operations
                Handover, Fleet Readiness, Customer Service Recovery, Replacement Vehicle Recovery, and Driver Job
                Completion: it reviews route and itinerary readiness before any future dispatch handoff only.
              </p>
              <p
                className="text-[10px] leading-[1.15] text-slate-500"
                data-mock-route-itinerary-readiness-workbench-boundary="true"
              >
                Future workflow boundary: Mock/local only. No real route optimization behavior,
                maps/geocoding/traffic API behavior, booking save/load behavior, dispatch workflow, driver assignment,
                vehicle assignment, schedule update, customer update sending, notification sending, live location
                behavior, job status persistence, parser behavior changes, parser file changes, parser test changes,
                billing, invoice, statement, payment, payment link, PDF, payout, accounting posting, finance export,
                customer account/auth behavior, localStorage, sessionStorage, cookies, IndexedDB, API call, fetch, XHR,
                sendBeacon, WebSocket, Supabase, package script changes, test:safe membership changes, message-channel
                delivery, customer notification, notification, or send behavior.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Driver Assignment Dispatch Readiness Workbench Mock Only"
          className="rounded-lg border border-indigo-200 bg-white px-3 py-2 shadow-sm"
          data-mock-driver-assignment-dispatch-readiness-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-indigo-700">Driver Assignment &amp; Dispatch Readiness Workbench</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-driver-assignment-dispatch-readiness-workbench-copy="true"
                >
                  Internal/admin-only driver assignment and dispatch readiness preview for proposed driver/vehicle
                  pairing, job timing, driver contact readiness, acknowledgement readiness, schedule overlap risk,
                  customer update readiness, and dispatch readiness. Static/mock/local display data only; no real driver
                  assignment, vehicle assignment, notification, live location, scheduling, dispatch workflow, storage,
                  API, or Supabase behavior is active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold uppercase text-indigo-700">
                Display-only dispatch readiness
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-driver-assignment-dispatch-readiness-workbench-filter-summary="true"
            >
              {[
                ["Dispatch/date scope", "Mock proposed driver, vehicle, and pickup-window readiness"],
                ["Source", "Mock dispatcher driver/vehicle pairing review"],
                ["Mock results", "3 driver assignment rows maximum"],
                ["Mode", "Mock Only / display-only / no actions"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-indigo-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div
              className="grid min-w-0 gap-1.5"
              data-mock-driver-assignment-dispatch-readiness-workbench-rows="true"
            >
              {[
                {
                  customerAccount: "UBS Priority",
                  customerUpdateReadiness: "Customer update draft ready - not sent",
                  dispatchReadiness: "Dispatch handoff ready in mock review",
                  dispatchReadinessReference: "PLO-DISP-READY-AIRPORT",
                  driverAcknowledgementReadiness: "Driver acknowledgement pending - not sent",
                  driverContactReadiness: "Driver contact ready",
                  jobReference: "PLO-ARR-2026-05-DISP1",
                  nextInternalAction: "Review acknowledgement before any future dispatch handoff",
                  pickupWindow: "27 May 2026 15:30-16:00",
                  proposedDriver: "Proposed driver: Kumar Tan",
                  proposedVehiclePlate: "Mercedes V-Class / SLP 8822",
                  scheduleOverlapRisk: "No overlap risk in mock review",
                  serviceType: "Airport transfer / Arrival",
                },
                {
                  customerAccount: "VIP Private Customer",
                  customerUpdateReadiness: "Customer update readiness pending manager note",
                  dispatchReadiness: "Dispatch readiness needs schedule review",
                  dispatchReadinessReference: "PLO-DISP-READY-VIP-HOURLY",
                  driverAcknowledgementReadiness: "Acknowledgement readiness held in mock review",
                  driverContactReadiness: "Driver contact ready",
                  jobReference: "PLO-DSP-2026-05-VIP",
                  nextInternalAction: "Review overlap warning without blocking or hiding drivers",
                  pickupWindow: "28 May 2026 18:00-22:00",
                  proposedDriver: "Proposed driver: Lee Wei",
                  proposedVehiclePlate: "S-Class / SKX 1188",
                  scheduleOverlapRisk:
                    "Schedule overlap warning only - dispatcher may intentionally assign same driver",
                  serviceType: "Hourly / VIP standby",
                },
                {
                  customerAccount: "Ritz-Carlton Concierge",
                  customerUpdateReadiness: "Customer update not prepared - no message sent",
                  dispatchReadiness: "Dispatch hold in mock review",
                  dispatchReadinessReference: "PLO-DISP-READY-TRANSFER-HOLD",
                  driverAcknowledgementReadiness: "Acknowledgement not requested",
                  driverContactReadiness: "Driver contact ready",
                  jobReference: "PLO-TRF-2026-05-HOLD",
                  nextInternalAction: "Prepare customer update readiness before future dispatch handoff",
                  pickupWindow: "29 May 2026 09:10-09:40",
                  proposedDriver: "Proposed driver: Siva Kumar",
                  proposedVehiclePlate: "E-Class / SLQ 5501",
                  scheduleOverlapRisk: "No overlap risk; dispatch held for customer update",
                  serviceType: "Transfer",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-indigo-200 bg-indigo-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1.05fr_1.05fr_1.2fr_1.2fr_1.2fr_1.25fr]"
                  data-mock-driver-assignment-dispatch-readiness-workbench-row={row.dispatchReadinessReference}
                  key={row.dispatchReadinessReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-driver-assignment-dispatch-readiness-workbench-column="Dispatch readiness reference job reference"
                    >
                      Dispatch / Job
                    </span>
                    <span className="block">{row.dispatchReadinessReference}</span>
                    <span>{row.jobReference}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-driver-assignment-dispatch-readiness-workbench-column="Customer account service type pickup window"
                    >
                      Customer / Service / Pickup
                    </span>
                    <span className="block">{row.customerAccount}</span>
                    <span className="block">{row.serviceType}</span>
                    <span>{row.pickupWindow}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-driver-assignment-dispatch-readiness-workbench-column="Proposed driver proposed vehicle plate"
                    >
                      Proposed Driver / Vehicle
                    </span>
                    <span className="block">{row.proposedDriver}</span>
                    <span>{row.proposedVehiclePlate}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-driver-assignment-dispatch-readiness-workbench-column="Driver contact readiness driver acknowledgement readiness"
                    >
                      Driver Contact / Acknowledgement
                    </span>
                    <span className="block">{row.driverContactReadiness}</span>
                    <span>{row.driverAcknowledgementReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-driver-assignment-dispatch-readiness-workbench-column="Schedule overlap risk customer update readiness"
                    >
                      Schedule / Customer Update
                    </span>
                    <span className="block">{row.scheduleOverlapRisk}</span>
                    <span>{row.customerUpdateReadiness}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-driver-assignment-dispatch-readiness-workbench-column="Dispatch readiness next internal action"
                    >
                      Dispatch Readiness / Next Action
                    </span>
                    <span className="block">{row.dispatchReadiness}</span>
                    <span>{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-driver-assignment-dispatch-readiness-workbench-coverage-note="true"
              >
                Dispatch readiness review - mock only. Dispatch readiness reference, job reference, customer/account,
                service type, pickup window, proposed driver, proposed vehicle/plate, driver contact readiness, driver
                acknowledgement readiness, schedule/overlap risk, customer update readiness, dispatch readiness, and next
                internal action stay as static review labels.
              </p>
              <p
                className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-driver-assignment-dispatch-readiness-workbench-rules="true"
              >
                Driver assignment rules preserved: readiness stays separate from real driver assignment, proposed
                driver/vehicle display creates no assignment, acknowledgement readiness sends nothing, customer update
                readiness sends nothing, and schedule/overlap review is display-only. The dispatcher may intentionally
                assign the same driver to multiple bookings; future conflict logic should warn only, not block or hide
                drivers.
              </p>
              <p
                className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-driver-assignment-dispatch-readiness-workbench-safety="true"
              >
                Mock Only. No driver assigned, no vehicle assigned, no driver acknowledgement sent, no customer update
                sent, no notification sent, no live location activated, no schedule changed, no dispatch job created, no
                job status changed, no booking saved, and no billing, invoice, payment, PDF, payout, accounting, or
                finance export created. No save/load, no API/storage/Supabase behavior, and no parser change.
              </p>
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-[1fr_2fr]">
              <p
                className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-driver-assignment-dispatch-readiness-workbench-distinction="true"
              >
                This is separate from Route &amp; Itinerary Readiness, Airport Flight Monitoring, Booking Intake,
                Customer Account Profile, Operations Handover, Fleet Readiness, Customer Service Recovery, Replacement
                Vehicle Recovery, and Driver Job Completion: it reviews proposed driver/vehicle pairing and dispatch
                readiness before any future dispatch automation only.
              </p>
              <p
                className="text-[10px] leading-[1.15] text-slate-500"
                data-mock-driver-assignment-dispatch-readiness-workbench-boundary="true"
              >
                Future workflow boundary: Mock/local only. No real driver assignment, vehicle assignment, driver
                acknowledgement behavior, customer update sending, notification sending, schedule update, dispatch
                workflow, booking save/load behavior, job status persistence, live location behavior, parser behavior
                changes, parser file changes, parser test changes, billing, invoice, statement, payment, payment link,
                PDF, payout, accounting posting, finance export, customer account/auth behavior, localStorage,
                sessionStorage, cookies, IndexedDB, API call, fetch, XHR, sendBeacon, WebSocket, Supabase, package
                script changes, test:safe membership changes, message-channel delivery, customer notification,
                notification, or send behavior.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Booking Lifecycle Timeline Internal Audit Readiness Workbench Mock Only"
          className="rounded-lg border border-indigo-200 bg-white px-3 py-2 shadow-sm"
          data-mock-booking-lifecycle-audit-readiness-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-indigo-700">
                    Booking Lifecycle Timeline &amp; Internal Audit Readiness Workbench
                  </span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-booking-lifecycle-audit-readiness-workbench-copy="true"
                >
                  Internal/admin-only booking lifecycle timeline and internal audit readiness preview for intake,
                  account matching, route readiness, airport/itinerary readiness, driver assignment readiness, dispatch
                  handoff, driver completion, service recovery, closeout, and audit readiness. Static/mock/local display
                  data only; no real audit trail, persistence, dispatch automation, storage, API, parser, or Supabase
                  behavior is active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold uppercase text-indigo-700">
                Display-only lifecycle timeline
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-booking-lifecycle-audit-readiness-workbench-filter-summary="true"
            >
              {[
                ["Lifecycle/date scope", "Mock booking lifecycle and audit readiness review"],
                ["Source", "Mock dispatcher/admin lifecycle timeline"],
                ["Mock results", "3 lifecycle rows maximum"],
                ["Mode", "Mock Only / display-only / no actions"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-indigo-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div
              className="grid min-w-0 gap-1.5"
              data-mock-booking-lifecycle-audit-readiness-workbench-rows="true"
            >
              {[
                {
                  completionCloseoutStatus: "Not completed; closeout not created",
                  currentLifecycleStage: "Dispatch handoff pending",
                  customerAccount: "UBS Priority",
                  dispatchCustomerUpdateStatus: "Customer update draft reviewed - not sent",
                  driverAssignmentStatus: "Proposed driver/vehicle ready - no assignment created",
                  intakeAccountStatus: "Intake complete; UBS account matched",
                  internalAuditReadiness: "Audit readiness mock-ready; no audit trail created",
                  jobReference: "PLO-ARR-2026-05-LIFE1",
                  lifecycleReference: "PLO-LIFE-AUDIT-AIRPORT",
                  nextInternalAction: "Review dispatch handoff before future operational release",
                  routeItineraryStatus: "Route and airport timing ready",
                  serviceRecoveryExceptionStatus: "No service recovery issue",
                },
                {
                  completionCloseoutStatus: "Not completed; closeout not created",
                  currentLifecycleStage: "Route confirmation hold",
                  customerAccount: "VIP Private Customer",
                  dispatchCustomerUpdateStatus: "Dispatch/customer update held until route confirmation",
                  driverAssignmentStatus: "Driver assignment status not active - no driver assigned",
                  intakeAccountStatus: "VIP profile reviewed; manager note pending",
                  internalAuditReadiness: "Audit readiness waiting on route review",
                  jobReference: "PLO-DSP-2026-05-LIFE2",
                  lifecycleReference: "PLO-LIFE-AUDIT-VIP-MULTI",
                  nextInternalAction: "Confirm all waypoints before future dispatch handoff",
                  routeItineraryStatus: "Multi-stop waypoint review pending",
                  serviceRecoveryExceptionStatus: "No service recovery issue",
                },
                {
                  completionCloseoutStatus: "Driver completion received; closeout review needed",
                  currentLifecycleStage: "Service recovery / closeout review",
                  customerAccount: "Ritz-Carlton Concierge",
                  dispatchCustomerUpdateStatus: "Customer recovery note pending - not sent",
                  driverAssignmentStatus: "Completed driver noted; no new assignment created",
                  intakeAccountStatus: "Account matched; contact ready",
                  internalAuditReadiness: "Audit readiness needs recovery and closeout review",
                  jobReference: "PLO-REC-2026-05-LIFE3",
                  lifecycleReference: "PLO-LIFE-AUDIT-RECOVERY",
                  nextInternalAction: "Review customer recovery note before closeout/audit handoff",
                  routeItineraryStatus: "Route complete; recovery exception carried forward",
                  serviceRecoveryExceptionStatus: "Service recovery note pending manager review",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-indigo-200 bg-indigo-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1.05fr_1.05fr_1.15fr_1.15fr_1.15fr_1.2fr]"
                  data-mock-booking-lifecycle-audit-readiness-workbench-row={row.lifecycleReference}
                  key={row.lifecycleReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-booking-lifecycle-audit-readiness-workbench-column="Lifecycle reference job reference"
                    >
                      Lifecycle / Job
                    </span>
                    <span className="block">{row.lifecycleReference}</span>
                    <span>{row.jobReference}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-booking-lifecycle-audit-readiness-workbench-column="Customer account current lifecycle stage"
                    >
                      Customer / Stage
                    </span>
                    <span className="block">{row.customerAccount}</span>
                    <span>{row.currentLifecycleStage}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-booking-lifecycle-audit-readiness-workbench-column="Intake account status route itinerary status"
                    >
                      Intake / Route
                    </span>
                    <span className="block">{row.intakeAccountStatus}</span>
                    <span>{row.routeItineraryStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-booking-lifecycle-audit-readiness-workbench-column="Driver assignment status dispatch customer update status"
                    >
                      Assignment / Dispatch
                    </span>
                    <span className="block">{row.driverAssignmentStatus}</span>
                    <span>{row.dispatchCustomerUpdateStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-booking-lifecycle-audit-readiness-workbench-column="Completion closeout status service recovery exception status"
                    >
                      Completion / Recovery
                    </span>
                    <span className="block">{row.completionCloseoutStatus}</span>
                    <span>{row.serviceRecoveryExceptionStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-indigo-700"
                      data-mock-booking-lifecycle-audit-readiness-workbench-column="Internal audit readiness next internal action"
                    >
                      Audit Readiness / Next Action
                    </span>
                    <span className="block">{row.internalAuditReadiness}</span>
                    <span>{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-booking-lifecycle-audit-readiness-workbench-coverage-note="true"
              >
                Lifecycle timeline review - mock only. Lifecycle reference, job reference, customer/account, current
                lifecycle stage, intake/account status, route/itinerary status, driver assignment status,
                dispatch/customer update status, completion/closeout status, service recovery/exception status,
                internal audit readiness, and next internal action stay as static review labels.
              </p>
              <p
                className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-booking-lifecycle-audit-readiness-workbench-rules="true"
              >
                Lifecycle rules preserved: lifecycle readiness stays separate from real booking save/load behavior,
                internal audit readiness creates no audit records, driver assignment status creates no driver or vehicle
                assignment, dispatch/customer update status sends nothing, completion/closeout status saves no proof,
                closeout, billing, payout, or finance record, and parser/manual review stays separate from parser
                behavior.
              </p>
              <p
                className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-booking-lifecycle-audit-readiness-workbench-safety="true"
              >
                Mock Only. No booking lifecycle saved, no audit trail created, no booking saved, no account linked, no
                dispatch job created, no driver assigned, no vehicle assigned, no customer update sent, no notification
                sent, no live location activated, no proof/photo uploaded, no job status changed, no closeout record
                created, and no billing, invoice, payment, PDF, payout, accounting, or finance export created. No
                save/load, no API/storage/Supabase behavior, and no parser change.
              </p>
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-[1fr_2fr]">
              <p
                className="min-w-0 rounded-md border border-indigo-200 bg-indigo-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-booking-lifecycle-audit-readiness-workbench-distinction="true"
              >
                This is separate from Driver Assignment, Route &amp; Itinerary Readiness, Airport Flight Monitoring,
                Booking Intake, Customer Account Profile, Operations Handover, Fleet Readiness, Customer Service
                Recovery, Replacement Vehicle Recovery, and Driver Job Completion: it reviews the full lifecycle
                timeline and internal audit readiness before any future audit trail or automation only.
              </p>
              <p
                className="text-[10px] leading-[1.15] text-slate-500"
                data-mock-booking-lifecycle-audit-readiness-workbench-boundary="true"
              >
                Future workflow boundary: Mock/local only. No real booking lifecycle workflow, audit trail creation,
                booking save/load behavior, account linking, dispatch workflow, driver assignment, vehicle assignment,
                customer update sending, notification sending, live location behavior, proof/photo upload, job status
                persistence, closeout workflow, parser behavior changes, parser file changes, parser test changes,
                maps, scheduling, route optimization, audit logging, billing, invoice, statement, payment, payment link,
                PDF, payout, accounting posting, finance export, customer account/auth behavior, localStorage,
                sessionStorage, cookies, IndexedDB, API call, fetch, XHR, sendBeacon, WebSocket, Supabase, package
                script changes, test:safe membership changes, message-channel delivery, customer notification,
                notification, or send behavior.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Operations Risk SLA Watchlist Workbench Mock Only"
          className="rounded-lg border border-rose-200 bg-white px-3 py-2 shadow-sm"
          data-mock-operations-risk-sla-watchlist-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-rose-700">Operations Risk &amp; SLA Watchlist Workbench</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-operations-risk-sla-watchlist-workbench-copy="true"
                >
                  Internal/admin-only operations risk and SLA watchlist preview for VIP timing risk, airport timing
                  risk, route/driver readiness risk, customer update risk, service recovery risk, closeout risk, and
                  next internal action. Static/mock/local display data only; no real SLA automation, alerting,
                  scheduling, dispatch, billing, audit, storage, API, parser, or Supabase behavior is active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold uppercase text-rose-700">
                Display-only risk watchlist
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-operations-risk-sla-watchlist-workbench-filter-summary="true"
            >
              {[
                ["Risk/date scope", "Mock operations risk and SLA watchlist review"],
                ["Source", "Mock dispatcher/admin risk desk"],
                ["Mock results", "3 risk watchlist rows maximum"],
                ["Mode", "Mock Only / display-only / no actions"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-rose-200 bg-rose-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-rose-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div
              className="grid min-w-0 gap-1.5"
              data-mock-operations-risk-sla-watchlist-workbench-rows="true"
            >
              {[
                {
                  closeoutFinanceImpact: "No closeout or finance record created",
                  currentStatus: "Driver/vehicle ready; watch timing",
                  customerAccount: "UBS Priority",
                  customerImpact: "VIP arrival timing sensitivity; no customer update sent",
                  driverFleetImpact: "Driver and vehicle ready; no assignment created",
                  nextInternalAction: "Monitor flight/traffic timing before future handoff",
                  ownerResponsibleDesk: "Dispatch desk - not assigned",
                  relatedJobReference: "PLO-ARR-2026-05-SLA1",
                  riskArea: "VIP airport pickup timing watch",
                  riskReference: "PLO-RISK-SLA-VIP-AIRPORT",
                  riskSeverity: "Medium - display-only",
                  slaTimingWindow: "Pickup window 15:30-16:00; monitor flight/traffic timing",
                },
                {
                  closeoutFinanceImpact: "Closeout held in mock review; no record created",
                  currentStatus: "Customer update draft needs manager approval",
                  customerAccount: "Ritz-Carlton Concierge",
                  customerImpact: "Customer update readiness pending - not sent",
                  driverFleetImpact: "No driver/fleet change; no vehicle assignment",
                  nextInternalAction: "Review manager-approved wording before future closeout",
                  ownerResponsibleDesk: "Manager desk - not assigned",
                  relatedJobReference: "PLO-REC-2026-05-SLA2",
                  riskArea: "Customer update risk after service recovery",
                  riskReference: "PLO-RISK-SLA-RECOVERY-UPDATE",
                  riskSeverity: "High - display-only",
                  slaTimingWindow: "Manager review before closeout",
                },
                {
                  closeoutFinanceImpact: "Evidence pending before month-end billing handoff; no invoice/payout created",
                  currentStatus: "Exception evidence pending",
                  customerAccount: "VIP Private Customer",
                  customerImpact: "No customer billing update sent",
                  driverFleetImpact: "No driver/fleet impact; no assignment created",
                  nextInternalAction: "Collect mock evidence note before future finance handoff",
                  ownerResponsibleDesk: "Finance desk - not assigned",
                  relatedJobReference: "PLO-FIN-2026-05-SLA3",
                  riskArea: "Finance/closeout evidence risk",
                  riskReference: "PLO-RISK-SLA-FINANCE-CLOSEOUT",
                  riskSeverity: "Medium - display-only",
                  slaTimingWindow: "Month-end evidence review before billing handoff",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-rose-200 bg-rose-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1.05fr_1.05fr_1.15fr_1.1fr_1.15fr_1.2fr]"
                  data-mock-operations-risk-sla-watchlist-workbench-row={row.riskReference}
                  key={row.riskReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-rose-700"
                      data-mock-operations-risk-sla-watchlist-workbench-column="Risk reference related job reference"
                    >
                      Risk / Job
                    </span>
                    <span className="block">{row.riskReference}</span>
                    <span>{row.relatedJobReference}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-rose-700"
                      data-mock-operations-risk-sla-watchlist-workbench-column="Customer account risk area"
                    >
                      Customer / Risk Area
                    </span>
                    <span className="block">{row.customerAccount}</span>
                    <span>{row.riskArea}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-rose-700"
                      data-mock-operations-risk-sla-watchlist-workbench-column="SLA timing window current status"
                    >
                      SLA / Status
                    </span>
                    <span className="block">{row.slaTimingWindow}</span>
                    <span>{row.currentStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-rose-700"
                      data-mock-operations-risk-sla-watchlist-workbench-column="Risk severity owner responsible desk"
                    >
                      Severity / Owner
                    </span>
                    <span className="block">{row.riskSeverity}</span>
                    <span>{row.ownerResponsibleDesk}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-rose-700"
                      data-mock-operations-risk-sla-watchlist-workbench-column="Customer impact driver fleet impact"
                    >
                      Customer / Fleet Impact
                    </span>
                    <span className="block">{row.customerImpact}</span>
                    <span>{row.driverFleetImpact}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-rose-700"
                      data-mock-operations-risk-sla-watchlist-workbench-column="Closeout finance impact next internal action"
                    >
                      Closeout / Next Action
                    </span>
                    <span className="block">{row.closeoutFinanceImpact}</span>
                    <span>{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-rose-200 bg-rose-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-operations-risk-sla-watchlist-workbench-coverage-note="true"
              >
                Operations risk watchlist review - mock only. Risk reference, related job reference, customer/account,
                risk area, SLA/timing window, current status, risk severity, owner/responsible desk, customer impact,
                driver/fleet impact, closeout/finance impact, and next internal action stay as static review labels.
              </p>
              <p
                className="min-w-0 rounded-md border border-rose-200 bg-rose-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-operations-risk-sla-watchlist-workbench-rules="true"
              >
                Risk/SLA rules preserved: SLA/risk watchlist readiness stays separate from real scheduling, alerts,
                notifications, dispatch, billing, and audit behavior; risk severity creates no alerts or tasks;
                owner/responsible desk display assigns no staff, drivers, or vehicles; customer impact sends no
                customer update; driver/fleet impact assigns no drivers or vehicles; closeout/finance impact creates no
                closeout, billing, invoice, payout, or finance records; parser/manual review stays separate from parser
                behavior.
              </p>
              <p
                className="min-w-0 rounded-md border border-rose-200 bg-rose-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-operations-risk-sla-watchlist-workbench-safety="true"
              >
                Mock Only. No SLA alert created, no risk task saved, no booking status changed, no staff assigned, no
                driver assigned, no vehicle assigned, no customer update sent, no notification sent, no live location
                activated, no dispatch job created, no closeout record created, and no billing, invoice, payment, PDF,
                payout, accounting, or finance export created. No save/load, no API/storage/Supabase behavior, and no
                parser change.
              </p>
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-[1fr_2fr]">
              <p
                className="min-w-0 rounded-md border border-rose-200 bg-rose-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-operations-risk-sla-watchlist-workbench-distinction="true"
              >
                This is separate from Booking Lifecycle Timeline &amp; Internal Audit Readiness, Driver Assignment,
                Route &amp; Itinerary Readiness, Airport Flight Monitoring, Booking Intake, Customer Account Profile,
                Operations Handover, Fleet Readiness, Customer Service Recovery, Replacement Vehicle Recovery, and
                Driver Job Completion: it reviews cross-booking operations risk and SLA watchlist readiness before any
                future SLA automation or alerting only.
              </p>
              <p
                className="text-[10px] leading-[1.15] text-slate-500"
                data-mock-operations-risk-sla-watchlist-workbench-boundary="true"
              >
                Future workflow boundary: Mock/local only. No real SLA alerting workflow, operations risk workflow,
                task creation, booking status persistence, staff assignment, driver assignment, vehicle assignment,
                customer update sending, notification sending, live location behavior, dispatch workflow, closeout
                workflow, parser behavior changes, parser file changes, parser test changes, maps, scheduling, traffic,
                route optimization, audit logging, SLA alerting, billing, invoice, statement, payment, payment link,
                PDF, payout, accounting posting, finance export, customer account/auth behavior, localStorage,
                sessionStorage, cookies, IndexedDB, API call, fetch, XHR, sendBeacon, WebSocket, Supabase, package
                script changes, test:safe membership changes, message-channel delivery, customer notification,
                notification, or send behavior.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Quote Pricing Review Readiness Workbench Mock Only"
          className="rounded-lg border border-teal-200 bg-white px-3 py-2 shadow-sm"
          data-mock-quote-pricing-review-readiness-workbench="true"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-950">
                  <span className="uppercase text-teal-700">Quote &amp; Pricing Review Readiness Workbench</span>{" "}
                  <span className="text-slate-600">&mdash; Mock Only</span>
                </h2>
                <p
                  className="mt-1 max-w-4xl text-[10px] font-medium leading-[1.2] text-slate-600"
                  data-mock-quote-pricing-review-readiness-workbench-copy="true"
                >
                  Internal/admin-only quote and pricing review readiness preview for quoted amount readiness, rate
                  basis, customer/account pricing context, manual extra charge review, approval status, margin/risk
                  note, customer quote handoff readiness, and next internal action. Static/mock/local display data only;
                  no real pricing automation, quote sending, billing, storage, API, parser, or Supabase behavior is
                  active.
                </p>
              </div>
              <p className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-semibold uppercase text-teal-700">
                Display-only quote review
              </p>
            </div>

            <div
              className="grid min-w-0 grid-cols-2 gap-1.5 text-[10px] leading-[1.1] text-slate-700 sm:grid-cols-4"
              data-mock-quote-pricing-review-readiness-workbench-filter-summary="true"
            >
              {[
                ["Quote/date scope", "Mock quote and pricing review readiness"],
                ["Source", "Mock dispatcher/admin quote desk"],
                ["Mock results", "3 quote/pricing rows maximum"],
                ["Mode", "Mock Only / display-only / no actions"],
              ].map(([label, value]) => (
                <p className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1" key={label}>
                  <span className="block font-semibold uppercase text-teal-700">{label}</span>
                  <span className="break-words">{value}</span>
                </p>
              ))}
            </div>

            <div
              className="grid min-w-0 gap-1.5"
              data-mock-quote-pricing-review-readiness-workbench-rows="true"
            >
              {[
                {
                  approvalReadiness: "Dispatcher approval readiness complete - no approval record",
                  customerAccount: "UBS Priority",
                  customerQuoteHandoffReadiness: "Customer quote handoff ready - not sent",
                  discountGoodwillReview: "No discount/goodwill review needed",
                  manualExtraChargeReview: "Manual extra charge review clear - no total calculated",
                  marginRiskNote: "Margin note acceptable in mock review",
                  nextInternalAction: "Review wording before any future quote handoff",
                  quoteReviewReference: "PLO-QUOTE-READY-CORP-AIRPORT",
                  quotedAmountStatus: "Quoted amount ready - display-only, no total changed",
                  ratePriceBasis: "Corporate account MNG rate basis reviewed",
                  relatedJobReference: "PLO-ARR-2026-05-QUOTE1",
                  serviceType: "Airport transfer / Arrival",
                },
                {
                  approvalReadiness: "Manager approval pending - no approval saved",
                  customerAccount: "VIP Private Customer",
                  customerQuoteHandoffReadiness: "Customer quote handoff held - not sent",
                  discountGoodwillReview: "Discount/goodwill review not applied",
                  manualExtraChargeReview: "Manual extra charge note present - review only",
                  marginRiskNote: "Margin/risk note requires manager review",
                  nextInternalAction: "Confirm manager note before future quote handoff",
                  quoteReviewReference: "PLO-QUOTE-READY-VIP-HOURLY",
                  quotedAmountStatus: "Quoted amount status held - no pricing calculation",
                  ratePriceBasis: "VIP hourly rate basis under manager review",
                  relatedJobReference: "PLO-DSP-2026-05-QUOTE2",
                  serviceType: "Hourly / VIP standby",
                },
                {
                  approvalReadiness: "Manager approval required - no record created",
                  customerAccount: "Ritz-Carlton Concierge",
                  customerQuoteHandoffReadiness: "Customer quote handoff blocked - no notification",
                  discountGoodwillReview: "Goodwill/no-charge review pending - no credit created",
                  manualExtraChargeReview: "Manual extra charge review waived in mock context",
                  marginRiskNote: "Margin/risk note: service recovery exception",
                  nextInternalAction: "Hold until goodwill/no-charge review is complete",
                  quoteReviewReference: "PLO-QUOTE-READY-RECOVERY-NOCHARGE",
                  quotedAmountStatus: "Quote/invoice handoff held - no amount saved",
                  ratePriceBasis: "Service recovery pricing context under review",
                  relatedJobReference: "PLO-REC-2026-05-QUOTE3",
                  serviceType: "Service recovery / no-charge review",
                },
              ].map((row) => (
                <div
                  className="grid min-w-0 gap-1 rounded-md border border-teal-200 bg-teal-50/70 p-1.5 text-[10px] leading-[1.12] text-slate-800 sm:grid-cols-2 xl:grid-cols-[1.05fr_1.05fr_1.15fr_1.15fr_1.1fr_1.2fr]"
                  data-mock-quote-pricing-review-readiness-workbench-row={row.quoteReviewReference}
                  key={row.quoteReviewReference}
                >
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-quote-pricing-review-readiness-workbench-column="Quote review reference related job reference"
                    >
                      Quote / Job
                    </span>
                    <span className="block">{row.quoteReviewReference}</span>
                    <span>{row.relatedJobReference}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-quote-pricing-review-readiness-workbench-column="Customer account service type"
                    >
                      Customer / Service
                    </span>
                    <span className="block">{row.customerAccount}</span>
                    <span>{row.serviceType}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-quote-pricing-review-readiness-workbench-column="Rate price basis quoted amount status"
                    >
                      Rate Basis / Quote Status
                    </span>
                    <span className="block">{row.ratePriceBasis}</span>
                    <span>{row.quotedAmountStatus}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-quote-pricing-review-readiness-workbench-column="Manual extra charge review discount goodwill review"
                    >
                      Manual / Goodwill Review
                    </span>
                    <span className="block">{row.manualExtraChargeReview}</span>
                    <span>{row.discountGoodwillReview}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-quote-pricing-review-readiness-workbench-column="Approval readiness margin risk note"
                    >
                      Approval / Margin Risk
                    </span>
                    <span className="block">{row.approvalReadiness}</span>
                    <span>{row.marginRiskNote}</span>
                  </p>
                  <p className="min-w-0 break-words">
                    <span
                      className="block font-semibold uppercase text-teal-700"
                      data-mock-quote-pricing-review-readiness-workbench-column="Customer quote handoff readiness next internal action"
                    >
                      Handoff / Next Action
                    </span>
                    <span className="block">{row.customerQuoteHandoffReadiness}</span>
                    <span>{row.nextInternalAction}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-3">
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-quote-pricing-review-readiness-workbench-coverage-note="true"
              >
                Quote pricing review - mock only. Quote review reference, related job reference, customer/account,
                service type, rate/price basis, quoted amount status, manual extra charge review, discount/goodwill
                review, approval readiness, margin/risk note, customer quote handoff readiness, and next internal action
                stay as static review labels.
              </p>
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-quote-pricing-review-readiness-workbench-rules="true"
              >
                Quote/pricing rules preserved: quote review stays separate from real billing, invoice, statement,
                payment, payout, and accounting behavior; quoted amount status does not calculate or change totals;
                manual extra charge review creates no records; discount/goodwill review creates no credit or no-charge
                decision; approval readiness creates no approvals, tasks, audit records, or quote records; customer
                quote handoff readiness sends no quote, payment link, PDF, customer notification, or message-channel
                delivery; parser/manual review stays separate from parser behavior.
              </p>
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-quote-pricing-review-readiness-workbench-safety="true"
              >
                Mock Only. No quote sent, no quoted amount saved, no pricing calculation created, no invoice generated,
                no statement generated, no payment link created, no PDF generated, no payout created, no accounting
                posting created, no finance export created, no customer notification sent, no message-channel delivery,
                no approval record created, no audit record created, and no booking saved. No save/load, no
                API/storage/Supabase behavior, and no parser change.
              </p>
            </div>

            <div className="grid min-w-0 gap-1.5 md:grid-cols-[1fr_2fr]">
              <p
                className="min-w-0 rounded-md border border-teal-200 bg-teal-50/75 px-2 py-1.5 text-[10px] font-medium leading-[1.15] text-slate-700"
                data-mock-quote-pricing-review-readiness-workbench-distinction="true"
              >
                This is separate from Operations Risk &amp; SLA Watchlist, Booking Lifecycle Timeline, Driver
                Assignment, Route &amp; Itinerary Readiness, Airport Flight Monitoring, Booking Intake, Customer
                Account Profile, Operations Handover, Fleet Readiness, Customer Service Recovery, Replacement Vehicle
                Recovery, Driver Job Completion, and Extra Charges: it reviews quote/pricing readiness before any future
                quote automation only.
              </p>
              <p
                className="text-[10px] leading-[1.15] text-slate-500"
                data-mock-quote-pricing-review-readiness-workbench-boundary="true"
              >
                Future workflow boundary: Mock/local only. No real quote workflow, pricing automation, quoted amount
                persistence, billing workflow, invoice generation, statement generation, payment links, PDF generation,
                payout creation, accounting posting, finance export, customer notification or message-channel delivery,
                approval workflow, audit trail creation, booking save/load behavior, customer account/auth behavior,
                parser behavior changes, parser file changes, parser test changes, localStorage, sessionStorage,
                cookies, IndexedDB, API call, fetch, XHR, sendBeacon, WebSocket, Supabase, package script changes,
                test:safe membership changes, or send behavior.
              </p>
            </div>
          </div>
        </section>
          </div>
            </>
          ) : null}
        </section>

        {activeTab === "dispatch" ? (
        <section className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="min-w-0 rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Dispatcher Intake</h2>
                <p className="text-sm text-slate-500">Paste, parse, assign, dispatch, then save.</p>
              </div>
              <button
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                type="button"
                onClick={() => {
                  setBooking(() => createInitialBooking());
                  setLoadedBookingId("");
                  clearBookingMessageInput();
                }}
              >
                Clear
              </button>
            </div>

            <div className="mb-5 rounded-lg border border-stone-200 bg-stone-50 p-3">
              <label>
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Paste Booking Message
                </span>
                <textarea
                  key={bookingMessageResetKey}
                  className="min-h-32 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-2 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  ref={bookingMessageRef}
                  onChange={(event) => {
                    setBookingMessage(event.target.value);
                    setAiDraft(null);
                    setAiAssistMessage(null);
                    setAiAssistResponseNote("");
                  }}
                  placeholder="Paste WhatsApp, email, or screenshot OCR text here."
                  value={bookingMessage}
                />
              </label>
              <div className="mt-3 flex flex-col gap-2" data-ai-assist-controls="true">
                <div
                  className="grid gap-2 md:grid-cols-[minmax(11rem,1fr)_minmax(11rem,1fr)_minmax(9rem,auto)] md:items-start"
                  data-dispatcher-intake-action-row="true"
                >
                  <div className="flex w-full min-w-0 flex-col gap-2" data-ai-assist-gate="true">
                    <button
                      className={`h-12 w-full rounded-md border px-3 py-2 text-sm font-semibold whitespace-nowrap transition ${
                        aiAssistSafetyAccepted
                          ? "border-indigo-200 bg-white text-indigo-800 hover:bg-indigo-50"
                          : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      }`}
                      disabled={!aiAssistSafetyAccepted || aiAssistLoading}
                      onClick={handleMockAiAssistParse}
                      type="button"
                    >
                      AI Assist Parse (Mock)
                    </button>
                    <label
                      className="flex h-12 w-full items-center gap-2 rounded-md border border-indigo-200 bg-white px-3 py-2 text-xs font-medium leading-tight text-indigo-950"
                    >
                      <input
                        checked={aiAssistSafetyAccepted}
                        className="h-4 w-4 shrink-0 rounded border-indigo-300 text-indigo-700"
                        data-ai-assist-safety-checkbox="true"
                        onClick={(event) => {
                          setAiAssistSafetyAccepted(event.currentTarget.checked);
                        }}
                        onChange={(event) => {
                          setAiAssistSafetyAccepted(event.target.checked);
                        }}
                        type="checkbox"
                      />
                      <span>
                        Tick the AI safety checkbox to enable AI Assist
                      </span>
                    </label>
                    {aiAssistLoading ? (
                      <p
                        aria-live="polite"
                        className="text-xs font-medium text-indigo-900"
                        data-ai-assist-loading="true"
                      >
                        Loading mock AI Assist draft...
                      </p>
                    ) : null}
                  </div>
                  <button
                    className="h-12 w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold whitespace-nowrap text-white transition hover:bg-slate-800"
                    onClick={handleParseBookingMessage}
                    type="button"
                  >
                    Create Job Card
                  </button>
                  <button
                    className="h-12 w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold whitespace-nowrap text-slate-800 transition hover:bg-slate-50 md:min-w-36"
                    data-dispatcher-clear-message-button="true"
                    onClick={clearBookingMessageInput}
                    type="button"
                  >
                    Clear Message
                  </button>
                </div>
              </div>
              {aiAssistMessage ? (
                <p
                  aria-live="polite"
                  className={`mt-2 rounded-md border px-3 py-2 text-sm font-medium ${
                    aiAssistMessage.tone === "error"
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-indigo-200 bg-indigo-50 text-indigo-900"
                  }`}
                  data-ai-assist-feedback="true"
                >
                  {aiAssistMessage.text}
                </p>
              ) : null}
              {aiDraft ? (
                <div
                  className="mt-3 rounded-lg border-2 border-indigo-300 bg-indigo-50 p-4 shadow-sm"
                  data-ai-assist-draft="true"
                >
                  <p className="text-base font-semibold text-indigo-950">
                    AI parsed draft — review before saving
                  </p>
                  <p className="mt-1 text-sm text-indigo-950">
                    AI draft is for review only. It does not save bookings.
                  </p>
                  {aiAssistResponseNote ? (
                    <p className="mt-1 text-sm font-medium text-indigo-950">
                      {aiAssistResponseNote}
                    </p>
                  ) : null}
                  {aiDraft.rawWarnings.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-indigo-900">
                      {aiDraft.rawWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-3 grid gap-3">
                    {aiDraftBookings.length > 0 ? (
                      aiDraftBookings.map((draft: AiDraftBooking, index) => (
                        <div
                          className="rounded-md border border-indigo-200 bg-white p-3 text-sm text-slate-800"
                          key={`${draft.passengerName || "ai-draft"}-${index}`}
                        >
                          <div className="grid gap-1 sm:grid-cols-2">
                            <p>
                              <strong>Booking type:</strong>{" "}
                              {draft.bookingType || "Needs review"}
                            </p>
                            <p>
                              <strong>Vehicle:</strong> {draft.vehicle || "Not detected"}
                            </p>
                            <p>
                              <strong>Passenger:</strong>{" "}
                              {draft.passengerName || "Not detected"}
                            </p>
                            <p>
                              <strong>Confidence:</strong>{" "}
                              {Math.round(draft.confidence * 100)}%
                            </p>
                            <p className="sm:col-span-2">
                              <strong>Pickup:</strong> {draft.pickup || "Not detected"}
                            </p>
                            <p className="sm:col-span-2">
                              <strong>Drop-off:</strong> {draft.dropoff || "Not detected"}
                            </p>
                            <div className="sm:col-span-2">
                              <strong>Needs review reasons:</strong>
                              {draft.needsReviewReasons.length > 0 ? (
                                <ul className="mt-1 list-disc space-y-1 pl-5">
                                  {draft.needsReviewReasons.map((reason) => (
                                    <li key={reason}>{reason}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span> None</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-md border border-indigo-200 bg-white p-3 text-sm text-indigo-950">
                        No AI draft bookings were generated.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
              {multiBookingNotice?.multipleBookingsDetected ? (
                <div className="mt-4 rounded-lg border-2 border-amber-400 bg-amber-50 p-4 shadow-sm">
                  <p className="text-base font-semibold text-amber-950">
                    Multiple bookings detected. Please select one extracted booking.
                  </p>
                  <div className="mt-3 grid gap-2 rounded-md border border-amber-200 bg-white/70 p-3 text-xs text-amber-950 sm:grid-cols-3">
                    <span>
                      <strong>multipleBookingsDetected:</strong>{" "}
                      {String(Boolean(multiBookingNotice.multipleBookingsDetected))}
                    </span>
                    <span>
                      <strong>parserWarning:</strong>{" "}
                      {clean(multiBookingNotice.parserWarning) || "none"}
                    </span>
                    <span>
                      <strong>extractedBookingsPreview.length:</strong>{" "}
                      {multiBookingPreviewItems.length}
                    </span>
                  </div>
                  {multiBookingPreviewItems.length > 0 ? (
                    <div className="mt-3 grid gap-3">
                      {multiBookingPreviewItems.map((preview, index) => {
                        const routeText = [preview.pickup, preview.dropoff].filter(Boolean).join(" > ");

                        return (
                          <div
                            className="rounded-md border border-amber-200 bg-white p-3 text-sm text-slate-800"
                            key={`${preview.passenger || "booking"}-${preview.flight || index}-${index}`}
                          >
                            <div className="grid gap-1 sm:grid-cols-2">
                              <p>
                                <strong>Passenger:</strong> {clean(preview.passenger) || "Not detected"}
                              </p>
                              <p>
                                <strong>Type:</strong> {clean(preview.type) || "Not detected"}
                              </p>
                              <p>
                                <strong>Date/time:</strong>{" "}
                                {[preview.date, preview.time].filter(Boolean).join(" ") || "Not detected"}
                              </p>
                              <p>
                                <strong>Flight:</strong> {clean(preview.flight) || "None"}
                              </p>
                              <p className="sm:col-span-2">
                                <strong>Route:</strong> {routeText || "Not detected"}
                              </p>
                            </div>
                            <button
                              className="mt-3 h-9 rounded-md bg-amber-900 px-3 text-sm font-semibold text-white transition hover:bg-amber-800"
                              onClick={() => applyExtractedBooking(preview)}
                              type="button"
                            >
                              Use this booking
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-md border border-amber-200 bg-white p-3 text-sm text-amber-950">
                      No extracted booking previews were generated. Split the pasted message and parse one booking at a time.
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {fieldOrder.map((field) => (
                <label
                  className={field === "pickup" || field === "dropoff" ? "sm:col-span-2" : ""}
                  key={field}
                >
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    {fieldLabels[field]}
                    {requiredFields.includes(field) ? (
                      <span className="text-red-600"> *</span>
                    ) : null}
                  </span>
                  <input
                    className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    inputMode={
                      field === "pax"
                        ? "numeric"
                        : field === "bookerContact" || field === "driverContact"
                          ? "tel"
                          : undefined
                    }
                    min={field === "pax" ? 1 : undefined}
                    onChange={(event) => update(field, event.target.value)}
                    placeholder={fieldLabels[field]}
                    type={
                      field === "date"
                        ? "date"
                        : field === "bookerEmail"
                            ? "email"
                          : field === "bookerContact" || field === "driverContact"
                            ? "tel"
                          : field === "pax"
                            ? "number"
                            : "text"
                    }
                    value={booking[field]}
                  />
                </label>
              ))}
            </div>

            {customerMatchSuggestion ? (
              <section
                className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-3"
                data-customer-match-suggestion="true"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-emerald-950">Customer Match Suggestion</h3>
                    <p className="mt-1 text-sm text-emerald-900">
                      Mock/local only. Dispatcher must confirm; no customer record, CRM record, payment record, or
                      Supabase row is created.
                    </p>
                  </div>
                  <span
                    className="inline-flex w-fit rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-bold text-emerald-950"
                    data-customer-match-confidence="true"
                  >
                    {customerMatchSuggestion.confidence}
                  </span>
                </div>

                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-md border border-emerald-200 bg-white p-3">
                    <dt className="font-semibold text-emerald-950">Suggested customer/folder</dt>
                    <dd className="mt-1 text-slate-900" data-customer-match-name="true">
                      {customerMatchSuggestion.customerId ? (
                        <Link
                          className="font-bold text-emerald-900 underline underline-offset-4"
                          href={`/customers/${customerMatchSuggestion.customerId}`}
                        >
                          {customerMatchSuggestion.customerName}
                        </Link>
                      ) : (
                        customerMatchSuggestion.customerName
                      )}
                    </dd>
                  </div>
                  <div className="rounded-md border border-emerald-200 bg-white p-3">
                    <dt className="font-semibold text-emerald-950">Suggested action</dt>
                    <dd className="mt-1 text-slate-900" data-customer-match-action="true">
                      {customerMatchSuggestion.suggestedAction}
                    </dd>
                  </div>
                  <div className="rounded-md border border-emerald-200 bg-white p-3 sm:col-span-2">
                    <dt className="font-semibold text-emerald-950">Match reason</dt>
                    <dd className="mt-1 text-slate-900" data-customer-match-reason="true">
                      {customerMatchSuggestion.matchReason}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-xs leading-5 text-emerald-950">
                  Mock action choices: Link to existing customer, Create new customer folder, Update existing customer
                  contact, or Leave unlinked. This does not auto-create or overwrite any account.
                </p>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    className="h-10 rounded-md bg-emerald-900 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800"
                    data-customer-match-action-button="link"
                    onClick={() => setMockCustomerMatchAction("link")}
                    type="button"
                  >
                    Link Mock Customer
                  </button>
                  <button
                    className="h-10 rounded-md border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
                    data-customer-match-action-button="create"
                    onClick={() => setMockCustomerMatchAction("create")}
                    type="button"
                  >
                    Create Mock Customer
                  </button>
                  <button
                    className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                    data-customer-match-action-button="leave"
                    onClick={() => setMockCustomerMatchAction("leave")}
                    type="button"
                  >
                    Leave Unlinked
                  </button>
                </div>

                {customerMatchFeedback ? (
                  <p
                    aria-live="polite"
                    className={`mt-3 rounded-md border px-3 py-2 text-sm font-medium ${statusClass(customerMatchFeedback.tone)}`}
                    data-customer-match-feedback={customerMatchFeedback.action}
                  >
                    {customerMatchFeedback.text}
                  </p>
                ) : null}
              </section>
            ) : null}

            <div className="mt-5">
              {pricingPanel}
            </div>

            <div
              className="mt-5 rounded-md border border-stone-200 bg-stone-50 p-3"
              data-route-extras-child-seat-section="true"
            >
              <div className="mb-3">
                <h3 className="text-base font-semibold text-slate-900">Route Extras & Child Seat</h3>
                <p className="text-sm text-slate-600">Review extra stops and child seat requirements together.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <label className="sm:col-span-2 lg:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Extra stop location</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) => update("extraStopLocation", event.target.value)}
                    placeholder="Marina Bay Sands"
                    value={booking.extraStopLocation}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Extra Stops</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    inputMode="numeric"
                    min={0}
                    onChange={(event) => update("extraStopCount", event.target.value)}
                    placeholder="0"
                    step={1}
                    type="number"
                    value={booking.extraStopCount}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Extra Charges</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    data-manual-extra-charges-amount="true"
                    inputMode="decimal"
                    min={0}
                    onChange={(event) => update("manualExtraCharges", event.target.value)}
                    placeholder="0"
                    step="0.01"
                    type="number"
                    value={booking.manualExtraCharges}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Child seat required</span>
                  <select
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) =>
                      setBooking((current) => ({
                        ...current,
                        childSeatRequired: event.target.value,
                        childSeatCount:
                          event.target.value === "yes"
                            ? current.childSeatCount || "1"
                            : "",
                        childSeatType:
                          event.target.value === "yes"
                            ? current.childSeatType || "customer did not specify"
                            : "",
                      }))
                    }
                    value={booking.childSeatRequired}
                  >
                    <option value="">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Child seat count</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    inputMode="numeric"
                    min={0}
                    onChange={(event) => update("childSeatCount", event.target.value)}
                    placeholder="0"
                    step={1}
                    type="number"
                    value={booking.childSeatCount}
                  />
                </label>
                <label className="sm:col-span-2 lg:col-span-3">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Child seat type / note</span>
                  <select
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) => update("childSeatType", event.target.value)}
                    value={booking.childSeatType}
                  >
                    <option value="">Select type</option>
                    {visibleChildSeatTypeOptions.map((seatType) => (
                      <option key={seatType} value={seatType}>
                        {seatType}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sm:col-span-2 lg:col-span-3">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Extra Charges note / reason</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    data-manual-extra-charges-note="true"
                    onChange={(event) => update("manualExtraChargesNote", event.target.value)}
                    placeholder="Add manual extra charge reason, if any"
                    value={booking.manualExtraChargesNote}
                  />
                </label>
              </div>
              <p
                className="mt-2 text-xs text-slate-600"
                data-manual-extra-charges-boundary="true"
              >
                Manual staff entry only. This local UI field is not included in totals, save behavior,
                invoice, payment, payout, PDF, accounting, storage, API, Supabase, or notification workflows.
              </p>
              {isDspItinerary ? (
                <div className="mt-3 border-t border-stone-200 pt-3 text-sm text-slate-800">
                  <p className="font-medium text-slate-900">Itinerary preview</p>
                  <div className="mt-2 space-y-1">
                    {itineraryDisplayStops.map((stop, index) => (
                      <div
                        className="grid gap-1 sm:grid-cols-[5rem_1fr]"
                        key={`${stop.time}-${stop.location}-${index}`}
                      >
                        <span className="font-mono text-xs text-slate-600">{stop.time || "Time TBC"}</span>
                        <span>{stop.location}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-5 rounded-md border border-sky-200 bg-sky-50 p-3">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-sky-950">Assigned Driver</h3>
                  <p className="text-sm text-slate-600">Manual assignment with payout control.</p>
                </div>
                <button
                  className="h-9 rounded-md border border-sky-300 bg-white px-3 text-sm font-medium text-sky-900 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  disabled={loadingDrivers}
                  onClick={() => loadDrivers("Drivers loaded for assignment.", "Loading drivers for assignment...")}
                  type="button"
                >
                  {loadingDrivers ? "Loading Drivers..." : "Load Drivers for Assignment"}
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Driver</span>
                  <select
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) => applyDriverToBooking(event.target.value)}
                    value={assignedDriverSelectValue}
                  >
                    <option value="">Select driver</option>
                    {showSavedAssignedDriverOption ? (
                      <option disabled={assignedDriverIsInactive} value={assignedDriverId}>
                        Saved: {clean(booking.driverName) || `Driver ${assignedDriverId}`}
                        {assignedDriverIsInactive ? " (inactive)" : ""}
                      </option>
                    ) : null}
                    {assignableDrivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.driver_name} {driver.availability_status ? `(${driver.availability_status})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Driver Name</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) => update("driverName", event.target.value)}
                    placeholder="Driver name"
                    value={booking.driverName}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Driver Contact</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) => update("driverContact", event.target.value)}
                    placeholder="Phone / WhatsApp"
                    type="tel"
                    value={booking.driverContact}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Driver Car Plate</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) => update("driverPlate", event.target.value)}
                    placeholder="Plate: —"
                    value={assignedDriverPlate}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Override Payout</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) => update("driverPayoutOverride", event.target.value)}
                    placeholder={formatMoney(draftPricing.driverPayout)}
                    type="number"
                    value={booking.driverPayoutOverride}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Override Reason</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) => update("driverPayoutReason", event.target.value)}
                    value={booking.driverPayoutReason}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Driver Notes</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) => update("driverNotes", event.target.value)}
                    placeholder="Permit, vehicle, handover notes"
                    value={booking.driverNotes}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    checked={Boolean(booking.driverIncludePayout)}
                    onChange={(event) => update("driverIncludePayout", event.target.checked ? "yes" : "")}
                    type="checkbox"
                  />
                  Include payout in dispatch
                </label>
                <button
                  className="h-10 rounded-md border border-sky-300 bg-white px-4 text-sm font-semibold text-sky-900 transition hover:bg-sky-50"
                  onClick={assignDraftDriver}
                  type="button"
                >
                  Apply Driver to Draft
                </button>
              </div>
              <div
                className="mt-4 border-t border-sky-200 pt-4"
                data-admin-replacement-placeholder="true"
              >
                <div className="mb-3 flex flex-col gap-1">
                  <h4 className="text-sm font-semibold text-sky-950">
                    Replacement Car / Driver — Mock Only
                  </h4>
                  <p
                    className="rounded-md border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                    data-admin-replacement-boundary="true"
                  >
                    Mock/local only. Does not update the real booking, driver assignment, dispatch,
                    Supabase, or customer/driver notifications.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label>
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Replacement driver name
                    </span>
                    <input
                      className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      data-admin-replacement-field="driverName"
                      onChange={(event) => updateReplacementDriverDraft("driverName", event.target.value)}
                      placeholder="Replacement driver"
                      value={replacementDriverDraft.driverName}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Replacement driver contact
                    </span>
                    <input
                      className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      data-admin-replacement-field="driverContact"
                      onChange={(event) => updateReplacementDriverDraft("driverContact", event.target.value)}
                      placeholder="Phone / WhatsApp"
                      type="tel"
                      value={replacementDriverDraft.driverContact}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-medium text-slate-700">Replacement car plate</span>
                    <input
                      className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      data-admin-replacement-field="carPlate"
                      onChange={(event) => updateReplacementDriverDraft("carPlate", event.target.value)}
                      placeholder="Plate"
                      value={replacementDriverDraft.carPlate}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Replacement vehicle model
                    </span>
                    <input
                      className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      data-admin-replacement-field="vehicleModel"
                      onChange={(event) => updateReplacementDriverDraft("vehicleModel", event.target.value)}
                      placeholder="Vehicle model"
                      value={replacementDriverDraft.vehicleModel}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-medium text-slate-700">Reason</span>
                    <select
                      className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      data-admin-replacement-field="reason"
                      onChange={(event) => updateReplacementDriverDraft("reason", event.target.value)}
                      value={replacementDriverDraft.reason}
                    >
                      <option value="breakdown">Breakdown</option>
                      <option value="late-driver">Late driver</option>
                      <option value="missed-job">Missed job</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-medium text-slate-700">Optional note</span>
                    <input
                      className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      data-admin-replacement-field="note"
                      onChange={(event) => updateReplacementDriverDraft("note", event.target.value)}
                      placeholder="Local note only"
                      value={replacementDriverDraft.note}
                    />
                  </label>
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-3">
                  {replacementDriverActions.map((action) => (
                    <div className="space-y-2" key={action.key}>
                      <button
                        className="min-h-10 w-full rounded-md border border-sky-300 bg-white px-3 py-2 text-left text-sm font-semibold text-sky-900 transition hover:bg-sky-50"
                        data-admin-replacement-action={action.key}
                        onClick={() => markReplacementDriverPlaceholder(action)}
                        type="button"
                      >
                        {action.label}
                      </button>
                      {replacementDriverFeedback?.action === action.key ? (
                        <p
                          className={`rounded-md border px-3 py-2 text-xs font-semibold ${statusClass(replacementDriverFeedback.tone)}`}
                          data-admin-replacement-feedback={action.key}
                        >
                          {replacementDriverFeedback.text}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
              <div
                className="mt-4 border-t border-sky-200 pt-4"
                data-telegram-alert-preview="true"
              >
                <div className="mb-3 flex flex-col gap-1">
                  <h4
                    className="text-sm font-semibold text-sky-950"
                    data-telegram-alert-title="true"
                  >
                    Telegram Alert Preview — Mock Only
                  </h4>
                  <p
                    className="rounded-md border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                    data-telegram-alert-boundary="true"
                  >
                    {telegramAlertPreviewSafetyText}
                  </p>
                </div>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,18rem)_1fr]">
                  <div className="space-y-3">
                    <label>
                      <span className="mb-1 block text-sm font-medium text-slate-700">Preview type</span>
                      <select
                        className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                        data-telegram-alert-type="true"
                        onChange={(event) =>
                          updateTelegramAlertPreviewType(event.target.value as TelegramAlertPreviewType)
                        }
                        value={telegramAlertPreviewType}
                      >
                        {telegramAlertPreviewTemplates.map((template) => (
                          <option key={template.key} value={template.key}>
                            {template.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="space-y-2">
                      <button
                        className="min-h-10 w-full rounded-md border border-sky-300 bg-white px-3 py-2 text-left text-sm font-semibold text-sky-900 transition hover:bg-sky-50"
                        data-telegram-alert-generate="true"
                        onClick={generateTelegramAlertMockPreview}
                        type="button"
                      >
                        Generate Mock Preview
                      </button>
                      {telegramAlertPreviewFeedback ? (
                        <p
                          className={`rounded-md border px-3 py-2 text-xs font-semibold ${statusClass(telegramAlertPreviewFeedback.tone)}`}
                          data-telegram-alert-feedback="true"
                        >
                          {telegramAlertPreviewFeedback.text}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-md border border-sky-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Preview wording</p>
                    <p
                      className="mt-1 text-sm font-semibold text-sky-950"
                      data-telegram-alert-selected-label="true"
                    >
                      {telegramAlertPreviewTemplate.label}
                    </p>
                    <pre
                      className="mt-2 whitespace-pre-wrap rounded-md bg-slate-950 p-3 font-mono text-xs leading-5 text-white"
                      data-telegram-alert-message="true"
                    >
                      {telegramAlertPreviewMessage}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            {shouldShowParserDebugPanel && parsedDebugBooking ? (
              <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-3">
                {parsedDebugBooking.parserWarning ? (
                  <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                    {parsedDebugBooking.parserWarning}
                  </div>
                ) : null}
                {parsedDebugPreviewItems.length > 0 ? (
                  <div className="mb-3 grid gap-2">
                    {parsedDebugPreviewItems.map((preview, index) => {
                      const safePreview = preview ?? {};

                      return (
                        <div
                          className="rounded-md border border-amber-200 bg-white p-3 text-sm text-slate-800"
                          key={`${safePreview.flight || safePreview.pickup || "preview"}-${index}`}
                        >
                          <p className="font-semibold">Extracted booking {index + 1}</p>
                          {safePreview.passenger ? <p>Passenger: {safePreview.passenger}</p> : null}
                          {safePreview.type ? <p>Type: {safePreview.type}</p> : null}
                          {safePreview.date || safePreview.time ? (
                            <p>
                              Time: {[safePreview.date, safePreview.time].filter(Boolean).join(" ")}
                            </p>
                          ) : null}
                          {safePreview.flight ? <p>Flight: {safePreview.flight}</p> : null}
                          <p>
                            Route: {safePreview.pickup || "Pickup TBC"} &gt;{" "}
                            {safePreview.dropoff || "Drop-off TBC"}
                          </p>
                          <button
                            className="mt-3 h-9 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                            onClick={() => applyExtractedBooking(safePreview)}
                            type="button"
                          >
                            Use this booking
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : parsedDebugBooking.multipleBookingsDetected ? (
                  <div className="mb-3 rounded-md border border-amber-200 bg-white p-3 text-sm text-slate-700">
                    No extracted booking preview available. Split the message and parse one booking at a time.
                  </div>
                ) : null}
                {showParserDebug ? (
                  <div className="mt-3">
                    <p className="mb-2 text-sm font-semibold text-slate-800">Parsed booking state</p>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-700">
                      {JSON.stringify(parsedDebugBooking, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}

            {parsedDebugBooking ? (
              <div className="mt-5 flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Parser debug</p>
                  <p className="text-xs text-slate-500">Hidden by default for daily operations.</p>
                </div>
                <button
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  onClick={() => setShowParserDebug((current) => !current)}
                  type="button"
                >
                  {showParserDebug ? "Hide parser debug" : "Show parser debug"}
                </button>
              </div>
            ) : null}

            {hasNeedsReviewWarnings ? (
              <div className="mt-5 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p className="font-semibold">Needs review before saving</p>
                <p className="mt-1">Please check these fields before saving this booking.</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {needsReviewWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                <label className="mt-3 flex items-start gap-2 text-sm font-medium">
                  <input
                    checked={reviewWarningsAccepted}
                    className="mt-0.5 h-4 w-4 rounded border-amber-400 text-slate-950 focus:ring-slate-900"
                    onChange={(event) =>
                      setAcceptedReviewWarningKey(event.target.checked ? needsReviewAcceptanceKey : "")
                    }
                    type="checkbox"
                  />
                  <span>I reviewed these warnings and still want to save</span>
                </label>
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                className="h-12 rounded-md bg-slate-950 px-5 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={saving}
                onClick={saveBooking}
                type="button"
              >
                {saving ? "Saving..." : "Save Booking + CRM"}
              </button>
            </div>
            {bookingSaveMessage ? (
              <div className={`mt-3 rounded-md border px-4 py-3 text-sm ${statusClass(bookingSaveMessage.tone)}`}>
                {bookingSaveMessage.text}
              </div>
            ) : null}

            <section
              className="mt-5 rounded-md border border-emerald-200 bg-emerald-50/60 p-3"
              data-admin-booking-persistence-panel="true"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-emerald-950">
                    Admin Booking Persistence
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-emerald-900">
                    Internal admin-only operational fields. No price, billing, payout, payment, notification, or parser-learning data.
                  </p>
                  <p
                    className="mt-1 text-xs font-semibold leading-5 text-emerald-900"
                    data-admin-booking-customer-intake-guidance="true"
                  >
                    Customer booking requests loaded here require admin review before confirmation.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:min-w-56">
                  <button
                    className="min-h-10 rounded-md border border-emerald-300 bg-white px-3 py-2 text-left text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    data-admin-booking-persistence-save="true"
                    disabled={adminBookingPersistenceAction !== null}
                    onClick={saveAdminBookingOperationalSnapshot}
                    type="button"
                  >
                    {adminBookingPersistenceAction === "save" ? "Saving..." : "Save Operational Snapshot"}
                  </button>
                  <button
                    className="min-h-10 rounded-md border border-emerald-300 bg-white px-3 py-2 text-left text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    data-admin-booking-persistence-load="true"
                    disabled={adminBookingPersistenceAction !== null}
                    onClick={loadAdminBookingOperationalSnapshots}
                    type="button"
                  >
                    {adminBookingPersistenceAction === "load" ? "Loading..." : "Load Operational Snapshots"}
                  </button>
                  <button
                    className="min-h-10 rounded-md border border-emerald-300 bg-white px-3 py-2 text-left text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    data-admin-booking-persistence-apply-latest="true"
                    disabled={adminBookingPersistenceAction !== null}
                    onClick={applyLatestAdminBookingOperationalSnapshot}
                    type="button"
                  >
                    Apply Latest Snapshot
                  </button>
                  <button
                    className="min-h-10 rounded-md border border-emerald-300 bg-white px-3 py-2 text-left text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    data-admin-booking-persistence-update-applied="true"
                    disabled={adminBookingPersistenceAction !== null}
                    onClick={updateAppliedAdminBookingOperationalSnapshot}
                    type="button"
                  >
                    {adminBookingPersistenceAction === "update"
                      ? "Updating..."
                      : "Update Applied Snapshot"}
                  </button>
                </div>
              </div>
              <div
                className="mt-3 border-t border-emerald-200 pt-3 text-xs text-emerald-950"
                data-admin-booking-persistence-applied-identity="true"
              >
                {appliedAdminBookingSnapshotReference ? (
                  <div className="grid gap-2">
                    <div className="grid gap-1">
                      <p className="font-semibold text-emerald-950">
                        Applied operational snapshot
                      </p>
                      <p
                        className="break-words font-semibold text-emerald-900"
                        data-admin-booking-persistence-applied-reference="true"
                      >
                        {clean(appliedAdminBookingSnapshotReference)}
                      </p>
                      <p className="break-words">
                        {[
                          appliedAdminBookingSnapshot?.customer_display_name,
                          appliedAdminBookingSnapshot?.pickup_datetime
                            ? adminBookingPersistencePickupDisplay(appliedAdminBookingSnapshot)
                            : "",
                        ]
                          .map((value) => clean(value || ""))
                          .filter(Boolean)
                          .join(" · ") || "Loaded operational snapshot"}
                      </p>
                      <p className="break-words">
                        {appliedAdminBookingSnapshot
                          ? adminBookingPersistenceRouteSummary(appliedAdminBookingSnapshot)
                          : "Pickup TBC > Drop-off TBC"}
                      </p>
                      <p className="font-semibold text-emerald-900">
                        Status:{" "}
                        {appliedAdminBookingSnapshot
                          ? adminBookingPersistencePrimaryStatus(appliedAdminBookingSnapshot)
                          : "Applied"}
                      </p>
                    </div>
                    <p
                      className="leading-5 text-emerald-900"
                      data-admin-booking-persistence-duplicate-guidance="true"
                    >
                      Save Operational Snapshot creates a new saved snapshot from the current form. Update Applied Snapshot updates this applied one.
                    </p>
                    {appliedAdminBookingSnapshotHiddenByFilters ? (
                      <p
                        className="rounded-md border border-emerald-200 bg-white px-3 py-2 leading-5 text-emerald-900"
                        data-admin-booking-persistence-applied-filter-note="true"
                      >
                        Current filters are hiding the applied snapshot in the loaded list.
                      </p>
                    ) : null}
                    <button
                      className="min-h-9 w-fit rounded-md border border-emerald-300 bg-white px-3 py-2 text-left text-xs font-semibold text-emerald-900 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      data-admin-booking-persistence-clear-applied="true"
                      disabled={adminBookingPersistenceAction !== null}
                      onClick={clearAppliedAdminBookingOperationalSnapshot}
                      type="button"
                    >
                      Clear Applied Snapshot
                    </button>
                  </div>
                ) : (
                  <p
                    className="font-semibold text-emerald-900"
                    data-admin-booking-persistence-no-applied="true"
                  >
                    No loaded operational snapshot is currently applied.
                  </p>
                )}
              </div>
              {adminBookingPersistenceMessage ? (
                <p
                  className={`mt-3 rounded-md border px-3 py-2 text-xs font-semibold ${statusClass(
                    adminBookingPersistenceMessage.tone,
                  )}`}
                  data-admin-booking-persistence-feedback="true"
                >
                  {adminBookingPersistenceMessage.text}
                </p>
              ) : null}
              {adminBookingPersistenceRecords.length > 0 ? (
                <div
                  className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)_auto] sm:items-end"
                  data-admin-booking-persistence-filters="true"
                >
                  <label className="text-xs font-semibold text-emerald-950">
                    <span>Search operational snapshots</span>
                    <input
                      className="mt-1 min-h-10 w-full min-w-0 rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      data-admin-booking-persistence-search="true"
                      onChange={(event) => setAdminBookingPersistenceSearch(event.target.value)}
                      placeholder="Reference, customer, phone"
                      type="search"
                      value={adminBookingPersistenceSearch}
                    />
                  </label>
                  <label className="text-xs font-semibold text-emerald-950">
                    <span>Snapshot status</span>
                    <select
                      className="mt-1 min-h-10 w-full min-w-0 rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      data-admin-booking-persistence-status-filter="true"
                      onChange={(event) => setAdminBookingPersistenceStatusFilter(event.target.value)}
                      value={adminBookingPersistenceStatusFilter}
                    >
                      <option value={adminBookingPersistenceAllStatusFilter}>All statuses</option>
                      {adminBookingPersistenceStatusOptions.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {statusOption}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="min-h-10 rounded-md border border-emerald-300 bg-white px-3 py-2 text-left text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    data-admin-booking-persistence-clear-filters="true"
                    disabled={!adminBookingPersistenceHasActiveFilters}
                    onClick={clearAdminBookingPersistenceFilters}
                    type="button"
                  >
                    Clear Filters
                  </button>
                </div>
              ) : null}
              {adminCustomerRequestRecords.length > 0 ? (
                <div
                  className="mt-3 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-3"
                  data-admin-booking-customer-request-filters="true"
                >
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,15rem)_auto] sm:items-end">
                    <label className="text-xs font-semibold text-amber-950">
                      <span>Search customer booking requests</span>
                      <input
                        className="mt-1 min-h-10 w-full min-w-0 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                        data-admin-booking-customer-request-search="true"
                        onChange={(event) => setAdminCustomerRequestSearch(event.target.value)}
                        placeholder="Reference, customer, route, status"
                        type="search"
                        value={adminCustomerRequestSearch}
                      />
                    </label>
                    <label className="text-xs font-semibold text-amber-950">
                      <span>Customer request status</span>
                      <select
                        className="mt-1 min-h-10 w-full min-w-0 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                        data-admin-booking-customer-request-status-filter="true"
                        onChange={(event) =>
                          setAdminCustomerRequestStatusFilter(
                            event.target.value as AdminCustomerRequestStatusFilter,
                          )
                        }
                        value={adminCustomerRequestStatusFilter}
                      >
                        {adminCustomerRequestStatusFilterOptions.map((statusOption) => (
                          <option key={statusOption.key} value={statusOption.key}>
                            {statusOption.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="min-h-10 rounded-md border border-amber-300 bg-white px-3 py-2 text-left text-sm font-semibold text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      data-admin-booking-customer-request-clear-filters="true"
                      disabled={!adminCustomerRequestHasActiveFilters}
                      onClick={clearAdminCustomerRequestFilters}
                      type="button"
                    >
                      Clear Request Filters
                    </button>
                  </div>
                  <p
                    className="mt-2 text-xs font-semibold text-amber-900"
                    data-admin-booking-customer-request-filter-summary="true"
                  >
                    Showing {filteredAdminCustomerRequestRecords.length} of{" "}
                    {adminCustomerRequestRecords.length} customer booking requests in the current operational snapshot view.
                  </p>
                  <p
                    className="mt-1 text-xs font-semibold text-amber-900"
                    data-admin-booking-customer-request-priority-order="true"
                  >
                    Priority order: short-notice and needs-review requests first.
                  </p>
                  <div
                    className="mt-2 rounded-md border border-amber-200 bg-white/80 px-3 py-2 text-xs leading-5 text-amber-900"
                    data-admin-booking-customer-amend-cancel-handoff="true"
                  >
                    <p className="font-semibold text-amber-950">
                      Amend/cancel review handoff
                    </p>
                    <p className="mt-1">
                      Customer change and cancellation requests need staff review. Bookings are
                      not changed or cancelled until admin confirms.
                    </p>
                    <p className="mt-1">
                      Handle urgent or short-notice cases manually with the dispatcher before
                      confirming any change.
                    </p>
                  </div>
                </div>
              ) : null}
              {adminBookingPersistenceRecords.length > 0 ? (
                <p
                  className="mt-2 text-xs font-semibold text-emerald-900"
                  data-admin-booking-persistence-filter-summary="true"
                >
                  Showing {displayedAdminBookingPersistenceRecords.length} of{" "}
                  {adminBookingPersistenceRecords.length} loaded operational snapshots.
                </p>
              ) : null}
              {adminBookingPersistenceRecords.length > 0 &&
              displayedAdminBookingPersistenceRecords.length === 0 ? (
                <p
                  className="mt-3 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-900"
                  data-admin-booking-persistence-filter-empty="true"
                >
                  {adminCustomerRequestHasActiveFilters
                    ? "No customer booking requests match this search/filter."
                    : "No loaded operational snapshots match this search/filter."}
                </p>
              ) : null}
              {displayedAdminBookingPersistenceRecords.length > 0 ? (
                <div className="mt-3 grid gap-2" data-admin-booking-persistence-records="true">
                  {displayedAdminBookingPersistenceRecords.slice(0, 3).map((record) => (
                    <article
                      className="rounded-md border border-emerald-100 bg-white px-3 py-2 text-xs text-slate-700"
                      data-admin-booking-persistence-record={record.booking_reference}
                      key={record.booking_reference}
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-semibold text-emerald-950">
                          {record.booking_reference}
                        </p>
                        <p className="text-slate-500">
                          {record.admin_internal_status || "Draft"}
                        </p>
                      </div>
                      <p className="mt-1 break-words">
                        {[record.customer_display_name, record.vehicle_type_or_category, record.route_type]
                          .filter(Boolean)
                          .join(" · ") || "Operational booking"}
                      </p>
                      <p
                        className="mt-1 break-words text-slate-500"
                        data-admin-booking-persistence-record-contact={record.booking_reference}
                      >
                        Contact: {[record.contact_phone, record.contact_email].filter(Boolean).join(" · ") || "TBC"}
                      </p>
                      <p
                        className="mt-1 font-semibold text-emerald-900"
                        data-admin-booking-persistence-record-source={record.booking_reference}
                      >
                        {adminBookingPersistenceSourceLabel(record)}
                        {record.source_channel === "customer-booking-request"
                          ? " · Admin review required before confirmation"
                          : ""}
                      </p>
                      {adminBookingPersistenceRecordIsCustomerRequest(record) ? (
                        <p
                          className="mt-1 font-semibold text-amber-900"
                          data-admin-booking-customer-request-wait-time={record.booking_reference}
                        >
                          {adminCustomerRequestWaitTimeLabel(record, currentTimeMs)}
                        </p>
                      ) : null}
                      <p className="mt-1 break-words">
                        {[record.pickup_location || "Pickup TBC", record.dropoff_location || "Drop-off TBC"].join(
                          " > ",
                        )}
                      </p>
                      <p className="mt-1 text-slate-500">
                        {record.pickup_datetime
                          ? new Date(record.pickup_datetime).toLocaleString("en-SG", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "Pickup time TBC"}
                      </p>
                      {adminBookingPersistenceRecordIsCustomerRequest(record) ? (
                        <div
                          className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
                          data-admin-booking-customer-request-decision={record.booking_reference}
                        >
                          <p className="font-semibold text-amber-950">
                            Internal review decision only
                          </p>
                          <p
                            className="mt-1 leading-5 text-amber-900"
                            data-admin-booking-customer-request-decision-guidance={record.booking_reference}
                          >
                            Tracks admin decision status only. It does not contact customers or dispatch drivers.
                          </p>
                          <div
                            className="mt-2 grid gap-2 rounded-md border border-amber-100 bg-white/75 px-3 py-2"
                            data-admin-booking-customer-request-review-state={record.booking_reference}
                          >
                            <p className="text-[11px] font-semibold uppercase text-amber-900">
                              Current review state
                            </p>
                            <dl className="grid gap-2 sm:grid-cols-3">
                              {[
                                {
                                  label: "Admin internal status",
                                  value: clean(record.admin_internal_status) || "Draft",
                                },
                                {
                                  label: "Customer-facing status",
                                  value: clean(record.customer_facing_status) || "Request Received",
                                },
                                {
                                  label: "Short-notice review status",
                                  value: clean(record.short_notice_review_status) || "Not Required",
                                },
                              ].map(({ label, value }) => (
                                <div className="min-w-0" key={label}>
                                  <dt className="text-[11px] font-semibold text-amber-800">
                                    {label}
                                  </dt>
                                  <dd className="mt-0.5 break-words font-semibold text-amber-950">
                                    {value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            {adminCustomerRequestReviewDecisions.map((decision) => (
                              <button
                                className="min-h-9 rounded-md border border-amber-300 bg-white px-3 py-2 text-left text-xs font-semibold text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                                data-admin-booking-customer-request-decision-button={`${record.booking_reference}:${decision.key}`}
                                disabled={adminBookingPersistenceAction !== null}
                                key={decision.key}
                                onClick={() => updateAdminCustomerRequestReviewDecision(record, decision.key)}
                                type="button"
                              >
                                {decision.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <button
                        className="mt-2 min-h-9 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-left text-xs font-semibold text-emerald-950 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        data-admin-booking-persistence-apply={record.booking_reference}
                        disabled={adminBookingPersistenceAction !== null}
                        onClick={() => applyAdminBookingOperationalSnapshot(record)}
                        type="button"
                      >
                        Apply Operational Snapshot
                      </button>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>

            <section
              aria-label="Dispatch Release checklist"
              className="mt-5 rounded-md border border-sky-200 bg-sky-50/70 p-2.5"
              data-admin-dispatch-release-checklist="true"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-sky-950">
                      Dispatch Release
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ring-1 ${
                        dispatchReleaseReady
                          ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                          : "bg-amber-100 text-amber-950 ring-amber-200"
                      }`}
                      data-admin-dispatch-release-state="true"
                    >
                      {dispatchReleaseReady ? "Ready" : "Needs action"}
                    </span>
                  </div>
                  <p
                    className="mt-1 break-words text-xs font-semibold leading-5 text-sky-900"
                    data-admin-dispatch-release-context="true"
                  >
                    {dispatchReleaseContextLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-sky-900">
                    Admin-only local checklist before staff manually release a reviewed booking.
                  </p>
                </div>
                <button
                  className="min-h-9 rounded-md border border-sky-300 bg-white px-3 py-1.5 text-left text-sm font-semibold text-sky-950 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  data-admin-dispatch-release-mark-ready="true"
                  disabled={!dispatchReleaseReady}
                  onClick={() => {
                    setDispatchReleaseMessage({
                      tone: "success",
                      text: "Dispatch release marked ready locally. No database write, notification, or driver action was sent.",
                    });
                  }}
                  type="button"
                >
                  Mark Ready Locally
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                {dispatchReleaseChecklist.map((item) => (
                  <div
                    className={`min-h-12 min-w-0 rounded-md border px-2 py-1.5 text-[11px] ${
                      item.state === "ready"
                        ? "border-emerald-200 bg-white text-emerald-950"
                        : "border-amber-200 bg-white text-amber-950"
                    }`}
                    data-admin-dispatch-release-check={item.key}
                    data-admin-dispatch-release-check-state={item.state}
                    key={item.key}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-1.5">
                      <p className="font-semibold leading-4" data-admin-dispatch-release-check-label={item.key}>
                        {item.label}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          item.state === "ready"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.state === "ready" ? "Ready" : "Check"}
                      </span>
                    </div>
                    <p className="mt-0.5 break-words leading-4" data-admin-dispatch-release-check-detail={item.key}>
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
              {dispatchReleaseMessage ? (
                <p
                  className={`mt-3 rounded-md border px-3 py-2 text-xs font-semibold ${statusClass(
                    dispatchReleaseMessage.tone,
                  )}`}
                  data-admin-dispatch-release-feedback="true"
                >
                  {dispatchReleaseMessage.text}
                </p>
              ) : null}
              <p
                className="mt-2 border-t border-sky-200 pt-2 text-[11px] leading-4 text-sky-900"
                data-admin-dispatch-release-boundary="true"
              >
                UI/local-state only. No Supabase write, live database access, customer message, driver notification,
                billing, payment, PDF, payout, live location, or parser-learning behavior is created here.
              </p>
            </section>

            <section
              aria-label="Dispatch Release handoff packet"
              className="mt-3 rounded-md border border-teal-200 bg-teal-50/70 p-2.5"
              data-admin-dispatch-release-handoff-packet="true"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-teal-950">
                      Dispatch Release Handoff Packet
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ring-1 ${
                        dispatchReleaseReady
                          ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                          : "bg-amber-100 text-amber-950 ring-amber-200"
                      }`}
                      data-admin-dispatch-release-handoff-status="true"
                    >
                      {dispatchReleaseLocalStatus}
                    </span>
                  </div>
                  <p
                    className="mt-1 break-words text-xs font-semibold leading-5 text-teal-900"
                    data-admin-dispatch-release-handoff-context="true"
                  >
                    {dispatchReleaseContextLabel}
                  </p>
                </div>
                <label className="min-w-0 text-xs font-semibold text-teal-950 sm:w-64">
                  <span>Local release note</span>
                  <textarea
                    className="mt-1 min-h-16 w-full min-w-0 resize-y rounded-md border border-teal-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                    data-admin-dispatch-release-handoff-note="true"
                    onChange={(event) => setDispatchReleaseLocalNote(event.target.value)}
                    placeholder="Local staff note"
                    value={dispatchReleaseLocalNote}
                  />
                </label>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                {dispatchReleaseHandoffItems.map((item) => (
                  <div
                    className={`min-h-12 min-w-0 rounded-md border px-2 py-1.5 text-[11px] ${
                      item.state === "ready"
                        ? "border-emerald-200 bg-white text-emerald-950"
                        : "border-amber-200 bg-white text-amber-950"
                    }`}
                    data-admin-dispatch-release-handoff-item={item.key}
                    data-admin-dispatch-release-handoff-item-state={item.state}
                    key={item.key}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-1.5">
                      <p className="font-semibold leading-4" data-admin-dispatch-release-handoff-label={item.key}>
                        {item.label}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          item.state === "ready"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.state === "ready" ? "Ready" : "Check"}
                      </span>
                    </div>
                    <p
                      className="mt-0.5 break-words leading-4"
                      data-admin-dispatch-release-handoff-detail={item.key}
                    >
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
              <p
                className="mt-2 border-t border-teal-200 pt-2 text-[11px] leading-4 text-teal-900"
                data-admin-dispatch-release-handoff-boundary="true"
              >
                Local UI only. No Supabase write, live database access, notification sending, customer message,
                driver notification, billing, payment, PDF, payout, live location, or parser-learning behavior.
              </p>
            </section>

            <section
              aria-label="Driver Acknowledgement Readiness"
              className="mt-3 rounded-md border border-indigo-200 bg-indigo-50/70 p-2.5"
              data-admin-driver-acknowledgement-readiness="true"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-indigo-950">
                      Driver Acknowledgement Readiness
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ring-1 ${
                        driverAcknowledgementCoreReady
                          ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                          : "bg-amber-100 text-amber-950 ring-amber-200"
                      }`}
                      data-admin-driver-acknowledgement-status="true"
                    >
                      {driverAcknowledgementLocalStatus}
                    </span>
                  </div>
                  <p
                    className="mt-1 break-words text-xs font-semibold leading-5 text-indigo-900"
                    data-admin-driver-acknowledgement-context="true"
                  >
                    {dispatchReleaseContextLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-indigo-900">
                    Admin-only follow-up before staff manually request driver acknowledgement.
                  </p>
                </div>
                <button
                  className="min-h-9 rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-left text-sm font-semibold text-indigo-950 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  data-admin-driver-acknowledgement-mark-ready="true"
                  disabled={!driverAcknowledgementCoreReady}
                  onClick={() => {
                    setDriverAcknowledgementMessage({
                      tone: "success",
                      text: "Driver acknowledgement readiness marked locally. No message, notification, or database write was sent.",
                    });
                  }}
                  type="button"
                >
                  Mark Ack Ready Locally
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                {driverAcknowledgementItems.map((item) => (
                  <div
                    className={`min-h-12 min-w-0 rounded-md border px-2 py-1.5 text-[11px] ${
                      item.state === "ready"
                        ? "border-emerald-200 bg-white text-emerald-950"
                        : "border-amber-200 bg-white text-amber-950"
                    }`}
                    data-admin-driver-acknowledgement-item={item.key}
                    data-admin-driver-acknowledgement-item-state={item.state}
                    key={item.key}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-1.5">
                      <p className="font-semibold leading-4" data-admin-driver-acknowledgement-label={item.key}>
                        {item.label}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          item.state === "ready"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.state === "ready" ? "Ready" : "Check"}
                      </span>
                    </div>
                    <p
                      className="mt-0.5 break-words leading-4"
                      data-admin-driver-acknowledgement-detail={item.key}
                    >
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
              {driverAcknowledgementMessage ? (
                <p
                  className={`mt-3 rounded-md border px-3 py-2 text-xs font-semibold ${statusClass(
                    driverAcknowledgementMessage.tone,
                  )}`}
                  data-admin-driver-acknowledgement-feedback="true"
                >
                  {driverAcknowledgementMessage.text}
                </p>
              ) : null}
              <p
                className="mt-2 border-t border-indigo-200 pt-2 text-[11px] leading-4 text-indigo-900"
                data-admin-driver-acknowledgement-boundary="true"
              >
                Local UI only. No Supabase write, live database access, notification sending, customer message,
                driver notification, billing, payment, PDF, payout, live location, or parser-learning behavior.
              </p>
            </section>

            <section
              aria-label="Driver Acknowledgement Follow-up"
              className="mt-3 rounded-md border border-cyan-200 bg-cyan-50/70 p-2.5"
              data-admin-driver-acknowledgement-follow-up="true"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-cyan-950">
                      Driver Acknowledgement Follow-up
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ring-1 ${
                        driverAcknowledgementFollowUpStatus === "acknowledged"
                          ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                          : driverAcknowledgementFollowUpStatus === "needs-call"
                            ? "bg-rose-100 text-rose-900 ring-rose-200"
                            : "bg-amber-100 text-amber-950 ring-amber-200"
                      }`}
                      data-admin-driver-acknowledgement-follow-up-status="true"
                    >
                      {driverAcknowledgementFollowUpStatusLabel}
                    </span>
                  </div>
                  <p
                    className="mt-1 break-words text-xs font-semibold leading-5 text-cyan-900"
                    data-admin-driver-acknowledgement-follow-up-context="true"
                  >
                    {dispatchReleaseContextLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-cyan-900">
                    Local tracker after manual driver follow-up.
                  </p>
                </div>
                <div
                  aria-label="Driver acknowledgement follow-up status"
                  className="grid w-full grid-cols-1 gap-1 rounded-md border border-cyan-200 bg-white p-1 min-[360px]:grid-cols-3 sm:w-72 sm:shrink-0"
                  data-admin-driver-acknowledgement-follow-up-controls="true"
                  role="group"
                >
                  {driverAcknowledgementFollowUpOptions.map((option) => {
                    const isSelected = driverAcknowledgementFollowUpStatus === option.value;
                    const isDisabled = option.value !== "pending" && !driverAcknowledgementCoreReady;

                    return (
                      <button
                        className={`min-h-9 rounded px-2 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
                          isSelected
                            ? "bg-cyan-700 text-white"
                            : "bg-white text-cyan-950 hover:bg-cyan-100"
                        }`}
                        data-admin-driver-acknowledgement-follow-up-option={option.value}
                        data-admin-driver-acknowledgement-follow-up-option-state={
                          isSelected ? "selected" : "idle"
                        }
                        disabled={isDisabled}
                        key={option.value}
                        onClick={() => setDriverAcknowledgementFollowUpStatus(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="mt-3 block min-w-0 text-xs font-semibold text-cyan-950">
                <span>Local follow-up note</span>
                <textarea
                  className="mt-1 min-h-12 w-full min-w-0 resize-y rounded-md border border-cyan-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  data-admin-driver-acknowledgement-follow-up-note="true"
                  onChange={(event) => setDriverAcknowledgementFollowUpNote(event.target.value)}
                  placeholder="Local staff note"
                  value={driverAcknowledgementFollowUpNote}
                />
              </label>
              <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                {driverAcknowledgementFollowUpItems.map((item) => (
                  <div
                    className={`min-h-12 min-w-0 rounded-md border px-2 py-1.5 text-[11px] ${
                      item.state === "ready"
                        ? "border-emerald-200 bg-white text-emerald-950"
                        : item.key === "no-response-needs-call" &&
                            driverAcknowledgementFollowUpStatus === "needs-call"
                          ? "border-rose-200 bg-white text-rose-950"
                          : "border-amber-200 bg-white text-amber-950"
                    }`}
                    data-admin-driver-acknowledgement-follow-up-item={item.key}
                    data-admin-driver-acknowledgement-follow-up-item-state={item.state}
                    key={item.key}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-1.5">
                      <p
                        className="font-semibold leading-4"
                        data-admin-driver-acknowledgement-follow-up-label={item.key}
                      >
                        {item.label}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          item.state === "ready"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.state === "ready" ? "Ready" : "Check"}
                      </span>
                    </div>
                    <p
                      className="mt-0.5 break-words leading-4"
                      data-admin-driver-acknowledgement-follow-up-detail={item.key}
                    >
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
              <p
                className="mt-2 border-t border-cyan-200 pt-2 text-[11px] leading-4 text-cyan-900"
                data-admin-driver-acknowledgement-follow-up-boundary="true"
              >
                Local UI only. No Supabase write, live database access, notification sending, customer message,
                driver notification, billing, payment, PDF, payout, live location, or parser-learning behavior.
              </p>
            </section>

            <section
              aria-label="Day-of-Trip Dispatch Monitor"
              className="mt-3 rounded-md border border-lime-200 bg-lime-50/70 p-1 sm:p-2.5"
              data-admin-day-of-trip-dispatch-monitor="true"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-lime-950">
                      Day-of-Trip Dispatch Monitor
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ring-1 ${
                        dayOfTripDispatchMonitorStatus === "completed"
                          ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                          : dayOfTripDispatchMonitorStatus === "needs-call"
                            ? "bg-rose-100 text-rose-900 ring-rose-200"
                            : "bg-amber-100 text-amber-950 ring-amber-200"
                      }`}
                      data-admin-day-of-trip-dispatch-monitor-status="true"
                    >
                      {dayOfTripDispatchMonitorStatusLabel}
                    </span>
                  </div>
                  <p
                    className="mt-1 break-words text-xs font-semibold leading-5 text-lime-900"
                    data-admin-day-of-trip-dispatch-monitor-context="true"
                  >
                    {dispatchReleaseContextLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-lime-900">
                    Local day-of-trip bridge from release to job progress.
                  </p>
                </div>
                <div
                  aria-label="Day-of-trip dispatch progress"
                  className="grid w-full grid-cols-2 gap-1 rounded-md border border-lime-200 bg-white p-1 min-[360px]:grid-cols-3 sm:w-64 sm:shrink-0 lg:w-72 xl:w-96"
                  data-admin-day-of-trip-dispatch-monitor-controls="true"
                  role="group"
                >
                  {dayOfTripDispatchMonitorOptions.map((option) => {
                    const isSelected = dayOfTripDispatchMonitorStatus === option.value;
                    const isDisabled =
                      !dayOfTripDriverAcknowledged &&
                      option.value !== "reminder-due" &&
                      option.value !== "needs-call";

                    return (
                      <button
                        className={`min-h-9 rounded px-2 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
                          isSelected
                            ? "bg-lime-700 text-white"
                            : "bg-white text-lime-950 hover:bg-lime-100"
                        }`}
                        data-admin-day-of-trip-dispatch-monitor-option={option.value}
                        data-admin-day-of-trip-dispatch-monitor-option-state={
                          isSelected ? "selected" : "idle"
                        }
                        disabled={isDisabled}
                        key={option.value}
                        onClick={() => setDayOfTripDispatchMonitorStatus(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-1 min-[300px]:grid-cols-2 sm:mt-3 md:grid-cols-3">
                {dayOfTripDispatchMonitorItems.map((item) => (
                  <div
                    className={`min-h-[52px] min-w-0 rounded-md border px-1 py-1.5 text-[11px] sm:px-2 md:min-h-12 ${
                      item.state === "ready"
                        ? "border-emerald-200 bg-white text-emerald-950"
                        : item.key === "no-response-needs-call" && dayOfTripNoResponse
                          ? "border-rose-200 bg-white text-rose-950"
                          : "border-amber-200 bg-white text-amber-950"
                    }`}
                    data-admin-day-of-trip-dispatch-monitor-item={item.key}
                    data-admin-day-of-trip-dispatch-monitor-item-state={item.state}
                    key={item.key}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-1.5">
                      <p
                        className="font-semibold leading-4"
                        data-admin-day-of-trip-dispatch-monitor-label={item.key}
                      >
                        {item.label}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          item.state === "ready"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.state === "ready" ? "Ready" : "Check"}
                      </span>
                    </div>
                    <p
                      className="mt-0.5 break-words leading-4"
                      data-admin-day-of-trip-dispatch-monitor-detail={item.key}
                    >
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
              <p
                className="mt-2 border-t border-lime-200 pt-2 text-[11px] leading-4 text-lime-900 md:text-[10px] md:leading-3"
                data-admin-day-of-trip-dispatch-monitor-boundary="true"
              >
                Local UI only. No Supabase write, live database access, notification sending, customer message,
                driver notification, billing, payment, PDF, payout, live location, or parser-learning behavior.
              </p>
            </section>

            <section
              aria-label="Day-of-Trip Exception Escalation"
              className="mt-3 rounded-md border border-rose-200 bg-rose-50/60 p-0.5 sm:p-2.5"
              data-admin-day-of-trip-exception-escalation="true"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-rose-950">
                      Day-of-Trip Exception Escalation
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ring-1 ${
                        dayOfTripExceptionEscalationClosed
                          ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                          : dayOfTripExceptionDriverNoResponse ||
                              dayOfTripExceptionReplacementMayBeNeeded ||
                              dayOfTripExceptionCustomerUpdateMayBeNeeded
                            ? "bg-rose-100 text-rose-900 ring-rose-200"
                            : "bg-amber-100 text-amber-950 ring-amber-200"
                      }`}
                      data-admin-day-of-trip-exception-escalation-status="true"
                    >
                      {dayOfTripExceptionEscalationStatusLabel}
                    </span>
                  </div>
                  <p
                    className="mt-1 break-words text-xs font-semibold leading-5 text-rose-900"
                    data-admin-day-of-trip-exception-escalation-context="true"
                  >
                    {dispatchReleaseContextLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-rose-900">
                    Local exception bridge for day-of-trip dispatcher escalation.
                  </p>
                </div>
                <div
                  aria-label="Day-of-trip exception escalation status"
                  className="grid w-full grid-cols-2 gap-1 rounded-md border border-rose-200 bg-white p-1 min-[300px]:grid-cols-3 sm:w-64 sm:shrink-0 lg:w-72 xl:w-96"
                  data-admin-day-of-trip-exception-escalation-controls="true"
                  role="group"
                >
                  {dayOfTripExceptionEscalationOptions.map((option) => {
                    const isSelected = dayOfTripExceptionEscalationStatus === option.value;

                    return (
                      <button
                        className={`min-h-9 rounded px-2 py-1 text-[11px] font-semibold transition ${
                          isSelected
                            ? "bg-rose-700 text-white"
                            : "bg-white text-rose-950 hover:bg-rose-100"
                        }`}
                        data-admin-day-of-trip-exception-escalation-option={option.value}
                        data-admin-day-of-trip-exception-escalation-option-state={
                          isSelected ? "selected" : "idle"
                        }
                        key={option.value}
                        onClick={() => setDayOfTripExceptionEscalationStatus(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="mt-1 block min-w-0 text-xs font-semibold text-rose-950 sm:mt-3">
                <span>Local escalation note</span>
                <textarea
                  className="mt-1 min-h-10 w-full min-w-0 resize-y rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                  data-admin-day-of-trip-exception-escalation-note="true"
                  onChange={(event) => setDayOfTripExceptionEscalationNote(event.target.value)}
                  placeholder="Local staff escalation note"
                  value={dayOfTripExceptionEscalationNote}
                />
              </label>
              <div className="mt-2 grid grid-cols-1 gap-1 min-[300px]:grid-cols-2 sm:mt-3 md:grid-cols-3">
                {dayOfTripExceptionEscalationItems.map((item) => (
                  <div
                    className={`min-h-12 min-w-0 rounded-md border px-1 py-1.5 text-[11px] sm:px-2 ${
                      item.state === "ready"
                        ? "border-emerald-200 bg-white text-emerald-950"
                        : item.key === "driver-no-response" ||
                            item.key === "needs-dispatcher-call" ||
                            item.key === "replacement-driver-may-be-needed" ||
                            item.key === "customer-update-may-be-needed"
                          ? "border-rose-200 bg-white text-rose-950"
                          : "border-amber-200 bg-white text-amber-950"
                    }`}
                    data-admin-day-of-trip-exception-escalation-item={item.key}
                    data-admin-day-of-trip-exception-escalation-item-state={item.state}
                    key={item.key}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-1.5">
                      <p
                        className="font-semibold leading-4"
                        data-admin-day-of-trip-exception-escalation-label={item.key}
                      >
                        {item.label}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          item.state === "ready"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.state === "ready" ? "Ready" : "Check"}
                      </span>
                    </div>
                    <p
                      className="mt-0.5 break-words leading-4"
                      data-admin-day-of-trip-exception-escalation-detail={item.key}
                    >
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
              <p
                className="mt-1.5 border-t border-rose-200 pt-1.5 text-[11px] leading-4 text-rose-900 md:text-[10px] md:leading-3"
                data-admin-day-of-trip-exception-escalation-boundary="true"
              >
                Local UI only. No Supabase write, live database access, notification sending, customer message,
                driver notification, billing, payment, PDF, payout, live location, or parser-learning behavior.
              </p>
            </section>

            <section
              aria-label="Dispatch Recovery / Replacement Readiness"
              className="mt-3 rounded-md border border-sky-200 bg-sky-50/70 p-0.5 sm:p-2.5"
              data-admin-dispatch-recovery-replacement-readiness="true"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-sky-950">
                      Dispatch Recovery / Replacement Readiness
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ring-1 ${
                        dispatchRecoveryReplacementReadyLocally
                          ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                          : dispatchRecoveryReplacementJobLinkReady ||
                              dispatchRecoveryReplacementDispatchCopyReady
                            ? "bg-sky-100 text-sky-900 ring-sky-200"
                            : "bg-amber-100 text-amber-950 ring-amber-200"
                      }`}
                      data-admin-dispatch-recovery-replacement-readiness-status="true"
                    >
                      {dispatchRecoveryReplacementStatusLabel}
                    </span>
                  </div>
                  <p
                    className="mt-1 break-words text-xs font-semibold leading-5 text-sky-900"
                    data-admin-dispatch-recovery-replacement-readiness-context="true"
                  >
                    {dispatchReleaseContextLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-sky-900">
                    Local recovery bridge for replacement driver and vehicle review.
                  </p>
                </div>
                <div
                  aria-label="Dispatch recovery replacement readiness status"
                  className="grid w-full grid-cols-2 gap-1 rounded-md border border-sky-200 bg-white p-1 min-[300px]:grid-cols-3 sm:w-64 sm:shrink-0 lg:w-72 xl:w-96"
                  data-admin-dispatch-recovery-replacement-readiness-controls="true"
                  role="group"
                >
                  {dispatchRecoveryReplacementOptions.map((option) => {
                    const isSelected = dispatchRecoveryReplacementStatus === option.value;

                    return (
                      <button
                        className={`min-h-9 rounded px-1.5 py-1 text-[10px] font-semibold transition sm:px-2 sm:text-[11px] ${
                          isSelected
                            ? "bg-sky-700 text-white"
                            : "bg-white text-sky-950 hover:bg-sky-100"
                        }`}
                        data-admin-dispatch-recovery-replacement-readiness-option={option.value}
                        data-admin-dispatch-recovery-replacement-readiness-option-state={
                          isSelected ? "selected" : "idle"
                        }
                        key={option.value}
                        onClick={() => setDispatchRecoveryReplacementStatus(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="mt-1 block min-w-0 text-xs font-semibold text-sky-950 sm:mt-3">
                <span>Local recovery note</span>
                <textarea
                  className="mt-1 min-h-10 w-full min-w-0 resize-y rounded-md border border-sky-200 bg-white px-2 py-1 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  data-admin-dispatch-recovery-replacement-readiness-note="true"
                  onChange={(event) => setDispatchRecoveryReplacementNote(event.target.value)}
                  placeholder="Local staff recovery note"
                  value={dispatchRecoveryReplacementNote}
                />
              </label>
              <div className="mt-2 grid grid-cols-1 gap-1 min-[300px]:grid-cols-2 sm:mt-3 md:grid-cols-3">
                {dispatchRecoveryReplacementItems.map((item) => (
                  <div
                    className={`min-h-12 min-w-0 rounded-md border px-1 py-1.5 text-[11px] sm:px-2 ${
                      item.state === "ready"
                        ? "border-emerald-200 bg-white text-emerald-950"
                        : item.key === "new-driver-job-link-readiness" ||
                            item.key === "next-recovery-action" ||
                            item.key === "local-recovery-note-status"
                          ? "border-sky-200 bg-white text-sky-950"
                          : "border-amber-200 bg-white text-amber-950"
                    }`}
                    data-admin-dispatch-recovery-replacement-readiness-item={item.key}
                    data-admin-dispatch-recovery-replacement-readiness-item-state={item.state}
                    key={item.key}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-1.5">
                      <p
                        className="font-semibold leading-4"
                        data-admin-dispatch-recovery-replacement-readiness-label={item.key}
                      >
                        {item.label}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          item.state === "ready"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.state === "ready" ? "Ready" : "Check"}
                      </span>
                    </div>
                    <p
                      className="mt-0.5 break-words leading-4"
                      data-admin-dispatch-recovery-replacement-readiness-detail={item.key}
                    >
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
              <p
                className="mt-1.5 border-t border-sky-200 pt-1.5 text-[11px] leading-4 text-sky-900 md:text-[10px] md:leading-3"
                data-admin-dispatch-recovery-replacement-readiness-boundary="true"
              >
                Local UI only. No Supabase write, live database access, notification sending, customer message,
                driver notification, billing, payment, PDF, payout, live location, or parser-learning behavior.
              </p>
            </section>

            <section
              aria-label="Post-Recovery Update Readiness"
              className="mt-3 rounded-md border border-teal-200 bg-teal-50/70 p-0.5 sm:p-2.5"
              data-admin-post-recovery-update-readiness="true"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-teal-950">
                      Post-Recovery Update Readiness
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ring-1 ${
                        postRecoveryUpdateReadyLocally
                          ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                          : postRecoveryNewDriverJobLinkReady || postRecoveryCustomerEtaUpdateReady
                            ? "bg-teal-100 text-teal-900 ring-teal-200"
                            : "bg-amber-100 text-amber-950 ring-amber-200"
                      }`}
                      data-admin-post-recovery-update-readiness-status="true"
                    >
                      {postRecoveryUpdateStatusLabel}
                    </span>
                  </div>
                  <p
                    className="mt-1 break-words text-xs font-semibold leading-5 text-teal-900"
                    data-admin-post-recovery-update-readiness-context="true"
                  >
                    {dispatchReleaseContextLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-teal-900">
                    Local customer and driver update bridge after recovery review.
                  </p>
                </div>
                <div
                  aria-label="Post-recovery update readiness status"
                  className="grid w-full grid-cols-2 gap-1 rounded-md border border-teal-200 bg-white p-1 min-[300px]:grid-cols-3 sm:w-64 sm:shrink-0 lg:w-72 xl:w-96"
                  data-admin-post-recovery-update-readiness-controls="true"
                  role="group"
                >
                  {postRecoveryUpdateOptions.map((option) => {
                    const isSelected = postRecoveryUpdateStatus === option.value;

                    return (
                      <button
                        className={`min-h-9 rounded px-1.5 py-1 text-[10px] font-semibold transition sm:px-2 sm:text-[11px] ${
                          isSelected
                            ? "bg-teal-700 text-white"
                            : "bg-white text-teal-950 hover:bg-teal-100"
                        }`}
                        data-admin-post-recovery-update-readiness-option={option.value}
                        data-admin-post-recovery-update-readiness-option-state={
                          isSelected ? "selected" : "idle"
                        }
                        key={option.value}
                        onClick={() => setPostRecoveryUpdateStatus(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="mt-1 block min-w-0 text-xs font-semibold text-teal-950 sm:mt-3">
                <span>Local update note</span>
                <textarea
                  className="mt-1 min-h-10 w-full min-w-0 resize-y rounded-md border border-teal-200 bg-white px-2 py-1 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  data-admin-post-recovery-update-readiness-note="true"
                  onChange={(event) => setPostRecoveryUpdateNote(event.target.value)}
                  placeholder="Local staff update note"
                  value={postRecoveryUpdateNote}
                />
              </label>
              <div className="mt-2 grid grid-cols-1 gap-1 min-[300px]:grid-cols-2 sm:mt-3 md:grid-cols-3">
                {postRecoveryUpdateItems.map((item) => (
                  <div
                    className={`min-h-12 min-w-0 rounded-md border px-1 py-1.5 text-[11px] sm:px-2 ${
                      item.state === "ready"
                        ? "border-emerald-200 bg-white text-emerald-950"
                        : item.key === "new-driver-job-link-readiness" ||
                            item.key === "customer-eta-update-status" ||
                            item.key === "next-dispatcher-action" ||
                            item.key === "local-update-note-status"
                          ? "border-teal-200 bg-white text-teal-950"
                          : "border-amber-200 bg-white text-amber-950"
                    }`}
                    data-admin-post-recovery-update-readiness-item={item.key}
                    data-admin-post-recovery-update-readiness-item-state={item.state}
                    key={item.key}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-1.5">
                      <p
                        className="font-semibold leading-4"
                        data-admin-post-recovery-update-readiness-label={item.key}
                      >
                        {item.label}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          item.state === "ready"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.state === "ready" ? "Ready" : "Check"}
                      </span>
                    </div>
                    <p
                      className="mt-0.5 break-words leading-4"
                      data-admin-post-recovery-update-readiness-detail={item.key}
                    >
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
              <p
                className="mt-1.5 border-t border-teal-200 pt-1.5 text-[11px] leading-4 text-teal-900 md:text-[10px] md:leading-3"
                data-admin-post-recovery-update-readiness-boundary="true"
              >
                Local UI only. No Supabase write, live database access, notification sending, customer message,
                driver notification, billing, payment, PDF, payout, live location, or parser-learning behavior.
              </p>
            </section>

            <section
              aria-label="Day-of-Trip Completion Handoff"
              className="mt-3 min-w-0 rounded-md border border-stone-200 bg-stone-50/80 p-0.5 sm:p-2.5"
              data-admin-day-of-trip-completion-handoff="true"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-sm font-semibold text-stone-950">
                      Day-of-Trip Completion Handoff
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ring-1 ${
                        dayOfTripCompletionHandoffReadyLocally
                          ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                          : dayOfTripCompletionCustomerCloseoutReady ||
                              dayOfTripCompletionExceptionResolutionReviewed
                            ? "bg-stone-200 text-stone-950 ring-stone-300"
                            : "bg-amber-100 text-amber-950 ring-amber-200"
                      }`}
                      data-admin-day-of-trip-completion-handoff-status="true"
                    >
                      {dayOfTripCompletionHandoffStatusLabel}
                    </span>
                  </div>
                  <p
                    className="mt-1 break-words text-xs font-semibold leading-5 text-stone-800"
                    data-admin-day-of-trip-completion-handoff-context="true"
                  >
                    {dispatchReleaseContextLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-stone-700">
                    Local closeout bridge after day-of-trip dispatch and recovery review.
                  </p>
                </div>
                <div
                  aria-label="Day-of-trip completion handoff status"
                  className="grid w-full min-w-0 grid-cols-2 gap-1 rounded-md border border-stone-200 bg-white p-1 sm:w-64 sm:shrink-0 sm:grid-cols-3 lg:w-72 xl:w-96"
                  data-admin-day-of-trip-completion-handoff-controls="true"
                  role="group"
                >
                  {dayOfTripCompletionHandoffOptions.map((option) => {
                    const isSelected = dayOfTripCompletionHandoffStatus === option.value;

                    return (
                      <button
                        className={`min-h-9 min-w-0 break-words rounded px-1.5 py-1 text-[10px] font-semibold leading-3 transition sm:px-2 sm:text-[11px] ${
                          isSelected
                            ? "bg-stone-800 text-white"
                            : "bg-white text-stone-950 hover:bg-stone-100"
                        }`}
                        data-admin-day-of-trip-completion-handoff-option={option.value}
                        data-admin-day-of-trip-completion-handoff-option-state={
                          isSelected ? "selected" : "idle"
                        }
                        key={option.value}
                        onClick={() => setDayOfTripCompletionHandoffStatus(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="mt-1 block min-w-0 text-xs font-semibold text-stone-950 sm:mt-3">
                <span>Local completion note</span>
                <textarea
                  className="mt-1 min-h-10 w-full min-w-0 resize-y rounded-md border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-stone-500 focus:ring-2 focus:ring-stone-100"
                  data-admin-day-of-trip-completion-handoff-note="true"
                  onChange={(event) => setDayOfTripCompletionHandoffNote(event.target.value)}
                  placeholder="Local staff completion note"
                  value={dayOfTripCompletionHandoffNote}
                />
              </label>
              <div className="mt-2 grid grid-cols-1 gap-1 min-[300px]:grid-cols-2 sm:mt-3 md:grid-cols-3">
                {dayOfTripCompletionHandoffItems.map((item) => (
                  <div
                    className={`min-h-12 min-w-0 rounded-md border px-1 py-1.5 text-[11px] sm:px-2 ${
                      item.state === "ready"
                        ? "border-emerald-200 bg-white text-emerald-950"
                        : item.key === "next-admin-closeout-action" ||
                            item.key === "local-completion-note-status"
                          ? "border-stone-200 bg-white text-stone-950"
                          : "border-amber-200 bg-white text-amber-950"
                    }`}
                    data-admin-day-of-trip-completion-handoff-item={item.key}
                    data-admin-day-of-trip-completion-handoff-item-state={item.state}
                    key={item.key}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-1.5">
                      <p
                        className="min-w-0 break-words font-semibold leading-4"
                        data-admin-day-of-trip-completion-handoff-label={item.key}
                      >
                        {item.label}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          item.state === "ready"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.state === "ready" ? "Ready" : "Check"}
                      </span>
                    </div>
                    <p
                      className="mt-0.5 break-words leading-4"
                      data-admin-day-of-trip-completion-handoff-detail={item.key}
                    >
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
              <p
                className="mt-1.5 border-t border-stone-200 pt-1.5 text-[11px] leading-4 text-stone-700 md:text-[10px] md:leading-3"
                data-admin-day-of-trip-completion-handoff-boundary="true"
              >
                Local UI only. No Supabase write, live database access, notification sending, customer message,
                driver notification, billing, payment, PDF, payout, live location, or parser-learning behavior.
              </p>
            </section>

            <section
              aria-label="Completed Trip Closeout Review"
              className="mt-3 min-w-0 rounded-md border border-zinc-200 bg-zinc-50/80 p-0.5 sm:p-2.5"
              data-admin-completed-trip-closeout-review="true"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-sm font-semibold text-zinc-950">
                      Completed Trip Closeout Review
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ring-1 ${
                        completedTripCloseoutReviewReadyLocally
                          ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                          : completedTripCloseoutBillingReadinessNoteReviewed ||
                              completedTripCloseoutExceptionResolutionReviewed
                            ? "bg-zinc-200 text-zinc-950 ring-zinc-300"
                            : "bg-amber-100 text-amber-950 ring-amber-200"
                      }`}
                      data-admin-completed-trip-closeout-review-status="true"
                    >
                      {completedTripCloseoutReviewStatusLabel}
                    </span>
                  </div>
                  <p
                    className="mt-1 break-words text-xs font-semibold leading-5 text-zinc-800"
                    data-admin-completed-trip-closeout-review-context="true"
                  >
                    {dispatchReleaseContextLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-zinc-700">
                    Local closeout review after completion handoff.
                  </p>
                </div>
                <div
                  aria-label="Completed trip closeout review status"
                  className="grid w-full min-w-0 grid-cols-2 gap-1 rounded-md border border-zinc-200 bg-white p-1 sm:w-64 sm:shrink-0 sm:grid-cols-3 lg:w-72 xl:w-96"
                  data-admin-completed-trip-closeout-review-controls="true"
                  role="group"
                >
                  {completedTripCloseoutReviewOptions.map((option) => {
                    const isSelected = completedTripCloseoutReviewStatus === option.value;

                    return (
                      <button
                        className={`min-h-9 min-w-0 break-words rounded px-1.5 py-1 text-[10px] font-semibold leading-3 transition sm:px-2 sm:text-[11px] ${
                          isSelected
                            ? "bg-zinc-800 text-white"
                            : "bg-white text-zinc-950 hover:bg-zinc-100"
                        }`}
                        data-admin-completed-trip-closeout-review-option={option.value}
                        data-admin-completed-trip-closeout-review-option-state={
                          isSelected ? "selected" : "idle"
                        }
                        key={option.value}
                        onClick={() => setCompletedTripCloseoutReviewStatus(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="mt-1 block min-w-0 text-xs font-semibold text-zinc-950 sm:mt-3">
                <span>Local closeout note</span>
                <textarea
                  className="mt-1 min-h-10 w-full min-w-0 resize-y rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100"
                  data-admin-completed-trip-closeout-review-note="true"
                  onChange={(event) => setCompletedTripCloseoutReviewNote(event.target.value)}
                  placeholder="Local staff closeout note"
                  value={completedTripCloseoutReviewNote}
                />
              </label>
              <div className="mt-2 grid grid-cols-1 gap-1 min-[300px]:grid-cols-2 sm:mt-3 md:grid-cols-3">
                {completedTripCloseoutReviewItems.map((item) => (
                  <div
                    className={`min-h-12 min-w-0 rounded-md border px-1 py-1.5 text-[11px] sm:px-2 ${
                      item.state === "ready"
                        ? "border-emerald-200 bg-white text-emerald-950"
                        : item.key === "billing-readiness-note-reviewed" ||
                            item.key === "next-admin-closeout-action" ||
                            item.key === "local-closeout-note-status"
                          ? "border-zinc-200 bg-white text-zinc-950"
                          : "border-amber-200 bg-white text-amber-950"
                    }`}
                    data-admin-completed-trip-closeout-review-item={item.key}
                    data-admin-completed-trip-closeout-review-item-state={item.state}
                    key={item.key}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-1.5">
                      <p
                        className="min-w-0 break-words font-semibold leading-4"
                        data-admin-completed-trip-closeout-review-label={item.key}
                      >
                        {item.label}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          item.state === "ready"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.state === "ready" ? "Ready" : "Check"}
                      </span>
                    </div>
                    <p
                      className="mt-0.5 break-words leading-4"
                      data-admin-completed-trip-closeout-review-detail={item.key}
                    >
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
              <p
                className="mt-1.5 border-t border-zinc-200 pt-1.5 text-[11px] leading-4 text-zinc-700 md:text-[10px] md:leading-3"
                data-admin-completed-trip-closeout-review-boundary="true"
              >
                Local UI only. No Supabase write, live database access, invoice, PDF, payment, payout,
                notification sending, customer message, driver notification, live location, or parser-learning behavior.
              </p>
            </section>

            <section
              aria-label="Closeout to Billing Preparation Review"
              className="mt-3 min-w-0 rounded-md border border-cyan-200 bg-cyan-50/70 p-0.5 sm:p-2.5"
              data-admin-closeout-to-billing-preparation-review="true"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-sm font-semibold text-cyan-950">
                      Closeout to Billing Preparation Review
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ring-1 ${
                        closeoutToBillingPreparationReviewReadyLocally
                          ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                          : closeoutToBillingExtraChargesReviewed || closeoutToBillingNoteReviewed
                            ? "bg-cyan-100 text-cyan-950 ring-cyan-200"
                            : "bg-amber-100 text-amber-950 ring-amber-200"
                      }`}
                      data-admin-closeout-to-billing-preparation-review-status="true"
                    >
                      {closeoutToBillingPreparationReviewStatusLabel}
                    </span>
                  </div>
                  <p
                    className="mt-1 break-words text-xs font-semibold leading-5 text-cyan-900"
                    data-admin-closeout-to-billing-preparation-review-context="true"
                  >
                    {dispatchReleaseContextLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-cyan-900">
                    Local bridge from completed trip closeout to future billing preparation.
                  </p>
                </div>
                <div
                  aria-label="Closeout to billing preparation review status"
                  className="grid w-full min-w-0 grid-cols-2 gap-1 rounded-md border border-cyan-200 bg-white p-1 sm:w-64 sm:shrink-0 sm:grid-cols-3 lg:w-72 xl:w-96"
                  data-admin-closeout-to-billing-preparation-review-controls="true"
                  role="group"
                >
                  {closeoutToBillingPreparationReviewOptions.map((option) => {
                    const isSelected = closeoutToBillingPreparationReviewStatus === option.value;

                    return (
                      <button
                        className={`min-h-9 min-w-0 break-words rounded px-1.5 py-1 text-[10px] font-semibold leading-3 transition sm:px-2 sm:text-[11px] ${
                          isSelected
                            ? "bg-cyan-800 text-white"
                            : "bg-white text-cyan-950 hover:bg-cyan-100"
                        }`}
                        data-admin-closeout-to-billing-preparation-review-option={option.value}
                        data-admin-closeout-to-billing-preparation-review-option-state={
                          isSelected ? "selected" : "idle"
                        }
                        key={option.value}
                        onClick={() => setCloseoutToBillingPreparationReviewStatus(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="mt-1 block min-w-0 text-xs font-semibold text-cyan-950 sm:mt-3">
                <span>Local billing-prep note</span>
                <textarea
                  className="mt-1 min-h-10 w-full min-w-0 resize-y rounded-md border border-cyan-200 bg-white px-2 py-1 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  data-admin-closeout-to-billing-preparation-review-note="true"
                  onChange={(event) => setCloseoutToBillingPreparationReviewNote(event.target.value)}
                  placeholder="Local staff billing-prep note"
                  value={closeoutToBillingPreparationReviewNote}
                />
              </label>
              <div className="mt-2 grid grid-cols-1 gap-1 min-[300px]:grid-cols-2 sm:mt-3 md:grid-cols-3">
                {closeoutToBillingPreparationReviewItems.map((item) => (
                  <div
                    className={`min-h-12 min-w-0 rounded-md border px-1 py-1.5 text-[11px] sm:px-2 ${
                      item.state === "ready"
                        ? "border-emerald-200 bg-white text-emerald-950"
                        : item.key === "extra-charges-review-needed" ||
                            item.key === "billing-note-reviewed" ||
                            item.key === "next-billing-preparation-action" ||
                            item.key === "local-billing-prep-note-status"
                          ? "border-cyan-200 bg-white text-cyan-950"
                          : "border-amber-200 bg-white text-amber-950"
                    }`}
                    data-admin-closeout-to-billing-preparation-review-item={item.key}
                    data-admin-closeout-to-billing-preparation-review-item-state={item.state}
                    key={item.key}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-1.5">
                      <p
                        className="min-w-0 break-words font-semibold leading-4"
                        data-admin-closeout-to-billing-preparation-review-label={item.key}
                      >
                        {item.label}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          item.state === "ready"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.state === "ready" ? "Ready" : "Check"}
                      </span>
                    </div>
                    <p
                      className="mt-0.5 break-words leading-4"
                      data-admin-closeout-to-billing-preparation-review-detail={item.key}
                    >
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
              <p
                className="mt-1.5 border-t border-cyan-200 pt-1.5 text-[11px] leading-4 text-cyan-900 md:text-[10px] md:leading-3"
                data-admin-closeout-to-billing-preparation-review-boundary="true"
              >
                Local UI only. No Supabase write, live database access, billing activation, invoice, PDF,
                payment, payout, notification sending, customer message, driver notification, live location, or
                parser-learning behavior.
              </p>
            </section>

            <section
              aria-label="Billing Preparation Exception Review"
              className="mt-3 min-w-0 rounded-md border border-rose-200 bg-rose-50/70 p-0.5 sm:p-2.5"
              data-admin-billing-preparation-exception-review="true"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-sm font-semibold text-rose-950">
                      Billing Preparation Exception Review
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ring-1 ${
                        billingPreparationExceptionReviewClearedLocally
                          ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
                          : billingPreparationDisputedOrWaivedCharges ||
                              billingPreparationBillingNoteActionRequired
                            ? "bg-rose-100 text-rose-950 ring-rose-200"
                            : "bg-amber-100 text-amber-950 ring-amber-200"
                      }`}
                      data-admin-billing-preparation-exception-review-status="true"
                    >
                      {billingPreparationExceptionReviewStatusLabel}
                    </span>
                  </div>
                  <p
                    className="mt-1 break-words text-xs font-semibold leading-5 text-rose-900"
                    data-admin-billing-preparation-exception-review-context="true"
                  >
                    {dispatchReleaseContextLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-4 text-rose-900">
                    Local exception check before any future billing preparation work.
                  </p>
                </div>
                <div
                  aria-label="Billing preparation exception review status"
                  className="grid w-full min-w-0 grid-cols-2 gap-1 rounded-md border border-rose-200 bg-white p-1 sm:w-64 sm:shrink-0 sm:grid-cols-3 lg:w-72 xl:w-96"
                  data-admin-billing-preparation-exception-review-controls="true"
                  role="group"
                >
                  {billingPreparationExceptionReviewOptions.map((option) => {
                    const isSelected = billingPreparationExceptionReviewStatus === option.value;

                    return (
                      <button
                        className={`min-h-9 min-w-0 break-words rounded px-1.5 py-1 text-[10px] font-semibold leading-3 transition sm:px-2 sm:text-[11px] ${
                          isSelected
                            ? "bg-rose-800 text-white"
                            : "bg-white text-rose-950 hover:bg-rose-100"
                        }`}
                        data-admin-billing-preparation-exception-review-option={option.value}
                        data-admin-billing-preparation-exception-review-option-state={
                          isSelected ? "selected" : "idle"
                        }
                        key={option.value}
                        onClick={() => setBillingPreparationExceptionReviewStatus(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="mt-1 block min-w-0 text-xs font-semibold text-rose-950 sm:mt-3">
                <span>Local exception note</span>
                <textarea
                  className="mt-1 min-h-10 w-full min-w-0 resize-y rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                  data-admin-billing-preparation-exception-review-note="true"
                  onChange={(event) => setBillingPreparationExceptionReviewNote(event.target.value)}
                  placeholder="Local staff exception note"
                  value={billingPreparationExceptionReviewNote}
                />
              </label>
              <div className="mt-2 grid grid-cols-1 gap-1 min-[300px]:grid-cols-2 sm:mt-3 md:grid-cols-3">
                {billingPreparationExceptionReviewItems.map((item) => (
                  <div
                    className={`min-h-12 min-w-0 rounded-md border px-1 py-1.5 text-[11px] sm:px-2 ${
                      item.state === "ready"
                        ? "border-emerald-200 bg-white text-emerald-950"
                        : item.key === "disputed-waived-charges" ||
                            item.key === "billing-note-action-required" ||
                            item.key === "next-billing-prep-action" ||
                            item.key === "local-exception-note-status"
                          ? "border-rose-200 bg-white text-rose-950"
                          : "border-amber-200 bg-white text-amber-950"
                    }`}
                    data-admin-billing-preparation-exception-review-item={item.key}
                    data-admin-billing-preparation-exception-review-item-state={item.state}
                    key={item.key}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-1.5">
                      <p
                        className="min-w-0 break-words font-semibold leading-4"
                        data-admin-billing-preparation-exception-review-label={item.key}
                      >
                        {item.label}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                          item.state === "ready"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.state === "ready" ? "Ready" : "Check"}
                      </span>
                    </div>
                    <p
                      className="mt-0.5 break-words leading-4"
                      data-admin-billing-preparation-exception-review-detail={item.key}
                    >
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
              <p
                className="mt-1.5 border-t border-rose-200 pt-1.5 text-[11px] leading-4 text-rose-900 md:text-[10px] md:leading-3"
                data-admin-billing-preparation-exception-review-boundary="true"
              >
                Local UI only. No Supabase write, live database access, billing activation, invoice, PDF,
                payment, payout, notification sending, customer message, driver notification, live location, or
                parser-learning behavior.
              </p>
            </section>
          </div>

          <aside className="flex min-w-0 flex-col gap-5">
            <div className="min-w-0 rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Job Card Preview</h2>
                  <p className="text-sm text-slate-500">WhatsApp-ready driver message.</p>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {parsedDebugBooking ? (
                      <button
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        onClick={() => setShowParserDebug((current) => !current)}
                        type="button"
                      >
                        {showParserDebug ? "Hide parser debug" : "Show parser debug"}
                      </button>
                    ) : null}
                    {jobCardCopyEditState.isEditing ? (
                      <>
                        <button
                          className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-50"
                          data-copy-save-edit="jobCard"
                          onClick={() => saveCopyEdit("jobCard")}
                          type="button"
                        >
                          Save Edit
                        </button>
                        <button
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          data-copy-cancel-edit="jobCard"
                          onClick={() => cancelCopyEdit("jobCard")}
                          type="button"
                        >
                          Cancel Edit
                        </button>
                      </>
                    ) : (
                      <button
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        data-copy-edit-button="jobCard"
                        onClick={() => startCopyEdit("jobCard")}
                        type="button"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      data-copy-copy-button="jobCard"
                      onClick={copyJobCard}
                      type="button"
                    >
                      Copy
                    </button>
                  </div>
                  {copyFeedback?.target === "jobCard" ? (
                    <div
                      className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClass(copyFeedback.tone)}`}
                      data-copy-feedback="job-card"
                    >
                      {copyFeedback.text}
                    </div>
                  ) : null}
                </div>
              </div>
              <div
                className="mb-3 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-950"
                data-manual-extra-charges-review-preview="true"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                    Manual Extra Charges Review
                  </p>
                  <span className="rounded-full border border-amber-200 bg-white/70 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-800">
                    Manual staff entry only
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-amber-100 bg-white/65 px-2.5 py-2">
                    <p className="text-[11px] font-semibold uppercase text-amber-800">Manual Extra Charges</p>
                    <p className="mt-1 font-semibold text-slate-950" data-manual-extra-charges-review-amount="true">
                      {manualExtraChargesAmountPreview}
                    </p>
                  </div>
                  <div className="rounded-md border border-amber-100 bg-white/65 px-2.5 py-2">
                    <p className="text-[11px] font-semibold uppercase text-amber-800">Manual Extra Charges note</p>
                    <p className="mt-1 break-words text-slate-950" data-manual-extra-charges-review-note="true">
                      {manualExtraChargesNotePreview}
                    </p>
                  </div>
                </div>
                <p
                  className="mt-2 border-t border-amber-200 pt-2 text-xs leading-5 text-amber-900"
                  data-manual-extra-charges-review-boundary="true"
                >
                  Manual staff entry only. Not billed, not saved, no total calculated. No invoice,
                  statement, payment, PDF, payout, accounting, finance export, storage, API, Supabase,
                  or notification behavior.
                </p>
              </div>
              {jobCardCopyEditState.isEditing ? (
                <textarea
                  aria-label="Edit Job Card Copy"
                  className="min-h-52 w-full rounded-lg border border-slate-300 bg-white p-4 text-sm leading-6 text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  data-copy-edit-textarea="jobCard"
                  onChange={(event) => updateCopyEditDraft("jobCard", event.target.value)}
                  value={jobCardCopyEditState.draftText}
                />
              ) : (
                <pre
                  className="whitespace-pre-wrap break-words rounded-lg bg-[#dcf8c6] p-4 text-sm leading-6 text-slate-900 shadow-sm"
                  data-copy-preview="jobCard"
                >
                  {jobCardCopyText}
                </pre>
              )}
            </div>

            <div className="min-w-0 rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Customer Copy</h2>
                  <p className="text-sm text-slate-500">Customer-facing booking and driver details.</p>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {customerCopyEditState.isEditing ? (
                      <>
                        <button
                          className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-50"
                          data-copy-save-edit="customerCopy"
                          onClick={() => saveCopyEdit("customerCopy")}
                          type="button"
                        >
                          Save Edit
                        </button>
                        <button
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          data-copy-cancel-edit="customerCopy"
                          onClick={() => cancelCopyEdit("customerCopy")}
                          type="button"
                        >
                          Cancel Edit
                        </button>
                      </>
                    ) : (
                      <button
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        data-copy-edit-button="customerCopy"
                        onClick={() => startCopyEdit("customerCopy")}
                        type="button"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-50"
                      data-copy-copy-button="customerCopy"
                      onClick={copyCustomerCopy}
                      type="button"
                    >
                      Copy
                    </button>
                  </div>
                  {copyFeedback?.target === "customerCopy" ? (
                    <div
                      className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClass(copyFeedback.tone)}`}
                      data-copy-feedback="customer-copy"
                    >
                      {copyFeedback.text}
                    </div>
                  ) : null}
                </div>
              </div>
              <div
                className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                data-customer-live-location-helper="true"
              >
                {customerLiveLocation.helperText}
              </div>
              {customerCopyEditState.isEditing ? (
                <textarea
                  aria-label="Edit Customer Copy"
                  className="min-h-52 w-full rounded-lg border border-emerald-300 bg-white p-4 text-sm leading-6 text-slate-900 shadow-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
                  data-copy-edit-textarea="customerCopy"
                  onChange={(event) => updateCopyEditDraft("customerCopy", event.target.value)}
                  value={customerCopyEditState.draftText}
                />
              ) : (
                <pre
                  className="whitespace-pre-wrap break-words rounded-lg bg-emerald-50 p-4 text-sm leading-6 text-slate-900 shadow-sm"
                  data-copy-preview="customerCopy"
                >
                  {customerCopyText}
                </pre>
              )}
            </div>

            <div className="min-w-0 rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Driver Dispatch</h2>
                  <p className="text-sm text-slate-500">Internal WhatsApp copy for assigned driver.</p>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {driverDispatchCopyEditState.isEditing ? (
                      <>
                        <button
                          className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-50"
                          data-copy-save-edit="driverDispatch"
                          onClick={() => saveCopyEdit("driverDispatch")}
                          type="button"
                        >
                          Save Edit
                        </button>
                        <button
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          data-copy-cancel-edit="driverDispatch"
                          onClick={() => cancelCopyEdit("driverDispatch")}
                          type="button"
                        >
                          Cancel Edit
                        </button>
                      </>
                    ) : (
                      <button
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        data-copy-edit-button="driverDispatch"
                        onClick={() => startCopyEdit("driverDispatch")}
                        type="button"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      className="rounded-md border border-sky-300 px-3 py-2 text-sm font-medium text-sky-900 transition hover:bg-sky-50"
                      data-copy-copy-button="driverDispatch"
                      onClick={copyDraftDriverDispatch}
                      type="button"
                    >
                      Copy
                    </button>
                  </div>
                  {copyFeedback?.target === "driverDispatch" ? (
                    <div
                      className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClass(copyFeedback.tone)}`}
                      data-copy-feedback="driver-dispatch"
                    >
                      {copyFeedback.text}
                    </div>
                  ) : null}
                </div>
              </div>
              {driverDispatchCopyEditState.isEditing ? (
                <textarea
                  aria-label="Edit Driver Dispatch"
                  className="min-h-52 w-full rounded-lg border border-sky-300 bg-white p-4 text-sm leading-6 text-slate-900 shadow-sm outline-none transition focus:border-sky-700 focus:ring-2 focus:ring-sky-700/10"
                  data-copy-edit-textarea="driverDispatch"
                  onChange={(event) => updateCopyEditDraft("driverDispatch", event.target.value)}
                  value={driverDispatchCopyEditState.draftText}
                />
              ) : (
                <pre
                  className="whitespace-pre-wrap break-words rounded-lg bg-sky-50 p-4 text-sm leading-6 text-slate-900 shadow-sm"
                  data-copy-preview="driverDispatch"
                >
                  {driverDispatchCopyText}
                </pre>
              )}
            </div>

            {showDriverJobLinkCopy ? (
              <div className="min-w-0 rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Driver Job Link</h2>
                    <p className="text-sm text-slate-500">Temporary driver link message for status updates.</p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <button
                      className="rounded-md border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-900 transition hover:bg-indigo-50"
                      data-copy-driver-job-link-button="true"
                      onClick={copyDriverJobLink}
                      type="button"
                    >
                      Copy Driver Job Link
                    </button>
                    {driverJobLinkCopyMessage ? (
                      <div
                        className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClass(
                          driverJobLinkCopyMessage.tone,
                        )}`}
                        data-copy-feedback="driver-job-link"
                      >
                        {driverJobLinkCopyMessage.text}
                      </div>
                    ) : null}
                  </div>
                </div>
                <pre
                  className="whitespace-pre-wrap break-words rounded-lg bg-indigo-50 p-4 text-sm leading-6 text-slate-900 shadow-sm"
                  data-copy-preview="driverJobLink"
                >
                  {driverJobLinkMessage}
                </pre>
              </div>
            ) : null}

            {statusPanel}
          </aside>
        </section>
        ) : null}

        {activeTab === "bookings" ? (
        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Bookings</h2>
              <p className="text-sm text-slate-500">Load saved bookings and reopen them in Dispatch.</p>
            </div>
            <button
              className="h-12 rounded-md border border-slate-300 bg-white px-5 text-base font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              disabled={loading}
              onClick={() => loadBookings()}
              type="button"
            >
              {loading ? "Loading..." : "Load Bookings"}
            </button>
          </div>
          {statusPanel}
          {recentBookingsPanel}
        </section>
        ) : null}

        {activeTab === "completed" ? (
        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Completed</h2>
            <p className="text-sm text-slate-500">
              Review completed bookings and undo completion when needed.
            </p>
          </div>
          {statusPanel}
          {completedBookingsPanel}
        </section>
        ) : null}

        {activeTab === "drivers" ? (
	        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
	          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
	            <div>
	              <h2 className="text-xl font-semibold">Driver Database</h2>
	              <p className="text-sm text-slate-500">Save or update reusable driver details here.</p>
	            </div>
	            <div className="flex flex-col gap-2 sm:flex-row">
	              <button
	                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
	                disabled={loadingDrivers}
	                onClick={() => loadDrivers()}
	                type="button"
	              >
	                {loadingDrivers ? "Loading Driver Database..." : "Load Driver Database"}
	              </button>
		              <button
		                className="h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
		                disabled={savingDriverProfile}
		                onClick={saveDriverProfile}
		                type="button"
		              >
		                {savingDriverProfile ? "Saving..." : "Save Driver Profile"}
		              </button>
                  {driverProfileDraft.driverId ? (
                    <button
                      className="h-10 rounded-md border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-800 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      data-driver-deactivate-button="true"
                      disabled={savingDriverProfile || deactivatingDriverProfile}
                      onClick={deactivateDriverProfile}
                      type="button"
                    >
                      {deactivatingDriverProfile ? "Deactivating..." : "Deactivate driver"}
                    </button>
                  ) : null}
		            </div>
		          </div>
            {statusPanel}

	          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
	            <div className="grid gap-3 sm:grid-cols-2">
	              <label>
	                <span className="mb-1 block text-sm font-medium text-slate-700">Driver name</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, driverName: event.target.value }))
	                  }
	                  value={driverProfileDraft.driverName}
	                />
	              </label>
	              <label>
	                <span className="mb-1 block text-sm font-medium text-slate-700">Contact number</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, contactNumber: event.target.value }))
	                  }
	                  value={driverProfileDraft.contactNumber}
	                />
	              </label>
	              <label>
	                <span className="mb-1 block text-sm font-medium text-slate-700">Vehicle type</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, vehicleType: event.target.value }))
	                  }
	                  value={driverProfileDraft.vehicleType}
	                />
	              </label>
	              <label>
	                <span className="mb-1 block text-sm font-medium text-slate-700">Plate number</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, plateNumber: event.target.value }))
	                  }
	                  value={driverProfileDraft.plateNumber}
	                />
	              </label>
	              <label>
	                <span className="mb-1 block text-sm font-medium text-slate-700">Availability</span>
	                <select
	                  className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, availabilityStatus: event.target.value }))
	                  }
	                  value={driverProfileDraft.availabilityStatus}
	                >
		                  <option value="available">Available</option>
		                  <option value="busy">Busy</option>
		                  <option value="off">Off</option>
		                  <option value="inactive">Inactive</option>
		                </select>
		              </label>
	              <label>
	                <span className="mb-1 block text-sm font-medium text-slate-700">Preferred areas</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, preferredAreas: event.target.value }))
	                  }
	                  value={driverProfileDraft.preferredAreas}
	                />
	              </label>
	              <label className="sm:col-span-2">
	                <span className="mb-1 block text-sm font-medium text-slate-700">Payout preferences</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, payoutPreferences: event.target.value }))
	                  }
	                  value={driverProfileDraft.payoutPreferences}
	                />
	              </label>
	              <label className="sm:col-span-2">
	                <span className="mb-1 block text-sm font-medium text-slate-700">Airport permit notes</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, airportPermitNotes: event.target.value }))
	                  }
	                  value={driverProfileDraft.airportPermitNotes}
	                />
	              </label>
	              <label className="sm:col-span-2">
	                <span className="mb-1 block text-sm font-medium text-slate-700">Driver notes</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, notes: event.target.value }))
	                  }
	                  value={driverProfileDraft.notes}
	                />
	              </label>
	              {rateBookingTypes.map((bookingType) => {
	                const payoutRule = driverProfileDraft.payoutRules[bookingType];
	                const payoutValue = payoutRule?.amount ?? payoutRule?.max ?? payoutRule?.min ?? "";

	                return (
	                  <label key={`driver-profile-${bookingType}`}>
	                    <span className="mb-1 block text-sm font-medium text-slate-700">
	                      {bookingType} payout
	                    </span>
	                    <input
	                      className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                      min={0}
	                      onChange={(event) => updateDriverProfilePayout(bookingType, event.target.value)}
	                      type="number"
	                      value={payoutValue}
	                    />
	                  </label>
	                );
	              })}
	            </div>

		            <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
		              <div className="flex flex-col gap-3">
		                <div>
		                  <h3 className="text-base font-semibold">Driver Database</h3>
		                  <p className="text-xs text-slate-500" data-driver-search-count="true">
		                    Showing {filteredDrivers.length} of {drivers.length} drivers.
		                  </p>
		                </div>
		                <label>
		                  <span className="mb-1 block text-sm font-medium text-slate-700">
		                    Search drivers
		                  </span>
		                  <input
		                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
		                    data-driver-search-input="true"
		                    onChange={(event) => setDriverSearchTerm(event.target.value)}
		                    placeholder="Name, phone, plate, vehicle, status, area, notes"
		                    value={driverSearchTerm}
		                  />
		                </label>
		                {drivers.length > 0 && !driverDatabaseSearchQuery ? (
		                  <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900" data-driver-search-helper="true">
		                    Search driver name, phone, plate, or vehicle to show drivers.
		                  </p>
		                ) : null}
		                {drivers.length > 0 && driverDatabaseSearchQuery && filteredDrivers.length === 0 ? (
		                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-driver-search-empty="true">
		                    No matching drivers found.
		                  </p>
		                ) : null}
		              </div>
		              <div
		                className="mt-3 max-h-80 space-y-1.5 overflow-y-auto overscroll-contain rounded-md border border-stone-200 bg-white/70 p-1 pr-2"
		                data-driver-list-scroll="true"
		              >
		                {driverDeleteMessage &&
		                !drivers.some((driver) => String(driver.id) === driverDeleteMessage.driverId) ? (
		                  <p
		                    className={`rounded-md border px-3 py-2 text-xs ${statusClass(driverDeleteMessage.tone)}`}
		                    data-driver-delete-feedback-card={driverDeleteMessage.driverId}
		                  >
		                    {driverDeleteMessage.text}
		                  </p>
		                ) : null}
		                {drivers.length === 0 ? (
		                  <p className="text-sm text-slate-500">No drivers loaded.</p>
		                ) : !driverDatabaseSearchQuery ? (
		                  <p className="text-sm text-slate-500">Search to show drivers.</p>
		                ) : (
		                  filteredDrivers.map((driver) => {
		                    const assignedJobCount = operationalBookings.filter(
		                      (bookingRecord) =>
		                        bookingRecord.driver_id === driver.id ||
		                        clean(bookingRecord.driver_name).toLowerCase() === clean(driver.driver_name).toLowerCase(),
		                    ).length;
		                    const driverId = String(driver.id);
		                    const rowDeleteMessage =
		                      driverDeleteMessage?.driverId === driverId &&
		                      drivers.some((candidate) => String(candidate.id) === driverId)
		                        ? driverDeleteMessage
		                        : null;
		                    const driverAvailability = clean(driver.availability_status) || "available";
		                    const vehicleAvailability = [
		                      clean(driver.vehicle_type) || "Vehicle —",
		                      driverAvailability,
		                    ].join(" / ");

		                    return (
		                      <div
		                        className="overflow-hidden rounded-md border border-stone-200 bg-white text-sm"
		                        data-driver-profile-row={driver.id}
		                        key={driver.id}
		                      >
		                        <button
		                          className="w-full px-3 py-2 text-left transition hover:bg-stone-50"
		                          data-driver-profile-select={driver.id}
		                          onClick={() => loadDriverProfileDraft(driver)}
		                          type="button"
		                        >
		                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
		                            <div className="min-w-0">
		                              <p className="flex min-w-0 flex-wrap items-center gap-2 font-semibold">
		                                <span className="truncate">{driver.driver_name}</span>
		                                {isInactiveDriver(driver) ? (
		                                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
		                                    Inactive
		                                  </span>
		                                ) : null}
		                              </p>
		                              <p className="text-xs text-slate-600">{vehicleAvailability}</p>
		                            </div>
		                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
		                              <span>Plate: {clean(driver.plate_number) || "—"}</span>
		                              <span>Assigned jobs: {assignedJobCount}</span>
		                            </div>
		                          </div>
		                        </button>
		                        <div className="flex justify-end border-t border-stone-100 px-3 py-2">
		                          <button
		                            className="h-9 rounded-md border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-800 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
		                            data-driver-delete-button={driver.id}
		                            disabled={deletingDriverId === driverId}
		                            onClick={() => deleteDriverProfile(driver, assignedJobCount)}
		                            type="button"
		                          >
		                            {deletingDriverId === driverId ? "Deleting..." : "Delete"}
		                          </button>
		                        </div>
		                        {rowDeleteMessage ? (
		                          <p
		                            className={`border-t px-3 py-2 text-xs ${statusClass(rowDeleteMessage.tone)}`}
		                            data-driver-delete-message={driver.id}
		                          >
		                            {rowDeleteMessage.text}
		                          </p>
		                        ) : null}
		                      </div>
		                    );
		                  })
		                )}
		              </div>
		            </div>
	          </div>
	        </section>
        ) : null}

        {activeTab === "rates" ? (
	        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Rates</h2>
              <p className="text-sm text-slate-500">Internal customer pricing, driver payouts, and overrides.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={savingRates}
                onClick={() => loadRates()}
                type="button"
              >
                {rateAction === "load" ? "Loading Rates..." : "Load Rates"}
              </button>
              <button
                className="h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={savingRates}
                onClick={saveDefaultRates}
                type="button"
              >
                {rateAction === "defaults" ? "Saving Defaults..." : "Save Defaults"}
              </button>
            </div>
          </div>
          {rateMessageTarget === "override" ? null : statusPanel}

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="text-base font-semibold">Default Prestige Rates</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {rateBookingTypes.map((bookingType) => (
                  <label key={`customer-${bookingType}`}>
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      {rateLabels[bookingType]}
                    </span>
                    <input
                      className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      min={0}
                      onChange={(event) => updateDefaultCustomerRate(bookingType, event.target.value)}
                      type="number"
                      value={rateSettings.customerRates[bookingType]}
                    />
                  </label>
                ))}
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Midnight surcharge</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) =>
                      setRateSettings((current) => ({
                        ...current,
                        midnightSurcharge: numericRate(event.target.value),
                      }))
                    }
                    type="number"
                    value={rateSettings.midnightSurcharge}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Extra stop surcharge</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) =>
                      setRateSettings((current) => ({
                        ...current,
                        extraStopSurcharge: numericRate(event.target.value),
                      }))
                    }
                    type="number"
                    value={rateSettings.extraStopSurcharge}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Child seat surcharge</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) =>
                      setRateSettings((current) => ({
                        ...current,
                        childSeatCustomerSurcharge: numericRate(event.target.value),
                      }))
                    }
                    type="number"
                    value={rateSettings.childSeatCustomerSurcharge}
                  />
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold">Default Driver Payout</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {rateBookingTypes.map((bookingType) => {
                  const payoutRule = rateSettings.driverPayoutRules[bookingType];
                  const payoutValue = payoutRule.amount ?? payoutRule.max ?? payoutRule.min ?? 0;

                  return (
                    <label key={`driver-${bookingType}`}>
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        {bookingType === "DSP" ? "DSP hourly" : bookingType}
                      </span>
                      <input
                        className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                        min={0}
                        onChange={(event) => updateDefaultDriverPayout(bookingType, event.target.value)}
                        type="number"
                        value={payoutValue}
                      />
                    </label>
                  );
                })}
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Midnight payout</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) =>
                      setRateSettings((current) => ({
                        ...current,
                        midnightPayout: numericRate(event.target.value),
                      }))
                    }
                    type="number"
                    value={rateSettings.midnightPayout}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Extra stop payout</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) =>
                      setRateSettings((current) => ({
                        ...current,
                        extraStopPayout: numericRate(event.target.value),
                      }))
                    }
                    type="number"
                    value={rateSettings.extraStopPayout}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Child seat payout</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) =>
                      setRateSettings((current) => ({
                        ...current,
                        childSeatDriverPayout: numericRate(event.target.value),
                      }))
                    }
                    type="number"
                    value={rateSettings.childSeatDriverPayout}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-stone-200 pt-5">
            <h3 className="text-base font-semibold">Company / Boss Overrides</h3>
            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <label>
                <span className="mb-1 block text-sm font-medium text-slate-700">Company / Account</span>
                <input
                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  onChange={(event) =>
                    setRateOverrideDraft((current) => ({ ...current, companyName: event.target.value }))
                  }
                  placeholder="Tiger Global"
                  value={rateOverrideDraft.companyName}
                />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium text-slate-700">Boss / Name</span>
                <input
                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  onChange={(event) =>
                    setRateOverrideDraft((current) => ({ ...current, bossName: event.target.value }))
                  }
                  placeholder="Su Ling"
                  value={rateOverrideDraft.bossName}
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                <input
                  checked={rateOverrideDraft.transzendExcelPrivacy}
                  onChange={(event) =>
                    setRateOverrideDraft((current) => ({
                      ...current,
                      transzendExcelPrivacy: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Transzend privacy
              </label>
              <div className="self-end">
                <button
                  className="h-10 w-full rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={savingRates}
                  onClick={saveRateOverride}
                  type="button"
                >
                  {rateAction === "override" ? "Saving Override..." : "Save Override"}
                </button>
                {rateMessageTarget === "override" ? (
                  <div className="mt-2">{rateOverrideStatusPanel}</div>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              {rateBookingTypes.map((bookingType) => (
                <label key={`override-customer-${bookingType}`}>
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    {bookingType} customer
                  </span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) => updateCompanyOverrideRate(bookingType, event.target.value)}
                    placeholder="-"
                    type="number"
                    value={rateOverrideDraft.customerRates[bookingType] ?? ""}
                  />
                </label>
              ))}
              {rateBookingTypes.map((bookingType) => {
                const payoutRule = rateOverrideDraft.driverPayoutRules[bookingType];
                const payoutValue = payoutRule?.amount ?? payoutRule?.max ?? payoutRule?.min ?? "";

                return (
                  <label key={`override-driver-${bookingType}`}>
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      {bookingType} driver
                    </span>
                    <input
                      className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      min={0}
                      onChange={(event) => updateCompanyOverridePayout(bookingType, event.target.value)}
                      placeholder="-"
                      type="number"
                      value={payoutValue}
                    />
                  </label>
                );
              })}
            </div>

            <div className="mt-5 border-t border-stone-200 pt-5">
              <h3 className="text-base font-semibold">Saved Rate Overrides</h3>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                  <h4 className="text-sm font-semibold text-slate-800">Company Overrides</h4>
                  <div className="mt-2 max-h-56 space-y-2 overflow-auto">
                    {!ratesLoaded ? (
                      <p className="text-sm text-slate-500">Load rates to view saved company overrides.</p>
                    ) : displayedCompanyOverrideRecords.length === 0 ? (
                      <p className="text-sm text-slate-500">No company overrides found.</p>
                    ) : (
                      displayedCompanyOverrideRecords.map((companyRecord) => {
                        const rowMessage =
                          rateOverrideListMessages.company?.recordId === companyRecord.id
                            ? rateOverrideListMessages.company
                            : null;
                        const hasOverrideValues = hasRateOverrideValues(companyRecord);

                        if (!hasOverrideValues && rowMessage) {
                          return (
                            <div
                              className={`rounded-md border px-3 py-2 text-sm ${statusClass(rowMessage.tone)}`}
                              data-rate-feedback="company-overrides"
                              key={`company-message-${companyRecord.id}`}
                            >
                              {rowMessage.text}
                            </div>
                          );
                        }

                        const summary = formatOverrideSummary(
                          companyRecord.customer_rates,
                          companyRecord.driver_payout_rules,
                        );

                        return (
                          <div
                            className="rounded-md border border-stone-200 bg-white p-3 text-sm"
                            data-rate-company-override-row={companyRecord.id}
                            key={companyRecord.id}
                          >
                            <p className="font-medium">{companyRecord.company_name}</p>
                            <p className="text-xs text-slate-600">{summary.customerText}</p>
                            <p className="text-xs text-slate-600">{summary.driverText}</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <button
                                className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                                disabled={savingRates}
                                onClick={() =>
                                  setRateOverrideDraft({
                                    companyName: clean(companyRecord.company_name),
                                    bossName: "",
                                    customerRates: normalizeCustomerRateRules(companyRecord.customer_rates),
                                    driverPayoutRules: normalizeDriverPayoutRules(companyRecord.driver_payout_rules),
                                    transzendExcelPrivacy: Boolean(companyRecord.transzend_excel_privacy),
                                  })
                                }
                                type="button"
                              >
                                Load for editing
                              </button>
                              <button
                                className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
                                data-rate-company-remove={companyRecord.id}
                                disabled={savingRates}
                                onClick={() => removeCompanyRateOverride(companyRecord)}
                                type="button"
                              >
                                {rateAction === "remove-override" ? "Removing..." : "Remove override"}
                              </button>
                            </div>
                            {rowMessage ? (
                              <div
                                className={`mt-2 rounded-md border px-3 py-2 text-sm ${statusClass(rowMessage.tone)}`}
                                data-rate-feedback="company-overrides"
                              >
                                {rowMessage.text}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                  <h4 className="text-sm font-semibold text-slate-800">Boss / Name Overrides</h4>
                  <div className="mt-2 max-h-56 space-y-2 overflow-auto">
                    {!ratesLoaded ? (
                      <p className="text-sm text-slate-500">Load rates to view saved boss/name overrides.</p>
                    ) : displayedBossOverrideRecords.length === 0 ? (
                      <p className="text-sm text-slate-500">No boss/name overrides found.</p>
                    ) : (
                      displayedBossOverrideRecords.map((travelerRecord) => {
                        const companyRecord = rateCompanies.find(
                          (company) => company.id === travelerRecord.company_id,
                        );
                        const rowMessage =
                          rateOverrideListMessages.boss?.recordId === travelerRecord.id
                            ? rateOverrideListMessages.boss
                            : null;
                        const hasOverrideValues = hasRateOverrideValues(travelerRecord);

                        if (!hasOverrideValues && rowMessage) {
                          return (
                            <div
                              className={`rounded-md border px-3 py-2 text-sm ${statusClass(rowMessage.tone)}`}
                              data-rate-feedback="boss-overrides"
                              key={`boss-message-${travelerRecord.id}`}
                            >
                              {rowMessage.text}
                            </div>
                          );
                        }

                        const summary = formatOverrideSummary(
                          travelerRecord.customer_rates,
                          travelerRecord.driver_payout_rules,
                        );

                        return (
                          <div
                            className="rounded-md border border-stone-200 bg-white p-3 text-sm"
                            data-rate-boss-override-row={travelerRecord.id}
                            key={travelerRecord.id}
                          >
                            <p className="font-medium">{travelerRecord.traveler_name}</p>
                            <p className="text-xs text-slate-500">
                              {clean(companyRecord?.company_name) || "Internal Account"}
                            </p>
                            <p className="text-xs text-slate-600">{summary.customerText}</p>
                            <p className="text-xs text-slate-600">{summary.driverText}</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <button
                                className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                                disabled={savingRates}
                                onClick={() =>
                                  setRateOverrideDraft({
                                    companyName: clean(companyRecord?.company_name),
                                    bossName: clean(travelerRecord.traveler_name),
                                    customerRates: normalizeCustomerRateRules(travelerRecord.customer_rates),
                                    driverPayoutRules: normalizeDriverPayoutRules(travelerRecord.driver_payout_rules),
                                    transzendExcelPrivacy: Boolean(companyRecord?.transzend_excel_privacy),
                                  })
                                }
                                type="button"
                              >
                                Load for editing
                              </button>
                              <button
                                className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
                                data-rate-boss-remove={travelerRecord.id}
                                disabled={savingRates}
                                onClick={() => removeBossRateOverride(travelerRecord)}
                                type="button"
                              >
                                {rateAction === "remove-override" ? "Removing..." : "Remove override"}
                              </button>
                            </div>
                            {rowMessage ? (
                              <div
                                className={`mt-2 rounded-md border px-3 py-2 text-sm ${statusClass(rowMessage.tone)}`}
                                data-rate-feedback="boss-overrides"
                              >
                                {rowMessage.text}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        ) : null}

        {activeTab === "dashboard" ? (
        <section
          className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
          data-operations-dashboard="true"
        >
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Operations Dashboard</h2>
              <p className="text-sm text-slate-500">
                Based on currently loaded bookings. Click Load Bookings or Refresh Loaded Bookings to update.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:min-w-[520px]">
              <label className="flex-1">
                <span className="sr-only">Search bookings</span>
                <input
                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search name, company, or flight"
                  type="search"
                  value={searchTerm}
                />
              </label>
              <button
                className="h-11 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={loading}
                onClick={() => loadBookings()}
                type="button"
              >
                Refresh Loaded Bookings
              </button>
            </div>
          </div>
          {statusPanel}

          <div className="grid gap-3 border-y border-stone-200 py-4 text-center sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Today</p>
              <p className="text-2xl font-semibold">{todayBookings.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Upcoming</p>
              <p className="text-2xl font-semibold">{upcomingBookings.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Matching</p>
              <p className="text-2xl font-semibold">{dashboardBookings.length}</p>
            </div>
          </div>

          <div className="mt-5 space-y-6">
            <div>
              <h3 className="mb-3 text-base font-semibold">Today Bookings</h3>
              {renderBookingCards(todayBookings, "No bookings for today.")}
            </div>

            <div>
              <h3 className="mb-3 text-base font-semibold">Upcoming Bookings</h3>
              {renderBookingCards(upcomingBookings, "No upcoming bookings.")}
            </div>

            {otherBookings.length > 0 ? (
              <div>
                <h3 className="mb-3 text-base font-semibold">Earlier Bookings</h3>
                {renderBookingCards(otherBookings, "No earlier bookings.")}
              </div>
            ) : null}
          </div>
        </section>
        ) : null}
      </div>
    </main>
  );
}
