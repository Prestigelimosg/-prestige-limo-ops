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
assert.match(native, /export async function applyNativeNoticeCleanup/, 'cleanup must execute without an open My Jobs WebView');
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

// Android can present background FCM notifications without the custom data.
// Expo reconstructs these using its exact foreign-notification tag/id URI.
const foreign = (key, id = '0') => `expo-notifications://foreign_notifications?tag=${encodeURIComponent(`prestige-driver-job-${key}`)}&id=${id}`;
presented = [
 {request:{identifier:foreign(a),content:{data:{'android.text':'Job updated. Tap to review.'}}}},
 {request:{identifier:foreign(b),content:{data:{}}}},
 {request:{identifier:'expo-notifications://foreign_notifications?tag=FCM-Notification%3Alegacy&id=0',content:{data:{}}}},
 {request:{identifier:foreign(a, 'invalid'),content:{data:{}}}},
 {request:{identifier:foreign(a).replace('foreign_notifications','untrusted'),content:{data:{}}}},
 {request:{identifier:foreign(a)+'&tag=another',content:{data:{}}}},
 {request:{identifier:foreign(a,'1'),content:{data:{job_key:b}}}},
];
const removedForeign = [];
const foreignApi = {getPresentedNotificationsAsync:async()=>presented,
 dismissNotificationAsync:async id=>{removedForeign.push(id);presented=presented.filter(n=>n.request.identifier!==id);},
 setBadgeCountAsync:async n=>{count=n;return true}};
