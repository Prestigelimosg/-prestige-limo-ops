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
