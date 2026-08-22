import {
  calculateDspCustomerInvoiceAmountCents,
  initialRateSettings,
  resolvePricing,
  type BookingType,
  type DriverPayoutRules,
  type RateRules,
  type RateSettings,
} from "./pricing";

export type CustomerInvoiceRateSetupRecord = {
  companies?: Array<{
    card_option_default_enabled?: boolean | null;
    customer_rates?: RateRules | null;
    driver_payout_rules?: DriverPayoutRules | null;
    id?: number | null;
  }>;
  settings?: Partial<{
    child_seat_customer_surcharge: number | null;
    child_seat_driver_payout: number | null;
    customer_rates: RateRules;
    driver_payout_rules: DriverPayoutRules;
    extra_stop_payout: number | null;
    extra_stop_surcharge: number | null;
    midnight_payout: number | null;
    midnight_surcharge: number | null;
  }> | null;
  travelers?: Array<{
    card_option_default_enabled?: boolean | null;
    company_id?: number | null;
    customer_rates?: RateRules | null;
    driver_payout_rules?: DriverPayoutRules | null;
    id?: number | null;
  }>;
};

export type CustomerDspInvoiceReviewInput = {
  actualMinutes: number | null | undefined;
  billingEndedAt?: string | null | undefined;
  billingStartedAt?: string | null | undefined;
  childSeatCount: number | null | undefined;
  companyId: number | null | undefined;
  extraStopCount: number | null | undefined;
  pickupAt: string | null | undefined;
  travelerId: number | null | undefined;
  vehicleType: string | null | undefined;
};

export function customerInvoiceCardOptionDefaultEnabled(
  input: Pick<CustomerDspInvoiceReviewInput, "companyId" | "travelerId">,
  rateSetup: CustomerInvoiceRateSetupRecord,
) {
  const companyRecord =
    rateSetup.companies?.find((company) => company.id === input.companyId) || null;
  const travelerRecord =
    input.companyId && input.travelerId
      ? rateSetup.travelers?.find(
          (traveler) =>
            traveler.id === input.travelerId &&
            traveler.company_id === input.companyId,
        ) || null
      : null;

  if (typeof travelerRecord?.card_option_default_enabled === "boolean") {
    return travelerRecord.card_option_default_enabled;
  }

  return companyRecord?.card_option_default_enabled === true;
}

export type CustomerInvoiceRateReviewInput = CustomerDspInvoiceReviewInput & {
  bookingType: string | null | undefined;
};

export type CustomerInvoiceRateReview = {
  actualMinutes: number | null;
  amountCents: number;
  baseAmountCents: number;
  billableHours: number | null;
  billableMinutes: number | null;
  bookingType: BookingType;
  customerRateSource: string;
  customerRateUnit: "hour" | "job";
  rateCents: number;
  surchargeAmountCents: number;
};

export type CustomerDspInvoiceReview = CustomerInvoiceRateReview & {
  actualMinutes: number;
  billableHours: number;
  billableMinutes: number;
  hourlyRateCents: number;
};

const customerDspBillingMaxActualMinutes = 60 * 24 * 30;

export function calculateCustomerDspBillingActualMinutes(
  pickupAt: string | null | undefined,
  jcEndedAt: string | null | undefined,
) {
  const pickupTime = new Date(String(pickupAt ?? "")).getTime();
  const jcEndTime = new Date(String(jcEndedAt ?? "")).getTime();

  if (
    !Number.isFinite(pickupTime) ||
    !Number.isFinite(jcEndTime) ||
    jcEndTime <= pickupTime
  ) {
    return null;
  }

  const actualMinutes = Math.floor((jcEndTime - pickupTime) / 60_000);

  return actualMinutes >= 1 && actualMinutes <= customerDspBillingMaxActualMinutes
    ? actualMinutes
    : null;
}

function finiteRate(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function rateSettings(rateSetup: CustomerInvoiceRateSetupRecord): RateSettings {
  const settings = rateSetup.settings;

  return {
    customerRates: {
      ...initialRateSettings.customerRates,
      ...(settings?.customer_rates || {}),
    },
    driverPayoutRules: {
      ...initialRateSettings.driverPayoutRules,
      ...(settings?.driver_payout_rules || {}),
    },
    midnightSurcharge: finiteRate(
      settings?.midnight_surcharge,
      initialRateSettings.midnightSurcharge,
    ),
    extraStopSurcharge: finiteRate(
      settings?.extra_stop_surcharge,
      initialRateSettings.extraStopSurcharge,
    ),
    midnightPayout: finiteRate(settings?.midnight_payout, initialRateSettings.midnightPayout),
    extraStopPayout: finiteRate(settings?.extra_stop_payout, initialRateSettings.extraStopPayout),
    childSeatCustomerSurcharge: finiteRate(
      settings?.child_seat_customer_surcharge,
      initialRateSettings.childSeatCustomerSurcharge,
    ),
    childSeatDriverPayout: finiteRate(
      settings?.child_seat_driver_payout,
      initialRateSettings.childSeatDriverPayout,
    ),
  };
}

function singaporePickupClock(value: string | null | undefined) {
  const parsed = new Date(String(value ?? ""));

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-SG", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  }).formatToParts(parsed);
  const hour = parts.find((part) => part.type === "hour")?.value || "";
  const minute = parts.find((part) => part.type === "minute")?.value || "";

  return hour && minute ? `${hour}${minute}` : "";
}

const singaporeUtcOffsetMs = 8 * 60 * 60_000;
const millisecondsPerHour = 60 * 60_000;
const millisecondsPerDay = 24 * millisecondsPerHour;
const midnightWindowHourSlots = 8;

export function calculateCustomerDspMidnightFeeHours(
  billingStartedAt: string | null | undefined,
  billingEndedAt: string | null | undefined,
) {
  const startTime = new Date(String(billingStartedAt ?? "")).getTime();
  const endTime = new Date(String(billingEndedAt ?? "")).getTime();

  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    endTime <= startTime
  ) {
    return null;
  }

  const localStartTime = startTime + singaporeUtcOffsetMs;
  const localEndTime = endTime + singaporeUtcOffsetMs;
  const firstWindowDay = Math.floor(localStartTime / millisecondsPerDay) - 1;
  const lastWindowDay = Math.floor((localEndTime - 1) / millisecondsPerDay);
  let midnightFeeHours = 0;

  for (let day = firstWindowDay; day <= lastWindowDay; day += 1) {
    const windowStart = day * millisecondsPerDay + 23 * millisecondsPerHour;

    for (let slot = 0; slot < midnightWindowHourSlots; slot += 1) {
      const slotStart = windowStart + slot * millisecondsPerHour;
      const slotEnd = slotStart + millisecondsPerHour;

      if (localStartTime < slotEnd && localEndTime > slotStart) {
        midnightFeeHours += 1;
      }
    }
  }

  return midnightFeeHours;
}

