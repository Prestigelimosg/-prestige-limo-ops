import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';

const page = await readFile('app/page.tsx', 'utf8');
const server = await readFile('lib/admin-driver-assignment-display.ts', 'utf8');
assert.ok(server.includes('export async function readFrequentAssignmentDrivers'), 'The existing admin-only display reader must supply verified frequency evidence.');
assert.ok(page.includes('<AdminDriverAssignmentPicker'), 'The existing selector must open the search picker.');
assert.ok(!page.includes('Load Drivers for Assignment'), 'Opening the selector replaces the extra load step.');
assert.ok(page.includes('drivers={assignableDriverAssignmentDisplayDrivers}'), 'Pool must keep the complete assignable roster.');
assert.ok(page.includes('value={assignedDriverSelectValue}'), 'Saved/inactive selection identity must survive filtering.');
assert.ok(page.includes('onChange={applyDriverToBooking}'), 'Selection must reuse the exact existing handler.');

const output = ts.transpileModule(server, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let tables, calls;
const since = new Date(Date.now()-5*86400000).toISOString();
const old = new Date(Date.now()-100*86400000).toISOString();
function fixture() {
  calls=[];
  tables={
    driver_job_links:[
      {id:'l1',booking_reference:'A',driver_id:1,acknowledged_at:since,updated_at:since},
      {id:'l2',booking_reference:'A',driver_id:1,acknowledged_at:since,updated_at:since},
      {id:'l3',booking_reference:'B',driver_id:1,acknowledged_at:since,updated_at:since},
      {id:'l4',booking_reference:'C',driver_id:2,acknowledged_at:since,updated_at:since},
      {id:'l5',booking_reference:'D',driver_id:3,acknowledged_at:since,updated_at:since},
      {id:'l6',booking_reference:'E',driver_id:4,acknowledged_at:since,updated_at:since},
      {id:'l7',booking_reference:'F',driver_id:1,acknowledged_at:old,updated_at:since},
      {id:'l8',booking_reference:'G',driver_id:1,acknowledged_at:'invalid',updated_at:since},
    ],
    driver_job_bids:[{id:'b1',booking_reference:'A',driver_reference:'1',bid_status:'accepted',decided_at:since},{id:'b2',booking_reference:'H',driver_reference:'2',bid_status:'accepted',decided_at:since}],
    bookings:['A','B','C','D','E','F','G','H'].map((r,i)=>({booking_reference:r,driver_id:[1,1,2,3,9,1,1,2][i],status:r==='D'?'cancelled':null,admin_internal_status:'draft'})),
    driver_job_combo_members:[{booking_reference:'A',combo_id:'combo-1'},{booking_reference:'B',combo_id:'combo-1'}],
  };
}
const client={from(table){
  assert.ok(tables[table], `Unexpected table ${table}`);
  let rows=tables[table],start=0,end=499;
  const q={select(columns){calls.push({table,columns});return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},gte(k,v){rows=rows.filter(r=>r[k]>=v);return q;},lte(k,v){rows=rows.filter(r=>r[k]<=v);return q;},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q;},order(){return q;},range(a,b){start=a;end=b;return q;},abortSignal(){return q;},then(resolve,reject){return Promise.resolve({data:rows.slice(start,end+1),error:null}).then(resolve,reject);}};
  return q;
}};
const context={exports:{},require(name){if(name==='server-only')return {};if(name==='@supabase/supabase-js')return {createClient:()=>client};throw Error(name);},process:{env:{SUPABASE_URL:'https://qa.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-safe-key-for-read-only-tests',PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:'true'}},URL,URLSearchParams,AbortSignal,Date,console};
runInNewContext(output,context);
const actor={actor_label:'QA',actor_role:'admin',boundary_mode:'server-session-role-surface',source_surface:'admin_api'};
fixture();
let result=await context.exports.readFrequentAssignmentDrivers(actor);
assert.equal(result.ok,true,JSON.stringify(result));
assert.deepEqual(JSON.parse(JSON.stringify(result.data)),[{driver_id:2,job_count:2},{driver_id:1,job_count:1}], 'Deduplicate link reissues, Pool+ACK and combo legs; exclude cancellations, replacements and old/invalid ACK.');
assert.ok(calls.every(c=>!c.columns.includes('safe_link_context,')&&!c.columns.includes('*')), 'Read only narrow evidence columns.');
assert.ok(calls.every(c=>!/price|payout|passenger|contact|token|payload|invoice/.test(c.columns)));
fixture(); tables.bookings[3].admin_internal_status='assigned';
result=await context.exports.readFrequentAssignmentDrivers(actor);
assert.ok(result.data.some(r=>r.driver_id===3), 'Current non-draft status takes precedence over legacy cancellation.');
fixture(); tables.bookings[3].status=null; tables.bookings[3].admin_internal_status=null; tables.bookings[3].customer_facing_status='cancelled';
result=await context.exports.readFrequentAssignmentDrivers(actor);
assert.ok(!result.data.some(r=>r.driver_id===3),'Preserve existing customer-facing status fallback when both Admin and legacy status are absent.');
fixture(); tables.bookings.push({...tables.bookings[0]});
result=await context.exports.readFrequentAssignmentDrivers(actor);
assert.equal(result.ok,false,'Ambiguous reference evidence must never produce a ranking.');
fixture();
result=await context.exports.readFrequentAssignmentDrivers({...actor,actor_role:'customer'});
assert.equal(result.ok,false);assert.equal(calls.length,0,'Unauthorized caller must not read history.');
fixture();
tables.driver_job_links = Array.from({length:10001},(_,i)=>({...tables.driver_job_links[0],id:'L'+i}));
result=await context.exports.readFrequentAssignmentDrivers(actor);
assert.equal(result.ok,false,'A bounded read must reject truncated history rather than publish false top drivers.');
fixture();
tables.driver_job_links = Array.from({length:501},(_,i)=>({...tables.driver_job_links[0],id:'L'+i}));
result=await context.exports.readFrequentAssignmentDrivers(actor);
assert.equal(result.ok,true,'History pages must combine completely.');
assert.equal(result.data.find(r=>r.driver_id===1).job_count,1,'Repeated references across pages count once.');
fixture(); tables.bookings=undefined;
result=await context.exports.readFrequentAssignmentDrivers(actor);
assert.equal(result.ok,false,'A failed evidence read must fall back without guessed rankings.');

