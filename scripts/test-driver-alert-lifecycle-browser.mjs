import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {createChromeClient,navigateWithLoadEvent,terminateChildProcess,waitForChromeDebugPort,waitForChromePageTarget,waitForCondition} from './browser-test-helpers.mjs';
const appUrl=process.env.APP_URL || 'http://127.0.0.1:3197';
assert.ok(['127.0.0.1','localhost'].includes(new URL(appUrl).hostname),'Synthetic browser test is local only');
const port=Number(process.env.CHROME_DEBUG_PORT || 9398);
const profile=await mkdtemp('/private/tmp/prestige-alert-browser-');
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
 '--headless=new','--disable-gpu','--disable-background-networking','--disable-component-update',
 '--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'about:blank',
],{stdio:'ignore'});
const fixture=()=>{
 const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
 const a='a'.repeat(64),b='b'.repeat(64),offer='c'.repeat(64);
 const state=JSON.parse(sessionStorage.getItem('synthetic-alert-state') || 'null') || {dismissed:[],poolRead:false,cancelled:false,requests:[],fail:false};
 window.__alertState=state;window.__native=[];
 const save=()=>sessionStorage.setItem('synthetic-alert-state',JSON.stringify(state));
 window.__saveAlertState=save;
 Object.assign(window,{__PRESTIGE_DRIVER_NATIVE_APP__:true,__PRESTIGE_DRIVER_INSTALLATION_ID__:'11111111-1111-4111-8111-111111111111',
  __PRESTIGE_DRIVER_NOTIFICATIONS_ENABLED__:true,__PRESTIGE_DRIVER_ACCOUNT_ALERT_REGISTRATION_SUPPORTED__:true,__PRESTIGE_DRIVER_BIOMETRIC_ENABLED__:true,__PRESTIGE_DRIVER_MESSAGE_OPEN_SUPPORTED__:true,__PRESTIGE_DRIVER_PENDING_JOB_OPEN_SUPPORTED__:true,__PRESTIGE_DRIVER_ALERT_DISMISS_SUPPORTED__:true,
  ReactNativeWebView:{postMessage:value=>{
   const message=JSON.parse(value);window.__native.push(message);
   if(message.type==='native_notifications_register' && message.account_session===true) {
    if(!state.registrationFail)state.duplicateNative=false;
    save();setTimeout(()=>window.dispatchEvent(new CustomEvent('prestige-driver-native-notification-result',
      {detail:{ok:!state.registrationFail,state:state.registrationFail?'failed':'enabled'}})),25);
   }
   if(message.request_id)setTimeout(()=>{window.__native.push({type:'synthetic-dismiss-completed',request_id:message.request_id});
    window.dispatchEvent(new CustomEvent('prestige-driver-alerts-dismissed',{detail:{request_id:message.request_id}}));},50);
  }}});
 const payload=reference=>({assignedDriver:{contact:'',name:'Synthetic Driver',plate:'QA',vehicleModel:'AVF'},bookingType:'TRF',
  dropoffLocation:'Synthetic drop-off',flightNumber:'',passengerName:'Synthetic passenger',pickupDate:'2030-01-01',
  pickupDateTime:'2030-01-01T04:00:00Z',pickupLocation:'Synthetic pickup',pickupTime:'1200hrs',reference,
  route:'Synthetic pickup > Synthetic drop-off',status:'assigned',statusHistory:[],statusLabel:'Assigned',waypoints:[]});
 const original=window.fetch.bind(window);
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.origin),method=options.method||'GET';
  if(!url.pathname.startsWith('/api/'))return original(input,options);
  if(url.origin!==location.origin)throw Error('External API prohibited');
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  const body=options.body?JSON.parse(options.body):null;
  state.requests.push({path:url.pathname,method,body});save();
  if(url.pathname==='/api/driver-portal/jobs' && method==='PATCH'){
   if(state.fail)return json({ok:false},503);
   if(body.notification_ids)state.dismissed.push(...body.notification_ids);
   else if(body.pool_offers)state.poolRead=true;
   else return json({ok:false},400);
   save();return json({ok:true});
  }
  if(url.pathname==='/api/driver-portal/jobs'){
   const alerts=[{job_key:a,job_reference:'QA-ONE',notification_ids:ids.slice(0,2),latest_title:'Dispatch update',latest_message:'Pickup changed',priority:'high',created_at:'2030-01-01T01:00Z'},
    {job_key:b,job_reference:'QA-TWO',notification_ids:ids.slice(2),latest_title:'Passenger reply',latest_message:'Ready at the lobby',priority:'normal',created_at:'2030-01-01T01:00Z'}]
    .map(row=>({...row,notification_ids:row.notification_ids.filter(id=>!state.dismissed.includes(id))}))
    .filter(row=>row.notification_ids.length).map(row=>({...row,update_count:row.notification_ids.length}));
   return json({ok:true,session:'account',device_alerts:{ready:true,public_key:null,native_registration_ready:!state.duplicateNative},alerts_available:true,
    alert_count:alerts.reduce((n,r)=>n+r.update_count,0),alerts,
    dismiss_notification_keys:state.cancelled?[a]:[],native_badge_count:null,
    jobs:state.noJobs?[]:[...(state.pending?[{job_key:'d'.repeat(64),payload:payload('QA-PENDING-ACK'),state:'pending_ack',state_label:'Pending ACK'}]:[]),{job_key:a,payload:payload('QA-ONE'),state:'assigned',state_label:'Assigned'},{job_key:b,payload:payload('QA-TWO'),state:'assigned',state_label:'Assigned'}]});
  }
  if(url.pathname==='/api/driver-job-bids' && method==='GET')return json({ok:true,enabled:true,has_more:false,jobs:state.cancelled?[]:[{
   offer_key:offer,updated_at:'2030-01-01T00:00:00+00:00',alert_unread:!state.poolRead,closes_at:'2030-01-01T04:00Z',
   pickup_at:'2030-01-01T04:00Z',offer_payout_sgd:1,public_booking_reference:'QA-POOL',safe_pickup_area:'Synthetic hotel',
   safe_dropoff_area:'Synthetic airport',safe_trip_summary:'TRF',safe_vehicle_label:'AVF',response_status:'pending',selection_mode:'first_accept',
  }]});
  if(method!=='GET')throw Error('Unexpected mutation '+url.pathname);
  return json({ok:true});
 };
};
let client;
try{
 await waitForChromeDebugPort(port);const target=await waitForChromePageTarget(port);
 client=createChromeClient(target.webSocketDebuggerUrl);await client.ready;
 await client.send('Runtime.enable');await client.send('Page.enable');
 const errors=[];client.on('Runtime.exceptionThrown',({exceptionDetails})=>errors.push(exceptionDetails.text));
 await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`(${fixture.toString()})()`});
 const evaluate=async expression=>(await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
 const wait=async(text)=>waitForCondition(()=>evaluate(`document.querySelector('[data-driver-notification-centre-trigger]')?.textContent.trim()===${JSON.stringify(text)}`),10000,text);
 for(const width of [390,1280]){
  await client.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width===390});
  await navigateWithLoadEvent(client,appUrl+'/driver-portal');
  await evaluate(`Object.assign(window.__alertState,{dismissed:[],poolRead:false,cancelled:false,duplicateNative:false,pending:false,noJobs:false,registrationFail:false,requests:[],fail:false});window.__saveAlertState()`);
  await navigateWithLoadEvent(client,appUrl+'/driver-portal');await wait('Alerts 4');
  await evaluate(`document.querySelector('[data-driver-notification-centre-trigger]').click()`);
  await waitForCondition(()=>evaluate(`Boolean(document.querySelector('[data-driver-notification-job="${'a'.repeat(64)}"]'))`),5000,'alert list');
  await evaluate(`document.querySelector('[data-driver-notification-job="${'a'.repeat(64)}"]').click()`);
  await wait('Alerts 2');
  await waitForCondition(()=>evaluate(`window.__native.some(m=>m.type==='native_job_open')`),5000,'native open after read');
  assert.ok(await evaluate(`window.__native.findIndex(m=>m.type==='synthetic-dismiss-completed')<window.__native.findIndex(m=>m.type==='native_job_open')`),'native cleanup completes before navigation');
  const opened=await evaluate(`window.__alertState`);
  assert.deepEqual(opened.dismissed,['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']);
  assert.equal(await evaluate(`document.querySelectorAll('[data-driver-portal-job]').length`),2,'Reading keeps both jobs');
  await navigateWithLoadEvent(client,appUrl+'/driver-portal');await wait('Alerts 2');
  await evaluate(`document.querySelector('[data-driver-notification-centre-trigger]').click()`);
  await waitForCondition(()=>evaluate(`Boolean(document.querySelector('[data-driver-notification-purpose="available-jobs"]'))`),5000,'pool alert');
  await evaluate(`document.querySelector('[data-driver-notification-purpose="available-jobs"]').click()`);await wait('Alerts 1');
  assert.equal(await evaluate(`document.body.textContent.includes('QA-POOL')`),true,'Read offer remains available to accept');
  await evaluate(`window.__alertState.cancelled=true;window.__saveAlertState()`);
  await navigateWithLoadEvent(client,appUrl+'/driver-portal');await wait('Alerts 1');
  assert.equal(await evaluate(`document.body.textContent.includes('QA-POOL')`),false,'Cancelled offer disappears');
  assert.ok(await evaluate(`window.__native.some(message=>message.type==='native_alerts_dismiss' && message.job_keys.includes('${'a'.repeat(64)}'))`));
  await evaluate(`window.__alertState.fail=true;document.querySelector('[data-driver-notification-centre-trigger]').click()`);
  await waitForCondition(()=>evaluate(`Boolean(document.querySelector('[data-driver-notification-job="${'b'.repeat(64)}"]'))`),5000,'remaining alert');
  await evaluate(`document.querySelector('[data-driver-notification-job="${'b'.repeat(64)}"]').click()`);
  await waitForCondition(()=>evaluate(`document.body.textContent.includes('Some alerts could not be cleared')`),5000,'read failure guidance');
  await wait('Alerts 1');
  const writes=await evaluate(`window.__alertState.requests.filter(r=>r.method!=='GET')`);
  assert.ok(writes.every(r=>r.path==='/api/driver-portal/jobs' && r.method==='PATCH'),'No job decision, ACK, Calendar or assignment write');
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),'No horizontal overflow');
  await evaluate(`window.__alertState.duplicateNative=true;window.__saveAlertState()`);
  await navigateWithLoadEvent(client,appUrl+'/driver-portal');await wait('Alerts 1');
  await waitForCondition(()=>evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Enable Job Alerts')&&!b.disabled)`),5000,'repairable native registration');
  await evaluate(`window.__alertState.pending=true;window.__saveAlertState()`);
  await navigateWithLoadEvent(client,appUrl+'/driver-portal');await wait('Alerts 1');
  await waitForCondition(()=>evaluate(`document.querySelector('[data-driver-portal-job="QA-PENDING-ACK"]')?.textContent.includes('Open & acknowledge')`),5000,'pending job discoverable without push tap');
  assert.equal(await evaluate(`document.querySelector('[data-driver-portal-job="QA-PENDING-ACK"] [data-driver-portal-job-state]')?.textContent`),'Pending ACK');
  await evaluate(`document.querySelector('[data-driver-portal-open-job="${'d'.repeat(64)}"]').click()`);
  await waitForCondition(()=>evaluate(`window.__native.some(m=>m.type==='native_job_open'&&m.job_key==='${'d'.repeat(64)}')`),5000,'existing native opener receives pending key');
  assert.equal(await evaluate(`window.__alertState.requests.some(r=>r.method!=='GET' && r.path!=='/api/driver-portal/jobs')`),false,'Opening never acknowledges or writes job status');
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),'Pending card fits screen');
  await evaluate(`document.querySelector('[data-driver-portal-job="QA-PENDING-ACK"]').scrollIntoView({block:'start'})`);
  const shot=await client.send('Page.captureScreenshot',{format:'png'});
  await writeFile(`/private/tmp/driver-alert-lifecycle-${width}.png`,Buffer.from(shot.data,'base64'));
  await evaluate(`Object.assign(window.__alertState,{noJobs:true,pending:false,duplicateNative:true,registrationFail:true});window.__saveAlertState()`);
  await navigateWithLoadEvent(client,appUrl+'/driver-portal');await wait('Alerts 1');
  await waitForCondition(()=>evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Enable Job Alerts'&&!b.disabled)`),5000,'no-job enable control');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Enable Job Alerts').click()`);
  await waitForCondition(()=>evaluate(`document.body.textContent.includes('Check your connection and tap Enable Job Alerts again')`),5000,'actionable failure');
  assert.ok(await evaluate(`window.__native.some(m=>m.type==='native_notifications_register'&&m.account_session===true&&!m.job_key)`));
  assert.ok(await evaluate(`!document.body.textContent.includes('latest acknowledged private Job Link')`));
  await evaluate(`window.__alertState.registrationFail=false;Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Enable Job Alerts').click()`);
  await waitForCondition(()=>evaluate(`document.body.textContent.includes('This device is ready for Driver Job alerts.')`),5000,'no-job registration retry success');
  assert.ok(await evaluate(`!document.querySelector('[data-driver-portal-job]')`));
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
  const registrationShot=await client.send('Page.captureScreenshot',{format:'png'});
  await writeFile(`/private/tmp/driver-registration-no-job-${width}.png`,Buffer.from(registrationShot.data,'base64'));

 }
 assert.deepEqual(errors,[]);console.log('Driver alert browser: exact read, other-job isolation, persisted count, offer retained after read, cancellation cleanup, pending-ACK discovery and existing native open, no-job registration failure/retry and unchanged UI at390/1280px passed');
}catch(error){if(client){const diagnostic=await client.send('Runtime.evaluate',{expression:`({text:document.body.innerText.slice(0,2000),requests:window.__alertState?.requests?.slice(-5),native:window.__native?.slice(-3)})`,returnByValue:true});console.error(JSON.stringify(diagnostic.result.value));}throw error;}finally{if(client)await client.close().catch(()=>{});await terminateChildProcess(chrome);await rm(profile,{recursive:true,force:true});}
