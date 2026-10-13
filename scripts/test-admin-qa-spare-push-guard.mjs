import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const root = path.join(process.cwd(), ".tmp-admin-qa-spare-push-guard");
const source = await readFile("lib/admin-device-push-notification.ts", "utf8");
const adapter = await readFile("lib/driver-job-link-production.ts", "utf8");
await mkdir(path.join(root, "node_modules/@supabase/supabase-js"), { recursive: true });
await writeFile(path.join(root, "node_modules/@supabase/supabase-js/index.js"),
  "exports.createClient=()=>globalThis.__QA_ADMIN_CLIENT;");
await writeFile(path.join(root, "native-push-badge-count.js"),
  "exports.resetNativePushBadgeCount=async()=>false;exports.reserveNativePushBadgeCount=async()=>null;exports.releaseNativePushBadgeCount=async()=>false;");
await writeFile(path.join(root, "helper.cjs"), ts.transpileModule(source.replace('import "server-only";', ""), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText);
try {
  const helper = createRequire(import.meta.url)(path.join(root, "helper.cjs"));
  const mainId = "11111111-1111-4111-8111-111111111111";
  const spareId = "22222222-2222-4222-8222-222222222222";
  const hash = value => createHash("sha256").update(value).digest("hex");
  const actor = { actor_label: "Owner Admin", actor_role: "admin" };
  const row = (id, qa = false) => ({ endpoint: `ExpoPushToken[${id.replaceAll("-", "")}]`,
    device_label: `admin-native-ios${qa ? "-qa" : ""}:${id}`, actor_label: actor.actor_label,
    source_surface: "admin_native_ios", p256dh: "native_expo_push_token", auth: "native_expo_push_token" });
  const main = row(mainId), spare = row(spareId, true);
  const policy = { installationHash: hash(spareId), bookingReference: "11147",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
  const baseEnv = { PRESTIGE_ADMIN_DEVICE_PUSH_ENABLED: "true",
    PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PUBLIC_KEY: "fake-public-key-for-guard",
    PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PRIVATE_KEY: "fake-private-key-for-guard",
    PRESTIGE_ADMIN_DEVICE_PUSH_CONTACT_EMAIL: "ops@example.test", SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key-for-guard" };
  const env = { ...baseEnv, PRESTIGE_ADMIN_QA_PUSH_POLICY: JSON.stringify(policy) };
  function client(plans, captures = {}) {
    return { from(table) {
      assert.equal(table, "admin_device_push_subscriptions");
      const chain = { select() { return chain; },
        eq(k,v) { (captures.filters ||= []).push([k,v]); return chain; },
        in(k,v) { (captures.filters ||= []).push([k,v]); return chain; },
        limit() { assert.ok(plans.length, "Unexpected query"); return Promise.resolve(plans.shift()); },
        single() { return Promise.resolve(plans.shift()); }, maybeSingle() { return Promise.resolve(plans.shift()); },
        upsert(v) { (captures.writes ||= []).push(v); return chain; },
        update(v) { (captures.updates ||= []).push(v); return chain; } };
      return chain;
    } };
  }
  const input = { channel: "admin_native_ios", installation_id: spareId, native_token: spare.endpoint };
  const captures = {};
  globalThis.__QA_ADMIN_CLIENT = client([{ data: [main], error: null },
    { data: { id: "qa-row", device_label: spare.device_label }, error: null },
    { data: [main, spare], error: null }], captures);
  assert.equal((await helper.registerAdminDevicePushSubscription(input, actor, env)).ok, true,
    "Explicit spare registration must succeed without replacing the main phone");
  assert.equal(captures.writes.length, 1);
  assert.equal(captures.writes[0].device_label, spare.device_label);
  assert.equal(captures.writes[0].endpoint, spare.endpoint);
  assert.equal(captures.updates, undefined);

  for (const [incoming, auth, settings, rows] of [
    [input, actor, baseEnv, [main]],
    [input, actor, { ...env, PRESTIGE_ADMIN_QA_PUSH_POLICY: "bad" }, [main]],
    [input, actor, { ...env, PRESTIGE_ADMIN_QA_PUSH_POLICY: JSON.stringify({ ...policy, expiresAt: "2020-01-01" }) }, [main]],
    [{ ...input, installation_id: "33333333-3333-4333-8333-333333333333" }, actor, env, [main]],
    [input, { ...actor, actor_label: "Other Admin" }, env, [main]],
    [input, actor, env, [main, { ...spare, endpoint: "ExpoPushToken[DifferentExistingSpareToken12345]" }]],
    [input, actor, env, []],
    [input, { ...actor, actor_role: "driver" }, env, [main]],
  ]) {
    const denied = {};
    globalThis.__QA_ADMIN_CLIENT = client([{ data: rows, error: null }], denied);
    assert.equal((await helper.registerAdminDevicePushSubscription(incoming, auth, settings)).ok, false);
    assert.equal(denied.writes, undefined, "Denied registration cannot write");
  }
  // Existing main-phone re-registration remains valid with a spare present.
  const mainCapture = {};
  globalThis.__QA_ADMIN_CLIENT = client([{ data: [main, spare], error: null },
    { data: { id: "main-row", device_label: main.device_label }, error: null },
    { data: [main, spare], error: null }], mainCapture);
  assert.equal((await helper.registerAdminDevicePushSubscription({ ...input, installation_id: mainId,
    native_token: main.endpoint }, actor, baseEnv)).ok, true);
  assert.equal(mainCapture.writes[0].device_label, main.device_label);
  assert.equal(mainCapture.updates, undefined);

  // A concurrent second QA token must revoke only this attempted spare registration.
  const raceCapture = {};
  globalThis.__QA_ADMIN_CLIENT = client([{ data: [main], error: null },
    { data: { id: "qa-row" }, error: null },
    { data: [main, spare, { ...spare, endpoint: "ExpoPushToken[ConcurrentQaToken1234567890]" }], error: null }], raceCapture);
  assert.equal((await helper.registerAdminDevicePushSubscription(input, actor, env)).ok, false);
  assert.equal(raceCapture.updates.length, 1);
  assert.ok(raceCapture.filters.some(([k,v])=>k==="endpoint" && v===spare.endpoint));
  assert.ok(raceCapture.filters.some(([k,v])=>k==="device_label" && v===spare.device_label));

  async function send(event, reference, settings = env, rows = [main, spare]) {
    globalThis.__QA_ADMIN_CLIENT = client([{ data: rows, error: null }]);
    const sent = [];
    await helper.sendAdminDevicePushAlert(event, { env: settings, qaBookingReference: reference,
      vehiclePlate: "QA9222", nativePushSender: async (token,payload) => { sent.push({ token,payload }); } });
    return sent;
  }
  for (const event of ["driver_otw", "driver_ots", "driver_pob", "driver_completed"]) {
    const sent = await send(event, policy.bookingReference);
    assert.deepEqual(sent.map(s=>s.token), [main.endpoint, spare.endpoint]);
    assert.deepEqual(sent[0].payload, sent[1].payload, "Reuse the same notification payload");
    const normal = await send(event, "real-job");
    assert.deepEqual(normal.map(s=>s.token), [main.endpoint]);
    assert.deepEqual(sent[0].payload, normal[0].payload, "Main payload unchanged by QA routing");
  }
  for (const [event, ref, settings] of [
    ["driver_otw", undefined, env], ["driver_otw", "11148", env],
    ["driver_acknowledged", policy.bookingReference, env], ["driver_issue", policy.bookingReference, env],
    ["new_booking_request", policy.bookingReference, env], ["driver_otw", policy.bookingReference, baseEnv],
    ["driver_otw", policy.bookingReference, { ...env, PRESTIGE_ADMIN_QA_PUSH_POLICY: "bad" }],
    ["driver_otw", policy.bookingReference, { ...env, PRESTIGE_ADMIN_QA_PUSH_POLICY: JSON.stringify({ ...policy, expiresAt: "2020-01-01" }) }],
  ]) assert.deepEqual((await send(event,ref,settings)).map(s=>s.token), [main.endpoint]);
  assert.deepEqual(await send("driver_otw", policy.bookingReference, env, [main, row("44444444-4444-4444-8444-444444444444"), spare]), [],
    "Ambiguous normal registrations stay fail-closed");
  // Spare-provider failure cannot prevent the normal phone from receiving its unchanged alert.
  globalThis.__QA_ADMIN_CLIENT = client([{ data: [spare, main], error: null }]);
  const order = [];
  const partial = await helper.sendAdminDevicePushAlert("driver_otw", { env,
    qaBookingReference: policy.bookingReference, nativePushSender: async token => {
      order.push(token); if (token === spare.endpoint) throw new Error("QA provider failure");
    } });
  assert.deepEqual(order, [main.endpoint, spare.endpoint]);
  assert.equal(partial.provider_request_count, 2);
  const revokeCapture = {};
  globalThis.__QA_ADMIN_CLIENT = client([{ data: { id: "qa-row" }, error: null }], revokeCapture);
  assert.equal((await helper.revokeAdminDevicePushSubscription(input, actor, baseEnv)).ok, true);
  assert.ok(revokeCapture.filters.some(([k,v])=>k==="endpoint" && v===spare.endpoint));
  assert.ok(revokeCapture.filters.some(([k,v])=>k==="actor_label" && v===actor.actor_label));
  assert.ok(revokeCapture.filters.some(([k,v])=>k==="device_label" && Array.isArray(v) &&
    v.includes(spare.device_label) && !v.includes(main.device_label)));
  assert.match(adapter, /qaBookingReference: result\.payload\.reference/,
    "Only confirmed saved status supplies the QA routing identity");
  console.log("Admin QA spare guard passed: main preserved, exact QA-only statuses, expiry, rejection and exact cleanup.");
} finally { delete globalThis.__QA_ADMIN_CLIENT; await rm(root, { recursive: true, force: true }); }
