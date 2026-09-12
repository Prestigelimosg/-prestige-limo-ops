import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createChromeClient, waitForChromeDebugPort, waitForChromePageTarget, waitForCondition, terminateChildProcess } from "./browser-test-helpers.mjs";
const appUrl=process.env.APP_URL || "http://127.0.0.1:3123";
assert.ok(["127.0.0.1","localhost"].includes(new URL(appUrl).hostname),"Synthetic UI test is local-only");
const profile=await mkdtemp(path.join(os.tmpdir(),"prestige-manual-copy-browser-"));
const port=Number(process.env.CHROME_DEBUG_PORT || 9352);
const chrome=spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",[
  "--headless=new",`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,"--no-first-run","--no-default-browser-check","about:blank",
],{stdio:"ignore"});
let client;
try {
  await waitForChromeDebugPort(port); const target=await waitForChromePageTarget(port);
  client=createChromeClient(target.webSocketDebuggerUrl);await client.ready;
  await client.send("Page.enable");await client.send("Runtime.enable");
  const errors=[];client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.text));
  const evaluate=async(expression)=>{
    const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
    assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
  };
  await client.send("Page.addScriptToEvaluateOnNewDocument",{source:`
    window.qaCopies=[];window.qaWrites=[];window.qaReadCount=0;
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.qaCopies.push(text)},configurable:true});
    const original=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const u=new URL(typeof input==='string'?input:input.url,location.href);
      if(u.origin!==location.origin)throw Error('External request forbidden');
      if(!u.pathname.startsWith('/api/'))return original(input,init);
      window.qaReadCount++;
      if((init?.method||'GET')!=='GET'){window.qaWrites.push(u.pathname);return Response.json({ok:false},{status:403});}
      return Response.json({ok:true,bookings:[],notifications:[],statuses:[],items:[],links:[],read_gate_open:true,status:'ready',has_more:false});
    };
  `});
  await client.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await client.send("Page.navigate",{url:appUrl});
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitForCondition(()=>evaluate(`!!document.querySelector('[data-app-tab="dispatch"]')`),30000,'Dispatch tab');
  await waitForCondition(()=>evaluate('window.qaReadCount>0'),15000,'hydrated initial reads');
  await click('[data-app-tab="dispatch"]');
  await waitForCondition(()=>evaluate(`document.querySelector('[data-app-tab="dispatch"]').getAttribute('aria-selected')==='true'`),10000,'Dispatch selected');
  await fill('textarea[placeholder="Paste WhatsApp, email, or screenshot OCR text here."]',
    'Booking type: DEP\nVehicle: VVV\nDate: 14/09/2026\nTime: 18:00\nFlight: QA123\nPickup: Example Hotel\nDrop-off: Changi Airport\nName: Alex Sample\nPax: 2');
  await evaluate(`Array.from(document.querySelectorAll('[data-dispatcher-intake-action-row] button')).find(e=>e.textContent.trim()==='Create Job Card').click()`);
  await waitForCondition(()=>evaluate(`document.querySelector('[data-copy-preview="driverDispatch"]')?.textContent.includes('VVV DEP')`),10000,'generated manual copy');
  await click('[data-mobile-dispatch-quick-step="options"]');
  await waitForCondition(()=>evaluate(`document.querySelector('[data-driver-message-disclosure]').getClientRects().length>0`),10000,'visible manual copy Options panel');
  const preview=()=>evaluate(`document.querySelector('[data-copy-preview="driverDispatch"]').textContent`);
  const initial=await preview();
  assert.doesNotMatch(initial,/DRIVER DISPATCH|^Driver:/m);
  for(const fragment of ['VVV DEP','14 Sept 2026','1800hrs','Example Hotel','Alex Sample','Pax: 2'])assert.ok(initial.includes(fragment),fragment + ": " + initial);
  const customerBefore=await evaluate(`document.querySelector('[data-copy-preview="customerCopy"]').textContent`);
  const jobBefore=await evaluate(`document.querySelector('[data-copy-preview="jobCard"]').textContent`);
  const linkBefore=await evaluate(`document.querySelector('[data-driver-job-link-preview-disclosure]')?.textContent`);
  await evaluate(`document.querySelector('[data-driver-message-disclosure]').open=true;document.querySelector('[data-dispatch-compact-panel="driver-dispatch-copy-preview"]').open=true;`);
  await click('[data-copy-copy-button="driverDispatch"]');
  assert.equal(await evaluate('window.qaCopies.at(-1)'),initial);
  await click('[data-copy-edit-button="driverDispatch"]');
  const edited=initial+'\nManual note: Please call on arrival.';
  await fill('[data-copy-edit-textarea="driverDispatch"]',edited);
  await click('[data-copy-save-edit="driverDispatch"]');
  assert.equal(await preview(),edited);
  await click('[data-copy-copy-button="driverDispatch"]');
  assert.equal(await evaluate('window.qaCopies.at(-1)'),edited);
  await click('[data-copy-edit-button="driverDispatch"]');
  await fill('[data-copy-edit-textarea="driverDispatch"]','Discard this local draft');
  await click('[data-copy-cancel-edit="driverDispatch"]');
  assert.equal(await preview(),initial);
  assert.equal(await evaluate(`document.querySelector('[data-copy-preview="customerCopy"]').textContent`),customerBefore);
  assert.equal(await evaluate(`document.querySelector('[data-copy-preview="jobCard"]').textContent`),jobBefore);
  assert.equal(await evaluate(`document.querySelector('[data-driver-job-link-preview-disclosure]')?.textContent`),linkBefore);
  await evaluate(`document.querySelector('[data-dispatch-compact-panel="driver-dispatch-copy-preview"]').open=true;document.querySelector('[data-driver-message-disclosure]').scrollIntoView({block:'center'})`);
  assert.equal(await evaluate(`document.querySelector('[data-copy-preview="driverDispatch"]').getClientRects().length>0`),true);
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  const shot=await client.send('Page.captureScreenshot',{format:'png'});
  await writeFile('/private/tmp/prestige-manual-copy-mobile.png',Buffer.from(shot.data,'base64'));
  assert.deepEqual(await evaluate('window.qaWrites'),[]);
  assert.deepEqual(errors,[]);
  console.log('Manual copy mobile browser passed: default lines absent, job details retained, preview/edit/save/copy/cancel, other previews unchanged, no overflow/runtime errors/writes.');
} finally {
  if(client)await client.close();await terminateChildProcess(chrome);await rm(profile,{recursive:true,force:true});
}
