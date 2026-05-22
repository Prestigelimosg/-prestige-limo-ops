import assert from "node:assert/strict";
import {
  generateDriverJobLinkToken,
  getDriverJobLinkExpiresAt,
  hashDriverJobLinkToken,
  isDriverJobLinkExpired,
  mapBookingToSafeDriverJobPayload,
  validateDriverJobStatusUpdate,
} from "../lib/driver-job-link.ts";

const token = generateDriverJobLinkToken();
const secondToken = generateDriverJobLinkToken();

assert.ok(token.length > 20, "Generated token should be non-empty and high entropy.");
assert.match(token, /^[A-Za-z0-9_-]+$/, "Generated token should be URL-safe base64url text.");
assert.notEqual(token, secondToken, "Generated tokens should differ.");

const tokenHash = hashDriverJobLinkToken(token);
assert.equal(tokenHash, hashDriverJobLinkToken(token), "Token hash should be deterministic.");
assert.notEqual(tokenHash, hashDriverJobLinkToken(secondToken), "Different tokens should produce different hashes.");
assert.match(tokenHash, /^[a-f0-9]{64}$/, "Token hash should be SHA-256 hex.");

const createdAt = new Date("2026-05-22T08:00:00.000Z");
const expiresAt = getDriverJobLinkExpiresAt(createdAt, 2);
assert.equal(expiresAt.toISOString(), "2026-05-22T10:00:00.000Z");
assert.equal(isDriverJobLinkExpired(expiresAt, "2026-05-22T09:59:59.000Z"), false);
assert.equal(isDriverJobLinkExpired(expiresAt, "2026-05-22T10:00:00.000Z"), true);

const bookingFixture = {
  id: 123456,
  public_reference: "PL-DRIVER-SAFE-001",
  company_id: 88,
  booker_id: 89,
  traveler_id: 90,
  booking_type: "TRF",
  pickup_date: "2026-05-27",
  pickup_time: "1530hrs",
  pickup_address: "Changi Airport T3",
  dropoff_address: "Raffles Hotel Singapore",
  flight_no: "SQ333",
  route: "Changi Airport T3 > Marina Bay Sands > Raffles Hotel Singapore",
  status: "assigned",
  driver_name: "Assigned Snapshot Driver",
  driver_contact: "+65 8888 0000",
  driver_plate_number: "SLA1234X",
  driver_vehicle_model: "Mercedes V Class",
  job_card:
    "AVF TRF\n27 May 2026, 1530hrs\nFlight: SQ333\nChangi Airport T3 > Marina Bay Sands > Raffles Hotel Singapore\nPassenger: Safe Passenger\nPax: 2",
  travelers: {
    traveler_name: "Safe Passenger",
    booker_email: "FORBIDDEN_NESTED_BOOKER_EMAIL@example.com",
  },
  bookers: {
    booker_name: "FORBIDDEN_BOOKER_NAME",
    email: "FORBIDDEN_BOOKER_EMAIL@example.com",
  },
  companies: {
    company_name: "FORBIDDEN_CRM_COMPANY",
    domain: "forbidden-company.example.com",
  },
  customer_price_amount: 160,
  customer_rate: 85,
  customer_rate_override: 160,
  customer_price_override_reason: "FORBIDDEN_CUSTOMER_OVERRIDE_REASON",
  driver_payout_amount: 95,
  driver_payout_min: 65,
  driver_payout_max: 75,
  driver_payout_override: 95,
  driver_payout_reason: "FORBIDDEN_DRIVER_OVERRIDE_REASON",
  driver_dispatch_include_payout: true,
  drivers: [
    {
      driver_name: "FORBIDDEN_DRIVER_DATABASE_ROW",
      contact_number: "+65 9999 0000",
    },
  ],
  driverDatabase: [
    {
      driver_name: "FORBIDDEN_DRIVER_DATABASE_LIST",
    },
  ],
};

const safePayload = mapBookingToSafeDriverJobPayload(bookingFixture);
const safePayloadText = JSON.stringify(safePayload);

assert.equal(safePayload.reference, "PL-DRIVER-SAFE-001");
assert.equal(safePayload.pickupDate, "2026-05-27");
assert.equal(safePayload.pickupTime, "1530hrs");
assert.equal(safePayload.pickupDateTime, "27 May 2026, 1530hrs");
assert.equal(safePayload.bookingType, "TRF");
assert.equal(safePayload.bookingTypeLabel, "City Transfer");
assert.equal(safePayload.pickupLocation, "Changi Airport T3");
assert.equal(safePayload.dropoffLocation, "Raffles Hotel Singapore");
assert.equal(safePayload.route, "Changi Airport T3 > Marina Bay Sands > Raffles Hotel Singapore");
assert.deepEqual(safePayload.waypoints, ["Marina Bay Sands"]);
assert.equal(safePayload.flightNumber, "SQ333");
assert.equal(safePayload.passengerName, "Safe Passenger");
assert.equal(safePayload.status, "assigned");
assert.deepEqual(safePayload.assignedDriver, {
  name: "Assigned Snapshot Driver",
  contact: "+65 8888 0000",
  plate: "SLA1234X",
  vehicleModel: "Mercedes V Class",
});

assert.equal("id" in safePayload, false, "Safe payload should not expose internal booking id by default.");
assert.equal("drivers" in safePayload, false, "Safe payload should not expose Driver Database rows.");
assert.equal("driverDatabase" in safePayload, false, "Safe payload should not expose Driver Database lists.");
assert.doesNotMatch(safePayloadText, /FORBIDDEN_BOOKER_EMAIL/);
assert.doesNotMatch(safePayloadText, /FORBIDDEN_BOOKER_NAME/);
assert.doesNotMatch(safePayloadText, /FORBIDDEN_CRM_COMPANY/);
assert.doesNotMatch(safePayloadText, /forbidden-company\.example\.com/);
assert.doesNotMatch(safePayloadText, /FORBIDDEN_CUSTOMER_OVERRIDE_REASON/);
assert.doesNotMatch(safePayloadText, /FORBIDDEN_DRIVER_OVERRIDE_REASON/);
assert.doesNotMatch(safePayloadText, /FORBIDDEN_DRIVER_DATABASE_ROW/);
assert.doesNotMatch(safePayloadText, /FORBIDDEN_DRIVER_DATABASE_LIST/);
assert.doesNotMatch(safePayloadText, /\b160\b/, "Safe payload should not expose customer price.");
assert.doesNotMatch(safePayloadText, /\b95\b/, "Safe payload should not expose driver payout.");

assert.equal(validateDriverJobStatusUpdate("OTW"), "driver_otw");
assert.equal(validateDriverJobStatusUpdate("driver_otw"), "driver_otw");
assert.equal(validateDriverJobStatusUpdate("POB"), "pob");
assert.equal(validateDriverJobStatusUpdate("Job Completed"), "completed");
assert.equal(validateDriverJobStatusUpdate("completed"), "completed");
assert.equal(validateDriverJobStatusUpdate("unknown"), null);
assert.equal(validateDriverJobStatusUpdate("cancelled"), null);

console.log("Driver job link foundation tests passed.");
