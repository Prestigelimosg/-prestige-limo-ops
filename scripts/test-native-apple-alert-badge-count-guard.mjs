import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const badgeHelper = read("lib/native-push-badge-count.ts");
const adminPush = read("lib/admin-device-push-notification.ts");
const customerPush = read("lib/customer-device-push-notification.ts");
const driverPush = read("lib/driver-device-push-notification.ts");
const adminNative = read("admin-companion/App.tsx");
const customerNative = read("customer-companion/App.tsx");
const driverNative = read("driver-companion/App.tsx");
const driverNativeOpenRoute = read("app/api/driver-native-job-open/[jobKey]/route.ts");
const migration = read("supabase/migrations/202608250001_native_push_badge_counts.sql");
const ledger = read("docs/current-implementation-ledger.md");

for (const fragment of [
  "reserveNativePushBadgeCount",
  "releaseNativePushBadgeCount",
  "resetNativePushBadgeCount",
  "nativePushBadgeMaximum = 99",
]) {
  assert.ok(badgeHelper.includes(fragment), `Missing shared badge contract: ${fragment}`);
}

for (const [label, source] of [
  ["Admin", adminPush],
  ["Customer", customerPush],
  ["Driver", driverPush],
]) {
  assert.ok(source.includes("reserveNativePushBadgeCount"), `${label} push must reserve an exact device badge`);
  assert.ok(source.includes("releaseNativePushBadgeCount"), `${label} push must roll back a rejected reservation`);
  assert.match(source, /badge:\s*(?:badgeCount|badgeReservation\.count)/, `${label} Expo payload must carry the badge`);
}

for (const [label, source] of [
  ["Admin", adminNative],
  ["Customer", customerNative],
  ["Driver", driverNative],
]) {
  assert.ok(source.includes("Notifications.setBadgeCountAsync(0)"), `${label} app must clear its badge when opened`);
  assert.ok(source.includes("shouldSetBadge: true"), `${label} app must allow the assigned iOS badge`);
}
assert.ok(customerNative.includes("Notifications.getBadgeCountAsync()"));
assert.ok(
  !driverNative.includes("Notifications.getPresentedNotificationsAsync()"),
  "Driver app must not consume and clear a visible badge merely because the app becomes active",
);
assert.ok(
  !driverNative.includes("openLatestBadgeNotification"),
  "Driver app must preserve the visible badge until the exact notification is opened",
);
assert.equal(
  (driverNative.match(/Notifications\.setBadgeCountAsync\(0\)/g) || []).length,
  2,
  "Driver badge may clear only from an explicit live or cold-start notification response",
);
assert.ok(driverNativeOpenRoute.includes("resetDriverNativePushBadgeCount"));

for (const table of [
  "admin_device_push_subscriptions",
  "customer_device_push_subscriptions",
  "driver_device_push_subscriptions",
]) {
  assert.match(migration, new RegExp(`alter table if exists public\\.${table}`));
}
assert.match(migration, /badge_count integer not null default 0/);
assert.match(migration, /badge_count between 0 and 99/);
assert.match(ledger, /Native Apple Alert Badge Counts/);
assert.match(ledger, /Driver Pool Explicit Notification Tap Server Badge Reset/);

console.log("Native Apple Admin, Customer, and Driver alert badge count guard passed.");

