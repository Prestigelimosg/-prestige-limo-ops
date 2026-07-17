import type { SafeDriverJobPayload } from "./driver-job-link.ts";

export const driverJobCalendarEventVersion = "driver-job-calendar-v1";

type CalendarParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
};

type DriverJobCalendarDownloadResult =
  | {
      filename: string;
      ics: string;
      ok: true;
      payload: SafeDriverJobPayload;
      sequence: number;
      timezone: "Asia/Singapore";
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

function safeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "assigned-job";
}

function safeUidReference(value: string) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
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

function formatLocal(value: CalendarParts) {
  return `${value.year}${pad(value.month)}${pad(value.day)}T${pad(value.hour)}${pad(value.minute)}00`;
}

function formatUtc(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
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

function foldLine(line: string) {
  const lines: string[] = [];
  let remaining = line;

  while (remaining.length > 74) {
    lines.push(remaining.slice(0, 74));
    remaining = ` ${remaining.slice(74)}`;
  }

  lines.push(remaining);
  return lines;
}

function calendarSequenceFromUpdatedAt(value: string | undefined) {
  const updatedAt = new Date(clean(value)).getTime();
  const sequenceEpoch = Date.UTC(2020, 0, 1);

  if (!Number.isFinite(updatedAt) || updatedAt < sequenceEpoch) {
    return 0;
  }

  return Math.min(2_147_483_647, Math.floor((updatedAt - sequenceEpoch) / 1000));
}

function calendarSequence(payload: SafeDriverJobPayload) {
  return calendarSequenceFromUpdatedAt(payload.scheduleUpdatedAt);
}

export function buildDriverJobCalendarDownload(
  payload: SafeDriverJobPayload,
  driverJobUrlValue: string,
  now = new Date(),
): DriverJobCalendarDownloadResult {
  const reference = clean(payload.reference);
  const startsAt = pickupParts(payload);
  const driverJobUrl = safeDriverJobUrl(driverJobUrlValue);

  if (!reference || !startsAt || !driverJobUrl) {
    return {
      error: "Driver calendar requires a valid booking reference, pickup date/time, and Driver Job URL.",
      ok: false,
      status: 400,
    };
  }

  const endsAt = addMinutes(startsAt, 90);
  const sequence = calendarSequence(payload);
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
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Prestige Limo Ops//Driver Job Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-TIMEZONE:${timezone}`,
    "BEGIN:VEVENT",
    `UID:driver-job-${safeUidReference(reference)}@prestige-limo-ops`,
    `DTSTAMP:${formatUtc(now)}`,
    `SEQUENCE:${sequence}`,
    `DTSTART;TZID=${timezone}:${formatLocal(startsAt)}`,
    `DTEND;TZID=${timezone}:${formatLocal(endsAt)}`,
    `SUMMARY:${escapeIcs(title)}`,
    `LOCATION:${escapeIcs(clean(payload.pickupLocation))}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `URL:${driverJobUrl}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcs(`Prestige pickup reminder: ${title}`)}`,
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return {
    filename: `prestige-driver-job-${safeSlug(reference)}.ics`,
    ics: `${lines.flatMap(foldLine).join("\r\n")}\r\n`,
    ok: true,
    payload,
    sequence,
    timezone,
  };
}
