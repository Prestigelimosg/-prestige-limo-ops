// Local actual React UI; every API is intercepted and real writes are forbidden.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createChromeClient,waitForChromeDebugPort,waitForChromePageTarget,waitForCondition,terminateChildProcess} from './browser-test-helpers.mjs';
const appUrl=process.env.APP_URL||'http://127.0.0.1:3123';
assert.ok(['127.0.0.1','localhost'].includes(new URL(appUrl).hostname));
const profile=await mkdtemp(path.join(os.tmpdir(),'prestige-dsp-end-'));
const port=Number(process.env.CHROME_DEBUG_PORT||9353);
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
 '--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'
],{stdio:'ignore'});
const fixture=(reference,extra={})=>({
 id:reference,booking_reference:reference,public_booking_reference:reference,
 booking_type:'DSP',service_type:'DSP',vehicle:'AVF',
 pickup_at:'2026-09-16T23:50:00.000Z',pickup_datetime:'2026-09-16T23:50:00.000Z',pickup_time:'0750',
 dropoff_datetime:null,pickup_address:'Test pickup',dropoff_address:'Test dropoff',route:'Test pickup > Test dropoff',pax:1,
 job_card:'AVF DSP\n17 Sep 2026, 0750hrs\nTest pickup > Test dropoff\nPassenger: TEST TRAVELLER\nPax: 1',
 status:'completed',admin_internal_status:'completed',customer_facing_status:'completed',
 created_at:'2026-09-16T00:00:00Z',updated_at:'2026-09-17T06:30:00Z',
 companies:{company_name:reference},bookers:{booker_name:'Test booker'},travelers:{traveler_name:'Test traveller'},...extra,
});
const fixtures=[fixture('DSP-JC'),fixture('DSP-MISSING',{dropoff_datetime:'2026-09-17T07:00:00Z'}),
 fixture('DSP-ERROR'),fixture('DSP-FOREIGN'),fixture('DSP-INVALID'),fixture('DSP-NEXT-DAY'),
 fixture('NON-DSP',{booking_type:'TRF',service_type:'TRF'}),fixture('DSP-EARLIER',{status:'draft',admin_internal_status:'draft',customer_facing_status:'pending'}),
 fixture('DSP-CANCELLED',{status:'cancelled',admin_internal_status:'cancelled',customer_facing_status:'cancelled'})];
