import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { recordModule, clientFor, issueInput, actor, loadFunctions, folderSource, job } from './test-customer-company-booker-invoice-preparation-guard.mjs';
const page = readFileSync('app/customers/page.tsx','utf8');
assert.ok(page.includes('data-selected-job-invoice-mark-sent="true"'), 'Paid review must offer Mark as sent');
const writes = [], invoices = [];
const client = clientFor({writes,invoices});
const paidInput = {...issueInput,status:'Paid',action:'mark_manually_sent'};
// Regression: a registered traveller without a configured prefix must complete
// the owner's Paid -> Mark as sent flow using standard numbering, same identity.
const noPrefixWrites = [], noPrefixInvoices = [];
const noPrefixClient = clientFor({bookings:[{...job,traveler_id:70}],writes:noPrefixWrites,invoices:noPrefixInvoices});
let prefixChecks = 0;
noPrefixClient.rpc = async () => { prefixChecks += 1; return {data:null,error:{code:'P0001',message:'traveler_invoice_prefix_required'}}; };
const travelerPaidInput = {...paidInput,travelerId:70};
const noPrefixIssued = await recordModule.createCustomerInvoiceRecord(travelerPaidInput,actor,noPrefixClient);
assert.equal(noPrefixIssued.ok,true,JSON.stringify(noPrefixIssued));
assert.match(noPrefixIssued.data.invoiceNumber,/^INV-\d{8}-\d{4}$/);
assert.equal(noPrefixWrites[0].booker_id,38);
assert.equal(noPrefixWrites[0].traveler_id,70);
assert.equal(noPrefixWrites[0].email_delivery_status,'not_sent');
assert.ok(noPrefixIssued.data.manuallySentAt);
assert.equal((await recordModule.createCustomerInvoiceRecord(travelerPaidInput,actor,noPrefixClient)).status,409);
assert.equal(noPrefixWrites.length,1);
assert.equal(prefixChecks,1,'Duplicate guard runs before any further number reservation');
for (const prefixError of [
 {code:'P0001',message:'traveler_invoice_sequence_not_active'},
 {code:'P0001',message:'traveler_invoice_prefix_malformed'},
 {code:'P0001',message:'verified_traveler_invoice_identity_mismatch'},
 {code:'42501',message:'permission denied'},
 {code:'P0001',message:'database unavailable'},
]) {
 const attempts=[];const db=clientFor({bookings:[{...job,traveler_id:70}],writes:attempts});
 db.rpc=async()=>({data:null,error:prefixError});
 assert.equal((await recordModule.createCustomerInvoiceRecord(travelerPaidInput,actor,db)).ok,false);
 assert.equal(attempts.length,0,'Only an absent prefix may use standard numbering');
}
const ordinaryWrites=[];const ordinaryDb=clientFor({bookings:[{...job,traveler_id:70}],writes:ordinaryWrites});
ordinaryDb.rpc=noPrefixClient.rpc;
assert.equal((await recordModule.createCustomerInvoiceRecord({...travelerPaidInput,action:undefined},actor,ordinaryDb)).status,409);
assert.equal(ordinaryWrites.length,0,'Normal Issue/Send numbering remains unchanged');
const configuredWrites=[];const configuredDb=clientFor({bookings:[{...job,traveler_id:70}],writes:configuredWrites});
configuredDb.rpc=async()=>({data:[{invoice_number:'LOCAL-0002'}],error:null});
assert.equal((await recordModule.createCustomerInvoiceRecord(travelerPaidInput,actor,configuredDb)).data.invoiceNumber,'LOCAL-0002');
const issued = await recordModule.createCustomerInvoiceRecord(paidInput,actor,client);
assert.equal(issued.ok,true,JSON.stringify(issued));
assert.equal(writes.length,1);
assert.equal(issued.data.status,'Paid');
assert.ok(issued.data.manuallySentAt);
assert.equal(writes[0].email_delivery_status,'not_sent');
assert.equal(writes[0].email_sent_at,undefined);
assert.equal(writes[0].manually_sent_pdf_sha256,writes[0].pdf_sha256);
assert.match(Buffer.from(writes[0].pdf_base64,'base64').toString('latin1'), /%PDF-/);
assert.equal((await recordModule.createCustomerInvoiceRecord(paidInput,actor,client)).status,409);
assert.equal(writes.length,1,'Retry cannot issue another invoice for the same booking');
for(const change of [{status:'Unpaid'},{documentState:'draft'},{documentType:'quotation'},{bookerId:39}]) {
 const attempts=[];
 const result=await recordModule.createCustomerInvoiceRecord({...paidInput,...change},actor,clientFor({writes:attempts}));
 assert.equal(result.ok,false);assert.equal(attempts.length,0);
}
const failedRows=[];
assert.equal((await recordModule.createCustomerInvoiceRecord(paidInput,actor,clientFor({writes:failedRows,insertError:{code:'42703',message:'manually_sent_at missing'}}))).ok,false);
assert.equal(failedRows.length,0,'Missing migration must not issue an unmarked invoice through a fallback');
const coverage=loadFunctions(folderSource,['normalizedExactInvoiceReference','issuedInvoiceBookingReferences','bookingHasIssuedInvoice']);
const refs=coverage.issuedInvoiceBookingReferences([issued.data],'164');
assert.equal(coverage.bookingHasIssuedInvoice(job,refs),true,'Only issued exact booking leaves pending jobs');
assert.equal(coverage.bookingHasIssuedInvoice({...job,booking_reference:'OTHER',public_booking_reference:'99009'},refs),false);
assert.equal(coverage.issuedInvoiceBookingReferences([issued.data],'165').size,0);
assert.equal(coverage.issuedInvoiceBookingReferences([{...issued.data,documentState:'draft'}],'164').size,0);

