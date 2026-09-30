import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-pricing-test-"));

try {
  for (const relativePath of ["lib/hourly-billing.ts", "lib/pricing.ts"]) {
    const sourcePath = path.join(process.cwd(), relativePath);
    const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      transpileTypescript(await readFile(sourcePath, "utf8"), sourcePath),
    );
  }

  const require = createRequire(import.meta.url);
  const {
    calculateProfit,
    initialRateSettings,
    isMidnightPickup,
    resolvePricing,
  } = require(path.join(tempDir, "lib/pricing.js"));

assert.equal(isMidnightPickup("2259hrs"), false);
assert.equal(isMidnightPickup("10:59pm"), false);
assert.equal(isMidnightPickup("2300hrs"), true);
assert.equal(isMidnightPickup("23:00"), true);
assert.equal(isMidnightPickup("11pm"), true);
assert.equal(isMidnightPickup("11:00pm"), true);
assert.equal(isMidnightPickup("11.00pm"), true);
assert.equal(isMidnightPickup("0659hrs"), true);
assert.equal(isMidnightPickup("06:59"), true);
assert.equal(isMidnightPickup("6:59am"), true);
assert.equal(isMidnightPickup("6.59am"), true);
assert.equal(isMidnightPickup("0700hrs"), false);
assert.equal(isMidnightPickup("7am"), false);
assert.equal(isMidnightPickup("7:00am"), false);
assert.equal(isMidnightPickup("7.00am"), false);

