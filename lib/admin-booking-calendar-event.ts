import "server-only";

export const adminBookingCalendarEventVersion = "admin-booking-calendar-event-v1";
export const adminBookingCalendarTimezone = "Asia/Singapore";

export type AdminBookingCalendarEventData = {
  booking_reference: string;
  description: string;
  ends_at_local: string;
  filename: string;
  location: string;
  starts_at_local: string;
  timezone: typeof adminBookingCalendarTimezone;
  title: string;
};

export type BuildAdminBookingCalendarEventResult =
  | {
      data: {
        calendar_event: AdminBookingCalendarEventData;
        ics: string;
        version: typeof adminBookingCalendarEventVersion;
      };
      ok: true;
    }
  | {
      error: string;
      ok: false;
      status: 400;
    };

type CalendarDateTimeParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
};

const defaultDurationMinutes = 90;
const genericPayloadError =
  "Calendar event payload must contain only supported saved booking fields.";
const savedBookingRequiredError =
  "A saved booking reference or id is required before creating a calendar event payload.";
const pickupDateTimeRequiredError =
  "A saved booking pickup date and time are required before creating a calendar event payload.";
const pickupLocationRequiredError =
  "A saved booking pickup or dropoff location is required before creating a calendar event payload.";

const forbiddenFieldFragments = [
  "admin_finance",
  "admin_note",
  "billing",
  "customer_price",
  "customer_rate",
  "debug",
  "dev_archive",
  "dev_workbench",
  "driver_note",
  "driver_payout",
  "email_payload",
  "finance",
  "internal",
  "invoice",
  "mock_archive",
  "mock_qa",
  "notification",
  "parser",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "price",
  "proof",
  "raw_ai",
  "raw_token",
  "secret",
  "server_secret",
  "surcharge",
  "token_hash",
];

const allowedRootFields = new Set([
  "booker_name",
  "bookers",
  "booking_id",
  "booking_reference",
  "booking_type",
  "companies",
  "company_name",
  "date",
  "driver_contact",
  "driver_name",
  "driver_plate_number",
  "dropoff",
  "dropoff_address",
  "dropoff_location",
  "flight",
  "flight_no",
  "flight_number",
  "id",
  "job_card",
  "passenger_name",
  "pax",
  "pickup",
  "pickup_address",
  "pickup_at",
  "pickup_date",
  "pickup_datetime",
  "pickup_location",
  "pickup_time",
  "public_reference",
  "reference",
  "route",
  "status",
  "time",
  "traveler_name",
  "travelers",
  "vehicle",
]);

const allowedNestedFields: Record<string, Set<string>> = {
  bookers: new Set(["booker_name", "name"]),
  companies: new Set(["company_name", "name"]),
  travelers: new Set(["name", "traveler_name"]),
};

const monthNumbers: Record<string, number> = {
  apr: 4,
  april: 4,
  aug: 8,
  august: 8,
  dec: 12,
  december: 12,
  feb: 2,
  february: 2,
  jan: 1,
  january: 1,
  jul: 7,
  july: 7,
  jun: 6,
  june: 6,
  mar: 3,
  march: 3,
  may: 5,
  nov: 11,
  november: 11,
  oct: 10,
  october: 10,
  sep: 9,
  sept: 9,
  september: 9,
};

