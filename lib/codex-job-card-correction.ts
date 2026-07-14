export type CodexJobCardCorrectionBooking = {
  flight?: string | null;
  time?: string | null;
};

export type CodexJobCardCorrectionPreparation<T extends CodexJobCardCorrectionBooking> = {
  changedFields: string[];
  correctedBooking: T;
  reason: string;
  status: "inactive" | "needs_exact_value" | "ready";
};

function clean(value: string | number | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePickupTime(value: string) {
  const cleaned = clean(value).toLowerCase();
  const meridiemMatch = cleaned.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/);

  if (meridiemMatch) {
    const hour = Number(meridiemMatch[1]);
    const minute = Number(meridiemMatch[2] || "00");

    if (hour < 1 || hour > 12) {
      return "";
    }

    const normalizedHour = (hour % 12) + (meridiemMatch[3] === "pm" ? 12 : 0);

    return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const twentyFourHourMatch = cleaned.match(/^(\d{1,2})(?::?([0-5]\d))$/);

  if (!twentyFourHourMatch) {
    return "";
  }

  const hour = Number(twentyFourHourMatch[1]);
  const minute = Number(twentyFourHourMatch[2]);

  if (hour > 23) {
    return "";
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeFlightNumber(value: string) {
  const cleaned = clean(value);

  if (/^(?:none|remove|removed|blank|no flight)$/i.test(cleaned)) {
    return { ok: true as const, value: "" };
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{0,19}$/.test(cleaned)) {
    return { ok: false as const, value: "" };
  }

  return { ok: true as const, value: cleaned.toUpperCase() };
}

function rejected<T extends CodexJobCardCorrectionBooking>(booking: T, reason: string) {
  return {
    changedFields: [],
    correctedBooking: { ...booking },
    reason,
    status: "needs_exact_value" as const,
  };
}

export function prepareCodexJobCardCorrection<T extends CodexJobCardCorrectionBooking>(
  booking: T,
  instruction: string,
): CodexJobCardCorrectionPreparation<T> {
  const cleanedInstruction = instruction.trim();

  if (!cleanedInstruction) {
    return {
      changedFields: [],
      correctedBooking: { ...booking },
      reason: "",
      status: "inactive",
    };
  }

  const instructionLines = cleanedInstruction
    .split(/[;\n]+/)
    .map((line) => clean(line))
    .filter(Boolean);
  const changes: Partial<Pick<CodexJobCardCorrectionBooking, "flight" | "time">> = {};
  const seenFields = new Set<"flight" | "time">();

  for (const line of instructionLines) {
    const pickupTimeMatch = line.match(/^pickup\s+time\s*[:=]\s*(.+)$/i);

    if (pickupTimeMatch) {
      if (seenFields.has("time")) {
        return rejected(booking, "Pickup time was supplied more than once. Enter one exact value.");
      }

      const normalizedTime = normalizePickupTime(pickupTimeMatch[1]);

      if (!normalizedTime) {
        return rejected(booking, "Pickup time must be a valid time, for example Pickup time: 14:30.");
      }

      seenFields.add("time");
      changes.time = normalizedTime;
      continue;
    }

    const flightNumberMatch = line.match(/^flight(?:\s+number)?\s*[:=]\s*(.+)$/i);

    if (flightNumberMatch) {
      if (seenFields.has("flight")) {
        return rejected(booking, "Flight number was supplied more than once. Enter one exact value.");
      }

      const normalizedFlight = normalizeFlightNumber(flightNumberMatch[1]);

      if (!normalizedFlight.ok) {
        return rejected(booking, "Flight number must contain only letters, numbers, spaces, or hyphens.");
      }

      seenFields.add("flight");
      changes.flight = normalizedFlight.value;
      continue;
    }

    if (/pickup\s+time/i.test(line)) {
      return rejected(booking, "Use exact format: Pickup time: 14:30. Nothing was changed.");
    }

    if (/flight(?:\s+number)?/i.test(line)) {
      return rejected(booking, "Use exact format: Flight number: SQ123. Nothing was changed.");
    }

    return rejected(
      booking,
      "Only pickup time and flight number corrections are supported in this safe first step. Nothing was changed.",
    );
  }

  const correctedBooking = {
    ...booking,
    ...changes,
  };
  const changedFields: string[] = [];

  if (Object.hasOwn(changes, "time") && clean(changes.time) !== clean(booking.time)) {
    changedFields.push(`Pickup time: ${clean(booking.time) || "blank"} → ${clean(changes.time)}`);
  }

  if (Object.hasOwn(changes, "flight") && clean(changes.flight) !== clean(booking.flight)) {
    changedFields.push(
      `Flight number: ${clean(booking.flight) || "blank"} → ${clean(changes.flight) || "removed"}`,
    );
  }

  if (changedFields.length === 0) {
    return rejected(booking, "Enter a value different from the saved booking. Nothing was changed.");
  }

  return {
    changedFields,
    correctedBooking,
    reason: "",
    status: "ready",
  };
}
