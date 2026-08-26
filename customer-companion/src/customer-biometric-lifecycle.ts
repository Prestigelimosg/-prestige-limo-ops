export const CUSTOMER_BIOMETRIC_RETURN_GRACE_MS = 60_000;

export type CustomerBiometricLifecycleAction =
  | "ignore"
  | "lock"
  | "reveal"
  | "unlock";

export type CustomerBiometricLifecycle = {
  activeAttemptId: number | null;
  appState: string;
  backgroundedAtMs: number | null;
  backgroundGraceEligible: boolean;
  nextAttemptId: number;
  promptResumeAttemptId: number | null;
  promptResumeObserved: boolean;
};

export function createCustomerBiometricLifecycle(
  initialAppState: string,
): CustomerBiometricLifecycle {
  return {
    activeAttemptId: null,
    appState: initialAppState,
    backgroundedAtMs: null,
    backgroundGraceEligible: false,
    nextAttemptId: 1,
    promptResumeAttemptId: null,
    promptResumeObserved: false,
  };
}

export function readCustomerBiometricMonotonicTimeMs() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Number.NaN;
}

function validCustomerBiometricClockMs(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function clearCustomerBiometricReturnGrace(
  lifecycle: CustomerBiometricLifecycle,
) {
  lifecycle.backgroundedAtMs = null;
  lifecycle.backgroundGraceEligible = false;
}

export function beginCustomerBiometricAttempt(
  lifecycle: CustomerBiometricLifecycle,
) {
  if (lifecycle.activeAttemptId !== null) return null;

  const attemptId = lifecycle.nextAttemptId;
  lifecycle.nextAttemptId += 1;
  lifecycle.activeAttemptId = attemptId;
  lifecycle.promptResumeAttemptId = attemptId;
  lifecycle.promptResumeObserved = false;
  return attemptId;
}

export function finishCustomerBiometricAttempt(
  lifecycle: CustomerBiometricLifecycle,
  attemptId: number,
) {
  if (lifecycle.activeAttemptId !== attemptId) return false;

  lifecycle.activeAttemptId = null;
  if (
    lifecycle.promptResumeAttemptId === attemptId &&
    !lifecycle.promptResumeObserved
  ) {
    lifecycle.promptResumeAttemptId = null;
  }
  return true;
}

export function transitionCustomerBiometricAppState(
  lifecycle: CustomerBiometricLifecycle,
  nextAppState: string,
  biometricEnabled: boolean,
  nowMs: number,
  contentWasVisible: boolean,
): CustomerBiometricLifecycleAction {
  const previousAppState = lifecycle.appState;
  const returningToForeground =
    previousAppState !== "active" && nextAppState === "active";
  lifecycle.appState = nextAppState;

  if (nextAppState !== "active") {
    if (lifecycle.promptResumeAttemptId !== null) {
      lifecycle.promptResumeObserved = true;
      return "ignore";
    }
    if (previousAppState === "active") {
      lifecycle.backgroundedAtMs = validCustomerBiometricClockMs(nowMs)
        ? nowMs
        : null;
      lifecycle.backgroundGraceEligible =
        biometricEnabled && contentWasVisible;
    }
    return biometricEnabled ? "lock" : "ignore";
  }

  if (!returningToForeground) return "ignore";

  if (lifecycle.promptResumeAttemptId !== null) {
    lifecycle.promptResumeAttemptId = null;
    lifecycle.promptResumeObserved = false;
    clearCustomerBiometricReturnGrace(lifecycle);
    return "ignore";
  }
  if (lifecycle.activeAttemptId !== null) {
    clearCustomerBiometricReturnGrace(lifecycle);
    return "ignore";
  }

  const backgroundedAtMs = lifecycle.backgroundedAtMs;
  const backgroundGraceEligible = lifecycle.backgroundGraceEligible;
  clearCustomerBiometricReturnGrace(lifecycle);
  if (!biometricEnabled) return "ignore";

  if (
    backgroundGraceEligible &&
    backgroundedAtMs !== null &&
    validCustomerBiometricClockMs(nowMs) &&
    nowMs >= backgroundedAtMs &&
    nowMs - backgroundedAtMs < CUSTOMER_BIOMETRIC_RETURN_GRACE_MS
  ) {
    return "reveal";
  }
  return "unlock";
}
