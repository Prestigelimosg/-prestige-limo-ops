// Real React signup/Portal/activation components. Synthetic APIs and a simulated native bridge only.
import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';import {spawn} from 'node:child_process';import {createRequire} from 'node:module';import path from 'node:path';import os from 'node:os';import ts from 'typescript';
import {createChromeClient,waitForChromeDebugPort,waitForChromePageTarget,waitForCondition,terminateChildProcess} from './browser-test-helpers.mjs';
const {webpack}=createRequire(import.meta.url)('next/dist/compiled/webpack/webpack');
const temp=await mkdtemp(path.join(os.tmpdir(),'driver-activation-browser-'));
const options={jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true};
let chrome,client,server;
try {
 for(const [name,file] of [['portal','app/driver-portal/page.tsx'],['setup','app/driver-portal/driver-account-setup.tsx'],['activation','app/driver-job/driver-account-activation.tsx'],['password','lib/driver-account-password.ts'],['jobpage','app/driver-job/[token]/page.tsx'],['workflow','lib/driver-job-status-workflow.ts'],['contract','driver-companion/src/driver-job-contract.ts']]) {
  const source=(await readFile(file,'utf8')).replace('"./driver-account-setup"','"./setup"').replace('"../../lib/driver-account-password"','"./password"') .replace('import Link from "next/link";','const Link=({children,...props})=><a {...props}>{children}</a>;').replace('import { useParams } from "next/navigation";','const useParams=()=>({token:"a".repeat(64)});').replace('"../driver-account-activation"','"./activation"').replace('"../../../lib/driver-job-status-workflow"','"./workflow"').replace('"../../../driver-companion/src/driver-job-contract"','"./contract"').replace('"../../../lib/driver-account-password"','"./password"').replace('import { PublicAppBuildMarker } from "@/app/public-app-build-marker";','const PublicAppBuildMarker=()=>null;');
  await writeFile(path.join(temp,name+'.js'),ts.transpileModule(source,{compilerOptions:options}).outputText);
 }
 const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Portal from './portal';import JobPage from './jobpage';import {DriverAccountActivation} from './activation';
 window.test={calls:[],messages:[],ready:[],fail:location.pathname==='/invalid'};
 if(location.pathname!=='/browser'){window.__PRESTIGE_DRIVER_NATIVE_APP__=true;window.__PRESTIGE_DRIVER_INSTALLATION_ID__='11111111-1111-4111-8111-111111111111';window.__PRESTIGE_DRIVER_ACCOUNT_SETUP__={supported:true,pending:location.pathname.startsWith('/wired'),attempted:location.pathname.startsWith('/wired')};Object.defineProperty(navigator,'userAgent',{value:'iPhone Prestige Driver',configurable:true});}
 window.ReactNativeWebView=location.pathname==='/browser'?undefined:{postMessage:raw=>{const m=JSON.parse(raw);window.test.messages.push(m);if(m.type==='native_account_setup_save'||m.type==='native_account_setup_cancel'){window.__PRESTIGE_DRIVER_ACCOUNT_SETUP__.pending=m.type==='native_account_setup_save';window.dispatchEvent(new CustomEvent('prestige-driver-account-setup-result',{detail:{ok:true}}));}}};
 window.test.payload={acknowledged:false,assignedDriver:{name:'QA Activation',contact:'+6580000000',plate:'QA1234',vehicleModel:'AVF'},reference:'QA-ACTIVATION',bookingType:'TRF',passengerName:'QA only',pickupDate:'2026-09-20',pickupDateTime:'2026-09-20T12:00:00',pickupTime:'1200',pickupLocation:'QA pickup',dropoffLocation:'QA dropoff',route:'QA pickup > QA dropoff',waypoints:[],status:'assigned',statusLabel:'Assigned',statusHistory:[]};
 window.fetch=async(url,opts={})=>{const body=opts.body?JSON.parse(opts.body):{};window.test.calls.push({url,body,method:opts.method||'GET'});
  if(url==='/api/driver-portal/jobs')return Response.json({ok:false},{status:401});
  if(String(url).startsWith('/api/driver-job-bids'))return Response.json({ok:false,jobs:[]},{status:401});
  if(String(url).endsWith('/account'))return window.test.fail?Response.json({ok:false,error:'This Job Link is no longer active. Ask Admin for the current Job Link.'},{status:409}):Response.json({ok:true,activated:true,account_ready:location.pathname.endsWith('/assigned')||location.pathname==='/wired-assigned'||(body.action==='resume'&&window.test.payload.acknowledged)});
  if(location.pathname.startsWith('/wired')&&String(url)==='/api/driver-job/'+'a'.repeat(64)){if(opts.method==='PATCH')window.test.payload.acknowledged=true;return Response.json({ok:true,mode:'production',account_setup:'app',payload:window.test.payload});}
  if(location.pathname.startsWith('/wired')&&!opts.method)return Response.json({ok:false,reason:'not_configured'},{status:503});
  throw Error('Unexpected API '+url);
 };
 if(['/assigned','/unassigned','/invalid','/wired-assigned','/wired-unassigned'].includes(location.pathname))window.__PRESTIGE_DRIVER_ACCOUNT_ACTIVATION__={setupId:'22222222-2222-4222-8222-222222222222',email:'driver@example.test',password:'482951',activated:false,jobUrl:location.origin+'/driver-job/'+'a'.repeat(64)};
 function Job(){const [ack,setAck]=useState(false),[ready,setReady]=useState(false);return <><DriverAccountActivation token={'a'.repeat(64)} acknowledged={ack} onReady={account=>{window.test.ready.push(account);setReady(true);}}/><button disabled={!ready||ack} onClick={()=>{window.test.payload.acknowledged=true;setAck(true);}}>Save & Acknowledge Job</button></>;}
 createRoot(document.getElementById('root')).render(location.pathname.startsWith('/wired')?<JobPage/>:['/assigned','/unassigned','/invalid'].includes(location.pathname)?<React.StrictMode><Job/></React.StrictMode>:<Portal/>);`;
 await writeFile(path.join(temp,'entry.js'),ts.transpileModule(entry,{compilerOptions:options}).outputText);
 await new Promise((resolve,reject)=>webpack({mode:'development',entry:path.join(temp,'entry.js'),resolve:{modules:[path.join(process.cwd(),'node_modules')]},output:{path:temp,filename:'bundle.js'}},(err,stats)=>err||stats.hasErrors()?reject(err||Error(stats.toString({all:false,errors:true}))):resolve()));
 const bundle=await readFile(path.join(temp,'bundle.js'));
 const css=(await Promise.all((await readdir('.next/static/css')).filter(f=>f.endsWith('.css')).map(f=>readFile('.next/static/css/'+f,'utf8')))).join('\n');
 server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript; charset=utf-8':req.url==='/style.css'?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/bundle.js'?bundle:req.url==='/style.css'?css:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,port=9496;
 chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-extensions','--no-first-run','--no-default-browser-check',`--user-data-dir=${path.join(temp,'chrome')}`,`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
 await waitForChromeDebugPort(port);const target=await waitForChromePageTarget(port);client=createChromeClient(target.webSocketDebuggerUrl);await client.ready;await client.send('Runtime.enable');await client.send('Page.enable');
 const errors=[];client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails?.text));
 const run=async expression=>{const r=await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=e=>waitForCondition(()=>run('Boolean('+e+')'),8000,e);
 const click=label=>run(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Button unavailable');b.click();})()`);
 const fill=(selector,value)=>run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 for(const width of [390,1280]) {
  await client.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  await client.send('Page.navigate',{url:base+'/portal'});await wait("document.querySelector('[data-driver-portal-sign-in]')");await click('New driver? Create account');
  await fill('input[type=email]','driver@example.test');await fill('input[type=password]','482951');await click('Save account setup');await wait("document.body.innerText.includes('Activation required')");
  assert.equal(await run("!!document.querySelector('[data-driver-portal-password-form]')"),false,'Pending signup must not show a login form');
  assert.equal(await run("window.test.calls.some(c=>c.url.includes('/account')||c.url.includes('/driver-auth'))"),false,'Saving pending setup must not create Auth or login');
  assert.equal(await run("document.querySelectorAll('input[type=password]').length"),0,'PIN cleared after secure native save');
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
  await writeFile('/private/tmp/driver-activation-pending-'+width+'.png',Buffer.from((await client.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await click('Cancel setup');await wait("document.querySelector('[data-driver-portal-sign-in]')");
  for(const lane of ['assigned','unassigned']) {
   await client.send('Page.navigate',{url:base+'/'+lane});await wait("window.test?.ready.length===1");
   assert.equal(await run('window.test.ready[0]'),lane==='assigned');
   assert.equal(await run("window.test.calls.filter(c=>c.body.action==='activate').length"),1);
   assert.equal(await run("window.test.messages.at(-1).complete"),lane==='assigned');
   await click('Save & Acknowledge Job');await wait("document.body.innerText.includes('Your job is acknowledged')");
   const calls=await run('window.test.calls');
   assert.equal(calls.length,lane==='assigned'?1:2);
   if(lane==='unassigned'){assert.equal(calls[1].body.action,'resume');assert.equal(calls[1].body.password,undefined);assert.equal(await run('window.test.messages.at(-1).complete'),true);}
  }
  for(const lane of ['wired-assigned','wired-unassigned']) {
   await client.send('Page.navigate',{url:base+'/'+lane});
   await wait("window.test?.messages.some(m=>m.type==='native_account_setup_activated')");
   assert.equal(await run("window.test.calls.filter(c=>c.method==='PATCH').length"),0,'Activation must not ACK the booking');
   await run("document.querySelector('[data-driver-job-save-acknowledge]').click()");
   await wait("window.test.messages.some(m=>m.type==='native_account_setup_activated'&&m.complete) && window.test.calls.some(c=>c.method==='PATCH')");
   const writes=await run("window.test.calls.filter(c=>c.method!=='GET')");
   assert.equal(writes.length,lane==='wired-assigned'?2:3);
   assert.equal(writes[0].body.action,'activate');assert.equal(writes[1].method,'PATCH');
   assert.deepEqual(Object.keys(writes[1].body).sort(),['device_push_subscription','driver_contact','driver_name','driver_plate_number','driver_vehicle_model']);
   if(lane==='wired-unassigned'){assert.equal(writes[2].body.action,'resume');assert.equal(writes[2].body.password,undefined);}
   assert.equal(await run("!!document.querySelector('[data-driver-account-create]')"),false);
  }
  await client.send('Page.navigate',{url:base+'/invalid'});await wait("document.body.innerText.includes('no longer active')");assert.equal(await run('window.test.ready.length'),0);assert.equal(await run("[...document.querySelectorAll('button')].find(b=>b.textContent==='Save & Acknowledge Job').disabled"),true);
  await client.send('Page.navigate',{url:base+'/browser'});await wait("document.querySelector('[data-driver-portal-page]')");assert.equal(await run("!!document.querySelector('[data-driver-account-pending-setup]')"),false,'Browser must not offer account setup');
 }
 assert.deepEqual(errors,[]);console.log('PASS React 390/1280: app-only setup, pending login blocked, no provider on setup, assigned/unassigned activation, ACK continuation without a PIN resend, invalid link stays blocked, browser signup absent.');
}finally{await client?.close();if(chrome)await terminateChildProcess(chrome);if(server)await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true});}
