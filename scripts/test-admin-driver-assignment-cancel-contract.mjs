import assert from "node:assert/strict";
import {loadHarness, canonicalAdminPayload, canonicalAdminUpdatePayload, installMockClient, adminActor, adminAudit, setEnv, restoreEnv} from './test-admin-booking-supabase-adapter-contract.mjs';
const harness=await loadHarness();
try {
  const {adapter,persistence}=harness;
  setEnv({PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE:'server-session-token', PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE:'admin', PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN:'mock-contract-admin-session-token', PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:'true', SUPABASE_URL:'https://contract-ready.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'SUPABASE_SERVICE_ROLE_KEY_SENTINEL_DO_NOT_LEAK'});
  const reassignmentExpectedUpdatedAt='2030-06-01T00:00:00.000Z';
  const reassignmentPayload=canonicalAdminUpdatePayload({booking:{booking_reference:'SAFE-DRIVER-REASSIGN-001', customer_id:104}});
  delete reassignmentPayload.personal_customer_folder_create;
  const parsedCancellation = persistence.parseAdminBookingUpdatePayload({
    ...reassignmentPayload,
    booking: { ...reassignmentPayload.booking, driver_id: null, driver_name: null, driver_contact: null, driver_plate_number: null },
    expected_updated_at: reassignmentExpectedUpdatedAt,
    target_booking_reference: "SAFE-DRIVER-REASSIGN-001",
    update_mode: "driver_assignment_cancel",
  });
  assert.equal(parsedCancellation.ok, true, JSON.stringify(parsedCancellation));
  const cancellationMock = installMockClient({ bookings: [{
    ...canonicalAdminPayload().booking, booking_reference: "SAFE-DRIVER-REASSIGN-001",
    id: 104, customer_id: 104, driver_id: 8, driver_name: "Previous Verified Driver",
    updated_at: reassignmentExpectedUpdatedAt,
  }] }, { rpcHandlers: { apply_admin_driver_reassignment(params, client) {
    assert.equal(params.p_new_driver_id, null);
    assert.equal(params.p_expected_updated_at, reassignmentExpectedUpdatedAt);
    Object.assign(client.tables.bookings[0], { driver_id: null, driver_name: null,
      driver_contact: null, driver_plate_number: null, updated_at: "2030-06-01T00:00:01.000Z" });
    return { data: { booking_id: 104, booking_reference: "SAFE-DRIVER-REASSIGN-001",
      previous_driver_id: 8, new_driver_id: null, expired_link_ids: [], notification: {
        id: "22222222-2222-4222-8222-222222222222", booking_reference: "SAFE-DRIVER-REASSIGN-001",
        delivery_surface: "driver_app", driver_job_link_id: null, notification_status: "queued",
        notification_type: "booking_status", priority: "urgent", safe_title: "Prestige Driver",
        safe_message: "Job cancel, do not proceed.", workflow_area: "driver_assignment_cancellation",
      } }, error: null };
  } } });
  globalThis.__prestigeSupabaseAdapterMock = cancellationMock;
  const cancellationResult = await adapter.updateAdminBookingThroughSupabaseAdapter(
    parsedCancellation.data, adminAudit("admin_booking_update"), adminActor());
  assert.equal(cancellationResult.ok, true, JSON.stringify(cancellationResult));
  assert.equal(cancellationResult.data.driver_id, null);
  assert.equal(cancellationResult.data.driver_name, null);
  assert.equal(cancellationMock.client.operations.filter(x => x.action === "rpc").length, 1);
  assert.equal(cancellationMock.client.operations.some(x => ["insert", "update", "delete"].includes(x.action)), false,
    "Cancellation must never fall through to the generic booking writer");


  // Only the explicit mode with a saved version and cleared safe fields may cancel.
  for (const variant of [
    {...parsedCancellation.data, expected_updated_at: undefined},
    {...parsedCancellation.data, expected_updated_at: "2029-01-01T00:00:00Z"},
    {...parsedCancellation.data, booking: {...parsedCancellation.data.booking, driver_id: 9}},
    {...parsedCancellation.data, update_mode: "driver_assignment"},
  ]) {
    const blockedMock=installMockClient({bookings:[{...canonicalAdminPayload().booking,
      id:104,customer_id:104,booking_reference:"SAFE-DRIVER-REASSIGN-001",driver_id:8,
      updated_at:reassignmentExpectedUpdatedAt}]});
    globalThis.__prestigeSupabaseAdapterMock=blockedMock;
    const result=await adapter.updateAdminBookingThroughSupabaseAdapter(variant,adminAudit("admin_booking_update"),adminActor());
    assert.equal(result.ok,false);
    assert.equal(blockedMock.client.operations.some(x=>["rpc","insert","update","delete"].includes(x.action)),false);
  }

} finally { restoreEnv(); delete globalThis.__prestigeSupabaseAdapterMock; await harness.cleanup(); }
console.log('Manual assignment cancellation adapter contract passed.');
