// Actual Pool component, synthetic transport only: discoverability, loading and multi-selection.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { createChromeClient, waitForChromeDebugPort, waitForChromePageTarget, waitForCondition, terminateChildProcess } from './browser-test-helpers.mjs';
const require = createRequire(import.meta.url);
const { webpack } = require('next/dist/compiled/webpack/webpack');
const dir = await mkdtemp('/private/tmp/prestige-pool-picker-');
const options = { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
let client, chrome, server;
try {
  const source = process.env.POOL_PICKER_BASELINE === '1' ? execFileSync('git', ['show', 'HEAD:app/admin-driver-pool-control.tsx'], { encoding: 'utf8' }) : await readFile('app/admin-driver-pool-control.tsx', 'utf8');
  await writeFile(path.join(dir, 'pool.js'), ts.transpileModule(source, { compilerOptions: options }).outputText);
  const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{AdminDriverPoolControl}from'./pool';
    const roster=Array.from({length:6},(_,i)=>({id:i+1,driver_name:'QA Driver '+(i+1),plate_number:'QA'+(i+1),vehicle_type:i===5?'VVV':'AVF',availability_status:'available'}));
    window.picker={loads:0,fail:location.pathname==='/failure',requests:[]};
    window.fetch=async(url,init={})=>{window.picker.requests.push({url:String(url),method:init.method||'GET',body:init.body});
      if((init.method||'GET')!=='GET')throw Error('Selection must never send');
      if(String(url).includes('scope=attention'))return Response.json({ok:true,enabled:true,items:[]});
      const ids=new URL(url,location.origin).searchParams.get('driver_ids')?.split(',').map(Number)||[];
      return Response.json({ok:true,enabled:true,eligible:location.pathname!=='/ineligible',offer:null,driver_alert_readiness:ids.map(id=>({driver_id:id,ready:id!==5}))});};
    function App(){const[drivers,setDrivers]=useState(location.pathname==='/preloaded'?roster:[]);
      return <main className="admin-ops-shell p-2"><AdminDriverPoolControl drivers={drivers} onLoadDrivers={async()=>{window.picker.loads++;if(window.picker.fail)return false;setDrivers(location.pathname==='/empty'?[]:roster);return true;}} savedVehicle="AVF" bookingReference="QA-PICKER" expectedUpdatedAt="2026-09-23T00:00:00.000Z" eligible={location.pathname!=='/ineligible'} disabled={false} requiresExplicitPayout={false} showPleaseAssignDriver={false} suggestedPayout={65} onLoadBooking={async()=>{throw Error('Unexpected booking navigation')}} onCancelAssignment={async()=>{throw Error('Unexpected cancellation')}}/></main>}
    createRoot(document.getElementById('root')).render(<App/>);`;
  await writeFile(path.join(dir, 'entry.js'), ts.transpileModule(entry, { compilerOptions: options }).outputText);
  await new Promise((resolve, reject) => webpack({ mode: 'development', entry: path.join(dir, 'entry.js'), resolve: { modules: [path.join(process.cwd(), 'node_modules')] }, output: { path: dir, filename: 'bundle.js' } }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const bundle = await readFile(path.join(dir, 'bundle.js'));
  const css = (await postcss([tailwind()]).process(await readFile('app/globals.css', 'utf8'), { from: 'app/globals.css' })).css;
  server = createServer((req, res) => { res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');res.end(req.url === '/bundle.js' ? bundle : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const port = Number(process.env.CHROME_DEBUG_PORT || 9248);
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new','--disable-gpu','--disable-background-networking','--no-first-run',`--user-data-dir=${path.join(dir,'chrome')}`,`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
  await waitForChromeDebugPort(port);client=createChromeClient((await waitForChromePageTarget(port)).webSocketDebuggerUrl);await client.ready;await client.send('Page.enable');await client.send('Runtime.enable');
  const errors=[];client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.text));
  const evaluate=async(expression)=>{const r=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
  const wait=expr=>waitForCondition(()=>evaluate(expr),4000,expr);
  const navigate=async(route)=>{await client.send('Page.navigate',{url:origin+route});await wait('Boolean(window.picker)');};
  const click=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Missing enabled button');b.click()})()`);
  for(const width of [390,412,1280]){
    await client.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
    await navigate('/');await wait('document.querySelectorAll("input[type=checkbox]").length===6');
    await wait('!document.querySelector("input[type=checkbox]").disabled');
    assert.equal(await evaluate('window.picker.loads'),1,'Loads automatically once without a separate button');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'No overflow');
    assert.equal(await evaluate('document.querySelector("input[type=checkbox]").closest("label").getBoundingClientRect().height>=44'),true,'Touchable driver row');
    await evaluate('[...document.querySelectorAll("input[type=checkbox]")].slice(0,3).forEach(e=>e.click())');
    await wait('document.body.innerText.includes("3 selected")');
    // Search narrows visible names; selection remains independent of the filter.
    const search=`document.querySelector('[aria-label="Search Pool drivers"]')`;
    await evaluate(`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(${search},'QA Driver 4');${search}.dispatchEvent(new Event('input',{bubbles:true}))`);
    await wait('document.querySelectorAll("input[type=checkbox]").length===1');
    await evaluate('document.querySelector("input[type=checkbox]").click()');await wait('document.body.innerText.includes("4 selected")');
    await evaluate(`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(${search},'');${search}.dispatchEvent(new Event('input',{bubbles:true}))`);
    await wait('document.querySelectorAll("input[type=checkbox]:checked").length===4');
    assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent==="Send to selected drivers").disabled'),false);
    assert.equal(await evaluate('document.querySelectorAll("input[type=checkbox]")[4].disabled&&document.querySelectorAll("input[type=checkbox]")[5].disabled'),true,'Readiness and vehicle restrictions preserved');
    assert.equal(await evaluate('window.picker.requests.every(r=>r.method==="GET")'),true,'No publish on load/search/select');
    const shot=await client.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/prestige-pool-picker-'+width+'.png',Buffer.from(shot.data,'base64'));
    console.log('PASS '+width+'px auto-load, four selections across search, eligible-only controls, no mutation or overflow');
  }
  await navigate('/failure');await wait('document.body.innerText.includes("Drivers could not load")');assert.equal(await evaluate('window.picker.loads'),1,'Failure does not loop');
  await evaluate('window.picker.fail=false');await click('Retry loading drivers');await wait('document.querySelectorAll("input[type=checkbox]").length===6');assert.equal(await evaluate('window.picker.loads'),2);
  await navigate('/empty');await wait('document.body.innerText.includes("No available drivers to select")');assert.equal(await evaluate('window.picker.loads'),1,'Empty response does not loop');
  await navigate('/preloaded');await wait('document.querySelectorAll("input[type=checkbox]").length===6');assert.equal(await evaluate('window.picker.loads'),0,'Reuse existing roster');
  await navigate('/ineligible');await wait('window.picker.requests.length>=2');assert.equal(await evaluate('window.picker.loads'),0,'No auto-load for ineligible job');
  assert.deepEqual(errors,[]);
  const parent=await readFile('app/page.tsx','utf8');assert.match(parent,/onLoadDrivers=\{loadDriverAssignmentDisplayDrivers\}/,'Reuse established roster read');
  console.log('PASS clear failed/empty states, explicit retry, no reload loop, same parent reader, zero browser exceptions');
} finally {client?.close();if(chrome)await terminateChildProcess(chrome);if(server)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
