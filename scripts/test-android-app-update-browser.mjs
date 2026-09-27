import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createChromeClient, navigateWithLoadEvent, terminateChildProcess, waitForChromeDebugPort, waitForChromePageTarget, waitForCondition } from './browser-test-helpers.mjs';

const appUrl = process.env.APP_URL || 'http://127.0.0.1:3197';
assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname), 'Local synthetic pages only');
const port = Number(process.env.CHROME_DEBUG_PORT || 9400);
const profile = await mkdtemp('/private/tmp/prestige-all-android-updates-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new','--disable-gpu','--disable-background-networking','--disable-component-update','--no-first-run',
  `--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'about:blank',
], { stdio: 'ignore' });
function fixture(role, build) {
  const id = '11111111-1111-4111-8111-111111111111';
  window.__updateCommands = []; window.__updateRequests = [];
  window.ReactNativeWebView = { postMessage: value => window.__updateCommands.push(value) };
  if (role === 'admin') Object.assign(window, { __PRESTIGE_ADMIN_NATIVE_APP__: true, __PRESTIGE_ADMIN_INSTALLATION_ID__: id });
  if (role === 'customer') Object.assign(window, { __prestigeCustomerInstallationId: id, __prestigeCustomerNativeAlerts: { available: true, enabled: false } });
  if (build !== null) window.__PRESTIGE_ANDROID_APP__ = { role, build };
  const original = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (!url.pathname.startsWith('/api/')) return original(input, options);
    window.__updateRequests.push({ method: options.method || 'GET', path: url.pathname });
    return new Response(JSON.stringify({ ok: false, reason: 'synthetic_unavailable' }), { status: 403, headers: { 'content-type': 'application/json' } });
  };
}
let client;
try {
  await waitForChromeDebugPort(port); const target = await waitForChromePageTarget(port);
  client = createChromeClient(target.webSocketDebuggerUrl); await client.ready;
  await client.send('Runtime.enable'); await client.send('Page.enable');
  const errors = [];
  client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => errors.push(exceptionDetails.text));
  const evaluate = async expression => (await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  let injected;
  for (const [role, path, fileId] of [
    ['admin','/','1zofh8u_QY0-xAsqkM8eN6G7IYp9chqw2'],
    ['customer','/my-bookings','1a2uhL39Fn1JyxaPz8zPfNo9RjnQPJnPa'],
  ]) {
    for (const [build, width, platform] of [[null,390,'Android'],['1',390,'Android'],['2',320,'Android'],[null,390,'iPhone']]) {
      if (injected) await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected });
      injected = (await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${fixture.toString()})(${JSON.stringify(role)},${JSON.stringify(build)})` })).identifier;
      await client.send('Emulation.setUserAgentOverride', { userAgent: `Mozilla/5.0 ${platform}` });
      await client.send('Emulation.setDeviceMetricsOverride', { width, height: 844, mobile: true, deviceScaleFactor: 1 });
      await navigateWithLoadEvent(client, appUrl + path);
      await waitForCondition(() => evaluate(`window.__updateRequests.length > 0 && document.querySelector('h1') !== null`), 20000, role + ' hydration');
      const selector = `[data-android-app-update-download="${role}"]`;
      if (build === null && platform === 'Android') {
        await waitForCondition(() => evaluate(`Boolean(document.querySelector('${selector}'))`), 10000, role + ' download');
        assert.equal(await evaluate(`document.querySelectorAll('${selector}').length`), 1);
        assert.equal(await evaluate(`document.querySelector('${selector}').href`), `https://drive.usercontent.google.com/uc?id=${fileId}&export=download`);
        assert.equal(await evaluate(`document.querySelector('${selector}').textContent.trim()`), `Download ${role === 'admin' ? 'Admin' : 'Customer'} App`);
        assert.ok(await evaluate(`(() => {const r=document.querySelector('${selector}').getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.height>=44;})()`));
        const before = await evaluate(`JSON.stringify(window.__updateCommands)`);
        await evaluate(`document.querySelector('${selector}').addEventListener('click',e=>{e.preventDefault();window.__clickedUpdate=e.currentTarget.href;},{once:true});document.querySelector('${selector}').click()`);
        assert.equal(await evaluate(`JSON.stringify(window.__updateCommands)`), before);
        assert.ok(await evaluate(`window.__clickedUpdate.includes('${fileId}')`));
        await writeFile(`/private/tmp/${role}-android-update.png`, Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      } else assert.equal(await evaluate(`Boolean(document.querySelector('${selector}'))`), false, 'Current/newer build and iOS have no update control');
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-android-app-update-download]')).filter(e=>e.getAttribute('data-android-app-update-download')!==${JSON.stringify(role)}).length`), 0, 'No cross-app download');
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: actual Admin and Customer pages, distinct correct downloads, old-wrapper neutral link, current/newer hiding, iOS exclusion, phone layout, intercepted click with no native commands. All APIs mocked; physical installation untested.');
} catch (error) {
  if (client) console.log((await client.send('Runtime.evaluate',{expression:`JSON.stringify({url:location.href,text:document.body.innerText.slice(0,1200),ua:navigator.userAgent,bridge:typeof window.ReactNativeWebView?.postMessage,installation:window.__prestigeCustomerInstallationId,alerts:window.__prestigeCustomerNativeAlerts,version:window.__PRESTIGE_ANDROID_APP__})`,returnByValue:true})).result.value);
  throw error;
} finally {
  await client?.close(); await terminateChildProcess(chrome); await rm(profile,{recursive:true,force:true});
}
