import "server-only";

import type { AdminDispatcherBoundaryContext } from "./admin-dispatcher-auth-boundary";
import {
  adminDispatcherBoundaryToPersistenceAdapterActor,
  type AdminBookingPersistenceAdapterActor,
} from "./admin-booking-supabase-adapter";
import {
  loadAdminAppNotifications,
  type AdminAppNotificationRecord,
} from "./admin-app-notification-persistence";
import { findAdminBooker } from "./admin-bookers";
import { findAdminCompanyCrmIdentity } from "./admin-companies-crm-identity";
import { loadAdminCustomerAccounts } from "./admin-customer-accounts-read";
import {
  loadAdminDriverJobLinks,
  type AdminDriverJobLinkRecord,
} from "./admin-driver-job-link-persistence";
import {
  loadAdminDriverJobStatuses,
  type AdminDriverJobStatusValue,
} from "./admin-driver-job-status-read";
import {
  loadAdminMonthlyInvoiceDrafts,
  type AdminMonthlyInvoiceDraftRecord,
} from "./admin-monthly-invoice-draft-persistence";
import {
  loadAdminSavedBookingsForExactSgtDate,
  loadAdminSavedBookingList,
  type AdminSavedBookingRecord,
} from "./admin-saved-booking-read";

export const adminAiTodaysWorkBriefIntent = "find_todays_work_brief";
export const adminAiTodaysWorkBriefPageSize = 10;

export type AdminAiTodaysWorkBriefCategory =
  | "blocked_monthly_billing"
  | "customer_booking_review"
  | "driver_report_completion"
  | "pending_driver_ack"
  | "scheduled_assigned"
  | "scheduled_unassigned"
  | "urgent_unassigned";

export type AdminAiTodaysWorkBriefRow = {
  billing_month: string | null;
  booker_id: number | null;
  booker_name: string | null;
  booking_reference: string | null;
  category: AdminAiTodaysWorkBriefCategory;
  company_id: number | null;
  company_name: string | null;
  customer_id: number | null;
  detail: string;
  flight_no: string | null;
  handoff: "dashboard" | "dispatch" | "driver_ack_queue";
  identity_status: "manual_review" | "verified";
  occurred_at: string | null;
  pickup_at: string | null;
  public_booking_reference: string | null;
  review_kind: "amendment" | "cancellation" | "new" | null;
  row_key: string;
  route: string | null;
  service_type: string | null;
};

export type AdminAiTodaysWorkBriefResult = {
  answer: string;
  counts: Record<AdminAiTodaysWorkBriefCategory, number> & { total: number };
  has_more: boolean;
  intent: typeof adminAiTodaysWorkBriefIntent;
  page: number;
  page_size: typeof adminAiTodaysWorkBriefPageSize;
  query: string;
  read_at: string;
  rows: AdminAiTodaysWorkBriefRow[];
  scope: "attention" | "date_operations" | "flight_date";
  status: "blocked" | "empty" | "results";
  target_date: string | null;
  target_flight_no: string | null;
};

export type AdminAiTodaysWorkBriefExecution =
  | { matched: false }
  | { data: AdminAiTodaysWorkBriefResult; matched: true; ok: true }
  | { error: string; matched: true; ok: false; status: 403 | 500 | 503 };

export type AdminAiVerifiedAccountBoundary = {
  booker_id: number;
  booker_name: string;
  company_id: number;
  company_name: string;
  customer_id: number;
};

export type AdminAiTodaysWorkBriefSnapshot = {
  bookings: AdminSavedBookingRecord[];
  drafts: AdminMonthlyInvoiceDraftRecord[];
  identities: Record<string, AdminAiVerifiedAccountBoundary>;
  latest_status_by_reference: Record<string, {
    occurred_at: string | null;
    status_value: AdminDriverJobStatusValue | null;
  }>;
  links: AdminDriverJobLinkRecord[];
  notifications: AdminAppNotificationRecord[];
};

export type AdminAiTodaysWorkBriefDependencies = {
  loadSnapshot(
    actor: AdminBookingPersistenceAdapterActor,
    now: Date,
    request?:
      | { kind: "attention" }
      | { kind: "exact_sgt_date"; targetDate: string },
  ): Promise<AdminAiTodaysWorkBriefSnapshot>;
};

type UnknownRecord = Record<string, unknown>;
type ParsedTodaysWorkBrief = {
  kind: "attention" | "date_operations" | "flight_date";
  query: string;
  targetDate: string | null;
  targetFlightNo: string | null;
};

