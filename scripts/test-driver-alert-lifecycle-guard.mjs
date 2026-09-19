import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const read = p => readFile(p, 'utf8');
const page = await read('app/driver-portal/page.tsx');
assert.match(page, /await clearCurrentAlerts\(job.job_key\)/, 'opening an alert must clear only that displayed job alert');
const admin = await read('app/page.tsx');
assert.match(admin, /action: "close_ack_alert"/, 'Close must persist the exact reminder dismissal');
assert.doesNotMatch(admin, /"Auto reminder processing"/, 'never claim processing indefinitely without a delivery attempt');
const native = await read('driver-companion/src/native-notifications.ts');
const ast = ts.createSourceFile('native.ts', native, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'dismissNativeJobNotifications');
assert.ok(fn, 'native removal is scoped by opaque job key');
const dismissed = [];
const a = 'a'.repeat(64), b = 'b'.repeat(64);
let presented = [
 {request:{identifier:'first',content:{data:{job_key:a}}}},
 {request:{identifier:'other',content:{data:{job_key:b}}}},
 {request:{identifier:'second',content:{data:{job_key:a}}}},
];
let count;
const api = {getPresentedNotificationsAsync:async()=>presented,
 dismissNotificationAsync:async id=>{dismissed.push(id);presented=presented.filter(n=>n.request.identifier!==id)},
 setBadgeCountAsync:async n=>{count=n;return true}};
