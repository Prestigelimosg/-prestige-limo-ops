import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const appPage = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");
const ledger = fs.readFileSync(path.join(root, "docs/current-implementation-ledger.md"), "utf8");
const preactivationSuite = fs.readFileSync(
  path.join(root, "scripts/test-preactivation-verification-suite.mjs"),
  "utf8",
);
const bookingUiBrowser = fs.readFileSync(
  path.join(root, "scripts/test-booking-ui-browser.mjs"),
  "utf8",
);
const pendingAckBrowser = fs.readFileSync(
  path.join(root, "scripts/test-pending-driver-ack-queue-browser.mjs"),
  "utf8",
);
const adminNotificationReadStart = appPage.indexOf(
  "async function loadAdminAppNotificationsRead()",
);
const adminNotificationReadEnd = appPage.indexOf(
  "async function loadAdminEmailAiIntakeRead()",
  adminNotificationReadStart,
);
const adminNotificationReadSource = appPage.slice(
  adminNotificationReadStart,
  adminNotificationReadEnd,
);

for (const fragment of [
  "const adminNotificationCentreCount =",
  "const adminNotificationCentreCategoryCount =",
  "data-admin-notification-centre=\"true\"",
  "data-admin-notification-centre-count={isDashboardTab ? String(adminNotificationCentreCount) : undefined}",
  "data-admin-notification-centre-option=\"driver-ack\"",
  "data-admin-notification-centre-option=\"change\"",
  "data-admin-notification-centre-option=\"new\"",
  "data-admin-notification-centre-option=\"email\"",
  "data-admin-notification-centre-option=\"urgent\"",
  "data-admin-notification-centre-option=\"saved-update\"",
  "function openPendingDriverAckQueueFromNotificationCentre()",
  "function openSavedAdminNotificationsFromNotificationCentre()",
  "data-pending-driver-ack-queue=\"true\"",
  "const adminAppNotificationReadPageSize = 100;",
  'aria-haspopup={isDashboardTab && showAdminActionBadge ? "menu" : undefined}',
  "data-admin-notification-centre-keyboard-trigger=",
]) {
  assert.equal(
    appPage.includes(fragment),
    true,
    `Admin notification centre must include ${fragment}`,
  );
}

assert.match(
  adminNotificationReadSource,
  /for \(let page = 1; page <= pageCount; page \+= 1\)[\s\S]*?limit: String\(adminAppNotificationReadPageSize\)[\s\S]*?page: String\(page\)[\s\S]*?pagePagination\?\.page_count/,
  "The notification centre must load every queued notification page before computing its purpose counts.",
);

assert.equal(
  adminNotificationReadSource.includes('limit: "5"'),
  false,
  "The notification-centre read must not truncate purpose counts to five queued records.",
);

assert.match(
  appPage,
  /const adminNotificationCentreCount =\s*bookingsTabAttentionCount \+\s*pendingDriverAckQueueItems\.length \+\s*otherAdminAppNotifications\.length;/,
  "The existing Dashboard action count must add only current booking attention, the existing ACK Queue, and queued saved Admin updates.",
);

assert.match(
  appPage,
  /function openPendingDriverAckQueueFromNotificationCentre\(\)[\s\S]*?selectAppTab\("dispatch"\);[\s\S]*?scrollToAdminAlertLocatorTarget\("pending-driver-ack-queue"\);/,
  "Driver ACK notification rows must hand off to the one existing Dispatch ACK Queue.",
);

assert.match(
  appPage,
  /if \(target === "pending-driver-ack-queue"\)[\s\S]*?\[data-pending-driver-ack-queue="true"\]/,
  "The notification centre must locate the established ACK Queue instead of rendering a second queue.",
);

assert.match(
  appPage,
  /if \(isDashboardTab && showAdminActionBadge && clickedAlertBadge\) \{\s*setBookingsAlertMenuOpen\(\(isOpen\) => !isOpen\);\s*return;/,
  "Every Dashboard badge click must reveal its purpose list, even when only one category is active.",
);

assert.match(
  appPage,
  /onKeyDown=\{\(event\) => \{[\s\S]*?isDashboardTab &&[\s\S]*?showAdminActionBadge &&[\s\S]*?\(event\.key === "Enter" \|\| event\.key === " "\)[\s\S]*?event\.preventDefault\(\);[\s\S]*?setBookingsAlertMenuOpen/,
  "The focused Dashboard tab must expose an explicit Enter/Space path to the notification purpose menu.",
);

assert.equal(
  appPage.includes("adminNotificationCentreCategoryCount > 1"),
  false,
  "A single alert category must not bypass the purpose list.",
);

for (const fragment of [
  "## Admin Dashboard Notification Centre Purpose List (source checkpoint 2026-09-06)",
  "The existing Dashboard tab remains the one Admin Action Center.",
  "The repair adds no second badge, bell, page, panel, route, API, table, schema, migration, notification producer, push sender, polling loop, database write or provider action.",
  "`scripts/test-admin-notification-centre-guard.mjs`",
]) {
  assert.equal(ledger.includes(fragment), true, `Notification-centre ledger must include ${fragment}`);
}

assert.equal(
  preactivationSuite.includes('script: "scripts/test-admin-notification-centre-guard.mjs"'),
  true,
  "The focused Admin notification-centre guard must be registered in preactivation.",
);

for (const fragment of [
  "single-category Admin notification purpose list",
  "openedSingleCategoryNotificationCentre",
  "openedEmailReviewFromNotificationCentre",
]) {
  assert.equal(
    bookingUiBrowser.includes(fragment),
    true,
    `Admin browser acceptance must include ${fragment}`,
  );
}

for (const fragment of [
  "Dashboard notification centre ACK count",
  "single-category Driver ACK purpose list",
  "Dashboard notification centre opened the existing ACK Queue",
  "keyboard-opened Driver ACK notification centre",
]) {
  assert.equal(
    pendingAckBrowser.includes(fragment),
    true,
    `Pending-ACK browser acceptance must include ${fragment}`,
  );
}

console.log("Admin notification centre guard passed");
