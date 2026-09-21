import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const page=readFileSync('app/page.tsx','utf8');
assert.ok(page.includes('data-completed-paid-booking={bookingId}'), 'Completed needs its exact-job Paid shortcut');
assert.ok(!page.slice(page.indexOf('data-completed-billing-ready-open-customers')).slice(0,160).includes('href="/customers"'), 'Billing ready must not drop exact job context');
console.log('Completed billing shortcut guard passed');

function load(source,name,bindings={}) {
 const ast=ts.createSourceFile('fixture.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let node;
 const visit=n=>{if(ts.isFunctionDeclaration(n)&&n.name?.text===name)node=n;ts.forEachChild(n,visit);};visit(ast);
 assert.ok(node,`Missing ${name}`);
 const code=ts.transpileModule(node.getText(ast)+`\nreturn ${name};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 return new Function(...Object.keys(bindings),code)(...Object.values(bindings));
}
const jobsSource=readFileSync('app/customers/[customerId]/saved-bookings-panel.tsx','utf8');
const panelSource=readFileSync('app/customers/[customerId]/customer-invoice-folder-panel.tsx','utf8');
const clean=value=>String(value??'').trim();
const booking={id:1,booking_reference:'ADM-209901010001',public_booking_reference:'99001',customer_id:164,customer_display_name:'SYNTHETIC ACCOUNT',status:'completed'};
for (const scenario of ['normal','paid','wrong-reference','missing-customer','not-completed','read-failure']) {
 let navigation='',message=null;const requests=[];
 const exact={...booking,...(scenario==='wrong-reference'?{booking_reference:'OTHER'}:{}),...(scenario==='missing-customer'?{customer_id:null}:{}),...(scenario==='not-completed'?{status:'assigned'}:{})};
 const open=load(page,'openCompletedHistoryBilling',{
  bookingRecordStableKey:r=>String(r.id),bookingRecordPersistedReference:r=>r?.booking_reference||'',bookingRecordIsCompletedStatus:r=>r.status==='completed',
  setCompletedHistoryBillingReadyBookingId:()=>{},setBookingCompletionMessage:(_,m)=>message=m,
  adminBookingsApiPath:'/api/admin-bookings',adminLegacyDataPurpose:'admin-booking-persistence',clean,
  adminDispatchVerifiedIdentityId:v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null,
  fetch:async(url,opts)=>{requests.push({url,opts});return{ok:scenario!=='read-failure',json:async()=>({ok:scenario!=='read-failure',booking:exact})};},
  window:{location:{assign:url=>navigation=url}},
 });
 await open(booking,undefined,scenario==='paid');
 assert.equal(requests.length,1);assert.equal(requests[0].opts.method,'GET');
 if(['normal','paid'].includes(scenario)){
  const url=new URL(navigation,'http://local.test');assert.equal(url.pathname,'/customers/164');
  assert.equal(url.searchParams.get('focus_booking_reference'),booking.booking_reference);
  assert.equal(url.searchParams.get('paid_booking_reference'),scenario==='paid'?booking.booking_reference:null);
 }else{assert.equal(navigation,'');assert.equal(message.tone,'error');}
}
const invoice={customerId:'164',customerName:'SYNTHETIC ACCOUNT',invoiceNumber:'INV-20990101-0001',reference:'99001',documentType:'invoice',documentState:'issued',status:'Unpaid',amountCents:8500,amountLabel:'SGD85.00',lineItems:[{bookingReference:'99001',amountLabel:'SGD85.00',description:'SYNTHETIC JOB'}]};
for(const scenario of ['single','multiple-jobs','multiple-invoices','none','paid','wrong-customer','draft','quotation','booking-mismatch','invoice-read-failure','normal-link']){
 const state={selected:'',payment:null,thankYou:null,message:'',requests:[]};
 const rows=scenario==='none'?[]:scenario==='multiple-invoices'?[invoice,{...invoice,invoiceNumber:'INV-20990101-0002'}]:[{...invoice,...(scenario==='multiple-jobs'?{lineItems:[...invoice.lineItems,{bookingReference:'99002'}]}:{}),...(scenario==='paid'?{status:'Paid'}:{}),...(scenario==='wrong-customer'?{customerId:'165'}:{}),...(scenario==='draft'?{documentState:'draft'}:{}),...(scenario==='quotation'?{documentType:'quotation'}:{})}];
 const params=new URLSearchParams({billing_source:'completed',focus_booking_reference:booking.booking_reference,...(scenario==='normal-link'?{}:{paid_booking_reference:booking.booking_reference})});
 const display=load(panelSource,'displayStoredInvoice',{safeDisplay:(v,f)=>clean(v)||f,centsFromAmountLabel:()=>8500});
 const fn=load(panelSource,'loadStoredInvoices',{
  window:{location:{search:'?'+params},setTimeout:()=>{}},document:{querySelector:()=>null},customer:{id:'164',companyName:'SYNTHETIC ACCOUNT'},
  completedBillingHandoffAppliedRef:{current:false},setCompletedBillingTargetRequested:()=>{},controller:{signal:{aborted:false}},
  adminCustomerInvoicesApiPath:'/api/admin-customer-invoices',adminCustomerSavedBookingsApiPath:'/api/admin-customer-saved-bookings',
  normalizeCustomerMatch:v=>clean(v).toLowerCase(),displayStoredInvoice:display,
  setStoredInvoices:()=>{},setStoredInvoiceMessage:v=>state.message=v,selectedInvoiceNumber:'',setSelectedInvoiceNumber:v=>state.selected=v,
  setInvoiceActionMode:v=>state.payment=v,setInvoiceActionMessage:v=>state.message=v,
  prepareMarkPaid:v=>state.payment=v.invoiceNumber,setSendPaymentThankYou:v=>state.thankYou=v,isPaidStatus:v=>v==='Paid',
  fetch:async(url,opts)=>{state.requests.push({url,opts});assert.ok(!opts?.method||opts.method==='GET');return{ok:scenario!=='invoice-read-failure',json:async()=>url.includes('saved-bookings')?{ok:true,saved_bookings:[{...booking,...(scenario==='booking-mismatch'?{customer_id:165}:{})}]}:{ok:true,invoices:rows}};},
 });
 await fn();
 assert.ok(state.requests[0].url.endsWith('customer_id=164'));
 if(scenario==='single'){assert.equal(state.selected,invoice.invoiceNumber);assert.equal(state.payment,invoice.invoiceNumber);assert.equal(state.thankYou,false);}
 else if(['multiple-jobs','paid','normal-link'].includes(scenario)){assert.equal(state.selected,invoice.invoiceNumber);assert.equal(state.payment,null);}
 else{assert.equal(state.selected,'');assert.equal(state.payment,null);}
}
// Complete customer-scoped reader: records beyond the old 50 cap, cross-customer
// isolation, pagination failure, malformed scope and no writes.
const {recordModule,clientFor,issueInput,actor,job,principalFixture}=await import('./test-customer-company-booker-invoice-preparation-guard.mjs');
const writes=[],issuedRows=[];
const bossA={...job,traveler_id:70};
const bossB={...job,traveler_id:71,booking_reference:'ADM-20990101000002',public_booking_reference:'99002'};
const db=clientFor({bookings:[bossA,bossB],writes,invoices:issuedRows});
let prefixChecks=0;
db.rpc=async(name,parameters)=>{
 prefixChecks++;
 assert.equal(name,'reserve_customer_invoice_number');assert.equal(parameters.p_booker_id,38);
 assert.ok([70,71].includes(parameters.p_traveler_id));
 return {data:null,error:{code:'P0001',message:'traveler_invoice_prefix_required'}};
};
const inputFor=booking=>({...issueInput,travelerId:booking.traveler_id,bookingReference:booking.booking_reference,reference:booking.booking_reference,amountCents:5500,lineItems:[{bookingReference:booking.booking_reference,description:'ARRIVAL | SYNTHETIC QA JOB',amountLabel:'SGD55.00',quantity:1}]});
const issued=await recordModule.createCustomerInvoiceRecord(inputFor(bossA),actor,db);
assert.equal(issued.ok,true,'Boss A normal Unpaid issue must work without its own prefix');
const base=issuedRows[0];
function readClient(rows,failSecond=false){return {from(table){assert.equal(table,'customer_invoice_records');let matched=rows,offset=0;const query={select(){return query;},eq(k,v){matched=matched.filter(x=>String(x[k])===String(v));return query;},order(){return query;},range(a,b){offset=a;matched=matched.slice(a,b+1);return query;},then(resolve,reject){return Promise.resolve({data:matched,error:failSecond&&offset>0?{message:'read failed'}:null}).then(resolve,reject);}};return query;}};}
const many=Array.from({length:201},(_,i)=>({...base,id:String(i+1),invoice_number:`INV-20990101-${String(i+1).padStart(4,'0')}`}));
const scoped=await recordModule.loadAdminCustomerInvoiceRecords(actor,readClient([...many,{...base,customer_id:'165'}]),'164');
assert.equal(scoped.ok,true);assert.equal(scoped.data.length,201);
assert.equal((await recordModule.loadAdminCustomerInvoiceRecords(actor,readClient(many,true),'164')).ok,false);
assert.equal((await recordModule.loadAdminCustomerInvoiceRecords(actor,readClient(many),'164,165')).status,400);
const issuedB=await recordModule.createCustomerInvoiceRecord(inputFor(bossB),actor,db);
assert.equal(issuedB.ok,true,'Boss B must use the same standard numbering path in the same PA account');
const other=issuedRows[1];
assert.equal(writes.length,2);assert.notEqual(base.invoice_number,other.invoice_number);
for(const row of issuedRows){
 assert.match(row.invoice_number,/^INV-\d{8}-\d{4}$/);
 assert.equal(row.customer_id,'164');assert.equal(row.booker_id,38);
 assert.equal(row.status,'Unpaid');assert.equal(row.amount_cents,5500);
 assert.equal(row.email_delivery_status,'not_sent');assert.equal(row.manually_sent_at,undefined);
}
for(const booking of [bossA,bossB]){
 assert.equal((await recordModule.createCustomerInvoiceRecord(inputFor(booking),actor,db)).status,409);
}
assert.equal(writes.length,2,'Normal issue retries must not duplicate either booking');
assert.equal(prefixChecks,2,'Duplicate coverage rejects before another numbering attempt');
const paymentDb={from(table){assert.equal(table,'customer_invoice_records');let filters=[],payload=null;const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},update(v){payload=v;return q;},maybeSingle(){return q;},then(resolve,reject){const row=issuedRows.find(r=>filters.every(([k,v])=>String(r[k])===String(v)));if(row&&payload)Object.assign(row,payload);return Promise.resolve({data:row?{...row}:null,error:null}).then(resolve,reject);}};return q;}};
const oldPdf=issuedRows[0].pdf_base64;
const updated=await recordModule.updateAdminCustomerInvoiceStatus(issued.data.invoiceNumber,{status:'Paid',paymentMethod:'Cash'},actor,paymentDb);
assert.equal(updated.ok,true);assert.equal(updated.data.status,'Paid');assert.equal(updated.data.paymentMethod,'Cash');assert.ok(updated.data.paidAt);
assert.equal(other.status,'Unpaid');assert.ok(issuedRows[0].pdf_base64);assert.notEqual(issuedRows[0].pdf_base64,oldPdf,'Paid PDF must be regenerated');
// Admin -> the existing authenticated customer portal shares the saved record/PDF.
const portalDb=clientFor({invoices:issuedRows});
const portal=await recordModule.loadCustomerInvoiceRecordsForPortal({customer_account_reference:'verified-pa'},portalDb);
assert.equal(portal.ok,true);
assert.equal(portal.data.length,2,'One Company + PA portal retains both Boss A and Boss B invoices');
assert.deepEqual(new Set(portal.data.map(x=>x.travelerId)),new Set([70,71]));
assert.equal(portal.data.find(x=>x.invoiceNumber===other.invoice_number)?.status,'Unpaid','Paying Boss A does not pay Boss B');
assert.equal((await recordModule.loadCustomerInvoicePdfForPortal(other.invoice_number,{customer_account_reference:'verified-pa'},portalDb)).ok,true,'Same PA can open Boss B invoice PDF too');
assert.equal(portal.data.find(x=>x.invoiceNumber===updated.data.invoiceNumber)?.status,'Paid');
const portalPdf=await recordModule.loadCustomerInvoicePdfForPortal(updated.data.invoiceNumber,{customer_account_reference:'verified-pa'},portalDb);
assert.equal(portalPdf.ok,true);
assert.deepEqual(Buffer.from(portalPdf.data.bytes),Buffer.from(issuedRows[0].pdf_base64,'base64'),'Customer receives the regenerated Paid PDF');
assert.equal((await recordModule.loadCustomerInvoiceRecordsForPortal({customer_account_reference:'other-pa'},portalDb)).data.length,0);
assert.equal((await recordModule.loadCustomerInvoicePdfForPortal(updated.data.invoiceNumber,{customer_account_reference:'other-pa'},portalDb)).status,404);
assert.equal((await recordModule.loadCustomerInvoicePdfForPortal(other.invoice_number,{customer_account_reference:'other-pa'},portalDb)).status,404);
const foreignDb=clientFor({invoices:[...issuedRows,{...base,customer_id:'165',invoice_number:'INV-20990101-9998'}]});
assert.equal((await recordModule.loadCustomerInvoiceRecordsForPortal({customer_account_reference:'verified-pa'},foreignDb)).data.length,2);
assert.equal((await recordModule.loadCustomerInvoicePdfForPortal('INV-20990101-9998',{customer_account_reference:'verified-pa'},foreignDb)).status,404);
// Current installed PA session must reach that same account-wide invoice reader.
const paContext={mode:'principal-device-session',principal_id:'local-pa',principal_session_token:'synthetic-session',customer_account_reference:null};
const membership={company_id:60,booker_id:38,customer_account_reference:'164',membership_role:'managing_pa',traveler_id:null};
const paAccess={principal_id:'local-pa',principal_role:'pa',memberships:[membership]};
principalFixture.access={ok:true,data:paAccess};
const paInvoices=await recordModule.loadCustomerInvoiceRecordsForPortal(paContext,portalDb);
assert.equal(paInvoices.ok,true,'Current PA session must read its Company + Booker invoices');
assert.equal(paInvoices.data.length,2);
assert.deepEqual(new Set(paInvoices.data.map(x=>x.travelerId)),new Set([70,71]));
assert.equal(paInvoices.data.find(x=>x.invoiceNumber===updated.data.invoiceNumber).status,'Paid');
assert.equal((await recordModule.loadCustomerInvoicePdfForPortal(updated.data.invoiceNumber,paContext,portalDb)).ok,true);
assert.equal((await recordModule.loadCustomerInvoicePdfForPortal(other.invoice_number,paContext,portalDb)).ok,true);
assert.equal((await recordModule.loadCustomerInvoicePdfForPortal('INV-20990101-9998',paContext,foreignDb)).status,404);
// Historic PA traveller memberships under the same account remain one account.
principalFixture.access={ok:true,data:{...paAccess,memberships:[{...membership,traveler_id:70},{...membership,traveler_id:71}]}};
assert.equal((await recordModule.loadCustomerInvoiceRecordsForPortal(paContext,portalDb)).data.length,2);
for(const access of [
 {ok:false},
 {ok:true,data:{...paAccess,principal_id:'different-session'}},
 {ok:true,data:{...paAccess,principal_role:'boss'}},
 {ok:true,data:{...paAccess,memberships:[]}},
 {ok:true,data:{...paAccess,memberships:[{...membership,booker_id:39}]}},
 {ok:true,data:{...paAccess,memberships:[{...membership,company_id:61}]}},
 {ok:true,data:{...paAccess,memberships:[{...membership,customer_account_reference:'165'}]}},
 {ok:true,data:{...paAccess,memberships:[membership,{...membership,booker_id:39}]}},
 {ok:true,data:{...paAccess,memberships:[{...membership,membership_role:'boss'}]}},
]){
 principalFixture.access=access;
 assert.equal((await recordModule.loadCustomerInvoiceRecordsForPortal({...paContext,customer_account_reference:'164',booker_id:38,company_id:60},portalDb)).status,403,'Unverified, other or ambiguous PA scope fails closed despite client identity');
 assert.equal((await recordModule.loadCustomerInvoicePdfForPortal(updated.data.invoiceNumber,paContext,portalDb)).status,403);
}
principalFixture.access={ok:true,data:paAccess};
assert.equal((await recordModule.loadCustomerInvoiceRecordsForPortal({...paContext,principal_session_token:null},portalDb)).status,403);
assert.equal((await recordModule.loadCustomerInvoiceRecordsForPortal(paContext,clientFor({invoices:issuedRows,failTable:'bookers'}))).status,403);
const otherPaDb=clientFor({invoices:issuedRows,bookers:[{id:39,company_id:60,customer_id:165}]});
principalFixture.access={ok:true,data:{...paAccess,principal_id:'other-pa',memberships:[{...membership,booker_id:39,customer_account_reference:'165'}]}};
const otherPaContext={...paContext,principal_id:'other-pa',customer_account_reference:'164',booker_id:38};
assert.equal((await recordModule.loadCustomerInvoiceRecordsForPortal(otherPaContext,otherPaDb)).data.length,0,'Another valid PA in the same company sees none of this account invoices');
assert.equal((await recordModule.loadCustomerInvoicePdfForPortal(updated.data.invoiceNumber,otherPaContext,otherPaDb)).status,404);
principalFixture.access={ok:true,data:paAccess};
let unavailableReads=0;
const unavailableLifecycleDb={from(table){if(table==='bookers')return portalDb.from(table);unavailableReads++;const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},then(resolve,reject){return Promise.resolve({data:null,error:{message:'column document_state does not exist'}}).then(resolve,reject);}};return q;}};
assert.equal((await recordModule.loadCustomerInvoiceRecordsForPortal(paContext,unavailableLifecycleDb)).ok,false);
assert.equal(unavailableReads,1,'PA invoice list must not fall back to unverified document state');
assert.equal((await recordModule.loadCustomerInvoicePdfForPortal(updated.data.invoiceNumber,paContext,unavailableLifecycleDb)).ok,false);
assert.equal(unavailableReads,2,'PA PDF must not fall back to an unverified draft/issued state');
const customerPage=readFileSync('app/my-bookings/page.tsx','utf8');
for(const principal of [{status:'checking'},{status:'principal',principal_role:'boss'},{status:'principal',principal_role:'pa'},{status:'legacy'}]){
 let count=0,loaded=null;
 const fn=load(customerPage,'loadCustomerInvoices',{customerPrincipalAccess:principal,controller:{signal:{aborted:false}},setCustomerInvoiceRecords:x=>loaded=x,setCustomerInvoicesLoadState:()=>{},loadCustomerPortalInvoiceRecords:async()=>{count++;return paInvoices.data;}});
 await fn();
 assert.equal(count,principal.status==='legacy'||principal.principal_role==='pa'?1:0);
 if(count)assert.equal(loaded.length,2);
}
assert.ok(customerPage.includes('customerPrincipalAccess.principal_role === "pa" || section !== "Invoices"'));
const portalFolder=load(customerPage,'customerPortalInvoiceFolder');
assert.equal(portalFolder(updated.data),'Paid Invoices');
assert.equal(portalFolder({...updated.data,status:'Unpaid'}),'Unpaid Invoices');
const refFn=load(jobsSource,'normalizedExactInvoiceReference');
const coverage=load(jobsSource,'issuedInvoiceBookingReferences',{normalizedExactInvoiceReference:refFn});
const covers=load(jobsSource,'bookingHasIssuedInvoice',{normalizedExactInvoiceReference:refFn});
assert.equal(covers(job,coverage([updated.data],'164')),true,'Saved paid invoice removes exactly its job from Section 3');
assert.equal(covers({...job,booking_reference:'UNRELATED',public_booking_reference:'99999'},coverage([updated.data],'164')),false);
// Invoice paper, layout, writer and sender are not duplicated by the shortcut.
const {createHash}=await import('node:crypto');
const invoiceLayout=panelSource.slice(panelSource.indexOf('  return (\n    <section'));
assert.equal(createHash('sha256').update(invoiceLayout).digest('hex'),'bcaed24d1353b2e00951a2d79faa6535a9906f40fc33dd14061a6720caac1b06','Section 2 rendered layout must remain byte-identical to the approved baseline');
console.log('PASS: Completed exact navigation; single/shared/missing/ambiguous/paid invoice review; no automatic writes/emails; scoped pagination; real Paid writer/PDF; one Company + PA sees both bosses; other accounts denied; Section 3 exact coverage.');
