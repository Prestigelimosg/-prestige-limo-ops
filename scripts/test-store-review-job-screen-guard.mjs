import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync('app/driver-job/[token]/page.tsx','utf8');
const tree=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
function walk(n){nodes.push(n);ts.forEachChild(n,walk)}walk(tree);
function run(code,ctx){const mod={exports:{}};vm.runInNewContext(ts.transpileModule('exports.run='+code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,...ctx});return mod.exports.run;}
const load=nodes.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='loadJob');
const ack=nodes.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='saveAndAcknowledgeJob');
const payload={acknowledged:false,assignedDriver:{name:'QA Driver',contact:'000',plate:'QA',vehicleModel:'Test'},acknowledgementRevision:'a'.repeat(64)};
let count=0;
async function scenario({action='load',status=200,mode='review',ok=true,acknowledged=false,production=false,host='localhost',networkError=false}={}){
 const state={},calls=[];
 const ctx={reviewJob:true,token:'review-9001',active:true,process:{env:{NODE_ENV:production?'production':'development'}},window:{location:{hostname:host}},
  savingDriverDetails:false,pageState:{kind:'ready',job:payload},encodeURIComponent,
  fetch:async(url,init)=>{calls.push({url,...init});if(networkError)throw Error('synthetic network failure');return{ok:status===200,json:async()=>({ok,mode,payload:{...payload,acknowledged}})};}};
 for(const name of ['PageState','Acknowledged','SavedDriverDetails','DetailsFeedback','DriverDetails','SavingDriverDetails'])ctx['set'+name]=v=>state[name]=v;
 await run((action==='load'?load:ack).getText(tree),ctx)();
 count++;return{state,calls};
}
const first=await scenario();assert.equal(first.state.PageState.kind,'ready');assert.equal(first.calls.length,1);assert.equal(first.calls[0].url,'/api/driver-job/review-9001');assert.equal(first.state.Acknowledged,false);
const refreshed=await scenario({acknowledged:true});assert.equal(refreshed.state.Acknowledged,true);assert.equal(refreshed.calls.length,1);
const saved=await scenario({action:'ack',acknowledged:true});assert.equal(saved.state.Acknowledged,true);assert.equal(saved.calls.length,1);
assert.equal(saved.calls[0].method,'PATCH');assert.deepEqual(JSON.parse(saved.calls[0].body),{action:'acknowledge',expected_revision:payload.acknowledgementRevision});
assert.deepEqual(JSON.parse(JSON.stringify(saved.calls[0].headers)),{'Content-Type':'application/json'});
for(const action of ['load','ack'])for(const extra of [{status:403},{mode:'production'},{mode:'mock'},{ok:false}]){
 const out=await scenario({action,...extra});assert.equal(out.state.PageState.kind,'blocked');assert.equal(out.calls.length,1);
}
assert.equal((await scenario({production:true})).calls.length,0);
assert.equal((await scenario({action:'ack',production:true})).calls.length,0);
assert.equal((await scenario({host:'app.prestigelimo.sg'})).calls.length,0);
assert.equal((await scenario({networkError:true})).state.PageState.kind,'blocked');
assert.match((await scenario({action:'ack',networkError:true})).state.DetailsFeedback.text,/Refresh before trying/);
assert.equal((await scenario({action:'ack',acknowledged:false})).state.PageState.kind,'blocked');
// Execute actual mount/poll/native effects with no ordinary effects available.
const effects=nodes.filter(n=>ts.isCallExpression(n)&&n.expression.getText(tree)==='useEffect');
for(const marker of ['embeddedDetectionFrame','refreshDriverAppUpdatesWhileVisible','handleNativeTrackingResult']){
 const effect=effects.find(n=>n.arguments[0].getText(tree).includes(marker));assert.ok(effect);
 run(effect.arguments[0].getText(tree),{reviewJob:true})();count++;
}
const callbacks=nodes.filter(n=>ts.isCallExpression(n)&&n.expression.getText(tree)==='useCallback');
for(const marker of ['native_notifications_register','driverAppUpdatesRequestSequenceRef.current + 1']){
 const callback=callbacks.find(n=>n.arguments[0].getText(tree).includes(marker));assert.ok(callback);
 await run(callback.arguments[0].getText(tree),{reviewJob:true})();count++;
}
console.log(`PASS ${count} actual reviewer screen scenarios: GET, ACK, refresh, denial, production/host hold, network failure, and suppressed native/notification/poll effects. Missing ordinary dependencies would throw if a branch escaped. Browser test separately checks rendered controls.`);

