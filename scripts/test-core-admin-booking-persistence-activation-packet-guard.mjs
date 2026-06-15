import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packetPath = "docs/core-admin-booking-persistence-activation-readiness-packet.md";
const packet = await readFile(packetPath, "utf8");
const normalized = normalize(packet);

function normalize(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(
    normalize(source).includes(normalize(fragment)),
    true,
    `Core admin booking persistence activation packet missing ${label}.`,
  );
}

function assertPacketIncludes(fragment, label = fragment) {
  assertIncludes(packet, fragment, label);
}

function sectionBetween(startHeading, nextHeadingPrefix = "\n## ") {
  const start = packet.indexOf(startHeading);

  assert.notEqual(start, -1, `Missing section: ${startHeading}`);

  const next = packet.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? packet.slice(start) : packet.slice(start, next);
}

assertPacketIncludes("Core Admin Booking Persistence Activation Readiness Packet", "packet title");
assertPacketIncludes("does not approve or activate live DB/write", "no live DB/write activation boundary");
assertPacketIncludes("migrations", "migration boundary");
assertPacketIncludes("provider/env", "provider/env boundary");
assertPacketIncludes("live sending", "live sending boundary");
assertPacketIncludes("payment", "payment boundary");
assertPacketIncludes("auth", "auth boundary");
assertPacketIncludes("live location", "live location boundary");
assertPacketIncludes("photo upload", "photo boundary");
assertPacketIncludes("CRM/calendar amendment writes", "CRM/calendar amendment write boundary");

const scopeSection = sectionBetween("## Proposed First Live Activation Scope");
assertIncludes(scopeSection, "Admin Save Booking + CRM only", "first live activation scope");
assertIncludes(scopeSection, "POST /api/admin-bookings", "admin-only operational API scope");
assertIncludes(scopeSection, "not approved for first live activation", "legacy rich path exclusion");
assertIncludes(scopeSection, "Customer amendment/cancellation must never auto-update CRM or calendar", "amendment calendar no-auto-update rule");
assertIncludes(scopeSection, "requires admin approval", "admin approval requirement");

const excludedSection = sectionBetween("## Explicitly Excluded Fields And Areas");
for (const fragment of [
  "Pricing",
  "Driver payout",
  "Payment",
  "PDF",
  "billing",
  "customer_rates",
  "driver_payout_rules",
  "rate overrides",
  "provider/env activation",
  "live sending",
  "Auth/session/token issuing",
  "Live location",
  "photo upload/storage",
  "CRM/calendar amendment update actions",
]) {
  assertIncludes(excludedSection, fragment, `excluded area ${fragment}`);
}

const approvalsSection = sectionBetween("## Required Approvals Before Activation");
assertIncludes(approvalsSection, "Live DB write approval", "live DB/write approval");
assertIncludes(approvalsSection, "Supabase env approval", "Supabase env approval");
assertIncludes(approvalsSection, "Table and policy verification", "table/policy verification");
assertIncludes(approvalsSection, "no migration is included", "migrations not approved");
assertIncludes(approvalsSection, "unless separately approved", "separate approval requirement");

const rollbackSection = sectionBetween("## Rollback And Manual Recovery Plan");
for (const fragment of [
  "Keep `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` OFF by default",
  "kill-switch OFF probe",
  "Immediately turn the kill-switch OFF",
  "Record any controlled booking reference",
  "do not run destructive cleanup from this packet",
  "roll back to the previous successful preview deployment",
]) {
  assertIncludes(rollbackSection, fragment, `rollback/manual recovery ${fragment}`);
}

const samePassSection = sectionBetween("## Must Not Be Activated In The Same Pass");
for (const fragment of [
  "Provider/env activation",
  "live sending",
  "Payment",
  "PDF",
  "billing",
  "payout",
  "Customer/driver auth activation",
  "Live location",
  "photo upload",
  "CRM/calendar amendment update/cancel",
  "customer_rates",
  "driver_payout_rules",
]) {
  assertIncludes(samePassSection, fragment, `same-pass blocked area ${fragment}`);
}

const forbiddenApprovalPatterns = [
  /live DB\/write\s+(?:is\s+)?approved/i,
  /live DB write\s+(?:is\s+)?approved/i,
  /migrations?\s+(?:are|is\s+)?approved/i,
  /provider\/env activation\s+(?:is\s+)?approved/i,
  /live sending\s+(?:is\s+)?approved/i,
  /payment\/PDF\/payout\s+(?:is\s+)?approved/i,
  /auth activation\s+(?:is\s+)?approved/i,
  /live location\s+(?:is\s+)?approved/i,
  /photo upload(?:\/storage)?\s+(?:is\s+)?approved/i,
  /CRM\/calendar (?:amendment )?writes?\s+(?:are|is\s+)?approved/i,
];

for (const pattern of forbiddenApprovalPatterns) {
  assert.equal(
    pattern.test(packet),
    false,
    `Core admin booking persistence packet must not contain live-approval wording matching ${pattern}.`,
  );
}

assert.match(
  normalized,
  /owner review of this packet.*separate approval packet/s,
  "Packet must require separate owner approval before any activation.",
);

console.log("core admin booking persistence activation packet guard passed");
