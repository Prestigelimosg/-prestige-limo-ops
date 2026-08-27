export const DRIVER_BIOMETRIC_RETURN_GRACE_MS = 180_000;

export type DriverBiometricLifecycleAction =
  | "ignore"
  | "lock"
  | "reveal"
  | "unlock";

export type DriverBiometricLifecycle = {
  activeAttemptId: number | null;
  appState: string;
  backgroundedAtMs: number | null;
  backgroundGraceEligible: boolean;
  nextAttemptId: number;
  promptResumeAttemptId: number | null;
  promptResumeObserved: boolean;
};

export function createDriverBiometricLifecycle(
  initialAppState: string,
): DriverBiometricLifecycle {
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

export function readDriverBiometricMonotonicTimeMs() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Number.NaN;
}

function validDriverBiometricClockMs(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function clearDriverBiometricReturnGrace(
  lifecycle: DriverBiometricLifecycle,
) {
  lifecycle.backgroundedAtMs = null;
  lifecycle.backgroundGraceEligible = false;
}

export function beginDriverBiometricAttempt(
  lifecycle: DriverBiometricLifecycle,
) {
  if (lifecycle.activeAttemptId !== null) return null;

  const attemptId = lifecycle.nextAttemptId;
  lifecycle.nextAttemptId += 1;
  lifecycle.activeAttemptId = attemptId;
  lifecycle.promptResumeAttemptId = attemptId;
  lifecycle.promptResumeObserved = false;
  return attemptId;
}

export function finishDriverBiometricAttempt(
  lifecycle: DriverBiometricLifecycle,
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

export function transitionDriverBiometricAppState(
  lifecycle: DriverBiometricLifecycle,
  nextAppState: string,
  biometricEnabled: boolean,
  nowMs: number,
  contentWasVisible: boolean,
): DriverBiometricLifecycleAction {
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
      lifecycle.backgroundedAtMs = validDriverBiometricClockMs(nowMs)
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
    clearDriverBiometricReturnGrace(lifecycle);
    return "ignore";
  }
  if (lifecycle.activeAttemptId !== null) {
    clearDriverBiometricReturnGrace(lifecycle);
    return "ignore";
  }

  const backgroundedAtMs = lifecycle.backgroundedAtMs;
  const backgroundGraceEligible = lifecycle.backgroundGraceEligible;
  clearDriverBiometricReturnGrace(lifecycle);
  if (!biometricEnabled) return "ignore";

  if (
    backgroundGraceEligible &&
    backgroundedAtMs !== null &&
    validDriverBiometricClockMs(nowMs) &&
    nowMs >= backgroundedAtMs &&
    nowMs - backgroundedAtMs < DRIVER_BIOMETRIC_RETURN_GRACE_MS
  ) {
    return "reveal";
  }
  return "unlock";
}