export function customerInvoiceBookingType(
  value: string | null | undefined,
): BookingType | null {
  const bookingType = String(value ?? "").trim().toUpperCase();

  if (
    bookingType === "MNG" ||
    bookingType === "DEP" ||
    bookingType === "TRF" ||
    bookingType === "DSP"
  ) {
    return bookingType;
  }

  return null;
}

export function calculateCustomerInvoiceRateReview(
  input: CustomerInvoiceRateReviewInput,
  rateSetup: CustomerInvoiceRateSetupRecord,
): CustomerInvoiceRateReview | null {
  const bookingType = customerInvoiceBookingType(input.bookingType);

  if (!bookingType) {
    return null;
  }
  const companyRecord =
    rateSetup.companies?.find((company) => company.id === input.companyId) || null;
  const travelerRecord =
    rateSetup.travelers?.find(
      (traveler) =>
        traveler.id === input.travelerId &&
        (!input.companyId || traveler.company_id === input.companyId),
    ) || null;
  const resolvedRateSettings = rateSettings(rateSetup);
  const resolvedPricing = resolvePricing(
    {
      bookingType,
      childSeatCount: Number(input.childSeatCount) || 0,
      childSeatRequired: Number(input.childSeatCount) > 0,
      extraStopCount: Number(input.extraStopCount) || 0,
      time: singaporePickupClock(input.pickupAt),
      vehicleType: input.vehicleType || "AVF",
    },
    companyRecord || {},
    travelerRecord,
    resolvedRateSettings,
  );
  if (bookingType !== "DSP") {
    const surchargeAmountCents = Math.round(
      (resolvedPricing.midnightSurcharge +
        resolvedPricing.extraStopCustomerAmount +
        resolvedPricing.childSeatCustomerAmount) *
        100,
    );
    const baseAmountCents = Math.round(resolvedPricing.customerRate * 100);

    if (baseAmountCents <= 0) {
      return null;
    }

    return {
      actualMinutes: null,
      amountCents: baseAmountCents + surchargeAmountCents,
      baseAmountCents,
      billableHours: null,
      billableMinutes: null,
      bookingType,
      customerRateSource: resolvedPricing.pricingSource,
      customerRateUnit: "job",
      rateCents: baseAmountCents,
      surchargeAmountCents,
    };
  }

  const baseCalculation = calculateDspCustomerInvoiceAmountCents(input.actualMinutes, {
    ...resolvedPricing,
    midnightSurcharge: 0,
  });

  if (!baseCalculation) {
    return null;
  }

  const hasBillingInterval = Boolean(input.billingStartedAt || input.billingEndedAt);
  let pricing = resolvedPricing;

  if (hasBillingInterval) {
    const intervalActualMinutes = calculateCustomerDspBillingActualMinutes(
      input.billingStartedAt,
      input.billingEndedAt,
    );
    const midnightFeeHours = calculateCustomerDspMidnightFeeHours(
      input.billingStartedAt,
      input.billingEndedAt,
    );

    if (
      intervalActualMinutes !== baseCalculation.actualMinutes ||
      midnightFeeHours === null
    ) {
      return null;
    }

    pricing = {
      ...resolvedPricing,
      midnightSurcharge:
        resolvedRateSettings.midnightSurcharge * midnightFeeHours,
    };
  }

  const calculation = calculateDspCustomerInvoiceAmountCents(input.actualMinutes, pricing);

  if (!calculation) {
    return null;
  }

  return {
    actualMinutes: calculation.actualMinutes,
    amountCents: calculation.amountCents,
    baseAmountCents: calculation.baseAmountCents,
    billableHours: calculation.billableHours,
    billableMinutes: calculation.billableMinutes,
    bookingType,
    customerRateSource: pricing.pricingSource,
    customerRateUnit: "hour",
    rateCents: Math.round(calculation.hourlyRate * 100),
    surchargeAmountCents: calculation.surchargeAmountCents,
  };
}

export function calculateCustomerDspInvoiceReview(
  input: CustomerDspInvoiceReviewInput,
  rateSetup: CustomerInvoiceRateSetupRecord,
): CustomerDspInvoiceReview | null {
  const review = calculateCustomerInvoiceRateReview(
    { ...input, bookingType: "DSP" },
    rateSetup,
  );

  if (
    !review ||
    review.actualMinutes === null ||
    review.billableHours === null ||
    review.billableMinutes === null
  ) {
    return null;
  }

  return {
    ...review,
    actualMinutes: review.actualMinutes,
    billableHours: review.billableHours,
    billableMinutes: review.billableMinutes,
    hourlyRateCents: review.rateCents,
  };
}
