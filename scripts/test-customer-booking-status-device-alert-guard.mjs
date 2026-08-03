import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const statusRoutePath = "app/api/admin-saved-booking-statuses/route.ts";
const statusPersistencePath = "lib/admin-saved-booking-status-persistence.ts";
const notificationPersistencePath =
  "lib/customer-driver-app-notification-persistence.ts";
const adminBookingRoutePath = "app/api/admin-bookings/route.ts";
const adminPagePath = "app/page.tsx";
const driverStatusPersistencePath = "lib/driver-job-status-persistence.ts";
const ledgerPath = "docs/current-implementation-ledger.md";

function assertIncludes(source, fragments, label) {
  for (const fragment of fragments) {
    assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
  }
}

function assertExcludes(source, fragments, label) {
  for (const fragment of fragments) {
    assert.equal(source.includes(fragment), false, `${label} must exclude ${fragment}.`);
  }
}

const [
  statusRouteSource,
  statusPersistenceSource,
  notificationPersistenceSource,
  adminBookingRouteSource,
  adminPageSource,
  driverStatusPersistenceSource,
  ledgerSource,
] = await Promise.all(
  [
    statusRoutePath,
    statusPersistencePath,
    notificationPersistencePath,
    adminBookingRoutePath,
    adminPagePath,
    driverStatusPersistencePath,
    ledgerPath,
  ].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);

assertIncludes(
  statusRouteSource,
  [
    "maybeQueueAdminSavedBookingStatusCustomerNotification",
    'new Set(["cancelled", "completed"])',
    'safe_title: "Booking cancelled"',
    'safe_title: "Booking completed"',
    'workflow_area: "customer_booking_status_updates"',
    "customer_notification: customerNotification",
  ],
  "existing admin saved-booking status route customer fan-out",
);

assertIncludes(
  statusPersistenceSource,
  [
    "booking_reference: string | null;",
    "booking_reference: bookingReference,",
  ],
  "saved-booking status result exact booking reference",
);

assertIncludes(
  notificationPersistenceSource,
  [
    "customerAppNotificationUsesAdminBookingStatusTemplate",
    "adminBookingStatusUpdateTemplate",
    'input.workflow_area === "customer_booking_status_updates"',
    'input.safe_context.source === "admin_booking_status"',
    'input.safe_context.customer_facing_status === "cancelled"',
    'input.safe_context.customer_facing_status === "completed"',
    "sendCustomerDevicePushAlertForAppUpdate",
  ],
  "existing controlled customer notification persistence lane",
);

assertIncludes(
  adminBookingRouteSource,
  [
    "maybeQueueCustomerRequestDecisionNotification",
    'safe_title: "Booking request confirmed"',
    "preserveCustomerBookingRequestOrigin",
    'input.booking.source_surface = "customer_booking_request"',
  ],
  "already-wired accepted customer booking alert lane",
);

assertIncludes(
  adminPageSource,
  [
    "appliedAdminBookingSnapshotIsPendingCustomerRequest",
    'payload.booking.request_review_status = "approved"',
    'payload.booking.customer_facing_status = "confirmed"',
    'payload.booking.admin_internal_status = "Ready for Confirmation"',
    "queueCustomerBookingRequestConfirmedNotification",
    '? "Accept + Cal"',
  ],
  "existing Update + Cal pending customer request acceptance handoff",
);

assertIncludes(
  driverStatusPersistenceSource,
  [
    "queueDriverStatusCustomerInAppNotification",
    "status: nextStatus,",
  ],
  "already-wired driver status customer alert lane",
);

assertExcludes(
  statusRouteSource.toLowerCase(),
  ["invoice", "billing", "payment", "payout", "paynow", "driver calendar"],
  "narrow customer booking status alert repair",
);

assertIncludes(
  ledgerSource,
  [
    "Customer Booking Status Device Alert Completion",
    "existing saved-booking status endpoint",
    "does not notify on permanent archive deletion",
    "invoice system remains untouched",
  ],
  "implementation ledger",
);

const tempDir = path.join(process.cwd(), ".tmp-customer-booking-status-alert-guard");
const routeModulePath = path.join(
  tempDir,
  "app/api/admin-saved-booking-statuses/route.js",
);

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

try {
  await rm(tempDir, { force: true, recursive: true });
  await mkdir(path.dirname(routeModulePath), { recursive: true });
  await mkdir(path.join(tempDir, "lib"), { recursive: true });
  await writeFile(
    routeModulePath,
    transpileTypescript(statusRouteSource, statusRoutePath),
    "utf8",
  );
  await writeFile(
    path.join(tempDir, "lib/admin-booking-supabase-adapter.js"),
    `exports.adminDispatcherBoundaryToPersistenceAdapterActor = () => ({
      actor_label: "Status alert guard",
      actor_role: "admin",
      boundary_mode: "server-session-role-surface",
      source_surface: "admin_api",
    });`,
    "utf8",
  );
  await writeFile(
    path.join(tempDir, "lib/admin-dispatcher-auth-boundary.js"),
    `exports.adminBookingPersistencePurpose = "admin-booking-persistence";
    exports.resolveAdminDispatcherBoundary = () => ({
      context: {
        actorLabel: "Status alert guard",
        actorRole: "admin",
        mode: "server-session-role-surface",
      },
      ok: true,
    });`,
    "utf8",
  );
  await writeFile(
    path.join(tempDir, "lib/admin-saved-booking-status-persistence.js"),
    `exports.updateAdminSavedBookingStatus = async (input) => ({
      data: {
        booking: {
          booking_reference: input.booking_id,
          id: input.booking_id,
          status: input.status,
          updated_at: "2026-07-22T14:00:00.000Z",
        },
        version: "admin-saved-booking-status-v1",
      },
      ok: true,
    });`,
    "utf8",
  );
  await writeFile(
    path.join(tempDir, "lib/customer-driver-app-notification-persistence.js"),
    `exports.createCustomerDriverAppNotification = async (input) => ({
      data: { ...input, id: "status-alert-guard-notification" },
      ok: true,
    });`,
    "utf8",
  );

  const require = createRequire(import.meta.url);
  delete require.cache[routeModulePath];
  const route = require(routeModulePath);

  async function patchStatus(status) {
    const response = await route.PATCH(
      new Request("http://localhost/api/admin-saved-booking-statuses", {
        body: JSON.stringify({ booking_id: "STATUS-ALERT-20260722", status }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
    );

    return { body: await response.json(), status: response.status };
  }

  const cancelled = await patchStatus("cancelled");
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.booking.status, "cancelled");
  assert.equal(cancelled.body.customer_notification.ok, true);
  assert.equal(
    cancelled.body.customer_notification.notification.safe_title,
    "Booking cancelled",
  );
  assert.equal(
    cancelled.body.customer_notification.notification.workflow_area,
    "customer_booking_status_updates",
  );

  const completed = await patchStatus("completed");
  assert.equal(completed.status, 200);
  assert.equal(completed.body.booking.status, "completed");
  assert.equal(completed.body.customer_notification.ok, true);
  assert.equal(
    completed.body.customer_notification.notification.safe_title,
    "Booking completed",
  );

  const assigned = await patchStatus("assigned");
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.booking.status, "assigned");
  assert.equal(assigned.body.customer_notification, null);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Customer booking status device alert guard passed.");
