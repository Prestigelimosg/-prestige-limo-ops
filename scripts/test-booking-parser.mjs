import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  alsonSq377Sample,
  mergeParsedBookingState,
  parseBookingMessage,
} from '../lib/booking-parser.ts';

const parserExamples = JSON.parse(
  readFileSync(new URL('../parser_examples/booking-examples.json', import.meta.url), 'utf8'),
);
const realWorldFixtures = JSON.parse(
  readFileSync(new URL('../parser_examples/real-world-bookings.json', import.meta.url), 'utf8'),
);
const requiredConfidenceCategories = [
  'MNG airport arrival',
  'DEP airport departure',
  'TRF transfer',
  'DSP/hourly/standby',
  'dinner/event standby',
  'multiline WhatsApp',
  'blank-line WhatsApp',
  'copied group chats',
  'shorthand messages',
  'typo messages',
  'landmark-only locations',
  'return trips',
  'multiple passengers',
  'boss/booker separation',
];
const referenceDate = new Date(2026, 4, 13, 12, 0, 0);
const parseBookingForTest = (input) => parseBookingMessage(input, { referenceDate });

const expected = {
  success: true,
  company: 'UOB',
  booker: 'Alson Chua',
  name: 'Lim Yeow Beng',
  date: '2026-05-14',
  time: '0740hrs',
  flight: 'SQ377',
  pickup: 'Changi Airport',
  dropoff: 'home',
  bookingType: 'MNG',
  vehicle: '',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  bookerEmail: '',
  cleanedLines: [
    'Hi kindly arrange airport pick up to home on 14 May Thursday 0740 SQ377. Thank you',
    'Lim Yeow Beng',
  ],
};

const parsed = parseBookingForTest(alsonSq377Sample);
assert.deepEqual(parsed, expected);

const alsonSq377SampleWithBlankLine = `[11/5/26, 13:33:10] Alson Chua UOB: Hi kindly arrange airport pick up to home on 14 May Thursday 0740 SQ377. Thank you

[11/5/26, 13:33:16] Alson Chua UOB: Lim Yeow Beng`;
const parsedWithBlankLine = parseBookingForTest(alsonSq377SampleWithBlankLine);
assert.deepEqual(parsedWithBlankLine, expected);

const airportArrivalSample =
  'Arrival pickup for John Lim on 16 May 2026 0815 SQ322 from Changi Airport T1 to Ritz Carlton.';
assert.deepEqual(parseBookingForTest(airportArrivalSample), {
  success: true,
  company: '',
  bookingType: 'MNG',
  vehicle: '',
  date: '2026-05-16',
  time: '0815hrs',
  flight: 'SQ322',
  pickup: 'Changi Airport T1',
  dropoff: 'Ritz Carlton',
  booker: '',
  bookerEmail: '',
  name: 'John Lim',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [airportArrivalSample],
});

const meetAndGreetShorthandSample = `M&G for Mr Lim
15/5/26 9.20am
SQ322 T3 to Ritz Carlton
Pax 1`;
const parsedMeetAndGreetShorthand = parseBookingForTest(meetAndGreetShorthandSample) ?? {};
assert.deepEqual(parsedMeetAndGreetShorthand, {
  success: true,
  company: '',
  bookingType: 'MNG',
  vehicle: '',
  date: '2026-05-15',
  time: '0920hrs',
  flight: 'SQ322',
  pickup: 'Changi Airport T3',
  dropoff: 'Ritz Carlton',
  booker: '',
  bookerEmail: '',
  name: 'Mr Lim',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'M&G for Mr Lim',
    '15/5/26 9.20am',
    'SQ322 T3 to Ritz Carlton',
    'Pax 1',
  ],
});
assert.equal(parsedMeetAndGreetShorthand.extraStopCount ?? '0', '0');
assert.equal(parsedMeetAndGreetShorthand.extraStopLocation ?? '', '');

const arrivalHotelLabelDropoffSample = `Arrival for Mr Tan
15/5/26
ETA 9.20am
Flight SQ322
Terminal 3
Hotel: Ritz Carlton
Pax 1`;
const parsedArrivalHotelLabelDropoff = parseBookingForTest(arrivalHotelLabelDropoffSample) ?? {};
assert.deepEqual(parsedArrivalHotelLabelDropoff, {
  success: true,
  company: '',
  bookingType: 'MNG',
  vehicle: '',
  date: '2026-05-15',
  time: '0920hrs',
  flight: 'SQ322',
  pickup: 'Changi Airport T3',
  dropoff: 'Ritz Carlton',
  booker: '',
  bookerEmail: '',
  name: 'Mr Tan',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Arrival for Mr Tan',
    '15/5/26',
    'ETA 9.20am',
    'Flight SQ322',
    'Terminal 3',
    'Hotel: Ritz Carlton',
    'Pax 1',
  ],
});
assert.equal(parsedArrivalHotelLabelDropoff.extraStopCount ?? '0', '0');
assert.equal(parsedArrivalHotelLabelDropoff.extraStopLocation ?? '', '');

const arrivalTerminalColonLabelSample = `Arrival for Mr Goh
Date: 26/5/26
ETA: 8.20am
Flight: SQ305
Terminal: 2
Hotel: Fullerton Hotel
Pax: 1`;
const parsedArrivalTerminalColonLabel = parseBookingForTest(arrivalTerminalColonLabelSample) ?? {};
assert.deepEqual(parsedArrivalTerminalColonLabel, {
  success: true,
  company: '',
  bookingType: 'MNG',
  vehicle: '',
  date: '2026-05-26',
  time: '0820hrs',
  flight: 'SQ305',
  pickup: 'Changi Airport T2',
  dropoff: 'Fullerton Hotel',
  booker: '',
  bookerEmail: '',
  name: 'Mr Goh',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Arrival for Mr Goh',
    'Date: 26/5/26',
    'ETA: 8.20am',
    'Flight: SQ305',
    'Terminal: 2',
    'Hotel: Fullerton Hotel',
    'Pax: 1',
  ],
});
assert.equal(parsedArrivalTerminalColonLabel.extraStopCount ?? '0', '0');
assert.equal(parsedArrivalTerminalColonLabel.extraStopLocation ?? '', '');

const arrivalDestinationLabelDropoffSample = `Arrival for Ms Chen
Date: 21/5/26
ETA: 10.10am
Flight: SQ336
Terminal 2
Destination: Mandarin Oriental
Pax: 2`;
const parsedArrivalDestinationLabelDropoff = parseBookingForTest(arrivalDestinationLabelDropoffSample) ?? {};
assert.deepEqual(parsedArrivalDestinationLabelDropoff, {
  success: true,
  company: '',
  bookingType: 'MNG',
  vehicle: '',
  date: '2026-05-21',
  time: '1010hrs',
  flight: 'SQ336',
  pickup: 'Changi Airport T2',
  dropoff: 'Mandarin Oriental',
  booker: '',
  bookerEmail: '',
  name: 'Ms Chen',
  pax: '2',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Arrival for Ms Chen',
    'Date: 21/5/26',
    'ETA: 10.10am',
    'Flight: SQ336',
    'Terminal 2',
    'Destination: Mandarin Oriental',
    'Pax: 2',
  ],
});
assert.equal(parsedArrivalDestinationLabelDropoff.extraStopCount ?? '0', '0');
assert.equal(parsedArrivalDestinationLabelDropoff.extraStopLocation ?? '', '');

const adultChildPassengerCountArrivalSample = `Arrival for Ms Wong
Date: 22/5/26
ETA: 11.05am
Flight: SQ321
Terminal 1
Hotel: Capella Singapore
2 adults + 1 child`;
const parsedAdultChildPassengerCountArrival = parseBookingForTest(adultChildPassengerCountArrivalSample) ?? {};
assert.deepEqual(parsedAdultChildPassengerCountArrival, {
  success: true,
  company: '',
  bookingType: 'MNG',
  vehicle: '',
  date: '2026-05-22',
  time: '1105hrs',
  flight: 'SQ321',
  pickup: 'Changi Airport T1',
  dropoff: 'Capella Singapore',
  booker: '',
  bookerEmail: '',
  name: 'Ms Wong',
  pax: '3',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Arrival for Ms Wong',
    'Date: 22/5/26',
    'ETA: 11.05am',
    'Flight: SQ321',
    'Terminal 1',
    'Hotel: Capella Singapore',
    '2 adults + 1 child',
  ],
});
assert.equal(parsedAdultChildPassengerCountArrival.extraStopCount ?? '0', '0');
assert.equal(parsedAdultChildPassengerCountArrival.extraStopLocation ?? '', '');
assert.equal(parsedAdultChildPassengerCountArrival.childSeatRequired ?? '', '');
assert.equal(parsedAdultChildPassengerCountArrival.childSeatCount ?? '', '');
assert.equal(parsedAdultChildPassengerCountArrival.childSeatType ?? '', '');
assert.equal(
  parseBookingForTest(adultChildPassengerCountArrivalSample.replace('2 adults + 1 child', '2 adults and 1 child')).pax,
  '3',
);
assert.equal(
  parseBookingForTest(adultChildPassengerCountArrivalSample.replace('2 adults + 1 child', '2 adult 1 kid')).pax,
  '3',
);

const departureHotelAirportLabelsSample = `Departure for Mr Tan
Date: 19/5/26
Pickup time: 6.30am
Flight: SQ878
Hotel: Fullerton Hotel
Airport: Changi Airport T3
Pax: 1`;
const parsedDepartureHotelAirportLabels = parseBookingForTest(departureHotelAirportLabelsSample) ?? {};
assert.deepEqual(parsedDepartureHotelAirportLabels, {
  success: true,
  company: '',
  bookingType: 'DEP',
  vehicle: '',
  date: '2026-05-19',
  time: '0630hrs',
  flight: 'SQ878',
  pickup: 'Fullerton Hotel',
  dropoff: 'Changi Airport T3',
  booker: '',
  bookerEmail: '',
  name: 'Mr Tan',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Departure for Mr Tan',
    'Date: 19/5/26',
    'Pickup time: 6.30am',
    'Flight: SQ878',
    'Hotel: Fullerton Hotel',
    'Airport: Changi Airport T3',
    'Pax: 1',
  ],
});
assert.equal(parsedDepartureHotelAirportLabels.extraStopCount ?? '0', '0');
assert.equal(parsedDepartureHotelAirportLabels.extraStopLocation ?? '', '');

const etdOnlyDepartureSample = `Departure for Mr Koh
Date: 24/5/26
ETD: 2130
Hotel: Pan Pacific Singapore
Airport: Changi Airport T2
Flight: SQ946
Pax: 1`;
const parsedEtdOnlyDeparture = parseBookingForTest(etdOnlyDepartureSample) ?? {};
assert.deepEqual(parsedEtdOnlyDeparture, {
  success: true,
  company: '',
  bookingType: 'DEP',
  vehicle: '',
  date: '2026-05-24',
  time: '',
  flight: 'SQ946',
  pickup: 'Pan Pacific Singapore',
  dropoff: 'Changi Airport T2',
  booker: '',
  bookerEmail: '',
  name: 'Mr Koh',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Departure for Mr Koh',
    'Date: 24/5/26',
    'ETD: 2130',
    'Hotel: Pan Pacific Singapore',
    'Airport: Changi Airport T2',
    'Flight: SQ946',
    'Pax: 1',
  ],
});
assert.equal(parsedEtdOnlyDeparture.extraStopCount ?? '0', '0');
assert.equal(parsedEtdOnlyDeparture.extraStopLocation ?? '', '');
assert.equal(parseBookingForTest(etdOnlyDepartureSample.replace('ETD: 2130', 'ETD 2130')).time, '');

const pickupTimeWithEtdDepartureSample = `Departure for Mr Koh
Date: 24/5/26
Pickup time: 6.30pm
ETD: 2130
Hotel: Pan Pacific Singapore
Airport: Changi Airport T2
Flight: SQ946
Pax: 1`;
const parsedPickupTimeWithEtdDeparture = parseBookingForTest(pickupTimeWithEtdDepartureSample) ?? {};
assert.deepEqual(parsedPickupTimeWithEtdDeparture, {
  success: true,
  company: '',
  bookingType: 'DEP',
  vehicle: '',
  date: '2026-05-24',
  time: '1830hrs',
  flight: 'SQ946',
  pickup: 'Pan Pacific Singapore',
  dropoff: 'Changi Airport T2',
  booker: '',
  bookerEmail: '',
  name: 'Mr Koh',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Departure for Mr Koh',
    'Date: 24/5/26',
    'Pickup time: 6.30pm',
    'ETD: 2130',
    'Hotel: Pan Pacific Singapore',
    'Airport: Changi Airport T2',
    'Flight: SQ946',
    'Pax: 1',
  ],
});
assert.equal(parsedPickupTimeWithEtdDeparture.extraStopCount ?? '0', '0');
assert.equal(parsedPickupTimeWithEtdDeparture.extraStopLocation ?? '', '');

