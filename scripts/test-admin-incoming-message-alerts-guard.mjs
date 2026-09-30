import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const page = readFileSync('app/page.tsx', 'utf8');
const persistence = readFileSync('lib/customer-driver-app-notification-persistence.ts', 'utf8');
assert.ok(persistence.includes('admin_incoming_messages'), 'Existing Admin message read must support incoming alerts');
assert.ok(page.includes('admin_incoming_job_message'), 'Existing Admin alerts must display saved incoming messages');
console.log('Admin incoming-message alert wiring present');

const compile = (source) => ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const clean = value => String(value ?? '').trim();
// Execute the real scoped Admin reader; the unscoped history path stays unchanged.
const readStart = persistence.indexOf('export async function loadCustomerDriverAppNotifications(');
const readEnd = persistence.indexOf('export async function updateCustomerDriverAppNotificationStatus(', readStart);
const readCode = compile(persistence.slice(readStart, readEnd).replace('export ',''));
let calls, allowed = true, dbError = null;
const db = {from(table) {
  calls.push(['from',table]);
  const q = {};
  for (const name of ['select','or','order','range','is']) q[name] = (...args) => {calls.push([name,...args]);return q;};
  q.then = resolve => Promise.resolve({data:[{id:'row'}],count:1201,error:dbError}).then(resolve);
  return q;
}};
const serverRead = new Function('parseCustomerDriverAppNotificationLoadParams','getAdminNotificationClient','notificationTable','notificationSelect','safeAdapterFailure','safeNotificationLoadError','asArray','normalizeRecord','toAdminSafeRecord','buildCountedPagination','customerDriverAppNotificationPersistenceVersion','asRecord','safeText', readCode + '\nreturn loadCustomerDriverAppNotifications;')(
  input=>({page:Number(input.get('page')||1),limit:100}), ()=>allowed?{ok:true,data:db}:{ok:false,status:403},
  'customer_driver_app_notification_outbox','safe-columns',()=>({ok:false,status:500}),'Read failed',v=>v,v=>v,v=>v,
  (count,limit,page)=>({total_notification_count:count,page_count:Math.ceil(count/limit),has_next_page:page<Math.ceil(count/limit)}),'test',v=>v && typeof v==='object'?v:{},(v,n)=>typeof v==='string'&&v.length<=n?v:null,
);
calls=[];
let result=await serverRead(new URLSearchParams({scope:'admin_incoming_messages',page:'8'}),{});
assert.equal(result.data.pagination.total_notification_count,1201);
assert.deepEqual(calls.find(c=>c[0]==='range'),['range',700,799]);
assert.deepEqual(calls.filter(c=>c[0]==='order'),[['order','created_at',{ascending:false}],['order','id',{ascending:false}]]);
assert.deepEqual(calls.find(c=>c[0]==='is'),['is','admin_attention_done_at',null]);
const filter = calls.find(c=>c[0]==='or')[1];
assert.ok(filter.includes('safe_context->>direction.eq.driver_to_admin'));
assert.ok(filter.includes('safe_context->>direction.eq.customer_to_driver'));
assert.ok(!filter.includes('safe_context->>direction.eq.customer_to_admin'), 'Fixed acknowledgement lane remains separate');
assert.ok(!filter.includes('driver_to_customer'));
assert.ok(!calls.some(c=>c[0]==='limit'), 'Do not cap candidates before filtering/pagination');
allowed=false;calls=[];assert.equal((await serverRead(new URLSearchParams({scope:'admin_incoming_messages'}),{})).status,403);assert.deepEqual(calls,[]);
allowed=true;dbError={code:'unavailable'};calls=[];assert.equal((await serverRead(new URLSearchParams({scope:'admin_incoming_messages'}),{})).ok,false);

