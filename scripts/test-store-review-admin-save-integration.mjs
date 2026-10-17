// New Admin QA-write integration only. Requires explicitly supplied disposable fixture setup.
// No application .env files, hosted requests, existing test suites or real records.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
const require=createRequire(import.meta.url);
const out=process.env.QA_SAVE_EVIDENCE_DIR;
const fixturePath=process.env.QA_SAVE_FIXTURE_PATH;
const pgPath=process.env.QA_SAVE_PG_CLIENT_PATH;
assert.ok(out && fixturePath && pgPath,'Explicit local evidence, setup-only fixture and pg client paths required');
const {baseline}=await import(fixturePath);
const {Client}=require(pgPath);
const docker='/usr/local/bin/docker', suffix=randomUUID().slice(0,8);
const network='prestige-qa-save-'+suffix, dbName=network+'-db', apiName=network+'-api';
const d=(...args)=>execFileSync(docker,args,{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const result={scope:'Local actual route + SDK + PostgREST + SQL integration; synthetic records only',checks:[],oldSuitesRun:0};
const pass=name=>{result.checks.push(name);console.log('PASS '+name)};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let db,api,createdNetwork=false;
const jwtSecret=randomUUID()+randomUUID();
function jwt(role){const part=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const head=part({alg:'HS256',typ:'JWT'})+'.'+part({role,exp:Math.floor(Date.now()/1000)+3600});return head+'.'+createHmac('sha256',jwtSecret).update(head).digest('base64url')}
const config={version:1,databaseOrigin:'https://fixture.supabase.co',expiresAt:'2099-01-01T00:00:00Z',credentials:Object.fromEntries(['admin','driver','customer'].map((r,i)=>[r,createHash('sha256').update(String(i).repeat(43)).digest('hex')])),scope:{bookingIds:[1001],bookingReferences:['QA-INTEGRATION'],companyId:101,bookerId:102,customerId:103,driverId:7,travelerIds:[104],bookingTargets:[{bookingId:1001,bookingReference:'QA-INTEGRATION',travelerId:104}],adminSaveBookingReference:'QA-INTEGRATION'}};
const env={NODE_ENV:'test',SUPABASE_URL:config.databaseOrigin,SUPABASE_SERVICE_ROLE_KEY:jwt('service_role'),PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:'true',PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET:'synthetic-only-'.repeat(5),PRESTIGE_STORE_REVIEW_ACCESS:JSON.stringify(config)};
let httpCalls=[],ordinaryCalls=0;
function load(file,imports={}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,process:{env},Buffer,URL,Request,Response,Headers,Date,console,require:n=>n==='server-only'?{}:imports[n]??(n.startsWith('node:')?require(n):{})},{filename:file});return mod.exports}
const auth=load('lib/store-review-access.ts');
const adapter=load('lib/admin-booking-supabase-adapter.ts',{'./store-review-access':auth,'@supabase/supabase-js':{createClient:(url,key,opts)=>createClient(url,key,{...opts,global:{fetch:async(input,init)=>{const u=new URL(String(input));assert.equal(u.origin,config.databaseOrigin);assert.equal(u.pathname,'/rest/v1/rpc/save_admin_reviewer_qa_bags');assert.equal(init.method,'POST');httpCalls.push(JSON.parse(init.body));return fetch(api+'/rpc/save_admin_reviewer_qa_bags',{...init,signal:AbortSignal.timeout(8000)});}}})}});
const route=load('app/api/admin-bookings/route.ts',{'../../../lib/store-review-access':auth,'../../../lib/admin-booking-supabase-adapter':adapter,'../../../lib/admin-dispatcher-auth-boundary':{adminBookingPersistencePurpose:'admin-booking-persistence',resolveAdminDispatcherBoundary:()=>{ordinaryCalls++;return{ok:false,error:'ordinary-sentinel'}}}});
function request({role='admin',body=payload,headers={},origin='http://localhost:3139',path='/api/admin-bookings',cookie}={}) {return new Request(origin+path,{method:'PATCH',headers:{cookie:cookie??auth.issueStoreReviewSession(role,String(['admin','driver','customer'].indexOf(role)).repeat(43)),origin,referer:origin+'/','content-type':'application/json','x-prestige-admin-purpose':'admin-qa-bags-save',...headers},body:JSON.stringify(body)})}
let payload;
const rows=async(q,args=[])=>(await db.query(q,args)).rows;
const snapshot=async()=>({bookings:await rows('select to_jsonb(b) value from bookings b order by id'),audit:await rows('select to_jsonb(a) value from audit_logs a order by id')});
async function denied(req,status){const n=httpCalls.length;const response=await route.PATCH(req);assert.equal(response.status,status);assert.equal(httpCalls.length,n);assert.equal(ordinaryCalls,0)}
try{
 d('network','create',network);createdNetwork=true;
 d('run','-d','--name',dbName,'--network',network,'--network-alias','qa-db','-p','127.0.0.1::5432','--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.121','-c','/usr/lib/postgresql/bin/initdb -D /tmp/qa-data -A trust >/tmp/qa-init.log && echo "host all all 0.0.0.0/0 trust" >> /tmp/qa-data/pg_hba.conf && exec /usr/lib/postgresql/bin/postgres -D /tmp/qa-data -h 0.0.0.0');
 await pause(500);
 if(d('inspect','--format','{{.State.Running}}',dbName)!=='true') throw Error('Disposable PostgreSQL startup: '+d('logs',dbName));
 const port=Number(d('port',dbName,'5432/tcp').split(':').pop());
 for(let i=0;i<40;i++){try{db=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});await db.connect();break}catch(e){await db?.end().catch(()=>{});db=null;if(i===39)throw e;await pause(250)}}
 await baseline(db); // setup only, no old scenarios
 await db.query(`alter table bookings add column request_review_status text,add column source_surface text,
 add column change_review_status text,add column cancellation_review_status text,add column short_notice_review_status text,add column customer_request_trip_group jsonb;
 create table customers(id bigint primary key);
 drop table audit_logs;
 create table audit_logs(id bigserial primary key,entity_type text not null,entity_id bigint,action text not null,
 source_route text,actor_label text,change_summary text,created_at timestamptz not null default now(),
 booking_id bigint references bookings(id) on delete set null,customer_id bigint references customers(id) on delete set null,
 actor_role text,action_type text,booking_reference text,source_surface text,reason text,safe_before jsonb,safe_after jsonb);
 alter table audit_logs enable row level security;
 alter role service_role bypassrls;
 create role authenticator login noinherit;
 grant anon,authenticated,service_role to authenticator;
 grant usage on schema public to anon,authenticated,service_role;
 grant select,update on bookings to service_role;
 grant select on driver_job_bid_offers,driver_job_combo_members,driver_job_links,driver_job_status_events to service_role;
 grant select,update on driver_job_bid_offers,driver_job_bids to service_role;
 grant select,insert on audit_logs to service_role;
 grant usage on sequence audit_logs_id_seq to service_role;
 insert into customers values(103);
 insert into drivers values(7,'Synthetic QA','000','TEST','AVF','available');
 insert into bookings(id,booking_reference,company_id,booker_id,customer_id,traveler_id,driver_id,luggage_count,status,admin_internal_status,customer_facing_status,source_surface,vehicle,vehicle_type_or_category,service_type,pickup_at)
 values(1001,'QA-INTEGRATION',101,102,103,104,7,1,'draft','draft','received','admin_api','AVF','AVF','TRF',now()+interval '10 days'),
 (2001,'NON-TARGET',201,202,null,204,7,1,'draft','draft','received','admin_api','AVF','AVF','TRF',now()+interval '11 days');`);
 const functions=await rows("select oid::regprocedure::text name,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and prokind='f' order by 1");
 await db.query(fs.readFileSync('docs/store-submission/admin-reviewer-qa-save.sql','utf8'));
 d('run','-d','--name',apiName,'--network',network,'-p','127.0.0.1::3000','-e','PGRST_DB_URI=postgres://authenticator@qa-db:5432/postgres','-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e','PGRST_JWT_SECRET='+jwtSecret,'public.ecr.aws/supabase/postgrest:v16.4');
 api='http://127.0.0.1:'+d('port',apiName,'3000/tcp').split(':').pop();
 for(let i=0;i<40;i++){try{const r=await fetch(api+'/');if(r.ok)break;throw Error('API startup')}catch(e){if(i===39)throw e;await pause(250)}}
 const version=async()=>(await rows("select to_jsonb(updated_at)#>>'{}' version from bookings where id=1001"))[0].version;
 payload={target_booking_reference:'QA-INTEGRATION',expected_updated_at:await version(),luggage_count:2};
 // New purpose/route denial coverage before any SQL operation.
 for(const options of [{role:'driver'},{role:'customer'},{cookie:'prestige_store_review_session=invalid; prestige_admin_account_session=ordinary'},
 {headers:{origin:'https://foreign.invalid'}},{headers:{origin:''}},{headers:{referer:'http://localhost:3139/customers'}},
 {headers:{'x-prestige-admin-purpose':'admin-booking-persistence'}},{origin:'https://app.prestigelimo.sg'},
 {path:'/api/admin-bookings?extra=1'},{body:{...payload,driver_id:7}},{body:{...payload,luggage_count:'2'}},{body:{...payload,target_booking_reference:'NON-TARGET'}},
 {body:{...payload,expected_updated_at:'2026-10-16'}},{body:[]},{body:null}]) await denied(request(options),403);
 env.NODE_ENV='production';await denied(request(),403);env.NODE_ENV='test';env.VERCEL_ENV='preview';await denied(request(),403);delete env.VERCEL_ENV;
 const validCookie=auth.issueStoreReviewSession('admin','0'.repeat(43));
 const resolved=auth.resolveStoreReviewAdminSaveRequest(request({cookie:validCookie}));assert.equal(resolved.state,'review');
 assert.equal(auth.storeReviewRequestAllowed(auth.resolveStoreReviewSession(validCookie),'/api/admin-bookings','PATCH',request({cookie:validCookie})),true);
 env.NODE_ENV='production';assert.equal(auth.storeReviewRequestAllowed(auth.resolveStoreReviewSession(validCookie),'/api/admin-bookings','PATCH',request({cookie:validCookie})),false);env.NODE_ENV='test';
 const savedConfig=env.PRESTIGE_STORE_REVIEW_ACCESS;env.PRESTIGE_STORE_REVIEW_ACCESS=JSON.stringify({...config,scope:{...config.scope,adminSaveBookingReference:undefined}});
 await denied(request(),403);assert.equal(auth.isStoreReviewAdminSaveProof(resolved.proof),false);env.PRESTIGE_STORE_REVIEW_ACCESS=savedConfig;
 const forged=await adapter.saveStoreReviewAdminBags({...resolved.proof},payload);assert.equal(forged.status,403);
 pass('new Admin purpose, payload, role, target, config, proxy and production/preview boundaries deny without persistence');
 const before=await snapshot();
 let response=await route.PATCH(request());assert.equal(response.status,200);let body=await response.json();assert.equal(body.mode,'review');assert.equal(body.result.noop,false);assert.equal(httpCalls.length,1);assert.equal(ordinaryCalls,0);
 const after=await snapshot();assert.deepEqual(after.bookings[1],before.bookings[1]);
 const old=before.bookings[0].value,newRow=after.bookings[0].value;assert.equal(newRow.luggage_count,2);assert.notEqual(newRow.updated_at,old.updated_at);
 for(const k of Object.keys(old))if(!['luggage_count','updated_at'].includes(k))assert.deepEqual(newRow[k],old[k],k);
 assert.equal(after.audit.length,1);assert.equal(after.audit[0].value.actor_role,'system');assert.equal(after.audit[0].value.action_type,'booking_updated');assert.deepEqual(after.audit[0].value.safe_after,{booking_reference:'QA-INTEGRATION',luggage_count:2});
 pass('actual PATCH -> Supabase SDK -> PostgREST service_role -> one atomic QA update/audit; unrelated row and fields unchanged');
 const oldPayload=payload;payload={...payload,expected_updated_at:body.result.updated_at};
 response=await route.PATCH(request());assert.equal(response.status,200);assert.equal((await response.json()).result.noop,true);assert.deepEqual(await snapshot(),after);
 response=await route.PATCH(request({body:oldPayload}));assert.equal(response.status,409);assert.deepEqual(await snapshot(),after);
 pass('new transport no-op and stale request preserve the committed state with no extra audit');
 const rpc=httpCalls[0];
 for(const role of ['anon','authenticated']){const r=await fetch(api+'/rpc/save_admin_reviewer_qa_bags',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+jwt(role)},body:JSON.stringify(rpc)});assert.ok([401,403,404].includes(r.status));assert.deepEqual(await snapshot(),after)}
 pass('actual Data API anon/authenticated direct execution denied');
 // New SQL eligibility and transactional error through the implemented API, not old races.
 for(const [column,value] of [['status','complete'],['admin_internal_status','mystery'],['request_review_status','pending_review'],['source_surface','customer_booking_request'],['customer_request_trip_group',{group:'unsupported'}]]){
  await db.query(`update bookings set ${column}=$1 where id=1001`,[value]);const state=await snapshot();response=await route.PATCH(request());assert.equal(response.status,503);assert.deepEqual(await snapshot(),state);
  await db.query(`update bookings set ${column}=$1 where id=1001`,[newRow[column]]);
 }
 pass('implemented SQL positive lifecycle eligibility rejects terminal/unknown/pending/customer-origin/grouped fixtures');
 await db.query('update bookings set luggage_count=1 where id=1001');
 await db.query("create function qa_test_fail_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic audit failure'; end $$; create trigger qa_test_fail_audit before insert on audit_logs for each row execute function qa_test_fail_audit();");
 const preFailure=await snapshot();response=await route.PATCH(request());assert.equal(response.status,503);assert.deepEqual(await snapshot(),preFailure);
 await db.query('drop trigger qa_test_fail_audit on audit_logs; drop function qa_test_fail_audit()');
 pass('actual new API transaction rolls back booking update when audit fails; sanitized error, no fallback');
 for(const f of functions){const now=(await rows('select pg_get_functiondef($1::regprocedure) definition',[f.name]))[0];assert.equal(now.definition,f.definition,f.name)}
 pass('retained operational database functions unchanged');
 // Execute new UI branch and actual existing dispatcher callback; ordinary dependencies throw on escape.
 const src=fs.readFileSync('app/page.tsx','utf8'),tree=ts.createSourceFile('page.tsx',src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
 function walk(n){nodes.push(n);ts.forEachChild(n,walk)}walk(tree);
 const fn=name=>nodes.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(tree);
 async function ui({fail=false,extra=false,production=false,changeDuring=false,assignment=false}={}){
  const calls=[],messages=[];let marked=0,upsert=0;
  const booking={luggageCount:'2',passengerName:extra?'changed':'Synthetic'};
  const baseline={bookingReference:'QA-INTEGRATION',updatedAt:payload.expected_updated_at,form:{luggageCount:'1',passengerName:'Synthetic'}};
  const clean=v=>typeof v==='string'?v.trim():'';
  const signature=b=>JSON.stringify(Object.entries(b).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,clean(v)]));baseline.formSignature=signature(baseline.form);
  const context={adminQaReviewSession:true,adminQaSaveInFlightRef:{current:false},loadedAdminBookingBaselineRef:{current:baseline},appliedAdminBookingSnapshotReferenceRef:{current:'QA-INTEGRATION'},bookingFormRef:{current:booking},booking,clean,cleanReferenceText:clean,process:{env:{NODE_ENV:production?'production':'development'}},window:{location:{hostname:'localhost'}},adminSavedBookingsApiPath:'/api/admin-saved-bookings',URLSearchParams,JSON,
   setAdminBookingPersistenceMessage:m=>messages.push(m),setMessage:()=>{},setBookingSaveMessage:()=>{},setAdminBookingPersistenceAction:()=>{},
   bookingRecordPersistedReference:r=>r.booking_reference,bookingRecordToAdminBookingPersistenceRecord:r=>r,
   markAdminBookingAsActiveForUpdates:()=>{marked++},upsertLoadedBookingFromAdminRecord:()=>{upsert++},
   fetch:async(url,init)=>{calls.push({url,...init});if(fail)throw Error('lost response');if(changeDuring)context.appliedAdminBookingSnapshotReferenceRef.current='OTHER';return {ok:true,json:async()=>url==='/api/admin-bookings'?{ok:true,mode:'review',result:{booking_reference:'QA-INTEGRATION',luggage_count:2,updated_at:payload.expected_updated_at,noop:false}}:{ok:true,mode:'review',booking:{booking_reference:'QA-INTEGRATION',luggage_count:2,updated_at:payload.expected_updated_at}}}}};
  const mod={exports:{}};vm.runInNewContext(ts.transpileModule([fn('adminBookingFormSyncSignature'),fn('saveAdminQaBags'),fn('updateAppliedAdminBookingOperationalSnapshot'),'exports.run=updateAppliedAdminBookingOperationalSnapshot;'].join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{...context,module:mod,exports:mod.exports});
  await mod.exports.run(assignment?{assignmentOnly:true}:{});
  if(extra||production||assignment){assert.equal(calls.length,0);assert.equal(marked,0)}
  else if(fail){assert.equal(calls.length,1);assert.equal(context.loadedAdminBookingBaselineRef.current,null);await mod.exports.run();assert.equal(calls.length,1)}
  else{assert.equal(calls.length,2);assert.deepEqual(JSON.parse(calls[0].body),payload);assert.ok(calls[1].url.startsWith('/api/admin-saved-bookings?'));assert.equal(marked,changeDuring?0:1);assert.equal(upsert,changeDuring?0:1)}
 }
 for(const options of [{},{fail:true},{extra:true},{production:true},{changeDuring:true},{assignment:true}])await ui(options);
 pass('actual UI callbacks: strict body, scoped reload, unrelated edit denial, lost-response no retry, changed-selection isolation and production hold');
 // Absent reviewer remains in the original boundary, never this new RPC.
 const normal=new Request('http://localhost:3139/api/admin-bookings',{method:'PATCH',headers:{'x-prestige-admin-purpose':'admin-booking-persistence'},body:'{}'});response=await route.PATCH(normal);assert.equal(response.status,403);assert.equal(ordinaryCalls,1);
 pass('ordinary request still reaches its original Admin boundary');
 result.status='PASS - local integration only; hosted SQL unapplied, production gate closed';
}catch(e){result.status='FAIL';result.error={message:e.message,stack:e.stack};console.error(e);process.exitCode=1}
finally{
 await db?.end().catch(()=>{});
 for(const name of [apiName,dbName]){try{d('rm','-f',name)}catch{}}
 if(createdNetwork){try{d('network','rm',network)}catch{}}
 result.cleanup={containersRemoved:!d('ps','-a','--format','{{.Names}}').split('\n').some(n=>[apiName,dbName].includes(n)),networkRemoved:!d('network','ls','--format','{{.Name}}').split('\n').includes(network)};
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'integration-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:result.checks.length,cleanup:result.cleanup}));
}
