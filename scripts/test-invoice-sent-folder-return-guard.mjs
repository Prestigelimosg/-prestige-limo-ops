import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('app/customers/[customerId]/customer-invoice-folder-panel.tsx','utf8');
const ast=ts.createSourceFile('panel.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let fnSource;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='loadStoredInvoices')fnSource=n.getText(ast);ts.forEachChild(n,visit)}visit(ast);assert.ok(fnSource);
const wanted={customerId:'192',invoiceNumber:'INV-WANTED',documentType:'invoice',documentState:'issued',manuallySentAt:'2026-09-25T10:00:00Z'};
async function run({rows=[{...wanted,invoiceNumber:'INV-NEWER'},wanted],ok=true,search='?focus_invoice=INV-WANTED'}={}) {
 const reads=[],selected=[],messages=[],actions=[],scrolls=[];
 const bindings={customer:{id:'192',companyName:'Same Name'},controller:new AbortController(),URLSearchParams,
 window:{location:{search},setTimeout:fn=>fn()},document:{getElementById:id=>({scrollIntoView:()=>scrolls.push(id)})},
 completedBillingHandoffAppliedRef:{current:false},sentInvoiceHandoffAppliedRef:{current:false},
 setSentInvoiceTargetRequested:()=>{},setCompletedBillingTargetRequested:()=>{},
 adminCustomerInvoicesApiPath:'/api/admin-customer-invoices',fetch:async url=>{reads.push(url);return {ok,json:async()=>({ok,invoices:rows})}},
 normalizeCustomerMatch:v=>String(v||'').toLowerCase(),displayStoredInvoice:i=>i,
 setStoredInvoices:()=>{},setStoredInvoiceMessage:m=>messages.push(m),setSelectedInvoiceNumber:n=>selected.push(n),
 setInvoiceActionMode:a=>actions.push(a),setInvoiceActionMessage:m=>messages.push(m),selectedInvoiceNumber:''};
 const fn=new Function(...Object.keys(bindings),ts.transpileModule(fnSource+'\nreturn loadStoredInvoices;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(bindings));
 await fn();return {reads,selected,messages,actions,scrolls};
}
const pass=await run();assert.deepEqual(pass.selected,['INV-WANTED']);assert.deepEqual(pass.reads,['/api/admin-customer-invoices?customer_id=192']);assert.deepEqual(pass.actions,[null]);assert.deepEqual(pass.scrolls,['total-invoices']);
for(const scenario of [{ok:false},{rows:[]},{rows:[{...wanted,customerId:'193',customerName:'Same Name'}]},{rows:[{...wanted,documentType:'quotation'}]},{rows:[{...wanted,documentState:'draft'}]},{rows:[wanted,wanted]},{search:'?focus_invoice='}]) {
 const result=await run(scenario);assert.deepEqual(result.selected,['']);assert.deepEqual(result.scrolls,[]);assert.ok(result.messages.includes('Invoice unavailable. Reload to retry.'));
}
assert.ok(source.includes('completedBillingTargetRequested || sentInvoiceTargetRequested ? undefined : displayInvoices[0]'));
assert.ok(source.includes('!fromCompleted && !fromSent && !selectedInvoiceNumber'));
assert.ok(source.includes('id="total-invoices"'));
console.log('Exact sent-invoice folder return selects target, fails closed, preserves payment state and uses complete scoped read.');
