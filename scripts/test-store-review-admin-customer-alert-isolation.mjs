// Executes the actual two-screen effects, callbacks and JSX with synthetic device APIs.
// No HTTP, credentials, database, provider or physical-device access.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=process.env.REVIEW_SOURCE_ROOT||path.resolve(import.meta.dirname,'..');
const deps=path.resolve(import.meta.dirname,'../node_modules');
const ts=require(deps+'/typescript'),React=require(deps+'/react'),{renderToStaticMarkup}=require(deps+'/react-dom/server');
let checks=0;
function source(role){
 const file=role==='admin'?'app/page.tsx':'app/my-bookings/page.tsx',text=fs.readFileSync(path.join(root,file),'utf8');
 const tree=ts.createSourceFile(file,text,99,true,4),nodes=[];function walk(n){nodes.push(n);ts.forEachChild(n,walk)}walk(tree);
 const fn=name=>{const n=nodes.find(n=>(ts.isFunctionDeclaration(n)||ts.isVariableDeclaration(n))&&n.name?.text===name);assert.ok(n,name);return ts.isVariableDeclaration(n)?n.initializer.getText(tree):n.getText(tree)};
 const marker=role==='admin'?'Checking admin device push readiness...':'const nativeWindow = window as CustomerNativeAlertsWindow';
 const effect=nodes.find(n=>ts.isCallExpression(n)&&n.expression.getText(tree)==='useEffect'&&n.arguments[0]?.getText(tree).includes(marker));assert.ok(effect,role+' effect');
 const attr=role==='admin'?'data-admin-device-push-toggle':'data-customer-device-push-toggle';
 const button=nodes.find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(tree)==='button'&&n.openingElement.attributes.properties.some(p=>p.name?.getText(tree)===attr));
 const stateName=role==='admin'?'adminDevicePushState':'customerDevicePushState';
 const state=nodes.find(n=>ts.isVariableDeclaration(n)&&ts.isArrayBindingPattern(n.name)&&n.name.elements[0]?.name?.getText(tree)===stateName);
 assert.ok(state,stateName);
 const initial=state.initializer.arguments[0].getText(tree);
 assert.match(initial,/supported: false/,role+' begins locked before effects');
 return {fn,effect:effect.arguments[0].getText(tree),button:button.getText(tree)};
}
const sources={admin:source('admin'),customer:source('customer')};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function scenario(role,{native=true,denied=false,pending=false,unmount=false,existing=true}={}){
 const newSubscriptionRequired=!existing;
 const s=sources[role],effects=[],listeners=new Map();let settle;
 let current={supported:false,publicKey:null,status:'checking',message:null};
 const record=(type,value)=>effects.push({type,value});
 const read=new Promise((resolve,reject)=>settle=()=>denied?reject(Error('Reviewer/expired session denied')):resolve({enabled:true,ready:true,public_key:'fixture-key'}));
 const subscription={toJSON:()=>({endpoint:'synthetic'}),unsubscribe:async()=>record('unsubscribe')};
 const registration={pushManager:{getSubscription:async()=>{record('subscription-read');return existing?subscription:null},subscribe:async()=>{record('subscribe');existing=true;return subscription}}};
 const bridge={postMessage:value=>record('bridge',JSON.parse(value))};
 const window={...(native?{ReactNativeWebView:bridge,__PRESTIGE_ADMIN_NATIVE_APP__:true,__PRESTIGE_ADMIN_INSTALLATION_ID__:'00000000-0000-4000-8000-000000000001',__prestigeCustomerNativeAlerts:{available:true,enabled:false}}:{}),
   addEventListener:(name,handler)=>{record('listen',name);listeners.set(name,handler)},removeEventListener:name=>{record('unlisten',name);listeners.delete(name)}};
 const context={React,window,activeTab:'dashboard',reviewSession:denied,customerNativeAlertsActive:native,
  adminDevicePushAction:null,customerDevicePushAction:null,
  adminDevicePushIsSupported:()=>true,customerDevicePushIsSupported:()=>true,customerDeviceIsUninstalledIphone:()=>false,
  loadAdminDevicePushReadiness:()=>{record('readiness');return read},
  updateCustomerDevicePushSubscription:async(method)=>{record(method==='GET'?'readiness':'server-'+method);return method==='GET'?{readiness:await read}:{}},
  navigator:{serviceWorker:{getRegistration:async()=>{record('service-worker-read');return registration},register:async()=>{record('service-worker-register');return registration},ready:Promise.resolve(registration)}},
  Notification:{requestPermission:async()=>{record('permission');return 'granted'}},
  customerDevicePushRegistration:async()=>{record('service-worker-register');return registration},
  registerAdminDevicePushSubscription:async()=>record('server-POST'),revokeAdminDevicePushSubscription:async()=>record('server-PATCH'),
  adminDevicePushBase64ToUint8Array:()=>new Uint8Array(),customerDevicePushBase64ToUint8Array:()=>new Uint8Array(),
  adminDevicePushFailureMessage:()=> 'Unavailable',customerDevicePushFailureMessage:()=> 'Unavailable',clean:x=>x||'',
  setAdminDevicePushState:update=>{current=typeof update==='function'?update(current):update},
  setCustomerDevicePushState:update=>{current=typeof update==='function'?update(current):update},
  setAdminDevicePushAction:()=>{},setCustomerDevicePushAction:()=>{},setCustomerNativeAlertsActive:()=>{},
  fetch:()=>{throw Error('No real HTTP allowed')},
 };
 const helperNames=role==='admin'?['adminNativePushWindow','adminNativePushIsSupported','adminNativePushPostMessage']:['customerNativeAlertsBridge','postCustomerNativeAlertsAction'];
 const helpers=helperNames.map(s.fn).join('\n');
 const execute=code=>{const mod={exports:{}};vm.runInNewContext(ts.transpileModule(helpers+'\n'+code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{...context,adminDevicePushState:current,customerDevicePushState:current,module:mod,exports:mod.exports});return mod.exports};
 const cleanup=execute('exports.effect='+s.effect).effect();
 const checkButton=()=>{
  const prefix=role==='admin'?'Admin':'Customer';context['handle'+prefix+'DevicePushEnable']=()=>{};context['handle'+prefix+'DevicePushDisable']=()=>{};
  const html=renderToStaticMarkup(execute('exports.button=('+s.button+');').button);
  return html.includes('disabled=""');
 };
 if(unmount)cleanup?.();
 if(!pending){settle();await tick();await tick();}
 if(pending||denied||unmount){
  assert.equal(checkButton(),true,role+' must disable unresolved/denied control');
  for(const action of ['Enable','Disable'])await execute('exports.run='+s.fn('handle'+(role==='admin'?'Admin':'Customer')+'DevicePush'+action)).run();
  assert.deepEqual(effects.filter(e=>e.type!=='readiness'),[],role+' must do no native, permission, subscription or listener work');
 }else{
  assert.equal(checkButton(),false,role+' ordinary authorized control preserved');
  effects.length=0;
  for(const action of ['Enable','Disable'])await execute('exports.run='+s.fn('handle'+(role==='admin'?'Admin':'Customer')+'DevicePush'+action)).run();
  if(native)assert.deepEqual(effects.filter(e=>e.type==='bridge').map(e=>e.value.type),role==='admin'?['admin_notifications_register','admin_notifications_unregister']:['customer_native_notifications_enable','customer_native_notifications_disable']);
  else {if(newSubscriptionRequired)assert.ok(effects.some(e=>e.type==='subscribe'),role+' new subscription path preserved');assert.ok(effects.some(e=>e.type==='permission'),role+' permission path preserved');assert.ok(effects.some(e=>e.type==='server-POST'));assert.ok(effects.some(e=>e.type==='server-PATCH'));assert.ok(effects.some(e=>e.type==='unsubscribe'));}
 }
 if(pending){cleanup?.();settle();await tick();assert.deepEqual(effects.filter(e=>e.type!=='readiness'),[]);}
 else if(!unmount)cleanup?.();
 assert.equal(listeners.size,0,'No dangling native listener after unmount');checks++;
}
(async()=>{
 for(const role of ['admin','customer'])for(const native of [true,false])for(const state of [{pending:true},{denied:true},{unmount:true},{}])await scenario(role,{native,...state});
 for(const role of ['admin','customer'])await scenario(role,{native:false,existing:false});
 console.log('PASS '+checks+' actual effect/callback/JSX scenarios: pending, denied/expired, unmount races, ordinary native/web enable/disable and listener cleanup. All device/provider effects synthetic.');
})().catch(error=>{console.error(error);process.exitCode=1});
