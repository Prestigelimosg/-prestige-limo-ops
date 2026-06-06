import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const diagnosisPath = path.join(
  process.cwd(),
  "docs/admin-persistence-production-get-500-diagnosis.md",
);
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const diagnosis = await readFile(diagnosisPath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");

for (const requiredText of [
  "Stage 4A-406 diagnosed the Stage 4A-405 `/api/admin-bookings` production GET `500` by local code inspection and mocked tests only.",
  "No production route was called in this stage.",
  "The admin booking GET/load path selected only the newer admin booking schema shape:",
  "The earlier approved foundation migration shape still uses `pickup_datetime`, `route_type`, `source_channel`, `sequence_number`, `location_text`, `timing_note`, `service_item_type`, and `blocks_count`.",
  "a schema-cache or missing-column response would be converted to the safe load `500`.",
  "The server-only Supabase adapter now tries the current read shape first and falls back to the foundation read shape only when the first read fails as a missing-column/schema-cache category.",
  "`/api/admin-bookings` GET list;",
  "safe reload by booking id after future approved writes;",
  "safe lookup by booking reference used by the update path.",
  "The fallback does not select `booking_service_items.internal_note`",
  "Production DB touched in Stage 4A-406: no.",
  "Production write attempted: no.",
  "Production POST save/load verification attempted: no.",
  "Test record created: no.",
  "Cleanup/delete needed: no.",
  "Approved masked production target from the prior stage remains `kvv...atm`; the full project reference was not printed.",
  "This stage fixes the GET/load schema mismatch only.",
]) {
  assertIncludes(diagnosis, requiredText);
}

assertIncludes(
  docsIndex,
  "[Admin Persistence Production GET 500 Diagnosis](admin-persistence-production-get-500-diagnosis.md)",
  "Docs index must point at the Stage 4A-406 diagnosis evidence.",
);

for (const [label, text] of [
  ["diagnosis", diagnosis],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(
    text,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}|kvvsg[a-z0-9]+hxatm/i,
    `${label} secret leak`,
  );
}

assertNotMatches(diagnosis, /```(?:bash|sql)/i, "diagnosis evidence must not include runnable shell or SQL blocks");

console.log("Admin persistence production GET 500 diagnosis evidence audit passed.");