let client;
try {
 await waitForChromeDebugPort(port);const target=await waitForChromePageTarget(port);
 client=createChromeClient(target.webSocketDebuggerUrl);await client.ready;
 const rawSend=client.send;client.send=(method,args)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error(`Timeout ${method}`)),15000);
  rawSend(method,args).then(resolve,reject).finally(()=>clearTimeout(timer));
 });
 await client.send('Runtime.enable');await client.send('Page.enable');
 const errors=[];client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.text));
 const evaluate=async expression=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`
  window.testReads=[];window.testWrites=[];window.testRecover=false;window.testBookingReads=0;window.testCalls=[];
  window.fetch=async(input,init={})=>{
   const url=new URL(typeof input==='string'?input:input.url,location.href);
   const method=init.method||input?.method||'GET';window.testCalls.push(url.pathname);
   // Existing Calendar status lookup uses POST but mode=status performs only a read.
   if(method==='POST'&&url.pathname==='/api/admin-booking-calendar-google-sync'&&url.searchParams.get('mode')==='status')return Response.json({ok:true,statuses:[]});
   if(method!=='GET'){window.testWrites.push({path:url.pathname,method});return Response.json({ok:false},{status:500});}
   if(url.pathname==='/api/admin-saved-bookings'){window.testBookingReads++;return Response.json({ok:true,bookings:${JSON.stringify(fixtures)}});}
   if(url.pathname==='/api/admin-driver-job-statuses'){
    const ref=url.searchParams.get('booking_reference');window.testReads.push(ref);
    if(ref==='DSP-ERROR'&&!window.testRecover)return Response.json({ok:false,error:'Read unavailable'},{status:503});
    const statuses=ref==='DSP-MISSING'?[]:[{booking_reference:ref==='DSP-FOREIGN'?'OTHER-JOB':ref,status_value:'completed',
     occurred_at:ref==='DSP-INVALID'?null:ref==='DSP-NEXT-DAY'?'2026-09-18T00:15:00Z':'2026-09-17T06:23:55Z',created_at:'2026-09-17T08:00:00Z'}];
    return Response.json({ok:true,statuses});
   }
   return Response.json({ok:true,bookings:[],notifications:[],statuses:[],drivers:[],links:[],items:[],records:[]});
  };`});
 const clickTab=name=>evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(t=>t.textContent.trim()===${JSON.stringify(name)}).click()`);
 for(const width of [390,1280]){
  console.log(`Checking Completed DSP actual end at ${width}px`);
  await client.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await client.send('Page.navigate',{url:appUrl});
  await waitForCondition(()=>evaluate(`!!document.querySelector('[role="tab"]')`),30000,'Admin app');
  await waitForCondition(()=>evaluate('window.testCalls.length>0'),15000,'React hydration');
  await clickTab('Dashboard');
  await waitForCondition(()=>evaluate(`(()=>{const b=document.querySelector('[data-admin-app-notification-feed-refresh]');if(!b||b.disabled)return false;b.click();return true;})()`),15000,'enabled booking refresh');
  await waitForCondition(()=>evaluate('window.testBookingReads>0'),15000,'fixture booking read');
  await clickTab('Completed');
  await waitForCondition(()=>evaluate(`window.testReads.includes('DSP-NEXT-DAY') && document.querySelector('[data-completed-dsp-actual-end="DSP-NEXT-DAY"]')?.textContent.includes('0815')`),15000,'all completed DSP reads');
  const state=await evaluate(`(()=>{const text=key=>document.querySelector('[data-completed-dsp-actual-end="'+key+'"]')?.textContent.trim()||null;return {jc:text('DSP-JC'),missing:text('DSP-MISSING'),error:text('DSP-ERROR'),foreign:text('DSP-FOREIGN'),invalid:text('DSP-INVALID'),nextDay:text('DSP-NEXT-DAY'),non:text('NON-DSP'),earlier:text('DSP-EARLIER'),cancelled:text('DSP-CANCELLED'),reads:window.testReads,writes:window.testWrites,
    scheduled:document.querySelector('[data-completed-dsp-schedule="DSP-MISSING"]')?.textContent,
    rowFits:[...document.querySelectorAll('[data-completed-dsp-actual-end]')].every(e=>e.scrollWidth<=e.clientWidth),
    actions:[...document.querySelector('[data-completed-operational-card="DSP-JC"]').querySelectorAll('button')].map(b=>b.textContent.trim())};})()`);
  assert.match(state.jc,/17 Sept 2026, 1423hrs SGT/);assert.match(state.nextDay,/18 Sept 2026, 0815hrs SGT/);
  for(const key of ['missing','foreign','invalid'])assert.equal(state[key],'Actual end (JC): Not reported');
  assert.equal(state.error,'Actual end (JC): Unavailable — reopen Completed');
  assert.equal(state.non,null);assert.equal(state.earlier,null);assert.equal(state.cancelled,null);
  assert.match(state.scheduled,/1500hrs SGT/);assert.equal(state.rowFits,true);
  assert.ok(state.actions.includes('Load this booking'));assert.ok(state.actions.includes('Undo completed'));assert.ok(state.actions.includes('Delete'));
  assert.deepEqual([...new Set(state.reads)].sort(),['DSP-JC','DSP-MISSING','DSP-ERROR','DSP-FOREIGN','DSP-INVALID','DSP-NEXT-DAY'].sort());
  assert.deepEqual(state.writes,[]);
  await evaluate(`document.querySelector('[data-completed-operational-card="DSP-JC"]').scrollIntoView({block:'center'})`);
  const shot=await client.send('Page.captureScreenshot',{format:'png'});await writeFile(`/private/tmp/prestige-completed-dsp-end-${width}.png`,Buffer.from(shot.data,'base64'));
  await evaluate('window.testRecover=true');await clickTab('Bookings');await clickTab('Completed');
  await waitForCondition(()=>evaluate(`document.querySelector('[data-completed-dsp-actual-end="DSP-ERROR"]')?.textContent.includes('1423')`),15000,'read recovery on reopening Completed');
  assert.deepEqual(await evaluate('window.testWrites'),[]);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: persisted JC only; missing, foreign, invalid, next-day, read failure/retry; unchanged scheduled end/actions; excluded non-DSP/earlier/cancelled; 390/1280px; zero writes.');
} finally {if(client)await client.close();await terminateChildProcess(chrome);await rm(profile,{recursive:true,force:true});}
