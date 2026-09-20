import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const read = p => fs.readFileSync(p, 'utf8');
const require = createRequire(import.meta.url);
function compile(file, imports) {
  const exports = {};
  const js = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', js)(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name === 'node:crypto') return require(name);
    throw Error(`Unexpected dependency ${name}`);
  }, exports);
  return exports;
}
let rows, objects, calls, storageError, rowError, readError;
const id = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const photo = (overrides = {}) => ({id, booking_reference:'SYNTHETIC-A', storage_bucket:'ots-photo-proofs', storage_path:'bookings/SYNTHETIC-A/ots/20260620120000-11111111-1111-4111-8111-111111111111.jpg', content_type:'image/jpeg', file_size_bytes:40, photo_type:'ots', proof_status:'uploaded', uploaded_at:'2026-06-20T12:00:00.000Z', ...overrides});
const client = {
  from(table) {
    assert.equal(table, 'driver_ots_photo_proofs', 'No other table may be accessed by photo cleanup');
    const filters = []; let deletion = false, limit = Infinity;
    const q = {
      select(){return q;}, eq(k,v){filters.push(r=>r[k]===v);return q;},
      lte(k,v){filters.push(r=>new Date(r[k])<=new Date(v));return q;},
      order(){return q;}, limit(n){limit=n;return q;},
      delete(){deletion=true;return q;},
      async maybeSingle(){const r=await q;return {data:r.data?.[0]||null,error:r.error};},
      then(resolve,reject){
        const matched=rows.filter(r=>filters.every(f=>f(r))).slice(0,limit);
        if(deletion){calls.push('metadata-delete');if(rowError)return Promise.resolve({data:null,error:{message:'private database detail'}}).then(resolve,reject);rows=rows.filter(r=>!matched.includes(r));}
        return Promise.resolve({data:structuredClone(matched),error:readError?{message:'private read detail'}:null}).then(resolve,reject);
      }
    };return q;
  },
  storage:{from(bucket){assert.equal(bucket,'ots-photo-proofs');return {async createSignedUrl(){return {data:null,error:{message:'synthetic missing object'}};},async remove(paths){calls.push(['storage-remove',...paths]);if(storageError)return {data:null,error:{message:'private storage detail'}};const removed=paths.filter(p=>objects.has(p));paths.forEach(p=>objects.delete(p));return {data:removed.map(name=>({name})),error:null};}};}}
};
function reset(extra = {}) {rows=[photo(extra),photo({id:otherId,booking_reference:'SYNTHETIC-B',storage_path:'bookings/SYNTHETIC-B/ots/20260620120000-22222222-2222-4222-8222-222222222222.jpg',uploaded_at:'2026-09-19T00:00:00Z'})];objects=new Set(rows.map(r=>r.storage_path));calls=[];storageError=rowError=readError=false;}
const savedEnv={...process.env};
try {
  process.env.SUPABASE_URL='https://synthetic.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  const lib=compile('lib/driver-ots-photo-proof-persistence.ts',{'server-only':{},'@supabase/supabase-js':{createClient:()=>client},'./driver-job-link.ts':{},'./driver-job-link-mode.ts':{productionDriverJobLinksConfigured:()=>true}});
  assert.equal(typeof lib.deleteAdminDriverOtsPhotoProof,'function','Exact-photo deletion is missing');
  reset();const missingBytesRead=await lib.loadAdminDriverOtsPhotoProofs(new URLSearchParams({booking_reference:'SYNTHETIC-A'}));assert.equal(missingBytesRead.proofs[0].admin_view_url,'');assert.equal(missingBytesRead.proofs[0].id,id,'Metadata remains available for deletion retry');
  const target={id,booking_reference:'SYNTHETIC-A',uploaded_at:photo().uploaded_at};
  reset();const result=await lib.deleteAdminDriverOtsPhotoProof(target);assert.equal(result.ok,true);assert.equal(rows.length,1);assert.equal(rows[0].id,otherId);assert.equal(objects.size,1);assert.equal(calls[0][0],'storage-remove');assert.equal(calls[1],'metadata-delete');
  assert.equal((await lib.deleteAdminDriverOtsPhotoProof(target)).ok,true,'Repeat deletion is safe');
  for(const bad of [{...target,booking_reference:'SYNTHETIC-B'},{...target,uploaded_at:'2020-01-01T00:00:00Z'},{...target,storage_path:'foreign'},{...target,id:'bad'}]){reset();assert.equal((await lib.deleteAdminDriverOtsPhotoProof(bad)).ok,false);assert.equal(calls.length,0);}
  for(const extra of [{storage_bucket:'other'},{storage_path:'bookings/SYNTHETIC-B/ots/x.jpg'},{storage_path:'bookings/SYNTHETIC-A/ots/../x.jpg'},{proof_status:'deleted'}]){reset(extra);assert.equal((await lib.deleteAdminDriverOtsPhotoProof(target)).ok,false);assert.equal(calls.length,0);}
  reset();storageError=true;assert.equal((await lib.deleteAdminDriverOtsPhotoProof(target)).ok,false);assert.equal(rows.length,2);assert.equal(calls.length,1);
  reset();rowError=true;assert.equal((await lib.deleteAdminDriverOtsPhotoProof(target)).ok,false);assert.equal(rows.length,2);assert.equal(objects.size,1);rowError=false;assert.equal((await lib.deleteAdminDriverOtsPhotoProof(target)).ok,true);assert.equal(rows.length,1,'Partial failure is retryable even when bytes already removed');
  reset();readError=true;assert.equal((await lib.deleteAdminDriverOtsPhotoProof(target)).ok,false);assert.equal(calls.length,0);
  for(const [upload,expected] of [['2026-01-31T10:15:00Z','2026-04-30T10:15:00.000Z'],['2023-11-30T10:15:00Z','2024-02-29T10:15:00.000Z'],['2026-11-30T10:15:00Z','2027-02-28T10:15:00.000Z'],['2026-01-31T20:15:00Z','2026-04-30T20:15:00.000Z']]) assert.equal(lib.otsPhotoRetentionDueAt(upload),expected,'Three Singapore calendar months, clamp month-end');
  assert.equal(lib.otsPhotoRetentionDueAt('invalid'),null);
  reset();delete process.env.PRESTIGE_OTS_PHOTO_RETENTION_ENABLED;assert.equal((await lib.runOtsPhotoRetention()).enabled,false);assert.equal(calls.length,0);
  process.env.PRESTIGE_OTS_PHOTO_RETENTION_ENABLED='true';reset();assert.equal((await lib.runOtsPhotoRetention(new Date('2026-09-20T11:59:59.999Z'))).deleted,0);assert.equal(calls.length,0);
  reset();assert.equal((await lib.runOtsPhotoRetention(new Date('2026-09-20T12:00:00Z'))).deleted,1);assert.equal(rows[0].id,otherId);
  reset();storageError=true;assert.equal((await lib.runOtsPhotoRetention(new Date('2026-09-21T00:00:00Z'))).ok,false);assert.equal(rows.length,2);
  const boundary=compile('lib/admin-dispatcher-auth-boundary.ts',{});
  process.env.PRESTIGE_ADMIN_ACCOUNT_AUTH_ENABLED='true';process.env.PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET='synthetic-secret-for-local-contract-only-123456';
  const cookie=boundary.issueAdminAccountSession({accountId:id,authUserId:otherId,actorLabel:'Synthetic admin',role:'admin'});
  const route=compile('app/api/admin-driver-ots-photo-proofs/route.ts',{'../../../lib/admin-dispatcher-auth-boundary':boundary,'../../../lib/driver-ots-photo-proof-persistence':lib});
  const req=(body=target,headers={})=>new Request('https://local.invalid/api/admin-driver-ots-photo-proofs',{method:'DELETE',headers:{'content-type':'application/json','x-prestige-admin-purpose':'admin-booking-persistence',origin:'https://local.invalid',referer:'https://local.invalid/',cookie,...headers},body:JSON.stringify(body)});
  reset();assert.equal((await route.DELETE(req())).status,200);
  for(const headers of [{cookie:''},{origin:'https://foreign.invalid'},{referer:'https://local.invalid/my-bookings'},{'x-prestige-admin-purpose':'wrong'}]){reset();assert.equal((await route.DELETE(req(target,headers))).status,403);assert.equal(calls.length,0);}
  reset();assert.equal((await route.DELETE(req({...target,booking_reference:'SYNTHETIC-B'}))).status,409);assert.equal(calls.length,0);
  const cron=compile('app/api/cron/ots-photo-retention/route.ts',{'../../../../lib/driver-ots-photo-proof-persistence':lib});
  process.env.CRON_SECRET='synthetic-cron';reset();assert.equal((await cron.GET(new Request('https://local.invalid/api/cron/ots-photo-retention'))).status,401);assert.equal(calls.length,0);
  assert.equal((await cron.GET(new Request('https://local.invalid/api/cron/ots-photo-retention?date=2000',{headers:{authorization:'Bearer synthetic-cron'}}))).status,400);
  delete process.env.PRESTIGE_OTS_PHOTO_RETENTION_ENABLED;assert.equal((await cron.GET(new Request('https://local.invalid/api/cron/ots-photo-retention',{headers:{authorization:'Bearer synthetic-cron'}}))).status,200);assert.equal(calls.length,0);
  assert.ok(read('app/page.tsx').includes('data-admin-ots-photo-delete='),'Existing viewer needs compact Delete photo');
  console.log('OTS photo deletion/retention: exact isolation, storage-first retry, month boundaries, default-off and real Admin/cron auth passed');
} finally {for(const k of Object.keys(process.env))if(!(k in savedEnv))delete process.env[k];Object.assign(process.env,savedEnv);}

