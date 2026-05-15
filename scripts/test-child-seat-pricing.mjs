import assert from "node:assert/strict";
import {
  calculateProfit,
  initialRateSettings,
  resolvePricing,
} from "../lib/pricing.ts";

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
assert.equal(defaultPricing.childSeatDriverAmount, 0);

assert.deepEqual(
  calculateProfit(defaultPricing),
  {
    customerPrice: 105,
    driverPayout: 65,
    profit: 40,
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
assert.equal(configuredPricing.extraStopDriverAmount, 10);
assert.equal(configuredPricing.childSeatCustomerAmount, 20);
assert.equal(configuredPricing.childSeatDriverAmount, 5);

assert.deepEqual(
  calculateProfit(configuredPricing),
  {
    customerPrice: 120,
    driverPayout: 100,
    profit: 20,
    customerPriceSource: "default",
    driverPayoutSource: "default",
  },
);

console.log("Child seat pricing tests passed.");
