export type BookingType = "MNG" | "DEP" | "TRF" | "DSP";

export type RateRules = Partial<Record<BookingType, number>>;

export type DriverPayoutRule = {
  min?: number;
  max?: number;
  amount?: number;
  perHour?: boolean;
};

export type DriverPayoutRules = Partial<Record<BookingType, DriverPayoutRule>>;

export type RateSettings = {
  customerRates: Required<RateRules>;
  driverPayoutRules: Required<DriverPayoutRules>;
  midnightSurcharge: number;
  extraStopSurcharge: number;
  midnightPayout: number;
  extraStopPayout: number;
  childSeatCustomerSurcharge: number;
  childSeatDriverPayout: number;
};

export type PricingResult = {
  customerRate: number;
  customerRateUnit: string;
  driverPayoutMin: number;
  driverPayoutMax: number;
  driverPayoutUnit: string;
  driverPayoutSource: string;
  midnightSurcharge: number;
  midnightPayout: number;
  extraStopCount: number;
  extraStopSurcharge: number;
  extraStopCustomerAmount: number;
  extraStopPayout: number;
  extraStopDriverAmount: number;
  childSeatCount: number;
  childSeatCustomerSurcharge: number;
  childSeatCustomerAmount: number;
  childSeatDriverPayout: number;
  childSeatDriverAmount: number;
  pricingSource: string;
};

type PricingRecord = {
  customer_rates?: RateRules | null;
  driver_payout_rules?: DriverPayoutRules | null;
};

type PricingInput = {
  bookingType?: string | null;
  time?: string | null;
  extraStopCount?: string | number | null;
  childSeatRequired?: string | boolean | null;
  childSeatCount?: string | number | null;
};

export const defaultCustomerRates: Required<RateRules> = {
  MNG: 85,
  DEP: 75,
  TRF: 55,
  DSP: 65,
};

export const defaultDriverPayoutRules: Required<DriverPayoutRules> = {
  MNG: { min: 65, max: 75 },
  DEP: { min: 55, max: 65 },
  TRF: { min: 45, max: 70 },
  DSP: { amount: 50, perHour: true },
};

export const defaultMidnightSurcharge = 15;
export const defaultMidnightPayout = 10;
export const defaultExtraStopSurcharge = 15;
export const defaultExtraStopPayout = 10;
export const defaultChildSeatCustomerSurcharge = 15;
export const defaultChildSeatDriverPayout = 10;

export const initialRateSettings: RateSettings = {
  customerRates: defaultCustomerRates,
  driverPayoutRules: defaultDriverPayoutRules,
  midnightSurcharge: defaultMidnightSurcharge,
  extraStopSurcharge: defaultExtraStopSurcharge,
  midnightPayout: defaultMidnightPayout,
  extraStopPayout: defaultExtraStopPayout,
  childSeatCustomerSurcharge: defaultChildSeatCustomerSurcharge,
  childSeatDriverPayout: defaultChildSeatDriverPayout,
};

function clean(value: string | null | undefined) {
  return (value ?? "").trim();
}

export function numericRate(value: string | number | null | undefined) {
  const parsedValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

export function normalizeExtraStopCount(value: string | number | null | undefined) {
  const parsedValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return 0;
  }

  return Math.floor(parsedValue);
}

export function normalizeChildSeatCount(
  childSeatRequired: string | boolean | null | undefined,
  childSeatCount: string | number | null | undefined,
) {
  const parsedValue = typeof childSeatCount === "number" ? childSeatCount : Number(childSeatCount);
  const required =
    typeof childSeatRequired === "boolean"
      ? childSeatRequired
      : /^(?:yes|true|1)$/i.test(clean(String(childSeatRequired ?? "")));

  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return Math.floor(parsedValue);
  }

  return required ? 0 : 0;
}

function normalizePickupTimeForStorage(value: string | null | undefined) {
  const rawValue = clean(value).toLowerCase();
  const amPmMatch = rawValue.match(/\b(\d{1,2})(?::?(\d{2}))?\s*(am|pm)\b/);

  if (amPmMatch) {
    const rawHour = Number(amPmMatch[1]);
    const rawMinute = Number(amPmMatch[2] ?? "0");

    if (
      Number.isInteger(rawHour) &&
      Number.isInteger(rawMinute) &&
      rawHour >= 1 &&
      rawHour <= 12 &&
      rawMinute >= 0 &&
      rawMinute <= 59
    ) {
      const hour =
        amPmMatch[3] === "am"
          ? rawHour % 12
          : rawHour === 12
            ? 12
            : rawHour + 12;

      return `${String(hour).padStart(2, "0")}${String(rawMinute).padStart(2, "0")}`;
    }
  }

  const digits = rawValue.replace(/\D/g, "");

  if (digits.length >= 4) {
    return digits.slice(0, 4);
  }

  if (digits.length > 0) {
    return `${digits.padStart(2, "0")}00`;
  }

  return "";
}

export function normalizeBookingType(value: string | null | undefined): BookingType {
  const bookingType = clean(value).toUpperCase();

  if (bookingType === "DEP" || bookingType === "TRF" || bookingType === "DSP" || bookingType === "MNG") {
    return bookingType;
  }

  if (/\b(?:HOURLY|DISPOSAL|STANDBY|WAIT\s+\d+\s*(?:HOURS?|HRS?))\b/.test(bookingType)) {
    return "DSP";
  }

  if (/\b(?:DEP|DEPARTURE|DEPART|AIRPORT\s+DROP|DROP\s*OFF\s+(?:AT\s+)?AIRPORT|TO\s+AIRPORT)\b/.test(bookingType)) {
    return "DEP";
  }

  if (/\b(?:TRF|TRANSFER|POINT\s*TO\s*POINT|CITY\s+TRANSFER)\b/.test(bookingType)) {
    return "TRF";
  }

  if (/\b(?:MNG|ARRIVAL|ARRIVING|MEET\s*(?:AND|&)\s*GREET|AIRPORT\s+PICK)\b/.test(bookingType)) {
    return "MNG";
  }

  return "MNG";
}

