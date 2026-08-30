import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [scheduler, reminder, route, app, vercel, suite, ledger] = await Promise.all([
  readFile("lib/driver-ack-auto-reminder.ts", "utf8"),
  readFile("lib/admin-driver-ack-reminder.ts", "utf8"),
  readFile("app/api/cron/driver-ack-auto-reminders/route.ts", "utf8"),
  readFile("app/page.tsx", "utf8"),
  readFile("vercel.json", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
]);

function includes(source, fragment, label) {
  assert.ok(source.includes(fragment), `Missing ${label}: ${fragment}`);
}

for (const [source, fragment, label] of [
  [scheduler, "driver-ack-auto-reminder-v1", "scheduler version"],
  [scheduler, "15 * 60 * 1000", "15-minute eligibility"],
  [scheduler, "automatic_first_reminder", "automatic trigger audit"],
  [scheduler, "createAdminDriverAckReminder", "established reminder reuse"],
  [scheduler, "existingReminderLinkIds", "one automatic reminder only"],
  [reminder, 'trigger === "automatic_first_reminder" && audits.length > 0', "automatic/manual race protection"],
  [reminder, "automatic_already_attempted", "automatic repeat rejection"],
  [route, 'process.env.CRON_SECRET?.trim()', "Vercel Cron authorization"],
  [route, "runDriverAckAutoReminders", "isolated cron runner"],
  [app, "Auto reminder scheduled", "pending queue scheduled state"],
  [app, "Auto reminder sent", "pending queue sent state"],
  [app, "Remind again", "preserved manual recovery"],
  [vercel, '"path": "/api/cron/driver-ack-auto-reminders"', "cron route"],
  [vercel, '"schedule": "* * * * *"', "one-minute cron cadence"],
  [suite, 'script: "scripts/test-driver-ack-auto-reminder-guard.mjs"', "preactivation registration"],
  [suite, 'script: "scripts/test-driver-ack-auto-reminder-runtime.mjs"', "runtime registration"],
  [ledger, "Automatic First Driver ACK Reminder", "ledger evidence"],
]) {
  includes(source, fragment, label);
}

for (const forbidden of [
  "setInterval(",
  "driver_job_token",
  "revokeAdminDriverJobLink",
  "authorizeLiveLocationForDriverJobLink",
  "sendDriverDevicePushAlertForNewJobLink",
]) {
  assert.ok(!scheduler.includes(forbidden), `Automatic scheduler must not include ${forbidden}.`);
}

const cronConfig = JSON.parse(vercel);
const autoCron = cronConfig.crons?.filter(
  (entry) => entry.path === "/api/cron/driver-ack-auto-reminders",
);
assert.equal(autoCron?.length, 1, "Automatic ACK reminders need exactly one Vercel Cron entry.");
assert.equal(autoCron[0].schedule, "* * * * *");

console.log("Driver ACK automatic first-reminder guard passed.");
