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
  for (const name of ['select','or','order','range']) q[name] = (...args) => {calls.push([name,...args]);return q;};
  q.then = resolve => Promise.resolve({data:[{id:'row'}],count:1201,error:dbError}).then(resolve);
  return q;
}};
const serverRead = new Function('parseCustomerDriverAppNotificationLoadParams','getAdminNotificationClient','notificationTable','notificationSelect','safeAdapterFailure','safeNotificationLoadError','asArray','normalizeRecord','toAdminSafeRecord','buildCountedPagination','customerDriverAppNotificationPersistenceVersion', readCode + '\nreturn loadCustomerDriverAppNotifications;')(
  input=>({page:Number(input.get('page')||1),limit:100}), ()=>allowed?{ok:true,data:db}:{ok:false,status:403},
  'customer_driver_app_notification_outbox','safe-columns',()=>({ok:false,status:500}),'Read failed',v=>v,v=>v,v=>v,
  (count,limit,page)=>({total_notification_count:count,page_count:Math.ceil(count/limit),has_next_page:page<Math.ceil(count/limit)}),'test',
);
calls=[];
let result=await serverRead(new URLSearchParams({scope:'admin_incoming_messages',page:'8'}),{});
assert.equal(result.data.pagination.total_notification_count,1201);
assert.deepEqual(calls.find(c=>c[0]==='range'),['range',700,799]);
assert.deepEqual(calls.filter(c=>c[0]==='order'),[['order','created_at',{ascending:false}],['order','id',{ascending:false}]]);
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
const readRequests=[];const storage=new Map();let failedMessages=false;let failPage=0;
const driver={id:'driver-a',booking_reference:'EXACT-A',safe_message:'Driver needs help',workflow_area:'admin_driver_job_messages',delivery_surface:'driver_app',safe_context:{direction:'driver_to_admin'}};
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
  return Response.json({ok:true,notifications:n===1?[driver,customer,
    {...driver,id:'outgoing',safe_context:{direction:'admin_to_driver'}},
    {...customer,id:'wrong-surface',delivery_surface:'customer_app'},
    {...driver,id:'missing-reference',booking_reference:null},
    {...driver,id:'cleared'},
  ]:[driver,ack],pagination:{has_next_page:n===1}});
};
storage.set('prestige.admin.incoming-message.done.cleared','1');
const load=new Function('fetch','clean','adminAppNotificationReadPageSize','adminAppNotificationReadMaxPages','adminAppNotificationsApiPath','adminCustomerDriverAppNotificationsApiPath','adminLegacyDataPurpose','adminMonthlyBillingGroupingCount','window',compile(page.slice(start,end))+'\nreturn loadAdminAppNotificationsRead;')(
  request,clean,100,1000,'/alerts','/messages','admin-booking-persistence',v=>Number(v)||0,{localStorage:{getItem:key=>storage.get(key)}},
);
result=await load();
assert.deepEqual(result.notifications.map(n=>n.id),['ordinary-alert','message:driver-a','message:customer-b']);
assert.deepEqual(result.notifications.slice(1).map(n=>n.safe_title),['Driver → Admin','Customer → Driver']);
assert.equal(JSON.stringify([driver,customer,ack]),original);
assert.equal(result.incomingMessageError,'');
failPage=2;result=await load();assert.deepEqual(result.notifications,[ordinary],'Partial message pages must fail visibly without hiding the existing alerts');assert.ok(result.incomingMessageError);
failPage=0;failedMessages=true;result=await load();assert.deepEqual(result.notifications,[ordinary]);assert.ok(result.incomingMessageError);

// Execute Done. No API write; source history and any other message are retained.
const actionStart=page.indexOf('  const handleAdminAppNotificationStatusUpdate = async (');
const actionEnd=page.indexOf('\n  async function ',actionStart);
let state={notifications:[{id:'message:driver-a',workflow_area:'admin_incoming_job_message',safe_context:{incoming_message_id:'driver-a'}},{id:'message:customer-b',workflow_area:'admin_incoming_job_message',safe_context:{incoming_message_id:'customer-b'}}]};
let blockedStorage=false;let writeAttempts=0;
const done=new Function('clean','adminAppNotificationReadState','setAdminAppNotificationReadState','window','updateAdminAppNotificationStatus',compile(page.slice(actionStart,actionEnd))+'\nreturn handleAdminAppNotificationStatusUpdate;')(
  clean,state,fn=>state=fn(state),{localStorage:{setItem:(key,v)=>{if(blockedStorage)throw Error('Storage unavailable');storage.set(key,v);}}},()=>{writeAttempts++;throw Error('Must not write source status');},
);
await done('message:unknown','read');assert.equal(state.notifications.length,2);
await done('message:driver-a','read');assert.equal(state.notifications.length,1);assert.equal(storage.get('prestige.admin.incoming-message.done.driver-a'),'1');assert.equal(writeAttempts,0);
blockedStorage=true;await done('message:customer-b','read');assert.equal(state.notifications.length,1);assert.equal(state.message.tone,'error');
failedMessages=false;result=await load();assert.ok(!result.notifications.some(n=>n.id==='message:driver-a'),'Exact dismissal survives refresh');assert.ok(result.notifications.some(n=>n.id==='message:customer-b'));
assert.equal(JSON.stringify([driver,customer,ack]),original);
assert.ok(page.includes('data-admin-incoming-message-open={notificationId}'));
assert.ok(page.includes('candidate.dataset.adminMultiDriverActiveJob === notificationId'));
assert.ok(page.includes('updateAdminTodayJobMessageAudience(reference, notification.safe_context?.direction === "driver_to_admin" ? "driver" : "customer")'));
console.log('Incoming alerts passed: paginated read-only projection, exact directions, no duplicates, isolated read failure, browser-only Done, reload preservation and exact-job reply wiring.');
