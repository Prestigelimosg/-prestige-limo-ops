import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const native=await readFile('admin-companion/src/admin-native-notifications.ts','utf8');
const app=await readFile('admin-companion/App.tsx','utf8');
const page=await readFile('app/page.tsx','utf8');
const transpile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const nativeScope={exports:{},require:()=>({})};vm.runInNewContext(transpile(native),nativeScope);
const parse=nativeScope.exports.nativeAdminNotificationOpenRequest;
const id='11111111-1111-4111-8111-111111111111';
const second='22222222-2222-4222-8222-222222222222';
const data=(id,kind='message')=>({open_target:'/',type:'driver_issue',alert_target:`${kind}:${id}`});
const response=d=>({notification:{request:{content:{data:d}}}});
const handler=app.slice(app.indexOf('    const openDashboardFromNotification ='),app.indexOf('    const subscription = Notifications.addNotificationResponseReceivedListener'));
const drainStart=app.lastIndexOf('  useEffect(() => {',app.indexOf('      !pendingDashboardOpenRef.current'));
const drain=app.slice(drainStart+'  useEffect(() => {'.length,app.indexOf('  }, [biometricEnabled, installationId, screenMode]);',drainStart));
function phone(locked,installation='fixture') {
  const scope={nativeAdminNotificationOpenRequest:parse,pendingDashboardOpenRef:{current:null},
    biometricEnabled:locked,installationId:installation,screenMode:locked?'locked':'web',
    productionOrigin:'https://app.prestigelimo.sg',urls:[],keys:0,unlocks:0};
  scope.setCurrentUrl=url=>scope.urls.push(url);scope.setNavigationKey=fn=>scope.keys=fn(scope.keys);
  scope.setAdminScreenMode=mode=>scope.screenMode=mode;scope.unlockAdminApp=()=>{scope.unlocks++;};
  vm.createContext(scope);vm.runInContext(transpile(handler)+';globalThis.open=openDashboardFromNotification;',scope);
  scope.drain=()=>vm.runInContext(`(function(){${drain}})()`,scope);return scope;
}
{
  const f=phone(false);f.open(response(data(id)));assert.equal(f.urls[0],`https://app.prestigelimo.sg/?admin_alert=message%3A${id}`);
  f.drain();assert.equal(f.urls.length,1,'warm tap is consumed once');
}
{
  const f=phone(true);f.open(response(data(id)));f.drain();assert.equal(f.urls.length,0,'locked state must not navigate');
  f.open(response(data(second,'alert')));f.screenMode='web';f.drain();
  assert.equal(f.urls[0],`https://app.prestigelimo.sg/?admin_alert=alert%3A${second}`,'latest tap survives unlock');
  f.drain();assert.equal(f.urls.length,1);
}
{
  const f=phone(false,'');f.open(response(data(id)));f.drain();assert.equal(f.urls.length,0);
  f.installationId='fixture';f.drain();assert.ok(f.urls[0].includes(id),'cold-start installation loading retains target');
}
{
  const f=phone(false);f.open(response({open_target:'/',type:'driver_issue'}));assert.equal(f.urls[0],'https://app.prestigelimo.sg/');
  f.open(response({...data(id),untrusted:'extra'}));assert.equal(f.urls.length,1,'extra keys still rejected');
}
const effectStart=page.lastIndexOf('  useEffect(() => {',page.indexOf('    if (adminNotificationTargetHandledRef.current'));
const effect=page.slice(effectStart+'  useEffect(() => {'.length,page.indexOf('  }, [activeTab, adminAppNotificationReadState.status, adminAppNotificationReadState.notifications]);',effectStart));
function browser(target,status='loaded',items=[{id:`message:${id}`}]) {
  const scope={adminNotificationTargetHandledRef:{current:false},activeTab:'dashboard',
    adminAppNotificationReadState:{status,notifications:items,message:null},otherAdminAppNotifications:items,URL,opened:[],replaced:[]};
  scope.window={location:{href:'https://app.prestigelimo.sg/?admin_alert='+encodeURIComponent(target)},history:{state:null,replaceState:(_s,_t,url)=>scope.replaced.push(url)}};
  scope.openSavedAdminNotificationsFromNotificationCentre=id=>scope.opened.push(id);
  scope.setAdminAppNotificationReadState=fn=>scope.adminAppNotificationReadState=fn(scope.adminAppNotificationReadState);
  vm.createContext(scope);scope.run=()=>vm.runInContext(`(function(){${effect}})()`,scope);return scope;
}
{
  const f=browser(`message:${id}`,'loading');f.run();assert.equal(f.opened.length,0);
  f.adminAppNotificationReadState.status='loaded';f.run();f.run();assert.deepEqual(f.opened,[`message:${id}`]);
  assert.deepEqual(f.replaced,['/']);
}
{
  const f=browser(`alert:${id}`,'loaded',[{id}]);f.run();assert.deepEqual(f.opened,[id]);
}
for (const target of [`message:${second}`,'message:bad','https://evil.test']) {
  const f=browser(target);f.run();assert.equal(f.opened.length,0);assert.ok(f.adminAppNotificationReadState.message.text);
}
{
  const f=browser(`message:${id}`,'loaded',[]);f.adminAppNotificationReadState.message={tone:'error'};f.run();
  assert.equal(f.adminNotificationTargetHandledRef.current,false,'failed read cannot consume target');
  f.otherAdminAppNotifications=[{id:`message:${id}`}];f.run();assert.equal(f.opened.length,1);
}
// The existing sign-in return validator must preserve only a protected same-origin target.
const signin=await readFile('app/admin-sign-in/admin-sign-in-form.tsx','utf8');
const safeSource=signin.slice(signin.indexOf('const productionOrigin'),signin.indexOf('export function AdminSignInForm')).replace('export function','function');
const signScope={URL};vm.runInNewContext(transpile(safeSource)+';globalThis.safe=safeAdminReturnPath;',signScope);
assert.equal(signScope.safe(`/?admin_alert=message%3A${id}`),`/?admin_alert=message%3A${id}`);
assert.equal(signScope.safe('//evil.test'),'/');
console.log('Exact Admin target passed: legacy/targeted native taps, cold/warm/locked/latest-tap retention, guarded sign-in return, delayed authenticated read, missing/invalid/failed targets and no selection of another message.');
