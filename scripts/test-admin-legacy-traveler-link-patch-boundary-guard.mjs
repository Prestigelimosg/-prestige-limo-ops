import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile("app/api/admin-legacy-data/rest/v1/[table]/route.ts", "utf8");

assert.ok(route.includes('allowServerSessionRoleMethodsWithoutRequestToken: ["PATCH"]'));
assert.ok(route.includes("resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose"));
assert.ok(route.includes("if (boundary.context.mode === \"local-dev-admin-surface\" && isProductionRuntime())"));
assert.ok(route.includes("allowedColumnsByTable"));
assert.ok(route.includes("validatePayloadContract"));
assert.ok(route.includes('"booker_id"'));
assert.ok(!route.includes('allowServerSessionRoleMethodsWithoutRequestToken: ["POST", "PATCH", "DELETE"]'));

console.log("Admin legacy traveler link PATCH boundary guard passed.");
