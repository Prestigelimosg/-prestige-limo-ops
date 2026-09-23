// Render the actual control classes and compiled app CSS, without accounts or network data.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import ts from 'typescript';
import { createChromeClient, waitForChromeDebugPort, waitForChromePageTarget, terminateChildProcess } from './browser-test-helpers.mjs';

const cssSource = await readFile('app/globals.css', 'utf8');
const driverSource = await readFile('app/driver-job/[token]/page.tsx', 'utf8');
const poolSource = await readFile('app/admin-driver-pool-control.tsx', 'utf8');
function controls(source, predicate) {
  const file = ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attributes = Object.fromEntries(node.attributes.properties.filter(p => ts.isJsxAttribute(p) && p.initializer && ts.isStringLiteral(p.initializer)).map(p => [p.name.getText(file), p.initializer.text]));
      if (predicate(attributes)) matches.push({ tag: node.tagName.getText(file), attributes });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return matches;
}
const driver = controls(driverSource, a => Object.keys(a).some(k => /^data-driver-job-detail-(name|contact|plate|vehicle-model)$/.test(k) || k === 'data-driver-job-details-raw'));
const pool = controls(poolSource, a => a['aria-label'] === 'Search Pool drivers');
assert.equal(driver.length, 5);
assert.equal(pool.length, 1);
for (const field of [...driver, ...pool]) assert.ok(['input', 'textarea'].includes(field.tag));
// Check the real ancestor label sizes, including the unlayered input font:inherit rule.
assert.match(driverSource, /<label className="block space-y-1 text-sm font-semibold text-slate-700">\s*<span>Contact \/ Mobile number/);
assert.match(poolSource, /<label className="text-xs font-semibold text-slate-700">Search drivers/);
const compiled = await postcss([tailwind()]).process(cssSource, { from: 'app/globals.css' });
const escape = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const render = ({ tag, attributes }, index) => `<${tag} id="field-${index}" ${Object.entries(attributes).map(([k, v]) => `${k === 'className' ? 'class' : k}="${escape(v)}"`).join(' ')}>${tag === 'textarea' ? '</textarea>' : ''}`;
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${compiled.css}</style></head><body>
<section data-driver-job-details-editor="true">${driver.map((f, i) => `<label class="block text-sm">Driver field${render(f, i)}</label>`).join('')}<button id="driver-button" class="text-sm">Save &amp; Acknowledge Job</button></section>
<section class="admin-ops-shell"><label class="text-xs">Selected drivers${render(pool[0], 5)}</label><label class="text-sm"><input id="other-admin" class="text-sm"></label></section>
<section data-customer-booking-page="true"><label class="text-sm"><input id="customer" class="text-sm"></label></section></body></html>`;
const dir = await mkdtemp('/private/tmp/prestige-font-guard-');
const port = Number(process.env.CHROME_DEBUG_PORT || 9247);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run', `--user-data-dir=${dir}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
let client;
try {
  await waitForChromeDebugPort(port);
  client = createChromeClient((await waitForChromePageTarget(port)).webSocketDebuggerUrl);
  await client.ready;
  await client.send('Page.enable');
  const { frameTree } = await client.send('Page.getFrameTree');
  await client.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
  const measure = async () => {
    const r = await client.send('Runtime.evaluate', { expression: `JSON.stringify({fonts:[...document.querySelectorAll('[id^="field-"]')].map(e=>parseFloat(getComputedStyle(e).fontSize)),other:['other-admin','customer','driver-button'].map(id=>parseFloat(getComputedStyle(document.getElementById(id)).fontSize)),overflow:document.documentElement.scrollWidth>innerWidth})`, returnByValue: true });
    return JSON.parse(r.result.value);
  };
  for (const width of [390, 412, 430, 767, 768, 1280]) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    const result = await measure();
    assert.deepEqual(result.fonts, width < 768 ? [16, 16, 16, 16, 16, 16] : [14, 14, 14, 14, 14, 12], `${width}px affected controls`);
    assert.deepEqual(result.other, [14, 14, 16], `${width}px unrelated controls unchanged (button inherits body font)`);
    assert.equal(result.overflow, false, `${width}px no horizontal overflow`);
    console.log(`PASS ${width}px: ${result.fonts.join('/')}px; unrelated controls unchanged, no overflow`);
  }
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
  await client.send('Runtime.evaluate', { expression: "document.documentElement.style.fontSize='20px'" });
  assert.ok((await measure()).fonts.every(size => size >= 20), 'Respect larger root text size');
  assert.doesNotMatch(await readFile('app/layout.tsx', 'utf8'), /userScalable:\s*false|maximumScale:\s*1\b|user-scalable=no/);
  console.log('PASS larger text preserved; root viewport does not disable pinch zoom. This is CSS/browser evidence, not physical iPhone acceptance.');
} finally {
  client?.close();
  await terminateChildProcess(chrome);
  await rm(dir, { recursive: true, force: true });
}
