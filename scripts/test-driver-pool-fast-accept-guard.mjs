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
  "supabase/migrations/202606090002_driver_portal_bidding_foundation.sql",
  "supabase/migrations/20260904112430_driver_pool_fast_accept.sql",
  "supabase/migrations/20260904125321_driver_pool_completion_repair.sql",
  "supabase/migrations/20260904190552_driver_pool_exact_concurrency_tokens.sql",
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
          closes_at: "2027-09-05T01:00:00.000Z",
          offer_key: "a".repeat(64),
          offer_payout_sgd: 55,
          offer_status: "cancelled",
          push_target_count: 1,
          recipient_count: 1,
          updated_at: exactOfferTimestamp,
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
  assert.equal(cancelResult.data.updated_at, exactOfferTimestamp);
  assert.equal(exactActionRpcCalls[0].payload.p_expected_updated_at, exactOfferTimestamp);

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
          data: { ok: true, reason: action === "accept" ? "accepted" : "declined" },
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
} finally {
  globalThis.setTimeout = originalSetTimeout;
  console.error = originalConsoleError;
  if (priorFeatureFlag === undefined) delete process.env.PRESTIGE_DRIVER_POOL_ENABLED;
  else process.env.PRESTIGE_DRIVER_POOL_ENABLED = priorFeatureFlag;
  delete globalThis.__driverPoolPushCalls;
  await timeoutHarness.cleanup();
}

includes("app/api/driver-job-bids/route.ts", [
  "verifyDriverAccountSession", "!session.claims.accountId || !session.claims.deviceIdHash",
  "x-prestige-driver-installation-id", "driver-pool-offers-read",
  "driver-pool-offer-accept", "driver-pool-offer-decline",
]);
excludes("app/api/driver-job-bids/route.ts", [/driver_reference.*request|driver_id.*request|service_role|SUPABASE/i]);
includes("app/api/admin-driver-job-bid-offers/route.ts", [
  "resolveAdminDispatcherBoundary", "parseDriverPoolPublishPayload", "publishDriverPoolOffer",
  "parseDriverPoolCancelPayload", "cancelDriverPoolOffer",
]);
includes("app/admin-driver-pool-control.tsx", [
  "Send to Driver Pool", "Cancel Offer", "Booking remains active.", "Pool offer total SGD",
  "eligible Drivers", "push-capable Drivers", "app-only Drivers",
  "Drivers had a push request accepted by provider", "delivery not confirmed",
]);
includes("scripts/test-booking-ui-browser.mjs", [
  "__prestigeDriverPoolOfferRequests", "Pool offer total SGD\\s*Send to Driver Pool",
  'payout === "75.00"', 'sendText === "Send to Driver Pool"',
]);
assert.equal((files["app/page.tsx"].match(/<AdminDriverPoolControl/g) || []).length, 1);
includes("app/page.tsx", [
  "Manual assignment with payout control.", "Apply Driver to Draft",
  'requiresExplicitPayout={normalizeBookingType(booking.bookingType) === "DSP"}',
]);

includes("app/driver-portal/page.tsx", [
  "Available Jobs", "Fixed driver payout · earliest pickup first",
  "SGD {job.offer_payout_sgd.toFixed(2)}", ">Accept<", ">Decline<", "Load more",
  "Pickup area", "Drop-off area", "Offer closes", "job.safe_pickup_area",
  "job.safe_dropoff_area", "job.closes_at", "if (!driverPoolAccountSession)",
  "setAvailableJobs([])",
]);
excludes("app/driver-portal/page.tsx", [/customer_price|invoice_number|paynow|bank_account|payout_comparison|internal_finance/i]);
includes("lib/driver-device-push-notification.ts", [
  '"available_jobs" | "messages"', "A driver-pool job is available. Open the app to review.",
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
]);

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
  "SECURITY INVOKER",
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
