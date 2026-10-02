import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createChromeClient,waitForChromeDebugPort,waitForChromePageTarget,waitForCondition,terminateChildProcess} from './browser-test-helpers.mjs';
const url=process.env.APP_URL||'http://127.0.0.1:3199';
assert.ok(['127.0.0.1','localhost'].includes(new URL(url).hostname),'Local synthetic app only');
// Reuse the existing complete Admin fixture and exact-booking navigation. No real providers.
const existing=await readFile(new URL('./test-admin-incoming-message-alerts-browser.mjs',import.meta.url),'utf8');
const fixture=existing.match(/Page\.addScriptToEvaluateOnNewDocument',\{source:`([\s\S]*?)`\}\);/)[1];
const profile=await mkdtemp(path.join(os.tmpdir(),'prestige-ack-clear-'));
const port=Number(process.env.CHROME_DEBUG_PORT||9365);
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'});
let client;
try{
  await waitForChromeDebugPort(port);const target=await waitForChromePageTarget(port);client=createChromeClient(target.webSocketDebuggerUrl);await client.ready;
  await client.send('Page.enable');await client.send('Runtime.enable');
  await client.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  const errors=[];client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.text));
  const evaluate=async expression=>{const result=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;};
  const wait=(expr,label)=>waitForCondition(()=>evaluate(`Boolean(${expr})`),30000,label);
  await client.send('Page.addScriptToEvaluateOnNewDocument',{source:fixture+`
    const baseFetch=window.fetch;
    window.qaAck=false;window.qaIssued=false;window.qaLinkWrites=[];window.qaAckReads=0;
    const unassigned=new URL(location.href).searchParams.has('qa_new_driver');
    const pendingBooking={id:'EXACT-POOL',booking_reference:'EXACT-POOL',public_booking_reference:'11081',booking_type:'TRF',vehicle:'AVF',pickup_at:new Date(Date.now()+18*3600000).toISOString(),pickup_address:'Example pool pickup',dropoff_address:'Example pool destination',passenger_name:'Example Pool Passenger',driver_id:unassigned?null:72,driver_name:unassigned?'':'Example Pool Winner',driver_contact:unassigned?'':'90000072',driver_plate_number:unassigned?'':'QA0072',status:'assigned',pax:1};
    window.qaBookings.push(pendingBooking);
    const link=()=>({id:'55555555-5555-4555-8555-555555555555',booking_reference:'EXACT-POOL',link_status:'active',issued_at:new Date().toISOString(),expires_at:new Date(Date.now()+96*3600000).toISOString(),revoked_at:null,safe_summary:{acknowledged:window.qaAck,acknowledged_at:window.qaAck?new Date().toISOString():null,assigned_driver:unassigned&&!window.qaAck?null:'Example Pool Winner',assigned_driver_contact:unassigned&&!window.qaAck?null:'90000072',assigned_driver_plate:unassigned&&!window.qaAck?null:'QA0072',vehicle:'AVF',job_card_kind:'new'}});
    window.fetch=async(input,init)=>{
      const u=new URL(typeof input==='string'?input:input.url,location.href);const method=init?.method||'GET';
      if(u.pathname==='/api/admin-driver-job-links'){
        if(method==='POST'){
          window.qaLinkWrites.push(JSON.parse(init.body));window.qaIssued=true;
          return Response.json({ok:true,disposition:'created',link:link(),driver_job_url:location.origin+'/driver-job/SYNTHETIC-ONLY',native_app_alert:{reason:'provider_failed'}});
        }
        if(method==='GET'){
          if(window.qaAck)window.qaAckReads++;
          return Response.json({ok:true,links:window.qaIssued?[link()]:[],pagination:{has_next_page:false}});
        }
      }
      const response=await baseFetch(input,init);
      if(u.pathname==='/api/admin-bookings'&&u.searchParams.get('booking_reference')==='EXACT-POOL'&&unassigned){
        const data=await response.json();Object.assign(data.booking,{driver_id:null,driver_name:'',driver_contact:'',driver_plate_number:''});return Response.json(data);
      }
      return response;
    };
  `});
  await client.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const open=async(extra='')=>{
    await client.send('Page.navigate',{url:url+'/?admin_alert=alert%3A44444444-4444-4444-8444-444444444444'+extra});
    await wait(`document.querySelector('[data-create-driver-job-link-button]')?.disabled===false`,'exact booking Create Link enabled');
    await evaluate(`document.querySelector('[data-create-driver-job-link-button]').click()`);
    await wait(`document.querySelector('[data-copy-driver-job-link-button]')?.disabled===false`,'issued copy available');
  };
  const inputValue=()=>evaluate(`document.querySelector('textarea[placeholder^="Paste WhatsApp"]')?.value ?? [...document.querySelectorAll('textarea')].find(e=>e.placeholder?.includes('booking'))?.value`);
  const typeMessage=async(text)=>evaluate(`(()=>{const input=document.querySelector('textarea[placeholder^="Paste WhatsApp"]');if(!input)throw Error('Missing existing booking message input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await open('&qa_new_driver=1');
  assert.equal(await evaluate(`!!document.querySelector('[data-driver-job-link-handoff-notice]')`),true,'Unassigned Create retains form until copy or ACK');
  await evaluate(`window.qaAck=true`);
  await wait(`!document.querySelector('[data-driver-job-link-copy-reference]')`,'fresh ACK clears old copy');
  assert.equal(await evaluate(`!!document.querySelector('[data-driver-job-link-handoff-notice]')`),false,'ACK clears exact selected form');
  assert.equal(await inputValue(),'');
  assert.deepEqual(await evaluate('window.qaWrites'),[]);assert.equal(await evaluate('window.qaLinkWrites.length'),1);
  const evidence=process.env.EVIDENCE_DIR||'/private/tmp/prestige-dispatch-ack-clear-evidence';await mkdir(evidence,{recursive:true});
  const shot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(evidence,'ack-cleared-mobile.png'),Buffer.from(shot.data,'base64'));
  await typeMessage('AVF TRF\n6 Oct 2030, 1300hrs\nMarina Bay Sands > Raffles Hotel\nPassenger: NEXT QA BOOKING\n1 pax');
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Create Job Card').click()`);
  await wait(`document.querySelector('[data-mobile-dispatch-step="details"]')`,'next Create Job Card opens Details without saved-booking blocker');
  assert.deepEqual(await evaluate('window.qaWrites'),[]);
  await client.send('Browser.grantPermissions',{origin:url,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  await open('&qa_new_driver=1');
  await evaluate(`document.querySelector('[data-copy-driver-job-link-button]').click()`);
  await wait(`!document.querySelector('[data-driver-job-link-handoff-notice]')`,'new driver Copy Link clears form before ACK');
  assert.ok(await evaluate(`!!document.querySelector('[data-driver-job-link-copy-reference]')`));
  await evaluate(`window.qaAck=true`);
  await wait(`!document.querySelector('[data-driver-job-link-copy-reference]')`,'new driver ACK retires retained copied link');
  assert.equal(await inputValue(),'');assert.deepEqual(await evaluate('window.qaWrites'),[]);
  await open();
  await typeMessage('NEXT UNSAVED BOOKING');
  await evaluate(`window.qaAck=true`);
  await wait(`!document.querySelector('[data-driver-job-link-copy-reference]')`,'ACK retires old preview while keeping next draft');
  assert.equal(await inputValue(),'NEXT UNSAVED BOOKING');
  assert.deepEqual(await evaluate('window.qaWrites'),[]);assert.equal(await evaluate('window.qaLinkWrites.length'),1);
  await open('&qa_new_driver=1');
  await typeMessage('EDITED MESSAGE MUST SURVIVE');
  await evaluate(`window.qaAck=true`);
  await wait(`window.qaAckReads>0`,'fresh ACK read with edited form');
  await new Promise(r=>setTimeout(r,300));
  assert.ok(await evaluate(`!!document.querySelector('[data-driver-job-link-copy-reference]')`));
  assert.equal(await inputValue(),'EDITED MESSAGE MUST SURVIVE');
  assert.ok(await evaluate(`!!document.querySelector('[data-driver-job-link-handoff-notice]')`));
  assert.deepEqual(await evaluate('window.qaWrites'),[]);assert.deepEqual(errors,[]);
  console.log('PASS mobile full Admin browser: existing Create Link -> fresh synthetic ACK read -> empty form; retained-copy retirement preserves next draft; edited selected booking remains intact; one explicit mock link POST per case, no other writes or browser exceptions.');
}finally{if(client)await client.close();await terminateChildProcess(chrome);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
