import assert from "node:assert/strict";
import {
  applyDriverJobStatusUpdateContract,
  getDriverJobPayloadForTokenContract,
} from "../lib/driver-job-link-contract.ts";
import { hashDriverJobLinkToken } from "../lib/driver-job-link.ts";

const now = "2026-05-22T08:00:00.000Z";
const validTokenA = "valid-token-a";
const validTokenB = "valid-token-b";
const expiredToken = "expired-token";
const revokedToken = "revoked-token";

function createContractFixture() {
  const bookingsById = {
    "booking-a": {
      public_reference: "PL-A",
      booking_type: "DEP",
      pickup_date: "2026-05-27",
      pickup_time: "1530hrs",
      pickup_address: "A Pickup",
      dropoff_address: "A Dropoff",
      route: "A Pickup > A Waypoint > A Dropoff",
      flight_no: "SQ333",
      status: "assigned",
      driver_name: "A Assigned Driver",
      driver_contact: "+65 8888 0000",
      driver_plate_number: "SLA1234X",
      driver_vehicle_model: "Mercedes V Class",
      travelers: {
        traveler_name: "A Passenger",
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
    "booking-b": {
      public_reference: "PL-B",
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
  };

  const links = [
    {
      tokenHash: hashDriverJobLinkToken(validTokenA),
      bookingId: "booking-a",
      expiresAt: "2026-05-23T08:00:00.000Z",
      revokedAt: null,
    },
    {
      tokenHash: hashDriverJobLinkToken(validTokenB),
      bookingId: "booking-b",
      expiresAt: "2026-05-23T08:00:00.000Z",
      revokedAt: null,
    },
    {
      tokenHash: hashDriverJobLinkToken(expiredToken),
      bookingId: "booking-a",
      expiresAt: "2026-05-22T07:59:59.000Z",
      revokedAt: null,
    },
    {
      tokenHash: hashDriverJobLinkToken(revokedToken),
      bookingId: "booking-a",
      expiresAt: "2026-05-23T08:00:00.000Z",
      revokedAt: "2026-05-22T07:00:00.000Z",
    },
  ];

  return { bookingsById, links };
}

function assertNoSensitiveData(value) {
  const text = JSON.stringify(value);

  assert.doesNotMatch(text, /SECRET_BOOKER_EMAIL/);
  assert.doesNotMatch(text, /SECRET_NESTED_BOOKER_EMAIL/);
  assert.doesNotMatch(text, /SECRET_BOOKER_NAME/);
  assert.doesNotMatch(text, /SECRET_CRM_COMPANY/);
  assert.doesNotMatch(text, /secret-crm\.example\.com/);
  assert.doesNotMatch(text, /SECRET_CUSTOMER_OVERRIDE_REASON/);
  assert.doesNotMatch(text, /SECRET_DRIVER_OVERRIDE_REASON/);
  assert.doesNotMatch(text, /SECRET_DRIVER_DATABASE_ROW/);
  assert.doesNotMatch(text, /SECRET_DRIVER_DATABASE_LIST/);
  assert.doesNotMatch(text, /BOOKING_B_SECRET_/);
  assert.doesNotMatch(text, /\b160\b/, "Response should not expose customer price.");
  assert.doesNotMatch(text, /\b95\b/, "Response should not expose driver payout.");
}

{
  const { bookingsById, links } = createContractFixture();
  const result = getDriverJobPayloadForTokenContract({
    token: validTokenA,
    links,
    bookingsById,
    now,
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, "ok");
  assert.equal(result.payload.reference, "PL-A");
  assert.equal(result.payload.pickupLocation, "A Pickup");
  assert.equal(result.payload.dropoffLocation, "A Dropoff");
  assert.equal(result.payload.route, "A Pickup > A Waypoint > A Dropoff");
  assert.deepEqual(result.payload.waypoints, ["A Waypoint"]);
  assert.equal(result.payload.status, "assigned");
  assertNoSensitiveData(result);
}

for (const [token, expectedReason] of [
  ["not-a-real-token", "unauthorized"],
  [expiredToken, "expired"],
  [revokedToken, "revoked"],
]) {
  const { bookingsById, links } = createContractFixture();
  const result = getDriverJobPayloadForTokenContract({
    token,
    links,
    bookingsById,
    now,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, expectedReason);
  assert.equal(result.payload, null);
  assertNoSensitiveData(result);
}

for (const [requestedStatus, expectedStatus] of [
  ["OTW", "driver_otw"],
  ["POB", "pob"],
  ["Job Completed", "completed"],
]) {
  const { bookingsById, links } = createContractFixture();
  const result = applyDriverJobStatusUpdateContract({
    token: validTokenA,
    links,
    bookingsById,
    now,
    status: requestedStatus,
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, "updated");
  assert.equal(result.status, expectedStatus);
  assert.equal(bookingsById["booking-a"].status, expectedStatus);
  assert.equal(bookingsById["booking-b"].status, "assigned");
  assert.equal(result.payload.reference, "PL-A");
  assert.equal(result.payload.status, expectedStatus);
  assertNoSensitiveData(result);
}

{
  const { bookingsById, links } = createContractFixture();
  const result = applyDriverJobStatusUpdateContract({
    token: validTokenA,
    links,
    bookingsById,
    now,
    status: "cancelled",
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_status");
  assert.equal(result.payload, null);
  assert.equal(bookingsById["booking-a"].status, "assigned");
  assert.equal(bookingsById["booking-b"].status, "assigned");
  assertNoSensitiveData(result);
}

{
  const { bookingsById, links } = createContractFixture();
  const result = applyDriverJobStatusUpdateContract({
    token: validTokenA,
    links,
    bookingsById,
    now,
    status: "OTW",
  });

  assert.equal(result.ok, true);
  assert.equal(bookingsById["booking-a"].status, "driver_otw");
  assert.equal(bookingsById["booking-b"].status, "assigned");
  assertNoSensitiveData(result);
}

console.log("Driver job link API contract tests passed.");
