import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guardPath = "scripts/test-driver-private-job-copy-cleanup-guard.mjs";
const [driverPage, ledger, preactivationSuite] = await Promise.all([
  readFile("app/driver-job/[token]/page.tsx", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
]);

function assertIncludes(source, fragment, label) {
  assert.equal(source.includes(fragment), true, `${label} must retain ${fragment}.`);
}

function assertExcludes(source, fragment, label) {
  assert.equal(source.includes(fragment), false, `${label} must remove ${fragment}.`);
}

for (const retiredCopy of [
  "Type a message. The verified Boss and managing PA share this booking conversation, and admin can see it.",
  "Choose the issue and alert admin inside the app.",
  "Internal app alert only. No external messages, live location, or photo upload.",
  "Prestige Driver job card. Keep this link private and use it only for this assigned job.",
  "Send one arrival photo after OTS. Admin sees it inside Dispatch.",
  "Large phone photos are reduced automatically before sending.",
  "Admin-only proof. No customer message or external send is created from here.",
]) {
  assertExcludes(driverPage, retiredCopy, "Driver private-job noise cleanup");
}

for (const essentialControl of [
  "Message Customer",
  '"Type a message to the customer"',
  'data-driver-customer-message-send="true"',
  '"Send to Admin" : "Send to customer"',
  "Customer replies close after Passenger on board.",
  'data-driver-customer-quick-reply-feedback="true"',
  'data-driver-message-recipient="admin"',
  'data-driver-message-recipient="customer"',
  "Private to Admin. Report any issue here.",
  "OTS Photo to Admin",
  'data-driver-job-ots-photo-proof-state={driverOtsPhotoProofStatusLabel.toLowerCase()}',
  "Photo",
  "Shoot",
  'driverOtsPhotoProof.selectedFileName || "No photo selected."',
  'aria-label="OTS photo"',
  'driverOtsPhotoProof.action === "uploading" ? "Sending..." : "Send Photo to Admin"',
  'data-driver-job-ots-photo-proof-message="true"',
  "uploadDriverOtsPhotoProof",
  "sendDriverCustomerQuickReply",
]) {
  assertIncludes(driverPage, essentialControl, "Driver private-job essential control");
}

assert.match(
  driverPage,
  /!embeddedDriverApp\s*\?\s*\([\s\S]{0,600}data-driver-job-mobile-web-note="true"[\s\S]{0,400}Mobile web driver card\. Keep this link private and use it only for this assigned job\.[\s\S]{0,100}<\/p>[\s\S]{0,40}\)\s*:\s*null/,
  "Only ordinary mobile web must retain the existing private-link warning; verified native must render no blue note.",
);

const workflowHandoffStart = driverPage.indexOf('data-driver-job-workflow-handoff="true"');
const messageStart = driverPage.indexOf('data-driver-customer-quick-replies="true"');
assertExcludes(driverPage, 'data-driver-job-report-issue="true"', "Owner replaced issue UI");
assert.notEqual(workflowHandoffStart, -1, "The existing How this page works disclosure must remain.");
assert.notEqual(messageStart, -1, "The existing message composer must remain.");
assert.equal(
  workflowHandoffStart > messageStart,
  true,
  "The one existing How this page works disclosure must render after Messages at the bottom of the private job page.",
);
for (const handoffContent of [
  "How this page works",
  "This is the driver page for this assigned job.",
  "This private job stays inside Prestige Driver.",
  "Tap Save & Acknowledge Job after confirming driver and vehicle details.",
  "Tap OTW to save status and start native background location sharing.",
  "For an issue, select Admin in Messages and send your message.",
  "Private account and internal compensation details are not shown here.",
]) {
  assertIncludes(driverPage, handoffContent, "Unchanged How this page works content");
}
assertIncludes(
  driverPage,
  'className="order-[94] rounded-md border border-stone-200 bg-white p-2.5"',
  "Bottom How this page works layout",
);

for (const ledgerPhrase of [
  "### Driver Private-Job Copy Noise Cleanup And Help Disclosure Move (2026-08-27)",
  "removes only the four owner-identified static help-copy groups",
  "moves the single existing `How this page works` disclosure intact to the bottom",
  "No message, issue alert, OTS photo, status, Calendar, GPS, notification, booking, customer, invoice, billing, payment, payout or PayNow behavior changed.",
]) {
  assertIncludes(ledger, ledgerPhrase, "Driver private-job cleanup ledger evidence");
}
assertIncludes(preactivationSuite, guardPath, "Driver private-job cleanup preactivation registration");

console.log("Driver private-job copy cleanup guard passed.");
