import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = fs.readFileSync('lib/driver-device-push-notification.ts', 'utf8');
// Reuse the established sender fixtures without executing its unrelated UI-string assertions.
const fixtureSource = fs.readFileSync('scripts/test-driver-job-device-push-alert-guard.mjs', 'utf8');
const start = fixtureSource.indexOf('class QueryBuilder');
const end = fixtureSource.indexOf('\ntry {', start);
assert.ok(start > 0 && end > start);
const { createMockClient, configuredEnv } = vm.runInNewContext(
  fixtureSource.slice(start, end) + '\n({createMockClient, configuredEnv})', { Promise },
);
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText, {
  module, exports: module.exports, process, URL, Date, AbortController, AbortSignal,
  setTimeout, clearTimeout, Response,
  fetch: () => { throw new Error('Real delivery is forbidden in this guard'); },
  require: name => name === './driver-job-link.ts' ? {
    hashDriverJobLinkToken: token => 'hash:' + token,
    isDriverJobLinkExpired: () => false,
    isDriverJobLinkExpiryOutsideAllowedWindow: () => false,
  } : name === './native-push-badge-count.ts' ? {
    reserveNativePushBadgeCount: async () => null,
    releaseNativePushBadgeCount: async () => false,
    resetNativePushBadgeCount: async () => false,
  } : require(name),
});
const helper = module.exports;
const native = { auth: 'native_expo_push_token', p256dh: 'native_expo_push_token',
  endpoint: 'ExpoPushToken[abcdefghijklmnopqrstuvwxyz1234567890]', source_surface: 'driver_native_ios' };
const web = { auth: 'web-auth', p256dh: 'web-key', endpoint: 'https://push.example.test/driver', source_surface: 'driver_portal' };
const linkId = '11111111-1111-4111-8111-111111111111';
const token = 'NEW-PRIVATE-DRIVER-JOB-TOKEN';
async function issued({ acknowledged = false, amendment = false, overrides = {}, input = {}, reject = false } = {}) {
  const nativeCalls = [], webCalls = [];
  const client = createMockClient({ acknowledged, nativeHandoff: true, subscriptions: [native, web], ...overrides });
  const result = await helper.sendDriverDevicePushAlertForNewJobLink(client, {
    driver_job_link_id: linkId, driver_job_token: token, amendment, ...input,
  }, { env: configuredEnv, badgeClient: null,
    pushSender: async (_subscription, payload) => { webCalls.push(payload); if (reject) throw new Error('mock failure'); },
    nativeFetch: async (url, init) => {
      assert.equal(url, 'https://exp.host/--/api/v2/push/send');
      nativeCalls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({data:{status:reject?'error':'ok'}}), {status:reject?503:200});
    },
  });
  return { result, nativeCalls, webCalls, client };
}
for (const acknowledged of [false, true]) for (const amendment of [false, true]) {
  const { result, nativeCalls, webCalls, client } = await issued({acknowledged, amendment});
  assert.equal(result.ok, true);
  assert.equal(nativeCalls.length, 1);
  assert.equal(webCalls.length, 1);
  const payload = nativeCalls[0];
  assert.equal(payload.body, amendment || acknowledged ? 'Job updated. Tap to review.' : 'Open and ack the job.');
  assert.deepEqual(Object.keys(payload).sort(), ['body','data','priority','sound','tag','title','to']);
  assert.equal(payload.to, native.endpoint);
  assert.equal(payload.title, 'Prestige Driver');
  assert.equal(payload.sound, 'default');
  assert.equal(payload.priority, 'high');
  assert.equal(payload.data.job_key, helper.opaqueDriverJobLinkKey(linkId));
  assert.deepEqual(Object.keys(payload.data).sort(), ['job_key','sent_at']);
  assert.equal(payload.tag, 'prestige-driver-job-' + payload.data.job_key);
  assert.ok(Number.isFinite(payload.data.sent_at));
  assert.doesNotMatch(JSON.stringify(payload), /NEW-PRIVATE|PRIVATE-BOOKING|customer|passenger|price|payout|invoice|paynow/i);
  assert.equal(webCalls[0].body, amendment ? 'Job updated. Tap to review.' : 'New Driver Job issued. Tap to review.');
  assert.equal(webCalls[0].target_path, '/driver-job/' + token);
  assert.ok(client.calls.filter(call=>call.operation!=='select').length === 0, 'No ACK or business writes');
}
for (const overrides of [{nativeHandoff:false}, {activeOnePhoneAccount:false}, {subscriptions:[native,native]}]) {
  const result = await issued({overrides});
  assert.equal(result.nativeCalls.length, 0, 'Eligibility is unchanged');
}
for (const test of [{input:{driver_job_token:'WRONG-PRIVATE-DRIVER-JOB-TOKEN'}}, {overrides:{linkStatus:'revoked'}}]) {
  const result = await issued(test);
  assert.equal(result.result.ok, false);
  assert.equal(result.nativeCalls.length + result.webCalls.length, 0);
}
const failed = await issued({reject:true});
assert.equal(failed.result.ok, false);
assert.equal(failed.nativeCalls.length, 1, 'No new retry sender');
for (const [kind, expected] of [
  ['available','A driver-pool job is available. Open the app to review.'],
  ['winner','Accepted! Pls ack when admin send job link'],
  ['assignment_cancelled','Job assignment cancelled, do not proceed.'],
]) {
  let message;
  const result = await helper.sendDriverDevicePushAlertForDriverPoolOffer(
    createMockClient({subscriptions:[native]}),
    {driver_id:8,offer_key:'a'.repeat(64),notification_kind:kind,public_booking_reference:'11060'},
    {env:configuredEnv,nativePushSender:async (recipient,key,target,body)=>{
      assert.equal(recipient,native.endpoint); assert.equal(target,'available_jobs');
      assert.match(key,/^[a-f0-9]{64}$/); message=body;
    }},
  );
  assert.equal(result.ok,true); assert.equal(message,expected);
}
console.log('PASS issued-job native copy: new/reused pending ACK, acknowledged recovery, amendments, exact opaque tap/recipient/privacy, eligibility/failure and unchanged Pool stages. All delivery mocked.');
