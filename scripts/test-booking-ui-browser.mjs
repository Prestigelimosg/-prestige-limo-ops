import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const browserName = (process.env.BROWSER || "chrome").toLowerCase();
const chromeBinary =
  process.env.CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromeDebugPort = Number(process.env.CHROME_DEBUG_PORT || 9227);
const incompleteNeedsReviewSample = `Arrival for NEEDS REVIEW TEST TRAVELER
Pickup: Changi Airport Terminal 3
Pax 1`;
const bookingSample = `Company: BROWSER UI TEST COMPANY
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
const crmSavedBookingFixture = {
  id: "ui-crm-save-fixture",
  company_id: 601,
  booker_id: 602,
  traveler_id: 603,
  booking_type: "MNG",
  vehicle: "AVF",
  pickup_time: "1530",
  pickup_address: "Changi Airport T3",
  dropoff_address: "Raffles Hotel Singapore",
  flight_no: "SQ333",
  route: "Changi Airport T3 > Marina Bay Sands > Raffles Hotel Singapore",
  pax: 2,
  job_card:
    "AVF MNG\n27 May 2026, 1530hrs\nFlight: SQ333\nChangi Airport T3 > Marina Bay Sands > Raffles Hotel Singapore\nCompany: BROWSER UI TEST COMPANY\nName: BROWSER UI TEST TRAVELER\nPax: 2\nChild seat: 2 x booster seat",
  status: "assigned",
  driver_id: null,
  driver_name: "TEST DRIVER CRM 20260516",
  driver_contact: null,
  driver_plate_number: null,
  customer_rate: 85,
  customer_rate_unit: "job",
  customer_price_amount: 160,
  customer_rate_override: 160,
  customer_price_override_reason: "Parsed from message: $160.00",
  driver_payout_min: 65,
  driver_payout_max: 75,
  driver_payout_amount: 95,
  driver_payout_override: null,
  driver_payout_reason: null,
  driver_payout_unit: "job",
  driver_notes: null,
  driver_dispatch_include_payout: false,
  midnight_surcharge: 0,
  midnight_payout: 0,
  extra_stop_count: 1,
  extra_stop_surcharge: 15,
  extra_stop_payout: 10,
  child_seat_required: true,
  child_seat_count: 2,
  child_seat_type: "booster seat",
  child_seat_customer_surcharge: 30,
  child_seat_driver_payout: 20,
  pricing_source: "manual",
  created_at: "2026-05-19T01:00:00.000Z",
  updated_at: "2026-05-19T01:00:00.000Z",
  companies: {
    company_name: "BROWSER UI TEST COMPANY",
    domain: "example.com",
  },
  bookers: {
    booker_name: "BROWSER UI TEST BOOKER",
    email: "browserui@example.com",
    phone: "+65 9000 0333",
  },
  travelers: {
    traveler_name: "BROWSER UI TEST TRAVELER",
  },
};
const loadedSavedBookingFixture = {
  id: "ui-cleanup-load-fixture",
  company_id: 501,
  booker_id: 502,
  traveler_id: 503,
  booking_type: "DEP",
  vehicle: "VAN",
  pickup_time: "0945",
  pickup_address: "Raffles Hotel Singapore",
  dropoff_address: "Changi Airport T2",
  flight_no: "SQ999",
  route: "Raffles Hotel Singapore > Changi Airport T2",
  pax: 3,
  job_card:
    "VAN DEP\n28 May 2026, 0945hrs\nFlight: SQ999\nRaffles Hotel Singapore > Changi Airport T2\nPassenger: LOADED SAVED TRAVELER\nPax: 3",
  status: "confirmed",
  driver_id: null,
  driver_name: "LOADED SAVED DRIVER",
  driver_contact: "+65 8888 0000",
  driver_plate_number: "SLA1234X",
  customer_price_amount: 120,
  driver_payout_amount: 75,
  extra_stop_count: 0,
  child_seat_required: false,
  child_seat_count: 0,
  child_seat_type: null,
  created_at: "2026-05-19T00:00:00.000Z",
  updated_at: "2026-05-19T00:00:00.000Z",
  companies: {
    company_name: "LOADED SAVED COMPANY",
    domain: "loadedsaved.example.com",
  },
  bookers: {
    booker_name: "LOADED SAVED BOOKER",
    email: "booker@loadedsaved.example.com",
    phone: "+65 8777 0000",
  },
  travelers: {
    traveler_name: "LOADED SAVED TRAVELER",
  },
};
const persistedTestSaveBookingFixture = {
  ...loadedSavedBookingFixture,
  id: 905001,
  company_id: 905101,
  booker_id: 905102,
  traveler_id: 905103,
  pickup_time: "1315",
  pickup_address: "TEST SAVE PICKUP",
  dropoff_address: "TEST SAVE DROPOFF",
  flight_no: "TS905",
  route: "TEST SAVE PICKUP > TEST SAVE DROPOFF",
  job_card:
    "AVF DEP\n29 May 2026, 1315hrs\nFlight: TS905\nTEST SAVE PICKUP > TEST SAVE DROPOFF\nPassenger: TEST SAVE TRAVELER B\nPax: 1",
  status: "confirmed",
  driver_name: "TEST DRIVER CRM 20260516",
  created_at: "2026-05-18T00:00:00.000Z",
  updated_at: "2026-05-18T00:00:00.000Z",
  companies: {
    company_name: "TEST SAVE COMPANY B",
    domain: "test-save.example.com",
  },
  bookers: {
    booker_name: "TEST SAVE BOOKER B",
    email: "test-save-booker@example.com",
    phone: "+65 8777 0101",
  },
  travelers: {
    traveler_name: "TEST SAVE TRAVELER B",
  },
};
const persistedSuccessTestCompletedFixture = {
  ...loadedSavedBookingFixture,
  id: 905002,
  company_id: 905201,
  booker_id: 905202,
  traveler_id: 905203,
  pickup_time: "1645",
  pickup_address: "SUCCESS TEST PICKUP",
  dropoff_address: "SUCCESS TEST DROPOFF",
  flight_no: "ST906",
  route: "SUCCESS TEST PICKUP > SUCCESS TEST DROPOFF",
  job_card:
    "AVF MNG\n30 May 2026, 1645hrs\nFlight: ST906\nSUCCESS TEST PICKUP > SUCCESS TEST DROPOFF\nPassenger: SUCCESS TEST TRAVELER\nPax: 1",
  status: "completed",
  driver_name: "TEST DRIVER CRM 20260516",
  created_at: "2026-05-18T01:00:00.000Z",
  updated_at: "2026-05-18T01:00:00.000Z",
  companies: {
    company_name: "SUCCESS TEST COMPANY",
    domain: "success-test.example.com",
  },
  bookers: {
    booker_name: "SUCCESS TEST BOOKER",
    email: "success-test-booker@example.com",
    phone: "+65 8777 0202",
  },
  travelers: {
    traveler_name: "SUCCESS TEST TRAVELER",
  },
};
const persistedRealLutherGrahamFixture = {
  ...loadedSavedBookingFixture,
  id: 906001,
  company_id: null,
  booker_id: 906102,
  traveler_id: 906103,
  booking_type: "DEP",
  vehicle: "AVF",
  pickup_time: "0420",
  pickup_address: "160 Watten Estate Rd, Singapore 287610",
  dropoff_address: "Changi Airport",
  flight_no: "SQ265",
  route:
    "160 Watten Estate Rd, Singapore 287610 > 405 Sin Ming Ave, Singapore 570405 > Bedok South Avenue 2, Block 10B HDB Bedok South, Singapore 10B Bedok S Ave 2, Block 10B, Singapore 461010 > Changi Airport",
  job_card:
    "AVF DEP\n30 Apr 2026, 0420hrs\nFlight: SQ265\n160 Watten Estate Rd, Singapore 287610 > 405 Sin Ming Ave, Singapore 570405 > Bedok South Avenue 2, Block 10B HDB Bedok South, Singapore 10B Bedok S Ave 2, Block 10B, Singapore 461010 > Changi Airport\nBooker: Luther Graham\nPassenger: Luther Graham\nPax: 3",
  status: "confirmed",
  driver_name: "TEST DRIVER CRM 20260516",
  customer_rate: 75,
  customer_price_amount: 160,
  customer_rate_override: 160,
  customer_price_override_reason: "Parsed from message: $160.00",
  driver_payout_min: 65,
  driver_payout_max: 75,
  driver_payout_amount: 95,
  driver_payout_override: null,
  extra_stop_count: 2,
  midnight_payout: 10,
  midnight_surcharge: 15,
  extra_stop_surcharge: 15,
  extra_stop_payout: 10,
  child_seat_required: false,
  child_seat_count: 0,
  child_seat_type: null,
  child_seat_customer_surcharge: 0,
  child_seat_driver_payout: 0,
  driver_dispatch_include_payout: true,
  created_at: "2026-05-18T02:00:00.000Z",
  updated_at: "2026-05-18T02:00:00.000Z",
  companies: null,
  bookers: {
    booker_name: "Luther Graham",
    email: "luthergrahambk@gmail.com",
    phone: "+65 8091 2613",
  },
  travelers: {
    traveler_name: "Luther Graham",
  },
};
const persistedRealAlisonLimFixture = {
  ...loadedSavedBookingFixture,
  id: 906002,
  company_id: 906201,
  booker_id: 906202,
  traveler_id: 906203,
  pickup_time: "0740",
  pickup_address: "Changi Airport",
  dropoff_address: "2C Anamalai Ave",
  flight_no: "SQ377",
  route: "Changi Airport > 2C Anamalai Ave",
  job_card:
    "AVF MNG\n14 May 2026, 0740hrs\nFlight: SQ377\nChangi Airport > 2C Anamalai Ave\nBooker: Alison\nPassenger: Lim Yeow Beng\nPax: 1",
  status: "confirmed",
  driver_name: "REGULAR REAL DRIVER",
  created_at: "2026-05-18T02:10:00.000Z",
  updated_at: "2026-05-18T02:10:00.000Z",
  companies: {
    company_name: "UOB",
    domain: "uobgroup.com",
  },
  bookers: {
    booker_name: "Alison",
    email: "alison@uobgroup.com",
    phone: "+65 8777 0303",
  },
  travelers: {
    traveler_name: "Lim Yeow Beng",
  },
};
const persistedRealNicoleRohanHarmlessTestFixture = {
  ...loadedSavedBookingFixture,
  id: 906003,
  company_id: 906301,
  booker_id: 906302,
  traveler_id: 906303,
  pickup_time: "0715",
  pickup_address: "Fullerton Hotel",
  dropoff_address: "Changi Airport T3",
  flight_no: "NH844",
  route: "Fullerton Hotel > Changi Airport T3",
  job_card:
    "AVF DEP\n29 May 2026, 0715hrs\nFlight: NH844\nFullerton Hotel > Changi Airport T3\nBooker: Nicole Yap\nPassenger: Mr. Rohan Singh\nNote: hotel asked William to test the pickup contact before departure\nPax: 1",
  status: "confirmed",
  driver_name: "REGULAR REAL DRIVER",
  created_at: "2026-05-18T02:20:00.000Z",
  updated_at: "2026-05-18T02:20:00.000Z",
  companies: {
    company_name: "BNY",
    domain: "bny.com",
  },
  bookers: {
    booker_name: "Nicole Yap",
    email: "nicole.yap@bny.com",
    phone: "+65 8777 0404",
  },
  travelers: {
    traveler_name: "Mr. Rohan Singh",
  },
};
const dashboardDriverAssignmentFixture = {
  id: "ui-dashboard-driver-assignment-fixture",
  company_id: 701,
  booker_id: 702,
  traveler_id: 703,
  booking_type: "MNG",
  vehicle: "AVF",
  pickup_time: "1115",
  pickup_address: "Changi Airport",
  dropoff_address: "The Fullerton Hotel Singapore",
  flight_no: "SQ777",
  route: "Changi Airport > The Fullerton Hotel Singapore",
  pax: 2,
  job_card:
    "AVF MNG\n29 May 2026, 1115hrs\nFlight: SQ777\nChangi Airport > The Fullerton Hotel Singapore\nPassenger: DASHBOARD DRIVER TEST TRAVELER\nPax: 2",
  status: "confirmed",
  driver_id: null,
  driver_name: null,
  driver_contact: null,
  driver_plate_number: null,
  customer_price_amount: 95,
  driver_payout_amount: 70,
  extra_stop_count: 0,
  child_seat_required: false,
  child_seat_count: 0,
  child_seat_type: null,
  created_at: "2026-05-18T23:55:00.000Z",
  updated_at: "2026-05-18T23:55:00.000Z",
  companies: {
    company_name: "DASHBOARD DRIVER TEST COMPANY",
    domain: "dashboard-driver.example.com",
  },
  bookers: {
    booker_name: "DASHBOARD DRIVER TEST BOOKER",
    email: "booker@dashboard-driver.example.com",
    phone: "+65 8666 0000",
  },
  travelers: {
    traveler_name: "DASHBOARD DRIVER TEST TRAVELER",
  },
};
const dashboardAssignedDriverClearFixture = {
  id: "ui-dashboard-clear-driver-fixture",
  company_id: 711,
  booker_id: 712,
  traveler_id: 713,
  booking_type: "DEP",
  vehicle: "AVF",
  pickup_time: "1230",
  pickup_address: "The Fullerton Hotel Singapore",
  dropoff_address: "Changi Airport",
  flight_no: "SQ778",
  route: "The Fullerton Hotel Singapore > Changi Airport",
  pax: 1,
  job_card:
    "AVF DEP\n29 May 2026, 1230hrs\nFlight: SQ778\nThe Fullerton Hotel Singapore > Changi Airport\nPassenger: DASHBOARD CLEAR DRIVER TEST TRAVELER\nPax: 1",
  status: "assigned",
  driver_id: 901,
  driver_name: "OLD DASHBOARD TEST DRIVER",
  driver_contact: "+65 8999 7777",
  driver_plate_number: "SLC901D",
  customer_price_amount: 95,
  driver_payout_amount: 70,
  driver_payout_override: 88,
  driver_payout_reason: "Old assignment test",
  driver_notes: "Old assigned driver note",
  driver_dispatch_include_payout: true,
  extra_stop_count: 0,
  child_seat_required: false,
  child_seat_count: 0,
  child_seat_type: null,
  created_at: "2026-05-18T23:54:00.000Z",
  updated_at: "2026-05-18T23:54:00.000Z",
  companies: {
    company_name: "DASHBOARD CLEAR DRIVER TEST COMPANY",
    domain: "dashboard-clear-driver.example.com",
  },
  bookers: {
    booker_name: "DASHBOARD CLEAR DRIVER TEST BOOKER",
    email: "booker@dashboard-clear-driver.example.com",
    phone: "+65 8666 1111",
  },
  travelers: {
    traveler_name: "DASHBOARD CLEAR DRIVER TEST TRAVELER",
  },
};
const dashboardProfilePayoutAssignmentFixture = {
  id: "ui-dashboard-profile-payout-assignment-fixture",
  company_id: 721,
  booker_id: 722,
  traveler_id: 723,
  booking_type: "DEP",
  vehicle: "AVF",
  pickup_time: "1410",
  pickup_address: "Mandarin Oriental Singapore",
  dropoff_address: "Changi Airport T2",
  flight_no: "SQ776",
  route: "Mandarin Oriental Singapore > Changi Airport T2",
  pax: 1,
  job_card:
    "AVF DEP\n29 May 2026, 1410hrs\nFlight: SQ776\nMandarin Oriental Singapore > Changi Airport T2\nPassenger: DASHBOARD PROFILE PAYOUT TRAVELER\nPax: 1",
  status: "confirmed",
  driver_id: null,
  driver_name: null,
  driver_contact: null,
  driver_plate_number: null,
  customer_price_amount: 95,
  driver_payout_min: 55,
  driver_payout_max: 65,
  driver_payout_amount: 55,
  driver_payout_override: null,
  driver_payout_reason: null,
  driver_payout_unit: "job",
  driver_dispatch_include_payout: false,
  extra_stop_count: 0,
  child_seat_required: false,
  child_seat_count: 0,
  child_seat_type: null,
  created_at: "2026-05-18T23:53:30.000Z",
  updated_at: "2026-05-18T23:53:30.000Z",
  companies: {
    company_name: "DASHBOARD PROFILE PAYOUT COMPANY",
    domain: "dashboard-profile-payout.example.com",
  },
  bookers: {
    booker_name: "DASHBOARD PROFILE PAYOUT BOOKER",
    email: "booker@dashboard-profile-payout.example.com",
    phone: "+65 8666 2222",
  },
  travelers: {
    traveler_name: "DASHBOARD PROFILE PAYOUT TRAVELER",
  },
};
const completedSavedBookingFixture = {
  id: "ui-completed-load-fixture",
  company_id: 801,
  booker_id: 802,
  traveler_id: 803,
  booking_type: "DEP",
  vehicle: "AVF",
  pickup_time: "1730",
  pickup_address: "Mandarin Oriental Singapore",
  dropoff_address: "Changi Airport T1",
  flight_no: "SQ888",
  route: "Mandarin Oriental Singapore > Changi Airport T1",
  pax: 1,
  job_card:
    "AVF DEP\n30 May 2026, 1730hrs\nFlight: SQ888\nMandarin Oriental Singapore > Changi Airport T1\nCompany: COMPLETED TEST COMPANY\nPassenger: COMPLETED TEST TRAVELER\nPax: 1",
  status: "completed",
  driver_id: null,
  driver_name: "COMPLETED TEST DRIVER",
  driver_contact: "+65 8444 8888",
  driver_plate_number: "SLE888C",
  customer_price_amount: 90,
  driver_payout_amount: 65,
  extra_stop_count: 0,
  child_seat_required: false,
  child_seat_count: 0,
  child_seat_type: null,
  created_at: "2026-05-18T23:50:00.000Z",
  updated_at: "2026-05-18T23:50:00.000Z",
  companies: {
    company_name: "COMPLETED TEST COMPANY",
    domain: "completed.example.com",
  },
  bookers: {
    booker_name: "COMPLETED TEST BOOKER",
    email: "booker@completed.example.com",
    phone: "+65 8333 8888",
  },
  travelers: {
    traveler_name: "COMPLETED TEST TRAVELER",
  },
};
const completedCustomerOnlyPriceFixture = {
  ...completedSavedBookingFixture,
  id: "ui-completed-customer-only-price-fixture",
  company_id: 806,
  booker_id: 807,
  traveler_id: 808,
  pickup_time: "1810",
  pickup_address: "Marina Bay Sands",
  dropoff_address: "Seletar Airport",
  flight_no: "SQ785",
  route: "Marina Bay Sands > Seletar Airport",
  job_card:
    "AVF TRF\n30 May 2026, 1810hrs\nFlight: SQ785\nMarina Bay Sands > Seletar Airport\nCompany: PRICE DISPLAY COMPANY\nPassenger: PRICE DISPLAY CUSTOMER ONLY TRAVELER\nPax: 1",
  status: "completed",
  driver_id: null,
  driver_name: "PRICE DISPLAY DRIVER",
  driver_contact: "+65 8444 7805",
  driver_plate_number: "SLE785P",
  customer_rate: 140,
  customer_price_amount: 140,
  driver_payout_min: null,
  driver_payout_max: null,
  driver_payout_amount: null,
  driver_payout_override: null,
  driver_payout_reason: null,
  created_at: "2026-05-18T23:49:30.000Z",
  updated_at: "2026-05-18T23:49:30.000Z",
  companies: {
    company_name: "PRICE DISPLAY COMPANY",
    domain: "price-display.example.com",
  },
  bookers: {
    booker_name: "PRICE DISPLAY BOOKER",
    email: "booker@price-display.example.com",
    phone: "+65 8333 7805",
  },
  travelers: {
    traveler_name: "PRICE DISPLAY CUSTOMER ONLY TRAVELER",
  },
};
const dashboardCompletionActionFixture = {
  id: "ui-dashboard-completion-action-fixture",
  company_id: 811,
  booker_id: 812,
  traveler_id: 813,
  booking_type: "MNG",
  vehicle: "AVF",
  pickup_time: "1845",
  pickup_address: "Changi Airport T3",
  dropoff_address: "Capella Singapore",
  flight_no: "SQ779",
  route: "Changi Airport T3 > Capella Singapore",
  pax: 2,
  job_card:
    "AVF MNG\n30 May 2026, 1845hrs\nFlight: SQ779\nChangi Airport T3 > Capella Singapore\nCompany: COMPLETION ACTION TEST COMPANY\nPassenger: COMPLETION ACTION TEST TRAVELER\nPax: 2",
  status: "assigned",
  driver_id: 901,
  driver_name: "COMPLETION ACTION DRIVER",
  driver_contact: "+65 8111 7799",
  driver_plate_number: "SLC779C",
  customer_price_amount: 115,
  driver_payout_amount: 75,
  driver_payout_override: 80,
  driver_payout_reason: "Completion action should preserve driver payout",
  driver_notes: "Completion action should preserve notes",
  driver_dispatch_include_payout: true,
  extra_stop_count: 0,
  child_seat_required: false,
  child_seat_count: 0,
  child_seat_type: null,
  created_at: "2026-05-18T23:49:00.000Z",
  updated_at: "2026-05-18T23:49:00.000Z",
  companies: {
    company_name: "COMPLETION ACTION TEST COMPANY",
    domain: "completion-action.example.com",
  },
  bookers: {
    booker_name: "COMPLETION ACTION TEST BOOKER",
    email: "booker@completion-action.example.com",
    phone: "+65 8333 7799",
  },
  travelers: {
    traveler_name: "COMPLETION ACTION TEST TRAVELER",
  },
};
const completedUndoAssignedFixture = {
  id: "ui-completed-undo-assigned-fixture",
  company_id: 821,
  booker_id: 822,
  traveler_id: 823,
  booking_type: "MNG",
  vehicle: "AVF",
  pickup_time: "1930",
  pickup_address: "Changi Airport T2",
  dropoff_address: "Mandarin Oriental Singapore",
  flight_no: "SQ889",
  route: "Changi Airport T2 > Mandarin Oriental Singapore",
  pax: 1,
  job_card:
    "AVF MNG\n30 May 2026, 1930hrs\nFlight: SQ889\nChangi Airport T2 > Mandarin Oriental Singapore\nCompany: COMPLETED UNDO ASSIGNED COMPANY\nPassenger: COMPLETED UNDO ASSIGNED TRAVELER\nPax: 1",
  status: "completed",
  driver_id: 901,
  driver_name: "COMPLETED UNDO DRIVER",
  driver_contact: "+65 8444 8899",
  driver_plate_number: "SLE889C",
  customer_price_amount: 100,
  driver_payout_amount: 70,
  extra_stop_count: 0,
  child_seat_required: false,
  child_seat_count: 0,
  child_seat_type: null,
  created_at: "2026-05-18T23:48:00.000Z",
  updated_at: "2026-05-18T23:48:00.000Z",
  companies: {
    company_name: "COMPLETED UNDO ASSIGNED COMPANY",
    domain: "completed-undo-assigned.example.com",
  },
  bookers: {
    booker_name: "COMPLETED UNDO ASSIGNED BOOKER",
    email: "booker@completed-undo-assigned.example.com",
    phone: "+65 8333 8899",
  },
  travelers: {
    traveler_name: "COMPLETED UNDO ASSIGNED TRAVELER",
  },
};
const completedUndoConfirmedFixture = {
  id: "ui-completed-undo-confirmed-fixture",
  company_id: 831,
  booker_id: 832,
  traveler_id: 833,
  booking_type: "DEP",
  vehicle: "AVF",
  pickup_time: "2015",
  pickup_address: "The Fullerton Hotel Singapore",
  dropoff_address: "Changi Airport T1",
  flight_no: "SQ890",
  route: "The Fullerton Hotel Singapore > Changi Airport T1",
  pax: 1,
  job_card:
    "AVF DEP\n30 May 2026, 2015hrs\nFlight: SQ890\nThe Fullerton Hotel Singapore > Changi Airport T1\nCompany: COMPLETED UNDO CONFIRMED COMPANY\nPassenger: COMPLETED UNDO CONFIRMED TRAVELER\nPax: 1",
  status: "completed",
  driver_id: null,
  driver_name: null,
  driver_contact: null,
  driver_plate_number: null,
  customer_price_amount: 92,
  driver_payout_amount: 65,
  extra_stop_count: 0,
  child_seat_required: false,
  child_seat_count: 0,
  child_seat_type: null,
  created_at: "2026-05-18T23:47:00.000Z",
  updated_at: "2026-05-18T23:47:00.000Z",
  companies: {
    company_name: "COMPLETED UNDO CONFIRMED COMPANY",
    domain: "completed-undo-confirmed.example.com",
  },
  bookers: {
    booker_name: "COMPLETED UNDO CONFIRMED BOOKER",
    email: "booker@completed-undo-confirmed.example.com",
    phone: "+65 8333 8900",
  },
  travelers: {
    traveler_name: "COMPLETED UNDO CONFIRMED TRAVELER",
  },
};
const completedEmptyStateUndoFixture = {
  ...completedUndoConfirmedFixture,
  id: "ui-completed-empty-state-undo-fixture",
  company_id: 841,
  booker_id: 842,
  traveler_id: 843,
  flight_no: "SQ891",
  job_card:
    "AVF DEP\n30 May 2026, 2115hrs\nFlight: SQ891\nThe Fullerton Hotel Singapore > Changi Airport T1\nCompany: COMPLETED EMPTY STATE COMPANY\nPassenger: COMPLETED EMPTY STATE TRAVELER\nPax: 1",
  created_at: "2026-05-18T23:46:00.000Z",
  updated_at: "2026-05-18T23:46:00.000Z",
  companies: {
    company_name: "COMPLETED EMPTY STATE COMPANY",
    domain: "completed-empty-state.example.com",
  },
  bookers: {
    booker_name: "COMPLETED EMPTY STATE BOOKER",
    email: "booker@completed-empty-state.example.com",
    phone: "+65 8333 8910",
  },
  travelers: {
    traveler_name: "COMPLETED EMPTY STATE TRAVELER",
  },
};
const dashboardStatusFlowFixture = {
  id: "ui-dashboard-status-flow-fixture",
  company_id: 851,
  booker_id: 852,
  traveler_id: 853,
  booking_type: "MNG",
  vehicle: "AVF",
  pickup_time: "1015",
  pickup_address: "Changi Airport T1",
  dropoff_address: "Ritz Carlton Singapore",
  flight_no: "SQ780",
  route: "Changi Airport T1 > Ritz Carlton Singapore",
  pax: 2,
  job_card:
    "AVF MNG\n31 May 2026, 1015hrs\nFlight: SQ780\nChangi Airport T1 > Ritz Carlton Singapore\nCompany: DASHBOARD STATUS FLOW COMPANY\nPassenger: DASHBOARD STATUS FLOW TRAVELER\nPax: 2",
  status: "assigned",
  driver_id: 901,
  driver_name: "DASHBOARD STATUS FLOW DRIVER",
  driver_contact: "+65 8111 7800",
  driver_plate_number: "SLC780S",
  customer_price_amount: 120,
  driver_payout_amount: 78,
  driver_payout_override: 82,
  driver_payout_reason: "Status flow should preserve payout fields",
  driver_notes: "Status flow should preserve driver notes",
  driver_dispatch_include_payout: true,
  extra_stop_count: 0,
  child_seat_required: false,
  child_seat_count: 0,
  child_seat_type: null,
  created_at: "2026-05-18T23:45:00.000Z",
  updated_at: "2026-05-18T23:45:00.000Z",
  companies: {
    company_name: "DASHBOARD STATUS FLOW COMPANY",
    domain: "dashboard-status-flow.example.com",
  },
  bookers: {
    booker_name: "DASHBOARD STATUS FLOW BOOKER",
    email: "booker@dashboard-status-flow.example.com",
    phone: "+65 8333 7800",
  },
  travelers: {
    traveler_name: "DASHBOARD STATUS FLOW TRAVELER",
  },
};
const dashboardOtwRevertAssignedFixture = {
  ...dashboardStatusFlowFixture,
  id: "ui-dashboard-otw-revert-assigned-fixture",
  company_id: 861,
  booker_id: 862,
  traveler_id: 863,
  flight_no: "SQ781",
  job_card:
    "AVF MNG\n31 May 2026, 1115hrs\nFlight: SQ781\nChangi Airport T1 > Ritz Carlton Singapore\nCompany: DASHBOARD OTW REVERT ASSIGNED COMPANY\nPassenger: DASHBOARD OTW REVERT ASSIGNED TRAVELER\nPax: 2",
  status: "driver_otw",
  created_at: "2026-05-18T23:44:00.000Z",
  updated_at: "2026-05-18T23:44:00.000Z",
  companies: {
    company_name: "DASHBOARD OTW REVERT ASSIGNED COMPANY",
    domain: "dashboard-otw-revert-assigned.example.com",
  },
  bookers: {
    booker_name: "DASHBOARD OTW REVERT ASSIGNED BOOKER",
    email: "booker@dashboard-otw-revert-assigned.example.com",
    phone: "+65 8333 7810",
  },
  travelers: {
    traveler_name: "DASHBOARD OTW REVERT ASSIGNED TRAVELER",
  },
};
const dashboardOtwRevertConfirmedFixture = {
  ...dashboardStatusFlowFixture,
  id: "ui-dashboard-otw-revert-confirmed-fixture",
  company_id: 871,
  booker_id: 872,
  traveler_id: 873,
  flight_no: "SQ782",
  job_card:
    "AVF MNG\n31 May 2026, 1215hrs\nFlight: SQ782\nChangi Airport T1 > Ritz Carlton Singapore\nCompany: DASHBOARD OTW REVERT CONFIRMED COMPANY\nPassenger: DASHBOARD OTW REVERT CONFIRMED TRAVELER\nPax: 2",
  status: "driver_otw",
  driver_id: null,
  driver_name: null,
  driver_contact: null,
  driver_plate_number: null,
  created_at: "2026-05-18T23:43:00.000Z",
  updated_at: "2026-05-18T23:43:00.000Z",
  companies: {
    company_name: "DASHBOARD OTW REVERT CONFIRMED COMPANY",
    domain: "dashboard-otw-revert-confirmed.example.com",
  },
  bookers: {
    booker_name: "DASHBOARD OTW REVERT CONFIRMED BOOKER",
    email: "booker@dashboard-otw-revert-confirmed.example.com",
    phone: "+65 8333 7820",
  },
  travelers: {
    traveler_name: "DASHBOARD OTW REVERT CONFIRMED TRAVELER",
  },
};
const dashboardPobRevertFixture = {
  ...dashboardStatusFlowFixture,
  id: "ui-dashboard-pob-revert-fixture",
  company_id: 881,
  booker_id: 882,
  traveler_id: 883,
  flight_no: "SQ783",
  job_card:
    "AVF MNG\n31 May 2026, 1315hrs\nFlight: SQ783\nChangi Airport T1 > Ritz Carlton Singapore\nCompany: DASHBOARD POB REVERT COMPANY\nPassenger: DASHBOARD POB REVERT TRAVELER\nPax: 2",
  status: "pob",
  created_at: "2026-05-18T23:42:00.000Z",
  updated_at: "2026-05-18T23:42:00.000Z",
  companies: {
    company_name: "DASHBOARD POB REVERT COMPANY",
    domain: "dashboard-pob-revert.example.com",
  },
  bookers: {
    booker_name: "DASHBOARD POB REVERT BOOKER",
    email: "booker@dashboard-pob-revert.example.com",
    phone: "+65 8333 7830",
  },
  travelers: {
    traveler_name: "DASHBOARD POB REVERT TRAVELER",
  },
};
const dashboardOtwClearDriverFixture = {
  ...dashboardStatusFlowFixture,
  id: "ui-dashboard-otw-clear-driver-fixture",
  company_id: 891,
  booker_id: 892,
  traveler_id: 893,
  flight_no: "SQ784",
  job_card:
    "AVF MNG\n31 May 2026, 1415hrs\nFlight: SQ784\nChangi Airport T1 > Ritz Carlton Singapore\nCompany: DASHBOARD OTW CLEAR DRIVER COMPANY\nPassenger: DASHBOARD OTW CLEAR DRIVER TRAVELER\nPax: 2",
  status: "driver_otw",
  driver_id: 901,
  driver_name: "DASHBOARD OTW CLEAR DRIVER",
  driver_contact: "+65 8111 7840",
  driver_plate_number: "SLC784D",
  created_at: "2026-05-18T23:41:00.000Z",
  updated_at: "2026-05-18T23:41:00.000Z",
  companies: {
    company_name: "DASHBOARD OTW CLEAR DRIVER COMPANY",
    domain: "dashboard-otw-clear-driver.example.com",
  },
  bookers: {
    booker_name: "DASHBOARD OTW CLEAR DRIVER BOOKER",
    email: "booker@dashboard-otw-clear-driver.example.com",
    phone: "+65 8333 7840",
  },
  travelers: {
    traveler_name: "DASHBOARD OTW CLEAR DRIVER TRAVELER",
  },
};
const reusableDriverProfileFixture = {
  id: 901,
  driver_name: "REUSABLE PROFILE TEST DRIVER",
  contact_number: "+65 8111 2222",
  vehicle_type: "Alphard",
  plate_number: "SLL901P",
  payout_preferences: "Prefers airport and CBD jobs",
  driver_payout_rules: {
    MNG: { min: 76, max: 76 },
    DEP: { min: 66, max: 66 },
    TRF: { min: 58, max: 58 },
    DSP: { amount: 52 },
  },
  availability_status: "busy",
  notes: "Reusable profile save test note",
  preferred_areas: "Changi, Marina Bay",
  airport_permit_notes: "Has Changi permit",
};
const mrLeeSaveTravelerName = "BROWSER UI TEST Mr Lee";
const mrLeeExpectedPickupDate = "2026-05-20";
const mrLeeExpectedPickupTime = "0700hrs";
const mrLeeExpectedStoragePickupTime = "0700";
const mrLeeExpectedCardDateTime = "20 May 2026, 0700hrs";
const mrLeeNoCompanySavedBookingFixture = {
  id: "ui-mr-lee-no-company-save-fixture",
  company_id: null,
  booker_id: null,
  traveler_id: null,
  booking_type: "DEP",
  vehicle: "AVF",
  pickup_time: "0700",
  pickup_address: "10 Scotts Road",
  dropoff_address: "Changi Airport",
  flight_no: "SQ306",
  route: "10 Scotts Road > Changi Airport",
  pax: 2,
  job_card:
    `AVF DEP\n${mrLeeExpectedCardDateTime}\nFlight: SQ306\n10 Scotts Road > Changi Airport\nName: ${mrLeeSaveTravelerName}\nPax: 2`,
  status: "confirmed",
  driver_id: null,
  driver_name: null,
  driver_contact: null,
  driver_plate_number: null,
  customer_price_amount: 85,
  driver_payout_amount: 65,
  extra_stop_count: 0,
  child_seat_required: false,
  child_seat_count: 0,
  child_seat_type: null,
  created_at: "2026-05-19T02:00:00.000Z",
  updated_at: "2026-05-19T02:00:00.000Z",
  companies: null,
  bookers: null,
  travelers: null,
};
const legacyMrLeeNoCompanySavedBookingFixture = {
  ...mrLeeNoCompanySavedBookingFixture,
  job_card:
    `AVF DEP\n${mrLeeExpectedCardDateTime}\nFlight: SQ306\n10 Scotts Road > Changi Airport\nName: Mr Lee\nPax: 2`,
};
const legacyMrLeeCompletedDuplicateFixture = {
  ...legacyMrLeeNoCompanySavedBookingFixture,
  id: "ui-mr-lee-completed-legacy-duplicate-fixture",
  status: "completed",
  customer_price_amount: 75,
  driver_payout_amount: 65,
  created_at: "2026-05-19T02:30:00.000Z",
  updated_at: "2026-05-19T02:30:00.000Z",
};
const mrLeeExistingCompanySavedBookingFixture = {
  ...mrLeeNoCompanySavedBookingFixture,
  id: "ui-mr-lee-existing-company-save-fixture",
  company_id: 901,
  traveler_id: 903,
  job_card:
    `AVF DEP\n${mrLeeExpectedCardDateTime}\nFlight: SQ306\n10 Scotts Road > Changi Airport\nCompany: EXISTING CRM COMPANY\nName: ${mrLeeSaveTravelerName}\nPax: 2`,
  companies: {
    company_name: "EXISTING CRM COMPANY",
    domain: "existing-crm.example.com",
  },
  travelers: {
    traveler_name: mrLeeSaveTravelerName,
  },
};
const mrLeeCrmFailureSavedBookingFixture = {
  ...mrLeeNoCompanySavedBookingFixture,
  id: "ui-mr-lee-crm-failure-save-fixture",
};
const multiBookingPreviewSample = `Hi William.