// Execute the real existing-invoice action against a strict conditional-update fixture.
function patchClient(row, {fail=false,race=false}={}) {
 const calls=[];
 return {calls,from(table) {
  assert.equal(table,'customer_invoice_records');
  let filters=[],payload=null;
  const query={ select(){return query},eq(k,v){filters.push([k,v]);return query},
   update(value){payload=value;return query},maybeSingle(){return query},
   then(resolve,reject){
    if(payload&&race)row.updated_at='concurrent-change';
    const match=filters.every(([k,v])=>row[k]===v);
    if(payload&&match&&!fail){calls.push(payload);Object.assign(row,payload)}
    return Promise.resolve({data:match&&!fail?{...row}:null,error:fail?{message:'unavailable'}:null}).then(resolve,reject);
   }};return query;
 }};
}
const saved={...invoices[0],manually_sent_at:null,manually_sent_pdf_sha256:null};
const patchInput={invoiceNumber:saved.invoice_number,customerId:saved.customer_id,expectedPdfVersion:saved.pdf_sha256};
const patchDb=patchClient(saved);
const marked=await recordModule.markAdminCustomerInvoiceManuallySent(patchInput,actor,patchDb);
assert.equal(marked.ok,true,JSON.stringify(marked));
assert.ok(marked.data.manuallySentAt);
assert.deepEqual(Object.keys(patchDb.calls[0]).sort(),['actor_label','actor_role','manually_sent_at','manually_sent_pdf_sha256','updated_at']);
assert.equal(saved.email_delivery_status,'not_sent');assert.equal(saved.status,'Paid');
const again=await recordModule.markAdminCustomerInvoiceManuallySent(patchInput,actor,patchDb);
assert.equal(again.data.manuallySentAt,marked.data.manuallySentAt);assert.equal(patchDb.calls.length,1);
for(const delta of [{status:'Unpaid'},{document_type:'quotation'},{document_state:'draft'},{customer_id:'165'},{pdf_sha256:'a'.repeat(64)},{line_items:[]}]) {
 const db=patchClient({...saved,...delta,manually_sent_at:null});
 assert.equal((await recordModule.markAdminCustomerInvoiceManuallySent(patchInput,actor,db)).ok,false);
 assert.equal(db.calls.length,0);
}
for(const options of [{fail:true},{race:true}]) {
 const db=patchClient({...saved,manually_sent_at:null},options);
 assert.equal((await recordModule.markAdminCustomerInvoiceManuallySent(patchInput,actor,db)).ok,false);assert.equal(db.calls.length,0);
}
assert.equal((await recordModule.markAdminCustomerInvoiceManuallySent(patchInput,{...actor,actor_role:'driver'},patchDb)).status,403);
// A changed PDF does not retain the manual-sent badge. Reload reads the marker persistently.
const reload=await recordModule.loadAdminCustomerInvoiceRecords(actor,clientFor({invoices:[saved]}));
assert.equal(reload.data[0].manuallySentAt,marked.data.manuallySentAt);
const amended=await recordModule.loadAdminCustomerInvoiceRecords(actor,clientFor({invoices:[{...saved,pdf_sha256:'a'.repeat(64)}]}));
assert.equal(amended.data[0].manuallySentAt,null);