const principalNameLabelArrivalSample = `Company: BNY
MNG
Date: 18/5/26
ETA: 8.15am
Flight: SQ305
Terminal 2
Hotel: Fullerton Hotel
Principal: Mr Rohan Singh
Pax: 1`;
const parsedPrincipalNameLabelArrival = parseBookingForTest(principalNameLabelArrivalSample) ?? {};
assert.deepEqual(parsedPrincipalNameLabelArrival, {
  success: true,
  company: 'BNY',
  bookingType: 'MNG',
  vehicle: '',
  date: '2026-05-18',
  time: '0815hrs',
  flight: 'SQ305',
  pickup: 'Changi Airport T2',
  dropoff: 'Fullerton Hotel',
  booker: '',
  bookerEmail: '',
  name: 'Mr Rohan Singh',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Company: BNY',
    'MNG',
    'Date: 18/5/26',
    'ETA: 8.15am',
    'Flight: SQ305',
    'Terminal 2',
    'Hotel: Fullerton Hotel',
    'Principal: Mr Rohan Singh',
    'Pax: 1',
  ],
});
assert.equal(parsedPrincipalNameLabelArrival.extraStopCount ?? '0', '0');
assert.equal(parsedPrincipalNameLabelArrival.extraStopLocation ?? '', '');
assert.equal(
  parseBookingForTest(principalNameLabelArrivalSample.replace('Principal:', 'Traveller:')).name,
  'Mr Rohan Singh',
);

const dinnerStandbySample =
  'Hi William, please get Richard standby for Drew, there is a dinner in the evening 6pm at ION Orchard, #04-12A, 2 Orchard Turn, Singapore 238801 and please send him back to Ritz Carlton after the dinner. thanks.';
const parsedDinnerStandby = parseBookingForTest(dinnerStandbySample);
assert.deepEqual(parsedDinnerStandby, {
  success: true,
  company: '',
  bookingType: 'DSP',
  vehicle: '',
  date: '',
  time: '1800hrs',
  flight: '',
  pickup: 'ION Orchard',
  dropoff: 'Ritz Carlton',
  booker: '',
  bookerEmail: '',
  name: 'Drew',
  pax: '1',
  driverName: 'Richard',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Hi William, please get Richard standby for Drew, there is a dinner in the evening 6pm at ION Orchard, #04-12A, 2 Orchard Turn, Singapore 238801 and please send him back to Ritz Carlton after the dinner. thanks.',
  ],
});

const eventVenueStandbySample = `Event standby for Mr Lim
Date: 25/5/26
Time: 6pm
Venue: National Gallery Singapore
Send back to Ritz Carlton after event
Pax: 1`;
const parsedEventVenueStandby = parseBookingForTest(eventVenueStandbySample) ?? {};
assert.deepEqual(parsedEventVenueStandby, {
  success: true,
  company: '',
  bookingType: 'DSP',
  vehicle: '',
  date: '2026-05-25',
  time: '1800hrs',
  flight: '',
  pickup: 'National Gallery Singapore',
  dropoff: 'Ritz Carlton',
  booker: '',
  bookerEmail: '',
  name: 'Mr Lim',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Event standby for Mr Lim',
    'Date: 25/5/26',
    'Time: 6pm',
    'Venue: National Gallery Singapore',
    'Send back to Ritz Carlton after event',
    'Pax: 1',
  ],
});
assert.equal(parsedEventVenueStandby.extraStopCount ?? '0', '0');
assert.equal(parsedEventVenueStandby.extraStopLocation ?? '', '');

const airportDepartureSample =
  'Departure transfer for Sarah Tan on 15 May 2026 7:30pm from Ritz Carlton to Changi Airport T2.';
assert.deepEqual(parseBookingForTest(airportDepartureSample), {
  success: true,
  company: '',
  bookingType: 'DEP',
  vehicle: '',
  date: '2026-05-15',
  time: '1930hrs',
  flight: '',
  pickup: 'Ritz Carlton',
  dropoff: 'Changi Airport T2',
  booker: '',
  bookerEmail: '',
  name: 'Sarah Tan',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [airportDepartureSample],
});

const shortNumericDateDotTimeDepartureSample = `DEP for Mr Tan
15/5/26 7.30pm
From Fullerton Hotel to Changi Airport T3
Flight SQ878
Pax 1`;
const parsedShortNumericDateDotTimeDeparture = parseBookingForTest(shortNumericDateDotTimeDepartureSample) ?? {};
assert.deepEqual(parsedShortNumericDateDotTimeDeparture, {
  success: true,
  company: '',
  bookingType: 'DEP',
  vehicle: '',
  date: '2026-05-15',
  time: '1930hrs',
  flight: 'SQ878',
  pickup: 'Fullerton Hotel',
  dropoff: 'Changi Airport T3',
  booker: '',
  bookerEmail: '',
  name: 'Mr Tan',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'DEP for Mr Tan',
    '15/5/26 7.30pm',
    'From Fullerton Hotel to Changi Airport T3',
    'Flight SQ878',
    'Pax 1',
  ],
});
assert.equal(parsedShortNumericDateDotTimeDeparture.extraStopCount ?? '0', '0');
assert.equal(parsedShortNumericDateDotTimeDeparture.extraStopLocation ?? '', '');

const transferSample =
  'Transfer for Michael Lee on 17 May 2026 1430 from Marina Bay Sands to Fullerton Hotel.';
assert.deepEqual(parseBookingForTest(transferSample), {
  success: true,
  company: '',
  bookingType: 'TRF',
  vehicle: '',
  date: '2026-05-17',
  time: '1430hrs',
  flight: '',
  pickup: 'Marina Bay Sands',
  dropoff: 'Fullerton Hotel',
  booker: '',
  bookerEmail: '',
  name: 'Michael Lee',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [transferSample],
});

const privateJetAirportArrivalTransferSample = `Transfer for Mr Lee
Date: 5/2/26
Time: 1630hrs
From:
WSSL airport | Seletar Airport (Jet Aviation FBO)
To:
Mercure Singapore Bugis Hotel`;
assert.deepEqual(parseBookingForTest(privateJetAirportArrivalTransferSample), {
  success: true,
  company: '',
  bookingType: 'MNG',
  vehicle: '',
  date: '2026-02-05',
  time: '1630hrs',
  flight: '',
  pickup: 'WSSL airport | Seletar Airport (Jet Aviation FBO)',
  dropoff: 'Mercure Singapore Bugis Hotel',
  booker: '',
  bookerEmail: '',
  name: 'Mr Lee',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Transfer for Mr Lee',
    'Date: 5/2/26',
    'Time: 1630hrs',
    'From:',
    'WSSL airport | Seletar Airport (Jet Aviation FBO)',
    'To:',
    'Mercure Singapore Bugis Hotel',
  ],
});

const privateJetAirportDepartureTransferSample = `Transfer for Mr Lee
Date: 5/2/26
Time: 1630hrs
From:
Mercure Singapore Bugis Hotel
To:
WSSL airport | Seletar Airport (Jet Aviation FBO)`;
assert.deepEqual(parseBookingForTest(privateJetAirportDepartureTransferSample), {
  success: true,
  company: '',
  bookingType: 'DEP',
  vehicle: '',
  date: '2026-02-05',
  time: '1630hrs',
  flight: '',
  pickup: 'Mercure Singapore Bugis Hotel',
  dropoff: 'WSSL airport | Seletar Airport (Jet Aviation FBO)',
  booker: '',
  bookerEmail: '',
  name: 'Mr Lee',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Transfer for Mr Lee',
    'Date: 5/2/26',
    'Time: 1630hrs',
    'From:',
    'Mercure Singapore Bugis Hotel',
    'To:',
    'WSSL airport | Seletar Airport (Jet Aviation FBO)',
  ],
});

const hyphenatedPickupLabelTransferSample = `Transfer for Ms Lee
Date: 20/5/26
Time: 2.15pm
Pick-up: Capella Singapore
Drop-off: Marina Bay Sands
Pax: 1`;
const parsedHyphenatedPickupLabelTransfer = parseBookingForTest(hyphenatedPickupLabelTransferSample) ?? {};
assert.deepEqual(parsedHyphenatedPickupLabelTransfer, {
  success: true,
  company: '',
  bookingType: 'TRF',
  vehicle: '',
  date: '2026-05-20',
  time: '1415hrs',
  flight: '',
  pickup: 'Capella Singapore',
  dropoff: 'Marina Bay Sands',
  booker: '',
  bookerEmail: '',
  name: 'Ms Lee',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Transfer for Ms Lee',
    'Date: 20/5/26',
    'Time: 2.15pm',
    'Pick-up: Capella Singapore',
    'Drop-off: Marina Bay Sands',
    'Pax: 1',
  ],
});
assert.equal(parsedHyphenatedPickupLabelTransfer.extraStopCount ?? '0', '0');
assert.equal(parsedHyphenatedPickupLabelTransfer.extraStopLocation ?? '', '');

const pickupDropoffLocationLabelsTransferSample = `Transfer for Mr Lee
Date: 23/5/26
Time: 3.30pm
Pickup location: Fullerton Hotel
Drop-off location: Marina Bay Sands
Pax: 1`;
const parsedPickupDropoffLocationLabelsTransfer = parseBookingForTest(pickupDropoffLocationLabelsTransferSample) ?? {};
assert.deepEqual(parsedPickupDropoffLocationLabelsTransfer, {
  success: true,
  company: '',
  bookingType: 'TRF',
  vehicle: '',
  date: '2026-05-23',
  time: '1530hrs',
  flight: '',
  pickup: 'Fullerton Hotel',
  dropoff: 'Marina Bay Sands',
  booker: '',
  bookerEmail: '',
  name: 'Mr Lee',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Transfer for Mr Lee',
    'Date: 23/5/26',
    'Time: 3.30pm',
    'Pickup location: Fullerton Hotel',
    'Drop-off location: Marina Bay Sands',
    'Pax: 1',
  ],
});
assert.equal(parsedPickupDropoffLocationLabelsTransfer.extraStopCount ?? '0', '0');
assert.equal(parsedPickupDropoffLocationLabelsTransfer.extraStopLocation ?? '', '');

const pickupDropoffPointLabelsTransferSample = `Transfer for Ms Ong
Date: 27/5/26
Time: 4.45pm
Pickup point: Raffles Hotel Singapore
Drop-off point: Gardens by the Bay
Pax: 2`;
const parsedPickupDropoffPointLabelsTransfer = parseBookingForTest(pickupDropoffPointLabelsTransferSample) ?? {};
assert.deepEqual(parsedPickupDropoffPointLabelsTransfer, {
  success: true,
  company: '',
  bookingType: 'TRF',
  vehicle: '',
  date: '2026-05-27',
  time: '1645hrs',
  flight: '',
  pickup: 'Raffles Hotel Singapore',
  dropoff: 'Gardens by the Bay',
  booker: '',
  bookerEmail: '',
  name: 'Ms Ong',
  pax: '2',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Transfer for Ms Ong',
    'Date: 27/5/26',
    'Time: 4.45pm',
    'Pickup point: Raffles Hotel Singapore',
    'Drop-off point: Gardens by the Bay',
    'Pax: 2',
  ],
});
assert.equal(parsedPickupDropoffPointLabelsTransfer.extraStopCount ?? '0', '0');
assert.equal(parsedPickupDropoffPointLabelsTransfer.extraStopLocation ?? '', '');

const childSeatTransferSample =
  'Transfer for Mr Tan 0900 from St Regis to Marina Bay Sands with 2 child seats and booster seat.';
