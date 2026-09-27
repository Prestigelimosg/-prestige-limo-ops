import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load=(file,imports={},globals={})=>{
 const m={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',...Object.keys(globals),js)(n=>{assert.ok(n in imports,'Unexpected import '+n);return imports[n];},m,m.exports,...Object.values(globals));return m.exports;
};
const now=Date.now();
const claims={accountId:'00000000-0000-4000-8000-000000000001',deviceIdHash:'a'.repeat(64),driverId:1,issuedAt:now-10000,expiresAt:now+86400000};
let data=[],error=null,calls=[];
const client={rpc(name,args){calls.push({name,args});return {abortSignal:()=>Promise.resolve({data,error})};}};
const activity=load('lib/driver-account-activity.ts',{'server-only':{}});
data=[{driver_id:1,state:'online',last_active_at:new Date(now-5000).toISOString(),device_id_hash:'PRIVATE'}];
assert.deepEqual(await activity.loadDriverPoolActivity(client,[1],now),[{driver_id:1,state:'online',label:'Online'}]);
data[0].last_active_at=new Date(now-180000).toISOString();
assert.equal((await activity.loadDriverPoolActivity(client,[1],now))[0].label,'Last active 3 min ago');
data[0].state='signed_out'; assert.equal((await activity.loadDriverPoolActivity(client,[1],now))[0].label,'Signed out');
data[0].state='unknown'; assert.equal((await activity.loadDriverPoolActivity(client,[1],now))[0].label,'Unknown');
error={message:'SECRET'}; assert.equal((await activity.loadDriverPoolActivity(client,[1],now))[0].state,'unknown');error=null;
data=[{driver_id:2,state:'online',last_active_at:new Date(now).toISOString()}];assert.equal((await activity.loadDriverPoolActivity(client,[1],now))[0].state,'unknown');
data=Array.from({length:200},(_,i)=>({driver_id:i+1,state:'online',last_active_at:new Date(now).toISOString()}));
assert.equal((await activity.loadDriverPoolActivity(client,data.map(r=>r.driver_id),now)).length,200);
calls=[]; await activity.loadDriverPoolActivity(client,Array.from({length:201},(_,i)=>i+1));assert.equal(calls.length,0);
data=true;assert.equal(await activity.recordDriverAccountActivity(client,claims,'active'),true);
assert.equal(calls.at(-1).args.p_account_id,claims.accountId);
calls=[];assert.equal(await activity.recordDriverAccountActivity(client,{driverId:1,issuedAt:now,expiresAt:now+10000},'active'),false);assert.equal(calls.length,0);
const broken={rpc(){throw Error('offline');}};assert.equal(await activity.recordDriverAccountActivity(broken,claims,'active'),false);
assert.equal((await activity.loadDriverPoolActivity(broken,[1]))[0].state,'unknown');

let session={ok:true,claims},verified=true,recorded=[],databaseOK=true;
const route=load('app/api/driver-auth/session/route.ts',{
 '../../../../lib/driver-account-device-lock.ts':{verifyDriverAccountSession:async input=>verified&&input.installationId==='installation'&&input.accountId===claims.accountId},
 '../../../../lib/driver-account-activity':{recordDriverAccountActivity:async(_c,c,event)=>{recorded.push({c,event});return true;}},
 '../../../../lib/driver-job-status-persistence':{getDriverJobStatusPersistenceClientForProduction:()=>({ok:databaseOK,client})},
 '../../../../lib/driver-portal-session.ts':{resolveDriverPortalSession:()=>session,clearDriverPortalSessionCookie:()=> 'session=; Max-Age=0'},
});
const request=({path='/driver-portal',purpose='driver-account-activity',origin='https://synthetic.invalid',method='PATCH',body,query='',installation='installation'}={})=>new Request('https://synthetic.invalid/api/driver-auth/session'+query,{method,headers:{origin,referer:origin+path,'x-prestige-driver-purpose':purpose,'x-prestige-driver-installation-id':installation},body});
for(const path of ['/driver-portal','/driver-job/private-token']){assert.equal((await route.PATCH(request({path}))).status,200);}
assert.equal(recorded.length,2);
for(const bad of [{origin:'https://evil.invalid'},{path:'/customers'},{path:'/driver-job/token/report'},{purpose:'other'},{body:'{"driver_id":1}'},{query:'?driver_id=1'},{installation:'other'}]) assert.ok([401,403].includes((await route.PATCH(request(bad))).status));
session={ok:true,claims:{driverId:1,issuedAt:now,expiresAt:now+1000}};assert.equal((await route.PATCH(request())).status,401,'Token-only session is never account presence');
session={ok:false};assert.equal((await route.PATCH(request())).status,401);
session={ok:true,claims};verified=false;assert.equal((await route.PATCH(request())).status,401);verified=true;
assert.equal(recorded.length,2,'Denied requests never write');
databaseOK=false;assert.equal((await route.PATCH(request())).status,503);
let logout=await route.DELETE(request({method:'DELETE',purpose:'driver-account-sign-out'}));assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
databaseOK=true;logout=await route.DELETE(request({method:'DELETE',purpose:'driver-account-sign-out'}));assert.equal(recorded.at(-1).event,'signed_out');

let time=0,visibility='visible',requests=[];
const reporter=load('lib/driver-activity-client.ts',{}, {Date:{now:()=>time},document:{get visibilityState(){return visibility;}},fetch:async(url,options)=>{requests.push({url,options});throw Error('offline');},AbortSignal});
reporter.reportDriverActivity('');assert.equal(requests.length,0);
reporter.reportDriverActivity('installation');reporter.reportDriverActivity('installation');assert.equal(requests.length,1);
time=60000;visibility='hidden';reporter.reportDriverActivity('installation');assert.equal(requests.length,1);
visibility='visible';reporter.reportDriverActivity('installation');assert.equal(requests.length,2);
assert.equal(requests[0].options.body,undefined);assert.equal(requests[0].options.method,'PATCH');
const legacyReporter=load('lib/driver-activity-client.ts',{}, {Date:{now:()=>time},document:{visibilityState:'visible'},fetch:()=>{throw Error('legacy transport');},AbortSignal:undefined});
assert.doesNotThrow(()=>legacyReporter.reportDriverActivity('installation'),'Unsupported timeout or synchronous fetch failure cannot break jobs');
const ui=fs.readFileSync('app/admin-driver-pool-control.tsx','utf8');
assert.doesNotMatch(ui.slice(ui.indexOf('  const selectedReady ='),ui.indexOf('  async function',ui.indexOf('  const selectedReady ='))),/driverActivity/,'Activity must not become selection authorization');
assert.doesNotMatch(fs.readFileSync('lib/driver-activity-client.ts','utf8'),/setInterval|setTimeout|postMessage/);
for(const file of ['app/driver-portal/page.tsx','app/driver-job/[token]/page.tsx']) assert.match(fs.readFileSync(file,'utf8'),/reportDriverActivity\(/,'Both established pages must report');
console.log('PASS activity helper/API/client: bounded sanitized states, exact account/device, origin/purpose/body denial, link-only denial, logout preservation, visible throttled contact, no selection gate.');
