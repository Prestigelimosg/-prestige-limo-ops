import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const installationIdKey = "prestige.admin.installation-id.v1";
const biometricEnabledKey = "prestige.admin.biometric-enabled.v1";
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readOrCreateAdminInstallationId() {
  const saved =
    (await SecureStore.getItemAsync(installationIdKey, secureStoreOptions))?.trim() || "";
  if (uuidV4Pattern.test(saved)) return saved.toLowerCase();

  const installationId = Crypto.randomUUID().toLowerCase();
  await SecureStore.setItemAsync(
    installationIdKey,
    installationId,
    secureStoreOptions,
  );
  return installationId;
}

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
    promptMessage: "Unlock Prestige Limo Ops",
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
