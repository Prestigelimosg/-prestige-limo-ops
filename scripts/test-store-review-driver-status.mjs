// Only new reviewer status coverage. Synthetic records; no hosted connection or old suites.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const require=createRequire(import.meta.url),root=process.cwd();
const scope={bookingIds:[9001,9002],bookingReferences:['QA-DRIVER','QA-ADMIN'],companyId:901,bookerId:902,customerId:903,driverId:904,travelerIds:[905],bookingTargets:[{bookingId:9001,bookingReference:'QA-DRIVER',travelerId:905},{bookingId:9002,bookingReference:'QA-ADMIN',travelerId:905}],driverLinkBookingReference:'QA-DRIVER',adminSaveBookingReference:'QA-ADMIN'};
const config={version:1,databaseOrigin:'https://fixture.supabase.co',expiresAt:'2099-01-01T00:00:00Z',scope,credentials:Object.fromEntries(['admin','driver','customer'].map((r,i)=>[r,createHash('sha256').update(String(i).repeat(43)).digest('hex')]))};
const env={NODE_ENV:'test',SUPABASE_URL:config.databaseOrigin,SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',PRESTIGE_STORE_REVIEW_ACCESS:JSON.stringify(config),PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET:'synthetic-only-'.repeat(5),PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED:'true'};
const cache=new Map();let client;
function load(file){if(cache.has(file))return cache.get(file).exports;const loaded={exports:{}};cache.set(file,loaded);const full=path.join(root,file);
vm.runInNewContext(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{module:loaded,exports:loaded.exports,Buffer,URL,URLSearchParams,Request,Response,Headers,Date,Intl,structuredClone,console,process:{env},fetch(){throw Error('No network');},require(name){if(name==='server-only')return{};if(name.startsWith('node:'))return require(name);if(name==='@supabase/supabase-js')return{createClient:()=>client};if(name==='next/server')return{after(){throw Error('Reviewer must not schedule provider work');}};if(name.endsWith('driver-device-push-notification.ts'))return{opaqueDriverJobLinkKey(){throw Error('No native token');}};if(name.endsWith('driver-job-link-production.ts'))return new Proxy({}, {get(){return()=>{throw Error('No ordinary status writer or provider effects');};}});if(name.startsWith('.')){const target=path.relative(root,path.resolve(path.dirname(full),name));return load(target.endsWith('.ts')?target:target+'.ts');}throw Error('Unexpected dependency '+name);}},{filename:file});return loaded.exports;}
const auth=load('lib/store-review-access.ts');
function request({role='driver',token='review-9001',status='driver_otw',body,headers={},method='PATCH',suffix='/status'}={}){const url='http://localhost:3136';return new Request(url+'/api/driver-job/'+token+suffix,{method,headers:{cookie:auth.issueStoreReviewSession(role,String(['admin','driver','customer'].indexOf(role)).repeat(43)),origin:url,referer:url+'/driver-job/'+token,'content-type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(body??{status})})});}
const access=auth.resolveStoreReviewJobRequest(request(),'review-9001');
assert.equal(access.state,'review','existing reviewer status route must authenticate the exact designated QA target');
console.log('PASS new reviewer status authorization');

if (!process.argv.includes('--ui-only')) {
const {execFileSync}=await import('node:child_process');
const {randomUUID,createHmac}=await import('node:crypto');
const {Client}=require('/private/tmp/prestige-reviewer-ack-sql-runtime/node_modules/pg');
const {createClient}=require('@supabase/supabase-js');
const {baseline}=await import('/Users/sohyl/prestige-limo-ops/tmp/handoffs/2026-10-16-store-preparation/admin-qa-save-proof/fixture.mjs');
const name='prestige-review146-'+randomUUID().slice(0,8),dbName=name+'-db',apiName=name+'-api';
const d=(...args)=>execFileSync('/usr/local/bin/docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const secret=randomUUID()+randomUUID();
function jwt(role){const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const body=part({alg:'HS256',typ:'JWT'})+'.'+part({role,exp:Math.floor(Date.now()/1000)+3600});return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');}
let db,other,api,network=false;
let calls=[];
const target={...scope.bookingTargets[0],companyId:901,bookerId:902,customerId:903,driverId:904};
const linkId='00000000-0000-4000-8000-000000000001',revision='b'.repeat(64);
const linkContext={link_purpose:'store_review_qa',store_review_booking:target,job_card_revision:revision,driver_ack_required_revision:revision,driver_acknowledged_revision:revision,driver_acknowledged_at:new Date().toISOString(),driver_amendment_ack_pending:false};
const query=(text,values=[])=>db.query(text,values);
const snapshot=async()=>{const result={};for(const table of ['bookings','driver_job_links','drivers','audit_logs','driver_live_location_latest_positions','customer_driver_app_notification_outbox'])result[table]=(await query(`select to_jsonb(t) v from ${table} t order by to_jsonb(t)::text`)).rows;return JSON.stringify(result);};
const rpcBody={p_expected_booking:target,p_link_id:linkId,p_expected_revision:revision,p_status:'driver_otw'};
const invoke=async(body=rpcBody,role='service_role')=>fetch(api+'/rpc/record_driver_reviewer_qa_status',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+jwt(role)},body:JSON.stringify(body)});
const count=async()=>Number((await query('select count(*) n from driver_job_status_events')).rows[0].n);
try{
 d('network','create',name);network=true;
 d('run','-d','--name',dbName,'--network',name,'--network-alias','qa-db','-p','127.0.0.1::5432','--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.121','-c','/usr/lib/postgresql/bin/initdb -D /tmp/qa-data -A trust >/tmp/qa-init.log && echo "host all all 0.0.0.0/0 trust" >> /tmp/qa-data/pg_hba.conf && exec /usr/lib/postgresql/bin/postgres -D /tmp/qa-data -h 0.0.0.0');
 const port=Number(d('port',dbName,'5432/tcp').split(':').pop());
 for(let i=0;i<40;i++){try{db=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});await db.connect();break;}catch(error){await db?.end().catch(()=>{});db=null;if(i===39)throw error;await pause(250);}}
 other=new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});await other.connect();
 await baseline(db);
 await query(`alter table bookings add column source_surface text,add column request_review_status text,add column short_notice_review_status text,add column change_review_status text,add column cancellation_review_status text,add column customer_request_trip_group jsonb;
 drop table driver_job_status_events;
 create table driver_job_status_events(id uuid primary key default gen_random_uuid(),booking_reference text not null,driver_job_link_id uuid,status_value text not null,status_source text not null default 'driver_job_api',safe_status_note text,safe_status_context jsonb not null default '{}',occurred_at timestamptz not null default now(),source_surface text not null default 'driver_job_api',actor_role text not null default 'driver',actor_label text,created_at timestamptz not null default now());
 alter table driver_job_status_events enable row level security;
 alter role service_role bypassrls;
 create role authenticator login noinherit;grant anon,authenticated,service_role to authenticator;
 grant usage on schema public to anon,authenticated,service_role;
 grant select,update on bookings,driver_job_links to service_role;
 grant select on driver_job_bid_offers,driver_job_combo_members to service_role;
 grant select,insert on driver_job_status_events to service_role;`);
 const assignment=fs.readFileSync('supabase/migrations/20260915083147_admin_manual_driver_assignment_cancellation.sql','utf8');
 await query(assignment.slice(assignment.indexOf('create or replace function public.guard_cancelled_driver_assignment_status()')));
 await query(fs.readFileSync('docs/store-submission/driver-reviewer-qa-status.sql','utf8'));
 await query(`insert into drivers values(904,'QA Driver','00000000','QA123','Combi','available');
 insert into bookings(id,booking_reference,public_booking_reference,company_id,booker_id,customer_id,traveler_id,driver_id,pickup_at,vehicle,vehicle_type_or_category,service_type,status,admin_internal_status,customer_facing_status,source_surface,request_review_status,short_notice_review_status,driver_name,driver_contact,driver_plate_number,pickup_location,dropoff_location,route_summary,passenger_name)
 select id,ref,id::text,901,902,903,905,904,now()+interval '2 days','Combi','Combi','TRF',null,'draft','received','admin_dashboard','pending_review','not_required','QA Driver','00000000','QA123','QA pickup','QA dropoff','QA pickup > QA dropoff','Synthetic passenger' from (values(9001,'QA-DRIVER'),(9002,'QA-ADMIN'),(9003,'NON-TARGET')) t(id,ref);
 insert into driver_live_location_latest_positions values('NON-TARGET');`);
 await query(`insert into driver_job_links(id,booking_reference,driver_id,token_hash,link_status,expires_at,safe_link_context) values($1,'QA-DRIVER',904,repeat('a',64),'active',now()+interval '2 days',$2)`,[linkId,JSON.stringify(linkContext)]);
 d('run','-d','--name',apiName,'--network',name,'-p','127.0.0.1::3000','-e','PGRST_DB_URI=postgres://authenticator@qa-db:5432/postgres','-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e','PGRST_JWT_SECRET='+secret,'public.ecr.aws/supabase/postgrest:v16.4');
 api='http://127.0.0.1:'+d('port',apiName,'3000/tcp').split(':').pop();
 for(let i=0;i<40;i++){try{const response=await fetch(api+'/');if(response.ok)break;throw Error('Local Data API starting');}catch(error){if(i===39)throw error;await pause(250);}}
 env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED='true';
 client=createClient(config.databaseOrigin,jwt('service_role'),{auth:{persistSession:false},global:{fetch:async(input,init)=>{const url=new URL(String(input));assert.equal(url.origin,config.databaseOrigin);assert.ok(url.pathname.startsWith('/rest/v1/'));calls.push({url:url.href,method:init.method});return fetch(api+url.pathname.slice('/rest/v1'.length)+url.search,{...init,signal:AbortSignal.timeout(8000)});}}});
 const route=load('app/api/driver-job/[token]/status/route.ts');
 const persistence=load('lib/driver-job-status-persistence.ts');
 const context={params:Promise.resolve({token:'review-9001'})};
 const before=await snapshot();
 if (!process.argv.includes('--db-followup') && !process.argv.includes('--denials-only')) {
 // New API boundaries, before any write. A valid ordinary cookie cannot override a reviewer cookie.
 for(const options of [{role:'admin'},{role:'customer'},{headers:{origin:'https://foreign.invalid'}},{headers:{referer:'http://localhost:3136/customers'}},{token:'review-9002'},{body:{status:'driver_otw',booking_reference:'NON-TARGET'}},{headers:{cookie:'prestige_store_review_session=invalid; prestige_driver_portal_session=ordinary'}}]){
  const n=calls.length;const response=await route.PATCH(request(options),{params:Promise.resolve({token:options.token||'review-9001'})});assert.equal(response.status,403,await response.text());assert.equal(calls.length,n);
 }
 for(const role of ['anon','authenticated']){const response=await invoke(rpcBody,role);assert.ok([401,403].includes(response.status),await response.text());}
 assert.equal(await count(),0);console.log('PASS actual route roles/origin/body restrictions and Data API anon/authenticated denial');
 // The write rechecks current ownership while holding the same booking lock as established writers.
 for(const [field,value] of [['company_id',999],['booker_id',999],['customer_id',999],['traveler_id',999],['driver_id',999]]){
  const original=(await query(`select ${field} from bookings where id=9001`)).rows[0][field];await query(`update bookings set ${field}=$1 where id=9001`,[value]);const response=await invoke();assert.equal(response.ok,false);await query(`update bookings set ${field}=$1 where id=9001`,[original]);
 }
 for(const patch of [{link_purpose:'ordinary'},{store_review_booking:{...target,customerId:999}},{driver_amendment_ack_pending:true},{driver_acknowledged_revision:'c'.repeat(64)},{driver_acknowledged_at:''},{combo_id:'synthetic'},{native_handoff_ciphertext:'synthetic'},{assignment_cancelled_at:new Date().toISOString()}]){
  await query('update driver_job_links set safe_link_context=$1 where id=$2',[JSON.stringify({...linkContext,...patch}),linkId]);assert.equal((await invoke()).ok,false);
 }
 await query('update driver_job_links set safe_link_context=$1 where id=$2',[JSON.stringify(linkContext),linkId]);
 assert.equal((await invoke({...rpcBody,p_status:'completed'})).ok,false);assert.equal(await count(),0);console.log('PASS atomic ownership, durable QA marker, ACK revision and sequential status restrictions');
 for(const status of ['driver_otw','ots','pob','completed']){
  const response=await route.PATCH(request({status}),context);const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.mode,'review');assert.equal(body.payload.status,status);assert.equal(body.sharing_cleanup.reason,'review_isolated');assert.equal(body.link_expiry.no_op,true);
  const n=await count();assert.equal(n,['driver_otw','ots','pob','completed'].indexOf(status)+1);const retry=await route.PATCH(request({status}),context);assert.equal(retry.status,200,await retry.text());assert.equal(await count(),n);
 }
 const payload=await persistence.loadDriverJobPayloadThroughStatusPersistence({client,token:'review-9001',reviewBooking:access.proof});assert.equal(payload.ok,true);assert.equal(payload.payload.statusHistory.length,4);assert.equal(payload.payload.status,'completed');assert.equal(await snapshot(),before);
 assert.ok(calls.every(call=>call.method==='GET'||call.url.endsWith('/rpc/record_driver_reviewer_qa_status')));console.log('PASS actual PATCH -> SDK -> PostgREST -> SQL sequence and retries; completed read; no booking/link/GPS/outbox/audit mutations');
 // Duplicate concurrent OTW requests serialize to one event.
 await query('delete from driver_job_status_events');
 const duplicate=await Promise.all([invoke(),invoke()]);for(const response of duplicate)assert.equal(response.status,200,await response.text());assert.equal(await count(),1);
 await query('delete from driver_job_status_events');
 await other.query('begin');await other.query('update bookings set booker_id=999 where id=9001');
 let settled=false;const racing=invoke().then(response=>{settled=true;return response;});await pause(100);assert.equal(settled,false);await other.query('commit');assert.equal((await racing).ok,false);assert.equal(await count(),0);await query('update bookings set booker_id=902 where id=9001');
 console.log('PASS duplicate requests and ownership-change lock race fail closed');
 // An event constraint failure must not leave partial work.
 await query("alter table driver_job_status_events add constraint synthetic_reject check(status_value <> 'driver_otw')");assert.equal((await invoke()).ok,false);assert.equal(await count(),0);assert.equal(await snapshot(),before);
 console.log('PASS transaction rollback; all protected rows unchanged');
 await query('alter table driver_job_status_events drop constraint synthetic_reject');
 }
 { // Additional missing race and denial cases; default mode includes all new coverage.
 if(!process.argv.includes('--denials-only')) {
 const waitForLock=async(test)=>{for(let i=0;i<250;i++){if(await test())return;await pause(10);}throw Error('Expected database lock was not observed');};
 await other.query('begin');await other.query('update bookings set traveler_id=999 where id=9001');
 const pending=invoke();
 await waitForLock(async()=>Number((await query("select count(*) n from pg_stat_activity where wait_event_type='Lock' and query like '%record_driver_reviewer_qa_status%'")).rows[0].n)>0);
 await other.query('commit');assert.equal((await pending).ok,false);assert.equal(await count(),0);await query('update bookings set traveler_id=905 where id=9001');
 console.log('PASS observed Data API booking-lock wait rejects concurrent traveller scope change');
 const pid=Number((await other.query('select pg_backend_pid() pid')).rows[0].pid);
 const version=(await query('select updated_at::text v from bookings where id=9001')).rows[0].v;
 for(const kind of ['Pool','combo']) {
   await query('begin');await query('select record_driver_reviewer_qa_status($1,$2,$3,$4)',[JSON.stringify(target),linkId,revision,'driver_otw']);
   const competing=(kind==='Pool' ? other.query("select publish_driver_pool_offer($1,$2::timestamptz,100,$3::text,'admin','Synthetic race','COMBI',array[904]::bigint[])",['QA-DRIVER',version,randomUUID()]) : other.query("select define_driver_job_combo('QA-DRIVER',(select jsonb_agg(jsonb_build_object('booking_reference',booking_reference,'updated_at',updated_at::text)) from bookings where id in(9001,9003)),null,'admin','Synthetic race')"))
     .then(()=>({ok:true}),error=>({ok:false,code:error.code}));
   try{await waitForLock(async()=>(await query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0]?.wait_event_type==='Lock');}finally{await query('commit');}
   assert.equal((await competing).ok,false,kind);assert.equal(await count(),1);assert.equal(await snapshot(),before);await query('delete from driver_job_status_events');
 }
 console.log('PASS existing Pool and combo writers wait on the shared booking lock and cannot absorb the QA job');
 }
 for(const [column,value] of [['link_status','revoked'],['expires_at','2000-01-01T00:00:00Z']]) {
   const original=(await query(`select ${column}::text v from driver_job_links where id=$1`,[linkId])).rows[0].v;
   await query(`update driver_job_links set ${column}=$1 where id=$2`,[value,linkId]);assert.equal((await invoke()).ok,false);await query(`update driver_job_links set ${column}=$1 where id=$2`,[original,linkId]);
 }
 await query("insert into driver_job_status_events(booking_reference,driver_job_link_id,status_value,actor_label) values('QA-DRIVER',$1,'driver_otw','ordinary')",[linkId]);
 assert.equal((await invoke({...rpcBody,p_status:'ots'})).ok,false);
 const poisoned=await persistence.loadDriverJobPayloadThroughStatusPersistence({client,token:'review-9001',reviewBooking:access.proof});assert.equal(poisoned.ok,false);await query('delete from driver_job_status_events');
 const requestProof=auth.resolveStoreReviewJobRequest(request(),'review-9001').proof;
 const n=calls.length;const oldConfig=env.PRESTIGE_STORE_REVIEW_ACCESS;env.PRESTIGE_STORE_REVIEW_ACCESS=JSON.stringify({...config,expiresAt:'2000-01-01T00:00:00Z'});
 assert.equal((await persistence.saveDriverJobStatusThroughStatusPersistence({client,token:'review-9001',status:'driver_otw',reviewBooking:requestProof})).ok,false);assert.equal(calls.length,n);env.PRESTIGE_STORE_REVIEW_ACCESS=oldConfig;
 assert.equal((await persistence.saveDriverJobStatusThroughStatusPersistence({client,token:'review-9001',status:'driver_otw',reviewBooking:{...requestProof}})).ok,false);assert.equal(calls.length,n);
 assert.equal(await snapshot(),before);assert.equal(await count(),0);
 await query('update driver_job_links set safe_link_context=$1 where id=$2',[JSON.stringify({...linkContext,link_purpose:undefined,store_review_booking:undefined}),linkId]);
 const rpcCount=calls.filter(call=>call.method==='POST').length;
 assert.equal((await persistence.saveDriverJobStatusThroughStatusPersistence({client,token:'review-9001',status:'driver_otw',reviewBooking:access.proof})).ok,false);
 assert.equal(calls.filter(call=>call.method==='POST').length,rpcCount);
 await query('update driver_job_links set safe_link_context=$1 where id=$2',[JSON.stringify(linkContext),linkId]);
 console.log('PASS expired/revoked link, unrecognized history, expired configuration and forged proof denial');
 }

} finally {
 await other?.query('rollback').catch(()=>{});await other?.end().catch(()=>{});await db?.end().catch(()=>{});
 for(const container of [apiName,dbName])try{d('rm','-f',container);}catch{}
 if(network)try{d('network','rm',name);}catch{}
}

}

