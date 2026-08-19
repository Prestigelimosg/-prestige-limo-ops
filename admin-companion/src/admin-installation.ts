import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const biometricEnabledKey = "prestige.admin.biometric-enabled.v1";
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export async function isAdminBiometricUnlockEnabled() {
  return await SecureStore.getItemAsync(biometricEnabledKey, secureStoreOptions) === "enabled";
}

export async function adminBiometricsAvailable() {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  return compatible && await LocalAuthentication.isEnrolledAsync();
}

export async function authenticateAdminAppUnlock() {
  if (!(await adminBiometricsAvailable())) return false;

  const result = await LocalAuthentication.authenticateAsync({
    biometricsSecurityLevel: "strong",
    cancelLabel: "Cancel",
    disableDeviceFallback: true,
    fallbackLabel: "",
    promptMessage: "Unlock Prestige Admin",
  });
  return result.success === true;
}

export async function enableAdminBiometricUnlock() {
  if (!(await authenticateAdminAppUnlock())) return false;

  await SecureStore.setItemAsync(
    biometricEnabledKey,
    "enabled",
    secureStoreOptions,
  );
  return true;
}
