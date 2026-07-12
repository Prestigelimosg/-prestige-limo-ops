export const hourlyBillingGraceMinutes = 15;
export const hourlyBillingUnitMinutes = 60;
export const hourlyBillingDefaultRateCents = 6500;
export const dspBillingMinimumHours = 2;
export const dspBillingMinimumMinutes = dspBillingMinimumHours * hourlyBillingUnitMinutes;

function calculateBillableMinutesWithMinimum(
  totalMinutes: number | null | undefined,
  minimumHours: number,
) {
  if (typeof totalMinutes !== "number" || !Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return null;
  }

  const roundedTotalMinutes = Math.round(totalMinutes);

  if (roundedTotalMinutes === 0) {
    return 0;
  }

  const billableHours = Math.max(
    minimumHours,
    Math.ceil(Math.max(0, roundedTotalMinutes - hourlyBillingGraceMinutes) / hourlyBillingUnitMinutes),
  );

  return billableHours * hourlyBillingUnitMinutes;
}

export function calculateHourlyBillableMinutes(totalMinutes: number | null | undefined) {
  return calculateBillableMinutesWithMinimum(totalMinutes, 1);
}

export function calculateDspBillableMinutes(totalMinutes: number | null | undefined) {
  return calculateBillableMinutesWithMinimum(totalMinutes, dspBillingMinimumHours);
}

export const hourlyBillingGraceRuleText =
  "Hourly bookings include 15 minutes grace after each hour; 16 minutes or more starts the next chargeable hour.";

export const dspBillingRuleText =
  "Disposal bookings have a two-hour minimum and include 15 minutes grace after each chargeable hour; the 136th minute starts the third chargeable hour.";

function parseClockTimeToMinutes(value: string) {
  const trimmedValue = value.trim();
  const match = trimmedValue.match(/^(\d{1,2})(?::?(\d{2}))?(?:hrs?)?$/i);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

export function calculateActualTimeMinutesFromClockTimes(startTime: string, endTime: string) {
  const startMinutes = parseClockTimeToMinutes(startTime);
  const endMinutes = parseClockTimeToMinutes(endTime);

  if (startMinutes === null || endMinutes === null) {
    return null;
  }

  const sameDayMinutes = endMinutes - startMinutes;
  const totalMinutes = sameDayMinutes > 0 ? sameDayMinutes : sameDayMinutes + 24 * 60;

  return totalMinutes > 0 ? totalMinutes : null;
}

export function calculateHourlyInvoiceAmountCents(
  startTime: string,
  endTime: string,
  rateCents = hourlyBillingDefaultRateCents,
) {
  const actualMinutes = calculateActualTimeMinutesFromClockTimes(startTime, endTime);
  const billableMinutes = calculateHourlyBillableMinutes(actualMinutes);

  if (
    actualMinutes === null ||
    billableMinutes === null ||
    typeof rateCents !== "number" ||
    !Number.isFinite(rateCents) ||
    rateCents <= 0
  ) {
    return null;
  }

  const billableHours = billableMinutes / hourlyBillingUnitMinutes;

  return {
    actualMinutes,
    amountCents: Math.round(billableHours * rateCents),
    billableHours,
    billableMinutes,
    rateCents: Math.round(rateCents),
  };
}
