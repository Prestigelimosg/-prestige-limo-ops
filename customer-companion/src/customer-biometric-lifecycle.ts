export type CustomerBiometricLifecycleAction = "ignore" | "lock" | "unlock";

export type CustomerBiometricLifecycle = {
  activeAttemptId: number | null;
  appState: string;
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
    nextAttemptId: 1,
    promptResumeAttemptId: null,
    promptResumeObserved: false,
  };
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
): CustomerBiometricLifecycleAction {
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