assert.deepEqual(parseBookingForTest(childSeatTransferSample), {
  success: true,
  company: '',
  bookingType: 'TRF',
  vehicle: '',
  date: '',
  time: '0900hrs',
  flight: '',
  pickup: 'St Regis',
  dropoff: 'Marina Bay Sands',
  booker: '',
  bookerEmail: '',
  name: 'Mr Tan',
  pax: '1',
  childSeatRequired: 'yes',
  childSeatCount: '2',
  childSeatType: 'booster seat',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [childSeatTransferSample],
});

const extraStopTransferSample =
  'Transfer for Mr Tan 0900 from St Regis to Fullerton Hotel\nExtra stop: Marina Bay Sands';
assert.deepEqual(parseBookingForTest(extraStopTransferSample), {
  success: true,
  company: '',
  bookingType: 'TRF',
  vehicle: '',
  date: '',
  time: '0900hrs',
  flight: '',
  pickup: 'St Regis',
  dropoff: 'Fullerton Hotel',
  booker: '',
  bookerEmail: '',
  name: 'Mr Tan',
  pax: '1',
  driverName: '',
  driverContact: '',
  extraStopCount: '1',
  extraStopLocation: 'Marina Bay Sands',
  bookerContact: '',
  cleanedLines: [
    'Transfer for Mr Tan 0900 from St Regis to Fullerton Hotel',
    'Extra stop: Marina Bay Sands',
  ],
});

const informalDropByExtraStopDepartureSample = `DEP for Mr Wong
16/5/26 6.45am
From Conrad to airport T1
Drop by Marina One
Flight SQ318
Pax 1`;
assert.deepEqual(parseBookingForTest(informalDropByExtraStopDepartureSample), {
  success: true,
  company: '',
  bookingType: 'DEP',
  vehicle: '',
  date: '2026-05-16',
  time: '0645hrs',
  flight: 'SQ318',
  pickup: 'Conrad',
  dropoff: 'Changi Airport T1',
  booker: '',
  bookerEmail: '',
  name: 'Mr Wong',
  pax: '1',
  driverName: '',
  driverContact: '',
  extraStopCount: '1',
  extraStopLocation: 'Marina One',
  bookerContact: '',
  cleanedLines: [
    'DEP for Mr Wong',
    '16/5/26 6.45am',
    'From Conrad to airport T1',
    'Drop by Marina One',
    'Flight SQ318',
    'Pax 1',
  ],
});

const terminalPickupExtraStopSample = `Company: BROWSER UI TEST COMPANY
Booking type: MNG
Vehicle: AVF
Date: 27/05/2026
Time: 15:30
Flight: SQ333
Pickup: Changi Airport Terminal 3
Extra stop: Marina Bay Sands
Drop-off: Raffles Hotel Singapore
Booker: BROWSER UI TEST BOOKER
Booker WhatsApp: +65 9000 0333
Booker Email: browserui@example.com
Name: BROWSER UI TEST TRAVELER
Pax: 2
Child seat: 2 booster seat
Quoted price: $160.00
Driver Name: TEST DRIVER CRM 20260516`;
assert.equal(parseBookingForTest(terminalPickupExtraStopSample)?.extraStopLocation, 'Marina Bay Sands');
assert.equal(parseBookingForTest(terminalPickupExtraStopSample)?.extraStopCount, '1');

const narratedExtraStopBabySeatDepartureSample =
  'from my house one stop at marina one with 1 baby seat then to airport at 2315hrs';
assert.deepEqual(parseBookingForTest(narratedExtraStopBabySeatDepartureSample), {
  success: true,
  company: '',
  bookingType: 'DEP',
  vehicle: '',
  date: '',
  time: '2315hrs',
  flight: '',
  pickup: 'my house',
  dropoff: 'Changi Airport',
  booker: '',
  bookerEmail: '',
  name: '',
  pax: '1',
  childSeatRequired: 'yes',
  childSeatCount: '1',
  childSeatType: 'infant seat',
  driverName: '',
  driverContact: '',
  extraStopCount: '1',
  extraStopLocation: 'marina one',
  bookerContact: '',
  cleanedLines: [narratedExtraStopBabySeatDepartureSample],
});

const vinuQuotedArrivalMessage = `PG961 > 61 Grange Road

Mr. Vinu. $80 + $10

8mth old child seat`;
assert.deepEqual(parseBookingForTest(vinuQuotedArrivalMessage), {
  success: true,
  company: '',
  bookingType: 'MNG',
  vehicle: '',
  date: '',
  time: '',
  flight: 'PG961',
  pickup: 'Changi Airport',
  dropoff: '61 Grange Road',
  booker: '',
  bookerEmail: '',
  name: 'Mr Vinu',
  pax: '1',
  childSeatRequired: 'yes',
  childSeatCount: '1',
  childSeatType: 'infant seat / 8mth old',
  customerPriceOverride: '90',
  customerPriceOverrideReason: 'Parsed from message: $80 + $10',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'PG961 > 61 Grange Road',
    'Mr. Vinu. $80 + $10',
    '8mth old child seat',
  ],
});

const sgdNettQuotedArrivalMessage = `Arrival for Mr Lim
Date: 15/5/26
Time: 9.20am
Flight: SQ322
Pickup: Changi Airport T3
Drop-off: Ritz Carlton
Pax: 1
Quoted price: SGD 90 nett`;
const parsedSgdNettQuotedArrival = parseBookingForTest(sgdNettQuotedArrivalMessage) ?? {};
assert.deepEqual(parsedSgdNettQuotedArrival, {
  success: true,
  company: '',
  bookingType: 'MNG',
  vehicle: '',
  date: '2026-05-15',
  time: '0920hrs',
  flight: 'SQ322',
  pickup: 'Changi Airport T3',
  dropoff: 'Ritz Carlton',
  booker: '',
  bookerEmail: '',
  name: 'Mr Lim',
  pax: '1',
  customerPriceOverride: '90',
  customerPriceOverrideReason: 'Parsed from message: SGD 90',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Arrival for Mr Lim',
    'Date: 15/5/26',
    'Time: 9.20am',
    'Flight: SQ322',
    'Pickup: Changi Airport T3',
    'Drop-off: Ritz Carlton',
    'Pax: 1',
    'Quoted price: SGD 90 nett',
  ],
});
assert.equal(parsedSgdNettQuotedArrival.extraStopCount ?? '0', '0');
assert.equal(parsedSgdNettQuotedArrival.extraStopLocation ?? '', '');

const structuredAirportArrivalFormMessage = `Title: Prestige Transport 15697
Booking form name: Prestige Transport
Status: Completed (finished)
Service type: Airport transfer
Transfer type: One Way
Pickup date and time: 24-05-2026 17:45
Order total amount: S$105.00
Comment: Require English-speaking driver + Meet & Greet service. Driver is expected to hold a placard with Mr. Nakamura's name "Mr. Z.Nakamura" in the arrivals hall at Changi Airport Terminal.

Route name: Airport arrival

Drop off location:
22 Orange Grove Rd, Singapore 258350

Vehicle name: Toyota Alphard 2.5
Bag count: 3
Passengers count: 4

Client details:
First name: Zenji
Last name: Nakamura
E-mail address: yasuko.kunisawa@ubs.com
Phone number: +819024036047
Passengers: 1
Flight No.: NH841`;
const parsedStructuredAirportArrivalForm = parseBookingForTest(structuredAirportArrivalFormMessage) ?? {};
assert.deepEqual(parsedStructuredAirportArrivalForm, {
  success: true,
  company: 'UBS',
  bookingType: 'MNG',
  vehicle: 'AVF',
  date: '2026-05-24',
  time: '1745hrs',
  flight: 'NH841',
  pickup: 'Changi Airport',
  dropoff: '22 Orange Grove Rd, Singapore 258350',
  booker: 'yasuko',
  bookerEmail: 'yasuko.kunisawa@ubs.com',
  name: 'Zenji Nakamura',
  pax: '1',
  customerPriceOverride: '105',
  customerPriceOverrideReason: 'Parsed from message: S$105.00',
  driverName: '',
  driverContact: '',
  bookerContact: '+819024036047',
  cleanedLines: [
    'Title: Prestige Transport 15697',
    'Booking form name: Prestige Transport',
    'Status: Completed (finished)',
    'Service type: Airport transfer',
    'Transfer type: One Way',
    'Pickup date and time: 24-05-2026 17:45',
    'Order total amount: S$105.00',
    'Comment: Require English-speaking driver + Meet & Greet service. Driver is expected to hold a placard with Mr. Nakamura\'s name "Mr. Z.Nakamura" in the arrivals hall at Changi Airport Terminal.',
    'Route name: Airport arrival',
    'Drop off location:',
    '22 Orange Grove Rd, Singapore 258350',
    'Vehicle name: Toyota Alphard 2.5',
    'Bag count: 3',
    'Passengers count: 4',
    'Client details:',
    'First name: Zenji',
    'Last name: Nakamura',
    'E-mail address: yasuko.kunisawa@ubs.com',
    'Phone number: +819024036047',
    'Passengers: 1',
    'Flight No.: NH841',
  ],
});
assert.equal(parsedStructuredAirportArrivalForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredAirportArrivalForm.extraStopLocation ?? '', '');
assert.equal(parsedStructuredAirportArrivalForm.childSeatRequired ?? '', '');
assert.equal(
  parseBookingForTest(
    structuredAirportArrivalFormMessage.replace(
      'E-mail address: yasuko.kunisawa@ubs.com',
      'E-mail address: yasuko.kunisawa@gmail.com',
    ),
  ).company ?? '',
  '',
);

const structuredMacEmailAirportArrivalFormMessage = `Title: Prestige Transport 15696
Booking form name: Prestige Transport
Status: Completed (finished)
Service type: Airport transfer
Transfer type: One Way
Pickup date and time: 09-05-2026 17:01
Order total amount: S$200.00
Taxes: S$0.00 (0%)
Distance: 46.4 km
Duration: 52 minutes

Route name: Airport arrival

Drop off location:
4 Pandan Vly, Singapore 597628

Vehicle name: Mercedes Benz S-class
Bag count: 2
Passengers count: 3

Client details:
First name: Tan
Last name: WM
E-mail address: wmt21@mac.com
Phone number: +6581217803
Passengers: 1
Flight No.: SQ325

Payment:
Payment: Stripe`;
const parsedStructuredMacEmailAirportArrivalForm =
  parseBookingForTest(structuredMacEmailAirportArrivalFormMessage) ?? {};
assert.equal(parsedStructuredMacEmailAirportArrivalForm.company ?? '', '');
assert.equal(parsedStructuredMacEmailAirportArrivalForm.bookingType, 'MNG');
assert.equal(parsedStructuredMacEmailAirportArrivalForm.date, '2026-05-09');
assert.equal(parsedStructuredMacEmailAirportArrivalForm.time, '1701hrs');
assert.equal(parsedStructuredMacEmailAirportArrivalForm.flight, 'SQ325');
assert.equal(parsedStructuredMacEmailAirportArrivalForm.pickup, 'Changi Airport');
assert.equal(parsedStructuredMacEmailAirportArrivalForm.dropoff, '4 Pandan Vly, Singapore 597628');
assert.equal(parsedStructuredMacEmailAirportArrivalForm.name, 'Tan WM');
assert.equal(parsedStructuredMacEmailAirportArrivalForm.pax, '1');
assert.equal(parsedStructuredMacEmailAirportArrivalForm.bookerEmail, 'wmt21@mac.com');
assert.equal(parsedStructuredMacEmailAirportArrivalForm.bookerContact, '+6581217803');
assert.equal(parsedStructuredMacEmailAirportArrivalForm.customerPriceOverride, '200');
assert.equal(parsedStructuredMacEmailAirportArrivalForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredMacEmailAirportArrivalForm.extraStopLocation ?? '', '');
assert.equal(parsedStructuredMacEmailAirportArrivalForm.childSeatRequired ?? '', '');

