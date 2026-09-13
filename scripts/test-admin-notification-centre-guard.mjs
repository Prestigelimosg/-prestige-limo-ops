import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const appPage = fs.readFileSync(path.join(root, "app/page.tsx"), "utf8");
const notificationPersistence = fs.readFileSync(
  path.join(root, "lib/admin-app-notification-persistence.ts"),
  "utf8",
);
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
const notificationPersistenceReadStart = notificationPersistence.indexOf(
  "export async function loadAdminAppNotifications(",
);
const notificationPersistenceReadEnd = notificationPersistence.indexOf(
  "export async function createAdminAppNotification(",
  notificationPersistenceReadStart,
);
const notificationPersistenceReadSource = notificationPersistence.slice(
  notificationPersistenceReadStart,
  notificationPersistenceReadEnd,
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
  "function openSavedAdminNotificationsFromNotificationCentre(requestedNotificationId?: string | null)",
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

for (const fragment of [
  '.select(notificationSelect, { count: "exact" })',
  'query = query.eq("booking_reference", parsed.data.booking_reference);',
  'query = query.eq("notification_status", parsed.data.notification_status);',
  'query = query.eq("notification_type", parsed.data.notification_type);',
  'query = query.eq("priority", parsed.data.priority);',
  '.order("created_at", { ascending: false })',
  '.order("id", { ascending: false })',
  '.range(startIndex, endIndex)',
  "pagination: buildPagination(count, parsed.data)",
]) {
  assert.equal(
    notificationPersistenceReadSource.includes(fragment),
    true,
    `Admin notification persistence read must include ${fragment}`,
  );
}

assert.equal(
  notificationPersistenceReadSource.includes("maxReadRows"),
  false,
  "The persisted notification read must not cap the candidate rows before filtering and pagination.",
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
  /if \(isDashboardTab && showAdminActionBadge\) \{\s*selectAppTab\(tab.id\);\s*setBookingsAlertMenuOpen\(\(isOpen\) => !isOpen\);\s*return;/,
  "The whole Dashboard control must reveal the alert list, including a tap outside the tiny badge.",
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
  "The existing guarded notification read now applies every validated filter in Supabase before exact counting and deterministic ranged pagination.",
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
  "combined Admin notification purpose list",
  "openedCombinedNotificationCentre",
  'assert.equal(emailAiDashboardState.dashboardBadgeText, "3 alerts");',
  'assert.equal(combinedNotificationCentreState.categoryCount, "2");',
  "combinedNotificationCentreState.savedUpdateText",
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
  'centre.getBoundingClientRect().left >= 0',
  'centre.getBoundingClientRect().right <= window.innerWidth',
]) {
  assert.equal(
    pendingAckBrowser.includes(fragment),
    true,
    `Pending-ACK browser acceptance must include ${fragment}`,
  );
}

assert.equal(appPage.includes("otherAdminAppNotifications.map((notification) =>"), true, "Each saved alert must have its own menu row");
assert.equal(appPage.includes("openSavedAdminNotificationsFromNotificationCentre(notification.id)"), true, "Alert selection must carry its exact ID");
assert.equal(appPage.includes('clean(notification.safe_title) || "Admin update"'), true, "Show each alert title");
assert.equal(appPage.includes('clean(notification.safe_message)'), true, "Show each alert message");
assert.equal(appPage.includes('clean(otherAdminAppNotifications[0]?.id)'), false, "Never silently open the first alert instead of the selected alert");
console.log("Admin notification centre guard passed");

// Execute the real saved-alert handoff with distinct and unknown IDs.
const ts = (await import('typescript')).default;
const handlerStart = appPage.indexOf('function openSavedAdminNotificationsFromNotificationCentre(');
const handlerEnd = appPage.indexOf('\n  async function ', handlerStart);
const compiledHandler = ts.transpileModule(appPage.slice(handlerStart, handlerEnd), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const alertRows = Array.from({length: 7}, (_, index) => ({
  id: `alert-${index + 1}`, safe_title: `Job ${index + 1}`, safe_message: `Dispatch message ${index + 1}`,
}));
const actions = [];
const openAlert = new Function('clean', 'otherAdminAppNotifications', 'setBookingsAlertMenuOpen', 'selectAppTab', 'markAdminAlertLocatorHighlight', 'scrollToAdminAlertLocatorTarget',
  compiledHandler + '\nreturn openSavedAdminNotificationsFromNotificationCentre;')(
  (value) => String(value ?? '').trim(), alertRows,
  (value) => actions.push(['menu', value]), (value) => actions.push(['tab', value]),
  (target, id) => actions.push(['highlight', target, id]),
  (target, id) => actions.push(['scroll', target, id]),
);
for (const id of ['alert-2', 'alert-3', 'alert-7']) {
  actions.length = 0;
  openAlert(id);
  assert.deepEqual(actions, [['menu', false], ['tab', 'dashboard'], ['highlight', 'admin-app-notification', id], ['scroll', 'admin-app-notification', id]]);
}
actions.length = 0;
openAlert('not-in-current-account');
assert.deepEqual(actions, [], 'Unknown alert must not navigate to an unrelated message');
assert.match(appPage, /const visibleOtherAdminAppNotifications = otherAdminAppNotifications;/, 'Every listed saved alert needs its existing destination, including alerts beyond five');

// Render the actual menu rows, retaining each safe title, message and exact ID.
const React = (await import('react')).default;
const {renderToStaticMarkup} = await import('react-dom/server');
const menuStart = appPage.indexOf('otherAdminAppNotifications.map((notification) =>');
const menuEnd = appPage.indexOf('))}', menuStart) + 2;
const compiledMenu = ts.transpileModule('function renderMenu(){return <>' + '{' + appPage.slice(menuStart, menuEnd) + '}' + '</>}', {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React}, fileName: 'menu.tsx',
}).outputText;
const renderMenu = new Function('React', 'otherAdminAppNotifications', 'clean', 'openSavedAdminNotificationsFromNotificationCentre', compiledMenu + '\nreturn renderMenu;')(React, alertRows, (value) => String(value ?? '').trim(), openAlert);
const markup = renderToStaticMarkup(renderMenu());
for (const row of alertRows) {
  assert.ok(markup.includes(`data-admin-notification-centre-id="${row.id}"`));
  assert.ok(markup.includes(row.safe_title));
  assert.ok(markup.includes(row.safe_message));
}
assert.equal((markup.match(/role="menuitem"/g) || []).length, 7);
console.log('Admin exact-alert selection and rendered message previews passed');

assert.match(appPage, /bookingsAlertMenuOpen && adminAlertMenuPosition \? createPortal\(/);
assert.match(appPage, /style=\{adminAlertMenuPosition\}/);
assert.match(appPage, /, document\.body\) : null\}/, "The existing menu must escape the horizontally scrolling tab bar");
const positionStart = appPage.indexOf("  useEffect(() => {", appPage.indexOf("const [adminAlertMenuPosition"));
const positionEnd = appPage.indexOf("  const [adminAppNotificationReadRevision", positionStart);
const positionCode = appPage.slice(positionStart, positionEnd);
for (const width of [320, 390, 589, 1280]) {
  let cleanup; let position;
  const listeners = new Map();
  const window = { innerWidth: width, innerHeight: 844, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  const document = { querySelector: () => ({ getBoundingClientRect: () => ({ left: 104, width: 76, bottom: 160 }) }) };
  new Function("useEffect", "bookingsAlertMenuOpen", "setAdminAlertMenuPosition", "window", "document", positionCode)(
    (effect) => { cleanup = effect(); }, true, (next) => { position = next; }, window, document,
  );
  assert.ok(position.left >= 8 && position.left + Math.min(288, width - 16) <= width - 8);
  assert.ok(position.top + position.maxHeight <= 836);
  assert.equal(position.top, 164);
  window.innerWidth = 320; listeners.get("resize")();
  assert.ok(position.left + 288 <= 312);
  cleanup(); assert.equal(listeners.size, 0);
}
console.log("Admin alert menu viewport placement and cleanup passed");

// Execute the existing shared alert presentation used by both menu and feed.
const presentationStart = appPage.indexOf('  const otherAdminAppNotifications =');
const presentationEnd = appPage.indexOf('  const visibleOtherAdminAppNotifications =', presentationStart);
const presentationCode = ts.transpileModule(appPage.slice(presentationStart, presentationEnd), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
}).outputText;
const present = new Function('adminAppNotificationReadState', 'bookings', 'adminBookingPersistenceRecords',
  'clean', 'adminAppNotificationIsNewBookingRequest', 'adminAppNotificationChangeRequestContext',
  presentationCode + '\nreturn otherAdminAppNotifications;');