export function buildAdminBookingCalendarEvent(
  input: unknown,
  options: { now?: Date } = {},
): BuildAdminBookingCalendarEventResult {
  const parsedPayload = validateCalendarPayload(input);

  if (!parsedPayload.ok) {
    return parsedPayload;
  }

  const booking = parsedPayload.booking;
  const explicitReference = textField(
    booking,
    "booking_reference",
    "public_reference",
    "reference",
  );
  const savedId = textField(booking, "id", "booking_id");
  const bookingReference = explicitReference || (savedId ? `booking-${savedId}` : "");

  if (!bookingReference) {
    return {
      error: savedBookingRequiredError,
      ok: false,
      status: 400,
    };
  }

  const startsAt = resolveStartDateTime(booking);

  if (!startsAt) {
    return {
      error: pickupDateTimeRequiredError,
      ok: false,
      status: 400,
    };
  }

  const endsAt = addMinutes(startsAt, defaultDurationMinutes);
  const routePoints = splitRoute(textField(booking, "route"));
  const pickupLocation =
    textField(booking, "pickup_address", "pickupLocation", "pickup_location", "pickup") ||
    routePoints[0] ||
    "";
  const dropoffLocation =
    textField(booking, "dropoff_address", "dropoffLocation", "dropoff_location", "dropoff") ||
    routePoints[routePoints.length - 1] ||
    "";
  const fallbackRoute = [pickupLocation, dropoffLocation].filter(Boolean).join(" > ");
  const safeRoute = textField(booking, "route") || fallbackRoute;
  const location = pickupLocation || dropoffLocation;

  if (!location) {
    return {
      error: pickupLocationRequiredError,
      ok: false,
      status: 400,
    };
  }

  const bookingType = textField(booking, "booking_type", "bookingType").toUpperCase();
  const travelerName =
    textField(booking, "traveler_name", "passenger_name") ||
    nestedTextField(booking, "travelers", "traveler_name", "name");
  const companyName =
    textField(booking, "company_name") ||
    nestedTextField(booking, "companies", "company_name", "name");
  const titleTarget = travelerName || companyName || bookingReference;
  const title = limitText(
    ["Prestige", bookingType, titleTarget].filter(Boolean).join(" - "),
    120,
  );
  const description = buildDescription({
    booking,
    bookingReference,
    companyName,
    dropoffLocation,
    pickupLocation,
    route: safeRoute,
    travelerName,
  });
  const filename = `prestige-booking-${slugify(bookingReference)}.ics`;
  const calendarEvent: AdminBookingCalendarEventData = {
    booking_reference: bookingReference,
    description,
    ends_at_local: formatLocalDateTime(endsAt),
    filename,
    location,
    starts_at_local: formatLocalDateTime(startsAt),
    timezone: adminBookingCalendarTimezone,
    title,
  };

  return {
    data: {
      calendar_event: calendarEvent,
      ics: buildIcs(calendarEvent, startsAt, endsAt, options.now || new Date()),
      version: adminBookingCalendarEventVersion,
    },
    ok: true,
  };
}

function validateCalendarPayload(
  input: unknown,
):
  | {
      booking: Record<string, unknown>;
      ok: true;
    }
  | {
      error: string;
      ok: false;
      status: 400;
    } {
  const booking = asRecord(input);

  if (!booking) {
    return {
      error: genericPayloadError,
      ok: false,
      status: 400,
    };
  }

  for (const [key, value] of Object.entries(booking)) {
    const normalizedKey = normalizeFieldKey(key);

    if (isForbiddenField(normalizedKey) || !allowedRootFields.has(normalizedKey)) {
      return {
        error: genericPayloadError,
        ok: false,
        status: 400,
      };
    }

    const nestedAllowlist = allowedNestedFields[normalizedKey];

    if (nestedAllowlist) {
      if (value === null || value === undefined) {
        continue;
      }

      const nestedRecord = asRecord(value);

      if (!nestedRecord) {
        return {
          error: genericPayloadError,
          ok: false,
          status: 400,
        };
      }

      for (const [nestedKey, nestedValue] of Object.entries(nestedRecord)) {
        const normalizedNestedKey = normalizeFieldKey(nestedKey);

        if (
          isForbiddenField(normalizedNestedKey) ||
          !nestedAllowlist.has(normalizedNestedKey) ||
          isObjectLike(nestedValue)
        ) {
          return {
            error: genericPayloadError,
            ok: false,
            status: 400,
          };
        }
      }

      continue;
    }

    if (isObjectLike(value)) {
      return {
        error: genericPayloadError,
        ok: false,
        status: 400,
      };
    }
  }

  return {
    booking,
    ok: true,
  };
}

