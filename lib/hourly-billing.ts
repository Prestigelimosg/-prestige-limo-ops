export const hourlyBillingGraceMinutes = 15;
export const hourlyBillingUnitMinutes = 60;

export function calculateHourlyBillableMinutes(totalMinutes: number | null | undefined) {
  if (typeof totalMinutes !== "number" || !Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return null;
  }

  const roundedTotalMinutes = Math.round(totalMinutes);

  if (roundedTotalMinutes === 0) {
    return 0;
  }

  const billableHours = Math.max(
    1,
    Math.ceil(Math.max(0, roundedTotalMinutes - hourlyBillingGraceMinutes) / hourlyBillingUnitMinutes),
  );

  return billableHours * hourlyBillingUnitMinutes;
}

export const hourlyBillingGraceRuleText =
  "Hourly bookings include 15 minutes grace after each hour; 16 minutes or more starts the next chargeable hour.";