// Driver midnight is separate from customer midnight. Exercise every pickup
// minute and service through the existing resolver and total calculator.
for (const bookingType of ["MNG", "DEP", "TRF", "DSP"]) {
  const input = { bookingType, vehicle: "AVF", extraStopCount: 2, childSeatRequired: true, childSeatCount: 1 };
  const day = resolvePricing({ ...input, time: "1200" }, {}, null, initialRateSettings);
  const dayTotals = calculateProfit(day);
  for (let minute = 0; minute < 1440; minute += 1) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}${String(minute % 60).padStart(2, "0")}`;
    const pricing = resolvePricing({ ...input, time }, {}, null, initialRateSettings);
    const customerMidnight = minute >= 1380 || minute < 420 ? 15 : 0;
    const driverMidnight = minute >= 1410 || minute < 360 ? 10 : 0;
    assert.equal(pricing.midnightPayout, driverMidnight, `${bookingType} ${time}: driver midnight must be 2330 through 0559`);
    assert.equal(pricing.midnightSurcharge, customerMidnight, `${bookingType} ${time}: customer midnight stays 2300 through 0659`);
    assert.deepEqual({ ...pricing, midnightPayout: 0, midnightSurcharge: 0 }, day, "Base rates, units, sources, stops and seats remain unchanged");
    const totals = calculateProfit(pricing);
    assert.equal(totals.customerPrice, dayTotals.customerPrice + customerMidnight);
    assert.equal(totals.driverPayout, dayTotals.driverPayout + driverMidnight);
    assert.equal(totals.profit, totals.customerPrice - totals.driverPayout);
    for (const override of ["0", "99.50"]) {
      assert.equal(calculateProfit(pricing, "", override).driverPayout, Number(override), "Saved/fixed/manual payout totals must not receive an additional midnight fee");
    }
  }
}

for (const [time, expected] of [
  ["2329hrs", 0], ["11:29pm", 0], ["2330hrs", 10], ["11:30pm", 10],
  ["11.30pm", 10], ["0000hrs", 10], ["12am", 10], ["0559hrs", 10],
  ["5:59am", 10], ["5.59am", 10], ["0600hrs", 0], ["6am", 0],
  ["0659hrs", 0], ["6:59am", 0], ["0700hrs", 0], ["", 0], ["invalid", 0],
  ["2400", 0], ["2360", 0],
]) {
  assert.equal(resolvePricing({ bookingType: "DEP", time }, {}, null, initialRateSettings).midnightPayout, expected, `Driver midnight input ${time}`);
}
assert.equal(resolvePricing({ bookingType: "DEP", time: "2330" }, {}, null, { ...initialRateSettings, midnightPayout: 17 }).midnightPayout, 17, "Use the saved rate setting rather than hardcoding the amount");

const defaultPricing = resolvePricing(
  {
    bookingType: "DEP",
    time: "0715hrs",
    extraStopCount: "0",
    childSeatRequired: "yes",
    childSeatCount: "2",
  },
  { customer_rates: {}, driver_payout_rules: {} },
  null,
  initialRateSettings,
  null,
);

assert.equal(defaultPricing.childSeatCount, 2);
assert.equal(defaultPricing.childSeatCustomerAmount, 30);
assert.equal(defaultPricing.childSeatDriverAmount, 20);

assert.deepEqual(
  calculateProfit(defaultPricing),
  {
    customerPrice: 105,
    driverPayout: 75,
    profit: 30,
    customerPriceSource: "default",
    driverPayoutSource: "default",
  },
);

const vehicleDefaultPricing = resolvePricing(
  {
    bookingType: "MNG",
    vehicle: "VVV",
    time: "1200hrs",
    extraStopCount: "0",
    childSeatRequired: "",
    childSeatCount: "",
  },
  { customer_rates: {}, driver_payout_rules: {} },
  null,
  {
    ...initialRateSettings,
    customerRates: {
      ...initialRateSettings.customerRates,
      MNG: { AVF: 85, S: 95, VVV: 125, Combi: 115 },
    },
  },
  null,
);

assert.equal(vehicleDefaultPricing.customerRate, 125);
assert.equal(calculateProfit(vehicleDefaultPricing).customerPrice, 125);

const missingVehicleFallbackPricing = resolvePricing(
  {
    bookingType: "MNG",
    vehicle: "",
    time: "1200hrs",
    extraStopCount: "0",
    childSeatRequired: "",
    childSeatCount: "",
  },
  { customer_rates: {}, driver_payout_rules: {} },
  null,
  {
    ...initialRateSettings,
    customerRates: {
      ...initialRateSettings.customerRates,
      MNG: { AVF: 85, S: 95, VVV: 125, Combi: 115 },
    },
  },
  null,
);

assert.equal(missingVehicleFallbackPricing.customerRate, 85);

const companyVehicleOverridePricing = resolvePricing(
  {
    bookingType: "DEP",
    vehicle: "Combi",
    time: "1200hrs",
    extraStopCount: "0",
    childSeatRequired: "",
    childSeatCount: "",
  },
  { customer_rates: { DEP: { Combi: 140 } }, driver_payout_rules: {} },
  null,
  initialRateSettings,
  null,
);

assert.equal(companyVehicleOverridePricing.customerRate, 140);
assert.equal(companyVehicleOverridePricing.pricingSource, "company");

const legacyTravelerVehicleOverridePricing = resolvePricing(
  {
    bookingType: "TRF",
    vehicle: "S",
    time: "1200hrs",
    extraStopCount: "0",
    childSeatRequired: "",
    childSeatCount: "",
  },
  { customer_rates: { TRF: { S: 90 } }, driver_payout_rules: {} },
  {
    customer_rate_source: "legacy_traveler",
    customer_rates: { TRF: { S: 105 } },
    driver_payout_rules: {},
  },
  initialRateSettings,
  null,
);

assert.equal(legacyTravelerVehicleOverridePricing.customerRate, 105);
assert.equal(legacyTravelerVehicleOverridePricing.pricingSource, "legacy_traveler");

for (const [bookingType, expectedByVehicle] of Object.entries({
  MNG: { AVF: 85, S: 180, VVV: 95, Combi: 105 },
  DEP: { AVF: 75, S: 170, VVV: 85, Combi: 95 },
  TRF: { AVF: 55, S: 160, VVV: 65, Combi: 75 },
  DSP: { AVF: 65, S: 160, VVV: 75, Combi: 75 },
})) {
  for (const [vehicle, expectedRate] of Object.entries(expectedByVehicle)) {
    const pricing = resolvePricing(
      {
        bookingType,
        vehicle,
        time: "1200hrs",
        extraStopCount: "0",
        childSeatRequired: "",
        childSeatCount: "",
      },
      { customer_rates: {}, driver_payout_rules: {} },
      null,
      initialRateSettings,
      null,
    );

    assert.equal(pricing.customerRate, expectedRate, `${bookingType} ${vehicle} default customer rate`);
  }
}

const configuredPricing = resolvePricing(
  {
    bookingType: "MNG",
    time: "2330hrs",
    extraStopCount: "1",
    childSeatRequired: "yes",
    childSeatCount: "1",
  },
  { customer_rates: {}, driver_payout_rules: {} },
  null,
  {
    ...initialRateSettings,
    childSeatCustomerSurcharge: 20,
    childSeatDriverPayout: 5,
  },
  null,
);

assert.equal(configuredPricing.midnightSurcharge, 15);
assert.equal(configuredPricing.midnightPayout, 10);
assert.equal(configuredPricing.extraStopCustomerAmount, 15);
assert.equal(configuredPricing.extraStopDriverAmount, 10);
assert.equal(configuredPricing.childSeatCustomerAmount, 20);
assert.equal(configuredPricing.childSeatDriverAmount, 5);

assert.deepEqual(
  calculateProfit(configuredPricing),
  {
    customerPrice: 135,
    driverPayout: 90,
    profit: 45,
    customerPriceSource: "default",
    driverPayoutSource: "default",
  },
);

const dspItineraryPricing = resolvePricing(
  {
    bookingType: "DSP",
    time: "0930hrs",
    extraStopCount: "3",
    childSeatRequired: "",
    childSeatCount: "",
  },
  { customer_rates: {}, driver_payout_rules: {} },
  null,
  initialRateSettings,
  null,
);

assert.equal(dspItineraryPricing.extraStopCount, 3);
assert.equal(dspItineraryPricing.extraStopSurcharge, 0);
assert.equal(dspItineraryPricing.extraStopCustomerAmount, 0);
assert.equal(dspItineraryPricing.extraStopPayout, 0);
assert.equal(dspItineraryPricing.extraStopDriverAmount, 0);
assert.deepEqual(
  calculateProfit(dspItineraryPricing),
  {
    customerPrice: 65,
    driverPayout: 50,
    profit: 15,
    customerPriceSource: "default",
    driverPayoutSource: "default",
  },
);

for (const bookingType of ["MNG", "DEP", "TRF"]) {
  const nonDspPricing = resolvePricing(
    {
      bookingType,
      time: "1030hrs",
      extraStopCount: "2",
      childSeatRequired: "",
      childSeatCount: "",
    },
    { customer_rates: {}, driver_payout_rules: {} },
    null,
    initialRateSettings,
    null,
  );

  assert.equal(nonDspPricing.extraStopCount, 2, `${bookingType} should keep extra stop count`);
  assert.equal(nonDspPricing.extraStopSurcharge, 15, `${bookingType} should keep customer extra stop surcharge`);
  assert.equal(nonDspPricing.extraStopCustomerAmount, 30, `${bookingType} should charge customer extra stops`);
  assert.equal(nonDspPricing.extraStopPayout, 10, `${bookingType} should keep driver extra stop payout`);
  assert.equal(nonDspPricing.extraStopDriverAmount, 20, `${bookingType} should pay driver extra stops`);
}

const trfMultiStopPricing = resolvePricing(
  {
    bookingType: "TRF",
    time: "1100hrs",
    extraStopCount: "2",
    childSeatRequired: "",
    childSeatCount: "",
  },
  { customer_rates: {}, driver_payout_rules: {} },
  null,
  initialRateSettings,
  null,
);

assert.deepEqual(
  calculateProfit(trfMultiStopPricing),
  {
    customerPrice: 85,
    driverPayout: 65,
    profit: 20,
    customerPriceSource: "default",
    driverPayoutSource: "default",
  },
);

console.log("Pricing tests passed.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}
