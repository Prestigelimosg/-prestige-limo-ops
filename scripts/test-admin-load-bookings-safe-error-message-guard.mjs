import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile("app/page.tsx", "utf8");
const formatterStart = app.indexOf("function formatSupabaseError(error: unknown)");
const formatterEnd = app.indexOf("function compactParsedBooking", formatterStart);
const formatter = app.slice(formatterStart, formatterEnd);

assert.ok(formatterStart >= 0 && formatterEnd > formatterStart, "Supabase error formatter must exist.");
assert.ok(
  formatter.includes('if (typeof error === "string")'),
  "Safe server string errors must be handled explicitly.",
);
assert.ok(
  formatter.includes('return clean(error) || "Unknown Supabase error.";'),
  "Safe non-empty server error strings must remain visible to admin.",
);
assert.ok(
  app.includes("formatSupabaseError(bookingsListResult.error)"),
  "Existing Load Bookings lane must keep using the shared safe formatter.",
);

console.log("Admin Load Bookings safe error message guard passed.");
