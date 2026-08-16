export const driverAccountPasswordLength = 6;

export function driverAccountPasswordIsReady(value: unknown) {
  const password = typeof value === "string" ? value : "";
  if (!/^\d{6}$/.test(password)) return false;
  if (/^(\d)\1{5}$/.test(password)) return false;

  const digits = [...password].map(Number);
  const step = digits[1] - digits[0];
  if (
    (step === 1 || step === -1) &&
    digits.every((digit, index) => index === 0 || digit - digits[index - 1] === step)
  ) {
    return false;
  }

  return true;
}
