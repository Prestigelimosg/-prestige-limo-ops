import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const read=p=>fs.readFileSync(p,'utf8');
function extract(path,name){const ast=ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n;ts.forEachChild(n,visit)}visit(ast);assert.ok(found,name);return ts.transpileModule(found.getText(ast).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;}
const states=[],messages=[];
const recovery={current:'idle'},attempted={current:false};
const window={__PRESTIGE_DRIVER_ACCOUNT_ALERT_REGISTRATION_SUPPORTED__:true,ReactNativeWebView:{postMessage:m=>messages.push(JSON.parse(m))}};
const enable=new Function('nativeBridgeReady','readState','setAlertState','window','nativeAlertRecoveryRef','nativeAlertAutoRepairAttemptedRef',extract('app/driver-portal/page.tsx','enableJobAlerts')+';return enableJobAlerts;')(true,{kind:'ready',accountSession:true,jobs:[]},s=>states.push(s),window,recovery,attempted);
await enable();
assert.equal(messages.length,1,'activated account with no jobs must reach native registration');
assert.deepEqual(messages[0],{type:'native_notifications_register',account_session:true});
assert.deepEqual(states,['enabling']);
console.log('No-job activated account reaches existing alert registration');
// Old wrappers keep the existing protocol; a link-only session cannot opt into account registration.
for (const accountSession of [false,true]) {
 const sent=[];const legacyWindow={ReactNativeWebView:{postMessage:m=>sent.push(JSON.parse(m))}};
 const fn=new Function('nativeBridgeReady','readState','setAlertState','window',extract('app/driver-portal/page.tsx','enableJobAlerts')+';return enableJobAlerts;')(true,{kind:'ready',accountSession,jobs:[{job_key:'a'.repeat(64)}]},()=>{},legacyWindow);
 await fn();assert.deepEqual(sent,[{job_key:'a'.repeat(64),type:'native_notifications_register'}]);
}
const routePath='app/api/driver-portal/jobs/route.ts';
const routeCode=['response','inactiveDriverAccountResponse','sameOriginDriverPortalRequest','readJsonBody','POST'].map(n=>extract(routePath,n)).join('\n');
let signed=true,account=true,verified=true,registrationOK=true,calls=0,webCalls=0;
const post=new Function('resolveDriverPortalSession','getDriverJobStatusPersistenceClientForProduction','verifyDriverAccountSession','clearDriverPortalSessionCookie','registerDriverNativeDevicePushSubscriptionForPortalAccount','registerDriverDevicePushSubscriptionForPortalSession',routeCode+';return POST;')(
 ()=>signed?{ok:true,claims:{driverId:7,...(account?{accountId:'owned',deviceIdHash:'a'.repeat(64)}:{})}}:{ok:false},
 ()=>({ok:true,client:{}}),async input=>verified&&input.installationId==='qa-installation',()=>'',
 async input=>{calls++;assert.equal(input.driverId,7);assert.equal(input.deviceIdHash,'a'.repeat(64));return {ok:registrationOK,registered:registrationOK,reason:registrationOK?'subscription_registered':'subscription_write_failed'}},
 async()=>{webCalls++;return {ok:true}});
const req=(body={native_push_token:'ExpoPushToken[qa]'},headers={})=>new Request('https://example.test/api/driver-portal/jobs',{method:'POST',headers:{origin:'https://example.test',referer:'https://example.test/driver-portal','x-prestige-driver-purpose':'driver-portal-device-alert-registration','x-prestige-driver-installation-id':'qa-installation',...headers},body:JSON.stringify(body)});
assert.equal((await post(req())).status,200);assert.equal(calls,1);
for(const headers of [{origin:'https://foreign.test'},{referer:'https://example.test/driver-job/anything'},{'x-prestige-driver-purpose':'wrong'},{'x-prestige-driver-installation-id':'wrong'}])assert.equal((await post(req(undefined,headers))).status,401);
signed=false;assert.equal((await post(req())).status,401);signed=true;
account=false;assert.equal((await post(req())).status,401);account=true;
verified=false;assert.equal((await post(req())).status,401);verified=true;
assert.equal((await post(req({native_push_token:'ExpoPushToken[qa]',driver_id:8}))).status,400);assert.equal(calls,1);
registrationOK=false;assert.equal((await post(req())).status,503);
assert.equal((await post(req({device_push_subscription:{}}))).status,200);assert.equal(webCalls,1);
console.log('Existing portal POST: verified account/device only, origin/purpose, body scope, failure and web compatibility');
const helperPath='lib/driver-device-push-notification.ts';
let gate=true,rpcError=false,rpcCalls=0;
const register=new Function('resolveProviderConfig','parseExpoPushToken','safePositiveInteger','nativeDeviceAlertUpdateResult','asRecord',extract(helperPath,'registerDriverNativeDevicePushSubscriptionForPortalAccount')+';return registerDriverNativeDevicePushSubscriptionForPortalAccount;')(
 ()=>gate?{}:null,v=>typeof v==='string'&&/^ExpoPushToken\[[a-z]+\]$/.test(v)?v:null,v=>Number.isInteger(v)&&v>0?v:null,(reason,o={})=>({reason,ok:o.ok===true,registered:o.registered===true}),v=>v||{});
