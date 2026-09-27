import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createChromeClient, navigateWithLoadEvent, terminateChildProcess, waitForChromeDebugPort, waitForChromePageTarget, waitForCondition } from './browser-test-helpers.mjs';

const source = await readFile('app/driver-portal/page.tsx', 'utf8');
const jobSource = await readFile('app/driver-job/[token]/page.tsx', 'utf8');
const downloadUrl = jobSource.match(/const driverBetaApkDownloadUrl\s*=\s*"([^"]+)"/)?.[1];
assert.ok(downloadUrl, 'Retain the established same-file APK distribution');
assert.ok(source.includes('<AndroidAppUpdate role="driver" dark />'), 'My Jobs retains one existing update action');
assert.ok((await readFile('app/android-app-update.tsx', 'utf8')).includes(downloadUrl), 'Shared update control retains the same Driver download');

if (process.env.BROWSER_CHECK !== '1') {
  console.log('Driver update-link source contract passed; use BROWSER_CHECK=1 with a local app for rendered checks.');
  process.exit(0);
}

const appUrl = process.env.APP_URL || 'http://127.0.0.1:3197';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(appUrl).hostname), 'Synthetic checks must remain local');
const port = Number(process.env.CHROME_DEBUG_PORT || 9399);
const profile = await mkdtemp('/private/tmp/prestige-update-link-browser-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-component-update',
  '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank',
], { stdio: 'ignore' });

function fixture({ embedded, signedIn, build }) {
  if (build !== undefined) window.__PRESTIGE_ANDROID_APP__ = { role: "driver", build };
  window.__updateTestRequests = [];
  window.__updateTestMessages = [];
  if (embedded) Object.assign(window, {
    __PRESTIGE_DRIVER_NATIVE_APP__: true,
    __PRESTIGE_DRIVER_INSTALLATION_ID__: '11111111-1111-4111-8111-111111111111',
    ReactNativeWebView: { postMessage: value => window.__updateTestMessages.push(JSON.parse(value)) },
  });
  const original = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (!url.pathname.startsWith('/api/')) return original(input, options);
    const method = options.method || 'GET';
    window.__updateTestRequests.push({ path: url.pathname, method });
    if (method !== 'GET') throw Error('Unexpected write in update-link test');
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/api/driver-portal/jobs') return signedIn
      ? json({ ok: true, session: 'account', jobs: [], alerts_available: true, alerts: [], alert_count: 0,
          device_alerts: { ready: false, public_key: null }, dismiss_notification_keys: [], native_badge_count: null })
      : json({ ok: false }, 401);
    if (url.pathname === '/api/driver-job-bids') return json({ ok: true, enabled: true, jobs: [], has_more: false });
    throw Error('Unexpected API path ' + url.pathname);
  };
}

let client;
try {
  await waitForChromeDebugPort(port);
  const target = await waitForChromePageTarget(port);
  client = createChromeClient(target.webSocketDebuggerUrl); await client.ready;
  await client.send('Runtime.enable'); await client.send('Page.enable');
  const errors = [];
  client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => errors.push(exceptionDetails.text));
  const evaluate = async expression => (await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  let injected;
  for (const test of [
    { ua: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36', embedded: true, signedIn: true, width: 390, visible: true },
    { ua: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36', embedded: true, signedIn: false, width: 320, visible: true },
    { ua: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36', embedded: false, signedIn: false, width: 390, visible: false },
    { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', embedded: true, signedIn: true, width: 390, visible: false },
    { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36', embedded: false, signedIn: true, width: 1280, visible: false },
    ...['13', '14', '15', 'invalid'].map(build => ({ ua: 'Mozilla/5.0 Android 14', embedded: true, signedIn: true, width: 390, build, visible: build === '13' || build === 'invalid' })),
  ]) {
    if (injected) await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected });
    injected = (await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${fixture.toString()})(${JSON.stringify(test)})` })).identifier;
    await client.send('Emulation.setUserAgentOverride', { userAgent: test.ua });
    await client.send('Emulation.setDeviceMetricsOverride', { width: test.width, height: 844, deviceScaleFactor: 1, mobile: test.width < 600 });
    await navigateWithLoadEvent(client, appUrl + '/driver-portal');
    await waitForCondition(() => evaluate(`window.__updateTestRequests.some(r => r.path === '/api/driver-portal/jobs') && !document.body.innerText.includes('Loading your jobs')`), 10000, 'portal hydration');
    const readLink = `document.querySelector('[data-driver-portal-update-download]')`;
    if (test.visible) {
      await waitForCondition(() => evaluate(`Boolean(${readLink})`), 10000, 'Android update action');
      assert.equal(await evaluate(`${readLink}.href`), downloadUrl);
      assert.equal(await evaluate(`${readLink}.textContent.trim()`), test.build === '13' ? 'Update Driver App' : 'Download Driver App');
      assert.equal(await evaluate(`${readLink}.referrerPolicy`), 'no-referrer');
      assert.equal(await evaluate(`${readLink}.rel`), 'noopener noreferrer');
      assert.equal(await evaluate(`${readLink}.target`), '_blank');
      assert.equal(await evaluate(`document.querySelectorAll('[data-driver-portal-update-download]').length`), 1);
      assert.ok(await evaluate(`(() => { const r=${readLink}.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.height>=44; })()`), 'Tap target fits narrow phones');
      const before = await evaluate(`JSON.stringify(window.__updateTestMessages)`);
      await evaluate(`${readLink}.addEventListener('click', e => { e.preventDefault(); window.__updateTestClicked=e.currentTarget.href; }, { once:true }); ${readLink}.click()`);
      assert.equal(await evaluate('window.__updateTestClicked'), downloadUrl);
      assert.equal(await evaluate(`JSON.stringify(window.__updateTestMessages)`), before, 'Update click sends no native job/alert/account command');
      if (test.signedIn) {
        const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
        await writeFile('/private/tmp/driver-update-link-android.png', Buffer.from(screenshot.data, 'base64'));
      }
    } else assert.equal(await evaluate(`Boolean(${readLink})`), false, 'No Android APK action on another surface');
    assert.deepEqual(await evaluate(`window.__updateTestRequests.filter(r => r.method !== 'GET')`), [], 'No writes');
  }
  assert.deepEqual(errors, [], 'No browser exceptions');
  console.log('PASS: rendered Android update link, same download, signed-in/no-job and sign-in access, 320/390px, iOS/browser isolation, no native commands or API writes. Click navigation intercepted; physical APK installation remains untested.');
} finally {
  await client?.close(); await terminateChildProcess(chrome); await rm(profile, { recursive: true, force: true });
}
