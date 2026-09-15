import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../node_modules/typescript');



let canonical;
for (const app of ['driver']) {
  const root = `${app}-companion`;
  const source = await readFile(`${root}/src/android-pull-refresh-script.ts`, 'utf8');
  const wrapper = await readFile(`${root}/src/refreshable-webview.tsx`, 'utf8');
  const appSource = await readFile(`${root}/App.tsx`, 'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'), '04b8cad88a77f1e2bca53ddf297aa9c3656a50b6914dd19411c3a2eb22ba9736', 'exact recovered Build3 gesture source');
  assert.equal(createHash('sha256').update(wrapper).digest('hex'), '225786fffbe91e72d386cf89d37e0eeac6733ed77c24facd0f9833d456554382', 'exact recovered Build3 wrapper source');
  canonical ??= source;
  assert.equal(source, canonical, `${app}: same bounded gesture rules`);
  assert.match(appSource, /import \{ WebView \} from "\.\/src\/refreshable-webview"/);
  assert.match(wrapper, /Platform\.OS === "android"/);
  assert.match(wrapper, /webView\.current\?\.reload\(\)/);
  assert.doesNotMatch(wrapper, /navigationKey|authenticate|setItem|fetch\(|axios|ScrollView/);
  assert.match(wrapper, /props\.onMessage\?\.\(event\)/);
  assert.match(wrapper, /props\.onLoadEnd\?\.\(event\)/);
  assert.match(wrapper, /props\.onError\?\.\(event\)/);
}

const script = vm.runInNewContext(canonical.replace('export const androidPullRefreshScript =', ''), { String });
function fixture() {
  const listeners = {};
  const sent = [];
  const root = { scrollTop: 0, scrollHeight: 2000, clientHeight: 800 };
  const indicator = { style: {}, setAttribute() {}, remove() {} };
  const doc = {
    scrollingElement: root, documentElement: root, body: { appendChild() {} },
    activeElement: null, visibilityState: 'visible',
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    createElement() { return indicator; },
  };
  const win = { ReactNativeWebView: { postMessage: value => sent.push(JSON.parse(value)) }, scrollY: 0 };
  win.top = win;
  const target = { parentElement: root, closest: () => null, scrollHeight: 10, clientHeight: 10, scrollTop: 0 };
  const context = { window: win, document: doc, location: { origin: 'https://app.prestigelimo.sg' },
    getComputedStyle: () => ({ overflowY: 'visible', touchAction: 'auto' }), Math, JSON };
  vm.runInNewContext(script, context);
  const fire = (type, x = 100, y = 100, extra = {}) => {
    const e = { target, touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }],
      cancelable: true, preventDefault() {}, ...extra };
    (listeners[type] ?? []).forEach(fn => fn(e));
  };
  const pull = () => { fire('touchstart'); fire('touchmove', 103, 240); fire('touchend', 103, 240, { touches: [] }); };
  return { win, doc, root, target, context, listeners, sent, fire, pull };
}
let f = fixture(); f.pull(); assert.equal(f.sent.length, 1, 'top pull requests exactly one reload');
f.pull(); assert.equal(f.sent.length, 1, 'pending refresh rejects a second gesture');
f.win.__prestigeAndroidPullRefresh.finish(); f.pull(); assert.equal(f.sent.length, 2, 'settlement permits a later pull');
for (const setup of [
  f => { f.root.scrollTop = 20; },
  f => { f.target.closest = () => ({}); },
  f => { f.target.parentElement = { parentElement: f.root, scrollHeight: 1000, clientHeight: 100, scrollTop: 50 }; },
  f => { f.fire('input'); f.win.confirm = () => false; },
  f => { f.win.getSelection = () => ({ isCollapsed: false }); },
  f => { f.doc.visibilityState = 'hidden'; },
]) { f = fixture(); setup(f); f.pull(); assert.equal(f.sent.length, 0, 'unsafe gesture must not reload'); }
f = fixture(); f.fire('input'); f.win.confirm = () => true; f.pull(); assert.equal(f.sent.length, 1, 'confirmed dirty refresh preserves the installed Build3 behavior');
f = fixture(); f.fire('touchstart', 100, 100, { touches: [{ clientX: 100, clientY: 100 }, { clientX: 120, clientY: 100 }] }); f.fire('touchmove', 103, 240); f.fire('touchend', 103, 240, { touches: [] }); assert.equal(f.sent.length, 0, 'multitouch cannot refresh');
f = fixture(); f.fire('touchstart'); f.fire('touchmove', 260, 160); f.fire('touchend', 260, 260, { touches: [] }); assert.equal(f.sent.length, 0, 'horizontal gesture rejected');
f = fixture(); f.fire('touchstart'); f.fire('touchmove', 100, 240); f.fire('touchcancel'); f.fire('touchend', 100, 240, { touches: [] }); assert.equal(f.sent.length, 0, 'cancelled gesture rejected');
f = fixture(); vm.runInNewContext(script, f.context); assert.equal(f.listeners.touchstart.length, 1, 'reinjection is idempotent');
// Execute each adapter's actual callbacks with native reload/injection spies.
for (const app of ['driver']) {
  const source = await readFile(`${app}-companion/src/refreshable-webview.tsx`, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const platform = { OS: 'android' }, appState = { currentState: 'active' };
  const exports = {}, effects = [], timers = new Map();
  let reloads = 0, loadEnds = 0, errors = 0, messages = 0;
  const native = { reload() { reloads++; }, injectJavaScript() {} };
  const nativeType = () => {};
  const element = (type, props) => ({ type, props });
  const mocks = {
    react: {
      forwardRef: fn => fn, useRef: value => ({ current: value }), useCallback: fn => fn,
      useState: value => [value, () => {}], useEffect: () => {},
      useImperativeHandle: (ref, fn) => effects.push(() => { ref.current = fn(); }),
    },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { Platform: platform, AppState: appState, StyleSheet: { create: x => x }, View: 'View', ActivityIndicator: 'Spinner' },
    'react-native-webview': { WebView: nativeType },
    './android-pull-refresh-script': { androidPullRefreshScript: script },
  };
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.ok(mocks[name], `unexpected dependency ${name}`); return mocks[name];
  }, setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) });
  const props = { source: { uri: 'https://app.prestigelimo.sg/driver-portal', headers: { 'x-prestige-driver-installation-id': 'fixture-installation' } },
    sharedCookiesEnabled: true, onShouldStartLoadWithRequest: () => false, injectedJavaScript: 'existingBridge();',
    onLoadEnd() { loadEnds++; }, onError() { errors++; }, onMessage() { messages++; } };
  const ref = { current: null };
  const android = exports.WebView(props, ref);
  const rendered = android.type(android.props, ref);
  const web = rendered.props.children[0].props;
  web.ref.current = native; effects.forEach(fn => fn());
  assert.equal(web.source, props.source, 'Android retains exact URL and request headers');
  assert.equal(web.sharedCookiesEnabled, true);
  assert.equal(web.onShouldStartLoadWithRequest, props.onShouldStartLoadWithRequest, 'existing navigation guard is retained');
  assert.ok(web.injectedJavaScript.startsWith(props.injectedJavaScript), 'existing bridge executes before gesture script');
  assert.equal(ref.current, native, 'existing WebView ref is retained');
  const event = { nativeEvent: { data: JSON.stringify({ type: 'prestige_android_pull_refresh', version: 1 }), url: props.source.uri } };
  web.onMessage(event); assert.equal(reloads, 0, 'do not refresh during initial load');
  web.onLoadEnd(event); assert.equal(loadEnds, 1);
  web.onMessage(event); web.onMessage(event); assert.equal(reloads, 1, 'one native reload per pending gesture');
  [...timers.values()][0](); web.onMessage(event); assert.equal(reloads, 2, 'timeout releases pending indicator');
  web.onError(event); assert.equal(errors, 1); web.onMessage(event); assert.equal(reloads, 3);
  web.onLoadEnd(event);
  appState.currentState = 'background'; web.onMessage(event); assert.equal(reloads, 3, 'background does not refresh or unlock');
  appState.currentState = 'active';
  for (const url of ['https://unrelated.invalid/', 'https://app.prestigelimo.sg.evil.invalid/']) {
    web.onMessage({ nativeEvent: { ...event.nativeEvent, url } }); assert.equal(reloads, 3);
  }
  for (const data of [{ type: 'prestige_android_pull_refresh', version: 2 }, { type: 'prestige_android_pull_refresh', version: 1, token: 'unexpected' }]) {
    web.onMessage({ nativeEvent: { ...event.nativeEvent, data: JSON.stringify(data) } }); assert.equal(reloads, 3, 'invalid refresh messages cannot trigger reload');
  }
  web.onMessage({ nativeEvent: { data: '{"type":"existing_bridge_event"}' } }); assert.equal(messages, 1, 'existing bridge is preserved');
  platform.OS = 'ios'; const ios = exports.WebView(props, ref);
  assert.equal(ios.type, nativeType); assert.equal(ios.props.source, props.source);
  assert.equal(ios.props.onLoadEnd, props.onLoadEnd); assert.equal(ios.props.onMessage, props.onMessage);
}
console.log('Driver Android recovered gesture and callback guard passed.');


