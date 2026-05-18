import assert from "node:assert/strict";
import {
  allowedAiBookingTypes,
  sanitizeAiParseResult,
} from "../lib/ai-parser-schema.ts";

assert.deepEqual(allowedAiBookingTypes, ["MNG", "DEP", "TRF", "DSP"]);

const validResult = sanitizeAiParseResult({
  multipleBookingsDetected: false,
  bookings: [
    {
      bookingType: "mng",
      companyAccount: " Warburg Pincus ",
      bookerName: " Jill Van Cook ",
      bookerEmail: " jill@example.com ",
      bookerContact: " 917-734-5070 ",
      passengerName: " Mark Colodny ",
      pax: 2,
      vehicle: " Sedan ",
      pickupDate: " 2026-02-06 ",
      pickupTime: " 0730hrs ",
      flightNumber: " SG 423 ",
      pickup: " Singapore Changi Airport ",
      dropoff: " The Ritz ",
      extraStopLocation: " ",
      extraStops: " 0 ",
      customerPriceOverride: " ",
      notes: " Meet and greet ",
      confidence: 0.72,
      needsReviewReasons: [" Check terminal "],
    },
  ],
  rawWarnings: [" model warning "],
});

assert.deepEqual(validResult, {
  multipleBookingsDetected: false,
  bookings: [
    {
      bookingType: "MNG",
      companyAccount: "Warburg Pincus",
      bookerName: "Jill Van Cook",
      bookerEmail: "jill@example.com",
      bookerContact: "917-734-5070",
      passengerName: "Mark Colodny",
      pax: "2",
      vehicle: "Sedan",
      pickupDate: "2026-02-06",
      pickupTime: "0730hrs",
      flightNumber: "SG423",
      pickup: "Singapore Changi Airport",
      dropoff: "The Ritz",
      extraStopLocation: "",
      extraStops: "0",
      customerPriceOverride: "",
      notes: "Meet and greet",
      confidence: 0.72,
      needsReviewReasons: ["Check terminal"],
    },
  ],
  rawWarnings: ["model warning"],
});

const invalidBookingType = sanitizeAiParseResult({
  bookings: [{ bookingType: "airport", confidence: 0.5 }],
});
assert.equal(invalidBookingType.bookings[0].bookingType, "");
assert.deepEqual(invalidBookingType.bookings[0].needsReviewReasons, [
  "Invalid booking type from AI output",
]);

assert.equal(
  sanitizeAiParseResult({ bookings: [{ companyAccount: "gmail.com", confidence: 0.5 }] })
    .bookings[0].companyAccount,
  "",
);
assert.equal(
  sanitizeAiParseResult({ bookings: [{ companyAccount: "prestigelimo.sg", confidence: 0.5 }] })
    .bookings[0].companyAccount,
  "",
);
assert.equal(
  sanitizeAiParseResult({ bookings: [{ companyAccount: "ubs.com", confidence: 0.5 }] })
    .bookings[0].companyAccount,
  "UBS",
);
assert.equal(
  sanitizeAiParseResult({ bookings: [{ companyAccount: "Warburg Pincus", confidence: 0.5 }] })
    .bookings[0].companyAccount,
  "Warburg Pincus",
);

const privateAirportResult = sanitizeAiParseResult({
  bookings: [
    {
      bookingType: "MNG",
      pickup: "WSSL airport | Seletar Airport (Jet Aviation FBO)",
      dropoff: "Mercure Singapore Bugis Hotel",
      confidence: 0.5,
    },
  ],
});
assert.equal(privateAirportResult.bookings[0].pickup, "WSSL airport | Seletar Airport (Jet Aviation FBO)");
assert.equal(privateAirportResult.bookings[0].dropoff, "Mercure Singapore Bugis Hotel");
assert.doesNotMatch(privateAirportResult.bookings[0].pickup, /Changi/i);

const aircraftTailResult = sanitizeAiParseResult({
  bookings: [{ flightNumber: "VT-DHA", confidence: 0.5 }],
});
assert.equal(aircraftTailResult.bookings[0].flightNumber, "");
assert.deepEqual(aircraftTailResult.bookings[0].needsReviewReasons, [
  "Invalid or non-commercial flight number from AI output",
]);

assert.equal(
  sanitizeAiParseResult({ bookings: [{ confidence: 2 }] }).bookings[0].confidence,
  1,
);
assert.equal(
  sanitizeAiParseResult({ bookings: [{ confidence: -0.5 }] }).bookings[0].confidence,
  0,
);

const nonArrayBookings = sanitizeAiParseResult({ bookings: { bookingType: "MNG" } });
assert.deepEqual(nonArrayBookings.bookings, []);
assert.equal(nonArrayBookings.multipleBookingsDetected, false);

const nonArrayReviewReasons = sanitizeAiParseResult({
  bookings: [{ needsReviewReasons: "Missing pickup", confidence: 0.5 }],
});
assert.deepEqual(nonArrayReviewReasons.bookings[0].needsReviewReasons, []);

console.log("AI parser schema tests passed.");