export function isMidnightPickup(value: string | null | undefined) {
  const digits = normalizePickupTimeForStorage(value);

  if (digits.length < 4) {
    return false;
  }

  const hour = Number(digits.slice(0, 2));
  const minute = Number(digits.slice(2, 4));

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return false;
  }

  const minutes = hour * 60 + minute;

  return minutes >= 23 * 60 || minutes < 7 * 60;
}

export function rateFromRules(rules: RateRules | null | undefined, bookingType: BookingType) {
  const rate = rules?.[bookingType];

  return typeof rate === "number" && Number.isFinite(rate) ? rate : null;
}

export function hasRateRules(rules: RateRules | DriverPayoutRules | null | undefined) {
  return Boolean(rules && Object.keys(rules).length > 0);
}

export function payoutFromRules(
  rules: DriverPayoutRules | null | undefined,
  bookingType: BookingType,
  settings: RateSettings,
) {
  return rules?.[bookingType] ?? settings.driverPayoutRules[bookingType];
}

export function payoutAmountFromRule(rule: DriverPayoutRule) {
  return rule.amount ?? rule.max ?? rule.min ?? 0;
}

export function resolvePricing(
  bookingValue: PricingInput,
  company: PricingRecord,
  nameRecord: PricingRecord | null,
  settings: RateSettings,
  driverRecord: PricingRecord | null = null,
): PricingResult {
  const bookingType = normalizeBookingType(bookingValue.bookingType);
  const isMidnight = isMidnightPickup(bookingValue.time);
  const extraStopCount = normalizeExtraStopCount(bookingValue.extraStopCount);
  const extraStopSurcharge = bookingType === "DSP" ? 0 : settings.extraStopSurcharge;
  const extraStopPayout = bookingType === "DSP" ? 0 : settings.extraStopPayout;
  const childSeatCount = normalizeChildSeatCount(
    bookingValue.childSeatRequired,
    bookingValue.childSeatCount,
  );
  let customerRate = rateFromRules(nameRecord?.customer_rates, bookingType);
  let pricingSource = "default";

  if (customerRate !== null) {
    pricingSource = "boss";
  } else if (hasRateRules(company.customer_rates)) {
    customerRate = rateFromRules(company.customer_rates, bookingType);

    if (customerRate !== null) {
      pricingSource = "company";
    }
  }

  if (customerRate === null) {
    customerRate = settings.customerRates[bookingType];
  }

  let payoutRule = payoutFromRules(company.driver_payout_rules, bookingType, settings);
  let driverPayoutSource = hasRateRules(company.driver_payout_rules) ? "company" : "default";

  if (
    hasRateRules(driverRecord?.driver_payout_rules) &&
    driverRecord?.driver_payout_rules?.[bookingType]
  ) {
    payoutRule = driverRecord.driver_payout_rules[bookingType];
    driverPayoutSource = "driver";
  }

  const payoutAmount = payoutRule.amount ?? payoutRule.min ?? 0;
  const payoutMin = payoutRule.min ?? payoutAmount;
  const payoutMax = payoutRule.max ?? payoutAmount;
  const unit = bookingType === "DSP" || payoutRule.perHour ? "hour" : "job";

  return {
    customerRate,
    customerRateUnit: bookingType === "DSP" ? "hour" : "job",
    driverPayoutMin: payoutMin,
    driverPayoutMax: payoutMax,
    driverPayoutUnit: unit,
    driverPayoutSource,
    midnightSurcharge: isMidnight ? settings.midnightSurcharge : 0,
    midnightPayout: isMidnight ? settings.midnightPayout : 0,
    extraStopCount,
    extraStopSurcharge,
    extraStopCustomerAmount: extraStopCount * extraStopSurcharge,
    extraStopPayout,
    extraStopDriverAmount: extraStopCount * extraStopPayout,
    childSeatCount,
    childSeatCustomerSurcharge: settings.childSeatCustomerSurcharge,
    childSeatCustomerAmount: childSeatCount * settings.childSeatCustomerSurcharge,
    childSeatDriverPayout: settings.childSeatDriverPayout,
    childSeatDriverAmount: childSeatCount * settings.childSeatDriverPayout,
    pricingSource,
  };
}

export function calculateProfit(
  pricing: PricingResult,
  manualCustomerPriceOverride = "",
  manualDriverPayoutOverride = "",
) {
  const manualCustomerPrice = clean(manualCustomerPriceOverride)
    ? numericRate(manualCustomerPriceOverride)
    : null;
  const manualDriverPayout = clean(manualDriverPayoutOverride)
    ? numericRate(manualDriverPayoutOverride)
    : null;
  const driverPayout =
    manualDriverPayout ??
    pricing.driverPayoutMin +
      pricing.midnightPayout +
      pricing.extraStopDriverAmount +
      pricing.childSeatDriverAmount;
  const customerPrice =
    manualCustomerPrice ??
    pricing.customerRate +
      pricing.midnightSurcharge +
      pricing.extraStopCustomerAmount +
      pricing.childSeatCustomerAmount;

  return {
    customerPrice,
    driverPayout,
    profit: customerPrice - driverPayout,
    customerPriceSource: manualCustomerPrice !== null ? "manual" : pricing.pricingSource,
    driverPayoutSource: manualDriverPayout !== null ? "manual" : pricing.driverPayoutSource,
  };
}