// Execute the actual existing alert loader, with two pages, mixed directions and an already-cleared exact ID.
const start=page.indexOf('async function loadAdminAppNotificationsRead()');
const end=page.indexOf('async function loadAdminEmailAiIntakeRead()',start);
const readRequests=[];const storage=new Map();const serverDone=new Set();let dismissError=false;
const sharedDismiss=async ids=>{if(dismissError)throw Error('offline');ids.forEach(id=>serverDone.add(id));return ids;};let failedMessages=false;let failPage=0;
const driver={id:'driver-a',booking_reference:'EXACT-A',safe_message:'Driver needs help',sender_driver_name:'Original Driver',sender_driver_plate:'OLD123',workflow_area:'admin_driver_job_messages',delivery_surface:'driver_app',safe_context:{direction:'driver_to_admin'}};
const customer={id:'customer-b',booking_reference:'EXACT-B',safe_message:'Customer asks about pickup',workflow_area:'customer_driver_quick_replies',delivery_surface:'driver_app',safe_context:{direction:'customer_to_driver'}};
const ack={id:'ack-b',booking_reference:'EXACT-B',safe_message:'Driver details acknowledged.',workflow_area:'customer_driver_details_acknowledgements',delivery_surface:'customer_app',safe_context:{direction:'customer_to_admin'}};
const original=JSON.stringify([driver,customer,ack]);
const ordinary={id:'ordinary-alert',safe_title:'Existing alert'};
const request=async (url,init)=>{
  assert.equal(init.method,'GET');assert.equal(init.headers['x-prestige-admin-purpose'],'admin-booking-persistence');
  const parsed=new URL(url,'https://local.test');readRequests.push(parsed);
  if(parsed.pathname==='/alerts')return Response.json({ok:true,notifications:[ordinary],pagination:{page_count:1,has_next_page:false}});
  assert.equal(parsed.searchParams.get('scope'),'admin_incoming_messages');
  assert.equal(parsed.searchParams.has('notification_status'),false,'Driver sent echoes are read, not queued');
  const n=Number(parsed.searchParams.get('page'));
  if(failedMessages || failPage===n) return Response.json({ok:false},{status:503});
  return Response.json({ok:true,notifications:(n===1?[driver,customer,
    {...driver,id:'outgoing',safe_context:{direction:'admin_to_driver'}},
    {...customer,id:'wrong-surface',delivery_surface:'customer_app'},
    {...driver,id:'missing-reference',booking_reference:null},
    {...driver,id:'cleared'},
  ]:[driver,ack]).filter(r=>!serverDone.has(r.id)),pagination:{has_next_page:n===1}});
};
storage.set('prestige.admin.incoming-message.done.cleared','1');
const load=new Function('fetch','clean','adminAppNotificationReadPageSize','adminAppNotificationReadMaxPages','adminAppNotificationsApiPath','adminCustomerDriverAppNotificationsApiPath','adminLegacyDataPurpose','adminMonthlyBillingGroupingCount','window','dismissAdminIncomingMessageAlerts',compile(page.slice(start,end))+'\nreturn loadAdminAppNotificationsRead;')(
  request,clean,100,1000,'/alerts','/messages','admin-booking-persistence',v=>Number(v)||0,{localStorage:{getItem:key=>storage.get(key),removeItem:key=>storage.delete(key)}},sharedDismiss,
);
dismissError=true;result=await load();assert.ok(result.notifications.some(n=>n.id==='message:driver-a'));assert.ok(result.notifications.some(n=>n.id==='message:customer-b'));assert.ok(result.incomingMessageError,'Old marker migration failure must never hide new incoming alerts');dismissError=false;
result=await load();
assert.deepEqual(result.notifications.map(n=>n.id),['ordinary-alert','message:driver-a','message:customer-b']);
assert.deepEqual(result.notifications.slice(1).map(n=>n.safe_title),['Driver → Admin','Customer → Driver']);
assert.equal(JSON.stringify([driver,customer,ack]),original);
assert.equal(result.incomingMessageError,'');
assert.equal(result.notifications[1].safe_context.sender_label,'Original Driver · OLD123');
assert.equal(result.notifications[2].safe_context.sender_label,'');
failPage=2;result=await load();assert.deepEqual(result.notifications,[ordinary],'Partial message pages must fail visibly without hiding the existing alerts');assert.ok(result.incomingMessageError);
failPage=0;failedMessages=true;result=await load();assert.deepEqual(result.notifications,[ordinary]);assert.ok(result.incomingMessageError);