Tomorrow:
1) Mr Deep arriving SQ318 ETA 0610hrs. Send to Fullerton Hotel.
2) Mr Stanley departure 9pm from Ritz Carlton to T3 taking SQ221.
3) Need standby AVF for Ms Chloe 1pm-5pm MBS meetings then send back to Capella.

Richard handle Deep.
Ah Seng handle Stanley.

Booked by Nicole from BNY.
Thanks.`;
const warburgTwoTransferSample = `Hello:
 
I need to arrange car transfers, along with meet and greet services, for Mark Colodny of Warburg Pincus. Please advise if you have availability for below two transfer requests.  Thank you!
 
Passenger: Mark Colodny
Passenger Mobile: 917-734-5070
Company: Warburg Pincus
Pay Method: AMEX 5008
 
Vehicle type: Sedan
 
Pickup Date: Friday, February 6
Pickup Time: 7:30AM SGT
Pickup Address:  Singapore Changi airport
Flight details:  SG 423 BOM SIN
*meet and greet service needed
 
Dropoff:  The Ritz (7 Raffles Ave., Marina Bay, Singapore, 039799)
 
===
 
Pickup Date: Friday, February 6
Pickup Time: 3:00pm SGT
Pickup Address:  The Ritz (7 Raffles Ave., Marina Bay, Singapore, 039799)
 
Dropoff:  Singapore Changi airport
Flight details:  SG 34 SIN SFO
 
 
Thank you,
 
Jill Van Cook
EA to Mark Colodny, Co-Head of US Private Equity
& Chairman of Global Technology
Warburg Pincus`;
const airportTransferReturnTransferSample = "Hi, can I arrange for a airport transfer on 20/05/26, 645 pick for SQ108. And the return transfer on 22/05/26, 8pm SQ121. One person. Mr. Peter stay at 276 ocean drive lobby o";
const airportDepartureToAirportForFlightSample = "Please arrange Alphard on 20/05/26, 7am pickup Mr Lee from 10 Scotts Road to airport for SQ306. 2 pax.";
const exactPastedWaypointAirportArrivalSample = `Transfer type	One Way
Pickup date and time	17-05-2026 7:05
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
const exactPastedWaypointAirportDepartureSample = `Pickup date and time	06-05-2026 8:00
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
const routeNameAirportDropoffOnlySample = `Status	Completed (finished)
Service type	Airport transfer
Transfer type	One Way
Pickup date and time	30-04-2026 15:30
Order total amount	S$95.00
Taxes	S$0.00 (0%)
Distance	46.8 km
Duration	53 minutes
ROUTE
Route name	Airport 
ROUTE LOCATIONS
DROP OFF LOCATION
333 Orchard Rd, Singapore 238867
VEHICLE
Vehicle name	Mercedes Benz E-class
Bag count	2
Passengers count	3
CLIENT DETAILS
First name	Peter
Last name	Dynan
E-mail address	pj@baonline.com.au
Phone number	+61419501117
Passangers	1
Flight No.	SQ238`;
const routeNameAirportPickupOnlyDepartureWaypointSample = `Transfer type	One Way
Pickup date and time	30-04-2026 4:20
Order total amount	S$160.00
Taxes	S$0.00 (0%)
Distance	13.4 km
Duration	23 minutes
ROUTE
Route name	Airport 
ROUTE LOCATIONS
405 Sin Ming Avenue, Singapore 405 Sin Ming Ave, Singapore 570405
Bedok South Avenue 2, Block 10B HDB Bedok South, Singapore 10B Bedok S Ave 2, Block 10B, Singapore 461010
PICK UP LOCATION
160 Watten Estate Rd, Singapore 287610
VEHICLE
Vehicle name	Toyota Alphard 2.5
Bag count	3
Passengers count	4
EXTRA
1 x Waypoint 2 - S$50.00
1 x Midnight surcharges - S$15.00
CLIENT DETAILS
First name	Luther
Last name	Graham
E-mail address	luthergrahambk@gmail.com
Phone number	+6580912613
Passangers	3
Flight No.	SQ265`;
const routeNameAirportPickupOnlyDepartureInternalSample =
  routeNameAirportPickupOnlyDepartureWaypointSample.replace(
    "luthergrahambk@gmail.com",
    "luthergrahambk@prestigelimo.sg",
  );
const freeformTransferMultiLocationSample =
  "organise viano on 20/05/2026 11am pickup andrew shenton way send him to MAS building pickup john follow by Asia sq then to capital tower";
const dspItinerarySample = `Hi William, we need a car for Drew tomorrow, please refer to the below schedule:
From Grand Hyatt to Ritz-Carlton Singapore (by 10am); 12pm BDC office; 1:30pm Temasek Office, 60B Orchard Road, Tower 2, The Atrium@Orchard, Singapore; 3:30pm 8 Marina View, Asia Square Tower 1, #37-01, Singapore 018960; 6pm Ritz-Carlton`;
const numberedEventDspItinerarySample = `@Fikeri A40 7941

Mr. Wong is the events organiser, pls follow his instructions attentively 

1130hrs, pickup Mr. Wong from Carlton City then proceed following locations below:  


[Dresscode] - Businees w. Jacket no tie
[Driver] - Black Alphard - Plate: TBC
1. [SSW Driver]Depart capella residence suite A@11:30AM //Arrive Cherry Garden@11:50AM
2. [12-12:30PM]王炎平 Catch up 
3. [SSW Driver]Depart Cherry Garden@1:30PM//Arrive Suntec Expo@1:45PM
4. [1:45-2PM]MPA Interview Meeting - Prompt question & answer to be shared. 
5. [2:15-3PM]MPA Panelist - Speaker
6. [SSW Driver]Depart Suntec Expo@3PM//Arrive UIC Building@3:15PM
7. [3:30-4:30PM]MOL Bulk Meeting`;
const timedScheduleItinerarySample = `Hi William, please arrange a car for Drew tomorrow, schedule as follow:
9:30am 1 HarbourFront Avenue, #02-01 Keppel Bay Tower;
11am One Raffles Quay, #39-01 North Tower;
2pm Capital Tower;
4:30pm BDC office;`;
const browserErrors = [];
const browserConsoleErrors = [];
const forbiddenRuntimeText = [
  "ReferenceError",
  "TypeError",
  "Unhandled Runtime Error",
  "formatOverrideSummary is not defined",
];

function sleep(timeoutMs) {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

function waitForChildExit(childProcess, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(undefined);
    }, timeoutMs);

    childProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve(undefined);
    });
  });
}

function normalizeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeConsoleMessages(values) {
  return values.map(String).join(" ");
}

function bookingPatchCalls(fetchCalls) {
  return fetchCalls.filter(
    (call) => call.startsWith("PATCH ") && call.includes("/rest/v1/bookings"),
  );
}

function installSupabaseRestNetworkGuard(client, blockedSupabaseRequests, blockedSupabaseMutationRequests) {
  client.on("Fetch.requestPaused", ({ requestId, request }) => {
    const method = request?.method || "GET";
    const url = request?.url || "";
    const isReadOnlyRequest = method === "GET" || method === "HEAD" || method === "OPTIONS";
    blockedSupabaseRequests.push(`${method} ${url}`);
    if (!isReadOnlyRequest) {
      blockedSupabaseMutationRequests.push(`${method} ${url}`);
    }

    const responseHeaders = [
      { name: "access-control-allow-headers", value: "apikey, authorization, content-type, prefer, x-client-info" },
      { name: "access-control-allow-methods", value: "GET, POST, PATCH, DELETE, OPTIONS" },
      { name: "access-control-allow-origin", value: "*" },
      { name: "content-type", value: "application/json" },
    ];
    const responseBody = method === "GET" ? [] : {
      message:
        "Blocked unmocked Supabase REST call in browser test. Add an explicit mock before this action.",
    };

    client
      .send("Fetch.fulfillRequest", {
        body: Buffer.from(JSON.stringify(responseBody)).toString("base64"),
        requestId,
        responseCode: isReadOnlyRequest ? 200 : 500,
        responseHeaders,
        responsePhrase: "Blocked Supabase call in browser test",
      })
      .catch(() => {});
  });

  return client.send("Fetch.enable", {
    patterns: [{ requestStage: "Request", urlPattern: "*://*/rest/v1/*" }],
  });
}

async function waitForCondition(check, timeoutMs = 10000, description = "browser condition") {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await check();

    if (value) {
      return value;
    }

    await sleep(100);
  }

  throw new Error(`Timed out waiting for ${description}`);
}

function createChromeClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 0;
  const pending = new Map();
  const eventListeners = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));

    if (typeof message.id === "number") {
      const pendingRequest = pending.get(message.id);

      if (!pendingRequest) {
        return;
      }

      pending.delete(message.id);

      if (message.error) {
        pendingRequest.reject(new Error(message.error.message));
        return;
      }

      pendingRequest.resolve(message.result);
      return;
    }

    const listeners = eventListeners.get(message.method) ?? [];
    for (const listener of listeners) {
      listener(message.params ?? {});
    }
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function on(method, listener) {
    const listeners = eventListeners.get(method) ?? [];
    listeners.push(listener);
    eventListeners.set(method, listeners);
  }

  function once(method, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);

      const listener = (params) => {
        clearTimeout(timeout);
        const listeners = eventListeners.get(method) ?? [];
        eventListeners.set(
          method,
          listeners.filter((candidate) => candidate !== listener),
        );
        resolve(params);
      };

      on(method, listener);
    });
  }

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(undefined), { once: true });
    socket.addEventListener(
      "error",
      (event) => {
        reject(event.error || new Error("Chrome DevTools WebSocket connection failed"));
      },
      { once: true },
    );
  });

  async function close() {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
      await sleep(100);
    }
  }

  return {
    close,
    on,
    once,
    ready,
    send,
  };
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function waitForChromeDebugPort() {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < 10000) {
    try {
      await fetchJson(`http://127.0.0.1:${chromeDebugPort}/json/version`);
      return;
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }

  throw new Error(
    `Chrome remote debugging did not become ready: ${normalizeErrorMessage(lastError)}`,
  );
}

async function waitForChromePageTarget() {
  return waitForCondition(async () => {
    const targets = await fetchJson(`http://127.0.0.1:${chromeDebugPort}/json/list`);

    return (
      targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl) || false
    );
  });
}

function assertBookingUiState(state) {
  const combinedErrors = [...state.errors, ...state.consoleErrors].join("\n");
  const combinedUiText = [
    state.visibleText,
    state.jobCardPreview,
    state.driverDispatch,
    state.fieldText,
    combinedErrors,
  ].join("\n");
  const forbiddenTextFound = forbiddenRuntimeText.filter((text) => combinedUiText.includes(text));

  assert.deepEqual(state.errors, [], `Expected no runtime errors:\n${state.errors.join("\n")}`);
  assert.deepEqual(
    state.consoleErrors,
    [],
    `Expected no browser console errors:\n${state.consoleErrors.join("\n")}`,
  );
  assert.deepEqual(
    forbiddenTextFound,
    [],
    `Forbidden runtime text appeared: ${forbiddenTextFound.join(", ")}`,
  );
  assert.equal(state.fields.company, "BROWSER UI TEST COMPANY");
  assert.equal(state.fields.flight, "SQ333");
  assert.ok(
    state.fields.pickup === "Changi Airport Terminal 3" ||
      state.fields.pickup === "Changi Airport T3",
    `Expected Changi Airport Terminal 3 or T3, received "${state.fields.pickup}"`,
  );
  assert.equal(state.fields.extraStopLocation, "Marina Bay Sands");
  assert.equal(state.fields.extraStopCount, "1");
  assert.equal(state.fields.dropoff, "Raffles Hotel Singapore");
  assert.match(state.visibleText, /Route Extras & Child Seat/);
  assert.match(state.visibleText, /Extra stop location/);
  assert.match(state.visibleText, /Extra Stops/);
  assert.match(state.visibleText, /Child seat count/);
  assert.equal(state.fields.childSeatCount, "2");
  assert.match(state.fields.childSeatType, /booster seat/);
  assert.match(state.visibleText, /Customer Price Override/);
  assert.equal(state.fields.customerPriceOverride, "160");
  assert.ok(combinedUiText.includes("160.00"), "Expected parsed quoted price text 160.00");
  assert.match(state.visibleText, /Job Card Preview/);
  assert.doesNotMatch(state.jobCardPreview, /Guest details hidden for privacy/);
  assert.doesNotMatch(state.jobCardPreview, /BROWSER UI TEST BOOKER/);
  assert.doesNotMatch(state.jobCardPreview, /BROWSER UI TEST TRAVELER/);
  assert.match(state.visibleText, /Driver Dispatch/);
  assert.match(state.driverDispatch, /DRIVER DISPATCH/);
  assert.match(state.visibleText, /Pricing/);
}

