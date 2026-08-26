export const ADMIN_BIOMETRIC_RETURN_GRACE_MS = 60_000;

export type AdminBiometricLifecycleAction =
  | "ignore"
  | "lock"
  | "reveal"
  | "unlock";

export type AdminBiometricLifecycle = {
  activeAttemptId: number | null;
  appState: string;
  backgroundedAtMs: number | null;
  backgroundGraceEligible: boolean;
  nextAttemptId: number;
  promptResumeAttemptId: number | null;
  promptResumeObserved: boolean;
};

export function createAdminBiometricLifecycle(
  initialAppState: string,
): AdminBiometricLifecycle {
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

export function readAdminBiometricMonotonicTimeMs() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Number.NaN;
}

function validAdminBiometricClockMs(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function clearAdminBiometricReturnGrace(
  lifecycle: AdminBiometricLifecycle,
) {
  lifecycle.backgroundedAtMs = null;
  lifecycle.backgroundGraceEligible = false;
}

export function beginAdminBiometricAttempt(
  lifecycle: AdminBiometricLifecycle,
) {
  if (lifecycle.activeAttemptId !== null) return null;

  const attemptId = lifecycle.nextAttemptId;
  lifecycle.nextAttemptId += 1;
  lifecycle.activeAttemptId = attemptId;
  lifecycle.promptResumeAttemptId = attemptId;
  lifecycle.promptResumeObserved = false;
  return attemptId;
}

export function finishAdminBiometricAttempt(
  lifecycle: AdminBiometricLifecycle,
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

export function transitionAdminBiometricAppState(
  lifecycle: AdminBiometricLifecycle,
  nextAppState: string,
  biometricEnabled: boolean,
  nowMs: number,
  contentWasVisible: boolean,
): AdminBiometricLifecycleAction {
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
      lifecycle.backgroundedAtMs = validAdminBiometricClockMs(nowMs)
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
    clearAdminBiometricReturnGrace(lifecycle);
    return "ignore";
  }
  if (lifecycle.activeAttemptId !== null) {
    clearAdminBiometricReturnGrace(lifecycle);
    return "ignore";
  }

  const backgroundedAtMs = lifecycle.backgroundedAtMs;
  const backgroundGraceEligible = lifecycle.backgroundGraceEligible;
  clearAdminBiometricReturnGrace(lifecycle);
  if (!biometricEnabled) return "ignore";

  if (
    backgroundGraceEligible &&
    backgroundedAtMs !== null &&
    validAdminBiometricClockMs(nowMs) &&
    nowMs >= backgroundedAtMs &&
    nowMs - backgroundedAtMs < ADMIN_BIOMETRIC_RETURN_GRACE_MS
  ) {
    return "reveal";
  }
  return "unlock";
}
