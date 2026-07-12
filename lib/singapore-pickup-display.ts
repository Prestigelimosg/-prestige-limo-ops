const singaporeTimeZone = "Asia/Singapore";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formattedSingaporeParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: singaporeTimeZone,
    year: "numeric",
  }).formatToParts(date);
  const partValue = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const hour = partValue("hour") === "24" ? "00" : partValue("hour");

  return {
    day: partValue("day"),
    hour,
    minute: partValue("minute"),
    month: partValue("month"),
    year: partValue("year"),
  };
}

export function formatSingaporePickupDisplay(value: string | null | undefined, fallback = "") {
  const cleaned = String(value ?? "").trim();

  if (!cleaned) {
    return fallback;
  }

  const bareLocalMatch = cleaned.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/,
  );

  if (bareLocalMatch) {
    const [, year, month, day, hour, minute] = bareLocalMatch;
    const monthName = monthNames[Number(month) - 1];

    return monthName ? `${day} ${monthName} ${year}, ${hour}${minute}hrs SGT` : cleaned;
  }

  const parsed = new Date(cleaned);

  if (Number.isNaN(parsed.getTime())) {
    return cleaned;
  }

  const { day, hour, minute, month, year } = formattedSingaporeParts(parsed);

  return day && month && year && hour && minute
    ? `${day} ${month} ${year}, ${hour}${minute}hrs SGT`
    : cleaned;
}
