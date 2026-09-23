// Real local pages with synthetic HTTP responses. No production reads or writes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {createChromeClient,waitForChromeDebugPort,waitForChromePageTarget,waitForCondition,terminateChildProcess} from './browser-test-helpers.mjs';
const appUrl=process.env.APP_URL || 'http://127.0.0.1:3117';
assert.ok(['localhost','127.0.0.1'].includes(new URL(appUrl).hostname),'Synthetic browser test is local only');
const dir=await mkdtemp('/private/tmp/prestige-combo-browser-');
const port=Number(process.env.CHROME_DEBUG_PORT||9239);
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
 '--headless=new','--disable-gpu','--disable-background-networking','--no-first-run',`--user-data-dir=${dir}`,`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
let client;
const errors=[];
try{
 await waitForChromeDebugPort(port);client=createChromeClient((await waitForChromePageTarget(port)).webSocketDebuggerUrl);await client.ready;
 await client.send('Runtime.enable');await client.send('Page.enable');
 client.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails?.exception?.description||event.exceptionDetails?.text));
 await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {
  const original=window.fetch.bind(window);
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  const trips=[1,2,3].map((i)=>({booking_reference:'COMBO-'+i,public_booking_reference:String(99000+i),updated_at:'2026-09-23T00:00:00.000Z',
    pickup_at:new Date(Date.now()+(i+1)*86400000).toISOString(),scheduled_end_at:null,service:i===3?'DEP':'TRF',vehicle:'AVF',pickup:'QA Hotel '+i,dropoff:'QA Terminal '+i,route:'QA Hotel '+i+' > QA Terminal '+i,
    extra_stop_count:0,child_seat_required:false,child_seat_count:0,payout_override:null}));
  let combo=null,ack=false;
  const safeCombo={vehicle:'AVF',trips:trips.map(t=>({reference:t.public_booking_reference,service:t.service,pickup_at:t.pickup_at,scheduled_end_at:null,pickup:t.pickup,dropoff:t.dropoff,route:t.route,href:'/driver-job/mock-driver-job-workflow-order',completed:false}))};
  const saved=trips.map((t,i)=>({...t,id:String(99001+i),pickup_datetime:t.pickup_at,booking_type:t.service,vehicle:'AVF',pickup_address:t.pickup,dropoff_address:t.dropoff,
    pax:1,passenger_name:'SYNTHETIC COMBO QA',status:'pending',driver_id:null,driver_payout_override:i===0?60:null,job_card:'AVF '+t.service+'\\n'+t.route,customer_id:192}));
  window.__comboCalls=[];window.__comboTrips=trips;
  window.fetch=async(...args)=>{
    const url=new URL(String(args[0]?.url||args[0]),location.origin),method=String(args[1]?.method||'GET').toUpperCase();
    const body=typeof args[1]?.body==='string'?JSON.parse(args[1].body):null;
    if(url.origin!==location.origin)throw new Error('External request blocked in synthetic test');
    if(!url.pathname.startsWith('/api/'))return original(...args);
    window.__comboCalls.push({path:url.pathname,method,body});
    if(url.pathname==='/api/admin-load-bookings-typed-read')return json({ok:true,status:'ready',read_gate_open:true,bookings:[]});
    if(url.pathname==='/api/admin-saved-bookings')return json({ok:true,bookings:saved,booking:saved[0]});
    if(url.pathname==='/api/admin-bookings')return json({ok:true,booking:{...saved[0],service_type:'TRF',pickup_location:trips[0].pickup,dropoff_location:trips[0].dropoff,route_points:[],service_items:[]}});
    if(url.pathname==='/api/admin-driver-job-bid-offers'){
      if(method==='PATCH')combo={id:'11111111-2222-4333-8444-555555555555',revision:'22222222-3333-4444-8555-666666666666',primary_booking_reference:'COMBO-1',state:'draft',total_payout_sgd:null,driver_id:null,vehicle_requirement:'AVF',trips:trips.filter(t=>body.members.some(m=>m.booking_reference===t.booking_reference))};
      return json({ok:true,enabled:true,eligible:true,combo_enabled:true,combo,offer:null,candidates:trips,has_more:false,items:[]});
    }
    if(url.pathname==='/api/admin-driver-job-links')return json({ok:true,links:[]});
    if(url.pathname==='/api/driver-portal/jobs')return json({ok:true,session:'account',jobs:[{job_key:'a'.repeat(64),combo:safeCombo,acknowledged:false,booking_reference:'99001',driver_job_url:'/driver-job/mock-driver-job-workflow-order',state:'assigned',state_label:'Assigned',payload:{bookingType:'TRF',reference:'99001',pickupLocation:'QA Hotel',dropoffLocation:'QA Terminal',pickupDateTime:trips[0].pickup_at,status:'assigned',statusHistory:[],waypoints:[]}}]});
    if(url.pathname==='/api/driver-job-bids'){
      if(method==='POST'){window.__comboAccepted=true;return json({ok:true,accepted:true,reason:'accepted'});}
      return json({ok:true,enabled:true,has_more:false,jobs:window.__comboAccepted?[]:[{combo:safeCombo,offer_key:'c'.repeat(64),offer_payout_sgd:135,pickup_at:trips[0].pickup_at,public_booking_reference:'99001',safe_pickup_area:'QA Hotel',safe_dropoff_area:'QA Terminal',safe_trip_summary:'TRF',safe_vehicle_label:'AVF',updated_at:trips[0].updated_at,closes_at:trips[0].pickup_at,selection_mode:'first_accept',response_status:'pending'}]});
    }
    if(url.pathname==='/api/driver-job/mock-driver-job-workflow-order'){
      const response=await original(...args),result=await response.json();
      if(method==='PATCH')ack=true;
      if(result.ok){result.combo=safeCombo;result.driver_account_profile={name:'SYNTHETIC DRIVER',contact:'00000001',plate:'QA1234A',vehicle_model:'AVF'};}
      return json(result,response.status);
    }
    if(url.pathname.endsWith('/calendar'))return json({ok:true,connected:true,status:'save_to_calendar'});
    if(method!=='GET')return json({ok:false,error:'Unexpected synthetic write'},409);
    return json({ok:true,enabled:false,jobs:[],links:[],alerts:[],items:[],bookings:[]});
  };
 })()`});
 const evaluate=async(expression)=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result?.value;};
 const wait=(expression,label)=>waitForCondition(()=>evaluate(`Boolean(${expression})`),15000,label);
 const click=async(text)=>{assert.equal(await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)return false;b.click();return true;})()`),true,`Enabled button ${text}`);};
 await client.send('Page.navigate',{url:appUrl});await wait("window.__comboCalls?.some(c=>c.path==='/api/admin-saved-bookings') && document.body.innerText.includes('Active Assigned Jobs')",'Hydrated Admin home');
 await click('Bookings');
 await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Upcoming')",'Bookings filters');await click('Upcoming');
 await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Open / Edit')",'Saved bookings');
 await click('Open / Edit');await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Add trip'&&!b.disabled)",'Add trip control');
 await evaluate('window.__comboCalls=[]');
 await click('Add trip');await wait("document.querySelector('[role=dialog] input[aria-label]')===document.activeElement",'Picker focus');
 assert.equal(await evaluate("document.querySelectorAll('[role=dialog] input[type=checkbox]').length"),3);
 assert.equal(await evaluate("document.querySelector('[role=dialog] input[type=checkbox]').disabled"),true);
 await evaluate("[...document.querySelectorAll('[role=dialog] input[type=checkbox]')].filter(e=>!e.disabled).forEach(e=>e.click())");
  await click('Add selected');await wait("!document.querySelector('[role=dialog]') && document.body.innerText.includes('AVF Combo · 3 trips')",'Saved combo');
  assert.equal(await evaluate("[...document.querySelectorAll('label')].find(e=>e.textContent.trim()==='Combo payout override')?.querySelector('input')?.value"),'','A first-trip override is never silently treated as the whole package total');
 const mutations=await evaluate("window.__comboCalls.filter(c=>c.method!=='GET')");
 assert.equal(mutations.length,1);assert.equal(mutations[0].body.action,'combo_members');assert.equal(mutations[0].body.members.length,3);
 console.log('PASS Admin saved-trip picker: first trip retained, three exact saved members, one membership write and no booking creation or send.');
 const reset=await fetch(appUrl+'/api/driver-job/mock-driver-job-workflow-order',{headers:{'x-prestige-driver-job-mock-reset':'1'}});
 assert.equal(reset.ok,true,'Reset only the localhost synthetic driver fixture');
 for(const width of [390,412]){
  await client.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:true});
  await client.send('Page.navigate',{url:appUrl+'/driver-job/mock-driver-job-workflow-order'});
  await wait("document.querySelector('[data-driver-combo-trips] li')",'Private combo card');
  assert.equal(await evaluate("document.querySelectorAll('[data-driver-combo-trips] li').length"),3);
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true,'No horizontal overflow');
  assert.doesNotMatch(await evaluate('document.body.innerText'),/customer price|invoice|PayNow|internal_admin_notes/i);
  assert.equal(await evaluate("[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Save & Acknowledge Job').length"),1);
  const capture=await client.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/prestige-combo-local-'+width+'.png',Buffer.from(capture.data,'base64'));
 }
 await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Save & Acknowledge Job'&&!b.disabled)",'One enabled ACK');
 await click('Save & Acknowledge Job');await wait("window.__comboCalls.some(c=>c.method==='PATCH'&&c.path==='/api/driver-job/mock-driver-job-workflow-order')",'Combined ACK request');
 assert.equal(await evaluate("window.__comboCalls.filter(c=>c.method==='PATCH'&&c.path==='/api/driver-job/mock-driver-job-workflow-order').length"),1);
 console.log('PASS Driver combo presentation at 390/412px: three trip rows, one ACK control/request, no overflow or customer finance. Screenshots are local browser evidence only.');
 await client.send('Page.navigate',{url:appUrl+'/driver-portal'});
  await wait("document.querySelector('[data-driver-combo-trips]')",'My Jobs combo');
  assert.equal(await evaluate("document.querySelectorAll('[data-driver-combo-trips] li').length>=3"),true);
  await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Accept all trips'&&!b.disabled)",'Combined Pool acceptance');
  assert.equal(await evaluate("document.querySelectorAll('[data-driver-pool-offer] [data-driver-combo-trips] li').length"),3);
  await click('Accept all trips');
  await wait("window.__comboAccepted===true && !document.querySelector('[data-driver-pool-offer]')",'One package accepted');
  assert.equal(await evaluate("window.__comboCalls.filter(c=>c.path==='/api/driver-job-bids'&&c.method==='POST').length"),1);
 assert.deepEqual(errors,[]);
 console.log('PASS My Jobs combo card and zero uncaught browser errors.');
}catch(error){
 if(client){const state=await client.send('Runtime.evaluate',{expression:'JSON.stringify({text:document.body.innerText,calls:window.__comboCalls})',returnByValue:true});await writeFile('/private/tmp/prestige-combo-browser-failure.json',state.result?.value||'');}
 throw error;
}finally{client?.close();await terminateChildProcess(chrome);await rm(dir,{recursive:true,force:true});}
