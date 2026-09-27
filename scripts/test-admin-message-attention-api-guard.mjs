import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const compile=(file,imports={})=>{const out={};new Function('require','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(name=>{if(name in imports)return imports[name];if(name==='node:crypto')return require(name);throw Error('Unexpected '+name);},out);return out;};
const source=readFileSync('lib/customer-driver-app-notification-persistence.ts','utf8');
const start=source.indexOf('export async function dismissAdminIncomingMessages('),end=source.indexOf('export async function loadCustomerDriverAppNotifications(',start);
const js=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const id='11111111-1111-4111-8111-111111111111';let calls=[],dbFail=false;
const db={from(table){assert.equal(table,'customer_driver_app_notification_outbox');calls.push(table);const q={update(p){assert.deepEqual(Object.keys(p),['admin_attention_done_at']);calls.push(p);return q;},in(k,v){assert.equal(k,'id');assert.deepEqual(v,[id]);return q;},or(f){assert.ok(f.includes('driver_to_admin')&&f.includes('customer_to_driver'));return q;},select(cols){assert.equal(cols,'id');return Promise.resolve({data:[{id}],error:dbFail?{}:null});}};return q;},rpc:async name=>{calls.push(name);assert.equal(name,'cleanup_job_message_retention');return {data:{deleted:2,batch_full:false},error:dbFail?{}:null};}};
const out={};new Function('exports','asRecord','uuidPattern','getAdminNotificationClient','notificationTable','safeAdapterFailure','asArray','configValueOrNull','createClient',js)(out,x=>x||{},/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,()=>({ok:true,data:db}),'customer_driver_app_notification_outbox',()=>({ok:false,status:500}),x=>x,x=>x,()=>db);
const body={action:'dismiss_admin_messages',message_ids:[id]};
assert.deepEqual((await out.dismissAdminIncomingMessages(body,{actor_role:'admin'})).data.message_ids,[id]);
for(const bad of [{...body,message_ids:[]},{...body,message_ids:[id,id]},{...body,message_ids:['wrong']},{...body,notification_status:'read'}]){calls=[];assert.equal((await out.dismissAdminIncomingMessages(bad,{actor_role:'admin'})).status,400);assert.equal(calls.length,0);}
assert.equal((await out.dismissAdminIncomingMessages(body,{actor_role:'driver'})).status,403);
dbFail=true;assert.equal((await out.dismissAdminIncomingMessages(body,{actor_role:'admin'})).ok,false);dbFail=false;
const env={...process.env};try{
 process.env.PRESTIGE_ADMIN_ACCOUNT_AUTH_ENABLED='true';process.env.PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET='qa-message-attention-session-secret-long-enough';
 const boundary=compile('lib/admin-dispatcher-auth-boundary.ts');
 const cookie=boundary.issueAdminAccountSession({accountId:id,authUserId:id,actorLabel:'QA',role:'admin'});
 const route=compile('app/api/admin-customer-driver-app-notifications/route.ts',{'../../../lib/admin-booking-supabase-adapter':{adminDispatcherBoundaryToPersistenceAdapterActor:()=>({actor_role:'admin'})},'../../../lib/admin-dispatcher-auth-boundary':boundary,'../../../lib/customer-driver-app-notification-persistence':out});
 const req=(headers={})=>new Request('https://local.invalid/api/admin-customer-driver-app-notifications',{method:'POST',headers:{'content-type':'application/json','x-prestige-admin-purpose':'admin-booking-persistence',origin:'https://local.invalid',referer:'https://local.invalid/',cookie,...headers},body:JSON.stringify(body)});
 assert.equal((await route.POST(req())).status,200);
 for(const headers of [{cookie:''},{origin:'https://foreign.invalid'},{referer:'https://foreign.invalid/'},{referer:'https://local.invalid/my-bookings'},{'x-prestige-admin-purpose':'wrong'}]){calls=[];assert.equal((await route.POST(req(headers))).status,403);assert.equal(calls.length,0);}
 const cron=compile('app/api/cron/job-message-retention/route.ts',{'../../../../lib/customer-driver-app-notification-persistence':out});process.env.CRON_SECRET='synthetic-cron';
 calls=[];assert.equal((await cron.GET(new Request('https://local.invalid/api/cron/job-message-retention'))).status,401);assert.equal(calls.length,0);
 const cr=url=>new Request(url,{headers:{authorization:'Bearer synthetic-cron'}});
 assert.equal((await cron.GET(cr('https://local.invalid/api/cron/job-message-retention?date=2000'))).status,400);
 delete process.env.PRESTIGE_JOB_MESSAGE_RETENTION_ENABLED;calls=[];assert.equal((await (await cron.GET(cr('https://local.invalid/api/cron/job-message-retention'))).json()).enabled,false);assert.equal(calls.length,0);
 process.env.PRESTIGE_JOB_MESSAGE_RETENTION_ENABLED='true';process.env.SUPABASE_URL='https://synthetic.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
 assert.equal((await (await cron.GET(cr('https://local.invalid/api/cron/job-message-retention'))).json()).deleted,2);
 dbFail=true;assert.equal((await cron.GET(cr('https://local.invalid/api/cron/job-message-retention'))).status,503);
}finally{for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);}
console.log('API passed: Admin-only exact-ID metadata update, malformed/cross-origin/customer rejection, private cron, default-off, bounded RPC, failure reporting; no source-status or history mutation.');