// Execute Done using shared server attention, then read from another device with no local markers.
const actionStart=page.indexOf('  const handleAdminAppNotificationStatusUpdate = async (');
const actionEnd=page.indexOf('\n  async function ',actionStart);
let state={notifications:[{id:'message:driver-a',workflow_area:'admin_incoming_job_message',safe_context:{incoming_message_id:'driver-a'}},{id:'message:customer-b',workflow_area:'admin_incoming_job_message',safe_context:{incoming_message_id:'customer-b'}}]};
let writeAttempts=0;let revision=0;
const done=new Function('clean','adminAppNotificationReadState','setAdminAppNotificationReadState','dismissAdminIncomingMessageAlerts','updateAdminAppNotificationStatus','setAdminAppNotificationAction','setAdminAppNotificationReadRevision',compile(page.slice(actionStart,actionEnd))+'\nreturn handleAdminAppNotificationStatusUpdate;')(
 clean,state,fn=>state=fn(state),sharedDismiss,()=>{writeAttempts++;throw Error('Must not write source status');},()=>{},fn=>revision=fn(revision),
);
await done('message:unknown','read');assert.equal(state.notifications.length,2);
await done('message:driver-a','read');assert.equal(state.notifications.length,1);assert.ok(serverDone.has('driver-a'));assert.equal(writeAttempts,0);assert.equal(revision,1);
dismissError=true;await done('message:customer-b','read');assert.equal(state.notifications.length,1);assert.equal(state.message.tone,'error');dismissError=false;
failedMessages=false;storage.clear();result=await load();assert.ok(!result.notifications.some(n=>n.id==='message:driver-a'),'Another device with no local marker sees server Done');assert.ok(result.notifications.some(n=>n.id==='message:customer-b'));
assert.equal(JSON.stringify([driver,customer,ack]),original);
assert.ok(page.includes('data-admin-incoming-message-open={notificationId}'));
assert.ok(page.includes('candidate.dataset.adminMultiDriverActiveJob === notificationId'));
assert.ok(page.includes('updateAdminTodayJobMessageAudience(reference, notification.safe_context?.direction === "driver_to_admin" ? "driver" : "customer")'));
console.log('Incoming alerts passed: paginated read-only projection, exact directions, no duplicates, isolated read failure, shared Done, independent-device refresh, legacy marker migration, failed-write preservation and exact-job reply wiring.');

