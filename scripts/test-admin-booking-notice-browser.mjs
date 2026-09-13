// Mount the actual Dashboard notice JSX with synthetic save results and the actual
// read-only Dispatch loader. Only the final booking read/form handoff are stubbed.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import ts from "typescript";
import { createChromeClient, waitForChromeDebugPort, waitForChromePageTarget, waitForCondition, terminateChildProcess } from "./browser-test-helpers.mjs";
const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");
const source = await fs.readFile("app/page.tsx", "utf8");
const slice = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b);
};
const panel = slice("            {dashboardSystemNotices.length > 0 ? (", "\n            <section").trim().slice(1, -1);
const builder = slice("      const savedBookingNotices =", "      const saveMessage =");
const loader = slice("  async function loadAdminAiReadOnlyBookingInDispatch(", "  async function handleAdminAiReadOnlyBookingNavigation(");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "prestige-notice-browser-"));
let chrome, client;
try {
  const testSource = `
    const React = require('react'); const {createRoot} = require('react-dom/client');
    const clean = (v) => String(v ?? '').trim(); const cleanReferenceText = clean;
    const formatAdminBookingPickupDateTime = (v) => v.date && v.time === '1200' ? 'valid' : null;
    const statusClass = () => ''; const adminAppNotificationReadState = {message:null};
    const record = (n) => ({booking_reference:'ADM-SYNTHETIC-'+n,public_booking_reference:'1100'+n});
    window.calls=[];
    async function loadExactAdminBookingPersistenceRecord(ref) {
      window.calls.push({method:'GET',ref});
      await new Promise(r=>setTimeout(r,80));
      if(window.failRead) throw new Error('private failure');
      return {booking_reference:ref};
    }
    const adminBookingPersistenceRecordToCalendarBookingRecord = r=>r;
    async function loadSelectedBooking(r,opts) {window.calls.push({form:r.booking_reference,opts});}
    function setMobileDispatchBookingStep(step) {window.step=step;}
    function focusAdminAiLoadedBookingDetails() {window.focused=true;}
    ${loader}
    function App(){
      const [scenario,setScenario]=React.useState('mixed'); window.scenario=setScenario;
      const [adminAiReadOnlyBookingNavigationPendingKey,setAdminAiReadOnlyBookingNavigationPendingKey]=React.useState('');
      const [message,setMessage]=React.useState(null);
      const savedBookings=[{record:record(1),bookingValue:{date:'2026-10-01',time:'1200',pickup:'A',dropoff:'B'}},
        {record:record(2),bookingValue:{date:'2026-10-02',time:'1200',pickup:'',dropoff:''}}];
      const calendarSyncResults=[{ok:true},{ok:true,skipped:true}];
      if(scenario==='failed') calendarSyncResults[1]={ok:false};
      if(scenario==='success') calendarSyncResults[1]={ok:true};
      ${builder}
      const dashboardSystemNotices=message?[message]:[{tone:'info',text:'PRIVATE INTERNAL SAVE FEEDBACK',bookingNotices:savedBookingNotices}];
      const dashboardSystemNoticeTone='info';
      return (${panel});
    }
    createRoot(document.getElementById('root')).render(<App/>);
  `;
  await fs.writeFile(path.join(temp, "entry.js"), ts.transpileModule(testSource, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText);
  await new Promise((resolve,reject) => webpack({
    mode:"production", entry:path.join(temp,"entry.js"), output:{path:temp,filename:"bundle.js"},
    resolve:{modules:[path.resolve("node_modules")]}, optimization:{minimize:false},
  }, (error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
  const cssFiles = (await fs.readdir('.next/static', {recursive:true})).filter(n=>n.endsWith('.css'));
  assert.ok(cssFiles.length, 'Run the production build before the browser check');
  const css=(await Promise.all(cssFiles.map(n=>fs.readFile('.next/static/'+n,'utf8')))).join('\n');
  await fs.writeFile(path.join(temp,"index.html"), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style><main style="padding:12px;font-family:Arial"><div id="root"></div></main><script src="bundle.js"></script>');
  const port=Number(process.env.CHROME_DEBUG_PORT||9268);
  chrome=spawn(process.env.CHROME_BINARY||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
    '--headless=new','--disable-gpu','--disable-background-networking','--disable-extensions','--no-first-run',
    '--no-default-browser-check','--remote-debugging-port='+port,'--user-data-dir='+path.join(temp,'profile'),'about:blank',
  ],{stdio:'ignore'});
  await waitForChromeDebugPort(port);
  const target=await waitForChromePageTarget(port);client=createChromeClient(target.webSocketDebuggerUrl);await client.ready;
  await client.send('Page.enable');await client.send('Runtime.enable');
  const errors=[];client.on('Runtime.exceptionThrown',e=>errors.push(e));
  const evaluate=async(expression)=>{
    const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value;
  };
  await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await client.send('Page.navigate',{url:'file://'+path.join(temp,'index.html')});
  await waitForCondition(()=>evaluate('document.querySelector("button")?.textContent.includes("Open in Dispatch")'),10000,'notice mounted');
  assert.equal(await evaluate('document.querySelectorAll("button").length'),1);
  assert.ok((await evaluate('document.body.innerText')).includes('Booking 11002 — Add pickup or drop-off.'));
  assert.equal(await evaluate('/ADM-|PRIVATE|no guest email|No queued/.test(document.body.innerText)'),false);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await evaluate('document.querySelector("button").click()');
  await waitForCondition(()=>evaluate('window.calls.some(c=>c.form)'),5000,'exact form opened');
  const calls=await evaluate('window.calls');
  assert.equal(calls[0].ref,'ADM-SYNTHETIC-2');assert.equal(calls[0].method,'GET');
  assert.equal(calls[1].form,'ADM-SYNTHETIC-2');assert.equal(calls[1].opts.suppressCustomerRequestHandledMemory,true);
  assert.equal(await evaluate('window.step'), 'details');assert.equal(await evaluate('window.focused'),true);
  await evaluate('window.scenario("success")');
  await waitForCondition(()=>evaluate('document.querySelectorAll("button").length===0'),5000,'success no action');
  await evaluate('window.scenario("failed")');
  await waitForCondition(()=>evaluate('document.body.innerText.includes("Calendar not updated")'),5000,'failure visible');
  await evaluate('window.failRead=true;document.querySelector("button").click()');
  await waitForCondition(()=>evaluate('document.body.innerText.includes("Could not open this booking. Try again.")'),5000,'read failure visible');
  assert.equal((await evaluate('window.calls.filter(c=>c.form).length')),1,'Failed read must not load stale form');
  assert.deepEqual(errors,[]);
  console.log('Admin booking notice browser passed at 390px: actual JSX, exact read-only Dispatch click, no overflow, no internal text, success and read failures.');
} finally {
  client?.close(); if(chrome)await terminateChildProcess(chrome);await fs.rm(temp,{recursive:true,force:true});
}
