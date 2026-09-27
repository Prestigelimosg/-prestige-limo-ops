import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createChromeClient,waitForChromeDebugPort,waitForChromePageTarget,waitForCondition,terminateChildProcess} from './browser-test-helpers.mjs';
const url=process.env.APP_URL||'http://127.0.0.1:3197';
assert.ok(['127.0.0.1','localhost'].includes(new URL(url).hostname));
const profile=await mkdtemp(path.join(os.tmpdir(),'prestige-incoming-alerts-'));
const port=Number(process.env.CHROME_DEBUG_PORT||9363);
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'});
let client;
try {
  await waitForChromeDebugPort(port);const target=await waitForChromePageTarget(port);client=createChromeClient(target.webSocketDebuggerUrl);await client.ready;
  await client.send('Page.enable');await client.send('Runtime.enable');
  const errors=[];client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.text));
  const evaluate=async expression=>{const result=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;};
  await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.qaWrites=[];window.qaMessagesFailed=false;
    const now=Date.now();
    const booking=(ref,pub,driver)=>({id:ref,booking_reference:ref,public_booking_reference:pub,booking_type:'TRF',vehicle:'AVF',pickup_at:new Date(now-3600000).toISOString(),pickup_datetime:new Date(now-3600000).toISOString(),pickup_address:'Example pickup',dropoff_address:'Example destination',passenger_name:'Example customer',driver_name:driver,driver_id:71,status:'assigned',pax:1,created_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString()});
    window.qaBookings=[booking('EXACT-A','11001','Example Driver A'),booking('EXACT-B','11002','Example Driver B')];
    window.qaMessages=[{id:'driver-a',booking_reference:'EXACT-A',safe_title:'Driver reply',safe_message:'Please confirm pickup point.',workflow_area:'admin_driver_job_messages',delivery_surface:'driver_app',actor_role:'driver',safe_context:{direction:'driver_to_admin'},created_at:new Date(now).toISOString()},
      {id:'customer-b',booking_reference:'EXACT-B',safe_title:'Example Customer B',safe_message:'We are at the lobby.',workflow_area:'customer_driver_quick_replies',delivery_surface:'driver_app',actor_role:'customer',safe_context:{direction:'customer_to_driver'},created_at:new Date(now).toISOString()}];
    const original=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const u=new URL(typeof input==='string'?input:input.url,location.href);
      if(u.origin!==location.origin)throw Error('External fetch forbidden');
      if(!u.pathname.startsWith('/api/'))return original(input,init);
      const method=init?.method||'GET';
      if(method!=='GET'){window.qaWrites.push(method+' '+u.pathname);return Response.json({ok:false},{status:403});}
      if(u.pathname==='/api/admin-saved-bookings')return Response.json({ok:true,bookings:window.qaBookings});
      if(u.pathname==='/api/admin-load-bookings-typed-read')return Response.json({ok:true,bookings:[],read_gate_open:true,status:'ready'});
      if(u.pathname==='/api/admin-customer-driver-app-notifications'){
        if(u.searchParams.get('scope')==='admin_incoming_messages'){
          if(window.qaMessagesFailed)return Response.json({ok:false},{status:503});
          return Response.json({ok:true,notifications:window.qaMessages,pagination:{has_next_page:false}});
        }
        return Response.json({ok:true,notifications:window.qaMessages.filter(m=>m.booking_reference===u.searchParams.get('booking_reference'))});
      }
      if(u.pathname==='/api/admin-app-notifications')return Response.json({ok:true,notifications:[{id:'existing',workflow_area:'other',notification_status:'queued',safe_title:'Existing operational alert',safe_message:'Existing alert stays available'}],pagination:{has_next_page:false}});
      return Response.json({ok:true,external_send:false,write_action:false,enabled:false,records:[],bookings:[],notifications:[],statuses:[],items:[],links:[],settings:{enabled:false},has_more:false});
    };
  `});
  await client.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await client.send('Page.navigate',{url});
  const wait=async(expr,label)=>waitForCondition(()=>evaluate(`Boolean(${expr})`),30000,label);
  await wait(`document.querySelector('[data-admin-incoming-message-open="message:driver-a"]') && document.querySelectorAll('[data-admin-multi-driver-active-job]').length===2`,'message alerts and existing job cards');
  assert.equal(await evaluate(`document.querySelectorAll('[data-admin-app-notification-feed="true"]').length`),1);
  const evidence=process.env.EVIDENCE_DIR||'/tmp/prestige-admin-incoming-alerts-evidence';await mkdir(evidence,{recursive:true});
  await evaluate(`window.scrollTo(0,Math.max(0,document.querySelector('[data-admin-app-notification-feed="true"]').getBoundingClientRect().top+scrollY-75))`);
  const desktopScreenshot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path.join(evidence,'admin-incoming-message-alerts-desktop.png'),Buffer.from(desktopScreenshot.data,'base64'));

  assert.equal(await evaluate(`document.querySelector('[data-admin-app-notification-feed-row-id="message:driver-a"]').innerText.includes('11001')`),true);
  assert.equal(await evaluate(`document.querySelector('[data-admin-app-notification-feed-row-id="message:customer-b"]').innerText.includes('Example Customer B')`),true);
  await evaluate(`document.querySelector('[data-admin-incoming-message-open="message:customer-b"]').click()`);
  await wait(`document.activeElement?.closest('[data-admin-multi-driver-active-job]')?.getAttribute('data-admin-multi-driver-active-job')==='EXACT-B'`,'exact customer message card focused');
  assert.equal(await evaluate(`Array.from(document.querySelector('[data-admin-multi-driver-active-job="EXACT-B"]').querySelectorAll('button')).find(e=>e.textContent==='Customer').getAttribute('aria-pressed')`),'true');
  await evaluate(`document.querySelector('[data-admin-incoming-message-open="message:driver-a"]').click()`);
  await wait(`document.activeElement?.closest('[data-admin-multi-driver-active-job]')?.getAttribute('data-admin-multi-driver-active-job')==='EXACT-A'`,'exact driver message card focused');
  assert.equal(await evaluate(`Array.from(document.querySelector('[data-admin-multi-driver-active-job="EXACT-A"]').querySelectorAll('button')).find(e=>e.textContent==='Driver').getAttribute('aria-pressed')`),'true');
  await evaluate(`document.querySelector('[data-admin-app-notification-feed-row-id="message:driver-a"] [data-admin-app-notification-action="read"]').click()`);
  await wait(`!document.querySelector('[data-admin-app-notification-feed-row-id="message:driver-a"]')`,'Done hides attention only');
  assert.ok(await evaluate(`document.querySelector('[data-admin-multi-driver-active-job="EXACT-A"] [data-admin-active-job-message-history]').innerText.includes('Please confirm pickup point.')`));
  await client.send('Page.reload');
  await wait(`document.querySelector('[data-admin-incoming-message-open="message:customer-b"]')`,'reload');
  assert.equal(await evaluate(`document.querySelector('[data-admin-app-notification-feed-row-id="message:driver-a"]')===null`),true);
  await evaluate(`window.qaMessages.push({...window.qaMessages[0],id:'driver-new',safe_message:'New message after Done'});document.querySelector('[data-admin-app-notification-feed-refresh="true"]').click()`);
  await wait(`document.querySelector('[data-admin-incoming-message-open="message:driver-new"]')`,'new message cannot be blocked by old dismissal');
  await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`document.querySelector('[data-admin-app-notification-feed="true"]').scrollIntoView()`);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-admin-incoming-message-open]')).every(e=>e.getBoundingClientRect().left>=0 && e.getBoundingClientRect().right<=innerWidth)`),true);
  const screenshot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(evidence,'admin-incoming-message-alerts.png'),Buffer.from(screenshot.data,'base64'));
  // Missing/closed jobs never open a different job's reply box.
  await evaluate(`window.qaMessages.push({...window.qaMessages[0],id:'closed',booking_reference:'NO-ACTIVE-CARD'});document.querySelector('[data-admin-app-notification-feed-refresh="true"]').click()`);
  await wait(`document.querySelector('[data-admin-incoming-message-open="message:closed"]')`,'closed job attention');
  await evaluate(`document.querySelector('[data-admin-incoming-message-open="message:closed"]').click()`);
  await wait(`document.body.innerText.includes('This job is not currently in Active Assigned Jobs')`,'unavailable exact destination explained');
  await evaluate(`window.qaMessagesFailed=true;document.querySelector('[data-admin-app-notification-feed-refresh="true"]').click()`);
  await wait(`document.body.innerText.includes('Incoming messages could not be loaded')`,'read failure visible');
  assert.equal(await evaluate(`document.querySelector('[data-admin-app-notification-feed-row-id="existing"]')!==null`),true);
  assert.deepEqual(await evaluate('window.qaWrites'),[]);assert.deepEqual(errors,[]);
  console.log('Browser passed: one attention sector, existing histories, exact-job/recipient reply handoff, Done/reload/new-message isolation, missing-job and read-failure handling, mobile bounds, no sends or writes.');
}finally{if(client)await client.close();await terminateChildProcess(chrome);await rm(profile,{recursive:true,force:true});}