const appSource = await readFile('driver-companion/App.tsx', 'utf8');
const config = JSON.parse(await readFile('driver-companion/app.json', 'utf8')).expo;
assert.equal(config.android.googleServicesFile, './google-services.json');
assert.equal(config.android.package, 'sg.prestigelimo.drivercompanion');
assert.equal(config.android.icon, './assets/icon.png');
assert.ok(config.android.versionCode >= 3, 'Never regress installed Build3 version');
assert.equal(config.android.versionCode, 5, 'QA activation candidate advances verified installed Build4 to Build5');
assert.deepEqual(config.plugins.find(p => Array.isArray(p) && p[0] === 'expo-notifications'), ['expo-notifications', { defaultChannel: 'default' }]);
const channelStart = appSource.indexOf('if (Platform.OS === "android") {', appSource.indexOf('const existingToken = await readNativeNotificationToken();'));
const permissionStart = appSource.indexOf('const permission = await Notifications.requestPermissionsAsync();', channelStart);
assert.ok(channelStart > 0 && permissionStart > channelStart, 'channel is initialized before notification permission');
const registration = appSource.slice(channelStart, permissionStart);
const compiledChannel = ts.transpileModule(registration, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
for (const os of ['android', 'ios']) {
  const calls = [];
  await new Function('Platform', 'Notifications', `return (async () => {${compiledChannel}})();`)(
    { OS: os }, { AndroidImportance: { HIGH: 4 }, setNotificationChannelAsync: async (...args) => calls.push(args) });
  assert.deepEqual(calls, os === 'android' ? [['default', { name: 'Job alerts', importance: 4, sound: 'default', showBadge: true }]] : [], 'exact original Android channel and no iOS channel call');
}
console.log('Driver Android release configuration and channel initialization guard passed.');

assert.match(await readFile('docs/current-implementation-ledger.md', 'utf8'), /Driver Android Build 3 Source Recovery For Local Badge Release Preparation/);
assert.match(await readFile('docs/current-implementation-ledger.md', 'utf8'), /Driver Android Build 4 Signed Local APK Checkpoint/);
