import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await readFile('app/page.tsx','utf8');
const tree=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=new Map();
function visit(n){if((ts.isVariableDeclaration(n)||ts.isFunctionDeclaration(n))&&n.name)declarations.set(n.name.getText(tree),n);ts.forEachChild(n,visit);}visit(tree);
function declaration(name){const n=declarations.get(name);assert.ok(n,name);return (ts.isVariableDeclaration(n)?'const ':'')+n.getText(tree)+';';}
const code=['clean','cleanReferenceText','safeDriverVehicleModelDisplay'].map(declaration).join('\n')+'\n'+
 (declarations.has('customerCopyAvfLabel')?declaration('customerCopyAvfLabel'):'const customerCopyAvfLabel="";')+'\n'+
 ['customerCopyCard','dispatchReadableCustomerVehicleValue'].map(declaration).join('\n')+'\nresult={text:customerCopyCard,summary:dispatchReadableCustomerVehicleValue};';
const compiled=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const reference='SYNTHETIC-ASSIGNED-VEHICLE';
const booking={driverId:'32',driverName:'Synthetic Driver',driverContact:'80000001',driverPlate:'TEST97',driverVehicleModel:'',vehicle:'AVF',bookingType:'DEP',name:'Synthetic Passenger',date:'2030-10-19',time:'0850',pax:'2'};
const baseline={booking_reference:reference,driver_id:32,updated_at:'2030-10-17T02:27:21.111359Z'};
const link={booking_reference:reference,link_status:'active',revoked_at:null,safe_summary:{acknowledged:true,acknowledged_at:'2030-10-17T02:29:41.720941Z',amendment_ack_pending:false,vehicle:'AVF'}};
function run(patch={}){
 const data={booking:{...booking},assignedDriverRecord:undefined,activeAdminDriverJobLink:structuredClone(link),appliedAdminBookingSnapshot:{...baseline},dispatchReleaseLoadedBookingRecord:null,dispatchReleaseWorkflowBookingReference:reference,dispatchPublicBookingReference:'SYNTHETIC97',assignedDriverPlate:'TEST97',...patch};
 const before=JSON.stringify(data);
 const context={...data,useMemo:f=>f(),customerBookingTypeLabel:()=> 'Departure',dispatchCopyLocationFlightParts:()=>({pickup:'Synthetic pickup',dropoff:'Synthetic airport',standaloneFlightLine:''}),formatDate:x=>x,formatPickupTime:x=>x,fetch:()=>{throw Error('No network allowed');},result:null};
 vm.runInNewContext(compiled,context);
 assert.equal(JSON.stringify(data),before,'Display must not mutate input records');
 assert.doesNotMatch(context.result.text,/AVF|Payout|PayNow|Profit|invoice|PRIVATE/);
 return context.result;
}
const expected=run();
assert.match(expected.text,/Car type: Alphard/,'An exact current acknowledged assigned AVF must display Alphard');
assert.equal(expected.summary,'TEST97 / Alphard');
for(const [label,patch] of [
 ['unassigned',{booking:{...booking,driverId:'',driverName:'',driverContact:'',driverPlate:''}}],
 ['wrong reference',{activeAdminDriverJobLink:{...link,booking_reference:'OTHER'}}],
 ['blank reference',{dispatchReleaseWorkflowBookingReference:'',activeAdminDriverJobLink:{...link,booking_reference:''}}],
 ['different assigned driver',{booking:{...booking,driverId:'44'}}],
 ['missing baseline',{appliedAdminBookingSnapshot:null}],
 ['old ACK',{activeAdminDriverJobLink:{...link,safe_summary:{...link.safe_summary,acknowledged_at:'2030-10-17T02:00:00Z'}}}],
 ['unacknowledged',{activeAdminDriverJobLink:{...link,safe_summary:{...link.safe_summary,acknowledged:false}}}],
 ['pending amendment',{activeAdminDriverJobLink:{...link,safe_summary:{...link.safe_summary,amendment_ack_pending:true}}}],
 ['revoked',{activeAdminDriverJobLink:{...link,revoked_at:'2030-10-17T03:00:00Z'}}],
 ['inactive',{activeAdminDriverJobLink:{...link,link_status:'expired'}}],
 ['generic category only',{activeAdminDriverJobLink:null}],
 ['wrong profile',{activeAdminDriverJobLink:null,assignedDriverRecord:{id:44,vehicle_type:'AVF'}}],
]){const out=run(patch);assert.doesNotMatch(out.text,/Car type: Alphard/,label);assert.doesNotMatch(out.summary,/Alphard/,label);}
const profile=run({activeAdminDriverJobLink:null,assignedDriverRecord:{id:32,vehicle_type:' avf '}});assert.match(profile.text,/Car type: Alphard/);assert.equal(profile.summary,'TEST97 / Alphard');
const loaded=run({appliedAdminBookingSnapshot:null,dispatchReleaseLoadedBookingRecord:baseline});assert.match(loaded.text,/Car type: Alphard/);
const explicit=run({booking:{...booking,driverVehicleModel:'Vellfire'}});assert.match(explicit.text,/Car type: Vellfire/);assert.equal(explicit.summary,'TEST97 / Vellfire');
for(const model of ['', 'Vehicle TBC','No preference','Prestige to advise']){const out=run({activeAdminDriverJobLink:null,assignedDriverRecord:{id:32,vehicle_type:model}});assert.doesNotMatch(out.text,/Car type:/);assert.equal(out.summary,'TEST97');}
console.log('PASS Customer Copy assigned AVF label: exact scope/current ACK, profile fallback, stale/cross-scope rejection, explicit models, blank suppression and immutable inputs.');
