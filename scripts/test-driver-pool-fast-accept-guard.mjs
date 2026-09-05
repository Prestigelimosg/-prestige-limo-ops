import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const names = [
  "app/admin-driver-pool-control.tsx",
  "app/api/admin-driver-job-bid-offers/route.ts",
  "app/api/driver-job-bids/route.ts",
  "app/driver-portal/page.tsx",
  "app/page.tsx",
  "driver-companion/App.tsx",
  "driver-companion/src/driver-webview-bridge.ts",
  "driver-companion/src/native-notifications.ts",
  "docs/current-implementation-ledger.md",
  "lib/admin-driver-job-link-persistence.ts",
  "lib/driver-device-push-notification.ts",
  "lib/driver-pool-fast-accept.ts",
  "public/prestige-driver-push-sw.js",
  "scripts/test-booking-ui-browser.mjs",
  "scripts/test-driver-job-page-browser.mjs",
  "supabase/migrations/202606090002_driver_portal_bidding_foundation.sql",
  "supabase/migrations/20260904112430_driver_pool_fast_accept.sql",
  "supabase/migrations/20260904125321_driver_pool_completion_repair.sql",
  "supabase/migrations/20260904190552_driver_pool_exact_concurrency_tokens.sql",
  "supabase/migrations/20260905012642_driver_pool_admin_cancel_assigned_offer.sql",
  "vercel.json",
];
const files = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readFile(name, "utf8")])));

function includes(name, fragments) {
  for (const fragment of fragments) assert.ok(files[name].includes(fragment), `${name} missing ${fragment}`);
}
function excludes(name, patterns) {
  for (const pattern of patterns) assert.doesNotMatch(files[name], pattern, `${name} leaks or alters forbidden scope: ${pattern}`);
}

