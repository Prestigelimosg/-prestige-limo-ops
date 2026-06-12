import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("lib/admin-flight-provider-selection-setup-foundation.ts", "utf8");

for (const fragment of [
  "adminFlightProviderSelectionSetupFoundationVersion",
  "buildAdminFlightProviderSelectionSetupFoundation",
  "setup_only",
  "provider_selection_status",
  "not_selected",
  "provider_lookup_status",
  "token_status",
  "not_configured",
  "live_eta_status",
  "external_request_status",
  "customer_update_status",
  "mng_arrival_eta_only",
]) assert.ok(source.includes(fragment), `Missing fragment: ${fragment}`);

for (const fragment of [
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "createClient",
  "supabase",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "/api/",
  "process.env",
  "aviationstack",
  "flightaware",
  "flightstats",
  "flightradar",
  "opensky",
  "aeroapi",
  "cirium",
  "airlabs",
  "sendMessage",
  "telegram",
  "whatsapp",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
]) assert.ok(!source.toLowerCase().includes(fragment.toLowerCase()), `Forbidden fragment: ${fragment}`);

console.log("admin flight provider selection setup foundation contract passed");
