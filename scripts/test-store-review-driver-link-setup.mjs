// New local QA-issuance checks only. No hosted URLs, real credentials or old suites.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {createRequire} from 'node:module';import {createHash,randomUUID} from 'node:crypto';
const root=process.cwd(),require=createRequire(root+'/package.json'),ts=require('typescript');
const handoff='/Users/sohyl/prestige-limo-ops/tmp/handoffs/2026-10-16-store-preparation';
const {baseline}=await import(handoff+'/admin-qa-save-proof/fixture.mjs');
const {default:EmbeddedPostgres}=await import('/private/tmp/prestige-reviewer-ack-sql-runtime/node_modules/embedded-postgres/dist/index.js');
const dir=fs.mkdtempSync('/private/tmp/prestige-qa-link-'),pg=new EmbeddedPostgres({databaseDir:dir+'/data',user:'postgres',password:'synthetic-only',persistent:false,port:5432,postgresFlags:['-c','listen_addresses=','-k',dir],onLog(){},onError(){}});
const checks=[],effects=[],calls=[];let db,other,client,locationEnabled=false,nativeSession=false;
const pass=n=>{checks.push(n);console.log('PASS '+n)};
const scope={bookingIds:[9001,9002],bookingReferences:['QA-DRIVER-SYNTHETIC','QA-ADMIN-SYNTHETIC'],companyId:901,bookerId:902,customerId:903,driverId:904,travelerIds:[905],adminSaveBookingReference:'QA-ADMIN-SYNTHETIC',driverLinkBookingReference:'QA-DRIVER-SYNTHETIC',bookingTargets:[{bookingId:9001,bookingReference:'QA-DRIVER-SYNTHETIC',travelerId:905},{bookingId:9002,bookingReference:'QA-ADMIN-SYNTHETIC',travelerId:905}]};
const config={version:1,databaseOrigin:'https://fixture.supabase.co',expiresAt:new Date(Date.now()+3*86400000).toISOString(),scope,credentials:Object.fromEntries(['admin','driver','customer'].map((r,i)=>[r,createHash('sha256').update(String(i).repeat(43)).digest('hex')]))};
const env={NODE_ENV:'test',SUPABASE_URL:config.databaseOrigin,SUPABASE_SERVICE_ROLE_KEY:'synthetic-local-only',PRESTIGE_STORE_REVIEW_ACCESS:JSON.stringify(config),PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET:'synthetic-only-'.repeat(5),PRESTIGE_ADMIN_ACCOUNT_AUTH_ENABLED:'true',PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:'true',PRESTIGE_DRIVER_PORTAL_SESSION_SECRET:'synthetic-driver-secret-'.repeat(3),PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED:'true'};
const provider=name=>()=>{effects.push(name);return Promise.resolve({ok:true,native_provider_accepted:true,native_provider_request_count:1})};
const stubs={
 'lib/native-push-badge-count.ts':{resetDriverNativePushBadgeCount:provider('badge-write')},
 'lib/admin-booking-supabase-adapter.ts':{checkAdminBookingPersistenceStagingConfigReadiness:()=>({ok:true}),adminDispatcherBoundaryToPersistenceAdapterActor:c=>({actor_label:c.actorLabel,actor_role:c.role,boundary_mode:c.mode,source_surface:'admin_api'})},
 'lib/driver-device-push-notification.ts':{sendDriverNativePendingAckReminder:provider('ack-push'),sendDriverDevicePushAlertForNewJobLink:provider('link-push'),sendDriverDevicePushAlertForAppUpdate:provider('update-push'),sendDriverDevicePushAlertForPickupReminder:provider('pickup-push'),opaqueDriverJobLinkKey:id=>createHash('sha256').update(id).digest('hex'),getDriverDevicePushReadiness:()=>({enabled:false,ready:false,public_key:null}),registerDriverDevicePushSubscriptionForAcknowledgedLink:provider('registration')},
 'lib/customer-device-push-notification.ts':{sendCustomerDevicePushAlertForAppUpdate:provider('customer-push')},
 'lib/admin-device-push-notification.ts':{sendAdminDevicePushAlert:provider('admin-push')},
 'lib/admin-live-location-runtime-control.ts':{openAdminLiveLocationRuntimeControl:provider('location-open'),readAdminControlledRuntimePolicy:async()=>({ok:true,policy:{allowedJobReferences:['QA-DRIVER-SYNTHETIC'],staleAfterSeconds:300}})},
 'lib/driver-live-location-runtime.ts':{driverLiveLocationRuntimeGateOpen:()=>locationEnabled,readAdminControlledRuntimePolicy:async()=>({ok:true,policy:{allowedJobReferences:['QA-DRIVER-SYNTHETIC'],staleAfterSeconds:300}})},
 'lib/driver-account-device-lock.ts':{verifyDriverAccountSession:async()=>true,deviceIdHashFor:()=>''},
 'lib/driver-portal-session.ts':{resolveDriverPortalSession:()=>nativeSession?({ok:true,claims:{accountId:'synthetic',deviceIdHash:'a'.repeat(64),driverId:904,issuedAt:Date.now()}}):({ok:false}),issueDriverPortalSessionForAcknowledgedToken:provider('ordinary-session')},
 'lib/driver-job-operations-calendar-sync.ts':{syncAcknowledgedDriverDetailsToOperationsCalendar:provider('calendar')},
 'lib/customer-driver-app-notification-persistence.ts':{queueCustomerDriverDetailsReadyNotification:provider('customer-notice')},
};
const cache=new Map();
function load(file){if(stubs[file])return stubs[file];if(cache.has(file))return cache.get(file).exports;
 const m={exports:{}};cache.set(file,m);const full=path.join(root,file);
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{fileName:full,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code+(file==='lib/driver-one-hour-pickup-reminder.ts'?'\nexports.__qaFollowup=readLocationFollowupEvidence;':''),{module:m,exports:m.exports,Buffer,URL,URLSearchParams,Request,Response,Headers,Date,Intl,structuredClone,console,process:{env},fetch(){throw Error('Network forbidden')},require(n){if(n==='server-only')return{};if(n==='@supabase/supabase-js')return{createClient:()=>client};if(n.startsWith('node:'))return require(n);if(n.startsWith('.')){const f=path.relative(root,path.resolve(path.dirname(full),n));return load(f.endsWith('.ts')?f:f+'.ts');}throw Error('Unexpected dependency '+n)}},{filename:full});return m.exports;}
const ident=s=>{assert.match(s,/^[a-z_][a-z0-9_]*$/);return '"'+s+'"'};
const rpc=async(c,name,args)=>{const keys=Object.keys(args);return(await c.query(`select public.${ident(name)}(${keys.map((k,i)=>ident(k)+'=> $'+(i+1)).join(',')}) value`,keys.map(k=>typeof args[k]==='object'&&args[k]!==null?JSON.stringify(args[k]):args[k]))).rows[0].value};
// Actual SQL functions; reads via an in-process Supabase-shaped adapter. Not PostgREST acceptance.
function sqlClient(c){return{from(table){ident(table);const filters=[],orders=[];let count=Infinity,offset=0,single=false,action='read',body;
 const val=(r,k)=>k.includes('->>')?r[k.split('->>')[0]]?.[k.split('->>')[1]]:r[k];
 const cmp=(a,b)=>Number.isFinite(Date.parse(a))&&Number.isFinite(Date.parse(b))?Date.parse(a)-Date.parse(b):String(a).localeCompare(String(b));
 const q={select(){return q},eq(k,v){filters.push(r=>String(val(r,k))===String(v));return q},is(k,v){filters.push(r=>(val(r,k)??null)===v);return q},in(k,v){filters.push(r=>v.map(String).includes(String(val(r,k))));return q},gt(k,v){filters.push(r=>cmp(val(r,k),v)>0);return q},gte(k,v){filters.push(r=>cmp(val(r,k),v)>=0);return q},lt(k,v){filters.push(r=>cmp(val(r,k),v)<0);return q},lte(k,v){filters.push(r=>cmp(val(r,k),v)<=0);return q},or(){return q},order(k,o={}){orders.push([k,o.ascending!==false]);return q},limit(n){count=n;return q},range(a,b){offset=a;count=b-a+1;return q},maybeSingle(){single=true;return q},single(){single=true;return q},insert(v){action='insert';body=v;return q},update(v){action='update';body=v;return q},async then(resolve,reject){try{let rows=(await c.query(`select to_jsonb(t) r from public.${ident(table)} t`)).rows.map(x=>x.r).filter(r=>filters.every(f=>f(r)));for(const[k,asc]of orders.reverse())rows.sort((a,b)=>String(val(a,k)).localeCompare(String(val(b,k)))*(asc?1:-1));rows=rows.slice(offset,offset+count);
 if(action==='insert'){const keys=Object.keys(body);rows=(await c.query(`insert into public.${ident(table)}(${keys.map(ident)}) values(${keys.map((_,i)=>'$'+(i+1))}) returning to_jsonb(${ident(table)}) r`,keys.map(k=>typeof body[k]==='object'&&body[k]!==null?JSON.stringify(body[k]):body[k]))).rows.map(x=>x.r);}
 if(action==='update'){for(const row of rows){assert.ok(row.id);const keys=Object.keys(body);await c.query(`update public.${ident(table)} set ${keys.map((k,i)=>ident(k)+'=$'+(i+1))} where id=$${keys.length+1}`,[...keys.map(k=>typeof body[k]==='object'&&body[k]!==null?JSON.stringify(body[k]):body[k]),row.id]);}}
 resolve({data:single?(rows[0]??null):rows,error:null});}catch(e){reject(e)}}};return q;},async rpc(name,args){calls.push({name,args});try{return{data:await rpc(c,name,args),error:null}}catch(e){console.error('Local SQL rejection',name,e.code,e.message);return{data:null,error:{code:e.code,message:e.message}}}}};}