const structuredHotmailTripOrganizerAirportArrivalFormMessage = `Title: Prestige Transport 15694
Booking form name: Prestige Transport
Status: Completed (finished)
Service type: Airport transfer
Transfer type: One Way
Pickup date and time: 23-05-2026 19:15
Order total amount: S$105.00
Taxes: S$0.00 (0%)
Distance: 46.4 km
Duration: 52 minutes
Comment: Trip Organizer: Mr. Kim, Hyun Soo (Tel. No.: +65 98156017)

Route name: Airport arrival

Drop off location:
88 Jellicoe Rd, Condo 208747

Vehicle name: Toyota Alphard 2.5
Bag count: 3
Passengers count: 4

Client details:
First name: Lai Ting
Last name: Wong
E-mail address: hyunsoostar@hotmail.com
Phone number: +6597382164
Passengers: 1
Flight No.: KE643`;
const parsedStructuredHotmailTripOrganizerAirportArrivalForm =
  parseBookingForTest(structuredHotmailTripOrganizerAirportArrivalFormMessage) ?? {};
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.company ?? '', '');
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.bookingType, 'MNG');
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.vehicle, 'AVF');
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.date, '2026-05-23');
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.time, '1915hrs');
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.flight, 'KE643');
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.pickup, 'Changi Airport');
assert.equal(
  parsedStructuredHotmailTripOrganizerAirportArrivalForm.dropoff,
  '88 Jellicoe Rd, Condo 208747',
);
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.booker, 'Mr Kim, Hyun Soo');
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.bookerContact, '+65 98156017');
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.bookerEmail, 'hyunsoostar@hotmail.com');
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.name, 'Lai Ting Wong');
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.pax, '1');
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.customerPriceOverride, '105');
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.extraStopLocation ?? '', '');
assert.equal(parsedStructuredHotmailTripOrganizerAirportArrivalForm.childSeatRequired ?? '', '');

const structuredAirportDepartureFormMessage = `Title: Prestige Transport 15698
Booking form name: Prestige Transport
Status: Completed (finished)
Service type: Airport transfer
Transfer type: One Way
Pickup date and time: 28-05-2026 06:30
Order total amount: S$120.00

Route name: Airport departure

Pick up location:
Fullerton Hotel

Vehicle name: Mercedes Benz V Class
Bag count: 2
Passengers count: 6

Client details:
First name: Ken
Last name: Sato
E-mail address: travel.coord@nomura.com
Phone number: +81312345678
Passengers: 2
Flight No.: NH844`;
const parsedStructuredAirportDepartureForm = parseBookingForTest(structuredAirportDepartureFormMessage) ?? {};
assert.equal(parsedStructuredAirportDepartureForm.company, 'NOMURA');
assert.equal(parsedStructuredAirportDepartureForm.booker, 'travel');
assert.equal(parsedStructuredAirportDepartureForm.bookingType, 'DEP');
assert.equal(parsedStructuredAirportDepartureForm.date, '2026-05-28');
assert.equal(parsedStructuredAirportDepartureForm.time, '0630hrs');
assert.equal(parsedStructuredAirportDepartureForm.flight, 'NH844');
assert.equal(parsedStructuredAirportDepartureForm.pickup, 'Fullerton Hotel');
assert.equal(parsedStructuredAirportDepartureForm.dropoff, 'Changi Airport');
assert.equal(parsedStructuredAirportDepartureForm.name, 'Ken Sato');
assert.equal(parsedStructuredAirportDepartureForm.pax, '2');
assert.equal(parsedStructuredAirportDepartureForm.vehicle, 'VVV');
assert.equal(parsedStructuredAirportDepartureForm.customerPriceOverride, '120');
assert.equal(parsedStructuredAirportDepartureForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredAirportDepartureForm.extraStopLocation ?? '', '');
assert.equal(parsedStructuredAirportDepartureForm.childSeatRequired ?? '', '');

const structuredWaypointAirportArrivalFormMessage = `Title: Prestige Transport 15695
Booking form name: Prestige Transport
Status: Completed (finished)
Service type: Airport transfer
Transfer type: One Way
Pickup date and time: 19-05-2026 18:20
Order total amount: S$130.00
Taxes: S$0.00 (0%)
Distance: 46.4 km
Duration: 52 minutes
Comment: 1st Drop off: Ms. Kwok (28 Alexandra View), 2nd Drop off: Ms. Chan (26 Newton Road) Trip Organizer: Mr. Kim, Hyun Soo (Tel. No.: +65 98156017)

Route name: Airport arrival

Route locations:
1. 28 Alexandra View, Singapore 158744

Drop off location:
1. 26 Newton Rd, 307957

Vehicle name: Toyota Alphard 2.5
Bag count: 3
Passengers count: 4

Extra:
1. 1 x Waypoint - S$25.00

Client details:
First name: Pui Yu
Last name: Chan
E-mail address: hyunsoostar@hotmail.com
Phone number: +6596389322
Passengers: 2
Flight No.: SQ883`;
const parsedStructuredWaypointAirportArrivalForm =
  parseBookingForTest(structuredWaypointAirportArrivalFormMessage) ?? {};
assert.equal(parsedStructuredWaypointAirportArrivalForm.company ?? '', '');
assert.equal(parsedStructuredWaypointAirportArrivalForm.booker, 'Mr Kim, Hyun Soo');
assert.equal(parsedStructuredWaypointAirportArrivalForm.bookerContact, '+65 98156017');
assert.equal(parsedStructuredWaypointAirportArrivalForm.bookerEmail, 'hyunsoostar@hotmail.com');
assert.equal(parsedStructuredWaypointAirportArrivalForm.bookingType, 'MNG');
assert.equal(parsedStructuredWaypointAirportArrivalForm.date, '2026-05-19');
assert.equal(parsedStructuredWaypointAirportArrivalForm.time, '1820hrs');
assert.equal(parsedStructuredWaypointAirportArrivalForm.flight, 'SQ883');
assert.equal(parsedStructuredWaypointAirportArrivalForm.pickup, 'Changi Airport');
assert.equal(
  parsedStructuredWaypointAirportArrivalForm.extraStopLocation,
  '28 Alexandra View, Singapore 158744',
);
assert.equal(parsedStructuredWaypointAirportArrivalForm.extraStopCount, '1');
assert.equal(parsedStructuredWaypointAirportArrivalForm.dropoff, '26 Newton Rd, 307957');
assert.equal(parsedStructuredWaypointAirportArrivalForm.name, 'Pui Yu Chan');
assert.equal(parsedStructuredWaypointAirportArrivalForm.pax, '2');
assert.equal(parsedStructuredWaypointAirportArrivalForm.vehicle, 'AVF');
assert.equal(parsedStructuredWaypointAirportArrivalForm.customerPriceOverride, '130');
assert.equal(parsedStructuredWaypointAirportArrivalForm.childSeatRequired ?? '', '');

const exactPastedWaypointAirportArrivalFormMessage = `Transfer type	One Way
Pickup date and time	19-05-2026 18:20
Order total amount	S$130.00
Taxes	S$0.00 (0%)
Distance	46.4 km
Duration	52 minutes
Comment	1st Drop off: Ms. Kwok (28 Alexandra View), 2nd Drop off: Ms. Chan (26 Newton Road) Trip Organizer: Mr. Kim, Hyun Soo (Tel. No.: +65 98156017)
ROUTE
Route name	Airport arrival
ROUTE LOCATIONS
28 Alexandra View, 싱가포르 28 Alexandra View, Singapore 158744
DROP OFF LOCATION
26 Newton Rd, 싱가포르 307957
VEHICLE
Vehicle name	Toyota Alphard 2.5
Bag count	3
Passengers count	4
EXTRA
1 x Waypoint 1 - S$25.00
CLIENT DETAILS
First name	Pui Yu
Last name	Chan
E-mail address	hyunsoostar@hotmail.com
Phone number	+6596389322
Passangers	2
Flight No.	SQ883`;
const parsedExactPastedWaypointAirportArrivalForm =
  parseBookingForTest(exactPastedWaypointAirportArrivalFormMessage) ?? {};
assert.equal(parsedExactPastedWaypointAirportArrivalForm.company ?? '', '');
assert.equal(parsedExactPastedWaypointAirportArrivalForm.booker, 'Mr Kim, Hyun Soo');
assert.equal(parsedExactPastedWaypointAirportArrivalForm.bookerContact, '+65 98156017');
assert.equal(parsedExactPastedWaypointAirportArrivalForm.bookerEmail, 'hyunsoostar@hotmail.com');
assert.equal(parsedExactPastedWaypointAirportArrivalForm.bookingType, 'MNG');
assert.equal(parsedExactPastedWaypointAirportArrivalForm.date, '2026-05-19');
assert.equal(parsedExactPastedWaypointAirportArrivalForm.time, '1820hrs');
assert.equal(parsedExactPastedWaypointAirportArrivalForm.flight, 'SQ883');
assert.equal(parsedExactPastedWaypointAirportArrivalForm.pickup, 'Changi Airport');
assert.equal(
  parsedExactPastedWaypointAirportArrivalForm.extraStopLocation,
  '28 Alexandra View, Singapore 158744',
);
assert.equal(parsedExactPastedWaypointAirportArrivalForm.extraStopCount, '1');
assert.equal(parsedExactPastedWaypointAirportArrivalForm.dropoff, '26 Newton Rd, 307957');
assert.equal(parsedExactPastedWaypointAirportArrivalForm.name, 'Pui Yu Chan');
assert.equal(parsedExactPastedWaypointAirportArrivalForm.pax, '2');
assert.equal(parsedExactPastedWaypointAirportArrivalForm.vehicle, 'AVF');
assert.equal(parsedExactPastedWaypointAirportArrivalForm.customerPriceOverride, '130');
assert.equal(parsedExactPastedWaypointAirportArrivalForm.childSeatRequired ?? '', '');
const parsedExactPastedWaypointSingleDigitHour =
  parseBookingForTest(
    exactPastedWaypointAirportArrivalFormMessage.replace(
      'Pickup date and time	19-05-2026 18:20',
      'Pickup date and time	17-05-2026 7:05',
    ),
  ) ?? {};
assert.equal(parsedExactPastedWaypointSingleDigitHour.date, '2026-05-17');
assert.equal(parsedExactPastedWaypointSingleDigitHour.time, '0705hrs');

const exactPastedWaypointAirportDepartureFormMessage = `Pickup date and time	06-05-2026 8:00
Order total amount	S$110.00
Taxes	S$0.00 (0%)
Distance	15.1 km
Duration	25 minutes
Comment	For Driver's Info – Pax Name and Number: Edien Joy, +65 83894342 For any updates, please contact me. Thank you.
ROUTE
Route name	Airport Departure
ROUTE LOCATIONS
351C Canberra Road, Singapore 351C Canberra Rd, Singapore 753351
PICK UP LOCATION
756 Woodlands Ave 4, Singapore
VEHICLE
Vehicle name	Mercedes Benz E-class
Bag count	2
Passengers count	3
EXTRA
1 x Waypoint 1 - S$25.00
CLIENT DETAILS
First name	Luther
Last name	Graham
E-mail address	luthergrahambk@gmail.com
Phone number	+6580912613
Passangers	2
Flight No.	TR 288`;
const parsedExactPastedWaypointAirportDepartureForm =
  parseBookingForTest(exactPastedWaypointAirportDepartureFormMessage) ?? {};
assert.equal(parsedExactPastedWaypointAirportDepartureForm.company ?? '', '');
assert.equal(parsedExactPastedWaypointAirportDepartureForm.booker, 'Luther Graham');
assert.equal(parsedExactPastedWaypointAirportDepartureForm.bookerContact, '+6580912613');
assert.equal(parsedExactPastedWaypointAirportDepartureForm.bookerEmail, 'luthergrahambk@gmail.com');
assert.equal(parsedExactPastedWaypointAirportDepartureForm.bookingType, 'DEP');
assert.equal(parsedExactPastedWaypointAirportDepartureForm.date, '2026-05-06');
assert.equal(parsedExactPastedWaypointAirportDepartureForm.time, '0800hrs');
assert.equal(parsedExactPastedWaypointAirportDepartureForm.flight, 'TR288');
assert.equal(parsedExactPastedWaypointAirportDepartureForm.pickup, '756 Woodlands Ave 4, Singapore');
assert.equal(
  parsedExactPastedWaypointAirportDepartureForm.extraStopLocation,
  '351C Canberra Rd, Singapore 753351',
);
assert.equal(parsedExactPastedWaypointAirportDepartureForm.extraStopCount, '1');
assert.equal(parsedExactPastedWaypointAirportDepartureForm.dropoff, 'Changi Airport');
assert.equal(parsedExactPastedWaypointAirportDepartureForm.name, 'Edien Joy');
assert.equal(parsedExactPastedWaypointAirportDepartureForm.pax, '2');
assert.equal(parsedExactPastedWaypointAirportDepartureForm.vehicle, 'E-Class');
assert.equal(parsedExactPastedWaypointAirportDepartureForm.customerPriceOverride, '110');
assert.equal(parsedExactPastedWaypointAirportDepartureForm.childSeatRequired ?? '', '');