function buildDescription({
  booking,
  bookingReference,
  companyName,
  dropoffLocation,
  pickupLocation,
  route,
  travelerName,
}: {
  booking: Record<string, unknown>;
  bookingReference: string;
  companyName: string;
  dropoffLocation: string;
  pickupLocation: string;
  route: string;
  travelerName: string;
}) {
  const driverDetails = [
    textField(booking, "driver_name", "driverName"),
    textField(booking, "driver_plate_number", "driverPlate", "plate"),
    textField(booking, "driver_contact", "driverContact"),
  ].filter(Boolean);
  const descriptionLines = [
    ["Booking", bookingReference],
    ["Status", textField(booking, "status")],
    ["Customer", companyName],
    ["Passenger", travelerName],
    [
      "Booker",
      textField(booking, "booker_name") ||
        nestedTextField(booking, "bookers", "booker_name", "name"),
    ],
    ["Pickup", pickupLocation],
    ["Dropoff", dropoffLocation],
    ["Route", route],
    ["Flight", textField(booking, "flight_no", "flightNumber", "flight_number", "flight")],
    ["Vehicle", textField(booking, "vehicle")],
    ["Pax", textField(booking, "pax")],
    ["Driver", driverDetails.join(" / ")],
  ];

  return descriptionLines
    .map(([label, value]) => (value ? `${label}: ${value}` : ""))
    .filter(Boolean)
    .join("\n");
}

function resolveStartDateTime(booking: Record<string, unknown>) {
  const explicitDateTime = textField(
    booking,
    "pickup_at",
    "pickupAt",
    "pickup_datetime",
    "pickupDateTime",
  );
  const explicitDate = textField(booking, "pickup_date", "pickupDate", "date");
  const pickupTime = textField(booking, "pickup_time", "pickupTime", "time");
  const jobCard = rawTextField(booking, "job_card", "jobCard");

  return (
    combineDateTime(parseDateParts(explicitDateTime), parseTimeParts(explicitDateTime)) ||
    combineDateTime(parseDateParts(explicitDateTime), parseTimeParts(pickupTime)) ||
    combineDateTime(parseDateParts(explicitDate), parseTimeParts(pickupTime)) ||
    combineDateTime(parseDateParts(jobCard), parseTimeParts(pickupTime))
  );
}

function combineDateTime(
  date: Pick<CalendarDateTimeParts, "day" | "month" | "year"> | null,
  time: Pick<CalendarDateTimeParts, "hour" | "minute"> | null,
): CalendarDateTimeParts | null {
  if (!date || !time) {
    return null;
  }

  const candidate = {
    ...date,
    ...time,
  };

  return isValidDateTime(candidate) ? candidate : null;
}

function parseDateParts(value: string) {
  const text = clean(value);

  if (!text) {
    return null;
  }

  const isoMatch = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);

  if (isoMatch) {
    return {
      day: Number(isoMatch[3]),
      month: Number(isoMatch[2]),
      year: Number(isoMatch[1]),
    };
  }

  const displayMatch = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/);

  if (!displayMatch) {
    return null;
  }

  const month = monthNumbers[displayMatch[2].toLowerCase()];

  return month
    ? {
        day: Number(displayMatch[1]),
        month,
        year: Number(displayMatch[3]),
      }
    : null;
}

function parseTimeParts(value: string) {
  const text = clean(value);

  if (!text || /^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    return null;
  }

  const meridiemMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);

  if (meridiemMatch) {
    const hour = Number(meridiemMatch[1]);
    const meridiem = meridiemMatch[3].toLowerCase();
    const adjustedHour =
      meridiem === "pm" && hour < 12
        ? hour + 12
        : meridiem === "am" && hour === 12
          ? 0
          : hour;

    return {
      hour: adjustedHour,
      minute: Number(meridiemMatch[2] || "0"),
    };
  }

  const colonMatch = text.match(/(?:^|[T\s])(\d{1,2}):(\d{2})\b/);

  if (colonMatch) {
    return {
      hour: Number(colonMatch[1]),
      minute: Number(colonMatch[2]),
    };
  }

  const hourSuffixMatch = text.match(/\b(\d{3,4})\s*(?:hrs?|h)\b/i);
  const plainTimeMatch = text.match(/^\d{3,4}$/);
  const compactTime = hourSuffixMatch?.[1] || plainTimeMatch?.[0] || "";

  if (!compactTime) {
    return null;
  }

  const paddedTime = compactTime.padStart(4, "0");

  return {
    hour: Number(paddedTime.slice(0, 2)),
    minute: Number(paddedTime.slice(2, 4)),
  };
}