const client={rpc:async(name,args)=>{rpcCalls++;assert.equal(name,'register_driver_native_push_installation');assert.equal(args.p_link_id,null);return {data:{registered:true},error:rpcError?{}:null}}};
const input={client,driverId:7,deviceIdHash:'a'.repeat(64),expoPushToken:'ExpoPushToken[qa]'};
assert.equal((await register(input)).ok,true);
for(const invalid of [{driverId:0},{deviceIdHash:'bad'},{expoPushToken:'bad'}])assert.equal((await register({...input,...invalid})).ok,false);
gate=false;assert.equal((await register(input)).ok,false);gate=true;assert.equal(rpcCalls,1);
rpcError=true;assert.equal((await register(input)).ok,false);
console.log('Registration helper: same RPC without job, malformed input and closed gate perform no write');
const bridgePath='driver-companion/src/driver-webview-bridge.ts';
const parse=new Function('asRecord',extract(bridgePath,'parseDriverBridgeMessage')+';return parseDriverBridgeMessage;')(v=>v&&typeof v==='object'?v:{});
assert.deepEqual(parse(JSON.stringify({type:'native_notifications_register',account_session:true})),{type:'native_notifications_register',accountSession:true});
for(const m of [{type:'native_notifications_register',account_session:true,job_key:'a'.repeat(64)},{type:'native_notifications_register',account_session:false},{type:'native_notifications_registration_result',request_id:'bad',registered:true}])assert.equal(parse(JSON.stringify(m)),null);
const script=new Function('installationIdPattern','productionOrigin',extract(bridgePath,'driverNativeAccountNotificationRegistrationScript')+';return driverNativeAccountNotificationRegistrationScript;')(/^[0-9a-f-]{36}$/,'https://app.prestigelimo.sg');
const code=script('ExpoPushToken[qa]','11111111-1111-4111-8111-111111111111','123-1');
const vm=await import('node:vm');
for(const kind of ['ok','denied','network','bad-payload','foreign']) {
 let fetches=0;const result=[];
 const context={location:{origin:kind==='foreign'?'https://foreign.test':'https://app.prestigelimo.sg',pathname:'/driver-portal'},AbortController,setTimeout,clearTimeout,
 window:{ReactNativeWebView:{postMessage:m=>result.push(JSON.parse(m))}},fetch:async(url,options)=>{
  fetches++;assert.equal(url,'/api/driver-portal/jobs');assert.equal(options.credentials,'same-origin');assert.deepEqual(JSON.parse(options.body),{native_push_token:'ExpoPushToken[qa]'});
  if(kind==='network')throw Error('network');return {ok:kind!=='denied',json:async()=>({ok:true,device_alerts:{subscription_registered:kind!=='bad-payload'}})};
 }};
 vm.runInNewContext(code,context);for(let i=0;i<6;i++)await Promise.resolve();
 if(kind==='foreign'){assert.equal(fetches,0);assert.equal(result.length,0)}else assert.deepEqual(result,[{type:'native_notifications_registration_result',request_id:'123-1',registered:kind==='ok'}]);
}
console.log('Native WebView registration: account cookies retained, exact endpoint, correlated results, failure and foreign-page isolation');
// Execute the actual native callback, including its result correlation and storage ordering.
const appAst=ts.createSourceFile('App.tsx',read('driver-companion/App.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let callback;
function findCallback(n){if(ts.isVariableDeclaration(n)&&n.name.getText(appAst)==='handleBridgeMessage')callback=n.initializer.arguments[0];ts.forEachChild(n,findCallback)}findCallback(appAst);assert.ok(callback);
const callbackCode=ts.transpileModule('const handler='+callback.getText(appAst)+';return handler;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
for(const mode of ['success','denied','server-failure','storage-failure','navigated','timeout']){
 let handler,saved=0,unregisters=0,enabled=false,fetches=0;const results=[];
 const portal='https://app.prestigelimo.sg/driver-portal';const urlRef={current:portal};const pending={current:null};const busy={current:false};
 const deps={parseDriverBridgeMessage:parse,currentWebViewUrlRef:urlRef,pendingNotificationRegistrationRef:pending,productionOrigin:'https://app.prestigelimo.sg',
 bridgeBusyRef:busy,notificationRegistrationSequenceRef:{current:0},installationId:'11111111-1111-4111-8111-111111111111',
 parseDriverJobUrl:()=>{throw Error('No job lookup allowed')},loadNativeDriverJob:()=>{throw Error('No job lookup allowed')},
 readNativeNotificationToken:async()=>null,Platform:{OS:'android'},Constants:{easConfig:{projectId:'synthetic'}},
 Notifications:{AndroidImportance:{HIGH:4},setNotificationChannelAsync:async()=>{},requestPermissionsAsync:async()=>({granted:mode!=='denied'}),getExpoPushTokenAsync:async()=>({data:'ExpoPushToken[qa]'})},
 sendNativeNotificationResult:r=>results.push(r),setNotificationEnabled:v=>{enabled=v},driverNativeAccountNotificationRegistrationScript:script,
 rememberNativeNotificationToken:async()=>{if(mode==='storage-failure')throw Error('storage');saved++},unregisterNativeDriverNotifications:async()=>{unregisters++},
 DriverJobRequestError:class extends Error{},readTrackingState:async()=>({active:false}),readableFailure:e=>{if(mode==='success')throw e;return ''},setScreen:()=>{},
 setTimeout:(fn,ms)=>setTimeout(fn,mode==='timeout'?1:ms),clearTimeout,
 webViewRef:{current:{injectJavaScript:source=>{
  if(mode==='timeout')return;
  const page={location:{origin:'https://app.prestigelimo.sg',pathname:'/driver-portal'},AbortController,setTimeout,clearTimeout,
   fetch:async()=>{fetches++;return {ok:mode!=='server-failure',json:async()=>({ok:true,device_alerts:{subscription_registered:true}})}},
   window:{ReactNativeWebView:{postMessage:async m=>{
    const actual=JSON.parse(m);
    await handler({nativeEvent:{url:portal,data:JSON.stringify({...actual,request_id:'0-0'})}});
    assert.ok(pending.current,'stale reply cannot complete current registration');
    await handler({nativeEvent:{url:'https://foreign.test',data:m}});assert.ok(pending.current);
    if(mode==='navigated'){urlRef.current='https://app.prestigelimo.sg/driver-job/example';pending.current.finish(false)}
    else await handler({nativeEvent:{url:portal,data:m}});
   }}}};vm.runInNewContext(source,page);
 }}}};
 handler=new Function(...Object.keys(deps),callbackCode)(...Object.values(deps));
 await handler({nativeEvent:{url:portal,data:JSON.stringify({type:'native_notifications_register',account_session:true})}});
 assert.equal(saved,mode==='success'?1:0);assert.equal(enabled,mode==='success');assert.equal(unregisters,0,'failed recovery never revokes working registration');
 assert.equal(results.at(-1)?.ok,mode==='success');assert.equal(pending.current,null);assert.equal(busy.current,false);
 assert.equal(fetches,['denied','timeout'].includes(mode)?0:1);
}
console.log('Actual native handler: no job lookup, stale/foreign replies, timeout/navigation, denied permission and storage failure preserve registrations');

// Real portal refresh and native-result handler, with only transport/state mocked.
const portalAst=ts.createSourceFile('portal.tsx',read('app/driver-portal/page.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let refreshCallback;
function findRefresh(n){if(ts.isVariableDeclaration(n)&&n.name.getText(portalAst)==='loadJobs')refreshCallback=n.initializer.arguments[0];ts.forEachChild(n,findRefresh)}
findRefresh(portalAst);assert.ok(refreshCallback);
const refreshCode=ts.transpileModule('return '+refreshCallback.getText(portalAst),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function portalHarness({ready=false,enabled=true,supported=true,account=true,native=true,ok=true}={}){
 const state={ready,enabled,ok,alert:'available',messages:[],reads:0};
 const nativeAlertRecoveryRef={current:'idle'},nativeAlertAutoRepairAttemptedRef={current:false};
 const deps={clearingAlertsRef:{current:false},jobsReadRevisionRef:{current:0},nativeAlertRecoveryRef,nativeAlertAutoRepairAttemptedRef,
  currentNativeInstallationId:()=>native?'verified-installation':'',currentNativeNotificationsEnabled:()=>state.enabled,
  fetch:async()=>{state.reads++;return {ok:state.ok,status:state.ok?200:401,json:async()=>({ok:state.ok,session:account?'account':'link',device_alerts:{native_registration_ready:state.ready},jobs:[]})}},
  window:{__PRESTIGE_DRIVER_ACCOUNT_ALERT_REGISTRATION_SUPPORTED__:supported,ReactNativeWebView:{postMessage:m=>state.messages.push(JSON.parse(m))}},
  setAlertReadiness:()=>{},setAlertState:v=>{state.alert=v},setReadState:v=>{state.read=v},readDriverPortalAlertState:async()=>'available',dismissNativeAlerts:async()=>{},
 };
 const loadJobs=new Function(...Object.keys(deps),refreshCode)(...Object.values(deps));
 const onResult=new Function('setAlertState','nativeAlertRecoveryRef','nativeAlertAutoRepairAttemptedRef','loadJobs',extract('app/driver-portal/page.tsx','onNativeNotificationResult')+';return onNativeNotificationResult;')(deps.setAlertState,nativeAlertRecoveryRef,nativeAlertAutoRepairAttemptedRef,loadJobs);
 const manual=new Function('nativeBridgeReady','readState','setAlertState','window','nativeAlertRecoveryRef','nativeAlertAutoRepairAttemptedRef',extract('app/driver-portal/page.tsx','enableJobAlerts')+';return enableJobAlerts;')(true,{kind:'ready',accountSession:true,jobs:[]},deps.setAlertState,deps.window,nativeAlertRecoveryRef,nativeAlertAutoRepairAttemptedRef);
 return {state,loadJobs,onResult,manual};
}
const repaired=portalHarness();
await repaired.loadJobs();
assert.deepEqual(repaired.state.messages,[{type:'native_notifications_register',account_session:true}], 'Already-enabled current phone must recover through the existing account registration bridge');
assert.equal(repaired.state.alert,'enabling');
await repaired.loadJobs();assert.equal(repaired.state.messages.length,1,'Refresh cannot duplicate an in-flight registration');assert.equal(repaired.state.alert,'enabling');
repaired.state.ready=true;
repaired.onResult({detail:{ok:true,state:'enabled'}});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(repaired.state.alert,'enabled','Enabled requires server confirmation after the native callback');
repaired.state.ready=false;await repaired.loadJobs();
assert.equal(repaired.state.messages.length,1,'No automatic retry loop when later reads still disagree');assert.equal(repaired.state.alert,'unavailable');
for(const failure of ['failed','denied']){
 const h=portalHarness();await h.loadJobs();h.onResult({detail:{ok:false,state:failure}});
 await h.loadJobs();assert.equal(h.state.alert,failure==='denied'?'blocked':'unavailable');assert.equal(h.state.messages.length,1);
 h.state.ready=true;h.onResult({detail:{ok:true,state:'enabled'}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.state.alert,failure==='denied'?'blocked':'unavailable','Cached or late native enabled event cannot erase failure');
 await h.manual();assert.equal(h.state.messages.length,2,'Explicit retry stays available');h.state.ready=true;h.onResult({detail:{ok:true,state:'enabled'}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(h.state.alert,'enabled');
}
for(const options of [{ready:true},{ready:null},{enabled:false},{supported:false},{account:false},{native:false},{ok:false}]){
 const h=portalHarness(options);await h.loadJobs();assert.equal(h.state.messages.length,0,JSON.stringify(options)+' must not auto-register');
 if(options.ready===null||options.supported===false)assert.equal(h.state.alert,'unavailable','Unknown registration or old-wrapper repair must not claim ready');
}
const falseSuccess=portalHarness();await falseSuccess.loadJobs();falseSuccess.onResult({detail:{ok:true,state:'enabled'}});
await new Promise(resolve=>setImmediate(resolve));assert.equal(falseSuccess.state.alert,'unavailable','Native enabled callback alone cannot override duplicate registrations');
console.log('Portal recovery: one proven-phone attempt, confirmed readiness, pending/failure persistence, explicit retry, old-wrapper/browser isolation and no automatic resend passed');
