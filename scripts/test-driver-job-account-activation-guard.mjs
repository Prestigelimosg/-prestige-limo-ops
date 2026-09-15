import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import ts from 'typescript';
const temp=await mkdtemp(path.join(os.tmpdir(),'driver-activation-guard-'));
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const load=(source,dependencies)=>{const exports={};new Function('require','exports',compile(source))(name=>{if(name in dependencies)return dependencies[name];throw Error('Unexpected dependency '+name);},exports);return exports;};
try {
 const password=load(await readFile('lib/driver-account-password.ts','utf8'),{});
 const env={PRESTIGE_DRIVER_ACCOUNT_AUTH_ENABLED:'true',PRESTIGE_DRIVER_JOB_ACCOUNT_ACTIVATION_ENABLED:'true',PRESTIGE_DRIVER_ACCOUNT_DEVICE_SECRET:'synthetic-secret-driver-activation-only',PRESTIGE_DRIVER_PORTAL_SESSION_SECRET:'synthetic-secret-driver-session-only'};
 const id='11111111-1111-4111-8111-111111111111',setup='22222222-2222-4222-8222-222222222222',authId='33333333-3333-4333-8333-333333333333';
 const deps={'server-only':{},'node:crypto':await import('node:crypto'),'@supabase/supabase-js':{createClient:()=>{throw Error('No live access');}},'./driver-job-link.ts':{hashDriverJobLinkToken:token=>{if(token!=='a'.repeat(64))throw Error('bad token');return 'b'.repeat(64);}},'./driver-account-password.ts':password,'./driver-account-device-lock.ts':{driverAccountDeviceLockVersion:'driver-account-device-lock-v1'},'./driver-portal-session.ts':{issueDriverPortalAccountSession:()=>{throw Error('Use synthetic issuer');}}};
 const mod=load(await readFile('lib/driver-job-account-activation.ts','utf8'),deps);
 let calls=[],authCalls=[],sessions=[],result={ok:false,reason:'invalid_link'},finish={ok:true,activated:true,scope:'this_job'},providerError=null;
 const client={rpc:async(name,args)=>{calls.push({name,args});return {data:args.p_action==='record_auth'?finish:result,error:null};}};
 const auth={createUser:async input=>{authCalls.push(input);return {data:{user:{id:authId}},error:providerError};}};
 const test={env,client,auth,issueSession:input=>{sessions.push(input);return 'synthetic=1; HttpOnly; Secure';}};
 const input={action:'activate',installation_id:id,setup_id:setup,email:'driver@example.test',password:'482951'};
 assert.equal((await mod.activateDriverJobAccount('bad',input,test)).reason,'invalid_link');assert.equal(calls.length,0);
 assert.equal((await mod.activateDriverJobAccount('a'.repeat(64),{...input,installation_id:''},test)).reason,'invalid_input');assert.equal(calls.length,0);
 assert.equal((await mod.activateDriverJobAccount('a'.repeat(64),input,{...test,env:{}})).reason,'not_configured');
 assert.equal((await mod.activateDriverJobAccount('a'.repeat(64),input,test)).reason,'invalid_link');assert.equal(authCalls.length,0);
 result={ok:true,create_auth:true,enrollment_id:id,email:'authoritative@example.test'};
 let reply=await mod.activateDriverJobAccount('a'.repeat(64),input,test);
 assert.equal(reply.accountReady,false);assert.equal(reply.cookie,null);assert.equal(sessions.length,0);
 assert.equal(authCalls.length,1);assert.equal(authCalls[0].email,'authoritative@example.test');
 assert.equal(authCalls[0].app_metadata.prestige_driver_reference,undefined,'Never invent a Driver before ACK');
 assert.ok(!JSON.stringify(calls).includes(input.password),'PIN must never enter the database RPC');
 assert.ok(!JSON.stringify(calls).includes(setup),'Setup secret must be hashed');
 result={ok:true,activated:true,scope:'account',account_id:id,driver_id:7};
 reply=await mod.activateDriverJobAccount('a'.repeat(64),{action:'resume',installation_id:id,setup_id:setup},test);
 assert.equal(reply.accountReady,true);assert.equal(sessions.length,1);assert.equal(sessions[0].driverId,7);assert.equal(authCalls.length,1);
 result={ok:true,create_auth:true,enrollment_id:id,email:input.email};providerError={message:'uncertain'};
 const before=calls.length;assert.equal((await mod.activateDriverJobAccount('a'.repeat(64),input,test)).reason,'review_required');assert.equal(calls.length,before+1);
 // Execute the real account route: old ACK-session branch remains untouched, browser activation fails.
 let routed=0;
 const route=load(await readFile('app/api/driver-job/[token]/account/route.ts','utf8'),{
  '../../../../../lib/driver-account-device-lock.ts':{},'../../../../../lib/driver-job-link-mode.ts':{isProductionDriverJobLinkMode:()=>true},'../../../../../lib/driver-portal-session.ts':{},
  '../../../../../lib/driver-job-account-activation.ts':{activateDriverJobAccount:async()=>{routed++;return {ok:true,accountReady:false,cookie:null};}}
 });
 const token='a'.repeat(64),url='https://app.test/api/driver-job/'+token+'/account';
 const req=headers=>new Request(url,{method:'POST',headers:{origin:'https://app.test',referer:'https://app.test/driver-job/'+token,'user-agent':'iPhone','x-prestige-driver-purpose':'driver-account-activate',...headers},body:JSON.stringify(input)});
 assert.equal((await route.POST(req({}),{params:Promise.resolve({token})})).status,200);assert.equal(routed,1);
 for(const headers of [{'user-agent':'Desktop browser'},{origin:'https://other.test'},{referer:'https://app.test/driver-portal'}])assert.equal((await route.POST(req(headers),{params:Promise.resolve({token})})).status,401);
 assert.equal(routed,1);
 // Execute the SecureStore adapter and prove draft persistence, PIN removal and URL separation.
 let stored=null;const writes=[];
 const contract=load(await readFile('driver-companion/src/driver-job-contract.ts','utf8'),{});
 const native=load(await readFile('driver-companion/src/driver-account-setup.ts','utf8'),{
  'expo-crypto':{randomUUID:()=>setup},'expo-secure-store':{WHEN_UNLOCKED_THIS_DEVICE_ONLY:7,getItemAsync:async()=>stored,setItemAsync:async(k,v,o)=>{stored=v;writes.push(o);},deleteItemAsync:async()=>{stored=null;}},'./driver-job-contract':contract
 });
 let draft=await native.saveDriverAccountSetup(input.email,input.password);assert.equal((await native.readDriverAccountSetup()).setupId,setup);assert.equal(writes[0].keychainAccessible,7);
 await assert.rejects(()=>native.saveDriverAccountSetup(input.email,input.password));
 assert.ok(!native.driverAccountSetupBootstrap(draft,'https://app.prestigelimo.sg/driver-portal').includes(input.password));
 const job='https://app.prestigelimo.sg/driver-job/'+token;draft.jobUrl=job;
 assert.ok(native.driverAccountSetupBootstrap(draft,job).includes(input.password));
 assert.ok(!native.driverAccountSetupBootstrap(draft,'https://app.prestigelimo.sg/privacy').includes(input.password));
 assert.ok(!native.driverAccountSetupBootstrap(draft,job.replace(token,'c'.repeat(64))).includes(input.password));
 assert.equal(native.driverAppJobUrl('prestigedriver://job/'+token),job);
 assert.throws(()=>native.driverAppJobUrl('prestigedriver://job/'+token+'?other=1'));
 // Execute the actual native URL callback: a rejected first link must not trap an unactivated draft.
 const appSource=await readFile('driver-companion/App.tsx','utf8');
 const start=appSource.indexOf('  const receiveDriverJobUrl =');
 const end=appSource.indexOf('\n  useEffect(',start);
 let screen={jobUrl:job,navigationKey:0},alerts=[];
 let savedDraft={...draft};
 const bindings={useCallback:fn=>fn,parseDriverJobUrl:contract.parseDriverJobUrl,driverAppJobUrl:native.driverAppJobUrl,
  readTrackingState:async()=>({active:false}),readDriverAccountSetup:async()=>({...savedDraft}),
  rememberDriverAccountSetup:async value=>{savedDraft=value;},setPendingAccountSetup:()=>{},
  baseDriverJobUrl:u=>u.split('?')[0],pendingOauthTokenRef:{current:''},currentWebViewUrlRef:{current:job},
  webViewRequestHeadersRef:{current:null},setCanGoBack:()=>{},setScreen:fn=>{screen=fn(screen);},
  readableFailure:e=>e.message,Alert:{alert:(...args)=>alerts.push(args)}};
 const receive=new Function(...Object.keys(bindings),compile(appSource.slice(start,end))+';return receiveDriverJobUrl;')(...Object.values(bindings));
 const replacement=job.replace(token,'c'.repeat(64));
 await receive(replacement);
 assert.equal(screen.jobUrl,replacement,'A rejected or expired first link must allow Admins replacement link with the same setup proof');
 assert.equal(savedDraft.setupId,setup);assert.equal(savedDraft.password,input.password);
 savedDraft.activated=true;delete savedDraft.password;alerts=[];
 await receive(job);
 assert.equal(screen.jobUrl,replacement,'An activated job must finish its existing ACK identity handoff first');
 assert.equal(alerts.length,1,'A blocked native action must display its instruction, not hide it under the WebView');
 draft.activated=true;delete draft.password;await native.rememberDriverAccountSetup(draft);assert.ok(!stored.includes(input.password));await native.clearDriverAccountSetup();assert.equal(stored,null);
 console.log('PASS activation: valid Job Link before Auth, no browser route, no guessed Driver, exact account-session binding, uncertain-provider safety, encrypted native draft adapter and credential URL separation.');
} finally {await rm(temp,{recursive:true,force:true});}
