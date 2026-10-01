import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const path = 'app/android-app-update.tsx';
const source = readFileSync(path, 'utf8');
const exports = {};
const context = { exports, window: undefined, require: name => {
  if (name === 'react') return { useSyncExternalStore: (_subscribe, get) => get() };
  if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  throw Error('Unexpected dependency ' + name);
} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
const { AndroidAppUpdate, androidAppReleases, readAndroidAppUpdateState } = exports;
assert.deepEqual(['driver', 'admin', 'customer'].map(role => androidAppReleases[role].build),
  [14, 6, 6], 'Only Admin advances to the published, hash-verified exact-alert update');
assert.equal(readAndroidAppUpdateState('driver'), 'hidden', 'SSR has no native state');
const installation = '11111111-1111-4111-8111-111111111111';
for (const role of ['driver', 'admin', 'customer']) {
  const release = androidAppReleases[role];
  assert.ok(Number.isInteger(release.build) && release.build > 0);
  assert.ok(release.url.startsWith('https://drive.usercontent.google.com/uc?id='));
  const native = {
    navigator: { userAgent: 'Mozilla/5.0 Android 14' }, ReactNativeWebView: { postMessage() { throw Error('No bridge write permitted'); } },
    [`__PRESTIGE_${role.toUpperCase()}_NATIVE_APP__`]: true,
    [`__PRESTIGE_${role.toUpperCase()}_INSTALLATION_ID__`]: installation,
    __prestigeCustomerInstallationId: role === 'customer' ? installation : undefined,
    __prestigeCustomerNativeAlerts: role === 'customer' ? { available: true } : undefined,
  };
  context.window = native;
  assert.equal(readAndroidAppUpdateState(role), 'download', 'Older wrapper with unknown version gets neutral download');
  for (const build of [null, '', '0', '-1', '1.0', 'NaN', '999999999999999999999999', {}, []]) {
    native.__PRESTIGE_ANDROID_APP__ = { role, build };
    assert.equal(readAndroidAppUpdateState(role), 'download');
  }
  for (const build of [release.build, release.build + 1]) {
    native.__PRESTIGE_ANDROID_APP__ = { role, build: String(build) };
    assert.equal(readAndroidAppUpdateState(role), 'hidden', 'Current/newer installs must not be offered a downgrade');
    assert.equal(AndroidAppUpdate({ role }), null);
  }
  // Synthetic release increment tests future appearance even for the apps currently at Build 1.
  const current = release.build;
  release.build = current + 1;
  native.__PRESTIGE_ANDROID_APP__ = { role, build: String(current) };
  assert.equal(readAndroidAppUpdateState(role), 'update');
  const rendered = AndroidAppUpdate({ role });
  const link = rendered.props.children[0];
  assert.equal(link.props.href, release.url);
  assert.equal(link.props.referrerPolicy, 'no-referrer');
  assert.equal(link.props.rel, 'noopener noreferrer');
  assert.equal(link.props.target, '_blank');
  assert.equal(link.props.onClick, undefined, 'Download never pretends installation succeeded');
  native.__PRESTIGE_ANDROID_APP__.build = String(current + 1);
  assert.equal(readAndroidAppUpdateState(role), 'hidden', 'Reopened installed update hides the notice');
  release.build = current;
  native.__PRESTIGE_ANDROID_APP__ = { role: role === 'driver' ? 'admin' : 'driver', build: '1' };
  assert.equal(readAndroidAppUpdateState(role), 'hidden', 'A different app cannot receive this app download');
  delete native.__PRESTIGE_ANDROID_APP__;
  native.navigator.userAgent = 'iPhone';
  assert.equal(readAndroidAppUpdateState(role), 'hidden');
  native.navigator.userAgent = 'Android'; delete native.ReactNativeWebView;
  assert.equal(readAndroidAppUpdateState(role), 'hidden', 'Browser alone is not the installed app');
}
assert.equal(new Set(Object.values(androidAppReleases).map(r => r.url)).size, 3);
for (const [file, role] of [['app/driver-portal/page.tsx','driver'],['app/page.tsx','admin'],['app/my-bookings/page.tsx','customer']]) {
  assert.equal((readFileSync(file,'utf8').match(new RegExp(`<AndroidAppUpdate role="${role}"`, 'g')) || []).length, 1, 'One action in each existing page');
}
console.log('PASS: all roles, installed/current/newer/unknown versions, future release/reopen, app isolation, neutral legacy fallback, fixed distinct downloads, no tap-to-hide or notification mutation.');

function extract(file, name) {
  const text = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(ast) === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(found, name);
  return ts.isVariableDeclaration(found) ? `const ${found.getText(ast)};` : found.getText(ast).replace(/^export /, '');
}
for (const role of ['driver','admin','customer']) {
  const file = `${role}-companion/App.tsx`;
  assert.ok(readFileSync(file,'utf8').includes('from "expo-application"'));
  const pkg = JSON.parse(readFileSync(`${role}-companion/package.json`,'utf8'));
  const lock = JSON.parse(readFileSync(`${role}-companion/package-lock.json`,'utf8'));
  assert.equal(pkg.dependencies['expo-application'], lock.packages['node_modules/expo-application'].version, 'Reuse the exact already locked package');
  for (const platform of ['android','ios']) {
    const scope = { installationIdPattern: /^[a-f0-9-]{36}$/i, Platform: { OS: platform }, nativeBuildVersion: '14' };
    if (role === 'customer') {
      vm.runInNewContext(ts.transpileModule(extract(file,'androidAppVersionBootstrap')+'\nthis.script = androidAppVersionBootstrap;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, scope);
    } else {
      const fn = role === 'driver' ? 'embeddedDriverBridgeBootstrap' : 'embeddedAdminBridgeBootstrap';
      const call = role === 'driver' ? `${fn}('${installation}',false,false,null,Platform.OS==='android'?nativeBuildVersion:null)` : `${fn}('${installation}',false,'undetermined',Platform.OS==='android'?nativeBuildVersion:null)`;
      vm.runInNewContext(ts.transpileModule(extract(`${role}-companion/src/${role}-webview-bridge.ts`,fn)+`\nthis.script = ${call};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, scope);
      assert.ok(readFileSync(file,'utf8').includes('Platform.OS === "android" ? nativeBuildVersion : null'), 'Only Android exports installed version');
    }
    const injected = { window: { addEventListener() {}, ReactNativeWebView: { postMessage() {} } }, navigator: {}, document: { readyState: 'loading', addEventListener() {} } };
    vm.runInNewContext(scope.script, injected);
    if (platform === 'ios') assert.equal(injected.window.__PRESTIGE_ANDROID_APP__, undefined, 'iOS bootstrap gains no Android capability');
    else {
      assert.equal(injected.window.__PRESTIGE_ANDROID_APP__.role, role);
      assert.equal(injected.window.__PRESTIGE_ANDROID_APP__.build, '14');
      assert.equal(Object.getOwnPropertyDescriptor(injected.window,'__PRESTIGE_ANDROID_APP__').writable,false);
      assert.equal(Object.isFrozen(injected.window.__PRESTIGE_ANDROID_APP__),true);
      const occupied = { window: { addEventListener() {}, ReactNativeWebView: { postMessage() {} } }, navigator: {}, document: { readyState: 'loading', addEventListener() {} } };
      Object.defineProperty(occupied.window, '__PRESTIGE_ANDROID_APP__', {value: Object.freeze({role,build:'13'}), configurable:false});
      assert.doesNotThrow(() => vm.runInNewContext(scope.script, occupied), 'Existing version metadata cannot interrupt native bridge bootstrap');
      assert.equal(occupied.window.__PRESTIGE_ANDROID_APP__.build, '13');
      if (role !== 'customer') assert.equal(occupied.window[`__PRESTIGE_${role.toUpperCase()}_NATIVE_APP__`], true, 'Existing role bridge still initializes');
    }
  }
}
console.log('PASS: actual three native bootstrap outputs, exact role/build, immutable capability, iOS omission, and pinned existing dependency.');

// Execute the installed WebView external-origin handoff, rather than assuming
// the app's stricter same-origin navigation callback handles download URLs.
const webViewRequire = createRequire(new URL('../customer-companion/package.json', import.meta.url));
const webViewModule = { exports: {} };
const opened = [];
const linking = { canOpenURL: async () => true, openURL: async url => { opened.push(url); } };
vm.runInNewContext(readFileSync(webViewRequire.resolve('react-native-webview/lib/WebViewShared.js'), 'utf8'), {
  module: webViewModule, exports: webViewModule.exports, console,
  require: name => name === 'react-native' ? { Linking: linking }
    : name === 'react' || name === './WebView.styles' || name === 'react/jsx-runtime' ? {} : webViewRequire(name),
});
for (const role of ['driver','admin','customer']) {
  const app = readFileSync(`${role}-companion/App.tsx`, 'utf8');
  assert.ok(app.includes('setSupportMultipleWindows={false}'));
  const whitelist = role === 'customer' ? ['https://app.prestigelimo.sg','https://www.google.com'] : ['https://app.prestigelimo.sg'];
  assert.ok(app.includes(role === 'driver' ? 'originWhitelist={[productionOrigin]}' : `originWhitelist={${JSON.stringify(whitelist).replaceAll(',', ', ')}}`));
  const decisions = [];
  const handler = webViewModule.exports.createOnShouldStartLoadWithRequest((...args) => decisions.push(args), whitelist, () => { throw Error('Download must use existing external-origin handoff'); });
  handler({ nativeEvent: { url: androidAppReleases[role].url, lockIdentifier: 1 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(opened.at(-1), androidAppReleases[role].url);
  assert.equal(decisions[0][0], false, 'Download never navigates protected WebView away');
}
console.log('PASS: installed WebView delegates each exact APK URL to Linking and preserves protected native page.');
