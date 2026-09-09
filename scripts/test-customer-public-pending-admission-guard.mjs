import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile("lib/admin-booking-supabase-adapter.ts", "utf8");
const start = source.indexOf("async function insertRowAndSelectIdWithFallback(");
const end = source.indexOf("async function insertRowsWithFallback(", start);
assert.ok(start >= 0 && end > start);
const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const context = vm.createContext({
  asRecord: (value) => value || {},
  dbIdentifierOrNull: (value) => value || null,
  isColumnMissingFailure: (error) => error?.code === "42703",
});
vm.runInContext(`${code};globalThis.insertWithFallback = insertRowAndSelectIdWithFallback`, context);
for (const code of ["PBL01", "PBL02"]) {
  let writes = 0;
  const rejected = { data: null, error: { code, message: "private detail" } };
  const client = { from: () => ({ insert: () => { writes++; return { select: () => ({ single: async () => rejected }) }; } }) };
  const result = await context.insertWithFallback(client, "bookings", {}, {}, {});
  assert.equal(result, rejected);
  assert.equal(writes, 1, `${code} must stop before every schema fallback`);
}
let writes = 0;
const compatibleClient = { from: () => ({ insert: () => { writes++; return { select: () => ({ single: async () => writes < 3 ? { error: { code: "42703" } } : { data: { id: 1 }, error: null } }) }; } }) };
assert.equal((await context.insertWithFallback(compatibleClient, "bookings", {}, {}, {})).data.id, 1);
assert.equal(writes, 3, "Existing missing-column compatibility must remain intact");

const migrationNames = (await readdir("supabase/migrations")).filter((name) => name.endsWith("_customer_public_pending_request_admission.sql"));
assert.equal(migrationNames.length, 1);
const migration = await readFile(`supabase/migrations/${migrationNames[0]}`, "utf8");
assert.doesNotMatch(migration, /security\s+definer|create\s+table|drop\s+table|disable\s+row\s+level/i);
assert.match(migration, /disable trigger customer_public_pending_admission/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /booking_admission_until<=clock_timestamp\(\)/);
assert.match(migration, /revoke all on function public\.reserve_customer_public_booking_request/);
const route = await readFile("app/api/customer-booking-requests/route.ts", "utf8");
assert.ok(route.indexOf("const parsed = parseCustomerBookingRequestPayloads") < route.indexOf("const admission = await reserveCustomerPublicBookingRequest"));
assert.ok(route.indexOf("const admission = await reserveCustomerPublicBookingRequest") < route.indexOf("const result = await createAdminBooking"));
const page = await readFile("app/book/page.tsx", "utf8");
const pendingBranch = page.slice(page.indexOf('if (result.reason === "public_request_pending"'), page.indexOf('result.reason === "invitation_required"'));
assert.match(pendingBranch, /awaiting review/);
assert.match(pendingBranch, /still being processed/);
assert.doesNotMatch(pendingBranch, /resetCustomerBookingPhoneOtpState|fetch\(|window\.location/);
console.log("Public pending admission guard passed: terminal database errors, preserved schema fallback, migration boundary and existing UI handling.");
