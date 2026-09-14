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
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {AdminDriverPoolControl} from './admin';import Driver from './driver';
 const drivers=Array.from({length:12},(_,i)=>({id:i+1,driver_name:'Synthetic Driver '+(i+1),vehicle_type:'AVF',plate_number:'QA100'+(i+1),availability_status:'available'}));
 const base={offer_key:'a'.repeat(64),offer_status:'open',audience:'selected',selection_mode:'admin',response_status:'pending',offer_payout_sgd:100,recipient_count:10,push_target_count:0,closes_at:'2099-09-15T12:00:00Z',pickup_at:'2099-09-15T12:00:00Z',public_booking_reference:'99001',safe_pickup_area:'After assignment',safe_dropoff_area:'After assignment',safe_trip_summary:'TRF',updated_at:'2026-09-14T00:00:00.123456Z',safe_vehicle_label:'AVF'};
 let offer=null;let driverJobs=[{...base}];
 window.poolTest={requests:[],loads:[],failAward:false,failDecline:false,respond:()=>{offer.responses=drivers.slice(0,10).map(d=>({driver_id:d.id,driver_name:d.driver_name,vehicle_type:d.vehicle_type,plate_number:d.plate_number,status:'available'}));},remove:()=>{driverJobs=[];}};
 window.fetch=async(url,opts={})=>{
  const body=opts.body?JSON.parse(opts.body):null;const test=window.poolTest;
  test.requests.push({url:String(url),method:opts.method||'GET',body});
  if(String(url)==='/api/driver-portal/jobs')return Response.json({ok:true,session:'account',jobs:[],device_alerts:{ready:false},alerts:[],alert_count:0});
  if(String(url).startsWith('/api/driver-job-bids')){
   if(opts.method==='POST'){driverJobs[0].response_status='awaiting_admin';return Response.json({ok:true,accepted:false,reason:'awaiting_admin'});}
   if(opts.method==='PATCH'){if(test.failDecline)return Response.json({ok:false,reason:'Decline could not be saved.'},{status:409});driverJobs=[];return Response.json({ok:true,accepted:false,reason:'declined'});}
   return Response.json({ok:true,enabled:true,jobs:driverJobs,has_more:false});
  }
  if(!String(url).startsWith('/api/admin-driver-job-bid-offers'))throw Error('Unexpected request: '+url);
  if(opts.method==='POST')offer={...base,recipient_count:body.selected_driver_ids.length,safe_vehicle_label:body.vehicle_requirement,responses:body.selected_driver_ids.map(id=>({driver_id:id,driver_name:'Synthetic Driver '+id,plate_number:'QA100'+id,vehicle_type:'AVF',status:'pending'}))};
  if(opts.method==='PATCH'){
   if(body.action==='award'){if(test.failAward)return Response.json({ok:false,error:'Driver has an overlapping job.'},{status:409});offer.offer_status='assigned';return Response.json({ok:true,accepted:true});}
   if(body.action==='widen'){offer.audience='wider';offer.recipient_count=12;}
  }
  if(String(url).includes('scope=attention'))return Response.json({ok:true,enabled:true,items:offer?[{...offer,booking_reference:'POOL-QA',attention_status:offer.offer_status==='assigned'?'accepted_link_pending':'open'}]:[],has_more:false,page:1});
  return Response.json({ok:true,enabled:true,eligible:true,offer});
 };
 createRoot(document.getElementById('root')).render(location.pathname==='/driver'?<Driver/>:<AdminDriverPoolControl drivers={drivers} savedVehicle="AVF" bookingReference="POOL-QA" expectedUpdatedAt={base.updated_at} eligible disabled={false} requiresExplicitPayout={false} showPleaseAssignDriver={false} suggestedPayout={100} onLoadBooking={async(ref)=>window.poolTest.loads.push(ref)}/>);`;
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
  await client.send('Page.navigate',{url});await wait("document.querySelectorAll('input[type=checkbox]').length===12");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Send to selected drivers').disabled"),true);
  for(let i=0;i<10;i++)await evaluate(`document.querySelectorAll('input[type=checkbox]')[${i}].click()`);
  await wait("document.querySelectorAll('input[type=checkbox]:checked').length===10");
  assert.equal(await evaluate("document.querySelectorAll('input[type=checkbox]')[10].disabled"),true);
  await click('Send to selected drivers');await wait("document.body.innerText.includes('Selected group')");
  assert.deepEqual(await evaluate("window.poolTest.requests.find(r=>r.method==='POST').body.selected_driver_ids"),[1,2,3,4,5,6,7,8,9,10]);
  await wait("document.querySelector('[data-admin-driver-pool-pending-row=\"99001\"]')!==null");
  await evaluate('window.poolTest.respond()');await wait("[...document.querySelectorAll('button')].filter(b=>b.textContent==='Assign').length===10");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Offer to wider pool')"),false);
  if(width===390){const shot=await client.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/prestige-pool-admin-responses.png',Buffer.from(shot.data,'base64'));}
  await evaluate('window.poolTest.failAward=true');await click('Assign');await wait("document.body.innerText.includes('overlapping job')");assert.deepEqual(await evaluate('window.poolTest.loads'),[]);
  await evaluate('window.poolTest.failAward=false');await click('Assign');await wait('window.poolTest.loads.length===1');
  assert.equal(await evaluate("window.poolTest.requests.filter(r=>r.body?.action==='award').at(-1).body.driver_id"),1);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`Admin overflow at ${width}`);
  await client.send('Page.navigate',{url});await wait("document.querySelectorAll('input[type=checkbox]').length===12");await evaluate("document.querySelector('input[type=checkbox]').click()");await click('Send to selected drivers');await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Offer to wider pool')");await click('Offer to wider pool');await wait("document.body.innerText.includes('Wider pool')");
  assert.equal(await evaluate("window.poolTest.requests.filter(r=>r.method==='POST').length"),1);
  assert.equal(await evaluate("window.poolTest.requests.filter(r=>r.body?.action==='widen').length"),1);
  await client.send('Page.navigate',{url:url+'/driver'});await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Available')");await click('Available');await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Pending'&&b.disabled)");
  assert.equal(await evaluate("document.querySelectorAll('[data-driver-pool-offer]').length"),1);
  assert.equal(await evaluate("document.querySelector('[data-driver-pool-accepted-confirmation]')!==null"),false);
  await click('Refresh');await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Pending'&&b.disabled)");
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`Driver overflow at ${width}`);
  if(width===390){const shot=await client.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/prestige-pool-awaiting-admin.png',Buffer.from(shot.data,'base64'));}
  await evaluate('window.poolTest.failDecline=true');await click('Decline');await wait("document.body.innerText.includes('Decline could not be saved.')");
  assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Pending'&&b.disabled)"),true);
  await evaluate('window.poolTest.failDecline=false');await click('Decline');await wait("document.querySelectorAll('[data-driver-pool-offer]').length===0");
 }
 assert.deepEqual(errors,[]);
 console.log('PASS actual Admin/Driver JSX at 390px and 1280px: checkbox limit, selected-only POST, ten responses, rejected award, exact winner, one-job widening, persistent Pending state, visible failed decline, decline, no overflow or browser errors. API responses are synthetic.');
} finally {await client?.close();if(chrome)await terminateChildProcess(chrome);if(server)await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});}
