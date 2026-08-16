import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const installationKey = "prestige.driver.installation.v1";
const biometricEnabledKey = "prestige.driver.biometric-enabled.v1";
const installationOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readOrCreateDriverInstallationId() {
  const saved = (await SecureStore.getItemAsync(installationKey, installationOptions))?.trim() || "";
  if (uuidV4Pattern.test(saved)) return saved.toLowerCase();

  const installationId = Crypto.randomUUID().toLowerCase();
  await SecureStore.setItemAsync(installationKey, installationId, installationOptions);
  return installationId;
}

export async function isDriverBiometricUnlockEnabled() {
  return await SecureStore.getItemAsync(biometricEnabledKey, installationOptions) === "enabled";
}

export async function enableDriverBiometricUnlock() {
  const result = await authenticateDriverAppUnlock();
  if (!result) return false;

  await SecureStore.setItemAsync(biometricEnabledKey, "enabled", installationOptions);
  return true;
}

export async function authenticateDriverAppUnlock() {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  const enrolled = compatible && await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) return false;

  const result = await LocalAuthentication.authenticateAsync({
    biometricsSecurityLevel: "strong",
    cancelLabel: "Cancel",
    disableDeviceFallback: true,
    fallbackLabel: "",
    promptMessage: "Unlock Prestige Driver",
  });
  return result.success === true;
}
