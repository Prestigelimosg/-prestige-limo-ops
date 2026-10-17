import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {loadHarness,canonicalAdminPayload,canonicalAdminUpdatePayload,installMockClient,adminActor,adminAudit,setEnv,restoreEnv} from './test-admin-booking-supabase-adapter-contract.mjs';
const app=await readFile('app/page.tsx','utf8');
const tree=ts.createSourceFile('app/page.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function declaration(name){let found;function visit(n){if((ts.isFunctionDeclaration(n)||ts.isVariableDeclaration(n))&&n.name?.getText(tree)===name)found=n;ts.forEachChild(n,visit);}visit(tree);assert.ok(found,name);return ts.isVariableDeclaration(found)?'const '+found.getText(tree)+';':found.getText(tree);}
if(process.argv.includes('--profile-only')){
 let assignment=[{id:8,plate_number:'OLD8'}];
 const latest=[{id:8,plate_number:'NEW8'}];
 const currentRef={current:assignment};const cache={current:0};
 const context={exports:{},adminLegacyDataClient:{from:()=>({select:()=>({order:async()=>({data:[],error:null})})})},adminLegacyTables:{drivers:'drivers'},fetchDriverAssignmentDisplayDriverRecords:async()=>latest,setDrivers:()=>{},setDriverProfileDisplayDrivers:()=>{},setDriverAssignmentDisplayDrivers:v=>{assignment=v;},driverAssignmentDisplayDriversRef:currentRef,driverAssignmentDisplayLoadedAt:cache,setMessage:()=>{},setLoadingDrivers:()=>{}};
 vm.runInNewContext(ts.transpileModule(declaration('loadDrivers')+'\nexports.load=loadDrivers;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 await context.exports.load();assert.deepEqual(assignment,latest,'profile refresh must replace stale assignment choices');assert.deepEqual(currentRef.current,latest);assert.ok(cache.current>0);
 console.log('PASS saved profile refresh shares verified display records with assignment selector');process.exit(0);
}
const old={driverId:'8',driverName:'Old Name',driverContact:'81230001',driverPlate:'OLD8',driverVehicleModel:'Old Model',name:'Unchanged passenger'};
const corrected={...old,driverName:'Corrected Name',driverContact:'+65 81230001',driverPlate:'NEW8',driverVehicleModel:'Corrected Model'};
const ref='DETAIL-CORRECTION-95';
let form={...corrected};
const baseline={current:{bookingReference:ref,updatedAt:'2030-01-01T01:00:00Z',form:{...corrected}}};
const scope={exports:{},useCallback:f=>f,setBooking:f=>{form=f(form);},loadedAdminBookingBaselineRef:baseline,driverAssignmentDisplayDriversRef:{current:[]},dispatchReleaseWorkflowBookingReference:ref,isInactiveDriver:()=>false,activeTab:'dispatch',requestDriverJobLinkVehicleFallbackRefresh:()=>{},safeDriverVehicleModelFromBookingRecord:r=>r.vehicle_type_or_category||''};
const names=['clean','cleanReferenceText','safeDriverVehicleModelDisplay','draftDriverAssignmentSignature','adminDispatchHasUnsavedVerifiedDriverProfileSelection','mergeCurrentBookingDriverDetailsFromActiveLink','mergeCurrentBookingDriverDetailsFromRecord'];
vm.runInNewContext(ts.transpileModule(names.map(declaration).join('\n')+'\nexports.link=mergeCurrentBookingDriverDetailsFromActiveLink;exports.record=mergeCurrentBookingDriverDetailsFromRecord;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,scope);
const link={booking_reference:ref,link_status:'active',updated_at:'2030-01-01T02:00:00Z',safe_summary:{acknowledged_at:'2030-01-01T00:30:00Z',assigned_driver:old.driverName,assigned_driver_contact:old.driverContact,assigned_driver_plate:old.driverPlate,vehicle:old.driverVehicleModel}};
if(!process.argv.includes('--adapter-only')){
 scope.exports.link(link);
 assert.deepEqual(JSON.parse(JSON.stringify(form)),corrected,'older link details must not replace persisted corrected details, even if link metadata was refreshed later');
 scope.exports.record({booking_reference:ref,updated_at:'2030-01-01T00:00:00Z',driver_name:old.driverName,driver_contact:old.driverContact,driver_plate_number:old.driverPlate,vehicle_type_or_category:old.driverVehicleModel});
 assert.deepEqual(JSON.parse(JSON.stringify(form)),corrected,'delayed older booking response must not undo completed save');
 scope.exports.record({booking_reference:'OTHER-JOB',updated_at:'2030-01-01T03:00:00Z',driver_name:'Other Driver'});
 assert.equal(form.driverName,corrected.driverName,'different booking cannot hydrate this form');
 scope.exports.record({booking_reference:ref,updated_at:'2030-01-01T03:00:00Z',driver_name:'Latest ACK Driver',driver_contact:'+65 81230002',driver_plate_number:'NEWER8',vehicle_type_or_category:'Newer Model'});
 assert.equal(form.driverPlate,'NEWER8','new canonical booking details still hydrate');
 form={...corrected,driverContact:'',driverPlate:'',driverVehicleModel:''};baseline.current.form={...form};scope.exports.link(link);
 assert.equal(form.driverPlate,'','cleared saved detail must stay blank');
 baseline.current.updatedAt='2030-01-01T00:00:00Z';
 form={...old,driverName:'',driverContact:'',driverPlate:'',driverVehicleModel:''};baseline.current.form={...form};scope.exports.link(link);
 assert.equal(form.driverPlate,'OLD8','first acknowledgement fallback remains available');
 console.log('PASS saved details resist old link/delayed booking; cross-booking blocked; newer booking and initial fallback preserved');
}
if(process.argv.includes('--ui-only'))process.exit(0);
const harness=await loadHarness();
try{
 setEnv({PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE:'server-session-token',PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE:'admin',PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN:'mock-contract-admin-session-token',PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:'true',SUPABASE_URL:'https://contract-ready.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'SUPABASE_SERVICE_ROLE_KEY_SENTINEL_DO_NOT_LEAK'});
 const version='2030-06-01T00:00:00.000Z';
 const input=canonicalAdminUpdatePayload({booking:{booking_reference:ref,customer_id:104,driver_id:8,driver_name:corrected.driverName,driver_contact:corrected.driverContact,driver_plate_number:corrected.driverPlate,vehicle_type_or_category:corrected.driverVehicleModel}});
 delete input.personal_customer_folder_create;
 Object.assign(input,{expected_updated_at:version,target_booking_reference:ref,update_mode:'driver_assignment'});
 const parsed=harness.persistence.parseAdminBookingUpdatePayload(input);assert.equal(parsed.ok,true,JSON.stringify(parsed));
 const row={...canonicalAdminPayload().booking,id:104,customer_id:104,booking_reference:ref,driver_id:8,driver_name:old.driverName,driver_contact:old.driverContact,driver_plate_number:old.driverPlate,updated_at:version};
 for(const variant of ['valid','stale','wrong-receipt','unavailable']){
  const mock=installMockClient({bookings:[row]},{rpcHandlers:{apply_admin_driver_reassignment(params,client){
   assert.equal(params.p_new_driver_id,8);assert.equal(params.p_booking_reference,ref);
   if(variant==='unavailable')return {data:null,error:{code:'22023',message:'The selected Driver is already assigned to this booking.'}};
   Object.assign(client.tables.bookings[0],{driver_name:corrected.driverName,driver_contact:corrected.driverContact,driver_plate_number:corrected.driverPlate,vehicle_type_or_category:corrected.driverVehicleModel,updated_at:'2030-06-01T00:00:01.000Z'});
   return {data:{booking_id:104,booking_reference:variant==='wrong-receipt'?'OTHER-JOB':ref,previous_driver_id:8,new_driver_id:8,driver_details_updated:true},error:null};
  }}});
  globalThis.__prestigeSupabaseAdapterMock=mock;
  const result=await harness.adapter.updateAdminBookingThroughSupabaseAdapter({...parsed.data,...(variant==='stale'?{expected_updated_at:'2029-01-01T00:00:00Z'}:{})},adminAudit('admin_booking_update'),adminActor());
  assert.equal(result.ok,variant==='valid',variant+': '+JSON.stringify(result));
  if(result.ok)assert.equal(result.data.driver_plate_number,corrected.driverPlate);
  assert.equal(mock.client.operations.some(o=>['update','insert','delete'].includes(o.action)),false,'must never fall through to generic writers');
  assert.equal(mock.client.operations.filter(o=>o.action==='rpc').length,variant==='stale'?0:1);
 }
 console.log('PASS same-driver adapter reuses exact transaction, verifies receipt and rejects stale/unavailable states without generic writes');
}finally{restoreEnv();delete globalThis.__prestigeSupabaseAdapterMock;await harness.cleanup();}