// Message-only display: the database remains UTC and unrelated alerts retain their format.
const timeStart=page.indexOf('function adminAppNotificationTimeLabel(');
const timeEnd=page.indexOf('function adminAppNotificationContextValue(',timeStart);
const ast=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const formatterNames=new Set(['formatBookingTimestampSgt','singaporePickupDateTimePartsFromTimestamp','formatDate','formatPickupTime']);
const formatters=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&formatterNames.has(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const timeLabel=new Function('clean',compile(formatters+'\n'+page.slice(timeStart,timeEnd))+'\nreturn adminAppNotificationTimeLabel;')(clean);
assert.match(timeLabel('2026-09-29T09:25:50.909Z',true),/29 Sept? 2026, 1725hrs SGT/);
assert.match(timeLabel('2026-09-29T17:25:50+08:00',true),/29 Sept? 2026, 1725hrs SGT/);
assert.match(timeLabel('2026-09-30T18:05:00Z',true),/01 Oct 2026, 0205hrs SGT/);
assert.equal(timeLabel('2026-09-29T09:25:50.909Z'),'2026-09-29 09:25 UTC');
assert.equal(timeLabel(null,true),'Created time not recorded');
assert.equal(timeLabel('bad timestamp',true),'bad timestamp');
assert.ok(page.includes('adminAppNotificationTimeLabel(notification.created_at, notification.workflow_area === "admin_incoming_job_message")'));
assert.ok(page.includes('record.sender_driver_name') && page.includes('record.sender_driver_plate'));
console.log('Message-only Singapore display and sender projection passed.');

// Execute the actual scoped server reader with exact historical links, not current assignments.
const linkId='11111111-1111-4111-8111-111111111111';
const notification={id:'reply',driver_job_link_id:linkId,booking_reference:'EXACT-A',actor_role:'driver',source_surface:'driver_api',workflow_area:'admin_driver_job_messages',delivery_surface:'driver_app',safe_context:{direction:'driver_to_admin'},created_at:'2026-09-29T09:25:50Z'};
const oldLink={id:linkId,booking_reference:'EXACT-A',driver_id:15,sender_name:'Original Driver',sender_plate:'OLD123',acknowledged_at:'2026-09-28T07:45:00Z'};
let linkRows=[oldLink],linkFailure=false,linkThrow=false,sourceRows=[notification];
const senderReads=[];
const senderClient={from(table){
  assert.ok(['customer_driver_app_notification_outbox','driver_job_links'].includes(table),'Never use current booking or driver profile as sender');
  senderReads.push(table);
  const q={};for(const op of ['select','is','or','order','range','in'])q[op]=(...args)=>{
    if(table==='driver_job_links'&&op==='select'){assert.ok(!args[0].includes('ciphertext'));assert.ok(!args[0].includes('token'));assert.ok(!args[0].includes('contact'));assert.ok(args[0].includes('sender_name:'));}
    if(op==='in')assert.deepEqual(args,['id',[linkId]]);
    return q;
  };
  q.then=(resolve,reject)=>{if(table==='driver_job_links'&&linkThrow)return Promise.reject(Error('transport')).then(resolve,reject);
    return Promise.resolve({data:table==='driver_job_links'?linkRows:sourceRows,error:table==='driver_job_links'&&linkFailure?{}:null,count:sourceRows.length}).then(resolve,reject);};return q;
}};
const readSenders=new Function('parseCustomerDriverAppNotificationLoadParams','getAdminNotificationClient','notificationTable','notificationSelect','safeAdapterFailure','safeNotificationLoadError','asArray','normalizeRecord','toAdminSafeRecord','buildCountedPagination','customerDriverAppNotificationPersistenceVersion','asRecord','safeText',readCode+'\nreturn loadCustomerDriverAppNotifications;')(
 ()=>({page:1,limit:100}),()=>({ok:true,data:senderClient}),'customer_driver_app_notification_outbox','safe-columns',()=>({ok:false}), 'unavailable',v=>v,v=>v,
 r=>({id:r.id,booking_reference:r.booking_reference,safe_context:r.safe_context}),()=>({}),'test',v=>v&&typeof v==='object'?v:{},(v,n)=>typeof v==='string'&&v.length<=n?v.trim():null);
const incomingParams=new URLSearchParams({scope:'admin_incoming_messages'});
const getSender=async()=> (await readSenders(incomingParams,{})).data.notifications[0];
let sender=await getSender();assert.equal(sender.sender_driver_name,'Original Driver');assert.equal(sender.sender_driver_plate,'OLD123');
assert.deepEqual(Object.keys(sender).sort(),['id','booking_reference','safe_context','sender_driver_name','sender_driver_plate','reply_driver_job_link_id','sender_driver_id'].sort(),'Only bounded Admin reply identity added; no token or raw context returned');
assert.equal(sender.reply_driver_job_link_id,linkId);assert.equal(sender.sender_driver_id,15);
for(const rows of [[],[oldLink,oldLink],[{...oldLink,booking_reference:'OTHER'}],[{...oldLink,driver_id:null}],[{...oldLink,acknowledged_at:null}],[{...oldLink,acknowledged_at:'2026-09-30T00:00:00Z'}],[{...oldLink,sender_name:' '}],[{...oldLink,sender_plate:'X'.repeat(81)}]]) {linkRows=rows;sender=await getSender();assert.equal(sender.sender_driver_name,null);assert.equal(sender.sender_driver_plate,null);}
linkRows=[oldLink];linkFailure=true;assert.equal((await getSender()).sender_driver_name,null);linkFailure=false;linkThrow=true;assert.equal((await getSender()).sender_driver_name,null);linkThrow=false;
sourceRows=[{...notification,created_at:'invalid'}];assert.equal((await getSender()).sender_driver_name,null);
for(const override of [{actor_role:'customer'},{source_surface:'admin_api'},{workflow_area:'customer_driver_quick_replies'},{delivery_surface:'customer_app'},{safe_context:{direction:'customer_to_driver'}}]) {sourceRows=[{...notification,...override}];senderReads.length=0;await getSender();assert.ok(!senderReads.includes('driver_job_links'));}
sourceRows=[notification,{...notification,id:'second'}];senderReads.length=0;await getSender();assert.equal(senderReads.filter(t=>t==='driver_job_links').length,1,'Batch unique links per bounded page');
assert.equal(JSON.stringify(notification),JSON.stringify(sourceRows[0]),'Read must not rewrite history');
console.log('Exact-link sender isolation, reassignment safety, failed/missing/ambiguous evidence, bounded read and private-field exclusion passed.');

// Upcoming replies reuse the one composer without broadening active-job/map eligibility.
const replyStart=page.indexOf('  const adminIncomingReplyNotification =');
const replyEnd=page.indexOf('  const liveDispatchMapEligibleBookings =',replyStart);
assert.ok(replyStart>0 && replyEnd>replyStart);
const selectReply=new Function('adminAppNotificationReadState','adminIncomingReplyNotificationId','cleanReferenceText','operationalBookings','getActiveJobBookingReference','bookingRecordIsDispatchActiveJobsMonitorEligible','bookingRecordIsCompletedStatus','bookingRecordIsCancelledStatus','bookingRecordPickupDateTimeMs','currentTimeMs','bookingRecordIsInsideActiveJobMonitorWindow','bookingRecordStatusValues',compile(page.slice(replyStart,replyEnd))+';return adminIncomingReplyBooking;');
const now=Date.now();
const upcoming={booking_reference:'UPCOMING',pickup:now+18*3600000,driver_id:7};
const notice={id:'message:future',booking_reference:'UPCOMING',workflow_area:'admin_incoming_job_message',safe_context:{direction:'driver_to_admin',driver_job_link_id:'link-future',sender_driver_id:7}};
const choose=(jobs=[upcoming],alert=notice)=>selectReply({notifications:[alert]},'message:future',clean,jobs,b=>b.booking_reference,b=>Boolean(b.driver_id),b=>b.status==='completed',b=>['cancelled','archived','declined'].includes(b.status),b=>b.pickup,now,b=>now>=b.pickup-3600000&&now<=b.pickup+86400000,b=>[b.status]);
assert.equal(choose(),upcoming);
for(const jobs of [[],[upcoming,upcoming],[{...upcoming,driver_id:null}],[{...upcoming,driver_id:8}],[{...upcoming,status:"archived"}],[{...upcoming,status:"declined"}],[{...upcoming,status:'completed'}],[{...upcoming,status:'cancelled'}],[{...upcoming,pickup:now+1800000}],[{...upcoming,pickup:now-3600000}]]) assert.equal(choose(jobs),null);
assert.equal(choose([upcoming],{...notice,safe_context:{direction:'customer_to_driver'}}),null,'Upcoming Customer reply scope remains unchanged');
assert.equal(choose([upcoming],{...notice,safe_context:{direction:'driver_to_admin'}}),null,'Missing exact sender link fails closed');
assert.equal((page.match(/data-admin-active-job-driver-message-input="true"/g)||[]).length,1);
assert.ok(page.includes('renderAdminJobMessages(activeJobBooking, activeJobDriverMessagingClosed)'));
assert.ok(page.includes('.filter((bookingRecord) => bookingRecordIsInsideActiveJobMonitorWindow(bookingRecord, currentTimeMs))'));

// Execute the actual established sender with the optional upcoming-reply boundary.
const sendStart=page.indexOf('  async function sendAdminTodayJobMessage(');
const sendEnd=page.indexOf('  function renderAdminJobMessages(',sendStart);
let sendState, posts, link, reports, candidate;
const send=new Function('cleanReferenceText','clean','adminTodayJobDriverMessageStates','setAdminTodayJobDriverMessageStates','fetch','adminDriverJobLinksApiPath','adminLegacyDataPurpose','adminCustomerDriverAppNotificationsApiPath','adminIncomingReplyBooking','adminIncomingReplyReference','loadAdminDriverJobStatusRead','adminDriverJobStatusTimeLabel','refreshAdminTodayJobMessageHistory',compile(page.slice(sendStart,sendEnd))+';return sendAdminTodayJobMessage;');
async function tryReply(overrides={}) {
 sendState={UPCOMING:{audience:'driver',draft:'Please meet at the main lobby.',status:'idle'}};posts=[];
 link={id:'link-future',booking_reference:'UPCOMING',link_status:'active',revoked_at:null,expires_at:new Date(now+86400000).toISOString(),safe_summary:{acknowledged:true},...overrides.link};
 reports=overrides.reports||{statuses:[]};candidate=overrides.noBooking?null:upcoming;
 const action=send(clean,clean,sendState,fn=>sendState=fn(sendState),async(url,init)=>{
  if(init.method==='GET')return Response.json({ok:true,links:[link]});
  posts.push(JSON.parse(init.body));return Response.json({ok:true,notification:{delivery_surface:'driver_app',booking_reference:'UPCOMING'}});
 },'/links','admin-booking-persistence','/messages',candidate,'UPCOMING',async()=>{if(overrides.readFailed)throw Error('Report read unavailable');return reports;},()=> '1200hrs SGT',()=>{});
 await action('UPCOMING','link-future');return posts;
}
assert.equal((await tryReply()).length,1);
assert.equal(posts[0].driver_job_link_id,'link-future');assert.equal(posts[0].booking_reference,'UPCOMING');
assert.equal(posts[0].delivery_surface,'driver_app');assert.equal(posts[0].workflow_area,'admin_driver_job_messages');
for(const input of [{link:{id:'replacement-link'}},{link:{booking_reference:'OTHER'}},{link:{link_status:'revoked'}},{link:{revoked_at:new Date().toISOString()}},{link:{expires_at:'bad'}},{link:{expires_at:new Date(now-1).toISOString()}},{link:{safe_summary:{acknowledged:false}}},{reports:{statuses:[{status_value:'completed'}]}},{readFailed:true},{noBooking:true}]) {
 assert.equal((await tryReply(input)).length,0,JSON.stringify(input));assert.equal(sendState.UPCOMING.status,'error');
}
console.log('Upcoming reply passed: exact unique booking, one reused composer, unchanged active window, current acknowledged link, expiry/replacement/JC/read-failure protection, same private sender.');

const safeProjection=persistence.slice(persistence.indexOf('function toSafeRecord('),persistence.indexOf('function toAdminSafeRecord('));
assert.ok(!safeProjection.includes('reply_driver_job_link_id') && !safeProjection.includes('sender_driver_id'), 'Public projections never gain Admin reply identity');
linkRows=[];sourceRows=[notification];sender=await getSender();assert.equal(sender.reply_driver_job_link_id,null);assert.equal(sender.sender_driver_id,null);