// Execute the real UI handler: no email/PDF requests, no deletion, no optimistic success on failure.
const ast=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='markSelectedJobInvoiceSent')handler=node.getText(ast);ts.forEachChild(node,visit)}visit(ast);
assert.ok(handler);
async function runUi({result=issued,confirm=true,pending=false,existing=null}={}) {
 const requests=[],events=[],stored=[],messages=[];let locked={current:pending};
 const bindings={manualInvoiceSentPendingRef:locked,issuingCustomerInvoiceKey:'',emailingCustomerInvoiceNumber:'',downloadingCustomerInvoiceNumber:'',
 plainInvoiceIssuedRecord:existing,plainInvoiceSelectedJobReviewStatus:'Paid',isPlainInvoicePreviewCurrent:true,
 plainInvoiceRequestBodyFromPreview:()=>paidInput,confirmInvoiceSafetyAction:()=>confirm,formatInvoiceAmount:()=>'$260.00',
 plainInvoiceSelectedJobReviewAmountCents:26000,plainInvoicePreview:{customerName:'LOCAL ACCOUNT',reference:job.booking_reference},
 adminCustomerInvoicesApiPath:'/api/admin-customer-invoices',setManualInvoiceSentPending:()=>{},
 fetch:async(url,request)=>{requests.push({url,...request});return{ok:result.ok,json:async()=>result.ok?{ok:true,invoice:result.data}:{ok:false,error:'Save failed'}}},
 saveCustomerLocalInvoice:i=>stored.push(i),updateIssuedInvoiceState:()=>{},setPlainInvoiceIssuedRecord:()=>{},
 window:{dispatchEvent:e=>events.push(e.type)},Event:class {constructor(type){this.type=type}},
 setPlainInvoiceFeedback:m=>messages.push(m),setPlainInvoiceFeedbackTone:()=>{},customerInvoiceActionFailureMessage:(s,e)=>String(e)};
 const compiled=ts.transpileModule(handler+'\nreturn markSelectedJobInvoiceSent;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const fn=new Function(...Object.keys(bindings),compiled)(...Object.values(bindings));
 await Promise.all([fn(),fn()]);
 return{requests,events,stored,messages};
}
const ui=await runUi();assert.equal(ui.requests.length,1);assert.equal(ui.requests[0].url,'/api/admin-customer-invoices');assert.equal(ui.requests[0].method,'POST');
assert.deepEqual(ui.events,['prestige:customer-invoice-updated']);assert.equal(ui.stored[0].status,'Paid');
const failUi=await runUi({result:{ok:false}});assert.equal(failUi.events.length,0);assert.equal(failUi.stored.length,0);
assert.equal((await runUi({confirm:false})).requests.length,0);
assert.equal((await runUi({pending:true})).requests.length,0);
assert.equal((await runUi({existing:issued.data})).requests.length,0);
const existingUi=await runUi({existing:{...issued.data,manuallySentAt:null}});assert.equal(existingUi.requests[0].method,'PATCH');
assert.equal(JSON.parse(existingUi.requests[0].body).invoiceNumber,issued.data.invoiceNumber);
console.log('Invoice manual-sent issue/PDF, exact filtering, persistence, repeat/race/failure, privacy and UI-handler tests passed');
