import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminConfigSource, customerConfigSource, driverConfigSource, ledgerSource] = await Promise.all([
  readFile("admin-companion/app.json", "utf8"),
  readFile("customer-companion/app.json", "utf8"),
  readFile("driver-companion/app.json", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
]);

const admin = JSON.parse(adminConfigSource).expo;
const customer = JSON.parse(customerConfigSource).expo;
const driver = JSON.parse(driverConfigSource).expo;

assert.deepEqual(
  [admin.ios.buildNumber, customer.ios.buildNumber, driver.ios.buildNumber],
  ["7", "12", "19"],
  "External testing must use the existing latest Admin, Customer and Driver builds",
);

for (const phrase of [
  "Three Apple Apps External TestFlight Activation (provider checkpoint 2026-09-05)",
  "Customer Build `12` was added and App Store Connect reports it as `Testing`",
  "https://testflight.apple.com/join/7ACRt3MS",
  "Driver `https://testflight.apple.com/join/m3sjGfd3`",
  "Admin `https://testflight.apple.com/join/4uqtKHd4`",
  "Driver Build `19` and Admin Build `7` were added to their exact groups",
  "Both report `Waiting for Review`",
  "no password was read or stored in the repository",
  "No review identity, credential or account was guessed",
  "native Admin sign-in asks only for the six-digit Admin PIN",
  "No EAS build, binary upload, OTA publication, App Store Distribution submission or public App Store release",
]) {
  assert.equal(ledgerSource.includes(phrase), true, `Implementation ledger must include ${phrase}`);
}

console.log("Three Apple apps external TestFlight guard passed.");