const dismiss = new Function('validJobKey', ts.transpileModule(fn.getText(ast).replace(/^export /,'' )+'; return dismissNativeJobNotifications;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v));
await dismiss(a, api);
assert.deepEqual(dismissed, ['first','second'], 'other jobs remain visible');
assert.equal(count,1,'another job keeps its badge');
await dismiss('bad', api);
assert.equal(dismissed.length,2);
console.log('Driver alert lifecycle scope passed');

// Execute the actual cancellation reader across more than one page.
const {createHash} = await import('node:crypto');
const portalSource=await read('lib/driver-portal-jobs.ts');
const portalAst=ts.createSourceFile('portal.ts',portalSource,ts.ScriptTarget.Latest,true);
const readFn=portalAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='loadDismissedDriverNotificationKeys');
const asRecord=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const opaque=id=>createHash('sha256').update(id).digest('hex');
const readDismissals=new Function('asRows','asRecord','uuidPattern','positiveInteger','bookingIsTerminal','opaqueDriverJobLinkKey','createHash',
 ts.transpileModule(readFn.getText(portalAst).replace(/^export /,'')+';return loadDismissedDriverNotificationKeys;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
)(v=>Array.isArray(v)?v:[],asRecord,/^[a-f0-9-]{36}$/,v=>Number(v),b=>b.status==='cancelled',opaque,createHash);
const linkId=i=>'11111111-1111-4111-8111-'+String(i).padStart(12,'0');
const links=Array.from({length:101},(_,i)=>({id:linkId(i),booking_reference:'JOB'+i,link_status:'active',expires_at:'2099-01-01',safe_link_context:{}}));
links[100].safe_link_context={job_card_revision:'two',ack_alert_closed_revision:'two',ack_alert_closed_at:'2030-01-01'};
links[99].safe_link_context={job_card_revision:'two',ack_alert_closed_revision:'one',ack_alert_closed_at:'2030-01-01'};
const offerKey='c'.repeat(64),readKey='d'.repeat(64),unreadKey='e'.repeat(64);
const bids=[
 {bid_status:'accepted',driver_job_bid_offers:{offer_key:offerKey,offer_status:'cancelled'}},
 {bid_status:'pending',safe_bid_context:{alert_read_offer_updated_at:'2030-01-01T00:00:00+00:00'},driver_job_bid_offers:{offer_key:readKey,offer_status:'open',updated_at:'2030-01-01T00:00:00.000Z'}},
 {bid_status:'pending',safe_bid_context:{alert_read_offer_updated_at:'2029-01-01'},driver_job_bid_offers:{offer_key:unreadKey,offer_status:'open',updated_at:'2030-01-01'}},
];
let failedRead=false;const pages=[];
const client={from(table){const filters={};let range=[0,999];return {
 select(){return this},eq(k,v){filters[k]=v;return this},in(k,v){filters[k]=v;return this},order(){return this},range(a,b){range=[a,b];return this},
 then(resolve,reject){try{
  if(failedRead&&table==='driver_job_bids')return Promise.resolve({error:{message:'synthetic failure'}}).then(resolve,reject);
  let data;
  if(table==='driver_job_links'){assert.equal(filters.driver_id,7);pages.push(range[0]);data=links.slice(range[0],range[1]+1);}
  else if(table==='bookings')data=filters.booking_reference.map(ref=>({booking_reference:ref,driver_id:7,status:'assigned'}));
  else {assert.equal(table,'driver_job_bids');assert.equal(filters.driver_reference,'7');data=bids.slice(range[0],range[1]+1);}
  return Promise.resolve({data,error:null}).then(resolve,reject);
 }catch(e){return Promise.reject(e).then(resolve,reject);}}
}}};
const cleanup=await readDismissals(client,7);
assert.deepEqual(pages,[0,100]);
assert.ok(cleanup.includes(opaque(linkId(100))));
assert.ok(!cleanup.includes(opaque(linkId(99))),'old Close cannot hide a newer amendment');
assert.ok(cleanup.includes(createHash('sha256').update('prestige-driver-pool-offer:'+offerKey).digest('hex')));
assert.ok(!cleanup.includes(createHash('sha256').update('prestige-driver-pool-cancel:'+offerKey).digest('hex')),'cancellation warning survives posting cleanup');
assert.ok(cleanup.includes(createHash('sha256').update('prestige-driver-pool-offer:'+readKey).digest('hex')),'equivalent timestamp forms are read');
assert.ok(!cleanup.includes(createHash('sha256').update('prestige-driver-pool-offer:'+unreadKey).digest('hex')));
failedRead=true;assert.equal(await readDismissals(client,7),null,'incomplete reads never clear all');
console.log('Driver cancellation reconciliation: own driver, pagination, amendments, read revisions, cancellation warning and read failure passed');

// Exercise the existing portal PATCH: account-bound badge CAS cannot clear a newer push.
const routeSource=await read('app/api/driver-portal/jobs/route.ts');
const routeAst=ts.createSourceFile('route.ts',routeSource,ts.ScriptTarget.Latest,true);
const routeFunctions=routeAst.statements.filter(n=>ts.isFunctionDeclaration(n)&&['response','inactiveDriverAccountResponse','sameOriginDriverPortalRequest','readJsonBody','PATCH'].includes(n.name?.text))
 .map(n=>n.getText(routeAst).replace(/^export /,'')).join('\n');
let verified=true, activeRows=1, persistedBadge=5, writes=0;
const badgeClient={from(table){assert.equal(table,'driver_device_push_subscriptions');const filters={};let mutation;
 return {select(){return this},eq(k,v){filters[k]=v;return this},is(k,v){filters[k]=v;return this},limit(){return this},
 update(value){mutation=value;return this},then(resolve,reject){try{
  assert.equal(filters.driver_id,7);assert.equal(filters.source_surface,'driver_native_ios');assert.equal(filters.subscription_status,'active');assert.equal(filters.revoked_at,null);
  let data=Array.from({length:activeRows},(_,i)=>({id:'owned-'+i}));
  if(mutation){assert.equal(filters.id,'owned-0');if(filters.badge_count!==persistedBadge)data=[];else{persistedBadge=mutation.badge_count;writes++;}}
  return Promise.resolve({data,error:null}).then(resolve,reject);
 }catch(e){return Promise.reject(e).then(resolve,reject);}}
 }}};
const patch=new Function('resolveDriverPortalSession','getDriverJobStatusPersistenceClientForProduction','verifyDriverAccountSession','clearDriverPortalSessionCookie','clearDriverPortalAlerts',
 ts.transpileModule(routeFunctions+';return PATCH;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
)(()=>({ok:true,claims:{accountId:'account',deviceIdHash:'proof',driverId:7}}),()=>({ok:true,client:badgeClient}),async input=>{assert.equal(input.driverId,7);return verified;},()=>'',()=>{throw Error('Unrelated alert mutation')});
const badgeRequest=(expected=5)=>new Request('https://example.test/api/driver-portal/jobs',{method:'PATCH',
 headers:{'content-type':'application/json','origin':'https://example.test','referer':'https://example.test/driver-portal','x-prestige-driver-purpose':'driver-portal-alerts-clear'},
 body:JSON.stringify({badge_count:2,expected_badge_count:expected})});
assert.equal((await patch(badgeRequest())).status,200);assert.equal(persistedBadge,2);
persistedBadge=6;assert.equal((await patch(badgeRequest())).status,409);assert.equal(persistedBadge,6,'new push count preserved');
activeRows=2;assert.equal((await patch(badgeRequest(6))).status,409);assert.equal(writes,1,'ambiguous registration is not changed');
verified=false;assert.equal((await patch(badgeRequest())).status,401);assert.equal(writes,1);
console.log('Driver badge PATCH: verified account, exact native row, concurrent count and ambiguous registration protection passed');
