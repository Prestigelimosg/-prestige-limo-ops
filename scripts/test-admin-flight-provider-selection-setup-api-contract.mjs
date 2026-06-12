import fs from "node:fs";
import assert from "node:assert/strict";

const route = fs.readFileSync("app/api/admin-flight-provider-selection-setup/route.ts", "utf8");
const helper = fs.readFileSync("lib/admin-flight-provider-selection-setup-foundation.ts", "utf8");
const combined = `${route}\n${helper}`;

for (const fragment of [
  "buildAdminFlightProviderSelectionSetupFoundation",
  "adminFlightProviderSelectionSetupFoundationVersion",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "setup_only",
  "provider_selection_status",
  "not_selected",
  "provider_lookup_status",
  "token_status",
  "live_eta_status",
  "external_request_status",
]) assert.ok(combined.includes(fragment), `Missing fragment: ${fragment}`);

for (const fragment of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "fetch(",
  "createClient",
  "supabase",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "process.env",
  "sendMessage",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
]) assert.ok(!combined.toLowerCase().includes(fragment.toLowerCase()), `Forbidden fragment: ${fragment}`);

console.log("admin flight provider selection setup API contract passed");