let payload,body,ownerCookie,route,review,rawLink;
const req=(changes={},headers={},url='http://localhost:3131/api/admin-driver-job-links')=>new Request(url,{method:'POST',headers:{cookie:ownerCookie,origin:'http://localhost:3131',referer:'http://localhost:3131/','x-prestige-admin-purpose':'admin-booking-persistence','x-prestige-review-setup':'driver-qa-link','content-type':'application/json',...headers},body:JSON.stringify({...body,...changes})});
const jsonRows=async(table)=>JSON.stringify((await db.query(`select to_jsonb(t) r from ${ident(table)} t order by to_jsonb(t)::text`)).rows);
const links=async()=> (await db.query("select to_jsonb(t) r from driver_job_links t where booking_reference='QA-DRIVER-SYNTHETIC'")).rows.map(x=>x.r);
if(process.argv.includes('--followup-only')) {
 const now=new Date(),ref='QA-DRIVER-SYNTHETIC',id='00000000-0000-4000-8000-000000000099';
 const b={booking_reference:ref,driver_id:904,driver_plate_number:'QA123',pickup_at:new Date(Date.now()+86400000).toISOString(),admin_internal_status:'draft',customer_facing_status:'received'};
 const context={combo_id:id,combo_revision:id,combo_link_batch:id,combo_access_until:new Date(Date.now()+10*86400000).toISOString()};
 const followup=load('lib/driver-one-hour-pickup-reminder.ts').__qaFollowup;
 for(const [label,ctx,expiry,eligible]of [
  ['ordinary expiry behavior preserved',context,context.combo_access_until,false],
  ['ordinary current link still eligible',{},new Date(Date.now()+86400000).toISOString(),true],
  ['QA marker blocks followup',{store_review_booking:null},new Date(Date.now()+86400000).toISOString(),false]]){
  const link={id,booking_reference:ref,driver_id:904,link_status:'active',revoked_at:null,expires_at:expiry,safe_link_context:ctx};
  const c={from(t){const rows=t==='bookings'?[b]:t==='driver_job_links'?[link]:[];const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},then(resolve){resolve({data:rows,error:null})}};return q;}};
  const result=await followup(c,ref,id,now);assert.equal(Boolean(result),eligible,label);pass(label);
 }
 assert.deepEqual(effects,[]);fs.rmSync(dir,{recursive:true,force:true});process.exit(0);
}
try{
 await pg.initialise();await pg.start();db=pg.getPgClient('postgres',dir);other=pg.getPgClient('postgres',dir);await db.connect();await other.connect();assert.equal((await db.query('show listen_addresses')).rows[0].listen_addresses,'');await baseline(db);
 await db.query(`alter table bookings add column if not exists source_surface text,add column if not exists request_review_status text,add column if not exists short_notice_review_status text,add column if not exists change_review_status text,add column if not exists cancellation_review_status text,add column if not exists customer_request_trip_group jsonb,add column if not exists route_type text;
 alter table driver_job_status_events add column if not exists id bigserial,add column if not exists driver_job_link_id uuid,add column if not exists status_value text,add column if not exists occurred_at timestamptz,add column if not exists driver_id bigint;
 alter table customer_driver_app_notification_outbox add column if not exists created_at timestamptz default clock_timestamp();
 create table admin_app_notification_outbox(id uuid default gen_random_uuid(),booking_reference text,event_key text,notification_status text,notification_type text,priority text,delivery_surface text,source_surface text,actor_role text,workflow_area text,safe_title text,safe_message text,safe_context jsonb,updated_at timestamptz);
 alter table driver_access_accounts add column if not exists id uuid default gen_random_uuid();
 alter table driver_device_push_subscriptions add column if not exists endpoint text,add column if not exists source_surface text,add column if not exists revoked_at timestamptz;`);
 await db.query(fs.readFileSync('supabase/migrations/20260930024457_driver_job_remark_payload.sql','utf8'));
 const lifecycle=fs.readFileSync('supabase/migrations/20260918043000_driver_alert_lifecycle.sql','utf8');await db.query(lifecycle.slice(lifecycle.indexOf('create or replace function'),lifecycle.lastIndexOf('commit;')));
 await db.query(fs.readFileSync('supabase/migrations/20261007013614_driver_amended_revision_ack.sql','utf8'));
 await db.query(fs.readFileSync('docs/store-submission/driver-reviewer-qa-link.sql','utf8'));
 await db.query(fs.readFileSync(handoff+'/reviewer-ack-ownership-proposal/proposed-ack-ownership.sql','utf8'));
 await db.query(`insert into drivers values(904,'QA Driver','00000000','QA123','Combi','available');
 insert into driver_access_accounts(driver_reference,account_status,active_device_id_hash) values('904','active',repeat('a',64));
 insert into driver_device_push_subscriptions values(904,'active','synthetic-endpoint','driver_native_ios',null);`);
 const pickup=new Date(Math.floor((Date.now()+2*86400000)/60000)*60000).toISOString();
 await db.query(`insert into bookings(id,booking_reference,public_booking_reference,customer_id,company_id,booker_id,traveler_id,driver_id,pickup_at,vehicle,vehicle_type_or_category,service_type,luggage_count,status,admin_internal_status,customer_facing_status,source_surface,request_review_status,short_notice_review_status,driver_name,driver_contact,driver_plate_number,pickup_location,dropoff_location,route_summary,passenger_name)
 select id,ref,id::text,903,901,902,905,904,$1::timestamptz+(id-9001)*interval '1 day','Combi','Combi','TRF',1,null,'draft','received','admin_dashboard','pending_review','not_required','QA Driver','00000000','QA123','QA pickup','QA dropoff','QA pickup > QA dropoff','QA Passenger'
 from(values(9001,'QA-DRIVER-SYNTHETIC'),(9002,'QA-ADMIN-SYNTHETIC'),(9003,'ORDINARY-CONTROL'))v(id,ref)`,[pickup]);
 client=sqlClient(db);const auth=load('lib/admin-dispatcher-auth-boundary.ts');ownerCookie=auth.issueAdminAccountSession({accountId:'00000000-0000-4000-8000-000000000001',authUserId:'00000000-0000-4000-8000-000000000002',actorLabel:'Synthetic owner',role:'admin'});assert.ok(ownerCookie);
 review=load('lib/store-review-access.ts');route=load('app/api/admin-driver-job-links/route.ts');
 const dt=new Date(pickup),parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(dt),part=t=>parts.find(x=>x.type===t).value;
 payload={pickup_datetime:pickup,assigned_driver_name:'QA Driver',assigned_driver_contact:'00000000',assigned_driver_plate:'QA123',assigned_driver_vehicle_model:'Combi',booking_type:'TRF',pickup_location:'QA pickup',dropoff_location:'QA dropoff',route:'QA pickup > QA dropoff',passenger_name:'QA Passenger',pickup_date:`${part('year')}-${part('month')}-${part('day')}`,pickup_time:part('hour')+part('minute')};body={booking_reference:'QA-DRIVER-SYNTHETIC',driver_job_payload:payload,ttl_hours:72};
 const bookingsBefore=await jsonRows('bookings');
 const first=await route.POST(req());assert.equal(first.status,200,await first.clone().text());const firstBody=await first.json();assert.equal(firstBody.review_alias,'review-9001');assert.equal(firstBody.disposition,'created');assert.ok(!('driver_job_url'in firstBody));assert.deepEqual(effects,[]);rawLink=(await links())[0];assert.equal(rawLink.safe_link_context.link_purpose,'store_review_qa');assert.ok(!('native_handoff_ciphertext'in rawLink.safe_link_context));assert.equal(await jsonRows('bookings'),bookingsBefore);assert.equal(calls.length,1);pass('Actual Admin session/POST/persistence -> atomic SQL creates only scoped non-bearer QA link');
 const saved=await jsonRows('driver_job_links');const retry=await route.POST(req());assert.equal(retry.status,200,await retry.clone().text());assert.equal((await retry.json()).disposition,'reused');assert.equal(await jsonRows('driver_job_links'),saved);pass('Exact retry reuses unchanged link without delivery/location/booking writes');
 for(const [label,changes,headers,url]of[
 ['Admin target',{booking_reference:'QA-ADMIN-SYNTHETIC'},{}],['unlisted target',{booking_reference:'OTHER'},{}],['missing owner',{}, {cookie:''}],['wrong origin',{}, {origin:'https://foreign.invalid'}],['wrong referer',{}, {referer:'http://localhost:3131/other'}],['unknown purpose',{}, {'x-prestige-review-setup':'anything'}],['non-loopback',{}, {},'https://app.invalid/api/admin-driver-job-links'],['query override',{}, {},'http://localhost:3131/api/admin-driver-job-links?target=9002']]){const n=calls.length;const r=await route.POST(req(changes,headers,url));assert.equal(r.status,403,label+': '+await r.text());assert.equal(calls.length,n);}
 const dispatcher=auth.issueAdminAccountSession({accountId:'00000000-0000-4000-8000-000000000001',authUserId:'00000000-0000-4000-8000-000000000002',actorLabel:'Synthetic dispatcher',role:'dispatcher'});assert.equal((await route.POST(req({}, {cookie:dispatcher}))).status,403);
 for(const role of ['admin','driver','customer']){const c=review.issueStoreReviewSession(role,String(['admin','driver','customer'].indexOf(role)).repeat(43));assert.equal((await route.POST(req({}, {cookie:ownerCookie+'; '+c}))).status,403);}
 const cfg=env.PRESTIGE_STORE_REVIEW_ACCESS;for(const v of ['',JSON.stringify({...config,expiresAt:'2000-01-01T00:00:00Z'}),JSON.stringify({...config,scope:{...scope,driverLinkBookingReference:scope.adminSaveBookingReference}})]){env.PRESTIGE_STORE_REVIEW_ACCESS=v;assert.equal((await route.POST(req())).status,403);}env.PRESTIGE_STORE_REVIEW_ACCESS=cfg;
 env.NODE_ENV='production';assert.equal((await route.POST(req())).status,403);env.NODE_ENV='test';env.VERCEL_ENV='preview';assert.equal((await route.POST(req())).status,403);delete env.VERCEL_ENV;pass('Owner-only, role/origin/config/expiry/target and production denials before RPC');
 const args=calls[0].args;
 for(const key of ['bookingId','bookingReference','companyId','bookerId','customerId','travelerId','driverId']){await assert.rejects(rpc(db,'apply_admin_driver_job_link',{...args,p_review_booking:{...args.p_review_booking,[key]:key==='bookingReference'?'OTHER':99999}}));assert.equal(await jsonRows('driver_job_links'),saved);}
 await assert.rejects(rpc(db,'apply_admin_driver_job_link',{...args,p_expected_updated_at:'2000-01-01T00:00:00Z'}));
 await assert.rejects(rpc(db,'apply_admin_driver_job_link',{...args,p_ciphertext:'should-never-be-sealed'}));
 await assert.rejects(rpc(db,'apply_admin_driver_job_link',{...args,p_actor_role:'dispatcher'}));
 await assert.rejects(rpc(db,'apply_admin_driver_job_link',{...args,p_review_booking:undefined,p_ciphertext:'x'.repeat(40)}));
 assert.equal(await jsonRows('driver_job_links'),saved);pass('SQL exact tuple/version/ciphertext/actor guards and ordinary retry denial');
 // Local test transaction proves all-or-nothing rollback; no hosted execution.
 await db.query('begin');await db.query('delete from driver_job_links');await rpc(db,'apply_admin_driver_job_link',args);await db.query('rollback');assert.equal(await jsonRows('driver_job_links'),saved);
 for(const role of ['anon','authenticated']){await db.query('begin');await db.query('set local role '+role);await assert.rejects(rpc(db,'apply_admin_driver_job_link',args),e=>e.code==='42501');await db.query('rollback');}
 assert.equal(Number((await db.query("select count(*) n from pg_proc where proname='apply_admin_driver_job_link'")).rows[0].n),1);pass('Atomic rollback, denied public roles and no old overload');
 // Persisted marker, not expiring configuration, controls worker suppression.
 delete env.PRESTIGE_STORE_REVIEW_ACCESS;await db.query("update driver_job_links set issued_at=now()-interval '1 hour'");
 const manual=load('lib/admin-driver-ack-reminder.ts'),auto=load('lib/driver-ack-auto-reminder.ts'),pickupWorker=load('lib/driver-one-hour-pickup-reminder.ts'),customerWorker=load('lib/customer-thirty-minute-pickup-reminder.ts');
 const outboxBefore=await jsonRows('customer_driver_app_notification_outbox');
 for(const context of [rawLink.safe_link_context,{...rawLink.safe_link_context,store_review_booking:null},{...rawLink.safe_link_context,link_purpose:'store_review_unknown'}]){
 await db.query('update driver_job_links set safe_link_context=$1 where id=$2',[JSON.stringify(context),rawLink.id]);
 const m=await manual.createAdminDriverAckReminder(client,{booking_reference:body.booking_reference,driver_job_link_id:rawLink.id},{actor_role:'admin',actor_label:'Synthetic'});assert.equal(m.reason,'invalid_link');
 const a=await auto.runDriverAckAutoRemindersWithClient(client);assert.equal(a.reminder_sent_count,0);assert.equal(a.failure_count,0);
 const p=await pickupWorker.runDriverOneHourPickupRemindersWithClient(client,{now:new Date(dt.getTime()-60*60000)});assert.equal(p.candidate_count,1);assert.equal(p.notification_count,0);assert.equal(p.ok,true,JSON.stringify(p));
 for(const mode of ['created','recovery','amendment','reminder','close_ack_alert']){const reserved=await rpc(db,'reserve_driver_job_link_delivery',{p_booking_reference:body.booking_reference,p_link_id:rawLink.id,p_driver_id:904,p_mode:mode,p_revision:context.job_card_revision,p_request_id:randomUUID(),p_actor_role:'admin',p_actor_label:'Synthetic'});assert.equal(reserved.claimed,false);}
 }
 locationEnabled=true;const emergency=await pickupWorker.runDriverOneHourPickupRemindersWithClient(client,{now:new Date(dt.getTime()-34*60000)});assert.equal(emergency.ok,true,JSON.stringify(emergency));assert.equal((await db.query('select count(*)::int n from admin_app_notification_outbox')).rows[0].n,0);locationEnabled=false;
 assert.equal(await jsonRows('customer_driver_app_notification_outbox'),outboxBefore);assert.deepEqual(effects,[]);env.PRESTIGE_STORE_REVIEW_ACCESS=cfg;await db.query('update driver_job_links set safe_link_context=$1 where id=$2',[JSON.stringify(rawLink.safe_link_context),rawLink.id]);pass('Missing/expired config and malformed QA markers cannot deliver, remind or authorize location');
 const driverCookie=review.issueStoreReviewSession('driver','1'.repeat(43));const driverRoute=load('app/api/driver-job/[token]/route.ts');const driverReq=(method,body)=>new Request('http://localhost:3131/api/driver-job/review-9001',{method,headers:{cookie:driverCookie,origin:'http://localhost:3131',referer:'http://localhost:3131/driver-portal','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const ctx={params:Promise.resolve({token:'review-9001'})};
 const listed=await load('app/api/driver-portal/jobs/route.ts').GET(new Request('http://localhost:3131/api/driver-portal/jobs',{headers:{cookie:driverCookie,referer:'http://localhost:3131/driver-portal','x-prestige-driver-purpose':'driver-portal-jobs-read'}}));assert.equal(listed.status,200,await listed.clone().text());assert.equal((await listed.json()).jobs.length,1,'Standalone Admin target must not make Driver list fail');
 assert.equal(review.resolveStoreReviewJobRequest(driverReq('GET'),'review-9002').state,'blocked');
 for(const bad of [{...rawLink.safe_link_context,store_review_booking:null},{...rawLink.safe_link_context,link_purpose:'store_review_unknown'}]){await db.query('update driver_job_links set safe_link_context=$1 where id=$2',[JSON.stringify(bad),rawLink.id]);assert.equal((await driverRoute.GET(driverReq('GET'),ctx)).status,403);}
 await db.query('update driver_job_links set safe_link_context=$1 where id=$2',[JSON.stringify(rawLink.safe_link_context),rawLink.id]);
 const opened=await driverRoute.GET(driverReq('GET'),ctx);assert.equal(opened.status,200,await opened.clone().text());const ack=await driverRoute.PATCH(driverReq('PATCH',{action:'acknowledge',expected_revision:rawLink.safe_link_context.job_card_revision}),ctx);assert.equal(ack.status,200,await ack.clone().text());assert.equal((await ack.json()).payload.acknowledged,true);assert.equal((await db.query('select customer_facing_status from bookings where id=9001')).rows[0].customer_facing_status,'received');
 const c=await customerWorker.runCustomerThirtyMinutePickupRemindersWithClient(client,{now:new Date(dt.getTime()-30*60000)});assert.equal(c.notification_count,0);assert.deepEqual(effects,[]);
 const handoffModule=load('lib/driver-native-job-handoff.ts');assert.equal(handoffModule.openDriverNativeJobHandoff({bookingReference:body.booking_reference,tokenHash:rawLink.token_hash,ciphertext:rawLink.safe_link_context.native_handoff_ciphertext}),null);
 nativeSession=true;const jobKey=createHash('sha256').update(rawLink.id).digest('hex');const nativeResponse=await load('app/api/driver-native-job-open/[jobKey]/route.ts').GET(new Request('http://localhost:3131/api/driver-native-job-open/'+jobKey,{headers:{'x-prestige-driver-purpose':'driver-native-job-open'}}),{params:Promise.resolve({jobKey})});assert.equal(nativeResponse.status,410);assert.equal(nativeResponse.headers.get('location'),null);nativeSession=false;
 const portal=await load('lib/driver-portal-jobs.ts').loadDriverPortalJobs({client,driverId:904,includeAlerts:false,includePendingAcknowledgement:true});assert.equal(portal.ok,true);assert.equal(portal.jobs.length,0);
 for(const token of ['review-9001',rawLink.token_hash,'synthetic-guessed-private-token']){const result=await load('lib/driver-job-status-persistence.ts').loadDriverJobPayloadThroughStatusPersistence({client,token});assert.equal(result.ok,false);}
 assert.equal(await jsonRows('customer_driver_app_notification_outbox'),outboxBefore);pass('Actual scoped alias open/ACK retains received status; no ordinary portal/token/session or Customer reminder');
 // An ordinary request keeps the established issuance, sealed token and delivery.
 const ordinary=(await db.query('select to_jsonb(b) r from bookings b where id=9003')).rows[0].r;const od=new Date(ordinary.pickup_at),oparts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(od),op=t=>oparts.find(x=>x.type===t).value;
 const ordinaryBody={ttl_hours:96,booking_reference:ordinary.booking_reference,driver_job_payload:{...payload,pickup_datetime:ordinary.pickup_at,pickup_date:`${op('year')}-${op('month')}-${op('day')}`}};
 const ordinaryReq=req(ordinaryBody);ordinaryReq.headers.delete('x-prestige-review-setup');const ordinaryResponse=await route.POST(ordinaryReq);assert.equal(ordinaryResponse.status,200,await ordinaryResponse.clone().text());const ordinaryResult=await ordinaryResponse.json();assert.match(ordinaryResult.driver_job_url,/\/driver-job\//);assert.ok(effects.includes('link-push'));assert.ok(effects.includes('location-open'));pass('Ordinary creation retains private link, delivery and Live Location handoff');
 assert.equal(await jsonRows('bookings'),bookingsBefore,'All booking rows including standalone Admin remain unchanged');
 const ordinaryLink=(await db.query("select to_jsonb(t) r from driver_job_links t where booking_reference='ORDINARY-CONTROL'")).rows[0].r;
 await db.query("update driver_job_links set issued_at=now()-interval '1 hour' where id=$1",[ordinaryLink.id]);
 await db.query("update customer_driver_app_notification_outbox set created_at=now()-interval '1 hour'");
 const ordinaryAuto=await auto.runDriverAckAutoRemindersWithClient(client);assert.equal(ordinaryAuto.reminder_sent_count,1);assert.equal(ordinaryAuto.failure_count,0);
 const ordinaryPickup=await pickupWorker.runDriverOneHourPickupRemindersWithClient(client,{now:new Date(od.getTime()-60*60000)});assert.equal(ordinaryPickup.notification_count,1);assert.equal(ordinaryPickup.ok,true);
 assert.ok(effects.includes('ack-push'));assert.ok(effects.includes('pickup-push'));
 const ordinaryPortal=await load('lib/driver-portal-jobs.ts').loadDriverPortalJobs({client,driverId:904,includeAlerts:false,includePendingAcknowledgement:true});assert.equal(ordinaryPortal.ok,true);assert.equal(ordinaryPortal.jobs.length,1);pass('Ordinary automatic/manual reminder, pickup reminder and portal controls remain active');
 // New issuance races; existing Pool/combo functions and lock triggers are retained.
 const tables=(await db.query("select tablename from pg_tables where schemaname='public'")).rows.map(r=>r.tablename);
 const seed={};for(const t of ['drivers','driver_access_accounts','driver_device_push_subscriptions','bookings'])seed[t]=(await db.query(`select to_jsonb(t) r from ${ident(t)} t`)).rows.map(r=>r.r);
 const adminCanary=JSON.stringify(seed.bookings.find(r=>r.id===9002));
 const resetRace=async()=>{await db.query('truncate '+tables.map(ident).join(',')+' restart identity cascade');for(const[t,rows]of Object.entries(seed))await db.query(`insert into ${ident(t)} select * from jsonb_populate_recordset(null::${ident(t)},$1)`,[JSON.stringify(rows)]);};
 const pid=Number((await other.query('select pg_backend_pid() pid')).rows[0].pid);
 const waitForLock=async()=>{const end=Date.now()+2500;while(Date.now()<end){const r=(await db.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0];if(r?.wait_event_type==='Lock')return;await new Promise(r=>setTimeout(r,10));}throw Error('Expected booking lock was not observed')};
 const publication=c=>c.query("select publish_driver_pool_offer($1,$2::timestamptz,100,$3::text,'admin','Synthetic race','COMBI',array[904]::bigint[]) value",[body.booking_reference,args.p_expected_updated_at,randomUUID()]);
 const combine=async(c)=>{const members=(await c.query("select booking_reference,updated_at::text from bookings where id in(9001,9003) order by booking_reference")).rows;return c.query("select define_driver_job_combo($1,$2::jsonb,null,'admin','Synthetic race')",[body.booking_reference,JSON.stringify(members)]);};
 for(const kind of ['ownership','version','Pool','combo']){
  await resetRace();await db.query('begin');
  if(kind==='ownership')await db.query('update bookings set company_id=999 where id=9001');
  if(kind==='version')await db.query('update bookings set updated_at=clock_timestamp() where id=9001');
  if(kind==='Pool'||kind==='combo'){await db.query('update bookings set driver_id=null where id in(9001,9003)');if(kind==='Pool')await publication(db);else await combine(db);}
  const pending=rpc(other,'apply_admin_driver_job_link',args).then(value=>({ok:true,value}),error=>({ok:false,code:error.code}));
  try{await waitForLock()}finally{await db.query('commit')}
  const before=await jsonRows('bookings');const result=await pending;assert.equal(result.ok,false,kind);assert.equal((await links()).length,0);assert.equal(await jsonRows('bookings'),before);
  assert.equal(JSON.stringify((await db.query('select to_jsonb(b) r from bookings b where id=9002')).rows[0].r),adminCanary);
  pass(kind+' commits first: waiting QA issuance rejects without changing competitor or Admin fixture');
 }
 for(const kind of ['Pool','combo']){
  await resetRace();await db.query('begin');await rpc(db,'apply_admin_driver_job_link',args);
  const pending=(kind==='Pool'?publication(other):combine(other)).then(value=>({ok:true,value}),error=>({ok:false,code:error.code}));
  try{await waitForLock()}finally{await db.query('commit')}
  assert.equal((await pending).ok,false,kind);assert.equal((await links()).length,1);
  assert.equal(Number((await db.query('select count(*) n from driver_job_bid_offers')).rows[0].n),0);assert.equal(Number((await db.query('select count(*) n from driver_job_combo_members')).rows[0].n),0);
  pass('QA issuance first: '+kind+' waits and preserves assigned standalone QA link');
 }

 console.log(JSON.stringify({passed:checks.length,checks,limitation:'Actual route and SQL with local read adapter/provider spies; no PostgREST, hosted or installed-device claim'}));
}finally{if(other)await other.end();if(db)await db.end();await pg.stop();fs.rmSync(dir,{recursive:true,force:true});}
