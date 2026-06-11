import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const appPagePath = path.join(process.cwd(), "app/page.tsx");
const routePath = path.join(process.cwd(), "app/api/admin-legacy-data/rest/v1/[table]/route.ts");

const legacyTables = [
  "companies",
  "drivers",
  "rate_settings",
  "saved_addresses",
  "travelers",
];

const routeBackedTableReferences = {
  companies: "adminLegacyTables.companies",
  drivers: "adminLegacyTables.drivers",
  rate_settings: "adminLegacyTables.rateSettings",
  saved_addresses: "adminLegacyTables.savedAddresses",
  travelers: "adminLegacyTables.travelers",
};

const approvedStage4a398Migration =
  "supabase/migrations/202606050001_legacy_public_table_rls_hardening.sql";

function assertIncludes(text, expected, label = expected) {
  assert.ok(text.includes(expected), `Missing required text: ${label}`);
}

function assertNotIncludes(text, forbidden, label = forbidden) {
  assert.ok(!text.includes(forbidden), `Forbidden text present: ${label}`);
}

function assertNotMatches(text, pattern, label = String(pattern)) {
  assert.doesNotMatch(text, pattern, `Forbidden pattern present: ${label}`);
}

await access(routePath);

const appPage = await readFile(appPagePath, "utf8");
const route = await readFile(routePath, "utf8");
const gitStatus = execFileSync("git", ["status", "--short"], { encoding: "utf8" });

assertNotMatches(appPage, /from\s+["'][^"']*lib\/supabase["'];?/, "browser Supabase client import");
assertNotIncludes(appPage, "import { supabase }", "named browser Supabase import");
assertNotIncludes(appPage, "createClient(", "browser Supabase createClient");
assertNotIncludes(appPage, "NEXT_PUBLIC_SUPABASE_URL", "browser Supabase URL env");
assertNotIncludes(appPage, "NEXT_PUBLIC_SUPABASE_ANON_KEY", "browser Supabase anon env");
assertNotIncludes(appPage, "SUPABASE_SERVICE_ROLE_KEY", "service role env in browser file");
assertNotMatches(appPage, /\bSUPABASE_URL\b/, "server Supabase URL env in browser file");

assertIncludes(appPage, "/api/admin-legacy-data/rest/v1/", "route-backed admin data endpoint");
assertIncludes(appPage, "adminLegacyDataClient", "route-backed client adapter");
assertIncludes(appPage, "x-prestige-admin-purpose", "admin purpose header");
assertIncludes(appPage, "/api/admin-bookers", "typed admin bookers endpoint");
assertNotIncludes(appPage, "adminLegacyTables.bookers", "retired legacy bookers table reference");

for (const table of legacyTables) {
  assertNotIncludes(appPage, `.from("${table}")`, `direct double-quoted ${table} browser table access`);
  assertNotIncludes(appPage, `.from('${table}')`, `direct single-quoted ${table} browser table access`);
  assertIncludes(appPage, routeBackedTableReferences[table], `${table} route-backed table reference`);
}

assertIncludes(route, "resolveAdminDispatcherBoundary", "admin dispatcher boundary");
assertIncludes(route, "adminBookingPersistencePurpose", "admin persistence purpose");
assertIncludes(route, "SUPABASE_URL", "server-only Supabase URL env");
assertIncludes(route, "SUPABASE_SERVICE_ROLE_KEY", "server-only service role env");
assertIncludes(route, "createClient", "server-only Supabase client creation");
assertIncludes(route, "allowedColumnsByTable", "route column allowlist");
assertIncludes(route, "safeUnsupportedMessage", "sanitized unsupported contract response");
assertNotIncludes(route, "NEXT_PUBLIC_SUPABASE_URL", "public Supabase URL in route");
assertNotIncludes(route, "NEXT_PUBLIC_SUPABASE_ANON_KEY", "public anon key in route");
assertNotMatches(route, /CREATE\s+POLICY|GRANT\s+|USING\s*\(\s*true\s*\)|anon/i, "public anon policy text");

const unexpectedMigrationStatusLines = gitStatus
  .split("\n")
  .filter((line) => line.includes("supabase/migrations/"))
  .filter((line) => !line.endsWith(approvedStage4a398Migration));

assert.deepEqual(unexpectedMigrationStatusLines, [], "unexpected migration file");

console.log("Legacy admin browser Supabase access retirement audit passed.");
