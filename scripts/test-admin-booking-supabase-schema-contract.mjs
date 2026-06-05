import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const adapterPath = path.join(process.cwd(), "lib/admin-booking-supabase-adapter.ts");
const persistencePath = path.join(process.cwd(), "lib/admin-booking-persistence.ts");
const runnerPath = path.join(
  process.cwd(),
  "scripts/run-admin-booking-staging-save-load-verification.mjs",
);
const readonlyDiagnosticPath = path.join(
  process.cwd(),
  "scripts/check-admin-booking-staging-readonly-contract.mjs",
);
const evidencePath = path.join(
  process.cwd(),
  "docs/admin-persistence-staging-save-load-failure-evidence.md",
);
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const foundationMigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606010001_admin_booking_persistence_foundation.sql",
);
const firstPersistenceMigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606040001_first_admin_booking_customer_persistence.sql",
);
const forbiddenStage390Approval = [
  "PRESTIGE_ADMIN_BOOKING_STAGING_WRITE_VERIFICATION_APPROVED",
  "stage-4a-390-william-approved",
].join("=");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertMatches(text, pattern, message = `Missing required pattern: ${pattern}`) {
  assert.match(text, pattern, message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const adapter = await readFile(adapterPath, "utf8");
const persistence = await readFile(persistencePath, "utf8");
const runner = await readFile(runnerPath, "utf8");
const readonlyDiagnostic = await readFile(readonlyDiagnosticPath, "utf8");
const evidence = await readFile(evidencePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");
const foundationMigration = await readFile(foundationMigrationPath, "utf8");
const firstPersistenceMigration = await readFile(firstPersistenceMigrationPath, "utf8");
const combinedMigrations = `${foundationMigration}\n${firstPersistenceMigration}`;

for (const table of [
  "customers",
  "customer_contacts",
  "bookings",
  "booking_route_points",
  "booking_service_items",
  "audit_logs",
]) {
  assertIncludes(combinedMigrations, `public.${table}`);
  assertIncludes(adapter, `"${table}"`);
  assertIncludes(readonlyDiagnostic, `"${table}"`);
}

for (const legacyCumulativeColumn of [
  "id bigserial primary key",
  "contact_name text not null",
  "sequence_number integer not null",
  "location_text text not null",
  "service_item_type text not null",
  "entity_type text not null",
  "action text not null",
]) {
  assertIncludes(foundationMigration, legacyCumulativeColumn);
}

for (const currentColumn of [
  "display_name text",
  "role_label text",
  "is_primary boolean not null default false",
  "sequence integer",
  "location text",
  "item_type text",
  "actor_role text",
  "action_type text",
  "safe_before jsonb",
  "safe_after jsonb",
]) {
  assertIncludes(firstPersistenceMigration, currentColumn);
}

assertIncludes(adapter, "type DbIdentifier = string | number;");
assertIncludes(adapter, "function dbIdentifierOrNull(value: unknown): DbIdentifier | null");
assertIncludes(adapter, "const insertedId = dbIdentifierOrNull(asRecord(insertedRow).id);");
assertIncludes(adapter, "const bookingId = dbIdentifierOrNull(asRecord(data).id);");
assertIncludes(adapter, "customer_id: dbIdentifierTextOrNull(row.customer_id),");

for (const customerContactColumn of [
  "customer_id: customerId",
  "display_name: displayName",
  "contact_name: contactName",
  "phone,",
  "email,",
  'role_label: "booking_contact"',
  'contact_type: "booking_contact"',
  "is_primary: true",
]) {
  assertIncludes(adapter, customerContactColumn);
}

for (const routePointColumn of [
  "booking_id: bookingId",
  "sequence,",
  "sequence_number: currentRow.sequence",
  "point_type: pointType",
  "location,",
  "location_text: currentRow.location",
  "notes,",
  "timing_note: currentRow.notes",
]) {
  assertIncludes(adapter, routePointColumn);
}

assertIncludes(
  adapter,
  'const pointType = routePoint.point_type === "extra_stop" ? "stop" : routePoint.point_type || "waypoint";',
  "Route-point DB writes must use the intersection of old and current point_type constraints.",
);
assertIncludes(
  foundationMigration,
  "point_type text not null check (point_type in ('pickup', 'dropoff', 'stop', 'waypoint'))",
);
assertIncludes(
  firstPersistenceMigration,
  "point_type in ('pickup', 'dropoff', 'stop', 'waypoint', 'extra_stop')",
);

for (const serviceItemColumn of [
  "booking_id: bookingId",
  "item_type: itemType",
  "service_item_type: legacyServiceItemTypeToDb(currentRow.item_type)",
  "quantity,",
  "blocks_count: currentRow.quantity",
  "notes: textOrNull(serviceItem.notes)",
]) {
  assertIncludes(adapter, serviceItemColumn);
}

assertIncludes(adapter, 'return value === "midnight" ? "midnight_charge" : value;');
assertIncludes(
  foundationMigration,
  "service_item_type in ('child_seat', 'extra_stop', 'waiting_time', 'midnight_charge')",
);
assertIncludes(
  firstPersistenceMigration,
  "item_type in ('child_seat', 'extra_stop', 'waiting_time', 'midnight', 'luggage', 'vehicle_request', 'other')",
);

for (const bookingColumn of [
  "booking_reference",
  "customer_id",
  "customer_display_name",
  "contact_display_name",
  "contact_phone",
  "contact_email",
  "service_type",
  "pickup_at",
  "pickup_location",
  "dropoff_location",
  "route_summary",
  "passenger_name",
  "passenger_phone",
  "admin_internal_status",
  "customer_facing_status",
  "short_notice_review_status",
  "request_review_status",
  "change_review_status",
  "cancellation_review_status",
  "source_surface",
]) {
  assertMatches(adapter, new RegExp(`${bookingColumn}:|${bookingColumn},`));
  assertIncludes(firstPersistenceMigration, bookingColumn);
  assertIncludes(readonlyDiagnostic, `"${bookingColumn}"`);
}

for (const auditColumn of [
  "booking_id: bookingId",
  "customer_id: customerId",
  'entity_type: "booking"',
  "entity_id: bookingId",
  "actor_role: actor.actor_role",
  "action: actionType",
  "action_type: actionType",
  "booking_reference: bookingReference",
  "source_surface: sourceSurface",
  "source_route: textOrNull(auditInput.source_route)",
  "actor_label: textOrNull(auditInput.actor_label) || actor.actor_label",
  "change_summary: textOrNull(auditInput.change_summary)",
  "safe_before: safeAuditSnapshot(safeBefore)",
  "safe_after: safeAuditSnapshot(safeAfter)",
]) {
  assertIncludes(adapter, auditColumn);
}

for (const readonlyDiagnosticColumn of [
  '"account_status"',
  '"status"',
  '"contact_name"',
  '"contact_type"',
  '"display_name"',
  '"role_label"',
  '"is_primary"',
  '"sequence"',
  '"sequence_number"',
  '"location"',
  '"location_text"',
  '"item_type"',
  '"service_item_type"',
  '"actor_role"',
  '"action_type"',
  '"entity_type"',
  '"action"',
  '"safe_before"',
  '"safe_after"',
]) {
  assertIncludes(readonlyDiagnostic, readonlyDiagnosticColumn);
}

for (const sourceSurface of [
  "'admin_dashboard'",
  "'admin_api'",
  "'customer_booking_request'",
  "'customer_portal'",
  "'driver_job'",
  "'migration'",
  "'system'",
]) {
  assertIncludes(firstPersistenceMigration, sourceSurface);
}

assertIncludes(adapter, 'return "admin_dashboard";');
assertIncludes(adapter, 'source_surface: "admin_api",');
assertIncludes(adapter, 'return "admin-api";');
assertNotMatches(adapter, /source_surface:\s*"admin-api"/);
assertNotMatches(adapter, /source_surface:\s*"admin-dashboard"/);

for (const unsafeField of [
  "quoted_price",
  "billing",
  "payment",
  "pdf",
  "driver_payout",
  "live_location",
  "proof",
  "notification",
  "parser_learning",
  "service_role",
  "server_secret",
]) {
  assertIncludes(persistence, `"${unsafeField}"`);
}

for (const safeFailureText of [
  "Admin booking persistence save failed safely.",
  "Admin booking persistence load failed safely.",
  "Saved booking could not be safely reloaded.",
  "Admin booking persistence update failed safely.",
  "Admin booking persistence is not enabled on this server.",
  "safeAdapterFailure",
  "classifyAdapterDatabaseFailure",
  "column_missing",
  "permission_or_rls_denied",
]) {
  assertIncludes(adapter, safeFailureText);
}

assertNotMatches(adapter, /console\.(?:log|error)|error\.message|error\.stack|details|hint/i);
assertNotMatches(runner, /console\.error|error\.message|error\.stack/);
assertNotMatches(readonlyDiagnostic, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
assert.ok(!readonlyDiagnostic.includes(forbiddenStage390Approval));
assertIncludes(readonlyDiagnostic, 'mode: "readonly"');
assertIncludes(readonlyDiagnostic, "partial_row_possible");
assertIncludes(readonlyDiagnostic, "no_partial_rows_found");
assertIncludes(readonlyDiagnostic, "unknown_readonly_failure");
assertIncludes(runner, 'failSafely("controlled_save_failed_safely"');
assertIncludes(runner, "main().catch(() => {");
assertIncludes(runner, 'failSafely("unexpected_runner_failure_sanitized");');
assertIncludes(runner, "PRESTIGE_ADMIN_BOOKING_STAGING_WRITE_VERIFICATION_APPROVED");
assertIncludes(runner, ".env.stage4a388.local");

for (const evidenceText of [
  "Stage 4A-389",
  "STAGING-VERIFY-4A388-20260605063421-BWH52V",
  "controlled_save_failed_safely",
  "No second live staging write was attempted in Stage 4A-389.",
  "No Supabase CLI command was run.",
  "No migration was created.",
  "No raw SQL write was performed.",
  "No production write was performed.",
  "No environment file was committed.",
  "No secret, token, URL, key prefix, service-role key, or environment value was printed or committed.",
  "Persistence still defaults OFF.",
  "Customer, public, driver, and anonymous paths remain blocked from admin persistence writes.",
]) {
  assertIncludes(evidence, evidenceText);
}

assertIncludes(
  evidence,
  "PRESTIGE_ADMIN_BOOKING_STAGING_WRITE_VERIFICATION_APPROVED=stage-4a-388-william-approved node scripts/run-admin-booking-staging-save-load-verification.mjs",
);
assertNotMatches(evidence, /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=/);
assertNotMatches(evidence, /https:\/\/[^\s)`]+\.supabase\.co/);
assertIncludes(docsIndex, "admin-persistence-staging-save-load-failure-evidence.md");

console.log(
  "Admin booking Supabase schema contract matches cumulative migration-safe adapter writes.",
);
