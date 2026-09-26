import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const page=readFileSync('app/page.tsx','utf8');
const ast=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function extract(name){let found;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n.getText(ast);ts.forEachChild(n,visit)}visit(ast);assert.ok(found,name);return found;}
function compile(name,bindings={}){return new Function(...Object.keys(bindings),ts.transpileModule(extract(name)+'\nreturn '+name,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(bindings));}
const evidence=compile('adminBookingInvoiceSentEvidence');
const booking={customer_id:192,booking_reference:'ADM-QA-A',public_booking_reference:'11044'};
const invoice={customerId:'192',invoiceNumber:'INV-QA',documentType:'invoice',documentState:'issued',reference:'ADM-QA-A',manuallySentAt:'2026-09-25T10:00:00Z'};
assert.match(evidence(booking,[invoice]),/marked sent manually/);
assert.match(evidence(booking,[{...invoice,reference:'',lineItems:[{bookingReference:'11044'}]}]),/INV-QA/);
assert.match(evidence(booking,[{...invoice,manuallySentAt:null,emailDeliveryStatus:'sent',emailSentAt:'2026-09-25T10:00:00Z'}]),/email sent/);
for(const change of [{customerId:'193'},{reference:'110440'},{reference:'adm-qa-a'},{documentType:'quotation'},{documentType:'credit_note'},{documentState:'draft'},{invoiceNumber:''},{manuallySentAt:null},{manuallySentAt:'invalid'},{manuallySentAt:null,emailDeliveryStatus:'failed',emailSentAt:'2026-09-25T10:00:00Z'}])assert.equal(evidence(booking,[{...invoice,...change}]),'',JSON.stringify(change));
assert.equal(evidence({...booking,customer_id:null},[invoice]),'');
assert.equal(evidence({...booking,booking_reference:'OTHER',public_booking_reference:'OTHER'},[invoice]),'');
const multi={...invoice,reference:'',lineItems:[{bookingReference:'ADM-QA-A'},{bookingReference:'SECOND'}]};
assert.ok(evidence({...booking,booking_reference:'SECOND'},[multi]));
assert.equal((page.match(/data-booking-invoice-sent=\{bookingId\}/g)||[]).length,2,'Bookings and Completed both render Sent');
assert.equal((page.match(/data-booking-invoice-sent-detail=\{bookingId\}/g)||[]).length,2);
assert.ok(page.includes('bookingInvoiceSentRead.key === bookingInvoiceSentReadKey'));
const reader=extract('refreshSentEvidence');assert.equal(reader.includes('setInterval'),false);
async function read({bad=false,fail=false}={}) {
 const states=[],calls=[];
 const fn=compile('refreshSentEvidence',{controller:null,disposed:false,AbortController,
 bookingInvoiceSentReadKey:JSON.stringify([booking,booking]),setBookingInvoiceSentRead:s=>states.push(s),
 adminLegacyDataPurpose:'admin-booking-persistence',URLSearchParams,
 fetch:async(url,opts)=>{calls.push({url,opts});return {ok:!fail,json:async()=>({ok:true,invoices:[{...invoice,customerId:bad?'193':'192'}]})}}});
 await fn();return{states,calls};
}
const valid=await read();assert.equal(valid.calls.length,1,'Deduplicate visible customer reads');
assert.equal(valid.calls[0].url,'/api/admin-customer-invoices?customer_id=192');
assert.equal(valid.calls[0].opts.cache,'no-store');assert.equal(valid.states.at(-1).invoices.length,1);
for(const opts of [{bad:true},{fail:true}]){const r=await read(opts);assert.equal(r.states.at(-1).invoices.length,0);assert.equal(r.states.at(-1).failed,true)}
console.log('Sent card exact customer/reference, multi-job, current manual/email evidence, scoped read and failure guards passed.');