const vehicleTextRegressionCases = [
  {
    label: 'E class',
    input: 'Vehicle: E class',
    expectedVehicle: 'E-Class',
  },
  {
    label: 'E-Class',
    input: 'Vehicle: E-Class',
    expectedVehicle: 'E-Class',
  },
  {
    label: 'Mercedes E class',
    input: 'Please arrange Mercedes E class for Mr Parser Test tomorrow.',
    expectedVehicle: 'E-Class',
  },
  {
    label: 'Mercedes E-Class',
    input: 'Please arrange Mercedes E-Class for Mr Parser Test tomorrow.',
    expectedVehicle: 'E-Class',
  },
  {
    label: 'AVF',
    input: 'Vehicle: AVF',
    expectedVehicle: 'AVF',
  },
  {
    label: 'E-Class / AVF',
    input: 'Vehicle: E-Class / AVF',
    expectedVehicle: 'E-Class / AVF',
  },
];

for (const { label, input, expectedVehicle } of vehicleTextRegressionCases) {
  const parsedVehicleRegressionCase = parseBookingForTest(`Booking for Mr Parser Test
Pickup: Ritz Carlton
Drop-off: Fullerton Hotel
${input}`) ?? {};

  assert.equal(
    parsedVehicleRegressionCase.vehicle,
    expectedVehicle,
    `${label} should normalize to ${expectedVehicle}`,
  );
}

const eClassCompanyOnlyMessage = `Company: E-Class Logistics
Pickup: Ritz Carlton
Drop-off: Fullerton Hotel
Name: Mr Parser Test
Pax: 1`;
const parsedEClassCompanyOnly = parseBookingForTest(eClassCompanyOnlyMessage) ?? {};
assert.equal(parsedEClassCompanyOnly.company, 'E-Class Logistics');
assert.equal(parsedEClassCompanyOnly.vehicle ?? '', '');

const structuredPassengerNameAndNumberDepartureFormMessage = `Pickup date and time	07-05-2026 9:30
Order total amount	S$110.00
Comment	For Driver's Info – Passenger Name and Number: Sarah Lim, +65 81234567
ROUTE
Route name	Airport Departure
PICK UP LOCATION
Marina Bay Sands
VEHICLE
Vehicle name	Mercedes Benz S-class
Passengers count	3
CLIENT DETAILS
First name	Jonathan
Last name	Tan
E-mail address	jonathan.tan@gmail.com
Phone number	+6590001111
Passangers	1
Flight No.	SQ 306`;
const parsedStructuredPassengerNameAndNumberDepartureForm =
  parseBookingForTest(structuredPassengerNameAndNumberDepartureFormMessage) ?? {};
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.company ?? '', '');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.booker, 'Jonathan Tan');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.bookerContact, '+6590001111');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.bookerEmail, 'jonathan.tan@gmail.com');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.bookingType, 'DEP');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.date, '2026-05-07');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.time, '0930hrs');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.flight, 'SQ306');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.pickup, 'Marina Bay Sands');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.dropoff, 'Changi Airport');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.name, 'Sarah Lim');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.pax, '1');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.vehicle, 'S class');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.customerPriceOverride, '110');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.extraStopLocation ?? '', '');
assert.equal(parsedStructuredPassengerNameAndNumberDepartureForm.childSeatRequired ?? '', '');

const structuredCountryCodeEmailAirportArrivalFormMessage = `Title: Prestige Transport 15710
Booking form name: Prestige Transport
Service type: Airport transfer
Transfer type: One Way
Pickup date and time: 29-05-2026 14:35
Order total amount: S$105.00

Route name: Airport arrival

Drop off location:
Conrad Singapore Orchard

Vehicle name: Toyota Vellfire
Passengers count: 4

Client details:
First name: Hiroshi
Last name: Sato
E-mail address: travel.desk@mitsubishi.co.jp
Phone number: +81312345678
Passengers: 2
Flight No.: JL711`;
const parsedStructuredCountryCodeEmailAirportArrivalForm =
  parseBookingForTest(structuredCountryCodeEmailAirportArrivalFormMessage) ?? {};
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.company, 'MITSUBISHI');
assert.notEqual(parsedStructuredCountryCodeEmailAirportArrivalForm.company, 'CO');
assert.notEqual(parsedStructuredCountryCodeEmailAirportArrivalForm.company, 'JP');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.booker, 'travel');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.bookerEmail, 'travel.desk@mitsubishi.co.jp');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.bookerContact, '+81312345678');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.bookingType, 'MNG');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.date, '2026-05-29');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.time, '1435hrs');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.flight, 'JL711');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.pickup, 'Changi Airport');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.dropoff, 'Conrad Singapore Orchard');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.name, 'Hiroshi Sato');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.pax, '2');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.vehicle, 'AVF');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.customerPriceOverride, '105');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.extraStopLocation ?? '', '');
assert.equal(parsedStructuredCountryCodeEmailAirportArrivalForm.childSeatRequired ?? '', '');

const structuredChildSeatExtraAirportArrivalFormMessage = `Title: Prestige Transport 15711
Booking form name: Prestige Transport
Service type: Airport transfer
Transfer type: One Way
Pickup date and time: 30-05-2026 10:20
Order total amount: S$135.00

Route name: Airport arrival

Drop off location:
Four Seasons Singapore

Vehicle name: Toyota Alphard 2.5
Passengers count: 4

Extra:
2 x Booster Seat - S$30.00

Client details:
First name: Mei Lin
Last name: Wong
E-mail address: mei.wong@gmail.com
Phone number: +6588881111
Passengers: 2
Flight No.: SQ317`;
const parsedStructuredChildSeatExtraAirportArrivalForm =
  parseBookingForTest(structuredChildSeatExtraAirportArrivalFormMessage) ?? {};
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.company ?? '', '');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.booker, 'mei');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.bookerEmail, 'mei.wong@gmail.com');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.bookerContact, '+6588881111');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.bookingType, 'MNG');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.date, '2026-05-30');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.time, '1020hrs');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.flight, 'SQ317');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.pickup, 'Changi Airport');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.dropoff, 'Four Seasons Singapore');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.name, 'Mei Lin Wong');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.pax, '2');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.vehicle, 'AVF');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.customerPriceOverride, '135');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.childSeatRequired, 'yes');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.childSeatCount, '2');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.childSeatType, 'booster seat');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredChildSeatExtraAirportArrivalForm.extraStopLocation ?? '', '');

const structuredMobileNumberAirportArrivalFormMessage = `Title: Prestige Transport 15716
Booking form name: Prestige Transport
Service type: Airport transfer
Transfer type: One Way
Pickup date and time: 04-06-2026 08:10
Order total amount: S$105.00

Route name: Airport arrival

Drop off location:
Mandarin Oriental Singapore

Vehicle name: Toyota Alphard 2.5
Passengers count: 4

Client details:
First name: Grace
Last name: Park
E-mail address: grace.park@gmail.com
Mobile number: +6595556666
Passengers: 3
Flight No.: SQ601`;
const parsedStructuredMobileNumberAirportArrivalForm =
  parseBookingForTest(structuredMobileNumberAirportArrivalFormMessage) ?? {};
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.company ?? '', '');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.booker, 'grace');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.bookerEmail, 'grace.park@gmail.com');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.bookerContact, '+6595556666');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.bookingType, 'MNG');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.date, '2026-06-04');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.time, '0810hrs');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.flight, 'SQ601');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.pickup, 'Changi Airport');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.dropoff, 'Mandarin Oriental Singapore');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.name, 'Grace Park');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.pax, '3');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.vehicle, 'AVF');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.customerPriceOverride, '105');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.extraStopLocation ?? '', '');
assert.equal(parsedStructuredMobileNumberAirportArrivalForm.childSeatRequired ?? '', '');

const structuredContactNumberAirportDepartureFormMessage = `Title: Prestige Transport 15717
Booking form name: Prestige Transport
Service type: Airport transfer
Transfer type: One Way
Pickup date and time: 05-06-2026 18:30
Order total amount: S$120.00

Route name: Airport departure

Pick up location:
Conrad Singapore Orchard

Vehicle name: Mercedes Benz V Class
Passengers count: 6

Client details:
First name: Kevin
Last name: Ng
E-mail address: kevin.ng@gmail.com
Contact number: +6596667777
Passengers: 2
Flight No.: SQ946`;
const parsedStructuredContactNumberAirportDepartureForm =
  parseBookingForTest(structuredContactNumberAirportDepartureFormMessage) ?? {};
assert.equal(parsedStructuredContactNumberAirportDepartureForm.company ?? '', '');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.booker, 'kevin');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.bookerEmail, 'kevin.ng@gmail.com');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.bookerContact, '+6596667777');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.bookingType, 'DEP');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.date, '2026-06-05');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.time, '1830hrs');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.flight, 'SQ946');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.pickup, 'Conrad Singapore Orchard');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.dropoff, 'Changi Airport');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.name, 'Kevin Ng');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.pax, '2');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.vehicle, 'VVV');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.customerPriceOverride, '120');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.extraStopLocation ?? '', '');
assert.equal(parsedStructuredContactNumberAirportDepartureForm.childSeatRequired ?? '', '');

const structuredUnlabeledPhoneAirportArrivalFormMessage = `Title: Prestige Transport 15718
Booking form name: Prestige Transport
Service type: Airport transfer
Transfer type: One Way
Pickup date and time: 06-06-2026 09:15
Order total amount: S$105.00

Route name: Airport arrival

Drop off location:
Raffles Hotel Singapore

Vehicle name: Toyota Alphard 2.5
Passengers count: 4

Client details:
First name: Marcus
Last name: Lee
E-mail address: marcus.lee@gmail.com
+6597778888
Passengers: 2
Flight No.: SQ305`;
const parsedStructuredUnlabeledPhoneAirportArrivalForm =
  parseBookingForTest(structuredUnlabeledPhoneAirportArrivalFormMessage) ?? {};
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.company ?? '', '');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.booker, 'marcus');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.bookerEmail, 'marcus.lee@gmail.com');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.bookerContact, '+6597778888');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.bookingType, 'MNG');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.date, '2026-06-06');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.time, '0915hrs');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.flight, 'SQ305');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.pickup, 'Changi Airport');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.dropoff, 'Raffles Hotel Singapore');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.name, 'Marcus Lee');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.pax, '2');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.vehicle, 'AVF');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.customerPriceOverride, '105');
assert.notEqual(parsedStructuredUnlabeledPhoneAirportArrivalForm.bookerContact, '105');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.extraStopLocation ?? '', '');
assert.equal(parsedStructuredUnlabeledPhoneAirportArrivalForm.childSeatRequired ?? '', '');

const structuredTelNoAirportArrivalFormMessage = `Title: Prestige Transport 15719
Booking form name: Prestige Transport
Service type: Airport transfer
Transfer type: One Way
Pickup date and time: 07-06-2026 12:40
Order total amount: S$110.00

Route name: Airport arrival

Drop off location:
The St. Regis Singapore

Vehicle name: Mercedes Benz S-class
Passengers count: 3

Client details:
First name: Yuki
Last name: Tanaka
E-mail address: yuki.tanaka@gmail.com
Tel. No.: +65 9888 0000
Passengers: 1
Flight No.: SQ631`;
const parsedStructuredTelNoAirportArrivalForm =
  parseBookingForTest(structuredTelNoAirportArrivalFormMessage) ?? {};
