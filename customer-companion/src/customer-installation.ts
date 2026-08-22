import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";

const biometricEnabledKey = "prestige.customer.biometric-enabled.v1";
const customerInstallationIdKey = "prestige.customer.installation-id.v1";
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export async function isCustomerBiometricUnlockEnabled() {
  return await SecureStore.getItemAsync(biometricEnabledKey, secureStoreOptions) === "enabled";
}
export async function customerBiometricsAvailable() {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  return compatible && await LocalAuthentication.isEnrolledAsync();
}

export async function authenticateCustomerAppUnlock() {
  if (!(await customerBiometricsAvailable())) return false;

  const result = await LocalAuthentication.authenticateAsync({
    biometricsSecurityLevel: "strong",
    cancelLabel: "Cancel",
    disableDeviceFallback: true,
    fallbackLabel: "",
    promptMessage: "Unlock Prestige SG",
  });
  return result.success === true;
}

export async function enableCustomerBiometricUnlock() {
  if (!(await authenticateCustomerAppUnlock())) return false;

  await SecureStore.setItemAsync(
    biometricEnabledKey,
    "enabled",
    secureStoreOptions,
  );
  return true;
}

export async function customerInstallationId() {
  const existing = await SecureStore.getItemAsync(customerInstallationIdKey, secureStoreOptions);
  if (existing) return existing;
  const created = `customer-ios-${randomUUID()}`;
  await SecureStore.setItemAsync(customerInstallationIdKey, created, secureStoreOptions);
  return created;
}
