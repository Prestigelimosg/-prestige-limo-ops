// Actual React components with synthetic fetch responses; no Production access.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {createChromeClient,waitForChromeDebugPort,waitForChromePageTarget,waitForCondition,terminateChildProcess} from './browser-test-helpers.mjs';
const require=createRequire(import.meta.url);
const {webpack}=require('next/dist/compiled/webpack/webpack');
const temp=await mkdtemp(path.join(os.tmpdir(),'prestige-pool-selection-browser-'));
const compilerOptions={jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true};
let chrome,client,server;
try {
 for(const [name,file] of [['admin','app/admin-driver-pool-control.tsx'],['driver','app/driver-portal/page.tsx']]) {
  let source=await readFile(file,'utf8');
  if(name==='driver') source=source.replace('import { PublicAppBuildMarker } from "@/app/public-app-build-marker";', 'const PublicAppBuildMarker = () => null;');
  await writeFile(path.join(temp,name+'.js'),ts.transpileModule(source,{compilerOptions}).outputText);
 }
 for(const [name,file] of [['driver-account-setup','app/driver-portal/driver-account-setup.tsx'],['driver-account-password','lib/driver-account-password.ts']]) {
  const source=(await readFile(file,'utf8')).replace('../../lib/driver-account-password','./driver-account-password');
  await writeFile(path.join(temp,name+'.js'),ts.transpileModule(source,{compilerOptions}).outputText);
 }
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {AdminDriverPoolControl} from './admin';import Driver from './driver';
 const drivers=Array.from({length:location.pathname==='/large'?501:12},(_,i)=>({id:i+1,driver_name:'Synthetic Driver '+(i+1),vehicle_type:location.pathname==="/readiness"&&i===9?"VVV":"AVF",plate_number:'QA100'+(i+1),availability_status:'available'}));
 const base={offer_key:'a'.repeat(64),offer_status:'open',audience:'selected',selection_mode:'first_accept',response_status:'pending',offer_payout_sgd:100,recipient_count:10,push_target_count:0,closes_at:'2099-09-15T12:00:00Z',pickup_at:'2099-09-15T12:00:00Z',public_booking_reference:'99001',safe_pickup_area:'After assignment',safe_dropoff_area:'After assignment',safe_trip_summary:'TRF',updated_at:'2026-09-14T00:00:00.123456Z',safe_vehicle_label:'AVF'};
 base.safe_pickup_area='Synthetic Hotel lobby';base.safe_dropoff_area='Synthetic Airport terminal';
 base.safe_job_details={route:'Synthetic Hotel > Synthetic intermediate stop > Synthetic Airport',flight_number:'QA123',passengers:3,luggage:2,child_seat:'1 booster seat',instructions:'Meet at the lobby. '+ 'Long instruction '.repeat(25),scheduled_end_at:'2099-09-15T15:00:00Z'};
 let offer=null;let driverJobs=[{...base,audience:location.pathname==='/driver-wide'?'wider':'selected'}];
 window.poolTest={requests:[],loads:[],cancelled:[],confirmations:[],allowConfirm:true,failCancel:false,failAccept:false,failDecline:false,failReadiness:false,win:()=>{offer.offer_status='assigned';offer.assignment={driver_name:'Synthetic Driver 1',plate_number:'QA1001',can_cancel:true,blocked_reason:null,has_job_link:false};},block:()=>{offer.assignment={...offer.assignment,can_cancel:false,blocked_reason:'This booking changed after acceptance. Review the saved assignment before cancelling.'};},remove:()=>{driverJobs=[];}};
 window.confirm=(message)=>{window.poolTest.confirmations.push(message);return window.poolTest.allowConfirm;};
 window.fetch=async(url,opts={})=>{
  const body=opts.body?JSON.parse(opts.body):null;const test=window.poolTest;
  test.requests.push({url:String(url),method:opts.method||'GET',body});
  if(String(url)==='/api/driver-portal/jobs')return Response.json({ok:true,session:'account',jobs:[],device_alerts:{ready:false},alerts:[],alert_count:0,alerts_available:true});
  if(String(url).startsWith('/api/driver-job-bids')){
   if(opts.method==='POST'){if(test.failAccept)return Response.json({ok:false,reason:'schedule_conflict'},{status:409});driverJobs=[];return Response.json({ok:true,accepted:true,reason:'accepted'});}
   if(opts.method==='PATCH'){if(test.failDecline)return Response.json({ok:false,reason:'Decline could not be saved.'},{status:409});driverJobs=[];return Response.json({ok:true,accepted:false,reason:'declined'});}
   return Response.json({ok:true,enabled:true,jobs:driverJobs,has_more:false});
  }
  if(!String(url).startsWith('/api/admin-driver-job-bid-offers'))throw Error('Unexpected request: '+url);
  if(opts.method==='POST')offer={...base,audience:body.audience||"selected",recipient_count:body.audience==="wider"?12:body.selected_driver_ids.length,safe_vehicle_label:body.vehicle_requirement,responses:body.selected_driver_ids.map(id=>({driver_id:id,driver_name:'Synthetic Driver '+id,plate_number:'QA100'+id,vehicle_type:'AVF',status:'pending'}))};
  if(opts.method==='PATCH'){
   if(body.action==='award')throw Error('Unexpected Admin winner selection');
   if(body.action==='widen'){offer.audience='wider';offer.recipient_count=12;} else if(!body.action){offer.offer_status='cancelled';}
  }
  if(String(url).includes('scope=attention'))return Response.json({ok:true,enabled:true,items:offer&&['open','assigned'].includes(offer.offer_status)?[{...offer,booking_reference:'POOL-QA',attention_status:offer.offer_status==='assigned'?'accepted_link_pending':'open'}]:[],has_more:false,page:1});
  const requested=new URL(String(url),'https://synthetic.invalid').searchParams.get('driver_ids')?.split(',').map(Number)||[];
  if(requested.length>200)throw Error('Readiness batch exceeded 200');
  if(test.failReadiness)return Response.json({ok:false},{status:503});
  return Response.json({ok:true,enabled:true,eligible:true,offer,driver_alert_readiness:drivers.filter(d=>requested.includes(d.id)).map(d=>({driver_id:d.id,ready:location.pathname==="/readiness"?(d.id===12?null:d.id!==11):true}))});
 };
 createRoot(document.getElementById('root')).render(location.pathname.startsWith('/driver')?<Driver/>:<AdminDriverPoolControl drivers={drivers} savedVehicle="AVF" bookingReference="POOL-QA" expectedUpdatedAt={base.updated_at} eligible disabled={false} requiresExplicitPayout={false} showPleaseAssignDriver={false} suggestedPayout={100} onLoadBooking={async(ref)=>window.poolTest.loads.push(ref)} onCancelAssignment={async(item)=>{window.poolTest.cancelled.push(item);if(window.poolTest.failCancel)throw Error('Driver Pool state changed. Reload and try again.');offer.offer_status='cancelled';return true;}}/>);`;
 await writeFile(path.join(temp,'entry.js'),ts.transpileModule(entry,{compilerOptions}).outputText);
 await new Promise((resolve,reject)=>webpack({mode:'development',entry:path.join(temp,'entry.js'),resolve:{modules:[path.join(process.cwd(),'node_modules')]},output:{path:temp,filename:'bundle.js'}},(err,stats)=>err||stats.hasErrors()?reject(err||Error(stats.toString({all:false,errors:true}))):resolve()));
 const bundle=await readFile(path.join(temp,'bundle.js'));
 // Use the tested production stylesheet for responsive checks.
 const {readdir}=await import('node:fs/promises');
 const cssFiles=await readdir('.next/static/css');
 const css=(await Promise.all(cssFiles.filter(f=>f.endsWith('.css')).map(f=>readFile('.next/static/css/'+f,'utf8')))).join('\n');
 server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':req.url==='/style.css'?'text/css':'text/html');res.end(req.url==='/bundle.js'?bundle:req.url==='/style.css'?css:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body class="bg-slate-50 p-3"><div id="root"></div><script src="/bundle.js"></script></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
 const port=Number(process.env.CHROME_DEBUG_PORT||9246);
 chrome=spawn(process.env.CHROME_BINARY||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-extensions','--no-first-run','--no-default-browser-check',`--user-data-dir=${path.join(temp,'chrome')}`,`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
 await waitForChromeDebugPort(port);client=createChromeClient((await waitForChromePageTarget(port)).webSocketDebuggerUrl);await client.ready;
 const errors=[];client.on('Runtime.exceptionThrown',({exceptionDetails})=>errors.push(exceptionDetails.text));client.on('Runtime.consoleAPICalled',({type,args})=>{if(type==='error')errors.push(args.map(a=>a.value).join(' '));});
 await client.send('Runtime.enable');await client.send('Page.enable');
 const evaluate=async(expression)=>{const r=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);return r.result.value;};
 const wait=(expr)=>waitForCondition(()=>evaluate(expr),12000,expr);
 const click=async(label)=>{await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`);return evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Missing or disabled button');b.click();})()`);};
 for(const width of [390,1280]) {
  await client.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
  await client.send('Page.navigate',{url:url+'/readiness'});await wait("document.querySelector('[data-driver-alert-status=\"11\"]')?.innerText==='Alerts not ready'");
  assert.equal(await evaluate("document.querySelectorAll('input[type=checkbox]')[10].disabled"),true);
  assert.equal(await evaluate("document.querySelectorAll('input[type=checkbox]')[11].disabled"),true);
  assert.equal(await evaluate("document.querySelectorAll('input[type=checkbox]')[9].disabled"),true,'Mismatched vehicle cannot be selected');
  assert.equal(await evaluate("document.querySelector('[data-driver-alert-status=\"1\"]').innerText"),'Online · alerts ready');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`Selection overflow at ${width}`);
  const selectedShot=await client.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/pool-direct-selected-'+width+'.png',Buffer.from(selectedShot.data,'base64'));
  await evaluate("document.querySelector('input[type=checkbox]').click();window.poolTest.failReadiness=true");
  await click('Refresh alert status');await wait("document.querySelector('[data-driver-alert-status=\"1\"]').innerText==='Alert status unavailable'");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Send to selected drivers').disabled"),true,'Failed refresh cannot retain a ready selection');
  assert.equal(await evaluate("document.querySelector('input[type=checkbox]').disabled"),false,'Previously selected driver can still be unticked');
  await evaluate("document.querySelector('input[type=checkbox]').click();window.poolTest.failReadiness=false");
  await click('Refresh alert status');await wait("document.querySelector('[data-driver-alert-status=\"1\"]').innerText==='Online · alerts ready'");
  assert.equal(await evaluate("document.querySelectorAll('summary').length"),1,'One Driver Pool disclosure');
  assert.equal(await evaluate("document.querySelector('summary').textContent"),'Driver Pool');
  assert.equal(await evaluate("[...document.querySelectorAll('button')].filter(b=>b.textContent.startsWith('Send to')).length"),2);
  await evaluate("document.querySelector('summary').click()");await wait("!document.querySelector('details').open");
  await evaluate("document.querySelector('summary').click()");await wait("document.querySelector('details').open");
  const allShot=await client.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/pool-direct-all-'+width+'.png',Buffer.from(allShot.data,'base64'));
  await click('Send to all drivers');await wait("document.body.innerText.includes('Wider pool')");
  assert.deepEqual(await evaluate("window.poolTest.requests.filter(r=>r.method==='POST').map(r=>r.body.selected_driver_ids)"),[[]]);
  assert.equal(await evaluate("window.poolTest.requests.some(r=>r.body?.action==='widen')"),false,'Direct all sends once without a selected offer or widening');
  await evaluate("window.poolTest.allowConfirm=true");await click('Cancel Offer');
  await wait("document.body.innerText.includes('Offer cancelled')");
  await client.send('Page.navigate',{url:url+'/large'});await wait("document.querySelector('[data-driver-alert-status=\"501\"]')?.innerText==='Online · alerts ready'");
  assert.deepEqual(await evaluate("window.poolTest.requests.filter(r=>r.url.includes('driver_ids=')).map(r=>new URL(r.url,location.origin).searchParams.get('driver_ids').split(',').length)"),[200,200,101]);
  for(let i=0;i<500;i++)await evaluate(`document.querySelectorAll('input[type=checkbox]')[${i}].click()`);
  await wait("document.querySelectorAll('input[type=checkbox]:checked').length===500");
  assert.equal(await evaluate("document.querySelectorAll('input[type=checkbox]')[500].disabled"),false,'No replacement fixed cap');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  await click('Send to selected drivers');await wait("document.body.innerText.includes('Selected group')");
  assert.deepEqual(await evaluate("window.poolTest.requests.find(r=>r.method==='POST').body.selected_driver_ids"),Array.from({length:500},(_,i)=>i+1));
  await client.send('Page.navigate',{url});await wait("document.querySelectorAll('input[type=checkbox]').length===12");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Send to selected drivers').disabled"),true);
  for(let i=0;i<11;i++)await evaluate(`document.querySelectorAll('input[type=checkbox]')[${i}].click()`);
  await wait("document.querySelectorAll('input[type=checkbox]:checked').length===11");
  assert.equal(await evaluate("document.querySelectorAll('input[type=checkbox]')[11].disabled"),false);
  await click('Send to selected drivers');await wait("document.body.innerText.includes('Selected group')");
  assert.deepEqual(await evaluate("window.poolTest.requests.find(r=>r.method==='POST').body.selected_driver_ids"),[1,2,3,4,5,6,7,8,9,10,11]);
  await wait("document.querySelector('[data-admin-driver-pool-pending-row=\"99001\"]')!==null");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Assign')"),false);
  await wait("document.body.innerText.includes('First valid acceptance wins')");
  await evaluate('window.poolTest.win()');await wait("document.body.innerText.includes('Accepted · Driver assigned')");
  await wait("document.body.innerText.includes('Accepted · Job Link pending')");
  await wait("document.querySelector('[data-admin-driver-pool-pending-row=\"99001\"]').innerText.includes('Cancel Driver Assignment')");
  assert.equal(await evaluate("window.poolTest.requests.some(r=>r.body?.action==='award')"),false);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`Admin overflow at ${width}`);
  assert.equal(await evaluate("document.querySelector('[data-admin-driver-pool-pending-row=\"99001\"]').innerText.includes('Synthetic Driver 1')"),true);
  const acceptedShot=await client.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/pool-owner-accepted-'+width+'.png',Buffer.from(acceptedShot.data,'base64'));
  await evaluate('window.poolTest.block()');
  await wait("document.body.innerText.includes('This booking changed after acceptance')");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel Driver Assignment').disabled"),true,'Blocked cancellation must explain why before a click');
  assert.equal(await evaluate('window.poolTest.cancelled.length'),0);
  const blockedShot=await client.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/pool-owner-blocked-'+width+'.png',Buffer.from(blockedShot.data,'base64'));
  await evaluate('window.poolTest.win()');
  await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Cancel Driver Assignment'&&!b.disabled)");
  await click('Go to Create Link');assert.deepEqual(await evaluate('window.poolTest.loads'),['POOL-QA']);
  assert.equal(await evaluate("window.poolTest.requests.some(r=>r.url.includes('driver-job-links'))"),false,'Navigation must not create a link');
  await evaluate('window.poolTest.allowConfirm=false');await click('Cancel Driver Assignment');
  assert.equal(await evaluate('window.poolTest.cancelled.length'),0,'Dismissing confirmation must not cancel');
  await evaluate('window.poolTest.allowConfirm=true;window.poolTest.failCancel=true');await click('Cancel Driver Assignment');
  await wait("document.body.innerText.includes('Driver Pool state changed')");
  assert.equal(await evaluate("document.querySelector('[data-admin-driver-pool-pending-row=\"99001\"]')!==null"),true,'Rejected cancellation retains job');
  await evaluate('window.poolTest.failCancel=false');await click('Cancel Driver Assignment');
  await wait("document.body.innerText.includes('driver assignment cancelled')");
  assert.equal(await evaluate('window.poolTest.cancelled[0].booking_reference'),'POOL-QA');
  assert.match(await evaluate('window.poolTest.confirmations.at(-1)'),/99001.*booking stays active/s);
  await wait("document.querySelector('[data-admin-driver-pool-pending-row=\"99001\"]')===null");

  await client.send('Page.navigate',{url});await wait("document.querySelectorAll('input[type=checkbox]').length===12");await evaluate("document.querySelector('input[type=checkbox]').click()");await click('Send to selected drivers');await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Offer to wider pool')");await click('Offer to wider pool');await wait("document.body.innerText.includes('Wider pool')");
  assert.equal(await evaluate("window.poolTest.requests.filter(r=>r.method==='POST').length"),1);
  assert.equal(await evaluate("window.poolTest.requests.filter(r=>r.body?.action==='widen').length"),1);
  await click('Cancel Offer');await wait("document.querySelector('[data-admin-driver-pool-pending-row=\"99001\"]')===null");
  assert.equal(await evaluate("window.poolTest.requests.filter(r=>r.method==='PATCH'&&!r.body.action).length"),1);
  for (const driverPath of ['/driver','/driver-wide']) {
    await client.send('Page.navigate',{url:url+driverPath});await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Accept')");
    for(const detail of ['Synthetic Hotel lobby','Synthetic Airport terminal','Synthetic intermediate stop','QA123','Passengers','Luggage','1 booster seat','Meet at the lobby.','Scheduled end']) {
      assert.equal(await evaluate(`document.querySelector('[data-driver-pool-offer]').innerText.toLowerCase().includes(${JSON.stringify(detail.toLowerCase())})`),true,detail);
    }
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`Trip details overflow at ${width}`);
    const tripShot=await client.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/pool-trip-details-'+width+driverPath.replace('/','-')+'.png',Buffer.from(tripShot.data,'base64'));
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>['Available','Pending','Cancel'].includes(b.textContent))"),false);
    await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Alerts 1')");
    await evaluate('window.poolTest.failAccept=true');await click('Accept');await wait("document.body.innerText.includes('schedule_conflict')");
    assert.equal(await evaluate("document.querySelectorAll('[data-driver-pool-offer]').length"),1);
    await evaluate('window.poolTest.failAccept=false');await click('Accept');await wait("document.body.innerText.includes('Accepted! Pls ack when admin send job link')");
    assert.equal(await evaluate("document.querySelectorAll('[data-driver-pool-offer]').length"),0);
    await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Alerts 0')");
    await click('Refresh');await wait("document.querySelectorAll('[data-driver-pool-offer]').length===0");
    await wait("document.querySelector('[data-driver-pool-accepted-confirmation]')===null");
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`Driver overflow at ${width}`);
    if(width===390){const shot=await client.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/prestige-pool-first-accept.png',Buffer.from(shot.data,'base64'));}
    await client.send('Page.navigate',{url:url+driverPath});await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Accept')");
    await click('Accept');await wait("document.querySelector('[data-driver-pool-accepted-confirmation]')!==null");
    await wait("document.querySelector('[data-driver-pool-accepted-confirmation]')===null");
    assert.equal(await evaluate("window.poolTest.requests.filter(r=>r.method==='POST').length"),1,'Automatic receipt dismissal must not send again');
    await client.send('Page.navigate',{url:url+driverPath});await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Decline')");
    await evaluate('window.poolTest.failDecline=true');await click('Decline');await wait("document.body.innerText.includes('Decline could not be saved.')");
    assert.equal(await evaluate("document.querySelectorAll('[data-driver-pool-offer]').length"),1);
    await evaluate('window.poolTest.failDecline=false');await click('Decline');await wait("document.querySelectorAll('[data-driver-pool-offer]').length===0");
    assert.equal(await evaluate("document.querySelector('[data-driver-pool-accepted-confirmation]')!==null"),false);
  }

 }
 assert.deepEqual(errors,[]);
 console.log('PASS actual Admin/Driver JSX at 390px and 1280px: inline readiness and vehicle eligibility, direct all-driver POST without prior selected offer, one disclosure and two buttons, 500 selections with bounded readiness batches, selected-only POST, no Admin winner controls, exact winner refresh, per-row winner/cancel/link navigation, blocked reason, confirmation dismissal, failed cancellation, one-job widening and open cancellation, first Accept for both groups, winner confirmation, failed acceptance and decline, offer count 1 to 0, no overflow or browser errors. API responses are synthetic.');
} finally {await client?.close();if(chrome)await terminateChildProcess(chrome);if(server)await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});}
