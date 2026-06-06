import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const driverDemoUrl = new URL("/driver-job-demo", appUrl).toString();
const driverJobPublicBaseUrl = process.env.NEXT_PUBLIC_APP_URL || appUrl;
const driverJobMockUrl = new URL("/driver-job/mock-driver-job-valid-a", driverJobPublicBaseUrl).toString();
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
const ubsCustomerMatchSample = `Booking type: MNG
Vehicle: AVF
Date: 27/05/2026
Time: 15:45
Flight: SQ333
Pickup: Changi Airport Terminal 3
Drop-off: UBS office Singapore
Booker: Yasuko Kunisawa
Booker Email: yasuko.kunisawa@ubs.com
Name: UBS Match Traveler
Pax: 1`;
const publicEmailCustomerMatchSample = `Booking type: MNG
Vehicle: AVF
Date: 27/05/2026
Time: 16:15
Flight: SQ335
Pickup: Changi Airport Terminal 3
Drop-off: Private residence
Booker: Public Email Booker
Booker Email: public.email.booker@gmail.com
Name: Public Email Traveler
Pax: 1`;
const unknownOrgCustomerMatchSample = `Booking type: DEP
Vehicle: AVF
Date: 28/05/2026
Time: 09:00
Flight: SQ999
Pickup: Newco office
Drop-off: Changi Airport Terminal 2
Booker: Newco Booker
Booker Email: ops@newco-corporate.sg
Name: Newco Traveler
Pax: 1`;
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
  driver_id: 9901,
  driver_name: "TEST DRIVER CRM 20260516",
  driver_contact: "+65 8999 0099",
  driver_plate_number: "TEST99",
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
const driverDeleteAssignedBookingFixture = {
  ...persistedRealLutherGrahamFixture,
  id: 990509,
  booking_type: "DEP",
  pickup_time: "0945",
  pickup_address: "Driver Delete Pickup",
  dropoff_address: "Driver Delete Drop-off",
  flight_no: "DL9905",
  route: "Driver Delete Pickup > Driver Delete Waypoint > Driver Delete Drop-off",
  job_card:
    "AVF DEP\n30 Apr 2026, 0945hrs\nFlight: DL9905\nDriver Delete Pickup > Driver Delete Waypoint > Driver Delete Drop-off\nBooker: Driver Delete Booker\nPassenger: DRIVER DELETE STATE TEST TRAVELER\nPax: 1",
  status: "assigned",
  driver_id: 9905,
  driver_name: "Alson Toh",
  driver_contact: "+65 9000 0000",
  driver_plate_number: "PD 0000",
  driver_payout_amount: 88,
  driver_payout_min: 88,
  driver_payout_max: 88,
  driver_payout_override: null,
  driver_payout_reason: null,
  driver_notes: "Saved booking snapshot should remain after profile delete",
  driver_dispatch_include_payout: true,
  extra_stop_count: 1,
  midnight_payout: 0,
  midnight_surcharge: 0,
  extra_stop_payout: 0,
  extra_stop_surcharge: 0,
  child_seat_required: false,
  child_seat_count: 0,
  child_seat_type: null,
  child_seat_customer_surcharge: 0,
  child_seat_driver_payout: 0,
  bookers: {
    booker_name: "Driver Delete Booker",
    email: null,
    phone: "+65 9000 0000",
  },
  travelers: {
    traveler_name: "DRIVER DELETE STATE TEST TRAVELER",
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
  route: null,
  pax: 2,
  job_card:
    "AVF MNG\n29 May 2026, 1115hrs\nFlight: SQ777\nChangi Airport > Marina Bay Sands > The Fullerton Hotel Singapore\nPassenger: DASHBOARD DRIVER TEST TRAVELER\nPax: 2",
  status: "confirmed",
  driver_id: null,
  driver_name: null,
  driver_contact: null,
  driver_plate_number: null,
  customer_price_amount: 95,
  driver_payout_amount: 70,
  extra_stop_count: 1,
  extra_stop_surcharge: 15,
  extra_stop_payout: 10,
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
  route: "Changi Airport T3 > Marina Bay Sands > Capella Singapore",
  pax: 2,
  job_card:
    "AVF MNG\n30 May 2026, 1845hrs\nFlight: SQ779\nChangi Airport T3 > Marina Bay Sands > Capella Singapore\nCompany: COMPLETION ACTION TEST COMPANY\nPassenger: COMPLETION ACTION TEST TRAVELER\nPax: 2",
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
  extra_stop_count: 1,
  extra_stop_surcharge: 15,
  extra_stop_payout: 10,
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
const dashboardPlateSearchDriverFixture = {
  ...reusableDriverProfileFixture,
  id: 9901,
  driver_name: "TEST DRIVER CRM 20260516",
  contact_number: "+65 8999 0099",
  vehicle_type: "Alphard",
  plate_number: "TEST99",
  availability_status: "available",
  notes: "Dashboard plate search fixture",
};
const dashboardT1234SearchDriverFixture = {
  ...reusableDriverProfileFixture,
  id: 9902,
  driver_name: "TEST1",
  contact_number: "+65 8111 1234",
  vehicle_type: "Vellfire",
  plate_number: "T1234",
  availability_status: "available",
  notes: "Dashboard stale selection fixture",
};
const dashboardSameTimeAssignedT1234Fixture = {
  id: "ui-dashboard-same-time-assigned-t1234-fixture",
  company_id: 9911,
  booker_id: 9912,
  traveler_id: 9913,
  booking_type: "DEP",
  vehicle: "AVF",
  pickup_time: "1410",
  pickup_address: "Mandarin Oriental Singapore",
  dropoff_address: "Changi Airport T2",
  flight_no: "SQ176",
  route: "Mandarin Oriental Singapore > Changi Airport T2",
  pax: 1,
  job_card:
    "AVF DEP\n29 May 2026, 1410hrs\nFlight: SQ176\nMandarin Oriental Singapore > Changi Airport T2\nPassenger: DASHBOARD SAME TIME ASSIGNED DRIVER TRAVELER\nPax: 1",
  status: "assigned",
  driver_id: dashboardT1234SearchDriverFixture.id,
  driver_name: dashboardT1234SearchDriverFixture.driver_name,
  driver_contact: dashboardT1234SearchDriverFixture.contact_number,
  driver_plate_number: dashboardT1234SearchDriverFixture.plate_number,
  customer_price_amount: 95,
  driver_payout_amount: 66,
  driver_payout_override: null,
  driver_payout_reason: null,
  driver_dispatch_include_payout: false,
  extra_stop_count: 0,
  child_seat_required: false,
  child_seat_count: 0,
  child_seat_type: null,
  created_at: "2026-05-18T23:53:20.000Z",
  updated_at: "2026-05-18T23:53:20.000Z",
  companies: {
    company_name: "DASHBOARD SAME TIME ASSIGNED DRIVER COMPANY",
    domain: "dashboard-same-time-assigned-driver.example.com",
  },
  bookers: {
    booker_name: "DASHBOARD SAME TIME ASSIGNED DRIVER BOOKER",
    email: "booker@dashboard-same-time-assigned-driver.example.com",
    phone: "+65 8666 3333",
  },
  travelers: {
    traveler_name: "DASHBOARD SAME TIME ASSIGNED DRIVER TRAVELER",
  },
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

function pickupDateTimeOffset(offsetMinutes) {
  const pickupDate = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const year = pickupDate.getFullYear();
  const month = String(pickupDate.getMonth() + 1).padStart(2, "0");
  const day = String(pickupDate.getDate()).padStart(2, "0");
  const hours = String(pickupDate.getHours()).padStart(2, "0");
  const minutes = String(pickupDate.getMinutes()).padStart(2, "0");

  return {
    date: `${year}-${month}-${day}`,
    displayTime: `${hours}${minutes}hrs`,
    time: `${hours}${minutes}`,
  };
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
  assert.equal(state.fields.manualExtraCharges, "");
  assert.equal(state.fields.manualExtraChargesNote, "");
  assert.equal(state.fields.dropoff, "Raffles Hotel Singapore");
  assert.match(state.visibleText, /Route Extras & Child Seat/);
  assert.match(state.visibleText, /Extra stop location/);
  assert.match(state.visibleText, /Extra Stops/);
  assert.match(state.visibleText, /Extra Charges/);
  assert.match(state.visibleText, /Extra Charges note \/ reason/);
  assert.match(state.visibleText, /Manual staff entry only/);
  assert.equal(state.manualExtraChargesReviewPreview.visible, true);
  assert.match(state.manualExtraChargesReviewPreview.text, /Manual Extra Charges/i);
  assert.match(state.manualExtraChargesReviewPreview.text, /Manual Extra Charges note/i);
  assert.equal(state.manualExtraChargesReviewPreview.amount, "$0.00");
  assert.equal(state.manualExtraChargesReviewPreview.note, "Blank");
  assert.deepEqual(state.manualExtraChargesReviewPreview.buttons, []);
  assert.match(state.manualExtraChargesReviewPreview.boundary, /Manual staff entry only/);
  assert.match(state.manualExtraChargesReviewPreview.boundary, /Not billed, not saved, no total calculated/);
  assert.match(state.manualExtraChargesReviewPreview.boundary, /No invoice/);
  assert.match(state.manualExtraChargesReviewPreview.boundary, /payment/);
  assert.match(state.manualExtraChargesReviewPreview.boundary, /PDF/);
  assert.match(state.manualExtraChargesReviewPreview.boundary, /payout/);
  assert.match(state.manualExtraChargesReviewPreview.boundary, /accounting/);
  assert.match(state.manualExtraChargesReviewPreview.boundary, /storage/);
  assert.match(state.manualExtraChargesReviewPreview.boundary, /API/);
  assert.match(state.manualExtraChargesReviewPreview.boundary, /Supabase/);
  assert.match(state.manualExtraChargesReviewPreview.boundary, /notification/);
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
  assert.equal(state.dispatchReleaseChecklist.visible, true);
  assert.match(state.dispatchReleaseChecklist.text, /Dispatch Release/);
  assert.equal(state.dispatchReleaseChecklist.context, "Current dispatch draft");
  assert.deepEqual(
    state.dispatchReleaseChecklist.checks.map((check) => check.label),
    [
      "Trip completeness",
      "Review clearance",
      "Assigned driver details",
      "Customer copy readiness",
      "Driver dispatch copy readiness",
      "Driver job link readiness",
    ],
  );
  assert.equal(
    state.dispatchReleaseChecklist.checks.find((check) => check.key === "trip-completeness")?.state,
    "ready",
  );
  assert.equal(
    state.dispatchReleaseChecklist.checks.find((check) => check.key === "review-clearance")?.state,
    "needs-action",
  );
  assert.equal(state.dispatchReleaseChecklist.markReadyDisabled, true);
  assert.match(state.dispatchReleaseChecklist.boundary, /UI\/local-state only/);
  assert.match(state.dispatchReleaseChecklist.boundary, /No Supabase write/);
  assert.match(state.dispatchReleaseChecklist.boundary, /live database access/);
  assert.match(state.dispatchReleaseChecklist.boundary, /customer message/);
  assert.match(state.dispatchReleaseChecklist.boundary, /driver notification/);
  assert.match(state.dispatchReleaseChecklist.boundary, /billing/);
  assert.match(state.dispatchReleaseChecklist.boundary, /payment/);
  assert.match(state.dispatchReleaseChecklist.boundary, /PDF/);
  assert.match(state.dispatchReleaseChecklist.boundary, /payout/);
  assert.match(state.dispatchReleaseChecklist.boundary, /live location/);
  assert.match(state.dispatchReleaseChecklist.boundary, /parser-learning/);
  assert.deepEqual(state.dispatchReleaseChecklist.forbiddenPanelText, []);
  assert.equal(state.dispatchReleaseHandoffPacket.visible, true);
  assert.match(state.dispatchReleaseHandoffPacket.text, /Dispatch Release Handoff Packet/);
  assert.equal(state.dispatchReleaseHandoffPacket.context, "Current dispatch draft");
  assert.equal(state.dispatchReleaseHandoffPacket.status, "Not ready for local release");
  assert.deepEqual(
    state.dispatchReleaseHandoffPacket.items.map((item) => item.label),
    [
      "Release status",
      "Customer update copy",
      "Driver dispatch copy",
      "Driver job link",
      "Assigned driver summary",
      "Local release note/status",
    ],
  );
  assert.equal(
    state.dispatchReleaseHandoffPacket.items.find((item) => item.key === "release-status")?.state,
    "needs-action",
  );
  assert.equal(
    state.dispatchReleaseHandoffPacket.items.find((item) => item.key === "assigned-driver-summary")?.state,
    "needs-action",
  );
  assert.equal(state.dispatchReleaseHandoffPacket.noteValue, "");
  assert.match(state.dispatchReleaseHandoffPacket.boundary, /Local UI only/);
  assert.match(state.dispatchReleaseHandoffPacket.boundary, /No Supabase write/);
  assert.match(state.dispatchReleaseHandoffPacket.boundary, /live database access/);
  assert.match(state.dispatchReleaseHandoffPacket.boundary, /notification sending/);
  assert.match(state.dispatchReleaseHandoffPacket.boundary, /customer message/);
  assert.match(state.dispatchReleaseHandoffPacket.boundary, /driver notification/);
  assert.match(state.dispatchReleaseHandoffPacket.boundary, /billing/);
  assert.match(state.dispatchReleaseHandoffPacket.boundary, /payment/);
  assert.match(state.dispatchReleaseHandoffPacket.boundary, /PDF/);
  assert.match(state.dispatchReleaseHandoffPacket.boundary, /payout/);
  assert.match(state.dispatchReleaseHandoffPacket.boundary, /live location/);
  assert.match(state.dispatchReleaseHandoffPacket.boundary, /parser-learning/);
  assert.deepEqual(state.dispatchReleaseHandoffPacket.forbiddenPanelText, []);
  assert.equal(state.driverAcknowledgementReadiness.visible, true);
  assert.match(state.driverAcknowledgementReadiness.text, /Driver Acknowledgement Readiness/);
  assert.equal(state.driverAcknowledgementReadiness.context, "Current dispatch draft");
  assert.equal(state.driverAcknowledgementReadiness.status, "Acknowledgement pending");
  assert.deepEqual(
    state.driverAcknowledgementReadiness.items.map((item) => item.label),
    [
      "Driver assigned",
      "Driver contact available",
      "Dispatch copy prepared",
      "Driver job link prepared",
      "Acknowledgement local status",
      "Next dispatcher action",
    ],
  );
  assert.deepEqual(
    state.driverAcknowledgementReadiness.items.map((item) => item.key),
    [
      "driver-assigned",
      "driver-contact",
      "dispatch-copy",
      "driver-job-link",
      "acknowledgement-local-status",
      "next-dispatcher-action",
    ],
  );
  assert.equal(
    state.driverAcknowledgementReadiness.items.find((item) => item.key === "driver-assigned")?.state,
    "ready",
  );
  assert.equal(
    state.driverAcknowledgementReadiness.items.find((item) => item.key === "driver-contact")?.state,
    "needs-action",
  );
  assert.equal(
    state.driverAcknowledgementReadiness.items.find((item) => item.key === "dispatch-copy")?.state,
    "needs-action",
  );
  assert.equal(
    state.driverAcknowledgementReadiness.items.find((item) => item.key === "driver-job-link")?.state,
    "needs-action",
  );
  assert.equal(
    state.driverAcknowledgementReadiness.items.find((item) => item.key === "acknowledgement-local-status")?.detail,
    "Acknowledgement pending",
  );
  assert.equal(
    state.driverAcknowledgementReadiness.items.find((item) => item.key === "next-dispatcher-action")?.detail,
    "Add driver contact before acknowledgement.",
  );
  assert.equal(state.driverAcknowledgementReadiness.markReadyDisabled, true);
  assert.match(state.driverAcknowledgementReadiness.boundary, /Local UI only/);
  assert.match(state.driverAcknowledgementReadiness.boundary, /No Supabase write/);
  assert.match(state.driverAcknowledgementReadiness.boundary, /live database access/);
  assert.match(state.driverAcknowledgementReadiness.boundary, /notification sending/);
  assert.match(state.driverAcknowledgementReadiness.boundary, /customer message/);
  assert.match(state.driverAcknowledgementReadiness.boundary, /driver notification/);
  assert.match(state.driverAcknowledgementReadiness.boundary, /billing/);
  assert.match(state.driverAcknowledgementReadiness.boundary, /payment/);
  assert.match(state.driverAcknowledgementReadiness.boundary, /PDF/);
  assert.match(state.driverAcknowledgementReadiness.boundary, /payout/);
  assert.match(state.driverAcknowledgementReadiness.boundary, /live location/);
  assert.match(state.driverAcknowledgementReadiness.boundary, /parser-learning/);
  assert.deepEqual(state.driverAcknowledgementReadiness.forbiddenPanelText, []);
  assert.equal(state.driverAcknowledgementFollowUp.visible, true);
  assert.match(state.driverAcknowledgementFollowUp.text, /Driver Acknowledgement Follow-up/);
  assert.equal(state.driverAcknowledgementFollowUp.context, "Current dispatch draft");
  assert.equal(state.driverAcknowledgementFollowUp.status, "Acknowledgement pending");
  assert.deepEqual(
    state.driverAcknowledgementFollowUp.options.map((option) => option.label),
    ["Pending", "Acknowledged", "Needs Call"],
  );
  assert.deepEqual(
    state.driverAcknowledgementFollowUp.options.map((option) => [
      option.value,
      option.state,
      option.disabled,
    ]),
    [
      ["pending", "selected", false],
      ["acknowledged", "idle", true],
      ["needs-call", "idle", true],
    ],
  );
  assert.equal(state.driverAcknowledgementFollowUp.noteValue, "");
  assert.deepEqual(
    state.driverAcknowledgementFollowUp.items.map((item) => item.label),
    [
      "Acknowledgement pending",
      "Acknowledged locally",
      "No response / needs call",
      "Next dispatcher action",
      "Local follow-up note/status",
    ],
  );
  assert.deepEqual(
    state.driverAcknowledgementFollowUp.items.map((item) => item.key),
    [
      "acknowledgement-pending",
      "acknowledged-locally",
      "no-response-needs-call",
      "next-dispatcher-action",
      "local-follow-up-note",
    ],
  );
  assert.equal(
    state.driverAcknowledgementFollowUp.items.find((item) => item.key === "acknowledgement-pending")?.state,
    "needs-action",
  );
  assert.equal(
    state.driverAcknowledgementFollowUp.items.find((item) => item.key === "acknowledged-locally")?.state,
    "needs-action",
  );
  assert.equal(
    state.driverAcknowledgementFollowUp.items.find((item) => item.key === "no-response-needs-call")?.state,
    "ready",
  );
  assert.equal(
    state.driverAcknowledgementFollowUp.items.find((item) => item.key === "next-dispatcher-action")?.detail,
    "Complete readiness first.",
  );
  assert.equal(
    state.driverAcknowledgementFollowUp.items.find((item) => item.key === "local-follow-up-note")?.detail,
    "Acknowledgement pending. No local note.",
  );
  assert.match(state.driverAcknowledgementFollowUp.boundary, /Local UI only/);
  assert.match(state.driverAcknowledgementFollowUp.boundary, /No Supabase write/);
  assert.match(state.driverAcknowledgementFollowUp.boundary, /live database access/);
  assert.match(state.driverAcknowledgementFollowUp.boundary, /notification sending/);
  assert.match(state.driverAcknowledgementFollowUp.boundary, /customer message/);
  assert.match(state.driverAcknowledgementFollowUp.boundary, /driver notification/);
  assert.match(state.driverAcknowledgementFollowUp.boundary, /billing/);
  assert.match(state.driverAcknowledgementFollowUp.boundary, /payment/);
  assert.match(state.driverAcknowledgementFollowUp.boundary, /PDF/);
  assert.match(state.driverAcknowledgementFollowUp.boundary, /payout/);
  assert.match(state.driverAcknowledgementFollowUp.boundary, /live location/);
  assert.match(state.driverAcknowledgementFollowUp.boundary, /parser-learning/);
  assert.deepEqual(state.driverAcknowledgementFollowUp.forbiddenPanelText, []);
  assert.equal(state.dayOfTripDispatchMonitor.visible, true);
  assert.match(state.dayOfTripDispatchMonitor.text, /Day-of-Trip Dispatch Monitor/);
  assert.equal(state.dayOfTripDispatchMonitor.context, "Current dispatch draft");
  assert.equal(state.dayOfTripDispatchMonitor.status, "Reminder due");
  assert.deepEqual(
    state.dayOfTripDispatchMonitor.options.map((option) => option.label),
    ["Reminder Due", "OTW", "OTS", "POB", "Completed", "Needs Call"],
  );
  assert.deepEqual(
    state.dayOfTripDispatchMonitor.options.map((option) => [
      option.value,
      option.state,
      option.disabled,
    ]),
    [
      ["reminder-due", "selected", false],
      ["otw", "idle", true],
      ["ots", "idle", true],
      ["pob", "idle", true],
      ["completed", "idle", true],
      ["needs-call", "idle", false],
    ],
  );
  assert.deepEqual(
    state.dayOfTripDispatchMonitor.items.map((item) => item.label),
    [
      "Driver acknowledged",
      "Reminder due",
      "OTW",
      "OTS",
      "POB",
      "Completed",
      "No response / needs call",
      "Next dispatcher action",
    ],
  );
  assert.deepEqual(
    state.dayOfTripDispatchMonitor.items.map((item) => item.key),
    [
      "driver-acknowledged",
      "reminder-due",
      "otw",
      "ots",
      "pob",
      "completed",
      "no-response-needs-call",
      "next-dispatcher-action",
    ],
  );
  assert.equal(
    state.dayOfTripDispatchMonitor.items.find((item) => item.key === "driver-acknowledged")?.detail,
    "Not acknowledged locally.",
  );
  assert.equal(
    state.dayOfTripDispatchMonitor.items.find((item) => item.key === "reminder-due")?.state,
    "needs-action",
  );
  assert.equal(
    state.dayOfTripDispatchMonitor.items.find((item) => item.key === "no-response-needs-call")?.state,
    "ready",
  );
  assert.equal(
    state.dayOfTripDispatchMonitor.items.find((item) => item.key === "next-dispatcher-action")?.detail,
    "Confirm driver acknowledgement before day-of-trip progress.",
  );
  assert.match(state.dayOfTripDispatchMonitor.boundary, /Local UI only/);
  assert.match(state.dayOfTripDispatchMonitor.boundary, /No Supabase write/);
  assert.match(state.dayOfTripDispatchMonitor.boundary, /live database access/);
  assert.match(state.dayOfTripDispatchMonitor.boundary, /notification sending/);
  assert.match(state.dayOfTripDispatchMonitor.boundary, /customer message/);
  assert.match(state.dayOfTripDispatchMonitor.boundary, /driver notification/);
  assert.match(state.dayOfTripDispatchMonitor.boundary, /billing/);
  assert.match(state.dayOfTripDispatchMonitor.boundary, /payment/);
  assert.match(state.dayOfTripDispatchMonitor.boundary, /PDF/);
  assert.match(state.dayOfTripDispatchMonitor.boundary, /payout/);
  assert.match(state.dayOfTripDispatchMonitor.boundary, /live location/);
  assert.match(state.dayOfTripDispatchMonitor.boundary, /parser-learning/);
  assert.deepEqual(state.dayOfTripDispatchMonitor.forbiddenPanelText, []);
  assert.equal(state.dayOfTripExceptionEscalation.visible, true);
  assert.match(state.dayOfTripExceptionEscalation.text, /Day-of-Trip Exception Escalation/);
  assert.equal(state.dayOfTripExceptionEscalation.context, "Current dispatch draft");
  assert.equal(state.dayOfTripExceptionEscalation.status, "Driver late / reminder due");
  assert.equal(state.dayOfTripExceptionEscalation.noteValue, "");
  assert.deepEqual(
    state.dayOfTripExceptionEscalation.options.map((option) => option.label),
    ["No Response", "Late Reminder", "Call Needed", "Replacement", "Customer Update", "Closed"],
  );
  assert.deepEqual(
    state.dayOfTripExceptionEscalation.options.map((option) => [
      option.value,
      option.state,
    ]),
    [
      ["driver-no-response", "idle"],
      ["late-reminder-due", "selected"],
      ["dispatcher-call", "idle"],
      ["replacement-review", "idle"],
      ["customer-update", "idle"],
      ["closed-locally", "idle"],
    ],
  );
  assert.deepEqual(
    state.dayOfTripExceptionEscalation.items.map((item) => item.label),
    [
      "Driver no response",
      "Driver late / reminder due",
      "Needs dispatcher call",
      "Replacement driver may be needed",
      "Customer update may be needed",
      "Next escalation action",
      "Local escalation note/status",
    ],
  );
  assert.deepEqual(
    state.dayOfTripExceptionEscalation.items.map((item) => item.key),
    [
      "driver-no-response",
      "driver-late-reminder-due",
      "needs-dispatcher-call",
      "replacement-driver-may-be-needed",
      "customer-update-may-be-needed",
      "next-escalation-action",
      "local-escalation-note-status",
    ],
  );
  assert.equal(
    state.dayOfTripExceptionEscalation.items.find((item) => item.key === "driver-no-response")?.state,
    "ready",
  );
  assert.equal(
    state.dayOfTripExceptionEscalation.items.find((item) => item.key === "driver-late-reminder-due")?.detail,
    "Driver late / reminder due locally.",
  );
  assert.equal(
    state.dayOfTripExceptionEscalation.items.find((item) => item.key === "needs-dispatcher-call")?.state,
    "needs-action",
  );
  assert.equal(
    state.dayOfTripExceptionEscalation.items.find((item) => item.key === "replacement-driver-may-be-needed")?.state,
    "ready",
  );
  assert.equal(
    state.dayOfTripExceptionEscalation.items.find((item) => item.key === "customer-update-may-be-needed")?.state,
    "ready",
  );
  assert.equal(
    state.dayOfTripExceptionEscalation.items.find((item) => item.key === "next-escalation-action")?.detail,
    "Call driver and record the result in the local escalation note.",
  );
  assert.equal(
    state.dayOfTripExceptionEscalation.items.find((item) => item.key === "local-escalation-note-status")?.detail,
    "Driver late / reminder due. No local note.",
  );
  assert.match(state.dayOfTripExceptionEscalation.boundary, /Local UI only/);
  assert.match(state.dayOfTripExceptionEscalation.boundary, /No Supabase write/);
  assert.match(state.dayOfTripExceptionEscalation.boundary, /live database access/);
  assert.match(state.dayOfTripExceptionEscalation.boundary, /notification sending/);
  assert.match(state.dayOfTripExceptionEscalation.boundary, /customer message/);
  assert.match(state.dayOfTripExceptionEscalation.boundary, /driver notification/);
  assert.match(state.dayOfTripExceptionEscalation.boundary, /billing/);
  assert.match(state.dayOfTripExceptionEscalation.boundary, /payment/);
  assert.match(state.dayOfTripExceptionEscalation.boundary, /PDF/);
  assert.match(state.dayOfTripExceptionEscalation.boundary, /payout/);
  assert.match(state.dayOfTripExceptionEscalation.boundary, /live location/);
  assert.match(state.dayOfTripExceptionEscalation.boundary, /parser-learning/);
  assert.deepEqual(state.dayOfTripExceptionEscalation.forbiddenPanelText, []);
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

    const setFieldValueByLabel = async (labelText, value, description) => {
      const didSetValue = await evaluate(`(() => {
        const normalizeLabel = (candidate) =>
          (candidate || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
        const label = [...document.querySelectorAll("label")].find(
          (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === ${JSON.stringify(labelText)},
        );
        const control = label?.querySelector("input, select, textarea");

        if (!control) {
          return false;
        }

        const descriptor = Object.getOwnPropertyDescriptor(control.constructor.prototype, "value");
        descriptor?.set?.call(control, ${JSON.stringify(value)});
        control.dispatchEvent(new Event("input", { bubbles: true }));
        control.dispatchEvent(new Event("change", { bubbles: true }));
        return control.value === ${JSON.stringify(value)};
      })()`);

      assert.equal(didSetValue, true, `Expected ${description} field to be editable`);
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

    const clearDispatchDraft = async (description) => {
      const clickedClear = await evaluate(`(() => {
        const clearButton = [...document.querySelectorAll("button")].find(
          (button) => button.textContent.trim() === "Clear",
        );

        if (!clearButton || clearButton.disabled) {
          return false;
        }

        clearButton.click();
        return true;
      })()`);
      assert.equal(clickedClear, true, `Expected Clear button for ${description}`);

      await waitForCondition(
        () =>
          evaluate(`(() => {
            const textarea = document.querySelector("textarea");

            return Boolean(textarea) &&
              textarea.value === "" &&
              !document.querySelector("[data-customer-match-suggestion]");
          })()`),
        10000,
        `${description} clear state`,
      );
    };

    const parseCustomerMatchSample = async (sample, description) => {
      await setInputValue("textarea", sample, `${description} booking message`);

      const clickedCustomerMatchParse = await evaluate(`(() => {
        const parseButton = [...document.querySelectorAll("button")].find(
          (button) => button.textContent.trim() === "Create Job Card",
        );

        if (!parseButton || parseButton.disabled) {
          return false;
        }

        parseButton.click();
        return true;
      })()`);
      assert.equal(clickedCustomerMatchParse, true, `Expected Create Job Card button for ${description}`);

      return waitForCondition(
        () =>
          evaluate(`(() => {
            const section = document.querySelector("[data-customer-match-suggestion]");

            if (!section) {
              return false;
            }

            return {
              action: section.querySelector("[data-customer-match-action]")?.textContent.trim() || "",
              buttons: [...section.querySelectorAll("button")].map((button) => button.textContent.trim()),
              confidence: section.querySelector("[data-customer-match-confidence]")?.textContent.trim() || "",
              customer: section.querySelector("[data-customer-match-name]")?.textContent.trim() || "",
              reason: section.querySelector("[data-customer-match-reason]")?.textContent.trim() || "",
              text: section.innerText,
            };
          })()`),
        10000,
        `${description} customer match suggestion`,
      );
    };

    const clickCustomerMatchAction = async (action, expectedText) => {
      const clickedAction = await evaluate(`(() => {
        const button = document.querySelector("[data-customer-match-action-button='${action}']");

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clickedAction, true, `Expected ${action} customer match action button to be clickable`);

      const feedbackState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const section = document.querySelector("[data-customer-match-suggestion]");
            const button = document.querySelector("[data-customer-match-action-button='${action}']");
            const feedback = document.querySelector("[data-customer-match-feedback='${action}']");

            if (!section || !button || !feedback) {
              return false;
            }

            const buttonRect = button.getBoundingClientRect();
            const feedbackRect = feedback.getBoundingClientRect();

            return {
              distanceFromButton: Math.round(Math.abs(feedbackRect.top - buttonRect.bottom)),
              inSection: section.contains(feedback),
              text: feedback.textContent.trim(),
            };
          })()`),
        10000,
        `${action} customer match feedback`,
      );
      assert.match(feedbackState.text, expectedText);
      assert.equal(feedbackState.inSection, true, `Expected ${action} feedback inside customer match suggestion`);
      assert.ok(
        feedbackState.distanceFromButton <= 140,
        `Expected ${action} feedback near button, got ${feedbackState.distanceFromButton}px`,
      );
    };

    const waitForTravelerMemoryLookup = async (travelerName, description) => {
      const expectedParam = `traveler_name=ilike.${travelerName}`.toLowerCase();
      await waitForCondition(
        () =>
          blockedSupabaseRequests.some((request) =>
            request.replace(/\+/g, " ").toLowerCase().includes(expectedParam),
          ),
        10000,
        `${description} traveler memory lookup`,
      );
    };

    const expectedBackgroundTravelerLookupNames = [
      "UBS Match Traveler",
      "Public Email Traveler",
      "Newco Traveler",
      "BROWSER UI TEST TRAVELER",
    ];
    const isExpectedBackgroundTravelerLookup = (url) => {
      const normalizedUrl = String(url).replace(/\+/g, " ").toLowerCase();

      return normalizedUrl.includes("/rest/v1/travelers") &&
        expectedBackgroundTravelerLookupNames.some((travelerName) =>
          normalizedUrl.includes(`traveler_name=ilike.${travelerName.toLowerCase()}`),
        );
    };
    const unexpectedManualExtraChargeFetchCalls = (calls) =>
      calls.filter((call) => !isExpectedBackgroundTravelerLookup(call));

    const ubsMatchState = await parseCustomerMatchSample(
      ubsCustomerMatchSample,
      "UBS organization domain",
    );
    await waitForTravelerMemoryLookup("UBS Match Traveler", "UBS organization domain");
    assert.equal(ubsMatchState.customer, "UBS", "Expected ubs.com email to suggest UBS");
    assert.equal(ubsMatchState.confidence, "High", "Expected ubs.com match to be high confidence");
    assert.equal(
      ubsMatchState.action,
      "Link to existing customer",
      "Expected ubs.com match to suggest linking existing customer",
    );
    assert.match(
      ubsMatchState.reason,
      /Organization email domain ubs\.com matches an existing mock customer folder\./,
    );
    assert.deepEqual(
      ["Link Mock Customer", "Create Mock Customer", "Leave Unlinked"].filter(
        (label) => !ubsMatchState.buttons.includes(label),
      ),
      [],
      "Expected mock customer action buttons",
    );
    await clickCustomerMatchAction("link", /Mock link selected for UBS\. No customer record was written\./);
    await clearDispatchDraft("UBS organization domain customer match");

    const publicEmailMatchState = await parseCustomerMatchSample(
      publicEmailCustomerMatchSample,
      "public email customer",
    );
    await waitForTravelerMemoryLookup("Public Email Traveler", "public email customer");
    assert.equal(
      publicEmailMatchState.customer,
      "New customer suggested",
      "Expected public email to avoid company-account suggestion",
    );
    assert.equal(
      publicEmailMatchState.action,
      "Create new customer folder",
      "Expected public email to require dispatcher-reviewed customer creation",
    );
    assert.match(
      publicEmailMatchState.reason,
      /Public\/personal email domain gmail\.com is not used to create or suggest a company account\./,
    );
    assert.doesNotMatch(publicEmailMatchState.reason, /UBS|Ritz Carlton/);
    await clickCustomerMatchAction("leave", /Mock booking left unlinked\. No customer record was changed\./);
    await clearDispatchDraft("public email customer match");

    const unknownOrgMatchState = await parseCustomerMatchSample(
      unknownOrgCustomerMatchSample,
      "unknown organization domain",
    );
    await waitForTravelerMemoryLookup("Newco Traveler", "unknown organization domain");
    assert.equal(
      unknownOrgMatchState.customer,
      "New customer suggested",
      "Expected unknown organization domain to suggest a new customer",
    );
    assert.equal(unknownOrgMatchState.confidence, "Medium");
    assert.equal(unknownOrgMatchState.action, "Create new customer folder");
    assert.match(
      unknownOrgMatchState.reason,
      /Organization email domain newco-corporate\.sg does not match a current mock customer\./,
    );
    await clickCustomerMatchAction("create", /Mock create selected for New customer suggested\. No customer folder was created\./);
    await clearDispatchDraft("unknown organization domain customer match");

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
        manualExtraCharges: fieldValue("Extra Charges"),
        manualExtraChargesNote: fieldValue("Extra Charges note / reason"),
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
      const manualExtraChargesReviewPreview = () => {
        const preview = document.querySelector("[data-manual-extra-charges-review-preview='true']");
        const rect = preview?.getBoundingClientRect();

        return {
          amount:
            preview?.querySelector("[data-manual-extra-charges-review-amount='true']")?.textContent.trim() ||
            "",
          boundary:
            preview?.querySelector("[data-manual-extra-charges-review-boundary='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          buttons: [...(preview?.querySelectorAll("button, a[href]") || [])].map((control) =>
            control.textContent.trim(),
          ),
          note:
            preview?.querySelector("[data-manual-extra-charges-review-note='true']")?.textContent.trim() ||
            "",
          text: preview?.innerText || "",
          visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        };
      };
      const dispatchReleaseChecklist = () => {
        const checklist = document.querySelector("[data-admin-dispatch-release-checklist='true']");
        const rect = checklist?.getBoundingClientRect();
        const text = checklist?.innerText || "";
        const lowerText = text.toLowerCase();

        return {
          boundary:
            checklist?.querySelector("[data-admin-dispatch-release-boundary='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          checks: [...(checklist?.querySelectorAll("[data-admin-dispatch-release-check]") || [])].map((item) => ({
            detail:
              item.querySelector("[data-admin-dispatch-release-check-detail]")?.textContent
                .replace(/\\s+/g, " ")
                .trim() || "",
            key: item.getAttribute("data-admin-dispatch-release-check") || "",
            label:
              item.querySelector("[data-admin-dispatch-release-check-label]")?.textContent
                .replace(/\\s+/g, " ")
                .trim() || "",
            state: item.getAttribute("data-admin-dispatch-release-check-state") || "",
          })),
          context:
            checklist?.querySelector("[data-admin-dispatch-release-context='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          forbiddenPanelText: [
            "customer price",
            "paynow",
            "parser/debug",
            "debug internals",
            "invoice number",
            "payment link",
            "supabase url",
          ].filter((value) => lowerText.includes(value)),
          markReadyDisabled:
            checklist?.querySelector("[data-admin-dispatch-release-mark-ready='true']")?.disabled ?? null,
          state:
            checklist?.querySelector("[data-admin-dispatch-release-state='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          text,
          visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        };
      };
      const dispatchReleaseHandoffPacket = () => {
        const packet = document.querySelector("[data-admin-dispatch-release-handoff-packet='true']");
        const rect = packet?.getBoundingClientRect();
        const text = packet?.innerText || "";
        const lowerText = text.toLowerCase();

        return {
          boundary:
            packet?.querySelector("[data-admin-dispatch-release-handoff-boundary='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          context:
            packet?.querySelector("[data-admin-dispatch-release-handoff-context='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          forbiddenPanelText: [
            "customer price",
            "paynow",
            "parser/debug",
            "debug internals",
            "invoice number",
            "payment link",
            "supabase url",
          ].filter((value) => lowerText.includes(value)),
          items: [...(packet?.querySelectorAll("[data-admin-dispatch-release-handoff-item]") || [])].map((item) => ({
            detail:
              item.querySelector("[data-admin-dispatch-release-handoff-detail]")?.textContent
                .replace(/\\s+/g, " ")
                .trim() || "",
            key: item.getAttribute("data-admin-dispatch-release-handoff-item") || "",
            label:
              item.querySelector("[data-admin-dispatch-release-handoff-label]")?.textContent
                .replace(/\\s+/g, " ")
                .trim() || "",
            state: item.getAttribute("data-admin-dispatch-release-handoff-item-state") || "",
          })),
          noteValue: packet?.querySelector("[data-admin-dispatch-release-handoff-note='true']")?.value ?? null,
          status:
            packet?.querySelector("[data-admin-dispatch-release-handoff-status='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          text,
          visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        };
      };
      const driverAcknowledgementReadiness = () => {
        const section = document.querySelector("[data-admin-driver-acknowledgement-readiness='true']");
        const rect = section?.getBoundingClientRect();
        const text = section?.innerText || "";
        const lowerText = text.toLowerCase();

        return {
          boundary:
            section?.querySelector("[data-admin-driver-acknowledgement-boundary='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          context:
            section?.querySelector("[data-admin-driver-acknowledgement-context='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          forbiddenPanelText: [
            "customer price",
            "paynow",
            "parser/debug",
            "debug internals",
            "invoice number",
            "payment link",
            "supabase url",
          ].filter((value) => lowerText.includes(value)),
          items: [...(section?.querySelectorAll("[data-admin-driver-acknowledgement-item]") || [])].map((item) => ({
            detail:
              item.querySelector("[data-admin-driver-acknowledgement-detail]")?.textContent
                .replace(/\\s+/g, " ")
                .trim() || "",
            key: item.getAttribute("data-admin-driver-acknowledgement-item") || "",
            label:
              item.querySelector("[data-admin-driver-acknowledgement-label]")?.textContent
                .replace(/\\s+/g, " ")
                .trim() || "",
            state: item.getAttribute("data-admin-driver-acknowledgement-item-state") || "",
          })),
          markReadyDisabled:
            section?.querySelector("[data-admin-driver-acknowledgement-mark-ready='true']")?.disabled ?? null,
          status:
            section?.querySelector("[data-admin-driver-acknowledgement-status='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          text,
          visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        };
      };
      const driverAcknowledgementFollowUp = () => {
        const section = document.querySelector("[data-admin-driver-acknowledgement-follow-up='true']");
        const rect = section?.getBoundingClientRect();
        const text = section?.innerText || "";
        const lowerText = text.toLowerCase();

        return {
          boundary:
            section?.querySelector("[data-admin-driver-acknowledgement-follow-up-boundary='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          context:
            section?.querySelector("[data-admin-driver-acknowledgement-follow-up-context='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          forbiddenPanelText: [
            "customer price",
            "paynow",
            "parser/debug",
            "debug internals",
            "invoice number",
            "payment link",
            "supabase url",
          ].filter((value) => lowerText.includes(value)),
          items: [...(section?.querySelectorAll("[data-admin-driver-acknowledgement-follow-up-item]") || [])].map(
            (item) => ({
              detail:
                item.querySelector("[data-admin-driver-acknowledgement-follow-up-detail]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              key: item.getAttribute("data-admin-driver-acknowledgement-follow-up-item") || "",
              label:
                item.querySelector("[data-admin-driver-acknowledgement-follow-up-label]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              state: item.getAttribute("data-admin-driver-acknowledgement-follow-up-item-state") || "",
            }),
          ),
          noteValue:
            section?.querySelector("[data-admin-driver-acknowledgement-follow-up-note='true']")?.value ?? null,
          options: [...(section?.querySelectorAll("[data-admin-driver-acknowledgement-follow-up-option]") || [])].map(
            (option) => ({
              disabled: option.disabled,
              label: option.textContent.replace(/\\s+/g, " ").trim(),
              state: option.getAttribute("data-admin-driver-acknowledgement-follow-up-option-state") || "",
              value: option.getAttribute("data-admin-driver-acknowledgement-follow-up-option") || "",
            }),
          ),
          status:
            section?.querySelector("[data-admin-driver-acknowledgement-follow-up-status='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          text,
          visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        };
      };
      const dayOfTripDispatchMonitor = () => {
        const section = document.querySelector("[data-admin-day-of-trip-dispatch-monitor='true']");
        const rect = section?.getBoundingClientRect();
        const text = section?.innerText || "";
        const lowerText = text.toLowerCase();

        return {
          boundary:
            section?.querySelector("[data-admin-day-of-trip-dispatch-monitor-boundary='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          context:
            section?.querySelector("[data-admin-day-of-trip-dispatch-monitor-context='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          forbiddenPanelText: [
            "customer price",
            "paynow",
            "parser/debug",
            "debug internals",
            "invoice number",
            "payment link",
            "supabase url",
          ].filter((value) => lowerText.includes(value)),
          items: [...(section?.querySelectorAll("[data-admin-day-of-trip-dispatch-monitor-item]") || [])].map(
            (item) => ({
              detail:
                item.querySelector("[data-admin-day-of-trip-dispatch-monitor-detail]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              key: item.getAttribute("data-admin-day-of-trip-dispatch-monitor-item") || "",
              label:
                item.querySelector("[data-admin-day-of-trip-dispatch-monitor-label]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              state: item.getAttribute("data-admin-day-of-trip-dispatch-monitor-item-state") || "",
            }),
          ),
          options: [...(section?.querySelectorAll("[data-admin-day-of-trip-dispatch-monitor-option]") || [])].map(
            (option) => ({
              disabled: option.disabled,
              label: option.textContent.replace(/\\s+/g, " ").trim(),
              state: option.getAttribute("data-admin-day-of-trip-dispatch-monitor-option-state") || "",
              value: option.getAttribute("data-admin-day-of-trip-dispatch-monitor-option") || "",
            }),
          ),
          status:
            section?.querySelector("[data-admin-day-of-trip-dispatch-monitor-status='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          text,
          visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        };
      };
      const dayOfTripExceptionEscalation = () => {
        const section = document.querySelector("[data-admin-day-of-trip-exception-escalation='true']");
        const rect = section?.getBoundingClientRect();
        const text = section?.innerText || "";
        const lowerText = text.toLowerCase();

        return {
          boundary:
            section?.querySelector("[data-admin-day-of-trip-exception-escalation-boundary='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          context:
            section?.querySelector("[data-admin-day-of-trip-exception-escalation-context='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          forbiddenPanelText: [
            "customer price",
            "paynow",
            "parser/debug",
            "debug internals",
            "invoice number",
            "payment link",
            "supabase url",
          ].filter((value) => lowerText.includes(value)),
          items: [...(section?.querySelectorAll("[data-admin-day-of-trip-exception-escalation-item]") || [])].map(
            (item) => ({
              detail:
                item.querySelector("[data-admin-day-of-trip-exception-escalation-detail]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              key: item.getAttribute("data-admin-day-of-trip-exception-escalation-item") || "",
              label:
                item.querySelector("[data-admin-day-of-trip-exception-escalation-label]")?.textContent
                  .replace(/\\s+/g, " ")
                  .trim() || "",
              state: item.getAttribute("data-admin-day-of-trip-exception-escalation-item-state") || "",
            }),
          ),
          noteValue:
            section?.querySelector("[data-admin-day-of-trip-exception-escalation-note='true']")?.value ?? null,
          options: [...(section?.querySelectorAll("[data-admin-day-of-trip-exception-escalation-option]") || [])].map(
            (option) => ({
              label: option.textContent.replace(/\\s+/g, " ").trim(),
              state: option.getAttribute("data-admin-day-of-trip-exception-escalation-option-state") || "",
              value: option.getAttribute("data-admin-day-of-trip-exception-escalation-option") || "",
            }),
          ),
          status:
            section?.querySelector("[data-admin-day-of-trip-exception-escalation-status='true']")?.textContent
              .replace(/\\s+/g, " ")
              .trim() || "",
          text,
          visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        };
      };

      return {
        buttonLabels: [...document.querySelectorAll("button")].map((button) => button.textContent.trim()),
        consoleErrors: window.__prestigeConsoleErrors || [],
        customerCopy: preTextByHeading("Customer Copy"),
        dayOfTripExceptionEscalation: dayOfTripExceptionEscalation(),
        dayOfTripDispatchMonitor: dayOfTripDispatchMonitor(),
        dispatchReleaseChecklist: dispatchReleaseChecklist(),
        dispatchReleaseHandoffPacket: dispatchReleaseHandoffPacket(),
        driverAcknowledgementFollowUp: driverAcknowledgementFollowUp(),
        driverAcknowledgementReadiness: driverAcknowledgementReadiness(),
        driverDispatch: pres.find((text) => text.includes("DRIVER DISPATCH")) || "",
        errors: window.__prestigeErrors || [],
        fields,
        fieldText: [...Object.values(fields), ...overrideReasons].join("\\n"),
        jobCardPreview: preTextByHeading("Job Card Preview"),
        manualExtraChargesReviewPreview: manualExtraChargesReviewPreview(),
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
    await waitForTravelerMemoryLookup("BROWSER UI TEST TRAVELER", "primary booking parse");

    const manualExtraChargeDefaultState = await evaluate(`(() => {
      const section = document.querySelector("[data-route-extras-child-seat-section='true']");
      const amount = section?.querySelector("[data-manual-extra-charges-amount='true']");
      const note = section?.querySelector("[data-manual-extra-charges-note='true']");
      const boundary = section?.querySelector("[data-manual-extra-charges-boundary='true']");
      const amountRect = amount?.getBoundingClientRect();
      const noteRect = note?.getBoundingClientRect();

      return {
        amountPlaceholder: amount?.getAttribute("placeholder") || "",
        amountValue: amount?.value ?? null,
        boundaryText: boundary?.textContent.replace(/\\s+/g, " ").trim() || "",
        buttons: [...(section?.querySelectorAll("button, a[href]") || [])].map((control) =>
          control.textContent.trim(),
        ),
        notePlaceholder: note?.getAttribute("placeholder") || "",
        noteValue: note?.value ?? null,
        sectionText: section?.innerText || "",
        amountVisible: Boolean(amountRect && amountRect.width > 0 && amountRect.height >= 40),
        noteVisible: Boolean(noteRect && noteRect.width > 0 && noteRect.height >= 40),
      };
    })()`);
    assert.equal(
      manualExtraChargeDefaultState.sectionText.includes("Route Extras & Child Seat"),
      true,
      "Expected manual Extra Charges field inside Route Extras & Child Seat",
    );
    assert.equal(manualExtraChargeDefaultState.amountValue, "");
    assert.equal(manualExtraChargeDefaultState.amountPlaceholder, "0");
    assert.equal(manualExtraChargeDefaultState.noteValue, "");
    assert.equal(
      manualExtraChargeDefaultState.notePlaceholder,
      "Add manual extra charge reason, if any",
    );
    assert.equal(manualExtraChargeDefaultState.amountVisible, true);
    assert.equal(manualExtraChargeDefaultState.noteVisible, true);
    assert.deepEqual(
      manualExtraChargeDefaultState.buttons,
      [],
      "Expected manual Extra Charges UI to add no action controls",
    );
    assert.match(manualExtraChargeDefaultState.boundaryText, /Manual staff entry only/);
    assert.match(manualExtraChargeDefaultState.boundaryText, /not included in totals/);
    assert.match(manualExtraChargeDefaultState.boundaryText, /invoice/);
    assert.match(manualExtraChargeDefaultState.boundaryText, /payment/);
    assert.match(manualExtraChargeDefaultState.boundaryText, /payout/);
    assert.match(manualExtraChargeDefaultState.boundaryText, /PDF/);
    assert.match(manualExtraChargeDefaultState.boundaryText, /accounting/);
    assert.match(manualExtraChargeDefaultState.boundaryText, /storage/);
    assert.match(manualExtraChargeDefaultState.boundaryText, /API/);
    assert.match(manualExtraChargeDefaultState.boundaryText, /Supabase/);
    assert.match(manualExtraChargeDefaultState.boundaryText, /notification/);

    const manualExtraChargePreviewDefaultState = await evaluate(`(() => {
      const preview = document.querySelector("[data-manual-extra-charges-review-preview='true']");
      const rect = preview?.getBoundingClientRect();

      return {
        amount:
          preview?.querySelector("[data-manual-extra-charges-review-amount='true']")?.textContent.trim() ||
          "",
        boundary:
          preview?.querySelector("[data-manual-extra-charges-review-boundary='true']")?.textContent
            .replace(/\\s+/g, " ")
            .trim() || "",
        buttons: [...(preview?.querySelectorAll("button, a[href]") || [])].map((control) =>
          control.textContent.trim(),
        ),
        note:
          preview?.querySelector("[data-manual-extra-charges-review-note='true']")?.textContent.trim() ||
          "",
        text: preview?.innerText || "",
        visible: Boolean(rect && rect.width > 0 && rect.height > 0),
      };
    })()`);
    assert.equal(manualExtraChargePreviewDefaultState.visible, true);
    assert.match(manualExtraChargePreviewDefaultState.text, /Manual Extra Charges/i);
    assert.match(manualExtraChargePreviewDefaultState.text, /Manual Extra Charges note/i);
    assert.equal(manualExtraChargePreviewDefaultState.amount, "$0.00");
    assert.equal(manualExtraChargePreviewDefaultState.note, "Blank");
    assert.deepEqual(
      manualExtraChargePreviewDefaultState.buttons,
      [],
      "Expected manual Extra Charges review preview to add no action controls",
    );
    assert.match(manualExtraChargePreviewDefaultState.boundary, /Manual staff entry only/);
    assert.match(manualExtraChargePreviewDefaultState.boundary, /Not billed, not saved, no total calculated/);
    assert.match(manualExtraChargePreviewDefaultState.boundary, /No invoice/);
    assert.match(manualExtraChargePreviewDefaultState.boundary, /statement/);
    assert.match(manualExtraChargePreviewDefaultState.boundary, /payment/);
    assert.match(manualExtraChargePreviewDefaultState.boundary, /PDF/);
    assert.match(manualExtraChargePreviewDefaultState.boundary, /payout/);
    assert.match(manualExtraChargePreviewDefaultState.boundary, /accounting/);
    assert.match(manualExtraChargePreviewDefaultState.boundary, /finance export/);
    assert.match(manualExtraChargePreviewDefaultState.boundary, /storage/);
    assert.match(manualExtraChargePreviewDefaultState.boundary, /API/);
    assert.match(manualExtraChargePreviewDefaultState.boundary, /Supabase/);
    assert.match(manualExtraChargePreviewDefaultState.boundary, /notification/);

    await evaluate(`(() => {
      window.__manualExtraChargesCalls = {
        beacon: [],
        fetch: [],
        storage: [],
        websocket: [],
        xhr: [],
      };
      if (!window.__manualExtraChargesOriginals) {
        window.__manualExtraChargesOriginals = {
          fetch: window.fetch,
          sendBeacon: navigator.sendBeacon || null,
          storageClear: Storage.prototype.clear,
          storageRemoveItem: Storage.prototype.removeItem,
          storageSetItem: Storage.prototype.setItem,
          webSocket: window.WebSocket || null,
          xhrOpen: XMLHttpRequest.prototype.open,
        };
      }
      const originals = window.__manualExtraChargesOriginals;
      window.fetch = (...args) => {
        const target = args[0]?.url || args[0];
        window.__manualExtraChargesCalls.fetch.push(String(target));
        return originals.fetch.apply(window, args);
      };
      XMLHttpRequest.prototype.open = function patchedManualExtraChargeOpen(method, url, ...rest) {
        window.__manualExtraChargesCalls.xhr.push(\`\${method} \${String(url)}\`);
        return originals.xhrOpen.call(this, method, url, ...rest);
      };
      if (navigator.sendBeacon && originals.sendBeacon) {
        navigator.sendBeacon = (...args) => {
          window.__manualExtraChargesCalls.beacon.push(String(args[0]));
          return originals.sendBeacon.apply(navigator, args);
        };
      }
      if (window.WebSocket && originals.webSocket) {
        const OriginalWebSocket = originals.webSocket;
        window.WebSocket = function ManualExtraChargeWebSocket(url, protocols) {
          window.__manualExtraChargesCalls.websocket.push(String(url));
          return protocols === undefined ? new OriginalWebSocket(url) : new OriginalWebSocket(url, protocols);
        };
        window.WebSocket.prototype = OriginalWebSocket.prototype;
        Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
      }
      Storage.prototype.setItem = function patchedManualExtraChargeSetItem(key, value) {
        window.__manualExtraChargesCalls.storage.push(\`setItem:\${String(key)}=\${String(value)}\`);
        return originals.storageSetItem.call(this, key, value);
      };
      Storage.prototype.removeItem = function patchedManualExtraChargeRemoveItem(key) {
        window.__manualExtraChargesCalls.storage.push(\`removeItem:\${String(key)}\`);
        return originals.storageRemoveItem.call(this, key);
      };
      Storage.prototype.clear = function patchedManualExtraChargeClear() {
        window.__manualExtraChargesCalls.storage.push("clear");
        return originals.storageClear.call(this);
      };
    })()`);

    const resetManualExtraChargesCalls = async () => {
      await evaluate(`(() => {
        window.__manualExtraChargesCalls = {
          beacon: [],
          fetch: [],
          storage: [],
          websocket: [],
          xhr: [],
        };
      })()`);
    };

    const readManualExtraChargesCallCount = async () =>
      evaluate(`(() => {
        const calls = window.__manualExtraChargesCalls || {};
        return ["beacon", "fetch", "storage", "websocket", "xhr"].reduce(
          (total, key) => total + (calls[key]?.length || 0),
          0,
        );
      })()`);

    const waitForManualExtraChargesNetworkQuiet = async (description) => {
      const timeoutMs = 3000;
      const quietMs = 500;
      const startedAt = Date.now();
      let quietStartedAt = Date.now();
      let lastCount = await readManualExtraChargesCallCount();

      while (Date.now() - startedAt < timeoutMs) {
        await sleep(50);
        const nextCount = await readManualExtraChargesCallCount();

        if (nextCount !== lastCount) {
          lastCount = nextCount;
          quietStartedAt = Date.now();
        }

        if (Date.now() - quietStartedAt >= quietMs) {
          return;
        }
      }

      throw new Error(`Timed out waiting for Manual Extra Charges network quiet: ${description}`);
    };

    await waitForManualExtraChargesNetworkQuiet("before manual Extra Charges edit guard");
    await resetManualExtraChargesCalls();

    const manualExtraChargeAmount = "47.25";
    const manualExtraChargeReason = "Airport parking fee test only";
    await setFieldValueByLabel("Extra Charges", manualExtraChargeAmount, "manual Extra Charges amount");
    await setFieldValueByLabel(
      "Extra Charges note / reason",
      manualExtraChargeReason,
      "manual Extra Charges note",
    );
    await waitForManualExtraChargesNetworkQuiet("after manual Extra Charges edits");

    const manualExtraChargeEditedState = await evaluate(`(async () => {
      const readStorage = (storage) =>
        Array.from({ length: storage.length }, (_, index) => {
          const key = storage.key(index);
          return [key, key ? storage.getItem(key) : ""].join("=");
        });
      const amountSentinel = ${JSON.stringify(manualExtraChargeAmount)};
      const reasonSentinel = ${JSON.stringify(manualExtraChargeReason)};
      const sentinels = [amountSentinel, reasonSentinel];
      const matchesSentinel = (value) =>
        sentinels.some((sentinel) => String(value || "").includes(sentinel));
      const section = document.querySelector("[data-route-extras-child-seat-section='true']");
      const amount = section?.querySelector("[data-manual-extra-charges-amount='true']");
      const note = section?.querySelector("[data-manual-extra-charges-note='true']");
      const pricing = [...document.querySelectorAll("section, div")].find((candidate) =>
        candidate.querySelector("h3")?.textContent.trim() === "Pricing",
      );
      const preview = document.querySelector("[data-manual-extra-charges-review-preview='true']");
      const pres = [...document.querySelectorAll("pre")].map((pre) => pre.innerText);
      const indexedDbNames = globalThis.indexedDB?.databases
        ? (await indexedDB.databases()).map((database) => database.name || "")
        : [];

      return {
        amountValue: amount?.value || "",
        calls: window.__manualExtraChargesCalls,
        cookieLeaks: matchesSentinel(document.cookie || ""),
        indexedDbLeaks: indexedDbNames.filter((name) => matchesSentinel(name)),
        localStorageLeaks: readStorage(localStorage).filter((value) => matchesSentinel(value)),
        noteValue: note?.value || "",
        previewAmount:
          preview?.querySelector("[data-manual-extra-charges-review-amount='true']")?.textContent.trim() ||
          "",
        previewBoundary:
          preview?.querySelector("[data-manual-extra-charges-review-boundary='true']")?.textContent
            .replace(/\\s+/g, " ")
            .trim() || "",
        previewButtons: [...(preview?.querySelectorAll("button, a[href]") || [])].map((control) =>
          control.textContent.trim(),
        ),
        previewLeaks: pres.filter((text) => matchesSentinel(text)),
        previewNote:
          preview?.querySelector("[data-manual-extra-charges-review-note='true']")?.textContent.trim() ||
          "",
        previewText: preview?.innerText || "",
        pricingText: pricing?.innerText || "",
        sessionStorageLeaks: readStorage(sessionStorage).filter((value) => matchesSentinel(value)),
      };
    })()`);
    assert.equal(manualExtraChargeEditedState.amountValue, manualExtraChargeAmount);
    assert.equal(manualExtraChargeEditedState.noteValue, manualExtraChargeReason);
    assert.equal(manualExtraChargeEditedState.previewAmount, "$47.25");
    assert.equal(manualExtraChargeEditedState.previewNote, manualExtraChargeReason);
    assert.match(manualExtraChargeEditedState.previewText, /Manual Extra Charges/i);
    assert.match(manualExtraChargeEditedState.previewText, /Manual Extra Charges note/i);
    assert.deepEqual(
      manualExtraChargeEditedState.previewButtons,
      [],
      "Expected manual Extra Charges review preview to remain display-only",
    );
    assert.match(manualExtraChargeEditedState.previewBoundary, /Manual staff entry only/);
    assert.match(manualExtraChargeEditedState.previewBoundary, /Not billed, not saved, no total calculated/);
    assert.match(manualExtraChargeEditedState.previewBoundary, /No invoice/);
    assert.match(manualExtraChargeEditedState.previewBoundary, /statement/);
    assert.match(manualExtraChargeEditedState.previewBoundary, /payment/);
    assert.match(manualExtraChargeEditedState.previewBoundary, /PDF/);
    assert.match(manualExtraChargeEditedState.previewBoundary, /payout/);
    assert.match(manualExtraChargeEditedState.previewBoundary, /accounting/);
    assert.match(manualExtraChargeEditedState.previewBoundary, /finance export/);
    assert.match(manualExtraChargeEditedState.previewBoundary, /storage/);
    assert.match(manualExtraChargeEditedState.previewBoundary, /API/);
    assert.match(manualExtraChargeEditedState.previewBoundary, /Supabase/);
    assert.match(manualExtraChargeEditedState.previewBoundary, /notification/);
    assert.deepEqual(
      unexpectedManualExtraChargeFetchCalls(manualExtraChargeEditedState.calls.fetch),
      [],
      "Expected manual Extra Charges edits not to call fetch",
    );
    assert.deepEqual(
      manualExtraChargeEditedState.calls.xhr,
      [],
      "Expected manual Extra Charges edits not to call XHR",
    );
    assert.deepEqual(
      manualExtraChargeEditedState.calls.beacon,
      [],
      "Expected manual Extra Charges edits not to call sendBeacon",
    );
    assert.deepEqual(
      manualExtraChargeEditedState.calls.websocket,
      [],
      "Expected manual Extra Charges edits not to open WebSocket",
    );
    assert.deepEqual(
      manualExtraChargeEditedState.calls.storage,
      [],
      "Expected manual Extra Charges edits not to write localStorage/sessionStorage",
    );
    assert.deepEqual(manualExtraChargeEditedState.localStorageLeaks, []);
    assert.deepEqual(manualExtraChargeEditedState.sessionStorageLeaks, []);
    assert.deepEqual(manualExtraChargeEditedState.indexedDbLeaks, []);
    assert.equal(manualExtraChargeEditedState.cookieLeaks, false);
    assert.deepEqual(
      manualExtraChargeEditedState.previewLeaks,
      [],
      "Expected manual Extra Charges amount/note not to enter job card, customer copy, or driver dispatch",
    );
    assert.equal(
      manualExtraChargeEditedState.pricingText.includes(manualExtraChargeAmount),
      false,
      "Expected manual Extra Charges amount not to auto-calculate into Pricing",
    );

    await resetManualExtraChargesCalls();
    await setFieldValueByLabel("Extra Charges", "", "manual Extra Charges amount reset");
    await setFieldValueByLabel("Extra Charges note / reason", "", "manual Extra Charges note reset");
    await waitForManualExtraChargesNetworkQuiet("after clearing manual Extra Charges");

    const manualExtraChargeResetState = await evaluate(`(() => {
      const section = document.querySelector("[data-route-extras-child-seat-section='true']");
      const preview = document.querySelector("[data-manual-extra-charges-review-preview='true']");
      return {
        amountValue: section?.querySelector("[data-manual-extra-charges-amount='true']")?.value || "",
        calls: window.__manualExtraChargesCalls,
        noteValue: section?.querySelector("[data-manual-extra-charges-note='true']")?.value || "",
        previewAmount:
          preview?.querySelector("[data-manual-extra-charges-review-amount='true']")?.textContent.trim() ||
          "",
        previewNote:
          preview?.querySelector("[data-manual-extra-charges-review-note='true']")?.textContent.trim() ||
          "",
      };
    })()`);
    assert.equal(manualExtraChargeResetState.amountValue, "");
    assert.equal(manualExtraChargeResetState.noteValue, "");
    assert.equal(manualExtraChargeResetState.previewAmount, "$0.00");
    assert.equal(manualExtraChargeResetState.previewNote, "Blank");
    assert.deepEqual(
      unexpectedManualExtraChargeFetchCalls(manualExtraChargeResetState.calls.fetch),
      [],
      "Expected clearing manual Extra Charges not to call fetch",
    );
    assert.deepEqual(
      manualExtraChargeResetState.calls.xhr,
      [],
      "Expected clearing manual Extra Charges not to call XHR",
    );
    assert.deepEqual(
      manualExtraChargeResetState.calls.beacon,
      [],
      "Expected clearing manual Extra Charges not to call sendBeacon",
    );
    assert.deepEqual(
      manualExtraChargeResetState.calls.websocket,
      [],
      "Expected clearing manual Extra Charges not to open WebSocket",
    );
    assert.deepEqual(
      manualExtraChargeResetState.calls.storage,
      [],
      "Expected clearing manual Extra Charges not to write storage",
    );
    await evaluate(`(() => {
      const originals = window.__manualExtraChargesOriginals;
      if (!originals) {
        return;
      }
      window.fetch = originals.fetch;
      XMLHttpRequest.prototype.open = originals.xhrOpen;
      if (originals.sendBeacon) {
        navigator.sendBeacon = originals.sendBeacon;
      }
      if (originals.webSocket) {
        window.WebSocket = originals.webSocket;
      }
      Storage.prototype.setItem = originals.storageSetItem;
      Storage.prototype.removeItem = originals.storageRemoveItem;
      Storage.prototype.clear = originals.storageClear;
    })()`);

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

    const editedJobCardCopyText = [
      "EDITED JOB CARD COPY",
      "Flight: SQ333",
      "Changi Airport T3 > Marina Bay Sands > Raffles Hotel Singapore",
      "Temporary WhatsApp edit only",
    ].join("\n");
    const clickedJobCardEdit = await evaluate(`(() => {
      const editButton = document.querySelector("[data-copy-edit-button='jobCard']");

      if (!editButton || editButton.disabled) {
        return false;
      }

      editButton.click();
      return true;
    })()`);
    assert.equal(clickedJobCardEdit, true, "Expected Job Card Preview Edit button to be clickable");

    const jobCardTextareaState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const textarea = document.querySelector("[data-copy-edit-textarea='jobCard']");

          return textarea
            ? {
                hasCancel: Boolean(document.querySelector("[data-copy-cancel-edit='jobCard']")),
                hasSave: Boolean(document.querySelector("[data-copy-save-edit='jobCard']")),
                value: textarea.value,
              }
            : false;
        })()`),
      10000,
      "Job Card editable textarea",
    );
    assert.equal(jobCardTextareaState.hasCancel, true);
    assert.equal(jobCardTextareaState.hasSave, true);
    assert.match(jobCardTextareaState.value, /Flight: SQ333/);

    await setInputValue("[data-copy-edit-textarea='jobCard']", editedJobCardCopyText, "Job Card copy edit");

    const clickedJobCardSaveEdit = await evaluate(`(() => {
      const saveButton = document.querySelector("[data-copy-save-edit='jobCard']");

      if (!saveButton || saveButton.disabled) {
        return false;
      }

      saveButton.click();
      return true;
    })()`);
    assert.equal(clickedJobCardSaveEdit, true, "Expected Job Card Save Edit button to be clickable");

    await waitForCondition(
      () =>
        evaluate(`(() => {
          const feedback = document.querySelector("[data-copy-feedback='job-card']");
          const preview = document.querySelector("[data-copy-preview='jobCard']");

          return feedback?.textContent.trim() === "Job card edit saved." &&
            preview?.innerText.includes("EDITED JOB CARD COPY") &&
            !document.querySelector("[data-copy-edit-textarea='jobCard']");
        })()`),
      10000,
      "Job Card edit saved feedback",
    );

    await evaluate(`window.__prestigeCopiedTexts = []`);
    const clickedEditedJobCardCopy = await evaluate(`(() => {
      const copyButton = document.querySelector("[data-copy-copy-button='jobCard']");

      if (!copyButton || copyButton.disabled) {
        return false;
      }

      copyButton.click();
      return true;
    })()`);
    assert.equal(clickedEditedJobCardCopy, true, "Expected edited Job Card Copy button to be clickable");

    const editedJobCardCopyState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const feedback = document.querySelector("[data-copy-feedback='job-card']");

          return feedback?.textContent.trim() === "Job card copied."
            ? {
                copiedText: (window.__prestigeCopiedTexts || []).slice(-1)[0] || "",
                globalCopyMessages: [...document.querySelectorAll("[data-status-panel='global']")]
                  .filter((element) => /copied/i.test(element.innerText))
                  .map((element) => element.innerText.trim()),
              }
            : false;
        })()`),
      10000,
      "edited Job Card copied text",
    );
    assert.deepEqual(editedJobCardCopyState.globalCopyMessages, []);
    assert.equal(
      editedJobCardCopyState.copiedText,
      editedJobCardCopyText,
      "Expected edited Job Card text to be copied instead of the generated preview",
    );

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

    const generatedDriverDispatchCopy =
      driverDispatchCopyPlacementState.copiedTexts[driverDispatchCopyPlacementState.copiedTexts.length - 1] || "";
    const editedDriverDispatchCopyText = `${generatedDriverDispatchCopy}\n\nDriver edit note: Temporary dispatch copy edit.`;
    const clickedDriverDispatchEdit = await evaluate(`(() => {
      const editButton = document.querySelector("[data-copy-edit-button='driverDispatch']");

      if (!editButton || editButton.disabled) {
        return false;
      }

      editButton.click();
      return true;
    })()`);
    assert.equal(clickedDriverDispatchEdit, true, "Expected Driver Dispatch Edit button to be clickable");

    await waitForCondition(
      () =>
        evaluate(`Boolean(document.querySelector("[data-copy-edit-textarea='driverDispatch']"))`),
      10000,
      "Driver Dispatch editable textarea",
    );
    await setInputValue(
      "[data-copy-edit-textarea='driverDispatch']",
      editedDriverDispatchCopyText,
      "Driver Dispatch copy edit",
    );

    const clickedDriverDispatchSaveEdit = await evaluate(`(() => {
      const saveButton = document.querySelector("[data-copy-save-edit='driverDispatch']");

      if (!saveButton || saveButton.disabled) {
        return false;
      }

      saveButton.click();
      return true;
    })()`);
    assert.equal(clickedDriverDispatchSaveEdit, true, "Expected Driver Dispatch Save Edit button to be clickable");
    await waitForCondition(
      () =>
        evaluate(`document.querySelector("[data-copy-feedback='driver-dispatch']")?.textContent.trim() === "Driver dispatch edit saved."`),
      10000,
      "Driver Dispatch edit saved feedback",
    );

    await evaluate(`window.__prestigeCopiedTexts = []`);
    const clickedEditedDriverDispatchCopy = await evaluate(`(() => {
      const copyButton = document.querySelector("[data-copy-copy-button='driverDispatch']");

      if (!copyButton || copyButton.disabled) {
        return false;
      }

      copyButton.click();
      return true;
    })()`);
    assert.equal(
      clickedEditedDriverDispatchCopy,
      true,
      "Expected edited Driver Dispatch Copy button to be clickable",
    );
    const editedDriverDispatchCopyState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const feedback = document.querySelector("[data-copy-feedback='driver-dispatch']");

          return feedback?.textContent.trim() === "Driver dispatch copied."
            ? {
                copiedText: (window.__prestigeCopiedTexts || []).slice(-1)[0] || "",
                globalCopyMessages: [...document.querySelectorAll("[data-status-panel='global']")]
                  .filter((element) => /copied/i.test(element.innerText))
                  .map((element) => element.innerText.trim()),
              }
            : false;
        })()`),
      10000,
      "edited Driver Dispatch copied text",
    );
    assert.deepEqual(editedDriverDispatchCopyState.globalCopyMessages, []);
    assert.equal(
      editedDriverDispatchCopyState.copiedText,
      editedDriverDispatchCopyText,
      "Expected edited Driver Dispatch text to be copied instead of the generated preview",
    );
    assert.match(editedDriverDispatchCopyState.copiedText, /DRIVER DISPATCH/);

    const savedCountBeforeAiAssist = await evaluate(
      `document.body.innerText.match(/Saved\\s+(\\d+)/)?.[1] || ""`,
    );
    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeOriginalFetch = window.__prestigeOriginalFetch || window.fetch.bind(window);
      window.fetch = async (...args) => {
        const target = args[0]?.url || args[0];
        const method = String(args[1]?.method || args[0]?.method || "GET").toUpperCase();
        const targetText = String(target);
        window.__prestigeFetchCalls.push(\`\${method} \${targetText}\`);

        if (targetText.includes("/api/ai-parse")) {
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
    const aiAssistLocalParseCalls = aiDraftState.fetchCalls.filter((call) => call.includes("/api/ai-parse"));
    assert.deepEqual(
      aiAssistLocalParseCalls,
      ["POST /api/ai-parse"],
      `Expected mock AI Assist to call local /api/ai-parse exactly once, got ${aiDraftState.fetchCalls.join(", ")}`,
    );
    const aiAssistUnexpectedIntegrationCalls = aiDraftState.fetchCalls.filter((call) => {
      const [method = "GET", ...urlParts] = call.split(" ");
      const url = urlParts.join(" ");
      const isLocalAiParse = url.includes("/api/ai-parse");
      const isReadOnlySupabaseRequest =
        ["GET", "HEAD", "OPTIONS"].includes(method) && /\/rest\/v1\//.test(url);

      if (isLocalAiParse || isReadOnlySupabaseRequest) {
        return false;
      }

      return (
        /\/rest\/v1\//.test(url) ||
        /stripe|hitpay|paypal|paynow|api\/payment|api\/bank|api\/email|api\/sms|api\/calendar|calendar|googleapis|graph\.microsoft|outlook|ical|ics|webhook|notification|whatsapp|email|sms|invoice|statement|pdf/i.test(url)
      );
    });
    assert.deepEqual(
      aiAssistUnexpectedIntegrationCalls,
      [],
      `Expected mock AI Assist not to save, send, sync, invoice, or call payment/bank APIs, got ${aiAssistUnexpectedIntegrationCalls.join(", ")}`,
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
        ${JSON.stringify(dashboardSameTimeAssignedT1234Fixture)},
      ];
      window.__prestigeFetchCalls = [];
      window.__prestigeDashboardDriverAssignmentBodies = [];
      window.__prestigeBookingCompletionRequests = [];
      window.__prestigeCompletedDeleteRequests = [];
      window.__prestigeLoadedBookings = loadedBookings;
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
          return new Response(JSON.stringify(window.__prestigeLoadedBookings || []), {
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
            const idMatch = String(target).match(/id=eq\\.([^&]+)/);
            const patchedId = idMatch ? decodeURIComponent(idMatch[1]) : "";
            window.__prestigeLoadedBookings = (window.__prestigeLoadedBookings || []).map((booking) =>
              String(booking.id) === patchedId
                ? {
                    ...booking,
                    status: parsedBody.status,
                    updated_at: parsedBody.updated_at,
                  }
                : booking,
            );

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

        if (method === "DELETE" && String(target).includes("/rest/v1/bookings")) {
          const idMatch = String(target).match(/id=eq\\.([^&]+)/);
          const deletedId = idMatch ? decodeURIComponent(idMatch[1]) : "";

          window.__prestigeCompletedDeleteRequests.push({
            id: deletedId,
            url: String(target),
          });
          window.__prestigeLoadedBookings = (window.__prestigeLoadedBookings || []).filter(
            (booking) => String(booking.id) !== deletedId,
          );

          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
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
      "18",
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
      "18",
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
      /29 May 2026, 1115hrs/,
      "Expected Dashboard Driver Dispatch copy to include the saved pickup date and time",
    );
    assert.match(
      dashboardDriverDispatchCopyState.copiedTexts[0] || "",
      /Flight: SQ777/,
      "Expected Dashboard Driver Dispatch copy to include the saved flight number",
    );
    assert.match(
      dashboardDriverDispatchCopyState.copiedTexts[0] || "",
      /Changi Airport\s*>\s*Marina Bay Sands\s*>\s*The Fullerton Hotel Singapore/,
      "Expected Dashboard Driver Dispatch copy to preserve the full job-card route when the saved route field is blank",
    );
    assert.match(
      dashboardDriverDispatchCopyState.copiedTexts[0] || "",
      /Plate: SLC777D/,
      "Expected Dashboard Driver Dispatch copy to include the current assigned car plate",
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
    assert.match(manualPayoutLoadedPricingState.customerCopy, /Service: Arrival/);
    assert.doesNotMatch(
      manualPayoutLoadedPricingState.customerCopy,
      /\b(?:AVF|VVV|Combi|Alphard|Vellfire|V-Class|V Class|Viano|minibus|mini bus|car type|vehicle type|service vehicle|MNG)\b/i,
      "Expected Customer Copy to show Arrival without vehicle type or the MNG booking code",
    );

    const clickedCustomerCopyCancelEdit = await evaluate(`(() => {
      const editButton = document.querySelector("[data-copy-edit-button='customerCopy']");

      if (!editButton || editButton.disabled) {
        return false;
      }

      editButton.click();
      return true;
    })()`);
    assert.equal(clickedCustomerCopyCancelEdit, true, "Expected Customer Copy Edit button to be clickable");

    const customerCopyTextareaState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const textarea = document.querySelector("[data-copy-edit-textarea='customerCopy']");

          return textarea
            ? {
                hasCancel: Boolean(document.querySelector("[data-copy-cancel-edit='customerCopy']")),
                hasSave: Boolean(document.querySelector("[data-copy-save-edit='customerCopy']")),
                value: textarea.value,
              }
            : false;
        })()`),
      10000,
      "Customer Copy editable textarea",
    );
    assert.equal(customerCopyTextareaState.hasCancel, true);
    assert.equal(customerCopyTextareaState.hasSave, true);
    assert.match(customerCopyTextareaState.value, /Thank you for choosing Prestige Limo SG\./);

    await setInputValue(
      "[data-copy-edit-textarea='customerCopy']",
      "CANCELLED CUSTOMER COPY EDIT",
      "Customer Copy cancelled edit",
    );

    const clickedCustomerCopyCancel = await evaluate(`(() => {
      const cancelButton = document.querySelector("[data-copy-cancel-edit='customerCopy']");

      if (!cancelButton || cancelButton.disabled) {
        return false;
      }

      cancelButton.click();
      return true;
    })()`);
    assert.equal(clickedCustomerCopyCancel, true, "Expected Customer Copy Cancel Edit button to be clickable");

    const cancelledCustomerCopyState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const feedback = document.querySelector("[data-copy-feedback='customer-copy']");
          const preview = document.querySelector("[data-copy-preview='customerCopy']");

          return feedback?.textContent.trim() === "Customer copy edit cancelled. Generated text restored." &&
            preview &&
            !preview.innerText.includes("CANCELLED CUSTOMER COPY EDIT")
            ? {
                feedbackText: feedback.textContent.trim(),
                globalCopyMessages: [...document.querySelectorAll("[data-status-panel='global']")]
                  .filter((element) => /edit|copied/i.test(element.innerText))
                  .map((element) => element.innerText.trim()),
                previewText: preview.innerText,
              }
            : false;
        })()`),
      10000,
      "Customer Copy cancel restored generated text",
    );
    assert.deepEqual(cancelledCustomerCopyState.globalCopyMessages, []);
    assert.match(cancelledCustomerCopyState.previewText, /Thank you for choosing Prestige Limo SG\./);

    const customerCopyManualNote = "Customer note: Please meet driver at the arrival area.";
    const editedLoadedCustomerCopyText = manualPayoutLoadedPricingState.customerCopy.replace(
      "\n\nThank you for choosing Prestige Limo SG.",
      `\n\n${customerCopyManualNote}\n\nThank you for choosing Prestige Limo SG.`,
    );
    const clickedCustomerCopyEditForSave = await evaluate(`(() => {
      const editButton = document.querySelector("[data-copy-edit-button='customerCopy']");

      if (!editButton || editButton.disabled) {
        return false;
      }

      editButton.click();
      return true;
    })()`);
    assert.equal(
      clickedCustomerCopyEditForSave,
      true,
      "Expected Customer Copy Edit button to be clickable after cancel",
    );

    await waitForCondition(
      () =>
        evaluate(`Boolean(document.querySelector("[data-copy-edit-textarea='customerCopy']"))`),
      10000,
      "Customer Copy editable textarea after cancel",
    );
    await setInputValue(
      "[data-copy-edit-textarea='customerCopy']",
      editedLoadedCustomerCopyText,
      "Customer Copy saved edit",
    );

    const clickedCustomerCopySaveEdit = await evaluate(`(() => {
      const saveButton = document.querySelector("[data-copy-save-edit='customerCopy']");

      if (!saveButton || saveButton.disabled) {
        return false;
      }

      saveButton.click();
      return true;
    })()`);
    assert.equal(clickedCustomerCopySaveEdit, true, "Expected Customer Copy Save Edit button to be clickable");

    const savedCustomerCopyEditState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const feedback = document.querySelector("[data-copy-feedback='customer-copy']");
          const preview = document.querySelector("[data-copy-preview='customerCopy']");

          return feedback?.textContent.trim() === "Customer copy edit saved." &&
            preview?.innerText.includes(${JSON.stringify(customerCopyManualNote)})
            ? {
                feedbackText: feedback.textContent.trim(),
                previewText: preview.innerText,
              }
            : false;
        })()`),
      10000,
      "Customer Copy edit saved feedback",
    );
    assert.match(savedCustomerCopyEditState.previewText, /Customer note: Please meet driver at the arrival area\./);

    const customerCopyEditUnaffectedFieldsState = await evaluate(extractStateScript);
    assert.equal(
      customerCopyEditUnaffectedFieldsState.fields.flight,
      "SQ777",
      "Expected Customer Copy editing not to change the booking flight field",
    );
    assert.equal(
      customerCopyEditUnaffectedFieldsState.fields.name,
      "DASHBOARD DRIVER TEST TRAVELER",
      "Expected Customer Copy editing not to change the booking passenger field",
    );
    assert.equal(
      customerCopyEditUnaffectedFieldsState.fields.vehicle,
      "AVF",
      "Expected Customer Copy editing not to change the saved booking vehicle field",
    );

    await evaluate(`window.__prestigeCopiedTexts = []`);

    const clickedLoadedCustomerCopy = await evaluate(`(() => {
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
      const section = sectionForHeading("Customer Copy");
      const copyButton = [...(section?.querySelectorAll("button") || [])].find(
        (button) => button.textContent.trim() === "Copy",
      );

      if (!copyButton || copyButton.disabled) {
        return false;
      }

      copyButton.click();
      return true;
    })()`);
    assert.equal(
      clickedLoadedCustomerCopy,
      true,
      "Expected loaded assigned booking Customer Copy button to be clickable",
    );

    const loadedCustomerCopyState = await waitForCondition(
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
          const section = sectionForHeading("Customer Copy");
          const copyButton = [...(section?.querySelectorAll("button") || [])].find(
            (button) => button.textContent.trim() === "Copy",
          );
          const feedback = section?.querySelector("[data-copy-feedback='customer-copy']");
          const buttonRect = copyButton?.getBoundingClientRect();
          const feedbackRect = feedback?.getBoundingClientRect();

          return feedback?.textContent.trim() === "Customer copy copied."
            ? {
                copiedText: (window.__prestigeCopiedTexts || []).slice(-1)[0] || "",
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
      "loaded assigned booking Customer Copy feedback",
    );
    assert.equal(loadedCustomerCopyState.feedbackText, "Customer copy copied.");
    assert.deepEqual(loadedCustomerCopyState.globalCopyMessages, []);
    assert.ok(
      loadedCustomerCopyState.distanceFromButton !== null &&
        loadedCustomerCopyState.distanceFromButton <= 80,
      `Expected Customer Copy feedback near its button, got ${loadedCustomerCopyState.distanceFromButton}px`,
    );
    assert.match(loadedCustomerCopyState.copiedText, /Passenger: DASHBOARD DRIVER TEST TRAVELER/);
    assert.match(loadedCustomerCopyState.copiedText, /Service: Arrival/);
    assert.match(loadedCustomerCopyState.copiedText, /29 May 2026, 1115hrs/);
    assert.match(loadedCustomerCopyState.copiedText, /Flight: SQ777/);
    assert.match(loadedCustomerCopyState.copiedText, /Pickup: Changi Airport/);
    assert.match(loadedCustomerCopyState.copiedText, /Drop-off: The Fullerton Hotel Singapore/);
    assert.match(
      loadedCustomerCopyState.copiedText,
      /Route: Changi Airport\s*>\s*Marina Bay Sands\s*>\s*The Fullerton Hotel Singapore/,
      "Expected Customer Copy to include the full route with extra stop",
    );
    assert.match(loadedCustomerCopyState.copiedText, /Driver: DASHBOARD TEST DRIVER/);
    assert.match(loadedCustomerCopyState.copiedText, /Driver contact: \+65 8555 7777/);
    assert.match(loadedCustomerCopyState.copiedText, /Car plate: SLC777D/);
    assert.match(loadedCustomerCopyState.copiedText, /Customer note: Please meet driver at the arrival area\./);
    assert.ok(
      loadedCustomerCopyState.copiedText.trim().endsWith("Thank you for choosing Prestige Limo SG."),
      "Expected Customer Copy to end with the Prestige Limo SG thank-you line",
    );
    assert.doesNotMatch(
      loadedCustomerCopyState.copiedText,
      /\b(?:AVF|VVV|Combi|Alphard|Vellfire|V-Class|V Class|Viano|minibus|mini bus|car type|vehicle type|service vehicle|MNG)\b|Payout|driver payout|internal payout|override reason|Dashboard assignment test|Meet at arrival belt|\$82/i,
      "Expected Customer Copy not to include vehicle type, payout, override reason, admin notes, or booking type code",
    );

    await evaluate(`window.__prestigeCopiedTexts = []`);

    const clickedLoadedDispatchDriverCopy = await evaluate(`(() => {
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
    assert.equal(
      clickedLoadedDispatchDriverCopy,
      true,
      "Expected loaded assigned booking Driver Dispatch Copy button to be clickable",
    );

    const loadedDispatchDriverCopyState = await waitForCondition(
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
          const buttonRect = copyButton?.getBoundingClientRect();
          const feedbackRect = feedback?.getBoundingClientRect();

          return feedback?.textContent.trim() === "Driver dispatch copied."
            ? {
                copiedText: (window.__prestigeCopiedTexts || []).slice(-1)[0] || "",
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
      "loaded assigned booking Driver Dispatch copy feedback",
    );
    assert.equal(loadedDispatchDriverCopyState.feedbackText, "Driver dispatch copied.");
    assert.deepEqual(loadedDispatchDriverCopyState.globalCopyMessages, []);
    assert.ok(
      loadedDispatchDriverCopyState.distanceFromButton !== null &&
        loadedDispatchDriverCopyState.distanceFromButton <= 80,
      `Expected loaded Driver Dispatch copy feedback near its button, got ${loadedDispatchDriverCopyState.distanceFromButton}px`,
    );
    assert.match(loadedDispatchDriverCopyState.copiedText, /DASHBOARD TEST DRIVER/);
    assert.match(loadedDispatchDriverCopyState.copiedText, /Contact: \+65 8555 7777/);
    assert.match(loadedDispatchDriverCopyState.copiedText, /Plate: SLC777D/);
    assert.match(loadedDispatchDriverCopyState.copiedText, /AVF MNG/);
    assert.match(loadedDispatchDriverCopyState.copiedText, /29 May 2026, 1115hrs/);
    assert.match(loadedDispatchDriverCopyState.copiedText, /Flight: SQ777/);
    assert.match(
      loadedDispatchDriverCopyState.copiedText,
      /Changi Airport\s*>\s*Marina Bay Sands\s*>\s*The Fullerton Hotel Singapore/,
      "Expected loaded Driver Dispatch copy to keep the full route waypoint from the saved job card",
    );
    assert.match(loadedDispatchDriverCopyState.copiedText, /Passenger: DASHBOARD DRIVER TEST TRAVELER/);
    assert.match(loadedDispatchDriverCopyState.copiedText, /Payout: \$82/);
    assert.doesNotMatch(
      loadedDispatchDriverCopyState.copiedText,
      /Payout: \$70|Driver TBC|OLD DASHBOARD TEST DRIVER/,
      "Expected loaded Driver Dispatch copy not to use stale or missing assigned driver details",
    );
    assert.doesNotMatch(
      loadedDispatchDriverCopyState.copiedText,
      /Driver Job Link|\/driver-job(?:\/|$)/,
      "Expected existing Driver Dispatch copy output not to include Driver Job Link text",
    );

    await evaluate(`window.__prestigeCopiedTexts = []`);

    const clickedDriverJobLinkCopy = await evaluate(`(() => {
      const sectionForHeading = (headingText) => {
        const heading = [...document.querySelectorAll("h2")].find(
          (candidate) => candidate.textContent.trim() === headingText,
        );
        let node = heading;

        while (node && node !== document.body) {
          if (
            node.querySelector?.("pre") &&
            [...node.querySelectorAll("button")].some(
              (button) => button.textContent.trim() === "Copy Driver Job Link",
            )
          ) {
            return node;
          }

          node = node.parentElement;
        }

        return null;
      };
      const section = sectionForHeading("Driver Job Link");
      const copyButton = [...(section?.querySelectorAll("button") || [])].find(
        (button) => button.textContent.trim() === "Copy Driver Job Link",
      );

      if (!section || !copyButton || copyButton.disabled) {
        return false;
      }

      copyButton.click();
      return true;
    })()`);
    assert.equal(clickedDriverJobLinkCopy, true, "Expected Driver Job Link copy button to be clickable");

    const driverJobLinkCopyState = await waitForCondition(
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
                [...node.querySelectorAll("button")].some(
                  (button) => button.textContent.trim() === "Copy Driver Job Link",
                )
              ) {
                return node;
              }

              node = node.parentElement;
            }

            return null;
          };
          const section = sectionForHeading("Driver Job Link");
          const copyButton = [...(section?.querySelectorAll("button") || [])].find(
            (button) => button.textContent.trim() === "Copy Driver Job Link",
          );
          const feedback = section?.querySelector("[data-copy-feedback='driver-job-link']");
          const preview = section?.querySelector("[data-copy-preview='driverJobLink']");
          const buttonRect = copyButton?.getBoundingClientRect();
          const feedbackRect = feedback?.getBoundingClientRect();

          return feedback?.textContent.trim() === "Driver job link copied."
            ? {
                copiedText: (window.__prestigeCopiedTexts || []).slice(-1)[0] || "",
                distanceFromButton:
                  buttonRect && feedbackRect ? Math.abs(feedbackRect.top - buttonRect.bottom) : null,
                feedbackText: feedback.textContent.trim(),
                globalCopyMessages: [...document.querySelectorAll("[data-status-panel='global']")]
                  .filter((element) => /copied/i.test(element.innerText))
                  .map((element) => element.innerText.trim()),
                previewText: preview?.innerText || "",
              }
            : false;
        })()`),
      10000,
      "loaded assigned booking Driver Job Link copy feedback",
    );
    assert.equal(driverJobLinkCopyState.feedbackText, "Driver job link copied.");
    assert.deepEqual(driverJobLinkCopyState.globalCopyMessages, []);
    assert.ok(
      driverJobLinkCopyState.distanceFromButton !== null &&
        driverJobLinkCopyState.distanceFromButton <= 80,
      `Expected Driver Job Link copy feedback near its button, got ${driverJobLinkCopyState.distanceFromButton}px`,
    );
    assert.match(driverJobLinkCopyState.previewText, /Driver Job Link/);
    assert.match(driverJobLinkCopyState.previewText, /Copy Driver Job Link|Driver Job Link/);
    assert.match(driverJobLinkCopyState.copiedText, /^Driver Job Link/);
    assert.match(driverJobLinkCopyState.copiedText, /Hi DASHBOARD TEST DRIVER,/);
    assert.match(driverJobLinkCopyState.copiedText, /https?:\/\/\S+\/driver-job\/mock-driver-job-valid-a/);
    assert.ok(
      driverJobLinkCopyState.copiedText.includes(driverJobMockUrl),
      `Expected Driver Job Link copy to include absolute mock driver job URL ${driverJobMockUrl}`,
    );
    assert.doesNotMatch(
      driverJobLinkCopyState.copiedText,
      /^\/driver-job\/mock-driver-job-valid-a$/m,
      "Expected Driver Job Link copy not to use a relative-only mock driver job path",
    );
    assert.doesNotMatch(
      driverJobLinkCopyState.copiedText,
      /\/driver-job-demo/,
      "Expected Driver Job Link copy not to point to the old demo page",
    );
    assert.match(
      driverJobLinkCopyState.copiedText,
      /Mock\/demo driver job link only until secure production driver links are implemented\./,
    );
    if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/.test(driverJobMockUrl)) {
      assert.match(
        driverJobLinkCopyState.copiedText,
        /Local demo link only\. Set NEXT_PUBLIC_APP_URL before sending to drivers\./,
      );
    }
    assert.match(driverJobLinkCopyState.copiedText, /Reference: ui-dashboard-driver-assignment-fixture/);
    assert.match(driverJobLinkCopyState.copiedText, /29 May 2026, 1115hrs/);
    assert.match(driverJobLinkCopyState.copiedText, /Flight: SQ777/);
    assert.match(driverJobLinkCopyState.copiedText, /Pickup:\s*Changi Airport/);
    assert.match(driverJobLinkCopyState.copiedText, /Drop-off:\s*The Fullerton Hotel Singapore/);
    assert.match(
      driverJobLinkCopyState.copiedText,
      /Route:\s*Changi Airport\s*>\s*Marina Bay Sands\s*>\s*The Fullerton Hotel Singapore/,
      "Expected Driver Job Link copy to include full route and waypoint",
    );
    assert.match(driverJobLinkCopyState.copiedText, /Status to update:\s*OTW \/ POB \/ Job Completed/);
    assert.doesNotMatch(
      driverJobLinkCopyState.copiedText,
      /Thank you for choosing Prestige Limo SG\.|Customer note:|driver payout|internal payout|override reason/i,
      "Expected Driver Job Link copy not to include customer-only or internal payout text",
    );
    assert.doesNotMatch(
      loadedCustomerCopyState.copiedText,
      /Driver Job Link|\/driver-job(?:\/|$)/,
      "Expected existing Customer Copy output not to include Driver Job Link text",
    );

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
    assert.doesNotMatch(
      dashboardJobCardCopyState.copiedTexts[dashboardJobCardCopyState.copiedTexts.length - 1] || "",
      /Driver Job Link|\/driver-job(?:\/|$)/,
      "Expected existing Job Card copy output not to include Driver Job Link text",
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
                hasDeleteButton: Boolean(
                  completedArticle.querySelector("[data-completed-delete-booking='${dashboardCompletionActionFixture.id}']"),
                ),
              }
            : false;
        })()`),
      10000,
      "marked completed booking in Completed tab",
    );

    assert.match(markedCompletedTabState.articleText, /Completed/i);
    assert.match(markedCompletedTabState.articleText, /COMPLETION ACTION TEST COMPANY/);
    assert.match(markedCompletedTabState.articleText, /COMPLETION ACTION TEST TRAVELER/);
    assert.match(markedCompletedTabState.articleText, /30 May 2026, 1845hrs/);
    assert.match(markedCompletedTabState.articleText, /Flight SQ779/);
    assert.match(
      markedCompletedTabState.articleText,
      /Changi Airport T3\s*>\s*Marina Bay Sands\s*>\s*Capella Singapore/,
      "Expected Completed tab to preserve the full route with extra stop after marking completed",
    );
    assert.match(
      markedCompletedTabState.articleText,
      /Driver:\s*COMPLETION ACTION DRIVER/,
      "Expected Completed tab to preserve the assigned driver after marking completed",
    );
    assert.match(
      markedCompletedTabState.articleText,
      /Driver contact:\s*\+65 8111 7799/,
      "Expected Completed tab to preserve the assigned driver contact after marking completed",
    );
    assert.match(
      markedCompletedTabState.articleText,
      /Car plate:\s*SLC779C/,
      "Expected Completed tab to preserve the assigned car plate after marking completed",
    );
    assert.match(
      markedCompletedTabState.articleText,
      /Customer \$115 \/ Driver \$80/,
      "Expected Completed tab to preserve the manual driver payout after marking completed",
    );
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
    assert.equal(
      markedCompletedTabState.hasDeleteButton,
      true,
      "Expected marked completed booking to offer Delete in Completed tab",
    );

    const clickedMarkedCompletedLoadThisBooking = await evaluate(`(() => {
      const completedArticle = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("COMPLETION ACTION TEST TRAVELER") &&
          candidate.innerText.includes("SQ779"),
      );
      const loadButton = completedArticle?.querySelector("[data-completed-load-booking='true']");

      if (!loadButton || loadButton.disabled) {
        return false;
      }

      loadButton.click();
      return true;
    })()`);
    assert.equal(
      clickedMarkedCompletedLoadThisBooking,
      true,
      "Expected marked completed booking Load this booking button to be clickable",
    );

    const markedCompletedLoadedDispatchState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(extractStateScript);

        return candidateState?.fields?.flight === "SQ779" &&
          candidateState?.fields?.name === "COMPLETION ACTION TEST TRAVELER"
          ? candidateState
          : false;
      },
      10000,
      "marked completed booking loaded into Dispatch",
    );
    assert.equal(markedCompletedLoadedDispatchState.fields.pickup, "Changi Airport T3");
    assert.equal(markedCompletedLoadedDispatchState.fields.extraStopLocation, "Marina Bay Sands");
    assert.equal(markedCompletedLoadedDispatchState.fields.dropoff, "Capella Singapore");
    assert.equal(markedCompletedLoadedDispatchState.fields.driverName, "COMPLETION ACTION DRIVER");
    assert.match(
      markedCompletedLoadedDispatchState.jobCardPreview,
      /Changi Airport T3\s*>\s*Marina Bay Sands\s*>\s*Capella Singapore/,
      "Expected completed booking Job Card preview to preserve the full route after load",
    );
    assert.match(markedCompletedLoadedDispatchState.driverDispatch, /COMPLETION ACTION DRIVER/);
    assert.match(markedCompletedLoadedDispatchState.driverDispatch, /Contact: \+65 8111 7799/);
    assert.match(markedCompletedLoadedDispatchState.driverDispatch, /Plate: SLC779C/);
    assert.match(markedCompletedLoadedDispatchState.driverDispatch, /Payout: \$80/);
    assert.match(
      markedCompletedLoadedDispatchState.driverDispatch,
      /Changi Airport T3\s*>\s*Marina Bay Sands\s*>\s*Capella Singapore/,
      "Expected completed booking Driver Dispatch copy to preserve the full route after load",
    );
    assert.match(markedCompletedLoadedDispatchState.customerCopy, /Driver: COMPLETION ACTION DRIVER/);
    assert.match(markedCompletedLoadedDispatchState.customerCopy, /Driver contact: \+65 8111 7799/);
    assert.match(markedCompletedLoadedDispatchState.customerCopy, /Car plate: SLC779C/);
    assert.match(
      markedCompletedLoadedDispatchState.customerCopy,
      /Route: Changi Airport T3\s*>\s*Marina Bay Sands\s*>\s*Capella Singapore/,
      "Expected completed booking Customer Copy to preserve the full route after load",
    );
    assert.doesNotMatch(
      markedCompletedLoadedDispatchState.customerCopy,
      /Payout|override reason|AVF MNG/i,
      "Expected completed booking Customer Copy to keep customer-facing copy protections after load",
    );

    await clickTab("Completed", "Completed Bookings");

    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeCompletedDeleteRequests = [];
      window.__prestigeUnhandledSupabaseCalls = [];
      window.__prestigeConfirmMessages = [];
      window.confirm = (message) => {
        window.__prestigeConfirmMessages.push(String(message));
        return false;
      };
    })()`);

    const clickedCancelCompletedDelete = await evaluate(`(() => {
      const completedArticle = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("COMPLETION ACTION TEST TRAVELER") &&
          candidate.innerText.includes("SQ779"),
      );
      const deleteButton = completedArticle?.querySelector("[data-completed-delete-booking='${dashboardCompletionActionFixture.id}']");

      if (!deleteButton || deleteButton.disabled) {
        return false;
      }

      deleteButton.click();
      return true;
    })()`);
    assert.equal(clickedCancelCompletedDelete, true, "Expected completed Delete button to be clickable");

    const cancelledCompletedDeleteState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const completedArticle = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("COMPLETION ACTION TEST TRAVELER") &&
              candidate.innerText.includes("SQ779"),
          );
          const deleteButton = completedArticle?.querySelector("[data-completed-delete-booking='${dashboardCompletionActionFixture.id}']");
          const completionMessage = completedArticle?.querySelector("[data-booking-completion-message='${dashboardCompletionActionFixture.id}']");
          const buttonRect = deleteButton?.getBoundingClientRect();
          const messageRect = completionMessage?.getBoundingClientRect();

          return completionMessage?.textContent.trim() === "Delete cancelled."
            ? {
                articleText: completedArticle?.innerText || "",
                confirmMessages: window.__prestigeConfirmMessages || [],
                deleteRequests: window.__prestigeCompletedDeleteRequests || [],
                distanceFromButton:
                  buttonRect && messageRect ? Math.abs(messageRect.top - buttonRect.bottom) : null,
                globalStatusText: document.querySelector("[data-status-panel='global']")?.textContent.trim() || "",
                messageText: completionMessage.textContent.trim(),
              }
            : false;
        })()`),
      10000,
      "cancelled completed delete feedback",
    );
    assert.deepEqual(cancelledCompletedDeleteState.confirmMessages, [
      "Delete this completed job from the app? This cannot be undone.",
    ]);
    assert.deepEqual(
      cancelledCompletedDeleteState.deleteRequests,
      [],
      "Expected cancelled completed delete not to call Supabase delete",
    );
    assert.match(cancelledCompletedDeleteState.articleText, /COMPLETION ACTION TEST TRAVELER/);
    assert.notEqual(
      cancelledCompletedDeleteState.globalStatusText,
      "Delete cancelled.",
      "Expected completed delete cancel feedback not to appear only in the global status panel",
    );
    assert.ok(
      cancelledCompletedDeleteState.distanceFromButton !== null &&
        cancelledCompletedDeleteState.distanceFromButton <= 120,
      `Expected completed delete cancel message near Delete button, got ${cancelledCompletedDeleteState.distanceFromButton}px`,
    );

    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeCompletedDeleteRequests = [];
      window.__prestigeUnhandledSupabaseCalls = [];
      window.__prestigeConfirmMessages = [];
      window.confirm = (message) => {
        window.__prestigeConfirmMessages.push(String(message));
        return true;
      };
    })()`);

    const clickedConfirmCompletedDelete = await evaluate(`(() => {
      const completedArticle = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("COMPLETION ACTION TEST TRAVELER") &&
          candidate.innerText.includes("SQ779"),
      );
      const deleteButton = completedArticle?.querySelector("[data-completed-delete-booking='${dashboardCompletionActionFixture.id}']");

      if (!deleteButton || deleteButton.disabled) {
        return false;
      }

      deleteButton.click();
      return true;
    })()`);
    assert.equal(
      clickedConfirmCompletedDelete,
      true,
      "Expected completed Delete button to be clickable after cancel",
    );

    const confirmedCompletedDeleteState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const deletedArticle = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("COMPLETION ACTION TEST TRAVELER") &&
              candidate.innerText.includes("SQ779"),
          );
          const otherCompletedArticle = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("COMPLETED TEST TRAVELER") &&
              candidate.innerText.includes("SQ888"),
          );
          const feedbackCard = document.querySelector("[data-completed-delete-feedback-card='${dashboardCompletionActionFixture.id}']");
          const completionMessage = feedbackCard?.querySelector("[data-booking-completion-message='${dashboardCompletionActionFixture.id}']");

          return !deletedArticle && completionMessage?.textContent.trim() === "Completed job deleted."
            ? {
                confirmMessages: window.__prestigeConfirmMessages || [],
                deleteRequests: window.__prestigeCompletedDeleteRequests || [],
                feedbackCardText: feedbackCard?.textContent.trim() || "",
                fetchCalls: window.__prestigeFetchCalls || [],
                globalStatusText: document.querySelector("[data-status-panel='global']")?.textContent.trim() || "",
                otherCompletedArticleText: otherCompletedArticle?.innerText || "",
                unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
              }
            : false;
        })()`),
      10000,
      "confirmed completed delete feedback",
    );
    assert.deepEqual(confirmedCompletedDeleteState.confirmMessages, [
      "Delete this completed job from the app? This cannot be undone.",
    ]);
    assert.deepEqual(
      confirmedCompletedDeleteState.unhandledSupabaseCalls,
      [],
      `Expected completed delete Supabase calls to be mocked, got ${confirmedCompletedDeleteState.unhandledSupabaseCalls.join(", ")}`,
    );
    const completedDeleteBookingCalls = confirmedCompletedDeleteState.fetchCalls.filter(
      (call) => call.startsWith("DELETE ") && call.includes("/rest/v1/bookings"),
    );
    assert.equal(
      confirmedCompletedDeleteState.deleteRequests.length,
      1,
      "Expected confirmed completed delete to make one booking DELETE request",
    );
    assert.equal(confirmedCompletedDeleteState.deleteRequests[0]?.id, dashboardCompletionActionFixture.id);
    assert.match(
      confirmedCompletedDeleteState.deleteRequests[0]?.url || "",
      new RegExp(`\\/rest\\/v1\\/bookings.*id=eq\\.${dashboardCompletionActionFixture.id}`),
    );
    assert.equal(
      completedDeleteBookingCalls.length,
      1,
      `Expected one DELETE booking fetch call, got ${confirmedCompletedDeleteState.fetchCalls.join(", ")}`,
    );
    assert.match(confirmedCompletedDeleteState.feedbackCardText, /Completed job deleted\./);
    assert.match(
      confirmedCompletedDeleteState.otherCompletedArticleText,
      /COMPLETED TEST TRAVELER/,
      "Expected deleting one completed job not to remove other completed jobs",
    );
    assert.notEqual(
      confirmedCompletedDeleteState.globalStatusText,
      "Completed job deleted.",
      "Expected completed delete success feedback not to appear only in the global status panel",
    );

    await clickTab("Bookings", "Load Bookings");

    const clickedReloadAfterCompletedDelete = await evaluate(`(() => {
      const loadButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Load Bookings",
      );

      if (!loadButton || loadButton.disabled) {
        return false;
      }

      loadButton.click();
      return true;
    })()`);
    assert.equal(
      clickedReloadAfterCompletedDelete,
      true,
      "Expected Load Bookings button to be clickable after completed delete",
    );

    await waitForCondition(
      () =>
        evaluate(`document.body.innerText.includes("Recent Bookings")`),
      10000,
      "bookings reloaded after completed delete",
    );

    await clickTab("Completed", "Completed Bookings");

    const completedDeleteReloadState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const articles = [...document.querySelectorAll("article")].map((article) => article.innerText);
          const bodyText = document.body.innerText;

          return bodyText.includes("Completed Bookings")
            ? {
                deletedBookingVisible: articles.some(
                  (articleText) =>
                    articleText.includes("COMPLETION ACTION TEST TRAVELER") &&
                    articleText.includes("SQ779"),
                ),
                otherCompletedVisible: articles.some(
                  (articleText) =>
                    articleText.includes("COMPLETED TEST TRAVELER") &&
                    articleText.includes("SQ888"),
                ),
              }
            : false;
        })()`),
      10000,
      "completed delete persistence after reload",
    );
    assert.equal(
      completedDeleteReloadState.deletedBookingVisible,
      false,
      "Expected deleted completed job not to reappear after Load Bookings",
    );
    assert.equal(
      completedDeleteReloadState.otherCompletedVisible,
      true,
      "Expected other completed jobs to remain after completed delete reload",
    );

    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeBookingCompletionRequests = [];
      window.__prestigeCompletedDeleteRequests = [];
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
	      const scrollDriverFixtures = Array.from({ length: 29 }, (_, index) => ({
	        ...savedDriver,
	        id: 9100 + index,
	        driver_name: \`SCROLL LIST DRIVER \${String(index + 1).padStart(2, "0")}\`,
	        contact_number: \`+65 7000 \${String(index + 1).padStart(4, "0")}\`,
	        vehicle_type: index % 2 ? "Viano" : "Sedan",
	        plate_number: \`SLD\${String(index + 1).padStart(3, "0")}T\`,
	        availability_status: index === 0 ? "inactive" : "available",
	        preferred_areas: "Orchard, Marina",
	        payout_preferences: "Scroll fixture payout note",
	        notes: "Scroll fixture driver note",
	      }));
	      window.__prestigeSavedDriver = savedDriver;
	      window.__prestigeDriverList = [savedDriver, ...scrollDriverFixtures];
	      const jsonResponse = (body, status = 200) =>
	        new Response(JSON.stringify(body), {
	          status,
	          headers: { "content-type": "application/json" },
	        });
	      const setSavedDriver = (nextDriver) => {
	        window.__prestigeSavedDriver = nextDriver;
	        window.__prestigeDriverList = [
	          nextDriver,
	          ...(window.__prestigeDriverList || []).filter((driver) => driver.id !== nextDriver.id),
	        ];
	      };
	      const persistDriverBody = (bodyText) => {
	        if (!bodyText) {
	          return;
	        }

        try {
          const parsed = JSON.parse(bodyText);
	          setSavedDriver({
	            ...(window.__prestigeSavedDriver || savedDriver),
	            ...parsed,
	            id: (window.__prestigeSavedDriver || savedDriver).id,
	          });
	        } catch {}
	      };

      window.__prestigeFetchCalls = [];
      window.__prestigeDriverProfileRequestBodies = [];
      window.__prestigeDriverDeleteRequests = [];
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
	            return jsonResponse(window.__prestigeDriverList || [window.__prestigeSavedDriver || savedDriver]);
	          }

          if (method === "POST") {
            persistDriverBody(bodyText);
            return jsonResponse([], 201);
          }

          if (method === "PATCH") {
            persistDriverBody(bodyText);
            return jsonResponse([]);
          }

          if (method === "DELETE") {
            const idMatch = decodeURIComponent(url).match(/[?&]id=eq\.([^&]+)/);
            const deletedId = idMatch?.[1] || "";
            window.__prestigeDriverDeleteRequests = [
              ...(window.__prestigeDriverDeleteRequests || []),
              { id: deletedId, url },
            ];
            window.__prestigeDriverList = (window.__prestigeDriverList || []).filter(
              (driver) => String(driver.id) !== String(deletedId),
            );

            if (String(window.__prestigeSavedDriver?.id) === String(deletedId)) {
              window.__prestigeSavedDriver = null;
            }

            return jsonResponse([]);
          }
        }

        if (url.includes("/rest/v1/bookings")) {
          if (method === "GET") {
            const idMatch = decodeURIComponent(url).match(/[?&]id=eq\.([^&]+)/);

            if (idMatch) {
              const bookingId = idMatch[1];
              const savedBooking =
                String(window.__prestigeDriverDeleteSavedBooking?.id) === String(bookingId)
                  ? window.__prestigeDriverDeleteSavedBooking
                  : (window.__prestigeLoadedBookings || []).find(
                      (booking) => String(booking.id) === String(bookingId),
                    ) || null;

              return jsonResponse(savedBooking);
            }

            return jsonResponse(window.__prestigeLoadedBookings || []);
          }

          if (method === "POST") {
            const parsed = bodyText ? JSON.parse(bodyText) : {};
            const nextId = 990510;
            window.__prestigeDriverDeleteSavedBooking = {
              ...(window.__prestigeDriverDeleteAssignedBooking || {}),
              ...parsed,
              id: nextId,
              companies: null,
              bookers: window.__prestigeDriverDeleteAssignedBooking?.bookers || null,
              travelers: window.__prestigeDriverDeleteAssignedBooking?.travelers || null,
            };

            return jsonResponse({ id: nextId }, 201);
          }
        }

        if (
          url.includes("/rest/v1/bookers") ||
          url.includes("/rest/v1/companies") ||
          url.includes("/rest/v1/travelers")
        ) {
          if (method === "GET") {
            return jsonResponse(null);
          }
        }

        window.__prestigeUnhandledSupabaseCalls.push(\`\${method} \${url}\`);
        return jsonResponse({ message: "Unhandled Supabase mock" }, 500);
      };
    })()`);

    const driverProfileValidationCases = [
      {
        expectedMessage: "Driver name is required.",
        label: "blank driver profile",
        values: {},
      },
      {
        expectedMessage: "Contact number is required.",
        label: "missing contact number",
        values: {
          driverName: "INCOMPLETE PROFILE TEST DRIVER",
          plateNumber: "SLV100A",
          vehicleType: "Alphard",
        },
      },
      {
        expectedMessage: "Vehicle type is required.",
        label: "missing vehicle type",
        values: {
          contactNumber: "+65 8000 1000",
          driverName: "INCOMPLETE PROFILE TEST DRIVER",
          plateNumber: "SLV100A",
        },
      },
      {
        expectedMessage: "Plate number is required.",
        label: "missing plate number",
        values: {
          contactNumber: "+65 8000 1000",
          driverName: "INCOMPLETE PROFILE TEST DRIVER",
          vehicleType: "Alphard",
        },
      },
    ];

    for (const validationCase of driverProfileValidationCases) {
      const clickedIncompleteDriverProfileSave = await evaluate(`(() => {
        const values = ${JSON.stringify(validationCase.values)};
        const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
        const labels = [...document.querySelectorAll("label")];
        const fieldForLabel = (labelText) => {
          const label = labels.find(
            (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
          );
          return label?.querySelector("input, select, textarea") || null;
        };
        const setValue = (control, value) => {
          if (!control) {
            return;
          }

          const descriptor = Object.getOwnPropertyDescriptor(control.constructor.prototype, "value");
          descriptor?.set?.call(control, value);
          control.dispatchEvent(new Event("input", { bubbles: true }));
          control.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const driverName = fieldForLabel("Driver name");
        const contactNumber = fieldForLabel("Contact number");
        const vehicleType = fieldForLabel("Vehicle type");
        const plateNumber = fieldForLabel("Plate number");
        const saveButton = [...document.querySelectorAll("button")].find(
          (button) => button.textContent.trim() === "Save Driver Profile",
        );

        if (!driverName || !contactNumber || !vehicleType || !plateNumber || !saveButton || saveButton.disabled) {
          return false;
        }

        window.__prestigeFetchCalls = [];
        window.__prestigeDriverProfileRequestBodies = [];
        window.__prestigeUnhandledSupabaseCalls = [];
        setValue(driverName, values.driverName || "");
        setValue(contactNumber, values.contactNumber || "");
        setValue(vehicleType, values.vehicleType || "");
        setValue(plateNumber, values.plateNumber || "");
        saveButton.click();
        return true;
      })()`);
      assert.equal(
        clickedIncompleteDriverProfileSave,
        true,
        `Expected Save Driver Profile to be clickable for ${validationCase.label}`,
      );

      const incompleteDriverProfileSaveState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const saveButton = [...document.querySelectorAll("button")].find(
              (button) => button.textContent.trim() === "Save Driver Profile",
            );
            const statusPanel = document.querySelector("[data-status-panel='global']");
            const saveButtonRect = saveButton?.getBoundingClientRect();
            const statusRect = statusPanel?.getBoundingClientRect();
            const requestBodies = window.__prestigeDriverProfileRequestBodies || [];

            return statusPanel?.textContent.trim() === ${JSON.stringify(validationCase.expectedMessage)}
              ? {
                  fetchCalls: window.__prestigeFetchCalls || [],
                  requestCount: requestBodies.length,
                  statusDistanceFromSaveButton:
                    saveButtonRect && statusRect ? Math.abs(statusRect.top - saveButtonRect.bottom) : null,
                  statusText: statusPanel.textContent.trim(),
                  unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
                }
              : false;
          })()`),
        10000,
        `driver profile validation for ${validationCase.label}`,
      );

      assert.equal(incompleteDriverProfileSaveState.requestCount, 0);
      assert.deepEqual(
        incompleteDriverProfileSaveState.fetchCalls,
        [],
        `Expected ${validationCase.label} validation not to call Supabase`,
      );
      assert.deepEqual(incompleteDriverProfileSaveState.unhandledSupabaseCalls, []);
      assert.ok(
        incompleteDriverProfileSaveState.statusDistanceFromSaveButton !== null &&
          incompleteDriverProfileSaveState.statusDistanceFromSaveButton <= 120,
        `Expected ${validationCase.label} validation error near Save Driver Profile button, got ${incompleteDriverProfileSaveState.statusDistanceFromSaveButton}px`,
      );
    }

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
          const driverSearchCount = document.querySelector("[data-driver-search-count='true']");
          const driverSearchHelper = document.querySelector("[data-driver-search-helper='true']");
          const saveButtonRect = saveButton?.getBoundingClientRect();
          const statusRect = statusPanel?.getBoundingClientRect();
          const saveRequest = (window.__prestigeDriverProfileRequestBodies || []).find(
            (entry) => entry.method === "POST" && String(entry.url).includes("/rest/v1/drivers"),
          );

          return {
            bodyText: document.body.innerText,
            driverRowTexts: [...document.querySelectorAll("[data-driver-profile-row]")].map((row) => row.innerText),
            driverSearchCountText: driverSearchCount?.textContent.trim() || "",
            driverSearchHelperText: driverSearchHelper?.textContent.trim() || "",
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

        return candidateState?.statusText === "Driver profile saved."
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
    assert.equal(driverProfileSaveState.driverSearchCountText, "Showing 0 of 30 drivers.");
    assert.equal(driverProfileSaveState.driverSearchHelperText, "Search driver name, phone, plate, or vehicle to show drivers.");
    assert.equal(driverProfileSaveState.driverRowTexts.length, 0);
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

    const driverProfileDuplicateCases = [
      {
        expectedMessage: "Contact number already belongs to SCROLL LIST DRIVER 01.",
        label: "duplicate inactive driver contact number",
        values: {
          contactNumber: "+65 7000 0001",
          driverName: "DUPLICATE CONTACT TEST DRIVER",
          plateNumber: "SLD900Z",
          vehicleType: "Alphard",
        },
      },
      {
        expectedMessage: "Plate number already belongs to REUSABLE PROFILE TEST DRIVER.",
        label: "duplicate plate number",
        values: {
          contactNumber: "+65 8000 2000",
          driverName: "DUPLICATE PLATE TEST DRIVER",
          plateNumber: "SLL901P",
          vehicleType: "Viano",
        },
      },
    ];

    for (const duplicateCase of driverProfileDuplicateCases) {
      const clickedDuplicateDriverProfileSave = await evaluate(`(() => {
        const values = ${JSON.stringify(duplicateCase.values)};
        const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
        const labels = [...document.querySelectorAll("label")];
        const fieldForLabel = (labelText) => {
          const label = labels.find(
            (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
          );
          return label?.querySelector("input, select, textarea") || null;
        };
        const setValue = (control, value) => {
          if (!control) {
            return;
          }

          const descriptor = Object.getOwnPropertyDescriptor(control.constructor.prototype, "value");
          descriptor?.set?.call(control, value);
          control.dispatchEvent(new Event("input", { bubbles: true }));
          control.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const driverName = fieldForLabel("Driver name");
        const contactNumber = fieldForLabel("Contact number");
        const vehicleType = fieldForLabel("Vehicle type");
        const plateNumber = fieldForLabel("Plate number");
        const saveButton = [...document.querySelectorAll("button")].find(
          (button) => button.textContent.trim() === "Save Driver Profile",
        );

        if (!driverName || !contactNumber || !vehicleType || !plateNumber || !saveButton || saveButton.disabled) {
          return false;
        }

        window.__prestigeFetchCalls = [];
        window.__prestigeDriverProfileRequestBodies = [];
        window.__prestigeUnhandledSupabaseCalls = [];
        setValue(driverName, values.driverName);
        setValue(contactNumber, values.contactNumber);
        setValue(vehicleType, values.vehicleType);
        setValue(plateNumber, values.plateNumber);
        saveButton.click();
        return true;
      })()`);
      assert.equal(
        clickedDuplicateDriverProfileSave,
        true,
        `Expected Save Driver Profile to be clickable for ${duplicateCase.label}`,
      );

      const duplicateDriverProfileSaveState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const saveButton = [...document.querySelectorAll("button")].find(
              (button) => button.textContent.trim() === "Save Driver Profile",
            );
            const statusPanel = document.querySelector("[data-status-panel='global']");
            const saveButtonRect = saveButton?.getBoundingClientRect();
            const statusRect = statusPanel?.getBoundingClientRect();
            const requestBodies = window.__prestigeDriverProfileRequestBodies || [];

            return statusPanel?.textContent.trim() === ${JSON.stringify(duplicateCase.expectedMessage)}
              ? {
                  fetchCalls: window.__prestigeFetchCalls || [],
                  requestCount: requestBodies.length,
                  statusDistanceFromSaveButton:
                    saveButtonRect && statusRect ? Math.abs(statusRect.top - saveButtonRect.bottom) : null,
                  statusText: statusPanel.textContent.trim(),
                  unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
                }
              : false;
          })()`),
        10000,
        `driver profile duplicate prevention for ${duplicateCase.label}`,
      );

      assert.equal(duplicateDriverProfileSaveState.requestCount, 0);
      assert.deepEqual(
        duplicateDriverProfileSaveState.fetchCalls,
        [],
        `Expected ${duplicateCase.label} prevention not to call Supabase`,
      );
      assert.deepEqual(duplicateDriverProfileSaveState.unhandledSupabaseCalls, []);
      assert.ok(
        duplicateDriverProfileSaveState.statusDistanceFromSaveButton !== null &&
          duplicateDriverProfileSaveState.statusDistanceFromSaveButton <= 120,
        `Expected ${duplicateCase.label} error near Save Driver Profile button, got ${duplicateDriverProfileSaveState.statusDistanceFromSaveButton}px`,
      );
    }

    await setInputValue("[data-driver-search-input='true']", "SCROLL LIST DRIVER", "Driver search broad match");
    const driverSearchScrollableState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const driverList = document.querySelector("[data-driver-list-scroll='true']");
          const driverListStyle = driverList ? getComputedStyle(driverList) : null;
          const rows = [...document.querySelectorAll("[data-driver-profile-row]")].map((row) => row.innerText);

          return rows.length === 29
            ? {
                countText: document.querySelector("[data-driver-search-count='true']")?.textContent.trim() || "",
                driverList: driverList
                  ? {
                      clientHeight: driverList.clientHeight,
                      overflowY: driverListStyle?.overflowY || "",
                      scrollHeight: driverList.scrollHeight,
                    }
                  : null,
                noMatchText: document.querySelector("[data-driver-search-empty='true']")?.textContent.trim() || "",
                rows,
              }
            : false;
        })()`),
      10000,
      "driver search broad scrollable match",
    );
    assert.equal(driverSearchScrollableState.countText, "Showing 29 of 30 drivers.");
    assert.equal(driverSearchScrollableState.noMatchText, "");
    assert.ok(driverSearchScrollableState.driverList, "Expected Driver Database rows to render in a scroll container");
    assert.match(driverSearchScrollableState.driverList.overflowY, /auto|scroll/);
    assert.ok(
      driverSearchScrollableState.driverList.scrollHeight > driverSearchScrollableState.driverList.clientHeight,
      `Expected Driver Database list to scroll, got scrollHeight=${driverSearchScrollableState.driverList.scrollHeight} clientHeight=${driverSearchScrollableState.driverList.clientHeight}`,
    );
    assert.ok(
      driverSearchScrollableState.driverList.clientHeight <= 340,
      `Expected Driver Database scroll container to stay bounded, got ${driverSearchScrollableState.driverList.clientHeight}px`,
    );

    const driverSearchQueries = [
      ["REUSABLE PROFILE", "driver name"],
      ["+65 8111", "contact number"],
      ["SLL901P", "plate number"],
      ["Alphard", "vehicle type"],
      ["busy", "availability"],
      ["Changi", "preferred areas"],
      ["Reusable profile save test note", "notes"],
    ];

    for (const [query, label] of driverSearchQueries) {
      await setInputValue("[data-driver-search-input='true']", query, `Driver search by ${label}`);
      const driverSearchMatchState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const rows = [...document.querySelectorAll("[data-driver-profile-row]")].map((row) => row.innerText);

            return rows.length === 1 &&
              rows[0].includes("REUSABLE PROFILE TEST DRIVER") &&
              rows[0].includes("SLL901P")
              ? {
                  countText: document.querySelector("[data-driver-search-count='true']")?.textContent.trim() || "",
                  noMatchText: document.querySelector("[data-driver-search-empty='true']")?.textContent.trim() || "",
                  rows,
                }
              : false;
          })()`),
        10000,
        `driver search by ${label}`,
      );

      assert.equal(driverSearchMatchState.countText, "Showing 1 of 30 drivers.");
      assert.equal(driverSearchMatchState.noMatchText, "");

      if (label === "driver name") {
        assert.match(driverSearchMatchState.rows[0], /busy/);
        assert.match(driverSearchMatchState.rows[0], /Plate:\s*SLL901P/);
        assert.match(driverSearchMatchState.rows[0], /Assigned jobs:\s*\d+/);
        assert.doesNotMatch(
          driverSearchMatchState.rows[0],
          /Prefers airport and CBD jobs|Reusable profile save test note/,
          "Expected Driver Database row to stay compact and omit long preferences/notes",
        );
      }
    }

    await setInputValue("[data-driver-search-input='true']", "NO LOCAL DRIVER MATCH", "Driver search no match");
    const driverSearchNoMatchState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const searchInput = document.querySelector("[data-driver-search-input='true']");
          const noMatch = document.querySelector("[data-driver-search-empty='true']");
          const inputRect = searchInput?.getBoundingClientRect();
          const noMatchRect = noMatch?.getBoundingClientRect();

          return noMatch?.textContent.trim() === "No matching drivers found."
            ? {
                countText: document.querySelector("[data-driver-search-count='true']")?.textContent.trim() || "",
                distanceFromSearch:
                  inputRect && noMatchRect ? Math.abs(noMatchRect.top - inputRect.bottom) : null,
                noMatchText: noMatch.textContent.trim(),
                rows: [...document.querySelectorAll("[data-driver-profile-row]")].map((row) => row.innerText),
              }
            : false;
        })()`),
      10000,
      "driver search no-match state",
    );
    assert.equal(driverSearchNoMatchState.countText, "Showing 0 of 30 drivers.");
    assert.equal(driverSearchNoMatchState.noMatchText, "No matching drivers found.");
    assert.deepEqual(driverSearchNoMatchState.rows, []);
    assert.ok(
      driverSearchNoMatchState.distanceFromSearch !== null &&
        driverSearchNoMatchState.distanceFromSearch <= 80,
      `Expected Driver search no-match message near search input, got ${driverSearchNoMatchState.distanceFromSearch}px`,
    );

    await setInputValue("[data-driver-search-input='true']", "", "Driver search clear");
    const driverSearchClearedState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const rows = [...document.querySelectorAll("[data-driver-profile-row]")].map((row) => row.innerText);

          return rows.length === 0 &&
            !document.querySelector("[data-driver-search-empty='true']")
            ? {
                countText: document.querySelector("[data-driver-search-count='true']")?.textContent.trim() || "",
                helperText: document.querySelector("[data-driver-search-helper='true']")?.textContent.trim() || "",
                rows,
              }
            : false;
        })()`),
      10000,
      "driver search cleared",
    );
    assert.equal(driverSearchClearedState.countText, "Showing 0 of 30 drivers.");
    assert.equal(driverSearchClearedState.helperText, "Search driver name, phone, plate, or vehicle to show drivers.");

    await setInputValue("[data-driver-search-input='true']", "REUSABLE PROFILE", "Driver search before row click");
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const rows = [...document.querySelectorAll("[data-driver-profile-row]")].map((row) => row.innerText);

          return rows.length === 1 &&
            rows[0].includes("REUSABLE PROFILE TEST DRIVER") &&
            rows[0].includes("SLL901P");
        })()`),
      10000,
      "driver search before saved row click",
    );

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

    await evaluate(`(() => {
      window.__prestigeDriverList = [
        ${JSON.stringify(dashboardPlateSearchDriverFixture)},
        ${JSON.stringify(dashboardT1234SearchDriverFixture)},
        ...(window.__prestigeDriverList || []),
      ];
    })()`);
    const clickedReloadDashboardSearchDrivers = await evaluate(`(() => {
      const loadButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Load Driver Database",
      );

      if (!loadButton || loadButton.disabled) {
        return false;
      }

      loadButton.click();
      return true;
    })()`);
    assert.equal(
      clickedReloadDashboardSearchDrivers,
      true,
      "Expected Driver Database reload to include Dashboard plate-search fixtures",
    );
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const count = document.querySelector("[data-driver-search-count='true']")?.textContent.trim() || "";

          return count === "Showing 1 of 32 drivers.";
        })()`),
      10000,
      "Dashboard plate-search driver fixtures loaded",
    );

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

    const dashboardProfileDriverDefaultSearchState = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
          candidate.innerText.includes("SQ776"),
      );
      const searchInput = article?.querySelector("[data-dashboard-driver-search-input='${dashboardProfilePayoutAssignmentFixture.id}']");
      const helper = article?.querySelector("[data-dashboard-driver-search-helper='${dashboardProfilePayoutAssignmentFixture.id}']");
      const select = article?.querySelector("[data-dashboard-driver-select='${dashboardProfilePayoutAssignmentFixture.id}']");

      return {
        helperText: helper?.textContent.trim() || "",
        optionTexts: [...(select?.querySelectorAll("option") || [])].map((option) => option.textContent.trim()),
        searchValue: searchInput?.value || "",
      };
    })()`);
    assert.equal(dashboardProfileDriverDefaultSearchState.searchValue, "");
    assert.equal(
      dashboardProfileDriverDefaultSearchState.helperText,
      "Search driver name, phone, plate, or vehicle to show drivers.",
    );
    assert.deepEqual(
      dashboardProfileDriverDefaultSearchState.optionTexts,
      ["Manual / unselected"],
      "Expected Dashboard assignment not to show the full driver list before searching",
    );

    await setInputValue(
      `[data-dashboard-driver-search-input='${dashboardProfilePayoutAssignmentFixture.id}']`,
      "NO DASHBOARD DRIVER MATCH",
      "Dashboard driver search no match",
    );
    const dashboardProfileDriverNoMatchState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
              candidate.innerText.includes("SQ776"),
          );
          const searchInput = article?.querySelector("[data-dashboard-driver-search-input='${dashboardProfilePayoutAssignmentFixture.id}']");
          const noMatch = article?.querySelector("[data-dashboard-driver-search-empty='${dashboardProfilePayoutAssignmentFixture.id}']");
          const count = article?.querySelector("[data-dashboard-driver-search-count='${dashboardProfilePayoutAssignmentFixture.id}']");
          const select = article?.querySelector("[data-dashboard-driver-select='${dashboardProfilePayoutAssignmentFixture.id}']");
          const inputRect = searchInput?.getBoundingClientRect();
          const noMatchRect = noMatch?.getBoundingClientRect();

          return noMatch?.textContent.trim() === "No matching drivers found."
            ? {
                countText: count?.textContent.trim() || "",
                distanceFromSearch:
                  inputRect && noMatchRect ? Math.abs(noMatchRect.top - inputRect.bottom) : null,
                noMatchText: noMatch.textContent.trim(),
                optionTexts: [...(select?.querySelectorAll("option") || [])].map((option) => option.textContent.trim()),
              }
            : false;
        })()`),
      10000,
      "Dashboard driver search no-match state",
    );
    assert.equal(dashboardProfileDriverNoMatchState.countText, "Showing 0 matching drivers.");
    assert.equal(dashboardProfileDriverNoMatchState.noMatchText, "No matching drivers found.");
    assert.deepEqual(dashboardProfileDriverNoMatchState.optionTexts, ["Manual / unselected"]);
    assert.ok(
      dashboardProfileDriverNoMatchState.distanceFromSearch !== null &&
        dashboardProfileDriverNoMatchState.distanceFromSearch <= 80,
      `Expected Dashboard driver search no-match message near search input, got ${dashboardProfileDriverNoMatchState.distanceFromSearch}px`,
    );

    await setInputValue(
      `[data-dashboard-driver-search-input='${dashboardProfilePayoutAssignmentFixture.id}']`,
      "REUSABLE PROFILE",
      "Dashboard driver search profile match",
    );
    const dashboardProfileDriverMatchState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
              candidate.innerText.includes("SQ776"),
          );
          const count = article?.querySelector("[data-dashboard-driver-search-count='${dashboardProfilePayoutAssignmentFixture.id}']");
          const noMatch = article?.querySelector("[data-dashboard-driver-search-empty='${dashboardProfilePayoutAssignmentFixture.id}']");
          const select = article?.querySelector("[data-dashboard-driver-select='${dashboardProfilePayoutAssignmentFixture.id}']");
          const optionTexts = [...(select?.querySelectorAll("option") || [])].map((option) => option.textContent.trim());

          return optionTexts.some((optionText) => optionText.includes("REUSABLE PROFILE TEST DRIVER"))
            ? {
                countText: count?.textContent.trim() || "",
                noMatchText: noMatch?.textContent.trim() || "",
                optionTexts,
              }
            : false;
        })()`),
      10000,
      "Dashboard driver search matching state",
    );
    assert.equal(dashboardProfileDriverMatchState.countText, "Showing 1 matching driver.");
    assert.equal(dashboardProfileDriverMatchState.noMatchText, "");
    assert.deepEqual(
      dashboardProfileDriverMatchState.optionTexts,
      ["Manual / unselected", "REUSABLE PROFILE TEST DRIVER (busy)"],
      "Expected Dashboard assignment to show only matching drivers after search",
    );

    const selectedProfileBeforeManualClear = await evaluate(`(() => {
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

      if (!driverSelect) {
        return false;
      }

      setValue(driverSelect, String(${reusableDriverProfileFixture.id}));
      return true;
    })()`);
    assert.equal(
      selectedProfileBeforeManualClear,
      true,
      "Expected Dashboard profile driver to be selectable before manual clear test",
    );

    const dashboardSelectedProfileState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
              candidate.innerText.includes("SQ776"),
          );
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const fieldForLabel = (labelText) => {
            const label = [...(article?.querySelectorAll("label") || [])].find(
              (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
            );
            return label?.querySelector("input, select, textarea") || null;
          };
          const driverSelect = fieldForLabel("Driver");

          const state = {
            contact: fieldForLabel("Driver Contact")?.value || "",
            name: fieldForLabel("Driver Name")?.value || "",
            payoutPlaceholder: fieldForLabel("Override Payout")?.getAttribute("placeholder") || "",
            payoutOverride: fieldForLabel("Override Payout")?.value || "",
            payoutReason: fieldForLabel("Override Reason")?.value || "",
            plate: fieldForLabel("Driver Car Plate")?.value || "",
            selectedDriverText: driverSelect?.options[driverSelect?.selectedIndex]?.textContent.trim() || "",
          };

          return state.name === "REUSABLE PROFILE TEST DRIVER" &&
            state.contact === "+65 8111 2222" &&
            state.plate === "SLL901P"
            ? state
            : false;
        })()`),
      10000,
      "Dashboard selected driver profile fills assignment details",
    );
    assert.equal(dashboardSelectedProfileState.name, "REUSABLE PROFILE TEST DRIVER");
    assert.equal(dashboardSelectedProfileState.contact, "+65 8111 2222");
    assert.equal(dashboardSelectedProfileState.plate, "SLL901P");
    assert.equal(
      dashboardSelectedProfileState.payoutOverride,
      "",
      "Expected selecting a driver profile not to keep a stale manual payout override",
    );
    assert.equal(
      dashboardSelectedProfileState.payoutPlaceholder,
      "66",
      "Expected selecting a driver profile to show the selected driver payout as the override placeholder",
    );
    assert.equal(
      dashboardSelectedProfileState.payoutReason,
      "",
      "Expected selecting a driver profile not to keep a stale payout reason",
    );
    assert.equal(dashboardSelectedProfileState.selectedDriverText, "REUSABLE PROFILE TEST DRIVER (busy)");

    await setInputValue(
      `[data-dashboard-driver-search-input='${dashboardProfilePayoutAssignmentFixture.id}']`,
      "test99",
      "Dashboard driver search by lowercase plate",
    );
    const dashboardPlateSearchState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
              candidate.innerText.includes("SQ776"),
          );
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const fieldForLabel = (labelText) => {
            const label = [...(article?.querySelectorAll("label") || [])].find(
              (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
            );
            return label?.querySelector("input, select, textarea") || null;
          };
          const select = article?.querySelector("[data-dashboard-driver-select='${dashboardProfilePayoutAssignmentFixture.id}']");
          const optionTexts = [...(select?.querySelectorAll("option") || [])].map((option) => option.textContent.trim());

          const state = {
            contact: fieldForLabel("Driver Contact")?.value || "",
            countText: article?.querySelector("[data-dashboard-driver-search-count='${dashboardProfilePayoutAssignmentFixture.id}']")?.textContent.trim() || "",
            name: fieldForLabel("Driver Name")?.value || "",
            noMatchText: article?.querySelector("[data-dashboard-driver-search-empty='${dashboardProfilePayoutAssignmentFixture.id}']")?.textContent.trim() || "",
            optionTexts,
            payoutOverride: fieldForLabel("Override Payout")?.value || "",
            payoutReason: fieldForLabel("Override Reason")?.value || "",
            plate: fieldForLabel("Driver Car Plate")?.value || "",
            searchValue: article?.querySelector("[data-dashboard-driver-search-input='${dashboardProfilePayoutAssignmentFixture.id}']")?.value || "",
            selectedDriverText: select?.options[select?.selectedIndex]?.textContent.trim() || "",
          };

          return state.countText === "Showing 1 matching driver." &&
            state.optionTexts.includes("TEST DRIVER CRM 20260516 (available)") &&
            state.name === "" &&
            state.contact === "" &&
            state.plate === "" &&
            state.payoutOverride === "" &&
            state.payoutReason === ""
            ? state
            : false;
        })()`),
      10000,
      "Dashboard driver search lowercase plate match clears stale selected profile",
    );
    assert.equal(dashboardPlateSearchState.searchValue, "test99");
    assert.equal(dashboardPlateSearchState.noMatchText, "");
    assert.deepEqual(
      dashboardPlateSearchState.optionTexts,
      ["Manual / unselected", "TEST DRIVER CRM 20260516 (available)"],
      "Expected lowercase plate search to show only the matching driver and no stale saved option",
    );
    assert.equal(dashboardPlateSearchState.selectedDriverText, "Manual / unselected");

    const selectedDashboardPlateDriver = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find(
        (candidate) =>
          candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
          candidate.innerText.includes("SQ776"),
      );
      const select = article?.querySelector("[data-dashboard-driver-select='${dashboardProfilePayoutAssignmentFixture.id}']");

      if (!select) {
        return false;
      }

      const descriptor = Object.getOwnPropertyDescriptor(select.constructor.prototype, "value");
      descriptor?.set?.call(select, String(${dashboardPlateSearchDriverFixture.id}));
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    assert.equal(selectedDashboardPlateDriver, true, "Expected lowercase plate match to be selectable");

    const selectedDashboardPlateDriverState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
              candidate.innerText.includes("SQ776"),
          );
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const fieldForLabel = (labelText) => {
            const label = [...(article?.querySelectorAll("label") || [])].find(
              (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
            );
            return label?.querySelector("input, select, textarea") || null;
          };

          const state = {
            contact: fieldForLabel("Driver Contact")?.value || "",
            name: fieldForLabel("Driver Name")?.value || "",
            plate: fieldForLabel("Driver Car Plate")?.value || "",
          };

          return state.name === "TEST DRIVER CRM 20260516" &&
            state.contact === "+65 8999 0099" &&
            state.plate === "TEST99"
            ? state
            : false;
        })()`),
      10000,
      "Dashboard lowercase plate driver fills assignment details",
    );
    assert.equal(selectedDashboardPlateDriverState.name, "TEST DRIVER CRM 20260516");
    assert.equal(selectedDashboardPlateDriverState.contact, "+65 8999 0099");
    assert.equal(selectedDashboardPlateDriverState.plate, "TEST99");

    await setInputValue(
      `[data-dashboard-driver-search-input='${dashboardProfilePayoutAssignmentFixture.id}']`,
      "T1234",
      "Dashboard driver search by uppercase plate",
    );
    const dashboardUppercasePlateSearchState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
              candidate.innerText.includes("SQ776"),
          );
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const fieldForLabel = (labelText) => {
            const label = [...(article?.querySelectorAll("label") || [])].find(
              (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
            );
            return label?.querySelector("input, select, textarea") || null;
          };
          const select = article?.querySelector("[data-dashboard-driver-select='${dashboardProfilePayoutAssignmentFixture.id}']");
          const optionTexts = [...(select?.querySelectorAll("option") || [])].map((option) => option.textContent.trim());

          const state = {
            contact: fieldForLabel("Driver Contact")?.value || "",
            countText: article?.querySelector("[data-dashboard-driver-search-count='${dashboardProfilePayoutAssignmentFixture.id}']")?.textContent.trim() || "",
            name: fieldForLabel("Driver Name")?.value || "",
            noMatchText: article?.querySelector("[data-dashboard-driver-search-empty='${dashboardProfilePayoutAssignmentFixture.id}']")?.textContent.trim() || "",
            optionTexts,
            plate: fieldForLabel("Driver Car Plate")?.value || "",
            selectedDriverText: select?.options[select?.selectedIndex]?.textContent.trim() || "",
          };

          return state.countText === "Showing 1 matching driver." &&
            state.optionTexts.includes("TEST1 (available)") &&
            state.name === "" &&
            state.contact === "" &&
            state.plate === ""
            ? state
            : false;
        })()`),
      10000,
      "Dashboard driver search uppercase plate match clears previous selection",
    );
    assert.equal(dashboardUppercasePlateSearchState.noMatchText, "");
    assert.deepEqual(
      dashboardUppercasePlateSearchState.optionTexts,
      ["Manual / unselected", "TEST1 (available)"],
      "Expected uppercase plate search to show TEST1 and clear the previous selected driver",
    );
    assert.equal(dashboardUppercasePlateSearchState.selectedDriverText, "Manual / unselected");

    await setInputValue(
      `[data-dashboard-driver-search-input='${dashboardProfilePayoutAssignmentFixture.id}']`,
      "REUSABLE PROFILE",
      "Dashboard driver search profile match after plate checks",
    );
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
              candidate.innerText.includes("SQ776"),
          );
          const select = article?.querySelector("[data-dashboard-driver-select='${dashboardProfilePayoutAssignmentFixture.id}']");
          const optionTexts = [...(select?.querySelectorAll("option") || [])].map((option) => option.textContent.trim());

          return optionTexts.includes("REUSABLE PROFILE TEST DRIVER (busy)") &&
            !optionTexts.some((optionText) => optionText.includes("TEST DRIVER CRM 20260516")) &&
            !optionTexts.some((optionText) => optionText.includes("TEST1"));
        })()`),
      10000,
      "Dashboard driver search profile rematch after plate checks",
    );

    const clearedDashboardProfileSelection = await evaluate(`(() => {
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
      const payoutReason = fieldForLabel("Override Reason");
      const driverNotes = fieldForLabel("Driver Notes");
      const includePayout = [...article.querySelectorAll("label")].find((candidate) =>
        candidate.innerText.includes("Include payout")
      )?.querySelector("input[type='checkbox']");

      if (!driverSelect || !payoutOverride || !payoutReason || !driverNotes || !includePayout) {
        return false;
      }

      setValue(payoutOverride, "144");
      setValue(payoutReason, "Stale payout reason should clear");
      setValue(driverNotes, "Stale driver note should clear");

      if (!includePayout.checked) {
        includePayout.click();
      }

      setValue(driverSelect, "");
      return true;
    })()`);
    assert.equal(
      clearedDashboardProfileSelection,
      true,
      "Expected Manual / unselected to be selectable after choosing a driver profile",
    );

    const dashboardManualSelectionClearedState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
              candidate.innerText.includes("SQ776"),
          );
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const fieldForLabel = (labelText) => {
            const label = [...(article?.querySelectorAll("label") || [])].find(
              (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
            );
            return label?.querySelector("input, select, textarea") || null;
          };
          const select = fieldForLabel("Driver");
          const includePayout = [...(article?.querySelectorAll("label") || [])].find((candidate) =>
            candidate.innerText.includes("Include payout")
          )?.querySelector("input[type='checkbox']");

          const state = {
            contact: fieldForLabel("Driver Contact")?.value || "",
            helperText: article?.querySelector("[data-dashboard-driver-search-helper='${dashboardProfilePayoutAssignmentFixture.id}']")?.textContent.trim() || "",
            includePayoutChecked: Boolean(includePayout?.checked),
            name: fieldForLabel("Driver Name")?.value || "",
            notes: fieldForLabel("Driver Notes")?.value || "",
            optionTexts: [...(select?.querySelectorAll("option") || [])].map((option) => option.textContent.trim()),
            payoutOverride: fieldForLabel("Override Payout")?.value || "",
            payoutReason: fieldForLabel("Override Reason")?.value || "",
            plate: fieldForLabel("Driver Car Plate")?.value || "",
            searchValue: article?.querySelector("[data-dashboard-driver-search-input='${dashboardProfilePayoutAssignmentFixture.id}']")?.value || "",
            selectedDriverText: select?.options[select?.selectedIndex]?.textContent.trim() || "",
          };

          return state.searchValue === "" &&
            state.name === "" &&
            state.contact === "" &&
            state.plate === "" &&
            state.payoutOverride === "" &&
            state.payoutReason === "" &&
            state.notes === "" &&
            state.includePayoutChecked === false &&
            state.optionTexts.length === 1 &&
            state.optionTexts[0] === "Manual / unselected"
            ? state
            : false;
        })()`),
      10000,
      "Dashboard Manual / unselected clears stale driver details",
    );
    assert.equal(dashboardManualSelectionClearedState.searchValue, "");
    assert.equal(
      dashboardManualSelectionClearedState.helperText,
      "Search driver name, phone, plate, or vehicle to show drivers.",
    );
    assert.deepEqual(dashboardManualSelectionClearedState.optionTexts, ["Manual / unselected"]);
    assert.equal(dashboardManualSelectionClearedState.selectedDriverText, "Manual / unselected");
    assert.equal(dashboardManualSelectionClearedState.name, "");
    assert.equal(dashboardManualSelectionClearedState.contact, "");
    assert.equal(dashboardManualSelectionClearedState.plate, "");
    assert.equal(dashboardManualSelectionClearedState.payoutOverride, "");
    assert.equal(dashboardManualSelectionClearedState.payoutReason, "");
    assert.equal(dashboardManualSelectionClearedState.notes, "");
    assert.equal(dashboardManualSelectionClearedState.includePayoutChecked, false);

    await setInputValue(
      `[data-dashboard-driver-search-input='${dashboardProfilePayoutAssignmentFixture.id}']`,
      "REUSABLE PROFILE",
      "Dashboard driver search profile rematch after manual clear",
    );
    await waitForCondition(
      () =>
        evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find(
            (candidate) =>
              candidate.innerText.includes("DASHBOARD PROFILE PAYOUT TRAVELER") &&
              candidate.innerText.includes("SQ776"),
          );
          const select = article?.querySelector("[data-dashboard-driver-select='${dashboardProfilePayoutAssignmentFixture.id}']");
          const optionTexts = [...(select?.querySelectorAll("option") || [])].map((option) => option.textContent.trim());

          return optionTexts.includes("REUSABLE PROFILE TEST DRIVER (busy)");
        })()`),
      10000,
      "Dashboard driver search rematch after manual clear",
    );

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

    await evaluate(`(() => {
      const alsonDuplicate = {
        ${Object.entries({
          id: 9905,
          driver_name: "Alson Toh",
          contact_number: "+65 9000 0000",
          vehicle_type: "Mercedes SSSS",
          plate_number: "PD 0000",
          payout_preferences: null,
          driver_payout_rules: null,
          availability_status: "available",
          notes: "Wrong duplicate driver cleanup fixture",
          preferred_areas: null,
          airport_permit_notes: null,
        })
          .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
          .join(",\n        ")}
      };
      const alisonCorrect = {
        ${Object.entries({
          id: 9906,
          driver_name: "Alison Toh",
          contact_number: "+65 90990723",
          vehicle_type: "Mercedes V Class",
          plate_number: "PD 9918 H",
          payout_preferences: null,
          driver_payout_rules: null,
          availability_status: "available",
          notes: "Correct driver cleanup fixture",
          preferred_areas: null,
          airport_permit_notes: null,
        })
          .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
          .join(",\n        ")}
      };
      const assignedDeleteBooking = ${JSON.stringify(driverDeleteAssignedBookingFixture)};
      window.__prestigeDriverDeleteAssignedBooking = assignedDeleteBooking;
      window.__prestigeLoadedBookings = [
        assignedDeleteBooking,
        ...(window.__prestigeLoadedBookings || []).filter(
          (booking) => String(booking.id) !== String(assignedDeleteBooking.id),
        ),
      ];
      window.__prestigeDriverList = [
        alsonDuplicate,
        alisonCorrect,
        ...(window.__prestigeDriverList || []).filter(
          (driver) => ![9905, 9906].includes(Number(driver.id)),
        ),
      ];
      window.__prestigeFetchCalls = [];
      window.__prestigeDriverProfileRequestBodies = [];
      window.__prestigeDriverDeleteRequests = [];
      window.__prestigeUnhandledSupabaseCalls = [];
      window.__prestigeDriverDeleteConfirmMessages = [];
    })()`);

    await clickTab("Bookings", "Load saved bookings");
    const clickedLoadBookingsForDriverDelete = await evaluate(`(() => {
      const loadButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Load Bookings",
      );

      if (!loadButton || loadButton.disabled) {
        return false;
      }

      loadButton.click();
      return true;
    })()`);
    assert.equal(
      clickedLoadBookingsForDriverDelete,
      true,
      "Expected bookings reload before driver delete cleanup test",
    );
    await waitForCondition(
      () => evaluate(`document.body.innerText.includes("Bookings loaded.")`),
      10000,
      "bookings reload before driver delete cleanup",
    );
    await clickTab("Drivers", "Driver Database");

    const clickedReloadDriversForDelete = await evaluate(`(() => {
      const loadButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Load Driver Database",
      );

      if (!loadButton || loadButton.disabled) {
        return false;
      }

      loadButton.click();
      return true;
    })()`);
    assert.equal(clickedReloadDriversForDelete, true, "Expected Driver Database reload before delete test");
    await waitForCondition(
      () => evaluate(`document.body.innerText.includes("Driver database loaded.")`),
      10000,
      "driver database reload before delete",
    );

    await setInputValue("[data-driver-search-input='true']", "TEST99", "Driver delete assigned-job search");
    const assignedDriverDeleteCancelState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const row = document.querySelector("[data-driver-profile-row='9901']");
          const deleteButton = document.querySelector("[data-driver-delete-button='9901']");

          if (!row || !deleteButton) {
            return false;
          }

          window.__prestigeDriverDeleteConfirmMessages = [];
          window.confirm = (message) => {
            window.__prestigeDriverDeleteConfirmMessages.push(String(message));
            return false;
          };
          deleteButton.click();

          return {
            confirmMessages: window.__prestigeDriverDeleteConfirmMessages || [],
            deleteRequests: window.__prestigeDriverDeleteRequests || [],
            messageText: document.querySelector("[data-driver-delete-message='9901']")?.textContent.trim() || "",
            rowText: row.innerText || "",
          };
        })()`);

        return candidateState?.messageText === "Driver delete cancelled." ? candidateState : false;
      },
      10000,
      "assigned driver delete cancel state",
    );

    assert.match(assignedDriverDeleteCancelState.rowText, /TEST DRIVER CRM 20260516/);
    assert.match(assignedDriverDeleteCancelState.rowText, /Assigned jobs:\s*[1-9]/);
    assert.deepEqual(
      assignedDriverDeleteCancelState.deleteRequests,
      [],
      "Expected cancelled assigned-driver delete not to call DELETE",
    );
    assert.match(
      assignedDriverDeleteCancelState.confirmMessages[0] || "",
      /This driver has \d+ assigned job/,
    );
    assert.match(
      assignedDriverDeleteCancelState.confirmMessages[0] || "",
      /Existing bookings will keep their saved driver details/,
    );

    await setInputValue("[data-driver-search-input='true']", "Alson", "Driver duplicate delete search");
    const alsonDeleteCancelState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const row = document.querySelector("[data-driver-profile-row='9905']");
          const deleteButton = document.querySelector("[data-driver-delete-button='9905']");

          if (!row || !deleteButton) {
            return false;
          }

          window.__prestigeDriverDeleteConfirmMessages = [];
          window.confirm = (message) => {
            window.__prestigeDriverDeleteConfirmMessages.push(String(message));
            return false;
          };
          deleteButton.click();

          return {
            confirmMessages: window.__prestigeDriverDeleteConfirmMessages || [],
            deleteRequests: window.__prestigeDriverDeleteRequests || [],
            messageText: document.querySelector("[data-driver-delete-message='9905']")?.textContent.trim() || "",
            rowText: row.innerText || "",
          };
        })()`);

        return candidateState?.messageText === "Driver delete cancelled." ? candidateState : false;
      },
      10000,
      "duplicate driver delete cancel state",
    );

    assert.match(alsonDeleteCancelState.rowText, /Alson Toh/);
    assert.match(alsonDeleteCancelState.rowText, /Assigned jobs:\s*1/);
    assert.match(
      alsonDeleteCancelState.confirmMessages[0] || "",
      /This driver has 1 assigned job\. Delete this driver from the Driver Database\? Existing bookings will keep their saved driver details\. This cannot be undone\./,
    );
    assert.deepEqual(
      alsonDeleteCancelState.deleteRequests,
      [],
      "Expected cancelled duplicate delete not to call DELETE",
    );

    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeDriverProfileRequestBodies = [];
      window.__prestigeDriverDeleteRequests = [];
      window.__prestigeUnhandledSupabaseCalls = [];
      window.__prestigeDriverDeleteConfirmMessages = [];
      window.confirm = (message) => {
        window.__prestigeDriverDeleteConfirmMessages.push(String(message));
        return true;
      };
    })()`);

    const clickedConfirmDeleteAlson = await evaluate(`(() => {
      const deleteButton = document.querySelector("[data-driver-delete-button='9905']");

      if (!deleteButton || deleteButton.disabled) {
        return false;
      }

      deleteButton.click();
      return true;
    })()`);
    assert.equal(clickedConfirmDeleteAlson, true, "Expected duplicate driver Delete button to be clickable");

    const deletedDriverState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const deletedRow = document.querySelector("[data-driver-profile-row='9905']");
          const feedback = document.querySelector("[data-driver-delete-feedback-card='9905']");
          const scrollList = document.querySelector("[data-driver-list-scroll='true']");
          const feedbackRect = feedback?.getBoundingClientRect();
          const scrollRect = scrollList?.getBoundingClientRect();
          const lutherBooking = (window.__prestigeLoadedBookings || []).find(
            (booking) => String(booking.id) === "906001",
          );
          const bookingRequests = (window.__prestigeDriverProfileRequestBodies || []).filter((entry) =>
            String(entry.url).includes("/rest/v1/bookings"),
          );
          const remainingCleanupDrivers = (window.__prestigeDriverList || []).filter((driver) =>
            ["Alson Toh", "Alison Toh"].includes(driver.driver_name),
          );

          if (deletedRow || feedback?.textContent.trim() !== "Driver deleted.") {
            return false;
          }

          return {
            bookingRequestCount: bookingRequests.length,
            confirmMessages: window.__prestigeDriverDeleteConfirmMessages || [],
            deleteRequests: window.__prestigeDriverDeleteRequests || [],
            fetchCalls: window.__prestigeFetchCalls || [],
            feedbackText: feedback?.textContent.trim() || "",
            feedbackInsideScrollList: Boolean(feedback && scrollList?.contains(feedback)),
            feedbackDistanceFromScrollTop:
              feedbackRect && scrollRect ? Math.abs(feedbackRect.top - scrollRect.top) : null,
            lutherDriver: {
              name: lutherBooking?.driver_name || "",
              contact: lutherBooking?.driver_contact || "",
              plate: lutherBooking?.driver_plate_number || "",
            },
            remainingCleanupDrivers,
            unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
          };
        })()`);

        return candidateState || false;
      },
      10000,
      "confirmed duplicate driver delete state",
    );

    assert.deepEqual(
      deletedDriverState.unhandledSupabaseCalls,
      [],
      `Expected driver delete Supabase calls to be mocked, got ${deletedDriverState.unhandledSupabaseCalls.join(", ")}`,
    );
    assert.equal(deletedDriverState.deleteRequests.length, 1, "Expected exactly one driver DELETE request");
    assert.equal(deletedDriverState.deleteRequests[0]?.id, "9905");
    assert.match(deletedDriverState.deleteRequests[0]?.url || "", /\/rest\/v1\/drivers.*id=eq\.9905/);
    assert.ok(
      deletedDriverState.fetchCalls.every((call) => call.includes("/rest/v1/drivers")),
      `Expected driver delete to call only drivers REST endpoints, got ${deletedDriverState.fetchCalls.join(", ")}`,
    );
    assert.equal(deletedDriverState.bookingRequestCount, 0, "Expected driver delete not to update booking rows");
    assert.equal(deletedDriverState.feedbackText, "Driver deleted.");
    assert.equal(
      deletedDriverState.feedbackInsideScrollList,
      true,
      "Expected driver delete success feedback inside the Driver Database list area",
    );
    assert.ok(
      deletedDriverState.feedbackDistanceFromScrollTop !== null &&
        deletedDriverState.feedbackDistanceFromScrollTop <= 80,
      `Expected driver delete success feedback near the deleted card, got ${deletedDriverState.feedbackDistanceFromScrollTop}px`,
    );
    assert.equal(deletedDriverState.lutherDriver.name, "TEST DRIVER CRM 20260516");
    assert.equal(deletedDriverState.lutherDriver.contact, "+65 8999 0099");
    assert.equal(deletedDriverState.lutherDriver.plate, "TEST99");
    assert.deepEqual(
      deletedDriverState.remainingCleanupDrivers.map((driver) => driver.driver_name),
      ["Alison Toh"],
      "Expected deleting Alson duplicate to keep the correct Alison record only",
    );

    const clickedReloadAfterDelete = await evaluate(`(() => {
      const loadButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Load Driver Database",
      );

      if (!loadButton || loadButton.disabled) {
        return false;
      }

      loadButton.click();
      return true;
    })()`);
    assert.equal(clickedReloadAfterDelete, true, "Expected Driver Database reload after delete");
    await waitForCondition(
      () => evaluate(`document.body.innerText.includes("Driver database loaded.")`),
      10000,
      "driver database reload after delete",
    );

    await setInputValue("[data-driver-search-input='true']", "Alson", "Driver deleted duplicate search");
    const deletedDriverReloadState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => ({
          noMatchText: document.querySelector("[data-driver-search-empty='true']")?.textContent.trim() || "",
          rowTexts: [...document.querySelectorAll("[data-driver-profile-row]")].map((row) => row.innerText),
        }))()`);

        return candidateState?.noMatchText === "No matching drivers found." ? candidateState : false;
      },
      10000,
      "deleted driver stays deleted after reload",
    );
    assert.ok(
      deletedDriverReloadState.rowTexts.every((rowText) => !rowText.includes("Alson Toh")),
      "Expected deleted Alson duplicate not to reappear after Driver Database reload",
    );

    await setInputValue("[data-driver-search-input='true']", "Alison", "Driver remaining duplicate search");
    const remainingAlisonState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const rows = [...document.querySelectorAll("[data-driver-profile-row]")].map((row) => row.innerText);
          return {
            rows,
            correctRowCount: rows.filter((rowText) => rowText.includes("Alison Toh")).length,
            wrongRowCount: rows.filter((rowText) => rowText.includes("Alson Toh")).length,
          };
        })()`);

        return candidateState?.correctRowCount === 1 ? candidateState : false;
      },
      10000,
      "remaining Alison duplicate row after delete",
    );
    assert.equal(remainingAlisonState.wrongRowCount, 0);
    assert.match(remainingAlisonState.rows.join("\\n"), /Mercedes V Class/);
    assert.match(remainingAlisonState.rows.join("\\n"), /PD 9918 H/);

    await clickTab("Dashboard", "Operations Dashboard");
    await setInputValue(
      "input[placeholder='Search name, company, or flight']",
      "",
      "Dashboard search before driver delete cleanup check",
    );
    const deletedDriverBookingCardState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const article = [...document.querySelectorAll("article")].find((candidate) =>
            candidate.innerText.includes("DRIVER DELETE STATE TEST TRAVELER"),
          );

          if (!article) {
            return false;
          }

          return {
            articleText: article.innerText || "",
            driverSelectValue:
              article.querySelector("[data-dashboard-driver-select='${driverDeleteAssignedBookingFixture.id}']")?.value ||
              "",
            driverNameValue:
              [...article.querySelectorAll("label")].find((label) =>
                label.textContent.includes("Driver Name"),
              )?.querySelector("input")?.value || "",
            driverContactValue:
              [...article.querySelectorAll("label")].find((label) =>
                label.textContent.includes("Driver Contact"),
              )?.querySelector("input")?.value || "",
            driverPlateValue:
              [...article.querySelectorAll("label")].find((label) =>
                label.textContent.includes("Driver Car Plate"),
              )?.querySelector("input")?.value || "",
          };
        })()`);

        return candidateState?.articleText?.includes("Alson Toh") ? candidateState : false;
      },
      10000,
      "deleted driver id cleared from dashboard booking card",
    );

    assert.equal(
      deletedDriverBookingCardState.driverSelectValue,
      "",
      "Expected dashboard booking card to clear deleted driver id from local driver selection",
    );
    assert.match(deletedDriverBookingCardState.articleText, /Driver:\s*Alson Toh/);
    assert.equal(deletedDriverBookingCardState.driverNameValue, "Alson Toh");
    assert.equal(deletedDriverBookingCardState.driverContactValue, "+65 9000 0000");
    assert.equal(deletedDriverBookingCardState.driverPlateValue, "PD 0000");

    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeDriverProfileRequestBodies = [];
      window.__prestigeUnhandledSupabaseCalls = [];
      window.__prestigeDriverDeleteSavedBooking = null;
    })()`);

    const clickedLoadDeletedDriverBooking = await evaluate(`(() => {
      const article = [...document.querySelectorAll("article")].find((candidate) =>
        candidate.innerText.includes("DRIVER DELETE STATE TEST TRAVELER"),
      );
      const loadButton = article?.querySelector("[data-dashboard-load-booking='true']");

      if (!loadButton) {
        return false;
      }

      loadButton.click();
      return true;
    })()`);
    assert.equal(
      clickedLoadDeletedDriverBooking,
      true,
      "Expected booking with deleted driver id to load into Dispatch",
    );

    const dispatchDeletedDriverState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const normalizeLabel = (value) => (value || "").replace(/\\*/g, "").replace(/\\s+/g, " ").trim();
          const labels = [...document.querySelectorAll("label")];
          const fieldValue = (labelText) => {
            const label = labels.find(
              (candidate) => normalizeLabel(candidate.querySelector("span")?.textContent) === labelText,
            );
            const control = label?.querySelector("input, select, textarea");

            return control?.value || "";
          };

          return {
            statusText: document.querySelector("[data-status-panel='global']")?.textContent.trim() || "",
            driverId: fieldValue("Driver"),
            driverName: fieldValue("Driver Name"),
            driverContact: fieldValue("Driver Contact"),
            driverPlate: fieldValue("Driver Car Plate"),
          };
        })()`);

        return candidateState?.driverName === "Alson Toh" &&
          candidateState?.driverContact === "+65 9000 0000" &&
          candidateState?.driverPlate === "PD 0000"
          ? candidateState
          : false;
      },
      10000,
      "deleted driver booking loaded into Dispatch",
    );

    assert.equal(dispatchDeletedDriverState.driverId, "");
    assert.equal(dispatchDeletedDriverState.driverName, "Alson Toh");
    assert.equal(dispatchDeletedDriverState.driverContact, "+65 9000 0000");
    assert.equal(dispatchDeletedDriverState.driverPlate, "PD 0000");

    await evaluate(`(() => {
      window.__prestigeFetchCalls = [];
      window.__prestigeDriverProfileRequestBodies = [];
      window.__prestigeUnhandledSupabaseCalls = [];
    })()`);

    const clickedSaveAfterDriverDelete = await evaluate(`(() => {
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
      clickedSaveAfterDriverDelete,
      true,
      "Expected booking save after driver profile delete to be clickable",
    );

    const saveAfterDriverDeleteState = await waitForCondition(
      async () => {
        const candidateState = await evaluate(`(() => {
          const bookingInsert = (window.__prestigeDriverProfileRequestBodies || []).find(
            (entry) => entry.method === "POST" && String(entry.url).includes("/rest/v1/bookings"),
          );
          const bookingDeleteOrPatchRequests = (window.__prestigeDriverProfileRequestBodies || []).filter(
            (entry) =>
              ["DELETE", "PATCH"].includes(entry.method) && String(entry.url).includes("/rest/v1/bookings"),
          );

          return {
            bookingInsert: bookingInsert?.body || null,
            bookingDeleteOrPatchCount: bookingDeleteOrPatchRequests.length,
            fetchCalls: window.__prestigeFetchCalls || [],
            statusText: document.body.innerText || "",
            unhandledSupabaseCalls: window.__prestigeUnhandledSupabaseCalls || [],
          };
        })()`);

        return candidateState?.statusText?.includes("Booking saved successfully: 990510")
          ? candidateState
          : false;
      },
      10000,
      "booking save after driver profile delete",
    );

    assert.deepEqual(
      saveAfterDriverDeleteState.unhandledSupabaseCalls,
      [],
      `Expected booking save after driver delete calls to be mocked, got ${saveAfterDriverDeleteState.unhandledSupabaseCalls.join(", ")}`,
    );
    assert.equal(
      saveAfterDriverDeleteState.bookingInsert?.driver_id,
      null,
      "Expected booking save after driver profile delete not to send deleted driver id",
    );
    assert.equal(saveAfterDriverDeleteState.bookingInsert?.driver_name, "Alson Toh");
    assert.equal(saveAfterDriverDeleteState.bookingInsert?.driver_contact, "+65 9000 0000");
    assert.equal(saveAfterDriverDeleteState.bookingInsert?.driver_plate_number, "PD 0000");
    assert.equal(
      saveAfterDriverDeleteState.bookingInsert?.driver_payout_amount,
      88,
      "Expected saved driver payout snapshot to remain after profile delete",
    );
    assert.equal(
      saveAfterDriverDeleteState.bookingDeleteOrPatchCount,
      0,
      "Expected booking save after driver profile delete not to patch/delete existing bookings",
    );

    const clickedRestoreAfterDriverDeleteClear = await evaluate(`(() => {
      const clearButton = [...document.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Clear",
      );

      if (!clearButton || clearButton.disabled) {
        return false;
      }

      clearButton.click();
      return true;
    })()`);
    assert.equal(
      clickedRestoreAfterDriverDeleteClear,
      true,
      "Expected Clear button to restore Dispatch draft after driver delete cleanup check",
    );

    await setInputValue("textarea", bookingSample, "restored Dispatch booking message after driver delete");

    const clickedRestoreAfterDriverDeleteParse = await evaluate(`(() => {
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
      clickedRestoreAfterDriverDeleteParse,
      true,
      "Expected Create Job Card button to restore Dispatch draft after driver delete cleanup check",
    );

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
      "restored Dispatch draft after driver delete cleanup check",
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
      const dashboardArticle = document.querySelector(
        "[data-dashboard-operational-card='${loadedSavedBookingFixture.id}']",
      );
      const loadThisBookingButton = dashboardArticle?.querySelector("[data-dashboard-load-booking='true']");

      if (
        !dashboardArticle ||
        !dashboardArticle.innerText.includes("LOADED SAVED TRAVELER") ||
        !dashboardArticle.innerText.includes("SQ999") ||
        !loadThisBookingButton ||
        loadThisBookingButton.disabled
      ) {
        return false;
      }

      loadThisBookingButton.click();
      return true;
    })()`);
    assert.equal(
      clickedDashboardLoadThisBooking,
      true,
      "Expected LOADED SAVED booking dashboard Load this booking button to be clickable",
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
    assert.match(lutherLoadedPricingState.customerCopy, /Service: Departure/);
    assert.doesNotMatch(
      lutherLoadedPricingState.customerCopy,
      /Customer note: Please meet driver at the arrival area\./,
      "Expected edited Customer Copy text to reset when a different booking is loaded",
    );
    assert.doesNotMatch(
      lutherLoadedPricingState.customerCopy,
      /\b(?:AVF|VVV|Combi|Alphard|Vellfire|V-Class|V Class|Viano|minibus|mini bus|car type|vehicle type|service vehicle|DEP)\b/i,
      "Expected Customer Copy to show Departure without vehicle type or the DEP booking code",
    );

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
            bodyText.includes("PRICE DISPLAY CUSTOMER ONLY TRAVELER") &&
            !bodyText.includes("COMPLETION ACTION TEST TRAVELER") &&
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
              manualExtraCharges: fieldValue("Extra Charges"),
              manualExtraChargesNote: fieldValue("Extra Charges note / reason"),
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
    assert.equal(crmReloadState.fields.manualExtraCharges, "");
    assert.equal(crmReloadState.fields.manualExtraChargesNote, "");
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
          candidateState?.fields?.vehicle === "E-Class" &&
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
    assert.equal(exactDepartureState.fields.vehicle, "E-Class");
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
    assert.equal(routeNameAirportState.fields.vehicle, "E-Class");
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
    assert.match(freeformTransferState.customerCopy, /Service: City Transfer/);
    assert.doesNotMatch(
      freeformTransferState.customerCopy,
      /\b(?:AVF|VVV|Combi|Alphard|Vellfire|V-Class|V Class|Viano|minibus|mini bus|car type|vehicle type|service vehicle|TRF)\b/i,
      "Expected Customer Copy to show City Transfer without vehicle type or the TRF booking code",
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
    assert.match(dspState.customerCopy, /Service: Hourly/);
    assert.match(dspState.customerCopy, /Pickup: Grand Hyatt/);
    assert.match(dspState.customerCopy, /Itinerary:/);
    assert.match(dspState.customerCopy, /1330hrs - Temasek Office, The Atrium@Orchard/);
    assert.doesNotMatch(
      dspState.customerCopy,
      /\b(?:AVF|VVV|Combi|Alphard|Vellfire|V-Class|V Class|Viano|minibus|mini bus|car type|vehicle type|service vehicle|DSP)\b/i,
      "Expected Customer Copy to show Hourly without vehicle type or the DSP booking code",
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

    const liveLocationAppLoadEvent = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: appUrl });
    await liveLocationAppLoadEvent;

    await waitForCondition(
      () =>
        evaluate(`document.body.innerText.includes("Customer Copy") &&
          [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Create Job Card")`),
      10000,
      "Dispatch customer copy controls for live location eligibility",
    );

    const readCustomerLiveLocationState = async () =>
      evaluate(`(() => {
        const preview = document.querySelector("[data-copy-preview='customerCopy']");
        const helper = document.querySelector("[data-customer-live-location-helper='true']");

        return {
          customerCopy: preview?.innerText || "",
          helperText: helper?.textContent.trim() || "",
        };
      })()`);

    const setLiveLocationScenarioBooking = async ({ bookingType, offsetMinutes, passengerSuffix }) => {
      const pickup = pickupDateTimeOffset(offsetMinutes);
      const friendlyNames = {
        DEP: "Departure",
        DSP: "Hourly",
        MNG: "Arrival",
        TRF: "Transfer",
      };
      const suffix = `${friendlyNames[bookingType]} ${passengerSuffix}`;

      await setFieldValueByLabel("Booking type", bookingType, `${bookingType} live location booking type`);
      await setFieldValueByLabel("Vehicle", "AVF", `${bookingType} live location vehicle`);
      await setFieldValueByLabel("Pickup date", pickup.date, `${bookingType} live location pickup date`);
      await setFieldValueByLabel("Pickup time", pickup.time, `${bookingType} live location pickup time`);
      await setFieldValueByLabel("Flight number", "", `${bookingType} live location flight`);
      await setFieldValueByLabel("Pickup", `Live Pickup ${suffix}`, `${bookingType} live location pickup`);
      await setFieldValueByLabel("Extra stop location", `Live Waypoint ${suffix}`, `${bookingType} live location waypoint`);
      await setFieldValueByLabel("Extra Stops", "1", `${bookingType} live location extra stop count`);
      await setFieldValueByLabel("Drop-off", `Live Dropoff ${suffix}`, `${bookingType} live location drop-off`);
      await setFieldValueByLabel("Passenger name", `Live Passenger ${suffix}`, `${bookingType} live location passenger`);
      await setFieldValueByLabel("Pax", "1", `${bookingType} live location pax`);

      return waitForCondition(
        async () => {
          const candidateState = await evaluate(extractStateScript);
          const liveState = await readCustomerLiveLocationState();
          const expectedRoute = `Route: Live Pickup ${suffix} > Live Waypoint ${suffix} > Live Dropoff ${suffix}`;

          return candidateState?.fields?.bookingType === bookingType &&
            candidateState?.fields?.pickupDate === pickup.date &&
            liveState.customerCopy.includes(`Passenger: Live Passenger ${suffix}`) &&
            liveState.customerCopy.includes(expectedRoute)
            ? {
                ...liveState,
                pickup,
                routeText: expectedRoute,
                serviceLabel: candidateState.customerCopy.match(/Service: ([^\n]+)/)?.[1] || "",
              }
            : false;
        },
        10000,
        `${bookingType} customer live location scenario`,
      );
    };

    const liveLocationNoLinkPattern = /live location|tracking|track your ride|https?:\/\/\S+/i;
    const customerCopyInternalPattern =
      /\b(?:AVF|VVV|Combi|Alphard|Vellfire|V-Class|V Class|Viano|minibus|mini bus|car type|vehicle type|service vehicle|MNG|DEP|TRF|DSP)\b|Payout|driver payout|internal payout|override reason/i;

    const mngLiveLocationState = await setLiveLocationScenarioBooking({
      bookingType: "MNG",
      offsetMinutes: 20,
      passengerSuffix: "inside",
    });
    assert.equal(
      mngLiveLocationState.helperText,
      "Customer live location link is not available for Arrival bookings.",
    );
    assert.match(mngLiveLocationState.customerCopy, /Service: Arrival/);
    assert.doesNotMatch(
      mngLiveLocationState.customerCopy,
      liveLocationNoLinkPattern,
      "Expected MNG / Arrival Customer Copy never to include a live location link",
    );
    assert.match(mngLiveLocationState.customerCopy, /Live Waypoint Arrival inside/);
    assert.ok(
      mngLiveLocationState.customerCopy.trim().endsWith("Thank you for choosing Prestige Limo SG."),
      "Expected Arrival Customer Copy to keep the thank-you line",
    );

    for (const bookingType of ["DEP", "TRF", "DSP"]) {
      const beforeWindowState = await setLiveLocationScenarioBooking({
        bookingType,
        offsetMinutes: 90,
        passengerSuffix: "before",
      });

      assert.equal(
        beforeWindowState.helperText,
        "Customer live location link becomes available 30 minutes before pickup.",
        `Expected ${bookingType} before-window helper`,
      );
      assert.doesNotMatch(
        beforeWindowState.customerCopy,
        liveLocationNoLinkPattern,
        `Expected ${bookingType} before-window Customer Copy not to include a live location link`,
      );
      assert.match(
        beforeWindowState.customerCopy,
        new RegExp(beforeWindowState.routeText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `Expected ${bookingType} before-window Customer Copy to keep full route and waypoint`,
      );
      assert.ok(
        beforeWindowState.customerCopy.trim().endsWith("Thank you for choosing Prestige Limo SG."),
        `Expected ${bookingType} before-window Customer Copy to keep the thank-you line`,
      );
    }

    for (const bookingType of ["DEP", "TRF", "DSP"]) {
      const insideWindowState = await setLiveLocationScenarioBooking({
        bookingType,
        offsetMinutes: 20,
        passengerSuffix: "inside",
      });

      assert.equal(
        insideWindowState.helperText,
        "Customer live location link requires secure driver live location setup.",
        `Expected ${bookingType} inside-window helper when no secure live link exists`,
      );
      assert.doesNotMatch(
        insideWindowState.customerCopy,
        liveLocationNoLinkPattern,
        `Expected ${bookingType} inside-window Customer Copy not to copy a fake live location link`,
      );
      assert.match(
        insideWindowState.customerCopy,
        new RegExp(insideWindowState.routeText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `Expected ${bookingType} inside-window Customer Copy to keep full route and waypoint`,
      );
      assert.doesNotMatch(
        insideWindowState.customerCopy,
        customerCopyInternalPattern,
        `Expected ${bookingType} inside-window Customer Copy to exclude vehicle, payout, and internal text`,
      );
      assert.ok(
        insideWindowState.customerCopy.trim().endsWith("Thank you for choosing Prestige Limo SG."),
        `Expected ${bookingType} inside-window Customer Copy to keep the thank-you line`,
      );
    }

    const driverDemoLoadEvent = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: driverDemoUrl });
    await driverDemoLoadEvent;

    await waitForCondition(
      () =>
        evaluate(`(() => {
          return document.body.innerText.includes("Prestige Limo Driver Job") &&
            ["OTW", "OTS", "POB", "Job Completed"].every((label) =>
              Boolean(document.querySelector(\`[data-driver-demo-status="\${label}"]\`)),
            );
        })()`),
      10000,
      "driver demo status controls",
    );

    const driverDemoInitialState = await evaluate(`(() => {
      return {
        buttonLabels: [...document.querySelectorAll("button")].map((button) => button.textContent.trim()),
        currentStatus: document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() || "",
        jobSummaryText: document.querySelector("[aria-labelledby='driver-job-summary-heading']")?.innerText || "",
        name: document.querySelector("[data-driver-demo-name]")?.value || "",
        mobile: document.querySelector("[data-driver-demo-mobile]")?.value || "",
        plate: document.querySelector("[data-driver-demo-plate]")?.value || "",
        vehicleModel: document.querySelector("[data-driver-demo-vehicle-model]")?.value || "",
      };
    })()`);
    assert.deepEqual(
      ["Acknowledge Job", "OTW", "OTS", "POB", "Job Completed"].filter(
        (label) => !driverDemoInitialState.buttonLabels.includes(label),
      ),
      [],
      "Expected driver demo to show acknowledgement and OTW, OTS, POB, and Job Completed buttons",
    );
    assert.match(driverDemoInitialState.jobSummaryText, /Changi Airport T3 Arrival Pickup/);
    assert.match(driverDemoInitialState.jobSummaryText, /Raffles Hotel Singapore/);
    assert.match(driverDemoInitialState.jobSummaryText, /SQ333/);
    assert.equal(driverDemoInitialState.currentStatus, "Assigned");

    await evaluate(`(() => {
      window.__prestigeDriverDemoDrivers = [
        {
          id: 990001,
          driver_name: "Alison Toh",
          contact_number: "+65 90990723",
          vehicle_type: "Existing Mercedes V Class",
          plate_number: "PD 9918 H",
        },
      ];
      window.__prestigeDriverDemoRequests = [];
      window.__prestigeOriginalFetch = window.__prestigeOriginalFetch || window.fetch.bind(window);
      window.fetch = async (...args) => {
        const target = args[0]?.url || args[0];
        const method = args[1]?.method || args[0]?.method || "GET";
        const url = String(target);

        if (url.includes("/rest/v1/drivers")) {
          window.__prestigeDriverDemoRequests.push({ method, url });
          return new Response(JSON.stringify({ message: "Driver demo must not access Driver Database from the browser" }), {
            status: 500,
            headers: {
              "content-type": "application/json",
            },
          });
        }

        return window.__prestigeOriginalFetch(...args);
      };
    })()`);

    const clickedAcknowledgement = await evaluate(`(() => {
      const button = document.querySelector("[data-driver-demo-acknowledge]");

      if (!button || button.disabled) {
        return false;
      }

      button.click();
      return true;
    })()`);
    assert.equal(clickedAcknowledgement, true, "Expected Acknowledge Job to be clickable");

    const acknowledgedState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const button = document.querySelector("[data-driver-demo-acknowledge]");
          const message = document.querySelector("[data-driver-demo-acknowledge-message]");
          const acknowledged = document.querySelector("[data-driver-demo-acknowledged-state]");
          const buttonRect = button?.getBoundingClientRect();
          const messageRect = message?.getBoundingClientRect();
          const requests = window.__prestigeDriverDemoRequests || [];

          return message?.textContent.trim() === "Job acknowledged locally for this mock driver page." &&
            acknowledged?.textContent.trim() === "Acknowledged"
            ? {
                distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                messageText: message.textContent.trim(),
                requestCount: requests.length,
                stateText: acknowledged.textContent.trim(),
              }
            : false;
        })()`),
      10000,
      "driver demo acknowledgement stays local",
    );
    assert.equal(acknowledgedState.stateText, "Acknowledged");
    assert.equal(acknowledgedState.requestCount, 0);
    assert.equal(
      acknowledgedState.distance <= 16,
      true,
      "Expected acknowledgement feedback close to Acknowledge Job",
    );

    const clickedLatestEta = await evaluate(`(() => {
      const button = document.querySelector("[data-driver-demo-latest-eta]");

      if (!button || button.disabled) {
        return false;
      }

      button.click();
      return true;
    })()`);
    assert.equal(clickedLatestEta, true, "Expected Acknowledge Latest ETA to be clickable");

    const latestEtaState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const button = document.querySelector("[data-driver-demo-latest-eta]");
          const message = document.querySelector("[data-driver-demo-latest-eta-message]");
          const state = document.querySelector("[data-driver-demo-latest-eta-state]");
          const section = document.querySelector("[data-driver-demo-latest-eta-section]");
          const buttonRect = button?.getBoundingClientRect();
          const messageRect = message?.getBoundingClientRect();
          const requests = window.__prestigeDriverDemoRequests || [];

          return section?.innerText.includes("Mock/local only. No real flight API is called and no notification is sent.") &&
            section?.innerText.includes("Latest mock flight ETA: 15:45") &&
            message?.textContent.trim() === "Latest mock flight ETA acknowledged locally. No real flight API or notification was used." &&
            state?.textContent.trim() === "Latest mock flight ETA acknowledged"
            ? {
                distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                messageText: message.textContent.trim(),
                requestCount: requests.length,
                stateText: state.textContent.trim(),
              }
            : false;
        })()`),
      10000,
      "driver demo latest ETA acknowledgement stays local",
    );
    assert.equal(latestEtaState.stateText, "Latest mock flight ETA acknowledged");
    assert.equal(latestEtaState.requestCount, 0);
    assert.equal(
      latestEtaState.distance <= 16,
      true,
      "Expected latest ETA acknowledgement feedback close to button",
    );

    const alisonDriverDetailsPaste = [
      "Driver’s detail",
      "Name: Alison Toh",
      "Contact: +65 90990723",
      "Brand: Mercedes V Class",
      "Car plate: PD 9918 H",
    ].join("\n");
    const parsedAlisonDriverDetails = {
      mobile: "+65 90990723",
      name: "Alison Toh",
      plate: "PD 9918 H",
      vehicleModel: "Mercedes V Class",
    };

    await evaluate(`(() => {
      const textarea = document.querySelector("[data-driver-demo-paste-details]");
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea, ${JSON.stringify(alisonDriverDetailsPaste)});
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);

    const clickedAlisonParse = await evaluate(`(() => {
      const button = document.querySelector("[data-driver-demo-parse-details]");

      if (!button || button.disabled) {
        return false;
      }

      button.click();
      return true;
    })()`);
    assert.equal(clickedAlisonParse, true, "Expected Parse Driver Details to be clickable for Alison details");

    const parsedAlisonState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const message = document.querySelector("[data-driver-demo-parse-message]");

          return message?.textContent.trim() === "Driver details parsed. Please review before saving."
            ? {
                messageText: message.textContent.trim(),
                mobile: document.querySelector("[data-driver-demo-mobile]")?.value || "",
                name: document.querySelector("[data-driver-demo-name]")?.value || "",
                plate: document.querySelector("[data-driver-demo-plate]")?.value || "",
                vehicleModel: document.querySelector("[data-driver-demo-vehicle-model]")?.value || "",
              }
            : false;
        })()`),
      10000,
      "parsed Alison driver details",
    );
    assert.equal(parsedAlisonState.name, parsedAlisonDriverDetails.name);
    assert.equal(parsedAlisonState.mobile, parsedAlisonDriverDetails.mobile);
    assert.equal(parsedAlisonState.plate, parsedAlisonDriverDetails.plate);
    assert.equal(parsedAlisonState.vehicleModel, parsedAlisonDriverDetails.vehicleModel);

    const safeDriverDemoInitialState = await evaluate(`(() => {
      const saveButton = document.querySelector("[data-driver-demo-save-details]");

      return {
        databaseCheckVisible: Boolean(document.querySelector("[data-driver-demo-database-check]")),
        overwritePromptVisible: Boolean(document.querySelector("[data-driver-demo-overwrite-prompt]")),
        requestCount: (window.__prestigeDriverDemoRequests || []).length,
        saveButtonText: saveButton?.textContent.trim() || "",
      };
    })()`);
    assert.equal(safeDriverDemoInitialState.saveButtonText, "Save");
    assert.equal(safeDriverDemoInitialState.databaseCheckVisible, false);
    assert.equal(safeDriverDemoInitialState.overwritePromptVisible, false);
    assert.equal(safeDriverDemoInitialState.requestCount, 0);

    await evaluate(`window.__prestigeDriverDemoRequests = []`);
    const clickedDriverDetailsSave = await evaluate(`(() => {
      const button = document.querySelector("[data-driver-demo-save-details]");

      if (!button || button.disabled) {
        return false;
      }

      button.click();
      return true;
    })()`);
    assert.equal(clickedDriverDetailsSave, true, "Expected Save button to be clickable");

    const driverDemoAddedState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const button = document.querySelector("[data-driver-demo-save-details]");
          const message = document.querySelector("[data-driver-demo-details-message]");
          const buttonRect = button?.getBoundingClientRect();
          const messageRect = message?.getBoundingClientRect();
          const drivers = window.__prestigeDriverDemoDrivers || [];
          const requests = window.__prestigeDriverDemoRequests || [];

          return message?.textContent.trim() === "Driver details saved locally for this mock driver page."
            ? {
                distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                driverCount: drivers.length,
                existingDriver: drivers[0] || null,
                getCount: requests.filter((request) => request.method === "GET").length,
                messageText: message.textContent.trim(),
                patchCount: requests.filter((request) => request.method === "PATCH").length,
                postCount: requests.filter((request) => request.method === "POST").length,
                putCount: requests.filter((request) => request.method === "PUT").length,
              }
            : false;
        })()`),
      10000,
      "driver demo local save avoids public Driver Database writes",
    );
    assert.equal(
      driverDemoAddedState.messageText,
      "Driver details saved locally for this mock driver page.",
    );
    assert.equal(driverDemoAddedState.driverCount, 1);
    assert.equal(driverDemoAddedState.existingDriver?.driver_name, "Alison Toh");
    assert.equal(driverDemoAddedState.existingDriver?.contact_number, "+65 90990723");
    assert.equal(driverDemoAddedState.existingDriver?.vehicle_type, "Existing Mercedes V Class");
    assert.equal(driverDemoAddedState.existingDriver?.plate_number, "PD 9918 H");
    assert.equal(driverDemoAddedState.getCount, 0);
    assert.equal(driverDemoAddedState.postCount, 0);
    assert.equal(driverDemoAddedState.patchCount, 0);
    assert.equal(driverDemoAddedState.putCount, 0);
    assert.equal(
      driverDemoAddedState.distance <= 16,
      true,
      "Expected secure-link-required feedback close to Save",
    );

    await evaluate(`window.__prestigeDriverDemoRequests = []`);
    const clickedDriverDetailsSaveAgain = await evaluate(`(() => {
      const button = document.querySelector("[data-driver-demo-save-details]");

      if (!button || button.disabled) {
        return false;
      }

      button.click();
      return true;
    })()`);
    assert.equal(clickedDriverDetailsSaveAgain, true, "Expected unchanged Save to be clickable");

    const unchangedDriverDemoSaveState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const message = document.querySelector("[data-driver-demo-details-message]");
          const drivers = window.__prestigeDriverDemoDrivers || [];
          const requests = window.__prestigeDriverDemoRequests || [];

          return message?.textContent.trim() === "Driver details saved locally for this mock driver page."
            ? {
                driverCount: drivers.length,
                existingDriver: drivers[0] || null,
                getCount: requests.filter((request) => request.method === "GET").length,
                messageText: message.textContent.trim(),
                patchCount: requests.filter((request) => request.method === "PATCH").length,
                postCount: requests.filter((request) => request.method === "POST").length,
                putCount: requests.filter((request) => request.method === "PUT").length,
              }
            : false;
        })()`),
      10000,
      "unchanged driver demo save avoids duplicates",
    );
    assert.equal(unchangedDriverDemoSaveState.driverCount, 1);
    assert.equal(unchangedDriverDemoSaveState.existingDriver?.vehicle_type, "Existing Mercedes V Class");
    assert.equal(unchangedDriverDemoSaveState.getCount, 0);
    assert.equal(unchangedDriverDemoSaveState.postCount, 0);
    assert.equal(unchangedDriverDemoSaveState.patchCount, 0);
    assert.equal(unchangedDriverDemoSaveState.putCount, 0);

    await evaluate(`(() => {
      const input = document.querySelector("[data-driver-demo-vehicle-model]");
      const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value")?.set;
      setter?.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      window.__prestigeDriverDemoRequests = [];
    })()`);

    const clickedBlankOptionalSave = await evaluate(`(() => {
      const button = document.querySelector("[data-driver-demo-save-details]");

      if (!button || button.disabled) {
        return false;
      }

      button.click();
      return true;
    })()`);
    assert.equal(clickedBlankOptionalSave, true, "Expected Save with blank optional field to be clickable");

    const blankOptionalState = await waitForCondition(
      () =>
        evaluate(`(() => {
          const message = document.querySelector("[data-driver-demo-details-message]");
          const requests = window.__prestigeDriverDemoRequests || [];
          const drivers = window.__prestigeDriverDemoDrivers || [];

          return message?.textContent.trim() === "Driver details saved locally for this mock driver page."
            ? {
                driver: drivers[0] || null,
                driverCount: drivers.length,
                getCount: requests.filter((request) => request.method === "GET").length,
                messageText: message.textContent.trim(),
                patchCount: requests.filter((request) => request.method === "PATCH").length,
                postCount: requests.filter((request) => request.method === "POST").length,
                putCount: requests.filter((request) => request.method === "PUT").length,
                vehicleModel: document.querySelector("[data-driver-demo-vehicle-model]")?.value || "",
              }
            : false;
        })()`),
      10000,
      "driver demo blank optional save does not erase Driver Database fields",
    );
    assert.equal(blankOptionalState.driverCount, 1);
    assert.equal(blankOptionalState.driver?.vehicle_type, "Existing Mercedes V Class");
    assert.equal(blankOptionalState.driver?.plate_number, "PD 9918 H");
    assert.equal(blankOptionalState.getCount, 0);
    assert.equal(blankOptionalState.postCount, 0);
    assert.equal(blankOptionalState.patchCount, 0);
    assert.equal(blankOptionalState.putCount, 0);
    assert.equal(blankOptionalState.vehicleModel, "");

    const finalDriverDemoDetails = parsedAlisonDriverDetails;
    await evaluate(`(() => {
      const input = document.querySelector("[data-driver-demo-vehicle-model]");
      const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value")?.set;
      setter?.call(input, ${JSON.stringify(finalDriverDemoDetails.vehicleModel)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);

    const driverDemoStatusChecks = [
      {
        currentStatus: "OTW",
        expectedMessage: "Status updated: OTW",
        label: "OTW",
        reportPattern: /OTW|On the Way/i,
      },
      {
        currentStatus: "OTS",
        expectedMessage: "Status updated: OTS",
        label: "OTS",
        reportPattern: /OTS|On the Spot/i,
      },
      {
        currentStatus: "POB",
        expectedMessage: "Status updated: POB",
        label: "POB",
        reportPattern: /POB|Passenger On Board/i,
      },
      {
        currentStatus: "Job Completed",
        expectedMessage: "Status updated: Completed",
        label: "Job Completed",
        reportPattern: /JC|JD|Job Completed|Job Done|Completed/i,
      },
    ];

    for (const statusCheck of driverDemoStatusChecks) {
      if (statusCheck.label === "POB") {
        const proofSectionVisible = await waitForCondition(
          () =>
            evaluate(`Boolean(document.querySelector("[data-driver-demo-ots-photo-proof-section]")) &&
              document.querySelector("[data-driver-demo-ots-photo-proof-section]")?.innerText.includes("Mock/local only. No real file upload, camera, or storage is used.")`),
          10000,
          "driver demo OTS photo proof section",
        );
        assert.equal(proofSectionVisible, true, "Expected mock OTS photo proof section after OTS");

        const clickedProof = await evaluate(`(() => {
          const button = document.querySelector("[data-driver-demo-ots-photo-proof]");

          if (!button || button.disabled) {
            return false;
          }

          button.click();
          return true;
        })()`);
        assert.equal(clickedProof, true, "Expected Add Mock OTS Photo Proof to be clickable before POB");

        const proofState = await waitForCondition(
          () =>
            evaluate(`(() => {
              const button = document.querySelector("[data-driver-demo-ots-photo-proof]");
              const message = document.querySelector("[data-driver-demo-ots-photo-proof-message]");
              const buttonRect = button?.getBoundingClientRect();
              const messageRect = message?.getBoundingClientRect();

              return message?.textContent.trim() === "Mock OTS photo proof added locally. No real file upload, camera, or storage was used."
                ? {
                    distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                    messageText: message.textContent.trim(),
                  }
                : false;
            })()`),
          10000,
          "driver demo OTS photo proof added",
        );
        assert.equal(
          proofState.distance <= 16,
          true,
          "Expected OTS photo proof feedback close to button",
        );
      }

      const clickedStatus = await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(`[data-driver-demo-status="${statusCheck.label}"]`)});

        if (!button || button.disabled) {
          return false;
        }

        button.click();
        return true;
      })()`);
      assert.equal(clickedStatus, true, `Expected ${statusCheck.label} status button to be clickable`);

      const driverStatusState = await waitForCondition(
        () =>
          evaluate(`(() => {
            const button = document.querySelector(${JSON.stringify(`[data-driver-demo-status="${statusCheck.label}"]`)});
            const message = document.querySelector(${JSON.stringify(
              `[data-driver-demo-status-message="${statusCheck.label}"]`,
            )});
            const buttonRect = button?.getBoundingClientRect();
            const messageRect = message?.getBoundingClientRect();

            return message?.textContent.trim() === ${JSON.stringify(statusCheck.expectedMessage)}
              ? {
                  currentStatus: document.querySelector("[data-driver-demo-current-status]")?.textContent.trim() || "",
                  driverDetailsText: document.querySelector("[aria-labelledby='driver-details-heading']")?.innerText || "",
                  distance: Math.round((messageRect?.top || 0) - (buttonRect?.bottom || 0)),
                  jobSummaryText: document.querySelector("[aria-labelledby='driver-job-summary-heading']")?.innerText || "",
                  messageCount: document.querySelectorAll("[data-driver-demo-status-message]").length,
                  messageText: message.textContent.trim(),
                  mobile: document.querySelector("[data-driver-demo-mobile]")?.value || "",
                  name: document.querySelector("[data-driver-demo-name]")?.value || "",
                  plate: document.querySelector("[data-driver-demo-plate]")?.value || "",
                  vehicleModel: document.querySelector("[data-driver-demo-vehicle-model]")?.value || "",
                }
              : false;
          })()`),
        10000,
        `driver demo ${statusCheck.label} status feedback`,
      );

      assert.equal(driverStatusState.currentStatus, statusCheck.currentStatus);
      assert.equal(driverStatusState.messageText, statusCheck.expectedMessage);
      assert.match(
        `${driverStatusState.currentStatus}\n${driverStatusState.messageText}`,
        statusCheck.reportPattern,
        `Expected ${statusCheck.label} status text to include its WhatsApp-style status`,
      );
      assert.equal(driverStatusState.messageCount, 1);
      assert.equal(
        driverStatusState.distance <= 16,
        true,
        `Expected ${statusCheck.label} feedback close to its button`,
      );
      assert.equal(driverStatusState.name, finalDriverDemoDetails.name);
      assert.equal(driverStatusState.mobile, finalDriverDemoDetails.mobile);
      assert.equal(driverStatusState.plate, finalDriverDemoDetails.plate);
      assert.equal(driverStatusState.vehicleModel, finalDriverDemoDetails.vehicleModel);
      assert.match(driverStatusState.jobSummaryText, /Changi Airport T3 Arrival Pickup/);
      assert.match(driverStatusState.jobSummaryText, /Raffles Hotel Singapore/);
      assert.match(driverStatusState.jobSummaryText, /SQ333/);
    }

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
