import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function read(path) {
  return readFile(path, "utf8");
}

function assertIncludes(source, expected, message = `Missing required text: ${expected}`) {
  assert.ok(source.includes(expected), message);
}

function assertExcludes(source, forbidden, message = `Unexpected text found: ${forbidden}`) {
  assert.equal(source.includes(forbidden), false, message);
}

const appPage = await read("app/page.tsx");
const bookPage = await read("app/book/page.tsx");
const termsHelper = await read("lib/customer-facing-booking-terms.ts");
const hourlyHelper = await read("lib/hourly-billing.ts");
const priceReviewPersistence = await read(
  "lib/admin-monthly-invoice-billable-item-price-review-persistence.ts",
);
const combinedTermsSource = `${termsHelper}\n${hourlyHelper}`;

for (const requiredText of [
  "Midnight surcharge: $15 applies for trips scheduled between 11:00 PM and 6:59 AM.",
  "Waiting time: 15 minutes complimentary grace.",
  "$15 per 15-minute block",
  "Airport arrivals include 60 minutes complimentary grace.",
  "16 minutes or more starts the next chargeable hour",
  "SGD $50 amendment fee",
  "Your booking is confirmed once full payment or the required deposit has been received.",
]) {
  assertIncludes(combinedTermsSource, requiredText, `Customer-facing terms helper must include: ${requiredText}`);
}

assertIncludes(hourlyHelper, "hourlyBillingGraceMinutes = 15", "Hourly grace must stay locked to 15 minutes.");
assertIncludes(hourlyHelper, "hourlyBillingUnitMinutes = 60", "Hourly billing unit must stay locked to 60 minutes.");
assertIncludes(
  hourlyHelper,
  "Math.ceil(Math.max(0, roundedTotalMinutes - hourlyBillingGraceMinutes) / hourlyBillingUnitMinutes)",
  "Hourly billing must round 16 minutes onward into the next chargeable hour.",
);
assertIncludes(
  priceReviewPersistence,
  "calculateHourlyBillableMinutes(dspTotalMinutes)",
  "Server price review must enforce the hourly billable-minute helper.",
);
assertIncludes(
  priceReviewPersistence,
  "Hourly billable minutes must follow the 15-minute grace rule.",
  "Server price review must reject hourly minutes that do not follow the grace rule.",
);

for (const requiredAttribute of [
  "data-customer-booking-terms-summary",
  "data-customer-booking-terms-acceptance",
  "data-customer-booking-terms-checkbox",
  "data-customer-booking-terms-details",
]) {
  assertIncludes(bookPage, requiredAttribute, `Public booking form must include ${requiredAttribute}.`);
}

assertIncludes(
  bookPage,
  "Please accept the booking terms, surcharges, and waiting-time policy before submitting.",
  "Public booking submit must require terms acceptance.",
);
assertExcludes(
  termsHelper,
  "customerCopyTermsText",
  "Customer-facing terms helper must not expose a Customer Copy notes export.",
);
assertExcludes(appPage, "customerCopyTermsText.split", "Dispatch Customer Copy must not append customer terms text.");
assertExcludes(
  appPage,
  "data-customer-copy-terms-note",
  "Dispatch Customer Copy must not show a duplicate terms helper note.",
);
assertExcludes(
  appPage,
  "Customer notes included: midnight surcharge, waiting time, hourly grace, and amendment policy.",
  "Dispatch Customer Copy must not show the removed terms helper wording.",
);
assertIncludes(
  appPage,
  "data-admin-monthly-invoice-terms-footer",
  "Monthly invoice review must include a compact terms footer note.",
);
assertIncludes(
  appPage,
  "adminMonthlyInvoiceActualTimeBillableMinutes",
  "Admin monthly invoice UI must use the shared actual-time billable-minute helper.",
);

console.log("Customer terms and hourly billing guard passed");