// Browser GET sends no Origin; same-origin Referer is still mandatory. PATCH
// retains a required Origin. Exercise the real gate, not a copied predicate.
const { createRequire } = await import('node:module');
const { createHash } = await import('node:crypto');
const require = createRequire(import.meta.url);
const config = { version: 1, databaseOrigin: 'https://fixture.supabase.co', expiresAt: '2099-01-01T00:00:00Z',
 credentials: Object.fromEntries(['admin','driver','customer'].map((r,i)=>[r,createHash('sha256').update(String(i).repeat(43)).digest('hex')])),
 scope: { bookingIds:[9001], bookingReferences:['QA-ONLY'], companyId:901, bookerId:902, customerId:903, driverId:904, travelerIds:[905],
 bookingTargets:[{bookingId:9001,bookingReference:'QA-ONLY',travelerId:905}] } };
const env={ NODE_ENV:'development', SUPABASE_URL:config.databaseOrigin, PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET:'synthetic-only-'.repeat(5), PRESTIGE_STORE_REVIEW_ACCESS:JSON.stringify(config) };
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/store-review-access.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
 { module:mod,exports:mod.exports,process:{env},Buffer,URL,Request,Response,Headers,require:n=>n==='server-only'?{}:require(n) });
const auth=mod.exports;
const cookie=auth.issueStoreReviewSession('driver','1'.repeat(43));
const session=auth.resolveStoreReviewSession(cookie);
assert.equal(session.state,'valid');
function req(path='/api/driver-job/review-9001',method='GET',headers={}) {return new Request('http://localhost:3131'+path,{method,headers:{cookie,referer:'http://localhost:3131/driver-job/review-9001',...headers}})}
assert.equal(auth.resolveStoreReviewJobRequest(req(),'review-9001').state,'review');
assert.equal(auth.resolveStoreReviewJobRequest(req(undefined,'PATCH'),'review-9001').state,'blocked');
assert.equal(auth.resolveStoreReviewJobRequest(req(undefined,'PATCH',{origin:'http://localhost:3131'}),'review-9001').state,'review');
for(const headers of [{referer:''},{referer:'https://foreign.invalid/driver-portal'},{origin:'https://foreign.invalid'}]) assert.equal(auth.resolveStoreReviewJobRequest(req(undefined,'GET',headers),'review-9001').state,'blocked');
for(const path of ['/driver-job/review-9001','/api/driver-job/review-9001']) assert.equal(auth.storeReviewRequestAllowed(session,path,'GET',req(path)),true);
for(const path of ['/driver-job/review-9002','/driver-job/private-token','/api/driver-job/review-9001/calendar','/api/driver-job/review-9001/notifications','/api/driver-job/review-9001/native-open']) assert.equal(auth.storeReviewRequestAllowed(session,path,'GET',req(path)),false);
assert.equal(auth.storeReviewRequestAllowed(session,'/api/driver-job/review-9001','DELETE',req(undefined,'DELETE')),false);
env.NODE_ENV='production';
for(const path of ['/driver-job/review-9001','/api/driver-job/review-9001'])assert.equal(auth.storeReviewRequestAllowed(session,path,'GET',req(path)),false);
assert.equal(auth.resolveStoreReviewJobRequest(req(),'review-9001').state,'blocked');
console.log('PASS actual reviewer request gate: browser GET without Origin allowed only with exact same-origin Referer; PATCH Origin required; other jobs, private tokens, subsidiary routes, DELETE and production denied.');