const clean = value => String(value ?? '').trim();
const locationAlerts = [
  {id:'location-a', workflow_area:'driver_pickup_location_followup', booking_reference:'ADM-TEST-A', safe_title:'Location unavailable', safe_message:'Check with the driver.'},
  {id:'location-b', workflow_area:'driver_pickup_location_followup', booking_reference:'ADM-TEST-B', safe_title:'Check overlapping jobs', safe_message:'Check overlapping assignments.'},
  {id:'ordinary', workflow_area:'driver_issue', booking_reference:'ADM-TEST-A', safe_title:'Driver issue alert', safe_message:'Existing issue'},
];
const records = [
  {booking_reference:'ADM-TEST-A', public_booking_reference:'10901', driver_name:'Alex', passenger_name:'PRIVATE_PASSENGER', driver_payout_amount:800},
  {booking_reference:'ADM-TEST-B', public_booking_reference:'10902', driver_name:'Blair'},
];
const renderAlerts = (rows, loaded, persisted = []) => present({notifications:rows}, loaded, persisted, clean, () => false, () => null);
const original = JSON.stringify([locationAlerts, records]);
const displayed = renderAlerts(locationAlerts, records);
assert.equal(displayed[0].safe_title, 'Location unavailable · Job 10901 · Alex');
assert.equal(displayed[1].safe_title, 'Check overlapping jobs · Job 10902 · Blair');
assert.deepEqual(displayed[2], locationAlerts[2], 'Other workflows must remain unchanged');
assert.equal(JSON.stringify([locationAlerts, records]), original, 'Display enrichment must not mutate saved alerts or bookings');
assert.deepEqual(renderAlerts(locationAlerts, [], records), displayed, 'Existing persisted admin records also resolve exact references');
assert.deepEqual(renderAlerts(locationAlerts, records, records), displayed, 'Matching copies from existing readers agree');
for (const loaded of [[], [records[1]], [records[0], records[0]], [{...records[0], public_booking_reference:''}], [{...records[0], booking_reference:'wrong', id:'ADM-TEST-A', flight_no:'ADM-TEST-A'}]]) {
  assert.equal(renderAlerts([locationAlerts[0]], loaded)[0].safe_title, 'Location unavailable · Job details unavailable');
}
assert.equal(renderAlerts([locationAlerts[0]], [records[0]], [{...records[0], public_booking_reference:'10999'}])[0].safe_title, 'Location unavailable · Job details unavailable', 'Conflicting readers cannot pick a job');
assert.equal(renderAlerts([locationAlerts[0]], [{...records[0], driver_name:''}])[0].safe_title, 'Location unavailable · Job 10901 · Driver TBC');
assert.equal(renderAlerts([{...locationAlerts[0], booking_reference:''}], records)[0].safe_title, 'Location unavailable · Job details unavailable');
const renderedLocationMenu = new Function('React', 'otherAdminAppNotifications', 'clean', 'openSavedAdminNotificationsFromNotificationCentre', compiledMenu + '\nreturn renderMenu;')(React, displayed, clean, openAlert);
const locationMarkup = renderToStaticMarkup(renderedLocationMenu());
for (const row of displayed) assert.ok(locationMarkup.includes(row.safe_title));
assert.ok(!locationMarkup.includes('PRIVATE_PASSENGER') && !locationMarkup.includes('800'));
const titleStart = appPage.indexOf('<h4', appPage.indexOf('data-admin-app-notification-feed-row-id='));
const titleEnd = appPage.indexOf('</h4>', titleStart) + '</h4>'.length;
const cardTitleCode = ts.transpileModule('function cardTitle(title){return ' + appPage.slice(titleStart, titleEnd) + ';}', {
  compilerOptions:{target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.React}, fileName:'card.tsx',
}).outputText;
const cardTitle = new Function('React', cardTitleCode + '\nreturn cardTitle;')(React);
for (const row of displayed) assert.ok(renderToStaticMarkup(cardTitle(row.safe_title)).includes(row.safe_title));
console.log('Location alerts identify their exact job in the existing menu and card; missing/ambiguous records fail closed');
