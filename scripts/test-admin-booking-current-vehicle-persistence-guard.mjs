import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adapter = await readFile("lib/admin-booking-supabase-adapter.ts", "utf8");
const app = await readFile("app/page.tsx", "utf8");
const adapterContract = await readFile("scripts/test-admin-booking-supabase-adapter-contract.mjs", "utf8");
const apiGate = await readFile("scripts/test-admin-booking-persistence-api-gate.mjs", "utf8");
const enableReadiness = await readFile(
  "scripts/test-admin-booking-persistence-enable-readiness.mjs",
  "utf8",
);
const stagingConfig = await readFile(
  "scripts/test-admin-booking-persistence-staging-config.mjs",
  "utf8",
);

const mapperStart = adapter.indexOf("function bookingToDbRow(");
const mapperEnd = adapter.indexOf("function bookingToFoundationDbRow(", mapperStart);
const mapper = adapter.slice(mapperStart, mapperEnd);

assert.notEqual(mapperStart, -1, "Current booking mapper must exist");
assert.notEqual(mapperEnd, -1, "Current booking mapper boundary must exist");
assert.ok(
  mapper.includes("vehicle_type_or_category: textOrNull(booking.vehicle_type_or_category)"),
  "Current-schema booking saves must retain the selected vehicle category",
);
assert.ok(
  app.includes("vehicle_type_or_category: clean(bookingValue.vehicle) || null"),
  "Dispatch Save + CRM must keep sending the selected vehicle category",
);

for (const dependency of [
  "lib/customer-portal-access-account.ts",
  "lib/customer-portal-access-link.ts",
  "lib/customer-saved-bookings-read.ts",
]) {
  assert.ok(
    adapterContract.includes(`"${dependency}"`),
    `Admin booking adapter contract harness must include ${dependency}`,
  );
}

assert.ok(
  apiGate.includes('path.join(tempDir, "lib/customer-saved-bookings-read.js")'),
  "Admin booking API gate harness must provide its fail-closed customer saved-booking boundary mock",
);
assert.ok(
  enableReadiness.includes('path.join(tempDir, "lib/customer-saved-bookings-read.js")'),
  "Admin booking enable-readiness harness must provide its fail-closed customer saved-booking boundary mock",
);
assert.ok(
  stagingConfig.includes('path.join(tempDir, "lib/customer-saved-bookings-read.js")'),
  "Admin booking staging-config harness must provide its fail-closed customer saved-booking boundary mock",
);

console.log("Admin booking current-schema vehicle persistence guard passed.");
