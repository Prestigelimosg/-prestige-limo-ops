// Compiled Driver page, synthetic API only. Never contacts a provider or mutates live data.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {mapBookingToSafeDriverJobPayload} from '../lib/driver-job-link.ts';
import {createChromeClient,waitForChromeDebugPort,waitForChromePageTarget,waitForCondition,terminateChildProcess} from './browser-test-helpers.mjs';
const origin=process.env.APP_URL||'http://127.0.0.1:3198';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname) || (process.env.PRESTIGE_REMARK_DEPLOYED_UI_CHECK === '1' && origin === 'https://app.prestigelimo.sg'), 'Local or explicitly selected deployed UI only; APIs remain intercepted');
const profile=await mkdtemp(path.join(os.tmpdir(),'remark-browser-'));
const port=Number(process.env.CHROME_DEBUG_PORT||9438);
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--disable-background-networking','--no-first-run',`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
let client;const errors=[];
try {
 await waitForChromeDebugPort(port);client=createChromeClient((await waitForChromePageTarget(port)).webSocketDebuggerUrl);await client.ready;
 await client.send('Page.enable');await client.send('Runtime.enable');
 client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails?.text));
 client.on('Runtime.consoleAPICalled',e=>{if(e.type==='error')errors.push(e.args.map(a=>a.value||a.description).join(' '));});
 await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 const payload=mapBookingToSafeDriverJobPayload({booking_reference:'REMARK-BROWSER-QA',booking_type:'TRF',pickup_location:'Test Hotel',dropoff_location:'Test Terminal',passenger_name:'Synthetic Passenger',driver_name:'Synthetic Driver',driver_plate_number:'QA1234A',status:'assigned'});
 const cases=['','Please meet at the side entrance. '+ 'Bring the requested sign. '.repeat(10),'Use the lobby entrance instead.',''];
 await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`
 window.__remarkWrites=[]; const payload=${JSON.stringify(payload)};
 const index=Number(new URLSearchParams(location.search).get('case')||0);
 payload.driverRemark=${JSON.stringify(cases)}[index];
 window.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  const method=init.method||'GET'; if(method!=='GET')window.__remarkWrites.push(method+' '+url.pathname);
  if(url.pathname==='/api/driver-job/remark-browser-synthetic')return Response.json({ok:true,mode:'production',payload});
  return Response.json({ok:false,reason:'unavailable',payload:null});
 };`});
 const evaluate=async expression=>{const r=await client.send('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
 for(const embedded of ['', '&embedded=ios'])for(let i=0;i<cases.length;i++){
  await client.send('Page.navigate',{url:`${origin}/driver-job/remark-browser-synthetic?case=${i}${embedded}`});
  await waitForCondition(()=>evaluate(`!!document.querySelector('[data-driver-primary-step="job-summary"]')`),15000,'Driver card');
  const state=await evaluate(`({rows:[...document.querySelectorAll('dt')].filter(e=>e.textContent==='Remark').map(e=>e.nextElementSibling.textContent),width:document.documentElement.scrollWidth,writes:window.__remarkWrites})`);
  assert.deepEqual(state.rows,cases[i]?[cases[i].trim()]:[]);assert.ok(state.width<=390,'No horizontal overflow');assert.deepEqual(state.writes,[]);
  if(i===1&&!embedded){const screenshot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('/private/tmp/driver-remark-mobile.png',Buffer.from(screenshot.data,'base64'));}
 }
 assert.deepEqual(errors,[]);console.log('PASS compiled Driver card at 390px: visible/wrapped remark, amended text, blank/cleared hidden, browser and embedded route, zero mutations and browser errors.');
}finally{client?.close();await terminateChildProcess(chrome);await rm(profile,{recursive:true,force:true});}
