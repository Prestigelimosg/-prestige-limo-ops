import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createChromeClient,waitForChromeDebugPort,waitForChromePageTarget,waitForCondition,terminateChildProcess} from './browser-test-helpers.mjs';
import {recordModule,clientFor,actor,job} from './test-customer-company-booker-invoice-preparation-guard.mjs';
const appUrl=process.env.APP_URL||'http://localhost:3010';
assert.ok(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(appUrl),'Local test only');
const port=Number(process.env.CHROME_DEBUG_PORT||9257);
const missingTravelerPrefix=process.env.MISSING_TRAVELER_PREFIX==='1';
const profile=await mkdtemp(path.join(os.tmpdir(),'prestige-manual-invoice-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-networking',`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
let c;
const rows=[],writes=[],requests=[],errors=[];
const booking={...job,customer_account:'LOCAL ACCOUNT',customer_display_name:'LOCAL ACCOUNT',passenger_name:'Sample Passenger',customer_price_amount:85,service_type:'MNG',route_type:'MNG',pickup_at:'2026-09-15T10:00:00Z',pickup_datetime:'2026-09-15T10:00:00Z',pickup_location:'Changi Airport',dropoff_location:'Example Hotel',route_summary:'Changi Airport > Example Hotel',status:'confirmed',vehicle_type_or_category:'AVF',route_points:[],service_items:[]};
if(missingTravelerPrefix) booking.traveler_id=70;
const other={...booking,booking_reference:'ADM-20990101000009',public_booking_reference:'99009'};
const db=clientFor({bookings:[booking,other],invoices:rows,writes});
let pdfMode='ok';
let prefixChecks=0;
db.rpc=async()=>{prefixChecks+=1;return {data:null,error:{code:'P0001',message:'traveler_invoice_prefix_required'}}};
try{
 await waitForChromeDebugPort(port);const target=await waitForChromePageTarget(port);c=createChromeClient(target.webSocketDebuggerUrl);await c.ready;
 await c.send('Page.enable');await c.send('Runtime.enable');await c.send('Fetch.enable',{patterns:[{urlPattern:'*/api/*',requestStage:'Request'}]});
 c.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
 c.on('Page.javascriptDialogOpening',()=>void c.send('Page.handleJavaScriptDialog',{accept:true}));
 c.on('Fetch.requestPaused',async({request,requestId})=>{
  try{
   const url=new URL(request.url),method=request.method||'GET';requests.push({path:url.pathname,method});let body={ok:true};let code=200;
   if(url.pathname==='/api/admin-customer-invoices'){
    if(method==='GET'){const result=await recordModule.loadAdminCustomerInvoiceRecords(actor,db);body={ok:result.ok,invoices:result.data};}
    else if(method==='POST'){const input=JSON.parse(request.postData);assert.equal(input.action,'mark_manually_sent');assert.equal(input.status,'Paid');const result=await recordModule.createCustomerInvoiceRecord(input,actor,db);body={ok:result.ok,invoice:result.data,error:result.error};code=result.ok?200:result.status;}
    else throw new Error('Unexpected invoice method '+method);
   }else if(method!=='GET')throw new Error('Unexpected write '+url.pathname);
   else if(url.pathname.startsWith('/api/admin-customer-invoice-pdf/')){
    assert.equal(method,'GET');
    assert.equal(request.headers['x-prestige-admin-purpose'],'admin-booking-persistence');
    const number=decodeURIComponent(url.pathname.split('/').pop());
    assert.equal(number,rows[0].invoice_number,'Open only the clicked stored invoice');
    const result=await recordModule.loadAdminCustomerInvoicePdf(number,actor,db);
    assert.equal(result.ok,true);
    await c.send('Fetch.fulfillRequest',{requestId,responseCode:pdfMode==='denied'?403:200,responseHeaders:[{name:'content-type',value:['ok','corrupt'].includes(pdfMode)?'application/pdf':'application/json'}],body:pdfMode==='ok'?Buffer.from(result.data.bytes).toString('base64'):Buffer.from('{"ok":false}').toString('base64')});return;
   }
   else if(url.pathname==='/api/admin-customer-saved-bookings')body={ok:true,saved_bookings:[booking,other],summary:{returned_count:2}};
   else if(url.pathname==='/api/admin-bookings')body={ok:true,booking,bookings:[booking,other]};
   else if(url.pathname==='/api/admin-customer-accounts')body={ok:true,accounts:[{customer_id:'164',customer_name:'LOCAL ACCOUNT',guest_account_billing_enabled:false,verified_company_id:60}]};
   else if(url.pathname==='/api/admin-rate-setup')body={ok:true,companies:[{id:60,name:'LOCAL ACCOUNT',company_name:'LOCAL ACCOUNT'}],bookers:[{id:38,company_id:60,customer_id:164,name:'Sample Booker'}],travelers:[],settings:{customer_rates:{MNG:{AVF:85},DSP:{AVF:65}}}};
   else if(url.pathname.includes('invoice-recipient'))body={ok:true,recipients:[]};
   else body={ok:true,accounts:[],bookings:[],invoices:[],companies:[],travelers:[],customers:[],items:[]};
   await c.send('Fetch.fulfillRequest',{requestId,responseCode:code,responseHeaders:[{name:'content-type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
  }catch(e){errors.push(String(e));await c.send('Fetch.fulfillRequest',{requestId,responseCode:500,body:Buffer.from(JSON.stringify({ok:false,error:String(e)})).toString('base64')})}
 });
 const evaluate=async(expression)=>{const r=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value};
 const wait=async(selector)=>waitForCondition(()=>evaluate(`!!document.querySelector(${JSON.stringify(selector)})`),15000,selector);
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const folderUrl=appUrl+'/customers/164?name=LOCAL+ACCOUNT';
 await c.send('Page.navigate',{url:folderUrl});
 await wait(`[data-customer-folder-saved-bookings-select="${job.booking_reference}"]`);
 await click(`[data-customer-folder-saved-bookings-select="${job.booking_reference}"]`);
 await click(`[data-customer-folder-saved-bookings-paid="${job.booking_reference}"]`);
 // Read the exact established Invoice link after Paid and price-review state renders.
 await waitForCondition(()=>evaluate(`!!Array.from(document.querySelectorAll('a')).find(a=>a.href.includes('paid_booking_reference'))`),10000,'paid invoice link');
 const href=await evaluate(`Array.from(document.querySelectorAll('a')).find(a=>a.href.includes('paid_booking_reference')).href`);
 await c.send('Page.navigate',{url:href});
 await wait('[data-selected-job-invoice-mark-sent]');
 await waitForCondition(()=>evaluate(`!document.querySelector('[data-selected-job-invoice-mark-sent]').disabled`),15000,'ready Paid review');
 assert.ok((await evaluate(`document.querySelector('[data-selected-job-invoice-review]').textContent`)).includes('Paid'));
 const lineText=await evaluate(`document.querySelector('[data-selected-job-invoice-lines]').textContent`);
 assert.ok(!/\|\s*REF\b/i.test(lineText),'Visible item description omits the repeated reference');
 assert.ok((await evaluate(`document.querySelector('[data-selected-job-invoice-recipient-details]').textContent`)).includes('Reference '+job.public_booking_reference),'Bill To retains the visible reference');
 await c.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 const rect=await evaluate(`(()=>{const r=document.querySelector('[data-selected-job-invoice-mark-sent]').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth}})()`);assert.ok(rect.left>=0&&rect.right<=rect.width,'Compact button stays in mobile viewport');
 await click('[data-selected-job-invoice-mark-sent]');
 await waitForCondition(()=>evaluate(`document.querySelector('[data-selected-job-invoice-mark-sent]')?.textContent.includes('Marked as sent')`),15000,'stored manually-sent badge');
 assert.equal(writes.length,1);assert.equal(writes[0].status,'Paid');assert.equal(writes[0].email_delivery_status,'not_sent');
 assert.equal(prefixChecks,missingTravelerPrefix?1:0);
 assert.equal(writes[0].traveler_id,missingTravelerPrefix?70:null);
 assert.match(writes[0].invoice_number,/^INV-\d{8}-\d{4}$/);
 assert.equal(writes[0].line_items[0].bookingReference,job.booking_reference,'Stored exact booking link is preserved');
 const pdfText=Buffer.from(writes[0].pdf_base64,'base64').toString('latin1');
 assert.ok(pdfText.includes('Reference: '+job.public_booking_reference));
 assert.ok(!pdfText.includes('REF '+job.public_booking_reference));
 const screen=await c.send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/prestige-manual-sent-review.png',Buffer.from(screen.data,'base64'));
 await c.send('Page.navigate',{url:folderUrl});
 await wait(`[data-customer-folder-saved-bookings-select="${other.booking_reference}"]`);
 await waitForCondition(()=>evaluate(`!document.querySelector('[data-customer-folder-saved-bookings-select="${job.booking_reference}"]')`),10000,'billed job excluded');
 assert.equal(await evaluate(`!!document.querySelector('[data-customer-folder-saved-bookings-select="${other.booking_reference}"]')`),true);
 await waitForCondition(()=>evaluate(`document.body.textContent.includes('Marked as sent')`),10000,'persistent folder status');
 await wait('[data-customer-invoice-folder-selected-item-table]');
 const storedItemText=await evaluate(`document.querySelector('[data-customer-invoice-folder-selected-item-table]').textContent`);
 assert.ok(!/\|\s*REF\b/i.test(storedItemText),'Total invoices item display must also omit the repeated reference');
 assert.ok(rows[0].line_items[0].description.includes('REF '+job.public_booking_reference),'Display removal must not rewrite stored descriptions');
 assert.equal(rows[0].line_items[0].bookingReference,job.booking_reference);
 // Both existing controls must open the saved PDF, even when this row is already selected.
 const snapshot=JSON.stringify(rows);
 const realClick=async(selector)=>{
  const point=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
 };
 for(const control of ['view','open']){
  const before=(await c.send('Target.getTargets')).targetInfos.map(t=>t.targetId);
  await realClick(`[data-customer-invoice-folder-${control}]`);
  let opened;
  await waitForCondition(async()=>{opened=(await c.send('Target.getTargets')).targetInfos.find(t=>!before.includes(t.targetId)&&t.url.startsWith('blob:'));return !!opened},5000,'clicked control opens the saved PDF');
  const targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
  const pdfTarget=targets.find(t=>t.id===opened.targetId);
  assert.ok(pdfTarget?.webSocketDebuggerUrl,'PDF viewer target is available');
  const pdfViewer=createChromeClient(pdfTarget.webSocketDebuggerUrl);await pdfViewer.ready;
  try{
   const state=await pdfViewer.send('Runtime.evaluate',{expression:'({type:document.contentType,opener:window.opener===null})',returnByValue:true});
   assert.equal(state.result.value.type,'application/pdf','Browser actually displays a PDF document');
   assert.equal(state.result.value.opener,true,'PDF viewer cannot control the admin folder');
   if(control==='open'){
    await pdfViewer.send('Runtime.evaluate',{expression:'new Promise(resolve => setTimeout(resolve, 2000))',awaitPromise:true});
    const image=await pdfViewer.send('Page.captureScreenshot',{format:'png'});
    await writeFile('/private/tmp/prestige-invoice-view-local.png',Buffer.from(image.data,'base64'));
   }
  }finally{pdfViewer.close()}
  assert.equal(await evaluate(`document.querySelector('[data-customer-invoice-folder-detail]').textContent.includes('Marked as sent')`),true);
  await c.send('Target.closeTarget',{targetId:opened.targetId});
 }
 assert.equal(requests.filter(r=>r.path.startsWith('/api/admin-customer-invoice-pdf/')).length,2);
 for(const mode of ['denied','invalid','corrupt']){
  pdfMode=mode;
  const before=(await c.send('Target.getTargets')).targetInfos.filter(t=>t.type==='page').length;
  await realClick('[data-customer-invoice-folder-open]');
  await waitForCondition(()=>evaluate(`document.querySelector('[data-customer-invoice-folder-action-message]')?.textContent.includes('could not be opened')`),5000,'failed PDF read visible');
  assert.equal((await c.send('Target.getTargets')).targetInfos.filter(t=>t.type==='page').length,before,'Failed read closes the blank viewer');
 }
 pdfMode='ok';
 const readsBeforeBlocked=requests.length;
 await evaluate(`window.__originalOpen=window.open;window.open=()=>null`);
 await realClick('[data-customer-invoice-folder-open]');
 await waitForCondition(()=>evaluate(`document.querySelector('[data-customer-invoice-folder-action-message]')?.textContent.includes('allow pop-ups')`),5000,'popup blocking explained');
 await evaluate(`window.open=window.__originalOpen;delete window.__originalOpen`);
 assert.equal(requests.length,readsBeforeBlocked,'Blocked popup does not fetch the document');
 assert.equal(JSON.stringify(rows),snapshot,'Viewing and read failures cannot change stored invoice/payment/manual evidence');
 assert.equal(rows.length,1);assert.equal(requests.filter(r=>r.method!=='GET').length,1,'Exactly one invoice write and no email/payment/deletion');
 assert.deepEqual(errors,[]);
 console.log(`Browser PASS (${missingTravelerPrefix?'registered traveller without prefix':'Company + Booker'}): Paid tick → review → Mark as sent → same paid invoice in Total invoices → only linked job removed from pending; Bill To reference retained, item reference hidden, 390px button visible; both invoice controls open application/pdf; denied/invalid reads and blocked popups fail visibly without writes.`);
}catch(e){if(c){const r=await c.send('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true}).catch(()=>null);await writeFile('/private/tmp/prestige-manual-sent-browser-failure.txt',String(r?.result?.value));}throw e}
finally{if(c)c.close();await terminateChildProcess(chrome);await rm(profile,{recursive:true,force:true})}
