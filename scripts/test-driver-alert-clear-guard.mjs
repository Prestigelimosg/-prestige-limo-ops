import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const read = (p) => readFile(p, "utf8");
const [source, route, page, history] = await Promise.all(["lib/driver-portal-jobs.ts", "app/api/driver-portal/jobs/route.ts", "app/driver-portal/page.tsx", "lib/customer-driver-app-notification-persistence.ts"].map(read));
function fn(source, name, bindings) {
 const ast = ts.createSourceFile("test.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
 let match;
 function visit(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === name) match=n; ts.forEachChild(n, visit); } visit(ast);
 assert.ok(match, `${name} exists in the established lane`);
 const text=match.getText(ast).replace(/^export /, "");
 return new Function(...Object.keys(bindings), ts.transpileModule(text + `; return ${name}`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(bindings));
}
const a="11111111-1111-4111-8111-111111111111", b="22222222-2222-4222-8222-222222222222", fresh="33333333-3333-4333-8333-333333333333", foreign="44444444-4444-4444-8444-444444444444";
let rows, calls, reads;
const client={from(table){ assert.equal(table,"customer_driver_app_notification_outbox"); const filters=[];let patch; return {update(p){patch=p;return this;},eq(k,v){filters.push([k,v]);return this;},in(k,v){filters.push([k,v]);return this;},select(){calls++;const selected=rows.filter(r=>filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v));for(const r of selected)Object.assign(r,patch);return Promise.resolve({data:selected.map(r=>({id:r.id})),error:null});}};}};
const clear=fn(source,"clearDriverPortalAlerts",{loadDriverPortalJobs:async()=>{reads++;return {ok:true,alertsAvailable:true,alerts:[{notificationIds:[a,b,fresh]}]};},uuidPattern:/^[0-9a-f-]{36}$/i});
function reset(){calls=0;reads=0;rows=[a,b,fresh,foreign].map(id=>({id,delivery_surface:"driver_app",notification_status:"queued",actor_role:"admin",safe_message:"Keep history"}));}
reset(); let result=await clear({client,driverId:7,notificationIds:[a,b]});assert.equal(result.ok,true);assert.equal(result.clearedCount,2);assert.equal(calls,1);assert.equal(rows[2].notification_status,"queued","new arrival is not cleared");assert.equal(rows[3].notification_status,"queued","another driver's alert is not cleared");assert.equal(rows[0].safe_message,"Keep history");assert.equal(rows[0].actor_role,"admin");
reset();result=await clear({client,driverId:7,notificationIds:[a,foreign]});assert.equal(result.ok,false);assert.equal(calls,0,"mixed cross-driver batch must not partially write");
for(const ids of [[],["invalid"],[a,a],Array(101).fill(a)]){reset();assert.equal((await clear({client,driverId:7,notificationIds:ids})).ok,false);assert.equal(calls,0);}
reset();const blocked=fn(source,"clearDriverPortalAlerts",{loadDriverPortalJobs:async()=>({ok:true,alertsAvailable:false}),uuidPattern:/^[0-9a-f-]{36}$/i});assert.equal((await blocked({client,driverId:7,notificationIds:[a]})).ok,false);assert.equal(calls,0);
let verified=true, writeCalls=0;
const patch=fn(route,"PATCH",{sameOriginDriverPortalRequest:fn(route,"sameOriginDriverPortalRequest",{}),resolveDriverPortalSession:()=>({ok:true,claims:{accountId:"account",deviceIdHash:"hash",driverId:7}}),getDriverJobStatusPersistenceClientForProduction:()=>({ok:true,client}),verifyDriverAccountSession:async()=>verified,inactiveDriverAccountResponse:()=>new Response(null,{status:401}),readJsonBody:r=>r.json(),clearDriverPortalAlerts:async x=>{writeCalls++;assert.equal(x.driverId,7);return {ok:true,clearedCount:2}},response:(b,s)=>Response.json(b,{status:s})});
const request=()=>new Request("https://app.prestigelimo.sg/api/driver-portal/jobs",{method:"PATCH",headers:{"content-type":"application/json","origin":"https://app.prestigelimo.sg","referer":"https://app.prestigelimo.sg/driver-portal","x-prestige-driver-purpose":"driver-portal-alerts-clear"},body:JSON.stringify({notification_ids:[a,b]})});
assert.equal((await patch(request())).status,200);verified=false;assert.equal((await patch(request())).status,401);assert.equal(writeCalls,1);
assert.equal((await patch(new Request("https://app.prestigelimo.sg/api/driver-portal/jobs",{method:"PATCH"}))).status,401);
assert.match(page,/data-driver-notification-centre-clear="true"/);
assert.match(page,/notificationIds.slice\(offset, offset \+ 100\)/);
assert.match(page,/revision !== jobsReadRevisionRef.current/);
assert.match(page,/\+\+jobsReadRevisionRef.current/);
assert.match(history,/and\(delivery_surface.eq.driver_app,notification_status.in.\(queued,read,dismissed\)\)/);
console.log("Driver alert Clear scope, snapshots, persistence and account guard passed");

const jobPage = await read("app/driver-job/[token]/page.tsx");
assert.match(jobPage, /data-driver-back-to-jobs="true"/);
assert.match(jobPage, /window.location.assign\("\/driver-portal"\)/);

// Replay a read that was already waiting on browser alert readiness when Clear starts.
const pageAst=ts.createSourceFile("page.tsx",page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let loadNode;function visitLoad(n){if(ts.isVariableDeclaration(n)&&n.name.getText()==="loadJobs")loadNode=n.initializer.arguments[0];ts.forEachChild(n,visitLoad);}visitLoad(pageAst);
let releaseRead;const readiness=new Promise(resolve=>releaseRead=resolve);const revisionRef={current:0};let savedState=0;
const readBindings={clearingAlertsRef:{current:false},jobsReadRevisionRef:revisionRef,currentNativeInstallationId:()=>"",fetch:async()=>({ok:true,json:async()=>({ok:true,session:"account",alerts:[],jobs:[]})}),setAlertReadiness(){},setAlertState(){},readDriverPortalAlertState:()=>readiness,setReadState(){savedState++;}};
const loadJobRead=new Function(...Object.keys(readBindings),ts.transpileModule(`return (${loadNode.getText(pageAst)})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(readBindings));
const inFlight=loadJobRead();await Promise.resolve();await Promise.resolve();revisionRef.current++;releaseRead("available");await inFlight;assert.equal(savedState,0,"a pre-Clear read must not restore the old alert count");

verified=true;
const cross=request();cross.headers.set("origin","https://other.example");assert.equal((await patch(cross)).status,401);assert.equal(writeCalls,1,"cross-origin Clear cannot write");