assert.equal(parsedStructuredTelNoAirportArrivalForm.company ?? '', '');
assert.equal(parsedStructuredTelNoAirportArrivalForm.booker, 'yuki');
assert.equal(parsedStructuredTelNoAirportArrivalForm.bookerEmail, 'yuki.tanaka@gmail.com');
assert.equal(parsedStructuredTelNoAirportArrivalForm.bookerContact, '+65 9888 0000');
assert.equal(parsedStructuredTelNoAirportArrivalForm.bookingType, 'MNG');
assert.equal(parsedStructuredTelNoAirportArrivalForm.date, '2026-06-07');
assert.equal(parsedStructuredTelNoAirportArrivalForm.time, '1240hrs');
assert.equal(parsedStructuredTelNoAirportArrivalForm.flight, 'SQ631');
assert.equal(parsedStructuredTelNoAirportArrivalForm.pickup, 'Changi Airport');
assert.equal(parsedStructuredTelNoAirportArrivalForm.dropoff, 'The St. Regis Singapore');
assert.equal(parsedStructuredTelNoAirportArrivalForm.name, 'Yuki Tanaka');
assert.equal(parsedStructuredTelNoAirportArrivalForm.pax, '1');
assert.equal(parsedStructuredTelNoAirportArrivalForm.vehicle, 'S class');
assert.equal(parsedStructuredTelNoAirportArrivalForm.customerPriceOverride, '110');
assert.equal(parsedStructuredTelNoAirportArrivalForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredTelNoAirportArrivalForm.extraStopLocation ?? '', '');
assert.equal(parsedStructuredTelNoAirportArrivalForm.childSeatRequired ?? '', '');

const structuredPointToPointTransferFormMessage = `Title: Prestige Transport 15712
Booking form name: Prestige Transport
Service type: Point to point transfer
Transfer type: One Way
Pickup date and time: 31-05-2026 16:10
Order total amount: S$75.00

Route name: City transfer

Pick up location:
Capella Singapore

Drop off location:
Marina Bay Sands

Vehicle name: Mercedes Benz E-class
Passengers count: 3

Client details:
First name: Audrey
Last name: Lee
E-mail address: audrey.lee@gmail.com
Phone number: +6591112222
Passengers: 2`;
const parsedStructuredPointToPointTransferForm =
  parseBookingForTest(structuredPointToPointTransferFormMessage) ?? {};
assert.equal(parsedStructuredPointToPointTransferForm.company ?? '', '');
assert.equal(parsedStructuredPointToPointTransferForm.booker, 'audrey');
assert.equal(parsedStructuredPointToPointTransferForm.bookerEmail, 'audrey.lee@gmail.com');
assert.equal(parsedStructuredPointToPointTransferForm.bookerContact, '+6591112222');
assert.equal(parsedStructuredPointToPointTransferForm.bookingType, 'TRF');
assert.equal(parsedStructuredPointToPointTransferForm.date, '2026-05-31');
assert.equal(parsedStructuredPointToPointTransferForm.time, '1610hrs');
assert.equal(parsedStructuredPointToPointTransferForm.flight ?? '', '');
assert.equal(parsedStructuredPointToPointTransferForm.pickup, 'Capella Singapore');
assert.equal(parsedStructuredPointToPointTransferForm.dropoff, 'Marina Bay Sands');
assert.equal(parsedStructuredPointToPointTransferForm.name, 'Audrey Lee');
assert.equal(parsedStructuredPointToPointTransferForm.pax, '2');
assert.equal(parsedStructuredPointToPointTransferForm.vehicle, 'E-Class');
assert.equal(parsedStructuredPointToPointTransferForm.customerPriceOverride, '75');
assert.equal(parsedStructuredPointToPointTransferForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredPointToPointTransferForm.extraStopLocation ?? '', '');
assert.equal(parsedStructuredPointToPointTransferForm.childSeatRequired ?? '', '');

const structuredStartEndPointToPointTransferFormMessage = `Title: Prestige Transport 15713
Booking form name: Prestige Transport
Service type: Point to point transfer
Transfer type: One Way
Pickup date and time: 01-06-2026 09:40
Order total amount: S$80.00

Route name: City transfer

Start location:
Raffles Hotel Singapore

End location:
National Gallery Singapore

Vehicle name: Mercedes Benz S-class
Passengers count: 3

Client details:
First name: Daniel
Last name: Ho
E-mail address: daniel.ho@gmail.com
Phone number: +6592223333
Passengers: 1`;
const parsedStructuredStartEndPointToPointTransferForm =
  parseBookingForTest(structuredStartEndPointToPointTransferFormMessage) ?? {};
assert.equal(parsedStructuredStartEndPointToPointTransferForm.company ?? '', '');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.booker, 'daniel');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.bookerEmail, 'daniel.ho@gmail.com');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.bookerContact, '+6592223333');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.bookingType, 'TRF');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.date, '2026-06-01');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.time, '0940hrs');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.flight ?? '', '');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.pickup, 'Raffles Hotel Singapore');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.dropoff, 'National Gallery Singapore');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.name, 'Daniel Ho');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.pax, '1');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.vehicle, 'S class');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.customerPriceOverride, '80');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.extraStopLocation ?? '', '');
assert.equal(parsedStructuredStartEndPointToPointTransferForm.childSeatRequired ?? '', '');

const structuredAddressPointToPointTransferFormMessage = `Title: Prestige Transport 15714
Booking form name: Prestige Transport
Service type: Point to point transfer
Transfer type: One Way
Pickup date and time: 02-06-2026 11:25
Order total amount: S$90.00

Route name: City transfer

Pickup address:
The Warehouse Hotel

Drop-off address:
Sentosa Golf Club

Vehicle name: Mercedes Benz E-class
Passengers count: 3

Client details:
First name: Olivia
Last name: Tan
E-mail address: olivia.tan@gmail.com
Phone number: +6593334444
Passengers: 2`;
const parsedStructuredAddressPointToPointTransferForm =
  parseBookingForTest(structuredAddressPointToPointTransferFormMessage) ?? {};
assert.equal(parsedStructuredAddressPointToPointTransferForm.company ?? '', '');
assert.equal(parsedStructuredAddressPointToPointTransferForm.booker, 'olivia');
assert.equal(parsedStructuredAddressPointToPointTransferForm.bookerEmail, 'olivia.tan@gmail.com');
assert.equal(parsedStructuredAddressPointToPointTransferForm.bookerContact, '+6593334444');
assert.equal(parsedStructuredAddressPointToPointTransferForm.bookingType, 'TRF');
assert.equal(parsedStructuredAddressPointToPointTransferForm.date, '2026-06-02');
assert.equal(parsedStructuredAddressPointToPointTransferForm.time, '1125hrs');
assert.equal(parsedStructuredAddressPointToPointTransferForm.flight ?? '', '');
assert.equal(parsedStructuredAddressPointToPointTransferForm.pickup, 'The Warehouse Hotel');
assert.equal(parsedStructuredAddressPointToPointTransferForm.dropoff, 'Sentosa Golf Club');
assert.equal(parsedStructuredAddressPointToPointTransferForm.name, 'Olivia Tan');
assert.equal(parsedStructuredAddressPointToPointTransferForm.pax, '2');
assert.equal(parsedStructuredAddressPointToPointTransferForm.vehicle, 'E-Class');
assert.equal(parsedStructuredAddressPointToPointTransferForm.customerPriceOverride, '90');
assert.equal(parsedStructuredAddressPointToPointTransferForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredAddressPointToPointTransferForm.extraStopLocation ?? '', '');
assert.equal(parsedStructuredAddressPointToPointTransferForm.childSeatRequired ?? '', '');

const structuredOriginDestinationAddressPointToPointTransferFormMessage = `Title: Prestige Transport 15715
Booking form name: Prestige Transport
Service type: Point to point transfer
Transfer type: One Way
Pickup date and time: 03-06-2026 13:50
Order total amount: S$140.00

Route name: City transfer

Origin address:
Four Seasons Singapore

Destination address:
Singapore Expo

Vehicle name: 13-seater minibus
Passengers count: 13

Client details:
First name: Rachel
Last name: Lim
E-mail address: rachel.lim@gmail.com
Phone number: +6594445555
Passengers: 5`;
const parsedStructuredOriginDestinationAddressPointToPointTransferForm =
  parseBookingForTest(structuredOriginDestinationAddressPointToPointTransferFormMessage) ?? {};
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.company ?? '', '');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.booker, 'rachel');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.bookerEmail, 'rachel.lim@gmail.com');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.bookerContact, '+6594445555');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.bookingType, 'TRF');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.date, '2026-06-03');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.time, '1350hrs');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.flight ?? '', '');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.pickup, 'Four Seasons Singapore');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.dropoff, 'Singapore Expo');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.name, 'Rachel Lim');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.pax, '5');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.vehicle, 'Combi');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.customerPriceOverride, '140');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.extraStopCount ?? '0', '0');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.extraStopLocation ?? '', '');
assert.equal(parsedStructuredOriginDestinationAddressPointToPointTransferForm.childSeatRequired ?? '', '');

const eventReturnTripSample =
  'Please arrange standby for Drew at Gardens by the Bay, Singapore 018953 and send him back to Ritz Carlton after the event. thanks.';
assert.deepEqual(parseBookingForTest(eventReturnTripSample), {
  success: true,
  company: '',
  bookingType: 'DSP',
  vehicle: '',
  date: '',
  time: '',
  flight: '',
  pickup: 'Gardens by the Bay',
  dropoff: 'Ritz Carlton',
  booker: '',
  bookerEmail: '',
  name: 'Drew',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [eventReturnTripSample],
});

const multiStopItinerarySample = `Hi William, we need a car for Drew tomorrow, please refer to the below schedule:
From Grand Hyatt to Ritz-Carlton Singapore (by 10am); 12pm BDC office; 1:30pm Temasek Office, 60B Orchard Road, Tower 2, The Atrium@Orchard, Singapore; 3:30pm 8 Marina View, Asia Square Tower 1, #37-01, Singapore 018960; 6pm Ritz-Carlton`;
assert.deepEqual(parseBookingForTest(multiStopItinerarySample), {
  success: true,
  company: '',
  bookingType: 'DSP',
  vehicle: '',
  date: '2026-05-14',
  time: '1000hrs',
  flight: '',
  pickup: 'Grand Hyatt',
  dropoff: 'Ritz-Carlton',
  booker: '',
  bookerEmail: '',
  name: 'Drew',
  pax: '1',
  driverName: '',
  driverContact: '',
  extraStopCount: '5',
  extraStopLocation:
    'Ritz-Carlton Singapore by 10am > BDC office at 12pm > Temasek Office, 60B Orchard Road, Tower 2, The Atrium@Orchard, Singapore at 1:30pm > 8 Marina View, Asia Square Tower 1, #37-01, Singapore 018960 at 3:30pm > Ritz-Carlton at 6pm',
  bookerContact: '',
  cleanedLines: [
    'Hi William, we need a car for Drew tomorrow, please refer to the below schedule:',
    'From Grand Hyatt to Ritz-Carlton Singapore (by 10am); 12pm BDC office; 1:30pm Temasek Office, 60B Orchard Road, Tower 2, The Atrium@Orchard, Singapore; 3:30pm 8 Marina View, Asia Square Tower 1, #37-01, Singapore 018960; 6pm Ritz-Carlton',
  ],
});

const timedScheduleItinerarySample = `Hi William, please arrange a car for Drew tomorrow, schedule as follow:
9:30am 1 HarbourFront Avenue, #02-01 Keppel Bay Tower;
11am One Raffles Quay, #39-01 North Tower;
2pm Capital Tower;
4:30pm BDC office;`;
assert.deepEqual(parseBookingForTest(timedScheduleItinerarySample), {
  success: true,
  company: '',
  bookingType: 'DSP',
  vehicle: '',
  date: '2026-05-14',
  time: '0930hrs',
  flight: '',
  pickup: '1 HarbourFront Avenue, Keppel Bay Tower',
  dropoff: 'BDC office',
  booker: '',
  bookerEmail: '',
  name: 'Drew',
  pax: '1',
  driverName: '',
  driverContact: '',
  extraStopCount: '3',
  extraStopLocation: 'One Raffles Quay, North Tower > Capital Tower',
  bookerContact: '',
  cleanedLines: [
    'Hi William, please arrange a car for Drew tomorrow, schedule as follow:',
    '9:30am 1 HarbourFront Avenue, #02-01 Keppel Bay Tower;',
    '11am One Raffles Quay, #39-01 North Tower;',
    '2pm Capital Tower;',
    '4:30pm BDC office;',
  ],
});

