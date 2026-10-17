import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=process.cwd(),require=createRequire(path.join(root,'package.json')),ts=require('typescript');
const revision='a'.repeat(64),hash='b'.repeat(64),linkId='00000000-0000-4000-8000-000000000001';
const scope={bookingIds:[9001],bookingReferences:['QA-ONLY'],companyId:901,bookerId:902,customerId:903,driverId:904,travelerIds:[905],
  bookingTargets:[{bookingId:9001,bookingReference:'QA-ONLY',travelerId:905}]};
const config={version:1,databaseOrigin:'https://fixture.supabase.co',expiresAt:'2099-01-01T00:00:00Z',scope,
  credentials:Object.fromEntries(['admin','driver','customer'].map((r,i)=>[r,createHash('sha256').update(String(i).repeat(43)).digest('hex')]))};
const env={NODE_ENV:'test',SUPABASE_URL:config.databaseOrigin,SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',
  PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED:'true',PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET:'synthetic-only-'.repeat(5),PRESTIGE_STORE_REVIEW_ACCESS:JSON.stringify(config)};
const booking={id:9001,booking_reference:'QA-ONLY',public_booking_reference:'QA-ONLY',company_id:901,booker_id:902,customer_id:903,traveler_id:905,driver_id:904,
  status:'assigned',admin_internal_status:'assigned',customer_facing_status:'confirmed',driver_name:'QA Driver',driver_contact:'00000000',driver_plate_number:'QA123',vehicle_type_or_category:'QA car',
  pickup_at:'2026-10-20T02:00:00Z',service_type:'TRF',pickup_location:'QA pickup',dropoff_location:'QA dropoff',passenger_name:'QA Passenger',
  customer_price:'SECRET_PRICE',internal_admin_notes:'SECRET_NOTES'};
const link={id:linkId,booking_reference:'QA-ONLY',driver_id:904,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),
  link_status:'active',revoked_at:null,token_hash:hash,safe_link_context:{job_card_revision:revision,native_handoff_ciphertext:'SECRET_CIPHERTEXT',
  driver_job_payload:{passenger_name:'SECRET_UNTRUSTED_LINK_PAYLOAD'}}};
const events=[],queries=[],rpcCalls=[];
let rpcError=null;
const tables={bookings:[booking],driver_job_links:[link],driver_job_status_events:[]};
const client={from(table){
  const filters=[];let single=false,limit=Infinity;
  const q={select(columns){queries.push({table,columns,filters});return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},
    order(){return q;},limit(n){limit=n;return q;},maybeSingle(){single=true;return q;},
    then(resolve,reject){try{assert.ok(table in tables,'Unexpected table '+table);let rows=tables[table].filter(r=>filters.every(([k,v])=>r[k]===v)).slice(0,limit);
      resolve({data:single?(rows[0]||null):rows,error:null});}catch(e){reject(e);}},
    update(){throw Error('Unexpected table write '+table);},insert(){throw Error('Unexpected insert '+table);},delete(){throw Error('Unexpected delete '+table);}};
  return q;
},async rpc(name,args){rpcCalls.push({name,args});if(rpcError)return{data:null,error:rpcError};
  assert.equal(name,'acknowledge_current_driver_job_link');assert.ok(args.p_expected_review_booking);
  return{data:{...link,safe_link_context:{...link.safe_link_context,driver_acknowledged_at:new Date().toISOString(),driver_amendment_ack_pending:false}},error:null};}};
