import assert from "node:assert/strict";
import {
  calculateProfit,
  initialRateSettings,
  isMidnightPickup,
  resolvePricing,
} from "../lib/pricing.ts";

assert.equal(isMidnightPickup("2259hrs"), false);
assert.equal(isMidnightPickup("2300hrs"), true);
assert.equal(isMidnightPickup("23:00"), true);
assert.equal(isMidnightPickup("0659hrs"), true);
assert.equal(isMidnightPickup("06:59"), true);
assert.equal(isMidnightPickup("0700hrs"), false);

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