const vercelConfig = JSON.parse(files["vercel.json"]);
assert.deepEqual(
  vercelConfig.functions?.["app/api/admin-driver-job-bid-offers/route.ts"]?.regions,
  ["sin1"],
  "only the established Driver Pool Admin API function must be pinned to Singapore",
);
assert.equal(vercelConfig.regions, undefined, "Driver Pool locality repair must not change the project-wide region");
excludes("app/api/admin-driver-job-bid-offers/route.ts", [/preferredRegion|runtime\s*=\s*["']edge["']/]);

includes("lib/driver-pool-fast-accept.ts", [
  "PRESTIGE_DRIVER_POOL_ENABLED", "driverPoolIsEnabled", "parseDriverPoolPublishPayload",
  "parseDriverPoolAttentionQuery", "loadAdminDriverPoolAttentionOffers",
  'attention_status: "accepted_link_pending"', '.from("driver_job_links")',
  "offer_payout_sgd", "publish_driver_pool_offer", "cancel_driver_pool_offer",
  "accept_driver_pool_offer", "decline_driver_pool_offer", "list_driver_pool_available_jobs",
  "sendDriverDevicePushAlertForDriverPoolOffer", "eligible, enabled: true, offer",
  "public_booking_reference,pickup_at", "driverPoolPublishRpcTimeoutMs = 10_000",
  ".abortSignal(controller.signal)", "driver_pool_publish_rpc_failure",
  'code: input.timedOut ? "LOCAL_TIMEOUT"', "correlation_id: input.correlationId",
  "elapsed_ms:", 'rpc: "publish_driver_pool_offer"', "status: safeDiagnosticStatus",
  "Driver Pool publish timed out before confirmation. Reload this booking to check for an open offer before trying again.",
]);
excludes("lib/driver-pool-fast-accept.ts", [/customer_price|invoice|billing_amount|payment|paynow|bank_account|internal_finance|payout_comparison/i]);
includes("docs/current-implementation-ledger.md", [
  "## Admin Driver Pool Pending Jobs Compact List (source checkpoint 2026-09-05)",
  "approximately five slim rows inside its own scroll area",
  "It does not create, issue, copy, send, acknowledge or revoke a link automatically.",
  "## Driver Pool Winner Driver Alert, Silent Loser Refresh And Pre-Link Assignment Recovery (source checkpoint 2026-09-05)",
  "Accepted! Pls ack when admin send job link",
  "The losing-Driver signal has no title, body, sound or badge.",
  "the established manual Driver A to Driver B save closes the old assigned offer",
  "existing full-width Assigned Driver action; no new button or panel is added",
  "## Driver Pool Admin API Singapore Region Locality Repair (source checkpoint 2026-09-05)",
  "maps only `app/api/admin-driver-job-bid-offers/route.ts` to Vercel region `sin1`",
  "## Driver Pool Publish RPC Timeout And Diagnostic Repair (source checkpoint 2026-09-05)",
  "Only the existing `publish_driver_pool_offer` request now has a local 10-second `AbortController` deadline.",
  "The request is attempted once with the exact Admin-supplied idempotency key and no automatic retry.",
  "Reload this booking to check for an open offer before trying again.",
  "Push remains strictly downstream of a valid non-idempotent publish result",
]);

async function loadFastAcceptHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-driver-pool-timeout-"));
  const sourcePath = path.join(process.cwd(), "lib/driver-pool-fast-accept.ts");
  const outputPath = path.join(tempDir, "lib/driver-pool-fast-accept.js");
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");
  const pushPath = path.join(tempDir, "lib/driver-device-push-notification.js");
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await writeFile(outputPath, ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText);
  await writeFile(serverOnlyPath, "");
  await writeFile(supabasePath, "exports.createClient = () => { throw new Error('test client injection required'); };");
  await writeFile(pushPath, "exports.sendDriverDevicePushAlertForDriverPoolOffer = async () => { globalThis.__driverPoolPushCalls += 1; return { ok: true, provider_request_count: 1 }; };");

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(outputPath)(outputPath),
  };
}

const timeoutHarness = await loadFastAcceptHarness();
const exactConcurrencyTimestamp = "2026-08-27 09:58:11.934739+00";
const exactOfferTimestamp = "2026-09-05 00:00:00.286512+00";
const exactPublishPayload = timeoutHarness.helper.parseDriverPoolPublishPayload({
  booking_reference: "ADM-DRIVER-POOL-MICROSECONDS",
  expected_updated_at: exactConcurrencyTimestamp,
  idempotency_key: "12345678-1234-1234-1234-123456789abc",
  offer_payout_sgd: 55,
});
assert.equal(exactPublishPayload.ok, true, "microsecond booking timestamp must be accepted");
assert.equal(
  exactPublishPayload.data.expected_updated_at,
  exactConcurrencyTimestamp,
  "publish must preserve the exact database concurrency token instead of truncating it to milliseconds",
);
const exactCancelPayload = timeoutHarness.helper.parseDriverPoolCancelPayload({
  offer_key: "a".repeat(64),
  expected_updated_at: exactOfferTimestamp,
});
assert.equal(exactCancelPayload.ok, true, "microsecond offer timestamp must be accepted for cancel");
assert.equal(exactCancelPayload.data.expected_updated_at, exactOfferTimestamp);
const exactDecisionPayload = timeoutHarness.helper.parseDriverPoolDecisionPayload({
  offer_key: "a".repeat(64),
  expected_updated_at: exactOfferTimestamp,
  idempotency_key: "abcdefab-cdef-abcd-efab-cdefabcdefab",
});
assert.equal(exactDecisionPayload.ok, true, "microsecond offer timestamp must be accepted for Driver decisions");
assert.equal(exactDecisionPayload.data.expected_updated_at, exactOfferTimestamp);
const priorFeatureFlag = process.env.PRESTIGE_DRIVER_POOL_ENABLED;
const originalConsoleError = console.error;
const originalSetTimeout = globalThis.setTimeout;
const diagnosticLogs = [];
const rpcCalls = [];
globalThis.__driverPoolPushCalls = 0;
process.env.PRESTIGE_DRIVER_POOL_ENABLED = "true";
console.error = (...args) => diagnosticLogs.push(args);
globalThis.setTimeout = (callback, delay, ...args) =>
  originalSetTimeout(callback, Math.min(Number(delay), 20), ...args);
try {
  assert.deepEqual(
    timeoutHarness.helper.parseDriverPoolAttentionQuery(new URLSearchParams("scope=attention&page=2&limit=20")),
    { data: { limit: 20, page: 2 }, ok: true },
    "the Admin pending-list query must accept only its bounded established-route scope",
  );
  assert.equal(
    timeoutHarness.helper.parseDriverPoolAttentionQuery(new URLSearchParams("scope=attention&page=1&limit=21")).ok,
    false,
    "the Admin pending-list API must reject a page larger than 20",
  );
  assert.equal(
    timeoutHarness.helper.parseDriverPoolAttentionQuery(new URLSearchParams("scope=attention&page=1&page=2")).ok,
    false,
    "duplicate Admin pending-list query keys must fail closed",
  );

  const attentionOfferRows = [
    {
      booking_reference: "ADM-OPEN",
      closes_at: "2027-09-05T01:00:00.000Z",
      offer_key: "1".repeat(64),
      offer_payout_sgd: 55,
      offer_status: "open",
      pickup_at: "2027-09-06T02:00:00.000Z",
      public_booking_reference: "10921",
      push_target_count: 1,
      recipient_count: 2,
      updated_at: exactOfferTimestamp,
    },
    {
      booking_reference: "ADM-ACCEPTED-NO-LINK",
      closes_at: "2027-09-05T01:00:00.000Z",
      offer_key: "2".repeat(64),
      offer_payout_sgd: 60,
      offer_status: "assigned",
      pickup_at: "2027-09-06T03:00:00.000Z",
      public_booking_reference: "10922",
      push_target_count: 1,
      recipient_count: 2,
      updated_at: exactOfferTimestamp,
    },
    {
      booking_reference: "ADM-ACCEPTED-WITH-LINK",
      closes_at: "2027-09-05T01:00:00.000Z",
      offer_key: "3".repeat(64),
      offer_payout_sgd: 65,
      offer_status: "assigned",
      pickup_at: "2027-09-06T04:00:00.000Z",
      public_booking_reference: "10923",
      push_target_count: 1,
      recipient_count: 2,
      updated_at: exactOfferTimestamp,
    },
    {
      booking_reference: "ADM-EXPIRED",
      closes_at: "2020-09-05T01:00:00.000Z",
      offer_key: "4".repeat(64),
      offer_payout_sgd: 70,
      offer_status: "open",
      pickup_at: "2027-09-06T05:00:00.000Z",
      public_booking_reference: "10924",
      push_target_count: 1,
      recipient_count: 2,
      updated_at: exactOfferTimestamp,
    },
  ];
  function attentionQuery(table) {
    let result = table === "driver_job_bid_offers"
      ? { data: attentionOfferRows, error: null }
      : { data: [{ booking_reference: "ADM-ACCEPTED-WITH-LINK" }], error: null };
    const query = {
      in() { return query; },
      limit() { return query; },
      order() { return query; },
      range(from, to) {
        if (table === "driver_job_bid_offers") result = { data: attentionOfferRows.slice(from, to + 1), error: null };
        return query;
      },
      select() { return query; },
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    };
    return query;
  }
  const attentionResult = await timeoutHarness.helper.loadAdminDriverPoolAttentionOffers({
    from(table) { return attentionQuery(table); },
  }, 1, 1);
  assert.equal(attentionResult.ok, true);
  assert.equal(attentionResult.data.has_more, true, "one additional actionable offer must expose Load more");
  assert.equal(attentionResult.data.items.length, 1, "the server page size must be enforced");
  assert.equal(attentionResult.data.items[0].attention_status, "open");
  const allAttentionResult = await timeoutHarness.helper.loadAdminDriverPoolAttentionOffers({
    from(table) { return attentionQuery(table); },
  }, 1, 20);
  assert.deepEqual(
    allAttentionResult.data.items.map((item) => [item.public_booking_reference, item.attention_status]),
    [["10921", "open"], ["10922", "accepted_link_pending"]],
    "only open offers and accepted offers without any Driver Job Link belong in the compact Admin pending list",
  );

  const exactIdempotencyKey = "12345678-1234-1234-1234-123456789abc";
  const result = await timeoutHarness.helper.publishDriverPoolOffer({
    rpc(name, payload) {
      rpcCalls.push({ name, payload });
      return {
        abortSignal(signal) {
          rpcCalls.push({ operation: "abortSignal", signal });
          return new Promise((resolve) => signal.addEventListener("abort", () => resolve({
            data: null,
            error: { code: "", message: "AbortError: intentionally private upstream detail" },
            status: 0,
          }), { once: true }));
        },
      };
    },
  }, {
    booking_reference: "ADM-DRIVER-POOL-TIMEOUT",
    expected_updated_at: "2026-09-05T00:00:00.000Z",
    idempotency_key: exactIdempotencyKey,
    offer_payout_sgd: 55,
  }, {
    actor_label: "bounded-admin",
    actor_role: "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  });

  assert.deepEqual(result, {
    error: "Driver Pool publish timed out before confirmation. Reload this booking to check for an open offer before trying again.",
    ok: false,
    status: 504,
  });
  assert.equal(rpcCalls.filter((call) => call.name === "publish_driver_pool_offer").length, 1, "timeout must not retry publish RPC");
  assert.equal(rpcCalls[0].payload.p_idempotency_key, exactIdempotencyKey, "publish must preserve the exact idempotency key");
  assert.equal(rpcCalls[1].operation, "abortSignal", "publish must bind its local abort signal to the RPC");
  assert.equal(globalThis.__driverPoolPushCalls, 0, "timeout must not attempt Driver push");
  assert.equal(diagnosticLogs.length, 1, "timeout must emit one server diagnostic");
  assert.equal(diagnosticLogs[0][0], "driver_pool_publish_rpc_failure");
  assert.deepEqual(Object.keys(diagnosticLogs[0][1]).sort(), ["code", "correlation_id", "elapsed_ms", "outcome", "rpc", "status"]);
  assert.equal(diagnosticLogs[0][1].code, "LOCAL_TIMEOUT");
  assert.equal(diagnosticLogs[0][1].outcome, "timeout");
  assert.equal(diagnosticLogs[0][1].rpc, "publish_driver_pool_offer");
  assert.equal(diagnosticLogs[0][1].status, 0);
  assert.match(diagnosticLogs[0][1].correlation_id, /^[0-9a-f-]{36}$/i);
  const serializedDiagnostic = JSON.stringify(diagnosticLogs);
  assert.equal(serializedDiagnostic.includes("ADM-DRIVER-POOL-TIMEOUT"), false, "diagnostic must not log booking identity");
  assert.equal(serializedDiagnostic.includes(exactIdempotencyKey), false, "diagnostic must not log idempotency identity");
  assert.equal(serializedDiagnostic.includes("intentionally private upstream detail"), false, "diagnostic must not log raw upstream text");

  globalThis.__driverPoolPushCalls = 0;
  const successIdempotencyKey = "abcdefab-cdef-abcd-efab-cdefabcdefab";
  const successResult = await timeoutHarness.helper.publishDriverPoolOffer({
    rpc(name, payload) {
      rpcCalls.push({ name, payload });
      return {
        abortSignal(signal) {
          rpcCalls.push({ operation: "successAbortSignal", signal });
          return Promise.resolve({
            data: {
              idempotent: false,
              offer: {
                closes_at: "2027-09-05T01:00:00.000Z",
                offer_key: "a".repeat(64),
                offer_payout_sgd: 55,
                offer_status: "open",
                push_target_count: 1,
                recipient_count: 1,
                updated_at: exactOfferTimestamp,
              },
              recipient_driver_ids: [7],
            },
            error: null,
            status: 200,
          });
        },
      };
    },
  }, {
    booking_reference: "ADM-DRIVER-POOL-SUCCESS",
    expected_updated_at: "2026-09-05T00:00:00.000Z",
    idempotency_key: successIdempotencyKey,
    offer_payout_sgd: 55,
  }, {
    actor_label: "bounded-admin",
    actor_role: "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  });
  assert.equal(successResult.ok, true, "successful publish must still return its safe offer");
  assert.equal(successResult.data.provider_attempted_driver_count, 1);
  assert.equal(successResult.data.provider_accepted_driver_count, 1);
  assert.equal(
    successResult.data.updated_at,
    exactOfferTimestamp,
    "publish result must preserve the exact offer concurrency token",
  );
  assert.equal(globalThis.__driverPoolPushCalls, 1, "successful non-idempotent publish must retain the existing push handoff");
  assert.equal(diagnosticLogs.length, 1, "successful publish must not emit a failure diagnostic");
  assert.equal(
    rpcCalls.filter((call) => call.name === "publish_driver_pool_offer").at(-1).payload.p_idempotency_key,
    successIdempotencyKey,
    "successful publish must also preserve its exact idempotency key",
  );

  const exactActionRpcCalls = [];
  const cancelResult = await timeoutHarness.helper.cancelDriverPoolOffer({
    rpc(name, payload) {
      exactActionRpcCalls.push({ name, payload });
      return Promise.resolve({
        data: {
          assignment_cancelled: true,
          cancelled_driver_id: 7,
          offer: {
            closes_at: "2027-09-05T01:00:00.000Z",
            offer_key: "a".repeat(64),
            offer_payout_sgd: 55,
            offer_status: "cancelled",
            push_target_count: 1,
            recipient_count: 1,
            updated_at: exactOfferTimestamp,
          },
          public_booking_reference: "10909",
        },
        error: null,
      });
    },
  }, exactCancelPayload.data, {
    actor_label: "bounded-admin",
    actor_role: "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  });
  assert.equal(cancelResult.ok, true, "cancel must retain the established RPC lane");
  assert.equal(cancelResult.data.offer.updated_at, exactOfferTimestamp);
  assert.equal(cancelResult.data.assignment_cancelled, true);
  assert.equal(cancelResult.data.cancelled_driver_id, 7);
  assert.equal(cancelResult.data.public_booking_reference, "10909");
  assert.equal(exactActionRpcCalls[0].payload.p_expected_updated_at, exactOfferTimestamp);

  const legacyCancelResult = await timeoutHarness.helper.cancelDriverPoolOffer({
    rpc: () => Promise.resolve({
      data: {
        closes_at: "2027-09-05T01:00:00.000Z",
        offer_key: "b".repeat(64),
        offer_payout_sgd: 60,
        offer_status: "cancelled",
        push_target_count: 1,
        recipient_count: 1,
        updated_at: exactOfferTimestamp,
      },
      error: null,
    }),
  }, {
    expected_updated_at: exactOfferTimestamp,
    offer_key: "b".repeat(64),
  }, {
    actor_label: "William",
    actor_role: "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  });
  assert.equal(legacyCancelResult.ok, true, "existing open-offer cancellation must survive the migration/deploy handoff");
  assert.equal(legacyCancelResult.data.assignment_cancelled, false);
  assert.equal(legacyCancelResult.data.offer.offer_key, "b".repeat(64));

  const availableResult = await timeoutHarness.helper.loadAvailableDriverPoolJobs({
    rpc(name, payload) {
      exactActionRpcCalls.push({ name, payload });
      return Promise.resolve({
        data: {
          has_more: false,
          jobs: [{
            closes_at: "2027-09-05T01:00:00.000Z",
            offer_key: "a".repeat(64),
            offer_payout_sgd: 55,
            pickup_at: "2027-09-05T02:00:00.000Z",
            public_booking_reference: "10907",
            safe_dropoff_area: "Drop-off details after assignment",
            safe_pickup_area: "Pickup details after assignment",
            safe_trip_summary: "MNG",
            safe_vehicle_label: "AVF",
            updated_at: exactOfferTimestamp,
          }],
        },
        error: null,
      });
    },
  }, 7, 1, 20);
  assert.equal(availableResult.ok, true, "Available Jobs must retain the established RPC lane");
  assert.equal(availableResult.data.jobs[0].updated_at, exactOfferTimestamp);

  for (const action of ["accept", "decline"]) {
    const decisionResult = await timeoutHarness.helper.decideDriverPoolOffer({
      rpc(name, payload) {
        exactActionRpcCalls.push({ name, payload });
        return Promise.resolve({
          data: {
            other_recipient_driver_ids: action === "accept" ? [8, 9] : [],
            ok: true,
            public_booking_reference: action === "accept" ? "10907" : null,
            reason: action === "accept" ? "accepted" : "declined",
          },
          error: null,
        });
      },
    }, 7, exactDecisionPayload.data, action);
    assert.equal(decisionResult.ok, true, `${action} must retain the established RPC lane`);
    assert.equal(
      exactActionRpcCalls.at(-1).payload.p_expected_updated_at,
      exactOfferTimestamp,
      `${action} must send the exact offer concurrency token`,
    );
    assert.deepEqual(
      decisionResult.data.other_recipient_driver_ids,
      action === "accept" ? [8, 9] : [],
      "only a first acceptance may return the other exact offer recipients for the unavailable push",
    );
    assert.equal(
      decisionResult.data.public_booking_reference,
      action === "accept" ? "10907" : null,
      `${action} must retain only the validated public booking reference returned by its RPC`,
    );
  }
  assert.deepEqual(
    exactActionRpcCalls.map((call) => call.name),
    [
      "cancel_driver_pool_offer",
      "list_driver_pool_available_jobs",
      "accept_driver_pool_offer",
      "decline_driver_pool_offer",
    ],
    "cancel, list, accept and decline must each use only their one established RPC",
  );

  const unsafePublicReferenceResult = await timeoutHarness.helper.decideDriverPoolOffer({
    rpc() {
      return Promise.resolve({
        data: {
          ok: true,
          public_booking_reference: "PRIVATE INTERNAL REF",
          reason: "accepted",
        },
        error: null,
      });
    },
  }, 7, exactDecisionPayload.data, "accept");
  assert.equal(unsafePublicReferenceResult.ok, true);
  assert.equal(
    unsafePublicReferenceResult.data.public_booking_reference,
    null,
    "an invalid or internal booking reference must not enter the Admin winner alert handoff",
  );
} finally {
  globalThis.setTimeout = originalSetTimeout;
  console.error = originalConsoleError;
  if (priorFeatureFlag === undefined) delete process.env.PRESTIGE_DRIVER_POOL_ENABLED;
  else process.env.PRESTIGE_DRIVER_POOL_ENABLED = priorFeatureFlag;
  delete globalThis.__driverPoolPushCalls;
  await timeoutHarness.cleanup();
}

async function loadDriverPoolDecisionRouteHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-driver-pool-admin-alert-"));
  const routeSource = await readFile("app/api/driver-job-bids/route.ts", "utf8");
  const routePath = path.join(tempDir, "app/api/driver-job-bids/route.js");
  const writeModule = async (relativePath, source) => {
    const target = path.join(tempDir, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source);
  };

  await writeModule("node_modules/next/server.js", `
    exports.after = (callback) => { globalThis.__driverPoolAfterCallbacks.push(callback); };
  `);
  await writeModule("lib/admin-device-push-notification.js", `
    exports.sendAdminDevicePushAlert = async (eventType, options) => {
      globalThis.__driverPoolAdminAlertCalls.push({ eventType, options });
      if (globalThis.__driverPoolAdminAlertShouldFail) throw new Error("provider unavailable");
      return { ok: true };
    };
  `);
  await writeModule("lib/driver-device-push-notification.js", `
    exports.sendDriverDevicePushAlertForDriverPoolOffer = async (_client, input) => {
      globalThis.__driverPoolWinnerDriverAlertCalls.push(input);
      if (globalThis.__driverPoolWinnerDriverAlertShouldFail) throw new Error("driver provider unavailable");
      return { ok: true };
    };
    exports.sendDriverDeviceSilentRefreshForDriverPoolOffer = async (_client, input) => {
      globalThis.__driverPoolSilentRefreshCalls.push(input);
      if (globalThis.__driverPoolWinnerDriverAlertShouldFail) throw new Error("driver provider unavailable");
      return { ok: true };
    };
  `);
  await writeModule("lib/driver-account-device-lock.js", `
    exports.verifyDriverAccountSession = async () => true;
  `);
  await writeModule("lib/driver-portal-session.js", `
    exports.resolveDriverPortalSession = () => ({
      ok: true,
      claims: { accountId: 9, deviceIdHash: "device-hash", driverId: 17 },
    });
    exports.clearDriverPortalSessionCookie = () => "cleared=true";
  `);
  await writeModule("lib/driver-pool-fast-accept.js", `
    const client = {
      from(table) {
        globalThis.__driverPoolPlateReadTables.push(table);
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { plate_number: globalThis.__driverPoolPlate }, error: null }),
        };
      },
    };
    exports.getDriverPoolClientForProduction = () => ({ client, ok: true });
    exports.parseDriverPoolDecisionPayload = () => ({
      data: { offer_key: "a".repeat(64), expected_updated_at: "2026-09-05T01:00:00.123456+00:00", idempotency_key: "1".repeat(32) },
      ok: true,
    });
    exports.decideDriverPoolOffer = async () => ({ data: globalThis.__driverPoolDecision, ok: true });
    exports.loadAvailableDriverPoolJobs = async () => ({ data: { enabled: true, has_more: false, jobs: [] }, ok: true });
  `);
  await mkdir(path.dirname(routePath), { recursive: true });
  await writeFile(routePath, ts.transpileModule(routeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: "app/api/driver-job-bids/route.ts",
  }).outputText);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: createRequire(import.meta.url)(routePath),
  };
}

const routeHarness = await loadDriverPoolDecisionRouteHarness();
try {
  const decisionRequest = (method = "POST") => new Request("https://app.prestigelimo.sg/api/driver-job-bids", {
    body: JSON.stringify({}),
    headers: {
      cookie: "driver=session",
      origin: "https://app.prestigelimo.sg",
      referer: "https://app.prestigelimo.sg/driver-portal",
      "x-prestige-driver-installation-id": "installation",
      "x-prestige-driver-purpose": method === "POST" ? "driver-pool-offer-accept" : "driver-pool-offer-decline",
    },
    method,
  });
  globalThis.__driverPoolAfterCallbacks = [];
  globalThis.__driverPoolAdminAlertCalls = [];
  globalThis.__driverPoolWinnerDriverAlertCalls = [];
  globalThis.__driverPoolSilentRefreshCalls = [];
  globalThis.__driverPoolPlateReadTables = [];
  globalThis.__driverPoolPlate = " 9696 ";
  globalThis.__driverPoolDecision = { accepted: true, other_recipient_driver_ids: [18, 19], public_booking_reference: "10907", reason: "accepted" };
  globalThis.__driverPoolAdminAlertShouldFail = false;
  globalThis.__driverPoolWinnerDriverAlertShouldFail = false;

  const acceptedResponse = await routeHarness.route.POST(decisionRequest());
  assert.equal(acceptedResponse.status, 200);
  assert.equal(globalThis.__driverPoolAdminAlertCalls.length, 0, "Admin push must not delay the Driver acceptance response");
  assert.equal(globalThis.__driverPoolWinnerDriverAlertCalls.length, 0, "winner push must not delay the Driver acceptance response");
  assert.equal(globalThis.__driverPoolSilentRefreshCalls.length, 0, "other-Driver refresh push must not delay the acceptance response");
  assert.equal(globalThis.__driverPoolAfterCallbacks.length, 1, "first acceptance must schedule one winner alert handoff");
  await globalThis.__driverPoolAfterCallbacks[0]();
  assert.deepEqual(globalThis.__driverPoolPlateReadTables, ["drivers"]);
  assert.deepEqual(globalThis.__driverPoolAdminAlertCalls, [{
    eventType: "driver_pool_accepted",
    options: { bookingReference: "10907", vehiclePlate: "9696" },
  }]);
  assert.deepEqual(globalThis.__driverPoolWinnerDriverAlertCalls, [{
    driver_id: 17,
    notification_kind: "winner",
    offer_key: "a".repeat(64),
    public_booking_reference: "10907",
  }]);
  assert.deepEqual(globalThis.__driverPoolSilentRefreshCalls, [
    { driver_id: 18, offer_key: "a".repeat(64) },
    { driver_id: 19, offer_key: "a".repeat(64) },
  ]);

  globalThis.__driverPoolAfterCallbacks = [];
  globalThis.__driverPoolAdminAlertCalls = [];
  globalThis.__driverPoolWinnerDriverAlertCalls = [];
  globalThis.__driverPoolSilentRefreshCalls = [];
  globalThis.__driverPoolDecision = { accepted: true, public_booking_reference: "10907", reason: "already_accepted" };
  const replayResponse = await routeHarness.route.POST(decisionRequest());
  assert.equal(replayResponse.status, 200);
  assert.equal(globalThis.__driverPoolAfterCallbacks.length, 0, "an idempotent replay must not schedule another Admin alert");
  assert.equal(globalThis.__driverPoolWinnerDriverAlertCalls.length, 0, "an idempotent replay must not send a winner Driver alert");
  assert.equal(globalThis.__driverPoolSilentRefreshCalls.length, 0, "an idempotent replay must not refresh other Drivers again");

  globalThis.__driverPoolDecision = { accepted: true, other_recipient_driver_ids: [18], public_booking_reference: "10909", reason: "accepted" };
  globalThis.__driverPoolAfterCallbacks = [];
  globalThis.__driverPoolAdminAlertCalls = [];
  globalThis.__driverPoolWinnerDriverAlertCalls = [];
  globalThis.__driverPoolSilentRefreshCalls = [];
  globalThis.__driverPoolPlateReadTables = [];
  globalThis.__driverPoolPlate = "VEHICLE TBC";
  const invalidPlateResponse = await routeHarness.route.POST(decisionRequest());
  assert.equal(invalidPlateResponse.status, 200);
  await globalThis.__driverPoolAfterCallbacks[0]();
  assert.deepEqual(globalThis.__driverPoolPlateReadTables, ["drivers"]);
  assert.equal(globalThis.__driverPoolAdminAlertCalls.length, 0, "placeholder plate text must not send an Admin winner alert");
  assert.equal(globalThis.__driverPoolWinnerDriverAlertCalls.length, 1, "an invalid Admin plate must not suppress the winner Driver alert");
  assert.equal(globalThis.__driverPoolSilentRefreshCalls.length, 1, "an invalid Admin plate must not suppress the other-Driver silent refresh");

  globalThis.__driverPoolDecision = { accepted: true, other_recipient_driver_ids: [18], public_booking_reference: "10908", reason: "accepted" };
  globalThis.__driverPoolAfterCallbacks = [];
  globalThis.__driverPoolPlate = "9696";
  globalThis.__driverPoolAdminAlertShouldFail = true;
  globalThis.__driverPoolWinnerDriverAlertShouldFail = true;
  const resilientResponse = await routeHarness.route.POST(decisionRequest());
  assert.equal(resilientResponse.status, 200);
  await globalThis.__driverPoolAfterCallbacks[0]();
  assert.equal((await resilientResponse.json()).accepted, true, "provider failure must not roll back the accepted assignment response");
} finally {
  delete globalThis.__driverPoolAfterCallbacks;
  delete globalThis.__driverPoolAdminAlertCalls;
  delete globalThis.__driverPoolWinnerDriverAlertCalls;
  delete globalThis.__driverPoolSilentRefreshCalls;
  delete globalThis.__driverPoolPlateReadTables;
  delete globalThis.__driverPoolPlate;
  delete globalThis.__driverPoolDecision;
  delete globalThis.__driverPoolAdminAlertShouldFail;
  delete globalThis.__driverPoolWinnerDriverAlertShouldFail;
  await routeHarness.cleanup();
}

async function loadAdminDriverPoolCancelRouteHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-driver-pool-cancel-alert-"));
  const routeSource = await readFile("app/api/admin-driver-job-bid-offers/route.ts", "utf8");
  const routePath = path.join(tempDir, "app/api/admin-driver-job-bid-offers/route.js");
  const writeModule = async (relativePath, source) => {
    const target = path.join(tempDir, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source);
  };

  await writeModule("node_modules/next/server.js", `
    exports.after = (callback) => { globalThis.__driverPoolCancelAfterCallbacks.push(callback); };
  `);
  await writeModule("lib/admin-booking-supabase-adapter.js", `
    exports.adminDispatcherBoundaryToPersistenceAdapterActor = () => ({ actorLabel: "Admin", actorRole: "admin" });
  `);
  await writeModule("lib/admin-dispatcher-auth-boundary.js", `
    exports.adminBookingPersistencePurpose = "admin-booking-persistence";
    exports.resolveAdminDispatcherBoundary = () => ({ context: {}, ok: true });
  `);
  await writeModule("lib/driver-device-push-notification.js", `
    exports.sendDriverDevicePushAlertForDriverPoolOffer = async (_client, input) => {
      globalThis.__driverPoolCancelAlertCalls.push(input);
      if (globalThis.__driverPoolCancelAlertShouldFail) throw new Error("provider unavailable");
      return { ok: true };
    };
  `);
  await writeModule("lib/driver-pool-fast-accept.js", `
    const client = {};
    exports.getDriverPoolClientForProduction = () => ({ client, ok: true });
    exports.parseDriverPoolCancelPayload = () => ({ data: { offer_key: "a".repeat(64), expected_updated_at: "2026-09-05T01:00:00.123456+00:00" }, ok: true });
    exports.cancelDriverPoolOffer = async () => globalThis.__driverPoolCancelResult;
    exports.loadAdminDriverPoolOffer = async () => ({ data: {}, ok: true });
    exports.parseDriverPoolAttentionQuery = () => ({ data: { limit: 20, page: 1 }, ok: true });
    exports.loadAdminDriverPoolAttentionOffers = async () => globalThis.__driverPoolAttentionResult;
    exports.parseDriverPoolPublishPayload = () => ({ data: {}, ok: true });
    exports.publishDriverPoolOffer = async () => ({ data: {}, ok: true });
  `);
  await mkdir(path.dirname(routePath), { recursive: true });
  await writeFile(routePath, ts.transpileModule(routeSource, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: "app/api/admin-driver-job-bid-offers/route.ts",
  }).outputText);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: createRequire(import.meta.url)(routePath),
  };
}

const cancelRouteHarness = await loadAdminDriverPoolCancelRouteHarness();
try {
  globalThis.__driverPoolAttentionResult = {
    data: {
      enabled: true,
      has_more: false,
      items: [{ attention_status: "accepted_link_pending", public_booking_reference: "10909" }],
      page: 1,
    },
    ok: true,
  };
  const attentionResponse = await cancelRouteHarness.route.GET(
    new Request("https://app.prestigelimo.sg/api/admin-driver-job-bid-offers?scope=attention&page=1&limit=20"),
  );
  assert.equal(attentionResponse.status, 200);
  assert.deepEqual(await attentionResponse.json(), {
    enabled: true,
    has_more: false,
    items: [{ attention_status: "accepted_link_pending", public_booking_reference: "10909" }],
    ok: true,
    page: 1,
  });

  const cancelRequest = () => new Request("https://app.prestigelimo.sg/api/admin-driver-job-bid-offers", {
    body: JSON.stringify({}),
    method: "PATCH",
  });
  const cancelledOffer = {
    offer_key: "a".repeat(64),
    offer_status: "cancelled",
  };
  globalThis.__driverPoolCancelAfterCallbacks = [];
  globalThis.__driverPoolCancelAlertCalls = [];
  globalThis.__driverPoolCancelAlertShouldFail = false;
  globalThis.__driverPoolCancelResult = {
    data: {
      assignment_cancelled: true,
      cancelled_driver_id: 17,
      offer: cancelledOffer,
      public_booking_reference: "10909",
    },
    ok: true,
  };

  const assignmentCancelResponse = await cancelRouteHarness.route.PATCH(cancelRequest());
  assert.equal(assignmentCancelResponse.status, 200);
  assert.equal(globalThis.__driverPoolCancelAlertCalls.length, 0, "cancellation push must not delay the atomic API response");
  assert.equal(globalThis.__driverPoolCancelAfterCallbacks.length, 1, "assignment cancellation must schedule one former-winner alert");
  await globalThis.__driverPoolCancelAfterCallbacks[0]();
  assert.deepEqual(globalThis.__driverPoolCancelAlertCalls, [{
    driver_id: 17,
    notification_kind: "assignment_cancelled",
    offer_key: "a".repeat(64),
    public_booking_reference: "10909",
  }]);
  assert.deepEqual(await assignmentCancelResponse.json(), {
    assignment_cancelled: true,
    cancelled_driver_id: 17,
    offer: cancelledOffer,
    ok: true,
    public_booking_reference: "10909",
  });

  globalThis.__driverPoolCancelAfterCallbacks = [];
  globalThis.__driverPoolCancelAlertCalls = [];
  globalThis.__driverPoolCancelResult = {
    data: {
      assignment_cancelled: false,
      cancelled_driver_id: null,
      offer: cancelledOffer,
      public_booking_reference: "10909",
    },
    ok: true,
  };
  const openOfferCancelResponse = await cancelRouteHarness.route.PATCH(cancelRequest());
  assert.equal(openOfferCancelResponse.status, 200);
  assert.equal(globalThis.__driverPoolCancelAfterCallbacks.length, 0, "ordinary open-offer cancellation must not send an assignment alert");

  globalThis.__driverPoolCancelAfterCallbacks = [];
  globalThis.__driverPoolCancelAlertCalls = [];
  globalThis.__driverPoolCancelAlertShouldFail = true;
  globalThis.__driverPoolCancelResult = {
    data: {
      assignment_cancelled: true,
      cancelled_driver_id: 17,
      offer: cancelledOffer,
      public_booking_reference: "10909",
    },
    ok: true,
  };
  const resilientCancelResponse = await cancelRouteHarness.route.PATCH(cancelRequest());
  assert.equal(resilientCancelResponse.status, 200);
  await globalThis.__driverPoolCancelAfterCallbacks[0]();
  assert.equal((await resilientCancelResponse.json()).assignment_cancelled, true, "provider failure must not roll back atomic cancellation");
} finally {
  delete globalThis.__driverPoolCancelAfterCallbacks;
  delete globalThis.__driverPoolCancelAlertCalls;
  delete globalThis.__driverPoolCancelAlertShouldFail;
  delete globalThis.__driverPoolCancelResult;
  delete globalThis.__driverPoolAttentionResult;
  await cancelRouteHarness.cleanup();
}

includes("app/api/driver-job-bids/route.ts", [
  "verifyDriverAccountSession", "!session.claims.accountId || !session.claims.deviceIdHash",
  "x-prestige-driver-installation-id", "driver-pool-offers-read",
  "driver-pool-offer-accept", "driver-pool-offer-decline",
  'import { after } from "next/server";',
  "notifyAdminOfDriverPoolAcceptance", 'sendAdminDevicePushAlert("driver_pool_accepted", {',
  "sendDriverDevicePushAlertForDriverPoolOffer", 'notification_kind: "winner"',
  "sendDriverDeviceSilentRefreshForDriverPoolOffer", "other_recipient_driver_ids",
  "public_booking_reference: acceptedPublicBookingReference", "Promise.allSettled",
  'result.data.reason === "accepted"', '.from("drivers")', '.select("plate_number")',
  "safeDriverPlate", "bookingReference: publicBookingReference", "vehiclePlate,",
  "A completed atomic Driver Pool assignment must not fail because Admin push is unavailable.",
]);
includes("app/driver-portal/page.tsx", [
  "availableJobsAcceptedConfirmation",
  "Accepted! Pls ack when admin send job link",
  'data-driver-pool-accepted-confirmation="true"',
  'role="status"',
]);
assert.match(
  files["app/driver-portal/page.tsx"],
  /setAvailableJobs\(\(current\) => current\.filter\([\s\S]{0,500}setAvailableJobsAcceptedConfirmation\(/,
  "A successful first-winner response must retain one compact in-app confirmation after its Available Job card is removed",
);
assert.match(
  files["app/driver-portal/page.tsx"],
  /data-driver-pool-accepted-confirmation="true"[\s\S]{0,500}availableJobs\.length === 0/,
  "The retained Driver Pool winner confirmation must render outside the removed offer card",
);
assert.doesNotMatch(
  files["app/driver-portal/page.tsx"],
  /data-driver-pool-accepted-confirmation="true"[\s\S]{0,200}<h[1-6]/,
  "The Driver Pool winner confirmation must remain compact text rather than a large heading",
);
includes("scripts/test-booking-ui-browser.mjs", [
  "data-driver-pool-control='assigned'",
  "Accepted · Driver assigned. Create the Driver Job Link when ready.",
]);
includes("scripts/test-driver-job-page-browser.mjs", [
  "Driver Pool retained in-app winner confirmation",
  "The won offer must leave Available Jobs immediately.",
  "The retained winner confirmation must use compact text sizing.",
  "Accepted! Pls ack when admin send job link",
]);
excludes("app/api/driver-job-bids/route.ts", [/driver_reference.*request|driver_id.*request|service_role|SUPABASE/i]);
assert.doesNotMatch(
  files["app/api/driver-job-bids/route.ts"],
  /result\.data\.reason\s*===\s*["']already_accepted["'][\s\S]{0,500}notifyAdminOfDriverPoolAcceptance/,
  "an idempotent replay must not send a second Admin winner alert",
);
includes("app/api/admin-driver-job-bid-offers/route.ts", [
  "resolveAdminDispatcherBoundary", "parseDriverPoolPublishPayload", "publishDriverPoolOffer",
  "parseDriverPoolCancelPayload", "cancelDriverPoolOffer",
  "parseDriverPoolAttentionQuery", "loadAdminDriverPoolAttentionOffers",
]);
includes("app/admin-driver-pool-control.tsx", [
  "Send to Driver Pool", "Cancel Offer", "Booking remains active.", "Pool offer total SGD",
  "Driver Pool pending", "Accepted · Job Link pending", "Load more", "onLoadBooking",
  'data-admin-driver-pool-pending-list="true"', "max-h-52 overflow-y-auto",
  "onAssignedOfferChange", 'offer?.offer_status === "assigned"',
  "Accepted · Driver assigned. Create the Driver Job Link when ready.",
  "showPleaseAssignDriver", ">Please assign driver.<",
  "eligible Drivers", "push-capable Drivers", "app-only Drivers",
  "Drivers had a push request accepted by provider", "delivery not confirmed",
]);
assert.match(
  files["app/admin-driver-pool-control.tsx"],
  /useEffect\(\(\) => \{\s*const timer = window\.setTimeout\(\(\) => \{\s*setFeedback\(""\);\s*void load\(\);\s*\}, 0\);[\s\S]*?\}, \[expectedUpdatedAt, load\]\);/,
  "A successful Admin cancellation must re-read the same Driver Pool control when the saved booking revision changes and clear stale feedback",
);
assert.doesNotMatch(
  files["app/admin-driver-pool-control.tsx"],
  /Reload this booking to Create Link/,
  "The assigned state must not instruct Admin to reload before using the established Driver Job Link lane",
);
includes("scripts/test-booking-ui-browser.mjs", [
  "__prestigeDriverPoolOfferRequests", "Pool offer total SGD\\s*Send to Driver Pool",
  "compact Admin Driver Pool pending jobs list", "accepted Driver Pool pending job exact load",
  "open Driver Pool pending offer cancellation",
  'payout === "75.00"', 'sendText === "Send to Driver Pool"',
  "Driver Pool accepted assignment cancel refreshes in place",
  "Accepted · Driver assigned. Create the Driver Job Link when ready.",
  'bodyText.includes("Please assign driver.")',
  'oldReloadWordingVisible: bodyText.includes("Reload this booking to Create Link")',
]);
assert.equal((files["app/page.tsx"].match(/<AdminDriverPoolControl/g) || []).length, 1);
includes("app/page.tsx", [
  "Manual assignment with payout control.", "Apply Driver to Draft",
  "loadAdminDriverPoolPendingBooking", "onLoadBooking={loadAdminDriverPoolPendingBooking}",
  "Cancel Driver Assignment", "cancelAssignedDriverPoolAssignment",
  "driverPoolAssignmentCancelled", "setDriverPoolAssignmentCancelled(false)",
  "setDriverPoolAssignmentCancelled(true)",
  'text: "Please assign driver."',
  'requiresExplicitPayout={normalizeBookingType(booking.bookingType) === "DSP"}',
]);
assert.equal(
  (files["app/api/admin-driver-job-bid-offers/route.ts"].match(/export async function GET/g) || []).length,
  1,
  "the compact Admin pending list must reuse the one existing Driver Pool GET route",
);
const assignmentHandlerStart = files["app/page.tsx"].indexOf("async function assignDraftDriver()");
const assignmentHandlerEnd = files["app/page.tsx"].indexOf("async function copyDraftDriverDispatch()", assignmentHandlerStart);
const assignmentHandler = files["app/page.tsx"].slice(assignmentHandlerStart, assignmentHandlerEnd);
assert.ok(assignmentHandlerStart >= 0 && assignmentHandlerEnd > assignmentHandlerStart, "Assigned Driver action handler missing");
assert.ok(
  assignmentHandler.indexOf("if (saveLoadedDriverAssignmentAvailable)") <
    assignmentHandler.indexOf("if (currentAssignedDriverPoolAdminOffer)"),
  "A deliberately selected replacement Driver must retain the established saved-assignment action before Pool cancellation",
);
assert.ok(
  assignmentHandler.indexOf("if (currentAssignedDriverPoolAdminOffer)") <
    assignmentHandler.indexOf("if (draftDriverAssignmentApplied)"),
  "The visible Cancel Driver Assignment state must reach atomic cancellation before the old local draft-clear branch",
);

includes("app/driver-portal/page.tsx", [
  "Available Jobs", "Fixed driver payout · earliest pickup first",
  "SGD {job.offer_payout_sgd.toFixed(2)}", ">Accept<", ">Decline<", "Load more",
  "Pickup area", "Drop-off area", "Offer closes", "job.safe_pickup_area",
  "job.safe_dropoff_area", "job.closes_at", "if (!driverPoolAccountSession)",
  "setAvailableJobs([])",
  "driverPoolAvailableJobsRefreshIntervalMs", "window.setInterval",
  'document.visibilityState === "visible"', "quiet: true",
]);
excludes("app/driver-portal/page.tsx", [/customer_price|invoice_number|paynow|bank_account|payout_comparison|internal_finance/i]);
includes("lib/driver-device-push-notification.ts", [
  '"available_jobs" | "messages"', "A driver-pool job is available. Open the app to review.",
  "Accepted! Pls ack when admin send job link", 'notification_kind?: "available" | "winner"',
  "sendDriverDeviceSilentRefreshForDriverPoolOffer", "Job assignment cancelled, do not proceed.",
  'target_path: "/driver-portal?view=available-jobs"',
]);
includes("driver-companion/App.tsx", ['request.openTarget === "available_jobs"', "/driver-portal?view=available-jobs"]);
includes("driver-companion/src/driver-webview-bridge.ts", [
  '"available_jobs" | "messages" | null', '"available_jobs"',
  'parsed.searchParams.get("view") === "available-jobs"',
]);
includes("driver-companion/src/native-notifications.ts", ['notification.open_target === "available_jobs"']);
includes("public/prestige-driver-push-sw.js", [
  "/driver-portal?view=available-jobs",
  "A driver-pool job is available. Open the app to review.",
  "Accepted! Pls ack when admin send job link",
  "Job assignment cancelled, do not proceed.",
]);

const assignmentCancellationMigration = files["supabase/migrations/20260905012642_driver_pool_admin_cancel_assigned_offer.sql"];
for (const fragment of [
  "create or replace function public.cancel_driver_pool_offer",
  "Only an untouched assigned Driver Pool offer without a Driver Job Link or Driver status may be cancelled.",
  "offer_status = 'cancelled'",
  "driver_id = null",
  "driver_payout_override = null",
  "driver_payout_reason = null",
  "from public.driver_job_links",
  "from public.driver_job_status_events",
  "accepted Driver Pool assignment cancelled before Driver Job Link issuance",
  "'admin_dispatcher_override', v_booking.booking_reference, 'admin_api'",
  "create or replace function public.accept_driver_pool_offer",
  "other_recipient_driver_ids",
  "booking_assigned_elsewhere",
  "revoke all on function public.cancel_driver_pool_offer",
  "grant execute on function public.cancel_driver_pool_offer",
  "p.prosecdef",
  "security invoker",
]) assert.ok(assignmentCancellationMigration.includes(fragment), `assignment cancellation migration missing ${fragment}`);
assert.doesNotMatch(assignmentCancellationMigration, /(?:company_id|booker_id|traveler_id|customer_price_amount|invoice|billing|payment|paynow|bank_account)\s*=/i);
assert.doesNotMatch(assignmentCancellationMigration, /insert\s+into\s+public\.driver_job_links/i);
assert.doesNotMatch(assignmentCancellationMigration, /insert\s+into\s+public\.driver_job_status_events/i);
assert.doesNotMatch(assignmentCancellationMigration, /(?:insert\s+into|update|delete\s+from)\s+public\.[a-z0-9_]*(?:calendar|message|live_location|gps)/i);

const migration = files["supabase/migrations/20260904112430_driver_pool_fast_accept.sql"];
for (const fragment of [
  "offer_payout_sgd numeric(10,2)", "driver_job_bid_offers_one_open_per_booking_key",
  "publish_driver_pool_offer", "accept_driver_pool_offer", "decline_driver_pool_offer",
  "cancel_driver_pool_offer", "list_driver_pool_available_jobs", "for update", "schedule_conflict",
  "offset v_offset limit v_limit + 1", "v_count > v_limit",
  "close_driver_pool_offer_on_booking_change", "v_reason:='booking_assigned_elsewhere'",
  "v_reason:='booking_terminal'", "v_reason:='booking_amended'",
  "revoke all on table public.driver_job_bid_offers from anon, authenticated",
  "grant execute on function public.accept_driver_pool_offer", "'driver_id',null",
  "Driver ACK remains pending", "v_booking.public_booking_reference",
]) assert.ok(migration.includes(fragment), `migration missing ${fragment}`);
assert.ok(
  files["supabase/migrations/202606090002_driver_portal_bidding_foundation.sql"].includes("driver_job_bids_one_accepted_bid_per_offer_key"),
  "foundation must retain the one accepted driver per offer unique index",
);
assert.doesNotMatch(migration, /update\s+public\.bookings\s+set[\s\S]{0,500}(customer_rate|driver_payout|invoice|payment|paynow)/i);
assert.doesNotMatch(migration, /insert\s+into\s+public\.driver_job_links/i);
assert.doesNotMatch(migration, /insert\s+into\s+public\.driver_job_status_events/i);
assert.doesNotMatch(migration, /(?:insert\s+into|update|delete\s+from)\s+public\.[a-z0-9_]*(?:calendar|message|live_location|gps)/i);

const completionMigration = files["supabase/migrations/20260904125321_driver_pool_completion_repair.sql"];
for (const fragment of [
  "create or replace function public.accept_driver_pool_offer",
  "driver_payout_override = v_offer.offer_payout_sgd",
  "driver_payout_reason = 'Driver Pool accepted fixed offer.'",
  "First valid Driver Pool acceptance assigned the verified Driver at the exact accepted fixed payout",
  "revoke all on function public.accept_driver_pool_offer",
  "grant execute on function public.accept_driver_pool_offer",
]) assert.ok(completionMigration.includes(fragment), `completion migration missing ${fragment}`);
assert.doesNotMatch(
  completionMigration,
  /(?:customer_rate|customer_price_amount|invoice|billing|payment|paynow|bank_account)\s*=/i,
);
assert.doesNotMatch(completionMigration, /insert\s+into\s+public\.driver_job_links/i);
assert.doesNotMatch(completionMigration, /insert\s+into\s+public\.driver_job_status_events/i);
assert.doesNotMatch(completionMigration, /(?:insert\s+into|update|delete\s+from)\s+public\.[a-z0-9_]*(?:calendar|message|live_location|gps)/i);

const concurrencyMigration = files["supabase/migrations/20260904190552_driver_pool_exact_concurrency_tokens.sql"];
for (const fragment of [
  "public.publish_driver_pool_offer(text,timestamptz,numeric,text,text,text)",
  "public.cancel_driver_pool_offer(text,timestamptz,text,text)",
  "public.accept_driver_pool_offer(text,bigint,timestamptz,text)",
  "Saved booking changed. Reload before publishing.",
  "Driver Pool offer changed. Reload before cancelling.",
  "Saved booking changed during Driver Pool acceptance.",
  "pg_get_functiondef",
  "p.prosecdef",
  "SECURITY INVOKER",
  "v_security_definer is distinct from false",
  "replace(v_function_definition, '40001', 'P0001')",
  "revoke all on function public.publish_driver_pool_offer",
  "grant execute on function public.publish_driver_pool_offer",
]) assert.ok(concurrencyMigration.includes(fragment), `concurrency migration missing ${fragment}`);
assert.doesNotMatch(
  concurrencyMigration,
  /using\s+errcode\s*=\s*'40001'/i,
  "Driver Pool business-stale checks must not use the retryable serialization-failure code",
);
assert.doesNotMatch(
  concurrencyMigration,
  /(?:company_id|booker_id|traveler_id|customer_rate|customer_price_amount|invoice|billing|payment|paynow|bank_account)\s*=/i,
);
assert.doesNotMatch(concurrencyMigration, /insert\s+into\s+public\.driver_job_links/i);
assert.doesNotMatch(concurrencyMigration, /insert\s+into\s+public\.driver_job_status_events/i);
assert.doesNotMatch(
  concurrencyMigration,
  /(?:insert\s+into|update|delete\s+from)\s+public\.[a-z0-9_]*(?:calendar|message|live_location|gps)/i,
);

includes("lib/admin-driver-job-link-persistence.ts", [
  "A Driver Job Link cannot be created for a completed or cancelled booking.",
  "Cancel the open Driver Pool offer or wait for one Driver to accept before Create Link.",
  "PRESTIGE_DRIVER_POOL_ENABLED",
]);

console.log("Driver Pool fast-accept guard passed.");
