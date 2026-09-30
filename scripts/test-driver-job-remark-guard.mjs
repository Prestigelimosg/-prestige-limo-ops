import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {normalizeDriverRemark,encodeDriverRemark,decodeDriverRemark} from '../lib/driver-job-remark.ts';
import {mapBookingToSafeDriverJobPayload} from '../lib/driver-job-link.ts';
import {loadHarness,canonicalCorporateAdminPayload,installMockClient,adminActor,adminAudit,setEnv,restoreEnv} from './test-admin-booking-supabase-adapter-contract.mjs';
const read=p=>fs.readFileSync(p,'utf8');
const harness=await loadHarness();
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('No live network or provider calls allowed');};
function extract(path,name,bindings={}) {
 const source=read(path), ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
 assert.ok(node, name);
 return new Function(...Object.keys(bindings),ts.transpileModule(node.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+`;return ${name}`)(...Object.values(bindings));
}
try {
 setEnv({PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:'true',PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE:'server-session-token',PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE:'admin',PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN:'mock-contract-admin-session-token',SUPABASE_SERVICE_ROLE_KEY:'SUPABASE_SERVICE_ROLE_KEY_SENTINEL_DO_NOT_LEAK',SUPABASE_URL:'https://contract-ready.supabase.co'});
 for(const value of ['', '  ',null,undefined]) assert.equal(normalizeDriverRemark(value),'');
 for(const value of [5,{},'x'.repeat(501),'Invoice $100','PayNow details','<script>','https://secret.example']) assert.equal(normalizeDriverRemark(value),null);
 assert.equal(decodeDriverRemark('legacy internal charge reason'),'');
 const seed={bookers:[{id:24,company_id:31,customer_id:163,booker_name:'Jennifer'}],customers:[{id:163,display_name:'Safe Company / Booker: Jennifer',status:'active',account_status:'active'}]};
 for(const schemaMode of ['current','cumulative','foundation']) for(const withItems of [false,true]) {
  const {client}=installMockClient(seed,{schemaMode});
  const body=canonicalCorporateAdminPayload({booking:{booking_reference:'REMARK-QA',traveler_id:null,driver_remark:'  Wait at the lobby  '}});
  if(!withItems)body.service_items=[];
  const parsed=harness.persistence.parseAdminBookingPersistencePayload(body);
  assert.equal(parsed.ok,true,JSON.stringify(parsed));
  const created=await harness.adapter.createAdminBookingThroughSupabaseAdapter(parsed.data,adminAudit(),adminActor());
  assert.equal(created.ok,true,JSON.stringify(created));
  assert.equal(created.data.driver_remark,'Wait at the lobby');
  assert.equal(client.tables.bookings[0].remarks,encodeDriverRemark('Wait at the lobby'));
  const children=structuredClone(created.data.service_items);
  async function update(value,omit=false){
   const next=structuredClone(body); if(omit)delete next.booking.driver_remark;else next.booking.driver_remark=value;
   const p=harness.persistence.parseAdminBookingUpdatePayload({...next,target_booking_reference:'REMARK-QA'});assert.equal(p.ok,true,JSON.stringify(p));
   const r=await harness.adapter.updateAdminBookingThroughSupabaseAdapter(p.data,adminAudit('admin_booking_update'),adminActor());assert.equal(r.ok,true,JSON.stringify(r));
   assert.deepEqual(r.data.service_items,children);return r;
  }
  assert.equal((await update('Use side entrance')).data.driver_remark,'Use side entrance');
  assert.equal((await update(null,true)).data.driver_remark,'Use side entrance','Unrelated PATCH omission preserves saved remark');
  assert.equal((await update('  ')).data.driver_remark??'','','Explicit blank clears');
  assert.equal(client.tables.bookings[0].remarks,null);
  assert.equal(client.tables.customer_driver_app_notification_outbox.length,0,'Saving does not send/publish');
 }
 const detailRows=extract('app/driver-job/[token]/page.tsx','detailRows');
 for(const text of ['','  ','Wait at the lobby']) {
  const safe=mapBookingToSafeDriverJobPayload({driver_remark:text,remarks:'PRIVATE',driver_notes:'PRIVATE',customer_price:100});
  const rows=detailRows(safe).filter(r=>r.label==='Remark');
  assert.equal(rows.length,text.trim()?1:0);if(rows.length)assert.equal(rows[0].value,text.trim());
  assert.doesNotMatch(JSON.stringify(safe),/PRIVATE|customer_price|driver_notes/);
 }
 // These established outward consumers must never gain this instruction field.
 for(const path of ['lib/customer-saved-bookings-read.ts','lib/customer-portal-saved-bookings-adapter.ts','lib/customer-invoice-line-description.ts','lib/customer-invoice-record-persistence.ts','app/customers/page.tsx','lib/driver-job-calendar-event.ts','lib/admin-booking-calendar-event.ts']) assert.doesNotMatch(read(path),/driver_remark|driverRemark|manualExtraChargesNote/);
 const page=read('app/page.tsx');
 const extracted=page.slice(page.indexOf("  function applyExtractedBooking("),page.indexOf("  function updateDefaultCustomerRate("));
 assert.match(extracted,/manualExtraChargesNote: ""/,"Selecting another extracted trip must clear the previous remark");
 assert.ok(page.includes('driver_remark: clean(bookingValue.manualExtraChargesNote).replace(/\\s+/g, " ") || null'));
 assert.match(page,/manualExtraChargesNote: clean\(record.driver_remark\)/);
 assert.match(page,/clean\(record.driver_remark\) === clean\(payload.driver_remark\)/);
 assert.match(page,/maxLength=\{500\}/);
 assert.ok(!page.includes('    clean(bookingValue.manualExtraChargesNote),'));
 console.log('Driver Remark guard passed: tagged persistence/reload/amend/clear/omitted PATCH, with/without service items, no save-time send, exact Driver rows, legacy exclusion and customer/invoice/Calendar boundaries.');
} finally {globalThis.fetch=originalFetch;restoreEnv();delete globalThis.__prestigeSupabaseAdapterMock;await harness.cleanup();}
