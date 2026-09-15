import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createChromeClient,waitForChromeDebugPort,waitForChromePageTarget,waitForCondition,terminateChildProcess} from './browser-test-helpers.mjs';
const appUrl=process.env.APP_URL || 'http://127.0.0.1:4372';
assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname));
const profile=await mkdtemp(path.join(os.tmpdir(),'prestige-cancel-browser-'));
const port=Number(process.env.CHROME_DEBUG_PORT || 9356);
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'});
let client; let evaluate;
try {
 await waitForChromeDebugPort(port);client=createChromeClient((await waitForChromePageTarget(port)).webSocketDebuggerUrl);await client.ready;
 await client.send('Page.enable');await client.send('Runtime.enable');
 const errors=[];client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.text));
 evaluate=async(expression)=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`
 window.qaWrites=[];window.qaConfirmations=[];window.qaConfirm=false;
 window.confirm=text=>{window.qaConfirmations.push(text);return window.qaConfirm;};
 const pickup=new Date(Date.now()+86400000).toISOString();
 window.qaBooking={id:'CANCEL-QA',booking_reference:'CANCEL-QA',public_booking_reference:'90001',
 booking_type:'TRF',service_type:'transfer',vehicle:'AVF',vehicle_type_or_category:'AVF',pickup_at:pickup,
 pickup_time:'1200',pickup_address:'Synthetic pickup',pickup_location:'Synthetic pickup',dropoff_address:'Synthetic dropoff',dropoff_location:'Synthetic dropoff',
 route:'Synthetic pickup > Synthetic dropoff',route_summary:'Synthetic pickup > Synthetic dropoff',pax:1,passenger_count:1,
 passenger_name:'Synthetic Passenger',customer_display_name:'Synthetic Customer',customer_id:100,contact_display_name:'Synthetic Contact',
 status:'confirmed',admin_internal_status:'confirmed',customer_facing_status:'confirmed',source_surface:'admin_dashboard',
 driver_id:7,driver_name:'Synthetic Driver',driver_contact:'test-contact',driver_plate_number:'QA7000',
 driver_payout_amount:45,driver_payout_override:45,customer_price_amount:90,route_points:[],service_items:[],
 created_at:'2030-01-01T00:00:00Z',updated_at:'2030-01-01T00:00:00Z',
 job_card:'AVF TRF\\n20 Sep 2030, 1200hrs\\nSynthetic pickup > Synthetic dropoff\\nPassenger: Synthetic Passenger\\nPax: 1'};
 const original=fetch.bind(window);
 window.fetch=async(input,init)=>{
  const u=new URL(typeof input==='string'?input:input.url,location.href);
  if(u.origin!==location.origin)throw Error('External fetch forbidden');
  if(!u.pathname.startsWith('/api/'))return original(input,init);
  const method=init?.method||'GET';
  if(method==='POST' && u.searchParams.get('mode')==='status')return Response.json({ok:true,statuses:[]});
  if(method!=='GET'){
   const body=JSON.parse(init.body||'{}');window.qaWrites.push({path:u.pathname,method,body});
   if(u.pathname==='/api/admin-bookings' && method==='PATCH' && body.update_mode==='driver_assignment_cancel'){
    if(window.qaReject)return Response.json({ok:false,error:'Driver was not removed. Trip reporting has started; review this job before changing its driver.'},{status:409});
    window.qaBooking={...window.qaBooking,driver_id:null,driver_name:null,driver_contact:null,driver_plate_number:null,updated_at:'2030-01-01T00:00:01Z'};
    return Response.json({ok:true,booking:window.qaBooking,customer_notification:null});
   }
   return Response.json({ok:false,error:'Unexpected write blocked'},{status:403});
  }
  if(u.pathname==='/api/admin-saved-bookings')return Response.json({ok:true,bookings:[window.qaBooking]});
  if(u.pathname==='/api/admin-bookings')return Response.json(u.searchParams.has('booking_reference')?{ok:true,booking:window.qaBooking}:{ok:true,bookings:[window.qaBooking]});
  if(u.pathname==='/api/admin-driver-job-bid-offers')return Response.json({ok:true,offer:null,items:[],pending:[],offers:[]});
  return Response.json({ok:true,bookings:[],notifications:[],statuses:[],items:[],links:[],drivers:[],settings:{enabled:false},has_more:false});
 };
 `});
 await client.send('Page.navigate',{url:appUrl});
 await waitForCondition(()=>evaluate(`!!document.querySelector('[data-bookings-tab-autoload="true"]') && /Saved\\s+1/.test(document.body.innerText)`),30000,'Bookings tab');
 await evaluate(`document.querySelector('[data-bookings-tab-autoload="true"]').click()`);
 await waitForCondition(()=>evaluate(`document.body.innerText.includes('SYNTHETIC PASSENGER')`),15000,'synthetic booking');
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Open / Edit').click()`);
 await waitForCondition(()=>evaluate(`!!document.querySelector('[data-admin-cancel-driver-assignment="true"]')`),15000,'Cancel Driver control');
 const selector='[data-admin-cancel-driver-assignment="true"]';
 assert.equal(await evaluate(`document.querySelector('${selector}').textContent.trim()`),'Cancel Driver');
 assert.equal(await evaluate(`document.querySelector('${selector}').disabled`),false,'Revoked/no active link still permits cancellation');
 await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'center'})`);
 const shot=await client.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/manual-cancel-before.png',Buffer.from(shot.data,'base64'));
 // Dismiss confirmation: zero writes and current driver retained.
 await evaluate(`document.querySelector('${selector}').click()`);
 await waitForCondition(()=>evaluate('window.qaConfirmations.length===1'),5000,'confirmation');
 assert.deepEqual(await evaluate('window.qaWrites'),[]);
 assert.match(await evaluate('window.qaConfirmations[0]'),/Synthetic Driver.*90001/);
 // Server rejection remains visibly actionable in the same Job Link section.
 await evaluate(`window.qaConfirm=true;window.qaReject=true;document.querySelector('${selector}').click()`);
 await waitForCondition(()=>evaluate(`document.querySelector('[data-driver-job-link-api-feedback]')?.textContent.includes('Trip reporting has started')`),10000,'cancel refusal feedback');
 assert.equal(await evaluate('window.qaBooking.driver_id'),7);
 // Success clears the same rendered form and access controls; no Calendar/provider calls.
 await evaluate(`window.qaReject=false;document.querySelector('${selector}').click()`);
 await waitForCondition(()=>evaluate(`window.qaBooking.driver_id===null && !document.querySelector('${selector}')`),10000,'removed driver');
 const writes=await evaluate('window.qaWrites');assert.equal(writes.length,2);
 for(const write of writes){assert.equal(write.path,'/api/admin-bookings');assert.equal(write.method,'PATCH');assert.equal(write.body.update_mode,'driver_assignment_cancel');for(const key of ['driver_id','driver_name','driver_contact','driver_plate_number'])assert.equal(write.body.booking[key],null);}
 assert.equal(await evaluate(`document.querySelector('input[placeholder="Driver name"]').value`),'');
 assert.equal(await evaluate(`document.querySelector('input[placeholder="Plate: —"]').value`),'');
 assert.equal(await evaluate(`document.querySelector('[data-copy-driver-job-link-button]').disabled`),true);
 assert.equal(await evaluate(`document.querySelector('[data-revoke-driver-job-link-button]').disabled`),true);
 assert.equal(await evaluate('document.body.innerText.includes("Synthetic Driver")'),false,'Removed driver must disappear from the Job Link preview too');
 assert.equal(await evaluate('window.qaBooking.status'),'confirmed');
 assert.equal(await evaluate('window.qaBooking.driver_payout_override'),45);
 assert.deepEqual(errors,[]);
 console.log('Cancel Driver browser passed: visible in Job Link section with no active link, confirmation dismiss, visible refusal, successful clear, unchanged booking/payout, no unrelated writes/errors.');
} catch(error){if(evaluate)await writeFile('/private/tmp/manual-cancel-browser-failure.txt',await evaluate('document.body.innerText'));throw error;}
finally {if(client)await client.close();await terminateChildProcess(chrome);await rm(profile,{recursive:true,force:true});}