const allowedActorRoles = new Set(["admin", "dispatcher"]);
const safeReadError = "Today's work brief failed safely. No operational record was changed.";
const blockedActionPattern =
  /\b(?:accept|archive|assign|cancel|charge|complete|confirm|create|delete|dismiss|email|expire|issue|mark|modify|pay|refund|reject|remind|remove|revoke|save|send|set|update|write)\b/i;
const injectionPattern =
  /(?:ignore\s+(?:all\s+)?(?:previous|prior)|system\s+prompt|developer\s+message|service[_\s-]?role|api[_\s-]?key|database\s+credential|\b(?:drop|insert|select|update|delete)\s+(?:table|from|into|bookings|driver_job_links|monthly_invoice_drafts)\b)/i;
const exactWorkBriefPatterns = [
  /^what\s+needs\s+my\s+attention\s+today[\s?.!]*$/i,
  /^show(?:\s+me)?\s+today(?:'|’)?s\s+work\s+brief[\s?.!]*$/i,
];
const tomorrowOperationsPattern = /^show(?:\s+me)?\s+tomorrow(?:'|’)?s\s+operations\s+brief[\s?.!]*$/i;
const exactDateOperationsPattern = /^show(?:\s+me)?\s+operations\s+brief\s+for\s+(\d{4}-\d{2}-\d{2})[\s?.!]*$/i;
const exactFlightDatePattern = /^show(?:\s+me)?\s+flight\s+([A-Z0-9 -]{2,16})\s+jobs\s+for\s+(\d{4}-\d{2}-\d{2})[\s?.!]*$/i;
const terminalBookingStatuses = new Set([
  "archived",
  "canceled",
  "cancelled",
  "complete",
  "completed",
  "declined",
  "declined_internal",
  "job_completed",
]);
const closedCustomerRequestStatuses = new Set([
  ...terminalBookingStatuses,
  "approved",
  "closed",
  "confirmed",
  "declined internally",
  "ready for confirmation",
  "rejected",
  "released",
]);
const unassignedDriverLabels = new Set([
  "driver tbc",
  "driver to be confirmed",
  "pending driver",
  "tbc",
  "to be confirmed",
  "unassigned",
]);
const categoryOrder: AdminAiTodaysWorkBriefCategory[] = [
  "customer_booking_review",
  "urgent_unassigned",
  "scheduled_unassigned",
  "scheduled_assigned",
  "pending_driver_ack",
  "driver_report_completion",
  "blocked_monthly_billing",
];

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function cleanText(value: unknown, maximumLength = 220) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safeDate(value: unknown) {
  const text = cleanText(value, 100);
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function safePage(value: unknown) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= 50 ? page : 1;
}

function normalizedToken(value: unknown) {
  return cleanText(value, 160)
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase();
}

function identityKey(customerId: unknown, companyId: unknown, bookerId: unknown) {
  const customer = positiveInteger(customerId);
  const company = positiveInteger(companyId);
  const booker = positiveInteger(bookerId);
  return customer && company && booker ? `${customer}:${company}:${booker}` : "";
}

function singaporeDateKey(value: unknown) {
  const date = value instanceof Date
    ? value
    : typeof value === "number"
      ? new Date(value)
      : new Date(cleanText(value, 100));
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  const key = `${part("year")}-${part("month")}-${part("day")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function validExactDate(value: unknown) {
  const date = cleanText(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00+08:00`);
  return singaporeDateKey(parsed) === date ? date : null;
}

function tomorrowSingaporeDate(now: Date) {
  const today = singaporeDateKey(now);
  if (!today) return null;
  return singaporeDateKey(new Date(`${today}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000);
}

function normalizedFlightNumber(value: unknown) {
  const flight = cleanText(value, 16).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{2,12}$/.test(flight) ? flight : null;
}

function parseTodaysWorkBrief(messageValue: unknown): ParsedTodaysWorkBrief | "blocked" | null {
  const query = cleanText(messageValue, 500);
  const looksLikeWorkBrief = /\b(?:attention\s+today|today(?:'|’)?s\s+work\s+brief|operations\s+brief|flight\s+.+?\s+jobs\s+for)\b/i.test(query);

  if (!query || !looksLikeWorkBrief) return null;
  if (blockedActionPattern.test(query) || injectionPattern.test(query)) return "blocked";
  if (exactWorkBriefPatterns.some((pattern) => pattern.test(query))) {
    return { kind: "attention", query, targetDate: null, targetFlightNo: null };
  }
  if (tomorrowOperationsPattern.test(query)) {
    return { kind: "date_operations", query, targetDate: "tomorrow", targetFlightNo: null };
  }
  const dateMatch = query.match(exactDateOperationsPattern);
  if (dateMatch) {
    const targetDate = validExactDate(dateMatch[1]);
    return targetDate ? { kind: "date_operations", query, targetDate, targetFlightNo: null } : "blocked";
  }
  const flightMatch = query.match(exactFlightDatePattern);
  if (flightMatch) {
    const targetDate = validExactDate(flightMatch[2]);
    const targetFlightNo = normalizedFlightNumber(flightMatch[1]);
    return targetDate && targetFlightNo
      ? { kind: "flight_date", query, targetDate, targetFlightNo }
      : "blocked";
  }
  return "blocked";
}

function validActor(context: AdminDispatcherBoundaryContext) {
  return (
    context.mode === "server-session-role-surface" &&
    allowedActorRoles.has(context.role) &&
    Boolean(cleanText(context.actorLabel, 160))
  );
}

function bookingReference(booking: AdminSavedBookingRecord) {
  return cleanText(booking.booking_reference, 120);
}

function publicBookingReference(booking: AdminSavedBookingRecord) {
  return cleanText(booking.public_booking_reference, 40) || null;
}

function bookingPickupAt(booking: AdminSavedBookingRecord) {
  const direct = safeDate(booking.pickup_at) || safeDate(booking.pickup_datetime);
  if (direct) return direct;
  return null;
}

function bookingIsTerminal(booking: AdminSavedBookingRecord) {
  return [booking.admin_internal_status, booking.status, booking.customer_facing_status]
    .map(normalizedToken)
    .filter(Boolean)
    .some((status) => terminalBookingStatuses.has(status));
}

function bookingIsCustomerRequest(booking: AdminSavedBookingRecord) {
  return [booking.source_channel, booking.source_surface]
    .map(normalizedToken)
    .includes("customer_booking_request");
}

function bookingIsOpenCustomerRequest(booking: AdminSavedBookingRecord) {
  if (!bookingIsCustomerRequest(booking)) return false;
  return ![
    booking.admin_internal_status,
    booking.status,
    booking.customer_facing_status,
  ].map(normalizedToken).filter(Boolean).some((status) => closedCustomerRequestStatuses.has(status));
}

function bookingHasAssignedDriver(booking: AdminSavedBookingRecord) {
  const driverId = positiveInteger(booking.driver_id);
  const driverName = cleanText(booking.driver_name, 160).toLowerCase();
  return Boolean(driverId || (driverName && !unassignedDriverLabels.has(driverName)));
}

function bookingInsideActiveMonitorWindow(booking: AdminSavedBookingRecord, now: Date) {
  const pickupAt = bookingPickupAt(booking);
  if (!pickupAt) return false;
  const pickupMs = Date.parse(pickupAt);
  return now.getTime() >= pickupMs - 60 * 60 * 1000 && now.getTime() <= pickupMs + 24 * 60 * 60 * 1000;
}

function bookingIsCurrentAssignedActiveJob(booking: AdminSavedBookingRecord, now: Date) {
  const pickupAt = bookingPickupAt(booking);
  return Boolean(
    pickupAt &&
    bookingReference(booking) &&
    bookingHasAssignedDriver(booking) &&
    !bookingIsCustomerRequest(booking) &&
    !bookingIsTerminal(booking) &&
    Date.parse(pickupAt) >= now.getTime() - 24 * 60 * 60 * 1000,
  );
}

function notificationBookingReference(notification: AdminAppNotificationRecord) {
  const context = asRecord(notification.safe_context);
  return cleanText(notification.booking_reference, 120) || cleanText(context.booking_reference, 120);
}

function notificationReviewKind(notification: AdminAppNotificationRecord) {
  const workflowArea = normalizedToken(notification.workflow_area);
  const safeTitle = cleanText(notification.safe_title, 160).toLowerCase();
  if (workflowArea === "new_booking_request" || safeTitle === "new booking request") return "new" as const;
  if (workflowArea !== "customer_booking_change_request") return null;
  const requestKind = normalizedToken(asRecord(notification.safe_context).request_kind);
  return requestKind === "cancellation" || requestKind === "cancel"
    ? "cancellation" as const
    : "amendment" as const;
}

function verifiedIdentity(
  snapshot: AdminAiTodaysWorkBriefSnapshot,
  customerIdValue: unknown,
  companyIdValue: unknown,
  bookerIdValue: unknown,
) {
  const key = identityKey(customerIdValue, companyIdValue, bookerIdValue);
  return key ? snapshot.identities[key] || null : null;
}

function baseBookingRow(
  snapshot: AdminAiTodaysWorkBriefSnapshot,
  booking: AdminSavedBookingRecord,
) {
  const identity = verifiedIdentity(snapshot, booking.customer_id, booking.company_id, booking.booker_id);
  return {
    booker_id: identity?.booker_id ?? null,
    booker_name: identity?.booker_name ?? null,
    booking_reference: bookingReference(booking) || null,
    company_id: identity?.company_id ?? null,
    company_name: identity?.company_name ?? null,
    customer_id: identity?.customer_id ?? null,
    flight_no: cleanText(booking.flight_no, 40) || null,
    identity_status: identity ? "verified" as const : "manual_review" as const,
    pickup_at: bookingPickupAt(booking),
    public_booking_reference: publicBookingReference(booking),
    route: cleanText(booking.route_summary || booking.route, 500) || null,
    service_type: cleanText(booking.service_type || booking.booking_type, 80) || null,
  };
}

function makeCounts(rows: AdminAiTodaysWorkBriefRow[]) {
  const counts = Object.fromEntries(categoryOrder.map((category) => [category, 0])) as Record<
    AdminAiTodaysWorkBriefCategory,
    number
  >;
  for (const row of rows) counts[row.category] += 1;
  return { ...counts, total: rows.length };
}

function buildRows(snapshot: AdminAiTodaysWorkBriefSnapshot, now: Date) {
  const bookingsByReference = new Map(
    snapshot.bookings.flatMap((booking) => {
      const reference = bookingReference(booking);
      return reference ? [[reference, booking] as const] : [];
    }),
  );
  const rows: AdminAiTodaysWorkBriefRow[] = [];
  const customerReviewKeys = new Set<string>();

  for (const notification of snapshot.notifications) {
    const reviewKind = notificationReviewKind(notification);
    const reference = notificationBookingReference(notification);
    if (!reviewKind || !reference) continue;
    const booking = bookingsByReference.get(reference);
    const base = booking ? baseBookingRow(snapshot, booking) : {
      booker_id: null,
      booker_name: null,
      booking_reference: reference,
      company_id: null,
      company_name: null,
      customer_id: null,
      flight_no: null,
      identity_status: "manual_review" as const,
      pickup_at: null,
      public_booking_reference: null,
      route: null,
      service_type: null,
    };
    const notificationId = cleanText(notification.id, 120) || safeDate(notification.created_at) || reference;
    const rowKey = `customer_booking_review:${reviewKind}:${reference}:${notificationId}`;
    customerReviewKeys.add(`${reviewKind}:${reference}`);
    rows.push({
      ...base,
      billing_month: null,
      category: "customer_booking_review",
      detail: base.identity_status === "verified"
        ? `${reviewKind === "new" ? "New booking" : reviewKind === "cancellation" ? "Cancellation" : "Amendment"} review is waiting on the established Dashboard controls.`
        : "Customer booking review is waiting, but exact Company + Booker identity needs manual review.",
      handoff: "dashboard",
      occurred_at: safeDate(notification.created_at),
      review_kind: reviewKind,
      row_key: rowKey,
    });
  }

  for (const booking of snapshot.bookings) {
    const reference = bookingReference(booking);
    if (!reference || !bookingIsOpenCustomerRequest(booking) || customerReviewKeys.has(`new:${reference}`)) continue;
    const base = baseBookingRow(snapshot, booking);
    rows.push({
      ...base,
      billing_month: null,
      category: "customer_booking_review",
      detail: base.identity_status === "verified"
        ? "New booking review is waiting on the established Dashboard controls."
        : "New booking review is waiting, but exact Company + Booker identity needs manual review.",
      handoff: "dashboard",
      occurred_at: safeDate(booking.created_at),
      review_kind: "new",
      row_key: `customer_booking_review:new:${reference}`,
    });
  }

  for (const booking of snapshot.bookings) {
    if (
      bookingIsTerminal(booking) ||
      bookingIsCustomerRequest(booking) ||
      bookingHasAssignedDriver(booking) ||
      !bookingInsideActiveMonitorWindow(booking, now)
    ) continue;
    const reference = bookingReference(booking);
    if (!reference) continue;
    const base = baseBookingRow(snapshot, booking);
    rows.push({
      ...base,
      billing_month: null,
      category: "urgent_unassigned",
      detail: base.identity_status === "verified"
        ? "Urgent operational job has no assigned Driver."
        : "Urgent unassigned job is blocked on exact Company + Booker identity review.",
      handoff: "dispatch",
      occurred_at: null,
      review_kind: null,
      row_key: `urgent_unassigned:${reference}`,
    });
  }

  const newestActiveLinkByReference = new Map<string, AdminDriverJobLinkRecord>();
  for (const link of snapshot.links) {
    const reference = cleanText(link.booking_reference, 120);
    if (!reference || link.link_status !== "active" || newestActiveLinkByReference.has(reference)) continue;
    newestActiveLinkByReference.set(reference, link);
  }

  for (const booking of snapshot.bookings) {
    if (!bookingIsCurrentAssignedActiveJob(booking, now)) continue;
    const reference = bookingReference(booking);
    const link = newestActiveLinkByReference.get(reference);
    if (link && !link.safe_summary.acknowledged) {
      const base = baseBookingRow(snapshot, booking);
      rows.push({
        ...base,
        billing_month: null,
        category: "pending_driver_ack",
        detail: base.identity_status === "verified"
          ? "Newest active Driver Job Link is pending acknowledgement."
          : "Newest active Driver Job Link is pending, but exact Company + Booker identity needs manual review.",
        handoff: "driver_ack_queue",
        occurred_at: safeDate(link.issued_at) || safeDate(link.created_at),
        review_kind: null,
        row_key: `pending_driver_ack:${reference}:${link.id}`,
      });
    }

    const latestStatus = snapshot.latest_status_by_reference[reference];
    if (latestStatus?.status_value === "completed") {
      const base = baseBookingRow(snapshot, booking);
      rows.push({
        ...base,
        billing_month: null,
        category: "driver_report_completion",
        detail: base.identity_status === "verified"
          ? "Driver Job Completed report is saved; explicit Admin confirm completed is still required."
          : "Driver completion is reported, but exact Company + Booker identity needs manual review before Admin confirmation.",
        handoff: "dashboard",
        occurred_at: safeDate(latestStatus.occurred_at),
        review_kind: null,
        row_key: `driver_report_completion:${reference}`,
      });
    }
  }

  for (const draft of snapshot.drafts) {
    if (
      draft.readiness_status !== "blocked" ||
      !["blocked", "pending_admin_review"].includes(draft.draft_status)
    ) continue;
    const identity = verifiedIdentity(snapshot, draft.customer_id, draft.company_id, draft.booker_id);
    const draftId = cleanText(draft.id, 120) || `${cleanText(draft.billing_month, 20)}:${identityKey(draft.customer_id, draft.company_id, draft.booker_id) || "legacy"}`;
    rows.push({
      billing_month: cleanText(draft.billing_month, 20) || null,
      booker_id: identity?.booker_id ?? null,
      booker_name: identity?.booker_name ?? null,
      booking_reference: null,
      category: "blocked_monthly_billing",
      company_id: identity?.company_id ?? null,
      company_name: identity?.company_name ?? null,
      customer_id: identity?.customer_id ?? null,
      detail: identity
        ? "Monthly billing draft is blocked and waiting for Admin review."
        : "Monthly billing draft is blocked on missing or inconsistent Company + Booker identity.",
      handoff: "dashboard",
      identity_status: identity ? "verified" : "manual_review",
      occurred_at: safeDate(draft.updated_at) || safeDate(draft.created_at),
      pickup_at: null,
      public_booking_reference: null,
      review_kind: null,
      route: null,
      row_key: `blocked_monthly_billing:${draftId}`,
      service_type: null,
      flight_no: null,
    });
  }

  return rows.sort((first, second) => {
    const categoryDifference = categoryOrder.indexOf(first.category) - categoryOrder.indexOf(second.category);
    if (categoryDifference !== 0) return categoryDifference;
    const firstTime = first.pickup_at || first.occurred_at || "";
    const secondTime = second.pickup_at || second.occurred_at || "";
    return firstTime.localeCompare(secondTime) || first.row_key.localeCompare(second.row_key);
  });
}

function buildDateRows(
  snapshot: AdminAiTodaysWorkBriefSnapshot,
  targetDate: string,
  targetFlightNo: string | null,
) {
  const newestActiveLinkByReference = new Map<string, AdminDriverJobLinkRecord>();
  for (const link of snapshot.links) {
    const reference = cleanText(link.booking_reference, 120);
    if (!reference || link.link_status !== "active" || newestActiveLinkByReference.has(reference)) continue;
    newestActiveLinkByReference.set(reference, link);
  }

  return snapshot.bookings.flatMap((booking): AdminAiTodaysWorkBriefRow[] => {
    const pickupAt = bookingPickupAt(booking);
    const reference = bookingReference(booking);
    if (!pickupAt || !reference || singaporeDateKey(pickupAt) !== targetDate) return [];
    if (targetFlightNo && normalizedFlightNumber(booking.flight_no) !== targetFlightNo) return [];

    const base = baseBookingRow(snapshot, booking);
    const link = newestActiveLinkByReference.get(reference);
    const latestStatus = snapshot.latest_status_by_reference[reference];
    let category: AdminAiTodaysWorkBriefCategory;
    let detail: string;
    let handoff: AdminAiTodaysWorkBriefRow["handoff"] = "dispatch";

    if (bookingIsOpenCustomerRequest(booking)) {
      category = "customer_booking_review";
      detail = "Customer booking review is waiting on the established Dashboard controls.";
      handoff = "dashboard";
    } else if (link && !link.safe_summary.acknowledged) {
      category = "pending_driver_ack";
      detail = "Newest active Driver Job Link is pending acknowledgement.";
      handoff = "driver_ack_queue";
    } else if (latestStatus?.status_value === "completed" && !bookingIsTerminal(booking)) {
      category = "driver_report_completion";
      detail = "Driver Job Completed report is saved; explicit Admin confirm completed is still required.";
      handoff = "dashboard";
    } else if (bookingHasAssignedDriver(booking)) {
      category = "scheduled_assigned";
      detail = bookingIsTerminal(booking)
        ? "Saved job is completed or closed; no action was taken."
        : "Scheduled job has an assigned Driver.";
    } else {
      category = "scheduled_unassigned";
      detail = "Scheduled job has no assigned Driver.";
    }

    return [{
      ...base,
      billing_month: null,
      category,
      detail: base.identity_status === "verified"
        ? detail
        : `${detail} Exact Company + Booker identity needs manual review.`,
      handoff,
      occurred_at: latestStatus?.occurred_at || null,
      review_kind: bookingIsOpenCustomerRequest(booking) ? "new" : null,
      row_key: `${targetFlightNo ? "flight_date" : "date_operations"}:${targetDate}:${reference}`,
    }];
  }).sort((first, second) =>
    (first.pickup_at || "").localeCompare(second.pickup_at || "") || first.row_key.localeCompare(second.row_key)
  );
}

function result(
  parsed: ParsedTodaysWorkBrief,
  query: string,
  page: number,
  input: Partial<AdminAiTodaysWorkBriefResult>,
): AdminAiTodaysWorkBriefResult {
  return {
    answer: input.answer || "No operational attention items were found in the established Dashboard sources.",
    counts: input.counts || makeCounts([]),
    has_more: input.has_more === true,
    intent: adminAiTodaysWorkBriefIntent,
    page,
    page_size: adminAiTodaysWorkBriefPageSize,
    query,
    read_at: new Date().toISOString(),
    rows: input.rows || [],
    scope: parsed.kind,
    status: input.status || "empty",
    target_date: parsed.targetDate && parsed.targetDate !== "tomorrow" ? parsed.targetDate : null,
    target_flight_no: parsed.targetFlightNo,
  };
}

async function loadAllSavedBookings(
  actor: AdminBookingPersistenceAdapterActor,
) {
  const bookings: AdminSavedBookingRecord[] = [];
  for (let page = 0; page < 100; page += 1) {
    const loaded = await loadAdminSavedBookingList({ limit: 100, offset: page * 100, scope: "monitorable" }, actor);
    if (!loaded.ok) throw new Error(loaded.error);
    bookings.push(...loaded.data.bookings);
    if (loaded.data.bookings.length < 100) return bookings;
  }
  throw new Error("Saved booking monitor coverage exceeded the established safe ceiling.");
}

async function loadAllQueuedNotifications(actor: AdminBookingPersistenceAdapterActor) {
  const notifications: AdminAppNotificationRecord[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const loaded = await loadAdminAppNotifications({ limit: 100, notification_status: "queued", page }, actor);
    if (!loaded.ok) throw new Error(loaded.error);
    notifications.push(...loaded.data.notifications);
    if (!loaded.data.pagination.has_next_page) return notifications;
  }
  throw new Error("Admin notification read exceeded the established safe ceiling.");
}

async function loadAllActiveLinks(actor: AdminBookingPersistenceAdapterActor) {
  const links: AdminDriverJobLinkRecord[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const loaded = await loadAdminDriverJobLinks({ limit: 100, link_status: "active", page }, actor);
    if (!loaded.ok) throw new Error(loaded.error);
    links.push(...loaded.data.links);
    if (!loaded.data.pagination.has_next_page) return links;
  }
  throw new Error("Driver Job Link read exceeded the established safe ceiling.");
}

async function loadAllBlockedDrafts(actor: AdminBookingPersistenceAdapterActor) {
  const drafts: AdminMonthlyInvoiceDraftRecord[] = [];
  for (let page = 1; page <= 2; page += 1) {
    const loaded = await loadAdminMonthlyInvoiceDrafts({ limit: 250, page, readiness_status: "blocked" }, actor);
    if (!loaded.ok) throw new Error(loaded.error);
    drafts.push(...loaded.data.invoice_drafts);
    if (!loaded.data.pagination.has_next_page) return drafts;
  }
  throw new Error("Monthly invoice draft read exceeded the established safe ceiling.");
}

async function loadVerifiedIdentities(
  actor: AdminBookingPersistenceAdapterActor,
  bookings: AdminSavedBookingRecord[],
  drafts: AdminMonthlyInvoiceDraftRecord[],
) {
  const accounts = await loadAdminCustomerAccounts({ limit: 1000 }, actor);
  if (!accounts.ok) throw new Error(accounts.error);
  const activeCustomerIds = new Set(
    accounts.data.accounts
      .filter((account) => account.customer_folder_active)
      .map((account) => positiveInteger(account.customer_id))
      .filter((id): id is number => Boolean(id)),
  );
  const tupleKeys = new Set([
    ...bookings.map((booking) => identityKey(booking.customer_id, booking.company_id, booking.booker_id)),
    ...drafts.map((draft) => identityKey(draft.customer_id, draft.company_id, draft.booker_id)),
  ].filter(Boolean));
  const identities: Record<string, AdminAiVerifiedAccountBoundary> = {};
  const companyCache = new Map<number, Awaited<ReturnType<typeof findAdminCompanyCrmIdentity>>>();

  await Promise.all([...tupleKeys].map(async (key) => {
    const [customerId, companyId, bookerId] = key.split(":").map(Number);
    if (!activeCustomerIds.has(customerId)) return;
    let companyResult = companyCache.get(companyId);
    if (!companyResult) {
      companyResult = await findAdminCompanyCrmIdentity({ id: companyId }, actor);
      companyCache.set(companyId, companyResult);
    }
    const bookerResult = await findAdminBooker({ id: bookerId, company_id: companyId }, actor);
    if (!companyResult.ok || !bookerResult.ok) return;
    const company = companyResult.data;
    const booker = bookerResult.data;
    if (
      !company || !company.company_name || !booker || !booker.booker_name ||
      booker.company_id !== companyId || booker.customer_id !== customerId
    ) return;
    identities[key] = {
      booker_id: bookerId,
      booker_name: booker.booker_name,
      company_id: companyId,
      company_name: company.company_name,
      customer_id: customerId,
    };
  }));

  return identities;
}

const defaultDependencies: AdminAiTodaysWorkBriefDependencies = {
  async loadSnapshot(actor, now, request = { kind: "attention" }) {
    if (request.kind === "exact_sgt_date") {
      const loaded = await loadAdminSavedBookingsForExactSgtDate({
        sgt_date: request.targetDate,
      }, actor);
      if (!loaded.ok) throw new Error(loaded.error);
      const bookings = loaded.data.bookings;
      const perBookingEvidence = await Promise.all(bookings.map(async (booking) => {
        const reference = bookingReference(booking);
        if (!reference) throw new Error(safeReadError);
        const [linksRead, statusRead] = await Promise.all([
          loadAdminDriverJobLinks({
            booking_reference: reference,
            limit: 1,
            link_status: "active",
            page: 1,
          }, actor),
          loadAdminDriverJobStatuses({ booking_reference: reference, limit: 1 }, actor),
        ]);
        if (!linksRead.ok || !statusRead.ok) throw new Error(safeReadError);
        const latest = statusRead.data.statuses[0] || null;
        return {
          latestStatus: [reference, {
            occurred_at: latest?.occurred_at || latest?.created_at || null,
            status_value: statusRead.data.latest_status,
          }] as const,
          links: linksRead.data.links,
        };
      }));
      const identities = await loadVerifiedIdentities(actor, bookings, []);
      return {
        bookings,
        drafts: [],
        identities,
        latest_status_by_reference: Object.fromEntries(
          perBookingEvidence.map((entry) => entry.latestStatus),
        ),
        links: perBookingEvidence.flatMap((entry) => entry.links),
        notifications: [],
      };
    }

    const [bookings, notifications, links, drafts] = await Promise.all([
      loadAllSavedBookings(actor),
      loadAllQueuedNotifications(actor),
      loadAllActiveLinks(actor),
      loadAllBlockedDrafts(actor),
    ]);
    const statusBookings = bookings.filter((booking) => bookingIsCurrentAssignedActiveJob(booking, now));
    const latestStatusEntries = await Promise.all(statusBookings.map(async (booking) => {
      const reference = bookingReference(booking);
      const loaded = await loadAdminDriverJobStatuses({ booking_reference: reference, limit: 1 }, actor);
      if (!loaded.ok) throw new Error(loaded.error);
      const latest = loaded.data.statuses[0] || null;
      return [reference, {
        occurred_at: latest?.occurred_at || latest?.created_at || null,
        status_value: loaded.data.latest_status,
      }] as const;
    }));
    const identities = await loadVerifiedIdentities(actor, bookings, drafts);
    return {
      bookings,
      drafts,
      identities,
      latest_status_by_reference: Object.fromEntries(latestStatusEntries),
      links,
      notifications,
    };
  },
};

export async function executeAdminAiTodaysWorkBrief(
  messageValue: unknown,
  pageValue: unknown,
  context: AdminDispatcherBoundaryContext,
  dependencies: AdminAiTodaysWorkBriefDependencies = defaultDependencies,
  now = new Date(),
): Promise<AdminAiTodaysWorkBriefExecution> {
  const parsed = parseTodaysWorkBrief(messageValue);
  const page = safePage(pageValue);
  if (!parsed) return { matched: false };
  if (parsed === "blocked") {
    const blockedParsed: ParsedTodaysWorkBrief = {
      kind: "attention",
      query: cleanText(messageValue, 500),
      targetDate: null,
      targetFlightNo: null,
    };
    return {
      data: result(blockedParsed, blockedParsed.query, page, {
        answer: "Ask AI can read today's work brief, one exact SGT operations date, or one exact flight plus date. Use the established Dashboard and Dispatch controls to change any record.",
        status: "blocked",
      }),
      matched: true,
      ok: true,
    };
  }
  if (!validActor(context)) {
    return {
      error: "Today's work brief requires a verified Admin or Dispatcher session.",
      matched: true,
      ok: false,
      status: 403,
    };
  }

  try {
    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(context);
    const targetDate = parsed.targetDate === "tomorrow" ? tomorrowSingaporeDate(now) : parsed.targetDate;
    if (parsed.kind !== "attention" && !targetDate) {
      return { error: safeReadError, matched: true, ok: false, status: 500 };
    }
    const effectiveParsed = { ...parsed, targetDate };
    const snapshot = await dependencies.loadSnapshot(
      actor,
      now,
      parsed.kind === "attention"
        ? { kind: "attention" }
        : { kind: "exact_sgt_date", targetDate: targetDate! },
    );
    const allRows = parsed.kind === "attention"
      ? buildRows(snapshot, now)
      : buildDateRows(snapshot, targetDate!, parsed.targetFlightNo);
    const start = (page - 1) * adminAiTodaysWorkBriefPageSize;
    const rows = allRows.slice(start, start + adminAiTodaysWorkBriefPageSize);
    return {
      data: result(effectiveParsed, parsed.query, page, {
        answer: parsed.kind === "attention"
          ? allRows.length > 0
            ? `${allRows.length} operational attention item${allRows.length === 1 ? "" : "s"} found in the established Dashboard sources.`
            : "No operational attention items were found in the established Dashboard sources."
          : parsed.kind === "flight_date"
            ? `${allRows.length} Prestige job${allRows.length === 1 ? "" : "s"} found for flight ${parsed.targetFlightNo} on ${targetDate}. This is not live airline status.`
            : `${allRows.length} Prestige operation${allRows.length === 1 ? "" : "s"} found for ${targetDate}.`,
        counts: makeCounts(allRows),
        has_more: start + rows.length < allRows.length,
        rows,
        status: allRows.length > 0 ? "results" : "empty",
      }),
      matched: true,
      ok: true,
    };
  } catch {
    return { error: safeReadError, matched: true, ok: false, status: 500 };
  }
}
