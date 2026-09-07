import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const pagePath = "app/my-bookings/page.tsx";
const adapterPath = "lib/customer-portal-trip-updates-adapter.ts";
const savedBookingsAdapterPath = "lib/customer-portal-saved-bookings-adapter.ts";
const persistencePath = "lib/customer-driver-app-notification-persistence.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const migrationPath =
  "supabase/migrations/20260906162227_customer_notification_centre_atomic_dismiss.sql";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardPath = "scripts/test-customer-notification-centre-guard.mjs";

function includes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function excludes(source, pattern, label) {
  assert.equal(pattern.test(source), false, `${label} must stay excluded.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n## ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [page, adapter, savedBookingsAdapter, persistence, ledger, migration, suite] = await Promise.all(
  [
    pagePath,
    adapterPath,
    savedBookingsAdapterPath,
    persistencePath,
    ledgerPath,
    migrationPath,
    suitePath,
  ].map((path) =>
    readFile(path, "utf8"),
  ),
);

function evaluateTs(source, bindings = {}) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
}
const nativeExports = {};
evaluateTs(await readFile("customer-companion/src/customer-navigation.ts", "utf8"), { exports: nativeExports });
const pageAst = ts.createSourceFile(pagePath, page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let openHandler;
let refreshHandler;
let detailScrollEffect;
function findOpenHandler(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "openCustomerNotificationBooking") openHandler = node.getText(pageAst);
  if (ts.isVariableDeclaration(node) && node.name.getText(pageAst) === "refreshCustomerPortalSavedBookings") {
    refreshHandler = node.initializer.arguments[0].getText(pageAst);
  }
  if (ts.isCallExpression(node) && node.expression.getText(pageAst) === "useEffect" &&
      node.arguments[0]?.getText(pageAst).includes("pendingManualDetailScrollIdRef.current !== expandedBookingId")) {
    detailScrollEffect = node.arguments[0].getText(pageAst);
  }
  ts.forEachChild(node, findOpenHandler);
}
findOpenHandler(pageAst);
assert.ok(detailScrollEffect);
for (const [alert, loaded, expected] of [[false, false, "detail"], [true, false, null], [true, true, "trip-updates"]]) {
  const selections = [];
  const pending = { current: "saved-VIEW-026" };
  const alertPending = { current: alert };
  const effect = evaluateTs(`return (${detailScrollEffect});`, {
    expandedBookingId: "saved-VIEW-026",
    pendingManualDetailScrollIdRef: pending,
    pendingAlertMessageScrollRef: alertPending,
    tripUpdatesByBookingId: loaded ? { "saved-VIEW-026": { status: "ready", updates: [] } } : {},
    document: { querySelector(selector) { return { scrollIntoView() { selections.push(selector); } }; } },
    window: { requestAnimationFrame(callback) { callback(); return 1; }, cancelAnimationFrame() {} },
  });
  effect();
  assert.deepEqual(selections, expected ? [`[data-customer-portal-${expected}="saved-VIEW-026"]`] : [],
    "Alert taps wait for the existing message result and scroll to Trip Updates; manual View details keeps its destination");
}

// Execute the real reload callback: page/scope resolution must survive the
// installed app's intentionally limited URL contract without trusting URL IDs.
assert.ok(refreshHandler);
async function resolveAlert({ selected = null, candidates = [null], explicit = null, match = null, abort = false, checking = false, resetView = true, retryAfterFailure = false } = {}) {
  const calls = [];
  const resolved = { current: null };
  const pageRef = { current: resetView ? 1 : 2 };
  const scopeRef = { current: selected };
  const controller = new AbortController();
  let loadCount = 0;
  const setters = Object.fromEntries([
    "setPortalBookingsLoadState", "setSelectedManagedBossId", "setCustomerNotificationCentreOpen",
    "setCustomerNotificationNavigationMessage", "setPortalBookings", "setExpandedBookingId",
    "setChangeFeedback", "setChangeRequestDraft", "setDriverTrackingByBookingId",
    "setCheckingDriverTrackingId", "setActiveTrackingBookingId", "setTripUpdatesByBookingId",
    "setCheckingTripUpdatesId", "setDeepLinkApplied", "setBookingPages", "setSelectedBookingMonths",
  ].map((name) => [name, (value) => calls.push([name, value])]));
  const refresh = evaluateTs(`return (${refreshHandler});`, {
    ...setters,
    customerPrincipalAccess: { status: checking ? "checking" : "principal", managed_bosses: candidates.filter(Number.isInteger).map((traveler_id) => ({ traveler_id })) },
    customerNotificationTravelerIds: candidates,
    selectedManagedBossId: selected,
    resolvedCustomerAlertTargetRef: resolved,
    portalSavedBookingsServerPageRef: pageRef,
    portalSavedBookingsTravelerIdRef: scopeRef,
    initialBookingPages: {}, initialSelectedBookingMonths: {},
    readCustomerPortalBookingDeepLink: () => ({ bookingReference: "99126", savedPage: 1, travelerId: explicit, tracking: true }),
    clearCustomerPortalBookingDeepLink: () => calls.push(["clear"]),
    findCustomerPortalSavedBooking: async ({ travelerId, publicBookingReference }) => {
      calls.push(["find", travelerId, publicBookingReference]);
      if (abort) controller.abort();
      return match?.travelerId === travelerId ? { page: match.page, booking: { publicBookingReference } } : null;
    },
    loadCustomerPortalSavedBookings: async ({ page, travelerId }) => {
      calls.push(["load", page, travelerId]);
      if (retryAfterFailure && loadCount++ === 0) return null;
      return [{ publicBookingReference: "99126" }];
    },
  });
  await refresh({ resetView, signal: controller.signal });
  if (retryAfterFailure) await refresh({ resetView: false, signal: controller.signal });
  return { calls, resolved: resolved.current, page: pageRef.current, scope: scopeRef.current };
}
for (const page of [1, 2, 5]) {
  const result = await resolveAlert({ match: { travelerId: null, page } });
  assert.deepEqual(result.calls.filter(([name]) => name === "load"), [["load", page, null]]);
  assert.equal(result.resolved.savedPage, page);
  assert.equal(result.page, page);
}
const switchBoss = await resolveAlert({ selected: 77, candidates: [77, 78], match: { travelerId: 78, page: 2 } });
assert.deepEqual(switchBoss.calls.filter(([name]) => name === "find"), [["find", 77, "99126"], ["find", 78, "99126"]]);
assert.ok(switchBoss.calls.some(([name, value]) => name === "setSelectedManagedBossId" && value === 78));
assert.equal(switchBoss.calls.some(([name]) => name === "load"), false, "Old scope must not load the matched page before the verified scope changes");
const switched = await resolveAlert({ selected: 78, candidates: [78, 77], match: { travelerId: 78, page: 2 } });
assert.deepEqual(switched.calls.filter(([name]) => name === "load"), [["load", 2, 78]]);
assert.equal(switched.resolved.travelerId, 78);
for (const options of [{}, { selected: 77, candidates: [77], explicit: 999, match: { travelerId: 999, page: 2 } }]) {
  const missing = await resolveAlert(options);
  assert.equal(missing.resolved, null);
  assert.ok(missing.calls.some(([name]) => name === "clear"));
  assert.ok(missing.calls.some(([name, value]) => name === "setCustomerNotificationCentreOpen" && value));
  assert.equal(missing.calls.some(([name, value]) => name === "find" && value === 999), false);
}
const aborted = await resolveAlert({ abort: true, match: { travelerId: null, page: 2 } });
assert.equal(aborted.resolved, null);
assert.equal(aborted.calls.some(([name]) => name === "load" || name === "setSelectedManagedBossId"), false);
assert.deepEqual((await resolveAlert({ checking: true })).calls, []);
const foreground = await resolveAlert({ resetView: false });
assert.equal(foreground.calls.some(([name]) => name === "find" || name === "clear"), false);
assert.deepEqual(foreground.calls.filter(([name]) => name === "load"), [["load", 2, null]]);
const retry = await resolveAlert({ match: { travelerId: null, page: 5 }, retryAfterFailure: true });
assert.deepEqual(retry.calls.filter(([name]) => name === "load"), [["load", 5, null], ["load", 5, null]], "Transient page failure must retry the resolved page");
assert.ok(openHandler);
for (const [root, travelerId, targetPage] of [[true, null, 1], [true, null, 2], [false, 78, 2]]) {
  let destination = "";
  let lookups = 0;
  const open = evaluateTs(`${openHandler}\nreturn openCustomerNotificationBooking;`, {
    customerPrincipalAccess: { status: "principal", booker_root: root, managed_bosses: [{ traveler_id: 78 }] },
    selectedManagedBossId: travelerId,
    customerNotificationTravelerIds: [travelerId],
    setCustomerNotificationOpeningReference() {}, setCustomerNotificationNavigationMessage() {}, setCustomerNotificationCentreOpen() {},
    findCustomerPortalSavedBooking: async () => { lookups++; return { booking: { publicBookingReference: "99126" }, page: targetPage }; },
    window: { location: { origin: "https://app.prestigelimo.sg", assign(url) { destination = new URL(url, this.origin).toString(); } } },
  });
  await open("99126");
  assert.equal(lookups, 0, "Resolve the booking once after navigation, not before and after");
  assert.equal(nativeExports.shouldAllowCustomerWebViewNavigation(destination), true,
    `Actual alert handler must produce a URL accepted by the unchanged installed Customer navigation policy (page ${targetPage})`);
}

for (const fragment of [
  "loadCustomerNotificationCentre",
  "customerNotificationCentreOpen",
  'data-customer-notification-centre-trigger="true"',
  'aria-controls="customer-notification-centre"',
  'data-customer-notification-centre="true"',
  'id="customer-notification-centre"',
  'data-customer-notification-centre-clear="true"',
  'aria-label="Clear current alerts"',
  "clearCustomerNotificationCentre",
  "customerNotificationCentreRequestSequenceRef",
  "requestSequence !== customerNotificationCentreRequestSequenceRef.current",
  "Clearing...",
  'data-customer-notification-purpose="booking-update"',
  "Current alerts",
  "Booking {alert.publicBookingReference}",
  "No current alerts.",
  "Customer alerts are temporarily unavailable. Refresh before relying on this count.",
  "customerNotificationTime(alert.createdAt)",
  "void openCustomerNotificationBooking(alert.publicBookingReference)",
  'nextUrl.searchParams.set("booking", publicBookingReference)',
  'nextUrl.searchParams.set("tracking", "1")',
  "resolvedCustomerAlertTargetRef",
  "customerNotificationTravelerIds",
  "savedPage: target.page, travelerId",
  "findCustomerPortalSavedBooking",
  "clearCustomerPortalBookingDeepLink",
  "portalSavedBookingsServerPageRef.current = 1",
  "refreshCustomerPortalSavedBookings({ signal: new AbortController().signal })",
  "deepLink.travelerId !== selectedManagedBossId",
  "portalSavedBookingsTravelerIdRef.current = selectedManagedBossId",
  "portalSavedBookingsServerPageRef.current !== deepLink.savedPage",
  "portalSavedBookingsTravelerIdRef.current !== selectedManagedBossId",
]) {
  includes(page, fragment, `Customer notification centre UI ${fragment}`);
}

for (const fragment of [
  "export async function findCustomerPortalSavedBooking",
  'params.set("page", String(page))',
  'params.set("traveler_id", String(travelerId))',
  "hasNextPage",
  "publicBookingReference",
]) {
  includes(savedBookingsAdapter, fragment, `Customer saved-booking exact-alert lookup ${fragment}`);
}

const notificationOpenSource = page.slice(
  page.indexOf("async function openCustomerNotificationBooking"),
  page.indexOf("return (", page.indexOf("async function openCustomerNotificationBooking")),
);
const bossSelectorSource = page.slice(page.indexOf('data-customer-managed-boss-selector="true"'), page.indexOf('</select>', page.indexOf('data-customer-managed-boss-selector="true"')));
assert.match(bossSelectorSource, /clearCustomerPortalBookingDeepLink\(\);[\s\S]*?resolvedCustomerAlertTargetRef\.current = null;[\s\S]*?setSelectedManagedBossId/,
  "Manual Boss selection must clear the prior alert target before loading its chosen scope");
const alertDetailEffect = page.slice(page.indexOf("const requestedDeepLink = readCustomerPortalBookingDeepLink()"), page.indexOf("async function openCustomerNotificationBooking"));
assert.match(alertDetailEffect, /pendingManualDetailScrollIdRef\.current = targetBooking\.id;\s*setExpandedBookingId\(targetBooking\.id\)/,
  "Alert detail must reuse the existing post-render detail scroll effect, not a timer before React commits the panel");
excludes(notificationOpenSource, /nextUrl\.searchParams\.set\("(?:saved_page|traveler_id)"/, "Installed Customer navigation query contract");
excludes(
  notificationOpenSource,
  /verified_boss_name|passengerName|companyName|bookerName/i,
  "Customer notification exact-booking lookup identity inference",
);

assert.match(
  page,
  /customerNotificationCentreStatus === "ready"\s*\? String\(customerNotificationCentreCount\)\s*:\s*customerNotificationCentreCount > 0\s*\? `\$\{customerNotificationCentreCount\}\+`\s*:\s*"\?"/,
  "Unavailable Customer alert reads must never claim a complete zero count.",
);
assert.match(
  page,
  /portalBookingsLoadState !== "ready"[\s\S]*?return;[\s\S]*?refreshCustomerNotificationCentre\(\{ signal: controller\.signal \}\)/,
  "Customer alert reads must run only after the authenticated booking lane is ready.",
);

for (const fragment of [
  "export type CustomerNotificationCentreAlert",
  "export type CustomerNotificationCentreResult",
  "export async function loadCustomerNotificationCentre",
  "export async function dismissCustomerNotificationCentre",
  'params.set("view", "centre")',
  'method: "PATCH"',
  '"x-prestige-customer-purpose": "customer-in-app-notification-read"',
  '"x-prestige-customer-purpose": "customer-in-app-notification-dismiss"',
  'credentials: "same-origin"',
  'cache: "no-store"',
  'record.delivery_surface !== "customer_app"',
  "record.external_send !== false",
  "record.provider_send !== false",
]) {
  includes(adapter, fragment, `Customer notification centre adapter ${fragment}`);
}

for (const fragment of [
  '"view"',
  'requestUrl.searchParams.get("view") === "centre"',
  "loadCustomerNotificationCentreForBoundary",
  "dismissCustomerNotificationCentreForAuthenticatedRuntime",
  "dismissCustomerNotificationCentreForBoundary",
  "loadCustomerNotificationCentreRowsSnapshot",
  "const firstSnapshot = await loadCustomerNotificationCentreRowsSnapshot",
  "const secondSnapshot = await loadCustomerNotificationCentreRowsSnapshot",
  "secondSnapshot.data[index]?.id !== id",
  'eq("delivery_surface", "customer_app")',
  'eq("notification_status", "queued")',
  '"dismiss_customer_notification_centre"',
  "{ p_notification_ids: exactNotificationIds }",
  "rpcRow.updated_ids",
  "rpcRow.updated_count",
  '.select(notificationSelect, { count: "exact" })',
  ".or(intendedDriverHistoryScope)",
  ".or(driverLinkNotificationScope)",
  ".range(offset, offset + params.limit - 1)",
  "const uniqueRecords = new Map",
  '.in("booking_reference", bookingReferenceBatch)',
  '.order("id", { ascending: false })',
  '.gt("booking_reference", bookingReferenceCursor)',
  '.gte("pickup_at", customerPortalHistoryWindowStartIso())',
  '.lt("id", notificationIdCursor)',
  ".limit(customerNotificationCentrePageSize)",
  '{ column: "company_id", value: membership.company_id }',
  '{ column: "booker_id", value: membership.booker_id }',
  'filters.push({ column: "traveler_id", value: membership.traveler_id })',
  'value: activeAccessAccount.data.customer_account_reference',
  "public_booking_reference",
  "notification_count",
  "alert_count",
  'delivery_surface: "customer_app"',
  "external_send: false",
  "provider_send: false",
]) {
  includes(persistence, fragment, `Customer notification centre persistence ${fragment}`);
}

for (const fragment of [
  "create or replace function public.dismiss_customer_notification_centre",
  "p_notification_ids uuid[]",
  "returns table (updated_ids uuid[], updated_count bigint)",
  "security invoker",
  "set search_path = ''",
  "update public.customer_driver_app_notification_outbox as notification",
  "notification.delivery_surface = 'customer_app'",
  "notification.notification_status = 'queued'",
  "notification.id = any(coalesce(p_notification_ids, array[]::uuid[]))",
  "returning notification.id",
  "array_agg(updated.id order by updated.id)",
  "count(*)::bigint as updated_count",
  "revoke execute on function public.dismiss_customer_notification_centre(uuid[]) from public",
  "revoke execute on function public.dismiss_customer_notification_centre(uuid[]) from anon",
  "revoke execute on function public.dismiss_customer_notification_centre(uuid[]) from authenticated",
  "grant execute on function public.dismiss_customer_notification_centre(uuid[]) to service_role",
]) {
  includes(migration, fragment, `Customer notification centre atomic-dismiss migration ${fragment}`);
}
excludes(migration, /security\s+definer/i, "Customer notification centre RPC privilege mode");
excludes(
  migration,
  /\b(?:create|alter|drop)\s+table\b|\bcreate\s+(?:unique\s+)?index\b|\bdelete\s+from\b|\binsert\s+into\b|\btruncate\b/i,
  "Customer notification centre migration unrelated DDL/DML",
);

const centreSource = page.slice(
  page.indexOf('data-customer-notification-centre="true"'),
  page.indexOf("companyContactLines.length > 0"),
);
excludes(
  centreSource,
  /customer price|driver payout|paynow|billing|invoice amount|internal admin note|parser debug|raw token/i,
  "Customer notification centre rendered privacy boundary",
);

const ledgerSection = sectionBetween(
  ledger,
  "## Customer My Bookings Current-Alert Purpose Centre (source checkpoint 2026-09-06)",
);
for (const phrase of [
  "one compact `Alerts N` control",
  "verified Company + Booker account",
  "existing `/api/customer-app-notifications` GET route",
  "one tiny `Clear` control",
  "POST body of one service-role-only `SECURITY INVOKER` RPC",
  "exact booking and current-link eligibility",
  "Defensive exact-ID dedupe",
  "older in-flight read cannot restore stale alerts",
  "keeps Trip Updates history",
  "Production Supabase project `kvvsguhklmfgkebhxatm`",
  "recorded as migration `20260906162227`",
  "SHA-256 0621c63983f2a1f4563fe391e8d1cd986a49b438407cba8f7a66ba9dd4a3d3c8",
  "`updated_count = 0`",
  "outbox remained at 163 rows",
  "No Expo OTA, EAS build, Apple/TestFlight action",
  "`scripts/test-customer-notification-centre-guard.mjs`",
]) {
  includes(ledgerSection, phrase, `Customer notification centre ledger ${phrase}`);
}
excludes(
  ledgerSection,
  /Production application remains a separate owner-approved action-time gate/,
  "Customer notification centre ledger superseded Production gate",
);

includes(suite, guardPath, "Customer notification centre preactivation registration");

console.log("Customer notification centre guard passed");
