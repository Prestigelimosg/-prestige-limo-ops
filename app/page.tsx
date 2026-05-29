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
import { supabase } from "../lib/supabase";

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

export default function Home() {
  const [booking, setBooking] = useState<BookingForm>(() => createInitialBooking());
  const [activeTab, setActiveTab] = useState<AppTab>("dispatch");
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
  const [customerMatchFeedback, setCustomerMatchFeedback] = useState<CustomerMatchFeedback | null>(null);
  const [deletingCompletedBookingId, setDeletingCompletedBookingId] = useState<string | null>(null);
  const [copyEditStates, setCopyEditStates] =
    useState<Record<DispatchCopyTarget, CopyEditState>>(createInitialCopyEditStates);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const [driverJobLinkCopyMessage, setDriverJobLinkCopyMessage] = useState<Message | null>(null);
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
    if (!supabase || !personName) {
      return null;
    }

    const nameResult = await supabase
      .from("travelers")
      .select("id, company_id, traveler_name, preferred_vehicle, default_address, default_pickup_address, default_dropoff_address, booker_id, booker_name, booker_contact, booker_email, customer_rates, driver_payout_rules")
      .ilike("traveler_name", personName)
      .limit(1)
      .maybeSingle();

    if (nameResult.error || !nameResult.data) {
      return null;
    }

    const nameRecord = nameResult.data as TravelerRecord;
    const [companyResult, addressResult] = await Promise.all([
      supabase
        .from("companies")
      .select("id, company_name")
        .eq("id", nameRecord.company_id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("saved_addresses")
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

    const savedAddress = addressResult.data as SavedAddressRecord | null;

    return {
      company: normalizeCompanyAccount(companyResult.data?.company_name, nameRecord.booker_email),
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
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const client = supabase;
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
        .from("companies")
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
        .from("companies")
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
        .from("bookers")
        .select("company_id")
        .eq("phone", bookerContact)
        .limit(1)
        .maybeSingle();

      if (existingByContact.error) {
        throw new Error(existingByContact.error.message);
      }

      const companyByContact = await getCompanyById(existingByContact.data?.company_id ?? null);

      if (companyByContact) {
        return companyByContact;
      }
    }

    if (domain) {
      const existingByDomain = await client
        .from("companies")
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
        .from("bookers")
        .select("company_id")
        .ilike("booker_name", bookerName)
        .limit(1)
        .maybeSingle();

      if (existingByBooker.error) {
        throw new Error(existingByBooker.error.message);
      }

      const companyByBooker = await getCompanyById(existingByBooker.data?.company_id ?? null);

      if (companyByBooker) {
        return companyByBooker;
      }
    }

    if (personName) {
      const existingByName = await client
        .from("travelers")
        .select("company_id")
        .ilike("traveler_name", personName)
        .limit(1)
        .maybeSingle();

      if (existingByName.error) {
        throw new Error(existingByName.error.message);
      }

      const companyByName = await getCompanyById(existingByName.data?.company_id ?? null);

      if (companyByName) {
        return companyByName;
      }
    }

    const companyNameToCreate = companyName || domain;

    if (!companyNameToCreate) {
      return blankCompanyRecord("");
    }

    const createdCompany = await client
      .from("companies")
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
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const client = supabase;
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

      const { error } = await client.from("bookers").update(updatePayload).eq("id", bookerRecord.id);

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
        .from("bookers")
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
        .from("bookers")
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
      .from("bookers")
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
      .from("bookers")
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
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const personName = clean(booking.name);

    if (!personName) {
      return null;
    }

    const existingName = await supabase
      .from("travelers")
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

      const { error } = await supabase.from("travelers").update(updatePayload).eq("id", existingRecord.id);

      if (error) {
        throw new Error(error.message);
      }

      return {
        ...existingRecord,
        ...updatePayload,
      };
    }

    const createdName = await supabase
      .from("travelers")
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
    if (!supabase || !travelerId) {
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
      const { error } = await supabase.from("travelers").update(updatePayload).eq("id", travelerId);

      if (error) {
        throw new Error(error.message);
      }
    }

    if (!address) {
      return;
    }

    const existingAddress = await supabase
      .from("saved_addresses")
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
      const { error } = await supabase
        .from("saved_addresses")
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

    const { error } = await supabase.from("saved_addresses").insert({
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
    if (!supabase) {
      if (!options?.preserveAction) {
        setRateMessageTarget("header");
      }
      const errorMessage =
        "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";

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
        supabase
          .from("rate_settings")
          .select("customer_rates, driver_payout_rules, midnight_surcharge, extra_stop_surcharge, midnight_payout, extra_stop_payout, child_seat_customer_surcharge, child_seat_driver_payout")
          .eq("id", "default")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("companies")
          .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
          .order("company_name", { ascending: true }),
        supabase
          .from("travelers")
          .select("id, company_id, traveler_name, customer_rates, driver_payout_rules")
          .order("traveler_name", { ascending: true }),
      ]);

      const loadError = settingsResult.error || companiesResult.error || travelersResult.error;

      if (loadError) {
        throw new Error(formatSupabaseError(loadError));
      }

      const settings = settingsResult.data;
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
    if (!supabase) {
      setRateMessageTarget("header");
      setMessage({
        tone: "error",
        text: "Save failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
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
      const { error } = await supabase
        .from("rate_settings")
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

    if (!supabase) {
      setMessage({
        tone: "error",
        text: "Save rate override failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
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
        const existingCompany = await supabase
          .from("companies")
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
        const createdCompany = await supabase
          .from("companies")
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

      const companyUpdate = await supabase
        .from("companies")
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
        const existingTraveler = await supabase
          .from("travelers")
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
          const travelerUpdate = await supabase
            .from("travelers")
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
          const travelerInsert = await supabase.from("travelers").insert({
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

    if (!supabase) {
      setRateOverrideListMessages((current) => ({
        ...current,
        company: {
          tone: "error",
          text: "Remove override failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
          recordId: companyRecord.id,
        },
      }));
      return;
    }

    setSavingRates(true);
    setRateAction("remove-override");

    try {
      const { error } = await supabase
        .from("companies")
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

    if (!supabase) {
      setRateOverrideListMessages((current) => ({
        ...current,
        boss: {
          tone: "error",
          text: "Remove override failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
          recordId: travelerRecord.id,
        },
      }));
      return;
    }

    setSavingRates(true);
    setRateAction("remove-override");

    try {
      const { error } = await supabase
        .from("travelers")
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
    if (!supabase) {
      setMessage({
        tone: "error",
        text: "Load drivers failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      });
      return;
    }

    setLoadingDrivers(true);
    setMessage({ tone: "info", text: loadingText });

    try {
      const { data, error } = await supabase
        .from("drivers")
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
    if (!supabase) {
      setMessage({
        tone: "error",
        text: "Save driver failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
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
        const existingResult = await supabase
          .from("drivers")
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
        ? await supabase.from("drivers").update(payload).eq("id", existingDriverId)
        : await supabase.from("drivers").insert(payload);

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
    if (!supabase) {
      setMessage({
        tone: "error",
        text: "Deactivate driver failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
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
      const result = await supabase.from("drivers").update(payload).eq("id", driverId);

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

    if (!supabase) {
      setDriverDeleteMessage({
        driverId,
        tone: "error",
        text: "Delete driver failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
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
      const result = await supabase.from("drivers").delete().eq("id", driverId);

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

    if (!supabase) {
      const saveMessage = {
        tone: "error",
        text: "Booking save failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
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
      const { data: savedBooking, error } = await supabase.from("bookings").insert(bookingPayload).select("id").single();

      if (error || !savedBooking) {
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

        const savedBookingResult = await fetchSavedBookingById(savedBooking.id);

        if (savedBookingResult.error || !savedBookingResult.data) {
          const saveMessage = {
            tone: "success",
            text: `Booking saved successfully: ${savedBooking.id}`,
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
            : `Booking saved successfully: ${savedBooking.id}`,
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
    if (!supabase) {
      return {
        data: null,
        error: new Error("Supabase is not configured."),
      };
    }

    return supabase
      .from("bookings")
      .select("*, companies(company_name, domain), bookers(booker_name, email, phone), travelers(traveler_name)")
      .eq("id", bookingId)
      .limit(1)
      .maybeSingle();
  }

  async function loadBookings(successText = "Bookings loaded.", options?: { silent?: boolean }) {
    if (!supabase) {
      if (!options?.silent) {
        setMessage({
          tone: "error",
          text: "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        });
      }
      return;
    }

    setLoading(true);
    if (!options?.silent) {
      setMessage({ tone: "info", text: "Loading bookings..." });
    }

    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, companies(company_name, domain), bookers(booker_name, email, phone), travelers(traveler_name)")
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

    if (!supabase) {
      const errorMessage = {
        tone: "error",
        text: `${errorPrefix}: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.`,
      } satisfies Message;
      setBookingCompletionMessage(bookingId, errorMessage);
      return;
    }

    const loadingMessage = { tone: "info", text: loadingText } satisfies Message;
    setCompletingBookingId(bookingId);
    setBookingCompletionMessage(bookingId, loadingMessage);

    try {
      const updatedAt = new Date().toISOString();
      const { error } = await supabase
        .from("bookings")
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

    if (!supabase) {
      setBookingCompletionMessage(bookingId, {
        tone: "error",
        text: "Delete completed job failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      });
      return;
    }

    setDeletingCompletedBookingId(bookingId);
    setBookingCompletionMessage(bookingId, { tone: "info", text: "Deleting completed job..." });

    try {
      const { error } = await supabase.from("bookings").delete().eq("id", bookingRecord.id);

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

    if (!supabase) {
      const errorMessage = {
        tone: "error",
        text: "Clear assigned driver failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
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
      const { error } = await supabase
        .from("bookings")
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

    if (!supabase) {
      const errorMessage = {
        tone: "error",
        text: "Assign driver failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
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
      const { error } = await supabase
        .from("bookings")
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

            <div className="mt-5 rounded-md border border-stone-200 bg-stone-50 p-3">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-slate-900">Route Extras & Child Seat</h3>
                <p className="text-sm text-slate-600">Review extra stops and child seat requirements together.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                <label className="sm:col-span-2 lg:col-span-5">
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
              </div>
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
        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
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
