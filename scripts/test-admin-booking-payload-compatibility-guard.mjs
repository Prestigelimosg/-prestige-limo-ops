import assert from "node:assert/strict";
import {
  loadHarness, canonicalCorporateAdminPayload, installMockClient,
  adminActor, adminAudit, setEnv, restoreEnv,
} from "./test-admin-booking-supabase-adapter-contract.mjs";

// Current Company + Booker fixture. Never reactivate the retired personal-folder
// creation used by the historical broad adapter suite just to reach these writes.
const seed = {
  bookers: [{ id: 24, company_id: 31, customer_id: 163, booker_name: "Jennifer" }],
  customers: [{ id: 163, display_name: "Safe Company / Booker: Jennifer", status: "active", account_status: "active" }],
  customer_contacts: [{ id: 90, customer_id: 999, phone: "+65 9000 0001", contact_name: "Other account" }],
};
const tables = ["customer_contacts", "booking_route_points", "booking_service_items", "audit_logs"];
const operationNames = ["customer_contact", "route_points", "service_items", "audit_log"];
const attempts = (client, table) => client.insertAttempts.filter((item) => item.table === table);
const harness = await loadHarness();
const { adapter, persistence, adminRoute } = harness;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("No provider/network calls allowed in this guard"); };

function payload(reference = "SAFE-COMPAT-001", booking = {}) {
  return canonicalCorporateAdminPayload({ booking: { booking_reference: reference, traveler_id: null, ...booking } });
}
function parsedCreate(body) {
  const result = persistence.parseAdminBookingPersistencePayload(body);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.data;
}
async function create(body = payload()) {
  return adapter.createAdminBookingThroughSupabaseAdapter(parsedCreate(body), adminAudit(), adminActor());
}
function request(body, method = "POST", headers = {}) {
  return new Request("http://localhost/api/admin-bookings", {
    method, body: JSON.stringify(body), headers: {
      "content-type": "application/json", origin: "http://localhost", referer: "http://localhost/",
      "x-prestige-admin-purpose": "admin-booking-persistence", ...headers,
    },
  });
}