await dismiss(a, foreignApi);
assert.deepEqual(removedForeign,[foreign(a)],'remove only the exact identified Android job; preserve conflicting, malformed and unknown notices');
assert.equal(count,6,'unrelated and unidentifiable notices retain their badge');
const pushSource = await read('lib/driver-device-push-notification.ts');
const pushAst = ts.createSourceFile('push.ts',pushSource,ts.ScriptTarget.Latest,true);
const sendFn = pushAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='sendNativePush');
const send = new Function('driverDevicePushProviderTimeoutMs','expoPushEndpoint','asRecord','AbortController','setTimeout','clearTimeout',
 ts.transpileModule(sendFn.getText(pushAst)+'; return sendNativePush;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
)(1000,'https://example.test/push',v=>v&&typeof v==='object'?v:{},AbortController,setTimeout,clearTimeout);
let payload;
await send('qa-token',a,'available_jobs','Job updated. Tap to review.',2,async (_url,options)=>{
 payload=JSON.parse(options.body);return {ok:true,json:async()=>({data:{status:'ok'}})};
});
assert.deepEqual(payload,{badge:2,body:'Job updated. Tap to review.',data:{job_key:a,open_target:'available_jobs',sent_at:payload.data.sent_at},
 priority:'high',sound:'default',tag:`prestige-driver-job-${a}`,title:'Prestige Driver',to:'qa-token'},
 'existing sender retains delivery, badge, message and handoff with an opaque tag and send-time cutoff protection');
console.log('Android background notification tag identity passed');

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

// Execute automatic cleanup without a WebView, sign-in, navigation or network.
const storage = new Map();
let storageFails = false;
const SecureStore = {
 getItemAsync: async key => { if(storageFails) throw Error('locked storage'); return storage.get(key) ?? null; },
 setItemAsync: async (key,value) => { if(storageFails) throw Error('locked storage'); storage.set(key,value); },
};
const nativeModule = native.replace(/^import[\s\S]*?from "[^\"]+";\n/gm, '');
const nativeCode = ts.transpileModule(nativeModule, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const loadNative = () => {
 const exports={};new Function('exports','SecureStore',nativeCode)(exports,SecureStore);return exports;
};
let lifecycle=loadNative();
const now=Date.now(), before=now-1000;
const notice=(id,key,sentAt)=>({date:sentAt,request:{identifier:id,content:{data:{job_key:key,sent_at:sentAt}}}});
const instruction={driver_pool_refresh:true,job_key:a,dismiss_before:before};
presented=[notice('obsolete',a,before-1),notice('same-tick',a,before),notice('amendment',a,now),notice('new-job',b,now),notice('cancel-warning','c'.repeat(64),before-2),{request:{identifier:foreign(a),content:{data:{}}}}];
await lifecycle.applyNativeNoticeCleanup(instruction,api);
assert.deepEqual(presented.map(n=>n.request.identifier),['same-tick','amendment','new-job','cancel-warning',foreign(a)],'new revisions, unrelated alerts, warnings and unknown legacy timestamps survive');
assert.equal(count,5);
await lifecycle.applyNativeNoticeCleanup({...instruction,dismiss_before:before-100},api);
assert.equal([...storage.values()][0],String(before),'out-of-order cleanup cannot lower the stored cutoff');
lifecycle=loadNative(); // Simulate app restart; only SecureStore persists.
presented.push(notice('delayed-old',a,before-20));
await lifecycle.applyNativeNoticeCleanup(null,api);
assert.ok(!presented.some(n=>n.request.identifier==='delayed-old'),'resume removes a delayed arrival using its send time');
for(const bad of [{...instruction,job_key:'invalid'},{...instruction,dismiss_before:now+86400000},{...instruction,dismiss_before:'123'},{...instruction,driver_pool_refresh:false}]) {
 const size=storage.size;await lifecycle.applyNativeNoticeCleanup(bad,api);assert.equal(storage.size,size);
}
assert.deepEqual(lifecycle.nativeNoticeTaskData({data:instruction}),instruction,'iOS data payload');
assert.deepEqual(lifecycle.nativeNoticeTaskData({data:{dataString:JSON.stringify(instruction)}}),instruction,'Android dataString');
assert.equal(lifecycle.nativeNoticeTaskData({data:{dataString:'broken'}}),null);
assert.equal(lifecycle.nativeNoticeTaskData({actionIdentifier:'tap',data:instruction}),null,'tap handling remains in its current lane');
storageFails=true;
await assert.rejects(lifecycle.applyNativeNoticeCleanup(instruction,api));
presented.push(notice('new-during-error',b,Date.now()));
storageFails=false;
await lifecycle.applyNativeNoticeCleanup(null,api);
assert.ok(presented.some(n=>n.request.identifier==='new-during-error'),'cleanup failure cannot poison the next run or remove a new job');
const taskSource=await read('driver-companion/index.ts');
assert.match(taskSource,/import "\.\/src\/background-location-task"/);
assert.match(taskSource,/defineTask<Notifications.NotificationTaskPayload>/);
assert.match(taskSource,/registerTaskAsync\(notificationCleanupTask\)/);
assert.match(taskSource,/applyNativeNoticeCleanup\(nativeNoticeTaskData\(data\), Notifications\)/);
assert.doesNotMatch(taskSource,/fetch\(|setScreen|location\.replace|requestPermissions/);
const appSource=await read('driver-companion/App.tsx');
assert.match(appSource,/if \(nextState === "active"\) void applyNativeNoticeCleanup/);
assert.match(appSource,/void applyNativeNoticeCleanup\(data, Notifications\)\.catch/);
assert.match(appSource,/handleNotification: async \(\) => \(\{\s*shouldPlaySound: true,\s*shouldSetBadge: true,\s*shouldShowBanner: true,\s*shouldShowList: true/,'new visible alerts never await cleanup');
const config=JSON.parse(await read('driver-companion/app.json'));
assert.equal(config.expo.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-notifications')[1].enableBackgroundRemoteNotifications,true);
console.log('Automatic cleanup: background payloads, restart, delayed/duplicate instructions, newer alerts, storage failure and independent presentation passed');

// Execute server eligibility and existing silent sender, without a provider or database write.
const extractPush=name=>pushAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(pushAst).replace(/^export /,'');
let offerState='assigned',bidState='expired',readError=false,captured;
const proofClient={from(table){assert.equal(table,'driver_job_bids');const filters={};return {
 select(){return this},eq(key,value){filters[key]=value;return this},async maybeSingle(){
 assert.equal(filters.driver_reference,'7');assert.equal(filters['driver_job_bid_offers.offer_key'],a);
 return {error:readError?{message:'failed'}:null,data:{bid_status:bidState,driver_job_bid_offers:{offer_key:a,offer_status:offerState}}};
 }}}};
const silentPool=new Function('safePositiveInteger','safeText','isTruthyGate','cleanEnvValue','driverDevicePushEnabledEnvName','resolveProviderConfig','driverHasActiveOnePhoneAccount','asRecord','driverPoolOfferPayload','sendPayloadToDriverSubscriptions','alertResult',
 ts.transpileModule(extractPush('sendDriverDeviceSilentRefreshForDriverPoolOffer')+';return sendDriverDeviceSilentRefreshForDriverPoolOffer;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
)(v=>Number(v),v=>String(v),()=>true,v=>v,'ENABLED',()=>({}),async()=>true,asRecord,()=>({job_key:a}),async(...args)=>{captured=args;return {};},()=>({}));
for(const [status,bid,obsolete] of [['assigned','expired',true],['assigned','accepted',false],['assigned',undefined,false],['open','pending',false],['cancelled','accepted',true],['closed','pending',true],['expired','pending',true]]) {
 offerState=status;bidState=bid;await silentPool(proofClient,{driver_id:7,offer_key:a},{env:{}});
 assert.equal(typeof captured[11]==='number',obsolete,`${status}/${bid} cleanup eligibility`);
}
readError=true;await silentPool(proofClient,{driver_id:7,offer_key:a},{env:{}});assert.equal(captured[11],undefined,'unverified state only refreshes, never dismisses');
const silentSend=new Function('driverDevicePushProviderTimeoutMs','expoPushEndpoint','asRecord',
 ts.transpileModule(extractPush('sendNativeSilentPush')+';return sendNativeSilentPush;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
)(1000,'https://example.test/push',asRecord);
await silentSend('qa-token',a,'available_jobs',async(_url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({data:{status:'ok'}})};},before);
assert.equal(payload._contentAvailable,true);assert.equal(payload.data.dismiss_before,before);
assert.equal(payload.title,undefined);assert.equal(payload.body,undefined);assert.equal(payload.sound,undefined);assert.equal(payload.badge,undefined,'quiet cleanup never overwrites the badge in transit');
console.log('Server proof: exact recipient, terminal/losing offer only, winner/open/error preservation and quiet payload passed');

let linkRow={id:linkId(1),expires_at:'2099-01-01',revoked_at:null,safe_link_context:{}};
const linkClient={from(table){assert.equal(table,'driver_job_links');const filters={};return {
 select(){return this},eq(k,v){filters[k]=v;return this},async maybeSingle(){assert.equal(filters.id,linkId(1));assert.equal(filters.driver_id,7);return {data:linkRow,error:null};}
}}};
const silentLink=new Function('safePositiveInteger','safeUuid','resolveProviderConfig','asRecord','driverHasActiveOnePhoneAccount','opaqueDriverJobLinkKey','sendPayloadToDriverSubscriptions','alertResult','driverDevicePushNotificationVersion',
 ts.transpileModule(extractPush('sendDriverDeviceSilentRefreshForJobLink')+';return sendDriverDeviceSilentRefreshForJobLink;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
)(v=>Number(v),v=>v,()=>({}),asRecord,async()=>true,()=>a,async(...args)=>{captured=args;return {};},()=>({}),1);
await silentLink(linkClient,7,linkId(1),{env:{}});assert.equal(captured[11],undefined,'active unclosed link is refresh-only');
linkRow.safe_link_context={job_card_revision:'new',ack_alert_closed_revision:'old',ack_alert_closed_at:new Date(before).toISOString()};
await silentLink(linkClient,7,linkId(1),{env:{}});assert.equal(captured[11],undefined,'prior Close cannot clear a new revision');
linkRow.safe_link_context.ack_alert_closed_revision='new';
await silentLink(linkClient,7,linkId(1),{env:{}});assert.equal(captured[11],before);
linkRow.safe_link_context={ack_alert_closed_at:new Date(before).toISOString()};
await silentLink(linkClient,7,linkId(1),{env:{}});assert.equal(captured[11],undefined,'missing revision evidence cannot authorize cleanup');
linkRow.expires_at=new Date(before).toISOString();
await silentLink(linkClient,7,linkId(1),{env:{}});assert.equal(captured[11],before,'expiry cutoff is lifecycle time, not the later send time');
console.log('Private-link cleanup: exact driver/link, lifecycle cutoff, matching Close and newer/missing revision protection passed');

// Run the actual task registration and callback. No other task, navigation or permission is touched.
let taskCallback, registered, taskRuns=0;
const taskCode=taskSource.replace(/^import .*;\n/gm,'').replace('registerRootComponent(App);','');
new Function('Notifications','TaskManager','applyNativeNoticeCleanup','nativeNoticeTaskData',ts.transpileModule(taskCode,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(
 {registerTaskAsync:async name=>{registered=name;}},
 {defineTask(name,callback){assert.equal(name,'prestige-driver-notice-cleanup-v1');taskCallback=callback;}},
 async data=>{taskRuns++;assert.deepEqual(data,instruction);},lifecycle.nativeNoticeTaskData);
assert.equal(registered,'prestige-driver-notice-cleanup-v1');
await taskCallback({data:{data:{dataString:JSON.stringify(instruction)}}});assert.equal(taskRuns,1);
await taskCallback({error:Error('OS task failure'),data:{}});assert.equal(taskRuns,1);

// New sends remain independent of unread counts, failed badge reservations and cleanup.
const dispatch=new Function('loadActiveDriverSubscriptions','reserveNativePushBadgeCount','releaseNativePushBadgeCount','alertResult',
 ts.transpileModule(extractPush('sendPayloadToDriverSubscriptions')+';return sendPayloadToDriverSubscriptions;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
)(async()=>({ok:true,subscriptions:[{channel:'native_ios',endpoint:'qa-token'}]}),async()=>null,async()=>{},(reason,details)=>({reason,...details}));
let sentCount=0;
await dispatch({},7,{job_key:a},{},{badgeClient:{},nativePushSender:async()=>{sentCount++;},nativeSilentPushSender:async()=>{throw Error('should not run');}},'available_jobs','Job update available',a);
assert.equal(sentCount,1,'failed badge allocation cannot block a visible push');
console.log('Actual background callback and new visible sender independence passed');

const retiredInstruction={...instruction,dismiss_retired_offer:true};
await lifecycle.applyNativeNoticeCleanup(retiredInstruction,api);
presented.push(notice('late-pool-send',a,Date.now()));
await lifecycle.applyNativeNoticeCleanup(null,api);
assert.ok(!presented.some(n=>n.request.identifier==='late-pool-send'),'immutable retired offer is removed even if original sender was delayed until after cancellation');
assert.ok(presented.some(n=>n.request.identifier==='new-job'),'other offers remain');
assert.ok(presented.some(n=>n.request.identifier==='cancel-warning'),'separate cancellation warning remains');
await lifecycle.applyNativeNoticeCleanup(instruction,api);
assert.equal(storage.get('prestige-driver-notice-cleanup-v1.'+a),'retired_offer','out-of-order cutoff cannot resurrect a terminal offer');
offerState='assigned';bidState='accepted';readError=false;
await silentPool(proofClient,{driver_id:7,offer_key:a},{env:{}});assert.equal(captured[12],false,'winner never receives terminal marker');
bidState='expired';await silentPool(proofClient,{driver_id:7,offer_key:a},{env:{}});assert.equal(captured[12],true);
await silentLink(linkClient,7,linkId(1),{env:{}});assert.equal(captured[12],undefined,'reissuable private link never receives terminal marker');
console.log('Late pool sends cannot revive retired offers; winner, private reissue and cancellation warning remain protected');