async function runChromeTest() {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "prestige-limo-booking-ui-chrome-"));
  const blockedSupabaseRequests = [];
  const blockedSupabaseMutationRequests = [];
  const chrome = spawn(
    chromeBinary,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      "--no-service-autorun",
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${chromeDebugPort}`,
      "about:blank",
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
    },
  );

  let stderr = "";
  let client = null;

  chrome.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForChromeDebugPort();

    const target = await waitForChromePageTarget();
    client = createChromeClient(target.webSocketDebuggerUrl);
    await client.ready;

    client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      const description =
        exceptionDetails?.exception?.description ||
        exceptionDetails?.text ||
        "Unknown browser exception";
      browserErrors.push(description);
    });
    client.on("Runtime.consoleAPICalled", ({ type, args = [] }) => {
      if (type === "error") {
        browserConsoleErrors.push(normalizeConsoleMessages(args.map((value) => value?.value ?? value?.description ?? "")));
      }
    });

    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await installSupabaseRestNetworkGuard(client, blockedSupabaseRequests, blockedSupabaseMutationRequests);

    const loadEvent = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: appUrl });
    await loadEvent;

    const evaluate = async (expression) => {
      const result = await client.send("Runtime.evaluate", {
        awaitPromise: true,
        expression,
        returnByValue: true,
      });

      return result.result?.value;
    };

    const clickTab = async (label, expectedText = "") => {
      const clicked = await evaluate(`(() => {
        const tab = [...document.querySelectorAll("button[role='tab'], button")].find(
          (button) => button.textContent.trim() === ${JSON.stringify(label)},
        );

        if (!tab || tab.disabled) {
          return false;
        }

        tab.click();
        return true;
      })()`);
      assert.equal(clicked, true, `Expected ${label} tab to be clickable`);

      await waitForCondition(
        () =>
          evaluate(`(() => {
            const selectedTab = [...document.querySelectorAll("button[role='tab']")].find(
              (button) =>
                button.textContent.trim() === ${JSON.stringify(label)} &&
                button.getAttribute("aria-selected") === "true",
            );

            return Boolean(selectedTab) && ${
              expectedText ? `document.body.innerText.includes(${JSON.stringify(expectedText)})` : "true"
            };
          })()`),
        10000,
        `${label} tab content`,
      );
    };

    const setInputValue = async (selector, value, description) => {
      const didSetValue = await evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(selector)});

        if (!input) {
          return false;
        }

        const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
        descriptor?.set?.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return input.value === ${JSON.stringify(value)};
      })()`);

      assert.equal(didSetValue, true, `Expected ${description} input to be editable`);
    };

    await waitForCondition(
      () =>
        evaluate(`Boolean(document.querySelector("textarea")) &&
          [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Create Job Card")`),
      10000,
      "booking parse controls",
    );
    const initialTabState = await evaluate(`(() => ({
      selectedTab: [...document.querySelectorAll("button[role='tab']")]
        .find((button) => button.getAttribute("aria-selected") === "true")
        ?.textContent.trim() || "",
      tabLabels: [...document.querySelectorAll("button[role='tab']")].map((button) => button.textContent.trim()),
    }))()`);
    assert.deepEqual(initialTabState.tabLabels, ["Dispatch", "Bookings", "Completed", "Dashboard", "Drivers", "Rates"]);
    assert.equal(initialTabState.selectedTab, "Dispatch");

    await evaluate(`window.__prestigeErrors = [];
      window.__prestigeConsoleErrors = [];
      window.addEventListener("error", (event) => window.__prestigeErrors.push(event.message));
      window.addEventListener("unhandledrejection", (event) => window.__prestigeErrors.push(String(event.reason)));
      const originalError = console.error;
      console.error = (...args) => {
        window.__prestigeConsoleErrors.push(args.map(String).join(" "));
        originalError.apply(console, args);
      };`);

    const initialAiAssistSafetyState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const aiButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "AI Assist Parse (Mock)",
          );
          const parseButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "Create Job Card",
          );
          const checkbox = document.querySelector("[data-ai-assist-safety-checkbox='true']");
          const gate = document.querySelector("[data-ai-assist-gate='true']");
          const checkboxLabel = checkbox?.closest("label");
          const parseButtonRect = parseButton?.getBoundingClientRect();
          const aiButtonRect = aiButton?.getBoundingClientRect();
          const checkboxLabelRect = checkboxLabel?.getBoundingClientRect();
          const controls = document.querySelector("[data-ai-assist-controls='true']");
          const controlButtonLabels = [...(controls?.querySelectorAll("button") || [])].map(
            (button) => button.textContent.trim(),
          );
          const promptText = "Tick the AI safety checkbox to enable AI Assist";
          const textNodes = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let currentNode = walker.nextNode();

          while (currentNode) {
            if (currentNode.nodeValue.trim()) {
              textNodes.push(currentNode.nodeValue.trim());
            }

            currentNode = walker.nextNode();
          }

          return aiButton && parseButton && checkbox && checkboxLabel && gate?.contains(aiButton) && gate?.contains(checkboxLabel)
            ? {
                aiButtonDisabled: aiButton.disabled,
                checkboxChecked: checkbox.checked,
                checkboxLabelText: checkboxLabel.textContent.trim(),
                checkboxLabelWidthDelta: Math.abs((checkboxLabelRect?.width || 0) - (aiButtonRect?.width || 0)),
                checkboxLabelHeightDelta: Math.abs((checkboxLabelRect?.height || 0) - (aiButtonRect?.height || 0)),
                controlButtonLabels,
                helperCount: document.querySelectorAll("[data-ai-assist-safety-helper='true']").length,
                matchedButtonHeightDelta: Math.abs((parseButtonRect?.height || 0) - (aiButtonRect?.height || 0)),
                matchedButtonWidthDelta: Math.abs((parseButtonRect?.width || 0) - (aiButtonRect?.width || 0)),
                gateText: gate.innerText || "",
                parseButtonDisabled: Boolean(parseButton?.disabled),
                promptTextCount: textNodes.filter((text) => text === promptText).length,
              }
            : false;
        })()`),
      10000,
      "AI Assist safety gate default state",
    );
    assert.equal(initialAiAssistSafetyState.aiButtonDisabled, true);
    assert.equal(initialAiAssistSafetyState.checkboxChecked, false);
    assert.equal(initialAiAssistSafetyState.parseButtonDisabled, false);
    assert.deepEqual(
      initialAiAssistSafetyState.controlButtonLabels.slice(0, 2),
      ["AI Assist Parse (Mock)", "Create Job Card"],
      "Expected AI Assist and Create Job Card button positions to be swapped",
    );
    assert.ok(
      initialAiAssistSafetyState.matchedButtonHeightDelta <= 1,
      "Expected Create Job Card and AI Assist buttons to have matched heights",
    );
    assert.ok(
      initialAiAssistSafetyState.matchedButtonWidthDelta <= 1,
      "Expected Create Job Card and AI Assist buttons to have matched widths",
    );
    assert.ok(
      initialAiAssistSafetyState.checkboxLabelHeightDelta <= 1,
      "Expected AI checkbox control and AI Assist button to have matched heights",
    );
    assert.ok(
      initialAiAssistSafetyState.checkboxLabelWidthDelta <= 1,
      "Expected AI checkbox control and AI Assist button to have matched widths",
    );
    assert.equal(
      initialAiAssistSafetyState.checkboxLabelText,
      "Tick the AI safety checkbox to enable AI Assist",
    );
    assert.equal(initialAiAssistSafetyState.helperCount, 0);
    assert.equal(initialAiAssistSafetyState.promptTextCount, 1);
    assert.match(initialAiAssistSafetyState.gateText, /Tick the AI safety checkbox to enable AI Assist/);
    assert.match(initialAiAssistSafetyState.gateText, /AI Assist Parse \(Mock\)/);

    const enabledAiAssistSafetyState = await waitForCondition(
      async () => {
        const state = await evaluate(`(() => {
          const checkbox = document.querySelector("[data-ai-assist-safety-checkbox='true']");
          const aiButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "AI Assist Parse (Mock)",
          );

          if (!checkbox || !aiButton) {
            return false;
          }

          if (!checkbox.checked) {
            checkbox.click();
          }

          return {
            aiButtonDisabled: aiButton.disabled,
            checkboxChecked: checkbox.checked,
            helperCount: document.querySelectorAll("[data-ai-assist-safety-helper='true']").length,
          };
        })()`);

        return state?.checkboxChecked && !state?.aiButtonDisabled ? state : false;
      },
      10000,
      "AI Assist safety checkbox enabling button",
    );
    assert.equal(enabledAiAssistSafetyState.helperCount, 0);

    const clickedEmptyAiAssist = await evaluate(`(() => {
      const aiButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "AI Assist Parse (Mock)",
      );

      if (!aiButton || aiButton.disabled) {
        return false;
      }

      aiButton.click();
      return true;
    })()`);
    assert.equal(clickedEmptyAiAssist, true, "Expected enabled AI Assist Parse (Mock) button to be clickable");

    const emptyAiAssistPlacement = await waitForCondition(
      () =>
        evaluate(`(() => {
          const messageText = "Paste a booking message before using AI Assist Parse.";
          const aiButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "AI Assist Parse (Mock)",
          );
          const controls = document.querySelector("[data-ai-assist-controls='true']");
          const feedback = document.querySelector("[data-ai-assist-feedback='true']");
          const textNodes = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let currentNode = walker.nextNode();

          while (currentNode) {
            if (currentNode.nodeValue.trim()) {
              textNodes.push(currentNode.nodeValue.trim());
            }

            currentNode = walker.nextNode();
          }

          return feedback?.textContent.trim() === messageText &&
            controls?.contains(aiButton) &&
            feedback.previousElementSibling === controls
            ? {
                directTextCount: textNodes.filter((text) => text === messageText).length,
                feedbackText: feedback.textContent.trim(),
                controlsText: controls?.innerText || "",
              }
            : false;
        })()`),
      10000,
      "empty AI Assist friendly message near controls",
    );
    assert.match(emptyAiAssistPlacement.controlsText, /AI Assist Parse \(Mock\)/);
    assert.equal(
      emptyAiAssistPlacement.directTextCount,
      1,
      "Expected exactly one local empty AI Assist warning",
    );

    const disabledAgainAiAssistSafetyState = await waitForCondition(
      async () => {
        const state = await evaluate(`(() => {
          const checkbox = document.querySelector("[data-ai-assist-safety-checkbox='true']");
          const aiButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "AI Assist Parse (Mock)",
          );

          if (!checkbox || !aiButton) {
            return false;
          }

          if (checkbox.checked) {
            checkbox.click();
          }

          const checkboxLabel = checkbox.closest("label");

          return {
            aiButtonDisabled: aiButton.disabled,
            checkboxChecked: checkbox.checked,
            checkboxLabelText: checkboxLabel?.textContent.trim() || "",
            helperCount: document.querySelectorAll("[data-ai-assist-safety-helper='true']").length,
          };
        })()`);

        return !state?.checkboxChecked && state?.aiButtonDisabled ? state : false;
      },
      10000,
      "AI Assist safety checkbox disabling button again",
    );
    assert.equal(
      disabledAgainAiAssistSafetyState.checkboxLabelText,
      "Tick the AI safety checkbox to enable AI Assist",
    );
    assert.equal(disabledAgainAiAssistSafetyState.helperCount, 0);

    await waitForCondition(
      async () => {
        const state = await evaluate(`(() => {
          const checkbox = document.querySelector("[data-ai-assist-safety-checkbox='true']");
          const aiButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "AI Assist Parse (Mock)",
          );

          if (!checkbox || !aiButton) {
            return false;
          }

          if (!checkbox.checked) {
            checkbox.click();
          }

          return checkbox.checked && !aiButton.disabled;
        })()`);

        return state ? true : false;
      },
      10000,
      "AI Assist safety checkbox re-enabling button",
    );

    const focusedNeedsReviewTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedNeedsReviewTextarea,
      true,
      "Expected booking message textarea to be focused for Needs Review sample",
    );

    await client.send("Input.insertText", { text: incompleteNeedsReviewSample });

    const filledNeedsReviewTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(incompleteNeedsReviewSample)}`,
    );
    assert.equal(
      filledNeedsReviewTextarea,
      true,
      "Expected Needs Review booking message textarea to be filled",
    );

    const clickedNeedsReviewParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Create Job Card",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(clickedNeedsReviewParse, true, "Expected Create Job Card button to parse Needs Review sample");

    await waitForCondition(
      () =>
        evaluate(`(() => {
          const bodyText = document.body.innerText;

          return bodyText.includes("Needs review before saving") &&
            bodyText.includes("Missing pickup date") &&
            bodyText.includes("Missing pickup time") &&
            bodyText.includes("Missing drop-off") &&
            bodyText.includes("Missing flight for arrival");
        })()`),
      10000,
      "Needs Review warning",
    );

    const savedCountBeforeBlockedSave = await evaluate(
      `document.body.innerText.match(/Saved\\s+(\\d+)/)?.[1] || ""`,
    );
    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeOriginalFetch = window.__prestigeOriginalFetch || window.fetch.bind(window);
      window.fetch = (...args) => {
        const target = args[0]?.url || args[0];
        window.__prestigeFetchCalls.push(String(target));
        return window.__prestigeOriginalFetch(...args);
      };
    })()`);

    const clickedBlockedSave = await evaluate(`(() => {
      const saveButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Save Booking + CRM",
      );

      if (!saveButton || saveButton.disabled) {
        return false;
      }

      saveButton.click();
      return true;
    })()`);
    assert.equal(clickedBlockedSave, true, "Expected Save Booking + CRM button to be clickable");

    const blockedSaveState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const bodyText = document.body.innerText;

          return {
            bodyText,
            fetchCalls: window.__prestigeFetchCalls || [],
            savedCount: bodyText.match(/Saved\\s+(\\d+)/)?.[1] || "",
          };
        })()`);

        return candidateState?.bodyText?.includes("Please review warnings before saving.")
          ? candidateState
          : false;
      },
      10000,
      "blocked Needs Review save message",
    );

    assert.deepEqual(
      blockedSaveState.fetchCalls,
      [],
      `Expected blocked Needs Review save to make no network calls, got ${blockedSaveState.fetchCalls.join(", ")}`,
    );
    assert.equal(
      blockedSaveState.savedCount,
      savedCountBeforeBlockedSave,
      "Expected blocked Needs Review save not to change recent booking count",
    );
    assert.doesNotMatch(blockedSaveState.bodyText, /Booking saved successfully/);

    const clickedClearAfterNeedsReview = await evaluate(`(() => {
      const clearButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Clear",
      );

      if (!clearButton || clearButton.disabled) {
        return false;
      }

      clearButton.click();
      return true;
    })()`);
    assert.equal(clickedClearAfterNeedsReview, true, "Expected Clear button after Needs Review test");

    const focusedTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(focusedTextarea, true, "Expected booking message textarea to be focused");

    await client.send("Input.insertText", { text: bookingSample });

    const filledTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(bookingSample)}`,
    );
    assert.equal(filledTextarea, true, "Expected booking message textarea to be filled");

    const clickedParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Create Job Card",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(clickedParse, true, "Expected Create Job Card button to be clickable");

    const extractStateScript = `(() => {
      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const labels = [...document.querySelectorAll("label")];
      const fieldValue = (labelText) => {
        const label = labels.find((candidate) => {
          const spanText = normalizeLabel(candidate.querySelector("span")?.textContent);
          return spanText === labelText;
        });
        const control = label?.querySelector("input, select, textarea");

        if (!control) {
          return "";
        }

        if (control.tagName === "SELECT") {
          return control.options[control.selectedIndex]?.textContent.trim() || control.value || "";
        }

        return control.value || "";
      };
      const fieldValuesByLabel = (labelText) =>
        labels
          .filter((candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText)
          .map((label) => {
            const control = label.querySelector("input, select, textarea");

            if (!control) {
              return "";
            }

            if (control.tagName === "SELECT") {
              return control.options[control.selectedIndex]?.textContent.trim() || control.value || "";
            }

            return control.value || "";
          });
      const pres = [...document.querySelectorAll("pre")].map((pre) => pre.innerText);
      const fields = {
        company: fieldValue("Company / Account"),
        bookingType: fieldValue("Booking type"),
        vehicle: fieldValue("Vehicle"),
        pickupDate: fieldValue("Pickup date"),
        pickupTime: fieldValue("Pickup time"),
        flight: fieldValue("Flight number"),
        pickup: fieldValue("Pickup"),
        extraStopLocation: fieldValue("Extra stop location"),
        extraStopCount: fieldValue("Extra Stops"),
        dropoff: fieldValue("Drop-off"),
        booker: fieldValue("Booker"),
        bookerContact: fieldValue("Booker WhatsApp / Contact"),
        bookerEmail: fieldValue("Booker email (optional)"),
        name: fieldValue("Passenger name") || fieldValue("Name"),
        pax: fieldValue("Pax"),
        childSeatCount: fieldValue("Child seat count"),
        childSeatType: fieldValue("Child seat type / note"),
        customerPriceOverride: fieldValue("Customer Price Override"),
        driverName: fieldValue("Driver Name"),
      };
      const overrideReasons = fieldValuesByLabel("Override Reason");
      const preTextByHeading = (headingText) => {
        const heading = [...document.querySelectorAll("h2")].find(
          (candidate) => candidate.textContent.trim() === headingText,
        );
        let node = heading;

        while (node && node !== document.body) {
          const pre = node.querySelector?.("pre");

          if (pre) {
            return pre.innerText;
          }

          node = node.parentElement;
        }

        return "";
      };
      const sectionTextByHeading = (headingText) => {
        const heading = [...document.querySelectorAll("h2")].find(
          (candidate) => candidate.textContent.trim() === headingText,
        );

        return heading?.parentElement?.innerText || "";
      };

      return {
        buttonLabels: [...document.querySelectorAll("button")].map((button) => button.textContent.trim()),
        consoleErrors: window.__prestigeConsoleErrors || [],
        driverDispatch: pres.find((text) => text.includes("DRIVER DISPATCH")) || "",
        errors: window.__prestigeErrors || [],
        fields,
        fieldText: [...Object.values(fields), ...overrideReasons].join("\\n"),
        jobCardPreview: preTextByHeading("Job Card Preview"),
        pricingPanel: sectionTextByHeading("Pricing"),
        visibleText: document.body.innerText,
      };
    })()`;
    const state = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.company === "BROWSER UI TEST COMPANY" &&
          candidateState?.fields?.flight === "SQ333" &&
          candidateState?.jobCardPreview?.includes("Flight: SQ333")
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed booking UI state",
    );
    state.errors = [...browserErrors, ...(state.errors || [])];
    state.consoleErrors = [...browserConsoleErrors, ...(state.consoleErrors || [])];

    assertBookingUiState(state);

    await evaluate(`(() => {
      window.__prestigeCopiedTexts = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__prestigeCopiedTexts.push(String(text));
          },
        },
      });
    })()`);

    const clickedJobCardCopy = await evaluate(`(() => {
      const sectionForHeading = (headingText) => {
        const heading = [...document.querySelectorAll("h2")].find(
          (candidate) => candidate.textContent.trim() === headingText,
        );
        let node = heading;

        while (node && node !== document.body) {
          if (
            node.querySelector?.("pre") &&
            [...node.querySelectorAll("button")].some((button) => button.textContent.trim() === "Copy")
          ) {
            return node;
          }

          node = node.parentElement;
        }

        return null;
      };
      const section = sectionForHeading("Job Card Preview");
      const copyButton = [...(section?.querySelectorAll("button") || [])].find(
        (button) => button.textContent.trim() === "Copy",
      );

      if (!copyButton || copyButton.disabled) {
        return false;
      }

      copyButton.click();
      return true;
    })()`);
    assert.equal(clickedJobCardCopy, true, "Expected Job Card Preview Copy button to be clickable");

    const jobCardCopyPlacementState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const sectionForHeading = (headingText) => {
            const heading = [...document.querySelectorAll("h2")].find(
              (candidate) => candidate.textContent.trim() === headingText,
            );
            let node = heading;

            while (node && node !== document.body) {
              if (
                node.querySelector?.("pre") &&
                [...node.querySelectorAll("button")].some((button) => button.textContent.trim() === "Copy")
              ) {
                return node;
              }

              node = node.parentElement;
            }

            return null;
          };
          const section = sectionForHeading("Job Card Preview");
          const copyButton = [...(section?.querySelectorAll("button") || [])].find(
            (button) => button.textContent.trim() === "Copy",
          );
          const feedback = section?.querySelector("[data-copy-feedback='job-card']");

          if (feedback?.textContent.trim() !== "Job card copied.") {
            return false;
          }

          const feedbackRect = feedback.getBoundingClientRect();
          const buttonRect = copyButton.getBoundingClientRect();
          const allFeedback = [...document.querySelectorAll("[data-copy-feedback]")].map((element) => ({
            target: element.getAttribute("data-copy-feedback"),
            text: element.textContent.trim(),
          }));

          return {
            allFeedback,
            copiedTexts: window.__prestigeCopiedTexts || [],
            distanceFromButton: Math.abs(feedbackRect.top - buttonRect.bottom),
            globalCopyMessages: [...document.querySelectorAll("[data-status-panel='global']")]
              .filter((element) => /copied/i.test(element.innerText))
              .map((element) => element.innerText.trim()),
          };
        })()`),
      10000,
      "Job Card Preview local copy feedback",
    );

    assert.deepEqual(jobCardCopyPlacementState.globalCopyMessages, []);
    assert.equal(jobCardCopyPlacementState.allFeedback.length, 1);
    assert.deepEqual(jobCardCopyPlacementState.allFeedback[0], {
      target: "job-card",
      text: "Job card copied.",
    });
    assert.ok(
      jobCardCopyPlacementState.distanceFromButton <= 80,
      `Expected Job Card copy feedback to be close to its button, got ${jobCardCopyPlacementState.distanceFromButton}px`,
    );
    assert.match(jobCardCopyPlacementState.copiedTexts[0] || "", /Flight: SQ333/);

    const clickedDriverDispatchCopy = await evaluate(`(() => {
      const sectionForHeading = (headingText) => {
        const heading = [...document.querySelectorAll("h2")].find(
          (candidate) => candidate.textContent.trim() === headingText,
        );
        let node = heading;

        while (node && node !== document.body) {
          if (
            node.querySelector?.("pre") &&
            [...node.querySelectorAll("button")].some((button) => button.textContent.trim() === "Copy")
          ) {
            return node;
          }

          node = node.parentElement;
        }

        return null;
      };
      const section = sectionForHeading("Driver Dispatch");
      const copyButton = [...(section?.querySelectorAll("button") || [])].find(
        (button) => button.textContent.trim() === "Copy",
      );

      if (!copyButton || copyButton.disabled) {
        return false;
      }

      copyButton.click();
      return true;
    })()`);
    assert.equal(clickedDriverDispatchCopy, true, "Expected Driver Dispatch Copy button to be clickable");

    const driverDispatchCopyPlacementState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const sectionForHeading = (headingText) => {
            const heading = [...document.querySelectorAll("h2")].find(
              (candidate) => candidate.textContent.trim() === headingText,
            );
            let node = heading;

            while (node && node !== document.body) {
              if (
                node.querySelector?.("pre") &&
                [...node.querySelectorAll("button")].some((button) => button.textContent.trim() === "Copy")
              ) {
                return node;
              }

              node = node.parentElement;
            }

            return null;
          };
          const section = sectionForHeading("Driver Dispatch");
          const copyButton = [...(section?.querySelectorAll("button") || [])].find(
            (button) => button.textContent.trim() === "Copy",
          );
          const feedback = section?.querySelector("[data-copy-feedback='driver-dispatch']");

          if (feedback?.textContent.trim() !== "Driver dispatch copied.") {
            return false;
          }

          const feedbackRect = feedback.getBoundingClientRect();
          const buttonRect = copyButton.getBoundingClientRect();
          const allFeedback = [...document.querySelectorAll("[data-copy-feedback]")].map((element) => ({
            target: element.getAttribute("data-copy-feedback"),
            text: element.textContent.trim(),
          }));

          return {
            allFeedback,
            copiedTexts: window.__prestigeCopiedTexts || [],
            distanceFromButton: Math.abs(feedbackRect.top - buttonRect.bottom),
            globalCopyMessages: [...document.querySelectorAll("[data-status-panel='global']")]
              .filter((element) => /copied/i.test(element.innerText))
              .map((element) => element.innerText.trim()),
          };
        })()`),
      10000,
      "Driver Dispatch local copy feedback",
    );

    assert.deepEqual(driverDispatchCopyPlacementState.globalCopyMessages, []);
    assert.equal(driverDispatchCopyPlacementState.allFeedback.length, 1);
    assert.deepEqual(driverDispatchCopyPlacementState.allFeedback[0], {
      target: "driver-dispatch",
      text: "Driver dispatch copied.",
    });
    assert.ok(
      driverDispatchCopyPlacementState.distanceFromButton <= 80,
      `Expected Driver Dispatch copy feedback to be close to its button, got ${driverDispatchCopyPlacementState.distanceFromButton}px`,
    );
    assert.match(
      driverDispatchCopyPlacementState.copiedTexts[
        driverDispatchCopyPlacementState.copiedTexts.length - 1
      ] || "",
      /DRIVER DISPATCH/,
    );

    const savedCountBeforeAiAssist = await evaluate(
      `document.body.innerText.match(/Saved\\s+(\\d+)/)?.[1] || ""`,
    );
    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeOriginalFetch = window.__prestigeOriginalFetch || window.fetch.bind(window);
      window.fetch = async (...args) => {
        const target = args[0]?.url || args[0];
        window.__prestigeFetchCalls.push(String(target));

        if (String(target).includes("/api/ai-parse")) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        return window.__prestigeOriginalFetch(...args);
      };
    })()`);

    const clickedMockAiAssist = await evaluate(`(() => {
      const aiButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "AI Assist Parse (Mock)",
      );

      if (!aiButton || aiButton.disabled) {
        return false;
      }

      aiButton.click();
      return true;
    })()`);
    assert.equal(clickedMockAiAssist, true, "Expected AI Assist Parse (Mock) button to be clickable");

    const aiAssistLoadingText = await waitForCondition(
      () =>
        evaluate(`document.querySelector("[data-ai-assist-loading='true']")?.textContent.trim() || ""`),
      5000,
      "AI Assist loading state",
    );
    assert.equal(aiAssistLoadingText, "Loading mock AI Assist draft...");

    const aiDraftState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const bodyText = document.body.innerText;
          const labels = [...document.querySelectorAll("label")];
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const fieldValue = (labelText) => {
            const label = labels.find((candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText);
            const control = label?.querySelector("input, select, textarea");

            if (!control) {
              return "";
            }

            if (control.tagName === "SELECT") {
              return control.options[control.selectedIndex]?.textContent.trim() || control.value || "";
            }

            return control.value || "";
          };

          return {
            bodyText,
            draftIsNearButtonRow:
              document.querySelector("[data-ai-assist-draft='true']")?.previousElementSibling ===
              document.querySelector("[data-ai-assist-controls='true']"),
            localWarningCount: document.querySelectorAll("[data-ai-assist-feedback='true']").length,
            fetchCalls: window.__prestigeFetchCalls || [],
            savedCount: bodyText.match(/Saved\\s+(\\d+)/)?.[1] || "",
            fields: {
              company: fieldValue("Company / Account"),
              bookingType: fieldValue("Booking type"),
              vehicle: fieldValue("Vehicle"),
              pickup: fieldValue("Pickup"),
              dropoff: fieldValue("Drop-off"),
              name: fieldValue("Passenger name") || fieldValue("Name"),
            },
          };
        })()`);

        return candidateState?.bodyText?.includes("AI parsed draft — review before saving")
          ? candidateState
          : false;
      },
      10000,
      "mock AI draft panel",
    );

    assert.match(aiDraftState.bodyText, /AI draft is for review only\. It does not save bookings\./);
    assert.match(
      aiDraftState.bodyText,
      /Mock AI Assist response from local API route\. No OpenAI request was made\./,
    );
    assert.match(aiDraftState.bodyText, /Mock response only — review required/);
    assert.equal(aiDraftState.draftIsNearButtonRow, true, "Expected AI draft panel near AI button row");
    assert.equal(aiDraftState.localWarningCount, 0, "Expected empty AI Assist warning to clear after draft");
    assert.deepEqual(
      aiDraftState.fetchCalls,
      ["/api/ai-parse"],
      `Expected mock AI Assist to call only local /api/ai-parse, got ${aiDraftState.fetchCalls.join(", ")}`,
    );
    assert.equal(
      aiDraftState.savedCount,
      savedCountBeforeAiAssist,
      "Expected mock AI Assist not to change saved booking count",
    );
    assert.equal(aiDraftState.fields.company, state.fields.company);
    assert.equal(aiDraftState.fields.bookingType, state.fields.bookingType);
    assert.equal(aiDraftState.fields.vehicle, state.fields.vehicle);
    assert.equal(aiDraftState.fields.pickup, state.fields.pickup);
    assert.equal(aiDraftState.fields.dropoff, state.fields.dropoff);
    assert.equal(aiDraftState.fields.name, state.fields.name);

    await evaluate(`(() => {
      const loadedBookings = [
        ${JSON.stringify(loadedSavedBookingFixture)},
        ${JSON.stringify(dashboardDriverAssignmentFixture)},
        ${JSON.stringify(dashboardAssignedDriverClearFixture)},
        ${JSON.stringify(dashboardProfilePayoutAssignmentFixture)},
        ${JSON.stringify(completedSavedBookingFixture)},
        ${JSON.stringify(completedCustomerOnlyPriceFixture)},
        ${JSON.stringify(dashboardCompletionActionFixture)},
        ${JSON.stringify(completedUndoAssignedFixture)},
        ${JSON.stringify(completedUndoConfirmedFixture)},
        ${JSON.stringify(dashboardStatusFlowFixture)},
        ${JSON.stringify(dashboardOtwRevertAssignedFixture)},
        ${JSON.stringify(dashboardOtwRevertConfirmedFixture)},
        ${JSON.stringify(dashboardPobRevertFixture)},
        ${JSON.stringify(dashboardOtwClearDriverFixture)},
        ${JSON.stringify(legacyMrLeeNoCompanySavedBookingFixture)},
        ${JSON.stringify(legacyMrLeeCompletedDuplicateFixture)},
        ${JSON.stringify(persistedTestSaveBookingFixture)},
        ${JSON.stringify(persistedSuccessTestCompletedFixture)},
        ${JSON.stringify(persistedRealLutherGrahamFixture)},
        ${JSON.stringify(persistedRealAlisonLimFixture)},
        ${JSON.stringify(persistedRealNicoleRohanHarmlessTestFixture)},
      ];
      window.__prestigeFetchCalls = [];
      window.__prestigeDashboardDriverAssignmentBodies = [];
      window.__prestigeBookingCompletionRequests = [];
      window.__prestigeUnhandledSupabaseCalls = [];
      window.__prestigeOriginalFetch = window.__prestigeOriginalFetch || window.fetch.bind(window);
      window.fetch = async (...args) => {
        const target = args[0]?.url || args[0];
        const method = args[1]?.method || args[0]?.method || "GET";
        const bodyText = typeof args[1]?.body === "string" ? args[1].body : "";

        window.__prestigeFetchCalls.push(\`\${method} \${target}\`);

        if (
          method === "GET" &&
          String(target).includes("/rest/v1/bookings") &&
          String(target).includes("select=")
        ) {
          return new Response(JSON.stringify(loadedBookings), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (method === "PATCH" && String(target).includes("/rest/v1/bookings")) {
          let parsedBody = bodyText;

          try {
            parsedBody = JSON.parse(bodyText);
          } catch {}

          const parsedBodyKeys = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
            ? Object.keys(parsedBody)
            : [];
          const isStatusOnlyPatch = parsedBodyKeys.length > 0 &&
            parsedBodyKeys.every((key) => ["status", "updated_at"].includes(key));
          const isCompletionFixture =
            String(target).includes("id=eq.${dashboardCompletionActionFixture.id}") ||
            String(target).includes("id=eq.${completedUndoAssignedFixture.id}") ||
            String(target).includes("id=eq.${completedUndoConfirmedFixture.id}") ||
            String(target).includes("id=eq.${dashboardStatusFlowFixture.id}") ||
            String(target).includes("id=eq.${dashboardOtwRevertAssignedFixture.id}") ||
            String(target).includes("id=eq.${dashboardOtwRevertConfirmedFixture.id}") ||
            String(target).includes("id=eq.${dashboardPobRevertFixture.id}");

          if (isStatusOnlyPatch && isCompletionFixture) {
            window.__prestigeBookingCompletionRequests.push({
              body: parsedBody,
              url: String(target),
            });

            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }

          if (
            String(target).includes("id=eq.${dashboardDriverAssignmentFixture.id}") ||
            String(target).includes("id=eq.${dashboardAssignedDriverClearFixture.id}") ||
            String(target).includes("id=eq.${dashboardProfilePayoutAssignmentFixture.id}") ||
            String(target).includes("id=eq.${dashboardOtwClearDriverFixture.id}")
          ) {
            window.__prestigeDashboardDriverAssignmentBodies.push(parsedBody);

            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
        }

        if (
          method === "GET" &&
          (
            String(target).includes("/rest/v1/travelers") ||
            String(target).includes("/rest/v1/companies") ||
            String(target).includes("/rest/v1/saved_addresses")
          )
        ) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (String(target).includes("/rest/v1/")) {
          window.__prestigeUnhandledSupabaseCalls.push(\`\${method} \${target}\`);
          return new Response(JSON.stringify({ message: "Unhandled Supabase mock" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        return window.__prestigeOriginalFetch(...args);
      };
    })()`);

    await clickTab("Bookings", "Load Bookings");

    const clickedLoadBookings = await evaluate(`(() => {
      const loadButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Load Bookings",
      );

      if (!loadButton || loadButton.disabled) {
        return false;
      }

      loadButton.click();
      return true;
    })()`);
    assert.equal(clickedLoadBookings, true, "Expected Load Bookings button to be clickable");

    await waitForCondition(
      () =>
        evaluate(`(() => {
          const bodyText = document.body.innerText;

          return bodyText.includes("Recent Bookings") &&
            bodyText.includes("LOADED SAVED COMPANY") &&
            [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Load this booking");
        })()`),
      10000,
      "mock loaded recent booking",
    );

    const hiddenLegacyMrLeeBookingsState = await evaluate(`(() => {
      const articles = [...document.querySelectorAll("article")].map((article) => article.innerText);

      return {
        articles,
        savedCount: document.body.innerText.match(/Saved\\s+(\\d+)/)?.[1] || "",
      };
    })()`);
    assert.equal(
      hiddenLegacyMrLeeBookingsState.savedCount,
      "17",
      "Expected hidden legacy Mr Lee browser-test duplicates not to inflate the visible Saved count",
    );
    assert.equal(
      hiddenLegacyMrLeeBookingsState.articles.some((articleText) => articleText.includes("SQ306")),
      false,
      "Expected stale legacy Mr Lee browser-test duplicates to be isolated from Recent Bookings",
    );
    assert.equal(
      hiddenLegacyMrLeeBookingsState.articles.some((articleText) => articleText.includes("BROWSER UI TEST Mr Lee")),
      false,
      "Expected stale legacy Mr Lee browser-test duplicates not to appear as visible Recent Bookings cards",
    );
    assert.equal(
      hiddenLegacyMrLeeBookingsState.articles.some(
        (articleText) =>
          articleText.includes("TEST SAVE TRAVELER B") ||
          articleText.includes("TEST SAVE BOOKER B") ||
          articleText.includes("SUCCESS TEST TRAVELER") ||
          articleText.includes("SUCCESS TEST BOOKER"),
      ),
      false,
      "Expected persisted browser-test fixture records to be isolated from Recent Bookings",
    );
    assert.equal(
      hiddenLegacyMrLeeBookingsState.articles.some(
        (articleText) =>
          articleText.includes("Luther Graham") &&
          articleText.includes("SQ265") &&
          articleText.includes("30 Apr 2026"),
      ),
      true,
      "Expected real Luther Graham booking assigned to the test driver to remain visible in Recent Bookings",
    );
    assert.equal(
      hiddenLegacyMrLeeBookingsState.articles.some(
        (articleText) =>
          articleText.includes("Alison") &&
          articleText.includes("Lim Yeow Beng") &&
          articleText.includes("SQ377"),
      ),
      true,
      "Expected real Alison / Lim Yeow Beng booking to remain visible in Recent Bookings",
    );
    assert.equal(
      hiddenLegacyMrLeeBookingsState.articles.some(
        (articleText) =>
          articleText.includes("Nicole Yap") &&
          articleText.includes("Mr. Rohan Singh") &&
          articleText.includes("NH844"),
      ),
      true,
      "Expected real Nicole Yap / Mr. Rohan Singh booking with harmless test note to remain visible in Recent Bookings",
    );
    const recentLoadedPriceArticle = hiddenLegacyMrLeeBookingsState.articles.find((articleText) =>
      articleText.includes("LOADED SAVED TRAVELER") && articleText.includes("SQ999"),
    );
    const recentCustomerOnlyPriceArticle = hiddenLegacyMrLeeBookingsState.articles.find((articleText) =>
      articleText.includes("PRICE DISPLAY CUSTOMER ONLY TRAVELER") && articleText.includes("SQ785"),
    );
    const recentLutherPriceArticle = hiddenLegacyMrLeeBookingsState.articles.find((articleText) =>
      articleText.includes("Luther Graham") && articleText.includes("SQ265") && articleText.includes("30 Apr 2026"),
    );
    assert.match(
      recentLoadedPriceArticle || "",
      /Customer \$120 \/ Driver \$75/,
      "Expected Bookings card to show saved customer and driver prices",
    );
    assert.match(
      recentCustomerOnlyPriceArticle || "",
      /Customer \$140 \/ Driver —/,
      "Expected Bookings card to show missing driver price as a dash, not zero",
    );
    assert.doesNotMatch(
      recentCustomerOnlyPriceArticle || "",
      /Driver \$0(?:\.00)?/,
      "Expected Bookings card not to invent a $0 driver price when it is missing",
    );
    assert.match(
      recentLutherPriceArticle || "",
      /Customer \$160 \/ Driver \$95/,
      "Expected Bookings card to use the saved assigned driver payout",
    );
    assert.doesNotMatch(
      recentLutherPriceArticle || "",
      /Driver \$105/,
      "Expected Bookings card not to display the saved driver payout range maximum plus extras as the actual payout",
    );

    await setInputValue("[data-bookings-search-input='true']", "luther", "Bookings search");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const articles = [...document.querySelectorAll("article")].map((article) => article.innerText);

          return articles.length === 1 &&
            articles[0].includes("Luther Graham") &&
            articles[0].includes("SQ265") &&
            articles[0].includes("30 Apr 2026") &&
            !document.body.innerText.includes("No matching bookings found.");
        })()`),
      10000,
      "Bookings search keeps real Luther booking with test driver assignment",
    );

    await setInputValue("[data-bookings-search-input='true']", "LOADED SAVED TRAVELER", "Bookings search");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const articles = [...document.querySelectorAll("article")].map((article) => article.innerText);

          return articles.length === 1 &&
            articles[0].includes("LOADED SAVED TRAVELER") &&
            !document.body.innerText.includes("DASHBOARD DRIVER TEST TRAVELER");
        })()`),
      10000,
      "Bookings search by passenger",
    );

    await setInputValue("[data-bookings-search-input='true']", "DASHBOARD DRIVER TEST COMPANY", "Bookings search");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const articles = [...document.querySelectorAll("article")].map((article) => article.innerText);

          return articles.length === 1 &&
            articles[0].includes("DASHBOARD DRIVER TEST COMPANY") &&
            !document.body.innerText.includes("LOADED SAVED TRAVELER");
        })()`),
      10000,
      "Bookings search by company",
    );

    await setInputValue("[data-bookings-search-input='true']", "SQ888", "Bookings search");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const articles = [...document.querySelectorAll("article")].map((article) => article.innerText);

          return articles.length === 1 &&
            articles[0].includes("COMPLETED TEST TRAVELER") &&
            !document.body.innerText.includes("LOADED SAVED TRAVELER");
        })()`),
      10000,
      "Bookings search by flight",
    );

    await setInputValue("[data-bookings-search-input='true']", "Raffles Hotel Singapore", "Bookings search");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const articles = [...document.querySelectorAll("article")].map((article) => article.innerText);

          return articles.length === 1 &&
            articles[0].includes("LOADED SAVED TRAVELER") &&
            !document.body.innerText.includes("COMPLETED TEST TRAVELER");
        })()`),
      10000,
      "Bookings search by route",
    );

    await setInputValue("[data-bookings-search-input='true']", "COMPLETED TEST DRIVER", "Bookings search");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const articles = [...document.querySelectorAll("article")].map((article) => article.innerText);

          return articles.length === 1 &&
            articles[0].includes("COMPLETED TEST TRAVELER") &&
            !document.body.innerText.includes("LOADED SAVED TRAVELER");
        })()`),
      10000,
      "Bookings search by driver",
    );

    await setInputValue("[data-bookings-search-input='true']", "NO LOCAL BOOKING MATCH", "Bookings search");
    const bookingsNoMatchState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const state = {
            articles: [...document.querySelectorAll("article")].map((article) => article.innerText),
            noMatchText: document.querySelector("[data-bookings-search-empty='true']")?.textContent.trim() || "",
          };

          return state.noMatchText === "No matching bookings found." ? state : false;
        })()`),
      10000,
      "Bookings search no-match state",
    );
    assert.deepEqual(bookingsNoMatchState.articles, []);
    assert.equal(bookingsNoMatchState.noMatchText, "No matching bookings found.");

    await setInputValue("[data-bookings-search-input='true']", "", "Bookings search");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const bodyText = document.body.innerText;

          return bodyText.includes("LOADED SAVED TRAVELER") &&
            bodyText.includes("DASHBOARD DRIVER TEST TRAVELER") &&
            bodyText.includes("COMPLETED TEST TRAVELER") &&
            !document.querySelector("[data-bookings-search-empty='true']");
        })()`),
      10000,
      "Bookings search cleared",
    );

    await clickTab("Dashboard", "Operations Dashboard");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const bodyText = document.body.innerText;

          return bodyText.includes("DASHBOARD DRIVER TEST TRAVELER") &&
            bodyText.includes("Assign driver to this booking") &&
            bodyText.includes("This updates the selected booking only.") &&
            [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Assign to this booking") &&
            Boolean(document.querySelector("[data-dashboard-load-booking='true']"));
        })()`),
      10000,
      "mock loaded dashboard booking",
    );

    const hiddenLegacyMrLeeDashboardState = await evaluate(`(() => {
      const articles = [...document.querySelectorAll("article")].map((article) => article.innerText);

      return {
        articles,
        matchingCount: document.body.innerText.match(/MATCHING\\s+(\\d+)/)?.[1] || "",
      };
    })()`);
    assert.equal(
      hiddenLegacyMrLeeDashboardState.matchingCount,
      "17",
      "Expected hidden legacy Mr Lee browser-test duplicates not to inflate Dashboard matching count",
    );
    assert.equal(
      hiddenLegacyMrLeeDashboardState.articles.some((articleText) => articleText.includes("SQ306")),
      false,
      "Expected stale legacy Mr Lee browser-test duplicates to be isolated from Dashboard cards",
    );
    assert.equal(
      hiddenLegacyMrLeeDashboardState.articles.some((articleText) => articleText.includes("BROWSER UI TEST Mr Lee")),
      false,
      "Expected stale legacy Mr Lee browser-test duplicates not to appear as visible Dashboard cards",
    );
    assert.equal(
      hiddenLegacyMrLeeDashboardState.articles.some(
        (articleText) =>
          articleText.includes("TEST SAVE TRAVELER B") ||
          articleText.includes("TEST SAVE BOOKER B") ||
          articleText.includes("SUCCESS TEST TRAVELER") ||
          articleText.includes("SUCCESS TEST BOOKER"),
      ),
      false,
      "Expected persisted browser-test fixture records to be isolated from Dashboard cards",
    );
    assert.equal(
      hiddenLegacyMrLeeDashboardState.articles.some(
        (articleText) =>
          articleText.includes("Luther Graham") &&
          articleText.includes("SQ265") &&
          articleText.includes("30 Apr 2026") &&
          articleText.includes("TEST DRIVER CRM 20260516"),
      ),
      true,
      "Expected real Luther Graham booking assigned to the test driver to remain visible on Dashboard",
    );
    assert.equal(
      hiddenLegacyMrLeeDashboardState.articles.some(
        (articleText) =>
          articleText.includes("Alison") &&
          articleText.includes("Lim Yeow Beng") &&
          articleText.includes("SQ377"),
      ),
      true,
      "Expected real Alison / Lim Yeow Beng booking to remain visible on Dashboard",
    );
    assert.equal(
      hiddenLegacyMrLeeDashboardState.articles.some(
        (articleText) =>
          articleText.includes("Nicole Yap") &&
          articleText.includes("Mr. Rohan Singh") &&
          articleText.includes("NH844"),
      ),
      true,
      "Expected real Nicole Yap / Mr. Rohan Singh booking with harmless test note to remain visible on Dashboard",
    );
    const dashboardLoadedPriceArticle = hiddenLegacyMrLeeDashboardState.articles.find((articleText) =>
      articleText.includes("LOADED SAVED TRAVELER") && articleText.includes("SQ999"),
    );
    const dashboardCustomerOnlyPriceArticle = hiddenLegacyMrLeeDashboardState.articles.find((articleText) =>
      articleText.includes("PRICE DISPLAY CUSTOMER ONLY TRAVELER") && articleText.includes("SQ785"),
    );
    const dashboardLutherPriceArticle = hiddenLegacyMrLeeDashboardState.articles.find((articleText) =>
      articleText.includes("Luther Graham") && articleText.includes("SQ265") && articleText.includes("30 Apr 2026"),
    );
    assert.match(
      dashboardLoadedPriceArticle || "",
      /Customer \$120 \/ Driver \$75/,
      "Expected Dashboard card to show saved customer and driver prices",
    );
    assert.match(
      dashboardCustomerOnlyPriceArticle || "",
      /Customer \$140 \/ Driver —/,
      "Expected Dashboard card to show missing driver price as a dash, not zero",
    );
    assert.doesNotMatch(
      dashboardCustomerOnlyPriceArticle || "",
      /Driver \$0(?:\.00)?/,
      "Expected Dashboard card not to invent a $0 driver price when it is missing",
    );
    assert.match(
      dashboardLutherPriceArticle || "",
      /Customer \$160 \/ Driver \$95/,
      "Expected Dashboard card to use the saved assigned driver payout",
    );
    assert.doesNotMatch(
      dashboardLutherPriceArticle || "",
      /Driver \$105/,
      "Expected Dashboard card not to display the saved driver payout range maximum plus extras as the actual payout",
    );
    const dashboardLutherPayoutInputState = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("Luther Graham") &&
          candidate.innerText.includes("SQ265") &&
          candidate.innerText.includes("30 Apr 2026"),
      );
      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const payoutLabel = [...(article?.querySelectorAll("label") || [])].find(
        (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === "Override Payout",
      );
      const payoutInput = payoutLabel?.querySelector("input");

      return {
        placeholder: payoutInput?.getAttribute("placeholder") || "",
        value: payoutInput?.value || "",
      };
    })()`);
    assert.equal(
      dashboardLutherPayoutInputState.placeholder,
      "95",
      "Expected Dashboard assignment Override Payout placeholder to show the saved assigned driver payout",
    );
    assert.equal(
      dashboardLutherPayoutInputState.value,
      "",
      "Expected Dashboard assignment Override Payout not to prefill a stale payout as an override",
    );
    assert.notEqual(
      dashboardLutherPayoutInputState.placeholder,
      "105",
      "Expected Dashboard assignment Override Payout not to use the saved max/range payout plus extras",
    );

    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeDashboardDriverAssignmentBodies = [];
    })()`);

    const clickedInvalidDashboardAssignPayout = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD DRIVER TEST TRAVELER") &&
          candidate.innerText.includes("SQ777") &&
          [...candidate.querySelectorAll("button")].some((button) => button.textContent.trim() === "Assign to this booking"),
      );

      if (!article) {
        return { clicked: false };
      }

      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const fieldForLabel = (labelText) => {
        const label = [...article.querySelectorAll("label")].find(
          (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
        );
        return label?.querySelector("input, select, textarea") || null;
      };
      const setValue = (control, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(control.constructor.prototype, "value");
        descriptor?.set?.call(control, value);
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      };

      const driverName = fieldForLabel("Driver Name");
      const driverContact = fieldForLabel("Driver Contact");
      const driverPlate = fieldForLabel("Driver Car Plate");
      const payoutOverride = fieldForLabel("Override Payout");
      const payoutReason = fieldForLabel("Override Reason");
      const assignButton = article.querySelector("[data-dashboard-assign-driver='${dashboardDriverAssignmentFixture.id}']");

      if (!driverName || !driverContact || !driverPlate || !payoutOverride || !payoutReason || !assignButton || assignButton.disabled) {
        return { clicked: false };
      }

      setValue(driverName, "DASHBOARD TEST DRIVER");
      setValue(driverContact, "+65 8555 7777");
      setValue(driverPlate, "SLC777D");
      setValue(payoutOverride, "0");
      setValue(payoutReason, "");
      assignButton.click();

      return {
        clicked: true,
        reasonPlaceholder: payoutReason.getAttribute("placeholder") || "",
        reasonValue: payoutReason.value || "",
      };
    })()`);
    assert.equal(
      clickedInvalidDashboardAssignPayout.clicked,
      true,
      "Expected invalid dashboard payout assignment attempt to be clickable",
    );
    assert.equal(
      clickedInvalidDashboardAssignPayout.reasonValue,
      "",
      "Expected dashboard driver payout Override Reason to be blank by default",
    );
    assert.equal(
      clickedInvalidDashboardAssignPayout.reasonPlaceholder,
      "",
      "Expected dashboard driver payout Override Reason not to suggest generated reasons",
    );

    const invalidDashboardAssignPayoutState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD DRIVER TEST TRAVELER") &&
              candidate.innerText.includes("SQ777"),
          );
          const assignmentMessage = article?.querySelector("[data-driver-assignment-message='${dashboardDriverAssignmentFixture.id}']");
          const assignButton = article?.querySelector("[data-dashboard-assign-driver='${dashboardDriverAssignmentFixture.id}']");
          const messageRect = assignmentMessage?.getBoundingClientRect();
          const assignButtonRect = assignButton?.getBoundingClientRect();

          return assignmentMessage?.textContent.trim() === "Override payout must be greater than $0."
            ? {
                assignmentBodies: window.__prestigeDashboardDriverAssignmentBodies || [],
                fetchCalls: window.__prestigeFetchCalls || [],
                localMessageDistance:
                  assignButtonRect && messageRect ? Math.abs(messageRect.top - assignButtonRect.bottom) : null,
                localMessageText: assignmentMessage.textContent.trim(),
              }
            : false;
        })()`),
      10000,
      "dashboard invalid manual payout feedback",
    );
    assert.deepEqual(
      bookingPatchCalls(invalidDashboardAssignPayoutState.fetchCalls),
      [],
      "Expected invalid manual payout to be rejected before booking PATCH",
    );
    assert.deepEqual(
      invalidDashboardAssignPayoutState.assignmentBodies,
      [],
      "Expected invalid manual payout not to save an assignment body",
    );
    assert.ok(
      invalidDashboardAssignPayoutState.localMessageDistance !== null &&
        invalidDashboardAssignPayoutState.localMessageDistance <= 120,
      `Expected invalid payout feedback near Assign to this booking button, got ${invalidDashboardAssignPayoutState.localMessageDistance}px`,
    );

    const clickedDashboardAssignDriver = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD DRIVER TEST TRAVELER") &&
          candidate.innerText.includes("SQ777") &&
          [...candidate.querySelectorAll("button")].some((button) => button.textContent.trim() === "Assign to this booking"),
      );

      if (!article) {
        return false;
      }

      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const fieldForLabel = (labelText) => {
        const label = [...article.querySelectorAll("label")].find(
          (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
        );
        return label?.querySelector("input, select, textarea") || null;
      };
      const setValue = (control, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(control.constructor.prototype, "value");
        descriptor?.set?.call(control, value);
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      };

      const driverName = fieldForLabel("Driver Name");
      const driverContact = fieldForLabel("Driver Contact");
      const driverPlate = fieldForLabel("Driver Car Plate");
      const payoutOverride = fieldForLabel("Override Payout");
      const payoutReason = fieldForLabel("Override Reason");
      const driverNotes = fieldForLabel("Driver Notes");
      const includePayout = [...article.querySelectorAll("label")].find((candidate) =>
        candidate.innerText.includes("Include payout")
      )?.querySelector("input[type='checkbox']");
      const assignButton = [...article.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Assign to this booking",
      );

      if (
        !driverName ||
        !driverContact ||
        !driverPlate ||
        !payoutOverride ||
        !payoutReason ||
        !driverNotes ||
        !includePayout ||
        !assignButton ||
        assignButton.disabled
      ) {
        return false;
      }

      setValue(driverName, "DASHBOARD TEST DRIVER");
      setValue(driverContact, "+65 8555 7777");
      setValue(driverPlate, "SLC777D");
      setValue(payoutOverride, "82");
      setValue(payoutReason, "Dashboard assignment test");
      setValue(driverNotes, "Meet at arrival belt");

      if (!includePayout.checked) {
        includePayout.click();
      }

      assignButton.click();
      return true;
    })()`);
    assert.equal(clickedDashboardAssignDriver, true, "Expected dashboard Assign to this booking button to be clickable");

    const dashboardAssignmentState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const labels = [...document.querySelectorAll("label")];
          const fieldValue = (labelText) => {
            const label = labels.find((candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText);
            const control = label?.querySelector("input, select, textarea");

            if (!control) {
              return "";
            }

            if (control.tagName === "SELECT") {
              return control.options[control.selectedIndex]?.textContent.trim() || control.value || "";
            }

            return control.value || "";
          };
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD DRIVER TEST TRAVELER") &&
              candidate.innerText.includes("SQ777") &&
              [...candidate.querySelectorAll("button")].some((button) => button.textContent.trim() === "Assign to this booking"),
          );
          const assignmentMessage = article?.querySelector("[data-driver-assignment-message='${dashboardDriverAssignmentFixture.id}']");
          const assignButton = article?.querySelector("[data-dashboard-assign-driver='${dashboardDriverAssignmentFixture.id}']");
          const messageRect = assignmentMessage?.getBoundingClientRect();
          const assignButtonRect = assignButton?.getBoundingClientRect();

          return {
            articleText: article?.innerText || "",
            bodyText: document.body.innerText,
            fields: {
              company: fieldValue("Company / Account"),
              flight: fieldValue("Flight number"),
              driverName: fieldValue("Driver Name"),
            },
            fetchCalls: window.__prestigeFetchCalls || [],
            assignmentBodies: window.__prestigeDashboardDriverAssignmentBodies || [],
            localMessageText: assignmentMessage?.textContent.trim() || "",
            localMessageDistance:
              assignButtonRect && messageRect ? Math.abs(messageRect.top - assignButtonRect.bottom) : null,
            unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
          };
        })()`);

        return candidateState?.localMessageText === "Assigned driver updated." &&
          candidateState?.articleText?.includes("Driver: DASHBOARD TEST DRIVER") &&
          candidateState?.articleText?.includes("Customer $95 / Driver $82")
          ? candidateState
          : false;
      },
      10000,
      "dashboard driver assignment success state",
    );

    assert.deepEqual(
      dashboardAssignmentState.unhandledSupabaseCalls,
      [],
      `Expected dashboard assignment Supabase calls to be mocked, got ${dashboardAssignmentState.unhandledSupabaseCalls.join(", ")}`,
    );
    const dashboardAssignmentBookingPatches = bookingPatchCalls(dashboardAssignmentState.fetchCalls);
    assert.equal(
      dashboardAssignmentBookingPatches.length,
      1,
      `Expected dashboard assignment to make one mocked booking PATCH, got ${dashboardAssignmentState.fetchCalls.join(", ")}`,
    );
    assert.match(
      dashboardAssignmentBookingPatches[0],
      new RegExp(`^PATCH .*\\/rest\\/v1\\/bookings.*id=eq\\.${dashboardDriverAssignmentFixture.id}`),
    );
    assert.ok(
      dashboardAssignmentState.fetchCalls.every((call) => !call.includes("/rest/v1/drivers")),
      `Expected dashboard assignment not to modify driver profiles, got ${dashboardAssignmentState.fetchCalls.join(", ")}`,
    );
    assert.equal(dashboardAssignmentState.assignmentBodies.length, 1);
    assert.equal(dashboardAssignmentState.assignmentBodies[0]?.driver_name, "DASHBOARD TEST DRIVER");
    assert.equal(dashboardAssignmentState.assignmentBodies[0]?.driver_contact, "+65 8555 7777");
    assert.equal(dashboardAssignmentState.assignmentBodies[0]?.driver_plate_number, "SLC777D");
    assert.equal(dashboardAssignmentState.assignmentBodies[0]?.driver_payout_amount, 82);
    assert.equal(dashboardAssignmentState.assignmentBodies[0]?.driver_payout_override, 82);
    assert.equal(dashboardAssignmentState.assignmentBodies[0]?.driver_payout_reason, "Dashboard assignment test");
    assert.equal(dashboardAssignmentState.assignmentBodies[0]?.driver_notes, "Meet at arrival belt");
    assert.equal(dashboardAssignmentState.assignmentBodies[0]?.driver_dispatch_include_payout, true);
    assert.equal(dashboardAssignmentState.assignmentBodies[0]?.status, "assigned");
    assert.match(dashboardAssignmentState.articleText, /Assigned/i);
    assert.match(dashboardAssignmentState.articleText, /Driver:\s*DASHBOARD TEST DRIVER/);
    assert.match(dashboardAssignmentState.articleText, /Contact:\s*\+65 8555 7777/);
    assert.match(dashboardAssignmentState.articleText, /Customer \$95 \/ Driver \$82/);
    assert.match(dashboardAssignmentState.articleText, /Copy Driver Dispatch/);
    assert.ok(
      dashboardAssignmentState.localMessageDistance !== null &&
        dashboardAssignmentState.localMessageDistance <= 120,
      `Expected Assign to this booking status near Assign to this booking button, got ${dashboardAssignmentState.localMessageDistance}px`,
    );

    await evaluate(`window.__prestigeCopiedTexts = []`);

    const clickedDashboardCopyDriverDispatch = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD DRIVER TEST TRAVELER") &&
          candidate.innerText.includes("SQ777"),
      );
      const copyButton = article?.querySelector("[data-dashboard-copy-driver-dispatch='${dashboardDriverAssignmentFixture.id}']");

      if (!copyButton || copyButton.disabled) {
        return false;
      }

      copyButton.click();
      return true;
    })()`);
    assert.equal(
      clickedDashboardCopyDriverDispatch,
      true,
      "Expected Dashboard Copy Driver Dispatch button to be clickable",
    );

    const dashboardDriverDispatchCopyState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD DRIVER TEST TRAVELER") &&
              candidate.innerText.includes("SQ777"),
          );
          const copyButton = article?.querySelector("[data-dashboard-copy-driver-dispatch='${dashboardDriverAssignmentFixture.id}']");
          const feedback = article?.querySelector("[data-dashboard-copy-feedback='${dashboardDriverAssignmentFixture.id}:driverDispatch']");
          const buttonRect = copyButton?.getBoundingClientRect();
          const feedbackRect = feedback?.getBoundingClientRect();

          return feedback?.textContent.trim() === "Driver dispatch copied."
            ? {
                copiedTexts: window.__prestigeCopiedTexts || [],
                distanceFromButton:
                  buttonRect && feedbackRect ? Math.abs(feedbackRect.top - buttonRect.bottom) : null,
                feedbackText: feedback.textContent.trim(),
                globalCopyMessages: [...document.querySelectorAll("[data-status-panel='global']")]
                  .filter((element) => /copied/i.test(element.innerText))
                  .map((element) => element.innerText.trim()),
              }
            : false;
        })()`),
      10000,
      "Dashboard driver dispatch local copy feedback",
    );
    assert.equal(dashboardDriverDispatchCopyState.feedbackText, "Driver dispatch copied.");
    assert.deepEqual(dashboardDriverDispatchCopyState.globalCopyMessages, []);
    assert.ok(
      dashboardDriverDispatchCopyState.distanceFromButton !== null &&
        dashboardDriverDispatchCopyState.distanceFromButton <= 120,
      `Expected Dashboard Driver Dispatch copy feedback near its button, got ${dashboardDriverDispatchCopyState.distanceFromButton}px`,
    );
    assert.match(
      dashboardDriverDispatchCopyState.copiedTexts[0] || "",
      /DASHBOARD TEST DRIVER/,
    );
    assert.match(
      dashboardDriverDispatchCopyState.copiedTexts[0] || "",
      /Payout: \$82/,
      "Expected Driver Dispatch copy to use the manual dashboard payout override",
    );

    await clickTab("Bookings", "Recent Bookings");
    const manualPayoutBookingsCardState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD DRIVER TEST TRAVELER") &&
              candidate.innerText.includes("SQ777"),
          );

          return article?.innerText.includes("Customer $95 / Driver $82")
            ? { articleText: article.innerText }
            : false;
        })()`),
      10000,
      "manual payout Bookings card",
    );
    assert.match(manualPayoutBookingsCardState.articleText, /Customer \$95 \/ Driver \$82/);

    const clickedManualPayoutLoadBooking = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD DRIVER TEST TRAVELER") &&
          candidate.innerText.includes("SQ777"),
      );
      const loadButton = [...(article?.querySelectorAll("button") || [])].find(
        (button) => button.textContent.trim() === "Load this booking",
      );

      if (!loadButton || loadButton.disabled) {
        return false;
      }

      loadButton.click();
      return true;
    })()`);
    assert.equal(
      clickedManualPayoutLoadBooking,
      true,
      "Expected manual payout booking Load this booking button to be clickable",
    );

    const manualPayoutLoadedPricingState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        return candidateState?.fields?.flight === "SQ777" &&
          candidateState?.fields?.name === "DASHBOARD DRIVER TEST TRAVELER" &&
          candidateState?.pricingPanel?.includes("$82.00")
          ? candidateState
          : false;
      },
      10000,
      "manual payout loaded Dispatch pricing",
    );
    assert.match(manualPayoutLoadedPricingState.pricingPanel, /Driver\s+\$82\.00/);
    assert.doesNotMatch(
      manualPayoutLoadedPricingState.pricingPanel,
      /Driver\s+\$70\.00/,
      "Expected loaded Dispatch Pricing not to keep the old driver payout after manual override",
    );
    assert.match(manualPayoutLoadedPricingState.driverDispatch, /Payout: \$82/);

    await clickTab("Dashboard", "Operations Dashboard");

    const clickedDashboardCopyJobCard = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD DRIVER TEST TRAVELER") &&
          candidate.innerText.includes("SQ777"),
      );
      const copyButton = article?.querySelector("[data-dashboard-copy-job-card='${dashboardDriverAssignmentFixture.id}']");

      if (!copyButton || copyButton.disabled) {
        return false;
      }

      copyButton.click();
      return true;
    })()`);
    assert.equal(
      clickedDashboardCopyJobCard,
      true,
      "Expected Dashboard Copy WhatsApp Job Card button to be clickable",
    );

    const dashboardJobCardCopyState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD DRIVER TEST TRAVELER") &&
              candidate.innerText.includes("SQ777"),
          );
          const copyButton = article?.querySelector("[data-dashboard-copy-job-card='${dashboardDriverAssignmentFixture.id}']");
          const feedback = article?.querySelector("[data-dashboard-copy-feedback='${dashboardDriverAssignmentFixture.id}:jobCard']");
          const buttonRect = copyButton?.getBoundingClientRect();
          const feedbackRect = feedback?.getBoundingClientRect();

          return feedback?.textContent.trim() === "Booking job card copied."
            ? {
                copiedTexts: window.__prestigeCopiedTexts || [],
                distanceFromButton:
                  buttonRect && feedbackRect ? Math.abs(feedbackRect.top - buttonRect.bottom) : null,
                feedbackText: feedback.textContent.trim(),
                globalCopyMessages: [...document.querySelectorAll("[data-status-panel='global']")]
                  .filter((element) => /copied/i.test(element.innerText))
                  .map((element) => element.innerText.trim()),
              }
            : false;
        })()`),
      10000,
      "Dashboard job card local copy feedback",
    );
    assert.equal(dashboardJobCardCopyState.feedbackText, "Booking job card copied.");
    assert.deepEqual(dashboardJobCardCopyState.globalCopyMessages, []);
    assert.ok(
      dashboardJobCardCopyState.distanceFromButton !== null &&
        dashboardJobCardCopyState.distanceFromButton <= 120,
      `Expected Dashboard WhatsApp Job Card copy feedback near its button, got ${dashboardJobCardCopyState.distanceFromButton}px`,
    );
    assert.match(
      dashboardJobCardCopyState.copiedTexts[dashboardJobCardCopyState.copiedTexts.length - 1] || "",
      /SQ777/,
    );

    const assignedDriverClearInitialState = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD CLEAR DRIVER TEST TRAVELER") &&
          candidate.innerText.includes("SQ778"),
      );

      return {
        articleText: article?.innerText || "",
        hasClearButton: Boolean(
          [...(article?.querySelectorAll("button") || [])].find(
            (button) => button.textContent.trim() === "Clear assigned driver",
          ),
        ),
      };
    })()`);
    assert.match(assignedDriverClearInitialState.articleText, /Assigned/i);
    assert.match(assignedDriverClearInitialState.articleText, /Driver:\s*OLD DASHBOARD TEST DRIVER/);
    assert.match(assignedDriverClearInitialState.articleText, /Contact:\s*\+65 8999 7777/);
    assert.match(assignedDriverClearInitialState.articleText, /Copy Driver Dispatch/);
    assert.equal(
      assignedDriverClearInitialState.hasClearButton,
      true,
      "Expected assigned dashboard booking to show Clear assigned driver button",
    );

    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeDashboardDriverAssignmentBodies = [];
      window.__prestigeUnhandledSupabaseCalls = [];
    })()`);

    const clickedClearAssignedDriver = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD CLEAR DRIVER TEST TRAVELER") &&
          candidate.innerText.includes("SQ778"),
      );
      const clearButton = [...(article?.querySelectorAll("button") || [])].find(
        (button) => button.textContent.trim() === "Clear assigned driver",
      );

      if (!clearButton || clearButton.disabled) {
        return false;
      }

      clearButton.click();
      return true;
    })()`);
    assert.equal(clickedClearAssignedDriver, true, "Expected Clear assigned driver button to be clickable");

    const clearedAssignedDriverState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD CLEAR DRIVER TEST TRAVELER") &&
              candidate.innerText.includes("SQ778"),
          );
          const assignmentMessage = article?.querySelector("[data-driver-assignment-message='${dashboardAssignedDriverClearFixture.id}']");
          const assignButton = [...(article?.querySelectorAll("button") || [])].find(
            (button) => button.textContent.trim() === "Assign to this booking",
          );
          const messageRect = assignmentMessage?.getBoundingClientRect();
          const assignButtonRect = assignButton?.getBoundingClientRect();

          return {
            articleText: article?.innerText || "",
            assignmentBodies: window.__prestigeDashboardDriverAssignmentBodies || [],
            fetchCalls: window.__prestigeFetchCalls || [],
            hasClearButton: Boolean(
              [...(article?.querySelectorAll("button") || [])].find(
                (button) => button.textContent.trim() === "Clear assigned driver",
              ),
            ),
            localMessageText: assignmentMessage?.textContent.trim() || "",
            localMessageDistance:
              assignButtonRect && messageRect ? Math.abs(messageRect.top - assignButtonRect.bottom) : null,
            unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
          };
        })()`);

        return candidateState?.localMessageText === "Assigned driver cleared." &&
          candidateState?.articleText?.includes("Driver: —") &&
          !candidateState?.articleText?.includes("OLD DASHBOARD TEST DRIVER")
          ? candidateState
          : false;
      },
      10000,
      "dashboard clear assigned driver success state",
    );

    assert.deepEqual(
      clearedAssignedDriverState.unhandledSupabaseCalls,
      [],
      `Expected clear assigned driver Supabase calls to be mocked, got ${clearedAssignedDriverState.unhandledSupabaseCalls.join(", ")}`,
    );
    const clearedAssignedDriverBookingPatches = bookingPatchCalls(clearedAssignedDriverState.fetchCalls);
    assert.equal(
      clearedAssignedDriverBookingPatches.length,
      1,
      `Expected clear assigned driver to make one mocked booking PATCH, got ${clearedAssignedDriverState.fetchCalls.join(", ")}`,
    );
    assert.match(
      clearedAssignedDriverBookingPatches[0],
      new RegExp(`^PATCH .*\\/rest\\/v1\\/bookings.*id=eq\\.${dashboardAssignedDriverClearFixture.id}`),
    );
    assert.ok(
      clearedAssignedDriverState.fetchCalls.every((call) => !call.includes("/rest/v1/drivers")),
      `Expected clear assigned driver not to modify driver profiles, got ${clearedAssignedDriverState.fetchCalls.join(", ")}`,
    );
    assert.equal(clearedAssignedDriverState.assignmentBodies.length, 1);
    assert.equal(clearedAssignedDriverState.assignmentBodies[0]?.driver_id, null);
    assert.equal(clearedAssignedDriverState.assignmentBodies[0]?.driver_name, null);
    assert.equal(clearedAssignedDriverState.assignmentBodies[0]?.driver_contact, null);
    assert.equal(clearedAssignedDriverState.assignmentBodies[0]?.driver_plate_number, null);
    assert.equal(clearedAssignedDriverState.assignmentBodies[0]?.driver_payout_override, null);
    assert.equal(clearedAssignedDriverState.assignmentBodies[0]?.driver_payout_reason, null);
    assert.equal(clearedAssignedDriverState.assignmentBodies[0]?.driver_notes, null);
    assert.equal(clearedAssignedDriverState.assignmentBodies[0]?.driver_dispatch_include_payout, false);
    assert.equal(clearedAssignedDriverState.assignmentBodies[0]?.status, "confirmed");
    assert.match(clearedAssignedDriverState.articleText, /Confirmed/i);
    assert.match(clearedAssignedDriverState.articleText, /Driver:\s*—/);
    assert.ok(!clearedAssignedDriverState.articleText.includes("Copy Driver Dispatch"));
    assert.equal(clearedAssignedDriverState.hasClearButton, false);
    assert.ok(
      clearedAssignedDriverState.localMessageDistance !== null &&
        clearedAssignedDriverState.localMessageDistance <= 120,
      `Expected clear assigned driver status near assignment controls, got ${clearedAssignedDriverState.localMessageDistance}px`,
    );

    const otwClearInitialState = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD OTW CLEAR DRIVER TRAVELER") &&
          candidate.innerText.includes("SQ784"),
      );

      return {
        articleText: article?.innerText || "",
        hasClearButton: Boolean(article?.querySelector("[data-dashboard-clear-driver='${dashboardOtwClearDriverFixture.id}']")),
      };
    })()`);
    assert.match(otwClearInitialState.articleText, /Driver OTW/i);
    assert.match(otwClearInitialState.articleText, /Driver:\s*DASHBOARD OTW CLEAR DRIVER/);
    assert.equal(
      otwClearInitialState.hasClearButton,
      true,
      "Expected OTW dashboard booking with driver to show Clear assigned driver button",
    );

    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeDashboardDriverAssignmentBodies = [];
      window.__prestigeUnhandledSupabaseCalls = [];
    })()`);

    const clickedClearOtwAssignedDriver = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD OTW CLEAR DRIVER TRAVELER") &&
          candidate.innerText.includes("SQ784"),
      );
      const clearButton = article?.querySelector("[data-dashboard-clear-driver='${dashboardOtwClearDriverFixture.id}']");

      if (!clearButton || clearButton.disabled) {
        return false;
      }

      clearButton.click();
      return true;
    })()`);
    assert.equal(
      clickedClearOtwAssignedDriver,
      true,
      "Expected OTW Clear assigned driver button to be clickable",
    );

    const clearedOtwAssignedDriverState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD OTW CLEAR DRIVER TRAVELER") &&
              candidate.innerText.includes("SQ784"),
          );
          const assignmentMessage = article?.querySelector("[data-driver-assignment-message='${dashboardOtwClearDriverFixture.id}']");

          return {
            articleText: article?.innerText || "",
            assignmentBodies: window.__prestigeDashboardDriverAssignmentBodies || [],
            fetchCalls: window.__prestigeFetchCalls || [],
            hasClearButton: Boolean(article?.querySelector("[data-dashboard-clear-driver='${dashboardOtwClearDriverFixture.id}']")),
            hasMarkPobButton: Boolean(article?.querySelector("[data-dashboard-mark-pob='${dashboardOtwClearDriverFixture.id}']")),
            hasRevertStatusButton: Boolean(article?.querySelector("[data-dashboard-revert-status='${dashboardOtwClearDriverFixture.id}']")),
            localMessageText: assignmentMessage?.textContent.trim() || "",
            unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
          };
        })()`);

        return candidateState?.localMessageText === "Assigned driver cleared." &&
          candidateState?.articleText?.includes("Confirmed") &&
          candidateState?.articleText?.includes("Driver: —") &&
          !candidateState?.articleText?.includes("Driver: DASHBOARD OTW CLEAR DRIVER")
          ? candidateState
          : false;
      },
      10000,
      "OTW clear assigned driver confirmed state",
    );

    assert.deepEqual(
      clearedOtwAssignedDriverState.unhandledSupabaseCalls,
      [],
      `Expected OTW clear assigned driver Supabase calls to be mocked, got ${clearedOtwAssignedDriverState.unhandledSupabaseCalls.join(", ")}`,
    );
    const clearedOtwAssignedDriverBookingPatches = bookingPatchCalls(clearedOtwAssignedDriverState.fetchCalls);
    assert.equal(
      clearedOtwAssignedDriverBookingPatches.length,
      1,
      `Expected OTW clear assigned driver to make one mocked booking PATCH, got ${clearedOtwAssignedDriverState.fetchCalls.join(", ")}`,
    );
    assert.match(
      clearedOtwAssignedDriverBookingPatches[0],
      new RegExp(`^PATCH .*\\/rest\\/v1\\/bookings.*id=eq\\.${dashboardOtwClearDriverFixture.id}`),
    );
    assert.equal(clearedOtwAssignedDriverState.assignmentBodies.length, 1);
    assert.equal(clearedOtwAssignedDriverState.assignmentBodies[0]?.driver_id, null);
    assert.equal(clearedOtwAssignedDriverState.assignmentBodies[0]?.driver_name, null);
    assert.equal(clearedOtwAssignedDriverState.assignmentBodies[0]?.driver_contact, null);
    assert.equal(clearedOtwAssignedDriverState.assignmentBodies[0]?.driver_plate_number, null);
    assert.equal(clearedOtwAssignedDriverState.assignmentBodies[0]?.status, "confirmed");
    assert.equal(clearedOtwAssignedDriverState.hasClearButton, false);
    assert.equal(clearedOtwAssignedDriverState.hasMarkPobButton, false);
    assert.equal(clearedOtwAssignedDriverState.hasRevertStatusButton, false);

    const clickDashboardStatusAction = async (fixture, dataAttribute) => {
      const travelerName = JSON.stringify(fixture.travelers.traveler_name);
      const flightNo = JSON.stringify(fixture.flight_no);
      const bookingId = JSON.stringify(fixture.id);

      return evaluate(`(() => {
        const article = [...document.querySelectorAll("article")].find(
          (candidate) =>
            candidate.innerText.includes(${travelerName}) &&
            candidate.innerText.includes(${flightNo}),
        );
        const statusButton = article?.querySelector("[${dataAttribute}=" + ${bookingId} + "]");

        if (!statusButton || statusButton.disabled) {
          return false;
        }

        statusButton.click();
        return true;
      })()`);
    };

    const waitForDashboardStatusState = async (fixture, expectedMessage, expectedStatusLabel, description) => {
      const travelerName = JSON.stringify(fixture.travelers.traveler_name);
      const flightNo = JSON.stringify(fixture.flight_no);
      const bookingId = JSON.stringify(fixture.id);
      const expectedMessageText = JSON.stringify(expectedMessage);

      return waitForCondition(
        async () => {
          const candidateState = await evaluate(`(() => {
            const article = [...document.querySelectorAll("article")].find(
              (candidate) =>
                candidate.innerText.includes(${travelerName}) &&
                candidate.innerText.includes(${flightNo}),
            );
            const statusControls = article?.querySelector("[data-dashboard-status-controls=" + ${bookingId} + "]");
            const statusMessage = statusControls?.querySelector("[data-booking-completion-message=" + ${bookingId} + "]");
            const matchingMessages = [...document.querySelectorAll("[data-booking-completion-message]")]
              .filter((message) => message.textContent.trim() === ${expectedMessageText});

            return {
              articleText: article?.innerText || "",
              completionRequests: window.__prestigeBookingCompletionRequests || [],
              fetchCalls: window.__prestigeFetchCalls || [],
              globalStatusText: document.querySelector("[data-status-panel='global']")?.textContent.trim() || "",
              localMessageCount: matchingMessages.length,
              localMessageText: statusMessage?.textContent.trim() || "",
              messageIsInStatusControls: Boolean(statusControls?.contains(statusMessage)),
              unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
            };
          })()`);

          return candidateState?.localMessageText === expectedMessage &&
            candidateState?.articleText?.includes(expectedStatusLabel)
            ? candidateState
            : false;
        },
        10000,
        description,
      );
    };

    const exerciseDashboardStatusAction = async ({
      dataAttribute,
      description,
      expectedMessage,
      expectedStatus,
      expectedStatusLabel,
      fixture,
    }) => {
      await evaluate(`(() => {
        window.__prestigeFetchCalls = [];
        window.__prestigeBookingCompletionRequests = [];
        window.__prestigeUnhandledSupabaseCalls = [];
      })()`);

      const clickedStatusButton = await clickDashboardStatusAction(fixture, dataAttribute);
      assert.equal(clickedStatusButton, true, `Expected ${description} button to be clickable`);

      const statusState = await waitForDashboardStatusState(
        fixture,
        expectedMessage,
        expectedStatusLabel,
        description,
      );

      assert.deepEqual(
        statusState.unhandledSupabaseCalls,
        [],
        `Expected ${description} Supabase calls to be mocked, got ${statusState.unhandledSupabaseCalls.join(", ")}`,
      );
      const statusBookingPatches = bookingPatchCalls(statusState.fetchCalls);
      assert.equal(
        statusBookingPatches.length,
        1,
        `Expected ${description} to make one mocked booking PATCH, got ${statusState.fetchCalls.join(", ")}`,
      );
      assert.match(
        statusBookingPatches[0],
        new RegExp(`^PATCH .*\\/rest\\/v1\\/bookings.*id=eq\\.${fixture.id}`),
      );
      assert.ok(
        statusState.fetchCalls.every((call) => !call.includes("/rest/v1/drivers")),
        `Expected ${description} not to modify driver profiles, got ${statusState.fetchCalls.join(", ")}`,
      );
      assert.equal(statusState.completionRequests.length, 1);
      assert.match(
        statusState.completionRequests[0]?.url || "",
        new RegExp(`\\/rest\\/v1\\/bookings.*id=eq\\.${fixture.id}`),
      );
      assert.deepEqual(
        Object.keys(statusState.completionRequests[0]?.body || {}).sort(),
        ["status", "updated_at"],
      );
      assert.equal(statusState.completionRequests[0]?.body?.status, expectedStatus);
      assert.match(statusState.completionRequests[0]?.body?.updated_at || "", /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(statusState.localMessageCount, 1);
      assert.equal(
        statusState.messageIsInStatusControls,
        true,
        `Expected ${description} feedback to appear inside the local Dashboard status controls`,
      );
      assert.notEqual(
        statusState.globalStatusText,
        expectedMessage,
        `Expected ${description} feedback not to duplicate in the global status panel`,
      );

      return statusState;
    };

    const markedOtwState = await exerciseDashboardStatusAction({
      dataAttribute: "data-dashboard-mark-otw",
      description: "Dashboard Mark OTW",
      expectedMessage: "Driver marked OTW.",
      expectedStatus: "driver_otw",
      expectedStatusLabel: "Driver OTW",
      fixture: dashboardStatusFlowFixture,
    });
    assert.match(markedOtwState.articleText, /Driver:\s*DASHBOARD STATUS FLOW DRIVER/);
    assert.match(markedOtwState.articleText, /Route:\s*Changi Airport T1\s+\S\s+Ritz Carlton Singapore/);
    assert.match(markedOtwState.articleText, /Customer \$120 \/ Driver \$82/);

    await exerciseDashboardStatusAction({
      dataAttribute: "data-dashboard-mark-pob",
      description: "Dashboard Mark POB",
      expectedMessage: "Passenger on board.",
      expectedStatus: "pob",
      expectedStatusLabel: "POB",
      fixture: dashboardStatusFlowFixture,
    });

    await exerciseDashboardStatusAction({
      dataAttribute: "data-dashboard-mark-completed",
      description: "Dashboard POB Mark completed",
      expectedMessage: "Booking marked completed.",
      expectedStatus: "completed",
      expectedStatusLabel: "Completed",
      fixture: dashboardStatusFlowFixture,
    });

    await clickTab("Completed", "Completed Bookings");

    const hiddenPersistedCompletedTestState = await evaluate(`(() => {
      return [...document.querySelectorAll("article")].map((article) => article.innerText);
    })()`);
    assert.equal(
      hiddenPersistedCompletedTestState.some(
        (articleText) =>
          articleText.includes("SUCCESS TEST TRAVELER") ||
          articleText.includes("SUCCESS TEST BOOKER"),
      ),
      false,
      "Expected persisted completed browser-test fixture records to be isolated from Completed Bookings",
    );

    const completedStatusFlowTabState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const completedArticle = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD STATUS FLOW TRAVELER") &&
              candidate.innerText.includes("SQ780"),
          );

          return completedArticle
            ? {
                articleText: completedArticle.innerText,
                hasUndoButton: Boolean(
                  completedArticle.querySelector("[data-completed-undo-booking='${dashboardStatusFlowFixture.id}']"),
                ),
              }
            : false;
        })()`),
      10000,
      "Dashboard status flow completed booking in Completed tab",
    );
    assert.match(completedStatusFlowTabState.articleText, /Completed/i);
    assert.match(completedStatusFlowTabState.articleText, /DASHBOARD STATUS FLOW COMPANY/);
    assert.equal(
      completedStatusFlowTabState.hasUndoButton,
      true,
      "Expected Dashboard status completed booking to offer Undo completed in Completed tab",
    );

    await clickTab("Dashboard", "Operations Dashboard");

    await exerciseDashboardStatusAction({
      dataAttribute: "data-dashboard-revert-status",
      description: "Dashboard Revert OTW with driver",
      expectedMessage: "Status reverted.",
      expectedStatus: "assigned",
      expectedStatusLabel: "Assigned",
      fixture: dashboardOtwRevertAssignedFixture,
    });

    await exerciseDashboardStatusAction({
      dataAttribute: "data-dashboard-revert-status",
      description: "Dashboard Revert OTW without driver",
      expectedMessage: "Status reverted.",
      expectedStatus: "confirmed",
      expectedStatusLabel: "Confirmed",
      fixture: dashboardOtwRevertConfirmedFixture,
    });

    await exerciseDashboardStatusAction({
      dataAttribute: "data-dashboard-revert-status",
      description: "Dashboard Revert POB",
      expectedMessage: "Status reverted.",
      expectedStatus: "driver_otw",
      expectedStatusLabel: "Driver OTW",
      fixture: dashboardPobRevertFixture,
    });

    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeBookingCompletionRequests = [];
      window.__prestigeUnhandledSupabaseCalls = [];
    })()`);

    const clickedDashboardMarkCompleted = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("COMPLETION ACTION TEST TRAVELER") &&
          candidate.innerText.includes("SQ779"),
      );
      const markButton = article?.querySelector("[data-dashboard-mark-completed='${dashboardCompletionActionFixture.id}']");

      if (!markButton || markButton.disabled) {
        return false;
      }

      markButton.click();
      return true;
    })()`);
    assert.equal(clickedDashboardMarkCompleted, true, "Expected Dashboard Mark completed button to be clickable");

    const dashboardCompletionState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("COMPLETION ACTION TEST TRAVELER") &&
              candidate.innerText.includes("SQ779"),
          );
          const completionMessage = article?.querySelector("[data-booking-completion-message='${dashboardCompletionActionFixture.id}']");
          const loadButton = article?.querySelector("[data-dashboard-load-booking='true']");
          const messageRect = completionMessage?.getBoundingClientRect();
          const loadButtonRect = loadButton?.getBoundingClientRect();
          const localSuccessMessages = [...document.querySelectorAll("[data-booking-completion-message]")]
            .filter((message) => message.textContent.trim() === "Booking marked completed.");

          return {
            articleText: article?.innerText || "",
            completionRequests: window.__prestigeBookingCompletionRequests || [],
            fetchCalls: window.__prestigeFetchCalls || [],
            globalStatusText: document.querySelector("[data-status-panel='global']")?.textContent.trim() || "",
            hasAssignButton: Boolean(article?.querySelector("[data-dashboard-assign-driver='${dashboardCompletionActionFixture.id}']")),
            hasAssignmentPanel: Boolean(
              [...(article?.querySelectorAll("h4") || [])].find(
                (heading) => heading.textContent.trim() === "Assign driver to this booking",
              ),
            ),
            hasClearDriverButton: Boolean(article?.querySelector("[data-dashboard-clear-driver='${dashboardCompletionActionFixture.id}']")),
            hasCopyDriverDispatchButton: Boolean(article?.querySelector("[data-dashboard-copy-driver-dispatch='${dashboardCompletionActionFixture.id}']")),
            hasCopyJobCardButton: Boolean(article?.querySelector("[data-dashboard-copy-job-card='${dashboardCompletionActionFixture.id}']")),
            hasMarkButton: Boolean(article?.querySelector("[data-dashboard-mark-completed='${dashboardCompletionActionFixture.id}']")),
            localMessageDistance:
              loadButtonRect && messageRect ? Math.abs(messageRect.top - loadButtonRect.bottom) : null,
            localMessageText: completionMessage?.textContent.trim() || "",
            localSuccessMessageCount: localSuccessMessages.length,
            unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
          };
        })()`);

        return candidateState?.localMessageText === "Booking marked completed." &&
          candidateState?.articleText?.toLowerCase().includes("completed")
          ? candidateState
          : false;
      },
      10000,
      "dashboard mark completed success state",
    );

    assert.deepEqual(
      dashboardCompletionState.unhandledSupabaseCalls,
      [],
      `Expected mark completed Supabase calls to be mocked, got ${dashboardCompletionState.unhandledSupabaseCalls.join(", ")}`,
    );
    const dashboardCompletionBookingPatches = bookingPatchCalls(dashboardCompletionState.fetchCalls);
    assert.equal(
      dashboardCompletionBookingPatches.length,
      1,
      `Expected mark completed to make one mocked booking PATCH, got ${dashboardCompletionState.fetchCalls.join(", ")}`,
    );
    assert.match(
      dashboardCompletionBookingPatches[0],
      new RegExp(`^PATCH .*\\/rest\\/v1\\/bookings.*id=eq\\.${dashboardCompletionActionFixture.id}`),
    );
    assert.equal(dashboardCompletionState.completionRequests.length, 1);
    assert.match(
      dashboardCompletionState.completionRequests[0]?.url || "",
      new RegExp(`\\/rest\\/v1\\/bookings.*id=eq\\.${dashboardCompletionActionFixture.id}`),
    );
    assert.deepEqual(
      Object.keys(dashboardCompletionState.completionRequests[0]?.body || {}).sort(),
      ["status", "updated_at"],
    );
    assert.equal(dashboardCompletionState.completionRequests[0]?.body?.status, "completed");
    assert.match(dashboardCompletionState.completionRequests[0]?.body?.updated_at || "", /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(dashboardCompletionState.localSuccessMessageCount, 1);
    assert.notEqual(
      dashboardCompletionState.globalStatusText,
      "Booking marked completed.",
      "Expected Mark completed feedback not to duplicate in the global status panel",
    );
    assert.equal(dashboardCompletionState.hasMarkButton, false);
    assert.equal(
      dashboardCompletionState.hasAssignmentPanel,
      false,
      "Expected completed Dashboard card not to show assignment controls",
    );
    assert.equal(
      dashboardCompletionState.hasAssignButton,
      false,
      "Expected completed Dashboard card not to offer Assign to this booking",
    );
    assert.equal(
      dashboardCompletionState.hasClearDriverButton,
      false,
      "Expected completed Dashboard card not to offer Clear assigned driver",
    );
    assert.equal(
      dashboardCompletionState.hasCopyDriverDispatchButton,
      false,
      "Expected completed Dashboard card not to offer Driver Dispatch copy",
    );
    assert.equal(
      dashboardCompletionState.hasCopyJobCardButton,
      false,
      "Expected completed Dashboard card not to offer WhatsApp Job Card copy",
    );
    assert.match(dashboardCompletionState.articleText, /Driver:\s*COMPLETION ACTION DRIVER/);
    assert.match(dashboardCompletionState.articleText, /Route:\s*Changi Airport T3\s+\S\s+Capella Singapore/);
    assert.match(dashboardCompletionState.articleText, /Customer \$115 \/ Driver \$80/);
    assert.ok(
      dashboardCompletionState.localMessageDistance !== null &&
        dashboardCompletionState.localMessageDistance <= 120,
      `Expected Mark completed status near booking controls, got ${dashboardCompletionState.localMessageDistance}px`,
    );

    await clickTab("Completed", "Completed Bookings");

    const markedCompletedTabState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const completedArticle = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("COMPLETION ACTION TEST TRAVELER") &&
              candidate.innerText.includes("SQ779"),
          );

          return completedArticle
            ? {
                articleText: completedArticle.innerText,
                hasMarkCompletedSuccessMessage: Boolean(
                  completedArticle.querySelector("[data-booking-completion-message='${dashboardCompletionActionFixture.id}']"),
                ),
                hasUndoButton: Boolean(
                  completedArticle.querySelector("[data-completed-undo-booking='${dashboardCompletionActionFixture.id}']"),
                ),
              }
            : false;
        })()`),
      10000,
      "marked completed booking in Completed tab",
    );

    assert.match(markedCompletedTabState.articleText, /Completed/i);
    assert.match(markedCompletedTabState.articleText, /COMPLETION ACTION TEST COMPANY/);
    assert.equal(
      markedCompletedTabState.hasMarkCompletedSuccessMessage,
      false,
      "Expected Mark completed success feedback not to move into the Completed tab card",
    );
    assert.equal(
      markedCompletedTabState.hasUndoButton,
      true,
      "Expected marked completed booking to offer Undo completed in Completed tab",
    );

    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeBookingCompletionRequests = [];
      window.__prestigeUnhandledSupabaseCalls = [];
    })()`);

    const clickedUndoAssignedCompletion = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("COMPLETED UNDO ASSIGNED TRAVELER") &&
          candidate.innerText.includes("SQ889"),
      );
      const undoButton = article?.querySelector("[data-completed-undo-booking='${completedUndoAssignedFixture.id}']");

      if (!undoButton || undoButton.disabled) {
        return false;
      }

      undoButton.click();
      return true;
    })()`);
    assert.equal(clickedUndoAssignedCompletion, true, "Expected Undo completed button with driver to be clickable");

    const undoAssignedCompletionState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const completedArticle = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("COMPLETED UNDO ASSIGNED TRAVELER") &&
              candidate.innerText.includes("SQ889"),
          );
          const completionMessage = document.querySelector("[data-booking-completion-message='${completedUndoAssignedFixture.id}']");
          const feedbackCard = document.querySelector("[data-completed-undo-feedback-card='${completedUndoAssignedFixture.id}']");
          const localUndoMessages = [...document.querySelectorAll("[data-booking-completion-message]")]
            .filter((message) => message.textContent.trim() === "Completion undone.");

          return {
            articleText: completedArticle?.innerText || "",
            completionRequests: window.__prestigeBookingCompletionRequests || [],
            feedbackCardText: feedbackCard?.textContent.trim() || "",
            fetchCalls: window.__prestigeFetchCalls || [],
            globalStatusText: document.querySelector("[data-status-panel='global']")?.textContent.trim() || "",
            localUndoMessageCount: localUndoMessages.length,
            messageText: completionMessage?.textContent.trim() || "",
            messageIsInFeedbackCard: Boolean(feedbackCard?.contains(completionMessage)),
            staleBookingTextVisible:
              document.body.innerText.includes("COMPLETED UNDO ASSIGNED TRAVELER") ||
              document.body.innerText.includes("SQ889"),
            unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
          };
        })()`);

        return candidateState?.messageText === "Completion undone." &&
          !candidateState?.articleText
          ? candidateState
          : false;
      },
      10000,
      "undo completed assigned success state",
    );

    assert.deepEqual(
      undoAssignedCompletionState.unhandledSupabaseCalls,
      [],
      `Expected undo completed assigned Supabase calls to be mocked, got ${undoAssignedCompletionState.unhandledSupabaseCalls.join(", ")}`,
    );
    const undoAssignedCompletionBookingPatches = bookingPatchCalls(undoAssignedCompletionState.fetchCalls);
    assert.equal(
      undoAssignedCompletionBookingPatches.length,
      1,
      `Expected undo completed assigned to make one mocked booking PATCH, got ${undoAssignedCompletionState.fetchCalls.join(", ")}`,
    );
    assert.match(
      undoAssignedCompletionBookingPatches[0],
      new RegExp(`^PATCH .*\\/rest\\/v1\\/bookings.*id=eq\\.${completedUndoAssignedFixture.id}`),
    );
    assert.equal(undoAssignedCompletionState.completionRequests.length, 1);
    assert.deepEqual(
      Object.keys(undoAssignedCompletionState.completionRequests[0]?.body || {}).sort(),
      ["status", "updated_at"],
    );
    assert.equal(undoAssignedCompletionState.completionRequests[0]?.body?.status, "assigned");
    assert.match(undoAssignedCompletionState.completionRequests[0]?.body?.updated_at || "", /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(undoAssignedCompletionState.localUndoMessageCount, 1);
    assert.equal(
      undoAssignedCompletionState.messageIsInFeedbackCard,
      true,
      "Expected undo completion feedback to remain in the local completed booking action area",
    );
    assert.equal(
      undoAssignedCompletionState.staleBookingTextVisible,
      false,
      "Expected undone assigned booking details to be removed from the Completed tab",
    );
    assert.doesNotMatch(
      undoAssignedCompletionState.feedbackCardText,
      /COMPLETED UNDO ASSIGNED TRAVELER|SQ889/,
      "Expected assigned undo feedback not to render stale completed booking details",
    );
    assert.notEqual(
      undoAssignedCompletionState.globalStatusText,
      "Completion undone.",
      "Expected Undo completed feedback not to duplicate in the global status panel",
    );

    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeBookingCompletionRequests = [];
      window.__prestigeUnhandledSupabaseCalls = [];
    })()`);

    const clickedUndoConfirmedCompletion = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("COMPLETED UNDO CONFIRMED TRAVELER") &&
          candidate.innerText.includes("SQ890"),
      );
      const undoButton = article?.querySelector("[data-completed-undo-booking='${completedUndoConfirmedFixture.id}']");

      if (!undoButton || undoButton.disabled) {
        return false;
      }

      undoButton.click();
      return true;
    })()`);
    assert.equal(clickedUndoConfirmedCompletion, true, "Expected Undo completed button without driver to be clickable");

    const undoConfirmedCompletionState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const completedArticle = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("COMPLETED UNDO CONFIRMED TRAVELER") &&
              candidate.innerText.includes("SQ890"),
          );
          const completionMessage = document.querySelector("[data-booking-completion-message='${completedUndoConfirmedFixture.id}']");
          const feedbackCard = document.querySelector("[data-completed-undo-feedback-card='${completedUndoConfirmedFixture.id}']");
          const localUndoMessages = [...document.querySelectorAll("[data-booking-completion-message]")]
            .filter((message) => message.textContent.trim() === "Completion undone.");

          return {
            articleText: completedArticle?.innerText || "",
            completionRequests: window.__prestigeBookingCompletionRequests || [],
            feedbackCardText: feedbackCard?.textContent.trim() || "",
            fetchCalls: window.__prestigeFetchCalls || [],
            globalStatusText: document.querySelector("[data-status-panel='global']")?.textContent.trim() || "",
            localUndoMessageCount: localUndoMessages.length,
            messageText: completionMessage?.textContent.trim() || "",
            messageIsInFeedbackCard: Boolean(feedbackCard?.contains(completionMessage)),
            staleBookingTextVisible:
              document.body.innerText.includes("COMPLETED UNDO CONFIRMED TRAVELER") ||
              document.body.innerText.includes("SQ890"),
            unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
          };
        })()`);

        return candidateState?.messageText === "Completion undone." &&
          !candidateState?.articleText
          ? candidateState
          : false;
      },
      10000,
      "undo completed confirmed success state",
    );

    assert.deepEqual(
      undoConfirmedCompletionState.unhandledSupabaseCalls,
      [],
      `Expected undo completed confirmed Supabase calls to be mocked, got ${undoConfirmedCompletionState.unhandledSupabaseCalls.join(", ")}`,
    );
    const undoConfirmedCompletionBookingPatches = bookingPatchCalls(undoConfirmedCompletionState.fetchCalls);
    assert.equal(
      undoConfirmedCompletionBookingPatches.length,
      1,
      `Expected undo completed confirmed to make one mocked booking PATCH, got ${undoConfirmedCompletionState.fetchCalls.join(", ")}`,
    );
    assert.match(
      undoConfirmedCompletionBookingPatches[0],
      new RegExp(`^PATCH .*\\/rest\\/v1\\/bookings.*id=eq\\.${completedUndoConfirmedFixture.id}`),
    );
    assert.equal(undoConfirmedCompletionState.completionRequests.length, 1);
    assert.deepEqual(
      Object.keys(undoConfirmedCompletionState.completionRequests[0]?.body || {}).sort(),
      ["status", "updated_at"],
    );
    assert.equal(undoConfirmedCompletionState.completionRequests[0]?.body?.status, "confirmed");
    assert.match(undoConfirmedCompletionState.completionRequests[0]?.body?.updated_at || "", /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(undoConfirmedCompletionState.localUndoMessageCount, 1);
    assert.equal(
      undoConfirmedCompletionState.messageIsInFeedbackCard,
      true,
      "Expected undo completion feedback without driver to remain in the local completed booking action area",
    );
    assert.equal(
      undoConfirmedCompletionState.staleBookingTextVisible,
      false,
      "Expected undone confirmed booking details to be removed from the Completed tab",
    );
    assert.doesNotMatch(
      undoConfirmedCompletionState.feedbackCardText,
      /COMPLETED UNDO CONFIRMED TRAVELER|SQ890/,
      "Expected confirmed undo feedback not to render stale completed booking details",
    );
    assert.notEqual(
      undoConfirmedCompletionState.globalStatusText,
      "Completion undone.",
      "Expected Undo completed feedback without driver not to duplicate in the global status panel",
    );

    await clickTab("Drivers", "Driver Database");

    await evaluate(`(() => {
      const savedDriver = ${JSON.stringify(reusableDriverProfileFixture)};
      window.__prestigeSavedDriver = savedDriver;
      const jsonResponse = (body, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });
      const persistDriverBody = (bodyText) => {
        if (!bodyText) {
          return;
        }

        try {
          const parsed = JSON.parse(bodyText);
          window.__prestigeSavedDriver = {
            ...(window.__prestigeSavedDriver || savedDriver),
            ...parsed,
            id: (window.__prestigeSavedDriver || savedDriver).id,
          };
        } catch {}
      };

      window.__prestigeFetchCalls = [];
      window.__prestigeDriverProfileRequestBodies = [];
      window.__prestigeUnhandledSupabaseCalls = [];
      window.__prestigeOriginalFetch = window.__prestigeOriginalFetch || window.fetch.bind(window);
      window.fetch = async (...args) => {
        const target = args[0]?.url || args[0];
        const url = String(target);
        const method = args[1]?.method || args[0]?.method || "GET";
        const bodyText = typeof args[1]?.body === "string" ? args[1].body : "";

        window.__prestigeFetchCalls.push(\`\${method} \${url}\`);
        if (bodyText) {
          try {
            window.__prestigeDriverProfileRequestBodies.push({
              method,
              url,
              body: JSON.parse(bodyText),
            });
          } catch {
            window.__prestigeDriverProfileRequestBodies.push({ method, url, body: bodyText });
          }
        }

        if (!url.includes("/rest/v1/")) {
          return window.__prestigeOriginalFetch(...args);
        }

        if (url.includes("/rest/v1/drivers")) {
          if (method === "GET" && url.includes("driver_name=ilike")) {
            return jsonResponse(null);
          }

          if (method === "GET") {
            return jsonResponse([window.__prestigeSavedDriver || savedDriver]);
          }

          if (method === "POST") {
            persistDriverBody(bodyText);
            return jsonResponse([], 201);
          }

          if (method === "PATCH") {
            persistDriverBody(bodyText);
            return jsonResponse([]);
          }
        }

        window.__prestigeUnhandledSupabaseCalls.push(\`\${method} \${url}\`);
        return jsonResponse({ message: "Unhandled Supabase mock" }, 500);
      };
    })()`);

    const clickedSaveDriverProfile = await evaluate(`(() => {
      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const labels = [...document.querySelectorAll("label")];
      const fieldForLabel = (labelText) => {
        const label = labels.find(
          (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
        );
        return label?.querySelector("input, select, textarea") || null;
      };
      const setValue = (control, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(control.constructor.prototype, "value");
        descriptor?.set?.call(control, value);
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const driverName = fieldForLabel("Driver name");
      const contactNumber = fieldForLabel("Contact number");
      const vehicleType = fieldForLabel("Vehicle type");
      const plateNumber = fieldForLabel("Plate number");
      const availability = fieldForLabel("Availability");
      const preferredAreas = fieldForLabel("Preferred areas");
      const payoutPreferences = fieldForLabel("Payout preferences");
      const airportPermitNotes = fieldForLabel("Airport permit notes");
      const driverNotes = fieldForLabel("Driver notes");
      const mngPayout = fieldForLabel("MNG payout");
      const depPayout = fieldForLabel("DEP payout");
      const trfPayout = fieldForLabel("TRF payout");
      const dspPayout = fieldForLabel("DSP payout");
      const saveButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Save Driver Profile",
      );

      if (
        !driverName ||
        !contactNumber ||
        !vehicleType ||
        !plateNumber ||
        !availability ||
        !preferredAreas ||
        !payoutPreferences ||
        !airportPermitNotes ||
        !driverNotes ||
        !mngPayout ||
        !depPayout ||
        !trfPayout ||
        !dspPayout ||
        !saveButton ||
        saveButton.disabled
      ) {
        return false;
      }

      setValue(driverName, "REUSABLE PROFILE TEST DRIVER");
      setValue(contactNumber, "+65 8111 2222");
      setValue(vehicleType, "Alphard");
      setValue(plateNumber, "SLL901P");
      setValue(availability, "busy");
      setValue(preferredAreas, "Changi, Marina Bay");
      setValue(payoutPreferences, "Prefers airport and CBD jobs");
      setValue(airportPermitNotes, "Has Changi permit");
      setValue(driverNotes, "Reusable profile save test note");
      setValue(mngPayout, "76");
      setValue(depPayout, "66");
      setValue(trfPayout, "58");
      setValue(dspPayout, "52");
      saveButton.click();
      return true;
    })()`);
    assert.equal(clickedSaveDriverProfile, true, "Expected Save Driver Profile button to be clickable");

    const driverProfileSaveState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const labels = [...document.querySelectorAll("label")];
          const fieldValue = (labelText) => {
            const label = labels.find(
              (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
            );
            const control = label?.querySelector("input, select, textarea");

            if (!control) {
              return "";
            }

            if (control.tagName === "SELECT") {
              return control.options[control.selectedIndex]?.textContent.trim() || control.value || "";
            }

            return control.value || "";
          };
          const saveButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "Save Driver Profile",
          );
          const statusPanel = document.querySelector("[data-status-panel='global']");
          const driverButton = [...document.querySelectorAll("button")].find(
            (button) =>
              button.innerText.includes("REUSABLE PROFILE TEST DRIVER") &&
              button.innerText.includes("SLL901P"),
          );
          const saveButtonRect = saveButton?.getBoundingClientRect();
          const statusRect = statusPanel?.getBoundingClientRect();
          const saveRequest = (window.__prestigeDriverProfileRequestBodies || []).find(
            (entry) => entry.method === "POST" && String(entry.url).includes("/rest/v1/drivers"),
          );

          return {
            bodyText: document.body.innerText,
            driverButtonText: driverButton?.innerText || "",
            fetchCalls: window.__prestigeFetchCalls || [],
            requestBodies: window.__prestigeDriverProfileRequestBodies || [],
            saveRequest: saveRequest?.body || null,
            statusText: statusPanel?.textContent.trim() || "",
            statusDistanceFromSaveButton:
              saveButtonRect && statusRect ? Math.abs(statusRect.top - saveButtonRect.bottom) : null,
            unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
            fields: {
              driverName: fieldValue("Driver name"),
              contactNumber: fieldValue("Contact number"),
              vehicleType: fieldValue("Vehicle type"),
              plateNumber: fieldValue("Plate number"),
            },
          };
        })()`);

        return candidateState?.statusText === "Driver profile saved." &&
          candidateState?.driverButtonText?.includes("REUSABLE PROFILE TEST DRIVER")
          ? candidateState
          : false;
      },
      10000,
      "mock reusable driver profile save",
    );

    assert.deepEqual(
      driverProfileSaveState.unhandledSupabaseCalls,
      [],
      `Expected all driver profile Supabase calls to be mocked, got ${driverProfileSaveState.unhandledSupabaseCalls.join(", ")}`,
    );
    assert.ok(
      driverProfileSaveState.fetchCalls.every((call) => call.includes("/rest/v1/drivers")),
      `Expected driver profile save to call only mocked drivers REST endpoints, got ${driverProfileSaveState.fetchCalls.join(", ")}`,
    );
    assert.ok(
      driverProfileSaveState.fetchCalls.every((call) => !call.includes("/rest/v1/bookings")),
      `Expected driver profile save not to update bookings, got ${driverProfileSaveState.fetchCalls.join(", ")}`,
    );
    assert.match(driverProfileSaveState.driverButtonText, /busy/);
    assert.match(driverProfileSaveState.driverButtonText, /Plate:\s*SLL901P/);
    assert.ok(
      driverProfileSaveState.statusDistanceFromSaveButton !== null &&
        driverProfileSaveState.statusDistanceFromSaveButton <= 120,
      `Expected Driver profile saved status near Save Driver Profile button, got ${driverProfileSaveState.statusDistanceFromSaveButton}px`,
    );
    assert.equal(driverProfileSaveState.saveRequest?.driver_name, "REUSABLE PROFILE TEST DRIVER");
    assert.equal(driverProfileSaveState.saveRequest?.contact_number, "+65 8111 2222");
    assert.equal(driverProfileSaveState.saveRequest?.vehicle_type, "Alphard");
    assert.equal(driverProfileSaveState.saveRequest?.plate_number, "SLL901P");
    assert.equal(driverProfileSaveState.saveRequest?.availability_status, "busy");
    assert.equal(driverProfileSaveState.saveRequest?.preferred_areas, "Changi, Marina Bay");
    assert.equal(driverProfileSaveState.saveRequest?.payout_preferences, "Prefers airport and CBD jobs");
    assert.equal(driverProfileSaveState.saveRequest?.airport_permit_notes, "Has Changi permit");
    assert.equal(driverProfileSaveState.saveRequest?.notes, "Reusable profile save test note");
    assert.equal(driverProfileSaveState.saveRequest?.driver_payout_rules?.MNG?.min, 76);
    assert.equal(driverProfileSaveState.saveRequest?.driver_payout_rules?.MNG?.max, 76);
    assert.equal(driverProfileSaveState.saveRequest?.driver_payout_rules?.DEP?.min, 66);
    assert.equal(driverProfileSaveState.saveRequest?.driver_payout_rules?.DEP?.max, 66);
    assert.equal(driverProfileSaveState.saveRequest?.driver_payout_rules?.TRF?.min, 58);
    assert.equal(driverProfileSaveState.saveRequest?.driver_payout_rules?.TRF?.max, 58);
    assert.equal(driverProfileSaveState.saveRequest?.driver_payout_rules?.DSP?.amount, 52);
    assert.equal(driverProfileSaveState.saveRequest?.driver_payout_rules?.DSP?.perHour, true);
    assert.equal(driverProfileSaveState.fields.driverName, "");
    assert.equal(driverProfileSaveState.fields.contactNumber, "");
    assert.equal(driverProfileSaveState.fields.vehicleType, "");
    assert.equal(driverProfileSaveState.fields.plateNumber, "");

    const clickedSavedDriverProfile = await evaluate(`(() => {
      const driverButton = [...document.querySelectorAll("button")].find(
        (button) =>
          button.innerText.includes("REUSABLE PROFILE TEST DRIVER") &&
          button.innerText.includes("SLL901P"),
      );

      if (!driverButton || driverButton.disabled) {
        return false;
      }

      driverButton.click();
      return true;
    })()`);
    assert.equal(clickedSavedDriverProfile, true, "Expected saved driver profile to be selectable");

    const selectedDriverProfileState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const labels = [...document.querySelectorAll("label")];
          const fieldValue = (labelText) => {
            const label = labels.find(
              (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
            );
            const control = label?.querySelector("input, select, textarea");

            if (!control) {
              return "";
            }

            if (control.tagName === "SELECT") {
              return control.options[control.selectedIndex]?.textContent.trim() || control.value || "";
            }

            return control.value || "";
          };

          return {
            fields: {
              driverName: fieldValue("Driver name"),
              contactNumber: fieldValue("Contact number"),
              vehicleType: fieldValue("Vehicle type"),
              plateNumber: fieldValue("Plate number"),
              availability: fieldValue("Availability"),
              preferredAreas: fieldValue("Preferred areas"),
              payoutPreferences: fieldValue("Payout preferences"),
              airportPermitNotes: fieldValue("Airport permit notes"),
              driverNotes: fieldValue("Driver notes"),
              mngPayout: fieldValue("MNG payout"),
              depPayout: fieldValue("DEP payout"),
              trfPayout: fieldValue("TRF payout"),
              dspPayout: fieldValue("DSP payout"),
            },
          };
        })()`);

        return candidateState?.fields?.driverName === "REUSABLE PROFILE TEST DRIVER"
          ? candidateState
          : false;
      },
      10000,
      "saved driver profile reloads form",
    );

    assert.equal(selectedDriverProfileState.fields.contactNumber, "+65 8111 2222");
    assert.equal(selectedDriverProfileState.fields.vehicleType, "Alphard");
    assert.equal(selectedDriverProfileState.fields.plateNumber, "SLL901P");
    assert.equal(selectedDriverProfileState.fields.availability, "Busy");
    assert.equal(selectedDriverProfileState.fields.preferredAreas, "Changi, Marina Bay");
    assert.equal(selectedDriverProfileState.fields.payoutPreferences, "Prefers airport and CBD jobs");
    assert.equal(selectedDriverProfileState.fields.airportPermitNotes, "Has Changi permit");
    assert.equal(selectedDriverProfileState.fields.driverNotes, "Reusable profile save test note");
    assert.equal(selectedDriverProfileState.fields.mngPayout, "76");
    assert.equal(selectedDriverProfileState.fields.depPayout, "66");
    assert.equal(selectedDriverProfileState.fields.trfPayout, "58");
    assert.equal(selectedDriverProfileState.fields.dspPayout, "52");

    await clickTab("Dashboard", "Operations Dashboard");
    await evaluate(`(() => {
      window.__prestigeProfilePayoutPreviousFetch = window.fetch;
      window.__prestigeFetchCalls = [];
      window.__prestigeDashboardProfilePayoutAssignmentBodies = [];
      window.__prestigeUnhandledSupabaseCalls = [];
      window.__prestigeCopiedTexts = [];
      const jsonResponse = (body, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });

      window.fetch = async (...args) => {
        const target = args[0]?.url || args[0];
        const url = String(target);
        const method = args[1]?.method || args[0]?.method || "GET";
        const bodyText = typeof args[1]?.body === "string" ? args[1].body : "";

        window.__prestigeFetchCalls.push(\`\${method} \${url}\`);

        if (
          method === "PATCH" &&
          url.includes("/rest/v1/bookings") &&
          url.includes("id=eq.${dashboardProfilePayoutAssignmentFixture.id}")
        ) {
          let parsedBody = bodyText;

          try {
            parsedBody = JSON.parse(bodyText);
          } catch {}

          window.__prestigeDashboardProfilePayoutAssignmentBodies.push(parsedBody);

          return jsonResponse([]);
        }

        if (url.includes("/rest/v1/")) {
          window.__prestigeUnhandledSupabaseCalls.push(\`\${method} \${url}\`);
          return jsonResponse({ message: "Unhandled Supabase mock" }, 500);
        }

        return window.__prestigeProfilePayoutPreviousFetch(...args);
      };
    })()`);

    const clickedProfilePayoutAssignment = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
          candidate.innerText.includes("SQ776"),
      );

      if (!article) {
        return false;
      }

      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const fieldForLabel = (labelText) => {
        const label = [...article.querySelectorAll("label")].find(
          (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
        );
        return label?.querySelector("input, select, textarea") || null;
      };
      const setValue = (control, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(control.constructor.prototype, "value");
        descriptor?.set?.call(control, value);
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      };

      const driverSelect = fieldForLabel("Driver");
      const payoutOverride = fieldForLabel("Override Payout");
      const includePayout = [...article.querySelectorAll("label")].find((candidate) =>
        candidate.innerText.includes("Include payout")
      )?.querySelector("input[type='checkbox']");
      const assignButton = article.querySelector("[data-dashboard-assign-driver='${dashboardProfilePayoutAssignmentFixture.id}']");

      if (!driverSelect || !payoutOverride || !includePayout || !assignButton || assignButton.disabled) {
        return false;
      }

      setValue(driverSelect, String(${reusableDriverProfileFixture.id}));
      setValue(payoutOverride, "");

      if (!includePayout.checked) {
        includePayout.click();
      }

      assignButton.click();
      return true;
    })()`);
    assert.equal(
      clickedProfilePayoutAssignment,
      true,
      "Expected dashboard profile payout assignment button to be clickable",
    );

    const profilePayoutAssignmentState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
              candidate.innerText.includes("SQ776"),
          );
          const assignmentMessage = article?.querySelector("[data-driver-assignment-message='${dashboardProfilePayoutAssignmentFixture.id}']");
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const reasonLabel = [...(article?.querySelectorAll("label") || [])].find(
            (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === "Override Reason",
          );
          const reasonInput = reasonLabel?.querySelector("input");

          return {
            articleText: article?.innerText || "",
            assignmentBodies: window.__prestigeDashboardProfilePayoutAssignmentBodies || [],
            fetchCalls: window.__prestigeFetchCalls || [],
            localMessageText: assignmentMessage?.textContent.trim() || "",
            reasonPlaceholder: reasonInput?.getAttribute("placeholder") || "",
            reasonValue: reasonInput?.value || "",
            unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
          };
        })()`);

        return candidateState?.localMessageText === "Assigned driver updated." &&
          candidateState?.articleText?.includes("Driver: REUSABLE PROFILE TEST DRIVER") &&
          candidateState?.articleText?.includes("Customer $95 / Driver $66")
          ? candidateState
          : false;
      },
      10000,
      "dashboard profile payout assignment success state",
    );

    assert.deepEqual(
      profilePayoutAssignmentState.unhandledSupabaseCalls,
      [],
      `Expected profile payout assignment Supabase calls to be mocked, got ${profilePayoutAssignmentState.unhandledSupabaseCalls.join(", ")}`,
    );
    const profilePayoutAssignmentBookingPatches = bookingPatchCalls(profilePayoutAssignmentState.fetchCalls);
    assert.equal(
      profilePayoutAssignmentBookingPatches.length,
      1,
      `Expected profile payout assignment to make one mocked booking PATCH, got ${profilePayoutAssignmentState.fetchCalls.join(", ")}`,
    );
    assert.equal(profilePayoutAssignmentState.assignmentBodies.length, 1);
    assert.equal(profilePayoutAssignmentState.assignmentBodies[0]?.driver_id, reusableDriverProfileFixture.id);
    assert.equal(profilePayoutAssignmentState.assignmentBodies[0]?.driver_name, "REUSABLE PROFILE TEST DRIVER");
    assert.equal(profilePayoutAssignmentState.assignmentBodies[0]?.driver_contact, "+65 8111 2222");
    assert.equal(profilePayoutAssignmentState.assignmentBodies[0]?.driver_plate_number, "SLL901P");
    assert.equal(profilePayoutAssignmentState.assignmentBodies[0]?.driver_payout_amount, 66);
    assert.equal(profilePayoutAssignmentState.assignmentBodies[0]?.driver_payout_min, 66);
    assert.equal(profilePayoutAssignmentState.assignmentBodies[0]?.driver_payout_max, 66);
    assert.equal(profilePayoutAssignmentState.assignmentBodies[0]?.driver_payout_unit, "job");
    assert.equal(profilePayoutAssignmentState.assignmentBodies[0]?.driver_payout_override, null);
    assert.equal(profilePayoutAssignmentState.assignmentBodies[0]?.driver_payout_reason, null);
    assert.equal(profilePayoutAssignmentState.assignmentBodies[0]?.driver_dispatch_include_payout, true);
    assert.equal(profilePayoutAssignmentState.reasonValue, "");
    assert.equal(profilePayoutAssignmentState.reasonPlaceholder, "");
    assert.match(profilePayoutAssignmentState.articleText, /Customer \$95 \/ Driver \$66/);
    assert.doesNotMatch(
      profilePayoutAssignmentState.articleText,
      /Driver \$55/,
      "Expected Dashboard card not to keep stale old driver payout after profile assignment",
    );

    const clickedProfilePayoutDriverDispatchCopy = await evaluate(`(() => {
      window.__prestigeCopiedTexts = [];
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
          candidate.innerText.includes("SQ776"),
      );
      const copyButton = article?.querySelector("[data-dashboard-copy-driver-dispatch='${dashboardProfilePayoutAssignmentFixture.id}']");

      if (!copyButton || copyButton.disabled) {
        return false;
      }

      copyButton.click();
      return true;
    })()`);
    assert.equal(
      clickedProfilePayoutDriverDispatchCopy,
      true,
      "Expected profile payout Driver Dispatch copy button to be clickable",
    );

    const profilePayoutDriverDispatchCopyState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
              candidate.innerText.includes("SQ776"),
          );
          const feedback = article?.querySelector("[data-dashboard-copy-feedback='${dashboardProfilePayoutAssignmentFixture.id}:driverDispatch']");

          return feedback?.textContent.trim() === "Driver dispatch copied."
            ? {
                copiedText: (window.__prestigeCopiedTexts || []).slice(-1)[0] || "",
                feedbackText: feedback.textContent.trim(),
              }
            : false;
        })()`),
      10000,
      "profile payout Driver Dispatch copy",
    );
    assert.equal(profilePayoutDriverDispatchCopyState.feedbackText, "Driver dispatch copied.");
    assert.match(profilePayoutDriverDispatchCopyState.copiedText, /Payout: \$66/);
    assert.doesNotMatch(
      profilePayoutDriverDispatchCopyState.copiedText,
      /Payout: \$55/,
      "Expected Driver Dispatch copy not to keep stale old driver payout after profile assignment",
    );

    await clickTab("Bookings", "Recent Bookings");
    const profilePayoutBookingsCardState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
              candidate.innerText.includes("SQ776"),
          );

          return article?.innerText.includes("Customer $95 / Driver $66")
            ? { articleText: article.innerText }
            : false;
        })()`),
      10000,
      "profile payout Bookings card",
    );
    assert.match(profilePayoutBookingsCardState.articleText, /Customer \$95 \/ Driver \$66/);
    assert.doesNotMatch(
      profilePayoutBookingsCardState.articleText,
      /Driver \$55/,
      "Expected Bookings card not to keep stale old driver payout after profile assignment",
    );

    const clickedProfilePayoutLoadBooking = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
          candidate.innerText.includes("SQ776"),
      );
      const loadButton = [...(article?.querySelectorAll("button") || [])].find(
        (button) => button.textContent.trim() === "Load this booking",
      );

      if (!loadButton || loadButton.disabled) {
        return false;
      }

      loadButton.click();
      return true;
    })()`);
    assert.equal(
      clickedProfilePayoutLoadBooking,
      true,
      "Expected profile payout booking Load this booking button to be clickable",
    );

    const profilePayoutLoadedPricingState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        return candidateState?.fields?.flight === "SQ776" &&
          candidateState?.pricingPanel?.includes("$66.00")
          ? candidateState
          : false;
      },
      10000,
      "profile payout loaded Dispatch pricing",
    );
    assert.match(
      profilePayoutLoadedPricingState.pricingPanel,
      /Driver\s+\$66\.00/,
      "Expected loaded Dispatch Pricing to match assigned driver profile payout",
    );
    assert.doesNotMatch(
      profilePayoutLoadedPricingState.pricingPanel,
      /Driver\s+\$55\.00/,
      "Expected loaded Dispatch Pricing not to keep stale old driver payout after profile assignment",
    );
    assert.match(profilePayoutLoadedPricingState.driverDispatch, /Payout: \$66/);
    assert.doesNotMatch(profilePayoutLoadedPricingState.driverDispatch, /Payout: \$55/);

    const clickedRestoreDispatchClear = await evaluate(`(() => {
      const clearButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Clear",
      );

      if (!clearButton || clearButton.disabled) {
        return false;
      }

      clearButton.click();
      return true;
    })()`);
    assert.equal(clickedRestoreDispatchClear, true, "Expected Clear button to restore Dispatch draft after profile payout check");

    await setInputValue("textarea", bookingSample, "restored Dispatch booking message");

    const clickedRestoreDispatchParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Create Job Card",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(clickedRestoreDispatchParse, true, "Expected Create Job Card button to restore Dispatch draft");

    await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        return candidateState?.fields?.company === "BROWSER UI TEST COMPANY" &&
          candidateState?.fields?.flight === "SQ333" &&
          candidateState?.fields?.driverName === "TEST DRIVER CRM 20260516"
          ? candidateState
          : false;
      },
      10000,
      "restored Dispatch draft after profile payout check",
    );

    await evaluate(`(() => {
      if (window.__prestigeProfilePayoutPreviousFetch) {
        window.fetch = window.__prestigeProfilePayoutPreviousFetch;
      }
    })()`);
    await clickTab("Drivers", "Driver Database");

    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeDriverProfileRequestBodies = [];
      window.__prestigeUnhandledSupabaseCalls = [];
    })()`);

    const clickedRenamedDriverProfileSave = await evaluate(`(() => {
      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const labels = [...document.querySelectorAll("label")];
      const fieldForLabel = (labelText) => {
        const label = labels.find(
          (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
        );
        return label?.querySelector("input, select, textarea") || null;
      };
      const setValue = (control, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(control.constructor.prototype, "value");
        descriptor?.set?.call(control, value);
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const driverName = fieldForLabel("Driver name");
      const contactNumber = fieldForLabel("Contact number");
      const vehicleType = fieldForLabel("Vehicle type");
      const plateNumber = fieldForLabel("Plate number");
      const availability = fieldForLabel("Availability");
      const preferredAreas = fieldForLabel("Preferred areas");
      const payoutPreferences = fieldForLabel("Payout preferences");
      const airportPermitNotes = fieldForLabel("Airport permit notes");
      const driverNotes = fieldForLabel("Driver notes");
      const mngPayout = fieldForLabel("MNG payout");
      const depPayout = fieldForLabel("DEP payout");
      const trfPayout = fieldForLabel("TRF payout");
      const dspPayout = fieldForLabel("DSP payout");
      const saveButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Save Driver Profile",
      );

      if (
        !driverName ||
        !contactNumber ||
        !vehicleType ||
        !plateNumber ||
        !availability ||
        !preferredAreas ||
        !payoutPreferences ||
        !airportPermitNotes ||
        !driverNotes ||
        !mngPayout ||
        !depPayout ||
        !trfPayout ||
        !dspPayout ||
        !saveButton ||
        saveButton.disabled
      ) {
        return false;
      }

      setValue(driverName, "RENAMED REUSABLE PROFILE TEST DRIVER");
      setValue(contactNumber, "+65 8222 3333");
      setValue(vehicleType, "Viano");
      setValue(plateNumber, "SLR902R");
      setValue(availability, "available");
      setValue(preferredAreas, "Sentosa, Orchard");
      setValue(payoutPreferences, "Prefers VIP and city jobs");
      setValue(airportPermitNotes, "Renewed Changi permit");
      setValue(driverNotes, "Renamed reusable profile note");
      setValue(mngPayout, "80");
      setValue(depPayout, "70");
      setValue(trfPayout, "60");
      setValue(dspPayout, "55");
      saveButton.click();
      return true;
    })()`);
    assert.equal(
      clickedRenamedDriverProfileSave,
      true,
      "Expected renamed existing driver profile to be saveable",
    );

    const renamedDriverProfileSaveState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const saveButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "Save Driver Profile",
          );
          const statusPanel = document.querySelector("[data-status-panel='global']");
          const driverButton = [...document.querySelectorAll("button")].find(
            (button) =>
              button.innerText.includes("RENAMED REUSABLE PROFILE TEST DRIVER") &&
              button.innerText.includes("SLR902R"),
          );
          const saveButtonRect = saveButton?.getBoundingClientRect();
          const statusRect = statusPanel?.getBoundingClientRect();
          const updateRequest = (window.__prestigeDriverProfileRequestBodies || []).find(
            (entry) => entry.method === "PATCH" && String(entry.url).includes("/rest/v1/drivers"),
          );
          const insertRequests = (window.__prestigeDriverProfileRequestBodies || []).filter(
            (entry) => entry.method === "POST" && String(entry.url).includes("/rest/v1/drivers"),
          );
          const bookingRequests = (window.__prestigeDriverProfileRequestBodies || []).filter((entry) =>
            String(entry.url).includes("/rest/v1/bookings"),
          );

          return {
            driverButtonText: driverButton?.innerText || "",
            fetchCalls: window.__prestigeFetchCalls || [],
            insertRequestCount: insertRequests.length,
            bookingRequestCount: bookingRequests.length,
            requestBodies: window.__prestigeDriverProfileRequestBodies || [],
            statusText: statusPanel?.textContent.trim() || "",
            statusDistanceFromSaveButton:
              saveButtonRect && statusRect ? Math.abs(statusRect.top - saveButtonRect.bottom) : null,
            updateRequest: updateRequest ? { url: updateRequest.url, body: updateRequest.body } : null,
            unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
          };
        })()`);

        return candidateState?.statusText === "Driver profile saved." &&
          candidateState?.driverButtonText?.includes("RENAMED REUSABLE PROFILE TEST DRIVER")
          ? candidateState
          : false;
      },
      10000,
      "renamed reusable driver profile updates existing id",
    );

    assert.deepEqual(
      renamedDriverProfileSaveState.unhandledSupabaseCalls,
      [],
      `Expected renamed driver profile Supabase calls to be mocked, got ${renamedDriverProfileSaveState.unhandledSupabaseCalls.join(", ")}`,
    );
    assert.ok(
      renamedDriverProfileSaveState.fetchCalls.every((call) => call.includes("/rest/v1/drivers")),
      `Expected renamed driver profile save to call only drivers REST endpoints, got ${renamedDriverProfileSaveState.fetchCalls.join(", ")}`,
    );
    assert.ok(
      renamedDriverProfileSaveState.fetchCalls.every((call) => !call.includes("driver_name=ilike")),
      `Expected selected driver id update to avoid name lookup, got ${renamedDriverProfileSaveState.fetchCalls.join(", ")}`,
    );
    assert.equal(
      renamedDriverProfileSaveState.insertRequestCount,
      0,
      "Expected renamed existing driver profile to avoid inserting a duplicate driver",
    );
    assert.equal(
      renamedDriverProfileSaveState.bookingRequestCount,
      0,
      "Expected driver profile edit not to update booking assignment rows",
    );
    assert.match(
      renamedDriverProfileSaveState.updateRequest?.url || "",
      /\/rest\/v1\/drivers.*id=eq\.901/,
    );
    assert.match(renamedDriverProfileSaveState.driverButtonText, /available/);
    assert.match(renamedDriverProfileSaveState.driverButtonText, /Plate:\s*SLR902R/);
    assert.ok(
      renamedDriverProfileSaveState.statusDistanceFromSaveButton !== null &&
        renamedDriverProfileSaveState.statusDistanceFromSaveButton <= 120,
      `Expected renamed driver profile saved status near Save Driver Profile button, got ${renamedDriverProfileSaveState.statusDistanceFromSaveButton}px`,
    );
    assert.equal(
      renamedDriverProfileSaveState.updateRequest?.body?.driver_name,
      "RENAMED REUSABLE PROFILE TEST DRIVER",
    );
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.contact_number, "+65 8222 3333");
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.vehicle_type, "Viano");
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.plate_number, "SLR902R");
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.availability_status, "available");
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.preferred_areas, "Sentosa, Orchard");
    assert.equal(
      renamedDriverProfileSaveState.updateRequest?.body?.payout_preferences,
      "Prefers VIP and city jobs",
    );
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.airport_permit_notes, "Renewed Changi permit");
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.notes, "Renamed reusable profile note");
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.driver_payout_rules?.MNG?.min, 80);
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.driver_payout_rules?.MNG?.max, 80);
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.driver_payout_rules?.DEP?.min, 70);
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.driver_payout_rules?.DEP?.max, 70);
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.driver_payout_rules?.TRF?.min, 60);
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.driver_payout_rules?.TRF?.max, 60);
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.driver_payout_rules?.DSP?.amount, 55);
    assert.equal(renamedDriverProfileSaveState.updateRequest?.body?.driver_payout_rules?.DSP?.perHour, true);

    const clickedRenamedDriverForDeactivate = await evaluate(`(() => {
      const driverButton = [...document.querySelectorAll("button")].find(
        (button) =>
          button.innerText.includes("RENAMED REUSABLE PROFILE TEST DRIVER") &&
          button.innerText.includes("SLR902R"),
      );

      if (!driverButton || driverButton.disabled) {
        return false;
      }

      driverButton.click();
      return true;
    })()`);
    assert.equal(clickedRenamedDriverForDeactivate, true, "Expected renamed driver profile to be selectable for deactivation");

    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeDriverProfileRequestBodies = [];
      window.__prestigeUnhandledSupabaseCalls = [];
    })()`);

    const clickedDeactivateDriver = await evaluate(`(() => {
      const deactivateButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Deactivate driver",
      );

      if (!deactivateButton || deactivateButton.disabled) {
        return false;
      }

      deactivateButton.click();
      return true;
    })()`);
    assert.equal(clickedDeactivateDriver, true, "Expected Deactivate driver button to be clickable");

    const deactivatedDriverProfileState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const labels = [...document.querySelectorAll("label")];
          const fieldValue = (labelText) => {
            const label = labels.find(
              (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
            );
            const control = label?.querySelector("input, select, textarea");

            if (!control) {
              return "";
            }

            if (control.tagName === "SELECT") {
              return control.options[control.selectedIndex]?.textContent.trim() || control.value || "";
            }

            return control.value || "";
          };
          const statusPanel = document.querySelector("[data-status-panel='global']");
          const deactivateButton = [...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "Deactivate driver",
          );
          const driverButton = [...document.querySelectorAll("button")].find(
            (button) =>
              button.innerText.includes("RENAMED REUSABLE PROFILE TEST DRIVER") &&
              button.innerText.includes("SLR902R"),
          );
          const deactivateButtonRect = deactivateButton?.getBoundingClientRect();
          const statusRect = statusPanel?.getBoundingClientRect();
          const deactivateRequest = (window.__prestigeDriverProfileRequestBodies || []).find(
            (entry) => entry.method === "PATCH" && String(entry.url).includes("/rest/v1/drivers"),
          );
          const bookingRequests = (window.__prestigeDriverProfileRequestBodies || []).filter((entry) =>
            String(entry.url).includes("/rest/v1/bookings"),
          );

          return {
            driverButtonText: driverButton?.innerText || "",
            fetchCalls: window.__prestigeFetchCalls || [],
            bookingRequestCount: bookingRequests.length,
            requestBodies: window.__prestigeDriverProfileRequestBodies || [],
            statusText: statusPanel?.textContent.trim() || "",
            statusDistanceFromDeactivateButton:
              deactivateButtonRect && statusRect ? Math.abs(statusRect.top - deactivateButtonRect.bottom) : null,
            deactivateRequest: deactivateRequest ? { url: deactivateRequest.url, body: deactivateRequest.body } : null,
            unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
            fields: {
              driverName: fieldValue("Driver name"),
              availability: fieldValue("Availability"),
            },
          };
        })()`);

        return candidateState?.statusText === "Driver deactivated." &&
          candidateState?.driverButtonText?.includes("Inactive")
          ? candidateState
          : false;
      },
      10000,
      "driver profile deactivate success state",
    );

    assert.deepEqual(
      deactivatedDriverProfileState.unhandledSupabaseCalls,
      [],
      `Expected driver deactivation Supabase calls to be mocked, got ${deactivatedDriverProfileState.unhandledSupabaseCalls.join(", ")}`,
    );
    assert.ok(
      deactivatedDriverProfileState.fetchCalls.every((call) => call.includes("/rest/v1/drivers")),
      `Expected driver deactivation to call only drivers REST endpoints, got ${deactivatedDriverProfileState.fetchCalls.join(", ")}`,
    );
    assert.equal(
      deactivatedDriverProfileState.bookingRequestCount,
      0,
      "Expected driver deactivation not to update booking rows",
    );
    assert.match(
      deactivatedDriverProfileState.deactivateRequest?.url || "",
      /\/rest\/v1\/drivers.*id=eq\.901/,
    );
    assert.equal(deactivatedDriverProfileState.deactivateRequest?.body?.availability_status, "inactive");
    assert.ok(
      typeof deactivatedDriverProfileState.deactivateRequest?.body?.updated_at === "string" &&
        deactivatedDriverProfileState.deactivateRequest.body.updated_at.length > 0,
      "Expected driver deactivation to update updated_at timestamp",
    );
    assert.match(deactivatedDriverProfileState.driverButtonText, /RENAMED REUSABLE PROFILE TEST DRIVER/);
    assert.match(deactivatedDriverProfileState.driverButtonText, /inactive/);
    assert.match(deactivatedDriverProfileState.driverButtonText, /Inactive/);
    assert.equal(deactivatedDriverProfileState.fields.driverName, "RENAMED REUSABLE PROFILE TEST DRIVER");
    assert.equal(deactivatedDriverProfileState.fields.availability, "Inactive");
    assert.ok(
      deactivatedDriverProfileState.statusDistanceFromDeactivateButton !== null &&
        deactivatedDriverProfileState.statusDistanceFromDeactivateButton <= 120,
      `Expected Driver deactivated status near Deactivate driver button, got ${deactivatedDriverProfileState.statusDistanceFromDeactivateButton}px`,
    );

    await clickTab("Dispatch", "Create Job Card");
    const dispatchInactiveDriverOptionsState = await evaluate(`(() => {
      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const label = [...document.querySelectorAll("label")].find(
        (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === "Driver",
      );
      const select = label?.querySelector("select");

      return {
        optionTexts: [...(select?.querySelectorAll("option") || [])].map((option) => option.textContent.trim()),
      };
    })()`);
    assert.ok(
      dispatchInactiveDriverOptionsState.optionTexts.every(
        (optionText) => !optionText.includes("RENAMED REUSABLE PROFILE TEST DRIVER"),
      ),
      `Expected inactive driver to be hidden from Dispatch assignment, got ${dispatchInactiveDriverOptionsState.optionTexts.join(", ")}`,
    );

    await clickTab("Dashboard", "Operations Dashboard");
    const dashboardAfterDriverProfileSaveState = await evaluate(`(() => {
      const assignmentArticle = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD DRIVER TEST TRAVELER") &&
          candidate.innerText.includes("SQ777"),
      );
      const oldAssignedArticle = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("LOADED SAVED TRAVELER") &&
          candidate.innerText.includes("SQ999"),
      );
      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const driverLabel = [...(assignmentArticle?.querySelectorAll("label") || [])].find(
        (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === "Driver",
      );
      const driverSelect = driverLabel?.querySelector("select");

      return {
        articleText: assignmentArticle?.innerText || "",
        oldAssignedArticleText: oldAssignedArticle?.innerText || "",
        assignmentDriverOptionTexts: [...(driverSelect?.querySelectorAll("option") || [])].map((option) =>
          option.textContent.trim(),
        ),
      };
    })()`);
    assert.match(dashboardAfterDriverProfileSaveState.articleText, /Assign driver to this booking/);
    assert.match(dashboardAfterDriverProfileSaveState.articleText, /Driver:\s*DASHBOARD TEST DRIVER/);
    assert.ok(
      dashboardAfterDriverProfileSaveState.assignmentDriverOptionTexts.every(
        (optionText) => !optionText.includes("RENAMED REUSABLE PROFILE TEST DRIVER"),
      ),
      `Expected inactive driver to be hidden from Dashboard assignment, got ${dashboardAfterDriverProfileSaveState.assignmentDriverOptionTexts.join(", ")}`,
    );
    assert.match(dashboardAfterDriverProfileSaveState.oldAssignedArticleText, /Driver:\s*LOADED SAVED DRIVER/);
    assert.match(dashboardAfterDriverProfileSaveState.oldAssignedArticleText, /Contact:\s*\+65 8888 0000/);

    await clickTab("Dispatch", "Create Job Card");
    const dispatchDraftAfterDashboardAssignment = await evaluate(extractStateScript);
    assert.equal(dispatchDraftAfterDashboardAssignment.fields.company, "BROWSER UI TEST COMPANY");
    assert.equal(dispatchDraftAfterDashboardAssignment.fields.flight, "SQ333");
    assert.equal(dispatchDraftAfterDashboardAssignment.fields.driverName, "TEST DRIVER CRM 20260516");

    await clickTab("Dashboard", "Operations Dashboard");

    await evaluate(`window.__prestigeFetchCalls = []`);

    const clickedDashboardLoadThisBooking = await evaluate(`(() => {
      const loadThisBookingButton = document.querySelector("[data-dashboard-load-booking='true']");

      if (!loadThisBookingButton || loadThisBookingButton.disabled) {
        return false;
      }

      loadThisBookingButton.click();
      return true;
    })()`);
    assert.equal(
      clickedDashboardLoadThisBooking,
      true,
      "Expected dashboard Load this booking button to be clickable",
    );

    const loadedBookingState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const bodyText = document.body.innerText;
          const labels = [...document.querySelectorAll("label")];
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const fieldValue = (labelText) => {
            const label = labels.find((candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText);
            const control = label?.querySelector("input, select, textarea");

            if (!control) {
              return "";
            }

            if (control.tagName === "SELECT") {
              return control.options[control.selectedIndex]?.textContent.trim() || control.value || "";
            }

            return control.value || "";
          };
          const preTextByHeading = (headingText) => {
            const heading = [...document.querySelectorAll("h2")].find(
              (candidate) => candidate.textContent.trim() === headingText,
            );
            let node = heading?.parentElement || null;

            while (node) {
              const pre = node.querySelector("pre");

              if (pre) {
                return pre.innerText;
              }

              node = node.parentElement;
            }

            return "";
          };

          return {
            bodyText,
            aiDraftExists: Boolean(document.querySelector("[data-ai-assist-draft='true']")),
            aiFeedbackExists: Boolean(document.querySelector("[data-ai-assist-feedback='true']")),
            fetchCalls: window.__prestigeFetchCalls || [],
            jobCardPreview: preTextByHeading("Job Card Preview"),
            driverDispatch: preTextByHeading("Driver Dispatch"),
            pastedMessage: document.querySelector("textarea")?.value || "",
            fields: {
              company: fieldValue("Company / Account"),
              bookingType: fieldValue("Booking type"),
              vehicle: fieldValue("Vehicle"),
              pickup: fieldValue("Pickup"),
              dropoff: fieldValue("Drop-off"),
              flight: fieldValue("Flight number"),
              name: fieldValue("Passenger name") || fieldValue("Name"),
            },
          };
        })()`);

        return candidateState?.fields?.company === "LOADED SAVED COMPANY" &&
          candidateState?.fields?.flight === "SQ999"
          ? candidateState
          : false;
      },
      10000,
      "dashboard loaded saved booking after stale AI cleanup",
    );

    assert.equal(loadedBookingState.aiDraftExists, false, "Expected AI draft panel to clear after loading saved booking");
    assert.equal(loadedBookingState.aiFeedbackExists, false, "Expected AI feedback to clear after loading saved booking");
    assert.equal(loadedBookingState.pastedMessage, "", "Expected pasted intake message to clear after loading saved booking");
    assert.deepEqual(
      loadedBookingState.fetchCalls,
      [],
      `Expected Load this booking to make no save/load network call, got ${loadedBookingState.fetchCalls.join(", ")}`,
    );
    assert.equal(loadedBookingState.fields.bookingType, "DEP");
    assert.equal(loadedBookingState.fields.vehicle, "VAN");
    assert.equal(loadedBookingState.fields.pickup, "Raffles Hotel Singapore");
    assert.equal(loadedBookingState.fields.dropoff, "Changi Airport T2");
    assert.equal(loadedBookingState.fields.name, "LOADED SAVED TRAVELER");
    assert.match(loadedBookingState.jobCardPreview, /SQ999/);
    assert.match(loadedBookingState.jobCardPreview, /LOADED SAVED COMPANY/);
    assert.match(loadedBookingState.driverDispatch, /LOADED SAVED DRIVER/);
    assert.match(loadedBookingState.driverDispatch, /LOADED SAVED TRAVELER/);
    assert.doesNotMatch(loadedBookingState.bodyText, /Booking saved successfully/);

    await evaluate(`window.__prestigeFetchCalls = []`);

    await clickTab("Bookings", "Recent Bookings");

    const clickedRecentLoadThisBooking = await evaluate(`(() => {
      const loadThisBookingButton = [...document.querySelectorAll("button")].find(
        (button) =>
          button.textContent.trim() === "Load this booking" &&
          !button.matches("[data-dashboard-load-booking='true']"),
      );

      if (!loadThisBookingButton || loadThisBookingButton.disabled) {
        return false;
      }

      loadThisBookingButton.click();
      return true;
    })()`);
    assert.equal(
      clickedRecentLoadThisBooking,
      true,
      "Expected Recent Bookings Load this booking button to remain clickable",
    );

    const recentLoadedBookingState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const labels = [...document.querySelectorAll("label")];
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const fieldValue = (labelText) => {
            const label = labels.find((candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText);
            const control = label?.querySelector("input, select, textarea");

            return control?.value || "";
          };

          return {
            aiDraftExists: Boolean(document.querySelector("[data-ai-assist-draft='true']")),
            aiFeedbackExists: Boolean(document.querySelector("[data-ai-assist-feedback='true']")),
            fetchCalls: window.__prestigeFetchCalls || [],
            fields: {
              company: fieldValue("Company / Account"),
              flight: fieldValue("Flight number"),
            },
          };
        })()`);

        return candidateState?.fields?.company === "LOADED SAVED COMPANY" &&
          candidateState?.fields?.flight === "SQ999"
          ? candidateState
          : false;
      },
      10000,
      "recent loaded saved booking still works",
    );

    assert.equal(recentLoadedBookingState.aiDraftExists, false);
    assert.equal(recentLoadedBookingState.aiFeedbackExists, false);
    assert.deepEqual(
      recentLoadedBookingState.fetchCalls,
      [],
      `Expected Recent Load this booking to make no save/load network call, got ${recentLoadedBookingState.fetchCalls.join(", ")}`,
    );

    await clickTab("Bookings", "Recent Bookings");
    const clickedLutherRecentLoadThisBooking = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("Luther Graham") &&
          candidate.innerText.includes("SQ265") &&
          candidate.innerText.includes("30 Apr 2026"),
      );
      const loadThisBookingButton = [...(article?.querySelectorAll("button") || [])].find(
        (button) => button.textContent.trim() === "Load this booking",
      );

      if (!loadThisBookingButton || loadThisBookingButton.disabled) {
        return false;
      }

      loadThisBookingButton.click();
      return true;
    })()`);
    assert.equal(
      clickedLutherRecentLoadThisBooking,
      true,
      "Expected Luther Graham booking Load this booking button to remain clickable",
    );

    const lutherLoadedPricingState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        return candidateState?.fields?.flight === "SQ265" &&
          candidateState?.fields?.name === "Luther Graham" &&
          candidateState?.pricingPanel?.includes("$160.00") &&
          candidateState?.pricingPanel?.includes("$95.00") &&
          candidateState?.pricingPanel?.includes("$65.00")
          ? candidateState
          : false;
      },
      10000,
      "Luther Graham loaded saved booking pricing",
    );
    assert.match(
      lutherLoadedPricingState.pricingPanel,
      /Customer\s+\$160\.00/,
      "Expected Dispatch loaded pricing to match the saved customer card price",
    );
    assert.match(
      lutherLoadedPricingState.pricingPanel,
      /Driver\s+\$95\.00/,
      "Expected Dispatch loaded pricing to match the saved assigned driver payout",
    );
    assert.match(
      lutherLoadedPricingState.pricingPanel,
      /Profit\s+\$65\.00/,
      "Expected Dispatch loaded profit to use the saved assigned driver payout",
    );
    assert.doesNotMatch(
      lutherLoadedPricingState.pricingPanel,
      /Driver\s+\$85\.00/,
      "Expected Dispatch loaded pricing not to recalculate the stale default driver payout",
    );
    assert.match(lutherLoadedPricingState.driverDispatch, /Payout: \$95/);
    assert.doesNotMatch(lutherLoadedPricingState.driverDispatch, /Payout: \$85/);

    const seededCompletedLoadStaleMessage = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");

      if (!textarea) {
        return false;
      }

      const descriptor = Object.getOwnPropertyDescriptor(textarea.constructor.prototype, "value");
      descriptor?.set?.call(textarea, "stale completed tab intake message");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      return textarea.value === "stale completed tab intake message";
    })()`);
    assert.equal(
      seededCompletedLoadStaleMessage,
      true,
      "Expected stale intake message to be seeded before Completed tab load",
    );

    await clickTab("Completed", "Completed Bookings");

    const completedTabState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const bodyText = document.body.innerText;
          const completedArticle = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("COMPLETED TEST COMPANY") &&
              candidate.innerText.includes("SQ888"),
          );
          const customerOnlyPriceArticle = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("PRICE DISPLAY CUSTOMER ONLY TRAVELER") &&
              candidate.innerText.includes("SQ785"),
          );
          const activeArticle = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("LOADED SAVED COMPANY") ||
              candidate.innerText.includes("DASHBOARD DRIVER TEST COMPANY"),
          );

          return bodyText.includes("Completed Bookings") && completedArticle
            ? {
                activeArticleText: activeArticle?.innerText || "",
                bodyText,
                completedArticleText: completedArticle.innerText,
                customerOnlyPriceArticleText: customerOnlyPriceArticle?.innerText || "",
                hasCompletedLoadButton: Boolean(
                  completedArticle.querySelector("[data-completed-load-booking='true']"),
                ),
              }
            : false;
        })()`),
      10000,
      "Completed tab filtered booking list",
    );

    assert.match(completedTabState.completedArticleText, /Completed/i);
    assert.match(completedTabState.completedArticleText, /COMPLETED TEST TRAVELER/);
    assert.match(
      completedTabState.completedArticleText,
      /Customer \$90 \/ Driver \$65/,
      "Expected Completed card to show saved customer and driver prices",
    );
    assert.match(
      completedTabState.customerOnlyPriceArticleText,
      /Customer \$140 \/ Driver —/,
      "Expected Completed card to show missing driver price as a dash, not zero",
    );
    assert.doesNotMatch(
      completedTabState.customerOnlyPriceArticleText,
      /Driver \$0(?:\.00)?/,
      "Expected Completed card not to invent a $0 driver price when it is missing",
    );
    assert.equal(completedTabState.hasCompletedLoadButton, true);
    assert.equal(
      completedTabState.activeArticleText,
      "",
      "Expected active bookings not to appear in the Completed tab",
    );

    await setInputValue("[data-completed-search-input='true']", "COMPLETED TEST TRAVELER", "Completed search");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const articles = [...document.querySelectorAll("article")].map((article) => article.innerText);

          return articles.length === 1 &&
            articles[0].includes("COMPLETED TEST TRAVELER") &&
            !document.body.innerText.includes("COMPLETED UNDO ASSIGNED TRAVELER");
        })()`),
      10000,
      "Completed search by passenger",
    );

    await setInputValue("[data-completed-search-input='true']", "SQ888", "Completed search");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const articles = [...document.querySelectorAll("article")].map((article) => article.innerText);

          return articles.length === 1 &&
            articles[0].includes("COMPLETED TEST TRAVELER") &&
            !document.body.innerText.includes("COMPLETED UNDO ASSIGNED TRAVELER");
        })()`),
      10000,
      "Completed search by flight",
    );

    await setInputValue("[data-completed-search-input='true']", "COMPLETED TEST DRIVER", "Completed search");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const articles = [...document.querySelectorAll("article")].map((article) => article.innerText);

          return articles.length === 1 &&
            articles[0].includes("COMPLETED TEST TRAVELER") &&
            !document.body.innerText.includes("COMPLETED UNDO ASSIGNED TRAVELER");
        })()`),
      10000,
      "Completed search by driver",
    );

    await setInputValue("[data-completed-search-input='true']", "NO COMPLETED LOCAL MATCH", "Completed search");
    const completedNoMatchState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const state = {
            articles: [...document.querySelectorAll("article")].map((article) => article.innerText),
            emptyStateVisible: document.body.innerText.includes("No completed bookings loaded yet."),
            noMatchText: document.querySelector("[data-completed-search-empty='true']")?.textContent.trim() || "",
          };

          return state.noMatchText === "No matching completed bookings found." ? state : false;
        })()`),
      10000,
      "Completed search no-match state",
    );
    assert.deepEqual(completedNoMatchState.articles, []);
    assert.equal(completedNoMatchState.emptyStateVisible, false);
    assert.equal(completedNoMatchState.noMatchText, "No matching completed bookings found.");

    await setInputValue("[data-completed-search-input='true']", "", "Completed search");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const bodyText = document.body.innerText;

          return bodyText.includes("COMPLETED TEST TRAVELER") &&
            bodyText.includes("DASHBOARD STATUS FLOW TRAVELER") &&
            bodyText.includes("COMPLETION ACTION TEST TRAVELER") &&
            !document.querySelector("[data-completed-search-empty='true']");
        })()`),
      10000,
      "Completed search cleared",
    );

    await evaluate(`window.__prestigeFetchCalls = []`);

    const clickedCompletedLoadThisBooking = await evaluate(`(() => {
      const loadThisBookingButton = document.querySelector("[data-completed-load-booking='true']");

      if (!loadThisBookingButton || loadThisBookingButton.disabled) {
        return false;
      }

      loadThisBookingButton.click();
      return true;
    })()`);
    assert.equal(
      clickedCompletedLoadThisBooking,
      true,
      "Expected Completed Load this booking button to be clickable",
    );

    const completedLoadedBookingState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const labels = [...document.querySelectorAll("label")];
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const fieldValue = (labelText) => {
            const label = labels.find((candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText);
            const control = label?.querySelector("input, select, textarea");

            return control?.value || "";
          };
          const preTextByHeading = (headingText) => {
            const heading = [...document.querySelectorAll("h2")].find(
              (candidate) => candidate.textContent.trim() === headingText,
            );
            let node = heading?.parentElement || null;

            while (node) {
              const pre = node.querySelector("pre");

              if (pre) {
                return pre.innerText;
              }

              node = node.parentElement;
            }

            return "";
          };

          return {
            activeTab: [...document.querySelectorAll("button[role='tab']")]
              .find((button) => button.getAttribute("aria-selected") === "true")
              ?.textContent.trim() || "",
            aiDraftExists: Boolean(document.querySelector("[data-ai-assist-draft='true']")),
            aiFeedbackExists: Boolean(document.querySelector("[data-ai-assist-feedback='true']")),
            fetchCalls: window.__prestigeFetchCalls || [],
            jobCardPreview: preTextByHeading("Job Card Preview"),
            driverDispatch: preTextByHeading("Driver Dispatch"),
            pastedMessage: document.querySelector("textarea")?.value || "",
            fields: {
              company: fieldValue("Company / Account"),
              bookingType: fieldValue("Booking type"),
              vehicle: fieldValue("Vehicle"),
              pickup: fieldValue("Pickup"),
              dropoff: fieldValue("Drop-off"),
              flight: fieldValue("Flight number"),
              name: fieldValue("Passenger name") || fieldValue("Name"),
              driverName: fieldValue("Driver Name"),
            },
          };
        })()`);

        return candidateState?.fields?.company === "COMPLETED TEST COMPANY" &&
          candidateState?.fields?.flight === "SQ888"
          ? candidateState
          : false;
      },
      10000,
      "Completed Load this booking form state",
    );

    assert.equal(completedLoadedBookingState.activeTab, "Dispatch");
    assert.equal(completedLoadedBookingState.aiDraftExists, false);
    assert.equal(completedLoadedBookingState.aiFeedbackExists, false);
    assert.equal(completedLoadedBookingState.pastedMessage, "");
    assert.deepEqual(
      completedLoadedBookingState.fetchCalls,
      [],
      `Expected Completed Load this booking to make no save/load network call, got ${completedLoadedBookingState.fetchCalls.join(", ")}`,
    );
    assert.equal(completedLoadedBookingState.fields.bookingType, "DEP");
    assert.equal(completedLoadedBookingState.fields.vehicle, "AVF");
    assert.equal(completedLoadedBookingState.fields.pickup, "Mandarin Oriental Singapore");
    assert.equal(completedLoadedBookingState.fields.dropoff, "Changi Airport T1");
    assert.equal(completedLoadedBookingState.fields.name, "COMPLETED TEST TRAVELER");
    assert.equal(completedLoadedBookingState.fields.driverName, "COMPLETED TEST DRIVER");
    assert.match(completedLoadedBookingState.jobCardPreview, /SQ888/);
    assert.match(completedLoadedBookingState.jobCardPreview, /COMPLETED TEST COMPANY/);
    assert.match(completedLoadedBookingState.driverDispatch, /COMPLETED TEST DRIVER/);
    assert.match(completedLoadedBookingState.driverDispatch, /COMPLETED TEST TRAVELER/);

    const clickedClearBeforeCrmSave = await evaluate(`(() => {
      const clearButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Clear",
      );

      if (!clearButton || clearButton.disabled) {
        return false;
      }

      clearButton.click();
      return true;
    })()`);
    assert.equal(clickedClearBeforeCrmSave, true, "Expected Clear button before CRM save test");

    const focusedCrmSaveTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(focusedCrmSaveTextarea, true, "Expected textarea to be focused for CRM save test");

    await client.send("Input.insertText", { text: bookingSample });

    const filledCrmSaveTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(bookingSample)}`,
    );
    assert.equal(filledCrmSaveTextarea, true, "Expected CRM save sample textarea to be filled");

    const clickedCrmSaveParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Create Job Card",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(clickedCrmSaveParse, true, "Expected Create Job Card button before CRM save");

    await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        return candidateState?.fields?.company === "BROWSER UI TEST COMPANY" &&
          candidateState?.fields?.flight === "SQ333" &&
          candidateState?.fields?.extraStopLocation === "Marina Bay Sands"
          ? candidateState
          : false;
      },
      10000,
      "parsed booking UI state before CRM save",
    );

    await evaluate(`(() => {
      const savedBooking = ${JSON.stringify(crmSavedBookingFixture)};
      const companyRecord = {
        id: savedBooking.company_id,
        company_name: savedBooking.companies.company_name,
        domain: savedBooking.companies.domain,
        customer_rates: {},
        driver_payout_rules: {},
        transzend_excel_privacy: false,
      };
      const bookerRecord = {
        id: savedBooking.booker_id,
        company_id: savedBooking.company_id,
        booker_name: savedBooking.bookers.booker_name,
        email: savedBooking.bookers.email,
        phone: savedBooking.bookers.phone,
      };
      const travelerRecord = {
        id: savedBooking.traveler_id,
        company_id: savedBooking.company_id,
        traveler_name: savedBooking.travelers.traveler_name,
        preferred_vehicle: savedBooking.vehicle,
        default_address: savedBooking.dropoff_address,
        default_pickup_address: "",
        default_dropoff_address: savedBooking.dropoff_address,
        booker_id: savedBooking.booker_id,
        booker_name: savedBooking.bookers.booker_name,
        booker_contact: savedBooking.bookers.phone,
        booker_email: savedBooking.bookers.email,
        customer_rates: {},
        driver_payout_rules: {},
      };
      const savedAddressRecord = {
        id: 604,
        company_id: savedBooking.company_id,
        traveler_id: savedBooking.traveler_id,
        label: "Default",
        address: savedBooking.dropoff_address,
        address_role: "traveler_default",
        is_default: true,
        use_count: 1,
      };
      const jsonResponse = (body, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });

      window.__prestigeFetchCalls = [];
      window.__prestigeSaveRequestBodies = [];
      window.__prestigeUnhandledSupabaseCalls = [];
      window.__prestigeOriginalFetch = window.__prestigeOriginalFetch || window.fetch.bind(window);
      window.fetch = async (...args) => {
        const target = args[0]?.url || args[0];
        const url = String(target);
        const method = args[1]?.method || args[0]?.method || "GET";
        const bodyText = typeof args[1]?.body === "string" ? args[1].body : "";

        window.__prestigeFetchCalls.push(\`\${method} \${url}\`);
        if (bodyText) {
          try {
            window.__prestigeSaveRequestBodies.push({
              method,
              url,
              body: JSON.parse(bodyText),
            });
          } catch {
            window.__prestigeSaveRequestBodies.push({ method, url, body: bodyText });
          }
        }

        if (!url.includes("/rest/v1/")) {
          return window.__prestigeOriginalFetch(...args);
        }

        if (url.includes("/rest/v1/companies")) {
          if (method === "GET") {
            return jsonResponse([]);
          }

          if (method === "POST") {
            return jsonResponse(companyRecord, 201);
          }

          window.__prestigeUnhandledSupabaseCalls.push(\`\${method} \${url}\`);
          return jsonResponse({ message: "Unhandled company mock" }, 500);
        }

        if (url.includes("/rest/v1/bookers")) {
          if (method === "GET") {
            return jsonResponse([]);
          }

          if (method === "POST") {
            return jsonResponse(bookerRecord, 201);
          }

          if (method === "PATCH") {
            return jsonResponse({});
          }

          window.__prestigeUnhandledSupabaseCalls.push(\`\${method} \${url}\`);
          return jsonResponse({ message: "Unhandled booker mock" }, 500);
        }

        if (url.includes("/rest/v1/travelers")) {
          if (method === "GET") {
            return jsonResponse([]);
          }

          if (method === "POST") {
            return jsonResponse(travelerRecord, 201);
          }

          if (method === "PATCH") {
            return jsonResponse({});
          }

          window.__prestigeUnhandledSupabaseCalls.push(\`\${method} \${url}\`);
          return jsonResponse({ message: "Unhandled traveler mock" }, 500);
        }

        if (url.includes("/rest/v1/saved_addresses")) {
          if (method === "GET") {
            return jsonResponse([]);
          }

          if (method === "POST") {
            return jsonResponse(savedAddressRecord, 201);
          }

          if (method === "PATCH") {
            return jsonResponse({});
          }

          window.__prestigeUnhandledSupabaseCalls.push(\`\${method} \${url}\`);
          return jsonResponse({ message: "Unhandled saved address mock" }, 500);
        }

        if (url.includes("/rest/v1/bookings")) {
          if (method === "POST") {
            return jsonResponse({ id: savedBooking.id }, 201);
          }

          if (method === "GET") {
            return jsonResponse([savedBooking]);
          }

          window.__prestigeUnhandledSupabaseCalls.push(\`\${method} \${url}\`);
          return jsonResponse({ message: "Unhandled booking mock" }, 500);
        }

        window.__prestigeUnhandledSupabaseCalls.push(\`\${method} \${url}\`);
        return jsonResponse({ message: "Unhandled Supabase mock" }, 500);
      };
    })()`);

    const clickedSaveBookingCrm = await evaluate(`(() => {
      const saveButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Save Booking + CRM",
      );

      if (!saveButton || saveButton.disabled) {
        return false;
      }

      saveButton.click();
      return true;
    })()`);
    assert.equal(clickedSaveBookingCrm, true, "Expected Save Booking + CRM button to be clickable");

    const crmSaveState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const bodyText = document.body.innerText;
          const bookingInsert = (window.__prestigeSaveRequestBodies || []).find(
            (entry) => entry.method === "POST" && String(entry.url).includes("/rest/v1/bookings"),
          );

          return bodyText.includes("Booking saved successfully: ${crmSavedBookingFixture.id}")
            ? {
                bodyText,
                fetchCalls: window.__prestigeFetchCalls || [],
                requestBodies: window.__prestigeSaveRequestBodies || [],
                unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
                bookingInsert: bookingInsert?.body || null,
              }
            : false;
        })()`);

        return candidateState || false;
      },
      10000,
      "mock successful Save Booking + CRM",
    );

    assert.deepEqual(
      crmSaveState.unhandledSupabaseCalls,
      [],
      `Expected all Supabase calls to be mocked, got ${crmSaveState.unhandledSupabaseCalls.join(", ")}`,
    );
    assert.ok(
      crmSaveState.fetchCalls.every((call) => call.includes("/rest/v1/")),
      `Expected CRM save test to make only mocked Supabase REST calls, got ${crmSaveState.fetchCalls.join(", ")}`,
    );
    assert.equal(crmSaveState.bookingInsert?.company_id, crmSavedBookingFixture.company_id);
    assert.equal(crmSaveState.bookingInsert?.booker_id, crmSavedBookingFixture.booker_id);
    assert.equal(crmSaveState.bookingInsert?.traveler_id, crmSavedBookingFixture.traveler_id);
    assert.equal(crmSaveState.bookingInsert?.booking_type, "MNG");
    assert.equal(crmSaveState.bookingInsert?.vehicle, "AVF");
    assert.equal(crmSaveState.bookingInsert?.pickup_address, "Changi Airport T3");
    assert.equal(crmSaveState.bookingInsert?.dropoff_address, "Raffles Hotel Singapore");
    assert.equal(crmSaveState.bookingInsert?.flight_no, "SQ333");
    assert.equal(crmSaveState.bookingInsert?.pax, 2);
    assert.equal(crmSaveState.bookingInsert?.extra_stop_count, 1);
    assert.equal(crmSaveState.bookingInsert?.child_seat_required, true);
    assert.equal(crmSaveState.bookingInsert?.child_seat_count, 2);
    assert.equal(crmSaveState.bookingInsert?.child_seat_type, "booster seat");
    assert.equal(crmSaveState.bookingInsert?.customer_rate_override, 160);
    assert.equal(crmSaveState.bookingInsert?.driver_name, "TEST DRIVER CRM 20260516");

    await clickTab("Bookings", "Recent Bookings");

    await waitForCondition(
      () =>
        evaluate(`(() => {
          const bodyText = document.body.innerText;
          const recentBookingButton = [...document.querySelectorAll("article")].some(
            (article) =>
              article.innerText.includes("BROWSER UI TEST COMPANY") &&
              article.innerText.includes("SQ333") &&
              [...article.querySelectorAll("button")].some((button) => button.textContent.trim() === "Load this booking"),
          );

          return bodyText.includes("Recent Bookings") && recentBookingButton;
        })()`),
      10000,
      "saved CRM booking in Recent Bookings",
    );

    const clickedSavedCrmRecentLoad = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("BROWSER UI TEST COMPANY") &&
          candidate.innerText.includes("SQ333"),
      );
      const button = [...(article?.querySelectorAll("button") || [])].find(
        (candidate) => candidate.textContent.trim() === "Load this booking",
      );

      if (!button || button.disabled) {
        return false;
      }

      button.click();
      return true;
    })()`);
    assert.equal(clickedSavedCrmRecentLoad, true, "Expected saved CRM Recent Booking to load");

    const crmReloadState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const labels = [...document.querySelectorAll("label")];
          const fieldValue = (labelText) => {
            const label = labels.find((candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText);
            const control = label?.querySelector("input, select, textarea");

            if (!control) {
              return "";
            }

            if (control.tagName === "SELECT") {
              return control.options[control.selectedIndex]?.textContent.trim() || control.value || "";
            }

            return control.value || "";
          };
          const pres = [...document.querySelectorAll("pre")].map((pre) => pre.innerText);

          return {
            bodyText: document.body.innerText,
            fields: {
              company: fieldValue("Company / Account"),
              bookingType: fieldValue("Booking type"),
              vehicle: fieldValue("Vehicle"),
              pickupDate: fieldValue("Pickup date"),
              pickupTime: fieldValue("Pickup time"),
              flight: fieldValue("Flight number"),
              pickup: fieldValue("Pickup"),
              extraStopLocation: fieldValue("Extra stop location"),
              extraStopCount: fieldValue("Extra Stops"),
              dropoff: fieldValue("Drop-off"),
              booker: fieldValue("Booker"),
              bookerContact: fieldValue("Booker WhatsApp / Contact"),
              bookerEmail: fieldValue("Booker email (optional)"),
              name: fieldValue("Passenger name") || fieldValue("Name"),
              pax: fieldValue("Pax"),
              childSeatRequired: fieldValue("Child seat required"),
              childSeatCount: fieldValue("Child seat count"),
              childSeatType: fieldValue("Child seat type / note"),
              customerPriceOverride: fieldValue("Customer Price Override"),
              driverName: fieldValue("Driver Name"),
            },
            jobCardPreview: pres.find((text) => text.includes("Flight: SQ333")) || "",
            driverDispatch: pres.find((text) => text.includes("DRIVER DISPATCH")) || "",
          };
        })()`);

        return candidateState?.fields?.company === "BROWSER UI TEST COMPANY" &&
          candidateState?.fields?.flight === "SQ333"
          ? candidateState
          : false;
      },
      10000,
      "reloaded CRM saved booking form state",
    );

    assert.equal(crmReloadState.fields.company, "BROWSER UI TEST COMPANY");
    assert.equal(crmReloadState.fields.booker, "BROWSER UI TEST BOOKER");
    assert.equal(crmReloadState.fields.bookerContact, "+65 9000 0333");
    assert.equal(crmReloadState.fields.bookerEmail, "browserui@example.com");
    assert.equal(crmReloadState.fields.name, "BROWSER UI TEST TRAVELER");
    assert.equal(crmReloadState.fields.pax, "2");
    assert.equal(crmReloadState.fields.vehicle, "AVF");
    assert.equal(crmReloadState.fields.bookingType, "MNG");
    assert.equal(crmReloadState.fields.pickupDate, "2026-05-27");
    assert.equal(crmReloadState.fields.pickupTime, "1530hrs");
    assert.equal(crmReloadState.fields.flight, "SQ333");
    assert.equal(crmReloadState.fields.pickup, "Changi Airport T3");
    assert.equal(crmReloadState.fields.extraStopLocation, "Marina Bay Sands");
    assert.equal(crmReloadState.fields.extraStopCount, "1");
    assert.equal(crmReloadState.fields.dropoff, "Raffles Hotel Singapore");
    assert.match(crmReloadState.fields.childSeatRequired, /Yes/i);
    assert.equal(crmReloadState.fields.childSeatCount, "2");
    assert.equal(crmReloadState.fields.childSeatType, "booster seat");
    assert.equal(crmReloadState.fields.customerPriceOverride, "160");
    assert.equal(crmReloadState.fields.driverName, "TEST DRIVER CRM 20260516");
    assert.match(crmReloadState.jobCardPreview, /Marina Bay Sands/);
    assert.match(crmReloadState.jobCardPreview, /Child seat: 2 x booster seat/);
    assert.match(crmReloadState.driverDispatch, /TEST DRIVER CRM 20260516/);
    assert.match(crmReloadState.driverDispatch, /BROWSER UI TEST TRAVELER/);
    assert.doesNotMatch(crmReloadState.bodyText, /Company:\s*gmail\.com/i);
    assert.doesNotMatch(crmReloadState.bodyText, /Company:\s*prestigelimo\.sg/i);

    await evaluate(`window.fetch = window.__prestigeOriginalFetch || window.fetch`);

    const focusedMultiBookingTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedMultiBookingTextarea,
      true,
      "Expected booking message textarea to be focused for multi-booking preview sample",
    );

    await client.send("Input.insertText", { text: multiBookingPreviewSample });

    const filledMultiBookingTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(multiBookingPreviewSample)}`,
    );
    assert.equal(
      filledMultiBookingTextarea,
      true,
      "Expected multi-booking preview sample to be filled",
    );

    const clickedMultiBookingParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Create Job Card",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(clickedMultiBookingParse, true, "Expected Create Job Card button for multi-booking preview sample");

    await waitForCondition(
      () =>
        evaluate(`(() => {
          const bodyText = document.body.innerText;

          return bodyText.includes("Multiple bookings detected. Please select one extracted booking.") &&
            bodyText.includes("extractedBookingsPreview.length: 3") &&
            [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Use this booking");
        })()`),
      10000,
      "multi-booking preview choices",
    );

    const clickedFirstPreviewBooking = await evaluate(`(() => {
      const previewButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Use this booking",
      );

      if (!previewButton || previewButton.disabled) {
        return false;
      }

      previewButton.click();
      return true;
    })()`);
    assert.equal(clickedFirstPreviewBooking, true, "Expected first extracted booking preview to be selectable");

    const selectedPreviewState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.company === "BNY" &&
          candidateState?.fields?.booker === "Nicole" &&
          candidateState?.fields?.flight === "SQ318" &&
          candidateState?.fields?.dropoff === "Fullerton Hotel"
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "selected multi-booking preview UI state",
    );
    selectedPreviewState.errors = [...browserErrors, ...(selectedPreviewState.errors || [])];
    selectedPreviewState.consoleErrors = [...browserConsoleErrors, ...(selectedPreviewState.consoleErrors || [])];

    assert.deepEqual(
      selectedPreviewState.errors,
      [],
      `Expected no browser runtime errors, got ${selectedPreviewState.errors.join("\n")}`,
    );
    assert.deepEqual(
      selectedPreviewState.consoleErrors,
      [],
      `Expected no browser console errors, got ${selectedPreviewState.consoleErrors.join("\n")}`,
    );
    assert.equal(selectedPreviewState.fields.company, "BNY");
    assert.equal(selectedPreviewState.fields.booker, "Nicole");
    assert.equal(selectedPreviewState.fields.bookingType, "MNG");
    assert.equal(selectedPreviewState.fields.pickupTime, "0610hrs");
    assert.equal(selectedPreviewState.fields.flight, "SQ318");
    assert.equal(selectedPreviewState.fields.pickup, "Changi Airport");
    assert.equal(selectedPreviewState.fields.dropoff, "Fullerton Hotel");
    assert.equal(selectedPreviewState.fields.name, "Mr Deep");
    assert.doesNotMatch(selectedPreviewState.fieldText, /Mr Stanley|Ms Chloe|SQ221|Capella/);
    assert.doesNotMatch(selectedPreviewState.visibleText, /extractedBookingsPreview\.length|Please review warnings before saving\./);

    const parseWarburgPreview = async (previewIndex, expectedFlight) => {
      const focusedTextarea = await evaluate(`(() => {
        const textarea = document.querySelector("textarea");
        if (!textarea) {
          return false;
        }

        textarea.focus();
        textarea.select();
        return document.activeElement === textarea;
      })()`);
      assert.equal(focusedTextarea, true, "Expected textarea to be focused for Warburg transfer sample");

      await client.send("Input.insertText", { text: warburgTwoTransferSample });

      const filledTextarea = await evaluate(
        `document.querySelector("textarea")?.value === ${JSON.stringify(warburgTwoTransferSample)}`,
      );
      assert.equal(filledTextarea, true, "Expected Warburg transfer sample textarea to be filled");

      const clickedParse = await evaluate(`(() => {
        const parseButton = [...document.querySelectorAll("button")].find(
          (button) => button.textContent.trim() === "Create Job Card",
        );

        if (!parseButton || parseButton.disabled) {
          return false;
        }

        parseButton.click();
        return true;
      })()`);
      assert.equal(clickedParse, true, "Expected Create Job Card button for Warburg transfer sample");

      await waitForCondition(
        () =>
          evaluate(`(() => {
            const bodyText = document.body.innerText;

            return bodyText.includes("Multiple bookings detected. Please select one extracted booking.") &&
              bodyText.includes("extractedBookingsPreview.length: 2") &&
              [...document.querySelectorAll("button")].filter(
                (button) => button.textContent.trim() === "Use this booking",
              ).length >= 2;
          })()`),
        10000,
        "Warburg two-transfer preview choices",
      );

      const clickedPreview = await evaluate(`(() => {
        const previewButtons = [...document.querySelectorAll("button")].filter(
          (button) => button.textContent.trim() === "Use this booking",
        );
        const previewButton = previewButtons[${previewIndex}];

        if (!previewButton || previewButton.disabled) {
          return false;
        }

        previewButton.click();
        return true;
      })()`);
      assert.equal(clickedPreview, true, `Expected Warburg preview ${previewIndex + 1} to be selectable`);

      return waitForCondition(
        async () => {
          const candidateState = await evaluate(extractStateScript);

          if (
            candidateState?.fields?.company === "Warburg Pincus" &&
            candidateState?.fields?.booker === "Jill Van Cook" &&
            candidateState?.fields?.vehicle === "Sedan" &&
            candidateState?.fields?.flight === expectedFlight
          ) {
            return candidateState;
          }

          return false;
        },
        10000,
        `selected Warburg preview ${previewIndex + 1} UI state`,
      );
    };

    const selectedWarburgArrivalState = await parseWarburgPreview(0, "SG423");
    selectedWarburgArrivalState.errors = [
      ...browserErrors,
      ...(selectedWarburgArrivalState.errors || []),
    ];
    selectedWarburgArrivalState.consoleErrors = [
      ...browserConsoleErrors,
      ...(selectedWarburgArrivalState.consoleErrors || []),
    ];

    assert.deepEqual(
      selectedWarburgArrivalState.errors,
      [],
      `Expected no browser runtime errors, got ${selectedWarburgArrivalState.errors.join("\n")}`,
    );
    assert.deepEqual(
      selectedWarburgArrivalState.consoleErrors,
      [],
      `Expected no browser console errors, got ${selectedWarburgArrivalState.consoleErrors.join("\n")}`,
    );
    assert.equal(selectedWarburgArrivalState.fields.company, "Warburg Pincus");
    assert.equal(selectedWarburgArrivalState.fields.booker, "Jill Van Cook");
    assert.equal(selectedWarburgArrivalState.fields.vehicle, "Sedan");
    assert.equal(selectedWarburgArrivalState.fields.bookingType, "MNG");
    assert.equal(selectedWarburgArrivalState.fields.pickupDate, "2026-02-06");
    assert.equal(selectedWarburgArrivalState.fields.pickupTime, "0730hrs");
    assert.equal(selectedWarburgArrivalState.fields.flight, "SG423");
    assert.equal(selectedWarburgArrivalState.fields.pickup, "Changi Airport");
    assert.match(selectedWarburgArrivalState.fields.dropoff, /The Ritz/);
    assert.equal(selectedWarburgArrivalState.fields.name, "Mark Colodny");
    assert.doesNotMatch(selectedWarburgArrivalState.fields.vehicle, /^AVF$/);
    assert.match(selectedWarburgArrivalState.jobCardPreview, /Sedan MNG/);
    assert.doesNotMatch(selectedWarburgArrivalState.jobCardPreview, /AVF MNG/);
    assert.match(selectedWarburgArrivalState.driverDispatch, /Sedan MNG/);

    const selectedWarburgDepartureState = await parseWarburgPreview(1, "SG34");
    selectedWarburgDepartureState.errors = [
      ...browserErrors,
      ...(selectedWarburgDepartureState.errors || []),
    ];
    selectedWarburgDepartureState.consoleErrors = [
      ...browserConsoleErrors,
      ...(selectedWarburgDepartureState.consoleErrors || []),
    ];

    assert.deepEqual(
      selectedWarburgDepartureState.errors,
      [],
      `Expected no browser runtime errors, got ${selectedWarburgDepartureState.errors.join("\n")}`,
    );
    assert.deepEqual(
      selectedWarburgDepartureState.consoleErrors,
      [],
      `Expected no browser console errors, got ${selectedWarburgDepartureState.consoleErrors.join("\n")}`,
    );
    assert.equal(selectedWarburgDepartureState.fields.company, "Warburg Pincus");
    assert.equal(selectedWarburgDepartureState.fields.booker, "Jill Van Cook");
    assert.equal(selectedWarburgDepartureState.fields.vehicle, "Sedan");
    assert.equal(selectedWarburgDepartureState.fields.bookingType, "DEP");
    assert.equal(selectedWarburgDepartureState.fields.pickupDate, "2026-02-06");
    assert.equal(selectedWarburgDepartureState.fields.pickupTime, "1500hrs");
    assert.equal(selectedWarburgDepartureState.fields.flight, "SG34");
    assert.match(selectedWarburgDepartureState.fields.pickup, /The Ritz/);
    assert.equal(selectedWarburgDepartureState.fields.dropoff, "Changi Airport");
    assert.equal(selectedWarburgDepartureState.fields.name, "Mark Colodny");
    assert.doesNotMatch(selectedWarburgDepartureState.fields.vehicle, /^AVF$/);
    assert.match(selectedWarburgDepartureState.jobCardPreview, /Sedan DEP/);
    assert.doesNotMatch(selectedWarburgDepartureState.jobCardPreview, /AVF DEP/);
    assert.match(selectedWarburgDepartureState.driverDispatch, /Sedan DEP/);

    const parseAirportTransferReturnPreview = async (previewIndex, expectedFlight) => {
      const focusedTextarea = await evaluate(`(() => {
        const textarea = document.querySelector("textarea");
        if (!textarea) {
          return false;
        }

        textarea.focus();
        textarea.select();
        return document.activeElement === textarea;
      })()`);
      assert.equal(focusedTextarea, true, "Expected textarea to be focused for airport return transfer sample");

      await client.send("Input.insertText", { text: airportTransferReturnTransferSample });

      const filledTextarea = await evaluate(
        `document.querySelector("textarea")?.value === ${JSON.stringify(airportTransferReturnTransferSample)}`,
      );
      assert.equal(filledTextarea, true, "Expected airport return transfer sample textarea to be filled");

      const clickedParse = await evaluate(`(() => {
        const parseButton = [...document.querySelectorAll("button")].find(
          (button) => button.textContent.trim() === "Create Job Card",
        );

        if (!parseButton || parseButton.disabled) {
          return false;
        }

        parseButton.click();
        return true;
      })()`);
      assert.equal(clickedParse, true, "Expected Create Job Card button for airport return transfer sample");

      await waitForCondition(
        () =>
          evaluate(`(() => {
            const bodyText = document.body.innerText;

            return bodyText.includes("Multiple bookings detected. Please select one extracted booking.") &&
              bodyText.includes("extractedBookingsPreview.length: 2") &&
              bodyText.includes("SQ108") &&
              bodyText.includes("SQ121") &&
              [...document.querySelectorAll("button")].filter(
                (button) => button.textContent.trim() === "Use this booking",
              ).length >= 2;
          })()`),
        10000,
        "airport return transfer preview choices",
      );

      const clickedPreview = await evaluate(`(() => {
        const previewButtons = [...document.querySelectorAll("button")].filter(
          (button) => button.textContent.trim() === "Use this booking",
        );
        const previewButton = previewButtons[${previewIndex}];

        if (!previewButton || previewButton.disabled) {
          return false;
        }

        previewButton.click();
        return true;
      })()`);
      assert.equal(clickedPreview, true, `Expected airport return preview ${previewIndex + 1} to be selectable`);

      return waitForCondition(
        async () => {
          const candidateState = await evaluate(extractStateScript);

          if (
            candidateState?.fields?.flight === expectedFlight &&
            candidateState?.fields?.name === "Mr Peter" &&
            candidateState?.fields?.pax === "1"
          ) {
            return candidateState;
          }

          return false;
        },
        10000,
        `selected airport return preview ${previewIndex + 1} UI state`,
      );
    };

    const selectedAirportDepartureState = await parseAirportTransferReturnPreview(0, "SQ108");
    selectedAirportDepartureState.errors = [
      ...browserErrors,
      ...(selectedAirportDepartureState.errors || []),
    ];
    selectedAirportDepartureState.consoleErrors = [
      ...browserConsoleErrors,
      ...(selectedAirportDepartureState.consoleErrors || []),
    ];

    assert.deepEqual(
      selectedAirportDepartureState.errors,
      [],
      `Expected no browser runtime errors, got ${selectedAirportDepartureState.errors.join("\n")}`,
    );
    assert.deepEqual(
      selectedAirportDepartureState.consoleErrors,
      [],
      `Expected no browser console errors, got ${selectedAirportDepartureState.consoleErrors.join("\n")}`,
    );
    assert.equal(selectedAirportDepartureState.fields.bookingType, "DEP");
    assert.equal(selectedAirportDepartureState.fields.pickupDate, "2026-05-20");
    assert.equal(selectedAirportDepartureState.fields.pickupTime, "0645hrs");
    assert.equal(selectedAirportDepartureState.fields.flight, "SQ108");
    assert.equal(selectedAirportDepartureState.fields.pickup, "276 Ocean Drive lobby O");
    assert.equal(selectedAirportDepartureState.fields.dropoff, "Changi Airport");
    assert.equal(selectedAirportDepartureState.fields.name, "Mr Peter");
    assert.equal(selectedAirportDepartureState.fields.pax, "1");
    assert.doesNotMatch(selectedAirportDepartureState.fieldText, /Changi Airport T[1-4]/);

    const selectedAirportArrivalState = await parseAirportTransferReturnPreview(1, "SQ121");
    selectedAirportArrivalState.errors = [
      ...browserErrors,
      ...(selectedAirportArrivalState.errors || []),
    ];
    selectedAirportArrivalState.consoleErrors = [
      ...browserConsoleErrors,
      ...(selectedAirportArrivalState.consoleErrors || []),
    ];

    assert.deepEqual(
      selectedAirportArrivalState.errors,
      [],
      `Expected no browser runtime errors, got ${selectedAirportArrivalState.errors.join("\n")}`,
    );
    assert.deepEqual(
      selectedAirportArrivalState.consoleErrors,
      [],
      `Expected no browser console errors, got ${selectedAirportArrivalState.consoleErrors.join("\n")}`,
    );
    assert.equal(selectedAirportArrivalState.fields.bookingType, "MNG");
    assert.equal(selectedAirportArrivalState.fields.pickupDate, "2026-05-22");
    assert.equal(selectedAirportArrivalState.fields.pickupTime, "2000hrs");
    assert.equal(selectedAirportArrivalState.fields.flight, "SQ121");
    assert.equal(selectedAirportArrivalState.fields.pickup, "Changi Airport");
    assert.equal(selectedAirportArrivalState.fields.dropoff, "276 Ocean Drive lobby O");
    assert.equal(selectedAirportArrivalState.fields.name, "Mr Peter");
    assert.equal(selectedAirportArrivalState.fields.pax, "1");
    assert.doesNotMatch(selectedAirportArrivalState.fieldText, /Changi Airport T[1-4]/);

    const focusedAirportDepartureTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedAirportDepartureTextarea,
      true,
      "Expected booking message textarea to be focused for airport departure to airport sample",
    );

    await client.send("Input.insertText", { text: airportDepartureToAirportForFlightSample });

    const filledAirportDepartureTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(airportDepartureToAirportForFlightSample)}`,
    );
    assert.equal(
      filledAirportDepartureTextarea,
      true,
      "Expected airport departure to airport booking message textarea to be filled",
    );

    const clickedAirportDepartureParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Create Job Card",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(
      clickedAirportDepartureParse,
      true,
      "Expected Create Job Card button to parse airport departure to airport sample",
    );

    const airportDepartureState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.bookingType === "DEP" &&
          candidateState?.fields?.flight === "SQ306" &&
          candidateState?.fields?.dropoff === "Changi Airport"
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed airport departure to airport UI state",
    );
    airportDepartureState.errors = [...browserErrors, ...(airportDepartureState.errors || [])];
    airportDepartureState.consoleErrors = [
      ...browserConsoleErrors,
      ...(airportDepartureState.consoleErrors || []),
    ];

    assert.deepEqual(
      airportDepartureState.errors,
      [],
      `Expected no browser runtime errors, got ${airportDepartureState.errors.join("\n")}`,
    );
    assert.deepEqual(
      airportDepartureState.consoleErrors,
      [],
      `Expected no browser console errors, got ${airportDepartureState.consoleErrors.join("\n")}`,
    );
    assert.equal(airportDepartureState.fields.bookingType, "DEP");
    assert.equal(airportDepartureState.fields.vehicle, "AVF");
    assert.equal(airportDepartureState.fields.pickupDate, mrLeeExpectedPickupDate);
    assert.equal(airportDepartureState.fields.pickupTime, mrLeeExpectedPickupTime);
    assert.equal(airportDepartureState.fields.flight, "SQ306");
    assert.equal(airportDepartureState.fields.pickup, "10 Scotts Road");
    assert.equal(airportDepartureState.fields.dropoff, "Changi Airport");
    assert.equal(airportDepartureState.fields.name, "Mr Lee");
    assert.equal(airportDepartureState.fields.pax, "2");
    assert.equal(airportDepartureState.fields.company, "");
    assert.ok(
      airportDepartureState.jobCardPreview.includes(mrLeeExpectedCardDateTime),
      "Expected parsed Mr Lee test job card preview to preserve exact pickup date/time",
    );
    assert.doesNotMatch(airportDepartureState.fieldText, /airport for|Changi Airport T[1-4]/i);
    assert.doesNotMatch(
      airportDepartureState.visibleText,
      /Missing pickup date|Missing pickup time|Missing pickup|Missing drop-off|Missing traveler \/ name/,
    );

    const markedMrLeeSaveFixture = await evaluate(`(() => {
      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const label = [...document.querySelectorAll("label")].find(
        (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === "Passenger name",
      );
      const input = label?.querySelector("input");

      if (!input) {
        return false;
      }

      const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
      descriptor?.set?.call(input, ${JSON.stringify(mrLeeSaveTravelerName)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return input.value === ${JSON.stringify(mrLeeSaveTravelerName)};
    })()`);
    assert.equal(
      markedMrLeeSaveFixture,
      true,
      "Expected Mr Lee save fixture to be marked visibly as a browser UI test booking before saving",
    );

    await evaluate(`(() => {
      const savedBooking = ${JSON.stringify(mrLeeNoCompanySavedBookingFixture)};
      const jsonResponse = (body, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });

      window.__prestigeFetchCalls = [];
      window.__prestigeMrLeeSaveRequestBodies = [];
      window.__prestigeUnhandledSupabaseCalls = [];
      window.__prestigeOriginalFetch = window.__prestigeOriginalFetch || window.fetch.bind(window);
      window.fetch = async (...args) => {
        const target = args[0]?.url || args[0];
        const url = String(target);
        const method = args[1]?.method || args[0]?.method || "GET";
        const bodyText = typeof args[1]?.body === "string" ? args[1].body : "";

        window.__prestigeFetchCalls.push(\`\${method} \${url}\`);
        if (bodyText) {
          try {
            window.__prestigeMrLeeSaveRequestBodies.push({
              method,
              url,
              body: JSON.parse(bodyText),
            });
          } catch {
            window.__prestigeMrLeeSaveRequestBodies.push({ method, url, body: bodyText });
          }
        }

        if (!url.includes("/rest/v1/")) {
          return window.__prestigeOriginalFetch(...args);
        }

        if (url.includes("/rest/v1/bookers") && method === "GET") {
          return jsonResponse([]);
        }

        if (url.includes("/rest/v1/travelers") && method === "GET") {
          return jsonResponse([]);
        }

        if (url.includes("/rest/v1/bookings")) {
          if (method === "POST") {
            return jsonResponse({ id: savedBooking.id }, 201);
          }

          if (method === "GET") {
            return jsonResponse([savedBooking]);
          }
        }

        window.__prestigeUnhandledSupabaseCalls.push(\`\${method} \${url}\`);
        return jsonResponse({ message: "Unhandled Supabase mock" }, 500);
      };
    })()`);

    const clickedMrLeeNoCompanySave = await evaluate(`(() => {
      const saveButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Save Booking + CRM",
      );

      if (!saveButton || saveButton.disabled) {
        return false;
      }

      saveButton.click();
      return true;
    })()`);
    assert.equal(clickedMrLeeNoCompanySave, true, "Expected Mr Lee no-company save button to be clickable");

    const mrLeeNoCompanySaveState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const bodyText = document.body.innerText;
          const bookingInsert = (window.__prestigeMrLeeSaveRequestBodies || []).find(
            (entry) => entry.method === "POST" && String(entry.url).includes("/rest/v1/bookings"),
          );

          return bodyText.includes("Booking saved successfully: ${mrLeeNoCompanySavedBookingFixture.id}")
            ? {
                bodyText,
                fetchCalls: window.__prestigeFetchCalls || [],
                requestBodies: window.__prestigeMrLeeSaveRequestBodies || [],
                unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
                bookingInsert: bookingInsert?.body || null,
              }
            : false;
        })()`);

        return candidateState || false;
      },
      10000,
      "Mr Lee no-company successful save",
    );

    assert.deepEqual(
      mrLeeNoCompanySaveState.unhandledSupabaseCalls,
      [],
      `Expected Mr Lee no-company save to mock every Supabase call, got ${mrLeeNoCompanySaveState.unhandledSupabaseCalls.join(", ")}`,
    );
    assert.equal(mrLeeNoCompanySaveState.bookingInsert?.company_id, null);
    assert.equal(mrLeeNoCompanySaveState.bookingInsert?.booker_id, null);
    assert.equal(mrLeeNoCompanySaveState.bookingInsert?.traveler_id, null);
    assert.equal(mrLeeNoCompanySaveState.bookingInsert?.booking_type, "DEP");
    assert.equal(mrLeeNoCompanySaveState.bookingInsert?.vehicle, "AVF");
    assert.equal(mrLeeNoCompanySaveState.bookingInsert?.pickup_time, mrLeeExpectedStoragePickupTime);
    assert.equal(mrLeeNoCompanySaveState.bookingInsert?.pickup_address, "10 Scotts Road");
    assert.equal(mrLeeNoCompanySaveState.bookingInsert?.dropoff_address, "Changi Airport");
    assert.equal(mrLeeNoCompanySaveState.bookingInsert?.flight_no, "SQ306");
    assert.ok(
      (mrLeeNoCompanySaveState.bookingInsert?.job_card || "").includes(mrLeeExpectedCardDateTime),
      "Expected saved Mr Lee browser fixture job card to preserve exact pickup date/time",
    );
    assert.match(
      mrLeeNoCompanySaveState.bookingInsert?.job_card || "",
      /BROWSER UI TEST Mr Lee/,
      "Expected saved browser fixture job card to be visibly test-only",
    );
    assert.equal(mrLeeNoCompanySaveState.bookingInsert?.pax, 2);
    assert.equal(
      mrLeeNoCompanySaveState.fetchCalls.some(
        (call) => call.includes("/rest/v1/companies") && call.startsWith("POST "),
      ),
      false,
      "Expected blank Company / Account not to create a fake company",
    );
    assert.equal(
      mrLeeNoCompanySaveState.fetchCalls.some(
        (call) =>
          (call.includes("/rest/v1/bookers") || call.includes("/rest/v1/travelers")) &&
          call.startsWith("POST "),
      ),
      false,
      "Expected blank Company / Account not to create CRM booker/traveler records",
    );
    assert.doesNotMatch(mrLeeNoCompanySaveState.bodyText, /Booking saved successfully\. CRM update failed/i);
    assert.doesNotMatch(mrLeeNoCompanySaveState.bodyText, /Booking saved, but CRM update failed/i);
    assert.doesNotMatch(mrLeeNoCompanySaveState.bodyText, /Company:\s*(?:Mr Lee|Internal Account|Draft)/i);

    await clickTab("Bookings", "Recent Bookings");
    const mrLeeNoCompanyRecentCardState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("SQ306") &&
              candidate.innerText.includes(${JSON.stringify(mrLeeSaveTravelerName)}) &&
              [...candidate.querySelectorAll("button")].some(
                (button) =>
                  button.textContent.trim() === "Load this booking" &&
                  !button.matches("[data-dashboard-load-booking='true']"),
              ),
          );

          return article
            ? {
                articleText: article.innerText,
                hasLoadButton: [...article.querySelectorAll("button")].some(
                  (button) =>
                    button.textContent.trim() === "Load this booking" &&
                    !button.matches("[data-dashboard-load-booking='true']"),
                ),
              }
            : false;
        })()`),
      10000,
      "Mr Lee no-company saved booking in Recent Bookings",
    );
    assert.equal(mrLeeNoCompanyRecentCardState.hasLoadButton, true);
    assert.match(mrLeeNoCompanyRecentCardState.articleText, /BROWSER UI TEST Mr Lee/);
    assert.ok(
      mrLeeNoCompanyRecentCardState.articleText.includes(mrLeeExpectedCardDateTime),
      "Expected Bookings card to show exact Mr Lee test pickup date/time",
    );

    await clickTab("Dashboard", "Operations Dashboard");
    const mrLeeNoCompanyDashboardCardState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("SQ306") &&
              candidate.innerText.includes(${JSON.stringify(mrLeeSaveTravelerName)}),
          );

          return article
            ? {
                articleText: article.innerText,
                hasDashboardLoadButton: Boolean(article.querySelector("[data-dashboard-load-booking='true']")),
              }
            : false;
        })()`),
      10000,
      "Mr Lee no-company saved booking on Dashboard",
    );
    assert.equal(mrLeeNoCompanyDashboardCardState.hasDashboardLoadButton, true);
    assert.match(mrLeeNoCompanyDashboardCardState.articleText, /BROWSER UI TEST Mr Lee/);
    assert.ok(
      mrLeeNoCompanyDashboardCardState.articleText.includes(mrLeeExpectedCardDateTime),
      "Expected Dashboard card to show exact Mr Lee test pickup date/time",
    );

    await evaluate(`window.__prestigeCopiedTexts = []`);
    const clickedLegacyMrLeeDashboardCopy = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("SQ306") &&
          candidate.innerText.includes(${JSON.stringify(mrLeeSaveTravelerName)}),
      );
      const copyButton = article?.querySelector("[data-dashboard-copy-job-card='${mrLeeNoCompanySavedBookingFixture.id}']");

      if (!copyButton || copyButton.disabled) {
        return false;
      }

      copyButton.click();
      return true;
    })()`);
    assert.equal(
      clickedLegacyMrLeeDashboardCopy,
      true,
      "Expected legacy Mr Lee Dashboard Copy WhatsApp Job Card button to be clickable",
    );

    const legacyMrLeeDashboardCopyState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const copiedText = (window.__prestigeCopiedTexts || []).slice(-1)[0] || "";
          const feedback = document.querySelector("[data-dashboard-copy-feedback='${mrLeeNoCompanySavedBookingFixture.id}:jobCard']");

          return feedback?.textContent.trim() === "Booking job card copied."
            ? {
                copiedText,
                feedbackText: feedback.textContent.trim(),
              }
            : false;
        })()`),
      10000,
      "legacy Mr Lee Dashboard job card copy",
    );
    assert.match(legacyMrLeeDashboardCopyState.copiedText, /BROWSER UI TEST Mr Lee/);
    assert.doesNotMatch(
      legacyMrLeeDashboardCopyState.copiedText,
      /^Name:\s*Mr Lee\s*$/im,
      "Expected copied legacy Mr Lee job card not to expose plain unmarked Mr Lee",
    );
    assert.ok(
      legacyMrLeeDashboardCopyState.copiedText.includes(mrLeeExpectedCardDateTime),
      "Expected copied legacy Mr Lee job card to preserve exact pickup date/time",
    );

    await clickTab("Bookings", "Recent Bookings");

    const clickedMrLeeNoCompanyRecentLoad = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("SQ306") &&
          candidate.innerText.includes(${JSON.stringify(mrLeeSaveTravelerName)}) &&
          [...candidate.querySelectorAll("button")].some(
            (button) =>
              button.textContent.trim() === "Load this booking" &&
              !button.matches("[data-dashboard-load-booking='true']"),
          ),
      );
      const loadButton = [...(article?.querySelectorAll("button") || [])].find(
        (button) =>
          button.textContent.trim() === "Load this booking" &&
          !button.matches("[data-dashboard-load-booking='true']"),
      );

      if (!loadButton || loadButton.disabled) {
        return false;
      }

      loadButton.click();
      return true;
    })()`);
    assert.equal(clickedMrLeeNoCompanyRecentLoad, true, "Expected Mr Lee saved booking to reload from Recent Bookings");

    const mrLeeNoCompanyReloadState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        return candidateState?.fields?.flight === "SQ306" &&
          candidateState?.fields?.pickup === "10 Scotts Road" &&
          candidateState?.fields?.dropoff === "Changi Airport"
          ? candidateState
          : false;
      },
      10000,
      "Mr Lee no-company saved booking reload",
    );

    assert.equal(mrLeeNoCompanyReloadState.fields.company, "");
    assert.equal(mrLeeNoCompanyReloadState.fields.bookingType, "DEP");
    assert.equal(mrLeeNoCompanyReloadState.fields.vehicle, "AVF");
    assert.equal(mrLeeNoCompanyReloadState.fields.pickupDate, mrLeeExpectedPickupDate);
    assert.equal(mrLeeNoCompanyReloadState.fields.pickupTime, mrLeeExpectedPickupTime);
    assert.equal(mrLeeNoCompanyReloadState.fields.flight, "SQ306");
    assert.equal(mrLeeNoCompanyReloadState.fields.pickup, "10 Scotts Road");
    assert.equal(mrLeeNoCompanyReloadState.fields.dropoff, "Changi Airport");
    assert.equal(mrLeeNoCompanyReloadState.fields.name, mrLeeSaveTravelerName);
    assert.equal(mrLeeNoCompanyReloadState.fields.pax, "2");
    assert.ok(
      mrLeeNoCompanyReloadState.jobCardPreview.includes(mrLeeExpectedCardDateTime),
      "Expected loaded Mr Lee test booking preview to preserve exact pickup date/time",
    );

    const setExistingCompanyOnMrLee = await evaluate(`(() => {
      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const label = [...document.querySelectorAll("label")].find(
        (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === "Company / Account",
      );
      const input = label?.querySelector("input");

      if (!input) {
        return false;
      }

      const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
      descriptor?.set?.call(input, "EXISTING CRM COMPANY");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    assert.equal(setExistingCompanyOnMrLee, true, "Expected Company / Account to be editable for existing company save");

    await evaluate(`(() => {
      const savedBooking = ${JSON.stringify(mrLeeExistingCompanySavedBookingFixture)};
      const companyRecord = {
        id: savedBooking.company_id,
        company_name: savedBooking.companies.company_name,
        domain: savedBooking.companies.domain,
        customer_rates: {},
        driver_payout_rules: {},
        transzend_excel_privacy: false,
      };
      const travelerRecord = {
        id: savedBooking.traveler_id,
        company_id: savedBooking.company_id,
        traveler_name: savedBooking.travelers.traveler_name,
        preferred_vehicle: savedBooking.vehicle,
        default_address: savedBooking.pickup_address,
        default_pickup_address: savedBooking.pickup_address,
        default_dropoff_address: "",
        booker_id: null,
        booker_name: null,
        booker_contact: null,
        booker_email: null,
        customer_rates: {},
        driver_payout_rules: {},
      };
      const savedAddressRecord = {
        id: 904,
        company_id: savedBooking.company_id,
        traveler_id: savedBooking.traveler_id,
        label: "Default",
        address: savedBooking.pickup_address,
        address_role: "traveler_default",
        is_default: true,
        use_count: 1,
      };
      const jsonResponse = (body, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });

      window.__prestigeFetchCalls = [];
      window.__prestigeExistingCompanySaveRequestBodies = [];
      window.__prestigeUnhandledSupabaseCalls = [];
      window.__prestigeExistingCompanyLookupCount = 0;
      window.__prestigeOriginalFetch = window.__prestigeOriginalFetch || window.fetch.bind(window);
      window.fetch = async (...args) => {
        const target = args[0]?.url || args[0];
        const url = String(target);
        const method = args[1]?.method || args[0]?.method || "GET";
        const bodyText = typeof args[1]?.body === "string" ? args[1].body : "";

        window.__prestigeFetchCalls.push(\`\${method} \${url}\`);
        if (bodyText) {
          try {
            window.__prestigeExistingCompanySaveRequestBodies.push({
              method,
              url,
              body: JSON.parse(bodyText),
            });
          } catch {
            window.__prestigeExistingCompanySaveRequestBodies.push({ method, url, body: bodyText });
          }
        }

        if (!url.includes("/rest/v1/")) {
          return window.__prestigeOriginalFetch(...args);
        }

        if (url.includes("/rest/v1/companies")) {
          if (method === "GET") {
            window.__prestigeExistingCompanyLookupCount += 1;
            return jsonResponse(window.__prestigeExistingCompanyLookupCount === 1 ? [] : companyRecord);
          }

          if (method === "POST") {
            return jsonResponse(
              {
                code: "23505",
                message: 'duplicate key value violates unique constraint "companies_company_name_key"',
              },
              409,
            );
          }
        }

        if (url.includes("/rest/v1/travelers")) {
          if (method === "GET") {
            return jsonResponse([]);
          }

          if (method === "POST") {
            return jsonResponse(travelerRecord, 201);
          }

          if (method === "PATCH") {
            return jsonResponse({});
          }
        }

        if (url.includes("/rest/v1/saved_addresses")) {
          if (method === "GET") {
            return jsonResponse([]);
          }

          if (method === "POST") {
            return jsonResponse(savedAddressRecord, 201);
          }
        }

        if (url.includes("/rest/v1/bookings")) {
          if (method === "POST") {
            return jsonResponse({ id: savedBooking.id }, 201);
          }

          if (method === "GET") {
            return jsonResponse([savedBooking]);
          }
        }

        window.__prestigeUnhandledSupabaseCalls.push(\`\${method} \${url}\`);
        return jsonResponse({ message: "Unhandled Supabase mock" }, 500);
      };
    })()`);

    const clickedMrLeeExistingCompanySave = await evaluate(`(() => {
      const saveButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Save Booking + CRM",
      );

      if (!saveButton || saveButton.disabled) {
        return false;
      }

      saveButton.click();
      return true;
    })()`);
    assert.equal(
      clickedMrLeeExistingCompanySave,
      true,
      "Expected Mr Lee existing-company save button to be clickable",
    );

    const mrLeeExistingCompanySaveState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const bodyText = document.body.innerText;
          const bookingInsert = (window.__prestigeExistingCompanySaveRequestBodies || []).find(
            (entry) => entry.method === "POST" && String(entry.url).includes("/rest/v1/bookings"),
          );

          return bodyText.includes("Booking saved successfully: ${mrLeeExistingCompanySavedBookingFixture.id}")
            ? {
                bodyText,
                fetchCalls: window.__prestigeFetchCalls || [],
                requestBodies: window.__prestigeExistingCompanySaveRequestBodies || [],
                unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
                bookingInsert: bookingInsert?.body || null,
              }
            : false;
        })()`);

        return candidateState || false;
      },
      10000,
      "Mr Lee existing-company duplicate recovery save",
    );

    assert.deepEqual(
      mrLeeExistingCompanySaveState.unhandledSupabaseCalls,
      [],
      `Expected Mr Lee existing-company save to mock every Supabase call, got ${mrLeeExistingCompanySaveState.unhandledSupabaseCalls.join(", ")}`,
    );
    assert.equal(mrLeeExistingCompanySaveState.bookingInsert?.company_id, 901);
    assert.equal(mrLeeExistingCompanySaveState.bookingInsert?.traveler_id, 903);
    assert.equal(mrLeeExistingCompanySaveState.bookingInsert?.booking_type, "DEP");
    assert.equal(mrLeeExistingCompanySaveState.bookingInsert?.pickup_address, "10 Scotts Road");
    assert.equal(mrLeeExistingCompanySaveState.bookingInsert?.dropoff_address, "Changi Airport");
    assert.equal(mrLeeExistingCompanySaveState.bookingInsert?.flight_no, "SQ306");
    assert.match(
      mrLeeExistingCompanySaveState.bookingInsert?.job_card || "",
      /BROWSER UI TEST Mr Lee/,
      "Expected existing-company save fixture job card to remain visibly test-only",
    );
    assert.equal(
      mrLeeExistingCompanySaveState.fetchCalls.some(
        (call) => call.includes("/rest/v1/companies") && call.startsWith("POST "),
      ),
      true,
      "Expected duplicate company insert race to be exercised",
    );
    assert.doesNotMatch(mrLeeExistingCompanySaveState.bodyText, /CRM update failed/i);

    const setCrmFailureCompanyOnMrLee = await evaluate(`(() => {
      const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
      const label = [...document.querySelectorAll("label")].find(
        (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === "Company / Account",
      );
      const input = label?.querySelector("input");

      if (!input) {
        return false;
      }

      const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
      descriptor?.set?.call(input, "CRM FAILURE COMPANY");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    assert.equal(setCrmFailureCompanyOnMrLee, true, "Expected Company / Account to be editable for CRM failure save");

    await evaluate(`(() => {
      const savedBooking = ${JSON.stringify(mrLeeCrmFailureSavedBookingFixture)};
      const jsonResponse = (body, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });

      window.__prestigeFetchCalls = [];
      window.__prestigeCrmFailureSaveRequestBodies = [];
      window.__prestigeUnhandledSupabaseCalls = [];
      window.__prestigeOriginalFetch = window.__prestigeOriginalFetch || window.fetch.bind(window);
      window.fetch = async (...args) => {
        const target = args[0]?.url || args[0];
        const url = String(target);
        const method = args[1]?.method || args[0]?.method || "GET";
        const bodyText = typeof args[1]?.body === "string" ? args[1].body : "";

        window.__prestigeFetchCalls.push(\`\${method} \${url}\`);
        if (bodyText) {
          try {
            window.__prestigeCrmFailureSaveRequestBodies.push({
              method,
              url,
              body: JSON.parse(bodyText),
            });
          } catch {
            window.__prestigeCrmFailureSaveRequestBodies.push({ method, url, body: bodyText });
          }
        }

        if (!url.includes("/rest/v1/")) {
          return window.__prestigeOriginalFetch(...args);
        }

        if (url.includes("/rest/v1/companies")) {
          if (method === "GET") {
            return jsonResponse([]);
          }

          if (method === "POST") {
            return jsonResponse({ message: "CRM service unavailable" }, 500);
          }
        }

        if (url.includes("/rest/v1/bookers") && method === "GET") {
          return jsonResponse([]);
        }

        if (url.includes("/rest/v1/travelers") && method === "GET") {
          return jsonResponse([]);
        }

        if (url.includes("/rest/v1/bookings")) {
          if (method === "POST") {
            return jsonResponse({ id: savedBooking.id }, 201);
          }

          if (method === "GET") {
            return jsonResponse([savedBooking]);
          }
        }

        window.__prestigeUnhandledSupabaseCalls.push(\`\${method} \${url}\`);
        return jsonResponse({ message: "Unhandled Supabase mock" }, 500);
      };
    })()`);

    const clickedMrLeeCrmFailureSave = await evaluate(`(() => {
      const saveButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Save Booking + CRM",
      );

      if (!saveButton || saveButton.disabled) {
        return false;
      }

      saveButton.click();
      return true;
    })()`);
    assert.equal(clickedMrLeeCrmFailureSave, true, "Expected Mr Lee CRM failure save button to be clickable");

    const mrLeeCrmFailureSaveState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const bodyText = document.body.innerText;
          const bookingInsert = (window.__prestigeCrmFailureSaveRequestBodies || []).find(
            (entry) => entry.method === "POST" && String(entry.url).includes("/rest/v1/bookings"),
          );

          return bodyText.includes("Booking saved, but CRM update failed:")
            ? {
                bodyText,
                fetchCalls: window.__prestigeFetchCalls || [],
                unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
                bookingInsert: bookingInsert?.body || null,
              }
            : false;
        })()`);

        return candidateState || false;
      },
      10000,
      "Mr Lee CRM failure save warning",
    );

    assert.deepEqual(
      mrLeeCrmFailureSaveState.unhandledSupabaseCalls,
      [],
      `Expected Mr Lee CRM failure save to mock every Supabase call, got ${mrLeeCrmFailureSaveState.unhandledSupabaseCalls.join(", ")}`,
    );
    assert.equal(mrLeeCrmFailureSaveState.bookingInsert?.company_id, null);
    assert.match(mrLeeCrmFailureSaveState.bodyText, /Booking saved, but CRM update failed: CRM service unavailable/);
    assert.doesNotMatch(mrLeeCrmFailureSaveState.bodyText, /Booking saved successfully\. CRM update failed/i);
    assert.doesNotMatch(mrLeeCrmFailureSaveState.bodyText, /Booking saved successfully: ui-mr-lee-crm-failure-save-fixture/);

    await evaluate(`window.fetch = window.__prestigeOriginalFetch || window.fetch`);

    const clickedClearBeforeExactPaste = await evaluate(`(() => {
      const clearButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Clear",
      );

      if (!clearButton || clearButton.disabled) {
        return false;
      }

      clearButton.click();
      return true;
    })()`);
    assert.equal(clickedClearBeforeExactPaste, true, "Expected Clear button before exact pasted waypoint sample");

    const focusedExactPasteTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedExactPasteTextarea,
      true,
      "Expected booking message textarea to be focused for exact pasted waypoint sample",
    );

    await client.send("Input.insertText", { text: exactPastedWaypointAirportArrivalSample });

    const filledExactPasteTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(exactPastedWaypointAirportArrivalSample)}`,
    );
    assert.equal(
      filledExactPasteTextarea,
      true,
      "Expected exact pasted waypoint booking message textarea to be filled",
    );

    const clickedExactPasteParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Create Job Card",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(
      clickedExactPasteParse,
      true,
      "Expected Create Job Card button to parse exact pasted waypoint sample",
    );

    const exactPasteState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.flight === "SQ883" &&
          candidateState?.fields?.pickupTime === "0705hrs" &&
          candidateState?.fields?.dropoff === "26 Newton Rd, 307957"
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed exact pasted waypoint UI state",
    );
    exactPasteState.errors = [...browserErrors, ...(exactPasteState.errors || [])];
    exactPasteState.consoleErrors = [...browserConsoleErrors, ...(exactPasteState.consoleErrors || [])];

    assert.deepEqual(
      exactPasteState.errors,
      [],
      `Expected no browser runtime errors, got ${exactPasteState.errors.join("\n")}`,
    );
    assert.deepEqual(
      exactPasteState.consoleErrors,
      [],
      `Expected no browser console errors, got ${exactPasteState.consoleErrors.join("\n")}`,
    );
    assert.equal(exactPasteState.fields.pickupTime, "0705hrs");
    assert.equal(exactPasteState.fields.dropoff, "26 Newton Rd, 307957");
    assert.equal(exactPasteState.fields.name, "Pui Yu Chan");
    assert.equal(exactPasteState.fields.pax, "2");
    assert.equal(exactPasteState.fields.extraStopCount, "1");
    assert.equal(exactPasteState.fields.extraStopLocation, "28 Alexandra View, Singapore 158744");

    const focusedExactDepartureTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedExactDepartureTextarea,
      true,
      "Expected booking message textarea to be focused for exact pasted departure waypoint sample",
    );

    await client.send("Input.insertText", { text: exactPastedWaypointAirportDepartureSample });

    const filledExactDepartureTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(exactPastedWaypointAirportDepartureSample)}`,
    );
    assert.equal(
      filledExactDepartureTextarea,
      true,
      "Expected exact pasted departure waypoint booking message textarea to be filled",
    );

    const clickedExactDepartureParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Create Job Card",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(
      clickedExactDepartureParse,
      true,
      "Expected Create Job Card button to parse exact pasted departure waypoint sample",
    );

    const exactDepartureState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.flight === "TR288" &&
          candidateState?.fields?.vehicle === "E class" &&
          candidateState?.fields?.name === "Edien Joy" &&
          candidateState?.fields?.extraStopLocation === "351C Canberra Rd, Singapore 753351"
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed exact pasted departure waypoint UI state",
    );
    exactDepartureState.errors = [...browserErrors, ...(exactDepartureState.errors || [])];
    exactDepartureState.consoleErrors = [
      ...browserConsoleErrors,
      ...(exactDepartureState.consoleErrors || []),
    ];

    assert.deepEqual(
      exactDepartureState.errors,
      [],
      `Expected no browser runtime errors, got ${exactDepartureState.errors.join("\n")}`,
    );
    assert.deepEqual(
      exactDepartureState.consoleErrors,
      [],
      `Expected no browser console errors, got ${exactDepartureState.consoleErrors.join("\n")}`,
    );
    assert.equal(exactDepartureState.fields.company, "");
    assert.equal(exactDepartureState.fields.booker, "Luther Graham");
    assert.equal(exactDepartureState.fields.bookerContact, "+6580912613");
    assert.equal(exactDepartureState.fields.bookerEmail, "luthergrahambk@gmail.com");
    assert.equal(exactDepartureState.fields.bookingType, "DEP");
    assert.equal(exactDepartureState.fields.vehicle, "E class");
    assert.equal(exactDepartureState.fields.pickupDate, "2026-05-06");
    assert.equal(exactDepartureState.fields.pickupTime, "0800hrs");
    assert.equal(exactDepartureState.fields.flight, "TR288");
    assert.equal(exactDepartureState.fields.pickup, "756 Woodlands Ave 4, Singapore");
    assert.equal(exactDepartureState.fields.dropoff, "Changi Airport");
    assert.equal(exactDepartureState.fields.name, "Edien Joy");
    assert.equal(exactDepartureState.fields.pax, "2");
    assert.equal(exactDepartureState.fields.extraStopCount, "1");
    assert.equal(exactDepartureState.fields.extraStopLocation, "351C Canberra Rd, Singapore 753351");
    assert.equal(exactDepartureState.fields.customerPriceOverride, "110");

    const focusedRouteNameAirportTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedRouteNameAirportTextarea,
      true,
      "Expected booking message textarea to be focused for route-name Airport drop-off-only sample",
    );

    await client.send("Input.insertText", { text: routeNameAirportDropoffOnlySample });

    const filledRouteNameAirportTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(routeNameAirportDropoffOnlySample)}`,
    );
    assert.equal(
      filledRouteNameAirportTextarea,
      true,
      "Expected route-name Airport drop-off-only booking message textarea to be filled",
    );

    const clickedRouteNameAirportParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Create Job Card",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(
      clickedRouteNameAirportParse,
      true,
      "Expected Create Job Card button to parse route-name Airport drop-off-only sample",
    );

    const routeNameAirportState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.bookingType === "MNG" &&
          candidateState?.fields?.flight === "SQ238" &&
          candidateState?.fields?.pickup === "Changi Airport"
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed route-name Airport drop-off-only UI state",
    );
    routeNameAirportState.errors = [...browserErrors, ...(routeNameAirportState.errors || [])];
    routeNameAirportState.consoleErrors = [
      ...browserConsoleErrors,
      ...(routeNameAirportState.consoleErrors || []),
    ];

    assert.deepEqual(
      routeNameAirportState.errors,
      [],
      `Expected no browser runtime errors, got ${routeNameAirportState.errors.join("\n")}`,
    );
    assert.deepEqual(
      routeNameAirportState.consoleErrors,
      [],
      `Expected no browser console errors, got ${routeNameAirportState.consoleErrors.join("\n")}`,
    );
    assert.equal(routeNameAirportState.fields.company, "BAONLINE");
    assert.equal(routeNameAirportState.fields.booker, "pj");
    assert.equal(routeNameAirportState.fields.bookerContact, "+61419501117");
    assert.equal(routeNameAirportState.fields.bookerEmail, "pj@baonline.com.au");
    assert.equal(routeNameAirportState.fields.bookingType, "MNG");
    assert.equal(routeNameAirportState.fields.vehicle, "E class");
    assert.equal(routeNameAirportState.fields.pickupDate, "2026-04-30");
    assert.equal(routeNameAirportState.fields.pickupTime, "1530hrs");
    assert.equal(routeNameAirportState.fields.flight, "SQ238");
    assert.equal(routeNameAirportState.fields.pickup, "Changi Airport");
    assert.equal(routeNameAirportState.fields.dropoff, "333 Orchard Rd, Singapore 238867");
    assert.equal(routeNameAirportState.fields.name, "Peter Dynan");
    assert.equal(routeNameAirportState.fields.pax, "1");
    assert.equal(routeNameAirportState.fields.customerPriceOverride, "95");
    assert.doesNotMatch(routeNameAirportState.visibleText, /Missing pickup/);

    const focusedRouteNameAirportDepartureTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedRouteNameAirportDepartureTextarea,
      true,
      "Expected booking message textarea to be focused for route-name Airport pickup-only departure sample",
    );

    await client.send("Input.insertText", { text: routeNameAirportPickupOnlyDepartureInternalSample });

    const filledRouteNameAirportDepartureTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(routeNameAirportPickupOnlyDepartureInternalSample)}`,
    );
    assert.equal(
      filledRouteNameAirportDepartureTextarea,
      true,
      "Expected route-name Airport pickup-only departure booking message textarea to be filled",
    );

    const clickedRouteNameAirportDepartureParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Create Job Card",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(
      clickedRouteNameAirportDepartureParse,
      true,
      "Expected Create Job Card button to parse route-name Airport pickup-only departure sample",
    );

    const routeNameAirportDepartureState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.bookingType === "DEP" &&
          candidateState?.fields?.flight === "SQ265" &&
          candidateState?.fields?.dropoff === "Changi Airport" &&
          candidateState?.fields?.extraStopCount === "2" &&
          candidateState?.jobCardPreview?.includes("Bedok South")
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed route-name Airport pickup-only departure UI state",
    );
    routeNameAirportDepartureState.errors = [
      ...browserErrors,
      ...(routeNameAirportDepartureState.errors || []),
    ];
    routeNameAirportDepartureState.consoleErrors = [
      ...browserConsoleErrors,
      ...(routeNameAirportDepartureState.consoleErrors || []),
    ];

    assert.deepEqual(
      routeNameAirportDepartureState.errors,
      [],
      `Expected no browser runtime errors, got ${routeNameAirportDepartureState.errors.join("\n")}`,
    );
    assert.deepEqual(
      routeNameAirportDepartureState.consoleErrors,
      [],
      `Expected no browser console errors, got ${routeNameAirportDepartureState.consoleErrors.join("\n")}`,
    );
    assert.equal(routeNameAirportDepartureState.fields.company, "");
    assert.equal(routeNameAirportDepartureState.fields.bookingType, "DEP");
    assert.equal(routeNameAirportDepartureState.fields.vehicle, "AVF");
    assert.equal(routeNameAirportDepartureState.fields.pickupDate, "2026-04-30");
    assert.equal(routeNameAirportDepartureState.fields.pickupTime, "0420hrs");
    assert.equal(routeNameAirportDepartureState.fields.flight, "SQ265");
    assert.equal(routeNameAirportDepartureState.fields.pickup, "160 Watten Estate Rd, Singapore 287610");
    assert.equal(routeNameAirportDepartureState.fields.dropoff, "Changi Airport");
    assert.equal(routeNameAirportDepartureState.fields.bookerEmail, "luthergrahambk@prestigelimo.sg");
    assert.equal(routeNameAirportDepartureState.fields.name, "Luther Graham");
    assert.equal(routeNameAirportDepartureState.fields.pax, "3");
    assert.equal(routeNameAirportDepartureState.fields.extraStopCount, "2");
    assert.match(routeNameAirportDepartureState.fields.extraStopLocation, /Sin Ming/);
    assert.match(routeNameAirportDepartureState.fields.extraStopLocation, /Bedok South/);
    assert.equal(routeNameAirportDepartureState.fields.customerPriceOverride, "160");
    assert.match(
      routeNameAirportDepartureState.jobCardPreview,
      /Watten Estate Rd > Sin Ming Ave > Bedok South Avenue 2 > Changi Airport/,
    );
    assert.doesNotMatch(routeNameAirportDepartureState.jobCardPreview, /Company:\s*gmail\.com/i);
    assert.doesNotMatch(routeNameAirportDepartureState.jobCardPreview, /Company:\s*PRESTIGELIMO/i);
    assert.doesNotMatch(routeNameAirportDepartureState.jobCardPreview, /Company:/);
    assert.match(routeNameAirportDepartureState.driverDispatch, /Watten Estate Rd/);
    assert.match(routeNameAirportDepartureState.driverDispatch, /Sin Ming Ave/);
    assert.match(routeNameAirportDepartureState.driverDispatch, /Bedok South/);
    assert.match(routeNameAirportDepartureState.driverDispatch, /Changi Airport/);

    const focusedFreeformTransferTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedFreeformTransferTextarea,
      true,
      "Expected booking message textarea to be focused for freeform transfer sample",
    );

    await client.send("Input.insertText", { text: freeformTransferMultiLocationSample });

    const filledFreeformTransferTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(freeformTransferMultiLocationSample)}`,
    );
    assert.equal(
      filledFreeformTransferTextarea,
      true,
      "Expected freeform transfer booking message textarea to be filled",
    );

    const clickedFreeformTransferParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Create Job Card",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(clickedFreeformTransferParse, true, "Expected Create Job Card button to parse freeform transfer sample");

    const freeformTransferState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.bookingType === "TRF" &&
          candidateState?.fields?.pickup === "Shenton Way" &&
          candidateState?.fields?.dropoff === "Capital Tower" &&
          candidateState?.jobCardPreview?.includes("MAS Building") &&
          candidateState?.jobCardPreview?.includes("Asia Sq")
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed freeform multi-location transfer UI state",
    );
    freeformTransferState.errors = [...browserErrors, ...(freeformTransferState.errors || [])];
    freeformTransferState.consoleErrors = [
      ...browserConsoleErrors,
      ...(freeformTransferState.consoleErrors || []),
    ];

    assert.deepEqual(
      freeformTransferState.errors,
      [],
      `Expected no browser runtime errors, got ${freeformTransferState.errors.join("\n")}`,
    );
    assert.deepEqual(
      freeformTransferState.consoleErrors,
      [],
      `Expected no browser console errors, got ${freeformTransferState.consoleErrors.join("\n")}`,
    );
    assert.equal(freeformTransferState.fields.bookingType, "TRF");
    assert.equal(freeformTransferState.fields.vehicle, "VVV");
    assert.equal(freeformTransferState.fields.pickupDate, "2026-05-20");
    assert.equal(freeformTransferState.fields.pickupTime, "1100hrs");
    assert.equal(freeformTransferState.fields.flight, "");
    assert.equal(freeformTransferState.fields.pickup, "Shenton Way");
    assert.equal(freeformTransferState.fields.dropoff, "Capital Tower");
    assert.equal(freeformTransferState.fields.name, "Andrew");
    assert.equal(freeformTransferState.fields.extraStopCount, "2");
    assert.equal(freeformTransferState.fields.extraStopLocation, "MAS Building > Asia Sq");
    assert.doesNotMatch(freeformTransferState.fieldText, /Changi Airport|andrew shenton way send him|pickup john/i);
    assert.match(
      freeformTransferState.jobCardPreview,
      /Shenton Way > MAS Building > Asia Sq > Capital Tower/,
    );
    assert.match(
      freeformTransferState.driverDispatch,
      /Shenton Way > MAS Building > Asia Sq > Capital Tower/,
    );
    assert.match(freeformTransferState.pricingPanel, /Customer\s+\$85\.00/);
    assert.match(freeformTransferState.pricingPanel, /Driver\s+\$65\.00/);
    assert.match(freeformTransferState.pricingPanel, /Profit\s+\$20\.00/);
    assert.doesNotMatch(freeformTransferState.visibleText, /Negative profit/);

    const focusedDspTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(focusedDspTextarea, true, "Expected booking message textarea to be focused for DSP sample");

    await client.send("Input.insertText", { text: dspItinerarySample });

    const filledDspTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(dspItinerarySample)}`,
    );
    assert.equal(filledDspTextarea, true, "Expected DSP itinerary booking message textarea to be filled");

    const clickedDspParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Create Job Card",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(clickedDspParse, true, "Expected Create Job Card button to parse DSP itinerary sample");

    const dspState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.bookingType === "DSP" &&
          candidateState?.fields?.pickup === "Grand Hyatt" &&
          candidateState?.fields?.extraStopCount === "5"
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed DSP itinerary UI state",
    );
    dspState.errors = [...browserErrors, ...(dspState.errors || [])];
    dspState.consoleErrors = [...browserConsoleErrors, ...(dspState.consoleErrors || [])];

    assert.deepEqual(dspState.errors, [], `Expected no browser runtime errors, got ${dspState.errors.join("\n")}`);
    assert.deepEqual(
      dspState.consoleErrors,
      [],
      `Expected no browser console errors, got ${dspState.consoleErrors.join("\n")}`,
    );
    assert.equal(dspState.fields.dropoff, "Ritz-Carlton");
    assert.match(
      dspState.jobCardPreview,
      /Grand Hyatt > Multi-stop itinerary hidden for privacy > Ritz-Carlton/,
    );
    assert.doesNotMatch(dspState.jobCardPreview, /Temasek Office|Asia Square|60B Orchard|#37-01|018960/);
    assert.match(dspState.visibleText, /Itinerary preview/);
    assert.match(dspState.driverDispatch, /Pickup: Grand Hyatt/);
    assert.match(dspState.driverDispatch, /Itinerary:/);
    assert.match(dspState.driverDispatch, /1000hrs - Ritz-Carlton Singapore/);
    assert.match(dspState.driverDispatch, /1200hrs - BDC office/);
    assert.match(dspState.driverDispatch, /1330hrs - Temasek Office, The Atrium@Orchard/);
    assert.match(dspState.driverDispatch, /1530hrs - Asia Square Tower 1, 8 Marina View/);
    assert.match(dspState.driverDispatch, /1800hrs - Ritz-Carlton/);
    assert.doesNotMatch(dspState.driverDispatch, /Grand Hyatt > .*Ritz-Carlton/s);
    assert.equal(
      (dspState.driverDispatch.match(/1800hrs - Ritz-Carlton/g) || []).length,
      1,
      "Expected final Ritz-Carlton to appear once in the driver itinerary",
    );

    const focusedNumberedEventDspTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedNumberedEventDspTextarea,
      true,
      "Expected booking message textarea to be focused for numbered event DSP sample",
    );

    await client.send("Input.insertText", { text: numberedEventDspItinerarySample });

    const filledNumberedEventDspTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(numberedEventDspItinerarySample)}`,
    );
    assert.equal(
      filledNumberedEventDspTextarea,
      true,
      "Expected numbered event DSP booking message textarea to be filled",
    );

    const clickedNumberedEventDspParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Create Job Card",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(
      clickedNumberedEventDspParse,
      true,
      "Expected Create Job Card button to parse numbered event DSP sample",
    );

    const numberedEventDspState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.bookingType === "DSP" &&
          candidateState?.fields?.pickup === "Carlton City" &&
          candidateState?.fields?.dropoff === "UIC Building" &&
          candidateState?.fields?.extraStopLocation?.includes("Cherry Garden") &&
          candidateState?.jobCardPreview?.includes("Cherry Garden") &&
          candidateState?.jobCardPreview?.includes("Suntec Expo")
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed numbered event DSP itinerary UI state",
    );
    numberedEventDspState.errors = [...browserErrors, ...(numberedEventDspState.errors || [])];
    numberedEventDspState.consoleErrors = [
      ...browserConsoleErrors,
      ...(numberedEventDspState.consoleErrors || []),
    ];

    assert.deepEqual(
      numberedEventDspState.errors,
      [],
      `Expected no browser runtime errors, got ${numberedEventDspState.errors.join("\n")}`,
    );
    assert.deepEqual(
      numberedEventDspState.consoleErrors,
      [],
      `Expected no browser console errors, got ${numberedEventDspState.consoleErrors.join("\n")}`,
    );
    assert.match(numberedEventDspState.visibleText, /Passenger name/);
    assert.equal(numberedEventDspState.fields.bookingType, "DSP");
    assert.equal(numberedEventDspState.fields.pickupTime, "1130hrs");
    assert.equal(numberedEventDspState.fields.pickup, "Carlton City");
    assert.equal(numberedEventDspState.fields.dropoff, "UIC Building");
    assert.equal(numberedEventDspState.fields.name, "Mr Wong");
    assert.equal(numberedEventDspState.fields.booker, "");
    assert.equal(numberedEventDspState.fields.vehicle, "AVF");
    assert.equal(numberedEventDspState.fields.flight, "");
    assert.equal(numberedEventDspState.fields.extraStopCount, "3");
    assert.equal(
      numberedEventDspState.fields.extraStopLocation,
      "Capella Residence Suite A > Cherry Garden > Suntec Expo",
    );
    assert.doesNotMatch(numberedEventDspState.fieldText, /Black Alphard|Plate/);
    assert.doesNotMatch(numberedEventDspState.fieldText, /Changi Airport/);
    assert.match(
      numberedEventDspState.jobCardPreview,
      /Carlton City > Capella Residence Suite A > Cherry Garden > Suntec Expo > UIC Building/,
    );
    assert.match(
      numberedEventDspState.driverDispatch,
      /Carlton City > Capella Residence Suite A > Cherry Garden > Suntec Expo > UIC Building/,
    );
    assert.doesNotMatch(numberedEventDspState.visibleText, /Multiple bookings detected/);

    const focusedTimedScheduleTextarea = await evaluate(`(() => {
      const textarea = document.querySelector("textarea");
      if (!textarea) {
        return false;
      }

      textarea.focus();
      textarea.select();
      return document.activeElement === textarea;
    })()`);
    assert.equal(
      focusedTimedScheduleTextarea,
      true,
      "Expected booking message textarea to be focused for timed schedule sample",
    );

    await client.send("Input.insertText", { text: timedScheduleItinerarySample });

    const filledTimedScheduleTextarea = await evaluate(
      `document.querySelector("textarea")?.value === ${JSON.stringify(timedScheduleItinerarySample)}`,
    );
    assert.equal(
      filledTimedScheduleTextarea,
      true,
      "Expected timed schedule booking message textarea to be filled",
    );

    const clickedTimedScheduleParse = await evaluate(`(() => {
      const parseButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Create Job Card",
      );

      if (!parseButton || parseButton.disabled) {
        return false;
      }

      parseButton.click();
      return true;
    })()`);
    assert.equal(
      clickedTimedScheduleParse,
      true,
      "Expected Create Job Card button to parse timed schedule sample",
    );

    const timedScheduleState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        if (
          candidateState?.fields?.bookingType === "DSP" &&
          candidateState?.fields?.pickup === "1 HarbourFront Avenue, Keppel Bay Tower" &&
          candidateState?.fields?.extraStopCount === "3"
        ) {
          return candidateState;
        }

        return false;
      },
      10000,
      "parsed timed schedule itinerary UI state",
    );
    timedScheduleState.errors = [...browserErrors, ...(timedScheduleState.errors || [])];
    timedScheduleState.consoleErrors = [...browserConsoleErrors, ...(timedScheduleState.consoleErrors || [])];

    assert.deepEqual(
      timedScheduleState.errors,
      [],
      `Expected no browser runtime errors, got ${timedScheduleState.errors.join("\n")}`,
    );
    assert.deepEqual(
      timedScheduleState.consoleErrors,
      [],
      `Expected no browser console errors, got ${timedScheduleState.consoleErrors.join("\n")}`,
    );
    assert.equal(timedScheduleState.fields.dropoff, "BDC office");
    assert.doesNotMatch(timedScheduleState.fields.extraStopLocation, /Marina Bay Sands/);
    assert.doesNotMatch(timedScheduleState.fields.extraStopLocation, /HarbourFront Avenue|BDC office/);
    assert.match(
      timedScheduleState.fields.extraStopLocation,
      /One Raffles Quay, North Tower > Capital Tower/,
    );
    assert.match(
      timedScheduleState.jobCardPreview,
      /HarbourFront Avenue > One Raffles Quay > Capital Tower > BDC office/,
    );
    assert.doesNotMatch(timedScheduleState.jobCardPreview, /#02-01|#39-01|North Tower/);
    assert.match(
      timedScheduleState.driverDispatch,
      /1 HarbourFront Avenue, Keppel Bay Tower > One Raffles Quay, North Tower > Capital Tower > BDC office/,
    );
    assert.doesNotMatch(timedScheduleState.driverDispatch, /Pickup > Drop-off|Marina Bay Sands|#02-01|#39-01/);

    await evaluate(`(() => {
      const singleCompletedBooking = ${JSON.stringify(completedEmptyStateUndoFixture)};
      window.__prestigeFetchCalls = [];
      window.__prestigeBookingCompletionRequests = [];
      window.__prestigeUnhandledSupabaseCalls = [];
      window.__prestigeOriginalFetch = window.__prestigeOriginalFetch || window.fetch.bind(window);
      window.fetch = async (...args) => {
        const target = args[0]?.url || args[0];
        const method = args[1]?.method || args[0]?.method || "GET";
        const bodyText = typeof args[1]?.body === "string" ? args[1].body : "";

        window.__prestigeFetchCalls.push(\`\${method} \${target}\`);

        if (
          method === "GET" &&
          String(target).includes("/rest/v1/bookings") &&
          String(target).includes("select=")
        ) {
          return new Response(JSON.stringify([singleCompletedBooking]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (
          method === "PATCH" &&
          String(target).includes("/rest/v1/bookings") &&
          String(target).includes("id=eq.${completedEmptyStateUndoFixture.id}")
        ) {
          try {
            window.__prestigeBookingCompletionRequests.push({
              body: JSON.parse(bodyText),
              url: String(target),
            });
          } catch {
            window.__prestigeBookingCompletionRequests.push({
              body: bodyText,
              url: String(target),
            });
          }

          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (
          method === "GET" &&
          (
            String(target).includes("/rest/v1/companies") ||
            String(target).includes("/rest/v1/travelers") ||
            String(target).includes("/rest/v1/saved_addresses")
          )
        ) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (String(target).includes("/rest/v1/")) {
          window.__prestigeUnhandledSupabaseCalls.push(\`\${method} \${target}\`);
          return new Response(JSON.stringify({ message: "Unhandled Supabase mock" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        return window.__prestigeOriginalFetch(...args);
      };
    })()`);

    await clickTab("Bookings", "Load Bookings");

    const clickedEmptyStateLoadBookings = await evaluate(`(() => {
      const loadButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Load Bookings",
      );

      if (!loadButton || loadButton.disabled) {
        return false;
      }

      loadButton.click();
      return true;
    })()`);
    assert.equal(clickedEmptyStateLoadBookings, true, "Expected empty-state Load Bookings button to be clickable");

    await waitForCondition(
      () =>
        evaluate(`document.body.innerText.includes("COMPLETED EMPTY STATE TRAVELER")`),
      10000,
      "single completed booking loaded for empty-state undo test",
    );

    await clickTab("Completed", "Completed Bookings");

    const clickedEmptyStateUndoCompletion = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("COMPLETED EMPTY STATE TRAVELER") &&
          candidate.innerText.includes("SQ891"),
      );
      const undoButton = article?.querySelector("[data-completed-undo-booking='${completedEmptyStateUndoFixture.id}']");

      if (!undoButton || undoButton.disabled) {
        return false;
      }

      undoButton.click();
      return true;
    })()`);
    assert.equal(
      clickedEmptyStateUndoCompletion,
      true,
      "Expected single completed booking Undo completed button to be clickable",
    );

    const emptyCompletedUndoState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const completedArticle = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("COMPLETED EMPTY STATE TRAVELER") &&
              candidate.innerText.includes("SQ891"),
          );
          const completionMessage = document.querySelector("[data-booking-completion-message='${completedEmptyStateUndoFixture.id}']");
          const feedbackCard = document.querySelector("[data-completed-undo-feedback-card='${completedEmptyStateUndoFixture.id}']");
          const localUndoMessages = [...document.querySelectorAll("[data-booking-completion-message]")]
            .filter((message) => message.textContent.trim() === "Completion undone.");

          return {
            articleText: completedArticle?.innerText || "",
            completionRequests: window.__prestigeBookingCompletionRequests || [],
            emptyStateVisible: document.body.innerText.includes("No completed bookings loaded yet."),
            feedbackCardText: feedbackCard?.textContent.trim() || "",
            globalStatusText: document.querySelector("[data-status-panel='global']")?.textContent.trim() || "",
            localUndoMessageCount: localUndoMessages.length,
            messageText: completionMessage?.textContent.trim() || "",
            messageIsInFeedbackCard: Boolean(feedbackCard?.contains(completionMessage)),
            staleBookingTextVisible:
              document.body.innerText.includes("COMPLETED EMPTY STATE TRAVELER") ||
              document.body.innerText.includes("SQ891"),
            unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
          };
        })()`);

        return candidateState?.messageText === "Completion undone." &&
          candidateState?.emptyStateVisible &&
          !candidateState?.articleText &&
          !candidateState?.staleBookingTextVisible
          ? candidateState
          : false;
      },
      10000,
      "empty completed list after undo",
    );

    assert.deepEqual(
      emptyCompletedUndoState.unhandledSupabaseCalls,
      [],
      `Expected single undo Supabase calls to be mocked, got ${emptyCompletedUndoState.unhandledSupabaseCalls.join(", ")}`,
    );
    assert.equal(emptyCompletedUndoState.completionRequests.length, 1);
    assert.deepEqual(
      Object.keys(emptyCompletedUndoState.completionRequests[0]?.body || {}).sort(),
      ["status", "updated_at"],
    );
    assert.equal(emptyCompletedUndoState.completionRequests[0]?.body?.status, "confirmed");
    assert.equal(emptyCompletedUndoState.localUndoMessageCount, 1);
    assert.equal(emptyCompletedUndoState.messageIsInFeedbackCard, true);
    assert.equal(emptyCompletedUndoState.emptyStateVisible, true);
    assert.equal(
      emptyCompletedUndoState.staleBookingTextVisible,
      false,
      "Expected no stale completed booking details beside the empty state",
    );
    assert.doesNotMatch(
      emptyCompletedUndoState.feedbackCardText,
      /COMPLETED EMPTY STATE TRAVELER|SQ891/,
      "Expected empty-state undo feedback not to render stale completed booking details",
    );
    assert.notEqual(
      emptyCompletedUndoState.globalStatusText,
      "Completion undone.",
      "Expected single undo feedback not to duplicate in the global status panel",
    );
    assert.deepEqual(
      blockedSupabaseMutationRequests,
      [],
      `Expected no browser test Supabase write calls to reach the network guard. Blocked unmocked writes:\n${blockedSupabaseMutationRequests.join("\n")}`,
    );

    console.log(JSON.stringify(state, null, 2));
  } catch (error) {
    let pageSnapshot = "";

    if (client) {
      try {
        const snapshot = await client.send("Runtime.evaluate", {
          expression: `({
            href: location.href,
            readyState: document.readyState,
            buttonLabels: [...document.querySelectorAll("button")].map((button) => button.textContent.trim()),
            bodyText: document.body?.innerText?.slice(0, 1000) || "",
          })`,
          returnByValue: true,
        });
        pageSnapshot = `\n${JSON.stringify(snapshot.result?.value ?? {}, null, 2)}`;
      } catch {
        pageSnapshot = "";
      }
    }

    const message = stderr
      ? `${normalizeErrorMessage(error)}${pageSnapshot}\n${stderr}`
      : `${normalizeErrorMessage(error)}${pageSnapshot}`;
    throw new Error(message.trim());
  } finally {
    if (client) {
      await client.close();
    }

    chrome.kill("SIGTERM");
    await waitForChildExit(chrome);
    await rm(userDataDir, { force: true, recursive: true }).catch(() => {});
  }
}

async function runBrowserTest() {
  if (browserName === "chrome") {
    await runChromeTest();
    return;
  }

  throw new Error(`Unsupported browser "${browserName}". Use "chrome".`);
}

await runBrowserTest();
