import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminConfigSource, adminEasSource, customerConfigSource, customerEasSource, driverConfigSource, driverEasSource, ledgerSource] =
  await Promise.all([
    readFile("admin-companion/app.json", "utf8"),
    readFile("admin-companion/eas.json", "utf8"),
    readFile("customer-companion/app.json", "utf8"),
    readFile("customer-companion/eas.json", "utf8"),
    readFile("driver-companion/app.json", "utf8"),
    readFile("driver-companion/eas.json", "utf8"),
    readFile("docs/current-implementation-ledger.md", "utf8"),
  ]);

const admin = JSON.parse(adminConfigSource).expo;
const adminEas = JSON.parse(adminEasSource);
const customer = JSON.parse(customerConfigSource).expo;
const customerEas = JSON.parse(customerEasSource);
const driver = JSON.parse(driverConfigSource).expo;
const driverEas = JSON.parse(driverEasSource);

assert.deepEqual(
  [
    [admin.name, admin.ios.bundleIdentifier, admin.extra?.eas?.projectId, admin.ios.buildNumber, adminEas.submit?.production?.ios?.ascAppId],
    [customer.name, customer.ios.bundleIdentifier, customer.extra?.eas?.projectId, customer.ios.buildNumber, customerEas.submit?.production?.ios?.ascAppId],
    [driver.name, driver.ios.bundleIdentifier, driver.extra?.eas?.projectId, driver.ios.buildNumber, driverEas.submit?.production?.ios?.ascAppId],
  ],
  [
    ["Prestige Limo Ops", "sg.prestigelimo.admin", "2dada379-f732-4e25-80a3-cdbbb8f52b11", "7", "6803312296"],
    ["Prestige SG", "sg.prestigelimo.customer", "ce71ff91-7f71-4297-bcef-edf420f94316", "10", "6802691447"],
    ["Prestige SG Driver", "sg.prestigelimo.drivercompanion", "2a797181-d09d-4384-8d01-583456e83c3e", "17", "6800706103"],
  ],
  "The current acceptance builds must keep their exact native and App Store identities",
);

for (const app of [admin, customer, driver]) {
  assert.equal(app.userInterfaceStyle, "light");
  assert.equal(app.plugins.includes("expo-notifications"), true);
}

for (const phrase of [
  "Native Apple Badge TestFlight Builds 4 / 9 / 16 (source checkpoint 2026-08-25)",
  "Admin Build 4",
  "Customer Build 9",
  "Driver Build 16",
  "4fd71ca4-382a-4dcf-b673-906a9a9cadf2",
  "447eb80d-65de-461d-9cda-640604704a7a",
  "d2d091b5-24c2-4c65-8679-8622711e5723",
  "2bf78b36-fe25-4b90-8999-d354a176dde6",
  "4514772c-b767-4ba3-95b9-6770141080ba",
  "07aee30d-cca4-46f8-ae6e-eaf9db49ae9c",
  "VALID` and `IN_BETA_TESTING",
  "c907a060-0f8b-4d90-a0b7-44ab85a2f235",
  "c66d522b-c799-4134-be22-225a7192bf4a",
  "c0b20e3f-bb6b-45cc-8e31-c27519d8aa61",
  "No real notification",
  "No external testing, App Review submission, or public release",
]) {
  assert.equal(ledgerSource.includes(phrase), true, `The implementation ledger must include ${phrase}`);
}

console.log("Native Apple badge TestFlight release guard passed.");
