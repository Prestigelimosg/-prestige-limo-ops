export type AdminBiometricLifecycleAction = "ignore" | "lock" | "unlock";

export type AdminBiometricLifecycle = {
  activeAttemptId: number | null;
  appState: string;
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
    nextAttemptId: 1,
    promptResumeAttemptId: null,
    promptResumeObserved: false,
  };
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
): AdminBiometricLifecycleAction {
  const returningToForeground =
    lifecycle.appState !== "active" && nextAppState === "active";
  lifecycle.appState = nextAppState;

  if (nextAppState !== "active") {
    if (lifecycle.promptResumeAttemptId !== null) {
      lifecycle.promptResumeObserved = true;
      return "ignore";
    }
    return biometricEnabled ? "lock" : "ignore";
  }

  if (!returningToForeground) return "ignore";

  if (lifecycle.promptResumeAttemptId !== null) {
    lifecycle.promptResumeAttemptId = null;
    lifecycle.promptResumeObserved = false;
    return "ignore";
  }
  if (lifecycle.activeAttemptId !== null) return "ignore";
  return biometricEnabled ? "unlock" : "ignore";
}