// Execute the actual Pool notification response and existing native-open route.
// An icon open / silent refresh must not consume the badge; a visible tap must
// clear the verified caller's persisted counter before the next visible push.
const ts = (await import("typescript")).default;
const { createHash } = await import("node:crypto");
const { createClient } = await import("@supabase/supabase-js");
function evaluate(source, bindings = {}) {
  return new Function(...Object.keys(bindings), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText)(...Object.values(bindings));
}
function compiledModule(source, imports = {}) {
  const compiled = { exports: {} };
  evaluate(source, { module: compiled, exports: compiled.exports, require: (name) => {
    if (name === "server-only") return {};
    assert.ok(name in imports, `Unexpected module ${name}`);
    return imports[name];
  } });
  return compiled.exports;
}
const nativeAst = ts.createSourceFile("App.tsx", driverNative, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let notificationEffect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(nativeAst) === "useEffect" &&
      node.arguments[0]?.getText(nativeAst).includes("const openNotificationData =")) {
    notificationEffect = node.arguments[0].getText(nativeAst);
  }
  ts.forEachChild(node, visit);
}
visit(nativeAst);
assert.ok(notificationEffect);
const nativeStorage = compiledModule(read("driver-companion/src/native-notifications.ts"), {
  "expo-secure-store": {}, "./driver-job-contract.ts": { productionOrigin: "https://app.prestigelimo.sg" },
});
const nativeBadge = compiledModule(badgeHelper);
const offerKey = "a".repeat(64);
const pushAst = ts.createSourceFile("push.ts", driverPush, ts.ScriptTarget.Latest, true);
const payloadFunction = pushAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "driverPoolOfferPayload");
assert.ok(payloadFunction);
const poolKey = evaluate(`${payloadFunction.getText(pushAst)}; return driverPoolOfferPayload(offerKey, "synthetic").job_key;`, {
  createHash, offerKey, driverDevicePushNotificationVersion: 1,
});
const contract = compiledModule(read("driver-companion/src/driver-job-contract.ts"));
const bridge = compiledModule(read("driver-companion/src/driver-webview-bridge.ts"), { "./driver-job-contract.ts": contract });
const installationId = "11111111-1111-4111-8111-111111111111";
const callbackRuns = [];
for (const mode of ["warm", "cold", "silent", "ordinary-open"]) {
  let screen = { navigationKey: 0 }, osBadge = 6, responseHandler, receivedHandler, cacheCleared = 0;
  const refs = { currentWebViewUrlRef: { current: "" }, webViewRequestHeadersRef: { current: {} } };
  const notification = { request: { content: { data: { job_key: poolKey, open_target: "available_jobs" } } } };
  const effect = evaluate(`return (${notificationEffect});`, {
    ...nativeStorage, ...refs, installationId, productionOrigin: "https://app.prestigelimo.sg",
    loadNativeDriverJob: async () => { throw Error("Pool must not resolve a private Job Link"); },
    receiveDriverJobUrl: async () => { throw Error("Pool must not open a private Job Link"); },
    setCanGoBack() {}, setScreen(update) { screen = update(screen); },
    Notifications: {
      setBadgeCountAsync: async (count) => { osBadge = count; return true; },
      addNotificationResponseReceivedListener(handler) { responseHandler = handler; return { remove() {} }; },
      addNotificationReceivedListener(handler) { receivedHandler = handler; return { remove() {} }; },
      getLastNotificationResponse() { return mode === "cold" ? { notification } : null; },
      clearLastNotificationResponse() { cacheCleared++; },
    },
  });
  const cleanup = effect();
  if (mode === "warm") responseHandler({ notification });
  if (mode === "silent") receivedHandler({ request: { content: { data: { ...notification.request.content.data, driver_pool_refresh: true } } } });
  await new Promise((resolve) => setImmediate(resolve));
  if (mode === "warm" || mode === "cold") {
    assert.equal(osBadge, 0);
    assert.equal(screen.jobUrl, `https://app.prestigelimo.sg/api/driver-native-job-open/${poolKey}`,
      "A visible Pool notification tap must pass through the authenticated server badge reset");
    assert.equal(refs.webViewRequestHeadersRef.current["x-prestige-driver-installation-id"], installationId);
    assert.equal(refs.webViewRequestHeadersRef.current["x-prestige-driver-purpose"], "driver-native-job-open");
    assert.equal(refs.webViewRequestHeadersRef.current["x-prestige-driver-open-target"], "available_jobs");
    assert.ok(bridge.shouldAllowDriverWebViewNavigation(screen.jobUrl, screen.jobUrl));
    assert.ok(bridge.shouldAllowDriverWebViewNavigation("https://app.prestigelimo.sg/driver-portal?view=available-jobs", screen.jobUrl));
    callbackRuns.push({ screen, headers: refs.webViewRequestHeadersRef.current });
  } else {
    assert.equal(osBadge, 6, `${mode} must preserve OS badge`);
    assert.equal(screen.jobUrl, mode === "silent" ? "https://app.prestigelimo.sg/driver-portal?view=available-jobs" : undefined);
    assert.deepEqual(refs.webViewRequestHeadersRef.current, {});
  }
  assert.equal(cacheCleared, mode === "cold" ? 1 : 0);
  cleanup();
}

