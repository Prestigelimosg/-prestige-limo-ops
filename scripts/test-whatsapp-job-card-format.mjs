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

function assertNoIdentityNames(output, names, label) {
  assert.doesNotMatch(
    output,
    /^\s*(?:name|passenger|traveller|traveler|customer|company|booker)\s*:/im,
    `${label} must not expose identity label lines`,
  );

  for (const name of names) {
    assert.doesNotMatch(output, name, `${label} must not expose identity names`);
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
    "1 pax",
  ].join("\n"),
);
assertNoDriverForbiddenFragments(nicoleDeparture, "Nicole departure");
assertNoIdentityNames(nicoleDeparture, [/Ms\. Nicole/i], "Nicole departure");

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
    "4 pax",
  ].join("\n"),
);
assertNoDriverForbiddenFragments(arrival, "arrival");
assertNoIdentityNames(arrival, [/Belinda/i], "arrival");

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
    "1 pax",
  ].join("\n"),
);
assertNoDriverForbiddenFragments(missingVehicleAndFlightDeparture, "missing vehicle/flight departure");
assertNoIdentityNames(
  missingVehicleAndFlightDeparture,
  [/Ms\. Nicole/i],
  "missing vehicle/flight departure",
);

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
    "1 pax",
  ].join("\n"),
);
assertNoDriverForbiddenFragments(rightSideFlightDeparture, "right-side flight departure");
assertNoIdentityNames(
  rightSideFlightDeparture,
  [/Mr Temitope Taiye Elijah/i],
  "right-side flight departure",
);

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
    "5 pax",
    "Child seat: 1 x booster seat",
  ].join("\n"),
);
assertNoDriverForbiddenFragments(multiStopWithChildSeat, "multi-stop child-seat transfer");
assertNoIdentityNames(multiStopWithChildSeat, [/Mr Peter/i], "multi-stop child-seat transfer");

const dspMultiStopItinerary = formatWhatsAppJobCard({
  bookingType: "DSP",
  date: "2026-07-04",
  dropoff: "Ritz-Carlton",
  extraStopCount: "5",
  extraStopLocation:
    "Ritz-Carlton Singapore by 10am > BDC office at 12pm > Temasek Office, 60B Orchard Road, Tower 2, The Atrium@Orchard at 1:30pm > 8 Marina View, Asia Square Tower 1, #37-01, Singapore 018960 at 3:30pm > Ritz-Carlton at 6pm",
  name: "Drew",
  pax: "1",
  pickup: "Grand Hyatt",
  time: "1000hrs",
  vehicle: "AVF",
});
assert.equal(
  dspMultiStopItinerary,
  [
    "AVF - DSP",
    "",
    "4 Jul (Sat), 1000hrs",
    "",
    "Grand Hyatt > Multi-stop itinerary hidden for privacy > Ritz-Carlton",
    "",
    "1 pax",
  ].join("\n"),
);
assert.doesNotMatch(
  dspMultiStopItinerary,
  /Temasek Office|Asia Square|60B Orchard|#37-01|018960/,
  "DSP multi-stop WhatsApp preview must hide detailed itinerary stops",
);
assertNoDriverForbiddenFragments(dspMultiStopItinerary, "DSP multi-stop itinerary");
assertNoIdentityNames(dspMultiStopItinerary, [/Drew/i], "DSP multi-stop itinerary");

const dspPlainStops = formatWhatsAppJobCard({
  bookingType: "DSP",
  date: "2026-07-04",
  dropoff: "BDC office",
  extraStopCount: "3",
  extraStopLocation: "One Raffles Quay, North Tower > Capital Tower",
  name: "Drew",
  pax: "1",
  pickup: "1 HarbourFront Avenue, Keppel Bay Tower",
  time: "0930hrs",
  vehicle: "AVF",
});
assert.equal(
  dspPlainStops,
  [
    "AVF - DSP",
    "",
    "4 Jul (Sat), 0930hrs",
    "",
    "HarbourFront Avenue > One Raffles Quay > Capital Tower > BDC office",
    "",
    "1 pax",
  ].join("\n"),
);
assert.doesNotMatch(
  dspPlainStops,
  /1 HarbourFront|Keppel Bay Tower|North Tower|#02-01|#39-01/,
  "DSP plain-stop WhatsApp preview must compact detailed place fragments",
);
assertNoDriverForbiddenFragments(dspPlainStops, "DSP plain stops");
assertNoIdentityNames(dspPlainStops, [/Drew/i], "DSP plain stops");

const identityLeakProbe = formatWhatsAppJobCard({
  bookingType: "DEP",
  company: "ACME Customer Account",
  booker: "William Booker",
  customerName: "Corporate Customer",
  date: "2026-07-04",
  dropoff: "Changi Airport",
  flight: "SQ1",
  name: "VIP Passenger",
  pax: "1",
  pickup: "Raffles Hotel",
  time: "0900hrs",
  vehicle: "E-Class",
});
assertNoIdentityNames(
  identityLeakProbe,
  [/ACME Customer Account/i, /William Booker/i, /Corporate Customer/i, /VIP Passenger/i],
  "identity leak probe",
);

console.log("WhatsApp job card format guard passed.");
