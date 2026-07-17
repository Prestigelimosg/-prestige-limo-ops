import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, persistence, adminRoute, customerRoute, driverRoute, ledger] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("lib/customer-driver-app-notification-persistence.ts", "utf8"),
  readFile("app/api/admin-customer-driver-app-notifications/route.ts", "utf8"),
  readFile("app/api/customer-app-notifications/route.ts", "utf8"),
  readFile("app/api/driver-job/[token]/notifications/route.ts", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
]);

const monitorStart = app.indexOf('aria-label="Active Assigned Jobs"');
const monitorEnd = app.indexOf('data-dispatch-live-driver-map="true"', monitorStart);
const monitor = app.slice(monitorStart, monitorEnd);

assert.notEqual(monitorStart, -1, "Missing Active Assigned Jobs reporting center.");
assert.notEqual(monitorEnd, -1, "Missing Active Assigned Jobs map boundary.");

for (const fragment of [
  'data-admin-active-job-driver-message="true"',
  'data-admin-active-job-message-audience="true"',
  'data-admin-active-job-message-audience-option={audience}',
  '(["driver", "customer"] as const)',
  'data-admin-active-job-driver-message-input="true"',
  'data-admin-active-job-driver-message-send="true"',
  'data-admin-active-job-driver-message-open-link-setup="true"',
  ">Messages</div>",
  "Send to Driver",
  "Send to Customer",
  "Queued to Driver Job page at ${adminDriverJobStatusTimeLabel(new Date().toISOString())}.",
  "Queued to Customer App at ${adminDriverJobStatusTimeLabel(new Date().toISOString())}.",
  "Open Driver Link Setup",
  "Visible to admin and this driver only. Customers cannot see this message.",
  "Visible to admin and this customer only. Driver cannot see this message.",
  "sendAdminTodayJobMessage",
  'delivery_surface: "driver_app"',
  'audience: "admin_driver"',
  'recipient_role: "driver"',
  'sender_role: "admin"',
  'workflow_area: "admin_driver_job_messages"',
  'delivery_surface: "customer_app"',
  'audience: "admin_customer"',
  'recipient_role: "customer"',
  'workflow_area: "admin_customer_job_messages"',
  'safe_title: "Message from dispatch"',
  "activeLink.id",
  'method: "POST"',
]) {
  assert.ok(monitor.includes(fragment) || app.includes(fragment), `Missing Active Assigned Jobs message fragment: ${fragment}`);
}

assert.equal(
  (monitor.match(/<textarea/g) || []).length,
  1,
  "Active Assigned Jobs Messages must keep one composer textarea for both audiences.",
);
assert.equal(
  (monitor.match(/data-admin-active-job-driver-message-send="true"/g) || []).length,
  1,
  "Active Assigned Jobs Messages must keep one send button for both audiences.",
);

for (const fragment of [
  "assertAdminDriverAppNotificationWriteScope",
  '.from("driver_job_links")',
  '.eq("id", input.driver_job_link_id)',
  '.eq("booking_reference", input.booking_reference)',
  '.eq("link_status", "active")',
  "isDriverJobLinkExpired",
  "Driver app notification requires the exact active driver job link.",
]) {
  assert.ok(persistence.includes(fragment), `Missing server driver-message scope lock: ${fragment}`);
}

assert.ok(
  persistence.includes('.eq("delivery_surface", "driver_app")'),
  "Driver token read must remain driver-app scoped.",
);
assert.ok(
  persistence.includes('input.workflow_area === "admin_customer_job_messages"') &&
    persistence.includes('input.safe_context.audience === "admin_customer"') &&
    persistence.includes('input.safe_context.recipient_role === "customer"'),
  "Customer-targeted admin messages must use the exact approved customer-app workflow and audience context.",
);
assert.ok(
  adminRoute.includes('allowServerSessionRoleMethodsWithoutRequestToken: ["POST"]'),
  "Active Assigned Jobs Send to Driver must allow only the same-origin dashboard POST through the verified server-session role.",
);
assert.ok(
  driverRoute.includes("loadDriverAppNotificationsForToken"),
  "Driver messages must keep using the existing token-scoped notification read.",
);
assert.ok(
  persistence.includes('record.delivery_surface !== "customer_app"') &&
    persistence.includes('.eq("delivery_surface", "customer_app")') &&
    customerRoute.includes("readCustomerAppNotificationsForPortalAccessRuntime"),
  "Customer reads must remain customer-app scoped and authenticated.",
);

for (const forbidden of [
  "customer_price",
  "driver_payout",
  "paynow",
  "billing",
  "invoice",
  "payment",
  "internal_admin",
  "internal_finance",
  "parser_debug",
  "token_hash",
  "raw_token",
]) {
  assert.ok(!monitor.toLowerCase().includes(forbidden), `Forbidden message-card content: ${forbidden}`);
}

assert.ok(
  ledger.includes("### Today’s Jobs Admin-to-Driver Messages"),
  "Missing messaging implementation ledger section.",
);
assert.ok(
  ledger.includes("### Active Assigned Jobs Admin-to-Customer Messages"),
  "Missing admin-to-customer messaging implementation ledger section.",
);

console.log("Active Assigned Jobs admin audience message guard passed");