const liveBugSamples = [
  {
    input: `Hi William.

Tomorrow:
1) Mr Deep arriving SQ318 ETA 0610hrs. Send to Fullerton Hotel.
2) Mr Stanley departure 9pm from Ritz Carlton to T3 taking SQ221.
3) Need standby AVF for Ms Chloe 1pm-5pm MBS meetings then send back to Capella.

Richard handle Deep.
Ah Seng handle Stanley.

Booked by Nicole from BNY.
Thanks.`,
    expected: {
      success: false,
      multipleBookingsDetected: true,
      parserWarning: 'Multiple bookings detected. Please select one extracted booking.',
      booker: 'Nicole',
      company: 'BNY',
    },
    previewLength: 3,
  },
  {
    input: `Hi William pls assist.

Boss arriving EK404 tomorrow 1815hrs.
Pickup airport and send to Marina Bay Sands.

Need standby till 10pm then return Ritz Carlton.

Ah Seng ok for this?

Booked by Sharon from Shiseido.`,
    expected: {
      success: false,
      multipleBookingsDetected: true,
      parserWarning: 'Multiple bookings detected. Please select one extracted booking.',
      booker: 'Sharon',
      company: 'Shiseido',
    },
    previewLength: 2,
    previewRoutes: [
      ['Changi Airport', 'Marina Bay Sands'],
      ['Marina Bay Sands', 'Ritz Carlton'],
    ],
  },
  {
    input: `Need 2 cars tomorrow.

1. Mr Lee SQ377 arriving 0740hrs to Ritz Carlton.
2. Ms Wong from St Regis to T3 at 9pm taking SQ638.`,
    expected: {
      success: false,
      multipleBookingsDetected: true,
      parserWarning: 'Multiple bookings detected. Please select one extracted booking.',
    },
    previewLength: 2,
    previewRoutes: [
      ['Changi Airport', 'Ritz Carlton'],
      ['St Regis', 'Changi Airport T3'],
    ],
  },
  {
    input: 'Please arrange for Mr Andrew Lim tomorrow from St Regis to MBS at 9am.',
    expected: {
      multipleBookingsDetected: '',
      parserWarning: '',
      name: 'Mr Andrew Lim',
      bookingType: 'TRF',
      time: '0900hrs',
      pickup: 'St Regis',
      dropoff: 'MBS',
      flight: '',
    },
  },
  {
    input: 'Guest arriving on QR948 tomorrow morning, please send to Capella. Name is Mr Faisal.',
    expected: {
      multipleBookingsDetected: '',
      parserWarning: '',
      name: 'Mr Faisal',
      bookingType: 'MNG',
      flight: 'QR948',
      pickup: 'Changi Airport',
      dropoff: 'Capella',
    },
  },
  {
    input: 'Mr Andrew Lim tomorrow from St Regis to MBS',
    expected: {
      name: 'Mr Andrew Lim',
      bookingType: 'TRF',
      pickup: 'St Regis',
      dropoff: 'MBS',
    },
  },
  {
    input: 'Sharon from Shiseido',
    expected: {
      booker: 'Sharon',
      company: 'Shiseido',
      pickup: '',
    },
  },
  {
    input: 'Can get Ah Seng to drive Mr Deep tomorrow from Tiger Global office to Changi Airport T3 SQ878',
    expected: {
      driverName: 'Ah Seng',
      name: 'Mr Deep',
      bookingType: 'DEP',
      pickup: 'Tiger Global office',
      dropoff: 'Changi Airport T3',
      flight: 'SQ878',
    },
  },
  {
    input: 'Transfer 1500 from Fullerton to Marina Bay Sands for Mr Lee',
    expected: {
      name: 'Mr Lee',
      pickup: 'Fullerton',
      dropoff: 'Marina Bay Sands',
    },
  },
  {
    input: 'Guest arriving on QR948 0920 to Shangri-La',
    expected: {
      name: '',
      bookingType: 'MNG',
      flight: 'QR948',
      pickup: 'Changi Airport',
      dropoff: 'Shangri-La',
    },
  },
  {
    input: 'DSP for Mr Lee 1800 at MBS wait 2 hours, stop at ION, return to St Regis',
    expected: {
      name: 'Mr Lee',
      bookingType: 'DSP',
      time: '1800hrs',
      pickup: 'MBS',
      dropoff: 'St Regis',
    },
  },
  {
    input: 'go home 2C Anamalai',
    expected: {
      dropoff: '2C Anamalai',
    },
  },
  {
    input: 'pickup from St Regis to MBS for Mr Andrew Lim',
    expected: {
      pickup: 'St Regis',
      dropoff: 'MBS',
      name: 'Mr Andrew Lim',
    },
  },
  {
    input: 'send from Capella to Marina Bay Sands for Ms Tan',
    expected: {
      pickup: 'Capella',
      dropoff: 'Marina Bay Sands',
      name: 'Ms Tan',
    },
  },
  {
    input: 'head home 2C Anamalai',
    expected: {
      dropoff: '2C Anamalai',
    },
  },
  {
    input: 'standby for Mr Lim 1700 at MBS, pickup again from ION, standby till 2200 return hotel St Regis',
    expected: {
      name: 'Mr Lim',
      bookingType: 'DSP',
      pickup: 'MBS',
      dropoff: 'St Regis',
    },
  },
  {
    input: 'him back to Marina Bay Sands tmr morn pls',
    expected: {
      name: '',
    },
  },
  {
    input: '1. Mr Lee 0800 SQ377 > MBS\n2. Ms Tan 0900 QR948 > Fullerton',
    expected: {
      success: false,
      multipleBookingsDetected: true,
      parserWarning: 'Multiple bookings detected. Please select one extracted booking.',
    },
  },
  {
    input: '- Mr Tan DEP 0700 from Ritz Carlton to SQ318\n- Ms Chloe MNG 1030 QR948 > Capella',
    expected: {
      success: false,
      multipleBookingsDetected: true,
      parserWarning: 'Multiple bookings detected. Please select one extracted booking.',
    },
  },
  {
    input: 'Passenger: Mr Lee\nPassenger: Ms Chloe\nFlight: SQ318\nFlight: QR948',
    expected: {
      success: false,
      multipleBookingsDetected: true,
      parserWarning: 'Multiple bookings detected. Please select one extracted booking.',
    },
  },
  {
    input: '1. Mr Deep DEP 0600 from home to SQ878\n2. Ms Chloe MNG 0915 SQ318 > Ritz Carlton\n3. Drew DSP 1800 at Capella return to MBS',
    expected: {
      success: false,
      multipleBookingsDetected: true,
      parserWarning: 'Multiple bookings detected. Please select one extracted booking.',
    },
  },
  {
    input: `After meeting, please send her back to One Raffles Quay.

Booker: Jasmine from Temasek.
Vehicle: AVF.`,
    expected: {
      success: true,
      bookingType: 'DSP',
      pickup: '',
      dropoff: 'One Raffles Quay',
      name: '',
      booker: 'Jasmine',
      company: 'Temasek',
      vehicle: 'AVF',
      time: '',
      parserWarning: 'Missing critical fields: pickup, pickup time, passenger/name',
    },
  },
];

for (const sample of liveBugSamples) {
  const parsedLiveBug = parseBookingForTest(sample.input) ?? {};

  for (const [field, expectedValue] of Object.entries(sample.expected)) {
    assert.equal(
      parsedLiveBug[field] ?? '',
      expectedValue,
      `live bug sample ${sample.input}: expected ${field}=${JSON.stringify(expectedValue)}, got ${JSON.stringify(parsedLiveBug[field] ?? '')}`,
    );
  }

  if (parsedLiveBug.multipleBookingsDetected) {
    assert.equal(parsedLiveBug.flight ?? '', '', `multi-booking sample ${sample.input}: should not expose merged flight`);
    assert.equal(parsedLiveBug.pickup ?? '', '', `multi-booking sample ${sample.input}: should not expose merged pickup`);
    assert.equal(parsedLiveBug.dropoff ?? '', '', `multi-booking sample ${sample.input}: should not expose merged dropoff`);
    assert.ok(
      Array.isArray(parsedLiveBug.extractedBookingsPreview),
      `multi-booking sample ${sample.input}: expected extractedBookingsPreview`,
    );

    if (sample.previewLength) {
      assert.equal(
        parsedLiveBug.extractedBookingsPreview.length,
        sample.previewLength,
        `multi-booking sample ${sample.input}: expected ${sample.previewLength} preview items`,
      );
    }

    if (sample.previewRoutes) {
      assert.deepEqual(
        parsedLiveBug.extractedBookingsPreview.map((preview) => [preview.pickup, preview.dropoff]),
        sample.previewRoutes,
        `multi-booking sample ${sample.input}: expected preview routes`,
      );
    }
  }
}

const multiCaseFormState = {
  company: '',
  bookingType: '',
  vehicle: 'AVF',
  date: '',
  time: '',
  flight: '',
  pickup: '',
  dropoff: '',
  booker: '',
  bookerContact: '',
  bookerEmail: '',
  name: '',
  pax: '1',
  driverName: '',
  driverContact: '',
};
function assertMultiBookingDoesNotBlend(sampleInput, label) {
  const parsedMultiCase = parseBookingForTest(sampleInput) ?? {};
  const mergedMultiCase = parsedMultiCase.multipleBookingsDetected
    ? multiCaseFormState
    : mergeParsedBookingState(multiCaseFormState, parsedMultiCase);

  assert.deepEqual(
    mergedMultiCase,
    multiCaseFormState,
    `${label}: multi-booking warning must not auto-fill blended values into booking form state`,
  );
}

assertMultiBookingDoesNotBlend(liveBugSamples[0].input, 'multi-case dispatcher list');
assertMultiBookingDoesNotBlend(liveBugSamples[2].input, 'need 2 cars tomorrow');

const multiTerminalArrivalChangeMessage = `Hi William, some changes for tomorrow arrival:
Total 2 pickup from T3 and T4 to Grand Hyatt below:
T3: MU567 Shanghai - Singapore Arrival 15:45 (1 Passenger - Ye Yueqin)
T4: CX791 Hongkong - Singapore Arrival 15:40 (3 Passenger - Anne Chiou, Noah Chen, Isaac Chen)
Please advise your pickup plan for the above. Thanks.`;
const terminalArrivalReferenceDate = new Date(2026, 4, 17, 12, 0, 0);
const parsedMultiTerminalArrival = parseBookingMessage(multiTerminalArrivalChangeMessage, {
  referenceDate: terminalArrivalReferenceDate,
}) ?? {};
assert.equal(parsedMultiTerminalArrival.success, false);
assert.equal(parsedMultiTerminalArrival.multipleBookingsDetected, true);
assert.equal(
  parsedMultiTerminalArrival.parserWarning,
  'Multiple bookings detected. Please select one extracted booking.',
);
assert.equal(parsedMultiTerminalArrival.extractedBookingsPreview?.length, 2);
const mu567Preview = parsedMultiTerminalArrival.extractedBookingsPreview
  ?.find((preview) => preview.flight === 'MU567') ?? {};
assert.deepEqual(mu567Preview, {
  passenger: 'Ye Yueqin',
  date: '2026-05-18',
  time: '1545hrs',
  type: 'MNG',
  flight: 'MU567',
  pickup: 'Changi Airport T3',
  dropoff: 'Grand Hyatt',
  pax: '1',
  extraStopCount: '0',
  extraStopLocation: '',
});
const cx791Preview = parsedMultiTerminalArrival.extractedBookingsPreview
  ?.find((preview) => preview.flight === 'CX791') ?? {};
assert.deepEqual(cx791Preview, {
  passenger: 'Anne Chiou',
  date: '2026-05-18',
  time: '1540hrs',
  type: 'MNG',
  flight: 'CX791',
  pickup: 'Changi Airport T4',
  dropoff: 'Grand Hyatt',
  pax: '3',
  extraStopCount: '0',
  extraStopLocation: '',
});

const selectedCx791ArrivalChangeMessage = `Hi William, some changes for tomorrow arrival:
Total 2 pickup from T3 and T4 to Grand Hyatt below:
T4: CX791 Hongkong - Singapore Arrival 15:40 (3 Passenger - Anne Chiou, Noah Chen, Isaac Chen)
Please advise your pickup plan for the above. Thanks.`;
assert.deepEqual(parseBookingMessage(selectedCx791ArrivalChangeMessage, {
  referenceDate: terminalArrivalReferenceDate,
}), {
  success: true,
  company: '',
  bookingType: 'MNG',
  vehicle: '',
  date: '2026-05-18',
  time: '1540hrs',
  flight: 'CX791',
  pickup: 'Changi Airport T4',
  dropoff: 'Grand Hyatt',
  booker: '',
  bookerEmail: '',
  name: 'Anne Chiou',
  pax: '3',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Hi William, some changes for tomorrow arrival:',
    'Total 2 pickup from T3 and T4 to Grand Hyatt below:',
    'T4: CX791 Hongkong - Singapore Arrival 15:40 (3 Passenger - Anne Chiou, Noah Chen, Isaac Chen)',
    'Please advise your pickup plan for the above. Thanks.',
  ],
});

