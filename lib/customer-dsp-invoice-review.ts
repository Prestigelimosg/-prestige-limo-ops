import {
  calculateDspCustomerInvoiceAmountCents,
  initialRateSettings,
  resolvePricing,
  type DriverPayoutRules,
  type RateRules,
  type RateSettings,
} from "./pricing";

export type CustomerInvoiceRateSetupRecord = {
  companies?: Array<{
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
    company_id?: number | null;
    customer_rates?: RateRules | null;
    driver_payout_rules?: DriverPayoutRules | null;
    id?: number | null;
  }>;
};

export type CustomerDspInvoiceReviewInput = {
  actualMinutes: number | null | undefined;
  childSeatCount: number | null | undefined;
  companyId: number | null | undefined;
  extraStopCount: number | null | undefined;
  pickupAt: string | null | undefined;
  travelerId: number | null | undefined;
  vehicleType: string | null | undefined;
};

export type CustomerDspInvoiceReview = {
  actualMinutes: number;
  amountCents: number;
  baseAmountCents: number;
  billableHours: number;
  billableMinutes: number;
  customerRateSource: string;
  hourlyRateCents: number;
  surchargeAmountCents: number;
};

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

export function calculateCustomerDspInvoiceReview(
  input: CustomerDspInvoiceReviewInput,
  rateSetup: CustomerInvoiceRateSetupRecord,
): CustomerDspInvoiceReview | null {
  const companyRecord =
    rateSetup.companies?.find((company) => company.id === input.companyId) || null;
  const travelerRecord =
    rateSetup.travelers?.find(
      (traveler) =>
        traveler.id === input.travelerId &&
        (!input.companyId || traveler.company_id === input.companyId),
    ) || null;
  const pricing = resolvePricing(
    {
      bookingType: "DSP",
      childSeatCount: Number(input.childSeatCount) || 0,
      childSeatRequired: Number(input.childSeatCount) > 0,
      extraStopCount: Number(input.extraStopCount) || 0,
      time: singaporePickupClock(input.pickupAt),
      vehicleType: input.vehicleType || "AVF",
    },
    companyRecord || {},
    travelerRecord,
    rateSettings(rateSetup),
  );
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
    customerRateSource: pricing.pricingSource,
    hourlyRateCents: Math.round(calculation.hourlyRate * 100),
    surchargeAmountCents: calculation.surchargeAmountCents,
  };
}
