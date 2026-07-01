import assert from "node:assert/strict";
import { formatWhatsAppJobCard } from "../lib/whatsapp-job-card.ts";

const forbiddenDriverCopyFragments = [
  /\bS?\$\s*\d+/i,
  /\bSGD\s*\d+/i,
  /\bcustomer\s*price\b/i,
  /\bpayout\b/i,
  /\binvoice\b/i,
  /\bpayment\b/i,
  /\bPayNow\b/i,
  /@/,
  /\+65\s*\d{4}\s*\d{4}/,
];

function assertNoDriverForbiddenFragments(output, label) {
  for (const fragment of forbiddenDriverCopyFragments) {
    assert.doesNotMatch(output, fragment, `${label} must not expose ${fragment}`);
  }
}

const nicoleDeparture = formatWhatsAppJobCard({
  bookingType: "DEP",
  date: "2026-07-02",
  dropoff: "Changi Airport",
  flight: "SQ708",
  name: "Ms. Nicole",
  pax: "1",
  pickup: "Jalan Buloh Perindu",
  time: "0700hrs",
  vehicle: "AVF",
});
assert.equal(
  nicoleDeparture,
  [
    "AVF - DEP",
    "",
    "2 Jul (Thu), 0700hrs",
    "",
    "Jalan Buloh Perindu > SQ708",
    "",
    "Ms. Nicole",
    "",
    "1 pax",
  ].join("\n"),
);
assertNoDriverForbiddenFragments(nicoleDeparture, "Nicole departure");

const arrival = formatWhatsAppJobCard({
  bookingType: "MNG",
  date: "2026-06-28",
  dropoff: "The Outpost Hotel Sentosa",
  flight: "QF1",
  name: "Belinda $70",
  pax: "4",
  pickup: "Changi Airport",
  time: "2115hrs",
  vehicle: "VVV",
});
assert.equal(
  arrival,
  [
    "VVV - MNG",
    "",
    "28 Jun (Sun), 2115hrs",
    "",
    "QF1 > The Outpost Hotel Sentosa",
    "",
    "Belinda",
    "",
    "4 pax",
  ].join("\n"),
);
assertNoDriverForbiddenFragments(arrival, "arrival");

const missingVehicleAndFlightDeparture = formatWhatsAppJobCard({
  bookingType: "departure",
  date: "2026-07-02",
  dropoff: "Changi Airport Terminal 3",
  name: "Ms. Nicole",
  pax: "1",
  pickup: "1 Jalan Buloh Perindu, Singapore 123456",
  time: "7:00",
  vehicle: "",
});
assert.equal(
  missingVehicleAndFlightDeparture,
  [
    "E / AVF - DEP",
    "",
    "2 Jul (Thu), 0700hrs",
    "",
    "1 Jalan Buloh Perindu > Changi Airport Terminal 3",
    "",
    "Ms. Nicole",
    "",
    "1 pax",
  ].join("\n"),
);
assertNoDriverForbiddenFragments(missingVehicleAndFlightDeparture, "missing vehicle/flight departure");

const rightSideFlightDeparture = formatWhatsAppJobCard({
  bookingType: "DEP",
  date: "2026-07-02",
  dropoff: "Changi Airport",
  flight: "ET639",
  name: "Mr Temitope Taiye Elijah  $55",
  pax: "1",
  pickup: "Intercontinental Robertson",
  time: "2200hrs",
  vehicle: "VVV",
});
assert.equal(
  rightSideFlightDeparture,
  [
    "VVV - DEP",
    "",
    "2 Jul (Thu), 2200hrs",
    "",
    "Intercontinental Robertson > ET639",
    "",
    "Mr Temitope Taiye Elijah",
    "",
    "1 pax",
  ].join("\n"),
);
assertNoDriverForbiddenFragments(rightSideFlightDeparture, "right-side flight departure");

const multiStopWithChildSeat = formatWhatsAppJobCard({
  bookingType: "TRF",
  childSeatCount: "1",
  childSeatRequired: "yes",
  childSeatType: "booster seat",
  date: "2026-07-03",
  dropoff: "Changi Airport, Singapore 819643",
  extraStopLocation: "28 Alexandra View, Singapore 158744",
  name: "Mr Peter",
  pax: "5",
  pickup: "276 Ocean Drive lobby O",
  time: "0600hrs",
  vehicle: "E-Class / AVF",
});
assert.equal(
  multiStopWithChildSeat,
  [
    "E / AVF - TRF",
    "",
    "3 Jul (Fri), 0600hrs",
    "",
    "276 Ocean Drive lobby O > 28 Alexandra View > Changi Airport",
    "",
    "Mr Peter",
    "",
    "5 pax",
    "Child seat: 1 x booster seat",
  ].join("\n"),
);
assertNoDriverForbiddenFragments(multiStopWithChildSeat, "multi-stop child-seat transfer");

console.log("WhatsApp job card format guard passed.");