const categories = new Map();
for (const example of parserExamples) {
  categories.set(example.category, (categories.get(example.category) ?? 0) + 1);
  const exampleReferenceDate = example.referenceDate ? new Date(example.referenceDate) : referenceDate;
  const parsedExample = parseBookingMessage(example.input, { referenceDate: exampleReferenceDate }) ?? {};

  for (const [field, expectedValue] of Object.entries(example.expected)) {
    assert.equal(
      parsedExample[field] ?? '',
      expectedValue,
      `${example.category}/${example.id}: expected ${field}=${JSON.stringify(expectedValue)}, got ${JSON.stringify(parsedExample[field] ?? '')}`,
    );
  }
}

for (const category of requiredConfidenceCategories) {
  assert.ok(categories.has(category), `${category} parser examples are missing`);
}

for (const [category, count] of categories) {
  assert.ok(count >= 3, `${category} must have at least 3 parser examples`);
}

assert.equal(categories.size, requiredConfidenceCategories.length, 'parser examples should cover the required Phase 1 categories');

const realWorldCategories = new Map();
const realWorldFailures = [];
for (const fixture of realWorldFixtures) {
  const fixtureCategories = Array.isArray(fixture.categories) ? fixture.categories : [fixture.category];
  const fixtureLabel = `${fixtureCategories.join(', ')}/${fixture.id}`;
  for (const fixtureCategory of fixtureCategories) {
    realWorldCategories.set(fixtureCategory, (realWorldCategories.get(fixtureCategory) ?? 0) + 1);
  }
  const fixtureReferenceDate = fixture.referenceDate ? new Date(fixture.referenceDate) : referenceDate;
  const parsedFixture = parseBookingMessage(fixture.input, { referenceDate: fixtureReferenceDate }) ?? {};

  try {
    for (const [field, expectedValue] of Object.entries(fixture.expected ?? {})) {
      assert.equal(
        parsedFixture[field] ?? '',
        expectedValue,
        `${fixtureLabel}: expected ${field}=${JSON.stringify(expectedValue)}, got ${JSON.stringify(parsedFixture[field] ?? '')}`,
      );
    }

    if (fixture.expectedPreviewLength !== undefined) {
      assert.ok(
        Array.isArray(parsedFixture.extractedBookingsPreview),
        `${fixtureLabel}: expected extractedBookingsPreview`,
      );
      assert.equal(
        parsedFixture.extractedBookingsPreview.length,
        fixture.expectedPreviewLength,
        `${fixtureLabel}: expected extractedBookingsPreview length ${fixture.expectedPreviewLength}`,
      );
    }

    if (fixture.expectedPreview) {
      assert.ok(
        Array.isArray(parsedFixture.extractedBookingsPreview),
        `${fixtureLabel}: expected extractedBookingsPreview`,
      );

      for (const [previewIndex, expectedPreview] of fixture.expectedPreview.entries()) {
        const previewLabel = expectedPreview.flight ?? expectedPreview.passenger ?? JSON.stringify(expectedPreview);
        const matchingPreview = fixture.expectedPreviewMatch === 'ordered'
          ? parsedFixture.extractedBookingsPreview[previewIndex] ?? {}
          : parsedFixture.extractedBookingsPreview.find((preview) => (
            expectedPreview.flight
              ? preview.flight === expectedPreview.flight
              : preview.passenger === expectedPreview.passenger
          )) ?? {};

        assert.deepEqual(
          matchingPreview,
          expectedPreview,
          `${fixtureLabel}: expected preview ${previewLabel}`,
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    realWorldFailures.push(`${fixtureLabel}: ${message}`);
  }
}

console.log(
  `Real-world parser fixtures: ${realWorldFixtures.length} examples across ${realWorldCategories.size} categories.`,
);
console.log(`Real-world parser categories: ${[...realWorldCategories.keys()].sort().join(', ')}`);
console.log(
  `Real-world parser fixture summary: ${realWorldFixtures.length - realWorldFailures.length} passed, ${realWorldFailures.length} failed.`,
);
assert.deepEqual(realWorldFailures, [], `real-world parser fixture failures:\n${realWorldFailures.join('\n')}`);

const crmEnrichedParsed = {
  ...parsed,
  dropoff: '2C Anamalai Ave',
};
const finalBooking = mergeParsedBookingState({
  company: '',
  bookingType: 'MNG',
  vehicle: 'AVF',
  date: '',
  time: '',
  flight: '',
  pickup: '',
  dropoff: '',
  booker: '',
  bookerContact: '',
  bookerEmail: '',
  name: '',
  pax: '1',
  driverName: '',
  driverContact: '',
}, crmEnrichedParsed);
assert.equal(finalBooking.name, 'Lim Yeow Beng');
assert.equal(finalBooking.time, '0740hrs');
assert.equal(finalBooking.company, 'UOB');
assert.equal(finalBooking.dropoff, '2C Anamalai Ave');

const temasekReturnMessage = `After meeting, please send her back to One Raffles Quay.

Booker: Jasmine from Temasek.
Vehicle: AVF.`;
const temasekParsed = parseBookingForTest(temasekReturnMessage) ?? {};
assert.equal(temasekParsed.company ?? '', 'Temasek');
assert.equal(temasekParsed.booker ?? '', 'Jasmine');
assert.equal(temasekParsed.vehicle ?? '', 'AVF');
assert.equal(temasekParsed.dropoff ?? '', 'One Raffles Quay');
assert.equal(temasekParsed.name ?? '', '');
assert.equal(temasekParsed.time ?? '', '');
assert.equal(temasekParsed.pickup ?? '', '');
const temasekFinalBooking = mergeParsedBookingState({
  company: '',
  bookingType: 'MNG',
  vehicle: 'AVF',
  date: '',
  time: '',
  flight: '',
  pickup: '',
  dropoff: '',
  booker: '',
  bookerContact: '',
  bookerEmail: '',
  name: '',
  pax: '1',
  driverName: '',
  driverContact: '',
}, temasekParsed);
assert.equal(temasekFinalBooking.time, '');

const limSq377AirportMessage = 'Mr Lim Yeow Beng SQ377 0740hrs airport to 2C Anamalai Ave';
assert.deepEqual(parseBookingForTest(limSq377AirportMessage), {
  success: true,
  company: '',
  bookingType: 'MNG',
  vehicle: '',
  date: '',
  time: '0740hrs',
  flight: 'SQ377',
  pickup: 'Changi Airport',
  dropoff: '2C Anamalai Ave',
  booker: '',
  bookerEmail: '',
  name: 'Mr Lim Yeow Beng',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [limSq377AirportMessage],
});

const faisalStandbyMessage = `Hi bro, Ah Seng familiar with this guest already.
Tomorrow pls send Mr Faisal from Andaz to Tuas site 2pm
then standby till 6pm before sending him back to hotel.`;
assert.deepEqual(parseBookingForTest(faisalStandbyMessage), {
  success: true,
  company: '',
  bookingType: 'DSP',
  vehicle: '',
  date: '2026-05-14',
  time: '1400hrs',
  flight: '',
  pickup: 'Andaz',
  dropoff: 'Tuas site',
  booker: '',
  bookerEmail: '',
  name: 'Mr Faisal',
  pax: '1',
  driverName: 'Ah Seng',
  driverContact: '',
  returnDestination: 'hotel',
  standbyUntil: '1800hrs',
  bookerContact: '',
  cleanedLines: [
    'Hi bro, Ah Seng familiar with this guest already.',
    'Tomorrow pls send Mr Faisal from Andaz to Tuas site 2pm',
    'then standby till 6pm before sending him back to hotel.',
  ],
});

const jasonWuFreeformMessage = `Hi William, please arrange AVF for Mr Jason Wu tomorrow.

Pickup from Four Seasons at 2130hrs and send to Changi Airport T3.

Flight SQ878.
1 pax.`;
assert.deepEqual(parseBookingForTest(jasonWuFreeformMessage), {
  success: true,
  company: '',
  bookingType: 'DEP',
  vehicle: 'AVF',
  date: '2026-05-14',
  time: '2130hrs',
  flight: 'SQ878',
  pickup: 'Four Seasons',
  dropoff: 'Changi Airport T3',
  booker: '',
  bookerEmail: '',
  name: 'Mr Jason Wu',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Hi William, please arrange AVF for Mr Jason Wu tomorrow.',
    'Pickup from Four Seasons at 2130hrs and send to Changi Airport T3.',
    'Flight SQ878.',
    '1 pax.',
  ],
});

const jasonWuStructuredMessage = `Flight: SQ878
Pickup: Four Seasons
Drop-off: Changi Airport T3
Name: Mr Jason Wu
Pax: 1`;
assert.deepEqual(parseBookingForTest(jasonWuStructuredMessage), {
  success: true,
  company: '',
  bookingType: 'DEP',
  vehicle: '',
  date: '',
  time: '',
  flight: 'SQ878',
  pickup: 'Four Seasons',
  dropoff: 'Changi Airport T3',
  booker: '',
  bookerEmail: '',
  name: 'Mr Jason Wu',
  pax: '1',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [
    'Flight: SQ878',
    'Pickup: Four Seasons',
    'Drop-off: Changi Airport T3',
    'Name: Mr Jason Wu',
    'Pax: 1',
  ],
});

const brentJohnstonArrivalMessage = 'Good afternoon William, my name is Brent Johnston, and my mom Sheila forwarded me your contact information regarding booking a pickup for my wife and I this week. Can we reserve a pickup with you or your colleagues for Friday night this week? Our flight from Tokyo SQ 633 arrives at Changi at 11:05pm 15-May, and we will be staying at the V Bencoolen Hotel. Thank you so much.';
assert.deepEqual(parseBookingForTest(brentJohnstonArrivalMessage), {
  success: true,
  company: '',
  bookingType: 'MNG',
  vehicle: '',
  date: '2026-05-15',
  time: '2305hrs',
  flight: 'SQ633',
  pickup: 'Changi Airport',
  dropoff: 'V Bencoolen Hotel',
  booker: 'Brent Johnston',
  bookerEmail: '',
  name: 'Brent Johnston and wife',
  pax: '2',
  driverName: '',
  driverContact: '',
  bookerContact: '',
  cleanedLines: [brentJohnstonArrivalMessage],
});

const nicoleHereBnyMessage = `Hi William, Nicole here from BNY.

Please arrange AVF for Mr Rohan Singh tomorrow morning.
Pickup 7:15am from Fullerton Hotel to Changi Airport T3.
Flight NH844.
1 pax.`;
assert.deepEqual(
  parseBookingMessage(nicoleHereBnyMessage, {
    referenceDate: new Date('2026-05-14T12:00:00+08:00'),
  }),
  {
    success: true,
    company: 'BNY',
    bookingType: 'DEP',
    vehicle: 'AVF',
    date: '2026-05-15',
    time: '0715hrs',
    flight: 'NH844',
    pickup: 'Fullerton Hotel',
    dropoff: 'Changi Airport T3',
    booker: 'Nicole',
    bookerEmail: '',
    name: 'Mr Rohan Singh',
    pax: '1',
    driverName: '',
    driverContact: '',
    bookerContact: '',
    cleanedLines: [
      'Hi William, Nicole here from BNY.',
      'Please arrange AVF for Mr Rohan Singh tomorrow morning.',
      'Pickup 7:15am from Fullerton Hotel to Changi Airport T3.',
      'Flight NH844.',
      '1 pax.',
    ],
  },
);

const jobCard = [
  `${finalBooking.vehicle} ${finalBooking.bookingType}`,
  `${finalBooking.date}, ${finalBooking.time}`,
  '',
  `Flight: ${finalBooking.flight}\n${finalBooking.pickup} > ${finalBooking.dropoff}`,
  '',
  finalBooking.name ? `Name: ${finalBooking.name}` : '',
  `Pax: ${Number(finalBooking.pax) || 1}`,
].filter(Boolean).join('\n');
assert.match(jobCard, /Name: Lim Yeow Beng/);
console.log(`Parser tests passed with ${parserExamples.length} confidence examples across ${categories.size} categories.`);
