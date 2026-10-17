// Only canonical Admin-draft eligibility; reuses setup, never runs previous suites.
// Run from the candidate root with explicit local fixture/runtime/evidence paths.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
const require=createRequire(path.resolve('package.json'));
const ts=require('typescript');
const out=process.env.QA_DRAFT_EVIDENCE_DIR, fixture=process.env.QA_DRAFT_FIXTURE_PATH, runtime=process.env.QA_DRAFT_RUNTIME_PATH;
assert.ok(out && fixture && runtime,'Explicit local paths required');
const {default:EmbeddedPostgres}=await import(runtime);
const {baseline}=await import(fixture);
const report={scope:'actual existing Admin builder and row normalizer -> disposable SQL eligibility only',oldSuitesRun:0,checks:[]};
const pass=name=>{report.checks.push(name);console.log('PASS '+name)};
function execute(source,globals={}) {const m={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{...globals,module:m,exports:m.exports},{timeout:5000});return m.exports}
// Only pure helper modules; no page initialization, app environment, network or service client.
const pureModules=new Set(['lib/pricing.ts','lib/hourly-billing.ts','lib/driver-job-remark.ts']);
function pure(file){assert.ok(pureModules.has(file));return execute(fs.readFileSync(file,'utf8'),{require:n=>pure(path.normalize(path.join(path.dirname(file),n+'.ts')))})}
function extract(file,names,constants=[]){const src=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true);const decls=[];
 for(const name of names){const n=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(n,name);decls.push(n.getText(tree))}
 for(const name of constants){const n=tree.statements.filter(ts.isVariableStatement).flatMap(n=>[...n.declarationList.declarations]).find(n=>n.name.getText(tree)===name);assert.ok(n,name);decls.push('const '+n.getText(tree)+';')}
 report.sourceHashes??={};report.sourceHashes[file]=createHash('sha256').update(src).digest('hex');return decls.join('\n');}