// Execute changed screen callbacks and render the existing status controls with React.
const source=fs.readFileSync('app/driver-job/[token]/page.tsx','utf8');
const tree=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
function walk(node){nodes.push(node);ts.forEachChild(node,walk);}walk(tree);
function evaluate(code,ctx){return vm.runInNewContext(ts.transpileModule('const run = '+code+'; run;',{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText,{exports:{},require,console,...ctx});}
const update=nodes.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='updateStatus');
const workflow=load('lib/driver-job-status-workflow.ts');
let current='assigned',feedback,opened=0,requests=0,bridge=0;
const state={pageState:{kind:'ready'},reviewJob:true,token:'review-9001',acknowledged:true,workflowStatus:current,guardDriverJobStatusTransition:workflow.guardDriverJobStatusTransition,
 completionDialogRef:{current:{showModal(){opened++;}}},setUpdatingStatus(){},setStatusFeedback:value=>{feedback=value;},setWorkflowStatus:value=>{current=value;state.workflowStatus=value;},setPageState(){},addActivity(){},setDriverOtsPhotoProof(){},statusDisplay:value=>value,embeddedDriverApp:true,isVerifiedEmbeddedDriverApp:()=>true,postEmbeddedDriverBridgeMessage(){bridge++;},
 fetch:async(url,init)=>{requests++;assert.equal(url,'/api/driver-job/review-9001/status');assert.equal(init.method,'PATCH');const {status}=JSON.parse(init.body);return{ok:true,json:async()=>({ok:true,mode:'review',payload:{status}})};}};
for(const status of ['driver_otw','ots','pob'])assert.equal(await evaluate(update.getText(tree),state)(status,status),true);
assert.equal(await evaluate(update.getText(tree),state)('completed','Job Completed'),false);assert.equal(opened,1);assert.equal(requests,3);
assert.equal(await evaluate(update.getText(tree),state)('completed','Job Completed','Completed',true),true);assert.equal(bridge,0);assert.equal(feedback.tone,'success');
state.reviewJob=false;state.workflowStatus='pob';assert.equal(await evaluate(update.getText(tree),state)('completed','Job Completed','Completed',true),true);assert.equal(bridge,1,'ordinary completion still notifies the existing native bridge');
const loadJob=nodes.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='loadJob');
let reloaded;
const reloadState={active:true,reviewJob:true,token:'review-9001',window:{location:{origin:'https://app.prestigelimo.sg'}},setPageState(){},setAcknowledged(){},setSavedDriverDetails(){},setDetailsFeedback(){},setDriverDetails(){},setWorkflowStatus:value=>{reloaded=value;},fetch:async()=>({ok:true,json:async()=>({ok:true,mode:'review',payload:{status:'pob',assignedDriver:{},acknowledged:true}})})};
await evaluate(loadJob.getText(tree),reloadState)();assert.equal(reloaded,'pob');
const section=nodes.find(node=>ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(prop=>prop.name?.getText(tree)==='data-driver-primary-step'&&prop.initializer?.getText(tree)==='"status-workflow"'));
assert.ok(section);assert.notEqual(section.parent.kind,ts.SyntaxKind.ConditionalExpression,'status section visible for review');
const {renderToStaticMarkup}=require('react-dom/server');
let qaClicks=0,gpsClicks=0;
function renderStatus(reviewJob){const jsx=evaluate('()=>('+section.getText(tree)+')',{reviewJob,statusActions:[{label:'OTW',value:'driver_otw'},{label:'OTS',value:'ots'},{label:'POB',value:'pob'},{label:'Job Completed',value:'completed'}],updatingStatus:'',driverLiveLocation:{action:'idle',sharingState:'idle'},driverOtwLiveLocationControlLabel:'Share location',driverOtwLiveLocationControlDisabled:false,driverOtwLiveLocationFeedback:null,handleOtwLiveLocationControl:()=>{gpsClicks++;},updateStatus:()=>{qaClicks++;},statusFeedback:null,driverOtsPhotoProofReady:false,driverStatusTimingRows:[]})();return jsx;}
const reviewUI=renderStatus(true),html=renderToStaticMarkup(reviewUI);assert.equal((html.match(/data-driver-job-status="/g)||[]).length,4);assert.doesNotMatch(html,/data-driver-otw-live-location-control|data-driver-job-ots-photo-proof/);
function buttons(element,result=[]){if(!element||typeof element!=='object')return result;if(element.type==='button')result.push(element);for(const child of [element.props?.children].flat(Infinity))buttons(child,result);return result;}
buttons(reviewUI)[0].props.onClick();assert.equal(qaClicks,1);assert.equal(gpsClicks,0);
buttons(renderStatus(false))[0].props.onClick();assert.equal(gpsClicks,1);
console.log('PASS rendered four existing QA status buttons, existing confirmation, persisted reload and ordinary GPS/native callback preservation');
