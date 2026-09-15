import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { parseDriverJobUrl, productionOrigin } from "./driver-job-contract";

export type DriverAccountSetup = { setupId: string; email: string; password?: string; createdAt: number; activated: boolean; jobUrl?: string };
const key = "prestige.driver.pending-account.v1";
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function driverAppJobUrl(value:string) {
  if (!value.startsWith("prestigedriver:")) return value;
  const url=new URL(value);
  if(url.protocol!=="prestigedriver:"||url.hostname!=="job"||url.username||url.password||url.port||url.search||url.hash||!/^\/[A-Za-z0-9_-]{32,256}$/.test(url.pathname)) throw new Error("Open the original Job Link from Admin.");
  return parseDriverJobUrl(`${productionOrigin}/driver-job${url.pathname}`).jobUrl;
}
export async function readDriverAccountSetup(): Promise<DriverAccountSetup | null> {
  const value = await SecureStore.getItemAsync(key,options);
  if (!value) return null;
  const s = JSON.parse(value) as DriverAccountSetup;
  if (!uuid.test(s.setupId) || typeof s.email !== "string" || !Number.isFinite(s.createdAt)
    || typeof s.activated !== "boolean" || (!s.activated && !/^\d{6}$/.test(s.password || ""))) throw new Error("Account setup needs review on this phone.");
  if (s.jobUrl) parseDriverJobUrl(s.jobUrl);
  if (!s.jobUrl && Date.now()-s.createdAt > 86400000) { await clearDriverAccountSetup(); return null; }
  return s;
}
export async function saveDriverAccountSetup(email: string,password: string) {
  if (await readDriverAccountSetup()) throw new Error("A setup is already pending on this phone.");
  const s: DriverAccountSetup = { setupId:Crypto.randomUUID(),email,password,createdAt:Date.now(),activated:false };
  await SecureStore.setItemAsync(key,JSON.stringify(s),options); return s;
}
export async function rememberDriverAccountSetup(s: DriverAccountSetup) {
  await SecureStore.setItemAsync(key,JSON.stringify(s),options);
}
export async function clearDriverAccountSetup() { await SecureStore.deleteItemAsync(key,options); }

// Credentials are injected only into the exact private Job page opened by the OS.
// The Portal receives pending state only, never the saved PIN or setup secret.
export function driverAccountSetupBootstrap(s: DriverAccountSetup | null, currentUrl: string) {
  let activation: unknown = null;
  if (s?.jobUrl) {
    try { if (parseDriverJobUrl(currentUrl).token === parseDriverJobUrl(s.jobUrl).token) activation = s; } catch { /* not a Job page */ }
  }
  let portal = false;
  try { const u = new URL(currentUrl); portal = u.origin === productionOrigin && u.pathname === "/driver-portal"; } catch { /* closed */ }
  if (!portal && !activation) return "true;";
  return `(function(){window.__PRESTIGE_DRIVER_ACCOUNT_SETUP__=${JSON.stringify({supported:true,pending:Boolean(s),attempted:Boolean(s?.jobUrl)})};${activation ? `window.__PRESTIGE_DRIVER_ACCOUNT_ACTIVATION__=${JSON.stringify(activation)};` : ""}})();true;`;
}
export function driverAccountSetupResultScript(pending: boolean,error = "",attempted = false) {
  return `window.__PRESTIGE_DRIVER_ACCOUNT_SETUP__={supported:true,pending:${pending},attempted:${attempted}};window.dispatchEvent(new CustomEvent('prestige-driver-account-setup-result',{detail:${JSON.stringify({ok:!error,error})}}));true;`;
}
