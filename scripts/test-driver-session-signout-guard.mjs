import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

// Execute the real portal component with deterministic hook state. No effects,
// network, credentials, native bridge or database are allowed in this proof.
const pagePath = "app/driver-portal/page.tsx";
const source = fs.readFileSync(pagePath, "utf8");
function load(file, imports, globals = {}) {
  const loaded = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", ...Object.keys(globals), js)(name => {
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  }, loaded, loaded.exports, ...Object.values(globals));
  return loaded.exports;
}
function harness(readState, transport) {
  let cursor = 0;
  const slots = [];
  const requests = [], navigations = [];
  const jsx = (type, props) => ({ type, props });
  const hook = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = index === 0 ? readState : initial;
    return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  };
  const react = {
    useState: hook,
    useRef: initial => hook({ current: initial })[0],
    useCallback: callback => callback,
    useEffect: () => {},
    useSyncExternalStore: (_subscribe, _snapshot, serverSnapshot) => serverSnapshot(),
  };
  const forbidden = () => { throw Error("Unrelated effect attempted"); };
  const page = load(pagePath, {
    "react/jsx-runtime": { jsx, jsxs: jsx }, react,
    "next/link": { default: "a" },
    "../store-review-sign-in": { StoreReviewSignIn: "review-sign-in", StoreReviewSessionNotice: "review-notice" },
    "../../lib/driver-activity-client": { reportDriverActivity: forbidden },
    "../driver-job/driver-combo-trips": { DriverComboTrips: "combo-trips" },
    "./driver-account-setup": { DriverAccountSetup: "account-setup", nativeAccountSetupState: forbidden },
    "@/app/public-app-build-marker": { PublicAppBuildMarker: "build-marker" },
    "../android-app-update": { AndroidAppUpdate: "android-update" },
  }, {
    fetch: async (url, options) => { requests.push({ url, options }); return transport(url, options); },
    window: { location: { assign: url => navigations.push(url) }, ReactNativeWebView: { postMessage: forbidden } },
    navigator: {},
  }).default;
  return { render() { cursor = 0; return page(); }, requests, navigations };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
const ready = { kind: "ready", accountSession: true, reviewSession: false, alertsAvailable: false, alertCount: 0, jobs: [] };
const control = h => nodes(h.render()).find(n => n.props?.["data-driver-account-sign-out"] === "true");
const success = () => ({ ok: true, json: async () => ({ ok: true, session: "ended" }) });
const ordinary = harness(ready, success);
assert.ok(control(ordinary), "Ordinary Driver account needs its existing session logout control");
assert.equal(nodes(ordinary.render()).filter(n => n.props?.["data-driver-account-sign-out"] === "true").length, 1);
for (const state of [{ kind: "loading" }, { kind: "blocked", reason: "unauthorized" },
  { ...ready, accountSession: false }, { ...ready, accountSession: false, reviewSession: true }]) {
  assert.equal(control(harness(state, success)), undefined, "Do not add ordinary logout to other sessions");
}
let complete;
const pending = harness(ready, () => new Promise(resolve => { complete = resolve; }));
const click = control(pending).props.onClick;
const first = click();
await click();
assert.equal(pending.requests.length, 1, "Rapid clicks must send one logout");
assert.equal(control(pending).props.disabled, true);
complete(success());
await first;
assert.deepEqual(pending.navigations, ["/driver-portal"]);
assert.equal(pending.requests[0].url, "/api/driver-auth/session");
assert.equal(pending.requests[0].options.method, "DELETE");
assert.equal(pending.requests[0].options.credentials, "same-origin");
assert.equal(pending.requests[0].options.headers["x-prestige-driver-purpose"], "driver-account-sign-out");
assert.equal(pending.requests[0].options.body, undefined);
for (const transport of [() => ({ ok: false, json: async () => ({ ok: false }) }),
  () => ({ ok: true, json: async () => ({ ok: false }) }),
  () => ({ ok: true, json: async () => { throw Error("invalid response"); } }),
  () => { throw Error("offline"); }]) {
  const failed = harness(ready, transport);
  await control(failed).props.onClick();
  assert.deepEqual(failed.navigations, [], "Failed logout must not navigate");
  assert.equal(control(failed).props.disabled, false);
  assert.ok(nodes(failed.render()).some(n => n.props?.role === "alert" && String(n.props.children).includes("Could not sign out")));
}

// Execute the unchanged server logout: only optional activity and cookie clearing.
let activity = [], cookieClears = 0, databaseOK = true, failActivity = false;
const route = load("app/api/driver-auth/session/route.ts", {
  "../../../../lib/store-review-access": { storeReviewAuthResponse: () => null, resolveStoreReviewSession: () => ({ state: "absent" }) },
  "../../../../lib/driver-account-device-lock.ts": {},
  "../../../../lib/driver-account-activity": { recordDriverAccountActivity: async (_client, _claims, event) => { activity.push(event); if (failActivity) throw Error("offline"); } },
  "../../../../lib/driver-job-status-persistence": { getDriverJobStatusPersistenceClientForProduction: () => ({ ok: databaseOK, client: {} }) },
  "../../../../lib/driver-portal-session.ts": { resolveDriverPortalSession: () => ({ ok: true, claims: {} }), clearDriverPortalSessionCookie: () => { cookieClears++; return "synthetic_session=; Max-Age=0"; } },
});
const request = (purpose = "driver-account-sign-out", referer = "https://synthetic.invalid/driver-portal") => new Request("https://synthetic.invalid/api/driver-auth/session", { method: "DELETE", headers: { origin: "https://synthetic.invalid", referer, "x-prestige-driver-purpose": purpose } });
for (const bad of [request("wrong"), request(undefined, "https://foreign.invalid/driver-portal"), request(undefined, "https://synthetic.invalid/customers")]) {
  assert.equal((await route.DELETE(bad)).status, 401);
}
assert.equal(cookieClears, 0);
assert.deepEqual(activity, []);
for (const mode of ["normal", "activity-failed", "database-unavailable"]) {
  failActivity = mode === "activity-failed"; databaseOK = mode !== "database-unavailable";
  const response = await route.DELETE(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
}
assert.deepEqual(activity, ["signed_out", "signed_out"]);
assert.equal(cookieClears, 3);
assert.match(source, /data-driver-notification-centre-trigger="true"/, "Existing Alerts control remains");
console.log("PASS Driver session-only Sign out: actual component visibility, one request, errors, navigation; existing API origin/purpose, activity and cookie boundaries. No live calls.");
