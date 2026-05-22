import {
  type DriverJobLinkContractBookingStore,
  type DriverJobLinkContractRecord,
} from "./driver-job-link-contract.ts";
import { hashDriverJobLinkToken } from "./driver-job-link.ts";
import { mockDriverJobTokens } from "./driver-job-link-mock-tokens.ts";

export { mockDriverJobTokens };

const initialMockBookingsById = {
  "mock-booking-a": {
    public_reference: "MOCK-DRIVER-JOB-A",
    booking_type: "DEP",
    pickup_date: "2026-05-27",
    pickup_time: "1530hrs",
    pickup_address: "Mock Pickup A",
    dropoff_address: "Mock Dropoff A",
    route: "Mock Pickup A > Mock Waypoint A > Mock Dropoff A",
    flight_no: "SQ333",
    status: "assigned",
    driver_name: "Mock Assigned Driver A",
    driver_contact: "+65 8888 0000",
    driver_plate_number: "SLA1234X",
    driver_vehicle_model: "Mercedes V Class",
    travelers: {
      traveler_name: "Mock Passenger A",
      booker_email: "SECRET_NESTED_BOOKER_EMAIL@example.com",
    },
    bookers: {
      booker_name: "SECRET_BOOKER_NAME",
      email: "SECRET_BOOKER_EMAIL@example.com",
    },
    companies: {
      company_name: "SECRET_CRM_COMPANY",
      domain: "secret-crm.example.com",
    },
    customer_price_amount: 160,
    customer_rate: 85,
    customer_rate_override: 160,
    customer_price_override_reason: "SECRET_CUSTOMER_OVERRIDE_REASON",
    driver_payout_amount: 95,
    driver_payout_min: 65,
    driver_payout_max: 75,
    driver_payout_override: 95,
    driver_payout_reason: "SECRET_DRIVER_OVERRIDE_REASON",
    driver_dispatch_include_payout: true,
    drivers: [
      {
        driver_name: "SECRET_DRIVER_DATABASE_ROW",
        contact_number: "+65 9999 0000",
      },
    ],
    driverDatabase: [
      {
        driver_name: "SECRET_DRIVER_DATABASE_LIST",
      },
    ],
  },
  "mock-booking-b": {
    public_reference: "MOCK-DRIVER-JOB-B",
    booking_type: "TRF",
    pickup_date: "2026-05-28",
    pickup_time: "1015hrs",
    pickup_address: "BOOKING_B_SECRET_PICKUP",
    dropoff_address: "BOOKING_B_SECRET_DROPOFF",
    route: "BOOKING_B_SECRET_PICKUP > BOOKING_B_SECRET_DROPOFF",
    flight_no: "BOOKING_B_SECRET_FLIGHT",
    status: "assigned",
    driver_name: "BOOKING_B_SECRET_DRIVER",
    travelers: {
      traveler_name: "BOOKING_B_SECRET_PASSENGER",
    },
  },
} satisfies DriverJobLinkContractBookingStore;

export const mockDriverJobLinks: DriverJobLinkContractRecord[] = [
  {
    tokenHash: hashDriverJobLinkToken(mockDriverJobTokens.validA),
    bookingId: "mock-booking-a",
    expiresAt: "2099-01-01T00:00:00.000Z",
    revokedAt: null,
  },
  {
    tokenHash: hashDriverJobLinkToken(mockDriverJobTokens.validB),
    bookingId: "mock-booking-b",
    expiresAt: "2099-01-01T00:00:00.000Z",
    revokedAt: null,
  },
  {
    tokenHash: hashDriverJobLinkToken(mockDriverJobTokens.expired),
    bookingId: "mock-booking-a",
    expiresAt: "2000-01-01T00:00:00.000Z",
    revokedAt: null,
  },
  {
    tokenHash: hashDriverJobLinkToken(mockDriverJobTokens.revoked),
    bookingId: "mock-booking-a",
    expiresAt: "2099-01-01T00:00:00.000Z",
    revokedAt: "2026-05-22T00:00:00.000Z",
  },
];

export const mockDriverJobBookingsById: DriverJobLinkContractBookingStore = cloneMockBookings();

// Mock-backed route skeleton only. Replace with a secure Supabase token table after William approves migration/RLS.
export function resetMockDriverJobLinkDataForTests() {
  for (const key of Object.keys(mockDriverJobBookingsById)) {
    delete mockDriverJobBookingsById[key];
  }

  Object.assign(mockDriverJobBookingsById, cloneMockBookings());
}

function cloneMockBookings(): DriverJobLinkContractBookingStore {
  return structuredClone(initialMockBookingsById);
}