function isValidDateTime(value: CalendarDateTimeParts) {
  if (
    !Number.isInteger(value.year) ||
    !Number.isInteger(value.month) ||
    !Number.isInteger(value.day) ||
    !Number.isInteger(value.hour) ||
    !Number.isInteger(value.minute) ||
    value.year < 2000 ||
    value.year > 2100 ||
    value.month < 1 ||
    value.month > 12 ||
    value.hour < 0 ||
    value.hour > 23 ||
    value.minute < 0 ||
    value.minute > 59
  ) {
    return false;
  }

  const date = new Date(Date.UTC(value.year, value.month - 1, value.day));

  return (
    date.getUTCFullYear() === value.year &&
    date.getUTCMonth() === value.month - 1 &&
    date.getUTCDate() === value.day
  );
}

function addMinutes(value: CalendarDateTimeParts, minutes: number) {
  const date = new Date(
    Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute) +
      minutes * 60 * 1000,
  );

  return {
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

function buildIcs(
  calendarEvent: AdminBookingCalendarEventData,
  startsAt: CalendarDateTimeParts,
  endsAt: CalendarDateTimeParts,
  now: Date,
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Prestige Limo Ops//Admin Booking Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-TIMEZONE:${adminBookingCalendarTimezone}`,
    "BEGIN:VEVENT",
    `UID:${slugify(calendarEvent.booking_reference)}-${formatIcsDateTime(startsAt)}@prestige-limo-ops`,
    `DTSTAMP:${formatUtcDateTime(now)}`,
    `DTSTART:${formatIcsDateTime(startsAt)}`,
    `DTEND:${formatIcsDateTime(endsAt)}`,
    `SUMMARY:${escapeIcsText(calendarEvent.title)}`,
    `LOCATION:${escapeIcsText(calendarEvent.location)}`,
    `DESCRIPTION:${escapeIcsText(calendarEvent.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.flatMap(foldIcsLine).join("\r\n")}\r\n`;
}

function foldIcsLine(line: string) {
  const foldedLines: string[] = [];
  let remaining = line;

  while (remaining.length > 74) {
    foldedLines.push(remaining.slice(0, 74));
    remaining = ` ${remaining.slice(74)}`;
  }

  foldedLines.push(remaining);

  return foldedLines;
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function formatLocalDateTime(value: CalendarDateTimeParts) {
  return `${value.year}-${pad(value.month)}-${pad(value.day)}T${pad(value.hour)}:${pad(
    value.minute,
  )}:00`;
}

function formatIcsDateTime(value: CalendarDateTimeParts) {
  return `${value.year}${pad(value.month)}${pad(value.day)}T${pad(value.hour)}${pad(
    value.minute,
  )}00`;
}

function formatUtcDateTime(value: Date) {
  return `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(
    value.getUTCDate(),
  )}T${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}${pad(
    value.getUTCSeconds(),
  )}Z`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function splitRoute(value: string) {
  return value
    .split(/\s*>\s*/)
    .map((point) => clean(point))
    .filter(Boolean);
}

function textField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const cleaned = clean(value);

    if (cleaned) {
      return limitText(cleaned, 500);
    }
  }

  return "";
}

function rawTextField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (value !== null && value !== undefined) {
      const text = String(value).trim();

      if (text) {
        return limitText(text, 2000);
      }
    }
  }

  return "";
}

function nestedTextField(record: Record<string, unknown>, objectKey: string, ...keys: string[]) {
  const nestedRecord = asRecord(record[objectKey]);

  return nestedRecord ? textField(nestedRecord, ...keys) : "";
}

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function limitText(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength).trim() : value;
}

function normalizeFieldKey(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function isForbiddenField(normalizedKey: string) {
  return forbiddenFieldFragments.some((fragment) => normalizedKey.includes(fragment));
}

function isObjectLike(value: unknown) {
  return Boolean(value && typeof value === "object");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "saved-booking";
}
