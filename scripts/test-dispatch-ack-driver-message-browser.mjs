import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createChromeClient,waitForChromeDebugPort,waitForChromePageTarget,waitForCondition,terminateChildProcess} from './browser-test-helpers.mjs';
const url=process.env.APP_URL||'http://127.0.0.1:3197';
assert.ok(['127.0.0.1','localhost'].includes(new URL(url).hostname));
const existing=await readFile(new URL('./test-admin-incoming-message-alerts-browser.mjs',import.meta.url),'utf8');
const fixture=existing.match(/Page\.addScriptToEvaluateOnNewDocument',\{source:`([\s\S]*?)`\}\);/)[1];
const profile=await mkdtemp(path.join(os.tmpdir(),'prestige-dispatch-message-'));
const port=Number(process.env.CHROME_DEBUG_PORT||9366);
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'});
let client;
try {
 await waitForChromeDebugPort(port);const target=await waitForChromePageTarget(port);client=createChromeClient(target.webSocketDebuggerUrl);await client.ready;
 await client.send('Page.enable');await client.send('Runtime.enable');
 const errors=[];client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.text));
 const evaluate=async expression=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=(expr,label)=>waitForCondition(()=>evaluate(`Boolean(${expr})`),15000,label);
 await client.send('Page.addScriptToEvaluateOnNewDocument',{source:fixture+`
  const baseFetch=window.fetch;
  window.qaAck=new URL(location.href).searchParams.get('ack')!=='no';window.qaComplete=new URL(location.href).searchParams.get('complete')==='yes';
  window.qaCurrentLink='55555555-5555-4555-8555-555555555555';window.qaMessagePosts=[];window.qaSavedMessages=[];window.qaLostResponse=true;window.qaFailStatus=false;
  window.qaBookings.push({...window.qaBookings[2],id:'EXACT-POOL',booking_reference:'EXACT-POOL',public_booking_reference:'11081',driver_id:72,driver_name:'Example Pool Winner'});
  window.fetch=async(input,init)=>{
   const u=new URL(typeof input==='string'?input:input.url,location.href);const method=init?.method||'GET';
   if(u.pathname==='/api/admin-driver-job-links'&&method==='GET')return Response.json({ok:true,links:[{id:window.qaCurrentLink,booking_reference:'EXACT-POOL',link_status:'active',expires_at:new Date(Date.now()+86400000).toISOString(),revoked_at:null,safe_summary:{acknowledged:window.qaAck,acknowledged_at:window.qaAck?new Date().toISOString():null,assigned_driver:'Example Pool Winner'}}],pagination:{has_next_page:false}});
   if(u.pathname==='/api/admin-driver-job-statuses'&&u.searchParams.get('booking_reference')==='EXACT-POOL')return window.qaFailStatus?Response.json({ok:false},{status:503}):Response.json({ok:true,statuses:window.qaComplete?[{booking_reference:'EXACT-POOL',status_value:'completed'}]:[]});
   if(u.pathname==='/api/admin-customer-driver-app-notifications'&&method==='POST'&&!JSON.parse(init.body).action){
    const body=JSON.parse(init.body);window.qaMessagePosts.push(body);
    if(!window.qaSavedMessages.some(x=>x.event_key===body.event_key))window.qaSavedMessages.push({...body,id:body.event_key,actor_role:'admin'});
    if(window.qaLostResponse){window.qaLostResponse=false;throw Error('Synthetic lost response after save');}
    return Response.json({ok:true,notification:body});
   }
   if(u.pathname==='/api/admin-customer-driver-app-notifications'&&method==='GET'&&u.searchParams.get('booking_reference')==='EXACT-POOL')return Response.json({ok:true,notifications:window.qaSavedMessages});
   return baseFetch(input,init);
  };
 `});
 await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 const open=async(extra='')=>{
  await client.send('Page.navigate',{url:url+'/?admin_alert=alert%3A44444444-4444-4444-8444-444444444444'+extra});
  await wait(`document.querySelector('[data-dispatch-driver-message]')`,'saved booking composer');
  await wait(`!document.querySelector('[data-dispatch-driver-message]')?.innerText.includes('Checking job status')`,'exact status read');
 };
 const box='[data-dispatch-driver-message]';
 const type=async text=>evaluate(`(()=>{const x=document.querySelector('${box} textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(x,${JSON.stringify(text)});x.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const send=()=>evaluate(`document.querySelector('${box} [data-admin-active-job-driver-message-send]').click()`);
 await open('&ack=no');
 assert.equal(await evaluate(`document.querySelector('${box} textarea').disabled`),true);
 assert.deepEqual(await evaluate('window.qaMessagePosts'),[]);
 await open('&complete=yes');assert.equal(await evaluate(`document.querySelector('${box} textarea').disabled`),true);
 await open();
 assert.equal(await evaluate(`document.querySelector('${box} textarea').disabled`),false);
 assert.equal(await evaluate(`document.querySelectorAll('${box} [data-admin-active-job-message-audience-option="customer"]').length`),0);
 assert.equal(await evaluate(`document.querySelectorAll('[data-dispatch-driver-message]').length`),1);
 assert.equal(await evaluate(`document.querySelectorAll('[data-admin-multi-driver-active-job]').length`),0,'Dispatch does not add a Dashboard active-job card');
 assert.equal(await evaluate(`(()=>{const b=document.querySelector('${box}');return !!b.previousElementSibling?.querySelector('[data-admin-driver-job-status-readout]') || b.previousElementSibling?.tagName==='DETAILS';})()`),true);
 assert.equal(await evaluate(`document.querySelector('${box}').nextElementSibling.dataset.driverJobLinkPreviewDisclosure`),'true');
 await type('Please meet at the main lobby.');await send();
 await wait(`document.querySelector('${box}').innerText.includes('Synthetic lost response')`,'lost-response feedback');
 assert.equal(await evaluate(`document.querySelector('${box} textarea').value`),'Please meet at the main lobby.');
 await send();await wait(`document.querySelector('${box}').innerText.includes('Queued to Driver Job page')`,'safe retry success');
 const posts=await evaluate('window.qaMessagePosts');assert.equal(posts.length,2);assert.equal(posts[0].event_key,posts[1].event_key);
 assert.equal(posts[0].driver_job_link_id,'55555555-5555-4555-8555-555555555555');assert.equal(posts[0].booking_reference,'EXACT-POOL');assert.equal(posts[0].delivery_surface,'driver_app');
 assert.equal(await evaluate('window.qaSavedMessages.length'),1);
 await wait(`document.querySelector('${box} [data-admin-active-job-message-history]').innerText.includes('Please meet at the main lobby.')`,'existing message history');
 await evaluate(`document.querySelector('${box}').scrollIntoView({block:'center'})`);
 assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true,'390px no horizontal overflow');
 const evidence=process.env.EVIDENCE_DIR||'/private/tmp/prestige-dispatch-message-evidence';await mkdir(evidence,{recursive:true});
 const shot=await client.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(evidence,'dispatch-driver-message-mobile.png'),Buffer.from(shot.data,'base64'));
 await type('Review tomorrow pickup.');
 await evaluate(`window.qaCurrentLink='66666666-6666-4666-8666-666666666666'`);await send();
 await wait(`document.querySelector('${box}').innerText.includes('assignment has changed')`,'replacement send blocked');
 assert.equal(await evaluate('window.qaMessagePosts.length'),2);
 await evaluate(`window.qaCurrentLink='55555555-5555-4555-8555-555555555555';window.qaFailStatus=true`);await send();
 await wait(`document.querySelector('${box} [data-admin-active-job-driver-message-status]')`,'read failure feedback');
 assert.equal(await evaluate('window.qaMessagePosts.length'),2);
 await evaluate(`window.qaFailStatus=false;window.qaComplete=true`);await send();
 await wait(`document.querySelector('${box}').innerText.includes('Driver messaging closed because this job has ended')`,'fresh completed send blocked');
 assert.equal(await evaluate('window.qaMessagePosts.length'),2);
 assert.deepEqual(await evaluate('window.qaWrites'),[]);assert.deepEqual(errors,[]);
 console.log('PASS Dispatch acknowledged Driver composer browser: exact location, before-window, pending/JC gates, Driver-only, stable lost-response retry, replacement/read-failure rejection, existing history, no other writes. Synthetic APIs only.');
} finally {client?.close();await terminateChildProcess(chrome);await rm(profile,{recursive:true,force:true});}
