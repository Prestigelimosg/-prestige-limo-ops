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
    window.qaStatusReads=[];window.qaQueued=[];window.qaReplyLinkId="upcoming-link";window.qaJobCompleted=false;window.qaStatusFailure=false;
    window.qaWrites=[];window.qaMessagesFailed=false;window.qaServerDone=new Set(JSON.parse(sessionStorage.getItem("qa-server-done")||"[]"));
    const now=Date.now();
    const booking=(ref,pub,driver)=>({id:ref,booking_reference:ref,public_booking_reference:pub,booking_type:'TRF',vehicle:'AVF',pickup_at:new Date(now-3600000).toISOString(),pickup_datetime:new Date(now-3600000).toISOString(),pickup_address:'Example pickup',dropoff_address:'Example destination',passenger_name:'Example customer',driver_name:driver,driver_id:71,status:'assigned',pax:1,created_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString()});
    window.qaBookings=[booking('EXACT-A','11001','Example Driver A'),booking('EXACT-B','11002','Example Driver B')];
    window.qaBookings.push({...booking('UPCOMING','11080','Upcoming Driver'),pickup_at:new Date(now+18*3600000).toISOString(),pickup_datetime:new Date(now+18*3600000).toISOString()});
    window.qaMessages=[{id:'11111111-1111-4111-8111-111111111111',booking_reference:'EXACT-A',safe_title:'Driver reply',safe_message:'Please confirm pickup point.',workflow_area:'admin_driver_job_messages',delivery_surface:'driver_app',actor_role:'driver',safe_context:{direction:'driver_to_admin'},created_at:new Date(now).toISOString()},
      {id:'22222222-2222-4222-8222-222222222222',booking_reference:'EXACT-B',safe_title:'Example Customer B',safe_message:'We are at the lobby.',workflow_area:'customer_driver_quick_replies',delivery_surface:'driver_app',actor_role:'customer',safe_context:{direction:'customer_to_driver'},created_at:new Date(now).toISOString()}];
    const original=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const u=new URL(typeof input==='string'?input:input.url,location.href);
      if(u.origin!==location.origin)throw Error('External fetch forbidden');
      if(!u.pathname.startsWith('/api/'))return original(input,init);
      const method=init?.method||'GET';
      if(method!=='GET'){
        const body=JSON.parse(init?.body||'{}');
        if(method==='POST'&&u.pathname==='/api/admin-customer-driver-app-notifications'&&body.action==='dismiss_admin_messages'){
          body.message_ids.forEach(id=>window.qaServerDone.add(id));sessionStorage.setItem('qa-server-done',JSON.stringify([...window.qaServerDone]));
          return Response.json({ok:true,message_ids:body.message_ids});
        }
        if(method==='POST'&&u.pathname==='/api/admin-customer-driver-app-notifications'&&body.booking_reference==='UPCOMING'&&body.delivery_surface==='driver_app'&&body.workflow_area==='admin_driver_job_messages'){
          window.qaQueued.push(body);return Response.json({ok:true,notification:body});
        }
        window.qaWrites.push(method+' '+u.pathname);return Response.json({ok:false},{status:403});
      }
      if(u.pathname==='/api/admin-driver-job-statuses')window.qaStatusReads.push(u.searchParams.get('booking_reference'));
      if(u.pathname==='/api/admin-driver-job-links'&&u.searchParams.get('booking_reference')==='UPCOMING')return Response.json({ok:true,links:[{id:window.qaReplyLinkId,booking_reference:'UPCOMING',link_status:'active',revoked_at:null,expires_at:new Date(now+86400000).toISOString(),safe_summary:{acknowledged:true}}]});
      if(u.pathname==='/api/admin-driver-job-statuses'&&u.searchParams.get('booking_reference')==='UPCOMING')return window.qaStatusFailure?Response.json({ok:false},{status:503}):Response.json({ok:true,statuses:window.qaJobCompleted?[{booking_reference:'UPCOMING',status_value:'completed'}]:[]});
      if(u.pathname==='/api/admin-driver-job-bid-offers'&&u.searchParams.has('notification_id')){
        window.qaPoolTargetReads=(window.qaPoolTargetReads||[]).concat(u.searchParams.get('notification_id'));
        if(sessionStorage.getItem('qa-pool-target')==='failed')return Response.json({ok:false},{status:503});
        return Response.json({ok:true,items:sessionStorage.getItem('qa-pool-target')==='missing'?[]:[{offer_key:'a'.repeat(64),offer_status:'assigned',attention_status:'accepted_link_pending',booking_reference:'EXACT-POOL',public_booking_reference:'11081'}]});
      }
      if(u.pathname==='/api/admin-bookings'&&u.searchParams.get('booking_reference')==='EXACT-POOL'){
        window.qaExactPoolReads=(window.qaExactPoolReads||0)+1;
        return Response.json({ok:true,booking:{booking_reference:'EXACT-POOL',public_booking_reference:'11081',service_type:'TRF',vehicle_type_or_category:'AVF',pickup_at:new Date(now+18*3600000).toISOString(),pickup_location:'Example pool pickup',dropoff_location:'Example pool destination',passenger_name:'Example Pool Passenger',driver_id:72,driver_name:'Example Pool Winner',driver_contact:'90000072',driver_plate_number:'QA0072',status:'assigned',pax_count:1,created_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString(),route_points:[],pricing_snapshot:{}}});
      }
      if(u.pathname==='/api/admin-saved-bookings')return Response.json({ok:true,bookings:window.qaBookings});
      if(u.pathname==='/api/admin-load-bookings-typed-read')return Response.json({ok:true,bookings:[],read_gate_open:true,status:'ready'});
      if(u.pathname==='/api/admin-customer-driver-app-notifications'){
        if(u.searchParams.get('scope')==='admin_incoming_messages'){
          if(window.qaMessagesFailed)return Response.json({ok:false},{status:503});
          return Response.json({ok:true,notifications:window.qaMessages.filter(m=>!window.qaServerDone.has(m.id)),pagination:{has_next_page:false}});
        }
        return Response.json({ok:true,notifications:window.qaMessages.filter(m=>m.booking_reference===u.searchParams.get('booking_reference'))});
      }
      if(u.pathname==='/api/admin-app-notifications')return Response.json({ok:true,notifications:[{id:'existing',workflow_area:'other',notification_status:'queued',safe_title:'Existing operational alert',safe_message:'Existing alert stays available'},{id:'33333333-3333-4333-8333-333333333333',booking_reference:'EXACT-A',workflow_area:'driver_pickup_location_followup',notification_status:'queued',notification_type:'driver_status',priority:'urgent',safe_title:'Emergency ‼️ 35 minutes left',safe_message:'SNP9124S no location yet! Open Dashboard to review.'}],pagination:{has_next_page:false}});
      return Response.json({ok:true,external_send:false,write_action:false,enabled:false,records:[],bookings:[],notifications:[],statuses:[],items:[],links:[],settings:{enabled:false},has_more:false});
    };
  `});
  await client.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await client.send('Page.navigate',{url});
  const wait=async(expr,label)=>waitForCondition(()=>evaluate(`Boolean(${expr})`),30000,label);
  await wait(`document.querySelector('[data-admin-incoming-message-open="message:11111111-1111-4111-8111-111111111111"]') && document.querySelectorAll('[data-admin-multi-driver-active-job]').length===2`,'message alerts and existing job cards');
  assert.equal(await evaluate(`document.querySelectorAll('[data-admin-app-notification-feed="true"]').length`),1);
  await evaluate(`window.qaMessages.push({...window.qaMessages[0],id:'upcoming',booking_reference:'UPCOMING',reply_driver_job_link_id:'upcoming-link',sender_driver_id:71,safe_message:'Please confirm tomorrow pickup.'});document.querySelector('[data-admin-app-notification-feed-refresh="true"]').click()`);
  await wait(`document.querySelector('[data-admin-incoming-message-open="message:upcoming"]')`,'upcoming incoming alert');
  await evaluate(`document.querySelector('[data-admin-incoming-message-open="message:upcoming"]').click()`);
  await wait(`document.querySelector('[data-admin-app-notification-feed-row-id="message:upcoming"] [data-admin-active-job-driver-message-input]')`,'upcoming exact-booking reply composer');
  assert.equal(await evaluate(`document.querySelectorAll('[data-admin-multi-driver-active-job]').length`),2,'Upcoming reply must not enter Active Assigned Jobs');
  assert.equal(await evaluate(`document.querySelectorAll('[data-admin-app-notification-feed] [data-admin-active-job-driver-message-input]').length`),1,'Reuse one selected reply composer');
  assert.deepEqual(await evaluate('window.qaWrites'),[],'Opening Reply must not send or write');
  const evidence=process.env.EVIDENCE_DIR||'/tmp/prestige-admin-incoming-alerts-evidence';await mkdir(evidence,{recursive:true});
  const upcomingBox='[data-admin-app-notification-feed-row-id="message:upcoming"]';
  await wait(`document.activeElement?.closest('[data-admin-incoming-message-reply-reference]')?.dataset.adminIncomingMessageReplyReference==='UPCOMING'`,'upcoming conversation focus');
  assert.equal(await evaluate(`document.querySelector('${upcomingBox} [data-admin-active-job-driver-message-send]').disabled`),true,'Blank draft cannot send');
  assert.equal(await evaluate(`document.querySelectorAll('${upcomingBox} [data-admin-active-job-message-audience-option="customer"]').length`),0,'Upcoming repair is Driver-only');
  assert.ok(await evaluate(`document.body.innerText.includes('Your reply is sent only when you select Send to Driver.')`));
  const typeReply=async()=>evaluate(`(()=>{const input=document.querySelector('${upcomingBox} textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Meet at the main lobby.');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(`!document.querySelector('${upcomingBox} textarea').disabled`,'verified report read enables draft');
  await typeReply();
  await evaluate(`document.querySelector('${upcomingBox} [data-admin-active-job-driver-message-send]').click()`);
  await wait(`window.qaQueued.length===1 && document.querySelector('${upcomingBox}').innerText.includes('Queued to Driver Job page')`,'existing sender saves exact upcoming reply');
  const queued=await evaluate('window.qaQueued[0]');assert.equal(queued.driver_job_link_id,'upcoming-link');assert.equal(queued.booking_reference,'UPCOMING');assert.equal(queued.safe_context.audience,'admin_driver');
  await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`document.querySelector('${upcomingBox} [data-admin-active-job-driver-message]').scrollIntoView()`);
  assert.equal(await evaluate(`document.querySelector('${upcomingBox} textarea').getBoundingClientRect().right<=innerWidth`),true);
  const upcomingScreenshot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(evidence,'upcoming-driver-reply-mobile.png'),Buffer.from(upcomingScreenshot.data,'base64'));
  await client.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate(`window.qaReplyLinkId='replacement-link'`);await typeReply();
  await evaluate(`document.querySelector('${upcomingBox} [data-admin-active-job-driver-message-send]').click()`);
  await wait(`document.querySelector('${upcomingBox}').innerText.includes('no longer current')`,'replacement link blocks stale reply');
  assert.equal(await evaluate('window.qaQueued.length'),1);
  await evaluate(`window.qaReplyLinkId='upcoming-link';window.qaJobCompleted=true;document.querySelector('${upcomingBox} [data-admin-active-job-message-history-refresh]').click()`);
  await wait(`document.querySelector('${upcomingBox} textarea').disabled && document.querySelector('${upcomingBox}').innerText.includes('Driver messaging closed after Job Completed')`,'persisted JC blocks upcoming composer');
  await evaluate(`window.qaJobCompleted=false;window.qaStatusFailure=true;document.querySelector('${upcomingBox} [data-admin-active-job-message-history-refresh]').click()`);
  await wait(`document.querySelector('${upcomingBox} textarea').disabled`,'failed status read remains closed');
  await evaluate(`window.qaStatusFailure=false;document.querySelector('${upcomingBox} [data-admin-active-job-message-history-refresh]').click()`);
  await wait(`!document.querySelector('${upcomingBox} textarea').disabled`,'status recovery');


  await evaluate(`window.scrollTo(0,Math.max(0,document.querySelector('[data-admin-app-notification-feed="true"]').getBoundingClientRect().top+scrollY-75))`);
  const desktopScreenshot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path.join(evidence,'admin-incoming-message-alerts-desktop.png'),Buffer.from(desktopScreenshot.data,'base64'));

  assert.equal(await evaluate(`document.querySelector('[data-admin-app-notification-feed-row-id="message:11111111-1111-4111-8111-111111111111"]').innerText.includes('11001')`),true);
  assert.equal(await evaluate(`document.querySelector('[data-admin-app-notification-feed-row-id="message:22222222-2222-4222-8222-222222222222"]').innerText.includes('Example Customer B')`),true);
  await evaluate(`document.querySelector('[data-admin-incoming-message-open="message:22222222-2222-4222-8222-222222222222"]').click()`);
  await wait(`document.activeElement?.closest('[data-admin-multi-driver-active-job]')?.getAttribute('data-admin-multi-driver-active-job')==='EXACT-B'`,'exact customer message card focused');
  assert.equal(await evaluate(`Array.from(document.querySelector('[data-admin-multi-driver-active-job="EXACT-B"]').querySelectorAll('button')).find(e=>e.textContent==='Customer').getAttribute('aria-pressed')`),'true');
  const activeStatusReads=await evaluate(`window.qaStatusReads.filter(ref=>ref==='EXACT-A').length`);
  await evaluate(`document.querySelector('[data-admin-incoming-message-open="message:11111111-1111-4111-8111-111111111111"]').click()`);
  await wait(`document.activeElement?.closest('[data-admin-multi-driver-active-job]')?.getAttribute('data-admin-multi-driver-active-job')==='EXACT-A'`,'exact driver message card focused');
  assert.equal(await evaluate(`Array.from(document.querySelector('[data-admin-multi-driver-active-job="EXACT-A"]').querySelectorAll('button')).find(e=>e.textContent==='Driver').getAttribute('aria-pressed')`),'true');
  assert.equal(await evaluate(`window.qaStatusReads.filter(ref=>ref==='EXACT-A').length`),activeStatusReads,'Active Reply must not reset existing Driver Reports/JC state');
  await evaluate(`document.querySelector('[data-admin-app-notification-feed-row-id="message:11111111-1111-4111-8111-111111111111"] [data-admin-app-notification-action="read"]').click()`);
  await wait(`!document.querySelector('[data-admin-app-notification-feed-row-id="message:11111111-1111-4111-8111-111111111111"]')`,'Done hides attention only');
  assert.ok(await evaluate(`document.querySelector('[data-admin-multi-driver-active-job="EXACT-A"] [data-admin-active-job-message-history]').innerText.includes('Please confirm pickup point.')`));
  await client.send('Page.reload');
  await wait(`document.querySelector('[data-admin-incoming-message-open="message:22222222-2222-4222-8222-222222222222"]')`,'reload');
  assert.equal(await evaluate(`document.querySelector('[data-admin-app-notification-feed-row-id="message:11111111-1111-4111-8111-111111111111"]')===null`),true);
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
  // Native target opens the exact existing message after a full page load.
  await client.send('Page.navigate',{url:url+'/?admin_alert=message%3A22222222-2222-4222-8222-222222222222'});
  await wait(`document.querySelector('[data-admin-app-notification-feed-row-id="message:22222222-2222-4222-8222-222222222222"][data-admin-alert-locator-highlight="true"]')`,'native target selects exact customer message');
  assert.equal(await evaluate(`document.querySelectorAll('[data-admin-alert-locator-highlight="true"]').length`),1);
  assert.equal(await evaluate(`new URL(location.href).searchParams.has('admin_alert')`),false,'consume target without persistent repeated scrolling');
  await wait(`(()=>{const r=document.querySelector('[data-admin-app-notification-feed-row-id="message:22222222-2222-4222-8222-222222222222"]').getBoundingClientRect();return r.top>=0 && r.top<innerHeight;})()`,'target scrolled into phone viewport');
  const targetScreenshot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path.join(evidence,'admin-exact-notification-target.png'),Buffer.from(targetScreenshot.data,'base64'));
  assert.deepEqual(await evaluate('window.qaWrites'),[],'opening never sends or changes Done/status');
  await client.send('Page.navigate',{url:url+'/?admin_alert=alert%3A33333333-3333-4333-8333-333333333333'});
  await wait(`document.querySelector('[data-admin-app-notification-feed-row-id="33333333-3333-4333-8333-333333333333"][data-admin-alert-locator-highlight="true"]')`,'exact emergency target');
  assert.equal(await evaluate(`document.querySelector('[data-admin-app-notification-feed-row-id="33333333-3333-4333-8333-333333333333"]').innerText.includes('SNP9124S no location yet!')`),true);
  await wait(`(()=>{const r=document.querySelector('[data-admin-app-notification-feed-row-id="33333333-3333-4333-8333-333333333333"]').getBoundingClientRect();return r.top>=0 && r.top<innerHeight;})()`,'emergency scrolled into phone viewport');
  const emergencyScreenshot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path.join(evidence,'admin-exact-emergency-target.png'),Buffer.from(emergencyScreenshot.data,'base64'));
  await client.send('Page.navigate',{url:url+'/?admin_alert=message%3A11111111-1111-4111-8111-111111111111'});
  await wait(`document.body.innerText.includes('This exact alert is no longer available')`,'cleared message tap has visible feedback');
  assert.equal(await evaluate(`document.querySelectorAll('[data-admin-alert-locator-highlight="true"]').length`),0,'cleared target cannot pick another message');
  assert.deepEqual(await evaluate('window.qaWrites'),[]);assert.deepEqual(errors,[]);
  // Winner tap must load the existing exact booking and focus its manual Create Link control.
  const poolTarget=url+'/?admin_alert=alert%3A44444444-4444-4444-8444-444444444444';
  await client.send('Page.navigate',{url:poolTarget});
  await wait(`document.querySelector('[data-driver-job-link-handoff-notice]')?.innerText.includes('11081')`,'exact Pool winner booking loaded');
  await wait(`(()=>{const r=document.querySelector('[data-dispatch-workflow-step="driver-job-link"]')?.getBoundingClientRect();return r&&r.top>=0&&r.top<innerHeight;})()`,'existing Create Link section in mobile viewport');
  assert.equal(await evaluate(`document.querySelectorAll('[data-create-driver-job-link-button]').length`),1);
  assert.equal(await evaluate('window.qaExactPoolReads'),1);
  assert.deepEqual(await evaluate('window.qaPoolTargetReads'),['44444444-4444-4444-8444-444444444444']);
  assert.deepEqual(await evaluate('window.qaWrites'),[],'winner tap must not create a link, acknowledge, send, or save');
  assert.equal(await evaluate(`new URL(location.href).searchParams.has('admin_alert')`),false);
  const poolScreenshot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path.join(evidence,'admin-pool-winner-create-link.png'),Buffer.from(poolScreenshot.data,'base64'));
  await evaluate(`sessionStorage.setItem('qa-pool-target','missing')`);
  await client.send('Page.navigate',{url:poolTarget});
  await wait(`document.body.innerText.includes('This exact alert or pending Pool assignment is no longer available')`,'stale Pool target explained');
  assert.equal(await evaluate('window.qaExactPoolReads||0'),0);
  assert.deepEqual(await evaluate('window.qaWrites'),[]);
  await evaluate(`sessionStorage.setItem('qa-pool-target','failed')`);
  await client.send('Page.navigate',{url:poolTarget});
  await wait(`document.body.innerText.includes("Pool assignment could not be verified")`,'failed lookup explained');
  assert.equal(await evaluate(`new URL(location.href).searchParams.has('admin_alert')`),true);
  await evaluate(`sessionStorage.removeItem('qa-pool-target');document.querySelector('[data-admin-app-notification-feed-refresh="true"]').click()`);
  await wait(`document.querySelector('[data-driver-job-link-handoff-notice]')?.innerText.includes('11081')`,'existing refresh retries exact Pool target');
  assert.deepEqual(await evaluate('window.qaWrites'),[]);assert.deepEqual(errors,[]);
  console.log('Pool winner browser passed: exact Create Link focus, mobile visibility, no writes, stale target feedback and failed-read refresh recovery.');
  console.log('Browser passed: exact native message/emergency targeting and cleared-target feedback, one attention sector, existing histories, exact-job/recipient reply handoff, Done/reload/new-message isolation, missing-job and read-failure handling, mobile bounds, one isolated synthetic send, replacement/JC/read-failure gates, no external sends or source-history/status writes.');
}finally{if(client)await client.close();await terminateChildProcess(chrome);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