// Execute the actual shared loader: dropdown and Pool share one in-flight read;
// only dropdown reopen reuses the short cache, and explicit Pool retries still read.
const loaderSource=page.slice(page.indexOf('  async function loadDriverAssignmentDisplayDrivers('),page.indexOf('  async function saveDriverProfile()'));
let fetches=0,resolveFetch,shown,loading=false;
const loaderContext={exports:{},Date,driverAssignmentDisplayLoad:{current:null},driverAssignmentDisplayLoadedAt:{current:0},driverAssignmentDisplayDriversRef:{current:[]},setLoadingDriverAssignmentDisplay:v=>loading=v,setMessage:()=>{},setDriverAssignmentDisplayDrivers:v=>shown=v,fetchDriverAssignmentDisplayDriverRecords:()=>{fetches++;return new Promise(resolve=>resolveFetch=resolve);}};
runInNewContext(ts.transpileModule('export '+loaderSource.trim(),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,loaderContext);
const load=loaderContext.exports.loadDriverAssignmentDisplayDrivers;
const first=load(undefined,undefined,true),pool=load();
assert.equal(fetches,1);assert.equal(loading,true);
resolveFetch([{id:405},{id:1}]);await Promise.all([first,pool]);
assert.deepEqual(shown,[{id:405},{id:1}]);assert.equal(loading,false);
await load(undefined,undefined,true);assert.equal(fetches,1,'Reopening dropdown must reuse a completed recent roster');
const refresh=load();assert.equal(fetches,2,'Pool explicit request must retain refresh behavior');
resolveFetch([]);await refresh;
loaderContext.fetchDriverAssignmentDisplayDriverRecords=async()=>{throw Error('Failure');};
assert.equal(await load(),false);assert.equal(loaderContext.driverAssignmentDisplayLoad.current,null);assert.equal(loaderContext.driverAssignmentDisplayLoadedAt.current,0,'A failed refresh must invalidate the reuse cache');
loaderContext.fetchDriverAssignmentDisplayDriverRecords=async()=>[{id:2}];
assert.equal(await load(),true,'Retry must recover after failure');
console.log('Driver assignment search/ranking guard passed.');
