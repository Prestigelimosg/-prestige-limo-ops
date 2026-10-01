import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync('driver-companion/src/tracking.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
async function start({ os = 'android', choice = 'continue', active = false, invalid = false, expiresDuringDisclosure = false, foreground = 'granted', background = 'granted' } = {}) {
  const calls = [];
  const job = { token: 'fixture', jobUrl: 'https://app.prestigelimo.sg/driver-job/fixture' };
  const Location = {
    PermissionStatus: { GRANTED: 'granted' }, Accuracy: { High: 4 }, ActivityType: { AutomotiveNavigation: 1 },
    hasStartedLocationUpdatesAsync: async () => active,
    isBackgroundLocationAvailableAsync: async () => true,
    requestForegroundPermissionsAsync: async () => { calls.push('foreground'); return { status: foreground }; },
    requestBackgroundPermissionsAsync: async () => { calls.push('background'); return { status: background }; },
    startLocationUpdatesAsync: async () => calls.push('start'),
    getCurrentPositionAsync: async () => { calls.push('position'); return {}; },
  };
  const deps = {
    'expo-location': Location,
    'react-native': { Platform: { OS: os }, Alert: { alert(title, message, buttons, options) {
      calls.push('disclosure');
      assert.match(title, /location/i);
      assert.match(message, /precise location/);
      assert.match(message, /not in use/);
      assert.match(message, /dispatch/);
      assert.match(message, /customer/i);
      if (choice === 'dismiss') options.onDismiss();
      else buttons.find(b => b.text === (choice === 'continue' ? 'Continue' : 'Not now')).onPress();
    } } },
    './driver-job-contract': {
      checkDriverLocationReadiness: async () => { calls.push('readiness'); if (invalid || (expiresDuringDisclosure && calls.filter(x => x === 'readiness').length === 2)) throw Error('Ineligible'); },
      postDriverLocation: async () => calls.push('post'),
      DriverJobRequestError: class extends Error {},
    },
    './active-job-store': { readActiveJob: async () => active ? job : null, saveActiveJob: async () => calls.push('save') },
    './tracking-constants': { DRIVER_LOCATION_TASK_NAME: 'fixture-task' },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require(name) { assert.ok(deps[name], name); return deps[name]; } });
  try { return { calls, result: await exports.startDriverTracking(job) }; }
  catch (error) { if (!invalid && !expiresDuringDisclosure) throw error; return { calls, error }; }
}
assert.deepEqual((await start()).calls, ['readiness', 'disclosure', 'readiness', 'foreground', 'background', 'save', 'start', 'position', 'post']);
for (const choice of ['cancel', 'dismiss']) {
  const run = await start({ choice });
  assert.deepEqual(run.calls, ['readiness', 'disclosure'], 'declining must not ask permission, capture, persist or send GPS');
  assert.equal(run.result.active, false);
}
assert.deepEqual((await start({ invalid: true })).calls, ['readiness'], 'existing server eligibility gate stays first');
assert.deepEqual((await start({ expiresDuringDisclosure: true })).calls, ['readiness', 'disclosure', 'readiness'], 'recheck failure prevents permission and GPS after consent');
assert.deepEqual((await start({ foreground: 'denied' })).calls, ['readiness', 'disclosure', 'readiness', 'foreground']);
assert.deepEqual((await start({ background: 'denied' })).calls, ['readiness', 'disclosure', 'readiness', 'foreground', 'background']);
assert.deepEqual((await start({ os: 'ios' })).calls, ['readiness', 'foreground', 'background', 'save', 'start', 'position', 'post'], 'iOS permission path unchanged');
assert.deepEqual((await start({ active: true })).calls, ['readiness', 'foreground', 'background', 'save', 'position', 'post'], 'already active tracking does not restart or prompt again');

const policy = readFileSync('app/privacy/page.tsx', 'utf8');
const shell = readFileSync('app/public-information-shell.tsx', 'utf8');
const portal = readFileSync('app/driver-portal/page.tsx', 'utf8');
assert.match(policy, /id="account-deletion"/);
for (const text of ['Prestige SG Driver', 'precise location', 'photos', 'messages', 'info@prestigelimo.sg', 'account and associated data']) assert.ok(policy.includes(text), text);
assert.match(portal, /Privacy &amp; account deletion/);
assert.ok(policy.indexOf('id="account-deletion"') < policy.indexOf('Scope of this policy'));
assert.match(portal, /href="\/privacy"/);
assert.doesNotMatch(policy + shell, /willsglimo@gmail\.com/);
assert.match(policy, /calendar\.events/);
assert.match(policy, /encrypted at rest/);
assert.doesNotMatch(policy, /fetch\(|supabase|localStorage|sessionStorage/);
console.log('PASS Driver Play disclosure ordering/cancel/eligibility/iOS preservation and existing-page privacy/deletion access.');

const bridgeSource = readFileSync('driver-companion/src/driver-webview-bridge.ts', 'utf8');
assert.match(bridgeSource, /allowedReadOnlyPaths/);
assert.ok(bridgeSource.includes('\"/privacy\"'));
assert.doesNotMatch(portal, /href=\"\/privacy#/);
for (const file of ['app/google-calendar/page.tsx', 'app/terms/page.tsx']) assert.doesNotMatch(readFileSync(file, 'utf8'), /willsglimo@gmail\.com/);