const cache=new Map();
const unsafe={
  'lib/driver-account-device-lock.ts':{verifyDriverAccountSession:()=>{events.push('ordinary-account');return false;},deviceIdHashFor:()=>''},
  'lib/driver-device-push-notification.ts':{opaqueDriverJobLinkKey:id=>'opaque-'+id,getDriverDevicePushReadiness:()=>({enabled:false,ready:false,public_key:null}),
    registerDriverDevicePushSubscriptionForAcknowledgedLink:()=>{events.push('register-alerts');return{link_key:null,subscription_registered:false};}},
  'lib/driver-portal-session.ts':{resolveDriverPortalSession:()=>({ok:false}),issueDriverPortalSessionForAcknowledgedToken:()=>{events.push('ordinary-session');return{ok:false};}},
  'lib/driver-job-operations-calendar-sync.ts':{syncAcknowledgedDriverDetailsToOperationsCalendar:()=>{events.push('calendar');return true;}},
  'lib/admin-device-push-notification.ts':{sendAdminDevicePushAlert:()=>events.push('admin-push')},
  'lib/customer-driver-app-notification-persistence.ts':{queueCustomerDriverDetailsReadyNotification:()=>events.push('customer-alert')},
};
function load(file){
  const relative=path.relative(root,file);if(unsafe[relative])return unsafe[relative];
  if(cache.has(file))return cache.get(file).exports;
  const mod={exports:{}};cache.set(file,mod);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,Buffer,URL,URLSearchParams,Request,Response,Headers,Date,structuredClone,console,process:{env},
    require(name){if(name==='server-only')return{};if(name==='@supabase/supabase-js')return{createClient:()=>client};if(name.startsWith('node:'))return require(name);
      if(name.startsWith('.')){let p=path.resolve(path.dirname(file),name);if(!p.endsWith('.ts'))p+='.ts';return load(p);}throw Error('Unexpected import '+name);}}, {filename:file});
  return mod.exports;
}
const review=load(path.join(root,'lib/store-review-access.ts'));
const route=load(path.join(root,'app/api/driver-job/[token]/route.ts'));
const cookie=review.issueStoreReviewSession('driver','1'.repeat(43),{env});assert.ok(cookie);
const request=(method='GET',body,extra={})=>new Request('http://localhost:3131/api/driver-job/review-9001',{method,
  headers:{cookie,origin:'http://localhost:3131',referer:'http://localhost:3131/driver-portal','content-type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
const ctx={params:Promise.resolve({token:'review-9001'})};
const opened=await route.GET(request(),ctx);
assert.equal(opened.status,200,'Valid reviewer must open only the exact QA job without an ordinary private token');
assert.equal((await opened.clone().json()).mode,'review');
assert.deepEqual(events,[]);assert.equal(rpcCalls.length,0);
console.log('PASS reviewer server-only QA open');
if(process.argv.includes('--sql')) {
  const {default:EmbeddedPostgres}=await import('/private/tmp/prestige-reviewer-ack-sql-runtime/node_modules/embedded-postgres/dist/index.js');
  const proposalRoot='/Users/sohyl/prestige-limo-ops/tmp/handoffs/2026-10-16-store-preparation/reviewer-ack-ownership-proposal';
  const {baseline}=await import(path.join(proposalRoot,'baseline.mjs'));
  const directory=fs.mkdtempSync('/private/tmp/prestige-reviewer-route-sql-');
  const pg=new EmbeddedPostgres({databaseDir:path.join(directory,'data'),user:'postgres',password:'synthetic-local-only',persistent:false,
    port:5432,postgresFlags:['-c','listen_addresses=','-k',directory],onLog:()=>{},onError:()=>{}});
  let db;
  try {
    await pg.initialise();await pg.start();db=pg.getPgClient('postgres',directory);await db.connect();
    assert.equal((await db.query('show listen_addresses')).rows[0].listen_addresses,'');await baseline(db);
    await db.query("update bookings set booking_reference='QA-ONLY',id=9001,company_id=901,booker_id=902,customer_id=903,traveler_id=905,driver_id=904");
    await db.query("insert into bookings(booking_reference,id,driver_id,status) values('UNRELATED-SYNTHETIC',9991,9992,'assigned')");
    await db.query(`insert into driver_job_links(id,booking_reference,driver_id,token_hash,link_status,expires_at,safe_link_context)
      values($1,'QA-ONLY',904,$2,'active',now()+interval '1 day',$3)`,[linkId,hash,JSON.stringify(link.safe_link_context)]);
    await db.query(fs.readFileSync(path.join(proposalRoot,'proposed-ack-ownership.sql'),'utf8'));
    const unrelated=JSON.stringify((await db.query("select * from bookings where booking_reference='UNRELATED-SYNTHETIC'")).rows);
    let attempts=0;
    client.rpc=async(name,args)=>{
      attempts++;assert.equal(name,'acknowledge_current_driver_job_link');
      try{return{data:(await db.query('select public.acknowledge_current_driver_job_link($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',
        ['p_booking_reference','p_link_id','p_token_hash','p_driver_id','p_name','p_contact','p_plate','p_vehicle','p_expected_revision','p_expected_review_booking'].map(k=>k==='p_expected_review_booking'?JSON.stringify(args[k]):args[k]))).rows[0].result,error:null};}
      catch(error){return{data:null,error:{code:error.code}};}
    };
    const body={action:'acknowledge',expected_revision:revision};
    const response=await route.PATCH(request('PATCH',body),ctx);assert.equal(response.status,200);
    assert.equal((await response.json()).payload.acknowledged,true);assert.equal(attempts,1);
    const saved=JSON.stringify((await db.query('select * from driver_job_links')).rows);
    await db.query("update bookings set company_id=9999 where booking_reference='QA-ONLY'");
    // The simulated HTTP read still reports the old QA tuple; real SQL must reject.
    assert.equal((await route.PATCH(request('PATCH',body),ctx)).status,403);assert.equal(attempts,2);
    assert.equal(JSON.stringify((await db.query('select * from driver_job_links')).rows),saved);
    assert.equal(JSON.stringify((await db.query("select * from bookings where booking_reference='UNRELATED-SYNTHETIC'")).rows),unrelated);
    assert.equal((await db.query('select count(*)::int n from customer_driver_app_notification_outbox')).rows[0].n,0);
    assert.deepEqual(events,[]);
    console.log('PASS actual route -> existing persistence -> proposed PostgreSQL ACK; QA save succeeds, stale ownership denied, unrelated record/outbox unchanged, no ordinary effects. Reads simulated; RPC actual local SQL, not live PostgREST.');
  } finally {if(db)await db.end();await pg.stop();fs.rmSync(directory,{recursive:true,force:true});assert.ok(!fs.existsSync(directory));}
  process.exit(0);
}
const json=value=>JSON.parse(JSON.stringify(value));
const expected={bookingId:9001,bookingReference:'QA-ONLY',companyId:901,bookerId:902,customerId:903,travelerId:905,driverId:904};
const openedText=await opened.text();
for(const secret of [hash,linkId,'SECRET_PRICE','SECRET_NOTES','SECRET_CIPHERTEXT','SECRET_UNTRUSTED_LINK_PAYLOAD'])assert.ok(!openedText.includes(secret),secret+' must remain server-only');
assert.equal(opened.headers.get('set-cookie'),null);assert.match(opened.headers.get('cache-control'),/private, no-store/);
const body={action:'acknowledge',expected_revision:revision};
const saved=await route.PATCH(request('PATCH',body),ctx);
assert.equal(saved.status,200);assert.equal((await saved.json()).payload.acknowledged,true);
assert.equal(saved.headers.get('set-cookie'),null);
assert.equal(rpcCalls.length,1);assert.deepEqual(json(rpcCalls[0].args.p_expected_review_booking),expected);
assert.equal(rpcCalls[0].args.p_token_hash,hash);assert.equal(rpcCalls[0].args.p_name,'QA Driver');
assert.deepEqual(events,[]);
let checks=5;
const deny=async(label,req,context=ctx)=>{
  const before=rpcCalls.length,beforeEffects=events.length;
  const response=await route[req.method](req,context);assert.equal(response.status,403,label);
  assert.equal(rpcCalls.length,before,label+' no RPC');assert.equal(events.length,beforeEffects,label+' no effects');checks++;
};
for(const bad of [{...body,driver_name:'Someone Else'},{...body,p_expected_review_booking:expected},{...body,native_device_alert_action:'register'},
  {action:'status',expected_revision:revision},{action:'acknowledge'},null,[],{...body,expected_revision:'bad'}])await deny('Reject body override',request('PATCH',bad));
for(const [header,value] of [['cookie',''],['cookie','prestige_store_review_session=bad'],['origin','https://foreign.invalid'],['referer','http://localhost:3131/another-page']])
  await deny('Reject request boundary '+header,request('PATCH',body,{[header]:value}));
for(const role of ['admin','customer']){
  const wrong=review.issueStoreReviewSession(role,String(role==='admin'?0:2).repeat(43),{env});
  await deny('Reject cross-role '+role,request('GET',undefined,{cookie:wrong}));
}
await deny('Reject ordinary private token under reviewer cookie',request(),{params:Promise.resolve({token:'ordinary-private-token'})});
await deny('Reject unlisted QA id',request(),{params:Promise.resolve({token:'review-9002'})});
await deny('Reject duplicate query/overrides',new Request('http://localhost:3131/api/driver-job/review-9001?token=secret',{headers:request().headers}));
env.NODE_ENV='production';await deny('Hard production hold',request());env.NODE_ENV='test';
for(const [key,value] of [['id',9002],['company_id',999],['booker_id',999],['customer_id',999],['traveler_id',null],['driver_id',999],['status','completed']]){
  const before=booking[key];booking[key]=value;await deny('Changed current booking '+key,request('PATCH',body));booking[key]=before;
}
for(const [key,value] of [['driver_id',999],['revoked_at',new Date().toISOString()],['expires_at','2000-01-01T00:00:00Z']]){
  const before=link[key];link[key]=value;await deny('Unavailable link '+key,request());link[key]=before;
}
tables.driver_job_status_events.push({id:1,booking_reference:'QA-ONLY',status_value:'completed'});await deny('Completed Driver report still closes ACK',request('PATCH',body));tables.driver_job_status_events.pop();
link.safe_link_context.combo_id='synthetic-combo';await deny('No combo fallback',request());delete link.safe_link_context.combo_id;
tables.driver_job_links.push({...link,id:'00000000-0000-4000-8000-000000000002'});await deny('Ambiguous active links',request());tables.driver_job_links.pop();
await deny('Stale reviewed revision',request('PATCH',{...body,expected_revision:'c'.repeat(64)}));
for(const error of [{code:'PGRST202'},{code:'42501'},{code:'P0002'}]){
  rpcError=error;const count=rpcCalls.length;assert.equal((await route.PATCH(request('PATCH',body),ctx)).status,403);
  assert.equal(rpcCalls.length,count+1,'Exactly one failed RPC, no old-signature fallback');checks++;
}
rpcError=null;
// Acknowledged retries still call the scoped SQL; no earlier return can skip ownership.
link.safe_link_context.driver_acknowledged_at=new Date().toISOString();
const retries=rpcCalls.length;assert.equal((await route.PATCH(request('PATCH',body),ctx)).status,200);
assert.equal(rpcCalls.length,retries+1);delete link.safe_link_context.driver_acknowledged_at;
assert.deepEqual(events,[]);
const persistence=load(path.join(root,'lib/driver-job-status-persistence.ts'));
const forged={booking:expected,expiresAt:Date.now()+60000};
assert.equal((await persistence.saveDriverJobDetailsThroughStatusPersistence({client,token:'review-9001',reviewBooking:forged,expectedRevision:revision})).ok,false);
assert.equal((await persistence.loadDriverJobPayloadThroughStatusPersistence({client,token:'review-9001',reviewBooking:forged})).ok,false);
const proof=review.resolveStoreReviewJobRequest(request(), 'review-9001').proof;
assert.ok(proof);assert.equal((await persistence.saveDriverJobStatusThroughStatusPersistence({client,token:'review-9001',reviewBooking:proof,status:'driver_otw'})).ok,false);
const old=env.PRESTIGE_STORE_REVIEW_ACCESS;
for(const targets of [undefined,[],[{bookingId:9002,bookingReference:'QA-ONLY',travelerId:905}],[{bookingId:9001,bookingReference:'OTHER',travelerId:905}]]){
  const next=json(config);next.scope.bookingTargets=targets;env.PRESTIGE_STORE_REVIEW_ACCESS=JSON.stringify(next);
  const nextCookie=review.issueStoreReviewSession('driver','1'.repeat(43),{env});
  await deny('Missing/incorrect paired target denied',request('GET',undefined,{cookie:nextCookie||cookie}));
}
env.PRESTIGE_STORE_REVIEW_ACCESS=old;
assert.equal(review.storeReviewRequestAllowed(review.resolveStoreReviewSession(cookie,{env}),'/api/driver-job/review-9001','PATCH'),false,'Outer proxy hold remains');
const ordinary=await route.GET(request('GET',undefined,{cookie:''}),{params:Promise.resolve({token:'ordinary-private-token'})});
assert.equal(ordinary.status,401,'Unrecognised ordinary token still follows existing denial');
assert.equal((await route.GET(request('GET',undefined,{cookie:''}),{params:Promise.resolve({token:'review-'+ 'x'.repeat(40)})})).status,401,'Ordinary long tokens with a similar prefix are not treated as QA aliases');
for(const query of queries.filter(q=>q.table==='bookings' && q.filters.some(([key])=>key==='id'))){
  for(const name of ['id','booking_reference','company_id','booker_id','customer_id','driver_id','traveler_id'])assert.ok(query.filters.some(([key])=>key===name),name+' mandatory read filter');
  for(const unsafe of ['customer_price','internal_admin_notes','invoice','payout'])assert.ok(!query.columns.includes(unsafe));
}
assert.deepEqual(events,[]);
console.log(JSON.stringify({status:'passed',negativeCases:checks,ordinaryEffects:events,scopeSent:expected,proxyAndProductionHeld:true,liveCalls:0}));