for (const scenario of ["owned-pending", "owned-assigned", "owned-cancelled", "owned-expired", "foreign", "wrong-key", "unknown", "malformed-join", "read-error", "reset-error", "invalid-session", "wrong-installation", "no-purpose", "cross-origin", "invalid-target", "duplicate-target", "extra-param", "malformed-key", "private-link"]) {
  const state = { count: 6, calls: [], accountChecks: 0 };
  const fetcher = async (input, options) => {
    const request = new Request(input, options);
    const url = new URL(request.url);
    state.calls.push({ path: url.pathname, method: request.method, params: url.searchParams });
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (url.pathname.endsWith("/driver_job_bids")) {
      assert.equal(request.method, "GET");
      assert.equal(url.searchParams.get("driver_reference"), "eq.30");
      assert.equal(url.searchParams.get("select"), "driver_reference,driver_job_bid_offers!inner(offer_key)");
      assert.equal(url.searchParams.get("limit"), "1000");
      assert.deepEqual([...url.searchParams.keys()].sort(), ["driver_reference", "limit", "order", "select"]);

      if (scenario === "read-error") return reply({ message: "synthetic read error" }, 500);
      if (scenario === "unknown") return reply([]);
      const row = { driver_reference: scenario === "foreign" ? "31" : "30", driver_job_bid_offers: { offer_key: scenario === "wrong-key" ? "c".repeat(64) : offerKey } };
      if (scenario === "malformed-join") row.driver_job_bid_offers = [{ offer_key: offerKey }];
      return reply([row]);
    }
    if (url.pathname.endsWith("/driver_device_push_subscriptions")) {
      assert.equal(request.method, "PATCH");
      assert.equal(url.searchParams.get("driver_id"), "eq.30");
      assert.equal(url.searchParams.get("source_surface"), "eq.driver_native_ios");
      assert.equal(url.searchParams.get("subscription_status"), "eq.active");
      const body = await request.json();
      assert.equal(body.badge_count, 0);
      assert.deepEqual(Object.keys(body).sort(), ["badge_count", "updated_at"]);
      if (scenario === "reset-error") return reply({ message: "synthetic update error" }, 500);
      state.count = 0;
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/driver_job_links") && scenario === "private-link") return reply([]);
    throw Error(`Unexpected database request ${request.method} ${url.pathname}`);
  };
  const client = createClient("https://synthetic.invalid", "synthetic-key", { global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false } });
  const route = compiledModule(driverNativeOpenRoute, {
    "node:crypto": { createHash },
    "../../../../lib/driver-account-device-lock": { verifyDriverAccountSession: async (input) => {
      state.accountChecks++;
      assert.equal(input.driverId, 30);
      return input.installationId === installationId;
    } },
    "../../../../lib/driver-device-push-notification": { opaqueDriverJobLinkKey: () => "b".repeat(64) },
    "../../../../lib/driver-job-link": { hashDriverJobLinkToken() {}, isDriverJobLinkExpired() {}, isDriverJobLinkExpiryOutsideAllowedWindow() {} },
    "../../../../lib/driver-job-status-persistence": { getDriverJobStatusPersistenceClientForProduction: () => ({ ok: true, client }) },
    "../../../../lib/driver-native-job-handoff": { openDriverNativeJobHandoff() {} },
    "../../../../lib/native-push-badge-count": nativeBadge,
    "../../../../lib/driver-portal-session": { resolveDriverPortalSession: () => scenario === "invalid-session" ? { ok: false, reason: "invalid" } : { ok: true, claims: { driverId: 30, accountId: "synthetic-account", deviceIdHash: "synthetic-device", issuedAt: 1 } } },
  });
  const key = scenario === "malformed-key" ? "invalid" : poolKey;
  const query = scenario === "extra-param" ? "?driver_id=31" : "";
  const headers = { ...callbackRuns[0].headers, cookie: "synthetic-session" };
  if (scenario === "private-link") delete headers["x-prestige-driver-open-target"];
  if (scenario === "invalid-target") headers["x-prestige-driver-open-target"] = "messages";
  if (scenario === "duplicate-target") headers["x-prestige-driver-open-target"] = "available_jobs, available_jobs";
  if (scenario === "no-purpose") delete headers["x-prestige-driver-purpose"];
  if (scenario === "wrong-installation") headers["x-prestige-driver-installation-id"] = "different-phone";
  if (scenario === "cross-origin") headers.origin = "https://foreign.invalid";
  const result = await route.GET(new Request(`https://app.prestigelimo.sg/api/driver-native-job-open/${key}${query}`, { headers }), { params: Promise.resolve({ jobKey: key }) });
  const owned = scenario.startsWith("owned-");
  assert.equal(state.count, owned ? 0 : 6, `${scenario} counter`);
  if (owned || ["foreign", "wrong-key", "unknown", "malformed-join", "read-error", "reset-error"].includes(scenario)) {
    assert.equal(result.status, 302, "Badge evidence/failure must not block safe Available Jobs navigation");
    assert.equal(result.headers.get("location"), "https://app.prestigelimo.sg/driver-portal?view=available-jobs");
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(result.headers.get("referrer-policy"), "no-referrer");
    assert.equal(await result.text(), "");
  } else {
    assert.ok([401, 404].includes(result.status));
  }
  const updates = state.calls.filter((call) => call.method === "PATCH");
  assert.equal(updates.length, owned || scenario === "reset-error" ? 1 : 0);
  if (owned) {
    const badgeClient = { from() {
      let update;
      return { select() { return this; }, eq() { return this; }, update(body) { update = body; return this; }, async maybeSingle() {
        if (update) state.count = update.badge_count;
        return { data: { id: installationId, badge_count: state.count }, error: null };
      } };
    } };
    const next = await nativeBadge.reserveNativePushBadgeCount(badgeClient, { table: "driver_device_push_subscriptions", tokenColumn: "endpoint", token: "synthetic-token" });
    assert.equal(next.count, 1, "The next visible alert must restart at one after a valid tap");
  }
}
console.log("Driver Pool native badge tap guard passed: warm/cold taps reset the exact caller, silent/icon opens preserve badges, failures preserve safe navigation, next count is one.");