const page=extract('app/page.tsx',['buildAdminBookingPersistencePayload','isAdminShortNoticeReviewRequired','parsePickupDateTimeMs','normalizePickupTimeForStorage','formatPickupTime','formatAdminBookingPickupDateTime','getAdminExtraStopLocations','isMockMidnightChargeDetected','adminDispatchVerifiedIdentityId','safeAdminBookingPersistenceCount','clean'],['adminDraftContactFallback']);
const build=execute(page+'\nexports.build=buildAdminBookingPersistencePayload;',pure('lib/pricing.ts')).build;
const normalized=extract('lib/admin-booking-supabase-adapter.ts',['bookingToDbRow','dbIdentifierOrNull','integerOrNull','customerSpecialRequestOrNull','textOrNull','luggageCountOrNull','normalizeToken','normalizeServiceType','normalizeAdminInternalStatus','normalizeCustomerFacingStatus','normalizeShortNoticeReviewStatus','normalizeRequestReviewStatus','normalizeChangeReviewStatus','normalizeCancellationReviewStatus','normalizeSourceSurface'],['maxTextLength']);
const toRow=execute(normalized+'\nexports.toRow=bookingToDbRow;',pure('lib/driver-job-remark.ts')).toRow;
const form={date:'2090-01-10',time:'1200',bookingType:'TRF',pickup:'Synthetic pickup',dropoff:'Synthetic dropoff',extraStopLocation:'',extraStopCount:'0',childSeatRequired:'no',companyId:'101',bookerId:'102',customerId:'103',travelerId:'104',driverId:'7',luggageCount:'1',vehicle:'AVF',booker:'Synthetic QA'};
const payload=build(form,Date.parse('2090-01-01T00:00:00Z'),'QA-CANONICAL',{customerDisplayNameOverride:'Synthetic QA',parserSourceReferenceOverride:'Synthetic fixture'});
const row=JSON.parse(JSON.stringify(toRow(payload.booking,103,{source_surface:'admin_api'})));
assert.equal(Object.hasOwn(row,'status'),false);
const lifecycle=['source_surface','admin_internal_status','customer_facing_status','short_notice_review_status','request_review_status'];
assert.deepEqual(lifecycle.map(k=>row[k]),['admin_dashboard','draft','received','not_required','pending_review']);
report.builderLifecycle=Object.fromEntries(lifecycle.map(k=>[k,row[k]]));
pass('actual unmodified Admin builder + normalizer produce canonical draft, with legacy status omitted');
const dir=fs.mkdtempSync('/private/tmp/qa-draft-');
const pg=new EmbeddedPostgres({databaseDir:path.join(dir,'data'),user:'postgres',password:randomUUID(),persistent:false,port:5432,postgresFlags:['-c','listen_addresses=','-c','statement_timeout=12000','-c','lock_timeout=8000','-k',dir],onLog:()=>{},onError:()=>{}});
let db;
const rows=async(q,args=[])=>(await db.query(q,args)).rows;
const snapshot=async()=>({booking:await rows('select to_jsonb(b) value from bookings b order by id'),audit:await rows('select to_jsonb(a) value from audit_logs a order by to_jsonb(a)::text')});
async function call(){const version=(await rows('select updated_at::text value from bookings where id=1001'))[0].value;return (await rows('select save_admin_reviewer_qa_bags(1001,$1,101,102,103,104,7,$2::timestamptz,2) value',['QA-CANONICAL',version]))[0].value}
async function denied(name,mutation){await db.query('begin');try{await db.query('update bookings set luggage_count=1 where id=1001');await mutation();const before=await snapshot();await db.query('savepoint attempt');await assert.rejects(call(),e=>e.code==='22023');await db.query('rollback to savepoint attempt');assert.deepEqual(await snapshot(),before);pass(name)}finally{await db.query('rollback')}}
try{
 await pg.initialise();await pg.start();db=pg.getPgClient('postgres',dir);await db.connect();assert.equal((await rows('show listen_addresses'))[0].listen_addresses,'');
 await baseline(db);
 await db.query(`alter table bookings add column request_review_status text,add column source_surface text,add column change_review_status text,add column cancellation_review_status text,add column short_notice_review_status text,add column customer_request_trip_group jsonb;
 insert into drivers values(7,'Synthetic','000','TEST','AVF','available');`);
 // Insert every actual normalizer field, adding only fixture columns absent from setup.
 const columns=new Set((await rows("select column_name from information_schema.columns where table_schema='public' and table_name='bookings'")).map(r=>r.column_name));
 for(const key of Object.keys(row)){assert.match(key,/^[a-z_]+$/);if(!columns.has(key))await db.query('alter table bookings add column '+key+' text')}
 await db.query(`insert into bookings(id,${Object.keys(row).join(',')}) values(1001,${Object.keys(row).map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));
 await db.query("insert into bookings(id,booking_reference,luggage_count) values(2001,'UNRELATED-CANARY',3)");
 assert.equal((await rows('select status from bookings where id=1001'))[0].status,null);
 await db.query(fs.readFileSync('docs/store-submission/admin-reviewer-qa-save.sql','utf8'));
 if(process.env.QA_DRAFT_REPRODUCE==='1'){
  await denied('confirmed pre-fix rejection of actual normal Admin draft',async()=>{});report.status='CONFIRMED GAP';
 }else{
  const before=await snapshot();const result=await call();assert.equal(result.noop,false);assert.equal(result.luggage_count,2);
  const after=await snapshot();assert.deepEqual(after.booking[1],before.booking[1]);
  for(const key of Object.keys(before.booking[0].value))if(!['luggage_count','updated_at'].includes(key))assert.deepEqual(after.booking[0].value[key],before.booking[0].value[key],key);
  assert.notEqual(after.booking[0].value.updated_at,before.booking[0].value.updated_at);assert.equal(after.audit.length,1);assert.deepEqual(after.audit[0].value.safe_before,{booking_reference:'QA-CANONICAL',luggage_count:1});assert.deepEqual(after.audit[0].value.safe_after,{booking_reference:'QA-CANONICAL',luggage_count:2});
  pass('canonical Admin draft saves only bags/time plus one audit; other fields and canary preserved');
  // New canonical-shape exclusions only, not previous API, ownership or race suites.
  for(const [column,value] of [['source_surface','customer_booking_request'],['source_surface','admin_api'],['source_surface',null],['status','completed'],['status','mystery'],['status','draft'],['admin_internal_status','admin_review_required'],['customer_facing_status','pending_review'],['short_notice_review_status','admin_review_required'],['short_notice_review_status',null],['request_review_status','approved'],['request_review_status',null],['change_review_status','requested'],['cancellation_review_status','requested'],['customer_request_trip_group',{group:'unsupported'}]]){
   await denied('canonical shape rejects '+column+'='+JSON.stringify(value),()=>db.query('update bookings set '+column+'=$1 where id=1001',[value]));
  }
  for(const table of ['driver_job_links','driver_job_status_events'])await denied('canonical shape still denies '+table+' history',()=>db.query('insert into '+table+'(booking_reference) values($1)',['QA-CANONICAL']));
  report.status='PASS - local canonical draft compatibility only';
 }
}catch(e){report.status='FAIL';report.error={message:e.message,stack:e.stack};process.exitCode=1;console.error(e)}finally{await db?.end().catch(()=>{});await pg.stop().catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});report.disposableRemoved=!fs.existsSync(dir);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,process.env.QA_DRAFT_REPRODUCE==='1'?'before-result.json':'after-result.json'),JSON.stringify(report,null,2)+'\n')}

if(report.status==='FAIL')process.exitCode=1;
