import { createHash } from "node:crypto";

import type { SafeDriverJobPayload } from "./driver-job-link.ts";

type CalendarParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
};

export type DriverJobGoogleCalendarEvent = {
  description: string;
  end: {
    dateTime: string;
    timeZone: "Asia/Singapore";
  };
  extendedProperties: {
    private: {
      prestigeBookingReference: string;
      prestigeDriverId: string;
      prestigeSource: "prestige_limo_ops_driver_job";
    };
  };
  id: string;
  location: string;
  reminders: {
    overrides: [{ method: "popup"; minutes: 60 }];
    useDefault: false;
  };
  source: {
    title: "Open Driver Job";
    url: string;
  };
  start: {
    dateTime: string;
    timeZone: "Asia/Singapore";
  };
  summary: string;
};

type DriverJobGoogleCalendarEventResult =
  | {
      event: DriverJobGoogleCalendarEvent;
      ok: true;
      revision: string;
    }
  | {
      error: string;
      ok: false;
      status: 400;
    };

const timezone = "Asia/Singapore" as const;
const monthIndexByName: Record<string, number> = {
  apr: 4,
  aug: 8,
  dec: 12,
  feb: 2,
  jan: 1,
  jul: 7,
  jun: 6,
  mar: 3,
  may: 5,
  nov: 11,
  oct: 10,
  sep: 9,
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function parseDate(value: string): Pick<CalendarParts, "day" | "month" | "year"> | null {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    return {
      day: Number(isoMatch[3]),
      month: Number(isoMatch[2]),
      year: Number(isoMatch[1]),
    };
  }

  const displayMatch = value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  const month = displayMatch ? monthIndexByName[displayMatch[2].slice(0, 3).toLowerCase()] : 0;

  return displayMatch && month
    ? { day: Number(displayMatch[1]), month, year: Number(displayMatch[3]) }
    : null;
}

function parseTime(value: string): Pick<CalendarParts, "hour" | "minute"> | null {
  const compactMatch = value.match(/\b(\d{2})(\d{2})(?:hrs)?\b/i);
  const colonMatch = value.match(/\b(\d{1,2}):(\d{2})\b/);
  const hour = Number(compactMatch?.[1] ?? colonMatch?.[1]);
  const minute = Number(compactMatch?.[2] ?? colonMatch?.[2]);

  return Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(minute) && minute >= 0 && minute <= 59
    ? { hour, minute }
    : null;
}

function pickupParts(payload: SafeDriverJobPayload): CalendarParts | null {
  const date = parseDate(clean(payload.pickupDate)) || parseDate(clean(payload.pickupDateTime));
  const time = parseTime(clean(payload.pickupTime)) || parseTime(clean(payload.pickupDateTime));

  if (!date || !time) {
    return null;
  }

  const validationDate = new Date(Date.UTC(date.year, date.month - 1, date.day));

  if (
    validationDate.getUTCFullYear() !== date.year ||
    validationDate.getUTCMonth() !== date.month - 1 ||
    validationDate.getUTCDate() !== date.day
  ) {
    return null;
  }

  return { ...date, ...time };
}

function addMinutes(value: CalendarParts, minutes: number): CalendarParts {
  const date = new Date(
    Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute) + minutes * 60_000,
  );

  return {
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatGoogleLocal(value: CalendarParts) {
  return `${value.year}-${pad(value.month)}-${pad(value.day)}T${pad(value.hour)}:${pad(value.minute)}:00+08:00`;
}

function safeDriverJobUrl(value: string) {
  try {
    const url = new URL(value);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !/^\/driver-job\/[^/]+$/.test(url.pathname)
    ) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

function calendarEventText(payload: SafeDriverJobPayload, driverJobUrl: string) {
  const reference = clean(payload.reference);
  const title = ["Prestige", clean(payload.bookingTypeLabel) || clean(payload.bookingType), reference]
    .filter(Boolean)
    .join(" - ");
  const description = [
    `Booking: ${reference}`,
    clean(payload.route) ? `Route: ${clean(payload.route)}` : "",
    clean(payload.flightNumber) ? `Flight: ${clean(payload.flightNumber)}` : "",
    `Open Driver Job: ${driverJobUrl}`,
    "Private driver link - do not share this calendar event.",
    "Use this shortcut or the original Driver Job Link for latest instructions and status reporting.",
  ].filter(Boolean).join("\n");

  return { description, reference, title };
}

function deterministicGoogleEventId(driverId: number, reference: string) {
  return createHash("sha256")
    .update(`prestige-driver:${driverId}:booking:${reference}`)
    .digest("hex")
    .slice(0, 52);
}

export function buildDriverJobGoogleCalendarEvent(
  payload: SafeDriverJobPayload,
  driverId: number,
  driverJobUrlValue: string,
): DriverJobGoogleCalendarEventResult {
  const startsAt = pickupParts(payload);
  const driverJobUrl = safeDriverJobUrl(driverJobUrlValue);
  const safeDriverId = Number.isSafeInteger(driverId) && driverId > 0 ? driverId : 0;
  const eventText = calendarEventText(payload, driverJobUrl);

  if (!eventText.reference || !startsAt || !driverJobUrl || !safeDriverId) {
    return {
      error: "Driver Google Calendar requires a verified driver, booking reference, pickup date/time, and Driver Job URL.",
      ok: false,
      status: 400,
    };
  }

  const endsAt = addMinutes(startsAt, 90);
  const revision = createHash("sha256")
    .update(JSON.stringify({
      description: eventText.description,
      end: formatGoogleLocal(endsAt),
      location: clean(payload.pickupLocation),
      start: formatGoogleLocal(startsAt),
      title: eventText.title,
    }))
    .digest("hex");

  return {
    event: {
      description: eventText.description,
      end: {
        dateTime: formatGoogleLocal(endsAt),
        timeZone: timezone,
      },
      extendedProperties: {
        private: {
          prestigeBookingReference: eventText.reference,
          prestigeDriverId: String(safeDriverId),
          prestigeSource: "prestige_limo_ops_driver_job",
        },
      },
      id: deterministicGoogleEventId(safeDriverId, eventText.reference),
      location: clean(payload.pickupLocation),
      reminders: {
        overrides: [{ method: "popup", minutes: 60 }],
        useDefault: false,
      },
      source: {
        title: "Open Driver Job",
        url: driverJobUrl,
      },
      start: {
        dateTime: formatGoogleLocal(startsAt),
        timeZone: timezone,
      },
      summary: eventText.title,
    },
    ok: true,
    revision,
  };
}
