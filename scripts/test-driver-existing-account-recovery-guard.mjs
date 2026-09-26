import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>fs.readFileSync(p,'utf8');
const compile=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const load=(source,deps,extra={})=>{const context={exports:{},...extra,require:n=>{if(n in deps)return deps[n];throw Error('Unexpected import '+n);}};vm.runInNewContext(compile(source),context);return context.exports;};
const jsx=(type,props)=>({type,props});
const buttons=[];let signIns=0,nativeWrites=0;
const setup=load(read('app/driver-portal/driver-account-setup.tsx'),{
 react:{useState:v=>[v,()=>{}],useEffect:()=>{}},'react/jsx-runtime':{jsx,jsxs:jsx},'../../lib/driver-account-password':{driverAccountPasswordIsReady:()=>true}
},{window:{__PRESTIGE_DRIVER_ACCOUNT_SETUP__:{supported:true,pending:true,attempted:true},ReactNativeWebView:{postMessage:()=>nativeWrites++}}});
function visit(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(visit);return;}if(x.type==='button')buttons.push(x);visit(x.props?.children);}
visit(setup.DriverAccountSetup({pending:true,onCancel:()=>signIns++}));
const signIn=buttons.find(b=>b.props.children==='Already have an account? Sign in');
assert.ok(signIn,'An attempted setup must retain the existing-account Sign in control');
signIn.props.onClick();assert.equal(signIns,1);assert.equal(nativeWrites,0,'Sign in navigation must preserve the pending draft');
// Execute the actual portal visibility condition: pending setup must not override an explicit sign-in choice.
const page=read('app/driver-portal/page.tsx');
const ast=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let condition;
function scan(n){if(ts.isConditionalExpression(n)&&n.whenTrue.getText(ast).includes('<DriverAccountSetup '))condition=n.condition.getText(ast);ts.forEachChild(n,scan);}scan(ast);assert.ok(condition);
const visible=new Function('installedAccountSignInRequired','accountSetupSupported','accountSetupOpen','accountSetupPending','accountSetupSignIn',`return ${condition}`);
assert.equal(visible(true,true,true,true,false),true);
assert.equal(visible(true,true,true,true,true),false,'Existing sign-in remains reachable with the pending native draft');
assert.equal(visible(false,true,true,true,false),false,'A verified account session must not be blocked by pending setup');
console.log('PASS attempted setup -> existing Sign in without cancelling or deleting setup');
// Real encrypted sessions, real bound-phone verification and real expiry checks.
const crypto=await import('node:crypto');
const workflow=load(read('lib/driver-job-status-workflow.ts'),{});
const link=load(read('lib/driver-job-link.ts'),{'node:crypto':crypto,'./driver-job-status-workflow.ts':workflow});
const password=load(read('lib/driver-account-password.ts'),{});
const noProvider={createClient:()=>{throw Error('No live database/provider access');}};
const account=load(read('lib/driver-account-device-lock.ts'),{'server-only':{},'node:crypto':crypto,'@supabase/supabase-js':noProvider,'./driver-job-link.ts':link,'./driver-account-password.ts':password});
const session=load(read('lib/driver-portal-session.ts'),{'node:crypto':crypto,'./driver-job-link.ts':link,'./driver-device-push-notification.ts':{opaqueDriverJobLinkKey:()=>{throw Error('No job enrollment');}}},{Buffer,process});
const activation=load(read('lib/driver-job-account-activation.ts'),{'server-only':{},'node:crypto':crypto,'@supabase/supabase-js':noProvider,'./driver-job-link.ts':link,'./driver-account-password.ts':password,'./driver-account-device-lock.ts':account,'./driver-portal-session.ts':session},{process});
const env={PRESTIGE_DRIVER_ACCOUNT_AUTH_ENABLED:'true',PRESTIGE_DRIVER_JOB_ACCOUNT_ACTIVATION_ENABLED:'true',PRESTIGE_DRIVER_ACCOUNT_DEVICE_SECRET:'synthetic-device-secret-for-recovery-checks',PRESTIGE_DRIVER_PORTAL_SESSION_SECRET:'synthetic-session-secret-for-recovery-checks'};
const installation='11111111-1111-4111-8111-111111111111',accountId='22222222-2222-4222-8222-222222222222',setupId='33333333-3333-4333-8333-333333333333';
const token='a'.repeat(64),deviceHash=account.deviceIdHashFor(installation,env);
const claims={accountId,driverId:7,deviceIdHash:deviceHash,env};
const cookie=session.issueDriverPortalAccountSession(claims).split(';')[0];
const input={action:'activate',installation_id:installation,setup_id:setupId,email:'synthetic@example.test',password:'482951'};
const original={driver_access_accounts:[{id:accountId,driver_reference:'7',account_status:'active',active_device_id_hash:deviceHash}],driver_job_links:[{id:'44444444-4444-4444-8444-444444444444',token_hash:link.hashDriverJobLinkToken(token),driver_id:7,booking_reference:'QA-ONLY',link_status:'active',revoked_at:null,expires_at:new Date(Date.now()+86400000).toISOString(),safe_link_context:{}}],bookings:[{booking_reference:'QA-ONLY',driver_id:7}]};
let db,readError=false,rpcReason='account_exists',rpcError=false,authWrites=0,sessionIssues=0;
const client={rpc:async()=>({data:{ok:false,reason:rpcReason},error:rpcError?{}:null}),from:table=>{let filters=[];return {select(){return this;},eq(k,v){filters.push(r=>r[k]===v);return this;},async maybeSingle(){const rows=db[table].filter(r=>filters.every(f=>f(r)));return {data:rows.length===1?rows[0]:null,error:readError||rows.length>1?{}:null};}};}};
const run=async(options={})=>activation.activateDriverJobAccount(token,input,{env,client,auth:{createUser:async()=>{authWrites++;throw Error('Must not create an existing account');}},issueSession:()=>{sessionIssues++;throw Error('Keep existing session');},cookieHeader:cookie,...options});
db=structuredClone(original);const before=JSON.stringify(db);
assert.equal((await run()).accountReady,true,'Verified existing account must complete only its own failed local setup');
assert.equal(JSON.stringify(db),before);assert.equal(authWrites,0);assert.equal(sessionIssues,0);
for(const missing of [undefined,'',cookie+'tampered']) {
 assert.equal((await run({cookieHeader:missing})).ok,false,'Missing or forged session cannot recover setup');
}
for(const change of [
 d=>d.driver_access_accounts[0].account_status='suspended',
 d=>d.driver_access_accounts[0].active_device_id_hash='f'.repeat(64),
 d=>d.driver_access_accounts[0].driver_reference='8',
 d=>d.driver_access_accounts[0].pin_session_not_before=new Date(Date.now()+60000).toISOString(),
 d=>d.driver_job_links[0].driver_id=8,
 d=>d.driver_job_links[0].driver_id=null,
 d=>d.bookings[0].driver_id=8,
 d=>d.driver_job_links[0].revoked_at=new Date().toISOString(),
 d=>d.driver_job_links[0].link_status='revoked',
 d=>d.driver_job_links[0].expires_at=new Date(Date.now()-1000).toISOString(),
 d=>d.driver_job_links[0].expires_at='invalid',
 d=>d.driver_job_links[0].expires_at=new Date(Date.now()+400*86400000).toISOString(),
 d=>d.driver_job_links.length=0,
 d=>d.bookings.length=0,
]){db=structuredClone(original);change(db);assert.equal((await run()).ok,false);}
db=structuredClone(original);readError=true;assert.equal((await run()).ok,false);readError=false;
rpcError=true;assert.equal((await run()).ok,false);rpcError=false;
rpcReason='assignment_changed';assert.equal((await run()).ok,false);rpcReason='account_exists';
const otherCookie=session.issueDriverPortalAccountSession({...claims,deviceIdHash:'e'.repeat(64)}).split(';')[0];
assert.equal((await run({cookieHeader:otherCookie})).ok,false);
assert.equal(authWrites,0);assert.equal(sessionIssues,0);
console.log('PASS existing-account recovery: real session/phone/expiry checks, wrong owner, reassignment, missing/revoked/expired link, stale PIN, read/RPC failures; zero data/auth writes');
// The actual route forwards only its HTTP cookie, not a body-supplied identity.
let forwarded;
const route=load(read('app/api/driver-job/[token]/account/route.ts'),{
 '../../../../../lib/driver-account-device-lock.ts':{},
 '../../../../../lib/driver-job-link-mode.ts':{isProductionDriverJobLinkMode:()=>true},
 '../../../../../lib/driver-portal-session.ts':{},
 '../../../../../lib/driver-job-account-activation.ts':{activateDriverJobAccount:async(t,b,options)=>{forwarded=options;return {ok:true,accountReady:true,cookie:null};}},
},{Request,Response,URL});
const request=new Request('https://app.test/api/driver-job/'+token+'/account',{method:'POST',headers:{origin:'https://app.test',referer:'https://app.test/driver-job/'+token,'user-agent':'Android','x-prestige-driver-purpose':'driver-account-activate',cookie},body:JSON.stringify(input)});
assert.equal((await route.POST(request,{params:Promise.resolve({token})})).status,200);
assert.equal(forwarded.cookieHeader,cookie);
assert.equal((await activation.activateDriverJobAccount(token,{...input,cookieHeader:cookie},{env,client,cookieHeader:cookie})).ok,false);
// Execute the established native completion handler: only the exact saved setup/job clears.
const nativeSource=read('driver-companion/App.tsx');const nativeAst=ts.createSourceFile('App.tsx',nativeSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;
function findHandler(n){if(ts.isVariableDeclaration(n)&&n.name.getText(nativeAst)==='handleBridgeMessage')callback=n.initializer.arguments[0];ts.forEachChild(n,findHandler);}findHandler(nativeAst);assert.ok(callback);
const jobUrl='https://app.prestigelimo.sg/driver-job/'+token;
for(const mode of ['exact','other-job','other-setup','partial']){
 let cleared=0,remembered=0;
 const bindings={parseDriverBridgeMessage:JSON.parse,currentWebViewUrlRef:{current:mode==='other-job'?jobUrl.replace(token,'b'.repeat(64)):jobUrl},accountSetupBusyRef:{current:false},readDriverAccountSetup:async()=>({jobUrl,setupId,activated:false,password:'482951'}),parseDriverJobUrl:u=>({token:u.split('/').at(-1)}),clearDriverAccountSetup:async()=>cleared++,setPendingAccountSetup:()=>{},rememberDriverAccountSetup:async()=>remembered++};
 const handler=new Function(...Object.keys(bindings),compile('const handler='+callback.getText(nativeAst)+';return handler;'))(...Object.values(bindings));
 await handler({nativeEvent:{data:JSON.stringify({type:'native_account_setup_activated',setup_id:mode==='other-setup'?installation:setupId,complete:mode!=='partial'})}});
 assert.equal(cleared,mode==='exact'?1:0);assert.equal(remembered,mode==='partial'?1:0);
}
console.log('PASS exact cookie forwarding and existing native exact-job/setup clearing; no native protocol change');