try {
  setEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: "mock-contract-admin-session-token",
    SUPABASE_SERVICE_ROLE_KEY: "SUPABASE_SERVICE_ROLE_KEY_SENTINEL_DO_NOT_LEAK",
    SUPABASE_URL: "https://contract-ready.supabase.co",
  });

  for (const schemaMode of ["cumulative", "current", "foundation"]) {
    const { client } = installMockClient(seed, { schemaMode });
    const result = await create();
    assert.equal(result.ok, true, JSON.stringify(result));
    for (const table of tables) {
      assert.equal(attempts(client, table).length, schemaMode === "current" ? 2 : 1,
        `${schemaMode}: ${table} must use compatible payload first; fallback only for absent columns`);
    }
    const contact = client.tables.customer_contacts.find((row) => row.customer_id === 163);
    assert.equal(contact.contact_name ?? contact.display_name, "Jennifer");
    assert.equal(contact.phone, "+65 9000 0001");
    assert.equal(contact.email, "safe-ops@example.com");
    assert.equal(contact.contact_type ?? contact.role_label, "booking_contact");
    assert.deepEqual(client.tables.customer_contacts[0], seed.customer_contacts[0]);
    assert.equal(client.tables.customers.length, 1, "No duplicate customer/account creation");
    assert.equal(result.data.company_id, 31);
    assert.equal(result.data.booker_id, 24);
    assert.equal(result.data.customer_id, "163");
    assert.deepEqual(result.data.route_points.map((row) => [row.sequence_number, row.location_text]), [
      [1, "Safe Canonical Pickup"], [2, "Safe Canonical Stop"], [3, "Safe Canonical Dropoff"],
    ]);
    assert.deepEqual(result.data.service_items.map((row) => [row.item_type, row.quantity]), [["extra_stop", 1], ["midnight", 2]]);
    const audit = client.tables.audit_logs[0];
    assert.equal(audit.action_type, "booking_created");
    assert.equal(audit.booking_reference, "SAFE-COMPAT-001");
    assert.equal(audit.customer_id, 163);
    assert.equal(audit.safe_before, null);
    assert.equal(audit.safe_after.booking_reference, "SAFE-COMPAT-001");
    assert.equal(audit.actor_role, "admin");
    if (schemaMode !== "current") {
      assert.equal(audit.action, audit.action_type);
      assert.equal(audit.entity_type, "booking");
      assert.equal(audit.entity_id, client.tables.bookings[0].id);
      // Keep the exact previously successful persisted contact shape/defaults.
      assert.equal(Object.hasOwn(contact, "is_primary"), false);
      assert.deepEqual(client.tables.booking_service_items.map((row) => row.service_item_type), ["extra_stop", "midnight_charge"]);
    }

    // Same contact in the same account is reused for another booking.
    assert.equal((await create(payload("SAFE-COMPAT-002"))).ok, true);
    assert.equal(client.tables.customer_contacts.length, 2);
    assert.equal(client.tables.bookings.length, 2);

    // Existing amendment path: replace only this booking's children and append audit.
    const otherRoutes = structuredClone(client.tables.booking_route_points.filter((row) => row.booking_id === 2));
    const otherItems = structuredClone(client.tables.booking_service_items.filter((row) => row.booking_id === 2));
    const changed = payload("SAFE-COMPAT-001", { pickup_location: "Amended Pickup" });
    changed.route_points[0].location = "Amended Pickup";
    changed.service_items[1].blocks_count = 3;
    const parsed = persistence.parseAdminBookingUpdatePayload({ ...changed, target_booking_reference: "SAFE-COMPAT-001" });
    assert.equal(parsed.ok, true, JSON.stringify(parsed));
    const beforeCount = client.insertAttempts.length;
    const updated = await adapter.updateAdminBookingThroughSupabaseAdapter(parsed.data, adminAudit("admin_booking_update"), adminActor());
    assert.equal(updated.ok, true, JSON.stringify(updated));
    assert.equal(updated.data.route_points[0].location_text, "Amended Pickup");
    assert.equal(updated.data.service_items[1].quantity, 3);
    assert.deepEqual(client.tables.booking_route_points.filter((row) => row.booking_id === 2), otherRoutes);
    assert.deepEqual(client.tables.booking_service_items.filter((row) => row.booking_id === 2), otherItems);
    assert.equal(client.tables.audit_logs.length, 3);
    assert.equal(client.tables.audit_logs[2].action_type, "booking_updated");
    assert.equal(client.tables.audit_logs[2].safe_before.pickup_location, "Safe Canonical Pickup");
    assert.equal(client.tables.audit_logs[2].safe_after.pickup_location, "Amended Pickup");
    for (const table of tables.slice(1)) {
      assert.equal(client.insertAttempts.slice(beforeCount).filter((item) => item.table === table).length,
        schemaMode === "current" ? 2 : 1);
    }
    assert.equal(client.tables.customer_driver_app_notification_outbox.length, 0);
  }

  // Constraint, authorization, outage, and ambiguous transport errors must not
  // trigger another write or erase evidence by masquerading as schema fallback.
  for (const code of ["23502", "23503", "23505", "23514", "42501", "57014", "08006", "XX000"]) {
    for (const [index, table] of tables.entries()) {
      const { client } = installMockClient(seed, { failures: { [`insert:${table}`]: { code, message: "private diagnostic" } } });
      const failed = await create();
      assert.equal(failed.ok, false, `${code}/${table}`);
      assert.equal(failed.operation, operationNames[index]);
      assert.equal(attempts(client, table).length, 1, `${code}/${table} must not retry`);
      assert.doesNotMatch(JSON.stringify(failed), /private diagnostic|SUPABASE_SERVICE_ROLE_KEY_SENTINEL/);
    }
  }

  // Both supported missing-column codes allow exactly one fallback. If that
  // fallback fails too, surface the failure without a third attempt.
  for (const code of ["PGRST204", "42703"]) {
    for (const table of tables) {
      const { client } = installMockClient(seed, { failures: { [`insert:${table}`]: { code } } });
      assert.equal((await create()).ok, false);
      assert.equal(attempts(client, table).length, 2, `${code}/${table}: bounded fallback`);
    }
  }

  // An account mismatch must fail before contact or booking writes.
  const mismatch = installMockClient(seed);
  const mismatchedResult = await create(payload("SAFE-MISMATCH", { customer_id: 999 }));
  assert.equal(mismatchedResult.ok, false);
  assert.equal(mismatch.client.insertAttempts.length, 0);

  // Real route -> parser -> adapter -> persisted fixture -> route response.
  const { client } = installMockClient(seed);
  const response = await adminRoute.POST(request(payload()));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).ok, true);
  for (const table of tables) assert.equal(attempts(client, table).length, 1);
  const amendment = payload();
  amendment.target_booking_reference = "SAFE-COMPAT-001";
  amendment.booking.pickup_location = "API Amended Pickup";
  amendment.route_points[0].location = "API Amended Pickup";
  const patchResponse = await adminRoute.PATCH(request(amendment, "PATCH"));
  assert.equal(patchResponse.status, 200, JSON.stringify(await patchResponse.clone().json()));
  assert.equal((await patchResponse.json()).ok, true);
  assert.equal(client.tables.booking_route_points[0].location_text, "API Amended Pickup");
  assert.equal(client.tables.audit_logs.length, 2);
  assert.equal(attempts(client, "customer_contacts").length, 1);
  for (const table of tables.slice(1)) assert.equal(attempts(client, table).length, 2);
  const count = client.operations.length;
  const denied = await adminRoute.POST(request(payload("SAFE-DENIED"), "POST", { origin: "https://foreign.invalid", referer: "https://foreign.invalid/" }));
  assert.equal(denied.status, 403);
  assert.equal(client.operations.length, count, "Denied callers cannot reach persistence");
  console.log("Booking payload compatibility passed: create/update, three schemas, contact/account isolation, route/service/audit fidelity, 40 failure cases, and real POST/PATCH API boundary.");
} finally {
  globalThis.fetch = originalFetch;
  restoreEnv();
  delete globalThis.__prestigeSupabaseAdapterMock;
  await harness.cleanup();
}
