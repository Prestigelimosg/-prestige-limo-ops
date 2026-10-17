// Run only the new country-code cases using the existing persistence fixtures.
// The original contract suite is loaded as harness definitions; its test body is never run.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const source=await readFile('scripts/test-driver-job-status-persistence-api-contract.mjs','utf8');
const marker='\ntry {\n  {';
const index=source.indexOf(marker,source.indexOf('const harness = await loadHarness();'));
assert.ok(index>0,'Existing harness boundary must be explicit');
const prefix=source.slice(0,index);
const dir=path.resolve('tmp/driver-contact-country-code');
await mkdir(dir,{recursive:true});
const generated=path.join(dir,'cases.mjs');
const cases=String.raw`
globalThis.fetch=async()=>{throw new Error('External network prohibited');};
const nullContactOnly = process.argv.includes('--null-contact-only');
// Extend only this new fixture: the established suite remains untouched.
MockSupabaseQuery.prototype.is = function(column, value) {
 assert.equal(value, null); this.filters.push({column, value}); return this;
};
let casesPassed=0;
const check=(label)=>{casesPassed++;console.log('PASS '+label);};
const seed=(options={})=>{
 const c=createSeededClient({acknowledgedAt:'',latestStatus:'',bookings:[{booking_reference:'DRV-JOB-API-001',driver_id:45}],drivers:[{id:45,driver_name:'Synthetic Country Driver',contact_number:'81230001',plate_number:'SYN45',vehicle_type:'Synthetic Van',availability_status:'available'}]});
 if(options.unassigned)c.tables.bookings[0].driver_id=null;
 return c;
};
const submit=(client,contact,extra={})=>saveDriverJobDetailsThroughStatusPersistence({client,now,token:validToken,driverName:'Synthetic Country Driver',driverContact:contact,driverPlateNumber:'SYN45',driverVehicleModel:'Synthetic Van',verifiedAccountDriverId:45,...extra});
try {
 if (!nullContactOnly) {
 for(const [entered,want] of [['81230001','+65 81230001'],['8123 0001','+65 81230001'],['65 81230001','+65 81230001'],['+65 8123 0001','+65 8123 0001'],['+60 123456789','+60 123456789']]){
  const c=seed();const r=await submit(c,entered);
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(c.tables.drivers[0].contact_number,want,'exact driver profile must store the country code');
  assert.equal(c.tables.bookings[0].driver_contact,want);
  assert.equal(c.tables.driver_job_links[0].safe_link_context.driver_job_payload.driver_contact,want);
  assert.equal(r.payload.assignedDriver.contact,want);
  assert.equal(c.tables.drivers.length,1);
  assertNoDriverJobLeaks(r);check('new account-backed submission '+entered);
 }
 {
  const c=seed({unassigned:true});c.tables.drivers=[];
  const r=await submit(c,'8123 0001',{verifiedAccountDriverId:undefined});
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(c.tables.drivers.length,1);assert.equal(c.tables.drivers[0].contact_number,'+65 81230001');check('new link-only driver persists canonical contact');
 }
 {
  const c=seed({unassigned:true});const r=await submit(c,'8123 0001',{verifiedAccountDriverId:undefined});
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(c.tables.drivers.length,1);assert.equal(c.tables.bookings[0].driver_id,45);assert.equal(c.tables.drivers[0].contact_number,'+65 81230001');check('legacy local contact reused, no duplicate driver');
 }
 {
  const c=seed();const before={...c.tables.drivers[0]};
  const r=await submit(c,'81230001',{verifiedAccountDriverId:undefined,driverName:'Job-specific Driver',driverPlateNumber:'JOBONLY',driverVehicleModel:'Job-specific Model'});
  assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(c.tables.drivers[0],{...before,contact_number:'+65 81230001'});check('link-bound contact prefix does not rewrite profile name, plate or vehicle');
 }
 {
  const c=seed({unassigned:true});c.tables.drivers.push({...c.tables.drivers[0],id:99,contact_number:'+65 81230001'});
  const r=await submit(c,'81230001',{verifiedAccountDriverId:undefined});assert.equal(r.ok,false);assert.equal(r.reason,'invalid_details');assert.equal(c.operations.length,0);check('local and country-code duplicate identities fail closed');
 }
 {
  const c=seed();c.tables.drivers.push({id:99,driver_name:'Other Driver',plate_number:'OTHER99',contact_number:'+65 8123 0002'});
  const r=await submit(c,'81230002');assert.equal(r.ok,false);assert.equal(c.operations.length,0);check('country-code equivalent collision fails before any write');
 }
 {
  const c=seed();const r=await submit(c,'81230001',{verifiedAccountDriverId:99});assert.equal(r.ok,false);assert.equal(c.operations.length,0);check('verified account must still match assignment');
 }
 {
  const c=seed();const l=c.tables.driver_job_links[0];l.driver_id=45;l.safe_link_context.driver_acknowledged_at='2026-06-07T08:05:00.000Z';
  Object.assign(l.safe_link_context.driver_job_payload,{assigned_driver_name:'Synthetic Country Driver',assigned_driver_contact:'81230001',assigned_driver_plate:'SYN45',assigned_driver_vehicle_model:'Synthetic Van'});
  const before=JSON.stringify(c.tables);const r=await submit(c,'81230001');assert.equal(r.ok,true);assert.equal(r.payload.assignedDriver.contact,'81230001');assert.equal(JSON.stringify(c.tables),before);assert.equal(c.operations.length,0);check('existing acknowledged bare number preserved byte-for-byte');
 }
 {
  const c=seed();const base=c.resolveUpdate.bind(c);c.resolveUpdate=async(q,m)=>{if(q.table==='drivers')c.tables.drivers[0].contact_number='+65 89990000';return base(q,m);};
  const r=await submit(c,'81230001',{verifiedAccountDriverId:undefined});assert.equal(r.ok,false);assert.equal(c.tables.bookings[0].driver_contact,undefined);assert.equal(c.tables.driver_job_links[0].safe_link_context.driver_acknowledged_at,undefined);assert.equal(c.tables.drivers[0].contact_number,'+65 89990000');check('concurrent profile-contact change is not overwritten');
 }
 }
 {
  const c=seed(); c.tables.drivers[0].contact_number=null;
  const r=await submit(c,'81230001',{verifiedAccountDriverId:undefined});
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(c.tables.drivers[0].contact_number,'+65 81230001');
  const write=c.operations.find(o=>o.table==='drivers'&&o.action==='update');
  assert.ok(write.filters.some(f=>f.column==='contact_number'&&f.value===null));
  assert.equal(c.tables.bookings[0].driver_contact,'+65 81230001');
  check('empty exact profile contact uses null compare-and-update');
 }
 console.log(JSON.stringify({newCasesPassed:casesPassed,previousSuitesRun:0,liveRequests:0,scope:'actual persistence source with existing synthetic RPC/client fixtures; no live Data API or SQL acceptance'}));
} finally {await harness.cleanup();restoreEnv();}
`;
try {
 await writeFile(generated,prefix+cases);
 const r=spawnSync(process.execPath,[generated,...process.argv.slice(2)],{cwd:process.cwd(),encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME}});
 process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
 if(r.error)throw r.error;
 process.exitCode=r.status??1;
} finally {await rm(generated,{force:true});}