// Execute the actual UI handler: confirmation, failure, exact payload, double
// clicks, navigation during deletion, and removal from both existing caches.
const pageSource=read('app/page.tsx');
const ast=ts.createSourceFile('page.tsx',pageSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function extractFunction(name){let found;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,visit);}visit(ast);assert.ok(found,name);return ts.transpileModule(found.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;}
for(const mode of ['cancel','failure','success','navigation','double']) {
  const proof=photo();const readState={bookingReference:proof.booking_reference,proofs:[proof],latestProof:proof,status:'loaded'};
  let admin=structuredClone(readState),dashboard={[proof.booking_reference]:structuredClone(readState)},action;
  const deleted={current:new Set()},busy={current:false},requests=[];
  let release;const held=new Promise(resolve=>{release=resolve;});
  const fn=new Function('deletingOtsPhotoRef','deletedOtsPhotoIdsRef','window','adminDriverJobStatusTimeLabel','adminVisibleBookingReference','setOtsPhotoDeleteAction','fetch','adminDriverOtsPhotoProofsApiPath','adminLegacyDataPurpose','setAdminDriverOtsPhotoProofReadState','setDashboardDriverOtsPhotoProofReadStates',extractFunction('deleteAdminOtsPhoto')+';return deleteAdminOtsPhoto;')(
    busy,deleted,{confirm:text=>{assert.match(text,/permanently deletes only this photo/);assert.match(text,/SYNTHETIC-A/);return mode!=='cancel';}},v=>v,v=>v,v=>{action=v;},async(url,opts)=>{requests.push({url,...opts});if(mode==='double')await held;return {ok:mode!=='failure',json:async()=>({ok:mode!=='failure'})};},'/api/admin-driver-ots-photo-proofs','admin-booking-persistence',update=>{admin=update(admin);},update=>{dashboard=update(dashboard);});
  if(mode==='navigation')admin={...readState,bookingReference:'SYNTHETIC-OTHER',proofs:[photo({id:otherId})]};
  const first=fn(proof);
  if(mode==='double'){await fn(proof);release();}await first;
  assert.equal(requests.length,mode==='cancel'?0:1);assert.equal(busy.current,false);
  if(requests.length){assert.equal(requests[0].method,'DELETE');assert.deepEqual(JSON.parse(requests[0].body),{id,booking_reference:proof.booking_reference,uploaded_at:proof.uploaded_at});}
  if(['cancel','failure'].includes(mode)){assert.equal(deleted.current.size,0);assert.equal(admin.proofs.length,1);}
  else{assert.equal(deleted.current.has(id),true);assert.equal(dashboard[proof.booking_reference].proofs.length,0);assert.equal(admin.proofs.length,mode==='navigation'?1:0);assert.equal(action.status,'success');}
}
// A late read containing the deleted ID must not resurrect the photo link.
const delayedIds=new Set([id]);
const readPhotos=new Function('clean','adminDriverOtsPhotoProofsApiPath','adminLegacyDataPurpose','fetch',extractFunction('loadAdminDriverOtsPhotoProofRead')+';return loadAdminDriverOtsPhotoProofRead;')(v=>v,'/api/admin-driver-ots-photo-proofs','admin-booking-persistence',async()=>({ok:true,json:async()=>({ok:true,customerVisible:false,external_send:false,proofs:[{...photo(),customerVisible:false,external_send:false}]})}));
assert.equal((await readPhotos('SYNTHETIC-A',delayedIds)).latestProof,null);
console.log('Photo UI handler: cancel, failure, duplicate click, exact request, navigation isolation, cache removal and late read passed');
